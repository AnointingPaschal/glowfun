import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

/**
 * Trade history for one bonding-curve token, straight from the factory's TokensBought / TokensSold
 * events (no indexer needed). The first load scans back to the token's launch; later polls only
 * fetch blocks newer than the last one seen.
 */
export interface Trade {
  kind: 'buy' | 'sell'
  trader: `0x${string}`
  usdc: number        // USDC amount of the trade
  tokens: number      // token amount of the trade
  price: number       // USD per token after the trade
  ts: number          // unix seconds
  tx: `0x${string}`
  block: bigint
  idx: number
}

interface Cached { trades: Trade[]; lastBlock: bigint; partial: boolean }
const cache = new Map<string, Cached>()

const BLOCKS_PER_SEC = 2.4      // Arc produces ~2 blocks/s; over-estimate so we never start too late
const CHUNK = 5000n             // conservative eth_getLogs window
const MAX_CHUNKS = 160          // ~ 4 days of history worst case; older trades are dropped (flagged partial)
const CONCURRENCY = 4

const ev = (name: string) => (FACTORY_ABI as readonly any[]).find(x => x.type === 'event' && x.name === name)
const BOUGHT = ev('TokensBought')
const SOLD = ev('TokensSold')

async function fetchRange(client: any, factory: `0x${string}`, token: `0x${string}`, fromBlock: bigint, toBlock: bigint): Promise<Trade[]> {
  const [b, s] = await Promise.all([
    client.getLogs({ address: factory, event: BOUGHT, args: { token }, fromBlock, toBlock }),
    client.getLogs({ address: factory, event: SOLD, args: { token }, fromBlock, toBlock }),
  ])
  const out: Trade[] = []
  for (const l of b as any[]) out.push({
    kind: 'buy', trader: l.args.buyer, usdc: Number(l.args.usdcIn) / 1e6, tokens: Number(l.args.tokensOut) / 1e18,
    price: Number(l.args.price) / 1e18, ts: Number(l.args.timestamp), tx: l.transactionHash, block: l.blockNumber, idx: l.logIndex,
  })
  for (const l of s as any[]) out.push({
    kind: 'sell', trader: l.args.seller, usdc: Number(l.args.usdcOut) / 1e6, tokens: Number(l.args.tokensIn) / 1e18,
    price: Number(l.args.price) / 1e18, ts: Number(l.args.timestamp), tx: l.transactionHash, block: l.blockNumber, idx: l.logIndex,
  })
  return out
}

async function scan(client: any, factory: `0x${string}`, token: `0x${string}`, from: bigint, to: bigint): Promise<{ trades: Trade[]; partial: boolean }> {
  // Fast path: one request. Many RPCs reject wide ranges, in which case we window it.
  try { return { trades: await fetchRange(client, factory, token, from, to), partial: false } } catch {}

  const windows: Array<[bigint, bigint]> = []
  for (let start = from; start <= to; start += CHUNK) windows.push([start, start + CHUNK - 1n > to ? to : start + CHUNK - 1n])
  const partial = windows.length > MAX_CHUNKS
  const use = partial ? windows.slice(-MAX_CHUNKS) : windows
  const all: Trade[] = []
  for (let i = 0; i < use.length; i += CONCURRENCY) {
    const part = await Promise.all(use.slice(i, i + CONCURRENCY).map(([a, b]) => fetchRange(client, factory, token, a, b)))
    for (const p of part) all.push(...p)
  }
  return { trades: all, partial }
}

const sortTrades = (t: Trade[]) => t.sort((a, b) => a.ts - b.ts || Number(a.block - b.block) || a.idx - b.idx)

export function useTokenTrades(token: string | undefined, createdAt: number | undefined) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  const key = `${FACTORY_ADDRESS}:${token?.toLowerCase()}`

  const q = useQuery({
    queryKey: ['trades', key],
    enabled: !!client && !!token && !!FACTORY_ADDRESS && createdAt !== undefined,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async (): Promise<Cached> => {
      const factory = FACTORY_ADDRESS as `0x${string}`, tk = token as `0x${string}`
      const latest = await client!.getBlockNumber()
      const prev = cache.get(key)
      if (prev) {
        if (latest <= prev.lastBlock) return prev
        const { trades } = await scan(client, factory, tk, prev.lastBlock + 1n, latest)
        const merged: Cached = { trades: sortTrades([...prev.trades, ...trades]), lastBlock: latest, partial: prev.partial }
        cache.set(key, merged)
        return merged
      }
      const ageSec = Math.max(600, Math.floor(Date.now() / 1000) - (createdAt || 0))
      const back = BigInt(Math.ceil(ageSec * BLOCKS_PER_SEC)) + 3000n
      const from = latest > back ? latest - back : 0n
      const { trades, partial } = await scan(client, factory, tk, from, latest)
      const fresh: Cached = { trades: sortTrades(trades), lastBlock: latest, partial }
      cache.set(key, fresh)
      return fresh
    },
  })
  return { trades: q.data?.trades ?? [], partial: q.data?.partial ?? false, isLoading: q.isLoading, error: q.error as Error | null }
}

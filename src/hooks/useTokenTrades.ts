import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

/**
 * Trade history for one bonding-curve token, straight from the factory's TokensBought / TokensSold
 * events (no indexer needed). The first load scans back to the token's launch; later polls only
 * fetch blocks newer than the last one seen.
 *
 * RPC providers cap eth_getLogs block ranges (often 1k-10k) and rate-limit bursts, so the scan
 * finds a window size the RPC accepts (halving on error), works newest-to-oldest, retries once per
 * window, and reports what went wrong instead of silently returning nothing.
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

export interface TradesDiag { fromBlock: string; toBlock: string; window: string; windows: number; error?: string }
interface Cached { trades: Trade[]; lastBlock: bigint; partial: boolean; diag: TradesDiag }
const cache = new Map<string, Cached>()

const BLOCKS_PER_SEC = 2.4      // Arc produces ~2 blocks/s; over-estimate so we never start too late
const SIZES = [50_000n, 10_000n, 5_000n, 2_000n, 1_000n, 500n, 200n]   // window sizes to try, largest first
const MAX_WINDOWS = 400         // safety cap on requests for very old tokens (flagged partial)
const CONCURRENCY = 3

const ev = (name: string) => (FACTORY_ABI as readonly any[]).find(x => x.type === 'event' && x.name === name)
const BOUGHT = ev('TokensBought')
const SOLD = ev('TokensSold')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const msg = (e: any) => String(e?.details ?? e?.shortMessage ?? e?.message ?? e).replace(/\s+/g, ' ').slice(0, 180)

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

/** One window, retried once (covers transient 429s / timeouts). */
async function fetchWindow(client: any, factory: `0x${string}`, token: `0x${string}`, a: bigint, b: bigint): Promise<Trade[]> {
  try { return await fetchRange(client, factory, token, a, b) }
  catch { await sleep(400); return await fetchRange(client, factory, token, a, b) }
}

async function scan(client: any, factory: `0x${string}`, token: `0x${string}`, from: bigint, to: bigint): Promise<{ trades: Trade[]; partial: boolean; window: bigint; windows: number }> {
  const span = to - from + 1n

  // Find the biggest window the RPC accepts, probing on the newest blocks (where recent trades are).
  let chosen: bigint | null = null
  let probed: Trade[] = []
  let lastErr: any
  for (const size of SIZES) {
    const w = size > span ? span : size
    try { probed = await fetchWindow(client, factory, token, to - w + 1n, to); chosen = w; break }
    catch (e) { lastErr = e; if (w === span && size >= span) { /* whole range failed; try smaller */ } }
  }
  if (chosen === null) throw lastErr ?? new Error('eth_getLogs failed for every window size')

  // Whole range fit in one window: done.
  if (chosen >= span) return { trades: probed, partial: false, window: chosen, windows: 1 }

  // Otherwise walk the remaining blocks newest -> oldest.
  const windows: Array<[bigint, bigint]> = []
  for (let end = to - chosen; end >= from; end -= chosen) windows.push([end - chosen + 1n < from ? from : end - chosen + 1n, end])
  const partial = windows.length > MAX_WINDOWS
  const use = partial ? windows.slice(0, MAX_WINDOWS) : windows
  const all: Trade[] = [...probed]
  for (let i = 0; i < use.length; i += CONCURRENCY) {
    const part = await Promise.all(use.slice(i, i + CONCURRENCY).map(([a, b]) => fetchWindow(client, factory, token, a, b)))
    for (const p of part) all.push(...p)
  }
  return { trades: all, partial, window: chosen, windows: use.length + 1 }
}

// De-duplicate (overlapping windows / retries can return the same log twice) and order oldest -> newest
const sortTrades = (t: Trade[]) => {
  const seen = new Set<string>()
  const uniq = t.filter(x => { const k = `${x.tx}:${x.idx}`; if (seen.has(k)) return false; seen.add(k); return true })
  return uniq.sort((a, b) => a.ts - b.ts || Number(a.block - b.block) || a.idx - b.idx)
}

export function useTokenTrades(token: string | undefined, createdAt: number | undefined) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  const key = `${FACTORY_ADDRESS}:${token?.toLowerCase()}`

  const q = useQuery({
    queryKey: ['trades', key],
    enabled: !!client && !!token && !!FACTORY_ADDRESS && createdAt !== undefined,
    refetchInterval: 15_000,
    staleTime: 5_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Cached> => {
      const factory = FACTORY_ADDRESS as `0x${string}`, tk = token as `0x${string}`
      try {
        const latest = await client!.getBlockNumber()
        const prev = cache.get(key)
        if (prev) {
          if (latest <= prev.lastBlock) return prev
          const r = await scan(client, factory, tk, prev.lastBlock + 1n, latest)
          const merged: Cached = { trades: sortTrades([...prev.trades, ...r.trades]), lastBlock: latest, partial: prev.partial, diag: { ...prev.diag, toBlock: latest.toString() } }
          cache.set(key, merged)
          return merged
        }
        const ageSec = Math.max(600, Math.floor(Date.now() / 1000) - (createdAt || 0))
        const back = BigInt(Math.ceil(ageSec * BLOCKS_PER_SEC)) + 3000n
        const from = latest > back ? latest - back : 0n
        const r = await scan(client, factory, tk, from, latest)
        const fresh: Cached = {
          trades: sortTrades(r.trades), lastBlock: latest, partial: r.partial,
          diag: { fromBlock: from.toString(), toBlock: latest.toString(), window: r.window.toString(), windows: r.windows },
        }
        cache.set(key, fresh)
        return fresh
      } catch (e) {
        // Never throw (a never-succeeded query flips back to "pending" on each retry and blanks the UI).
        // Keep whatever we already have and expose the reason; don't cache, so the next poll retries.
        const prev = cache.get(key)
        return prev
          ? { ...prev, diag: { ...prev.diag, error: msg(e) } }
          : { trades: [], lastBlock: 0n, partial: true, diag: { fromBlock: '?', toBlock: '?', window: '?', windows: 0, error: msg(e) } }
      }
    },
  })
  return {
    trades: q.data?.trades ?? [],
    partial: q.data?.partial ?? false,
    isLoading: q.isLoading,
    error: q.data?.diag.error ?? null,
    diag: q.data?.diag,
  }
}

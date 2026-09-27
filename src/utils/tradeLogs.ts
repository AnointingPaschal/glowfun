import { FACTORY_ABI } from '@/abi/GlowFunFactory'

/**
 * Shared eth_getLogs scanning for the factory's TokensBought / TokensSold events (no indexer needed).
 *
 * RPC providers cap eth_getLogs block ranges (often 1k-10k) and rate-limit bursts, so scanLogs()
 * finds a window size the RPC accepts (halving on error), works newest-to-oldest, retries each
 * window once, de-duplicates, and lets errors propagate to the caller so they can be reported.
 */
export interface Trade {
  token: `0x${string}`
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

export const BLOCKS_PER_SEC = 2.4      // Arc produces ~2 blocks/s; over-estimate so we never start too late
const SIZES = [50_000n, 10_000n, 5_000n, 2_000n, 1_000n, 500n, 200n]   // window sizes to try, largest first
const MAX_WINDOWS = 400         // safety cap on requests for very old ranges (flagged partial)
const CONCURRENCY = 3

const ev = (name: string) => (FACTORY_ABI as readonly any[]).find(x => x.type === 'event' && x.name === name)
const BOUGHT = ev('TokensBought')
const SOLD = ev('TokensSold')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const errMsg = (e: any) => String(e?.details ?? e?.shortMessage ?? e?.message ?? e).replace(/\s+/g, ' ').slice(0, 180)

async function fetchRange(client: any, factory: `0x${string}`, token: `0x${string}` | undefined, fromBlock: bigint, toBlock: bigint): Promise<Trade[]> {
  const args = token ? { token } : undefined
  const [b, s] = await Promise.all([
    client.getLogs({ address: factory, event: BOUGHT, args, fromBlock, toBlock }),
    client.getLogs({ address: factory, event: SOLD, args, fromBlock, toBlock }),
  ])
  const out: Trade[] = []
  for (const l of b as any[]) out.push({
    token: l.args.token, kind: 'buy', trader: l.args.buyer, usdc: Number(l.args.usdcIn) / 1e6, tokens: Number(l.args.tokensOut) / 1e18,
    price: Number(l.args.price) / 1e18, ts: Number(l.args.timestamp), tx: l.transactionHash, block: l.blockNumber, idx: l.logIndex,
  })
  for (const l of s as any[]) out.push({
    token: l.args.token, kind: 'sell', trader: l.args.seller, usdc: Number(l.args.usdcOut) / 1e6, tokens: Number(l.args.tokensIn) / 1e18,
    price: Number(l.args.price) / 1e18, ts: Number(l.args.timestamp), tx: l.transactionHash, block: l.blockNumber, idx: l.logIndex,
  })
  return out
}

/** One window, retried once (covers transient 429s / timeouts). */
async function fetchWindow(client: any, factory: `0x${string}`, token: `0x${string}` | undefined, a: bigint, b: bigint): Promise<Trade[]> {
  try { return await fetchRange(client, factory, token, a, b) }
  catch { await sleep(400); return await fetchRange(client, factory, token, a, b) }
}

export async function scanLogs(client: any, factory: `0x${string}`, token: `0x${string}` | undefined, from: bigint, to: bigint): Promise<{ trades: Trade[]; partial: boolean; window: bigint; windows: number }> {
  const span = to - from + 1n

  // Find the biggest window the RPC accepts, probing on the newest blocks (where recent trades are).
  let chosen: bigint | null = null
  let probed: Trade[] = []
  let lastErr: any
  for (const size of SIZES) {
    const w = size > span ? span : size
    try { probed = await fetchWindow(client, factory, token, to - w + 1n, to); chosen = w; break }
    catch (e) { lastErr = e }
  }
  if (chosen === null) throw lastErr ?? new Error('eth_getLogs failed for every window size')

  if (chosen >= span) return { trades: probed, partial: false, window: chosen, windows: 1 }

  // Walk the remaining blocks newest -> oldest.
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

/** De-duplicate (overlapping windows / retries can return the same log twice) and order oldest -> newest. */
export const sortTrades = (t: Trade[]) => {
  const seen = new Set<string>()
  const uniq = t.filter(x => { const k = `${x.tx}:${x.idx}`; if (seen.has(k)) return false; seen.add(k); return true })
  return uniq.sort((a, b) => a.ts - b.ts || Number(a.block - b.block) || a.idx - b.idx)
}

/* ── Persistence: keep scanned history in localStorage so return visits only fetch NEW blocks ─────── */
export interface Persisted<D> { trades: Trade[]; lastBlock: bigint; partial: boolean; diag: D }
const KEEP = 3000   // bound storage

export function loadPersisted<D>(key: string): Persisted<D> | undefined {
  try {
    const raw = localStorage.getItem('gf_trades_v1:' + key)
    if (!raw) return undefined
    const j = JSON.parse(raw)
    return { trades: j.trades.map((t: any) => ({ ...t, block: BigInt(t.block) })), lastBlock: BigInt(j.lastBlock), partial: !!j.partial, diag: j.diag }
  } catch { return undefined }
}
export function savePersisted<D>(key: string, v: Persisted<D>) {
  try {
    const trades = v.trades.slice(-KEEP).map(t => ({ ...t, block: t.block.toString() }))
    localStorage.setItem('gf_trades_v1:' + key, JSON.stringify({ trades, lastBlock: v.lastBlock.toString(), partial: v.partial, diag: v.diag }))
  } catch { /* storage full / unavailable: caching is best-effort */ }
}

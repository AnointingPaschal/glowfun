import type { Trade } from '@/hooks/useTokenTrades'

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

export const TIMEFRAMES = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 } as const
export type Timeframe = keyof typeof TIMEFRAMES

const MAX_BUCKETS = 1500

/**
 * Turn trades into continuous OHLC candles. Every candle opens at the previous close (no gaps),
 * quiet periods become flat zero-volume candles up to "now", and the very first candle can open
 * at the curve's starting price so the launch move is visible.
 */
export function buildCandles(trades: Trade[], tfSec: number, opts: { startPrice?: number; nowPrice?: number; nowSec?: number } = {}): Candle[] {
  if (!trades.length) return []
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  const buckets = new Map<number, { prices: number[]; vol: number }>()
  for (const t of trades) {
    if (!(t.price > 0)) continue
    const b = Math.floor(t.ts / tfSec) * tfSec
    const cur = buckets.get(b) ?? { prices: [], vol: 0 }
    cur.prices.push(t.price); cur.vol += t.usdc
    buckets.set(b, cur)
  }
  if (!buckets.size) return []
  const first = Math.min(...buckets.keys())
  const last = Math.max(Math.floor(now / tfSec) * tfSec, Math.max(...buckets.keys()))
  const startAt = Math.max(first, last - (MAX_BUCKETS - 1) * tfSec)

  const out: Candle[] = []
  let prevClose = opts.startPrice && opts.startPrice > 0 ? opts.startPrice : buckets.get(first)!.prices[0]
  for (let t = startAt; t <= last; t += tfSec) {
    const b = buckets.get(t)
    if (b) {
      const open = prevClose
      const close = b.prices[b.prices.length - 1]
      out.push({ time: t, open, high: Math.max(open, ...b.prices), low: Math.min(open, ...b.prices), close, volume: b.vol })
      prevClose = close
    } else {
      const c = (t === last && opts.nowPrice && opts.nowPrice > 0) ? opts.nowPrice : prevClose
      out.push({ time: t, open: prevClose, high: Math.max(prevClose, c), low: Math.min(prevClose, c), close: c, volume: 0 })
      prevClose = c
    }
  }
  return out
}

export interface TradeStats {
  volume24h: number; volumeTotal: number
  trades24h: number; buys24h: number; sells24h: number
  traders: number
  ath: number; atl: number
  firstPrice: number
}

export function computeStats(trades: Trade[], nowSec = Math.floor(Date.now() / 1000)): TradeStats {
  const since = nowSec - 86400
  const s: TradeStats = { volume24h: 0, volumeTotal: 0, trades24h: 0, buys24h: 0, sells24h: 0, traders: 0, ath: 0, atl: Infinity, firstPrice: 0 }
  const who = new Set<string>()
  for (const t of trades) {
    s.volumeTotal += t.usdc
    who.add(t.trader.toLowerCase())
    if (t.price > s.ath) s.ath = t.price
    if (t.price > 0 && t.price < s.atl) s.atl = t.price
    if (!s.firstPrice && t.price > 0) s.firstPrice = t.price
    if (t.ts >= since) { s.volume24h += t.usdc; s.trades24h++; t.kind === 'buy' ? s.buys24h++ : s.sells24h++ }
  }
  s.traders = who.size
  if (s.atl === Infinity) s.atl = 0
  return s
}

/** 0.00004510 -> "0.0₄4510" style formatting for tiny prices */
const SUB = '₀₁₂₃₄₅₆₇₈₉'
export function fmtPrice(p: number): string {
  if (!p) return '0'
  if (p >= 1) return p.toFixed(4)
  if (p >= 0.01) return p.toFixed(6)
  const m = p.toFixed(20).match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return `0.0${String(m[1].length).split('').map(d => SUB[+d]).join('')}${m[2]}`
  return p.toFixed(8)
}

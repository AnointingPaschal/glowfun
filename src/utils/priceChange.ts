import type { Trade } from '@/utils/tradeLogs'

export const WINDOWS = { '5M': 300, '1H': 3600, '6H': 21600, '24H': 86400 } as const

/**
 * % price change over the last `windowSec`, computed from on-chain trades.
 *
 * Reference price = the price after the last trade at or before (now - window). If there was no
 * trade that early, the price was still the launch price, so we use `startPrice` (the curve's
 * initial price). Windows longer than the token's age therefore read as "change since launch".
 * `complete` = the trade history was loaded successfully (so an empty list really means "no trades").
 * Returns null only when there is nothing to compare against.
 */
export function changeOver(
  trades: Trade[],                 // oldest -> newest
  nowPrice: number,
  windowSec: number,
  opts: { startPrice?: number; nowSec?: number; complete?: boolean } = {},
): number | null {
  if (!(nowPrice > 0)) return null
  // No trades in a history we KNOW is complete = the price hasn't moved. (If the scan failed, we don't know.)
  if (trades.length === 0 && opts.complete) return 0
  const target = (opts.nowSec ?? Math.floor(Date.now() / 1000)) - windowSec
  let ref: number | undefined
  for (let i = trades.length - 1; i >= 0; i--) if (trades[i].ts <= target) { ref = trades[i].price; break }
  if (ref === undefined) ref = opts.startPrice && opts.startPrice > 0 ? opts.startPrice : trades[0]?.price
  if (!(ref && ref > 0)) return null
  return ((nowPrice - ref) / ref) * 100
}

/** Up to `points` evenly-spaced price samples over the last `windowSec` (for sparklines). */
export function priceSeries(trades: Trade[], nowPrice: number, windowSec: number, points = 24, startPrice?: number, nowSec = Math.floor(Date.now() / 1000)): number[] {
  if (!(nowPrice > 0)) return []
  const t0 = nowSec - windowSec
  const out: number[] = []
  for (let i = 0; i <= points; i++) {
    const t = t0 + (windowSec * i) / points
    let p: number | undefined
    for (let j = trades.length - 1; j >= 0; j--) if (trades[j].ts <= t) { p = trades[j].price; break }
    out.push(p ?? (startPrice && startPrice > 0 ? startPrice : trades[0]?.price ?? nowPrice))
  }
  out[out.length - 1] = nowPrice
  return out
}

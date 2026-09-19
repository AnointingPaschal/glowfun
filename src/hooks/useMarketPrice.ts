/**
 * useMarketPrice — external market price for a single token.
 * Falls back to null (caller uses bonding-curve price) when not listed.
 *
 * Cache is module-level so:
 *   - Multiple components sharing an address share one fetch
 *   - FeedPage can bulk-warm the cache via populateMarketCache()
 */
import { useState, useEffect } from 'react'

export interface MarketData {
  priceUsd:     number
  mcapUsd:      number
  volumeUsd:    number
  liquidityUsd: number
  change5m?:    number
  change1h?:    number
  change6h?:    number
  change24h?:   number
  pairAddress?: string
  source:       string
}

type CacheEntry = { data: MarketData | null; ts: number }

const cache = new Map<string, CacheEntry>()
const TTL   = 60_000   // 1 min

function normalize(t: any): MarketData | null {
  if (!t) return null
  return {
    priceUsd:     t.priceUsd     ?? 0,
    mcapUsd:      t.mcapUsd      ?? 0,
    volumeUsd:    t.volumeUsd    ?? 0,
    liquidityUsd: t.liquidityUsd ?? 0,
    change5m:     t.change5m,
    change1h:     t.change1h,
    change6h:     t.change6h,
    change24h:    t.change24h,
    pairAddress:  t.pairAddress,
    source:       t.source ?? 'market',
  }
}

/** Warm the cache from a pre-fetched token list (called by FeedPage / DexPage). */
export function populateMarketCache(tokens: any[]) {
  const now = Date.now()
  for (const t of tokens) {
    const key = (t.address ?? '').toLowerCase()
    if (!key) continue
    cache.set(key, { data: normalize(t), ts: now })
  }
}

/** Fetch all Arc market data once and warm the whole cache. */
export async function prefetchAllMarketData(): Promise<void> {
  try {
    const r = await fetch('/api/market?limit=500', { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return
    const d = await r.json() as any
    if (d.success) populateMarketCache(d.data?.tokens ?? [])
  } catch {}
}

export function useMarketPrice(tokenAddress: string | undefined): {
  market: MarketData | null
  loading: boolean
} {
  const key = (tokenAddress ?? '').toLowerCase()
  const [market, setMarket] = useState<MarketData | null>(() => cache.get(key)?.data ?? null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!key) return

    const cached = cache.get(key)
    if (cached && Date.now() - cached.ts < TTL) {
      setMarket(cached.data)
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        const r = await fetch(`/api/market?limit=5&q=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) })
        if (!r.ok) throw new Error()
        const d = await r.json() as any
        if (!d.success) throw new Error()
        const tokens: any[] = d.data?.tokens ?? []
        const match = tokens.find(t => (t.address ?? '').toLowerCase() === key)
        const result = normalize(match)
        cache.set(key, { data: result, ts: Date.now() })
        if (!cancelled) setMarket(result)
      } catch {
        cache.set(key, { data: null, ts: Date.now() })
        if (!cancelled) setMarket(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [key])

  return { market, loading }
}

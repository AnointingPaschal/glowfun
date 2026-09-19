/**
 * useMarketPrice — fetches the external market price for a token
 * from the /api/market endpoint (proxied DexScreener + GeckoTerminal).
 * Returns null when no external listing exists, so callers fall back
 * to the bonding curve price.
 */
import { useState, useEffect } from 'react'

interface MarketData {
  priceUsd: number
  mcapUsd: number
  volumeUsd: number
  liquidityUsd: number
  change5m?: number
  change1h?: number
  change6h?: number
  change24h?: number
  pairAddress?: string
  source: string
}

// Module-level cache so every component sharing the same address
// doesn't fire a separate fetch within the same session
const cache = new Map<string, { data: MarketData | null; ts: number }>()
const TTL_MS = 60_000 // 1 minute

export function useMarketPrice(tokenAddress: string | undefined): {
  market: MarketData | null
  loading: boolean
} {
  const [market, setMarket] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tokenAddress) return
    const key = tokenAddress.toLowerCase()

    // Serve from cache if fresh
    const cached = cache.get(key)
    if (cached && Date.now() - cached.ts < TTL_MS) {
      setMarket(cached.data)
      return
    }

    let cancelled = false
    setLoading(true)

    async function fetchPrice() {
      try {
        const res = await fetch(
          `/api/market?limit=1&q=${encodeURIComponent(tokenAddress!)}`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) throw new Error('fetch failed')
        const d = await res.json() as any
        if (!d.success) throw new Error('api error')

        // Find the token in results (match by address)
        const tokens: any[] = d.data?.tokens ?? []
        const match = tokens.find(
          t => t.address?.toLowerCase() === key ||
               t.baseTokenAddress?.toLowerCase() === key
        )

        const result: MarketData | null = match ? {
          priceUsd:     match.priceUsd ?? 0,
          mcapUsd:      match.mcapUsd ?? 0,
          volumeUsd:    match.volumeUsd ?? 0,
          liquidityUsd: match.liquidityUsd ?? 0,
          change5m:     match.change5m,
          change1h:     match.change1h,
          change6h:     match.change6h,
          change24h:    match.change24h,
          pairAddress:  match.pairAddress,
          source:       match.source ?? 'market',
        } : null

        cache.set(key, { data: result, ts: Date.now() })
        if (!cancelled) setMarket(result)
      } catch {
        cache.set(key, { data: null, ts: Date.now() })
        if (!cancelled) setMarket(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPrice()
    return () => { cancelled = true }
  }, [tokenAddress])

  return { market, loading }
}

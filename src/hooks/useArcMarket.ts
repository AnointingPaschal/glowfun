import { useCallback, useEffect, useRef, useState } from 'react'

export interface ArcMarketToken {
  address: string
  pairAddress: string
  name: string
  symbol: string
  logoUrl: string
  bannerUrl: string
  priceUsd: number
  change5m?: number
  change1h?: number
  change6h?: number
  change24h?: number
  liqUsd: number
  volUsd: number
  mcapUsd: number
  ageSec: number
  buys24h: number
  sells24h: number
  txns5m: number
  vol5m: number
  dexId: string
  updatedAt: number
}

export type ArcMarketTab = 'trending' | 'new' | 'top'

interface ArcMarketResponse {
  success: boolean
  data: {
    tokens: ArcMarketToken[]
    total: number
    page: number
    limit: number
    stats: { vol5m: number; txns: number }
    newestAgeSec: number
    fetchedAt: number
  }
}

/**
 * Live feed of every token trading on Arc — GlowFun-launched or not — backed by
 * functions/api/market.ts (on-chain PoolCreated discovery + DexScreener search/boosts/
 * profiles, cached in D1 + KV). Polls on an interval so the page stays "live" without the
 * person needing to refresh; a manual refresh always forces a fresh fetch regardless of the
 * poll clock.
 */
export function useArcMarket(tab: ArcMarketTab, query: string, pollMs = 20_000) {
  const [tokens, setTokens] = useState<ArcMarketToken[]>([])
  const [stats, setStats] = useState({ vol5m: 0, txns: 0 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<number | null>(null)
  const reqId = useRef(0)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const id = ++reqId.current
    if (!opts?.silent) setLoading(true)
    try {
      const params = new URLSearchParams({ tab, limit: '150' })
      if (query.trim()) params.set('q', query.trim())
      const r = await fetch(`/api/market?${params}`, { signal: AbortSignal.timeout(15_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json() as ArcMarketResponse
      if (id !== reqId.current) return // a newer request already landed
      if (!d.success) throw new Error('API returned an error')
      setTokens(d.data.tokens ?? [])
      setStats(d.data.stats ?? { vol5m: 0, txns: 0 })
      setTotal(d.data.total ?? 0)
      setLastFetched(Date.now())
      setError(null)
    } catch (e: any) {
      if (id !== reqId.current) return
      setError(e?.message ?? 'Failed to load market data')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [tab, query])

  useEffect(() => {
    load()
    const iv = setInterval(() => load({ silent: true }), pollMs)
    return () => clearInterval(iv)
  }, [load, pollMs])

  return { tokens, stats, total, loading, error, lastFetched, refresh: () => load() }
}

/**
 * Live data for a single Arc token by address — powers the external token
 * detail page. Backed by /api/market?address=, which checks D1 first and
 * falls back to a live DexScreener/GlowFun-factory lookup for a token that
 * hasn't been indexed yet.
 */
export function useArcToken(address: string | undefined, pollMs = 10_000) {
  const [token, setToken] = useState<ArcMarketToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!address) { setLoading(false); return }
    const id = ++reqId.current
    if (!opts?.silent) setLoading(true)
    try {
      const r = await fetch(`/api/market?address=${address.toLowerCase()}`, { signal: AbortSignal.timeout(15_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json() as { success: boolean; data: { token: ArcMarketToken | null } }
      if (id !== reqId.current) return
      if (!d.success) throw new Error('API returned an error')
      setToken(d.data.token ?? null)
      setError(null)
    } catch (e: any) {
      if (id !== reqId.current) return
      setError(e?.message ?? 'Failed to load token data')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [address])

  useEffect(() => {
    load()
    const iv = setInterval(() => load({ silent: true }), pollMs)
    return () => clearInterval(iv)
  }, [load, pollMs])

  return { token, loading, error, refresh: () => load() }
}

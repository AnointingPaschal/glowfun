import { useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { useConfig } from '@/context/ConfigContext'
import { scanLogs, sortTrades, errMsg, loadPersisted, savePersisted, BLOCKS_PER_SEC, type Trade, type Persisted } from '@/utils/tradeLogs'

/**
 * Last ~25h of trades for EVERY token on the factory, from ONE shared scan (react-query dedupes it
 * across all homepage cards). Used for per-token price change and sparklines.
 * Cached in localStorage, so return visits only fetch the blocks since the last visit.
 */
const HOURS = 25
const cache = new Map<string, Persisted<{ error?: string }>>()

export function usePlatformTrades() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  const key = `${FACTORY_ADDRESS}:ALL`

  const q = useQuery({
    queryKey: ['platform-trades', key],
    enabled: !!client && !!FACTORY_ADDRESS,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Persisted<{ error?: string }>> => {
      const factory = FACTORY_ADDRESS as `0x${string}`
      const cutoff = Math.floor(Date.now() / 1000) - HOURS * 3600
      const prune = (t: Trade[]) => t.filter(x => x.ts >= cutoff)
      try {
        const latest = await client!.getBlockNumber()
        const prev = cache.get(key) ?? loadPersisted<{ error?: string }>(key)
        if (prev) {
          cache.set(key, prev)
          if (latest <= prev.lastBlock) return prev
          const r = await scanLogs(client, factory, undefined, prev.lastBlock + 1n, latest)
          const merged = { trades: prune(sortTrades([...prev.trades, ...r.trades])), lastBlock: latest, partial: prev.partial, diag: {} }
          cache.set(key, merged); savePersisted(key, merged)
          return merged
        }
        const back = BigInt(Math.ceil(HOURS * 3600 * BLOCKS_PER_SEC)) + 3000n
        const from = latest > back ? latest - back : 0n
        const r = await scanLogs(client, factory, undefined, from, latest)
        const fresh = { trades: prune(sortTrades(r.trades)), lastBlock: latest, partial: r.partial, diag: {} }
        cache.set(key, fresh); savePersisted(key, fresh)
        return fresh
      } catch (e) {
        const prev = cache.get(key)
        return prev ? { ...prev, diag: { error: errMsg(e) } } : { trades: [], lastBlock: 0n, partial: true, diag: { error: errMsg(e) } }
      }
    },
  })

  const byToken = useMemo(() => {
    const m = new Map<string, Trade[]>()
    for (const t of q.data?.trades ?? []) {
      const k = t.token.toLowerCase()
      const arr = m.get(k); if (arr) arr.push(t); else m.set(k, [t])
    }
    return m
  }, [q.data])
  return { byToken, isLoading: q.isLoading, ready: !!q.data && q.data.lastBlock > 0n, error: q.data?.diag.error ?? null }
}

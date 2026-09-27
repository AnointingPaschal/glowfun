import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { useConfig } from '@/context/ConfigContext'
import { scanLogs, sortTrades, errMsg, loadPersisted, savePersisted, BLOCKS_PER_SEC, type Trade, type Persisted } from '@/utils/tradeLogs'

export type { Trade } from '@/utils/tradeLogs'

/**
 * Trade history for ONE bonding-curve token, from the factory's TokensBought / TokensSold events.
 * First load scans back to the token's launch; later polls (and later visits, via localStorage) only
 * fetch blocks newer than the last one seen.
 */
export interface TradesDiag { fromBlock: string; toBlock: string; window: string; windows: number; error?: string }
type Cached = Persisted<TradesDiag>
const cache = new Map<string, Cached>()

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
        const prev = cache.get(key) ?? loadPersisted<TradesDiag>(key)
        if (prev) {
          cache.set(key, prev)
          if (latest <= prev.lastBlock) return prev
          const r = await scanLogs(client, factory, tk, prev.lastBlock + 1n, latest)
          const merged: Cached = { trades: sortTrades([...prev.trades, ...r.trades]), lastBlock: latest, partial: prev.partial, diag: { ...prev.diag, toBlock: latest.toString(), error: undefined } }
          cache.set(key, merged); savePersisted(key, merged)
          return merged
        }
        const ageSec = Math.max(600, Math.floor(Date.now() / 1000) - (createdAt || 0))
        const back = BigInt(Math.ceil(ageSec * BLOCKS_PER_SEC)) + 3000n
        const from = latest > back ? latest - back : 0n
        const r = await scanLogs(client, factory, tk, from, latest)
        const fresh: Cached = {
          trades: sortTrades(r.trades), lastBlock: latest, partial: r.partial,
          diag: { fromBlock: from.toString(), toBlock: latest.toString(), window: r.window.toString(), windows: r.windows },
        }
        cache.set(key, fresh); savePersisted(key, fresh)
        return fresh
      } catch (e) {
        // Never throw (a never-succeeded query flips back to "pending" on each retry and blanks the UI).
        // Keep whatever we already have and expose the reason; don't cache, so the next poll retries.
        const prev = cache.get(key)
        return prev
          ? { ...prev, diag: { ...prev.diag, error: errMsg(e) } }
          : { trades: [], lastBlock: 0n, partial: true, diag: { fromBlock: '?', toBlock: '?', window: '?', windows: 0, error: errMsg(e) } }
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

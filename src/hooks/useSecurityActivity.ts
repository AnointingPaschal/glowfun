import { useCallback, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { useConfig } from '@/context/ConfigContext'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'

/**
 * Every event on the factory that means "an admin key did something with
 * real consequences" — the audit trail for the Security Center. Fetched one
 * event type at a time (rather than an OR'd topic list) so this works
 * against any spec-minimal RPC, not just ones that support multi-topic
 * getLogs filters.
 */
const SECURITY_EVENT_NAMES = [
  'OwnershipTransferred', 'CreatorTransferred', 'EmergencyWithdraw',
  'Paused', 'Unpaused', 'TokenBlacklisted', 'WalletBlacklisted',
  'FeeRecipientProposed', 'FeeRecipientUpdated',
  'GraduationRecipientProposed', 'GraduationRecipientUpdated',
] as const

const SECURITY_EVENTS = (FACTORY_ABI as readonly any[]).filter(
  (e) => e.type === 'event' && (SECURITY_EVENT_NAMES as readonly string[]).includes(e.name)
)

export interface SecurityEvent {
  name: string
  args: Record<string, unknown>
  blockNumber: bigint
  transactionHash: `0x${string}`
  timestamp?: number
}

const CHUNK = 5000n          // conservative per-call block range — many RPCs cap eth_getLogs around 5-10k blocks
const CHUNKS_PER_PAGE = 8    // one "load" click walks back this many chunks (~40k blocks)

/**
 * Paginated (walk-backward) fetch of the factory's security-relevant event
 * history. Call `loadMore()` once to get the most recent activity, and again
 * ("Load older activity") to keep walking back toward the deploy block.
 */
export function useSecurityActivity() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [cursor, setCursor] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMore = useCallback(async () => {
    if (!client || !FACTORY_ADDRESS || loading || exhausted) return
    setLoading(true); setError(null)
    try {
      const latest = cursor ?? await client.getBlockNumber()
      let to = latest
      const found: SecurityEvent[] = []
      for (let i = 0; i < CHUNKS_PER_PAGE; i++) {
        const from = to > CHUNK ? to - CHUNK : 0n
        const perEvent = await Promise.all(
          SECURITY_EVENTS.map((evt) =>
            client.getLogs({ address: FACTORY_ADDRESS, event: evt as any, fromBlock: from, toBlock: to }).catch(() => [])
          )
        )
        for (const logs of perEvent) {
          for (const log of logs as any[]) {
            found.push({
              name: log.eventName ?? 'Unknown', args: log.args ?? {},
              blockNumber: log.blockNumber, transactionHash: log.transactionHash,
            })
          }
        }
        if (from === 0n) { setExhausted(true); to = 0n; break }
        to = from - 1n
      }

      // Resolve block timestamps for whatever we found (dedupe by block).
      const uniqueBlocks = Array.from(new Set(found.map((f) => f.blockNumber)))
      const times = await Promise.all(
        uniqueBlocks.map((bn) => client.getBlock({ blockNumber: bn }).then((b) => [bn, Number(b.timestamp)] as const).catch(() => [bn, undefined] as const))
      )
      const timeMap = new Map(times)
      const withTime = found.map((f) => ({ ...f, timestamp: timeMap.get(f.blockNumber) }))
      withTime.sort((a, b) => Number(b.blockNumber - a.blockNumber))

      setEvents((prev) => [...prev, ...withTime])
      setCursor(to)
      if (to <= 0n) setExhausted(true)
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Could not load activity — the RPC may be rate-limiting log queries.')
    } finally {
      setLoading(false)
    }
  }, [client, FACTORY_ADDRESS, cursor, loading, exhausted])

  return { events, loadMore, loading, exhausted, error, hasLoaded: cursor !== null }
}

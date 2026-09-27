import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

/**
 * Bonding-curve state of one token, read from the factory's tokenStates() (V3) or getTokenState() (V2).
 *
 * Deployed factories differ in how many words getTokenState() returns (V2: 14, V3: 15, and other
 * builds may add fields). A fixed ABI mis-aligns or throws on any mismatch, so we read the raw
 * words instead. The first 11 fields are the same in every version and are all the price/curve UI
 * needs; the tail (pairToken / threshold / lock) is only decoded for the two layouts we know.
 * The per-token graduation threshold is read separately (getGraduationGap), so it never depends on
 * this tail.
 */
export interface CurveState {
  creator: `0x${string}`
  virtualUsdc: bigint
  virtualTokens: bigint
  realUsdcRaised: bigint
  realTokensSold: bigint
  graduated: boolean
  createdAt: number
  curveTokens: bigint
  graduationTokens: bigint
  creatorTokens: bigint
  totalSupply: bigint
  pairToken?: `0x${string}`
  threshold: bigint            // 0n when the tail layout is unknown (use getGraduationGap instead)
  creatorLocked: boolean
  lockExpiry: number
  layout: number               // number of 32-byte words the factory returned
}

export interface CurveRead { state: CurveState | null; words: number; error?: string }

const WORD = 64
const CORE_WORDS = 11

export function decodeCurveState(hex: string): CurveState | null {
  if (!hex || hex === '0x') return null
  const words = (hex.length - 2) / WORD
  if (!Number.isInteger(words) || words < CORE_WORDS) return null
  const w = (i: number) => hex.slice(2 + i * WORD, 2 + (i + 1) * WORD)
  const n = (i: number) => BigInt('0x' + w(i))
  const addr = (i: number) => ('0x' + w(i).slice(24)) as `0x${string}`

  const core = {
    creator: addr(0),
    virtualUsdc: n(1), virtualTokens: n(2), realUsdcRaised: n(3), realTokensSold: n(4),
    graduatedWord: n(5),
    createdAt: n(6),
    curveTokens: n(7), graduationTokens: n(8), creatorTokens: n(9), totalSupply: n(10),
  }
  // Sanity checks: refuse to show numbers from a layout we don't understand
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (core.graduatedWord > 1n) return null
  if (core.virtualUsdc === 0n || core.virtualTokens === 0n) return null
  if (core.createdAt < 1_600_000_000n || core.createdAt > now + 86_400n) return null

  let pairToken: `0x${string}` | undefined
  let threshold = 0n, creatorLocked = false, lockExpiry = 0
  if (words === 15) {                        // V3: ..., pairToken, threshold, locked, expiry
    pairToken = addr(11); threshold = n(12); creatorLocked = n(13) === 1n; lockExpiry = Number(n(14))
  } else if (words === 14) {                 // V2: ..., threshold, locked, expiry
    threshold = n(11); creatorLocked = n(12) === 1n; lockExpiry = Number(n(13))
  }
  return {
    creator: core.creator,
    virtualUsdc: core.virtualUsdc, virtualTokens: core.virtualTokens,
    realUsdcRaised: core.realUsdcRaised, realTokensSold: core.realTokensSold,
    graduated: core.graduatedWord === 1n,
    createdAt: Number(core.createdAt),
    curveTokens: core.curveTokens, graduationTokens: core.graduationTokens,
    creatorTokens: core.creatorTokens, totalSupply: core.totalSupply,
    pairToken, threshold, creatorLocked, lockExpiry, layout: words,
  }
}

export function useCurveState(token: string | undefined, factoryOverride?: string) {
  const cfg = useConfig()
  const FACTORY_ADDRESS = (factoryOverride ?? cfg.FACTORY_ADDRESS) as `0x${string}`
  const CHAIN_ID = cfg.CHAIN_ID
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  const q = useQuery({
    queryKey: ['curve-state', FACTORY_ADDRESS, token?.toLowerCase()],
    enabled: !!client && !!token && !!FACTORY_ADDRESS,
    refetchInterval: 15_000,
    staleTime: 5_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CurveRead> => {
      // A failed/reverted read must NOT throw: a query that has never succeeded goes back to
      // "pending" on every retry/poll, which used to blank the whole page (skeleton loop).
      //
      // V3 factories have no getTokenState(); the same struct is exposed by the public `tokenStates`
      // mapping getter (15 words). V2 factories only have getTokenState() (14 words). Try both.
      let lastError = ''
      for (const fn of ['tokenStates', 'getTokenState'] as const) {
        try {
          const data = encodeFunctionData({ abi: FACTORY_ABI as any, functionName: fn, args: [token as `0x${string}`] })
          const res = await client!.call({ to: FACTORY_ADDRESS, data })
          const hex = res.data ?? '0x'
          const words = hex === '0x' ? 0 : (hex.length - 2) / WORD
          const state = decodeCurveState(hex)
          if (state) return { state, words }
          lastError = `${fn}() returned ${words} words that don't match a known layout`
        } catch (e: any) {
          lastError = `${fn}(): ${String(e?.shortMessage ?? e?.message ?? e)}`.slice(0, 200)
        }
      }
      return { state: null, words: 0, error: lastError }
    },
  })
  return {
    data: q.data?.state ?? null,
    diag: q.data ? { words: q.data.words, error: q.data.error } : undefined,
    isLoading: q.isLoading,
    refetch: q.refetch,
  }
}

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

/**
 * Bonding-curve state of one token, read from the factory's getTokenState().
 *
 * The deployed factory may return either the 14-word layout (V1/V2) or the 15-word layout
 * (V3, which inserts `pairToken` before `tokenGraduationThreshold`). Decoding with a fixed ABI
 * silently mis-aligns fields (or throws) when they don't match, so we read the raw words and pick
 * the layout from the response length instead.
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
  threshold: bigint            // per-token graduation target (USDC, 6 dec). 0 = instant/none
  creatorLocked: boolean
  lockExpiry: number
  layout: 14 | 15
}

const WORD = 64
export function decodeCurveState(hex: string): CurveState | null {
  if (!hex || hex === '0x') return null
  const words = (hex.length - 2) / WORD
  if (words !== 14 && words !== 15) return null
  const w = (i: number) => hex.slice(2 + i * WORD, 2 + (i + 1) * WORD)
  const n = (i: number) => BigInt('0x' + w(i))
  const addr = (i: number) => ('0x' + w(i).slice(24)) as `0x${string}`
  const v3 = words === 15
  const t = v3 ? 12 : 11                     // index of tokenGraduationThreshold
  return {
    creator: addr(0),
    virtualUsdc: n(1), virtualTokens: n(2), realUsdcRaised: n(3), realTokensSold: n(4),
    graduated: n(5) === 1n,
    createdAt: Number(n(6)),
    curveTokens: n(7), graduationTokens: n(8), creatorTokens: n(9), totalSupply: n(10),
    pairToken: v3 ? addr(11) : undefined,
    threshold: n(t),
    creatorLocked: n(t + 1) === 1n,
    lockExpiry: Number(n(t + 2)),
    layout: v3 ? 15 : 14,
  }
}

export function useCurveState(token: string | undefined, factoryOverride?: string) {
  const cfg = useConfig()
  const FACTORY_ADDRESS = (factoryOverride ?? cfg.FACTORY_ADDRESS) as `0x${string}`
  const CHAIN_ID = cfg.CHAIN_ID
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  return useQuery({
    queryKey: ['curve-state', FACTORY_ADDRESS, token?.toLowerCase()],
    enabled: !!client && !!token && !!FACTORY_ADDRESS,
    refetchInterval: 15_000,
    staleTime: 5_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // A failed/reverted read must NOT throw: a query that has never succeeded goes back to
      // "pending" on every retry/poll, which used to blank the whole page (skeleton loop).
      try {
        const data = encodeFunctionData({ abi: FACTORY_ABI as any, functionName: 'getTokenState', args: [token as `0x${string}`] })
        const res = await client!.call({ to: FACTORY_ADDRESS as `0x${string}`, data })
        return decodeCurveState(res.data ?? '0x')
      } catch {
        return null
      }
    },
  })
}

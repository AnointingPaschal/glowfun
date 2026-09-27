import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { useCurveState } from '@/hooks/useCurveState'

const ZERO = '0x0000000000000000000000000000000000000000'
export const DEAD = '0x000000000000000000000000000000000000dEaD' as `0x${string}`

/** Everything the creator/holder tools need to know about one token, in two batched reads. */
export function useTokenTools(token: `0x${string}` | undefined, wallet: `0x${string}` | undefined) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const curve = useCurveState(token)

  const t = (functionName: string, args?: unknown[]) => ({ address: token!, abi: GLOW_TOKEN_ABI, functionName, args, chainId: CHAIN_ID as any })
  const f = (functionName: string, args?: unknown[]) => ({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName, args, chainId: CHAIN_ID as any })

  const enabled = !!token && !!FACTORY_ADDRESS
  const { data, refetch, isLoading } = useReadContracts({
    contracts: enabled ? ([
      t('name'), t('symbol'), t('totalSupply'), t('creator'),                                   // 0-3
      t('mintable'), t('burnable'), t('pausable'), t('hasBlacklist'), t('maxSupply'), t('tokenPaused'), // 4-9
      t('vestingStart'), t('vestingDuration'), t('vestingCliff'), t('vestingTotal'), t('vestingReleased'), t('vestedAmount'), // 10-15
      t('balanceOf', [wallet ?? ZERO]),                                                          // 16
      t('description'), t('imageUri'), t('twitter'), t('telegram'), t('website'),               // 17-21
      f('pendingLpNftId', [token]), f('pendingLpNftOwner', [token]), f('pendingLpUnlockTime', [token]), // 22-24
      f('pendingCreatorGraduationUsdc', [token]), f('pendingGraduationCreator', [token]),        // 25-26
      f('nonfungiblePositionMgr'), f('isCreatorLocked', [token]),                                // 27-28
      f('owner'),                                                                                // 29
    ] as any[]) : [],
    query: { enabled, refetchInterval: 20_000 },
  })

  const info = useMemo(() => {
    if (!data) return null
    const v = <T,>(i: number, d: T) => (data[i]?.status === 'success' ? (data[i].result as T) : d)
    const creator = v<string>(3, ZERO)
    // Factory's own (mutable) creator record for this token — separate from the token
    // contract's immutable `creator`. Redirectable at any time via `transferCreatorRole`;
    // gates metadata/unlock/force-graduate/unclaimed bonus. Read via useCurveState's raw
    // word-decoder (curve.creator), NOT a typed getTokenState()/tokenStates() ABI call:
    // deployed factories return 14 (V2) or 15 (V3) words for that struct, and a fixed ABI
    // either misaligns every field after `totalSupply` or throws outright — see the
    // "adaptive decoder" comment in useCurveState.ts for why.
    const factoryCreator = (curve.data?.creator as string | undefined) ?? ZERO
    const owner = v<string>(29, ZERO)
    return {
      name: v<string>(0, ''), symbol: v<string>(1, ''),
      totalSupply: v<bigint>(2, 0n), creator: creator as `0x${string}`,
      mintable: v<boolean>(4, false), burnable: v<boolean>(5, false), pausable: v<boolean>(6, false), hasBlacklist: v<boolean>(7, false),
      maxSupply: v<bigint>(8, 0n), paused: v<boolean>(9, false),
      vesting: {
        start: Number(v<bigint>(10, 0n)), duration: Number(v<bigint>(11, 0n)), cliff: Number(v<bigint>(12, 0n)),
        total: v<bigint>(13, 0n), released: v<bigint>(14, 0n), vested: v<bigint>(15, 0n),
      },
      balance: v<bigint>(16, 0n),
      meta: { description: v<string>(17, ''), imageUri: v<string>(18, ''), twitter: v<string>(19, ''), telegram: v<string>(20, ''), website: v<string>(21, '') },
      lp: { nftId: v<bigint>(22, 0n), owner: v<string>(23, ZERO) as `0x${string}`, unlockTime: Number(v<bigint>(24, 0n)) },
      creatorBonus: v<bigint>(25, 0n), bonusOwner: v<string>(26, ZERO) as `0x${string}`,
      positionManager: v<string>(27, ZERO) as `0x${string}`,
      creatorLocked: v<boolean>(28, false),
      // `creator` (above) is the token's own immutable creator — permanently gates
      // mint/pause/blacklist, can never change. `factoryCreator` is the factory's
      // separate, mutable record for this token — gates metadata/unlock/force-graduate/
      // unclaimed-bonus, and CAN be moved to a new address (e.g. a Safe) right now via
      // `transferCreatorRole`, even for an already-launched token.
      factoryCreator: factoryCreator as `0x${string}`,
      factoryOwner: owner as `0x${string}`,
      isCreator: !!wallet && creator.toLowerCase() === wallet.toLowerCase(),
      isFactoryCreator: !!wallet && factoryCreator.toLowerCase() === wallet.toLowerCase(),
    }
  }, [data, wallet, curve.data])

  return { info, curve: curve.data, isLoading, refetch: async () => { await Promise.all([refetch(), curve.refetch()]) } }
}

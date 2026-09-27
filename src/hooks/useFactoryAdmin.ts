import { useReadContract } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`

/**
 * Factory-wide admin state: who owns the factory (every `onlyOwner` platform
 * function — fees, thresholds, boost tiers, Uniswap config, emergencyWithdraw,
 * forceGraduate, platform pause…) and whether the connected wallet is it.
 */
export function useFactoryOwner(wallet?: `0x${string}`) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { data, refetch, isLoading } = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'owner', chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS, refetchInterval: 30_000 },
  })
  const owner = (data as `0x${string}` | undefined) ?? ZERO
  return {
    owner,
    isOwner: !!wallet && owner !== ZERO && owner.toLowerCase() === wallet.toLowerCase(),
    isLoading,
    refetch,
  }
}

/** Whole-platform circuit breaker (Pausable on the factory itself, separate from any one token's pause). */
export function useFactoryPaused() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { data, refetch, isLoading } = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'paused', chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS, refetchInterval: 15_000 },
  })
  return { paused: !!data, isLoading, refetch }
}

import { useReadContract } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_ADDRESS, CHAIN_ID } from '@/constants'

const factoryContract = {
  address: FACTORY_ADDRESS,
  abi: FACTORY_ABI,
  chainId: CHAIN_ID as any,
} as const

export function useTokenList() {
  const { data: addresses, isLoading, refetch } = useReadContract({
    ...factoryContract,
    functionName: 'allTokens',
    query: { enabled: !!FACTORY_ADDRESS, refetchInterval: 15_000 },
  })

  return {
    addresses: (addresses ?? []) as `0x${string}`[],
    isLoading,
    refetch,
  }
}

export function useTokenCount() {
  const { data } = useReadContract({
    ...factoryContract,
    functionName: 'tokenCount',
    query: { enabled: !!FACTORY_ADDRESS },
  })
  return data as bigint | undefined
}

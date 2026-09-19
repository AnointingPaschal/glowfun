import { useReadContract } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

export function useTokenList() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  const { data: addresses, isLoading, refetch } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'allTokens',
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS, refetchInterval: 15_000 },
  })

  return {
    addresses: (addresses ?? []) as `0x${string}`[],
    isLoading,
    refetch,
  }
}

export function useTokenCount() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  const { data } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'tokenCount',
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS },
  })
  return data as bigint | undefined
}

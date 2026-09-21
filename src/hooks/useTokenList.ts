import { useReadContract, useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

export function useTokenList() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  // V2: launchedTokensCount() + launchedTokens(index) via getTokensPaginated
  const { data: count } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'launchedTokensCount',
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS, refetchInterval: 15_000 },
  })

  const tokenCount = count ? Number(count) : 0

  // Read all tokens via getTokensPaginated(0, count)
  const { data: addresses, isLoading, refetch } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getTokensPaginated',
    args: tokenCount > 0 ? [BigInt(0), BigInt(tokenCount)] : [BigInt(0), BigInt(0)],
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS && tokenCount > 0, refetchInterval: 15_000 },
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
    functionName: 'launchedTokensCount',
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS },
  })
  return data as bigint | undefined
}

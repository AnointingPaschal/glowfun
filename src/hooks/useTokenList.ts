import { useReadContract, useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

/**
 * useTokenList — reads all launched token addresses from the factory.
 *
 * getTokensPaginated() reverts on the deployed V2 contract (not in bytecode).
 * We use launchedTokensCount() + launchedTokens(index) via useReadContracts
 * instead — one multicall per page.
 */
export function useTokenList() {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  // Step 1: get the count
  const { data: countRaw, isLoading: countLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'launchedTokensCount',
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS, refetchInterval: 15_000 },
  })

  const tokenCount = countRaw ? Number(countRaw) : 0

  // Step 2: build individual launchedTokens(index) calls for every index
  const contracts = Array.from({ length: tokenCount }, (_, i) => ({
    address: FACTORY_ADDRESS as `0x${string}`,
    abi: FACTORY_ABI,
    functionName: 'launchedTokens' as const,
    args: [BigInt(i)] as const,
    chainId: CHAIN_ID as any,
  }))

  const { data: results, isLoading: resultsLoading, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: !!FACTORY_ADDRESS && tokenCount > 0,
      refetchInterval: 15_000,
    },
  })

  // Extract successful address results
  const addresses: `0x${string}`[] = (results ?? [])
    .map(r => (r.status === 'success' ? (r.result as `0x${string}`) : null))
    .filter((a): a is `0x${string}` => !!a && a !== '0x0000000000000000000000000000000000000000')

  return {
    addresses,
    isLoading: countLoading || (tokenCount > 0 && resultsLoading),
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

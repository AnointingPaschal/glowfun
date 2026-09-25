import { useReadContract, useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import type { FactoryEntry } from '@/context/ConfigContext'

/**
 * useTokenList — reads all launched token addresses from ALL factories.
 *
 * V1 uses launchedTokensCount() + launchedTokens(index) — same as V2/V3.
 * If a factory doesn't support launchedTokensCount it returns 0 and is skipped.
 */

/** Get count for a single factory */
function useFactoryCount(factory: FactoryEntry | undefined, chainId: number) {
  return useReadContract({
    address: factory?.address,
    abi: FACTORY_ABI,
    functionName: 'launchedTokensCount',
    chainId: chainId as any,
    query: {
      enabled: !!factory?.address,
      refetchInterval: 15_000,
    },
  })
}

export function useTokenList() {
  const { FACTORY_ADDRESSES, FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  // Use all factories, falling back to single primary if list is empty
  const allFactories: FactoryEntry[] = FACTORY_ADDRESSES.length > 0
    ? FACTORY_ADDRESSES
    : FACTORY_ADDRESS
      ? [{ address: FACTORY_ADDRESS, label: 'Primary', version: 3, enabled: true }]
      : []

  // Only query factories that are enabled
  const factories = allFactories.filter(f => f.enabled !== false)

  // We support up to 3 factories — read counts for each
  const f0 = factories[0]
  const f1 = factories[1]
  const f2 = factories[2]

  const { data: count0Raw, isLoading: l0 } = useFactoryCount(f0, CHAIN_ID)
  const { data: count1Raw, isLoading: l1 } = useFactoryCount(f1, CHAIN_ID)
  const { data: count2Raw, isLoading: l2 } = useFactoryCount(f2, CHAIN_ID)

  const count0 = count0Raw ? Number(count0Raw) : 0
  const count1 = count1Raw ? Number(count1Raw) : 0
  const count2 = count2Raw ? Number(count2Raw) : 0

  // Build multicall contracts for all factories
  const contracts = [
    ...Array.from({ length: count0 }, (_, i) => ({
      address: f0?.address as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'launchedTokens' as const,
      args: [BigInt(i)] as const,
      chainId: CHAIN_ID as any,
    })),
    ...Array.from({ length: count1 }, (_, i) => ({
      address: f1?.address as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'launchedTokens' as const,
      args: [BigInt(i)] as const,
      chainId: CHAIN_ID as any,
    })),
    ...Array.from({ length: count2 }, (_, i) => ({
      address: f2?.address as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'launchedTokens' as const,
      args: [BigInt(i)] as const,
      chainId: CHAIN_ID as any,
    })),
  ].filter(c => !!c.address)

  const totalExpected = count0 + count1 + count2

  const { data: results, isLoading: resultsLoading, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: totalExpected > 0,
      refetchInterval: 15_000,
    },
  })

  // Deduplicate addresses (same token may exist in multiple factory lists)
  const seen = new Set<string>()
  const addresses: `0x${string}`[] = (results ?? [])
    .map(r => (r.status === 'success' ? (r.result as `0x${string}`) : null))
    .filter((a): a is `0x${string}` => {
      if (!a || a === '0x0000000000000000000000000000000000000000') return false
      const key = a.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return {
    addresses,
    isLoading: l0 || l1 || l2 || (totalExpected > 0 && resultsLoading),
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

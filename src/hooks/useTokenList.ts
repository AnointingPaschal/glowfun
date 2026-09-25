import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig, type FactoryEntry } from '@/context/ConfigContext'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * useTokenList — reads all launched token addresses across every configured
 * factory (V1, V2, V3, …).
 *
 * V1 (GlowFunFactory) has no launchedTokensCount()/launchedTokens(index) —
 * it exposes allTokens() returning the full address[] in one call.
 * V2/V3 dropped allTokens() and use launchedTokensCount() + launchedTokens(i)
 * instead (getTokensPaginated reverts on the deployed bytecode).
 *
 * Querying only the primary factory (the old behavior) meant tokens on the
 * other factories — including V1's allTokens()-only tokens — never showed up.
 */
export function useTokenList() {
  const { FACTORY_ADDRESSES, FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  const factories: FactoryEntry[] = FACTORY_ADDRESSES.length
    ? FACTORY_ADDRESSES
    : FACTORY_ADDRESS
      ? [{ address: FACTORY_ADDRESS, label: 'V1', version: 1 }]
      : []

  // Step 1: V1 factories → allTokens() (full array in one call)
  //         V2/V3 factories → launchedTokensCount()
  const step1Contracts = factories.map(f => ({
    address: f.address,
    abi: FACTORY_ABI,
    functionName: (f.version === 1 ? 'allTokens' : 'launchedTokensCount') as 'allTokens' | 'launchedTokensCount',
    chainId: CHAIN_ID as any,
  }))

  const { data: step1, isLoading: step1Loading, refetch: refetchStep1 } = useReadContracts({
    contracts: step1Contracts,
    query: { enabled: factories.length > 0, refetchInterval: 15_000 },
  })

  // Step 2: build launchedTokens(index) calls for every V2/V3 factory, based
  // on the counts resolved in step 1.
  const step2Contracts = useMemo(() => {
    return factories.flatMap((f, fi) => {
      if (f.version === 1) return []
      const countResult = step1?.[fi]
      const count = countResult?.status === 'success' ? Number(countResult.result as bigint) : 0
      return Array.from({ length: count }, (_, i) => ({
        address: f.address,
        abi: FACTORY_ABI,
        functionName: 'launchedTokens' as const,
        args: [BigInt(i)] as const,
        chainId: CHAIN_ID as any,
      }))
    })
    // step1 identity changes each refetch — depend on its data, not the object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factories, step1, CHAIN_ID])

  const { data: step2, isLoading: step2Loading, refetch: refetchStep2 } = useReadContracts({
    contracts: step2Contracts,
    query: { enabled: step2Contracts.length > 0, refetchInterval: 15_000 },
  })

  const addresses = useMemo(() => {
    const out: `0x${string}`[] = []

    // V1 factories resolve directly from step1's allTokens() result
    factories.forEach((f, fi) => {
      if (f.version !== 1) return
      const r = step1?.[fi]
      if (r?.status === 'success') {
        out.push(...(r.result as readonly `0x${string}`[]))
      }
    })

    // V2/V3 factories resolve from step2's per-index launchedTokens() results
    ;(step2 ?? []).forEach(r => {
      if (r.status === 'success') out.push(r.result as `0x${string}`)
    })

    // Dedupe, drop zero address
    const seen = new Set<string>()
    return out.filter(a => {
      if (!a || a.toLowerCase() === ZERO_ADDRESS) return false
      const key = a.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [factories, step1, step2])

  const hasV2V3 = factories.some(f => f.version !== 1)

  return {
    addresses,
    isLoading: step1Loading || (hasV2V3 && step2Contracts.length > 0 && step2Loading),
    refetch: () => { refetchStep1(); refetchStep2() },
  }
}

export function useTokenCount() {
  const { addresses, isLoading } = useTokenList()
  return isLoading ? undefined : BigInt(addresses.length)
}

import { useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

/** The curve's starting price (USD/token) from the factory's initial virtual reserves. */
export function useLaunchPrice(): number | undefined {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { data } = useReadContracts({
    contracts: FACTORY_ADDRESS ? [
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'initialVirtualUsdcReserves', chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'initialVirtualTokenReserves', chainId: CHAIN_ID as any },
    ] : [],
    query: { enabled: !!FACTORY_ADDRESS, staleTime: 5 * 60_000 },
  })
  const u = data?.[0]?.result as bigint | undefined
  const t = data?.[1]?.result as bigint | undefined
  return u && t ? (Number(u) * 1e12) / Number(t) : undefined
}

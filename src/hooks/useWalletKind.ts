import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { useConfig } from '@/context/ConfigContext'

/**
 * Is this address a personal wallet (EOA) or a contract (e.g. a Gnosis Safe
 * multisig)? Used by the Security tool page to tell a creator whether their
 * admin actions are protected by a signing threshold or a single private key.
 * Never throws: an unreadable result comes back as `null` (unknown), not an
 * error the query keeps retrying into a blank UI.
 */
export function useIsContractWallet(address?: `0x${string}`) {
  const { CHAIN_ID } = useConfig()
  const client = usePublicClient({ chainId: CHAIN_ID as any })
  const zero = address === '0x0000000000000000000000000000000000000000'
  const q = useQuery({
    queryKey: ['wallet-kind', CHAIN_ID, address?.toLowerCase()],
    enabled: !!client && !!address && !zero,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<boolean | null> => {
      try {
        const code = await client!.getBytecode({ address: address as `0x${string}` })
        return !!code && code !== '0x'
      } catch {
        return null
      }
    },
  })
  return { isContract: zero ? null : (q.data ?? null), isLoading: q.isLoading }
}

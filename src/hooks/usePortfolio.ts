import { useAccount, useReadContracts } from 'wagmi'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { useConfig } from '@/context/ConfigContext'
import { useTokenList } from '@/hooks/useTokenList'

export interface HeldToken { address: `0x${string}`; balance: bigint }

/**
 * Every platform-launched token the connected wallet actually holds (balance > 0),
 * drawn from the full cross-factory token list (`useTokenList`, which already
 * dedupes tokens launched across V1/V2/V3). One `balanceOf` multicall batch for
 * the whole list — cheap even with hundreds of launched tokens, since
 * `useReadContracts` folds it into a single RPC call wherever Multicall3 is
 * available (it is, on Arc).
 *
 * This is the platform's own view of "what you hold": it can only see tokens
 * that were launched through GlowFun, plus USDC (handled separately on the
 * Wallet page). It cannot discover arbitrary outside ERC-20s without an
 * indexer, which this app doesn't have.
 */
export function useHeldTokens() {
  const { address: wallet } = useAccount()
  const { CHAIN_ID } = useConfig()
  const { addresses, isLoading: listLoading, refetch: refetchList } = useTokenList()

  const { data, isLoading: balLoading, refetch: refetchBal } = useReadContracts({
    contracts: (wallet && addresses.length > 0) ? addresses.map((a) => ({
      address: a,
      abi: GLOW_TOKEN_ABI,
      functionName: 'balanceOf' as const,
      args: [wallet] as const,
      chainId: CHAIN_ID as any,
    })) : [],
    query: { enabled: !!wallet && addresses.length > 0, refetchInterval: 20_000 },
  })

  const held: HeldToken[] = addresses
    .map((address, i) => ({
      address,
      balance: (data?.[i]?.status === 'success' ? (data[i].result as bigint) : 0n),
    }))
    .filter((t): t is HeldToken => t.balance > 0n)

  return {
    held,
    isLoading: listLoading || (!!wallet && addresses.length > 0 && balLoading),
    refetch: async () => { await Promise.all([refetchList(), refetchBal()]) },
  }
}

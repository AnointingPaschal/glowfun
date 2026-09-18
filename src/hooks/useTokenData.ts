import { useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { FACTORY_ADDRESS, CHAIN_ID } from '@/constants'
import type { TokenInfo, TokenState } from '@/types'

export function useTokenData(tokenAddress: `0x${string}` | undefined) {
  const enabled = !!tokenAddress && !!FACTORY_ADDRESS

  const { data, isLoading, refetch } = useReadContracts({
    contracts: tokenAddress ? [
      // Token metadata
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'name', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'symbol', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'description', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'imageUri', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'twitter', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'telegram', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'website', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'creator', chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'createdAt', chainId: CHAIN_ID as any },
      // Factory state
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTokenState', args: [tokenAddress], chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTokenPrice', args: [tokenAddress], chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getMarketCap', args: [tokenAddress], chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getProgress', args: [tokenAddress], chainId: CHAIN_ID as any },
    ] : [],
    query: { enabled },
  })

  const token: TokenInfo | null = (data && tokenAddress) ? (() => {
    const [name, symbol, description, imageUri, twitter, telegram, website, creator, createdAt, state, price, marketCap, progress] = data
    if (name?.status !== 'success') return null
    const s = state?.result as any
    return {
      address: tokenAddress,
      name: name.result as string,
      symbol: symbol?.result as string ?? '',
      description: description?.result as string ?? '',
      imageUri: imageUri?.result as string ?? '',
      twitter: twitter?.result as string ?? '',
      telegram: telegram?.result as string ?? '',
      website: website?.result as string ?? '',
      creator: creator?.result as `0x${string}` ?? '0x',
      createdAt: Number(createdAt?.result ?? 0),
      state: s ? {
        creator: s.creator,
        virtualUsdcReserves: s.virtualUsdcReserves,
        virtualTokenReserves: s.virtualTokenReserves,
        realUsdcRaised: s.realUsdcRaised,
        realTokensSold: s.realTokensSold,
        graduated: s.graduated,
        createdAt: s.createdAt,
      } as TokenState : { creator: '0x' as `0x${string}`, virtualUsdcReserves: 0n, virtualTokenReserves: 0n, realUsdcRaised: 0n, realTokensSold: 0n, graduated: false, createdAt: 0n },
      price: price?.result as bigint ?? 0n,
      marketCap: marketCap?.result as bigint ?? 0n,
      progress: progress?.result as bigint ?? 0n,
    }
  })() : null

  return { token, isLoading, refetch }
}

export function useTokenBalance(tokenAddress: `0x${string}` | undefined, userAddress: `0x${string}` | undefined) {
  const enabled = !!tokenAddress && !!userAddress && !!FACTORY_ADDRESS

  const { data, refetch } = useReadContracts({
    contracts: tokenAddress && userAddress ? [
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'balanceOf', args: [userAddress], chainId: CHAIN_ID as any },
      { address: tokenAddress, abi: GLOW_TOKEN_ABI, functionName: 'allowance', args: [userAddress, FACTORY_ADDRESS], chainId: CHAIN_ID as any },
    ] : [],
    query: { enabled },
  })

  return {
    balance: (data?.[0]?.result as bigint) ?? 0n,
    allowance: (data?.[1]?.result as bigint) ?? 0n,
    refetch,
  }
}

import { useEffect, useMemo, useState } from 'react'
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits, zeroAddress } from 'viem'
import { toast } from 'sonner'
import { ChevronDown, Loader2, Repeat, Info } from 'lucide-react'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_V3_GETPOOL_ABI, QUOTER_V2_ABI, SWAP_ROUTER02_ABI, CANDIDATE_FEE_TIERS } from '@/abi/UniswapV3Periphery'
import { WALLET_ASSETS, type WalletAsset } from '@/constants/walletAssets'
import { AssetLogo } from '@/components/wallet/AssetLogo'
import { FACTORY_ADDRESS, SWAP_ROUTER_ADDRESS, QUOTER_ADDRESS, CHAIN_ID } from '@/constants'

/**
 * Real Uniswap V3 single-hop swap between the wallet's default assets (USDC/EURC/USYC/cirBTC).
 * Only renders the live trading UI once SWAP_ROUTER_ADDRESS + QUOTER_ADDRESS are configured
 * (see constants.ts for why they're empty by default) — otherwise shows what's already wired
 * up (the pool lookup against Arc's live Uniswap V3 factory) and exactly what's still needed.
 */
export function SwapPanel({ asset, wallet, balance }: { asset: WalletAsset; wallet?: `0x${string}`; balance: bigint }) {
  const others = useMemo(() => WALLET_ASSETS.filter(a => a.slug !== asset.slug), [asset.slug])
  const [outSlug, setOutSlug] = useState(others[0]?.slug ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [amtIn, setAmtIn] = useState('')
  const tokenOut = others.find(a => a.slug === outSlug) ?? others[0]

  const configured = !!SWAP_ROUTER_ADDRESS && !!QUOTER_ADDRESS

  // The Uniswap V3 factory address is read live from GlowFunFactory_V3 — the same
  // owner-mutable address this app's own token-graduation flow already trusts, rather than a
  // second hardcoded copy of it.
  const { data: uniFactory } = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'uniswapV3Factory', chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS },
  })
  const factoryAddr = (uniFactory as `0x${string}` | undefined) ?? undefined

  // Probe the three standard fee tiers to find which pool actually exists for this pair.
  const { data: poolResults } = useReadContracts({
    contracts: (factoryAddr && tokenOut) ? CANDIDATE_FEE_TIERS.map(fee => ({
      address: factoryAddr, abi: FACTORY_V3_GETPOOL_ABI, functionName: 'getPool' as const,
      args: [asset.address, tokenOut.address, fee] as const, chainId: CHAIN_ID as any,
    })) : [],
    query: { enabled: !!factoryAddr && !!tokenOut, refetchInterval: 20000 },
  })
  const foundFee = poolResults?.findIndex(r => r.status === 'success' && r.result && r.result !== zeroAddress) ?? -1
  const fee = foundFee >= 0 ? CANDIDATE_FEE_TIERS[foundFee] : undefined
  const poolExists = fee !== undefined

  let amountInRaw = 0n
  try { amountInRaw = amtIn ? parseUnits(amtIn, asset.decimals) : 0n } catch { /* ignore mid-typing */ }

  const { data: quoteData, isFetching: quoting } = useReadContract({
    address: QUOTER_ADDRESS || undefined, abi: QUOTER_V2_ABI, functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: asset.address, tokenOut: tokenOut?.address ?? zeroAddress, amountIn: amountInRaw, fee: fee ?? 0, sqrtPriceLimitX96: 0n }] as any,
    chainId: CHAIN_ID as any,
    query: { enabled: configured && poolExists && amountInRaw > 0n && !!tokenOut },
  } as any)
  const amountOut = (quoteData as any)?.[0] as bigint | undefined

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: asset.address, abi: erc20Abi, functionName: 'allowance',
    args: wallet && SWAP_ROUTER_ADDRESS ? [wallet, SWAP_ROUTER_ADDRESS] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: configured && !!wallet },
  })
  const needsApproval = configured && amountInRaw > 0n && ((allowance as bigint | undefined) ?? 0n) < amountInRaw

  const { writeContract, isPending: writing, data: txHash } = useWriteContract()
  const { isLoading: confirming, isSuccess: done } = useWaitForTransactionReceipt({ hash: txHash })
  useEffect(() => { if (done) { toast.success(needsApproval ? 'Approved' : 'Swapped!'); refetchAllowance(); if (!needsApproval) setAmtIn('') } }, [done])

  const doApprove = () => {
    if (!tokenOut) return
    writeContract({ address: asset.address, abi: erc20Abi, functionName: 'approve', args: [SWAP_ROUTER_ADDRESS as `0x${string}`, amountInRaw], chainId: CHAIN_ID as any } as any, {
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }
  const doSwap = () => {
    if (!tokenOut || !wallet || fee === undefined || !amountOut) return
    const amountOutMinimum = (amountOut * 99n) / 100n // 1% slippage tolerance
    writeContract({
      address: SWAP_ROUTER_ADDRESS as `0x${string}`, abi: SWAP_ROUTER02_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn: asset.address, tokenOut: tokenOut.address, fee, recipient: wallet, amountIn: amountInRaw, amountOutMinimum, sqrtPriceLimitX96: 0n }],
      chainId: CHAIN_ID as any,
    } as any, { onError: (e: any) => toast.error(e.shortMessage ?? e.message) })
  }

  if (!configured) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-3.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
            <p className="font-bold mb-1" style={{ color: 'var(--text1)' }}>Swap isn't turned on yet</p>
            <p>The pool lookup below is already wired to Arc's live Uniswap V3 factory — what's missing is Arc's SwapRouter02 and QuoterV2 addresses, which aren't publicly confirmed anywhere I could verify from here. Setting <code>VITE_SWAP_ROUTER_ADDRESS</code> and <code>VITE_QUOTER_ADDRESS</code> once those are confirmed turns this on immediately, no code change needed.</p>
          </div>
        </div>
        {tokenOut && (
          <div className="text-xs px-1" style={{ color: 'var(--text3)' }}>
            {factoryAddr
              ? (poolExists ? `A ${(fee!/10000).toFixed(2)}% pool exists for ${asset.symbol}/${tokenOut.symbol} — ready to quote once the router/quoter are set.` : `No ${asset.symbol}/${tokenOut.symbol} pool found on Arc's Uniswap V3 factory yet (checked ${CANDIDATE_FEE_TIERS.map(f=>`${f/10000}%`).join(', ')} tiers).`)
              : 'Reading Arc’s Uniswap V3 factory address from the live GlowFun contract…'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>You pay</label>
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
          <AssetLogo symbol={asset.symbol} src={asset.logo} size={28} />
          <input className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text1)' }}
            type="number" placeholder="0.00" value={amtIn} onChange={e => setAmtIn(e.target.value)} />
          <button className="text-xs font-semibold flex-shrink-0" style={{ color: '#818cf8' }}
            onClick={() => setAmtIn(formatUnits(balance, asset.decimals))}>Max</button>
        </div>
      </div>

      <div className="flex justify-center"><Repeat size={14} style={{ color: 'var(--text3)' }} /></div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>You receive (est.)</label>
        <div className="relative">
          <button onClick={() => setPickerOpen(v => !v)} className="w-full flex items-center gap-2 p-3 rounded-xl text-left" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
            {tokenOut && <AssetLogo symbol={tokenOut.symbol} src={tokenOut.logo} size={28} />}
            <span className="flex-1 text-sm" style={{ color: amountOut ? 'var(--text1)' : 'var(--text3)' }}>
              {quoting ? 'Fetching quote…' : amountOut ? formatUnits(amountOut, tokenOut?.decimals ?? 6) : '0.00'}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--text2)' }}>{tokenOut?.symbol}</span>
            <ChevronDown size={14} style={{ color: 'var(--text3)' }} />
          </button>
          {pickerOpen && (
            <div className="absolute z-10 mt-1 w-full rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {others.map(a => (
                <button key={a.slug} onClick={() => { setOutSlug(a.slug); setPickerOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm" style={{ color: 'var(--text1)' }}>
                  <AssetLogo symbol={a.symbol} src={a.logo} size={22} />{a.symbol}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!poolExists && amtIn && (
        <p className="text-xs px-1" style={{ color: 'var(--red)' }}>No direct {asset.symbol}/{tokenOut?.symbol} pool found on Arc yet.</p>
      )}

      <button
        onClick={needsApproval ? doApprove : doSwap}
        disabled={!amtIn || amountInRaw === 0n || !poolExists || writing || confirming || (!needsApproval && !amountOut)}
        className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}>
        {writing || confirming ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
        {writing || confirming ? 'Confirming…' : needsApproval ? `Approve ${asset.symbol}` : 'Swap'}
      </button>
      <p className="text-[10px] text-center" style={{ color: 'var(--text3)' }}>1% slippage tolerance · single-hop Uniswap V3</p>
    </div>
  )
}

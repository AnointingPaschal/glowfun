import { useEffect, useState } from 'react'
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits, zeroAddress } from 'viem'
import { toast } from 'sonner'
import { ArrowDown, Loader2, Repeat, Info } from 'lucide-react'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_V3_GETPOOL_ABI, QUOTER_V2_ABI, SWAP_ROUTER02_ABI, CANDIDATE_FEE_TIERS } from '@/abi/UniswapV3Periphery'
import { FACTORY_ADDRESS, SWAP_ROUTER_ADDRESS, QUOTER_ADDRESS, USDC_ADDRESS, CHAIN_ID } from '@/constants'

/**
 * Buy/sell for ANY Arc token against USDC — the same real Uniswap V3 single-hop
 * plumbing as the wallet's SwapPanel (pool lookup via the live GlowFun-trusted
 * Uniswap V3 factory, QuoterV2 for a quote, SwapRouter02 to execute), generalized
 * to an arbitrary token address/decimals instead of the 4 fixed wallet assets.
 * Only goes live once SWAP_ROUTER_ADDRESS + QUOTER_ADDRESS are configured — see
 * constants.ts for why they're empty by default. Until then this still shows
 * real pool-lookup info instead of a dead form.
 */
export function GenericSwapPanel({
  tokenAddress, tokenSymbol, tokenDecimals, tokenLogo, wallet,
}: {
  tokenAddress: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number
  tokenLogo?: string
  wallet?: `0x${string}`
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amtIn, setAmtIn] = useState('')

  const tokenIn  = side === 'buy' ? USDC_ADDRESS : tokenAddress
  const tokenOut = side === 'buy' ? tokenAddress : USDC_ADDRESS
  const decIn    = side === 'buy' ? 6 : tokenDecimals
  const decOut   = side === 'buy' ? tokenDecimals : 6
  const symIn    = side === 'buy' ? 'USDC' : tokenSymbol
  const symOut   = side === 'buy' ? tokenSymbol : 'USDC'

  const configured = !!SWAP_ROUTER_ADDRESS && !!QUOTER_ADDRESS

  // Read the live Uniswap V3 factory address the same way the graduation flow does —
  // one owner-mutable source of truth instead of a second hardcoded copy.
  const { data: uniFactory } = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'uniswapV3Factory', chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS },
  })
  const factoryAddr = (uniFactory as `0x${string}` | undefined) ?? undefined

  const { data: poolResults } = useReadContracts({
    contracts: factoryAddr ? CANDIDATE_FEE_TIERS.map(fee => ({
      address: factoryAddr, abi: FACTORY_V3_GETPOOL_ABI, functionName: 'getPool' as const,
      args: [tokenIn, tokenOut, fee] as const, chainId: CHAIN_ID as any,
    })) : [],
    query: { enabled: !!factoryAddr, refetchInterval: 20000 },
  })
  const foundFee = poolResults?.findIndex(r => r.status === 'success' && r.result && r.result !== zeroAddress) ?? -1
  const fee = foundFee >= 0 ? CANDIDATE_FEE_TIERS[foundFee] : undefined
  const poolExists = fee !== undefined

  const { data: balRaw, refetch: refetchBal } = useReadContract({
    address: tokenIn, abi: erc20Abi, functionName: 'balanceOf',
    args: wallet ? [wallet] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: !!wallet, refetchInterval: 15000 },
  })
  const balance = (balRaw as bigint) ?? 0n

  let amountInRaw = 0n
  try { amountInRaw = amtIn ? parseUnits(amtIn, decIn) : 0n } catch { /* mid-typing */ }

  const { data: quoteData, isFetching: quoting } = useReadContract({
    address: QUOTER_ADDRESS || undefined, abi: QUOTER_V2_ABI, functionName: 'quoteExactInputSingle',
    args: [{ tokenIn, tokenOut, amountIn: amountInRaw, fee: fee ?? 0, sqrtPriceLimitX96: 0n }] as any,
    chainId: CHAIN_ID as any,
    query: { enabled: configured && poolExists && amountInRaw > 0n },
  } as any)
  const amountOut = (quoteData as any)?.[0] as bigint | undefined

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn, abi: erc20Abi, functionName: 'allowance',
    args: wallet && SWAP_ROUTER_ADDRESS ? [wallet, SWAP_ROUTER_ADDRESS] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: configured && !!wallet },
  })
  const needsApproval = configured && amountInRaw > 0n && ((allowance as bigint | undefined) ?? 0n) < amountInRaw

  const { writeContract, isPending: writing, data: txHash } = useWriteContract()
  const { isLoading: confirming, isSuccess: done } = useWaitForTransactionReceipt({ hash: txHash })
  useEffect(() => {
    if (!done) return
    if (needsApproval) refetchAllowance()
    else { toast.success(side === 'buy' ? `Bought ${tokenSymbol}!` : `Sold ${tokenSymbol}!`); refetchBal(); setAmtIn('') }
  }, [done])

  const doApprove = () => {
    writeContract({ address: tokenIn, abi: erc20Abi, functionName: 'approve', args: [SWAP_ROUTER_ADDRESS as `0x${string}`, amountInRaw], chainId: CHAIN_ID as any } as any, {
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }
  const doSwap = () => {
    if (!wallet || fee === undefined || !amountOut) return
    const amountOutMinimum = (amountOut * 99n) / 100n // 1% slippage tolerance
    writeContract({
      address: SWAP_ROUTER_ADDRESS as `0x${string}`, abi: SWAP_ROUTER02_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn, tokenOut, fee, recipient: wallet, amountIn: amountInRaw, amountOutMinimum, sqrtPriceLimitX96: 0n }],
      chainId: CHAIN_ID as any,
    } as any, { onError: (e: any) => toast.error(e.shortMessage ?? e.message) })
  }

  return (
    <div className="space-y-3">
      {/* Buy / Sell toggle */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        {(['buy', 'sell'] as const).map(s => (
          <button key={s} onClick={() => { setSide(s); setAmtIn('') }}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize"
            style={{ background: side === s ? (s === 'buy' ? 'var(--green)' : 'var(--red)') : 'transparent', color: side === s ? '#fff' : 'var(--text2)' }}>
            {s} {tokenSymbol}
          </button>
        ))}
      </div>

      {!configured && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
            <p className="font-bold mb-1" style={{ color: 'var(--text1)' }}>Trading isn't turned on yet</p>
            <p>The pool lookup below is already wired to Arc's live Uniswap V3 factory — what's missing is Arc's SwapRouter02 and QuoterV2 addresses, which aren't publicly confirmed anywhere I could verify from here. Setting <code>VITE_SWAP_ROUTER_ADDRESS</code> and <code>VITE_QUOTER_ADDRESS</code> turns this on immediately.</p>
            <p className="mt-1.5">
              {factoryAddr
                ? (poolExists ? `A ${(fee!/10000).toFixed(2)}% ${symIn}/${symOut} pool exists on Arc — ready to quote once the router/quoter are set.` : `No direct ${symIn}/${symOut} pool found on Arc's Uniswap V3 factory yet (checked ${CANDIDATE_FEE_TIERS.map(f=>`${f/10000}%`).join(', ')} tiers).`)
                : 'Reading Arc’s Uniswap V3 factory address…'}
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between mb-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>You pay ({symIn})</label>
          {wallet && <button className="text-[10px] font-semibold" style={{ color: '#818cf8' }} onClick={() => setAmtIn(formatUnits(balance, decIn))}>Balance: {Number(formatUnits(balance, decIn)).toLocaleString('en',{maximumFractionDigits:4})}</button>}
        </div>
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
          {side === 'buy'
            ? <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#2775CA,#1a5490)' }}>$</div>
            : (tokenLogo ? <img src={tokenLogo} className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0" style={{ background: '#6366f1' }}>{tokenSymbol.slice(0,2)}</div>)}
          <input className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text1)' }}
            type="number" placeholder="0.00" value={amtIn} onChange={e => setAmtIn(e.target.value)} disabled={!configured} />
          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--text2)' }}>{symIn}</span>
        </div>
      </div>

      <div className="flex justify-center"><ArrowDown size={14} style={{ color: 'var(--text3)' }} /></div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>You receive (est., {symOut})</label>
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
          {side === 'sell'
            ? <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#2775CA,#1a5490)' }}>$</div>
            : (tokenLogo ? <img src={tokenLogo} className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0" style={{ background: '#6366f1' }}>{tokenSymbol.slice(0,2)}</div>)}
          <span className="flex-1 text-sm" style={{ color: amountOut ? 'var(--text1)' : 'var(--text3)' }}>
            {quoting ? 'Fetching quote…' : amountOut ? formatUnits(amountOut, decOut) : '0.00'}
          </span>
          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--text2)' }}>{symOut}</span>
        </div>
      </div>

      {configured && !poolExists && amtIn && (
        <p className="text-xs px-1" style={{ color: 'var(--red)' }}>No direct {symIn}/{symOut} pool found on Arc yet.</p>
      )}

      <button
        onClick={needsApproval ? doApprove : doSwap}
        disabled={!configured || !amtIn || amountInRaw === 0n || !poolExists || writing || confirming || (!needsApproval && !amountOut)}
        className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: side === 'buy' ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
        {writing || confirming ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
        {writing || confirming ? 'Confirming…' : needsApproval ? `Approve ${symIn}` : side === 'buy' ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`}
      </button>
      <p className="text-[10px] text-center" style={{ color: 'var(--text3)' }}>1% slippage tolerance · single-hop Uniswap V3</p>
    </div>
  )
}

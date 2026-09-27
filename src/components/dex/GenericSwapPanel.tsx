import { useEffect, useState } from 'react'
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits, zeroAddress } from 'viem'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Loader2, Zap, AlertTriangle, Flame, TrendingDown, Info } from 'lucide-react'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_V3_GETPOOL_ABI, QUOTER_V2_ABI, SWAP_ROUTER02_ABI, CANDIDATE_FEE_TIERS } from '@/abi/UniswapV3Periphery'
import { useConfig } from '@/context/ConfigContext'
import { SWAP_ROUTER_ADDRESS, QUOTER_ADDRESS } from '@/constants'

type Mode = 'buy' | 'sell'
const SLIP_OPTIONS = [0.5, 1, 3, 5]

/**
 * Buy/sell for ANY Arc token against USDC — visually styled to match the
 * GlowFun bonding-curve trade panel (TokenPage.tsx) exactly: same Buy/Sell
 * toggle, balance/MAX row, quick-amount chips, slippage picker, and button
 * states. Underneath it's real Uniswap V3 (pool lookup via the live
 * GlowFun-trusted factory, QuoterV2 for a quote, SwapRouter02 to execute) —
 * a plain AMM swap, since a token that isn't a GlowFun launch has no
 * bonding curve to trade against. Goes live once SWAP_ROUTER_ADDRESS +
 * QUOTER_ADDRESS are configured (see constants.ts); until then it still
 * shows real pool-lookup status instead of a dead form.
 */
export function GenericSwapPanel({
  tokenAddress, tokenSymbol, tokenDecimals, tokenLogo, wallet, walletChain,
}: {
  tokenAddress: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number
  tokenLogo?: string
  wallet?: `0x${string}`
  walletChain?: number
}) {
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID } = useConfig()
  const { switchChain } = useSwitchChain()
  const [mode, setMode] = useState<Mode>('buy')
  const [amount, setAmount] = useState('')
  const [slip, setSlip] = useState(1)
  const [showSlip, setShowSlip] = useState(false)

  const tokenIn  = mode === 'buy' ? USDC_ADDRESS : tokenAddress
  const tokenOut = mode === 'buy' ? tokenAddress : USDC_ADDRESS
  const decIn    = mode === 'buy' ? 6 : tokenDecimals
  const decOut   = mode === 'buy' ? tokenDecimals : 6

  const configured = !!SWAP_ROUTER_ADDRESS && !!QUOTER_ADDRESS
  const wrongNetwork = !!wallet && !!walletChain && walletChain !== CHAIN_ID

  // Read the live Uniswap V3 factory address the same way graduation does — one
  // owner-mutable source of truth instead of a second hardcoded copy.
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

  const { data: usdcBalRaw }  = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: wallet ? [wallet] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!wallet, refetchInterval: 15000 } })
  const { data: tokBalRaw, refetch: refetchTokBal } = useReadContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: wallet ? [wallet] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!wallet, refetchInterval: 15000 } })
  const usdcBal = Number(usdcBalRaw ?? 0n) / 1e6
  const tokBal  = Number(tokBalRaw ?? 0n) / 10 ** tokenDecimals
  const balance = mode === 'buy' ? (usdcBalRaw as bigint ?? 0n) : (tokBalRaw as bigint ?? 0n)

  let amountInRaw = 0n
  try { amountInRaw = amount ? parseUnits(amount, decIn) : 0n } catch { /* mid-typing */ }
  const amt = parseFloat(amount || '0')
  const insufficient = (mode === 'buy' && amt > usdcBal + 1e-9) || (mode === 'sell' && amt > tokBal + 1e-9)

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
    else { toast.success(mode === 'buy' ? `Bought ${tokenSymbol}!` : `Sold ${tokenSymbol}!`); refetchTokBal(); setAmount('') }
  }, [done])

  const doApprove = () => {
    writeContract({ address: tokenIn, abi: erc20Abi, functionName: 'approve', args: [SWAP_ROUTER_ADDRESS as `0x${string}`, amountInRaw], chainId: CHAIN_ID as any } as any, {
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }
  const doSwap = () => {
    if (!wallet || fee === undefined || !amountOut) return
    const amountOutMinimum = (amountOut * BigInt(Math.round((100 - slip) * 100))) / 10000n
    writeContract({
      address: SWAP_ROUTER_ADDRESS as `0x${string}`, abi: SWAP_ROUTER02_ABI, functionName: 'exactInputSingle',
      args: [{ tokenIn, tokenOut, fee, recipient: wallet, amountIn: amountInRaw, amountOutMinimum, sqrtPriceLimitX96: 0n }],
      chainId: CHAIN_ID as any,
    } as any, { onError: (e: any) => toast.error(e.shortMessage ?? e.message) })
  }
  const txBusy = writing || confirming

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Buy/Sell toggle */}
      <div className="flex p-1.5 gap-1" style={{ background: 'var(--surface2)' }}>
        {(['buy', 'sell'] as Mode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setAmount('') }} className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all capitalize"
            style={{ background: mode === m ? (m === 'buy' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent', color: mode === m ? (m === 'buy' ? 'var(--green)' : 'var(--red)') : 'var(--text2)', border: mode === m ? `1px solid ${m === 'buy' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` : '1px solid transparent' }}>
            {m === 'buy' ? '▲ Buy' : '▼ Sell'}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {!configured && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
            <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text2)' }}>
              <p className="font-bold mb-0.5" style={{ color: 'var(--text1)' }}>Trading isn't turned on yet</p>
              <p>The pool lookup is already wired to Arc's live Uniswap V3 factory — Arc's SwapRouter02/QuoterV2 addresses just aren't publicly confirmed yet. {factoryAddr ? (poolExists ? `A ${(fee!/10000).toFixed(2)}% pool exists for this pair.` : `No direct pool found on Arc yet (checked ${CANDIDATE_FEE_TIERS.map(f=>`${f/10000}%`).join(', ')} tiers).`) : 'Reading Arc’s Uniswap V3 factory…'}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[9px]" style={{ color: 'var(--text2)' }}>
          <span>Balance: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>{mode === 'buy' ? `${usdcBal.toFixed(2)} USDC` : `${tokBal.toLocaleString('en', { maximumFractionDigits: 4 })} ${tokenSymbol}`}</span></span>
          <button onClick={() => setAmount(mode === 'buy' ? usdcBal.toFixed(6) : tokBal.toFixed(6))} className="px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>MAX</button>
        </div>

        <div className="relative">
          <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={!configured}
            className="w-full px-3 py-3 rounded-xl text-base font-bold outline-none"
            style={{ background: 'var(--surface2)', border: `1px solid ${amount ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`, color: 'var(--text1)', fontFamily: 'Space Grotesk,monospace' }} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--text2)' }}>{mode === 'buy' ? 'USDC' : tokenSymbol}</div>
        </div>

        {mode === 'buy' && (
          <div className="flex gap-1.5">
            {['10', '50', '100', '500'].map(v => (
              <button key={v} onClick={() => setAmount(v)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                style={{ background: amount === v ? 'rgba(99,102,241,0.15)' : 'var(--surface2)', color: amount === v ? 'var(--accent)' : 'var(--text2)', border: `1px solid ${amount === v ? 'rgba(99,102,241,0.3)' : 'var(--border)'}` }}>
                ${v}
              </button>
            ))}
          </div>
        )}

        {configured && amountInRaw > 0n && (
          <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text2)' }}>You receive</span>
              <span className="font-bold" style={{ color: 'var(--text1)' }}>
                {quoting ? 'Fetching quote…' : amountOut ? `~${Number(formatUnits(amountOut, decOut)).toLocaleString('en', { maximumFractionDigits: decOut >= 8 ? 6 : 4 })} ${mode === 'buy' ? tokenSymbol : 'USDC'}` : '—'}
              </span>
            </div>
          </div>
        )}
        {configured && !poolExists && amount && (
          <p className="text-[10px] px-1" style={{ color: 'var(--red)' }}>No direct {mode === 'buy' ? `USDC/${tokenSymbol}` : `${tokenSymbol}/USDC`} pool found on Arc yet.</p>
        )}

        <div>
          <button onClick={() => setShowSlip(v => !v)} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text2)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            Slippage: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{slip}%</span>{showSlip ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
          <AnimatePresence>
            {showSlip && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex gap-1.5 mt-2">
                  {SLIP_OPTIONS.map(s => (
                    <button key={s} onClick={() => setSlip(s)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                      style={{ background: slip === s ? 'rgba(99,102,241,0.15)' : 'var(--surface2)', color: slip === s ? 'var(--accent)' : 'var(--text2)', border: `1px solid ${slip === s ? 'rgba(99,102,241,0.3)' : 'var(--border)'}` }}>
                      {s}%
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!wallet
          ? <div className="text-center py-3 text-sm font-bold rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>Connect wallet to trade</div>
          : wrongNetwork
          ? <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--gold)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <AlertTriangle size={13} />Switch to Arc Network
            </button>
          : needsApproval
          ? <button onClick={doApprove} disabled={txBusy || insufficient || !configured} className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>
              {txBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}{insufficient ? `Insufficient ${mode === 'buy' ? 'USDC' : tokenSymbol}` : `Approve ${mode === 'buy' ? 'USDC' : tokenSymbol}`}
            </button>
          : <button onClick={doSwap} disabled={txBusy || !configured || !amount || amt <= 0 || insufficient || !poolExists || !amountOut}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: mode === 'buy' ? 'linear-gradient(135deg,rgba(34,197,94,0.9),rgba(34,197,94,1))' : 'linear-gradient(135deg,rgba(239,68,68,0.9),rgba(239,68,68,1))', color: '#fff', boxShadow: mode === 'buy' ? '0 4px 20px rgba(34,197,94,0.25)' : '0 4px 20px rgba(239,68,68,0.25)' }}>
              {txBusy ? <><Loader2 size={13} className="animate-spin" />Processing…</> : mode === 'buy' ? <><Flame size={13} />Buy {tokenSymbol}</> : <><TrendingDown size={13} />Sell {tokenSymbol}</>}
            </button>}
        <p className="text-[8px] text-center" style={{ color: 'var(--text3)' }}>{slip}% slippage · single-hop Uniswap V3{fee !== undefined ? ` · ${fee/10000}% pool` : ''}</p>
      </div>
    </div>
  )
}

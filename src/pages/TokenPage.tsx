import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { ArrowLeft, Twitter, Send, Globe, ExternalLink, Trophy, TrendingUp, Users, DollarSign, Loader2, ChevronRight, AlertTriangle, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { Comments } from '@/components/Comments'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'
import { useTokenData, useTokenBalance } from '@/hooks/useTokenData'
import { formatUsdc, formatTokens, formatPrice, formatProgress, formatAddress, timeAgo, parseUsdc, parseTokens } from '@/utils/format'
import { parseOnchainError } from '@/utils/errors'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

type TradeMode = 'buy' | 'sell'

const SLIP_OPTIONS = [0.5, 1, 3]

export function TokenPage() {
  const { address: tokenAddr } = useParams<{ address: string }>()
  const { address: wallet, chainId: walletChain } = useAccount()
  const { switchChain } = useSwitchChain()

  const { token, isLoading, refetch } = useTokenData(tokenAddr as `0x${string}` | undefined)
  const { balance: tokenBalance, allowance: tokenAllowance, refetch: refetchBal } = useTokenBalance(tokenAddr as `0x${string}` | undefined, wallet)

  const { data: usdcBalance } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: wallet ? [wallet] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!wallet } })
  const { data: usdcAllowance } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: wallet && FACTORY_ADDRESS ? [wallet, FACTORY_ADDRESS] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!wallet && !!FACTORY_ADDRESS } })

  const [mode, setMode] = useState<TradeMode>('buy')
  const [amount, setAmount] = useState('')
  const [slip, setSlip] = useState(1)
  const [copied, setCopied] = useState(false)

  const wrong = wallet && walletChain !== CHAIN_ID
  const progress = token ? formatProgress(token.progress) : 0

  // Quote
  const parsedUsdc = parseUsdc(amount)
  const parsedTokens = parseTokens(amount)

  const { data: buyQuote } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getBuyQuote',
    args: [tokenAddr as `0x${string}`, parsedUsdc],
    chainId: CHAIN_ID as any,
    query: { enabled: !!tokenAddr && !!FACTORY_ADDRESS && mode === 'buy' && parsedUsdc > 0n },
  })

  const { data: sellQuote } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getSellQuote',
    args: [tokenAddr as `0x${string}`, parsedTokens],
    chainId: CHAIN_ID as any,
    query: { enabled: !!tokenAddr && !!FACTORY_ADDRESS && mode === 'sell' && parsedTokens > 0n },
  })

  // Write hooks
  const { writeContract: approveUsdc, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: approveToken, data: approveTokenHash, isPending: isApprovingToken } = useWriteContract()
  const { isLoading: isApproveTokenConfirming } = useWaitForTransactionReceipt({ hash: approveTokenHash })

  const { writeContract: trade, data: tradeHash, isPending: isTrading } = useWriteContract()
  const { isLoading: isTxConfirming, isSuccess: isTxDone } = useWaitForTransactionReceipt({ hash: tradeHash })

  useEffect(() => {
    if (isTxDone) { void refetch(); void refetchBal(); setAmount('') }
  }, [isTxDone])

  const needsUsdcApproval = mode === 'buy' && parsedUsdc > 0n && (usdcAllowance as bigint ?? 0n) < parsedUsdc
  const needsTokenApproval = mode === 'sell' && parsedTokens > 0n && tokenAllowance < parsedTokens
  const txBusy = isApproving || isApproveConfirming || isApprovingToken || isApproveTokenConfirming || isTrading || isTxConfirming

  const handleApproveUsdc = () => {
    if (!FACTORY_ADDRESS) return
    approveUsdc({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [FACTORY_ADDRESS, parsedUsdc * 2n], chainId: CHAIN_ID as any } as any, {
      onSuccess: () => toast.success('USDC approval submitted'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleApproveToken = () => {
    if (!FACTORY_ADDRESS || !tokenAddr) return
    approveToken({ address: tokenAddr as `0x${string}`, abi: erc20Abi, functionName: 'approve', args: [FACTORY_ADDRESS, parsedTokens * 2n], chainId: CHAIN_ID as any } as any, {
      onSuccess: () => toast.success('Token approval submitted'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const handleTrade = () => {
    if (!FACTORY_ADDRESS || !tokenAddr || !wallet) return
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }

    if (mode === 'buy') {
      const minOut = buyQuote ? (buyQuote as bigint) * BigInt(100 - Math.ceil(slip)) / 100n : 0n
      trade({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'buyTokens',
        args: [tokenAddr as `0x${string}`, minOut],
        chainId: CHAIN_ID as any,
      } as any, {
        onSuccess: () => toast.success('Buy submitted!'),
        onError: (e) => toast.error(parseOnchainError(e)),
      })
    } else {
      const minOut = sellQuote ? (sellQuote as bigint) * BigInt(100 - Math.ceil(slip)) / 100n : 0n
      trade({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'sellTokens',
        args: [tokenAddr as `0x${string}`, parsedTokens, minOut],
        chainId: CHAIN_ID as any,
      } as any, {
        onSuccess: () => toast.success('Sell submitted!'),
        onError: (e) => toast.error(parseOnchainError(e)),
      })
    }
  }

  const copyAddr = () => { navigator.clipboard.writeText(tokenAddr ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const hue = tokenAddr ? parseInt(tokenAddr.slice(2, 6), 16) % 360 : 200
  const tokenGrad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue + 120) % 360},70%,40%))`

  if (!tokenAddr) return <div className="text-center py-20 text-white">Invalid token address.</div>

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            {[100, 80, 200].map(h => <div key={h} className="animate-pulse rounded-2xl" style={{ height: h, background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
          <div className="space-y-4">
            {[260, 180].map(h => <div key={h} className="animate-pulse rounded-2xl" style={{ height: h, background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="text-center py-20">
        <p className="text-white font-semibold mb-2">Token not found</p>
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>This address may not be a GlowFun token.</p>
        <Link to="/" className="text-purple-400 text-sm">← Back to feed</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm mb-5 hover:text-purple-400 transition-colors" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <ArrowLeft size={14} />Back to Feed
      </Link>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: token info */}
        <div className="xl:col-span-2 space-y-4">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard className="p-5">
              <div className="flex gap-4">
                {token.imageUri ? (
                  <img src={token.imageUri} alt={token.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/9.x/shapes/svg?seed=${tokenAddr}` }} />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-bold text-white" style={{ background: tokenGrad }}>{token.symbol.slice(0, 2)}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{token.name}</h1>
                    <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>${token.symbol}</span>
                    {token.state?.graduated && <span className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1" style={{ background: 'rgba(250,204,21,0.1)', color: '#fbbf24' }}><Trophy size={10} />Graduated</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <span>by {formatAddress(token.creator)}</span>
                    <span>·</span>
                    <span>{timeAgo(token.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatAddress(tokenAddr)}
                      <button onClick={copyAddr}>{copied ? <Check size={10} style={{ color: '#34d399' }} /> : <Copy size={10} />}</button>
                    </div>
                    <a href={`${EXPLORER_BASE}/address/${tokenAddr}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <ExternalLink size={11} />Explorer
                    </a>
                    {token.twitter && <a href={token.twitter} target="_blank" rel="noopener" className="p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><Twitter size={12} style={{ color: 'rgba(255,255,255,0.5)' }} /></a>}
                    {token.telegram && <a href={token.telegram} target="_blank" rel="noopener" className="p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><Send size={12} style={{ color: 'rgba(255,255,255,0.5)' }} /></a>}
                    {token.website && <a href={token.website} target="_blank" rel="noopener" className="p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><Globe size={12} style={{ color: 'rgba(255,255,255,0.5)' }} /></a>}
                  </div>
                </div>
              </div>
              {token.description && (
                <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{token.description}</p>
              )}
            </GlassCard>
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Price', value: `$${formatPrice(token.price)}`, icon: DollarSign, color: '#a78bfa' },
                { label: 'Market Cap', value: formatUsdc(token.marketCap), icon: TrendingUp, color: '#34d399' },
                { label: 'USDC Raised', value: formatUsdc(token.state?.realUsdcRaised ?? 0n), icon: Users, color: '#60a5fa' },
                { label: 'Progress', value: `${progress.toFixed(1)}%`, icon: TrendingUp, color: progress > 70 ? '#34d399' : '#fbbf24' },
              ].map(({ label, value, icon: Icon, color }) => (
                <GlassCard key={label} className="p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon size={12} style={{ color }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                  </div>
                  <div className="text-lg font-bold text-white tabular-nums" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</div>
                </GlassCard>
              ))}
            </div>
          </motion.div>

          {/* Bonding curve progress */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-white">Bonding Curve</span>
                {token.state?.graduated ? (
                  <span className="text-xs flex items-center gap-1" style={{ color: '#fbbf24' }}><Trophy size={12} />Graduated</span>
                ) : (
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatUsdc(token.state?.realUsdcRaised ?? 0n)} / $69K</span>
                )}
              </div>
              <div className="h-3 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: progress > 90 ? 'linear-gradient(90deg, #34d399, #059669)' : 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, progress)}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span>$0</span>
                <span className="font-medium" style={{ color: progress > 50 ? '#34d399' : 'rgba(255,255,255,0.5)' }}>{progress.toFixed(2)}%</span>
                <span>$69K graduation</span>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Right: trade panel */}
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <GlassCard className="p-5" glow>
              <div className="h-[2px] -mx-5 -mt-5 mb-5 rounded-t-2xl" style={{ background: SPECTRAL }} />

              {/* Buy/Sell toggle */}
              <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {(['buy', 'sell'] as TradeMode[]).map(m => (
                  <button key={m} onClick={() => { setMode(m); setAmount('') }} className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all" style={{
                    background: mode === m ? (m === 'buy' ? 'linear-gradient(135deg, #059669, #10b981)' : 'linear-gradient(135deg, #dc2626, #ef4444)') : 'transparent',
                    color: mode === m ? 'white' : 'rgba(255,255,255,0.4)',
                    boxShadow: mode === m ? `0 2px 8px ${m === 'buy' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` : 'none',
                  }}>{m}</button>
                ))}
              </div>

              {token.state?.graduated ? (
                <div className="text-center py-6">
                  <Trophy size={24} className="mx-auto mb-2" style={{ color: '#fbbf24' }} />
                  <p className="text-sm font-semibold text-white mb-1">This token has graduated</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Trade on a DEX for continued trading.</p>
                </div>
              ) : !wallet ? (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button onClick={show} className="w-full py-3.5 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 14px rgba(139,92,246,0.25)' }}>
                      Connect Wallet
                    </button>
                  )}
                </ConnectKitButton.Custom>
              ) : wrong ? (
                <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={15} />Switch to Arc Mainnet
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Amount input */}
                  <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex justify-between mb-2 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <span>{mode === 'buy' ? 'USDC Amount' : `${token.symbol} Amount`}</span>
                      <span>
                        Bal: {mode === 'buy' ? formatUsdc(usdcBalance as bigint ?? 0n) : `${formatTokens(tokenBalance)} ${token.symbol}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 text-xl font-bold text-white bg-transparent outline-none tabular-nums"
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      />
                      <button
                        onClick={() => {
                          if (mode === 'buy') setAmount((Number(usdcBalance as bigint ?? 0n) / 1e6).toFixed(6))
                          else setAmount((Number(tokenBalance) / 1e18).toFixed(4))
                        }}
                        className="text-xs px-2 py-1 rounded-lg font-semibold"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
                      >MAX</button>
                    </div>
                    {/* Quick amounts */}
                    {mode === 'buy' && (
                      <div className="flex gap-1.5 mt-2">
                        {['1', '10', '50', '100'].map(v => (
                          <button key={v} onClick={() => setAmount(v)} className="px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>${v}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quote */}
                  {amount && (
                    <div className="rounded-xl p-3 text-xs space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex justify-between">
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>You get</span>
                        <span className="text-white font-medium">
                          {mode === 'buy' ? (buyQuote ? `${formatTokens(buyQuote as bigint)} ${token.symbol}` : '...') : (sellQuote ? formatUsdc(sellQuote as bigint) : '...')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>Protocol fee</span>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>1%</span>
                      </div>
                    </div>
                  )}

                  {/* Slippage */}
                  <div>
                    <div className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Slippage tolerance</div>
                    <div className="flex gap-1.5">
                      {SLIP_OPTIONS.map(s => (
                        <button key={s} onClick={() => setSlip(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{
                          background: slip === s ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                          color: slip === s ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                          border: slip === s ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(255,255,255,0.05)',
                        }}>{s}%</button>
                      ))}
                    </div>
                  </div>

                  {/* Action button */}
                  {needsUsdcApproval ? (
                    <button onClick={handleApproveUsdc} disabled={txBusy} className="w-full py-3.5 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                      {isApproving || isApproveConfirming ? <><Loader2 size={15} className="animate-spin" />Approving...</> : <>Approve USDC <ChevronRight size={14} /></>}
                    </button>
                  ) : needsTokenApproval ? (
                    <button onClick={handleApproveToken} disabled={txBusy} className="w-full py-3.5 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                      {isApprovingToken || isApproveTokenConfirming ? <><Loader2 size={15} className="animate-spin" />Approving...</> : <>Approve {token.symbol} <ChevronRight size={14} /></>}
                    </button>
                  ) : (
                    <button
                      onClick={handleTrade}
                      disabled={!amount || txBusy || (!buyQuote && mode === 'buy') || (!sellQuote && mode === 'sell')}
                      className="w-full py-3.5 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 capitalize"
                      style={{
                        background: mode === 'buy' ? 'linear-gradient(135deg, #059669, #10b981)' : 'linear-gradient(135deg, #dc2626, #ef4444)',
                        boxShadow: mode === 'buy' ? '0 4px 14px rgba(16,185,129,0.2)' : '0 4px 14px rgba(239,68,68,0.2)',
                      }}
                    >
                      {isTrading || isTxConfirming ? (
                        <><Loader2 size={15} className="animate-spin" />{mode === 'buy' ? 'Buying...' : 'Selling...'}</>
                      ) : (
                        <>{mode === 'buy' ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}</>
                      )}
                    </button>
                  )}
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Your holdings */}
          {wallet && tokenBalance > 0n && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <GlassCard className="p-4">
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Your Holdings</div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{token.symbol} Balance</span>
                  <span className="text-white font-bold tabular-nums">{formatTokens(tokenBalance)}</span>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </div>
      </div>

      {/* Comments / Chat */}
      <div className="mt-6 max-w-5xl mx-auto">
        <Comments tokenAddress={tokenAddr!} />
      </div>
    </div>
  )
}

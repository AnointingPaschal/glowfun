import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  ArrowLeft, Twitter, Send, Globe, ExternalLink, Trophy, TrendingUp,
  DollarSign, Loader2, ChevronRight, AlertTriangle, Copy, Check,
  Activity, BarChart3, Info, Users, Zap, ChevronDown, ChevronUp,
  RefreshCw, Share2, Star, Clock,
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { Comments } from '@/components/Comments'
import { PriceChart, generateSyntheticOHLCV, OHLCV } from '@/components/PriceChart'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { useTokenData, useTokenBalance } from '@/hooks/useTokenData'
import { formatUsdc, formatTokens, formatPrice, formatPriceNumber, formatProgress, formatAddress, timeAgo, parseUsdc, parseTokens } from '@/utils/format'
import { parseOnchainError } from '@/utils/errors'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const GREEN = '#26a69a'
const RED   = '#ef5350'

type TradeMode = 'buy' | 'sell'
type TabId = 'chart' | 'info' | 'trades' | 'comments'
const SLIP_OPTIONS = [0.5, 1, 3, 5]

/* ── DexScreener enrichment ─────────────────────────────────────── */
interface DSPair {
  pairAddress: string
  priceUsd: string
  priceNative: string
  volume: { h24: number; h6: number; h1: number; m5: number }
  priceChange: { h24: number; h6: number; h1: number; m5: number }
  liquidity?: { usd: number }
  fdv?: number
  txns: { h24: { buys: number; sells: number }; h6?: { buys: number; sells: number }; h1?: { buys: number; sells: number } }
}

async function fetchDexScreener(address: string): Promise<DSPair | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const d = await r.json()
    const pairs: DSPair[] = d.pairs ?? []
    return pairs.find((p: any) => p.chainId === 'arc') ?? pairs[0] ?? null
  } catch { return null }
}

async function fetchGeckoOHLCV(poolAddress: string): Promise<OHLCV[] | null> {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/pools/${poolAddress}/ohlcv/hour?limit=168`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const d = await r.json()
    const raw: number[][] = d.data?.attributes?.ohlcv_list ?? []
    return raw.reverse().map(([t, o, h, l, c, v]) => ({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: v }))
  } catch { return null }
}

/* ── Stat badge ─────────────────────────────────────────────────── */
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: color ?? 'white', fontFamily: 'Space Grotesk, sans-serif' }}>{value}</span>
      {sub && <span className="text-[9px] tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
    </div>
  )
}

/* ── Trade history row (mock from events) ───────────────────────── */
function TradeRow({ isBuy, amount, tokens, addr, time }: { isBuy: boolean; amount: string; tokens: string; addr: string; time: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: isBuy ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)', color: isBuy ? GREEN : RED }}>
          {isBuy ? 'BUY' : 'SELL'}
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{addr}</span>
      </div>
      <div className="text-right">
        <div className="text-xs font-medium tabular-nums" style={{ color: isBuy ? GREEN : RED }}>{isBuy ? `+${tokens}` : `-${tokens}`}</div>
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{amount} · {time}</div>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */
export function TokenPage() {
  const { address: tokenAddr } = useParams<{ address: string }>()
  const { address: wallet, chainId: walletChain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()

  const { token, isLoading, refetch } = useTokenData(tokenAddr as `0x${string}` | undefined)
  const { balance: tokenBalance, allowance: tokenAllowance, refetch: refetchBal } = useTokenBalance(tokenAddr as `0x${string}` | undefined, wallet)

  // USDC
  const { data: usdcBalance } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: wallet ? [wallet] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!wallet } })
  const { data: usdcAllowance } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: wallet && FACTORY_ADDRESS ? [wallet, FACTORY_ADDRESS] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!wallet && !!FACTORY_ADDRESS } })

  // Trade state
  const [mode, setMode] = useState<TradeMode>('buy')
  const [amount, setAmount] = useState('')
  const [slip, setSlip] = useState(1)
  const [tab, setTab] = useState<TabId>('chart')
  const [copied, setCopied] = useState(false)
  const [starred, setStarred] = useState(false)
  const [showSlip, setShowSlip] = useState(false)

  // Chart state
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [timeframe, setTimeframe] = useState<'5m' | '1h' | '4h' | '1d'>('1h')
  const [dsData, setDsData] = useState<DSPair | null>(null)
  const [dsLoading, setDsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wrong   = wallet && walletChain !== CHAIN_ID
  const progress = token ? formatProgress(token.progress) : 0
  const parsedUsdc   = parseUsdc(amount)
  const parsedTokens = parseTokens(amount)

  const priceNum = token ? Number(token.price) / 1e42 : 0
  const displayPrice = dsData?.priceUsd ? parseFloat(dsData.priceUsd) : priceNum
  const change24h = dsData?.priceChange?.h24
  const mcapNum  = token ? Number(token.marketCap) / 1e6 : 0
  const raisedNum = token ? Number(token.state?.realUsdcRaised ?? 0n) / 1e6 : 0
  const hue = tokenAddr ? parseInt(tokenAddr.slice(2, 6), 16) % 360 : 200
  const tokenGrad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue + 120) % 360},70%,40%))`

  // Grad threshold from per-token state or global
  const gradThresholdRaw = token?.state ? (token.state as any).tokenGraduationThreshold ?? 0n : 0n
  const gradThreshold = Number(gradThresholdRaw) > 0 ? Number(gradThresholdRaw) / 1e6 : 69000

  // Fetch DS + OHLCV
  useEffect(() => {
    if (!tokenAddr) return
    let cancelled = false
    async function load() {
      setDsLoading(true)
      const ds = await fetchDexScreener(tokenAddr!)
      if (cancelled) return
      setDsData(ds)
      setDsLoading(false)

      setChartLoading(true)
      let data: OHLCV[] | null = null
      if (ds?.pairAddress) data = await fetchGeckoOHLCV(ds.pairAddress)
      if (cancelled) return
      if (!data || data.length === 0) {
        data = generateSyntheticOHLCV(priceNum, token?.state?.realUsdcRaised ?? 0n, token?.state?.createdAt ?? 0n)
      }
      setOhlcv(data)
      setChartLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [tokenAddr, timeframe])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return
    refreshTimer.current = setInterval(() => { void refetch(); void refetchBal() }, 30_000)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [autoRefresh, refetch, refetchBal])

  // Quotes
  const { data: buyQuote }  = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getBuyQuote',  args: [tokenAddr as `0x${string}`, parsedUsdc],   chainId: CHAIN_ID as any, query: { enabled: !!tokenAddr && !!FACTORY_ADDRESS && mode === 'buy'  && parsedUsdc   > 0n } })
  const { data: sellQuote } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getSellQuote', args: [tokenAddr as `0x${string}`, parsedTokens], chainId: CHAIN_ID as any, query: { enabled: !!tokenAddr && !!FACTORY_ADDRESS && mode === 'sell' && parsedTokens > 0n } })

  // Write hooks
  const { writeContract: approveUsdc,  data: approveHash,      isPending: isApproving       } = useWriteContract()
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: approveToken, data: approveTokenHash, isPending: isApprovingToken  } = useWriteContract()
  const { isLoading: isApproveTokenConfirming } = useWaitForTransactionReceipt({ hash: approveTokenHash })
  const { writeContract: trade, data: tradeHash, isPending: isTrading } = useWriteContract()
  const { isLoading: isTxConfirming, isSuccess: isTxDone } = useWaitForTransactionReceipt({ hash: tradeHash })

  useEffect(() => { if (isTxDone) { void refetch(); void refetchBal(); setAmount('') } }, [isTxDone])

  const needsUsdcApproval  = mode === 'buy'  && parsedUsdc   > 0n && (usdcAllowance  as bigint ?? 0n) < parsedUsdc
  const needsTokenApproval = mode === 'sell' && parsedTokens > 0n && tokenAllowance < parsedTokens
  const txBusy = isApproving || isApproveConfirming || isApprovingToken || isApproveTokenConfirming || isTrading || isTxConfirming

  const handleApproveUsdc = () => {
    if (!FACTORY_ADDRESS) return
    approveUsdc({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [FACTORY_ADDRESS, parsedUsdc * 2n], chainId: CHAIN_ID as any } as any, {
      onSuccess: () => toast.success('USDC approval submitted'), onError: (e) => toast.error(parseOnchainError(e)),
    })
  }
  const handleApproveToken = () => {
    if (!FACTORY_ADDRESS || !tokenAddr) return
    approveToken({ address: tokenAddr as `0x${string}`, abi: erc20Abi, functionName: 'approve', args: [FACTORY_ADDRESS, parsedTokens * 2n], chainId: CHAIN_ID as any } as any, {
      onSuccess: () => toast.success('Token approval submitted'), onError: (e) => toast.error(parseOnchainError(e)),
    })
  }
  const handleTrade = () => {
    if (!FACTORY_ADDRESS || !tokenAddr || !wallet) return
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }
    if (mode === 'buy') {
      const minOut = buyQuote ? (buyQuote as bigint) * BigInt(100 - Math.ceil(slip)) / 100n : 0n
      trade({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'buyTokens', args: [tokenAddr as `0x${string}`, minOut], chainId: CHAIN_ID as any } as any, {
        onSuccess: () => toast.success('Buy submitted!'), onError: (e) => toast.error(parseOnchainError(e)),
      })
    } else {
      const minOut = sellQuote ? (sellQuote as bigint) * BigInt(100 - Math.ceil(slip)) / 100n : 0n
      trade({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'sellTokens', args: [tokenAddr as `0x${string}`, parsedTokens, minOut], chainId: CHAIN_ID as any } as any, {
        onSuccess: () => toast.success('Sell submitted!'), onError: (e) => toast.error(parseOnchainError(e)),
      })
    }
  }

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const share = () => { navigator.share?.({ title: token?.name, url: window.location.href }).catch(() => copy(window.location.href)) }

  if (!tokenAddr) return <div className="text-center py-20 text-white">Invalid token.</div>
  if (isLoading) return (
    <div className="max-w-[1400px] mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-3">{[56, 420, 80].map(h => <div key={h} className="animate-pulse rounded-2xl" style={{ height: h, background: 'rgba(255,255,255,0.05)' }} />)}</div>
        <div className="space-y-3">{[280, 180].map(h => <div key={h} className="animate-pulse rounded-2xl" style={{ height: h, background: 'rgba(255,255,255,0.05)' }} />)}</div>
      </div>
    </div>
  )
  if (!token) return (
    <div className="text-center py-20">
      <p className="text-white font-semibold mb-2">Token not found</p>
      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Not a GlowFun token.</p>
      <Link to="/" className="text-purple-400 text-sm">← Back to feed</Link>
    </div>
  )

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* ── Breadcrumb bar ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm hover:text-purple-400 transition-colors" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <ArrowLeft size={14} />Feed
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => { void refetch(); void refetchBal() }} className="p-1.5 rounded-lg transition-all hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }} title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setAutoRefresh(v => !v)} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg" style={{ background: autoRefresh ? 'rgba(38,166,154,0.1)' : 'rgba(255,255,255,0.04)', color: autoRefresh ? GREEN : 'rgba(255,255,255,0.35)', border: `1px solid ${autoRefresh ? 'rgba(38,166,154,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'animate-pulse' : ''}`} style={{ background: autoRefresh ? GREEN : 'rgba(255,255,255,0.2)' }} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button onClick={() => setStarred(v => !v)} className="p-1.5 rounded-lg transition-all" style={{ color: starred ? '#fbbf24' : 'rgba(255,255,255,0.3)', background: starred ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)' }}>
            <Star size={13} fill={starred ? '#fbbf24' : 'none'} />
          </button>
          <button onClick={share} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Share2 size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4 min-w-0">

          {/* Token header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard className="p-4">
              <div className="flex items-start gap-3 flex-wrap">
                {/* Logo */}
                {token.imageUri ? (
                  <img src={token.imageUri} alt={token.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/9.x/shapes/svg?seed=${tokenAddr}` }} />
                ) : (
                  <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-lg font-bold text-white" style={{ background: tokenGrad }}>{token.symbol.slice(0, 2)}</div>
                )}

                {/* Name + price + change */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{token.name}</h1>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>${token.symbol}</span>
                    {token.state?.graduated && <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(250,204,21,0.1)', color: '#fbbf24' }}><Trophy size={10} />Graduated</span>}
                    {dsData && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(38,166,154,0.1)', color: GREEN }}>DexScreener ✓</span>}
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Space Grotesk, sans-serif', color: change24h !== undefined ? (change24h >= 0 ? GREEN : RED) : 'white' }}>
                      ${formatPriceNumber(displayPrice)}
                    </span>
                    {change24h !== undefined && (
                      <span className="text-sm font-medium tabular-nums" style={{ color: change24h >= 0 ? GREEN : RED }}>
                        {change24h >= 0 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
                      </span>
                    )}
                    {dsLoading && <Loader2 size={12} className="animate-spin" style={{ color: '#a78bfa' }} />}
                  </div>
                </div>

                {/* Address + links */}
                <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatAddress(tokenAddr)}</span>
                    <button onClick={() => copy(tokenAddr)}>{copied ? <Check size={9} style={{ color: GREEN }} /> : <Copy size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />}</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`${EXPLORER_BASE}/address/${tokenAddr}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.35)' }}><ExternalLink size={11} /></a>
                    {token.twitter && <a href={token.twitter} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.35)' }}><Twitter size={11} /></a>}
                    {token.telegram && <a href={token.telegram} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.35)' }}><Send size={11} /></a>}
                    {token.website && <a href={token.website} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.35)' }}><Globe size={11} /></a>}
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Stats strip */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              <StatBox label="Market Cap"  value={mcapNum >= 1e6 ? `$${(mcapNum/1e6).toFixed(2)}M` : mcapNum >= 1e3 ? `$${(mcapNum/1e3).toFixed(1)}K` : `$${mcapNum.toFixed(0)}`} color="#a78bfa" />
              <StatBox label="USDC Raised" value={raisedNum >= 1e3 ? `$${(raisedNum/1e3).toFixed(1)}K` : `$${raisedNum.toFixed(2)}`} color="#60a5fa" />
              {dsData && <StatBox label="24h Volume"  value={dsData.volume.h24 >= 1e3 ? `$${(dsData.volume.h24/1e3).toFixed(1)}K` : `$${dsData.volume.h24.toFixed(0)}`} />}
              {dsData && <StatBox label="Liquidity"   value={dsData.liquidity?.usd ? `$${(dsData.liquidity.usd/1e3).toFixed(1)}K` : '—'} />}
              {dsData?.txns && <StatBox label="24h Txns"  value={`${dsData.txns.h24.buys + dsData.txns.h24.sells}`} sub={`${dsData.txns.h24.buys}B / ${dsData.txns.h24.sells}S`} color={GREEN} />}
              <StatBox label="Progress" value={`${progress.toFixed(1)}%`} color={progress > 80 ? '#34d399' : progress > 50 ? '#fbbf24' : 'white'} sub={`$${raisedNum.toFixed(0)} / $${gradThreshold >= 1000 ? (gradThreshold/1000).toFixed(0)+'K' : gradThreshold}`} />
            </div>
          </motion.div>

          {/* Chart + tabs */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
            <GlassCard className="overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center justify-between px-4 pt-3 pb-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <div className="flex">
                  {([
                    { id: 'chart',    label: 'Chart',   icon: BarChart3 },
                    { id: 'info',     label: 'Info',    icon: Info },
                    { id: 'trades',   label: 'Trades',  icon: Activity },
                    { id: 'comments', label: 'Chat',    icon: Users },
                  ] as const).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all"
                      style={{ borderBottom: tab === t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: tab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.35)', marginBottom: -1 }}>
                      <t.icon size={11} />{t.label}
                    </button>
                  ))}
                </div>
                {tab === 'chart' && (
                  <div className="flex gap-1 pb-1">
                    {(['5m', '1h', '4h', '1d'] as const).map(tf => (
                      <button key={tf} onClick={() => setTimeframe(tf)}
                        className="px-2 py-1 rounded-lg text-[9px] font-medium transition-all"
                        style={{ background: timeframe === tf ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: timeframe === tf ? '#a78bfa' : 'rgba(255,255,255,0.35)', border: `1px solid ${timeframe === tf ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
                        {tf}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4">
                {/* Chart tab */}
                {tab === 'chart' && (
                  <div>
                    {!dsData && (
                      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg text-[10px]" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.1)', color: 'rgba(251,191,36,0.7)' }}>
                        <Zap size={10} />Simulated chart based on bonding curve activity. Real data available after DexScreener indexing.
                      </div>
                    )}
                    <PriceChart data={ohlcv} loading={chartLoading} symbol={token.symbol} height={420} />
                    {dsData && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <a href={`https://dexscreener.com/arc/${dsData.pairAddress}`} target="_blank" rel="noopener"
                          className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <BarChart3 size={10} />DexScreener
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Info tab */}
                {tab === 'info' && (
                  <div className="space-y-5">
                    {token.description && (
                      <div>
                        <div className="text-[9px] uppercase tracking-widest mb-2 font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Description</div>
                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{token.description}</p>
                      </div>
                    )}
                    <div>
                      <div className="text-[9px] uppercase tracking-widest mb-2 font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Token Details</div>
                      <div className="space-y-0">
                        {[
                          { k: 'Contract', v: tokenAddr, copy: true },
                          { k: 'Creator', v: token.creator, copy: true },
                          { k: 'Created', v: new Date(token.createdAt * 1000).toLocaleString() },
                          { k: 'Total Supply', v: `${formatTokens((token.state as any)?.totalSupply ?? BigInt(1e27))} ${token.symbol}` },
                          { k: 'Curve Allocation', v: (() => { const s = token.state as any; if (!s?.curveTokens || !s?.totalSupply) return '80%'; return `${((Number(s.curveTokens) / Number(s.totalSupply)) * 100).toFixed(1)}%` })() },
                          { k: 'Graduation Target', v: `$${gradThreshold >= 1000 ? (gradThreshold/1000).toFixed(0)+'K' : gradThreshold}` },
                          { k: 'Chain', v: `Arc Mainnet` },
                          { k: 'USDC Raised', v: `$${raisedNum.toLocaleString('en', { maximumFractionDigits: 2 })}` },
                        ].map(({ k, v, copy: canCopy }) => (
                          <div key={k} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{k}</span>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs ${canCopy ? 'font-mono' : ''} text-white`}>{canCopy ? formatAddress(v) : v}</span>
                              {canCopy && (
                                <button onClick={() => copy(v)} style={{ color: 'rgba(255,255,255,0.25)' }}><Copy size={9} /></button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Socials */}
                    {(token.twitter || token.telegram || token.website) && (
                      <div>
                        <div className="text-[9px] uppercase tracking-widest mb-2 font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Links</div>
                        <div className="flex gap-2 flex-wrap">
                          {token.twitter && <a href={token.twitter} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(29,161,242,0.08)', color: '#1da1f2', border: '1px solid rgba(29,161,242,0.12)' }}><Twitter size={12} />Twitter/X</a>}
                          {token.telegram && <a href={token.telegram} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(0,136,204,0.08)', color: '#0088cc', border: '1px solid rgba(0,136,204,0.12)' }}><Send size={12} />Telegram</a>}
                          {token.website && <a href={token.website} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}><Globe size={12} />Website</a>}
                        </div>
                      </div>
                    )}
                    {/* DexScreener live data */}
                    {dsData && (
                      <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)' }}>
                        <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: '#a78bfa' }}>Live Market Data · DexScreener</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { k: 'FDV', v: dsData.fdv ? `$${(dsData.fdv/1000).toFixed(0)}K` : '—' },
                            { k: 'Liquidity', v: dsData.liquidity?.usd ? `$${dsData.liquidity.usd.toLocaleString()}` : '—' },
                            { k: '1h Change', v: dsData.priceChange.h1 !== undefined ? `${dsData.priceChange.h1 > 0 ? '+' : ''}${dsData.priceChange.h1.toFixed(2)}%` : '—' },
                            { k: '6h Change', v: dsData.priceChange.h6 !== undefined ? `${dsData.priceChange.h6 > 0 ? '+' : ''}${dsData.priceChange.h6.toFixed(2)}%` : '—' },
                            { k: '5m Volume', v: dsData.volume.m5 ? `$${dsData.volume.m5.toFixed(0)}` : '—' },
                            { k: '1h Volume', v: dsData.volume.h1 ? `$${(dsData.volume.h1/1e3).toFixed(1)}K` : '—' },
                          ].map(({ k, v }) => (
                            <div key={k} className="flex justify-between text-xs">
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{k}</span>
                              <span className="font-medium text-white">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Trades tab */}
                {tab === 'trades' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Recent Transactions</span>
                      <a href={`${EXPLORER_BASE}/token/${tokenAddr}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px]" style={{ color: '#a78bfa' }}>
                        Arc Explorer <ExternalLink size={9} />
                      </a>
                    </div>
                    {/* Mock recent trades — in production these come from on-chain event logs */}
                    <div className="space-y-0">
                      {[
                        { isBuy: true,  amount: '$4.20',  tokens: '182.3M', addr: formatAddress(token.creator), time: '2m ago' },
                        { isBuy: false, amount: '$1.10',  tokens: '47.8M',  addr: '0x1234...abcd', time: '5m ago' },
                        { isBuy: true,  amount: '$10.00', tokens: '431.2M', addr: '0xabcd...5678', time: '8m ago' },
                        { isBuy: true,  amount: '$0.50',  tokens: '21.6M',  addr: '0x9876...fedc', time: '15m ago' },
                        { isBuy: false, amount: '$2.75',  tokens: '118.9M', addr: '0xdead...beef', time: '22m ago' },
                      ].map((t, i) => <TradeRow key={i} {...t} />)}
                    </div>
                    <p className="text-[10px] text-center mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
                      Full transaction history on <a href={`${EXPLORER_BASE}/token/${tokenAddr}`} target="_blank" rel="noopener" style={{ color: '#a78bfa' }}>Arc Explorer</a>
                    </p>
                  </div>
                )}

                {/* Comments tab */}
                {tab === 'comments' && <Comments tokenAddress={tokenAddr!} />}
              </div>
            </GlassCard>
          </motion.div>

          {/* Bonding curve progress bar */}
          {!token.state?.graduated && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <GlassCard className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-white">Bonding Curve Progress</span>
                  <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    ${raisedNum.toFixed(2)} / ${gradThreshold >= 1000 ? `${(gradThreshold/1000).toFixed(0)}K` : gradThreshold}
                  </span>
                </div>
                <div className="h-3 rounded-full overflow-hidden mb-1.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, progress)}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ background: progress > 90 ? `linear-gradient(90deg, ${GREEN}, #059669)` : 'linear-gradient(90deg, #8b5cf6, #ec4899)' }} />
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <span>$0</span>
                  <span style={{ color: progress > 50 ? GREEN : 'inherit' }}>{progress.toFixed(2)}% to graduation</span>
                  <span>${gradThreshold >= 1000 ? `${(gradThreshold/1000).toFixed(0)}K` : gradThreshold}</span>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Trade panel ── */}
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <GlassCard className="overflow-hidden" glow>
              <div className="h-[2px]" style={{ background: SPECTRAL }} />
              <div className="p-4">
                {/* Buy/Sell */}
                <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {(['buy', 'sell'] as TradeMode[]).map(m => (
                    <button key={m} onClick={() => { setMode(m); setAmount('') }} className="flex-1 py-2 rounded-lg text-sm font-bold capitalize transition-all" style={{
                      background: mode === m ? (m === 'buy' ? `linear-gradient(135deg, ${GREEN}, #2bbbad)` : 'linear-gradient(135deg, #c62828, #ef5350)') : 'transparent',
                      color: mode === m ? 'white' : 'rgba(255,255,255,0.35)',
                      boxShadow: mode === m ? `0 2px 8px ${m === 'buy' ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)'}` : 'none',
                    }}>{m === 'buy' ? '▲ Buy' : '▼ Sell'}</button>
                  ))}
                </div>

                {token.state?.graduated ? (
                  <div className="text-center py-8">
                    <Trophy size={28} className="mx-auto mb-3" style={{ color: '#fbbf24' }} />
                    <p className="text-sm font-bold text-white mb-1">Token Graduated</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Trade on a DEX for continued liquidity.</p>
                  </div>
                ) : !wallet ? (
                  <ConnectKitButton.Custom>
                    {({ show }) => (
                      <button onClick={show} className="w-full py-3.5 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 14px rgba(139,92,246,0.3)' }}>
                        Connect Wallet to Trade
                      </button>
                    )}
                  </ConnectKitButton.Custom>
                ) : wrong ? (
                  <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: 'rgba(239,83,80,0.1)', color: RED, border: '1px solid rgba(239,83,80,0.2)' }}>
                    <AlertTriangle size={14} />Switch to Arc Mainnet
                  </button>
                ) : (
                  <div className="space-y-3">
                    {/* Amount */}
                    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex justify-between mb-1.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        <span>{mode === 'buy' ? 'You pay (USDC)' : `You sell (${token.symbol})`}</span>
                        <span>Bal: {mode === 'buy' ? formatUsdc(usdcBalance as bigint ?? 0n) : `${formatTokens(tokenBalance)} ${token.symbol}`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                          className="flex-1 text-2xl font-bold text-white bg-transparent outline-none tabular-nums"
                          style={{ fontFamily: 'Space Grotesk, sans-serif' }} />
                        <button onClick={() => {
                          if (mode === 'buy') setAmount((Number(usdcBalance as bigint ?? 0n) / 1e6).toFixed(6))
                          else setAmount((Number(tokenBalance) / 1e18).toFixed(4))
                        }} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>MAX</button>
                      </div>
                      {mode === 'buy' && (
                        <div className="flex gap-1.5 mt-2">
                          {['1', '5', '10', '50', '100'].map(v => (
                            <button key={v} onClick={() => setAmount(v)} className="px-2 py-1 rounded-lg text-[10px] transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>${v}</button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quote */}
                    {amount && (
                      <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>You receive</span>
                          <span className="font-semibold text-white">
                            {mode === 'buy' ? (buyQuote ? `${formatTokens(buyQuote as bigint)} ${token.symbol}` : '...') : (sellQuote ? formatUsdc(sellQuote as bigint) : '...')}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Price impact</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>~{parseFloat(amount) > 100 ? '>1' : '<0.5'}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Protocol fee</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>1%</span>
                        </div>
                      </div>
                    )}

                    {/* Slippage */}
                    <div>
                      <button onClick={() => setShowSlip(v => !v)} className="flex items-center justify-between w-full text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <span>Slippage: {slip}%</span>
                        {showSlip ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      <AnimatePresence>
                        {showSlip && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="flex gap-1.5 pb-1">
                              {SLIP_OPTIONS.map(s => (
                                <button key={s} onClick={() => { setSlip(s); setShowSlip(false) }} className="flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all" style={{
                                  background: slip === s ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                                  color: slip === s ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                                  border: slip === s ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(255,255,255,0.05)',
                                }}>{s}%</button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* CTA */}
                    {needsUsdcApproval ? (
                      <button onClick={handleApproveUsdc} disabled={txBusy} className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                        {isApproving || isApproveConfirming ? <><Loader2 size={14} className="animate-spin" />Approving USDC...</> : <>Approve USDC <ChevronRight size={14} /></>}
                      </button>
                    ) : needsTokenApproval ? (
                      <button onClick={handleApproveToken} disabled={txBusy} className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                        {isApprovingToken || isApproveTokenConfirming ? <><Loader2 size={14} className="animate-spin" />Approving {token.symbol}...</> : <>Approve {token.symbol} <ChevronRight size={14} /></>}
                      </button>
                    ) : (
                      <button onClick={handleTrade} disabled={!amount || txBusy || (!buyQuote && mode === 'buy') || (!sellQuote && mode === 'sell')}
                        className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                        style={{ background: mode === 'buy' ? `linear-gradient(135deg, ${GREEN}, #2bbbad)` : 'linear-gradient(135deg, #c62828, #ef5350)', boxShadow: mode === 'buy' ? `0 4px 20px rgba(38,166,154,0.25)` : '0 4px 20px rgba(239,83,80,0.25)', fontSize: 15 }}>
                        {isTrading || isTxConfirming ? (
                          <><Loader2 size={15} className="animate-spin" />{mode === 'buy' ? 'Buying...' : 'Selling...'}</>
                        ) : (
                          <>{mode === 'buy' ? `▲ Buy ${token.symbol}` : `▼ Sell ${token.symbol}`}</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </GlassCard>
          </motion.div>

          {/* Holdings card */}
          {wallet && tokenBalance > 0n && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <GlassCard className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Your Holdings</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{token.symbol} Balance</span>
                    <span className="text-sm font-bold text-white tabular-nums">{formatTokens(tokenBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Est. Value</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: GREEN }}>${(Number(tokenBalance) / 1e18 * displayPrice).toFixed(4)}</span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Creator info */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Token Info</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Creator</span>
                  <span className="font-mono text-white">{formatAddress(token.creator)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Age</span>
                  <span className="text-white">{timeAgo(token.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Network</span>
                  <span className="text-white">Arc Mainnet</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

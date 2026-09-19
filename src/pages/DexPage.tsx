import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useReadContracts, useAccount } from 'wagmi'
import {
  TrendingUp, Search, ExternalLink, Flame, Globe, Twitter, Send as TgIcon,
  BarChart3, Activity, ArrowUpRight, ArrowDownRight, Loader2, X, Star,
  RefreshCw, ChevronUp, ChevronDown, Zap, Trophy, Clock, DollarSign,
  Copy, Check, Info, ChevronRight, Layers,
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { CandlestickChart, generateSyntheticOHLCV, OHLCV } from '@/components/CandlestickChart'
import { useTokenList } from '@/hooks/useTokenList'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE, GRADUATION_THRESHOLD, USDC_ADDRESS } from '@/constants'
import { formatUsdc, formatPrice, formatProgress, formatAddress, timeAgo } from '@/utils/format'
import type { TokenInfo } from '@/types'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const DEXSCREENER = 'https://api.dexscreener.com/latest/dex'
const GECKOTERMINAL = 'https://api.geckoterminal.com/api/v2/networks/arc'

/* ── DexScreener enrichment ─────────────────────────────────────── */
interface DSPair {
  pairAddress: string
  baseToken: { address: string; name: string; symbol: string }
  priceUsd: string
  priceNative: string
  volume: { h24: number; h6: number; h1: number }
  priceChange: { h24: number; h6: number; h1: number }
  liquidity: { usd: number }
  fdv: number
  txns: { h24: { buys: number; sells: number } }
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] }
}

async function fetchDexScreener(address: string): Promise<DSPair | null> {
  try {
    const r = await fetch(`${DEXSCREENER}/tokens/${address}`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const d = await r.json()
    const pairs: DSPair[] = d.pairs ?? []
    // Prefer Arc pairs; fall back to any
    return pairs.find(p => (p as any).chainId === 'arc') ?? pairs[0] ?? null
  } catch { return null }
}

async function fetchGeckoOHLCV(poolAddress: string): Promise<OHLCV[] | null> {
  try {
    const r = await fetch(
      `${GECKOTERMINAL}/pools/${poolAddress}/ohlcv/hour?limit=168&currency=usd`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!r.ok) return null
    const d = await r.json()
    const raw: number[][] = d.data?.attributes?.ohlcv_list ?? []
    return raw.reverse().map(([t, o, h, l, c, v]) => ({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: v }))
  } catch { return null }
}

/* ── On-chain batch token loader ────────────────────────────────── */
function useBatchTokens(addresses: `0x${string}`[]) {
  const n = addresses.length

  const { data: meta, isLoading: l1 } = useReadContracts({
    contracts: addresses.flatMap(a => [
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'name', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'symbol', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'description', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'imageUri', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'twitter', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'telegram', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'website', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'creator', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'createdAt', chainId: CHAIN_ID as any },
    ]),
    query: { enabled: n > 0, staleTime: 60_000 },
  })

  const { data: states, isLoading: l2 } = useReadContracts({
    contracts: addresses.flatMap(a => [
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTokenState', args: [a], chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTokenPrice', args: [a], chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getMarketCap', args: [a], chainId: CHAIN_ID as any },
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getProgress', args: [a], chainId: CHAIN_ID as any },
    ]),
    query: { enabled: n > 0 && !!FACTORY_ADDRESS, staleTime: 30_000, refetchInterval: 30_000 },
  })

  const tokens: TokenInfo[] = []
  for (let i = 0; i < addresses.length; i++) {
    const m = meta?.slice(i * 9, i * 9 + 9) ?? []
    const s = states?.slice(i * 4, i * 4 + 4) ?? []
    if (m[0]?.status !== 'success') continue
    const st = s[0]?.result as any
    tokens.push({
      address: addresses[i],
      name: m[0]?.result as string ?? '',
      symbol: m[1]?.result as string ?? '',
      description: m[2]?.result as string ?? '',
      imageUri: m[3]?.result as string ?? '',
      twitter: m[4]?.result as string ?? '',
      telegram: m[5]?.result as string ?? '',
      website: m[6]?.result as string ?? '',
      creator: m[7]?.result as `0x${string}` ?? '0x0',
      createdAt: Number(m[8]?.result ?? 0),
      state: st ? {
        creator: st.creator, virtualUsdcReserves: st.virtualUsdcReserves,
        virtualTokenReserves: st.virtualTokenReserves, realUsdcRaised: st.realUsdcRaised,
        realTokensSold: st.realTokensSold, graduated: st.graduated, createdAt: st.createdAt,
      } : { creator: '0x' as `0x${string}`, virtualUsdcReserves: 0n, virtualTokenReserves: 0n, realUsdcRaised: 0n, realTokensSold: 0n, graduated: false, createdAt: 0n },
      price: s[1]?.result as bigint ?? 0n,
      marketCap: s[2]?.result as bigint ?? 0n,
      progress: s[3]?.result as bigint ?? 0n,
    })
  }

  return { tokens, isLoading: l1 || l2 }
}

/* ── Token row ──────────────────────────────────────────────────── */
function TokenRow({
  token, rank, dsData, onClick,
}: {
  token: TokenInfo; rank: number; dsData?: DSPair | null; onClick: () => void
}) {
  const progress = formatProgress(token.progress)
  const priceNum = Number(token.price) / 1e42
  const mcap = Number(token.marketCap) / 1e6
  const raised = Number(token.state.realUsdcRaised) / 1e6

  const change24h = dsData?.priceChange?.h24
  const vol24h = dsData?.volume?.h24
  const hasDS = !!dsData

  const hue = parseInt(token.address.slice(2, 6), 16) % 360
  const tokenGrad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue + 120) % 360},65%,40%))`

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className="cursor-pointer border-b transition-all group"
      style={{ borderColor: 'rgba(255,255,255,0.04)' }}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
    >
      {/* Rank */}
      <td className="px-3 py-3 text-center">
        <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.25)' }}>#{rank}</span>
      </td>

      {/* Token */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          {token.imageUri ? (
            <img src={token.imageUri} alt={token.symbol} className="w-8 h-8 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: tokenGrad }}>
              {token.symbol.slice(0, 1)}
            </div>
          )}
          <div>
            <div className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors">{token.symbol}</div>
            <div className="text-[10px] truncate max-w-[90px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{token.name}</div>
          </div>
          {token.state.graduated && (
            <span className="text-[8px] px-1 py-px rounded font-bold" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.15)' }}>GRAD</span>
          )}
        </div>
      </td>

      {/* Price */}
      <td className="px-3 py-3 text-right">
        <div className="text-xs font-mono text-white tabular-nums">
          ${dsData?.priceUsd ? parseFloat(dsData.priceUsd).toExponential(4) : priceNum.toExponential(4)}
        </div>
      </td>

      {/* 24h change */}
      <td className="px-3 py-3 text-right">
        {change24h !== undefined ? (
          <div className="flex items-center justify-end gap-0.5 text-xs font-medium tabular-nums"
            style={{ color: change24h >= 0 ? '#34d399' : '#f87171' }}>
            {change24h >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(change24h).toFixed(2)}%
          </div>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.2)' }} className="text-xs">—</span>
        )}
      </td>

      {/* Market Cap */}
      <td className="px-3 py-3 text-right">
        <div className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {hasDS && dsData?.fdv ? `$${(dsData.fdv / 1000).toFixed(0)}K` : mcap >= 1000 ? `$${(mcap / 1000).toFixed(1)}K` : `$${mcap.toFixed(0)}`}
        </div>
      </td>

      {/* Volume 24h */}
      <td className="px-3 py-3 text-right hidden lg:table-cell">
        <div className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {vol24h !== undefined ? `$${vol24h >= 1000 ? (vol24h / 1000).toFixed(1) + 'K' : vol24h.toFixed(0)}` : `$${raised.toFixed(0)}`}
        </div>
      </td>

      {/* Bonding progress */}
      <td className="px-3 py-3 hidden md:table-cell" style={{ minWidth: 100 }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(progress, 100)}%`,
              background: progress >= 100 ? '#34d399' : progress > 60 ? '#f59e0b' : 'linear-gradient(90deg, #8b5cf6, #ec4899)',
            }} />
          </div>
          <span className="text-[9px] tabular-nums w-8 text-right" style={{ color: 'rgba(255,255,255,0.4)' }}>{progress.toFixed(0)}%</span>
        </div>
      </td>

      {/* Age */}
      <td className="px-3 py-3 text-right hidden sm:table-cell">
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{timeAgo(token.createdAt)}</span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
            Chart →
          </span>
        </div>
      </td>
    </motion.tr>
  )
}

/* ── Token detail overlay ───────────────────────────────────────── */
function TokenDetail({
  token, dsData, onClose,
}: {
  token: TokenInfo; dsData?: DSPair | null; onClose: () => void
}) {
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<'1h' | '4h' | '1d'>('1h')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'chart' | 'info' | 'txns'>('chart')

  const priceNum = Number(token.price) / 1e42
  const mcap = Number(token.marketCap) / 1e6
  const raised = Number(token.state.realUsdcRaised) / 1e6
  const progress = formatProgress(token.progress)
  const change24h = dsData?.priceChange?.h24
  const hue = parseInt(token.address.slice(2, 6), 16) % 360
  const tokenGrad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue + 120) % 360},65%,40%))`

  // Load OHLCV
  useEffect(() => {
    let cancelled = false
    async function load() {
      setChartLoading(true)
      // Try GeckoTerminal first (if pool address from DS)
      let data: OHLCV[] | null = null
      if (dsData?.pairAddress) {
        data = await fetchGeckoOHLCV(dsData.pairAddress)
      }
      // Fall back to synthetic
      if (!data || data.length === 0) {
        data = generateSyntheticOHLCV(priceNum, token.state.realUsdcRaised, token.state.createdAt)
      }
      if (!cancelled) { setOhlcv(data); setChartLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [token.address, dsData, timeframe])

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl"
          style={{ background: 'rgba(12,12,22,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              {token.imageUri ? (
                <img src={token.imageUri} alt={token.symbol} className="w-10 h-10 rounded-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white" style={{ background: tokenGrad }}>{token.symbol.slice(0,1)}</div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{token.symbol}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{token.name}</span>
                  {token.state.graduated && <span className="text-[8px] px-1.5 py-px rounded font-bold" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>GRADUATED</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>{formatAddress(token.address)}</span>
                  <button onClick={() => copy(token.address)} style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {copied ? <Check size={10} style={{ color: '#34d399' }} /> : <Copy size={10} />}
                  </button>
                  <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener"><ExternalLink size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /></a>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/token/${token.address}`} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg no-underline" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Zap size={10} />Trade
              </Link>
              <button onClick={onClose} className="p-2 rounded-xl transition-all hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Price hero */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold text-white tabular-nums" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  ${dsData?.priceUsd ? parseFloat(dsData.priceUsd).toExponential(4) : priceNum.toExponential(4)}
                </div>
                {change24h !== undefined && (
                  <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: change24h >= 0 ? '#34d399' : '#f87171' }}>
                    {change24h >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(change24h).toFixed(2)}% (24h)
                  </div>
                )}
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 text-right">
                {[
                  { label: 'Market Cap', value: dsData?.fdv ? `$${(dsData.fdv/1000).toFixed(0)}K` : mcap >= 1000 ? `$${(mcap/1000).toFixed(1)}K` : `$${mcap.toFixed(0)}` },
                  { label: '24h Vol', value: dsData?.volume?.h24 !== undefined ? `$${dsData.volume.h24 >= 1000 ? (dsData.volume.h24/1000).toFixed(1)+'K' : dsData.volume.h24.toFixed(0)}` : `$${raised.toFixed(0)}` },
                  { label: 'Progress', value: `${progress.toFixed(1)}%` },
                ].map(s => (
                  <div key={s.label} className="px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</div>
                    <div className="text-xs font-bold text-white">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bonding curve progress */}
            {!token.state.graduated && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  <span>Bonding Curve</span>
                  <span>${raised.toFixed(0)} / ${Number(GRADUATION_THRESHOLD) / 1e6 / 1000}K</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(progress, 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ background: progress > 80 ? '#f59e0b' : 'linear-gradient(90deg, #8b5cf6, #ec4899)' }} />
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex px-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {[{ id: 'chart', label: 'Chart' }, { id: 'info', label: 'Info' }, { id: 'txns', label: 'Transactions' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className="px-4 py-2.5 text-xs font-medium transition-all"
                style={{ borderBottom: tab === t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: tab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.4)', marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Chart tab */}
            {tab === 'chart' && (
              <div>
                {/* Timeframe selector */}
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {dsData ? 'Live Chart' : 'Simulated · Based on bonding curve'}
                  </div>
                  <div className="flex gap-1">
                    {(['1h', '4h', '1d'] as const).map(tf => (
                      <button key={tf} onClick={() => setTimeframe(tf)}
                        className="px-2 py-1 rounded-lg text-[9px] font-medium transition-all"
                        style={{ background: timeframe === tf ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: timeframe === tf ? '#a78bfa' : 'rgba(255,255,255,0.4)', border: `1px solid ${timeframe === tf ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
                <CandlestickChart data={ohlcv} height={300} loading={chartLoading} symbol={token.symbol} />

                {/* DexScreener links */}
                {dsData && (
                  <div className="flex gap-2 mt-3">
                    <a href={`https://dexscreener.com/arc/${dsData.pairAddress}`} target="_blank" rel="noopener"
                      className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <BarChart3 size={10} />DexScreener
                    </a>
                    <div className="flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.1)', color: '#34d399' }}>
                      <Activity size={10} />
                      Buys: {dsData.txns.h24.buys} · Sells: {dsData.txns.h24.sells}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Info tab */}
            {tab === 'info' && (
              <div className="space-y-4">
                {token.description && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Description</div>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{token.description}</p>
                  </div>
                )}
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Token Details</div>
                  <div className="space-y-1.5">
                    {[
                      { k: 'Contract', v: token.address, isAddr: true },
                      { k: 'Creator', v: token.creator, isAddr: true },
                      { k: 'Created', v: new Date(token.createdAt * 1000).toLocaleString() },
                      { k: 'USDC Raised', v: `$${raised.toLocaleString('en', { maximumFractionDigits: 2 })}` },
                      { k: 'Chain', v: `Arc Mainnet (${CHAIN_ID})` },
                    ].map(({ k, v, isAddr }) => (
                      <div key={k} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{k}</span>
                        {isAddr ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-white">{formatAddress(v)}</span>
                            <button onClick={() => copy(v)} style={{ color: 'rgba(255,255,255,0.3)' }}><Copy size={9} /></button>
                          </div>
                        ) : (
                          <span className="text-xs text-white">{v}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Social links */}
                {(token.twitter || token.telegram || token.website) && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Links</div>
                    <div className="flex gap-2 flex-wrap">
                      {token.twitter && <a href={token.twitter} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(29,161,242,0.1)', color: '#1da1f2', border: '1px solid rgba(29,161,242,0.15)' }}><Twitter size={12} />Twitter</a>}
                      {token.telegram && <a href={token.telegram} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(0,136,204,0.1)', color: '#0088cc', border: '1px solid rgba(0,136,204,0.15)' }}><TgIcon size={12} />Telegram</a>}
                      {token.website && <a href={token.website} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}><Globe size={12} />Website</a>}
                    </div>
                  </div>
                )}
                {dsData && (
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#a78bfa' }}>DexScreener Data</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { k: 'Liquidity', v: dsData.liquidity?.usd ? `$${dsData.liquidity.usd.toLocaleString()}` : '—' },
                        { k: '1h Change', v: dsData.priceChange.h1 !== undefined ? `${dsData.priceChange.h1 > 0 ? '+' : ''}${dsData.priceChange.h1.toFixed(2)}%` : '—' },
                        { k: '6h Volume', v: dsData.volume.h6 ? `$${dsData.volume.h6.toLocaleString()}` : '—' },
                        { k: 'FDV', v: dsData.fdv ? `$${(dsData.fdv/1000).toFixed(0)}K` : '—' },
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

            {/* Transactions tab */}
            {tab === 'txns' && (
              <div className="text-center py-8">
                <Activity size={24} className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p className="text-sm text-white font-medium mb-1">Transaction History</p>
                <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>View all on-chain transactions for this token</p>
                <div className="flex justify-center gap-3">
                  <a href={`${EXPLORER_BASE}/token/${token.address}`} target="_blank" rel="noopener"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                    <ExternalLink size={13} />Arc Explorer
                  </a>
                  {dsData && (
                    <a href={`https://dexscreener.com/arc/${dsData.pairAddress}`} target="_blank" rel="noopener"
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <BarChart3 size={13} />DexScreener
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Main Dex Page ──────────────────────────────────────────────── */
type SortKey = 'mcap' | 'price' | 'progress' | 'new' | 'change24h' | 'volume'
type FilterKey = 'all' | 'bonding' | 'graduated' | 'new'

export function TrendingPage() {
  const { addresses, isLoading: loadingList } = useTokenList()
  const { tokens, isLoading: loadingTokens } = useBatchTokens(addresses)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('new')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<TokenInfo | null>(null)
  const [dsCache, setDsCache] = useState<Record<string, DSPair | null>>({})
  const [dsLoading, setDsLoading] = useState(false)
  const [enriched, setEnriched] = useState(0)


  // Enrich tokens with DexScreener data
  useEffect(() => {
    if (tokens.length === 0) return
    let active = true
    async function enrich() {
      setDsLoading(true)
      let count = 0
      for (const token of tokens.slice(0, 30)) {
        if (!active) break
        if (dsCache[token.address] !== undefined) { count++; setEnriched(count); continue }
        const data = await fetchDexScreener(token.address)
        if (!active) break
        setDsCache(prev => ({ ...prev, [token.address]: data }))
        count++
        setEnriched(count)
        await new Promise(r => setTimeout(r, 150)) // rate limit
      }
      if (active) setDsLoading(false)
    }
    enrich()
    return () => { active = false }
  }, [tokens.length])

  // Sort + filter
  const displayed = tokens
    .filter(t => {
      if (filter === 'bonding') return !t.state.graduated
      if (filter === 'graduated') return t.state.graduated
      if (filter === 'new') return Date.now() / 1000 - t.createdAt < 86400
      return true
    })
    .filter(t => {
      if (!search) return true
      const q = search.toLowerCase()
      return t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let va = 0, vb = 0
      if (sort === 'mcap') { va = Number(a.marketCap); vb = Number(b.marketCap) }
      else if (sort === 'price') { va = Number(a.price); vb = Number(b.price) }
      else if (sort === 'progress') { va = Number(a.progress); vb = Number(b.progress) }
      else if (sort === 'new') { va = a.createdAt; vb = b.createdAt }
      else if (sort === 'change24h') {
        va = dsCache[a.address]?.priceChange?.h24 ?? 0
        vb = dsCache[b.address]?.priceChange?.h24 ?? 0
      }
      else if (sort === 'volume') {
        va = dsCache[a.address]?.volume?.h24 ?? Number(a.state.realUsdcRaised)
        vb = dsCache[b.address]?.volume?.h24 ?? Number(b.state.realUsdcRaised)
      }
      return sortDir === 'desc' ? vb - va : va - vb
    })

  // Aggregate stats
  const totalMcap = tokens.reduce((s, t) => s + Number(t.marketCap) / 1e6, 0)
  const totalRaised = tokens.reduce((s, t) => s + Number(t.state.realUsdcRaised) / 1e6, 0)
  const graduated = tokens.filter(t => t.state.graduated).length

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSort(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sort === k
    ? (sortDir === 'desc' ? <ChevronDown size={10} style={{ color: '#a78bfa' }} /> : <ChevronUp size={10} style={{ color: '#a78bfa' }} />)
    : null

  const isLoading = loadingList || loadingTokens

  return (
    <div>
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Live</span>
        </div>
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>
              Dex <span style={{ background: SPECTRAL, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Explorer</span>
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>All tokens on Arc Mainnet · enriched from DexScreener</p>
          </div>
          {dsLoading && (
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <Loader2 size={10} className="animate-spin" />Fetching market data… {enriched}/{Math.min(tokens.length, 30)}
            </div>
          )}
        </div>
      </motion.div>

      {/* Stats bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Tokens', value: String(tokens.length), icon: Layers, color: '#a78bfa' },
            { label: 'Total Market Cap', value: totalMcap >= 1e6 ? `$${(totalMcap/1e6).toFixed(2)}M` : `$${(totalMcap/1000).toFixed(0)}K`, icon: DollarSign, color: '#60a5fa' },
            { label: 'Total Raised', value: `$${totalRaised >= 1000 ? (totalRaised/1000).toFixed(1)+'K' : totalRaised.toFixed(0)}`, icon: TrendingUp, color: '#34d399' },
            { label: 'Graduated', value: `${graduated} / ${tokens.length}`, icon: Trophy, color: '#fbbf24' },
          ].map(s => (
            <GlassCard key={s.label} className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
                <s.icon size={14} style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</div>
                <div className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</div>
              </div>
            </GlassCard>
          ))}
        </div>
      </motion.div>

      {/* Filter + search */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="flex flex-wrap items-center gap-3 mb-4">
        {/* Filter pills */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'all', label: 'All' },
            { id: 'bonding', label: 'Bonding' },
            { id: 'graduated', label: 'Graduated' },
            { id: 'new', label: '< 24h' },
          ] as const).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: filter === f.id ? 'rgba(139,92,246,0.15)' : 'transparent', color: filter === f.id ? '#a78bfa' : 'rgba(255,255,255,0.4)', border: filter === f.id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl min-w-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 280 }}>
          <Search size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, symbol, address…"
            className="text-xs text-white bg-transparent outline-none w-full placeholder-white/20" />
          {search && <button onClick={() => setSearch('')}><X size={11} style={{ color: 'rgba(255,255,255,0.3)' }} /></button>}
        </div>

        <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.25)' }}>{displayed.length} tokens</span>
      </motion.div>

      {/* Token table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { key: null, label: '#', cls: 'text-center w-10' },
                    { key: null, label: 'Token', cls: '' },
                    { key: 'price' as SortKey, label: 'Price', cls: 'text-right' },
                    { key: 'change24h' as SortKey, label: '24h %', cls: 'text-right' },
                    { key: 'mcap' as SortKey, label: 'Mkt Cap', cls: 'text-right' },
                    { key: 'volume' as SortKey, label: 'Volume', cls: 'text-right hidden lg:table-cell' },
                    { key: 'progress' as SortKey, label: 'Progress', cls: 'hidden md:table-cell' },
                    { key: 'new' as SortKey, label: 'Age', cls: 'text-right hidden sm:table-cell' },
                    { key: null, label: '', cls: '' },
                  ].map((col, i) => (
                    <th key={i} className={`px-3 py-2.5 ${col.cls}`}>
                      {col.key ? (
                        <button onClick={() => toggleSort(col.key!)} className="flex items-center gap-1 text-[9px] uppercase tracking-widest font-semibold transition-colors"
                          style={{ color: sort === col.key ? '#a78bfa' : 'rgba(255,255,255,0.3)', ...(col.cls.includes('right') ? { marginLeft: 'auto' } : {}) }}>
                          {col.label}<SortIcon k={col.key} />
                        </button>
                      ) : (
                        <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse border-b" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                      <td className="px-3 py-3"><div className="w-6 h-3 rounded mx-auto" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} /><div className="space-y-1"><div className="w-16 h-3 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} /><div className="w-10 h-2 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} /></div></div></td>
                      {[...Array(6)].map((_, j) => <td key={j} className="px-3 py-3"><div className="h-3 rounded" style={{ background: 'rgba(255,255,255,0.05)', width: 48, marginLeft: 'auto' }} /></td>)}
                      <td />
                    </tr>
                  ))
                ) : displayed.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <Flame size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>{search ? 'No tokens match your search' : 'No tokens launched yet'}</p>
                  </td></tr>
                ) : (
                  displayed.map((t, i) => (
                    <TokenRow key={t.address} token={t} rank={i + 1} dsData={dsCache[t.address]} onClick={() => setSelected(t)} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </motion.div>

      {/* Token detail overlay */}
      <AnimatePresence>
        {selected && (
          <TokenDetail token={selected} dsData={dsCache[selected.address]} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

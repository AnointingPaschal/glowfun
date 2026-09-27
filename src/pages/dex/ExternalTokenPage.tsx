import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import {
  ArrowLeft, RefreshCw, Share2, Copy, Check, ExternalLink, TrendingUp, TrendingDown,
  BarChart3, MessageCircle, Info, Activity, Sprout, Loader2, AlertTriangle,
} from 'lucide-react'
import { Comments } from '@/components/Comments'
import { CurveChart, type ChartKind } from '@/components/CurveChart'
import { GenericSwapPanel } from '@/components/dex/GenericSwapPanel'
import { useArcToken } from '@/hooks/useArcMarket'
import { useTokenList } from '@/hooks/useTokenList'
import { useConfig } from '@/context/ConfigContext'
import { timeAgo, formatAddress } from '@/utils/format'

type TabId = 'chart' | 'comments'

const TIMEFRAMES = { '5m': 0, '15m': 0, '1h': 0, '4h': 0, '1d': 0 } as const
type Timeframe = keyof typeof TIMEFRAMES

function PxDisplay({ p }: { p: number }) {
  if (!p) return <span>$0</span>
  if (p >= 0.01) return <span>${p >= 100 ? p.toLocaleString('en', { maximumFractionDigits: 2 }) : p.toFixed(p >= 1 ? 4 : 6)}</span>
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{ fontSize: '0.55em' }}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
}
function fmtC(v: number) {
  if (!v) return '$0'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}
function Stat({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <span className="text-[8.5px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text2)' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: accent ?? 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>{value}</span>
      {sub && <span className="text-[8.5px] leading-tight" style={{ color: 'var(--text3)' }}>{sub}</span>}
    </div>
  )
}
function ChangePill({ label, value }: { label: string; value: number | null | undefined }) {
  const pos = (value ?? 0) >= 0
  return (
    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl flex-1"
      style={{ background: value != null ? (pos ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') : 'var(--surface2)', border: `1px solid ${value != null ? (pos ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'var(--border)'}` }}>
      <span className="text-[7.5px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text2)' }}>{label}</span>
      {value != null
        ? <span className="text-[9px] font-bold" style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>{pos ? '+' : ''}{value.toFixed(2)}%</span>
        : <span className="text-[9px]" style={{ color: 'var(--text3)' }}>—</span>}
    </div>
  )
}
function useIsDesktop() {
  const q = '(min-width:1024px)'
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q); const f = () => setD(m.matches)
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return d
}

async function fetchOHLCV(pool: string, tokenAddr: string, tf: string): Promise<any[]> {
  try {
    const r = await fetch(`/api/market/ohlcv?pool=${pool}&token=${tokenAddr}&tf=${tf}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return []
    const d = await r.json(); return d.data ?? []
  } catch { return [] }
}

/**
 * Detail + trade page for a non-GlowFun Arc token (discovered via GeckoTerminal /
 * DexScreener). Mirrors GlowFun's own TokenPage layout (hero, stat grid, real
 * chart, trade panel) as closely as is honest for a token with no bonding curve:
 * the chart is real OHLCV from GeckoTerminal (via the existing /api/market/ohlcv
 * route), trading goes through a real Uniswap V3 pool instead of a curve, and
 * bonding-curve-only concepts (order book, holders, on-chain trade feed,
 * tokenomics, graduation) are left out rather than faked.
 */
export function ExternalTokenPage() {
  const { address } = useParams<{ address: string }>()
  const { address: wallet, chainId: walletChain } = useAccount()
  const { EXPLORER_BASE, CHAIN_ID } = useConfig()
  const { addresses: glowAddrs } = useTokenList()
  const isDesktop = useIsDesktop()

  // Hooks must run unconditionally (Rules of Hooks) — the GlowFun-redirect
  // check happens after, once we know isGlow.
  const { token, loading, error, refresh } = useArcToken(address, 10_000)
  const [tab, setTab] = useState<TabId>('chart')
  const [tfKey, setTfKey] = useState<Timeframe>('1h')
  const [chartKind, setChartKind] = useState<ChartKind>('candle')
  const [candles, setCandles] = useState<any[]>([])
  const [chartLoad, setChartLoad] = useState(true)
  const [copied, setCopied] = useState(false)

  const glowSet = useMemo(() => new Set(glowAddrs.map(a => a.toLowerCase())), [glowAddrs])
  const isGlow = !!address && glowSet.has(address.toLowerCase())

  useEffect(() => {
    if (!token || isGlow) return
    let cancelled = false
    setChartLoad(true)
    fetchOHLCV(token.pairAddress || '', token.address, tfKey).then(d => { if (!cancelled) { setCandles(d); setChartLoad(false) } })
    return () => { cancelled = true }
  }, [token?.pairAddress, token?.address, tfKey, isGlow])

  if (!address) return <Navigate to="/dex" replace />
  if (isGlow) return <Navigate to={`/token/${address}`} replace />

  if (loading && !token) return (
    <div className="space-y-3 pt-2">{[160, 100, 200, 280].map((h, i) => <div key={i} className="rounded-2xl shimmer" style={{ height: h, border: '1px solid var(--border)' }} />)}</div>
  )
  if (!token) return (
    <div className="text-center py-16">
      <AlertTriangle size={32} style={{ color: 'var(--text2)' }} className="mx-auto mb-3" />
      <p style={{ color: 'var(--text2)' }}>{error ? `Couldn't load this token — ${error}` : 'Token not found'}</p>
      <Link to="/dex"><button className="mt-4 px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}>← Back to Tokens</button></Link>
    </div>
  )

  const hue = parseInt(token.address.slice(2, 6), 16) % 360
  const tokenGrad = `linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue + 120) % 360},65%,42%))`
  const buys24h = token.buys24h ?? 0
  const sells24h = token.sells24h ?? 0
  const totalTxns = buys24h + sells24h

  // Honest "market signal" for an AMM token: derived from real 24h price change
  // (no fabricated graduation-progress score since there's no bonding curve here).
  const signalScore = Math.max(2, Math.min(98, Math.round(50 + (token.change24h ?? 0) * 1.2)))
  const signalLabel = signalScore >= 75 ? 'Very Bullish' : signalScore >= 55 ? 'Bullish' : signalScore >= 40 ? 'Neutral' : signalScore >= 20 ? 'Bearish' : 'Very Bearish'
  const signalColor = signalScore >= 60 ? 'var(--green)' : signalScore >= 40 ? 'var(--gold)' : 'var(--red)'

  const copyAddr = () => { navigator.clipboard.writeText(token.address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  const TABS = [
    { id: 'chart' as TabId, label: 'Chart', icon: BarChart3 },
    { id: 'comments' as TabId, label: 'Chat', icon: MessageCircle },
  ]

  return (
    <div className="flex flex-col gap-3 pb-24 lg:pb-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_432px] lg:gap-x-7 lg:gap-y-5 lg:items-start">

      {/* Header */}
      <div className="order-[10] lg:order-first lg:col-span-2 flex items-center justify-between">
        <Link to="/dex" className="flex items-center gap-1.5 no-underline" style={{ color: 'var(--text2)' }}>
          <ArrowLeft size={14} /><span className="text-xs font-medium">Tokens</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--green)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: 'var(--green)' }} />Live
          </span>
          <button onClick={() => refresh()} className="p-1.5 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><RefreshCw size={11} style={{ color: 'var(--text2)' }} /></button>
          <button onClick={() => navigator.share?.({ url: window.location.href, title: token.name }).catch(() => {})} className="p-1.5 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><Share2 size={11} style={{ color: 'var(--text2)' }} /></button>
        </div>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4 lg:min-w-0">
        {/* Hero */}
        <div className="order-[20] lg:order-1 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="relative h-28 sm:h-36 lg:h-52 overflow-hidden" style={{ background: tokenGrad }}>
            {token.bannerUrl
              ? <img src={token.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(ellipse at 20% 0%,rgba(255,255,255,0.28),transparent 60%)' }} />}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(13,13,26,0.92) 0%,rgba(13,13,26,0.15) 60%,transparent 100%)' }} />
          </div>
          <div className="px-4 pb-4 lg:px-6 lg:pb-6">
            <div className="flex items-end gap-3 lg:gap-4 -mt-9 lg:-mt-12 relative">
              <div className="flex-shrink-0 rounded-2xl overflow-hidden" style={{ border: '4px solid var(--surface)', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)' }}>
                {token.logoUrl
                  ? <img src={token.logoUrl} className="w-[72px] h-[72px] lg:w-24 lg:h-24 object-cover block" style={{ background: tokenGrad }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <div className="w-[72px] h-[72px] lg:w-24 lg:h-24 flex items-center justify-center text-2xl font-black text-white" style={{ background: tokenGrad }}>{token.symbol?.slice(0, 2)}</div>}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl lg:text-2xl font-black" style={{ color: 'var(--text1)', letterSpacing: '-0.02em' }}>{token.symbol}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>${token.symbol}</span>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  <span className="truncate">{token.name}</span>
                  {token.ageSec > 0 && <span className="flex items-center gap-0.5 flex-shrink-0 text-[9px]" style={{ color: 'var(--green)' }}><Sprout size={8} />{timeAgo(Math.floor(Date.now() / 1000) - token.ageSec)}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{ background: 'var(--surface3)', border: '1px solid var(--border)' }}><ExternalLink size={12} style={{ color: 'var(--text2)' }} /></a>
            </div>

            <div className="flex items-end justify-between mt-4 mb-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text2)' }}>Price</div>
                <div className="text-3xl font-black tabular-nums" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,monospace', letterSpacing: '-0.03em' }}><PxDisplay p={token.priceUsd} /></div>
              </div>
              {token.change24h != null && (
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl" style={{ background: token.change24h >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${token.change24h >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                    {token.change24h >= 0 ? <TrendingUp size={12} style={{ color: 'var(--green)' }} /> : <TrendingDown size={12} style={{ color: 'var(--red)' }} />}
                    <span className="text-sm font-bold" style={{ color: token.change24h >= 0 ? 'var(--green)' : 'var(--red)' }}>{token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%</span>
                  </div>
                  <span className="text-[8px]" style={{ color: 'var(--text3)' }}>24h</span>
                </div>
              )}
            </div>
            <div className="flex gap-1.5 mb-3">
              <ChangePill label="5M" value={token.change5m} /><ChangePill label="1H" value={token.change1h} /><ChangePill label="6H" value={token.change6h} /><ChangePill label="24H" value={token.change24h} />
            </div>
            <button onClick={copyAddr} className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px]" style={{ background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
              <span className="font-mono">{token.address.slice(0, 10)}...{token.address.slice(-8)}</span>
              {copied ? <Check size={11} style={{ color: 'var(--green)' }} /> : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="order-[40] lg:order-2 grid grid-cols-2 md:grid-cols-3 gap-2">
          <Stat label="Market Cap" value={fmtC(token.mcapUsd)} sub="Fully diluted" />
          <Stat label="Liquidity" value={fmtC(token.liqUsd)} accent="var(--accent)" sub="Pool TVL" />
          <Stat label="Volume 24h" value={fmtC(token.volUsd)} sub={totalTxns > 0 ? `${totalTxns} txns` : undefined} />
          <Stat label="Buys 24h" value={String(buys24h)} accent="var(--green)" />
          <Stat label="Sells 24h" value={String(sells24h)} accent="var(--red)" />
          <Stat label="Source" value={token.dexId === 'geckoterminal' ? 'GeckoTerminal' : token.dexId?.startsWith('glowfun') ? 'GlowFun' : 'DexScreener'} sub="pool data provider" />
        </div>

        {/* Chart + tabs */}
        <div className="order-[70] lg:order-3 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex border-b overflow-x-auto scrollbar-hide" style={{ borderColor: 'var(--border)' }}>
            {TABS.map(t => {
              const active = tab === t.id; const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex items-center justify-center gap-1 py-3 text-[10px] font-semibold transition-all whitespace-nowrap px-2"
                  style={{ color: active ? 'var(--accent)' : 'var(--text2)', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', minWidth: 56 }}>
                  <Icon size={10} />{t.label}
                </button>
              )
            })}
          </div>
          <div className="p-3">
            {tab === 'chart' && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                    {(Object.keys(TIMEFRAMES) as Timeframe[]).map(k => (
                      <button key={k} onClick={() => setTfKey(k)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                        style={{ background: tfKey === k ? 'rgba(99,102,241,0.15)' : 'transparent', color: tfKey === k ? '#818cf8' : 'var(--text2)', border: `1px solid ${tfKey === k ? 'rgba(99,102,241,0.3)' : 'transparent'}` }}>
                        {k.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {(['candle', 'area'] as ChartKind[]).map(k => (
                      <button key={k} onClick={() => setChartKind(k)} className="px-2.5 py-1 text-[10px] font-bold capitalize"
                        style={{ background: chartKind === k ? 'rgba(99,102,241,0.15)' : 'var(--surface2)', color: chartKind === k ? '#818cf8' : 'var(--text2)' }}>{k === 'candle' ? 'Candles' : 'Line'}</button>
                    ))}
                  </div>
                </div>
                <CurveChart candles={candles} kind={chartKind} height={isDesktop ? 440 : 300} loading={chartLoad}
                  emptyText={!chartLoad && !candles.length ? 'No pool chart data available yet for this token.' : undefined} />
              </div>
            )}
            {tab === 'comments' && <Comments tokenAddress={token.address} />}
          </div>
        </div>

        {/* Contract details */}
        <div className="order-[80] lg:order-6 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Contract Details</span>
          </div>
          {[
            { label: 'Token Contract', value: formatAddress(token.address), link: `${EXPLORER_BASE}/address/${token.address}` },
            ...(token.pairAddress ? [{ label: 'Pool', value: formatAddress(token.pairAddress), link: `${EXPLORER_BASE}/address/${token.pairAddress}` }] : []),
            { label: 'First seen', value: token.ageSec > 0 ? timeAgo(Math.floor(Date.now() / 1000) - token.ageSec) : '—' },
          ].map(({ label, value, link }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[9px]" style={{ color: 'var(--text2)' }}>{label}</span>
              {link ? <a href={link} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] font-mono no-underline" style={{ color: 'var(--accent)' }}>{value}<ExternalLink size={8} /></a>
                : <span className="text-[10px] font-mono" style={{ color: 'var(--text1)' }}>{value}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto scrollbar-hide lg:pr-1">
        {/* Trade panel */}
        <div className="order-[90] lg:order-1">
          <GenericSwapPanel tokenAddress={token.address as `0x${string}`} tokenSymbol={token.symbol} tokenDecimals={18} tokenLogo={token.logoUrl} wallet={wallet} walletChain={walletChain} />
        </div>

        {/* Market signal — derived from real 24h price change, not a fabricated graduation score */}
        <div className="order-[30] lg:order-5 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5"><Activity size={11} style={{ color: 'var(--accent)' }} /><span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Market Signal</span></div>
            <span className="text-[11px] font-bold" style={{ color: 'var(--text2)' }}>{signalScore} / 100</span>
          </div>
          <div className="text-sm font-black mb-2" style={{ color: signalColor }}>{signalLabel}</div>
          <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: 'var(--surface3)' }}>
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${signalScore}%`, background: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e)' }} />
          </div>
          <div className="flex justify-between text-[8px]" style={{ color: 'var(--text2)' }}><span>Bearish</span><span>Neutral</span><span>Bullish</span></div>
          <div className="flex items-center gap-2 mt-2 text-[9px]">
            {token.change24h != null && <span style={{ color: token.change24h >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>24H {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%</span>}
            {token.change1h != null && <span style={{ color: 'var(--text2)' }}>· 1H {token.change1h >= 0 ? '+' : ''}{token.change1h.toFixed(2)}%</span>}
          </div>
          <p className="text-[8px] mt-2" style={{ color: 'var(--text3)' }}>Based on 24h price change — this token has no GlowFun bonding curve to score.</p>
        </div>

        {/* Buy/Sell volume bar */}
        {totalTxns > 0 && (
          <div className="order-[50] lg:order-6 rounded-2xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between text-[9px] mb-2"><span style={{ color: 'var(--green)', fontWeight: 700 }}>▲ {buys24h} buys (24h)</span><span style={{ color: 'var(--red)', fontWeight: 700 }}>{sells24h} sells ▼</span></div>
            <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface3)' }}>
              <div style={{ width: `${totalTxns ? (buys24h / totalTxns) * 100 : 50}%`, background: 'var(--green)' }} />
              <div style={{ width: `${totalTxns ? (sells24h / totalTxns) * 100 : 50}%`, background: 'var(--red)' }} />
            </div>
          </div>
        )}

        <div className="order-[35] lg:order-4 rounded-2xl p-4 flex items-start gap-2" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <Info size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text2)' }}>This token isn't a GlowFun launch, so it trades on its own Uniswap V3 pool rather than a bonding curve — price, chart and liquidity above are read live from that pool.</p>
        </div>
      </div>
    </div>
  )
}

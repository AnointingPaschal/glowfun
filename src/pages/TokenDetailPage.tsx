import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Copy, Check, BarChart3, Activity,
  Zap, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus,
  Globe, Twitter, Send as TgIcon, Share2, Star, RefreshCw } from 'lucide-react'
import { TVChart, ChartType } from '@/components/TVChart'
import type { CandleData } from '@/components/CustomChart'
import { EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'

/* ── Price display with subscript zeros ──────────────────────────── */
function Price({ v, className = '' }: { v: number; className?: string }) {
  if (!v) return <span className={className}>$0</span>
  if (v >= 0.01) {
    const s = v >= 1000 ? v.toLocaleString('en', { maximumFractionDigits: 2 }) : v >= 1 ? v.toFixed(2) : v.toFixed(4)
    return <span className={className}>${s}</span>
  }
  const str = v.toFixed(20)
  const m = str.match(/^0\.(0+)([1-9]\d{0,5})/)
  if (m && m[1].length >= 3) {
    return <span className={className}>$0.0<sub style={{ fontSize: '0.52em', verticalAlign: 'sub', fontFamily: 'inherit' }}>{m[1].length}</sub>{m[2]}</span>
  }
  return <span className={className}>${v.toFixed(8)}</span>
}

/* ── Helpers ─────────────────────────────────────────────────────── */
const usd = (n?: number) => !n ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(2)}`
const pct = (v?: number) => v == null ? null : `${v >= 0 ? '+' : ''}${Math.abs(v).toFixed(2)}%`
const ageFmt = (s?: number) => !s ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)}m` : s < 86400 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m` : `${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h`

interface Token {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source?: string; isGlowFun?: boolean
}

/* ── Market signal ───────────────────────────────────────────────── */
function calcSignal(ch24 = 0, ch1h = 0) {
  const c = ch24 + ch1h * 0.5
  if (c > 50)  return { label: 'Very Bullish',     score: Math.min(98, 88 + c * 0.05), color: '#15803d' }
  if (c > 10)  return { label: 'Bullish',           score: Math.min(88, 70 + c * 0.4),  color: '#16a34a' }
  if (c > 2)   return { label: 'Slightly Bullish',  score: 60 + c * 2,                  color: '#65a30d' }
  if (c > -2)  return { label: 'Neutral',           score: 50,                            color: '#ca8a04' }
  if (c > -10) return { label: 'Slightly Bearish',  score: 40 + c * 2,                  color: '#ea580c' }
  if (c > -50) return { label: 'Bearish',           score: Math.max(12, 30 + c * 0.4),  color: '#dc2626' }
  return             { label: 'Very Bearish',       score: Math.max(2,  12 + c * 0.05), color: '#991b1b' }
}

/* ── Synthetic OHLCV ─────────────────────────────────────────────── */
function makeSynthetic(price: number, ch24: number, ageSec: number, tf: string): CandleData[] {
  if (!price || price <= 0) return []
  const n = 80
  const start = Math.abs(ch24) > 0.5 ? price / (1 + ch24 / 100) : price * 0.68
  const now = Math.floor(Date.now() / 1000)
  const iv = ({ '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 } as any)[tf] ?? 3600
  let seed = (Math.abs(Math.round(price * 1e9)) ^ 0x5f3759df) % 65535 || 12345
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - i - 1) * iv
    const prog = (i + 1) / n
    const base = start + (price - start) * Math.pow(prog, 0.7) + Math.sin(prog * Math.PI * 3.5) * price * 0.02
    const ns = 0.018 + rng() * 0.042; const dir = rng() > 0.44 ? 1 : -1
    const o = Math.max(base * (1 + (rng() - 0.5) * ns * 0.55), 1e-30)
    const c = Math.max(base * (1 + dir * ns * 0.38 * rng()), 1e-30)
    return { time: t, open: o, high: Math.max(o, c) * (1 + ns * 0.09 * rng()), low: Math.min(o, c) * (1 - ns * 0.065 * rng()), close: c, volume: (rng() * 7000 + 400) }
  })
}

async function fetchToken(addr: string): Promise<Token | null> {
  try {
    const r = await fetch(`/api/market?q=${addr}&limit=10`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return null
    const d = await r.json() as any
    const ts: Token[] = d.data?.tokens ?? []
    return ts.find(t => t.address.toLowerCase() === addr.toLowerCase()) ?? ts[0] ?? null
  } catch { return null }
}

async function fetchOHLCV(pool: string, token: string, tf: string): Promise<CandleData[]> {
  try {
    const p = new URLSearchParams({ tf })
    if (pool) p.set('pool', pool); if (token) p.set('token', token)
    const r = await fetch(`/api/market/ohlcv?${p}`, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return []
    const d = await r.json() as any
    return (d.data ?? []).filter((c: any) => c.open > 0 && c.close > 0)
  } catch { return [] }
}

/* ── Stat card ────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: string }) {
  return (
    <div className="py-2.5 px-3 border-b last:border-0" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs" style={{ color: '#9ca3af' }}>{label}</span>
        <span className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] border flex-shrink-0" style={{ borderColor: '#d1d5db', color: '#9ca3af' }}>i</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold" style={{ color: '#111827', fontFamily: 'Space Grotesk,sans-serif' }}>{value}</span>
        {highlight && <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: parseFloat(highlight) >= 0 ? '#16a34a' : '#dc2626' }}>
          {parseFloat(highlight) >= 0 ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
          {highlight}
        </span>}
      </div>
      {sub && <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{sub}</div>}
    </div>
  )
}

/* ── Change pill ──────────────────────────────────────────────────── */
function CPill({ label, v }: { label: string; v?: number }) {
  if (v == null) return null
  const pos = v >= 0
  return (
    <div className="flex flex-col items-center px-1.5 py-1.5 rounded-lg flex-1" style={{ background: pos ? '#f0fdf4' : '#fef2f2', border: `1px solid ${pos ? '#bbf7d0' : '#fecaca'}` }}>
      <span className="text-[8px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>{label}</span>
      <div className="flex items-center gap-0.5">
        {pos ? <ArrowUpRight size={10} style={{ color: '#16a34a' }}/> : <ArrowDownRight size={10} style={{ color: '#dc2626' }}/>}
        <span className="text-[10px] font-bold" style={{ color: pos ? '#16a34a' : '#dc2626' }}>{Math.abs(v).toFixed(2)}%</span>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */
export function TokenDetailPage() {
  const { address } = useParams<{ address: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  const [token, setToken]         = useState<Token | null>((location.state as any)?.token ?? null)
  const [loadingToken, setLT]     = useState(!token)
  const [ohlcv, setOhlcv]         = useState<CandleData[]>([])
  const [chartLoading, setCL]     = useState(true)
  const [tf, setTf]               = useState<'5m'|'15m'|'1h'|'4h'|'1d'>('1h')
  const [range, setRange]         = useState<'1D'|'7D'|'1M'|'3M'|'1Y'|'MAX'>('7D')
  const [chartType, setCT]        = useState<ChartType>('candle')
  const [isSynth, setIsSynth]     = useState(false)
  const [copiedAddr, setCopiedA]  = useState(false)
  const [copiedPair, setCopiedP]  = useState(false)
  const [refreshing, setRef]      = useState(false)

  // Resolve token
  useEffect(() => { if (token || !address) return; fetchToken(address).then(t => { setToken(t); setLT(false) }) }, [address])

  // Chart data
  useEffect(() => {
    if (!token) return
    let alive = true; setCL(true); setOhlcv([])
    ;(async () => {
      const live = await fetchOHLCV(token.pairAddress ?? '', token.address, tf)
      if (!alive) return
      if (live.length >= 5) { setOhlcv(live); setIsSynth(false) }
      else { setOhlcv(makeSynthetic(token.priceUsd, token.change24h ?? 0, token.age ?? 86400, tf)); setIsSynth(true) }
      setCL(false)
    })()
    return () => { alive = false }
  }, [token?.address, token?.pairAddress, tf])

  const refreshToken = async () => {
    if (!address) return; setRef(true)
    const t = await fetchToken(address); if (t) setToken(t)
    setRef(false)
  }

  const copyA = (s: string, which: 'addr'|'pair') => {
    navigator.clipboard.writeText(s)
    if (which === 'addr') { setCopiedA(true); setTimeout(() => setCopiedA(false), 1200) }
    else { setCopiedP(true); setTimeout(() => setCopiedP(false), 1200) }
  }

  const hue = parseInt((address ?? '0x000000').slice(2,6), 16) % 360
  const ch24 = token?.change24h ?? 0
  const ch24Pos = ch24 >= 0
  const sig = calcSignal(token?.change24h, token?.change1h)
  const buyRatio = (token?.buys24h ?? 0) + (token?.sells24h ?? 0) > 0
    ? token!.buys24h! / (token!.buys24h! + token!.sells24h!) : null
  const tokenName = token?.name && !token.name.includes('/') ? token.name : token?.symbol ?? ''

  if (loadingToken) return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(99,102,241,0.12)', borderTopColor: '#6366f1' }}/>
      <span className="text-sm" style={{ color: '#9ca3af' }}>Loading token data…</span>
    </div>
  )
  if (!token) return (
    <div className="text-center py-20">
      <p className="font-medium mb-3" style={{ color: '#374151' }}>Token not found</p>
      <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: '#f3f4f6', color: '#374151' }}>← Back</button>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto">

      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm" style={{ color: '#9ca3af' }}>
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 font-medium hover:text-gray-600 transition-colors" style={{ color: '#6b7280' }}>
            <ArrowLeft size={14}/> Back
          </button>
          <span>/</span>
          <span style={{ color: '#374151' }}>{tokenName} ({token.symbol})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={refreshToken} className="p-1.5 rounded-lg transition-all" style={{ background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.08)' }}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} style={{ color: '#6b7280' }}/>
          </button>
          <button onClick={() => navigator.share?.({ url: window.location.href, title: tokenName })} className="p-1.5 rounded-lg" style={{ background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.08)' }}>
            <Share2 size={12} style={{ color: '#6b7280' }}/>
          </button>
        </div>
      </div>

      {/* ── Hero card ──────────────────────────────────────────── */}
      <div className="rounded-2xl mb-3 overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>

        {/* Token identity */}
        <div className="px-3 pt-3 pb-2.5">
          <div className="flex items-start gap-3 mb-4">
            <div className="relative flex-shrink-0">
              {token.logoUrl
                ? <img src={token.logoUrl} className="w-12 h-12 rounded-xl object-cover border" style={{ borderColor: 'rgba(0,0,0,0.08)' }} onError={e => { (e.target as any).style.display='none' }}/>
                : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold text-white" style={{ background: `linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))` }}>{token.symbol.slice(0,2)}</div>}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: '#111827', fontFamily: 'Space Grotesk,sans-serif', letterSpacing:'-0.01em' }}>{tokenName}</h1>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#f3f4f6', color: '#374151' }}>{token.symbol}</span>
                {token.dexId && <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#ede9fe', color: '#7c3aed' }}>{token.dexId}</span>}
                {token.isGlowFun && <Link to={`/token/${token.address}`} className="no-underline text-xs font-bold px-2.5 py-1 rounded-full text-white flex items-center gap-1" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}><Zap size={10}/>Trade</Link>}
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-end gap-3 mb-1">
            <Price v={token.priceUsd} className="text-5xl font-bold" />
            <div className="flex items-center gap-1 px-2 py-1 rounded-full font-bold text-xs mb-1"
              style={{ background: ch24Pos ? '#dcfce7' : '#fee2e2', color: ch24Pos ? '#15803d' : '#dc2626' }}>
              {ch24Pos ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
              {Math.abs(ch24).toFixed(2)}%
            </div>
          </div>
          <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>
            Updated {ageFmt(token.age)} ago · DexScreener + GeckoTerminal · Arc Mainnet
          </p>

          {/* Change pills row */}
          <div className="flex gap-1.5 mb-3">
            <CPill label="5M" v={token.change5m}/>
            <CPill label="1H" v={token.change1h}/>
            <CPill label="6H" v={token.change6h}/>
            <CPill label="24H" v={token.change24h}/>
          </div>

          {/* Address row */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#f9fafb', border: '1px solid rgba(0,0,0,0.07)' }}>
            <span className="text-[10px] font-mono flex-1 truncate" style={{ color: '#6b7280' }}>{token.address}</span>
            <button onClick={() => copyA(token.address, 'addr')} className="flex-shrink-0 p-0.5">
              {copiedAddr ? <Check size={12} style={{ color: '#16a34a' }}/> : <Copy size={12} style={{ color: '#9ca3af' }}/>}
            </button>
            <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener" className="flex-shrink-0 p-0.5">
              <ExternalLink size={12} style={{ color: '#9ca3af' }}/>
            </a>
          </div>
        </div>

        {/* ── Market Signal ───────────────────────────────────── */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: '#9ca3af' }}>
            MARKET SIGNAL
            <span className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] border" style={{ borderColor: '#d1d5db', color: '#9ca3af' }}>i</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xl font-bold" style={{ color: sig.color }}>{sig.label}</span>
            <span className="ml-auto text-sm font-semibold" style={{ color: '#374151' }}>{Math.round(sig.score)} / 100</span>
          </div>
          {/* Gradient progress bar */}
          <div className="relative h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'linear-gradient(90deg,#dc2626 0%,#f97316 25%,#fbbf24 45%,#65a30d 65%,#16a34a 100%)' }}>
            <div className="absolute top-0 h-full w-0.5 rounded-full bg-white shadow-lg" style={{ left: `${sig.score}%`, transform: 'translateX(-50%)' }}/>
          </div>
          <div className="flex justify-between text-[10px] font-medium mb-3" style={{ color: '#9ca3af' }}>
            <span>Bearish</span><span>Neutral</span><span>Bullish</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: '#6b7280' }}>
            {token.change24h != null && <span className="font-semibold" style={{ color: ch24Pos ? '#16a34a' : '#dc2626' }}>24H {ch24Pos?'+':''}{token.change24h.toFixed(2)}%</span>}
            {token.change1h != null && <span>· 1H {token.change1h>=0?'+':''}{token.change1h.toFixed(2)}%</span>}
            {token.pairAddress && <a href={`https://dexscreener.com/arc/${token.pairAddress}`} target="_blank" rel="noopener" className="underline font-medium" style={{ color: '#6366f1' }}>· View on DexScreener</a>}
          </div>
        </div>

        {/* ── Stats grid ──────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="grid grid-cols-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <StatCard label="Market cap" value={usd(token.mcapUsd)}/>
            <div style={{ borderLeft: '1px solid rgba(0,0,0,0.05)' }}>
              <StatCard label="Volume (24h)" value={usd(token.volumeUsd)} highlight={token.change24h != null ? `${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}%` : undefined}/>
            </div>
          </div>
          <div className="grid grid-cols-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <StatCard label="Liquidity" value={usd(token.liquidityUsd)}/>
            <div style={{ borderLeft: '1px solid rgba(0,0,0,0.05)' }}>
              <StatCard label="Pair age" value={ageFmt(token.age)}/>
            </div>
          </div>
          <StatCard label="FDV (Fully Diluted Valuation)" value={usd(token.mcapUsd)}/>
        </div>

        {/* ── Buy / Sell bar ──────────────────────────────────── */}
        {buyRatio !== null && (
          <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="flex justify-between mb-1.5">
              <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#16a34a' }}>▲ {token.buys24h} buys (24h)</span>
              <span className="text-sm font-bold flex items-center gap-1" style={{ color: '#dc2626' }}>{token.sells24h} sells ▼</span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden">
              <div style={{ width: `${buyRatio*100}%`, background: 'linear-gradient(90deg,#16a34a,#22c55e)' }}/>
              <div style={{ flex: 1, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }}/>
            </div>
            <div className="flex justify-between mt-1.5 text-xs font-medium" style={{ color: '#9ca3af' }}>
              <span>Buy Vol {usd(token.volumeUsd ? token.volumeUsd * buyRatio : 0)}</span>
              <span>Sell Vol {usd(token.volumeUsd ? token.volumeUsd * (1 - buyRatio) : 0)}</span>
            </div>
          </div>
        )}

        {/* ── Pair info strip ──────────────────────────────────── */}
        {token.pairAddress && (
          <div className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', background: '#f9fafb' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: '#9ca3af' }}>Pair Address</div>
              <div className="text-[10px] font-mono truncate" style={{ color: '#374151' }}>{token.pairAddress}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => copyA(token.pairAddress!, 'pair')}>
                {copiedPair ? <Check size={12} style={{ color: '#16a34a' }}/> : <Copy size={12} style={{ color: '#9ca3af' }}/>}
              </button>
              {token.pairAddress && <a href={`${EXPLORER_BASE}/address/${token.pairAddress}`} target="_blank" rel="noopener"><ExternalLink size={12} style={{ color: '#9ca3af' }}/></a>}
            </div>
          </div>
        )}
      </div>

      {/* ── Chart card ─────────────────────────────────────────── */}
      <div className="rounded-2xl mb-3 overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
        {/* Chart header */}
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <BarChart3 size={15} style={{ color: '#6366f1' }}/>
          <span className="text-sm font-semibold flex-1" style={{ color: '#111827' }}>
            {tokenName} ({token.symbol}) price chart
          </span>
          {isSynth && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>Simulated</span>}
        </div>

        {/* Range selector */}
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="flex gap-0.5">
            {(['1D','7D','1M','3M','1Y','MAX'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: range === r ? '#6366f1' : 'transparent', color: range === r ? '#fff' : '#6b7280', fontWeight: range === r ? 700 : 500 }}>
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {([['candle', '╥ CANDLE'], ['line', '↗ LINE']] as [ChartType, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setCT(t)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
                style={{ background: chartType === t ? '#6366f1' : 'transparent', color: chartType === t ? '#fff' : '#9ca3af' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="px-3 py-2 flex items-center gap-1" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          {(['5m','15m','1h','4h','1d'] as const).map(t => (
            <button key={t} onClick={() => setTf(t)} className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
              style={{ background: tf === t ? '#f3f4f6' : 'transparent', color: tf === t ? '#111827' : '#9ca3af', fontWeight: tf === t ? 700 : 400 }}>
              {t}
            </button>
          ))}
          <span className="ml-auto text-[9px]" style={{ color: '#9ca3af' }}>
            {chartLoading ? 'Loading…' : `${ohlcv.length} candles · ${isSynth ? 'Simulated' : 'Live'}`}
          </span>
        </div>

        {/* Chart */}
        <TVChart data={ohlcv} height={260} type={chartType} loading={chartLoading}/>
      </div>

      {/* ── External links ──────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-3">
        {token.pairAddress && (
          <a href={`https://www.geckoterminal.com/arc/pools/${token.pairAddress}`} target="_blank" rel="noopener"
            className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl no-underline font-semibold"
            style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.09)', color: '#374151' }}>
            <BarChart3 size={12} style={{ color: '#6366f1' }}/>GeckoTerminal
          </a>
        )}
        <a href={`https://dexscreener.com/arc/${token.pairAddress ?? token.address}`} target="_blank" rel="noopener"
          className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl no-underline font-semibold"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.09)', color: '#374151' }}>
          <Activity size={12} style={{ color: '#f59e0b' }}/>DexScreener
        </a>
        <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener"
          className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl no-underline font-semibold"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.09)', color: '#374151' }}>
          <ExternalLink size={12} style={{ color: '#6b7280' }}/>Explorer
        </a>
        {token.isGlowFun && (
          <Link to={`/token/${token.address}`} className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl no-underline font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: '1px solid #6366f1' }}>
            <Zap size={12}/>Trade on GlowFun
          </Link>
        )}
      </div>

      {/* ── Contract details ────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f9fafb' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9ca3af' }}>Contract Details</span>
        </div>
        {[
          { k: 'Token Contract', v: token.address,     copy: true },
          { k: 'Pair Contract',  v: token.pairAddress, copy: true },
          { k: 'DEX Protocol',   v: token.dexId || '—' },
          { k: 'Blockchain',     v: 'Arc Mainnet' },
          { k: 'Data Source',    v: token.source || 'DexScreener + GeckoTerminal' },
          { k: 'Change 5M',      v: pct(token.change5m) ?? '—' },
          { k: 'Change 1H',      v: pct(token.change1h) ?? '—' },
          { k: 'Change 6H',      v: pct(token.change6h) ?? '—' },
          { k: 'Change 24H',     v: pct(token.change24h) ?? '—' },
          { k: 'Buys 24H',       v: token.buys24h != null ? `${token.buys24h}` : '—' },
          { k: 'Sells 24H',      v: token.sells24h != null ? `${token.sells24h}` : '—' },
          { k: 'Buy/Sell Ratio', v: buyRatio != null ? `${(buyRatio*100).toFixed(0)}% / ${((1-buyRatio)*100).toFixed(0)}%` : '—' },
        ].filter(r => r.v && r.v !== 'undefined').map(({ k, v, copy }) => (
          <div key={k} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
            <span className="text-xs" style={{ color: '#6b7280' }}>{k}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: '#111827', fontFamily: typeof v === 'string' && v.startsWith('0x') ? 'monospace' : 'inherit' }}>
                {typeof v === 'string' && v.length > 22 ? formatAddress(v) : v}
              </span>
              {copy && v && v !== '—' && (
                <button onClick={() => navigator.clipboard.writeText(v as string)}>
                  <Copy size={10} style={{ color: '#9ca3af' }}/>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

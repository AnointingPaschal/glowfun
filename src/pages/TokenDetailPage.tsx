import { useState, useEffect, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ExternalLink, Copy, Check, BarChart3, Activity,
  Zap, ArrowUpRight, ArrowDownRight, Globe, Twitter, Send as TgIcon,
  Share2, Star, TrendingUp,
} from 'lucide-react'
import { CustomChart, CandleData } from '@/components/CustomChart'
import { EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'
import { Link } from 'react-router-dom'

/* ── Price formatter (subscript zeros) ──────────────────────────── */
function Price({ v, size = 'lg' }: { v: number; size?: 'lg'|'sm' }) {
  const cls = size === 'lg' ? 'text-2xl font-bold text-white' : 'text-sm font-semibold text-white'
  if (!v) return <span className={cls}>$0</span>
  if (v >= 0.01) return <span className={cls}>${v >= 100 ? v.toLocaleString('en',{maximumFractionDigits:2}) : v.toFixed(v>=1?4:6)}</span>
  const s = v.toFixed(20)
  const m = s.match(/^0\.(0+)([1-9]\d{0,4})/)
  if (m && m[1].length >= 3) return (
    <span className={cls} style={{ fontFamily:'Space Grotesk,monospace' }}>
      $0.0<sub style={{ fontSize:'0.55em', verticalAlign:'sub' }}>{m[1].length}</sub>{m[2]}
    </span>
  )
  return <span className={cls}>${v.toFixed(8)}</span>
}

const usd = (n?: number) => !n ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(2)}`
const gc  = (v?: number) => (v ?? 0) >= 0 ? '#22c55e' : '#ef4444'
const pct = (v?: number) => v == null ? null : `${v >= 0 ? '+' : ''}${Math.abs(v).toFixed(2)}%`
const age = (s?: number) => !s ? null : s < 3600 ? `${Math.floor(s/60)}m` : s < 86400 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m` : `${Math.floor(s/86400)}d`

interface Token {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source?: string; isGlowFun?: boolean
}

/* ── Client-side synthetic OHLCV ────────────────────────────────── */
function buildSynthetic(price: number, change24h: number, ageSec: number, tf: string): CandleData[] {
  if (!price) return []
  const n = 60
  const start = change24h !== 0 ? price / (1 + change24h / 100) : price * (0.5 + Math.random() * 0.4)
  const now = Math.floor(Date.now() / 1000)
  const interval = tf === '5m' ? 300 : tf === '15m' ? 900 : tf === '4h' ? 14400 : tf === '1d' ? 86400 : 3600
  let seed = Math.abs(Math.round(price * 1e9)) % 65535 || 7331
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - i - 1) * interval
    const prog = (i + 1) / n
    const base = start + (price - start) * Math.pow(prog, 0.7) * (1 + (rng() - 0.5) * 0.1)
    const noise = 0.025 + rng() * 0.055
    const dir = rng() > 0.42 ? 1 : -1
    const o = base * (1 + (rng() - 0.5) * noise * 0.5)
    const c = base * (1 + dir * noise * 0.35 * (0.5 + rng() * 0.5))
    const h = Math.max(o, c) * (1 + noise * 0.1 * rng())
    const l = Math.min(o, c) * (1 - noise * 0.07 * rng())
    return { time: t, open: Math.max(o,1e-30), high: Math.max(h,1e-30), low: Math.max(l,1e-30), close: Math.max(c,1e-30), volume: rng() * 8000 + 200 }
  })
}

async function fetchToken(address: string): Promise<Token | null> {
  try {
    const r = await fetch(`/api/market?q=${address}&limit=10`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return null
    const d = await r.json() as any
    const ts: Token[] = d.data?.tokens ?? []
    return ts.find(t => t.address.toLowerCase() === address.toLowerCase()) ?? ts[0] ?? null
  } catch { return null }
}

async function fetchGeckoOHLCV(pool: string, token: string, tf: string): Promise<CandleData[]> {
  try {
    const params = new URLSearchParams({ tf })
    if (pool)  params.set('pool',  pool)
    if (token) params.set('token', token)
    const r = await fetch(`/api/market/ohlcv?${params}`, { signal: AbortSignal.timeout(12_000) })
    if (!r.ok) return []
    const d = await r.json() as any
    return d.data ?? []
  } catch { return [] }
}

/* ── Change pill ─────────────────────────────────────────────────── */
function Pill({ label, value }: { label: string; value?: number }) {
  if (value == null) return null
  const c = gc(value)
  const p = pct(value)
  return (
    <div className="flex flex-col items-center px-2.5 py-1.5 rounded-xl flex-1"
      style={{ background: value >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${value >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
      <span className="text-[8px] uppercase tracking-widest font-medium mb-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{label}</span>
      <div className="flex items-center gap-0.5">
        {value >= 0 ? <ArrowUpRight size={9} style={{ color: c }}/> : <ArrowDownRight size={9} style={{ color: c }}/>}
        <span className="text-[11px] font-bold tabular-nums" style={{ color: c }}>{p}</span>
      </div>
    </div>
  )
}

/* ── Stat tile ───────────────────────────────────────────────────── */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col px-2.5 py-2 rounded-xl flex-1" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-[8px] uppercase tracking-widest font-medium mb-0.5" style={{ color:'rgba(255,255,255,0.35)' }}>{label}</span>
      <span className="text-[11px] font-bold text-white">{value}</span>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────────── */
export function TokenDetailPage() {
  const { address } = useParams<{ address: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  const [token, setToken] = useState<Token | null>((location.state as any)?.token ?? null)
  const [loadingToken, setLoadingToken] = useState(!token)
  const [ohlcv, setOhlcv] = useState<CandleData[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [tf, setTf] = useState<'5m'|'15m'|'1h'|'4h'|'1d'>('1h')
  const [tab, setTab] = useState<'chart'|'info'>('chart')
  const [copied, setCopied] = useState<string|null>(null)
  const [isSynth, setIsSynth] = useState(false)

  useEffect(() => {
    if (token || !address) return
    fetchToken(address).then(t => { setToken(t); setLoadingToken(false) })
  }, [address])

  // Always show a chart — try live data first, fall back to synthetic
  useEffect(() => {
    if (!token) return
    let alive = true
    setChartLoading(true)
    setOhlcv([])
    setIsSynth(false)

    ;(async () => {
      // 1. Try GeckoTerminal via API
      const live = await fetchGeckoOHLCV(token.pairAddress ?? '', token.address, tf)
      if (!alive) return

      if (live.length > 0) {
        setOhlcv(live)
        setIsSynth(false)
      } else {
        // 2. Generate synthetic client-side (always works)
        const synth = buildSynthetic(token.priceUsd, token.change24h ?? 0, token.age ?? 86400, tf)
        setOhlcv(synth)
        setIsSynth(true)
      }
      setChartLoading(false)
    })()

    return () => { alive = false }
  }, [token?.address, token?.pairAddress, tf])

  const copy = (s: string, key: string) => {
    navigator.clipboard.writeText(s)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const hue = parseInt((address ?? '0x000000').slice(2, 6), 16) % 360
  const buyRatio = (token?.buys24h ?? 0) + (token?.sells24h ?? 0) > 0
    ? (token!.buys24h! / (token!.buys24h! + token!.sells24h!))
    : null

  if (loadingToken) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(34,197,94,0.15)', borderTopColor:'#22c55e' }}/>
        <span className="text-xs" style={{ color:'rgba(255,255,255,0.35)' }}>Loading token…</span>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="text-center py-20">
        <p className="text-white mb-3 font-medium">Token not found</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm text-white" style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}>← Go back</button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">

      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}>
          <ArrowLeft size={14} style={{ color:'rgba(255,255,255,0.7)' }}/>
        </button>

        {token.logoUrl
          ? <img src={token.logoUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as any).style.display='none' }}/>
          : <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white" style={{ background:`linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},60%,40%))` }}>{token.symbol.slice(0,2)}</div>}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-sm">{token.symbol}</span>
            {token.dexId && <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.45)' }}>{token.dexId}</span>}
            {token.isGlowFun && <Link to={`/token/${token.address}`} className="no-underline text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background:'linear-gradient(135deg,#8b5cf6,#ec4899)', color:'white' }}>Trade</Link>}
          </div>
          <div className="text-[9px] truncate" style={{ color:'rgba(255,255,255,0.4)' }}>{token.name} · Arc</div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {age(token.age) && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background:'rgba(34,197,94,0.08)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.15)' }}>▼{age(token.age)}</span>}
          <a href={`https://dexscreener.com/arc/${token.pairAddress??token.address}`} target="_blank" rel="noopener">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.09)' }}>
              <ExternalLink size={12} style={{ color:'rgba(255,255,255,0.5)' }}/>
            </div>
          </a>
        </div>
      </div>

      {/* ── Price + stats ── */}
      <div className="rounded-2xl p-3 mb-2" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
        {/* Price row */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <Price v={token.priceUsd} size="lg"/>
            <div className="text-[9px] mt-0.5" style={{ color:'rgba(255,255,255,0.3)' }}>
              {token.priceUsd.toFixed(token.priceUsd < 0.001 ? 10 : 6)} USDC
            </div>
          </div>
          {/* MCap + Vol mini-tiles */}
          <div className="flex gap-1.5 text-right">
            <div className="px-2 py-1 rounded-xl" style={{ background:'rgba(255,255,255,0.05)' }}>
              <div className="text-[8px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>MCap</div>
              <div className="text-[11px] font-bold text-white">{usd(token.mcapUsd)}</div>
            </div>
            <div className="px-2 py-1 rounded-xl" style={{ background:'rgba(255,255,255,0.05)' }}>
              <div className="text-[8px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>Vol</div>
              <div className="text-[11px] font-bold text-white">{usd(token.volumeUsd)}</div>
            </div>
          </div>
        </div>

        {/* Change pills */}
        <div className="flex gap-1.5 mb-3">
          <Pill label="5M"  value={token.change5m}/>
          <Pill label="1H"  value={token.change1h}/>
          <Pill label="6H"  value={token.change6h}/>
          <Pill label="24H" value={token.change24h}/>
        </div>

        {/* Liq / FDV / Age row */}
        <div className="flex gap-1.5 mb-3">
          <Tile label="Liquidity" value={usd(token.liquidityUsd)}/>
          <Tile label="FDV"       value={usd(token.mcapUsd)}/>
          <Tile label="Age"       value={age(token.age) ?? '—'}/>
        </div>

        {/* Buy/sell bar */}
        {buyRatio !== null && (
          <div>
            <div className="flex justify-between text-[9px] mb-1">
              <span className="font-semibold" style={{ color:'#22c55e' }}>▲ {token.buys24h} buys</span>
              <span className="font-semibold" style={{ color:'#ef4444' }}>{token.sells24h} sells ▼</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div style={{ width:`${buyRatio*100}%`, background:'linear-gradient(90deg,#22c55e,#16a34a)' }}/>
              <div style={{ flex:1, background:'linear-gradient(90deg,#ef4444,#dc2626)' }}/>
            </div>
            <div className="flex justify-between mt-1 text-[8.5px]" style={{ color:'rgba(255,255,255,0.35)' }}>
              <span>Buy Vol {usd(token.volumeUsd ? token.volumeUsd*buyRatio : 0)}</span>
              <span>Sell Vol {usd(token.volumeUsd ? token.volumeUsd*(1-buyRatio) : 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Tab selector ── */}
      <div className="flex gap-1 p-1 rounded-xl mb-2" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
        {(['chart','info'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all"
            style={{ background:tab===t?'rgba(34,197,94,0.12)':'transparent', color:tab===t?'#22c55e':'rgba(255,255,255,0.4)', border:tab===t?'1px solid rgba(34,197,94,0.2)':'1px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Chart tab ── */}
      {tab === 'chart' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}>
          {/* Timeframe selector */}
          <div className="flex items-center gap-1 mb-2">
            {(['5m','15m','1h','4h','1d'] as const).map(t => (
              <button key={t} onClick={() => setTf(t)}
                className="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all"
                style={{ background:tf===t?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)', color:tf===t?'#22c55e':'rgba(255,255,255,0.4)', border:`1px solid ${tf===t?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.06)'}` }}>
                {t}
              </button>
            ))}
            <span className="ml-auto text-[8px]" style={{ color:'rgba(255,255,255,0.2)' }}>
              {chartLoading ? 'Loading…' : isSynth ? `Simulated · ${ohlcv.length}c` : `Live · ${ohlcv.length}c`}
            </span>
          </div>

          {/* Chart */}
          <div className="rounded-xl overflow-hidden mb-2">
            <CustomChart data={ohlcv} height={300} loading={chartLoading}/>
          </div>

          {/* Simulated notice */}
          {isSynth && !chartLoading && (
            <div className="text-[9px] text-center mb-2" style={{ color:'rgba(255,255,255,0.25)' }}>
              Chart simulated from price data · Live data not yet indexed on GeckoTerminal
            </div>
          )}

          {/* External links */}
          <div className="flex gap-2 flex-wrap">
            {token.pairAddress && (
              <a href={`https://www.geckoterminal.com/arc/pools/${token.pairAddress}`} target="_blank" rel="noopener"
                className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl no-underline"
                style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}>
                <BarChart3 size={9}/>GeckoTerminal
              </a>
            )}
            <a href={`https://dexscreener.com/arc/${token.pairAddress??token.address}`} target="_blank" rel="noopener"
              className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl no-underline"
              style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <Activity size={9}/>DexScreener
            </a>
            <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener"
              className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl no-underline"
              style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}>
              <ExternalLink size={9}/>Explorer
            </a>
          </div>
        </motion.div>
      )}

      {/* ── Info tab ── */}
      {tab === 'info' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          className="rounded-2xl overflow-hidden"
          style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          {[
            { k:'Token',     v: token.address,      c: true },
            { k:'Pair',      v: token.pairAddress,  c: !!token.pairAddress },
            { k:'DEX',       v: token.dexId || '—' },
            { k:'Network',   v: 'Arc Mainnet' },
            { k:'Source',    v: token.source || '—' },
            { k:'Age',       v: age(token.age) ?? '—' },
            { k:'Price',     v: `$${token.priceUsd}` },
            { k:'Market Cap',v: usd(token.mcapUsd) },
            { k:'24h Volume',v: usd(token.volumeUsd) },
            { k:'Liquidity', v: usd(token.liquidityUsd) },
            { k:'24h Buys',  v: token.buys24h != null ? `${token.buys24h}` : '—' },
            { k:'24h Sells', v: token.sells24h != null ? `${token.sells24h}` : '—' },
            { k:'1H',        v: pct(token.change1h) ?? '—' },
            { k:'6H',        v: pct(token.change6h) ?? '—' },
            { k:'24H',       v: pct(token.change24h) ?? '—' },
          ].filter(r => r.v && r.v !== 'undefined').map(({ k, v, c }) => (
            <div key={k} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0"
              style={{ borderColor:'rgba(255,255,255,0.05)' }}>
              <span className="text-[9px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.32)' }}>{k}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-white">
                  {typeof v === 'string' && v.length > 20 ? formatAddress(v) : v}
                </span>
                {c && (
                  <button onClick={() => copy(v as string, k)}>
                    {copied === k ? <Check size={9} style={{ color:'#22c55e' }}/> : <Copy size={9} style={{ color:'rgba(255,255,255,0.3)' }}/>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

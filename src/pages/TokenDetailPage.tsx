import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, Copy, Check, BarChart3, Activity, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { CustomChart, CandleData } from '@/components/CustomChart'
import { EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'

/* ── Subscript-zero price ────────────────────────────────────────── */
function Price({ v, size = 'lg' }: { v: number; size?: 'lg' | 'sm' }) {
  const cls = size === 'lg'
    ? 'text-[28px] font-bold text-white leading-none'
    : 'text-xs font-semibold text-white'
  if (!v) return <span className={cls}>$0</span>
  if (v >= 0.01) return <span className={cls}>${v >= 100 ? v.toLocaleString('en', { maximumFractionDigits: 2 }) : v.toFixed(v >= 1 ? 4 : 6)}</span>
  const s = v.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,4})/)
  if (m && m[1].length >= 3) return <span className={cls} style={{ fontFamily: 'Space Grotesk,monospace' }}>$0.0<sub style={{ fontSize: '0.58em', verticalAlign: 'sub' }}>{m[1].length}</sub>{m[2]}</span>
  return <span className={cls}>${v.toFixed(8)}</span>
}

const usd = (n?: number) => !n ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`
const gc = (v?: number) => (v ?? 0) >= 0 ? '#22c55e' : '#ef4444'
const pct = (v?: number) => v == null ? null : `${v >= 0 ? '+' : ''}${Math.abs(v).toFixed(2)}%`
const ageStr = (s?: number) => !s ? null : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 86400)}d`

interface Token {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source?: string; isGlowFun?: boolean
}

/* ── Synthetic OHLCV ─────────────────────────────────────────────── */
function makeSynthetic(price: number, change24h: number, ageSec: number, tf: string): CandleData[] {
  if (!price || price <= 0) return []
  const n = 60
  const start = Math.abs(change24h) > 0.5 ? price / (1 + change24h / 100) : price * 0.72
  const now = Math.floor(Date.now() / 1000)
  const interval = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[tf] ?? 3600
  let seed = (Math.abs(Math.round(price * 1e9)) ^ 0x5f3759df) % 65535 || 12345
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - i - 1) * interval
    const prog = (i + 1) / n
    const trend = start + (price - start) * Math.pow(prog, 0.75)
    const wave = Math.sin(prog * Math.PI * 3) * trend * 0.02
    const base = trend + wave + (rng() - 0.5) * trend * 0.04
    const ns = 0.02 + rng() * 0.05
    const dir = rng() > 0.43 ? 1 : -1
    const o = Math.max(base * (1 + (rng() - 0.5) * ns * 0.6), 1e-30)
    const c = Math.max(base * (1 + dir * ns * 0.4 * rng()), 1e-30)
    return { time: t, open: o, high: Math.max(o, c) * (1 + ns * 0.1 * rng()), low: Math.min(o, c) * (1 - ns * 0.07 * rng()), close: c, volume: (rng() * 6000 + 300) }
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

async function fetchLiveOHLCV(pool: string, token: string, tf: string): Promise<CandleData[]> {
  try {
    const p = new URLSearchParams({ tf })
    if (pool)  p.set('pool', pool)
    if (token) p.set('token', token)
    const r = await fetch(`/api/market/ohlcv?${p}`, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return []
    const d = await r.json() as any
    return (d.data ?? []).filter((c: any) => c.open > 0 && c.close > 0)
  } catch { return [] }
}

/* ── Pill ────────────────────────────────────────────────────────── */
function ChangePill({ label, v }: { label: string; v?: number }) {
  if (v == null) return null
  const color = gc(v)
  return (
    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl flex-1 min-w-0"
      style={{ background: v >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${v >= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}` }}>
      <span className="text-[8px] uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>{label}</span>
      <div className="flex items-center gap-0.5 mt-0.5">
        {v >= 0 ? <ArrowUpRight size={9} style={{ color }} /> : <ArrowDownRight size={9} style={{ color }} />}
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{pct(v)}</span>
      </div>
    </div>
  )
}

/* ── Stat tile ───────────────────────────────────────────────────── */
function Stat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex flex-col px-2 py-2 rounded-xl flex-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-[8px] uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.32)' }}>{label}</span>
      <span className="text-[11px] font-bold mt-0.5" style={{ color: green ? '#22c55e' : 'white' }}>{value}</span>
    </div>
  )
}

/* ── Info row ────────────────────────────────────────────────────── */
function InfoRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  const [cp, setCp] = useState(false)
  const doCopy = () => { if (!onCopy) return; navigator.clipboard.writeText(value); onCopy(); setCp(true); setTimeout(() => setCp(false), 1200) }
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.32)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-white">{value.length > 22 ? formatAddress(value) : value}</span>
        {onCopy && <button onClick={doCopy}>{cp ? <Check size={9} style={{ color: '#22c55e' }} /> : <Copy size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />}</button>}
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────────── */
export function TokenDetailPage() {
  const { address } = useParams<{ address: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  const [token, setToken] = useState<Token | null>((location.state as any)?.token ?? null)
  const [loading, setLoading] = useState(!token)
  const [ohlcv, setOhlcv] = useState<CandleData[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [tf, setTf] = useState<'5m' | '15m' | '1h' | '4h' | '1d'>('1h')
  const [isSynth, setIsSynth] = useState(false)

  useEffect(() => {
    if (token || !address) return
    fetchToken(address).then(t => { setToken(t); setLoading(false) })
  }, [address])

  // Chart — live first, synthetic always as fallback
  useEffect(() => {
    if (!token) return
    let alive = true
    setChartLoading(true); setOhlcv([]); setIsSynth(false)
    ;(async () => {
      const live = await fetchLiveOHLCV(token.pairAddress ?? '', token.address, tf)
      if (!alive) return
      if (live.length >= 5) {
        setOhlcv(live); setIsSynth(false)
      } else {
        const synth = makeSynthetic(token.priceUsd, token.change24h ?? 0, token.age ?? 86400, tf)
        setOhlcv(synth); setIsSynth(true)
      }
      setChartLoading(false)
    })()
    return () => { alive = false }
  }, [token?.address, token?.pairAddress, tf])

  const hue = parseInt((address ?? '0x000000').slice(2, 6), 16) % 360
  const buyRatio = (token?.buys24h ?? 0) + (token?.sells24h ?? 0) > 0
    ? token!.buys24h! / (token!.buys24h! + token!.sells24h!) : null

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-9 h-9 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(34,197,94,0.1)', borderTopColor: '#22c55e' }} />
    </div>
  )
  if (!token) return (
    <div className="text-center py-20">
      <p className="text-white mb-3">Token not found</p>
      <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm text-white" style={{ background: 'rgba(255,255,255,0.07)' }}>← Back</button>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <ArrowLeft size={14} style={{ color: 'rgba(255,255,255,0.7)' }} />
        </button>
        {token.logoUrl
          ? <img src={token.logoUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as any).style.display = 'none' }} />
          : <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white" style={{ background: `linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue + 120) % 360},60%,40%))` }}>{token.symbol.slice(0, 2)}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-white text-sm">{token.symbol}</span>
            {token.dexId && <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>{token.dexId}</span>}
            {token.isGlowFun && <Link to={`/token/${token.address}`} className="no-underline text-[8px] px-1.5 py-0.5 rounded font-bold text-white" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>⚡ Trade</Link>}
          </div>
          <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{token.name} · Arc{ageStr(token.age) ? ` · ▼${ageStr(token.age)}` : ''}</div>
        </div>
        <a href={`https://dexscreener.com/arc/${token.pairAddress ?? token.address}`} target="_blank" rel="noopener"
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <ExternalLink size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
        </a>
      </div>

      {/* Price card */}
      <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-start justify-between mb-2.5">
          <div>
            <Price v={token.priceUsd} size="lg" />
            <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{token.priceUsd.toFixed(Math.min(12, Math.max(4, -Math.floor(Math.log10(token.priceUsd)) + 3)))} USDC</div>
          </div>
          <div className="flex gap-1.5">
            <div className="px-2 py-1 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="text-[7px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>MCAP</div>
              <div className="text-[11px] font-bold text-white">{usd(token.mcapUsd)}</div>
            </div>
            <div className="px-2 py-1 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="text-[7px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>VOL</div>
              <div className="text-[11px] font-bold text-white">{usd(token.volumeUsd)}</div>
            </div>
          </div>
        </div>
        {/* Change pills */}
        <div className="flex gap-1 mb-2.5">
          <ChangePill label="5M" v={token.change5m} />
          <ChangePill label="1H" v={token.change1h} />
          <ChangePill label="6H" v={token.change6h} />
          <ChangePill label="24H" v={token.change24h} />
        </div>
        {/* Stat row */}
        <div className="flex gap-1.5 mb-2.5">
          <Stat label="Liquidity" value={usd(token.liquidityUsd)} />
          <Stat label="FDV" value={usd(token.mcapUsd)} />
          <Stat label="Age" value={ageStr(token.age) ?? '—'} />
        </div>
        {/* Buy/sell bar */}
        {buyRatio !== null && (
          <div>
            <div className="flex justify-between text-[9px] mb-1">
              <span className="font-semibold" style={{ color: '#22c55e' }}>▲ {token.buys24h} buys</span>
              <span className="font-semibold" style={{ color: '#ef4444' }}>{token.sells24h} sells ▼</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div style={{ width: `${buyRatio * 100}%`, background: 'linear-gradient(90deg,#22c55e,#16a34a)' }} />
              <div style={{ flex: 1, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }} />
            </div>
            <div className="flex justify-between mt-0.5 text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <span>Buy Vol {usd(token.volumeUsd ? token.volumeUsd * buyRatio : 0)}</span>
              <span>Sell Vol {usd(token.volumeUsd ? token.volumeUsd * (1 - buyRatio) : 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Timeframe + status */}
        <div className="flex items-center gap-1 px-3 pt-2.5 pb-2">
          {(['5m', '15m', '1h', '4h', '1d'] as const).map(t => (
            <button key={t} onClick={() => setTf(t)}
              className="px-2 py-1 rounded-lg text-[9px] font-bold transition-all"
              style={{ background: tf === t ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: tf === t ? '#22c55e' : 'rgba(255,255,255,0.4)', border: `1px solid ${tf === t ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              {t}
            </button>
          ))}
          <span className="ml-auto text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {chartLoading ? '…' : isSynth ? `Simulated · ${ohlcv.length}c` : `Live · ${ohlcv.length}c`}
          </span>
        </div>
        <CustomChart data={ohlcv} height={260} loading={chartLoading} />
        {isSynth && !chartLoading && (
          <div className="text-center py-1.5 text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Simulated chart · GeckoTerminal live data coming soon
          </div>
        )}
      </div>

      {/* External links */}
      <div className="flex gap-2 flex-wrap">
        {token.pairAddress && <a href={`https://www.geckoterminal.com/arc/pools/${token.pairAddress}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl no-underline" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}><BarChart3 size={9} />GeckoTerminal</a>}
        <a href={`https://dexscreener.com/arc/${token.pairAddress ?? token.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl no-underline" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}><Activity size={9} />DexScreener</a>
        <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-xl no-underline" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}><ExternalLink size={9} />Explorer</a>
      </div>

      {/* Token info (always visible, no tab) */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>Token Info</span>
        </div>
        {[
          { k: 'Token',     v: token.address,     c: true },
          { k: 'Pair',      v: token.pairAddress, c: !!token.pairAddress },
          { k: 'DEX',       v: token.dexId || '—' },
          { k: 'Source',    v: token.source || '—' },
          { k: 'Network',   v: 'Arc Mainnet' },
          { k: 'Age',       v: ageStr(token.age) ?? '—' },
          { k: 'Price',     v: `$${token.priceUsd}` },
          { k: 'Mkt Cap',   v: usd(token.mcapUsd) },
          { k: '24h Vol',   v: usd(token.volumeUsd) },
          { k: 'Liquidity', v: usd(token.liquidityUsd) },
          { k: '1H',        v: pct(token.change1h) ?? '—' },
          { k: '6H',        v: pct(token.change6h) ?? '—' },
          { k: '24H',       v: pct(token.change24h) ?? '—' },
          { k: '5M Buys',   v: token.buys24h != null ? `${token.buys24h}` : '—' },
          { k: '5M Sells',  v: token.sells24h != null ? `${token.sells24h}` : '—' },
        ].filter(r => r.v && r.v !== 'undefined' && r.v !== '—' || r.k === 'Network').map(({ k, v, c }) => (
          <InfoRow key={k} label={k} value={v as string} onCopy={c ? () => navigator.clipboard.writeText(v as string) : undefined} />
        ))}
      </div>
      <div className="h-4" />{/* bottom padding */}
    </div>
  )
}

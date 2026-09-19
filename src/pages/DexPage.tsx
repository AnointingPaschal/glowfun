import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, RefreshCw, ExternalLink, Twitter, Send as TgIcon, Globe,
  Zap, ArrowUpRight, ArrowDownRight, Copy, Check, BarChart3, Activity,
  ChevronUp, ChevronDown, Flame, Loader2, TrendingUp,
} from 'lucide-react'
import { CustomChart, CandleData } from '@/components/CustomChart'
import { useTokenList } from '@/hooks/useTokenList'
import { EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'

/* ── helpers ─────────────────────────────────────────────────────── */
// Compact subscript price: $0.0₃1345 for very small numbers
function PriceDisplay({ price, className = '' }: { price: number; className?: string }) {
  if (!price) return <span className={className}>$0</span>
  if (price >= 1000) return <span className={className}>${price.toLocaleString('en', { maximumFractionDigits: 2 })}</span>
  if (price >= 0.1)  return <span className={className}>${price.toFixed(4)}</span>
  if (price >= 0.01) return <span className={className}>${price.toFixed(5)}</span>
  // Subscript zero notation
  const s = price.toFixed(20)
  const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) {
    return (
      <span className={className}>
        $0.0<sub style={{ fontSize: '0.65em', fontFamily: 'inherit' }}>{m[1].length}</sub>{m[2]}
      </span>
    )
  }
  return <span className={className}>${price.toFixed(8)}</span>
}

const fmtC = (v: number) => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : v > 0 ? `$${v.toFixed(0)}` : '—'
const pctColor = (v?: number) => (v ?? 0) >= 0 ? '#22c55e' : '#ef4444'
const fmtPct = (v?: number) => v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtAge = (s?: number) => {
  if (!s) return ''
  if (s < 3600)  return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`
  return `${Math.floor(s/86400)}d`
}

interface Token {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source: string; isGlowFun?: boolean
}

/* ── fetch helpers ───────────────────────────────────────────────── */
async function fetchTokens(q = ''): Promise<{ tokens: Token[]; total: number }> {
  try {
    const params = new URLSearchParams({ limit: '500' })
    if (q) params.set('q', q)
    const r = await fetch(`/api/market?${params}`, { signal: AbortSignal.timeout(25_000) })
    if (!r.ok) return { tokens: [], total: 0 }
    const d = await r.json() as any
    return { tokens: d.data?.tokens ?? [], total: d.data?.total ?? 0 }
  } catch { return { tokens: [], total: 0 } }
}

async function fetchOHLCV(pool: string, tf: string): Promise<CandleData[]> {
  if (!pool) return []
  try {
    const r = await fetch(`/api/market/ohlcv?pool=${pool}&tf=${tf}`, { signal: AbortSignal.timeout(12_000) })
    if (!r.ok) return []
    const d = await r.json() as any
    return d.data ?? []
  } catch { return [] }
}

/* ── compact price badge ─────────────────────────────────────────── */
function PctBadge({ label, value }: { label: string; value?: number }) {
  if (value == null) return null
  return (
    <span className="flex items-center gap-0.5">
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{label}</span>
      <span style={{ color: pctColor(value), fontSize: 10, fontWeight: 600 }}>{fmtPct(value)}</span>
    </span>
  )
}

/* ── Token Detail Overlay ────────────────────────────────────────── */
function TokenDetail({ token, onClose }: { token: Token; onClose: () => void }) {
  const [tf, setTf]   = useState<'5m'|'15m'|'1h'|'4h'|'1d'>('1h')
  const [ohlcv, setO] = useState<CandleData[]>([])
  const [loading, setL] = useState(true)
  const [tab, setTab] = useState<'chart'|'info'>('chart')
  const [copied, setC] = useState(false)
  const hue = parseInt(token.address.slice(2, 6), 16) % 360

  useEffect(() => {
    let a = true; setL(true); setO([])
    fetchOHLCV(token.pairAddress ?? '', tf).then(d => { if (a) { setO(d); setL(false) } })
    return () => { a = false }
  }, [token.pairAddress, tf])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const copy = (s: string) => { navigator.clipboard.writeText(s); setC(true); setTimeout(() => setC(false), 1500) }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(16px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="w-full sm:max-w-2xl flex flex-col rounded-t-3xl sm:rounded-2xl"
          style={{ background: '#0c0c1a', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92dvh', boxShadow: '0 40px 80px rgba(0,0,0,0.8)' }}>

          {/* drag handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-0.5 flex-shrink-0">
            <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
          </div>

          {/* header */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {token.logoUrl
              ? <img src={token.logoUrl} className="w-9 h-9 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as any).style.display='none' }}/>
              : <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},65%,40%))` }}>
                  {token.symbol.slice(0,2)}
                </div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-white text-sm">{token.symbol}</span>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{token.name}</span>
                {token.isGlowFun && <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>GlowFun</span>}
                {token.dexId && <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{token.dexId}</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatAddress(token.address)}</span>
                <button onClick={() => copy(token.address)}>{copied ? <Check size={9} style={{ color: '#22c55e' }}/> : <Copy size={9} style={{ color: 'rgba(255,255,255,0.3)' }}/>}</button>
                <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener"><ExternalLink size={9} style={{ color: 'rgba(255,255,255,0.3)' }}/></a>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {token.isGlowFun && <Link to={`/token/${token.address}`} className="no-underline text-[10px] px-2.5 py-1.5 rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}><Zap size={10} className="inline mr-0.5"/>Trade</Link>}
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }}><X size={15}/></button>
            </div>
          </div>

          {/* price hero */}
          <div className="flex-shrink-0 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="text-2xl font-bold text-white" style={{ fontFamily: "Space Grotesk,sans-serif" }}><PriceDisplay price={token.priceUsd}/></span>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <PctBadge label="5M" value={token.change5m}/>
                  <PctBadge label="1H" value={token.change1h}/>
                  <PctBadge label="6H" value={token.change6h}/>
                  <PctBadge label="24H" value={token.change24h}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-right flex-shrink-0">
                {[
                  { k:'MCap', v: fmtC(token.mcapUsd ?? 0) },
                  { k:'Vol',  v: fmtC(token.volumeUsd ?? 0) },
                  { k:'Liq',  v: fmtC(token.liquidityUsd ?? 0) },
                  { k:'Age',  v: fmtAge(token.age) || '—' },
                ].map(s => (
                  <div key={s.k} className="px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.k}</div>
                    <div className="text-[10px] font-bold text-white">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {token.buys24h != null && (
              <div className="flex gap-2 mt-2">
                <div className="flex-1 px-2 py-1 rounded-lg text-center text-[9px]" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.1)', color: '#22c55e' }}>▲ {token.buys24h} buys</div>
                <div className="flex-1 px-2 py-1 rounded-lg text-center text-[9px]" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)', color: '#ef4444' }}>▼ {token.sells24h ?? 0} sells</div>
              </div>
            )}
          </div>

          {/* tabs */}
          <div className="flex-shrink-0 flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {(['chart', 'info'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className="capitalize px-5 py-2 text-xs font-semibold transition-all"
                style={{ borderBottom: tab===t?'2px solid #22c55e':'2px solid transparent', color: tab===t?'#22c55e':'rgba(255,255,255,0.4)', marginBottom: -1 }}>
                {t}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'chart' && (
              <div className="p-3">
                <div className="flex items-center gap-1 mb-2">
                  {(['5m','15m','1h','4h','1d'] as const).map(t => (
                    <button key={t} onClick={() => setTf(t)} className="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all"
                      style={{ background: tf===t?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)', color: tf===t?'#22c55e':'rgba(255,255,255,0.4)', border:`1px solid ${tf===t?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.05)'}` }}>
                      {t}
                    </button>
                  ))}
                  <span className="ml-auto text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {loading ? 'Loading…' : ohlcv.length ? `${ohlcv.length} candles` : 'No data'}
                  </span>
                </div>
                <CustomChart data={ohlcv} height={320} loading={loading}/>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[
                    { label:'GeckoTerminal', href: token.pairAddress ? `https://www.geckoterminal.com/arc/pools/${token.pairAddress}` : null },
                    { label:'DexScreener', href: `https://dexscreener.com/arc/${token.pairAddress ?? token.address}` },
                    { label:'Explorer', href: `${EXPLORER_BASE}/address/${token.address}` },
                  ].filter(l => l.href).map(l => (
                    <a key={l.label} href={l.href!} target="_blank" rel="noopener"
                      className="flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg no-underline"
                      style={{ background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.45)', border:'1px solid rgba(255,255,255,0.06)' }}>
                      <ExternalLink size={8}/>{l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {tab === 'info' && (
              <div className="p-4 space-y-1">
                {[
                  { k:'Token',   v: token.address,     copy: true },
                  { k:'Pair',    v: token.pairAddress,  copy: true },
                  { k:'DEX',     v: token.dexId || '—' },
                  { k:'Network', v: 'Arc Mainnet' },
                  { k:'Source',  v: token.source },
                  { k:'Age',     v: fmtAge(token.age) || '—' },
                ].filter(r => r.v).map(({ k, v, copy: hasCopy }) => (
                  <div key={k} className="flex items-center justify-between py-2 border-b" style={{ borderColor:'rgba(255,255,255,0.04)' }}>
                    <span className="text-[9px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>{k}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-white">{(v as string).length > 20 ? formatAddress(v as string) : v}</span>
                      {hasCopy && <button onClick={() => copy(v as string)}><Copy size={8} style={{ color:'rgba(255,255,255,0.3)' }}/></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Compact 2-line token row (DexScreener mobile style) ─────────── */
function TokenRow({ token, rank, onClick }: { token: Token; rank: number; onClick: () => void }) {
  const hue = parseInt(token.address.slice(2, 6), 16) % 360
  const age = fmtAge(token.age)

  return (
    <div onClick={onClick}
      className="flex flex-col px-3 py-2 border-b cursor-pointer active:bg-white/[0.02] transition-colors"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>

      {/* Row 1: Logo | Symbol+Age | Price | 5M | 24H */}
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="relative flex-shrink-0">
          {token.logoUrl
            ? <img src={token.logoUrl} className="w-8 h-8 rounded-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
            : <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: `linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},65%,40%))` }}>
                {token.symbol.slice(0,2)}
              </div>}
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
            style={{ background:'#0c0c1a', fontSize: 7 }}>
            {token.isGlowFun ? '⚡' : ''}
          </span>
        </div>

        {/* Symbol + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-white">{token.symbol}</span>
            {age && <span className="text-[9px] font-medium" style={{ color: '#22c55e' }}>▼{age}</span>}
            {token.isGlowFun && <span className="text-[7px] px-1 rounded" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>GLW</span>}
          </div>
          <div className="text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>{token.name}</div>
        </div>

        {/* Price + changes */}
        <div className="text-right flex-shrink-0">
          <PriceDisplay price={token.priceUsd} className="text-xs font-bold text-white tabular-nums"/>
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            {token.change5m != null && (
              <span className="text-[9px] font-medium" style={{ color: pctColor(token.change5m) }}>
                5M {fmtPct(token.change5m)}
              </span>
            )}
            <span className="text-[9px] font-bold" style={{ color: pctColor(token.change24h) }}>
              24H {token.change24h != null ? fmtPct(token.change24h) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: LIQ | VOL | MCAP badges */}
      <div className="flex items-center gap-1.5 mt-1 pl-10">
        {[
          { k: 'LIQ',  v: token.liquidityUsd },
          { k: 'VOL',  v: token.volumeUsd },
          { k: 'MCAP', v: token.mcapUsd },
        ].map(({ k, v }) => (
          <span key={k} className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)' }}>
            {k} <span className="text-white/80">{fmtC(v ?? 0)}</span>
          </span>
        ))}
        {token.buys24h != null && (
          <span className="text-[9px] ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <span style={{ color: '#22c55e' }}>{token.buys24h}B</span>/<span style={{ color: '#ef4444' }}>{token.sells24h ?? 0}S</span>
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Main Dex Page ───────────────────────────────────────────────── */
type SortKey = 'volume'|'mcap'|'change24h'|'change1h'|'liquidity'|'age'|'price'
type FilterKey = 'all'|'glowfun'|'new'|'trending'

export function TrendingPage() {
  const [tokens, setTokens]     = useState<Token[]>([])
  const [loading, setLoading]   = useState(true)
  const [total, setTotal]       = useState(0)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<FilterKey>('all')
  const [sort, setSort]         = useState<SortKey>('volume')
  const [sortDir, setSortDir]   = useState<'desc'|'asc'>('desc')
  const [selected, setSelected] = useState<Token | null>(null)
  const [refreshing, setRef]    = useState(false)

  const { addresses: glowAddrs } = useTokenList()

  const load = useCallback(async (q = '') => {
    setLoading(true)
    const { tokens: raw, total: tot } = await fetchTokens(q)
    setTokens(raw)
    setTotal(tot)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Tag GlowFun tokens whenever either tokens or glowAddrs updates
  useEffect(() => {
    if (!glowAddrs.length || !tokens.length) return
    const glowSet = new Set(glowAddrs.map(a => a.toLowerCase()))
    setTokens(prev => prev.map(t => ({ ...t, isGlowFun: glowSet.has(t.address.toLowerCase()) })))
  }, [glowAddrs.join(','), tokens.length])

  const refresh = async () => {
    setRef(true)
    await load(search)
    setRef(false)
  }

  useEffect(() => {
    const t = setTimeout(() => load(search.length > 1 || search === '' ? search : ''), 350)
    return () => clearTimeout(t)
  }, [search, load])

  const toggleSort = (k: SortKey) => {
    if (sort === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSort(k); setSortDir('desc') }
  }

  const displayed = useMemo(() => {
    let list = [...tokens]
    if (filter === 'glowfun')   list = list.filter(t => t.isGlowFun)
    else if (filter === 'new')  list = list.filter(t => (t.age ?? Infinity) < 86400)
    else if (filter === 'trending') list = [...list].sort((a,b) => ((b.buys24h??0)+(b.sells24h??0)) - ((a.buys24h??0)+(a.sells24h??0))).slice(0, 50)
    return list.sort((a,b) => {
      const va = { volume: a.volumeUsd??0, mcap: a.mcapUsd??0, change24h: a.change24h??0, change1h: a.change1h??0, liquidity: a.liquidityUsd??0, age: a.age??0, price: a.priceUsd }[sort] ?? 0
      const vb = { volume: b.volumeUsd??0, mcap: b.mcapUsd??0, change24h: b.change24h??0, change1h: b.change1h??0, liquidity: b.liquidityUsd??0, age: b.age??0, price: b.priceUsd }[sort] ?? 0
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [tokens, filter, sort, sortDir])

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)}
      className="flex items-center gap-0.5 text-[9px] font-semibold px-2 py-1 rounded-lg transition-all"
      style={{ background: sort===k?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.04)', color: sort===k?'#22c55e':'rgba(255,255,255,0.4)', border:`1px solid ${sort===k?'rgba(34,197,94,0.15)':'rgba(255,255,255,0.06)'}` }}>
      {label}{sort===k && (sortDir==='desc'?<ChevronDown size={8}/>:<ChevronUp size={8}/>)}
    </button>
  )

  return (
    <div>
      {/* Compact header — no big stats bar */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
            Dex Explorer <span style={{ background: 'linear-gradient(90deg,#22c55e,#16a34a)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Arc</span>
          </h1>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {loading ? <span className="flex items-center gap-1"><Loader2 size={9} className="animate-spin"/>Fetching tokens…</span> : `${total} tokens · DexScreener + GeckoTerminal`}
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing || loading}
          className="p-2 rounded-xl disabled:opacity-40"
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <RefreshCw size={13} className={refreshing || loading ? 'animate-spin' : ''} style={{ color:'rgba(255,255,255,0.5)' }}/>
        </button>
      </div>

      {/* Filter + search row */}
      <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
        <div className="flex gap-1 flex-shrink-0">
          {(['all','trending','new','glowfun'] as FilterKey[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold capitalize whitespace-nowrap transition-all"
              style={{ background:filter===f?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)', color:filter===f?'#22c55e':'rgba(255,255,255,0.45)', border:`1px solid ${filter===f?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.06)'}` }}>
              {f === 'new' ? 'New <24h' : f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-1 min-w-0"
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <Search size={11} style={{ color:'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="text-[10px] text-white bg-transparent outline-none w-full placeholder-white/20 min-w-0"/>
          {search && <button onClick={() => setSearch('')}><X size={10} style={{ color:'rgba(255,255,255,0.3)' }}/></button>}
        </div>
      </div>

      {/* Sort row */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-0.5 scrollbar-hide">
        <span className="text-[9px] flex-shrink-0" style={{ color:'rgba(255,255,255,0.25)' }}>Sort:</span>
        {(['volume','mcap','change24h','change1h','liquidity','age','price'] as SortKey[]).map(k => (
          <SortBtn key={k} k={k} label={k === 'change24h'?'24H%':k==='change1h'?'1H%':k==='volume'?'Vol':k==='mcap'?'MCap':k==='liquidity'?'Liq':k==='age'?'New':k==='price'?'Price':k}/>
        ))}
        <span className="ml-auto text-[9px] flex-shrink-0" style={{ color:'rgba(255,255,255,0.25)' }}>{displayed.length}</span>
      </div>

      {/* Token list */}
      <div className="rounded-xl overflow-hidden" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
        {loading && displayed.length === 0
          ? Array.from({length:12}).map((_,i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b animate-pulse" style={{ borderColor:'rgba(255,255,255,0.04)' }}>
                <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ background:'rgba(255,255,255,0.07)' }}/>
                <div className="flex-1 space-y-1.5">
                  <div className="flex gap-2"><div className="h-3 w-16 rounded" style={{ background:'rgba(255,255,255,0.09)' }}/><div className="h-2.5 w-12 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/></div>
                  <div className="flex gap-1"><div className="h-2.5 w-12 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/><div className="h-2.5 w-10 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/></div>
                </div>
                <div className="text-right space-y-1"><div className="h-3 w-14 rounded ml-auto" style={{ background:'rgba(255,255,255,0.09)' }}/><div className="h-2.5 w-16 rounded ml-auto" style={{ background:'rgba(255,255,255,0.05)' }}/></div>
              </div>
            ))
          : displayed.length === 0
            ? <div className="py-12 text-center"><p className="text-xs" style={{ color:'rgba(255,255,255,0.3)' }}>{search ? 'No matching tokens' : 'No tokens found'}</p></div>
            : displayed.map((t,i) => <TokenRow key={t.address} token={t} rank={i+1} onClick={() => setSelected(t)}/>)}
      </div>

      <AnimatePresence>
        {selected && <TokenDetail token={selected} onClose={() => setSelected(null)}/>}
      </AnimatePresence>
    </div>
  )
}

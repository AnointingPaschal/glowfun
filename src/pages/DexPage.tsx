import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, RefreshCw, ExternalLink, Twitter, Send as TgIcon, Globe,
  Zap, ArrowUpRight, ArrowDownRight, Copy, Check, BarChart3, Activity,
  Layers, DollarSign, TrendingUp, Droplets, Clock, ChevronUp, ChevronDown,
  Flame, Star, Loader2,
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { CustomChart, CandleData } from '@/components/CustomChart'
import { useTokenList } from '@/hooks/useTokenList'
import { EXPLORER_BASE, CHAIN_ID } from '@/constants'
import { formatAddress, timeAgo } from '@/utils/format'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

/* ── Types ─────────────────────────────────────────────────────────── */
interface ArcToken {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number
  change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source: string
  isGlowFun?: boolean
}

/* ── helpers ────────────────────────────────────────────────────────── */
const fmtP = (p: number) => {
  if (!p) return '$0'
  if (p >= 1000) return `$${p.toLocaleString('en', { maximumFractionDigits: 2 })}`
  if (p >= 1)    return `$${p.toFixed(4)}`
  if (p >= 0.001) return `$${p.toFixed(6)}`
  return `$${p.toExponential(3)}`
}
const fmtUsd = (v?: number) => {
  if (!v) return '—'
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}
const pctColor = (v?: number) => (v ?? 0) >= 0 ? '#26a69a' : '#ef5350'
const fmtPct = (v?: number) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtAge = (s?: number) => {
  if (!s) return '—'
  if (s < 60)    return `${s}s`
  if (s < 3600)  return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`
  return `${Math.floor(s/86400)}d`
}

/* ── Fetch helpers ──────────────────────────────────────────────────── */
async function fetchTokens(q = '', page = 1): Promise<{ tokens: ArcToken[]; total: number }> {
  try {
    const params = new URLSearchParams({ limit: '200', page: String(page) })
    if (q) params.set('q', q)
    const r = await fetch(`/api/market?${params}`, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return { tokens: [], total: 0 }
    const d = await r.json() as any
    if (!d.success) return { tokens: [], total: 0 }
    return { tokens: d.data?.tokens ?? [], total: d.data?.total ?? 0 }
  } catch { return { tokens: [], total: 0 } }
}

async function fetchOHLCV(pairAddress: string, tf: string): Promise<CandleData[]> {
  if (!pairAddress) return []
  try {
    const r = await fetch(`/api/market/ohlcv?pool=${pairAddress}&tf=${tf}`, { signal: AbortSignal.timeout(12_000) })
    if (!r.ok) return []
    const d = await r.json() as any
    return d.data ?? []
  } catch { return [] }
}

/* ── Token Detail Overlay ───────────────────────────────────────────── */
function TokenDetail({ token, onClose }: { token: ArcToken; onClose: () => void }) {
  const [tf, setTf]     = useState<'5m'|'15m'|'1h'|'4h'|'1d'>('1h')
  const [ohlcv, setO]   = useState<CandleData[]>([])
  const [loading, setL] = useState(true)
  const [tab, setTab]   = useState<'chart'|'info'|'trades'>('chart')
  const [copied, setC]  = useState(false)

  const hue = parseInt(token.address.slice(2, 6), 16) % 360

  useEffect(() => {
    let a = true
    setL(true); setO([])
    fetchOHLCV(token.pairAddress ?? '', tf).then(d => {
      if (a) { setO(d); setL(false) }
    })
    return () => { a = false }
  }, [token.pairAddress, tf])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const copy = (s: string) => { navigator.clipboard.writeText(s); setC(true); setTimeout(() => setC(false), 1500) }
  const TFS: ('5m'|'15m'|'1h'|'4h'|'1d')[] = ['5m', '15m', '1h', '4h', '1d']

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <motion.div
          initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="w-full sm:max-w-4xl rounded-t-3xl sm:rounded-2xl flex flex-col"
          style={{ background: '#0c0c1a', border: '1px solid rgba(255,255,255,0.07)', maxHeight: '94dvh', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>

          {/* drag handle */}
          <div className="flex justify-center pt-2 pb-0 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3">
              {token.logoUrl
                ? <img src={token.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: `linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},65%,40%))` }}>
                    {token.symbol.slice(0, 2)}
                  </div>}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{token.symbol}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{token.name}</span>
                  {token.isGlowFun && <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>GlowFun</span>}
                  {token.dexId && <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{token.dexId}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatAddress(token.address)}</span>
                  <button onClick={() => copy(token.address)} style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {copied ? <Check size={10} style={{ color: '#26a69a' }}/> : <Copy size={10}/>}
                  </button>
                  <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener">
                    <ExternalLink size={10} style={{ color: 'rgba(255,255,255,0.3)' }}/>
                  </a>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {token.isGlowFun && (
                <Link to={`/token/${token.address}`} className="no-underline text-[10px] px-3 py-1.5 rounded-xl font-bold text-white flex items-center gap-1"
                  style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                  <Zap size={10}/>Trade
                </Link>
              )}
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }}><X size={16}/></button>
            </div>
          </div>

          {/* Price hero */}
          <div className="flex-shrink-0 px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk,sans-serif', letterSpacing: '-0.02em' }}>{fmtP(token.priceUsd)}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {([['5m', token.change5m], ['1h', token.change1h], ['6h', token.change6h], ['24h', token.change24h]] as [string, number|undefined][])
                    .filter(([,v]) => v != null)
                    .map(([label, v]) => (
                    <span key={label} className="text-[11px] px-2 py-0.5 rounded-lg font-semibold flex items-center gap-0.5"
                      style={{ background: (v??0)>=0?'rgba(38,166,154,0.1)':'rgba(239,83,80,0.1)', color: pctColor(v) }}>
                      {(v??0)>=0?<ArrowUpRight size={10}/>:<ArrowDownRight size={10}/>}{label} {fmtPct(v)}
                    </span>
                  ))}
                </div>
              </div>
              {/* Stat grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label:'Mkt Cap',   val: fmtUsd(token.mcapUsd),     icon: <DollarSign size={9}/> },
                  { label:'24h Vol',   val: fmtUsd(token.volumeUsd),   icon: <BarChart3 size={9}/> },
                  { label:'Liquidity', val: fmtUsd(token.liquidityUsd),icon: <Droplets size={9}/> },
                  { label:'Buys 24h', val: token.buys24h != null ? String(token.buys24h) : '—', icon: <ArrowUpRight size={9}/> },
                  { label:'Sells 24h',val: token.sells24h != null ? String(token.sells24h) : '—',icon: <ArrowDownRight size={9}/> },
                  { label:'Age',       val: fmtAge(token.age),          icon: <Clock size={9}/> },
                ].map(s => (
                  <div key={s.label} className="px-2.5 py-2 rounded-xl text-right" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center justify-end gap-0.5 text-[8px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.28)' }}>{s.icon}{s.label}</div>
                    <div className="text-xs font-bold text-white">{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {(['chart','info','trades'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="capitalize px-5 py-2.5 text-xs font-semibold transition-all"
                style={{ borderBottom: tab===t?'2px solid #26a69a':'2px solid transparent', color: tab===t?'#26a69a':'rgba(255,255,255,0.4)', marginBottom:-1 }}>
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'chart' && (
              <div className="p-3">
                <div className="flex items-center gap-1 mb-3">
                  {TFS.map(t => (
                    <button key={t} onClick={() => setTf(t)}
                      className="px-3 py-1 rounded-lg text-[10px] font-bold transition-all"
                      style={{ background: tf===t?'rgba(38,166,154,0.15)':'rgba(255,255,255,0.04)', color: tf===t?'#26a69a':'rgba(255,255,255,0.4)', border:`1px solid ${tf===t?'rgba(38,166,154,0.2)':'rgba(255,255,255,0.06)'}` }}>
                      {t}
                    </button>
                  ))}
                  <span className="ml-auto text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {loading ? 'Loading…' : ohlcv.length ? `${ohlcv.length} candles · GeckoTerminal` : 'No chart data'}
                  </span>
                </div>
                <CustomChart data={ohlcv} height={360} loading={loading} />
                <div className="flex gap-2 mt-3 flex-wrap">
                  {token.pairAddress && (
                    <a href={`https://www.geckoterminal.com/arc/pools/${token.pairAddress}`} target="_blank" rel="noopener"
                      className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg no-underline"
                      style={{ background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.06)' }}>
                      <BarChart3 size={10}/>GeckoTerminal
                    </a>
                  )}
                  <a href={`https://dexscreener.com/arc/${token.pairAddress ?? token.address}`} target="_blank" rel="noopener"
                    className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg no-underline"
                    style={{ background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <Activity size={10}/>DexScreener
                  </a>
                  <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener"
                    className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg no-underline"
                    style={{ background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <ExternalLink size={10}/>Explorer
                  </a>
                </div>
              </div>
            )}

            {tab === 'info' && (
              <div className="p-4 space-y-4">
                <Section title="Contract">
                  {[
                    { k:'Token',    v: token.address,     copy: true },
                    { k:'Pair',     v: token.pairAddress, copy: true },
                    { k:'DEX',      v: token.dexId || '—' },
                    { k:'Source',   v: token.source },
                    { k:'Network',  v: `Arc Mainnet (${CHAIN_ID})` },
                    { k:'Age',      v: fmtAge(token.age) },
                  ].filter(r => r.v).map(({ k, v, copy: hasCopy }) => (
                    <InfoRow key={k} label={k} value={(v ?? '').length > 20 ? formatAddress(v!) : v!} onCopy={hasCopy ? () => copy(v!) : undefined}/>
                  ))}
                </Section>
                <Section title="Market">
                  {[
                    { k:'Price',     v: fmtP(token.priceUsd) },
                    { k:'Mkt Cap',   v: fmtUsd(token.mcapUsd) },
                    { k:'24h Volume',v: fmtUsd(token.volumeUsd) },
                    { k:'Liquidity', v: fmtUsd(token.liquidityUsd) },
                    { k:'24h Buys',  v: token.buys24h != null ? String(token.buys24h) : '—' },
                    { k:'24h Sells', v: token.sells24h != null ? String(token.sells24h) : '—' },
                  ].map(({ k, v }) => <InfoRow key={k} label={k} value={v}/>)}
                </Section>
              </div>
            )}

            {tab === 'trades' && (
              <div className="p-4 text-center py-12">
                <Activity size={28} className="mx-auto mb-3" style={{ color:'rgba(255,255,255,0.12)'}}/>
                <p className="text-sm font-semibold text-white mb-1">Live Transaction Feed</p>
                <p className="text-xs mb-5" style={{ color:'rgba(255,255,255,0.4)'}}>View all on-chain transactions on Arc Explorer or DexScreener</p>
                <div className="flex justify-center gap-3 flex-wrap">
                  <a href={`${EXPLORER_BASE}/token/${token.address}`} target="_blank" rel="noopener"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold no-underline text-white"
                    style={{ background:'linear-gradient(135deg,#26a69a,#1a8a80)' }}>
                    <ExternalLink size={13}/>Arc Explorer
                  </a>
                  <a href={`https://dexscreener.com/arc/${token.pairAddress ?? token.address}`} target="_blank" rel="noopener"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm no-underline"
                    style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.08)'}}>
                    <BarChart3 size={13}/>DexScreener
                  </a>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color:'rgba(255,255,255,0.28)' }}>{title}</div>
      {children}
    </div>
  )
}
function InfoRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor:'rgba(255,255,255,0.04)' }}>
      <span className="text-[10px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-white">{value}</span>
        {onCopy && <button onClick={onCopy} style={{ color:'rgba(255,255,255,0.3)' }}><Copy size={9}/></button>}
      </div>
    </div>
  )
}

/* ── Token row ──────────────────────────────────────────────────────── */
function TokenRow({ token, rank, onClick }: { token: ArcToken; rank: number; onClick: () => void }) {
  const hue = parseInt(token.address.slice(2, 6), 16) % 360
  const c24 = token.change24h
  return (
    <motion.tr initial={{ opacity:0 }} animate={{ opacity:1 }}
      onClick={onClick} className="cursor-pointer border-b group transition-all"
      style={{ borderColor:'rgba(255,255,255,0.04)' }} whileHover={{ backgroundColor:'rgba(255,255,255,0.025)' }}>
      <td className="px-3 py-3 text-center w-10">
        <span className="text-xs tabular-nums" style={{ color:'rgba(255,255,255,0.2)' }}>#{rank}</span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          {token.logoUrl
            ? <img src={token.logoUrl} alt={token.symbol} className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
            : <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                style={{ background:`linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},65%,40%))` }}>
                {token.symbol.slice(0,2)}
              </div>}
          <div>
            <div className="text-sm font-semibold text-white group-hover:text-[#26a69a] transition-colors">{token.symbol}</div>
            <div className="text-[10px] truncate max-w-[100px]" style={{ color:'rgba(255,255,255,0.4)' }}>{token.name}</div>
          </div>
          {token.isGlowFun && <span className="text-[8px] px-1 py-0.5 rounded ml-1" style={{ background:'rgba(139,92,246,0.12)', color:'#a78bfa' }}>GLW</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-xs font-mono font-semibold text-white tabular-nums">{fmtP(token.priceUsd)}</span>
      </td>
      <td className="px-3 py-3 text-right hidden lg:table-cell">
        <span className="text-xs tabular-nums font-medium" style={{ color: pctColor(token.change1h) }}>{fmtPct(token.change1h)}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-0.5 text-xs font-semibold tabular-nums" style={{ color: pctColor(c24) }}>
          {(c24??0)>=0?<ArrowUpRight size={10}/>:<ArrowDownRight size={10}/>}{fmtPct(c24)}
        </div>
      </td>
      <td className="px-3 py-3 text-right hidden sm:table-cell">
        <span className="text-xs tabular-nums" style={{ color:'rgba(255,255,255,0.65)' }}>{fmtUsd(token.volumeUsd)}</span>
      </td>
      <td className="px-3 py-3 text-right hidden md:table-cell">
        <span className="text-xs tabular-nums" style={{ color:'rgba(255,255,255,0.65)' }}>{fmtUsd(token.mcapUsd)}</span>
      </td>
      <td className="px-3 py-3 text-right hidden lg:table-cell">
        <span className="text-xs tabular-nums" style={{ color:'rgba(255,255,255,0.45)' }}>{fmtUsd(token.liquidityUsd)}</span>
      </td>
      <td className="px-3 py-3 text-right hidden sm:table-cell">
        <span className="text-[10px]" style={{ color:'rgba(255,255,255,0.35)' }}>{fmtAge(token.age)}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-[10px] font-semibold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
          style={{ background:'rgba(38,166,154,0.1)', color:'#26a69a', border:'1px solid rgba(38,166,154,0.18)' }}>Chart →</span>
      </td>
    </motion.tr>
  )
}

/* ── Main page ──────────────────────────────────────────────────────── */
type SortKey = 'price'|'change24h'|'change1h'|'volume'|'mcap'|'liquidity'|'age'
type FilterKey = 'all'|'glowfun'|'new'|'trending'

export function TrendingPage() {
  const [tokens, setTokens]       = useState<ArcToken[]>([])
  const [loading, setLoading]     = useState(true)
  const [total, setTotal]         = useState(0)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState<FilterKey>('all')
  const [sort, setSort]           = useState<SortKey>('volume')
  const [sortDir, setSortDir]     = useState<'desc'|'asc'>('desc')
  const [selected, setSelected]   = useState<ArcToken | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { addresses: glowAddrs } = useTokenList()

  const load = useCallback(async (q = '') => {
    setLoading(true)
    const { tokens: raw, total: tot } = await fetchTokens(q)
    // Tag GlowFun tokens
    const glowSet = new Set(glowAddrs.map(a => a.toLowerCase()))
    const tagged = raw.map(t => ({ ...t, isGlowFun: glowSet.has(t.address.toLowerCase()) }))
    setTokens(tagged)
    setTotal(tot)
    setLoading(false)
  }, [glowAddrs])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true)
    await load(search)
    setRefreshing(false)
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { if (search.length > 1 || search === '') load(search) }, 400)
    return () => clearTimeout(t)
  }, [search, load])

  const toggleSort = (k: SortKey) => {
    if (sort === k) setSortDir(d => d==='desc'?'asc':'desc')
    else { setSort(k); setSortDir('desc') }
  }

  const displayed = useMemo(() => {
    let list = [...tokens]

    if (filter === 'glowfun') list = list.filter(t => t.isGlowFun)
    else if (filter === 'new') list = list.filter(t => (t.age ?? Infinity) < 86400)
    else if (filter === 'trending') list = list.sort((a, b) => ((b.buys24h ?? 0) + (b.sells24h ?? 0)) - ((a.buys24h ?? 0) + (a.sells24h ?? 0))).slice(0, 50)

    return list.sort((a, b) => {
      let va = 0, vb = 0
      if (sort === 'price')    { va = a.priceUsd;        vb = b.priceUsd }
      if (sort === 'change24h'){ va = a.change24h ?? 0;  vb = b.change24h ?? 0 }
      if (sort === 'change1h') { va = a.change1h ?? 0;   vb = b.change1h ?? 0 }
      if (sort === 'volume')   { va = a.volumeUsd ?? 0;  vb = b.volumeUsd ?? 0 }
      if (sort === 'mcap')     { va = a.mcapUsd ?? 0;    vb = b.mcapUsd ?? 0 }
      if (sort === 'liquidity'){ va = a.liquidityUsd ?? 0; vb = b.liquidityUsd ?? 0 }
      if (sort === 'age')      { va = a.age ?? 0;        vb = b.age ?? 0 }
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [tokens, filter, sort, sortDir])

  const totalVol  = tokens.reduce((s, t) => s + (t.volumeUsd  ?? 0), 0)
  const totalMcap = tokens.reduce((s, t) => s + (t.mcapUsd    ?? 0), 0)
  const glowCount = tokens.filter(t => t.isGlowFun).length

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)}
      className="flex items-center gap-0.5 text-[9px] uppercase tracking-widest font-bold transition-colors"
      style={{ color: sort===k ? '#26a69a' : 'rgba(255,255,255,0.3)' }}>
      {label}
      {sort===k && (sortDir==='desc' ? <ChevronDown size={9}/> : <ChevronUp size={9}/>)}
    </button>
  )

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }}/>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>Live · Arc Mainnet</span>
        </div>
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily:'Space Grotesk,sans-serif', letterSpacing:'-0.03em' }}>
              Dex <span style={{ background: SPECTRAL, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Explorer</span>
            </h1>
            <p className="text-sm mt-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>All {total} tokens on Arc · DexScreener + GeckoTerminal · live data</p>
          </div>
          <button onClick={refresh} disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40 transition-all"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.6)' }}>
            <RefreshCw size={12} className={refreshing || loading ? 'animate-spin' : ''}/>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </motion.div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label:'Total Tokens', val: String(total),      icon: Layers,     color:'#a78bfa' },
          { label:'Total MCap',   val: fmtUsd(totalMcap), icon: DollarSign, color:'#60a5fa' },
          { label:'24h Volume',   val: fmtUsd(totalVol),  icon: BarChart3,  color:'#26a69a' },
          { label:'GlowFun',      val: String(glowCount), icon: Zap,        color:'#ec4899' },
        ].map(s => (
          <GlassCard key={s.label} className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:`${s.color}15` }}>
              <s.icon size={14} style={{ color:s.color }}/>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>{s.label}</div>
              <div className="text-sm font-bold text-white" style={{ fontFamily:'Space Grotesk,sans-serif' }}>
                {loading && s.val === '0' ? <Loader2 size={12} className="animate-spin inline" style={{ color:'rgba(255,255,255,0.3)' }}/> : s.val}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
          {([['all','All'],['trending','Trending'],['new','New <24h'],['glowfun','GlowFun']] as [FilterKey,string][]).map(([id,label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background:filter===id?'rgba(38,166,154,0.12)':'transparent', color:filter===id?'#26a69a':'rgba(255,255,255,0.4)', border:filter===id?'1px solid rgba(38,166,154,0.18)':'1px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl min-w-0" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', maxWidth:300 }}>
          <Search size={13} style={{ color:'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, symbol, address…"
            className="text-xs text-white bg-transparent outline-none w-full placeholder-white/20"/>
          {search && <button onClick={() => setSearch('')}><X size={11} style={{ color:'rgba(255,255,255,0.3)' }}/></button>}
        </div>
        <span className="text-xs ml-auto" style={{ color:'rgba(255,255,255,0.25)' }}>{displayed.length} shown</span>
      </div>

      {/* Table */}
      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                <th className="px-3 py-2.5 text-center w-10"><span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color:'rgba(255,255,255,0.25)' }}>#</span></th>
                <th className="px-3 py-2.5 text-left"><span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color:'rgba(255,255,255,0.25)' }}>Token</span></th>
                <th className="px-3 py-2.5 text-right"><SortBtn k="price" label="Price"/></th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell"><SortBtn k="change1h" label="1h"/></th>
                <th className="px-3 py-2.5 text-right"><SortBtn k="change24h" label="24h"/></th>
                <th className="px-3 py-2.5 text-right hidden sm:table-cell"><SortBtn k="volume" label="Volume"/></th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell"><SortBtn k="mcap" label="MCap"/></th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell"><SortBtn k="liquidity" label="Liq"/></th>
                <th className="px-3 py-2.5 text-right hidden sm:table-cell"><SortBtn k="age" label="Age"/></th>
                <th className="px-3 py-2.5"/>
              </tr>
            </thead>
            <tbody>
              {loading && displayed.length === 0
                ? Array.from({length:10}).map((_,i) => (
                    <tr key={i} className="animate-pulse border-b" style={{ borderColor:'rgba(255,255,255,0.03)' }}>
                      <td className="px-3 py-3"><div className="w-5 h-3 rounded mx-auto" style={{ background:'rgba(255,255,255,0.06)' }}/></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full" style={{ background:'rgba(255,255,255,0.07)' }}/><div><div className="w-16 h-3 rounded mb-1" style={{ background:'rgba(255,255,255,0.09)' }}/><div className="w-10 h-2 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/></div></div></td>
                      {[...Array(8)].map((_,j)=><td key={j} className="px-3 py-3"><div className="h-3 w-12 rounded ml-auto" style={{ background:'rgba(255,255,255,0.05)' }}/></td>)}
                    </tr>
                  ))
                : displayed.length === 0
                  ? <tr><td colSpan={10} className="py-16 text-center">
                      <Layers size={24} className="mx-auto mb-2" style={{ color:'rgba(255,255,255,0.1)' }}/>
                      <p className="text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>{search ? 'No tokens match your search' : 'No tokens found'}</p>
                    </td></tr>
                  : displayed.map((t, i) => <TokenRow key={t.address} token={t} rank={i+1} onClick={() => setSelected(t)}/>)}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <AnimatePresence>
        {selected && <TokenDetail token={selected} onClose={() => setSelected(null)}/>}
      </AnimatePresence>
    </div>
  )
}

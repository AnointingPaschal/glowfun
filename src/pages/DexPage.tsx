import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, X, RefreshCw, ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown, Loader2, Layers } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'

const LS_KEY = 'glowfun:dex:v3'
const LS_TTL = 10 * 60 * 1000 // 10 min

/* ── helpers ─────────────────────────────────────────────────────── */
function PriceDisplay({ price }: { price: number }) {
  if (!price) return <span>$0</span>
  if (price >= 0.01) return <span>${price >= 100 ? price.toLocaleString('en', { maximumFractionDigits: 2 }) : price.toFixed(price >= 1 ? 4 : 6)}</span>
  const s = price.toFixed(20)
  const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{ fontSize: '0.65em' }}>{m[1].length}</sub>{m[2]}</span>
  return <span>${price.toFixed(8)}</span>
}

const fmtC = (v?: number) => !v ? '—' : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v.toFixed(0)}`
const pctColor = (v?: number) => (v ?? 0) >= 0 ? '#22c55e' : '#ef4444'
const fmtPct = (v?: number) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtAge = (s?: number) => !s ? '' : s < 3600 ? `${Math.floor(s/60)}m` : s < 86400 ? `${Math.floor(s/3600)}h` : `${Math.floor(s/86400)}d`

export interface Token {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source: string; isGlowFun?: boolean
}

function loadLocalCache(): { tokens: Token[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (Date.now() - d.ts > LS_TTL) return null
    return d
  } catch { return null }
}

function saveLocalCache(tokens: Token[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ tokens, ts: Date.now() })) } catch {}
}

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

/* ── Token row ───────────────────────────────────────────────────── */
function TokenRow({ token, rank, onClick }: { token: Token; rank: number; onClick: () => void }) {
  const hue = parseInt(token.address.slice(2, 6), 16) % 360
  const age = fmtAge(token.age)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClick}
      className="flex flex-col px-3 py-2.5 border-b cursor-pointer transition-colors active:bg-white/[0.03]"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>

      {/* Row 1 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          {token.logoUrl
            ? <img src={token.logoUrl} className="w-9 h-9 rounded-full object-cover" onError={e => { (e.target as any).style.display='none' }}/>
            : <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: `linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},65%,40%))` }}>
                {token.symbol.slice(0,2)}
              </div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white leading-tight">{token.symbol}</span>
            {age && <span className="text-[9px]" style={{ color: '#22c55e' }}>▼{age}</span>}
            {token.isGlowFun && <span className="text-[7px] px-1 rounded font-bold" style={{ background:'rgba(139,92,246,0.15)', color:'#a78bfa' }}>GLW</span>}
          </div>
          <div className="text-[9px] truncate leading-tight" style={{ color:'rgba(255,255,255,0.36)' }}>{token.name}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[11px] font-bold text-white tabular-nums leading-tight"><PriceDisplay price={token.priceUsd}/></div>
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            {token.change5m != null && <span className="text-[9px] font-medium" style={{ color: pctColor(token.change5m) }}>5M {fmtPct(token.change5m)}</span>}
            <span className="text-[9px] font-bold" style={{ color: pctColor(token.change24h) }}>24H {fmtPct(token.change24h)}</span>
          </div>
        </div>
      </div>

      {/* Row 2 — badges */}
      <div className="flex items-center gap-1 mt-1 pl-11">
        {[{ k:'LIQ', v:token.liquidityUsd }, { k:'VOL', v:token.volumeUsd }, { k:'MCAP', v:token.mcapUsd }].map(({ k, v }) => (
          <span key={k} className="text-[8.5px] px-1.5 py-0.5 rounded-md"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.5)' }}>
            {k} <span className="text-white/80">{fmtC(v)}</span>
          </span>
        ))}
        {token.buys24h != null && (
          <span className="text-[8.5px] ml-auto">
            <span style={{ color:'#22c55e' }}>{token.buys24h}B</span>/<span style={{ color:'#ef4444' }}>{token.sells24h??0}S</span>
          </span>
        )}
      </div>
    </motion.div>
  )
}

/* ── Main Dex Page ───────────────────────────────────────────────── */
type SortKey = 'volume'|'mcap'|'change24h'|'change1h'|'liquidity'|'age'|'price'
type FilterKey = 'all'|'glowfun'|'new'|'trending'

export function TrendingPage() {
  const navigate = useNavigate()
  const { addresses: glowAddrs } = useTokenList()

  // ── State — seed from localStorage so nothing clears on refresh ──
  const cached = loadLocalCache()
  const [tokens, setTokens]   = useState<Token[]>(cached?.tokens ?? [])
  const [total, setTotal]     = useState(cached?.tokens.length ?? 0)
  const [loading, setLoading] = useState(!cached)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<FilterKey>('all')
  const [sort, setSort]       = useState<SortKey>('volume')
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc')
  const [refreshing, setRef]  = useState(false)

  const load = useCallback(async (q = '', silent = false) => {
    if (!silent) setLoading(true)
    const { tokens: raw, total: tot } = await fetchTokens(q)
    if (raw.length) {
      setTokens(raw)
      setTotal(tot)
      if (!q) saveLocalCache(raw) // cache full list
    }
    setLoading(false)
  }, [])

  // Initial load — if we have cache show it immediately, still refresh in bg
  useEffect(() => {
    if (cached) load('', true)  // silent refresh (don't show spinner)
    else        load()
  }, [])

  // Tag GlowFun tokens whenever either updates
  useEffect(() => {
    if (!glowAddrs.length) return
    const glowSet = new Set(glowAddrs.map(a => a.toLowerCase()))
    setTokens(prev => prev.map(t => ({ ...t, isGlowFun: glowSet.has(t.address.toLowerCase()) })))
  }, [glowAddrs.join(',')])

  const refresh = async () => {
    setRef(true)
    await load(search)
    setRef(false)
  }

  useEffect(() => {
    const t = setTimeout(() => load(search.length >= 2 || search === '' ? search : ''), 350)
    return () => clearTimeout(t)
  }, [search, load])

  const toggleSort = (k: SortKey) => {
    if (sort === k) setSortDir(d => d==='desc'?'asc':'desc')
    else { setSort(k); setSortDir('desc') }
  }

  const displayed = useMemo(() => {
    let list = [...tokens]
    if (filter === 'glowfun')   list = list.filter(t => t.isGlowFun)
    else if (filter === 'new')  list = list.filter(t => (t.age??Infinity) < 86400)
    else if (filter === 'trending') list = [...list].sort((a,b) => ((b.buys24h??0)+(b.sells24h??0))-((a.buys24h??0)+(a.sells24h??0))).slice(0,50)
    return list.sort((a,b) => {
      const va = ({volume:a.volumeUsd??0,mcap:a.mcapUsd??0,change24h:a.change24h??0,change1h:a.change1h??0,liquidity:a.liquidityUsd??0,age:a.age??0,price:a.priceUsd})[sort]??0
      const vb = ({volume:b.volumeUsd??0,mcap:b.mcapUsd??0,change24h:b.change24h??0,change1h:b.change1h??0,liquidity:b.liquidityUsd??0,age:b.age??0,price:b.priceUsd})[sort]??0
      return sortDir==='desc' ? vb-va : va-vb
    })
  }, [tokens, filter, sort, sortDir])

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-0.5 text-[9px] font-semibold px-2 py-1 rounded-lg transition-all flex-shrink-0"
      style={{ background:sort===k?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.04)', color:sort===k?'#22c55e':'rgba(255,255,255,0.4)', border:`1px solid ${sort===k?'rgba(34,197,94,0.15)':'rgba(255,255,255,0.06)'}` }}>
      {label}{sort===k&&(sortDir==='desc'?<ChevronDown size={8}/>:<ChevronUp size={8}/>)}
    </button>
  )

  return (
    <div>
      {/* Compact header */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h1 className="text-lg font-bold text-white" style={{ fontFamily:'Space Grotesk,sans-serif' }}>
            Dex <span style={{ background:'linear-gradient(90deg,#22c55e,#16a34a)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Arc</span>
          </h1>
          <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.3)' }}>
            {loading && !tokens.length
              ? <span className="flex items-center gap-1"><Loader2 size={9} className="animate-spin"/>Fetching…</span>
              : `${total} tokens · DexScreener + GeckoTerminal`}
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="p-2 rounded-xl disabled:opacity-40"
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <RefreshCw size={13} className={refreshing?'animate-spin':''} style={{ color:'rgba(255,255,255,0.5)' }}/>
        </button>
      </div>

      {/* Filter + search */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
        {(['all','trending','new','glowfun'] as FilterKey[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold capitalize whitespace-nowrap transition-all flex-shrink-0"
            style={{ background:filter===f?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)', color:filter===f?'#22c55e':'rgba(255,255,255,0.45)', border:`1px solid ${filter===f?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.06)'}` }}>
            {f==='new'?'New <24h':f}
          </button>
        ))}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-1 min-w-0 ml-1"
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <Search size={11} style={{ color:'rgba(255,255,255,0.3)', flexShrink:0 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="text-[10px] text-white bg-transparent outline-none w-full placeholder-white/20 min-w-0"/>
          {search && <button onClick={() => setSearch('')}><X size={10} style={{ color:'rgba(255,255,255,0.3)' }}/></button>}
        </div>
      </div>

      {/* Sort row */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
        <span className="text-[9px] flex-shrink-0" style={{ color:'rgba(255,255,255,0.25)' }}>Sort:</span>
        <SortBtn k="volume" label="Vol"/>
        <SortBtn k="mcap" label="MCap"/>
        <SortBtn k="change24h" label="24H%"/>
        <SortBtn k="change1h" label="1H%"/>
        <SortBtn k="liquidity" label="Liq"/>
        <SortBtn k="age" label="New"/>
        <SortBtn k="price" label="Price"/>
        <span className="ml-auto text-[9px] flex-shrink-0 pl-1" style={{ color:'rgba(255,255,255,0.2)' }}>{displayed.length}</span>
      </div>

      {/* Token list */}
      <div className="rounded-xl overflow-hidden" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
        {loading && !tokens.length
          ? Array.from({length:12}).map((_,i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b animate-pulse" style={{ borderColor:'rgba(255,255,255,0.04)' }}>
                <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background:'rgba(255,255,255,0.07)' }}/>
                <div className="flex-1 space-y-1.5">
                  <div className="flex gap-2"><div className="h-3 w-16 rounded" style={{ background:'rgba(255,255,255,0.09)' }}/><div className="h-2 w-8 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/></div>
                  <div className="flex gap-1"><div className="h-2 w-12 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/><div className="h-2 w-10 rounded" style={{ background:'rgba(255,255,255,0.05)' }}/></div>
                </div>
                <div className="text-right space-y-1.5"><div className="h-3 w-14 rounded ml-auto" style={{ background:'rgba(255,255,255,0.09)' }}/><div className="h-2 w-16 rounded ml-auto" style={{ background:'rgba(255,255,255,0.05)' }}/></div>
              </div>
            ))
          : displayed.length === 0
            ? <div className="py-12 text-center"><p className="text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>{search ? 'No matching tokens' : 'No tokens found'}</p></div>
            : displayed.map((t,i) => (
                <TokenRow key={t.address} token={t} rank={i+1}
                  onClick={() => navigate(`/dex/${t.address}`, { state: { token: t } })}/>
              ))}
        {/* Background refresh indicator */}
        {loading && tokens.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-[9px]" style={{ color:'rgba(255,255,255,0.25)' }}>
            <Loader2 size={9} className="animate-spin"/>Refreshing…
          </div>
        )}
      </div>
    </div>
  )
}

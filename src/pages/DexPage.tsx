import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, RefreshCw, ArrowUpRight, ArrowDownRight, Loader2, Zap, ChevronDown, BarChart3, Globe, Filter } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'

/* ── Chain & DEX config ─────────────────────────────────────────── */
const CHAINS = [
  { id: 'arc',       name: 'Arc',        emoji: '🅰',  color: '#6366f1' },
  { id: 'ethereum',  name: 'Ethereum',   emoji: '💎',  color: '#627eea' },
  { id: 'solana',    name: 'Solana',     emoji: '◎',   color: '#9945ff' },
  { id: 'bsc',       name: 'BSC',        emoji: '🟡',  color: '#f0b90b' },
  { id: 'base',      name: 'Base',       emoji: '🔵',  color: '#0052ff' },
  { id: 'polygon',   name: 'Polygon',    emoji: '🟣',  color: '#8247e5' },
  { id: 'avalanche', name: 'Avalanche',  emoji: '🔺',  color: '#e84142' },
  { id: 'arbitrum',  name: 'Arbitrum',   emoji: '🔷',  color: '#28a0f0' },
  { id: 'all',       name: 'All Chains', emoji: '🌐',  color: '#374151' },
]

const LS_KEY = 'glowfun:dex:v6'
const LS_TTL = 15 * 60 * 1000

/* ── Types ──────────────────────────────────────────────────────── */
export interface Token {
  address:string; name:string; symbol:string; logoUrl:string; chain:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liquidityUsd?:number; volumeUsd?:number; mcapUsd?:number
  age?:number; buys24h?:number; sells24h?:number; txns5m?:number; vol5m?:number
  pairAddress?:string; dexId?:string; source:string; isGlowFun?:boolean
}

type Tab    = 'trending'|'new'|'top'
type Sorter = 'volume'|'mcap'|'change24h'|'change1h'|'liquidity'|'age'|'price'

/* ── LocalStorage cache ─────────────────────────────────────────── */
function loadCache(chain: string, tab: string): Token[] | null {
  try {
    const raw = localStorage.getItem(`${LS_KEY}:${chain}:${tab}`)
    if (!raw) return null
    const d = JSON.parse(raw)
    return Date.now() - d.ts < LS_TTL ? d.tokens : null
  } catch { return null }
}
function saveCache(chain: string, tab: string, tokens: Token[]) {
  try { localStorage.setItem(`${LS_KEY}:${chain}:${tab}`, JSON.stringify({ tokens, ts: Date.now() })) } catch {}
}

/* ── Fetch ──────────────────────────────────────────────────────── */
async function fetchTokens(chain: string, tab: string, q = ''): Promise<{ tokens: Token[]; total: number; stats: any }> {
  try {
    const p = new URLSearchParams({ chain, tab, limit: '500' })
    if (q) p.set('q', q)
    const r = await fetch(`/api/market?${p}`, { signal: AbortSignal.timeout(30_000) })
    if (!r.ok) return { tokens: [], total: 0, stats: {} }
    const d = await r.json() as any
    return { tokens: d.data?.tokens ?? [], total: d.data?.total ?? 0, stats: d.data?.stats ?? {} }
  } catch { return { tokens: [], total: 0, stats: {} } }
}

/* ── Formatting helpers ─────────────────────────────────────────── */
function Px({ p }: { p: number }) {
  if (!p) return <span>$0</span>
  if (p >= 0.01) return <span>${p >= 100 ? p.toLocaleString('en', { maximumFractionDigits: 2 }) : p.toFixed(p >= 1 ? 4 : 6)}</span>
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{ fontSize: '0.6em' }}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
}
const fC  = (v?: number) => !v ? '—' : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v.toFixed(0)}`
const pC  = (v?: number) => (v ?? 0) >= 0 ? '#16a34a' : '#dc2626'
const fP  = (v?: number) => v == null ? '' : `${v >= 0 ? '+' : ''}${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toFixed(2)}%`
const fA  = (s?: number) => !s ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)}m` : s < 86400 ? `${Math.floor(s/3600)}h` : `${Math.floor(s/86400)}d`

/* ── Chain badge ───────────────────────────────────────────────── */
function ChainBadge({ chain }: { chain: string }) {
  const cfg = CHAINS.find(c => c.id === chain.toLowerCase()) ?? { emoji: '?', color: '#9ca3af', name: chain }
  return (
    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] flex-shrink-0"
      style={{ background: cfg.color, boxShadow: `0 0 0 1.5px white` }}>
      {cfg.emoji === '🅰' ? 'A' : cfg.emoji === '💎' ? 'Ξ' : cfg.emoji === '◎' ? '◎' : cfg.emoji === '🟡' ? 'B' : cfg.emoji[0] ?? '?'}
    </div>
  )
}

/* ── Token row (DexScreener style) ─────────────────────────────── */
function TokenRow({ token, onClick }: { token: Token; onClick: () => void }) {
  const hue = parseInt((token.address ?? '0x000000').slice(2, 6), 16) % 360
  const c24 = token.change24h; const c5m = token.change5m
  const txnScore = token.txns5m ? Math.min(999, token.txns5m) : null
  const age = fA(token.age)
  const chainCfg = CHAINS.find(c => c.id === (token.chain ?? 'arc').toLowerCase())

  return (
    <div onClick={onClick}
      className="flex flex-col px-3 py-2 border-b cursor-pointer transition-colors active:bg-gray-50"
      style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
      {/* Row 1 */}
      <div className="flex items-center gap-2">
        {/* Chain + DEX badge stack */}
        <div className="relative flex-shrink-0 w-9 h-9">
          {token.logoUrl
            ? <img src={token.logoUrl} className="w-9 h-9 rounded-full object-cover border" style={{ borderColor: 'rgba(0,0,0,0.07)' }}
                onError={e => { (e.target as any).style.display = 'none' }}/>
            : <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: `linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))` }}>
                {token.symbol.slice(0, 2)}
              </div>}
          {/* Chain indicator bottom-right */}
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[1.5px] border-white flex items-center justify-center text-[6px] font-bold text-white"
            style={{ background: chainCfg?.color ?? '#6b7280', fontSize: 7 }}>
            {chainCfg?.id === 'arc' ? 'A' : chainCfg?.id === 'ethereum' ? 'Ξ' : chainCfg?.id === 'solana' ? '◎' : chainCfg?.id === 'bsc' ? 'B' : (chainCfg?.name[0] ?? '?')}
          </div>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold leading-tight" style={{ color: '#111827' }}>{token.symbol}</span>
            {age && <span className="text-[9px] font-medium" style={{ color: '#16a34a' }}>▼{age}</span>}
            {txnScore != null && (
              <span className="text-[8px] font-bold px-1 rounded flex items-center gap-0.5" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>
                ⚡{txnScore}
              </span>
            )}
            {token.isGlowFun && <span className="text-[7px] px-1 rounded font-bold" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>GLW</span>}
          </div>
          <div className="text-[9px] truncate max-w-[120px]" style={{ color: '#9ca3af' }}>{token.name}</div>
        </div>

        {/* Price + changes */}
        <div className="text-right flex-shrink-0">
          <div className="text-[12px] font-bold leading-tight tabular-nums" style={{ color: '#111827' }}><Px p={token.priceUsd}/></div>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            {c5m != null && <span className="text-[9px] font-semibold" style={{ color: pC(c5m) }}>5M {fP(c5m)}</span>}
            <span className="text-[10px] font-bold" style={{ color: pC(c24) }}>24H {fP(c24)}</span>
          </div>
        </div>
      </div>

      {/* Row 2 — DEX icon + name + badges */}
      <div className="flex items-center gap-1.5 mt-0.5 pl-11">
        {/* DEX label with pink meme icon style */}
        <span className="text-[8.5px]" style={{ color: '#9ca3af' }}>
          {token.dexId ?? token.source}
        </span>
        <span style={{ color: '#d1d5db' }}>·</span>
        {[{ k: 'LIQ', v: token.liquidityUsd }, { k: 'VOL', v: token.volumeUsd }, { k: 'MCAP', v: token.mcapUsd }].map(({ k, v }) => (
          <span key={k} className="text-[8.5px]" style={{ color: '#6b7280' }}>
            {k} <span style={{ color: '#374151', fontWeight: 600 }}>{fC(v)}</span>
          </span>
        ))}
        {token.buys24h != null && (
          <span className="text-[8px] ml-auto">
            <span style={{ color: '#16a34a' }}>{token.buys24h}B</span>/<span style={{ color: '#dc2626' }}>{token.sells24h ?? 0}S</span>
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Chain selector bottom sheet ───────────────────────────────── */
function ChainSheet({ selected, onSelect, onClose }: { selected: string; onSelect: (id: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const filtered = CHAINS.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="w-full rounded-t-3xl overflow-hidden" style={{ background: '#fff', maxHeight: '85dvh' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background: '#e5e7eb' }}/></div>
        <div className="px-4 pb-2">
          <h3 className="text-base font-bold mb-3" style={{ color: '#111827' }}>Select Chain</h3>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4" style={{ background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.07)' }}>
            <Search size={13} style={{ color: '#9ca3af' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chains…"
              className="text-sm bg-transparent outline-none flex-1" style={{ color: '#111827' }}/>
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto pb-4" style={{ maxHeight: '55vh' }}>
            {filtered.map(chain => (
              <button key={chain.id} onClick={() => { onSelect(chain.id); onClose() }}
                className="flex items-center gap-3 p-4 rounded-2xl transition-all text-left"
                style={{ background: selected === chain.id ? `${chain.color}10` : '#f9fafb', border: `1.5px solid ${selected === chain.id ? chain.color : 'rgba(0,0,0,0.07)'}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: `${chain.color}15` }}>
                  {chain.emoji === '🅰' ? '🅰' : chain.emoji}
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: selected === chain.id ? chain.color : '#111827' }}>{chain.name}</div>
                  {selected === chain.id && <div className="text-[9px] font-semibold" style={{ color: chain.color }}>Selected ✓</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── DEX filter bottom sheet ────────────────────────────────────── */
function DexSheet({ dexes, selected, onSelect, onClose }: { dexes: string[]; selected: string; onSelect: (d: string) => void; onClose: () => void }) {
  const DEX_ICONS: Record<string, string> = { uniswap: '🦄', aero: '🔴', synthra: '⚡', dyorswap: '📦', arctide: '😢', sushiswap: '🍣', flap: '🦋', dropswap: '🔴', raydium: '⚡', orca: '🐋', pancakeswap: '🥞', quickswap: '⚡', traderjoe: '👨', balancer: '⚖', curve: '🔵' }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="w-full rounded-t-3xl overflow-hidden" style={{ background: '#fff', maxHeight: '70dvh' }}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background: '#e5e7eb' }}/></div>
        <div className="px-4 pb-4">
          <h3 className="text-base font-bold mb-3" style={{ color: '#111827' }}>Select DEX</h3>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto" style={{ maxHeight: '55vh' }}>
            <button onClick={() => { onSelect('all'); onClose() }}
              className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ background: selected === 'all' ? 'rgba(99,102,241,0.08)' : '#f9fafb', border: `1.5px solid ${selected === 'all' ? '#6366f1' : 'rgba(0,0,0,0.07)'}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(99,102,241,0.1)' }}>↔</div>
              <span className="text-sm font-bold" style={{ color: selected === 'all' ? '#6366f1' : '#111827' }}>All DEXes</span>
            </button>
            {dexes.map(dex => (
              <button key={dex} onClick={() => { onSelect(dex); onClose() }}
                className="flex items-center gap-3 p-4 rounded-2xl"
                style={{ background: selected === dex ? 'rgba(99,102,241,0.08)' : '#f9fafb', border: `1.5px solid ${selected === dex ? '#6366f1' : 'rgba(0,0,0,0.07)'}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: '#f3f4f6' }}>
                  {DEX_ICONS[dex.toLowerCase()] ?? '🔄'}
                </div>
                <span className="text-sm font-bold capitalize" style={{ color: selected === dex ? '#6366f1' : '#111827' }}>{dex}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */
export function TrendingPage() {
  const navigate = useNavigate()
  const { addresses: glowAddrs } = useTokenList()

  const [chain, setChain]         = useState('arc')
  const [tab, setTab]             = useState<Tab>('trending')
  const [tokens, setTokens]       = useState<Token[]>(() => loadCache('arc', 'trending') ?? [])
  const [total, setTotal]         = useState(0)
  const [stats, setStats]         = useState<any>({})
  const [loading, setLoading]     = useState(!loadCache('arc', 'trending'))
  const [silentRef, setSR]        = useState(false)
  const [search, setSearch]       = useState('')
  const [dexFilter, setDexF]      = useState('all')
  const [showChainSheet, setCS]   = useState(false)
  const [showDexSheet, setDS]     = useState(false)

  const chainCfg = CHAINS.find(c => c.id === chain) ?? CHAINS[0]

  const load = useCallback(async (ch: string, t: string, q = '', silent = false) => {
    silent ? setSR(true) : setLoading(true)
    const { tokens: raw, total: tot, stats: st } = await fetchTokens(ch, t, q)
    if (raw.length) {
      const glowSet = new Set(glowAddrs.map(a => a.toLowerCase()))
      const tagged = raw.map(tk => ({ ...tk, isGlowFun: glowSet.has(tk.address.toLowerCase()) }))
      setTokens(tagged); setTotal(tot); setStats(st)
      if (!q) saveCache(ch, t, tagged)
    }
    setLoading(false); setSR(false)
  }, [glowAddrs.join(',')])

  // On chain or tab change
  useEffect(() => {
    const cached = loadCache(chain, tab)
    if (cached) { setTokens(cached); setLoading(false); load(chain, tab, '', true) }
    else load(chain, tab)
  }, [chain, tab])

  // Re-tag glowfun whenever glowAddrs loads
  useEffect(() => {
    if (!glowAddrs.length) return
    const s = new Set(glowAddrs.map(a => a.toLowerCase()))
    setTokens(p => p.map(t => ({ ...t, isGlowFun: s.has(t.address.toLowerCase()) })))
  }, [glowAddrs.join(',')])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { if (search.length >= 2 || search === '') load(chain, tab, search.length >= 2 ? search : '', silentRef) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const dexes = useMemo(() => {
    const m = new Map<string, number>()
    tokens.forEach(t => { if (t.dexId) m.set(t.dexId, (m.get(t.dexId) ?? 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d]) => d)
  }, [tokens.length])

  const displayed = useMemo(() => {
    let list = dexFilter !== 'all' ? tokens.filter(t => t.dexId === dexFilter) : [...tokens]
    return list
  }, [tokens, dexFilter])

  // Stats values
  const vol5mDisp = fC(stats.vol5m || displayed.reduce((s, t) => s + (t.vol5m ?? 0), 0))
  const txnsDisp  = (stats.txns || displayed.reduce((s, t) => s + (t.txns5m ?? 0), 0)).toLocaleString()

  const TAB_STYLES = { trending: { icon: '🔥', label: 'Trending', color: '#6366f1' }, new: { icon: '🌱', label: 'New', color: '#16a34a' }, top: { icon: '📊', label: 'Top', color: '#f59e0b' } }

  return (
    <div>
      {/* ── Tab bar (Trending / New / Top) ──────────────────── */}
      <div className="flex items-center gap-1.5 mb-3">
        {(['trending', 'new', 'top'] as Tab[]).map(t => {
          const cfg = TAB_STYLES[t]; const active = tab === t
          return (
            <button key={t} onClick={() => { setTab(t); setDexF('all') }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: active ? cfg.color : '#fff', color: active ? '#fff' : '#6b7280', border: active ? `1.5px solid ${cfg.color}` : '1.5px solid rgba(0,0,0,0.08)', boxShadow: active ? `0 2px 8px ${cfg.color}30` : 'none' }}>
              <span>{cfg.icon}</span>{cfg.label}
              {t === 'trending' && <span className="text-[8px] opacity-70">5M</span>}
            </button>
          )
        })}
        <button onClick={() => load(chain, tab, search, false)} className="ml-auto p-2 rounded-xl flex-shrink-0 transition-all"
          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
          <RefreshCw size={13} className={loading || silentRef ? 'animate-spin' : ''} style={{ color: '#6b7280' }}/>
        </button>
      </div>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          { label: '5M VOLUME', value: vol5mDisp },
          { label: '5M TXNS',   value: txnsDisp },
          { label: 'TOKENS',    value: String(total || displayed.length) },
        ].map(s => (
          <div key={s.label} className="px-2 py-2 rounded-xl text-center" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}>
            <div className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#9ca3af' }}>{s.label}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: '#111827', fontFamily: 'Space Grotesk,sans-serif' }}>
              {loading && !tokens.length ? <Loader2 size={12} className="animate-spin inline" style={{ color: '#9ca3af' }}/> : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chain selector + DEX filter + search ─────────────── */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
        {/* Chain button */}
        <button onClick={() => setCS(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
          style={{ background: chainCfg.color, color: '#fff', border: `1.5px solid ${chainCfg.color}`, boxShadow: `0 2px 8px ${chainCfg.color}30` }}>
          <span className="text-sm">{chainCfg.id === 'arc' ? '🅰' : chainCfg.emoji}</span>
          {chainCfg.name}
          <ChevronDown size={10}/>
        </button>
        {/* DEX filter button */}
        <button onClick={() => setDS(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
          style={{ background: dexFilter !== 'all' ? '#f3f4f6' : '#fff', color: '#374151', border: '1.5px solid rgba(0,0,0,0.09)' }}>
          <Filter size={10}/>
          {dexFilter === 'all' ? 'All DEXes' : dexFilter}
          <ChevronDown size={10}/>
        </button>
        {/* Search */}
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-xl min-w-0" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
          <Search size={11} style={{ color: '#9ca3af', flexShrink: 0 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="text-[11px] bg-transparent outline-none w-full min-w-0" style={{ color: '#111827' }}/>
          {search && <button onClick={() => setSearch('')}><X size={10} style={{ color: '#9ca3af' }}/></button>}
        </div>
        {/* Token count */}
        <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: '#9ca3af' }}>{displayed.length}</span>
      </div>

      {/* ── Token list ───────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        {loading && !tokens.length
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b animate-pulse" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: '#f3f4f6' }}/>
                <div className="flex-1 space-y-1.5">
                  <div className="flex gap-2"><div className="h-3 w-16 rounded" style={{ background: '#e5e7eb' }}/><div className="h-2 w-8 rounded" style={{ background: '#f3f4f6' }}/></div>
                  <div className="flex gap-1"><div className="h-2 w-12 rounded" style={{ background: '#f3f4f6' }}/><div className="h-2 w-10 rounded" style={{ background: '#f3f4f6' }}/></div>
                </div>
                <div className="space-y-1.5 text-right"><div className="h-3 w-14 rounded ml-auto" style={{ background: '#e5e7eb' }}/><div className="h-2 w-16 rounded ml-auto" style={{ background: '#f3f4f6' }}/></div>
              </div>
            ))
          : displayed.length === 0
            ? <div className="py-12 text-center"><p className="text-sm font-medium" style={{ color: '#9ca3af' }}>{search ? 'No matching tokens' : 'No tokens found'}</p></div>
            : displayed.map((t, i) => (
                <TokenRow key={`${t.chain}:${t.address}:${i}`} token={t}
                  onClick={() => navigate(`/dex/${t.address}`, { state: { token: t } })}/>
              ))}
        {silentRef && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-[9px]" style={{ color: '#9ca3af' }}>
            <Loader2 size={9} className="animate-spin"/>Refreshing…
          </div>
        )}
      </div>

      {/* ── Bottom sheets ────────────────────────────────────── */}
      <AnimatePresence>
        {showChainSheet && <ChainSheet selected={chain} onSelect={c => { setChain(c); setDexF('all') }} onClose={() => setCS(false)}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showDexSheet && <DexSheet dexes={dexes} selected={dexFilter} onSelect={setDexF} onClose={() => setDS(false)}/>}
      </AnimatePresence>
    </div>
  )
}

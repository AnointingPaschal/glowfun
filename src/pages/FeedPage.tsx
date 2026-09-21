import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Sprout, Trophy, Search, X, Rocket, Zap, TrendingUp, Users, DollarSign } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'
import { TokenCard } from '@/components/TokenCard'
import { prefetchAllMarketData } from '@/hooks/useMarketPrice'

type Tab = 'new' | 'hot' | 'graduating'

/* ── Animated counter ─────────────────────────────────────────────── */
function Counter({ value, prefix='', suffix='' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    const start = ref.current; const end = value; const dur = 1200
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(start + (end - start) * ease))
      if (p < 1) requestAnimationFrame(tick)
      else ref.current = end
    }
    requestAnimationFrame(tick)
  }, [value])
  return <span>{prefix}{display.toLocaleString()}{suffix}</span>
}

/* ── King of the Hill card ────────────────────────────────────────── */
function KingCard({ address }: { address: `0x${string}` }) {
  // Dynamically import to avoid circular dep
  const { useTokenData } = require('@/hooks/useTokenData')
  const { token } = useTokenData(address)
  if (!token) return null
  const hue = parseInt(address.slice(2, 6), 16) % 360
  return (
    <Link to={`/token/${address}`} className="block no-underline">
      <div className="relative rounded-2xl p-4 overflow-hidden"
        style={{ background:'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(239,68,68,0.06),rgba(139,92,246,0.08))', border:'1px solid rgba(245,158,11,0.2)' }}>
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background:'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.3), transparent 60%)' }}/>
        <div className="flex items-center gap-1.5 mb-3">
          <Trophy size={12} style={{ color:'#f59e0b' }}/>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color:'#f59e0b' }}>King of the Hill</span>
          <div className="flex-1"/>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background:'rgba(245,158,11,0.15)', color:'#f59e0b' }}>👑 #1</span>
        </div>
        <div className="flex items-center gap-3">
          {token.imageUri
            ? <img src={token.imageUri} className="w-12 h-12 rounded-xl object-cover glow-gold" style={{ border:'1.5px solid rgba(245,158,11,0.3)' }}/>
            : <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white glow-gold"
                style={{ background:`linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))` }}>
                {token.symbol?.slice(0,2)}
              </div>}
          <div>
            <div className="text-base font-black" style={{ color:'var(--text1)' }}>{token.symbol}</div>
            <div className="text-[10px]" style={{ color:'var(--text2)' }}>{token.name}</div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color:'#f59e0b' }}>
              🔥 Most raised on GlowFun
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ── Live stat chip ───────────────────────────────────────────────── */
function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-0"
      style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:`${color}15` }}>
        <Icon size={13} style={{ color }}/>
      </div>
      <div className="min-w-0">
        <div className="text-[8px] font-semibold uppercase tracking-widest truncate" style={{ color:'var(--text2)' }}>{label}</div>
        <div className="text-[12px] font-bold truncate" style={{ color:'var(--text1)' }}>{value}</div>
      </div>
    </div>
  )
}

/* ── Main feed page ───────────────────────────────────────────────── */
export function FeedPage() {
  const { addresses, isLoading } = useTokenList()
  const [tab, setTab]       = useState<Tab>('new')
  const [search, setSearch] = useState('')
  const [ready, setReady]   = useState(false)

  useEffect(() => { prefetchAllMarketData().finally(() => setReady(true)) }, [])

  const reversed = useMemo(() => [...addresses].reverse(), [addresses])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? reversed.filter(a => a.toLowerCase().includes(q)) : reversed
  }, [reversed, search])

  // Tabs are just different sort/filter logic on the same list
  // In reality you'd sort by progress for 'graduating', by age for 'new'
  // For now all 3 tabs show the same list with different ordering
  const displayed = useMemo(() => {
    if (tab === 'hot')        return [...filtered].slice().reverse().slice(0, 50)  // most recent = hot
    if (tab === 'graduating') return [...filtered].slice(0, 20)  // first launched = closest to graduating
    return filtered  // new = reverse chronological
  }, [filtered, tab])

  const total = addresses.length

  const TABS = [
    { id:'new'        as Tab, label:'New',        icon:Sprout,   color:'#22c55e' },
    { id:'hot'        as Tab, label:'Hot',        icon:Flame,    color:'#ef4444' },
    { id:'graduating' as Tab, label:'Graduating', icon:Trophy,   color:'#f59e0b' },
  ]

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────── */}
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="mb-6 relative">
        {/* Gradient headline */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full" style={{ background:'linear-gradient(180deg,#8b5cf6,#6366f1)' }}/>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color:'#818cf8' }}>GlowFun · Arc Mainnet</span>
          </div>
          <h1 className="text-2xl font-black mb-1.5 leading-tight" style={{ letterSpacing:'-0.04em', fontFamily:'Space Grotesk,sans-serif' }}>
            <span style={{ color:'var(--text1)' }}>Launch your </span>
            <span className="gradient-text">meme token</span>
            <br/>
            <span style={{ color:'var(--text1)' }}>on Arc — instantly.</span>
          </h1>
          <p className="text-xs" style={{ color:'var(--text2)' }}>Fair launch bonding curve. No liquidity needed. No rug pulls.</p>
        </div>

        {/* CTA buttons */}
        <div className="flex gap-2.5 mb-5">
          <Link to="/launch" className="no-underline">
            <motion.button whileTap={{ scale:0.97 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white glow-accent"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <Rocket size={13}/> Launch Token
            </motion.button>
          </Link>
          <Link to="/ide" className="no-underline">
            <motion.button whileTap={{ scale:0.97 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text1)' }}>
              <Zap size={13}/> Open IDE
            </motion.button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <Stat icon={TrendingUp} label="Tokens Live"     value={total ? String(total) : '—'}   color="#6366f1"/>
          <Stat icon={DollarSign} label="On Bonding"      value={total ? `${total} active` : '—'} color="#22c55e"/>
          <Stat icon={Users}      label="Network"         value="Arc Mainnet"                     color="#f59e0b"/>
        </div>
      </motion.div>

      {/* ── Tabs + search ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide">
        {TABS.map(t => {
          const active = tab === t.id; const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
              style={{
                background: active ? `${t.color}14` : 'var(--surface)',
                color: active ? t.color : 'var(--text2)',
                border: `1.5px solid ${active ? `${t.color}30` : 'var(--border)'}`,
              }}>
              <Icon size={11}/> {t.label}
            </button>
          )
        })}
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl min-w-0 ml-1"
          style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <Search size={11} style={{ color:'var(--text2)', flexShrink:0 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tokens…"
            className="text-[11px] bg-transparent outline-none w-full min-w-0"
            style={{ color:'var(--text1)' }}/>
          {search && <button onClick={() => setSearch('')}><X size={10} style={{ color:'var(--text2)' }}/></button>}
        </div>
        <span className="text-[9px] font-medium flex-shrink-0" style={{ color:'var(--text2)' }}>{displayed.length}</span>
      </div>

      {/* ── Token grid ────────────────────────────────────────── */}
      {isLoading && !addresses.length ? (
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl shimmer" style={{ height:160, border:'1px solid var(--border)' }}/>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background:'var(--surface)' }}>
            <Search size={24} style={{ color:'var(--text3)' }}/>
          </div>
          <p className="text-sm font-medium" style={{ color:'var(--text2)' }}>No tokens found</p>
          <p className="text-xs mt-1" style={{ color:'var(--text3)' }}>
            {search ? 'Try a different search' : 'Be the first to launch on GlowFun!'}
          </p>
          {!search && (
            <Link to="/launch" className="no-underline mt-4 inline-block">
              <button className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                Launch now →
              </button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {displayed.map((addr, i) => (
            <TokenCard key={addr} address={addr as `0x${string}`} index={i}/>
          ))}
        </div>
      )}

      {/* ── Bottom launch CTA ─────────────────────────────────── */}
      {displayed.length > 0 && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }}
          className="mt-6 rounded-2xl p-4 text-center relative overflow-hidden"
          style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.06))', border:'1px solid rgba(99,102,241,0.15)' }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background:'radial-gradient(ellipse at 50% -20%,rgba(99,102,241,0.12),transparent 60%)' }}/>
          <p className="text-xs font-medium mb-2.5 relative" style={{ color:'var(--text2)' }}>
            Ready to launch your own token?
          </p>
          <Link to="/launch" className="no-underline relative">
            <button className="px-5 py-2 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 glow-accent"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <Rocket size={13}/> Create Token
            </button>
          </Link>
        </motion.div>
      )}
    </div>
  )
}

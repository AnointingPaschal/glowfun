import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Clock, TrendingUp, Search, Rocket, Zap, Star, BarChart3, DollarSign, Activity } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'
import { TokenCard } from '@/components/TokenCard'
import { prefetchAllMarketData } from '@/hooks/useMarketPrice'
import { GlassCard } from '@/components/GlassCard'

type SortMode = 'new' | 'hot'

/* ── Stat strip ─────────────────────────────────────────────────── */
function StatChip({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl flex-1 min-w-0" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}12` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: '#9ca3af' }}>{label}</div>
        <div className="text-sm font-bold truncate" style={{ color: '#111827', fontFamily: 'Space Grotesk,sans-serif' }}>{value}</div>
      </div>
    </div>
  )
}

export function FeedPage() {
  const { addresses, isLoading } = useTokenList()
  const [sort, setSort]    = useState<SortMode>('new')
  const [search, setSearch]= useState('')
  const [ready, setReady]  = useState(false)

  useEffect(() => { prefetchAllMarketData().finally(() => setReady(true)) }, [])

  const sorted = useMemo(() => {
    return [...addresses].reverse()
  }, [addresses])

  const filtered = useMemo(() => {
    if (!search) return sorted
    const q = search.toLowerCase()
    return sorted.filter(a => a.toLowerCase().includes(q))
  }, [sorted, search])

  const totalTokens = addresses.length

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────────── */}
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} className="mb-6">
        {/* Gradient strip */}
        <div className="h-1 w-16 rounded-full mb-4" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)' }}/>
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily:'Space Grotesk,sans-serif', letterSpacing:'-0.03em', color:'#111827' }}>
          Meme Token <span style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Launchpad</span>
        </h1>
        <p className="text-sm mb-5" style={{ color:'#6b7280' }}>Launch and trade meme tokens on the Arc bonding curve. No liquidity needed.</p>

        {/* CTA buttons */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/launch">
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 16px rgba(99,102,241,0.3)' }}>
              <Rocket size={15}/>Launch a Token
            </motion.button>
          </Link>
          <Link to="/">
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
              style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.09)', color:'#374151' }}>
              <BarChart3 size={15}/>Dex Explorer
            </motion.button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-2">
          <StatChip icon={Zap}        label="Tokens Live"   value={isLoading ? '…' : String(totalTokens)} color="#6366f1"/>
          <StatChip icon={TrendingUp} label="On Bonding"    value={isLoading ? '…' : String(totalTokens)} color="#16a34a"/>
          <StatChip icon={Activity}   label="Network"       value="Arc Mainnet"                             color="#f59e0b"/>
        </div>
      </motion.div>

      {/* ── Filter + search row ──────────────────────────────── */}
      <div className="flex items-center gap-2.5 mb-5">
        {/* Sort tabs */}
        <div className="flex p-1 rounded-xl" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)' }}>
          {([['new','New',Clock],['hot','Hot',Flame]] as [SortMode,string,any][]).map(([id,label,Icon])=>(
            <button key={id} onClick={()=>setSort(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background:sort===id?'#6366f1':'transparent', color:sort===id?'#fff':'#9ca3af' }}>
              <Icon size={11}/>{label}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)' }}>
          <Search size={13} style={{ color:'#9ca3af', flexShrink:0 }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tokens…"
            className="text-sm bg-transparent outline-none w-full" style={{ color:'#111827' }}/>
        </div>
        <span className="text-xs font-medium flex-shrink-0" style={{ color:'#9ca3af' }}>{filtered.length}</span>
      </div>

      {/* Market loading notice */}
      {!ready && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl text-xs font-medium" style={{ background:'#eff6ff', border:'1px solid #bfdbfe', color:'#3b82f6' }}>
          <div className="w-3 h-3 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor:'rgba(59,130,246,0.2)', borderTopColor:'#3b82f6' }}/>
          Fetching live market prices from DexScreener…
        </div>
      )}

      {/* ── Token grid ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)' }}>
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded-xl" style={{ background:'#f3f4f6' }}/>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-28 rounded-lg" style={{ background:'#e5e7eb' }}/>
                  <div className="h-3 w-20 rounded-lg" style={{ background:'#f3f4f6' }}/>
                  <div className="h-2 w-full rounded-full" style={{ background:'#f3f4f6' }}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="text-center py-20">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.1)' }}>
            <Flame size={30} style={{ color:'rgba(99,102,241,0.35)' }}/>
          </div>
          <h3 className="text-lg font-bold mb-1.5" style={{ color:'#111827' }}>{search?'No matching tokens':'No tokens launched yet'}</h3>
          <p className="text-sm mb-5" style={{ color:'#9ca3af' }}>{search?'Try a different search term':'Be the first to launch a token on GlowFun'}</p>
          {!search&&<Link to="/launch"><button className="px-6 py-3 rounded-2xl text-sm font-bold text-white" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Launch First Token →</button></Link>}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((addr, i) => (
            <TokenCard key={addr} address={addr as `0x${string}`} index={i}/>
          ))}
        </div>
      )}
    </div>
  )
}

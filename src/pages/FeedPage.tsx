import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Clock, TrendingUp, Search, Rocket, RefreshCw } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'
import { TokenCard } from '@/components/TokenCard'
import { prefetchAllMarketData } from '@/hooks/useMarketPrice'

type SortMode = 'new' | 'hot'

export function FeedPage() {
  const { addresses, isLoading } = useTokenList()
  const [sort, setSort]   = useState<SortMode>('new')
  const [search, setSearch] = useState('')
  const [marketReady, setMarketReady] = useState(false)

  useEffect(() => { prefetchAllMarketData().finally(() => setMarketReady(true)) }, [])

  const filtered = useMemo(() => {
    const base = [...addresses].reverse()
    if (!search) return base
    const q = search.toLowerCase()
    return base.filter(a => a.toLowerCase().includes(q))
  }, [addresses, sort, search])

  return (
    <div>
      {/* Hero */}
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-semibold" style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.15)', color:'#6366f1' }}>
          ⚡ Arc Mainnet · USDC-Powered
        </div>
        <h1 className="text-4xl font-bold mb-2" style={{ fontFamily:'Space Grotesk,sans-serif', letterSpacing:'-0.03em', color:'#111827' }}>
          The meme token{' '}
          <span style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>launchpad</span>
        </h1>
        <p className="text-sm max-w-md mx-auto mb-5" style={{ color:'#6b7280' }}>Launch and trade tokens on a bonding curve. No liquidity needed. Powered by USDC on Arc.</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/launch">
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 16px rgba(99,102,241,0.3)' }}>
              <Rocket size={14}/>Launch a Token
            </motion.button>
          </Link>
          <Link to="/">
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.1)', color:'#374151' }}>
              <TrendingUp size={14}/>Dex Explorer
            </motion.button>
          </Link>
        </div>
      </motion.div>

      {/* Market loading */}
      {!marketReady && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)', color:'#9ca3af' }}>
          <RefreshCw size={11} className="animate-spin"/>Fetching live market prices…
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)' }}>
          {[
            { id:'new', label:'New', icon:Clock },
            { id:'hot', label:'Hot', icon:Flame },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSort(id as SortMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background:sort===id?'#6366f1':'transparent', color:sort===id?'#fff':'#6b7280' }}>
              <Icon size={11}/>{label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)', maxWidth:240 }}>
          <Search size={12} style={{ color:'#9ca3af', flexShrink:0 }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tokens…"
            className="text-xs bg-transparent outline-none w-full" style={{ color:'#111827' }}/>
        </div>
        <span className="text-xs" style={{ color:'#9ca3af' }}>{filtered.length} tokens</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)' }}>
              <div className="flex gap-3"><div className="w-12 h-12 rounded-xl" style={{background:'#f3f4f6'}}/><div className="flex-1 space-y-2"><div className="h-4 w-28 rounded" style={{background:'#e5e7eb'}}/><div className="h-3 w-20 rounded" style={{background:'#f3f4f6'}}/><div className="h-1.5 w-full rounded-full" style={{background:'#f3f4f6'}}/></div></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.1)' }}>
            <Flame size={24} style={{ color:'rgba(99,102,241,0.4)' }}/>
          </div>
          <p className="text-sm font-medium mb-1" style={{ color:'#374151' }}>{search?'No matching tokens':'No tokens yet'}</p>
          <p className="text-xs mb-4" style={{ color:'#9ca3af' }}>{search?'Try a different search':'Be the first to launch on GlowFun'}</p>
          {!search && <Link to="/launch"><button className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Launch First Token</button></Link>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((addr, i) => <TokenCard key={addr} address={addr as `0x${string}`} index={i}/>)}
        </div>
      )}
    </div>
  )
}

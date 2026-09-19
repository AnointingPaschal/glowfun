import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Clock, TrendingUp, Zap, Search, Rocket } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'
import { TokenCard } from '@/components/TokenCard'
import { GlassCard } from '@/components/GlassCard'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
type SortMode = 'new' | 'hot'

export function FeedPage() {
  const { addresses, isLoading } = useTokenList()
  const [sort, setSort] = useState<SortMode>('new')
  const [search, setSearch] = useState('')

  const sorted = useMemo(() => {
    const base = [...addresses]
    // Since we don't have secondary-sort data client-side, newest (reverse order) is default
    if (sort === 'new') return base.reverse()
    return base
  }, [addresses, sort])


  return (
    <div>
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-medium" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.18)', color: '#a78bfa' }}>
          <Zap size={10} />Arc Mainnet · USDC-Powered
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>
          The meme token{' '}
          <span style={{ background: SPECTRAL, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>launchpad</span>
        </h1>
        <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Launch and trade tokens on a bonding curve. No liquidity needed. Powered by USDC on Arc.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/launch">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              <Rocket size={14} />Launch a Token
            </motion.button>
          </Link>
        </div>
      </motion.div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Sort */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[{ id: 'new', label: 'New', icon: Clock }, { id: 'hot', label: 'Hot', icon: Flame }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSort(id as SortMode)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{
              background: sort === id ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: sort === id ? '#a78bfa' : 'rgba(255,255,255,0.4)',
              border: sort === id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
            }}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 260 }}>
          <Search size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tokens..." className="text-xs text-white bg-transparent outline-none w-full placeholder-white/20" />
        </div>

        <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>{addresses.length} tokens</span>
      </div>

      {/* Token grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassCard key={i} className="p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-28 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  <div className="h-3 w-36 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="h-1.5 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <Flame size={24} style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
          <p className="text-sm font-medium text-white mb-1">No tokens yet</p>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>Be the first to launch a token on GlowFun</p>
          <Link to="/launch">
            <button className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>Launch First Token</button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sorted.map((addr, i) => <TokenCard key={addr} address={addr as `0x${string}`} index={i} />)}
        </div>
      )}
    </div>
  )
}

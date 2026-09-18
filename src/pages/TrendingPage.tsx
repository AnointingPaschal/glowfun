import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Trophy, Zap } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { TokenCard } from '@/components/TokenCard'
import { TokenCardSkeleton } from '@/components/TokenCardSkeleton'
import { useTokenList } from '@/hooks/useTokenList'
import { useTokenData } from '@/hooks/useTokenData'
import { formatUsdc, formatProgress } from '@/utils/format'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

function TokenItemFull({ address, index }: { address: `0x${string}`; index: number }) {
  return <TokenCard address={address} index={index} />
}

export function TrendingPage() {
  const { addresses, isLoading } = useTokenList()

  // For now show newest tokens as "trending" — in production you'd use volume data
  const sorted = useMemo(() => [...(addresses ?? [])].reverse().slice(0, 20), [addresses])
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  return (
    <div className="max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Hot Now</span>
        </div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Trending</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Most active tokens on the bonding curve right now.</p>
      </motion.div>

      {/* Podium */}
      {!isLoading && top3.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-3 gap-3 mb-6">
          {top3.map((addr, i) => (
            <GlassCard key={addr} className="p-4 text-center relative overflow-hidden" glow={i === 0}>
              {i === 0 && <div className="h-[2px] -mx-4 -mt-4 mb-3 rounded-t-2xl" style={{ background: SPECTRAL }} />}
              <div className="text-2xl font-bold mb-1" style={{ color: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : '#92400e' }}>
                #{i + 1}
              </div>
              {i === 0 && <Trophy size={18} className="mx-auto mb-1" style={{ color: '#fbbf24' }} />}
              <TrendingItemMini address={addr as `0x${string}`} />
            </GlassCard>
          ))}
        </motion.div>
      )}

      {/* Full list */}
      <div className="space-y-3">
        {isLoading ? Array.from({ length: 8 }).map((_, i) => <TokenCardSkeleton key={i} />) : (
          <>
            {rest.map((addr, i) => (
              <TokenItemFull key={addr} address={addr as `0x${string}`} index={i} />
            ))}
            {sorted.length === 0 && (
              <div className="text-center py-16">
                <TrendingUp size={32} className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p className="text-white font-semibold">Nothing trending yet</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Launch the first token to start the party.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TrendingItemMini({ address }: { address: `0x${string}` }) {
  const { token } = useTokenData(address)
  if (!token) return <div className="h-8 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
  return (
    <div>
      <div className="text-sm font-bold text-white truncate">${token.symbol}</div>
      <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatUsdc(token.marketCap)}</div>
      <div className="text-xs" style={{ color: '#34d399' }}>{formatProgress(token.progress).toFixed(1)}%</div>
    </div>
  )
}

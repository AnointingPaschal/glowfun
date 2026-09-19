import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTokenData } from '@/hooks/useTokenData'
import { useMarketPrice } from '@/hooks/useMarketPrice'
import { GlassCard } from './GlassCard'
import { formatUsdc, formatProgress, formatAddress, timeAgo, formatPriceNumber } from '@/utils/format'
import { Flame, TrendingUp } from 'lucide-react'
import { useConfig } from '@/context/ConfigContext'

interface Props { address: `0x${string}`; index?: number }

export function TokenCard({ address, index = 0 }: Props) {
  const { EXPLORER_BASE } = useConfig()
  const { token, isLoading } = useTokenData(address)
  const { market } = useMarketPrice(address)

  if (isLoading || !token) {
    return (
      <GlassCard className="p-4 animate-pulse">
        <div className="flex gap-3">
          <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <div className="h-4 w-28 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-4 w-16 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
            <div className="h-3 w-36 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-3 w-full rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-1.5 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
      </GlassCard>
    )
  }

  const progress = formatProgress(token.progress)
  const graduated = token.state?.graduated

  // Use external market price/mcap when available, fall back to bonding curve
  const displayPriceUsd  = market?.priceUsd   ?? (Number(token.price ?? 0n) / 1e42)
  const displayMcapUsd   = market?.mcapUsd    ?? (Number(token.marketCap ?? 0n) / 1e6)
  const hasMarketPrice   = !!market && market.priceUsd > 0
  const change24h        = market?.change24h

  function fmtMcap(n: number): string {
    if (!n || n === 0) return '$0'
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
    if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`
    return `$${n.toFixed(2)}`
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.3 }}>
      <Link to={`/token/${address}`} className="block no-underline group">
        <GlassCard
          className="p-4 cursor-pointer transition-all duration-200 hover:border-opacity-20"
          style={{
            borderColor: graduated ? 'rgba(250,204,21,0.15)' : 'rgba(255,255,255,0.06)',
            transition: 'all 0.2s ease',
          }}
        >
          {graduated && (
            <div className="h-[2px] -mx-4 -mt-4 mb-4 rounded-t-2xl" style={{ background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }} />
          )}
          <div className="flex gap-3">
            {/* Token image */}
            <div className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-xl font-bold text-white" style={{
              background: token.imageUri ? undefined : `hsl(${parseInt(address.slice(2, 6), 16) % 360}, 60%, 30%)`,
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 20,
            }}>
              {token.imageUri ? (
                <img src={token.imageUri} alt={token.symbol} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                token.symbol.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{token.name}</span>
                    {graduated && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(250,204,21,0.1)', color: '#fbbf24' }}>GRAD</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs" style={{ color: '#a78bfa' }}>${token.symbol}</span>
                    {/* Live market price badge */}
                    {hasMarketPrice && (
                      <span className="flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.15)' }}>
                        <TrendingUp size={7} />Live
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-semibold text-white tabular-nums">{fmtMcap(displayMcapUsd)}</div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>mktcap</div>
                    {change24h !== undefined && (
                      <div className="text-[9px] font-medium tabular-nums" style={{ color: change24h >= 0 ? '#34d399' : '#f87171' }}>
                        {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {token.description && (
                <p className="text-xs mb-2 line-clamp-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{token.description}</p>
              )}

              {/* Progress bar */}
              {!graduated && (
                <div className="mt-1.5">
                  <div className="flex justify-between text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <span className="flex items-center gap-1">
                      <Flame size={9} style={{ color: '#f97316' }} />
                      {progress.toFixed(1)}% to grad
                    </span>
                    <span className="tabular-nums">{formatUsdc(token.state?.realUsdcRaised)} / $69K</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progress, 100)}%` }}
                      transition={{ duration: 0.6, delay: index * 0.04 }}
                      className="h-full rounded-full"
                      style={{ background: progress > 80 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <span>by {formatAddress(token.creator)}</span>
                <span>{timeAgo(token.createdAt)}</span>
              </div>
            </div>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  )
}

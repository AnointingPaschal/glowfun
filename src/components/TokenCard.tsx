import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTokenData } from '@/hooks/useTokenData'
import { useMarketPrice } from '@/hooks/useMarketPrice'
import { GlassCard } from './GlassCard'
import { formatUsdc, formatProgress, formatAddress, timeAgo } from '@/utils/format'
import { Flame, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface Props { address: `0x${string}`; index?: number }

/* Compact subscript price like DexScreener ($0.0₃1345) */
function SmallPrice({ price }: { price: number }) {
  if (!price) return <span>$0</span>
  if (price >= 0.01) return <span>${price >= 100 ? price.toLocaleString('en', { maximumFractionDigits: 2 }) : price.toFixed(price >= 1 ? 4 : 6)}</span>
  const s = price.toFixed(20)
  const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) {
    return <span>$0.0<sub style={{ fontSize: '0.6em' }}>{m[1].length}</sub>{m[2]}</span>
  }
  return <span>${price.toFixed(8)}</span>
}

function fmtUsd(n: number) {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n/1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function TokenCard({ address, index = 0 }: Props) {
  const { token, isLoading } = useTokenData(address)
  const { market } = useMarketPrice(address)

  if (isLoading || !token) {
    return (
      <GlassCard className="p-3.5 animate-pulse">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <div className="h-3.5 w-24 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-3.5 w-14 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
            <div className="h-2.5 w-32 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-1.5 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
      </GlassCard>
    )
  }

  const progress    = formatProgress(token.progress)
  const graduated   = token.state?.graduated
  const hue         = parseInt(address.slice(2, 6), 16) % 360

  // DexScreener data takes priority — bonding curve is background/fallback
  const hasMarket   = !!market && market.priceUsd > 0
  const priceUsd    = hasMarket ? market!.priceUsd : (Number(token.price ?? 0n) / 1e42)
  const mcapUsd     = hasMarket ? market!.mcapUsd  : (Number(token.marketCap ?? 0n) / 1e6)
  const volUsd      = hasMarket ? market!.volumeUsd : 0
  const liqUsd      = hasMarket ? market!.liquidityUsd : 0
  const change24h   = market?.change24h
  const change1h    = market?.change1h
  const change5m    = market?.change5m

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03, duration: 0.2 }}>
      <Link to={`/token/${address}`} className="block no-underline">
        <GlassCard className="p-3.5 cursor-pointer transition-all active:scale-[0.99]"
          style={{ borderColor: graduated ? 'rgba(250,204,21,0.15)' : hasMarket ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.06)' }}>
          {graduated && <div className="h-[1.5px] -mx-3.5 -mt-3.5 mb-3.5 rounded-t-2xl" style={{ background: 'linear-gradient(90deg,#fbbf24,#f59e0b)' }}/>}

          <div className="flex gap-3">
            {/* Logo */}
            <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-white"
              style={{ background: token.imageUri ? undefined : `hsl(${hue},60%,28%)`, fontSize: 16, fontFamily: 'Space Grotesk,sans-serif' }}>
              {token.imageUri
                ? <img src={token.imageUri} alt={token.symbol} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
                : token.symbol.slice(0,2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              {/* Row 1: name + price */}
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white leading-tight" style={{ fontFamily:'Space Grotesk,sans-serif' }}>{token.name}</span>
                    {graduated && <span className="text-[8px] font-bold px-1 py-px rounded" style={{ background:'rgba(250,204,21,0.1)', color:'#fbbf24' }}>GRAD</span>}
                    {hasMarket && <span className="text-[8px] font-bold px-1 py-px rounded flex items-center gap-0.5" style={{ background:'rgba(34,197,94,0.08)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.12)' }}><TrendingUp size={7}/>Live</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] font-medium" style={{ color: '#a78bfa' }}>${token.symbol}</span>
                    <span className="text-[9px]" style={{ color:'rgba(255,255,255,0.3)' }}>·</span>
                    <span className="text-[9px]" style={{ color:'rgba(255,255,255,0.3)' }}>{timeAgo(token.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold text-white tabular-nums leading-tight">
                    <SmallPrice price={priceUsd}/>
                  </div>
                  {change24h != null && (
                    <div className="flex items-center justify-end gap-0.5 mt-0.5">
                      {change24h >= 0 ? <ArrowUpRight size={9} style={{ color:'#22c55e' }}/> : <ArrowDownRight size={9} style={{ color:'#ef4444' }}/>}
                      <span className="text-[9px] font-semibold tabular-nums" style={{ color: change24h >= 0 ? '#22c55e' : '#ef4444' }}>
                        {Math.abs(change24h).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: market badges (if live data) or description */}
              {hasMarket ? (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {liqUsd > 0 && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}>LIQ {fmtUsd(liqUsd)}</span>}
                  {volUsd > 0 && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}>VOL {fmtUsd(volUsd)}</span>}
                  {mcapUsd > 0 && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}>MCAP {fmtUsd(mcapUsd)}</span>}
                  {change5m != null && <span className="text-[8px] px-1 py-0.5 rounded ml-auto" style={{ background: change5m>=0?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)', color: change5m>=0?'#22c55e':'#ef4444', border:`1px solid ${change5m>=0?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)'}` }}>5M {change5m>0?'+':''}{change5m.toFixed(1)}%</span>}
                </div>
              ) : token.description ? (
                <p className="text-[9px] mt-1 line-clamp-1" style={{ color:'rgba(255,255,255,0.38)' }}>{token.description}</p>
              ) : null}

              {/* Bonding curve progress (not graduated) */}
              {!graduated && (
                <div className="mt-1.5">
                  <div className="flex justify-between text-[9px] mb-0.5" style={{ color:'rgba(255,255,255,0.3)' }}>
                    <span className="flex items-center gap-0.5"><Flame size={8} style={{ color:'#f97316' }}/>{progress.toFixed(1)}% to grad</span>
                    <span className="tabular-nums">{formatUsdc(token.state?.realUsdcRaised)} / $69K</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.05)' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width:`${Math.min(progress,100)}%` }} transition={{ duration:0.5, delay:index*0.03 }}
                      className="h-full rounded-full"
                      style={{ background: progress>80?'linear-gradient(90deg,#f97316,#ef4444)':'linear-gradient(90deg,#8b5cf6,#ec4899)' }}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  )
}

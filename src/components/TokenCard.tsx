import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTokenData } from '@/hooks/useTokenData'
import { useMarketPrice } from '@/hooks/useMarketPrice'
import { formatUsdc, formatProgress, timeAgo } from '@/utils/format'
import { Flame, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface Props { address: `0x${string}`; index?: number }

function SmallPrice({ p }: { p: number }) {
  if (!p) return <span>$0</span>
  if (p >= 0.01) return <span>${p >= 100 ? p.toLocaleString('en',{maximumFractionDigits:2}) : p.toFixed(p>=1?4:6)}</span>
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{fontSize:'0.6em'}}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
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
      <div className="rounded-2xl p-4 animate-pulse" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ background: '#f3f4f6' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-24 rounded" style={{ background: '#e5e7eb' }} />
            <div className="h-2.5 w-32 rounded" style={{ background: '#f3f4f6' }} />
            <div className="h-1.5 w-full rounded-full" style={{ background: '#f3f4f6' }} />
          </div>
        </div>
      </div>
    )
  }

  const progress  = formatProgress(token.progress)
  const graduated = token.state?.graduated
  const hue       = parseInt(address.slice(2, 6), 16) % 360

  const hasMarket  = !!market && market.priceUsd > 0
  const priceUsd   = hasMarket ? market!.priceUsd : (Number(token.price ?? 0n) / 1e42)
  const mcapUsd    = hasMarket ? market!.mcapUsd  : (Number(token.marketCap ?? 0n) / 1e6)
  const volUsd     = hasMarket ? market!.volumeUsd : 0
  const liqUsd     = hasMarket ? market!.liquidityUsd : 0
  const change24h  = market?.change24h
  const ch24Pos    = (change24h ?? 0) >= 0

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025, duration: 0.2 }}>
      <Link to={`/token/${address}`} className="block no-underline">
        <div className="rounded-2xl p-3.5 cursor-pointer transition-all"
          style={{
            background: '#fff',
            border: `1px solid ${graduated ? 'rgba(250,204,21,0.3)' : hasMarket ? 'rgba(22,163,74,0.12)' : 'rgba(0,0,0,0.07)'}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
          {graduated && <div className="h-[2px] -mx-3.5 -mt-3.5 mb-3 rounded-t-2xl" style={{ background: 'linear-gradient(90deg,#f59e0b,#d97706)' }}/>}

          <div className="flex gap-3">
            {/* Logo */}
            <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-white"
              style={{ background: token.imageUri ? undefined : `hsl(${hue},60%,50%)`, fontSize: 15, fontFamily: 'Space Grotesk,sans-serif', border: '1px solid rgba(0,0,0,0.06)' }}>
              {token.imageUri
                ? <img src={token.imageUri} alt="" className="w-full h-full object-cover" onError={e => { (e.target as any).style.display='none' }}/>
                : token.symbol.slice(0,2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              {/* Row 1 */}
              <div className="flex items-start justify-between gap-1 mb-0.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold leading-tight" style={{ color: '#111827', fontFamily: 'Space Grotesk,sans-serif' }}>{token.name}</span>
                    {graduated && <span className="text-[8px] font-bold px-1 py-px rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>GRAD</span>}
                    {hasMarket && <span className="text-[8px] font-bold px-1 py-px rounded flex items-center gap-0.5" style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.15)' }}>● Live</span>}
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: '#6366f1' }}>${token.symbol}</span>
                  <span className="text-[9px] ml-1.5" style={{ color: '#9ca3af' }}>{timeAgo(token.createdAt)}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold tabular-nums leading-tight" style={{ color: '#111827' }}>
                    <SmallPrice p={priceUsd}/>
                  </div>
                  {change24h != null && (
                    <div className="flex items-center justify-end gap-0.5 mt-0.5">
                      {ch24Pos ? <ArrowUpRight size={9} style={{ color:'#16a34a' }}/> : <ArrowDownRight size={9} style={{ color:'#dc2626' }}/>}
                      <span className="text-[9px] font-semibold tabular-nums" style={{ color: ch24Pos ? '#16a34a' : '#dc2626' }}>
                        {Math.abs(change24h).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Market badges or description */}
              {hasMarket ? (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {liqUsd > 0 && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#f9fafb', color: '#6b7280', border: '1px solid rgba(0,0,0,0.07)' }}>LIQ {fmtUsd(liqUsd)}</span>}
                  {volUsd > 0 && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#f9fafb', color: '#6b7280', border: '1px solid rgba(0,0,0,0.07)' }}>VOL {fmtUsd(volUsd)}</span>}
                  {mcapUsd > 0 && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#f9fafb', color: '#6b7280', border: '1px solid rgba(0,0,0,0.07)' }}>MCAP {fmtUsd(mcapUsd)}</span>}
                </div>
              ) : token.description ? (
                <p className="text-[9px] mt-0.5 line-clamp-1" style={{ color: '#9ca3af' }}>{token.description}</p>
              ) : null}

              {/* Bonding curve */}
              {!graduated && (
                <div className="mt-1.5">
                  <div className="flex justify-between text-[9px] mb-0.5" style={{ color: '#9ca3af' }}>
                    <span className="flex items-center gap-0.5"><Flame size={8} style={{ color: '#f97316' }}/>{progress.toFixed(1)}% to grad</span>
                    <span className="tabular-nums">{formatUsdc(token.state?.realUsdcRaised)} / $69K</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(progress, 100)}%` }} transition={{ duration: 0.5 }}
                      className="h-full rounded-full"
                      style={{ background: progress > 80 ? 'linear-gradient(90deg,#f97316,#ef4444)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

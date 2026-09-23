import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTokenData } from '@/hooks/useTokenData'
import { useMarketPrice } from '@/hooks/useMarketPrice'
import { formatProgress, timeAgo, ipfsToHttp, nextIpfsGateway } from '@/utils/format'
import { Flame, Sprout, Trophy } from 'lucide-react'

interface Props { address: `0x${string}`; index?: number; rank?: number }

function Px({ p }: { p: number }) {
  if (!p) return <span>$0</span>
  if (p >= 0.01) return <span>${p >= 100 ? p.toLocaleString('en', { maximumFractionDigits: 2 }) : p.toFixed(p >= 1 ? 4 : 6)}</span>
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{ fontSize: '0.6em' }}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
}

function fmtUsd(n: number) {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function TokenCard({ address, index = 0, rank }: Props) {
  const { token, isLoading } = useTokenData(address)
  const { market } = useMarketPrice(address)

  if (isLoading || !token) {
    return (
      <div className="rounded-2xl p-4 shimmer" style={{ border: '1px solid var(--border)', minHeight: 160 }}/>
    )
  }

  const progress   = formatProgress(token.progress)
  const graduated  = token.state?.graduated
  const hue        = parseInt(address.slice(2, 6), 16) % 360
  const color1     = `hsl(${hue},70%,60%)`
  const color2     = `hsl(${(hue + 120) % 360},65%,50%)`
  const priceUsd   = market?.priceUsd  ?? (Number(token.price ?? 0n) / 1e42)
  // Use on-chain market cap — DexScreener mcap is for graduated tokens only
  const mcapUsd    = Number(token.marketCap ?? 0n) / 1e6
  const change24h  = market?.change24h
  const ch24Pos    = (change24h ?? 0) >= 0

  // Bonding progress: 0–100
  const pct        = Math.min(100, Math.max(0, progress))
  const isHot      = pct > 50
  const isGrad     = graduated || pct >= 100

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}>
      <Link to={`/token/${address}`} className="block no-underline group">
        <div className="rounded-2xl p-3.5 transition-all duration-200 relative overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${isGrad ? 'rgba(245,158,11,0.2)' : isHot ? 'rgba(99,102,241,0.15)' : 'var(--border)'}`,
          }}>

          {/* Glow on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
            style={{ boxShadow: `inset 0 0 30px rgba(99,102,241,0.04)` }}/>

          {/* Rank badge */}
          {rank && rank <= 3 && (
            <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black"
              style={{ background: rank===1?'#f59e0b':rank===2?'#9ca3af':'#cd7c32', color: '#000' }}>
              {rank}
            </div>
          )}

          {/* Graduated badge */}
          {isGrad && (
            <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold"
              style={{ background:'rgba(245,158,11,0.12)', color:'#f59e0b', border:'1px solid rgba(245,158,11,0.2)' }}>
              <Trophy size={7}/> GRAD
            </div>
          )}

          {/* Header */}
          <div className="flex items-start gap-2.5 mb-3">
            {/* Logo */}
            <div className="relative flex-shrink-0">
              {token.imageUri
                ? <img src={ipfsToHttp(token.imageUri)} className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                    style={{ border: '1.5px solid var(--border2)' }}
                    onError={e => {
                      const t = e.target as HTMLImageElement
                      const next = nextIpfsGateway(t.src)
                      if (next) { t.src = next } else { t.style.display = 'none' }
                    }}/>
                : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: `linear-gradient(135deg,${color1},${color2})` }}>
                    {token.symbol?.slice(0, 2) || '??'}
                  </div>}
              {isHot && !isGrad && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background:'#ef4444', boxShadow:'0 0 6px #ef4444' }}>
                  <Flame size={8} color="#fff"/>
                </div>
              )}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[13px] font-bold truncate" style={{ color:'var(--text1)' }}>{token.symbol}</span>
                {token.createdAt && (
                  <span className="text-[8.5px] flex items-center gap-0.5 flex-shrink-0" style={{ color:'var(--green)' }}>
                    <Sprout size={7}/>{timeAgo(token.createdAt)}
                  </span>
                )}
              </div>
              <div className="text-[9px] truncate mb-1" style={{ color:'var(--text2)' }}>{token.name}</div>

              {/* Price */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold tabular-nums" style={{ color:'var(--text1)' }}>
                  <Px p={priceUsd}/>
                </span>
                {change24h != null && (
                  <span className="text-[9px] font-semibold" style={{ color: ch24Pos ? 'var(--green)' : 'var(--red)' }}>
                    {ch24Pos ? '+' : ''}{change24h.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>



          {/* Footer stats */}
          <div className="flex items-center gap-2">
            <span className="text-[8.5px]" style={{ color:'var(--text2)' }}>
              MCap <span style={{ color:'var(--text1)', fontWeight:600 }}>{fmtUsd(mcapUsd)}</span>
            </span>
            <span style={{ color:'var(--border2)' }}>·</span>
            <span className="text-[8.5px]" style={{ color:'var(--text2)' }}>
              Raised <span style={{ color:'var(--text1)', fontWeight:600 }}>{fmtUsd(Number(token.state?.realUsdcRaised ?? 0n) / 1e6)}</span>
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

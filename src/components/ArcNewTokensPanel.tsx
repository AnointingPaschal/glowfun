import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sprout } from 'lucide-react'
import { useArcMarket } from '@/hooks/useArcMarket'
import { useTokenList } from '@/hooks/useTokenList'

function fmtPrice(n: number): string {
  if (!n) return '$0'
  if (n >= 1) return `$${n.toLocaleString('en', { maximumFractionDigits: 4 })}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  if (n >= 0.0001) return `$${n.toFixed(6)}`
  return `$${n.toExponential(2)}`
}
function fmtAge(sec: number): string {
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m`
}

function TokenDot({ url, symbol, address }: { url: string; symbol: string; address: string }) {
  const [broken, setBroken] = useState(false)
  const hue = parseInt(address.slice(2, 6), 16) % 360
  if (!url || broken) {
    return (
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black text-white flex-shrink-0"
        style={{ background: `linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))` }}>
        {symbol?.slice(0, 2).toUpperCase() || '??'}
      </div>
    )
  }
  return <img src={url} alt={symbol} width={24} height={24} className="rounded-full object-cover flex-shrink-0" onError={() => setBroken(true)} />
}

/**
 * A live, self-refreshing feed of tokens that just started trading anywhere
 * on Arc (not just GlowFun launches) — polls /api/market every 3 seconds and
 * keeps only tokens under an hour old, newest first. This sits alongside the
 * existing GlowFun "All tokens" grid on the home page; it doesn't touch or
 * replace it, GlowFun's own listing stays exactly as it was.
 */
export function ArcNewTokensPanel({ compact = false }: { compact?: boolean }) {
  const { tokens, loading } = useArcMarket('new', '', 3000)
  const { addresses: glowAddrs } = useTokenList()
  const glowSet = useMemo(() => new Set(glowAddrs.map(a => a.toLowerCase())), [glowAddrs])

  const fresh = useMemo(() =>
    tokens.filter(t => t.ageSec > 0 && t.ageSec <= 3600).sort((a, b) => a.ageSec - b.ageSec).slice(0, compact ? 6 : 14),
  [tokens])

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-eyebrow flex items-center gap-1.5"><Sprout size={11} style={{ color: '#22c55e' }} />New on Arc</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--green)' }} />
          <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--green)' }}>Live</span>
        </span>
      </div>
      {loading && !fresh.length ? (
        <div className="space-y-1.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded-xl shimmer" />)}</div>
      ) : fresh.length === 0 ? (
        <p className="text-[10px] px-1" style={{ color: 'var(--text3)' }}>No tokens launched on Arc in the last hour.</p>
      ) : (
        <div className="space-y-1">
          {fresh.map(t => {
            const isGlow = glowSet.has(t.address.toLowerCase())
            const veryNew = t.ageSec <= 300
            return (
              <Link key={t.address} to={isGlow ? `/token/${t.address}` : `/dex/${t.address}`}
                className="flex items-center gap-2 no-underline rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                <TokenDot url={t.logoUrl} symbol={t.symbol} address={t.address} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text1)' }}>{t.symbol}</span>
                    {isGlow && <span className="text-[6px] font-black px-1 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}>GLOW</span>}
                  </div>
                  <div className="text-[9px]" style={{ color: 'var(--text3)' }}>{fmtPrice(t.priceUsd)}</div>
                </div>
                <span className="text-[9px] font-bold flex-shrink-0" style={{ color: veryNew ? 'var(--green)' : 'var(--text3)' }}>{fmtAge(t.ageSec)}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

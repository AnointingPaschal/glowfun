import { useState } from 'react'
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { ChevronLeft, TrendingUp, TrendingDown, Droplets, Clock, ExternalLink } from 'lucide-react'
import { useArcToken } from '@/hooks/useArcMarket'
import { useTokenList } from '@/hooks/useTokenList'
import { GenericSwapPanel } from '@/components/dex/GenericSwapPanel'
import { EXPLORER_BASE, CHAIN_ID } from '@/constants'

function fmtUsd(n: number): string {
  if (!n) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
function fmtPrice(n: number): string {
  if (!n) return '$0'
  if (n >= 1) return `$${n.toLocaleString('en', { maximumFractionDigits: 4 })}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  if (n >= 0.0001) return `$${n.toFixed(6)}`
  return `$${n.toExponential(2)}`
}
function fmtAge(sec: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}
function ChangeStat({ label, v }: { label: string; v?: number }) {
  const has = v !== undefined && v !== null && !Number.isNaN(v)
  const pos = has && v! >= 0
  return (
    <div className="text-center">
      <div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>{label}</div>
      {has ? (
        <div className="flex items-center justify-center gap-0.5 text-xs font-bold" style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>
          {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{Math.abs(v!).toFixed(1)}%
        </div>
      ) : <div className="text-xs" style={{ color: 'var(--text3)' }}>—</div>}
    </div>
  )
}

export function ExternalTokenPage() {
  const { address } = useParams<{ address: string }>()
  const navigate = useNavigate()
  const { address: wallet } = useAccount()
  const { addresses: glowAddrs } = useTokenList()
  const isGlow = !!address && glowAddrs.some(a => a.toLowerCase() === address.toLowerCase())

  const { token, loading, error } = useArcToken(address)
  const [broken, setBroken] = useState(false)

  const { data: decimalsRaw } = useReadContract({
    address: address as `0x${string}` | undefined, abi: [{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }] as const,
    functionName: 'decimals', chainId: CHAIN_ID as any,
    query: { enabled: !!address },
  })
  const decimals = typeof decimalsRaw === 'number' ? decimalsRaw : 18

  // A GlowFun-launched token already has a full trading page — send it there
  // instead of duplicating it here. Checked after every hook above so the
  // hook call order never changes between renders.
  if (isGlow && address) return <Navigate to={`/token/${address}`} replace />
  if (!address) return null

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <button onClick={() => navigate('/dex')} className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text2)', background: 'none', border: 'none' }}>
        <ChevronLeft size={14} /> Arc DEX
      </button>

      {loading && !token ? (
        <div className="space-y-3">
          <div className="h-24 rounded-2xl shimmer" />
          <div className="h-64 rounded-2xl shimmer" />
        </div>
      ) : !token ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--text2)' }}>Couldn't find data for this token{error ? ` (${error})` : ''}.</p>
          <Link to="/dex" className="text-xs font-semibold no-underline" style={{ color: '#818cf8' }}>Back to Arc DEX</Link>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-4">
              {token.logoUrl && !broken
                ? <img src={token.logoUrl} className="w-12 h-12 rounded-full object-cover" style={{ border: '1px solid var(--border2)' }} onError={() => setBroken(true)} />
                : <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: `linear-gradient(135deg,hsl(${parseInt(token.address.slice(2,6),16)%360},70%,55%),hsl(${(parseInt(token.address.slice(2,6),16)+120)%360},65%,45%))` }}>{token.symbol.slice(0,2).toUpperCase()}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold truncate" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>{token.symbol}</div>
                <div className="text-xs truncate" style={{ color: 'var(--text2)' }}>{token.name || 'Unknown token'}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>{fmtPrice(token.priceUsd)}</div>
                <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-[10px] no-underline" style={{ color: 'var(--text3)' }}>
                  {token.address.slice(0,6)}…{token.address.slice(-4)} <ExternalLink size={9} />
                </a>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 py-3" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <ChangeStat label="5m" v={token.change5m} />
              <ChangeStat label="1h" v={token.change1h} />
              <ChangeStat label="6h" v={token.change6h} />
              <ChangeStat label="24h" v={token.change24h} />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 text-center">
              <div><div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>Liquidity</div><div className="text-xs font-bold" style={{ color: 'var(--text1)' }}>{fmtUsd(token.liqUsd)}</div></div>
              <div><div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>Volume</div><div className="text-xs font-bold" style={{ color: 'var(--text1)' }}>{fmtUsd(token.volUsd)}</div></div>
              <div><div className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>Mcap</div><div className="text-xs font-bold" style={{ color: 'var(--text1)' }}>{fmtUsd(token.mcapUsd)}</div></div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-1 text-[10px]" style={{ color: 'var(--text3)' }}>
            <Clock size={10} /><span>{fmtAge(token.ageSec)} old</span>
            <span className="mx-1">·</span>
            <Droplets size={10} /><span>{token.buys24h}/{token.sells24h} buys/sells (24h)</span>
          </div>

          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text1)' }}>Trade {token.symbol}</h3>
            <GenericSwapPanel
              tokenAddress={token.address as `0x${string}`}
              tokenSymbol={token.symbol}
              tokenDecimals={decimals}
              tokenLogo={token.logoUrl}
              wallet={wallet}
            />
          </div>

          <p className="text-[10px] text-center px-4" style={{ color: 'var(--text3)' }}>
            This token wasn't launched on GlowFun — price and liquidity are read live from its Arc network pool.
          </p>
        </>
      )}
    </div>
  )
}

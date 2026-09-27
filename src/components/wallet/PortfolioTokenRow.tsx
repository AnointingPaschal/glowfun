import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Trophy } from 'lucide-react'
import { useTokenData } from '@/hooks/useTokenData'
import { ipfsToHttp, nextIpfsGateway, tokensToInputStr } from '@/utils/format'

interface Props {
  address: `0x${string}`
  balance: bigint
  hideBalance: boolean
  /** Reports this row's live USD value up to the parent so it can sum the total portfolio value. */
  onValue: (address: string, usd: number) => void
}

/**
 * One holding row in the wallet Portfolio. Reuses `useTokenData` (name/symbol/imageUri/priceUsd)
 * so logos, price source, and the IPFS-gateway fallback chain are identical to the feed/token
 * page — no second, drifting copy of that logic.
 */
export function PortfolioTokenRow({ address, balance, hideBalance, onValue }: Props) {
  const { token, isLoading } = useTokenData(address)
  const priceUsd = token?.priceUsd ?? 0
  const usdValue = (Number(balance) / 1e18) * priceUsd
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue

  useEffect(() => { onValueRef.current(address, usdValue) }, [address, usdValue])
  // Zero out this row's contribution if it unmounts (token drops out of the held list),
  // so a stale value never lingers in the parent's running total.
  useEffect(() => () => onValueRef.current(address, 0), [address])

  if (isLoading || !token) {
    return <div className="h-[64px] rounded-xl mb-2 shimmer" style={{ border: '1px solid var(--border)' }} />
  }

  const hue = parseInt(address.slice(2, 6), 16) % 360
  const grad = `linear-gradient(135deg,hsl(${hue},70%,60%),hsl(${(hue + 120) % 360},65%,50%))`
  const graduated = token.state?.graduated

  return (
    <Link to={`/token/${address}`} className="flex items-center gap-3 p-3 rounded-xl mb-2 no-underline transition-colors group"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="relative flex-shrink-0">
        {token.imageUri
          ? <img src={ipfsToHttp(token.imageUri)} className="w-10 h-10 rounded-full object-cover"
              style={{ border: '1.5px solid var(--border2)' }}
              onError={(e) => {
                const t = e.target as HTMLImageElement
                const next = nextIpfsGateway(t.src)
                if (next) t.src = next; else t.style.display = 'none'
              }} />
          : <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: grad }}>
              {token.symbol?.slice(0, 2) || '??'}
            </div>}
        {graduated && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: '#f59e0b', border: '1.5px solid var(--surface2)' }}>
            <Trophy size={8} color="#000" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: 'var(--text1)' }}>{token.symbol || '???'}</div>
        <div className="text-xs truncate" style={{ color: 'var(--text2)' }}>{token.name || 'GlowFun token'}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold" style={{ color: 'var(--text1)' }}>
          {hideBalance ? '••••' : tokensToInputStr(balance, 4)}
        </div>
        <div className="text-xs" style={{ color: 'var(--text2)' }}>
          {hideBalance ? '••••' : (usdValue > 0 ? `$${usdValue.toLocaleString('en', { maximumFractionDigits: 2 })}` : '—')}
        </div>
      </div>
      <ArrowUpRight size={13} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text3)' }} />
    </Link>
  )
}

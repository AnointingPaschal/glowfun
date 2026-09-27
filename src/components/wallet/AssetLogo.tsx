/**
 * Logo badge for the wallet's default assets (USDC, EURC, USYC, cirBTC). Renders the real
 * brand mark when a `src` is given (see src/constants/walletAssets.ts — CoinGecko's asset
 * CDN, the same source most wallets/explorers pull from), and falls back to a plain colored
 * monogram badge if that image ever fails to load — same "never show a broken <img>" rule
 * TokenCard already follows for platform tokens (there via IPFS-gateway fallbacks; here via
 * a single external URL with a static fallback, since there's no gateway chain to retry).
 */
type AssetSymbol = 'USDC' | 'EURC' | 'USYC' | 'cirBTC'

const STYLE: Record<AssetSymbol, { bg: string; fg: string; glyph: string }> = {
  USDC:   { bg: '#2775CA', fg: '#ffffff', glyph: '$' },
  EURC:   { bg: '#1F5FA8', fg: '#FDE68A', glyph: '€' },
  USYC:   { bg: '#0F172A', fg: '#22D3EE', glyph: 'Y' },
  cirBTC: { bg: '#F7931A', fg: '#111111', glyph: '₿' },
}

export function AssetLogo({ symbol, size = 40, src }: { symbol: AssetSymbol; size?: number; src?: string }) {
  const s = STYLE[symbol]
  const badge = (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-bold select-none"
      style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size * 0.42, border: '1.5px solid var(--border2)' }}
      aria-label={symbol}
    >
      {s.glyph}
    </div>
  )
  if (!src) return badge

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Fallback badge sits underneath; the real logo covers it once loaded, and
          disappears (revealing the badge) if the image 404s. */}
      <div className="absolute inset-0">{badge}</div>
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        className="absolute inset-0 rounded-full object-cover"
        style={{ border: '1.5px solid var(--border2)' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

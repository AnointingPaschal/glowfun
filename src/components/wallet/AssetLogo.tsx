/**
 * Simple, always-rendering monogram badges for the Circle-issued assets shown in the
 * wallet (USDC, EURC, USYC, cirBTC). Deliberately not a fetched brand-image URL: this app
 * has no reliable place to host/verify official logo art for assets on a mainnet that only
 * launched weeks ago, and a broken <img> looks worse than no image at all. This mirrors the
 * pattern already used for platform tokens without an image (TokenCard's initials avatar) —
 * a colored circle + a short glyph, sized and bordered the same as the rest of the wallet.
 */
type AssetSymbol = 'USDC' | 'EURC' | 'USYC' | 'cirBTC'

const STYLE: Record<AssetSymbol, { bg: string; fg: string; glyph: string }> = {
  USDC:   { bg: '#2775CA', fg: '#ffffff', glyph: '$' },
  EURC:   { bg: '#1F5FA8', fg: '#FDE68A', glyph: '€' },
  USYC:   { bg: '#0F172A', fg: '#22D3EE', glyph: 'Y' },
  cirBTC: { bg: '#F7931A', fg: '#111111', glyph: '₿' },
}

export function AssetLogo({ symbol, size = 40 }: { symbol: AssetSymbol; size?: number }) {
  const s = STYLE[symbol]
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-bold select-none"
      style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size * 0.42, border: '1.5px solid var(--border2)' }}
      aria-label={symbol}
    >
      {s.glyph}
    </div>
  )
}

export const formatAddress = (addr: string): string =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''

/**
 * Convert ipfs:// URIs to an https:// Cloudflare gateway URL so browsers can load them.
 * Passes through http/https URLs unchanged. Safe to call with undefined/empty.
 */
export const ipfsToHttp = (uri: string | undefined | null): string => {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) return `https://cloudflare-ipfs.com/ipfs/${uri.slice(7)}`
  return uri
}

export const formatUsdc = (raw: bigint | number | undefined): string => {
  if (raw === undefined || raw === null) return '$0.00'
  const n = typeof raw === 'bigint' ? Number(raw) / 1e6 : raw
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  if (n >= 0.0001) return `$${n.toFixed(6)}`
  return `$${n.toFixed(8)}`
}

export const formatTokens = (raw: bigint | undefined): string => {
  if (raw === undefined || raw === null) return '0'
  const n = Number(raw) / 1e18
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

/**
 * Format a token price from the contract's price format.
 * Contract returns: virtualUsdcReserves * 1e30 / virtualTokenReserves
 * USDC has 6 decimals, tokens have 18 decimals.
 * Real price in USD = raw / 1e30 * 1e6 / 1e18 = raw / 1e42
 * 
 * Example: at launch, ~30000e6 * 1e30 / 1073000191e18 ≈ 2.8e7
 *   => 2.8e7 / 1e42 = 2.8e-35 — this is the actual price in USD per token
 * 
 * We display this as a human-readable string without scientific notation.
 */
export const formatPrice = (raw: bigint | undefined): string => {
  if (raw === undefined || raw === null) return '0'
  // Convert to actual USD price
  const n = Number(raw) / 1e42
  return formatPriceNumber(n)
}

/**
 * Format a raw JS number as a price, always human-readable (no e-notation).
 */
export const formatPriceNumber = (n: number): string => {
  if (n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.01) return n.toFixed(6)
  if (n >= 0.0001) return n.toFixed(8)
  if (n >= 0.000001) return n.toFixed(10)
  // For very small numbers (bonding curve just launched), use subscript notation
  // e.g. 0.000000000000001234 → "0.0₁₄1234"
  if (n > 0) {
    // Count leading zeros after decimal point
    const str = n.toFixed(20).replace(/0+$/, '')
    const match = str.match(/^0\.(0+)([1-9].*)$/)
    if (match) {
      const zeros = match[1].length
      const sig = match[2].slice(0, 6)
      if (zeros > 4) {
        // Use subscript zero notation: 0.0₍n₎significant
        const subscriptDigits: Record<string, string> = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' }
        const sub = zeros.toString().split('').map(d => subscriptDigits[d]).join('')
        return `0.0${sub}${sig}`
      }
    }
    return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
  }
  return '0'
}

export const formatProgress = (raw: bigint | undefined): number => {
  if (raw === undefined || raw === null) return 0
  return (Number(raw) / 1e18) * 100
}

export const parseUsdc = (val: string): bigint => {
  if (!val || isNaN(parseFloat(val))) return 0n
  return BigInt(Math.floor(parseFloat(val) * 1e6))
}

export const parseTokens = (val: string): bigint => {
  if (!val || isNaN(parseFloat(val))) return 0n
  const parts = val.split('.')
  const whole = BigInt(parts[0] || '0')
  const decimal = (parts[1] ?? '').slice(0, 18).padEnd(18, '0')
  return whole * 10n ** 18n + BigInt(decimal)
}

export const timeAgo = (ts: number | bigint | undefined): string => {
  if (!ts) return 'recently'
  const secs = Math.floor(Date.now() / 1000) - Number(ts)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

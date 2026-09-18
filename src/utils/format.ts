export const formatAddress = (addr: string): string =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ''

export const formatUsdc = (raw: bigint | undefined): string => {
  if (raw === undefined || raw === null) return '$0.00'
  const n = Number(raw) / 1e6
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

export const formatTokens = (raw: bigint | undefined): string => {
  if (raw === undefined || raw === null) return '0'
  const n = Number(raw) / 1e18
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  return n.toFixed(4)
}

export const formatPrice = (raw: bigint | undefined): string => {
  if (raw === undefined || raw === null) return '0'
  // price is in USDC per token, scaled by 1e30 (usdcReserves*1e30/tokenReserves)
  // to get USDC per token: raw / 1e30 * 1e6 (USDC 6 decimals) / 1e18 (token 18 decimals)
  // = raw / 1e42
  const n = Number(raw) / 1e42
  if (n < 0.000001) return n.toExponential(3)
  if (n < 0.01) return n.toFixed(8)
  return n.toFixed(6)
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

/**
 * Runtime constants — read from the live ConfigContext store (KV-backed).
 * These are getter functions so they always return the latest value after
 * the config has loaded from /api/config.
 *
 * For React components, prefer `useConfig()` directly.
 * These getters exist for non-React code (inner hooks, utility fns, etc.)
 */
import { getConfig } from '@/context/ConfigContext'

export const getFactoryAddress  = () => getConfig().FACTORY_ADDRESS
export const getUsdcAddress     = () => getConfig().USDC_ADDRESS
export const getChainId         = () => getConfig().CHAIN_ID
export const getExplorerBase    = () => getConfig().EXPLORER_BASE

// Legacy static exports — kept for backward compatibility with code that
// imports these directly. They read from the store so they update after load.
// Note: these are evaluated at import time the FIRST time the module loads.
// For dynamic reads, use the getter functions above or useConfig() in components.
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ?? '') as `0x${string}`
export const USDC_ADDRESS    = (import.meta.env.VITE_USDC_ADDRESS ?? '0x3600000000000000000000000000000000000000') as `0x${string}`
export const CHAIN_ID        = Number(import.meta.env.VITE_CHAIN_ID ?? 5042)

// Other Circle-issued assets live on Arc Mainnet. Sourced from Arc's own docs
// (docs.arc.io/arc/references/contract-addresses) — Arc mainnet is only weeks old at the time
// these were added, so treat them as best-effort, not gospel: verify against that page (or
// Arc's explorer) before relying on them for anything beyond read-only balance display, and
// override via the matching VITE_* env var if Circle updates them.
export const EURC_ADDRESS    = (import.meta.env.VITE_EURC_ADDRESS ?? '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1') as `0x${string}`
export const USYC_ADDRESS    = (import.meta.env.VITE_USYC_ADDRESS ?? '0x8a5D989Bbb96929F689B0200f435f53dA42bF490') as `0x${string}`
export const CIRBTC_ADDRESS  = (import.meta.env.VITE_CIRBTC_ADDRESS ?? '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0') as `0x${string}`
export const CIRCLE_APP_ID   = import.meta.env.VITE_CIRCLE_APP_ID ?? ''
export const ADMIN_SECRET    = import.meta.env.VITE_ADMIN_SECRET ?? ''
export const EXPLORER_BASE   = 'https://explorer.arc.io'

// Curve constants (not configurable at runtime)
export const BPS_DENOMINATOR      = 10_000n
export const GRADUATION_THRESHOLD = 69_000_000_000n
export const VIRTUAL_USDC         = 30_000_000_000n
export const VIRTUAL_TOKENS       = 1_073_000_191n * 10n ** 18n
export const CURVE_SUPPLY         = 800_000_000n * 10n ** 18n

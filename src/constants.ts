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
export const CIRCLE_APP_ID   = import.meta.env.VITE_CIRCLE_APP_ID ?? ''
export const ADMIN_SECRET    = import.meta.env.VITE_ADMIN_SECRET ?? ''
export const EXPLORER_BASE   = 'https://explorer.arc.io'

// Curve constants (not configurable at runtime)
export const BPS_DENOMINATOR      = 10_000n
export const GRADUATION_THRESHOLD = 69_000_000_000n
export const VIRTUAL_USDC         = 30_000_000_000n
export const VIRTUAL_TOKENS       = 1_073_000_191n * 10n ** 18n
export const CURVE_SUPPLY         = 800_000_000n * 10n ** 18n

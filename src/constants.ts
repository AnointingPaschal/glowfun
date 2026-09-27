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

// Uniswap V3 periphery for the wallet's Swap feature and the DEX buy/sell panels.
// Sourced from @uniswap/sdk-core's own published ARC_ADDRESSES for chainId 5042
// (installed directly from the npm registry and inspected — the same canonical source
// Uniswap's own tooling/SDKs use — not guessed or carried over from another chain):
//   v3CoreFactoryAddress:            0xf0db7b58379503491d857db50ac9ece64c653918
//   nonfungiblePositionManagerAddress: 0x39654a85a4c05127f5fd6ed22caec077a0fb1377
//   swapRouter02Address:             0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77
//   quoterAddress (QuoterV2):        0x7dfd4f31be6814d2906bde155c3e1b146eac1468
// The factory/position-manager pair matches what GlowFunFactory_V3 itself trusts on-chain
// (read live via uniswapV3Factory()/nonfungiblePositionMgr()) and the USDC predeploy address
// in that same source matches this codebase's own hardcoded ARC_USDC exactly — cross-checked,
// not assumed. Still overridable via VITE_SWAP_ROUTER_ADDRESS/VITE_QUOTER_ADDRESS if Circle/
// Uniswap ever redeploys.
export const SWAP_ROUTER_ADDRESS = (import.meta.env.VITE_SWAP_ROUTER_ADDRESS ?? '0x53Bf6B0684eC7Ef91E1387Da3d1A1769bC5a6F77') as `0x${string}` | ''
export const QUOTER_ADDRESS      = (import.meta.env.VITE_QUOTER_ADDRESS ?? '0x7dFd4F31Be6814D2906BDE155C3e1b146EaC1468') as `0x${string}` | ''

// Circle CCTP V2 — cross-chain USDC bridging. TokenMessengerV2/MessageTransmitterV2 addresses
// below are Circle's canonical, deterministic-deployment addresses, identical across every
// CCTP-supported chain (confirmed directly against developers.circle.com/cctp/evm-smart-contracts),
// so these are trustworthy independent of Arc specifically. Arc's CCTP domain ID (26) is from
// Arc's own docs. BUT: see CCTP_BRIDGE_DISABLED_REASON below — the actual burn is kept
// disabled in the UI regardless of these being correct.
export const CCTP_TOKEN_MESSENGER_V2    = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as `0x${string}`
export const CCTP_MESSAGE_TRANSMITTER_V2 = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64' as `0x${string}`
export const CCTP_ARC_DOMAIN = 26

// As of when this was added, Circle's own attestation indexer has an open, unacknowledged bug
// specific to Arc's CCTP domain: burns confirm on-chain but no attestation is ever issued, so
// the destination-chain mint never arrives. Real funds are already stuck because of it
// (github.com/circlefin/arc-node/issues/200 — 1,252+ USDC frozen 69+ days as of filing; the
// same gap is open on testnet as github.com/circlefin/evm-cctp-contracts/issues/110). A CCTP
// burn cannot be undone once it lands on-chain, so the Bridge tab shows this reason instead of
// a burn button until it's fixed. Set to '' once Circle resolves it and you've verified that
// yourself, to re-enable the live flow.
export const CCTP_BRIDGE_DISABLED_REASON =
  "Circle's own attestation service currently has an unresolved bug for Arc (burns confirm on-chain but never get attested, so the mint on the other side never arrives — real USDC is already stuck this way). Bridging out is disabled here until that's fixed, since a CCTP burn can't be reversed."
export const CIRCLE_APP_ID   = import.meta.env.VITE_CIRCLE_APP_ID ?? ''
export const ADMIN_SECRET    = import.meta.env.VITE_ADMIN_SECRET ?? ''
export const EXPLORER_BASE   = 'https://explorer.arc.io'

// Curve constants (not configurable at runtime)
export const BPS_DENOMINATOR      = 10_000n
export const GRADUATION_THRESHOLD = 69_000_000_000n
export const VIRTUAL_USDC         = 30_000_000_000n
export const VIRTUAL_TOKENS       = 1_073_000_191n * 10n ** 18n
export const CURVE_SUPPLY         = 800_000_000n * 10n ** 18n

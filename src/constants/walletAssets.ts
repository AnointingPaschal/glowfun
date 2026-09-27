import { USDC_ADDRESS, EURC_ADDRESS, USYC_ADDRESS, CIRBTC_ADDRESS } from '@/constants'

/**
 * The wallet's default asset list — always shown in Holdings, whether or not the
 * connected wallet actually holds a balance, unlike GlowFun-launched tokens (which only
 * show up once you actually hold one — see useHeldTokens).
 *
 * `logo` points at each asset's real, publicly-hosted brand mark (CoinGecko's asset CDN,
 * the same source most wallets/explorers pull from) rather than a guessed URL — AssetLogo
 * falls back to a plain colored badge if it ever 404s, so a bad link never shows a broken
 * image. EURC/USYC/cirBTC are Circle-issued assets that only exist on Arc Mainnet as of a
 * few weeks before this was written; double-check their addresses against Arc's own docs
 * (docs.arc.io/arc/references/contract-addresses) if anything looks off.
 */
export interface WalletAsset {
  symbol: 'USDC' | 'EURC' | 'USYC' | 'cirBTC'
  slug: string           // lowercase, used in the /wallet/asset/:slug route
  name: string
  address: `0x${string}`
  decimals: number
  logo: string
  unitPrefix?: string    // e.g. '€' for EURC — shown before the raw balance, no $ implied
  blurb: string
}

export const WALLET_ASSETS: WalletAsset[] = [
  {
    symbol: 'USDC', slug: 'usdc', name: 'USD Coin', address: USDC_ADDRESS, decimals: 6,
    logo: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
    blurb: "Arc's native gas and settlement asset — every transaction fee on Arc is paid in USDC.",
  },
  {
    symbol: 'EURC', slug: 'eurc', name: 'Euro Coin', address: EURC_ADDRESS, decimals: 6,
    logo: 'https://assets.coingecko.com/coins/images/26045/standard/EURC.png',
    unitPrefix: '€',
    blurb: "Circle's euro-denominated stablecoin, native to Arc alongside USDC.",
  },
  {
    symbol: 'USYC', slug: 'usyc', name: 'Circle USYC', address: USYC_ADDRESS, decimals: 6,
    logo: 'https://assets.coingecko.com/coins/images/51054/standard/Hashnote_SDYC_200x200.png',
    blurb: 'Tokenized shares of a short-term treasury money-market fund (Hashnote/Circle). Yield-bearing — share value drifts above $1 over time rather than staying pegged.',
  },
  {
    symbol: 'cirBTC', slug: 'cirbtc', name: 'Circle Wrapped Bitcoin', address: CIRBTC_ADDRESS, decimals: 8,
    logo: 'https://assets.coingecko.com/coins/images/102172745/standard/cirbtc.jpg',
    blurb: "Circle's institutional wrapped-Bitcoin product, backed 1:1 by BTC reserves.",
  },
]

export const getWalletAsset = (slug: string | undefined) =>
  WALLET_ASSETS.find((a) => a.slug === (slug ?? '').toLowerCase())

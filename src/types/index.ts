export interface TokenMeta {
  address: `0x${string}`
  name: string
  symbol: string
  description: string
  imageUri: string
  twitter: string
  telegram: string
  website: string
  creator: `0x${string}`
  createdAt: number
}

export interface TokenState {
  creator: `0x${string}`
  virtualUsdcReserves: bigint
  virtualTokenReserves: bigint
  realUsdcRaised: bigint
  realTokensSold: bigint
  graduated: boolean
  createdAt: bigint
  // V2 extended fields
  curveTokens?: bigint
  graduationTokens?: bigint
  creatorTokens?: bigint
  totalSupply?: bigint
  tokenGraduationThreshold?: bigint   // per-token graduation target (set at launch)
  creatorTokensLocked?: boolean
  creatorLockExpiry?: bigint
}

export interface MarketData {
  priceUsd: number
  mcapUsd: number
  volumeUsd: number
  liquidityUsd: number
  change5m?: number
  change1h?: number
  change6h?: number
  change24h?: number
  pairAddress?: string
  source: string
}

export interface TokenInfo extends TokenMeta {
  totalSupply: bigint
  state: TokenState
  price: bigint
  marketCap: bigint
  progress: bigint
  market?: MarketData   // live external market data overlay (from DexScreener/GeckoTerminal)
}

export type TradeMode = 'buy' | 'sell'

export interface WalletCredentials {
  userToken: string
  encryptionKey: string
}

export interface CircleWallet {
  id: string
  address: string
  blockchain: string
  accountType: string
  state: string
}

export interface AdminSettings {
  factoryAddress: string
  usdcAddress: string
  feeRecipient: string
  graduationRecipient: string
  creationFee: string
  protocolFeeBps: string
  graduationThreshold: string
  walletConnectProjectId: string
  circleAppId: string
  siteTitle: string
  siteDescription: string
  twitterHandle: string
}

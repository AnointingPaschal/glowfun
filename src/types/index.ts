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
}

export interface TokenInfo extends TokenMeta {
  state: TokenState
  price: bigint
  marketCap: bigint
  progress: bigint
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

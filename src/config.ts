import { createConfig, http } from 'wagmi'
import { arc } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'

export const ARC_CHAIN_ID = 5042

export const config = createConfig(
  getDefaultConfig({
    chains: [arc],
    transports: {
      [arc.id]: http('https://rpc.mainnet.arc.io'),
    },
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'GlowFun',
    appDescription: 'Launch and trade meme tokens powered by USDC on Arc',
    appUrl: 'https://glowfun.xyz',
    appIcon: 'https://glowfun.xyz/logo.png',
  }),
)

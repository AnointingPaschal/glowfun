import { createConfig, http, fallback } from 'wagmi'
import { arc } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'

export const ARC_CHAIN_ID = 5042

export const config = createConfig(
  getDefaultConfig({
    chains: [arc],
    transports: {
      // Primary RPC first; if it errors, rate-limits or rejects a wide eth_getLogs range, viem retries the
      // next public endpoint from the chain definition instead of failing the page.
      [arc.id]: fallback(
        ['https://rpc.mainnet.arc.io', ...arc.rpcUrls.default.http.filter(u => u !== 'https://rpc.mainnet.arc.io')].map(u => http(u)),
        { retryCount: 1 },
      ),
    },
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'GlowFun',
    appDescription: 'Launch and trade meme tokens powered by USDC on Arc',
    appUrl: 'https://glowfun.xyz',
    appIcon: 'https://glowfun.xyz/logo.png',
  }),
)

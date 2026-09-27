import { createConfig, http, fallback } from 'wagmi'
import { mock } from 'wagmi/connectors'
import { arc } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'

export const ARC_CHAIN_ID = 5042

const base = getDefaultConfig({
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
})

// E2E-only: adds a scriptable mock wallet connector so headless tests can "connect" without a
// real extension. Only compiled in when VITE_E2E=1 is set at build time — never in a normal
// production build (VITE_E2E is unset, so this branch and `wagmi/connectors`' mock() import are
// dead code Vite/Rollup drops). See src/main.tsx for the window.__connect() hook this enables.
const E2E_ACCOUNT = (import.meta.env.VITE_E2E_ACCOUNT ?? '0x000000000000000000000000000000000000dEaD') as `0x${string}`
export const config = import.meta.env.VITE_E2E === '1'
  ? createConfig({ ...base, connectors: [...(base.connectors ?? []), mock({ accounts: [E2E_ACCOUNT] })] })
  : createConfig(base)

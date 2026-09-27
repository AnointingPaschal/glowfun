import './monaco-setup'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { BrowserRouter } from 'react-router-dom'
import { config } from './config'
import App from './App'
import { ConfigProvider } from './context/ConfigContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 10_000 } },
})

// E2E-only test hook: connects the mock wallet configured in src/config.ts. Only wired up when
// VITE_E2E=1 (see config.ts) — dropped from a normal production build entirely.
if (import.meta.env.VITE_E2E === '1') {
  import('wagmi/actions').then(({ connect }) => {
    const mockConnector = config.connectors.find((c) => c.type === 'mock')
    ;(window as any).__connect = () => mockConnector && connect(config, { connector: mockConnector })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          customTheme={{
            '--ck-font-family': '"Space Grotesk", system-ui, sans-serif',
            '--ck-border-radius': '16px',
            '--ck-overlay-background': 'rgba(0, 0, 0, 0.75)',
            '--ck-body-background': 'rgba(12, 12, 22, 0.98)',
            '--ck-body-background-secondary': 'rgba(255,255,255,0.04)',
            '--ck-primary-button-background': 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            '--ck-primary-button-hover-background': 'linear-gradient(135deg, #7c3aed, #db2777)',
          }}
        >
          <BrowserRouter>
            <ConfigProvider>
            <App />
            <Toaster
              position="top-right"
              toastOptions={{ duration: 5000 }}
            />
            </ConfigProvider>
          </BrowserRouter>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

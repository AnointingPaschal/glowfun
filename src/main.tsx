import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { BrowserRouter } from 'react-router-dom'
import { config } from './config'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 10_000 } },
})

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
            <App />
            <Toaster
              position="top-right"
              toastOptions={{ duration: 5000 }}
            />
          </BrowserRouter>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

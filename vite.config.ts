import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@monaco-editor/react', 'qrcode.react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['i3fuuq0ixikki2bh6qw06.preview.studio.arc.io', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['@monaco-editor/react'],
          wagmi: ['wagmi', 'viem'],
          react: ['react', 'react-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 3000,
  },
})

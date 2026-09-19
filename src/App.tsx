import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FeedPage } from '@/pages/FeedPage'
import { LaunchPage } from '@/pages/LaunchPage'
import { TokenPage } from '@/pages/TokenPage'
import { TrendingPage } from '@/pages/DexPage'
import { WalletPage } from '@/pages/WalletPage'
import { AdminPage } from '@/pages/AdminPage'
import { IDEPage } from '@/pages/IDEPage'
import ApiPage from '@/pages/ApiPage'
import { TokenDetailPage } from '@/pages/TokenDetailPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        {/* Dex is now the homepage */}
        <Route path="/" element={<TrendingPage />} />
        <Route path="/feed" element={<FeedPage />} />
        {/* Legacy routes still work */}
        <Route path="/trending" element={<Navigate to="/" replace />} />
        <Route path="/dex" element={<Navigate to="/" replace />} />
        {/* Token detail — full page, not modal */}
        <Route path="/dex/:address" element={<TokenDetailPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/token/:address" element={<TokenPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/ide" element={<IDEPage />} />
        <Route path="/api-docs" element={<ApiPage />} />
      </Routes>
    </Layout>
  )
}

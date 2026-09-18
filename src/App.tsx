import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FeedPage } from '@/pages/FeedPage'
import { LaunchPage } from '@/pages/LaunchPage'
import { TokenPage } from '@/pages/TokenPage'
import { TrendingPage } from '@/pages/TrendingPage'
import { WalletPage } from '@/pages/WalletPage'
import { AdminPage } from '@/pages/AdminPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/token/:address" element={<TokenPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </Layout>
  )
}

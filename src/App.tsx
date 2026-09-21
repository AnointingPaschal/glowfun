import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FeedPage } from '@/pages/FeedPage'
import { LaunchPage } from '@/pages/LaunchPage'
import { TokenPage } from '@/pages/TokenPage'
import { WalletPage } from '@/pages/WalletPage'
import { AdminPage } from '@/pages/AdminPage'
import { IDEPage } from '@/pages/IDEPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"              element={<FeedPage />} />
        <Route path="/feed"          element={<Navigate to="/" replace />} />
        <Route path="/trending"      element={<Navigate to="/" replace />} />
        <Route path="/dex"           element={<Navigate to="/" replace />} />
        <Route path="/dex/:address"  element={<Navigate to="/" replace />} />
        <Route path="/token/:address" element={<TokenPage />} />
        <Route path="/launch"        element={<LaunchPage />} />
        <Route path="/wallet"        element={<WalletPage />} />
        <Route path="/admin"         element={<AdminPage />} />
        <Route path="/ide"           element={<IDEPage />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

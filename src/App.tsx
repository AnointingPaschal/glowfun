import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FeedPage } from '@/pages/FeedPage'
import { LaunchPage } from '@/pages/LaunchPage'
import { TokenPage } from '@/pages/TokenPage'
import { WalletPage } from '@/pages/WalletPage'
import { AdminPage } from '@/pages/AdminPage'
import { IDEPage } from '@/pages/IDEPage'
import { ToolsHubPage } from '@/pages/tools/ToolsHubPage'
import { BurnPage } from '@/pages/tools/BurnPage'
import { MintPage } from '@/pages/tools/MintPage'
import { VestingPage } from '@/pages/tools/VestingPage'
import { LockPage } from '@/pages/tools/LockPage'
import { LiquidityPage } from '@/pages/tools/LiquidityPage'
import { PayoutsPage } from '@/pages/tools/PayoutsPage'
import { SecurityPage } from '@/pages/tools/SecurityPage'
import { MetadataPage } from '@/pages/tools/MetadataPage'
import { ReferralPage } from '@/pages/tools/ReferralPage'

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
        <Route path="/tools"          element={<ToolsHubPage />} />
        <Route path="/tools/burn"     element={<BurnPage />} />
        <Route path="/tools/mint"     element={<MintPage />} />
        <Route path="/tools/vesting"  element={<VestingPage />} />
        <Route path="/tools/lock"     element={<LockPage />} />
        <Route path="/tools/liquidity" element={<LiquidityPage />} />
        <Route path="/tools/payouts" element={<PayoutsPage />} />
        <Route path="/tools/security" element={<SecurityPage />} />
        <Route path="/tools/metadata" element={<MetadataPage />} />
        <Route path="/tools/referral" element={<ReferralPage />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

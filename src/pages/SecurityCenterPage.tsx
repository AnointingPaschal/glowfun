import { ShieldCheck } from 'lucide-react'
import { useAccount } from 'wagmi'
import { PerTokenTool } from '@/components/tools/ToolPageShell'
import {
  OwnershipPanel, CreatorRolePanel, ActivityLogPanel, SecurityScorePanel,
} from '@/components/tools/SecurityCenterPanels'

/**
 * Public, read-only Security Center — for anyone deciding whether to hold or buy a
 * token, not for the creator managing it. No transfer forms, no platform pause, no
 * timelock setup guide: those are admin actions and live under the creator's own
 * Tools > Security page instead, gated to whichever wallet actually holds the role.
 * This page only ever shows information anyone can already read on-chain, laid out
 * so they don't have to.
 */
export function SecurityCenterPage() {
  const { address: wallet } = useAccount()
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <ShieldCheck size={20} style={{ color: '#22c55e' }} />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-black" style={{ letterSpacing: '-0.03em', color: 'var(--text1)' }}>Security Center</h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text2)' }}>
            Check whether a token — and the platform it launched from — is protected by a multisig, and see every admin action that's ever happened, straight from on-chain data. Read-only: nothing here can change anything.
          </p>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text2)' }}>Platform</div>
        <div className="space-y-4">
          <OwnershipPanel wallet={wallet} showTransferForm={false} />
          <ActivityLogPanel />
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text2)' }}>A specific token</div>
        <PerTokenTool>
          {({ token, info, wallet: w, refetch }) => (
            <div className="space-y-4">
              <SecurityScorePanel token={token} info={info} curve={null} wallet={w} refetch={refetch} />
              <CreatorRolePanel token={token} info={info} curve={null} wallet={w} refetch={refetch} showTransferForm={false} />
            </div>
          )}
        </PerTokenTool>
      </div>
    </div>
  )
}

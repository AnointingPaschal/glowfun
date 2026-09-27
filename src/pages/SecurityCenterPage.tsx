import { ShieldCheck } from 'lucide-react'
import { PerTokenTool } from '@/components/tools/ToolPageShell'
import { CreatorRolePanel, SecurityScorePanel } from '@/components/tools/SecurityCenterPanels'

/**
 * Public, read-only Security Center — for anyone deciding whether to hold or buy a
 * token, not for the creator or platform admin managing it. Deliberately narrow:
 * only per-token signals a holder actually needs (is the creator wallet a multisig,
 * is the allocation still locked, is supply capped), in plain language. No factory-
 * level internals (the owner address, what onlyOwner functions exist, admin event
 * logs), no transfer forms, no pause controls — those are internal plumbing and
 * live behind the owner/creator gate on the Tools > Security page instead.
 */
export function SecurityCenterPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <ShieldCheck size={20} style={{ color: '#22c55e' }} />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-black" style={{ letterSpacing: '-0.03em', color: 'var(--text1)' }}>Security Center</h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text2)' }}>
            Check a token before you buy or hold it: whether its creator wallet is a multisig, whether its allocation is still locked, and whether supply is capped. Read-only — nothing here can change anything.
          </p>
        </div>
      </div>

      <PerTokenTool>
        {({ token, info, wallet, refetch }) => (
          <div className="space-y-4">
            <SecurityScorePanel token={token} info={info} curve={null} wallet={wallet} refetch={refetch} />
            <CreatorRolePanel token={token} info={info} curve={null} wallet={wallet} refetch={refetch} showTransferForm={false} />
          </div>
        )}
      </PerTokenTool>
    </div>
  )
}

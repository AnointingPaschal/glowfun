import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, KeyRound, Users, Hourglass, ArrowUpRight } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { ControlsPanel, Note } from '@/components/tools/panels'
import {
  OwnershipPanel, CreatorRolePanel, PlatformCircuitBreakerPanel, ActivityLogPanel, TimelockPanel,
} from '@/components/tools/SecurityCenterPanels'
import { useFactoryOwner } from '@/hooks/useFactoryAdmin'

type Tab = 'token' | 'platform' | 'timelock'

export function SecurityPage() {
  const { address: wallet } = useAccount()
  const { isOwner } = useFactoryOwner(wallet)
  const [tab, setTab] = useState<Tab>('token')

  // Platform-wide admin (ownership transfer, emergency pause) and the timelock setup
  // guide are only ever useful — and only ever actionable — for the factory owner.
  // Showing them to every visitor just surfaces confusing, permanently-disabled
  // buttons, so the tabs themselves are hidden unless the connected wallet is it.
  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'token', label: 'This token', icon: KeyRound },
    ...(isOwner ? [
      { id: 'platform' as const, label: 'Platform-wide (owner)', icon: Users },
      { id: 'timelock' as const, label: 'Timelock (owner)', icon: Hourglass },
    ] : []),
  ]
  const activeTab: Tab = TABS.some((t) => t.id === tab) ? tab : 'token'

  return (
    <ToolPageShell
      icon={ShieldAlert} tone="#f59e0b" title="Creator security tools"
      tagline="Manage this token's creator role and, if you're the factory owner, platform-wide admin — a stolen key here is what actually diverts funds, not a contract bug."
      about={<>
        <p><b>Looking to check whether a token is safe to hold?</b> This page is for creators managing their own token. See the <Link to="/security" className="no-underline font-semibold inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>public Security Center <ArrowUpRight size={11} /></Link> for a read-only view anyone can use.</p>
        <p><b>Multisig</b> isn't a feature of the token contract — it's a property of <i>which wallet</i> holds a role. GlowFun's contracts only ever check <code>msg.sender == creator</code> or <code>owner()</code>. If that address is a Safe instead of a personal key, every gated action already inherits the Safe's approval threshold, for free.</p>
        <p>Two roles matter for a token: its <b>immutable creator</b> (mint/pause/blacklist, fixed forever) and the factory's <b>mutable creator record</b> (metadata/unlock/force-graduate/bonus — movable to a Safe right now).{isOwner && <> The <b>factory owner</b> is separate again, and controls the whole platform — that's why you're seeing the extra tabs below.</>}</p>
      </>}
    >
      {TABS.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
              style={activeTab === id ? { background: 'rgba(245,158,11,0.14)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' } : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'platform' && isOwner && (
        <div className="space-y-4">
          <OwnershipPanel wallet={wallet} />
          <PlatformCircuitBreakerPanel wallet={wallet} />
          <ActivityLogPanel />
        </div>
      )}
      {activeTab === 'timelock' && isOwner && <TimelockPanel wallet={wallet} />}
      {activeTab === 'token' && (
        <PerTokenTool>
          {({ token, info, wallet: w, refetch }) => (
            <div className="space-y-4">
              <CreatorRolePanel token={token} info={info} curve={null} wallet={w} refetch={refetch} />
              {(info.pausable || info.hasBlacklist) ? (
                <ControlsPanel token={token} info={info} curve={null} wallet={w} refetch={refetch} />
              ) : (
                <Note>{info.symbol || 'This token'} wasn't launched with pause or blacklist controls — there's nothing to configure here beyond the wallet-security checks above.</Note>
              )}
            </div>
          )}
        </PerTokenTool>
      )}
    </ToolPageShell>
  )
}

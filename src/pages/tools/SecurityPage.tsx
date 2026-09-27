import { useState } from 'react'
import { ShieldAlert, KeyRound, Users, Activity, Hourglass } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { ControlsPanel, Note } from '@/components/tools/panels'
import {
  OwnershipPanel, CreatorRolePanel, PlatformCircuitBreakerPanel, ActivityLogPanel, SecurityScorePanel, TimelockPanel,
} from '@/components/tools/SecurityCenterPanels'

type Tab = 'token' | 'platform' | 'log' | 'timelock'
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'token',    label: 'This token',    icon: KeyRound },
  { id: 'platform', label: 'Platform-wide', icon: Users },
  { id: 'log',      label: 'Activity log',  icon: Activity },
  { id: 'timelock', label: 'Timelock',      icon: Hourglass },
]

export function SecurityPage() {
  const { address: wallet } = useAccount()
  const [tab, setTab] = useState<Tab>('token')
  return (
    <ToolPageShell
      icon={ShieldAlert} tone="#f59e0b" title="Security Center"
      tagline="Everything that protects this token and the platform from a stolen key or a malicious admin call — multisig status, ownership, an on-chain audit trail, and how to add a timelock."
      about={<>
        <p><b>The real risk here isn't a bug in the contract</b> — mint, burn, pause and blacklist are all correctly gated. It's a single private key (creator or owner) being phished, leaked, or stolen, then used to mint and dump, or blacklist and disrupt.</p>
        <p><b>Multisig</b> isn't a feature of the token contract — it's a property of <i>which wallet</i> holds a role. GlowFun's contracts only ever check <code>msg.sender == creator</code> or <code>owner()</code>. If that address is a Safe instead of a personal key, every gated action already inherits the Safe's approval threshold, for free.</p>
        <p><b>A timelock</b> adds a mandatory public delay on top of that, so even a fully-approved malicious action can be caught before it executes.</p>
        <p>Two roles matter for a token: its <b>immutable creator</b> (mint/pause/blacklist, fixed forever) and the factory's <b>mutable creator record</b> (metadata/unlock/force-graduate/bonus — movable to a Safe right now). The <b>factory owner</b> is separate again, and controls the whole platform.</p>
      </>}
    >
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
            style={tab === id ? { background: 'rgba(245,158,11,0.14)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' } : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {tab === 'platform' && (
        <div className="space-y-4">
          <OwnershipPanel wallet={wallet} />
          <PlatformCircuitBreakerPanel wallet={wallet} />
        </div>
      )}
      {tab === 'log' && <ActivityLogPanel />}
      {tab === 'timelock' && <TimelockPanel wallet={wallet} />}
      {tab === 'token' && (
        <PerTokenTool>
          {({ token, info, wallet: w, refetch }) => (
            <div className="space-y-4">
              <SecurityScorePanel token={token} info={info} curve={null} refetch={refetch} />
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

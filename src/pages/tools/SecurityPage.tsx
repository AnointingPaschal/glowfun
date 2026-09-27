import { ShieldAlert } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { ControlsPanel, MultisigPanel, Note } from '@/components/tools/panels'

export function SecurityPage() {
  return (
    <ToolPageShell
      icon={ShieldAlert} tone="#f59e0b" title="Security & multisig"
      tagline="Pause transfers, manage the blacklist, and understand exactly who can do either of those to this token."
      about={<>
        <p><b>Pause / unpause</b> and <b>blacklist</b> only exist if the token was launched with those features on — most meme launches don't need them, but they're common on tokens meant to comply with something (a points system, a restricted sale, recoverable-from-exploit design).</p>
        <p><b>Multisig</b> isn't a feature of the token contract itself — it's a property of <i>which wallet</i> holds the creator role. GlowFun's contracts only ever check <code>msg.sender == creator</code>; they have no concept of an approval threshold on their own.</p>
        <p>If that creator address is a Safe (or similar) instead of a personal key, every one of these actions inherits the Safe's own approval rules for free.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, refetch }) => (
          <div className="space-y-4">
            <MultisigPanel token={token} info={info} curve={null} refetch={refetch} />
            {(info.pausable || info.hasBlacklist) ? (
              <ControlsPanel token={token} info={info} curve={null} refetch={refetch} />
            ) : (
              <Note>${info.symbol || 'This token'} wasn't launched with pause or blacklist controls — there's nothing to configure here beyond the wallet-security check above.</Note>
            )}
          </div>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

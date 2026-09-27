import { Lock } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { CreatorLockPanel, Note } from '@/components/tools/panels'

export function LockPage() {
  return (
    <ToolPageShell
      icon={Lock} tone="#22c55e" title="Creator token lock"
      tagline="The simple, single-date time-lock on the creator's own allocation — separate from vesting, and from the LP lock."
      about={<>
        <p>Some tokens give the creator a lump-sum allocation that's held by the factory until a single unlock date, instead of a linear vesting schedule.</p>
        <p>Once that date passes, the creator calls <code>unlockCreatorTokens()</code> once and the whole allocation becomes transferable — there's no partial release.</p>
        <p>This is one of the clearest trust signals a launch can carry: buyers can see the unlock date on-chain and know the team can't dump before it.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, curve, refetch }) => (
          <>
            {(curve?.creatorTokens ?? 0n) > 0n ? (
              <CreatorLockPanel token={token} info={info} curve={curve} refetch={refetch} />
            ) : (
              <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>
                No creator allocation is recorded for ${info.symbol || 'this token'} — either it wasn't launched with one, or it uses vesting instead.
              </div>
            )}
            <Note>Not sure which one applies? If the Vesting page shows a schedule, that's the one in effect — this simple lock and vesting aren't used together on the same token.</Note>
          </>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

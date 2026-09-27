import { Link } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { VestingPanel, Note, fmtDate } from '@/components/tools/panels'

/** A launch → cliff → now → fully-vested timeline, purely from the same numbers the panel shows. */
function VestingTimeline({ start, cliff, duration }: { start: number; cliff: number; duration: number }) {
  const now = Date.now() / 1000
  const end = start + duration
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start) / Math.max(1, duration)) * 100))
  const marks = [
    { at: start, label: 'Start', color: 'var(--text3)' },
    ...(cliff > 0 ? [{ at: start + cliff, label: 'Cliff', color: '#f59e0b' }] : []),
    { at: Math.min(now, end), label: 'Now', color: '#818cf8' },
    { at: end, label: 'Fully vested', color: '#22c55e' },
  ]
  return (
    <div className="pt-6 pb-2">
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--surface3)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(now)}%`, background: 'linear-gradient(90deg,#f59e0b,#818cf8)' }} />
        {marks.map((m, i) => (
          <div key={i} className="absolute -top-5 -translate-x-1/2 text-center" style={{ left: `${pct(m.at)}%` }}>
            <div className="text-[9px] font-bold whitespace-nowrap" style={{ color: m.color }}>{m.label}</div>
            <div className="w-2 h-2 rounded-full mx-auto mt-1" style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function VestingPage() {
  return (
    <ToolPageShell
      icon={Hourglass} tone="#f59e0b" title="Vesting"
      tagline="Release the creator allocation gradually, on the linear schedule fixed when the token launched."
      about={<>
        <p>Vesting is linear from <code>vestingStart</code> after an optional <code>cliff</code>, reaching 100% at <code>vestingStart + vestingDuration</code>. None of it is claimable before the cliff.</p>
        <p><code>releaseVested()</code> only ever sends what's newly unlocked since the last release — you can call it as often as you like, there's no penalty for claiming late or often.</p>
        <p>The schedule itself is fixed at launch and can't be changed from here — it's a promise to holders that the team can't rewrite.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, refetch }) => info.vesting.total > 0n ? (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <VestingTimeline start={info.vesting.start} cliff={info.vesting.cliff} duration={info.vesting.duration} />
              <Note>Started {fmtDate(info.vesting.start)} · fully vested {fmtDate(info.vesting.start + info.vesting.duration)}</Note>
            </div>
            <VestingPanel token={token} info={info} curve={null} refetch={refetch} />
          </div>
        ) : (
          <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>
            ${info.symbol || 'This token'} has no vesting schedule configured — the creator allocation (if any) is either freely transferable or uses the simpler time-lock instead. Check the <Link to={`/tools/lock?token=${token}`} style={{ color: 'var(--accent)' }}>Creator lock</Link> page.
          </div>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

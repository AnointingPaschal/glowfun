import { GlassCard } from './GlassCard'

export function TokenCardSkeleton() {
  return (
    <GlassCard className="p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <div className="h-4 w-28 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="h-4 w-16 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div className="h-3 w-36 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="h-3 w-full rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="h-1.5 w-full rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      </div>
    </GlassCard>
  )
}

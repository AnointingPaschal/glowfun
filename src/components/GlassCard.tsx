import { forwardRef } from 'react'
import clsx from 'clsx'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'card' | 'inner' | 'pill' | 'dark'
  glow?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'card', glow, style, ...props }, ref) => {
    const base: React.CSSProperties =
      variant === 'dark'
        ? { background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }
        : { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }

    const glowStyle: React.CSSProperties = glow
      ? { boxShadow: '0 4px 20px rgba(99,102,241,0.12), 0 1px 4px rgba(0,0,0,0.06)' }
      : {}

    return (
      <div ref={ref} className={clsx(className)} style={{ ...base, ...glowStyle, ...style }} {...props}/>
    )
  }
)
GlassCard.displayName = 'GlassCard'

import { forwardRef } from 'react'
import clsx from 'clsx'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'card' | 'inner' | 'pill' | 'dark'
  glow?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'card', glow, children, ...props }, ref) => {
    const base = {
      card: {
        background: 'rgba(15, 15, 25, 0.72)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: glow
          ? '0 8px 32px rgba(139,92,246,0.18), 0 0 0 1px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 8px 32px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      inner: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
      },
      pill: {
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
      },
      dark: {
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)',
      },
    }

    return (
      <div
        ref={ref}
        className={clsx('rounded-2xl', className)}
        style={base[variant]}
        {...props}
      >
        {children}
      </div>
    )
  },
)

GlassCard.displayName = 'GlassCard'

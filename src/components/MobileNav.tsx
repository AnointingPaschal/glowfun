import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, TrendingUp, Rocket, Wallet, Code2, Layers } from 'lucide-react'

const NAV = [
  { path: '/', label: 'Dex', icon: Layers },
  { path: '/feed', label: 'Feed', icon: Flame },
  { path: '/launch', label: 'Launch', icon: Rocket },
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/ide', label: 'IDE', icon: Code2 },
]

export function MobileNav() {
  const loc = useLocation()
  // Hide on IDE page since it takes full height
  if (loc.pathname === '/ide' || loc.pathname.startsWith('/dex/')) return null
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: 'rgba(8,8,18,0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {NAV.map(({ path, label, icon: Icon }) => {
          const active = loc.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl no-underline transition-all relative"
              style={{ minWidth: 52 }}
            >
              {active && (
                <motion.div
                  layoutId="mobile-nav-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.15)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                size={18}
                style={{ color: active ? '#a78bfa' : 'rgba(255,255,255,0.35)', position: 'relative' }}
              />
              <span
                className="text-[9px] font-medium relative"
                style={{ color: active ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

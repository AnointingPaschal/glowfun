import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Rocket, Wallet, Menu, X, Zap, Code2, Layers } from 'lucide-react'
import { MobileNav } from './MobileNav'
import { useConfig } from '@/context/ConfigContext'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const NAV_ITEMS = [
  { path: '/', label: 'Dex', icon: Layers },
  { path: '/feed', label: 'Feed', icon: Flame },
  { path: '/launch', label: 'Launch', icon: Rocket },
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/ide', label: 'IDE', icon: Code2 },
]

interface LayoutProps { children: ReactNode }

export function Layout({ children }: LayoutProps) {
  const loc = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isIDE = loc.pathname === '/ide'
  const isFullHeight = isIDE || loc.pathname === '/trending'
  const { SITE_TITLE, SITE_LOGO } = useConfig()

  const siteName = SITE_TITLE || 'GlowFun'

  return (
    <div
      className="min-h-dvh relative overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #0a0a14 0%, #0d0d1a 50%, #08080f 100%)' }}
    >
      {/* Ambient blobs */}
      {!isIDE && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: 'absolute', top: '5%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 70%)', filter: 'blur(70px)' }} />
          <div style={{ position: 'absolute', top: '45%', left: '45%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        </div>
      )}

      {/* Topbar */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(10,10,20,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            {SITE_LOGO ? (
              <img
                src={SITE_LOGO}
                alt={siteName}
                className="w-7 h-7 rounded-lg object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Zap size={14} className="text-white" />
              </div>
            )}
            <span className="text-base font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
              {siteName}
            </span>
            <span className="hidden sm:inline-flex h-4 px-1.5 items-center rounded text-[9px] font-bold uppercase tracking-widest" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
              Mainnet
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = loc.pathname === path
              return (
                <Link
                  key={path}
                  to={path}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium no-underline transition-all"
                  style={{
                    background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
                    color: active ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                    border: active ? '1px solid rgba(139,92,246,0.18)' : '1px solid transparent',
                  }}
                >
                  <Icon size={12} />
                  {label}
                  {label === 'IDE' && (
                    <span className="ml-0.5 text-[7px] px-1 py-px rounded" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                      NEW
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            <ConnectKitButton />
            <button
              className="md:hidden p-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)' }}
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X size={16} className="text-white" /> : <Menu size={16} className="text-white" />}
            </button>
          </div>
        </div>

        {/* Spectral border */}
        <div className="h-[1.5px]" style={{ background: SPECTRAL, opacity: 0.35 }} />
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed top-14 left-0 right-0 z-40 md:hidden p-3"
            style={{
              background: 'rgba(10,10,20,0.97)',
              backdropFilter: 'blur(24px)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-1 no-underline"
                style={{
                  background: loc.pathname === path ? 'rgba(139,92,246,0.1)' : 'transparent',
                  color: loc.pathname === path ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                }}
              >
                <Icon size={16} />
                <span className="text-sm font-medium">{label}</span>
                {label === 'IDE' && (
                  <span className="text-[8px] px-1.5 py-px rounded" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>NEW</span>
                )}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main
        className="relative z-10"
        style={isFullHeight
          ? { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, paddingTop: 56, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }
          : { paddingTop: 80, paddingBottom: 80, paddingLeft: 16, paddingRight: 16 }
        }
      >
        {isFullHeight ? children : <div className="max-w-6xl mx-auto">{children}</div>}
      </main>

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  )
}

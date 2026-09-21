import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Rocket, Wallet, X, Zap, Code2, Menu } from 'lucide-react'
import { MobileNav } from './MobileNav'
import { useConfig } from '@/context/ConfigContext'

const SPECTRAL = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'

const NAV_ITEMS = [
  { path: '/',        label: 'Tokens', icon: Flame  },
  { path: '/launch',  label: 'Launch',  icon: Rocket },
  { path: '/wallet',  label: 'Wallet',  icon: Wallet },
  { path: '/ide',     label: 'IDE',     icon: Code2  },
]

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isIDE = loc.pathname === '/ide'
  const { SITE_TITLE, SITE_LOGO } = useConfig()
  const siteName = SITE_TITLE || 'GlowFun'

  return (
    <div className="min-h-dvh relative overflow-x-hidden" style={{ background: 'var(--bg)' }}>

      {/* Ambient background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-[0.04] blur-[80px]"
          style={{ background: 'radial-gradient(circle,#6366f1,transparent)', top: '-100px', left: '-100px' }}/>
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-[0.03] blur-[80px]"
          style={{ background: 'radial-gradient(circle,#8b5cf6,transparent)', top: '30%', right: '-80px' }}/>
        <div className="absolute w-[300px] h-[300px] rounded-full opacity-[0.025] blur-[60px]"
          style={{ background: 'radial-gradient(circle,#ec4899,transparent)', bottom: '10%', left: '20%' }}/>
      </div>

      {/* Topbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            {SITE_LOGO
              ? <img src={SITE_LOGO} alt={siteName} className="w-7 h-7 rounded-lg object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center glow-accent"
                  style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}>
                  <Zap size={13} color="#fff"/>
                </div>}
            <span className="text-[15px] font-bold" style={{ color:'var(--text1)', letterSpacing:'-0.03em', fontFamily:'Space Grotesk,sans-serif' }}>
              {siteName}
            </span>
            <span className="hidden sm:flex h-[18px] px-1.5 items-center rounded text-[8px] font-bold uppercase tracking-widest"
              style={{ background:'rgba(99,102,241,0.12)', color:'#818cf8', border:'1px solid rgba(99,102,241,0.2)' }}>
              Arc
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = loc.pathname === path
              return (
                <Link key={path} to={path}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium no-underline transition-all"
                  style={{
                    background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
                    color: active ? '#818cf8' : 'var(--text2)',
                    border: active ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  }}>
                  <Icon size={12}/>
                  {label}
                  {label==='IDE' && <span className="ml-0.5 text-[7px] px-1 py-px rounded" style={{ background:'rgba(34,197,94,0.1)',color:'#22c55e' }}>AI</span>}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            <ConnectKitButton/>
            <button className="md:hidden p-2 rounded-lg" style={{ background:'var(--surface2)' }}
              onClick={() => setMobileOpen(v=>!v)}>
              {mobileOpen ? <X size={16} style={{color:'var(--text2)'}}/> : <Menu size={16} style={{color:'var(--text2)'}}/>}
            </button>
          </div>
        </div>
        <div className="h-px" style={{ background: SPECTRAL, opacity: 0.5 }}/>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
            className="fixed top-14 left-0 right-0 z-40 md:hidden p-3 glass"
            style={{ borderTop:'1px solid var(--border)', borderLeft:'none', borderRight:'none', borderBottom:'1px solid var(--border)' }}>
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path} onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-1 no-underline"
                style={{ background: loc.pathname===path ? 'rgba(99,102,241,0.08)' : 'transparent', color: loc.pathname===path ? '#818cf8' : 'var(--text1)' }}>
                <Icon size={16}/>
                <span className="text-sm font-medium">{label}</span>
                {label==='IDE' && <span className="text-[8px] px-1.5 py-px rounded" style={{ background:'rgba(34,197,94,0.1)',color:'#22c55e' }}>AI</span>}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="relative z-10" style={
        isIDE
          ? { position:'fixed', top:0, left:0, right:0, bottom:0, paddingTop:56, display:'flex', flexDirection:'column', overflow:'hidden' }
          : { paddingTop:80, paddingBottom:88, paddingLeft:20, paddingRight:20 }
      }>
        {isIDE ? children : (
          <div style={{ maxWidth:1400, margin:'0 auto' }}>{children}</div>
        )}
      </main>

      <MobileNav/>
    </div>
  )
}

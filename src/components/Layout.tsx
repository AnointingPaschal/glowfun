import { ReactNode, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Rocket, Wallet, X, Zap, Code2, Menu, Wrench, ChevronRight, ShieldCheck, LineChart } from 'lucide-react'
import { MobileNav } from './MobileNav'
import { ToolsMenuModal } from './tools/ToolsMenuModal'
import { useConfig } from '@/context/ConfigContext'
import { captureReferral } from '@/utils/referral'

const SPECTRAL = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'

const NAV_ITEMS = [
  { path: '/',        label: 'Tokens', icon: Flame  },
  { path: '/dex',     label: 'DEX',     icon: LineChart },
  { path: '/launch',  label: 'Launch',  icon: Rocket },
  { path: '/wallet',  label: 'Wallet',  icon: Wallet },
  { path: '/tools',   label: 'Tools',   icon: Wrench },
  { path: '/security',label: 'Security',icon: ShieldCheck },
  { path: '/ide',     label: 'IDE',     icon: Code2  },
]

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toolsModalOpen, setToolsModalOpen] = useState(false)
  const isIDE = loc.pathname === '/ide'
  useEffect(() => { captureReferral() }, [loc.search])   // remember ?ref=0x… so buys credit the referrer
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
        <div className="hidden lg:block absolute inset-0 dot-grid"/>
      </div>

      {/* Topbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div className="px-4 lg:px-6 h-14 flex items-center justify-between">

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
          <nav className={`hidden md:flex ${isIDE ? '' : 'lg:hidden'} items-center gap-0.5`}>
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
              label === 'Tools' ? (
                <button key={path} onClick={() => { setMobileOpen(false); setToolsModalOpen(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-left"
                  style={{ background: loc.pathname.startsWith('/tools') ? 'rgba(99,102,241,0.08)' : 'transparent', color: loc.pathname.startsWith('/tools') ? '#818cf8' : 'var(--text1)' }}>
                  <Icon size={16}/>
                  <span className="text-sm font-medium flex-1">{label}</span>
                  <ChevronRight size={14} style={{ color: 'var(--text3)' }}/>
                </button>
              ) : (
                <Link key={path} to={path} onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl mb-1 no-underline"
                  style={{ background: loc.pathname===path ? 'rgba(99,102,241,0.08)' : 'transparent', color: loc.pathname===path ? '#818cf8' : 'var(--text1)' }}>
                  <Icon size={16}/>
                  <span className="text-sm font-medium">{label}</span>
                  {label==='IDE' && <span className="text-[8px] px-1.5 py-px rounded" style={{ background:'rgba(34,197,94,0.1)',color:'#22c55e' }}>AI</span>}
                </Link>
              )
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar: icon rail on lg, full sidebar on xl. Hidden in the IDE (full-screen). */}
      {!isIDE && (
        <aside className="hidden lg:flex flex-col fixed left-0 z-30 w-[72px] xl:w-[232px] px-3 xl:px-4 pt-6 pb-5"
          style={{ top: 57, bottom: 0, borderRight: '1px solid var(--border)', background: 'linear-gradient(180deg,rgba(13,13,26,0.55),rgba(7,7,14,0.35))', backdropFilter: 'blur(14px)' }}>
          <div className="hidden xl:block px-2 mb-3 text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text3)' }}>Explore</div>
          <nav className="flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = loc.pathname === path
              return (
                <Link key={path} to={path} title={label}
                  className="group relative flex items-center gap-3 rounded-xl no-underline transition-all justify-center xl:justify-start h-11 xl:px-3"
                  style={{
                    background: active ? 'linear-gradient(135deg,rgba(99,102,241,0.16),rgba(139,92,246,0.08))' : 'transparent',
                    color: active ? '#a5b4fc' : 'var(--text2)',
                    border: active ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                    boxShadow: active ? '0 0 24px rgba(99,102,241,0.12)' : 'none',
                  }}>
                  {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full" style={{ background: 'linear-gradient(180deg,#8b5cf6,#6366f1)' }}/>}
                  <Icon size={17}/>
                  <span className="hidden xl:inline text-[13px] font-semibold">{label}</span>
                  {label === 'IDE' && <span className="hidden xl:inline ml-auto text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>AI</span>}
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto space-y-3">
            <Link to="/launch" title="Launch token" className="no-underline hidden xl:block">
              <div className="relative overflow-hidden rounded-2xl p-4"
                style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.10),rgba(236,72,153,0.08))', border: '1px solid rgba(99,102,241,0.22)' }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 0% 0%,rgba(99,102,241,0.25),transparent 60%)' }}/>
                <div className="relative">
                  <Rocket size={16} style={{ color: '#a5b4fc' }}/>
                  <div className="text-[13px] font-black mt-2" style={{ color: 'var(--text1)', letterSpacing: '-0.02em' }}>Launch a token</div>
                  <div className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text2)' }}>Fair bonding curve, no liquidity needed.</div>
                </div>
              </div>
            </Link>
            <Link to="/launch" title="Launch token" className="xl:hidden flex items-center justify-center h-11 rounded-xl no-underline"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
              <Rocket size={17} color="#fff"/>
            </Link>
            <div className="flex items-center justify-center xl:justify-start gap-2 px-2 py-2 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} title="Arc Mainnet">
              <span className="w-2 h-2 rounded-full animate-pulse-glow flex-shrink-0" style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }}/>
              <span className="hidden xl:inline text-[10px] font-semibold" style={{ color: 'var(--text2)' }}>Arc Mainnet · USDC gas</span>
            </div>
          </div>
        </aside>
      )}

      {/* Main */}
      <main className={isIDE ? 'relative z-10' : 'relative z-10 pt-20 pb-24 px-5 lg:pl-[104px] lg:pr-8 lg:pb-14 xl:pl-[268px] xl:pr-10'}
        style={isIDE ? { position:'fixed', top:0, left:0, right:0, bottom:0, paddingTop:56, display:'flex', flexDirection:'column', overflow:'hidden' } : undefined}>
        {isIDE ? children : (
          <div className="mx-auto" style={{ maxWidth: 1560 }}>{children}</div>
        )}
      </main>

      <MobileNav/>
      <ToolsMenuModal open={toolsModalOpen} onClose={() => setToolsModalOpen(false)}/>
    </div>
  )
}

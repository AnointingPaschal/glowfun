import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Rocket, Wallet, Code2 } from 'lucide-react'

const NAV = [
  { path:'/',       label:'Tokens', icon:Flame  },
  { path:'/launch', label:'Launch',  icon:Rocket },
  { path:'/wallet', label:'Wallet',  icon:Wallet },
  { path:'/ide',    label:'IDE',     icon:Code2  },
]

export function MobileNav() {
  const loc = useLocation()
  if (loc.pathname === '/ide') return null
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background:'rgba(7,7,14,0.95)',
        backdropFilter:'blur(20px)',
        WebkitBackdropFilter:'blur(20px)',
        borderTop:'1px solid rgba(255,255,255,0.07)',
        paddingBottom:'env(safe-area-inset-bottom,0px)',
      }}>
      <div className="flex items-center justify-around px-2 py-2">
        {NAV.map(({ path, label, icon: Icon }) => {
          const active = loc.pathname === path
          return (
            <Link key={path} to={path}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl no-underline transition-all relative"
              style={{ minWidth:52 }}>
              {active && (
                <motion.div layoutId="mobile-nav-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.2)' }}
                  transition={{ type:'spring', stiffness:400, damping:30 }}/>
              )}
              <Icon size={18} style={{ color: active ? '#818cf8' : '#3d4455', position:'relative' }}/>
              <span className="text-[9px] font-medium relative"
                style={{ color: active ? '#818cf8' : '#3d4455' }}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

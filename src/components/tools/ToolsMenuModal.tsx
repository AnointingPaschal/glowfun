import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Wrench, ArrowRight } from 'lucide-react'
import { TOOL_LINKS, toolPath } from './toolLinks'

/**
 * Mobile-only pop-up: tapping "Tools" in the top menu opens this instead of
 * navigating straight to the hub, so every tool sub-page is one tap away.
 */
export function ToolsMenuModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] md:hidden" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
          <motion.div key="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed left-0 right-0 bottom-0 z-[61] md:hidden rounded-t-3xl p-4"
            style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', maxHeight: '80vh', overflowY: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)' }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--border2)' }} />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-black" style={{ color: 'var(--text1)' }}><Wrench size={16} style={{ color: '#818cf8' }} />Tools</div>
              <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: 'var(--surface2)' }}><X size={14} style={{ color: 'var(--text2)' }} /></button>
            </div>
            <Link to="/tools" onClick={onClose} className="flex items-center justify-between no-underline rounded-2xl p-3 mb-2"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <span className="text-xs font-bold" style={{ color: '#a5b4fc' }}>Open the full Tools hub</span>
              <ArrowRight size={13} style={{ color: '#a5b4fc' }} />
            </Link>
            <div className="grid grid-cols-2 gap-2">
              {TOOL_LINKS.map(t => {
                const Icon = t.icon
                return (
                  <Link key={t.slug} to={toolPath(t.slug)} onClick={onClose} className="no-underline rounded-2xl p-3 flex flex-col gap-1.5"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${t.tone}18` }}><Icon size={14} style={{ color: t.tone }} /></div>
                    <span className="text-[11px] font-bold leading-tight" style={{ color: 'var(--text1)' }}>{t.label}</span>
                  </Link>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Loader2, ShieldCheck, KeyRound, X } from 'lucide-react'
import { useIsContractWallet } from '@/hooks/useWalletKind'

/**
 * Full-screen confirmation for an irreversible, single-key action (burn, mint,
 * pause, blacklist, lock-forever, …). The caller must type an exact phrase —
 * built from the action and the token, e.g. "BURN GCAT" — before Confirm
 * unlocks, so a stray tap on the trigger button can't fire the transaction.
 *
 * This is friction, not cryptography: typing a phrase doesn't require a
 * second signer. What actually gets you real multi-party approval is the
 * CONNECTED WALLET being a multisig (a Safe) — if it is, the transaction this
 * modal sends is only a proposal to that Safe, which then needs its own
 * signers to approve before anything executes on-chain. We can't fake that
 * for an EOA, but we detect it (via eth_getCode on the connected address,
 * not the token's recorded creator — that's a separate check on the
 * Security page) and say so, right where the user is about to sign.
 */
export function ConfirmActionModal({
  open, onClose, onConfirm, busy, tone = '#ef4444', icon: Icon = AlertTriangle,
  title, phrase, summary, warning, confirmLabel, wallet,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  busy?: boolean
  tone?: string
  icon?: any
  title: string
  /** Exact phrase (case-insensitive) the user must type, e.g. "BURN GCAT". */
  phrase: string
  /** One-line description of exactly what will happen. */
  summary: ReactNode
  warning?: ReactNode
  confirmLabel: string
  wallet?: `0x${string}`
}) {
  const [typed, setTyped] = useState('')
  useEffect(() => { if (open) setTyped('') }, [open])
  const match = typed.trim().toUpperCase() === phrase.toUpperCase()
  const { isContract, isLoading } = useIsContractWallet(open ? wallet : undefined)

  return (
    <AnimatePresence>
      {open && (
        // A single fixed, flex-centered overlay (not left/top % + transform) so this
        // stays centered even inside embedded/scaled contexts (e.g. the in-app IDE
        // preview) and when a mobile keyboard resizes the visual viewport. The card
        // itself just sits in normal flow inside the flex box — no position tricks.
        <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.65)' }} onClick={busy ? undefined : onClose}>
          <motion.div key="modal" role="dialog" aria-modal="true" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[420px] my-auto rounded-2xl p-5 max-h-[calc(100vh-2rem)] overflow-y-auto"
            style={{ background: 'var(--bg)', border: `1px solid ${tone}40`, boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px ${tone}20` }}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${tone}18` }}><Icon size={17} style={{ color: tone }} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-black" style={{ color: 'var(--text1)', letterSpacing: '-0.02em' }}>{title}</div>
                <div className="text-[12px] mt-0.5 leading-relaxed" style={{ color: 'var(--text2)' }}>{summary}</div>
              </div>
              <button onClick={onClose} disabled={busy} className="p-1 rounded-lg flex-shrink-0" style={{ background: 'var(--surface2)' }}><X size={13} style={{ color: 'var(--text2)' }} /></button>
            </div>

            {warning && (
              <p className="text-[11px] leading-relaxed flex gap-2 mb-3" style={{ color: 'var(--gold)' }}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /><span>{warning}</span>
              </p>
            )}

            {wallet && (
              <div className="flex items-start gap-2 rounded-xl p-2.5 mb-3 text-[11px] leading-relaxed"
                style={{ background: isContract ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${isContract ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                {isLoading ? (
                  <span style={{ color: 'var(--text2)' }}>Checking your wallet type…</span>
                ) : isContract ? (
                  <><ShieldCheck size={13} style={{ color: '#22c55e' }} className="flex-shrink-0 mt-0.5" />
                    <span style={{ color: 'var(--text2)' }}><b style={{ color: '#22c55e' }}>Multisig-capable wallet.</b> Confirming here only <i>proposes</i> this transaction — it still needs your Safe's own signers to approve before it executes.</span></>
                ) : isContract === false ? (
                  <><KeyRound size={13} style={{ color: '#f59e0b' }} className="flex-shrink-0 mt-0.5" />
                    <span style={{ color: 'var(--text2)' }}><b style={{ color: '#f59e0b' }}>Single-key wallet.</b> Confirming here executes immediately — there's no second approval. For high-value actions, consider using a Safe multisig wallet instead.</span></>
                ) : (
                  <span style={{ color: 'var(--text2)' }}>Couldn't tell whether this wallet is a multisig — proceed with the usual care.</span>
                )}
              </div>
            )}

            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text2)' }}>
              Type <span style={{ color: tone }}>{phrase}</span> to confirm
            </label>
            <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={phrase}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none font-mono" style={{ background: 'var(--surface2)', border: `1px solid ${match ? tone : 'var(--border2)'}`, color: 'var(--text1)' }} />

            <div className="flex gap-2 mt-4">
              <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'var(--surface2)', color: 'var(--text1)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={onConfirm} disabled={!match || busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: tone, color: '#fff' }}>
                {busy && <Loader2 size={12} className="animate-spin" />}{confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { formatUsdc, formatAddress } from '@/utils/format'
import {
  Shield, Settings, Key, Database, Globe, Loader2, Check, Eye, EyeOff,
  RefreshCw, Save, ExternalLink, AlertTriangle, BarChart2, Image,
  MessageSquare, DollarSign, Zap, Lock, Unlock, Users, Crown,
  Ban, Activity, ChevronRight, Server, Sliders
} from 'lucide-react'
import { parseOnchainError } from '@/utils/errors'

const SPECTRAL = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'

const KV_KEYS = [
  { key: 'FACTORY_ADDRESS',          label: 'Factory Contract',         placeholder: '0x...',                                                    category: 'contract', secret: false },
  { key: 'USDC_ADDRESS',             label: 'USDC Contract',            placeholder: '0x3600000000000000000000000000000000000000',               category: 'contract', secret: false },
  { key: 'FEE_RECIPIENT',            label: 'Fee Recipient',            placeholder: '0x...',                                                    category: 'contract', secret: false },
  { key: 'GRADUATION_RECIPIENT',     label: 'Graduation Recipient',     placeholder: '0x...',                                                    category: 'contract', secret: false },
  { key: 'RPC_URL',                  label: 'Custom RPC URL',           placeholder: 'https://rpc.arc.io',                                       category: 'contract', secret: false },
  { key: 'WALLETCONNECT_PROJECT_ID', label: 'WalletConnect Project ID', placeholder: 'Get from cloud.walletconnect.com',                         category: 'keys',    secret: false },
  { key: 'CIRCLE_APP_ID',            label: 'Circle App ID',            placeholder: 'Get from Circle Dev Console',                              category: 'keys',    secret: false },
  { key: 'CIRCLE_API_KEY',           label: 'Circle API Key',           placeholder: 'TEST_API_KEY:...',                                         category: 'keys',    secret: true  },
  { key: 'ADMIN_SECRET',             label: 'Admin Password',           placeholder: 'Strong password',                                          category: 'keys',    secret: true  },
  { key: 'PINATA_JWT',               label: 'Pinata JWT (IPFS)',        placeholder: 'eyJhbGci... from app.pinata.cloud',                        category: 'storage', secret: true  },
  { key: 'R2_PUBLIC_URL',            label: 'R2 Public URL',            placeholder: 'https://pub-xxx.r2.dev',                                   category: 'storage', secret: false },
  { key: 'SITE_TITLE',               label: 'Site Name',                placeholder: 'GlowFun',                                                  category: 'site',    secret: false },
  { key: 'SITE_LOGO',                label: 'Site Logo URL',            placeholder: 'https://... (square image)',                               category: 'site',    secret: false },
  { key: 'SITE_DESCRIPTION',         label: 'Site Description',         placeholder: 'Launch and trade meme tokens on Arc',                      category: 'site',    secret: false },
  { key: 'TWITTER_HANDLE',           label: 'Twitter Handle',           placeholder: '@glowfun',                                                 category: 'site',    secret: false },
  { key: 'CREATION_FEE_USDC',        label: 'Creation Fee display',     placeholder: '10',                                                       category: 'fees',    secret: false },
  { key: 'PROTOCOL_FEE_BPS',         label: 'Protocol Fee (bps)',       placeholder: '100',                                                      category: 'fees',    secret: false },
  { key: 'GRADUATION_THRESHOLD_USDC',label: 'Graduation Threshold',     placeholder: '69000',                                                    category: 'fees',    secret: false },
  { key: 'REFERRAL_FEE_BPS',         label: 'Referral Fee (bps)',       placeholder: '2500',                                                     category: 'fees',    secret: false },
]

const SECTIONS = [
  { id: 'overview',  label: 'Overview',      icon: Activity  },
  { id: 'config',    label: 'Configuration', icon: Key       },
  { id: 'onchain',   label: 'On-Chain',      icon: Zap       },
  { id: 'tokens',    label: 'Tokens',        icon: BarChart2 },
  { id: 'comments',  label: 'Comments',      icon: MessageSquare },
]

const CATS = [
  { id: 'all',      label: 'All',       icon: Settings  },
  { id: 'contract', label: 'Contract',  icon: Zap       },
  { id: 'keys',     label: 'API Keys',  icon: Key       },
  { id: 'fees',     label: 'Fees',      icon: DollarSign},
  { id: 'site',     label: 'Site',      icon: Globe     },
  { id: 'storage',  label: 'Storage',   icon: Database  },
]

/* ── Reusable sub-components ───────────────────────────────────────────── */

function SectionCard({ title, icon: Icon, accent = '#a78bfa', children }: {
  title: string; icon: any; accent?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, accent = '#a78bfa', sub }: {
  label: string; value: string; icon: any; accent?: string; sub?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={13} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-lg font-bold" style={{ color: 'var(--text1)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{sub}</div>}
    </div>
  )
}

function FieldRow({ label, placeholder, value, onChange, onSave, saving, saved, secret, note }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; onSave: () => void;
  saving: boolean; saved: boolean; secret: boolean; note?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text1)' }}>{label}</div>
          {note && <div className="text-xs mb-2" style={{ color: 'var(--text2)' }}>{note}</div>}
          <div className="relative">
            <input
              type={secret && !show ? 'password' : 'text'}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSave()}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none pr-8"
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border2)',
                color: 'var(--text1)',
                fontFamily: secret ? 'monospace' : 'inherit',
              }}
            />
            {secret && (
              <button onClick={() => setShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="mt-6 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all"
          style={saved
            ? { background: 'rgba(34,197,94,0.1)', color: '#34d399', border: '1px solid rgba(34,197,94,0.2)' }
            : { background: 'var(--accent)', color: 'white', border: 'none' }
          }
        >
          {saving ? <Loader2 size={11} className="animate-spin" />
            : saved ? <><Check size={11} />Saved</>
            : <><Save size={11} />Save</>}
        </button>
      </div>
    </div>
  )
}

function OnchainInput({ label, note, value, onChange, onSet, disabled, placeholder = '' }: {
  label: string; note?: string; value: string; onChange: (v: string) => void;
  onSet: () => void; disabled: boolean; placeholder?: string
}) {
  return (
    <div className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text1)' }}>{label}</div>
      {note && <div className="text-xs mb-2" style={{ color: 'var(--text2)' }}>{note}</div>}
      <div className="flex gap-2 mt-1.5">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
        />
        <button
          onClick={onSet}
          disabled={disabled || !value}
          className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Save size={11} />Set
        </button>
      </div>
    </div>
  )
}

/* ── Main AdminPage ─────────────────────────────────────────────────────── */

export function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw]         = useState('')
  const [authErr, setAuthErr] = useState('')
  const [section, setSection] = useState('overview')
  const [cat, setCat]         = useState('all')

  const [kvValues, setKvValues]   = useState<Record<string, string>>({})
  const [editVals, setEditVals]   = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState<Record<string, boolean>>({})
  const [saved, setSaved]         = useState<Record<string, boolean>>({})
  const [loading, setLoading]     = useState(false)

  const { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrong = isConnected && chainId !== CHAIN_ID
  const { writeContract: adminWrite, data: adminHash, isPending: adminPending } = useWriteContract()
  const { isLoading: adminConfirming } = useWaitForTransactionReceipt({ hash: adminHash })
  const adminBusy = adminPending || adminConfirming

  // Onchain reads
  const q = { enabled: !!FACTORY_ADDRESS }
  const args = (fn: string) => ({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: fn as any, chainId: CHAIN_ID as any, query: q })
  const { data: feeBps }           = useReadContract(args('protocolFeeBps'))
  const { data: creationFee }      = useReadContract(args('creationFee'))
  const { data: gradThresh }       = useReadContract(args('graduationThreshold'))
  const { data: creatorGradBps }   = useReadContract(args('creatorGraduationFeeBps'))
  const { data: referralBps }      = useReadContract(args('referralFeeBps'))
  const { data: antiSnipeDur }     = useReadContract(args('antiSnipeDuration'))
  const { data: antiSnipeTax }     = useReadContract(args('antiSnipeTaxBps'))
  const { data: maxBuyBps }        = useReadContract(args('maxBuyBps'))
  const { data: buyCooldown }      = useReadContract(args('buyCooldown'))
  const { data: creatorLock }      = useReadContract(args('creatorLockDuration'))
  const { data: perGradBps }       = useReadContract(args('perTokenGraduationFeeBps'))
  const { data: feeRecipient }     = useReadContract(args('feeRecipient'))
  const { data: gradRecipient }    = useReadContract(args('graduationRecipient'))
  const { data: paused }           = useReadContract(args('paused'))
  const { data: kingToken }        = useReadContract(args('kingOfHill'))
  const { data: kingRaised }       = useReadContract(args('kingOfHillRaised'))
  const { data: tokenCountRaw }    = useReadContract(args('launchedTokensCount'))
  const tokenCountNum = tokenCountRaw ? Number(tokenCountRaw) : 0
  const { data: allTokens }        = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTokensPaginated',
    args: [BigInt(0), BigInt(Math.max(tokenCountNum, 1))],
    chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS && tokenCountNum > 0 }
  })

  // Input state
  const [inp, setInp] = useState<Record<string, string>>({})
  const i = (key: string) => inp[key] ?? ''
  const si = (key: string) => (val: string) => setInp(s => ({ ...s, [key]: val }))

  const adminCall = (fn: string, fnArgs: any[]) => {
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }
    adminWrite({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: fn, args: fnArgs, chainId: CHAIN_ID as any } as any, {
      onSuccess: () => toast.success('Transaction submitted'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const loadConfig = async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/config').then(r => r.json()) as Record<string, string>
      setKvValues(d); setEditVals(d)
    } catch { toast.error('Could not load KV config — is the Worker deployed?') }
    setLoading(false)
  }

  useEffect(() => { loadConfig() }, [])

  const saveKey = async (key: string) => {
    const value = editVals[key] ?? ''
    setSaving(s => ({ ...s, [key]: true }))
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': pw },
        body: JSON.stringify({ key, value }),
      })
      const d = await res.json() as any
      if (!d.ok) throw new Error(d.error ?? 'Failed')
      setKvValues(v => ({ ...v, [key]: value }))
      setSaved(s => ({ ...s, [key]: true }))
      toast.success(`${key} saved`)
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e: any) { toast.error(e.message) }
    setSaving(s => ({ ...s, [key]: false }))
  }

  const n = (v: any) => Number(v as bigint)

  /* ── Login screen ──────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
          <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.3)' }}>
                <Shield size={28} className="text-white" />
              </div>
              <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>Admin Panel</h1>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Enter your password to continue</p>
            </div>
            <div className="space-y-3">
              <input
                type="password" value={pw}
                onChange={e => { setPw(e.target.value); setAuthErr('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const stored = kvValues['ADMIN_SECRET'] || 'glowfun_admin_change_me'
                    if (pw === stored) { setAuthed(true); setAuthErr('') } else setAuthErr('Incorrect password.')
                  }
                }}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--surface3)', border: `1px solid ${authErr ? 'rgba(239,68,68,0.4)' : 'var(--border2)'}`, color: 'var(--text1)' }}
                autoFocus
              />
              {authErr && <p className="text-xs" style={{ color: '#f87171' }}>{authErr}</p>}
              <button
                onClick={() => {
                  const stored = kvValues['ADMIN_SECRET'] || 'glowfun_admin_change_me'
                  if (pw === stored) { setAuthed(true); setAuthErr('') } else setAuthErr('Incorrect password.')
                }}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                Unlock
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  const filteredKeys = KV_KEYS.filter(k => cat === 'all' || k.category === cat)

  /* ── Main layout ───────────────────────────────────────────────────── */
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-[3px] w-6 rounded-full" style={{ background: SPECTRAL }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Admin</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text1)', letterSpacing: '-0.02em', fontFamily: 'Space Grotesk,sans-serif' }}>Control Panel</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadConfig} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
          <button onClick={() => setAuthed(false)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <Lock size={11} />Lock
          </button>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Sidebar */}
        <aside className="w-44 flex-shrink-0 hidden md:block">
          <nav className="sticky top-20 space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSection(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
                style={{
                  background: section === id ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: section === id ? '#818cf8' : 'var(--text2)',
                  border: section === id ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                }}>
                <Icon size={14} />
                {label}
                {section === id && <ChevronRight size={12} className="ml-auto opacity-60" />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile section pills */}
        <div className="md:hidden w-full -mx-0 mb-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 pb-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSection(id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0 transition-all"
                style={{
                  background: section === id ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                  color: section === id ? '#818cf8' : 'var(--text2)',
                  border: section === id ? '1px solid rgba(99,102,241,0.2)' : '1px solid var(--border)',
                }}>
                <Icon size={12} />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── OVERVIEW ── */}
          <AnimatePresence mode="wait">
            {section === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="Tokens Launched" value={tokenCountNum ? tokenCountNum.toString() : '—'} icon={Zap} accent="#a78bfa" />
                  <StatCard label="Protocol Fee" value={feeBps !== undefined ? `${n(feeBps) / 100}%` : '—'} icon={DollarSign} accent="#fb923c" sub={`${n(feeBps ?? 0)} bps`} />
                  <StatCard label="Creation Fee" value={creationFee !== undefined ? `$${n(creationFee) / 1e6}` : '—'} icon={Server} accent="#34d399" />
                  <StatCard label="Status" value={paused ? 'Paused' : 'Active'} icon={paused ? Lock : Unlock} accent={paused ? '#f87171' : '#34d399'} />
                </div>

                <SectionCard title="Platform" icon={Activity} accent="#6366f1">
                  <div className="space-y-2 text-sm">
                    {[
                      ['Factory', FACTORY_ADDRESS ? formatAddress(FACTORY_ADDRESS) : 'Not set'],
                      ['Fee Recipient', feeRecipient ? formatAddress(feeRecipient as string) : '—'],
                      ['Graduation Recipient', gradRecipient ? formatAddress(gradRecipient as string) : '—'],
                      ['Graduation Threshold', gradThresh !== undefined ? `$${(n(gradThresh) / 1e6).toLocaleString()} USDC` : '—'],
                      ['Creator Grad Bonus', creatorGradBps !== undefined ? `${n(creatorGradBps) / 100}%` : '—'],
                      ['Referral Fee', referralBps !== undefined ? `${n(referralBps) / 100}% of trade fee` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text2)' }}>{k}</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--text1)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {kingToken && kingToken !== '0x0000000000000000000000000000000000000000' && (
                  <SectionCard title="King of the Hill" icon={Crown} accent="#f59e0b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(245,158,11,0.12)' }}>👑</div>
                      <div>
                        <div className="text-sm font-mono font-medium" style={{ color: 'var(--text1)' }}>{formatAddress(kingToken as string)}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>${(n(kingRaised ?? 0) / 1e6).toFixed(2)} USDC raised</div>
                      </div>
                      {EXPLORER_BASE && (
                        <a href={`${EXPLORER_BASE}/address/${kingToken}`} target="_blank" rel="noreferrer" className="ml-auto">
                          <ExternalLink size={14} style={{ color: 'var(--text2)' }} />
                        </a>
                      )}
                    </div>
                  </SectionCard>
                )}
              </motion.div>
            )}

            {/* ── CONFIG ── */}
            {section === 'config' && (
              <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

                <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                  <Database size={14} style={{ color: '#818cf8', marginTop: 2, flexShrink: 0 }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                    All values are stored in <strong style={{ color: 'var(--text1)' }}>Cloudflare KV</strong> and read at runtime. Changes take effect immediately — no redeploy needed.
                  </p>
                </div>

                {/* Category pills */}
                <div className="flex gap-2 flex-wrap">
                  {CATS.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setCat(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: cat === id ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                        color: cat === id ? '#818cf8' : 'var(--text2)',
                        border: cat === id ? '1px solid rgba(99,102,241,0.2)' : '1px solid var(--border)',
                      }}>
                      <Icon size={11} />{label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {filteredKeys.map(({ key, label, placeholder, secret }) => (
                    <FieldRow
                      key={key}
                      label={label}
                      placeholder={placeholder}
                      value={editVals[key] ?? ''}
                      onChange={v => setEditVals(s => ({ ...s, [key]: v }))}
                      onSave={() => saveKey(key)}
                      saving={!!saving[key]}
                      saved={!!saved[key]}
                      secret={secret}
                    />
                  ))}
                  {filteredKeys.length === 0 && (
                    <div className="p-8 text-center text-sm" style={{ color: 'var(--text2)' }}>No settings in this category.</div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => filteredKeys.forEach(({ key }) => saveKey(key))}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                  >
                    <Save size={13} />Save All
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── ON-CHAIN ── */}
            {section === 'onchain' && (
              <motion.div key="onchain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                {!isConnected ? (
                  <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <Zap size={24} className="mx-auto mb-3" style={{ color: 'var(--text2)' }} />
                    <p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>Connect wallet to manage on-chain settings</p>
                    <ConnectKitButton />
                  </div>
                ) : (
                  <>
                    {wrong && (
                      <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                        <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
                        <span className="text-sm" style={{ color: '#fbbf24' }}>Wrong network.</span>
                        <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="text-sm underline" style={{ color: '#fbbf24' }}>Switch to Arc Mainnet</button>
                      </div>
                    )}

                    <SectionCard title="Fee Settings" icon={DollarSign} accent="#fb923c">
                      <OnchainInput label="Creation Fee (USDC)" note={creationFee !== undefined ? `Current: $${n(creationFee) / 1e6} USDC` : ''} value={i('creationFee')} onChange={si('creationFee')} disabled={adminBusy} placeholder="10" onSet={() => adminCall('setCreationFee', [BigInt(Math.round(parseFloat(i('creationFee') || '0') * 1e6))])} />
                      <OnchainInput label="Protocol Fee (bps, max 500)" note={feeBps !== undefined ? `Current: ${n(feeBps)} bps = ${n(feeBps) / 100}%` : ''} value={i('feeBps')} onChange={si('feeBps')} disabled={adminBusy} placeholder="100" onSet={() => adminCall('setProtocolFeeBps', [BigInt(i('feeBps') || '0')])} />
                      <OnchainInput label="Creator Graduation Bonus (bps, max 2000)" note={creatorGradBps !== undefined ? `Current: ${n(creatorGradBps)} bps = ${n(creatorGradBps) / 100}%` : ''} value={i('creatorGradBps')} onChange={si('creatorGradBps')} disabled={adminBusy} placeholder="500" onSet={() => adminCall('setCreatorGraduationFeeBps', [BigInt(i('creatorGradBps') || '0')])} />
                      <OnchainInput label="Graduation Threshold (USDC, min $1,000)" note={gradThresh !== undefined ? `Current: $${(n(gradThresh) / 1e6).toLocaleString()}` : ''} value={i('gradThresh')} onChange={si('gradThresh')} disabled={adminBusy} placeholder="69000" onSet={() => adminCall('setGraduationThreshold', [BigInt(Math.round(parseFloat(i('gradThresh') || '0') * 1e6))])} />
                    </SectionCard>

                    <SectionCard title="Anti-Bot Controls" icon={Sliders} accent="#6366f1">
                      <OnchainInput label="Referral Fee (bps of protocol fee, max 5000)" note={referralBps !== undefined ? `Current: ${n(referralBps)} bps = ${n(referralBps) / 100}%` : ''} value={i('referralBps')} onChange={si('referralBps')} disabled={adminBusy} placeholder="2500" onSet={() => adminCall('setReferralFeeBps', [BigInt(i('referralBps') || '0')])} />
                      <OnchainInput label="Anti-Snipe Duration (seconds)" note={antiSnipeDur !== undefined ? `Current: ${n(antiSnipeDur)}s` : ''} value={i('antiSnipeDur')} onChange={si('antiSnipeDur')} disabled={adminBusy} placeholder="60" onSet={() => adminCall('setAntiSnipeConfig', [BigInt(i('antiSnipeDur') || '0'), BigInt(i('antiSnipeTax') || n(antiSnipeTax ?? 500).toString())])} />
                      <OnchainInput label="Anti-Snipe Tax (bps, max 2000)" note={antiSnipeTax !== undefined ? `Current: ${n(antiSnipeTax)} bps = ${n(antiSnipeTax) / 100}%` : ''} value={i('antiSnipeTax')} onChange={si('antiSnipeTax')} disabled={adminBusy} placeholder="500" onSet={() => adminCall('setAntiSnipeConfig', [BigInt(i('antiSnipeDur') || n(antiSnipeDur ?? 60).toString()), BigInt(i('antiSnipeTax') || '0')])} />
                      <OnchainInput label="Max Buy per TX (bps of curve, 0=off)" note={maxBuyBps !== undefined ? `Current: ${n(maxBuyBps)} bps = ${n(maxBuyBps) / 100}%` : ''} value={i('maxBuyBps')} onChange={si('maxBuyBps')} disabled={adminBusy} placeholder="500" onSet={() => adminCall('setMaxBuyBps', [BigInt(i('maxBuyBps') || '0')])} />
                      <OnchainInput label="Buy Cooldown (seconds, 0=off, max 300)" note={buyCooldown !== undefined ? `Current: ${n(buyCooldown)}s` : ''} value={i('buyCooldown')} onChange={si('buyCooldown')} disabled={adminBusy} placeholder="30" onSet={() => adminCall('setBuyCooldown', [BigInt(i('buyCooldown') || '0')])} />
                      <OnchainInput label="Creator Lock Duration (seconds, max 2592000 = 30d)" note={creatorLock !== undefined ? `Current: ${n(creatorLock)}s = ${(n(creatorLock) / 86400).toFixed(1)} days` : ''} value={i('creatorLock')} onChange={si('creatorLock')} disabled={adminBusy} placeholder="604800" onSet={() => adminCall('setCreatorLockDuration', [BigInt(i('creatorLock') || '0')])} />
                      <OnchainInput label="Per-Token Graduation Platform Fee (bps, max 500)" note={perGradBps !== undefined ? `Current: ${n(perGradBps)} bps = ${n(perGradBps) / 100}%` : ''} value={i('perGradBps')} onChange={si('perGradBps')} disabled={adminBusy} placeholder="100" onSet={() => adminCall('setPerTokenGraduationFeeBps', [BigInt(i('perGradBps') || '0')])} />
                    </SectionCard>

                    <SectionCard title="Recipients (Two-Step)" icon={Users} accent="#34d399">
                      <p className="text-xs mb-4" style={{ color: 'var(--text2)' }}>Propose a new address — the new address must call <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface3)', color: 'var(--text1)' }}>acceptFeeRecipient()</code> or <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface3)', color: 'var(--text1)' }}>acceptGraduationRecipient()</code> to confirm.</p>
                      <OnchainInput label="Propose Fee Recipient" note={feeRecipient ? `Current: ${formatAddress(feeRecipient as string)}` : ''} value={i('feeRecip')} onChange={si('feeRecip')} disabled={adminBusy} placeholder="0x..." onSet={() => adminCall('proposeFeeRecipient', [i('feeRecip') as `0x${string}`])} />
                      <OnchainInput label="Propose Graduation Recipient" note={gradRecipient ? `Current: ${formatAddress(gradRecipient as string)}` : ''} value={i('gradRecip')} onChange={si('gradRecip')} disabled={adminBusy} placeholder="0x..." onSet={() => adminCall('proposeGraduationRecipient', [i('gradRecip') as `0x${string}`])} />
                    </SectionCard>

                    <SectionCard title="Blacklists" icon={Ban} accent="#f87171">
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text2)' }}>Token Address</label>
                          <div className="flex gap-2">
                            <input value={i('blToken')} onChange={e => setInp(s => ({ ...s, blToken: e.target.value }))} placeholder="0x..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                            <button onClick={() => adminCall('blacklistToken', [i('blToken') as `0x${string}`, true])} disabled={!i('blToken') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>Block</button>
                            <button onClick={() => adminCall('blacklistToken', [i('blToken') as `0x${string}`, false])} disabled={!i('blToken') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#34d399' }}>Allow</button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text2)' }}>Wallet Address</label>
                          <div className="flex gap-2">
                            <input value={i('blWallet')} onChange={e => setInp(s => ({ ...s, blWallet: e.target.value }))} placeholder="0x..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                            <button onClick={() => adminCall('blacklistWallet', [i('blWallet') as `0x${string}`, true])} disabled={!i('blWallet') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>Block</button>
                            <button onClick={() => adminCall('blacklistWallet', [i('blWallet') as `0x${string}`, false])} disabled={!i('blWallet') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#34d399' }}>Allow</button>
                          </div>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Emergency Controls" icon={Shield} accent="#a78bfa">
                      <div className="flex gap-3">
                        <button onClick={() => adminCall('pause', [])} disabled={!!paused || adminBusy} className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-80" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>
                          <Lock size={14} />Pause
                        </button>
                        <button onClick={() => adminCall('unpause', [])} disabled={!paused || adminBusy} className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-80" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', color: '#34d399' }}>
                          <Unlock size={14} />Unpause
                        </button>
                      </div>
                      <div className="mt-3 text-center text-xs" style={{ color: 'var(--text2)' }}>
                        Status: <span style={{ color: paused ? '#f87171' : '#34d399', fontWeight: 600 }}>{paused === undefined ? '...' : paused ? 'PAUSED' : 'Active'}</span>
                      </div>
                    </SectionCard>
                  </>
                )}
              </motion.div>
            )}

            {/* ── TOKENS ── */}
            {section === 'tokens' && (
              <motion.div key="tokens" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <TokenMetadataEditor factoryAddress={FACTORY_ADDRESS} chainId={CHAIN_ID} />

                <SectionCard title={`All Tokens (${tokenCountNum})`} icon={BarChart2} accent="#a78bfa">
                  {!FACTORY_ADDRESS ? (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--text2)' }}>Set FACTORY_ADDRESS in Configuration first.</p>
                  ) : tokenCountNum === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--text2)' }}>No tokens launched yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {allTokens && [...(allTokens as unknown as string[])].reverse().map((addr, i) => (
                        <div key={addr} className="flex items-center justify-between py-3 px-2 rounded-xl transition-colors hover:bg-white/[0.02]">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: `hsl(${parseInt(addr.slice(2,6),16)%360},55%,28%)`, color: 'white' }}>{i + 1}</div>
                            <span className="text-xs font-mono" style={{ color: 'var(--text1)' }}>{formatAddress(addr)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a href={`/token/${addr}`} className="text-xs px-2.5 py-1 rounded-lg no-underline" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>View</a>
                            {EXPLORER_BASE && (
                              <a href={`${EXPLORER_BASE}/address/${addr}`} target="_blank" rel="noreferrer" className="text-xs px-2.5 py-1 rounded-lg no-underline flex items-center gap-1" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                                <ExternalLink size={9} />Exp
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </motion.div>
            )}

            {/* ── COMMENTS ── */}
            {section === 'comments' && (
              <motion.div key="comments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <SectionCard title="Recent Comments" icon={MessageSquare} accent="#a78bfa">
                  <AdminComments />
                </SectionCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Comments sub-component ─────────────────────────────────────────────── */
function AdminComments() {
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const { EXPLORER_BASE } = useConfig()

  useEffect(() => {
    fetch('/api/comments?limit=50')
      .then(r => r.json()).then((d: any) => { setComments(d.comments ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text3)' }} />
    </div>
  )
  if (!comments.length) return <p className="text-sm py-8 text-center" style={{ color: 'var(--text2)' }}>No comments yet.</p>

  return (
    <div className="space-y-1">
      {comments.map(c => (
        <div key={c.id} className="px-3 py-3 rounded-xl" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono" style={{ color: '#a78bfa' }}>{formatAddress(c.author)}</span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>on</span>
            <a href={`/token/${c.token_address}`} className="text-xs font-mono no-underline" style={{ color: 'var(--text2)' }}>{formatAddress(c.token_address)}</a>
            <span className="ml-auto text-xs" style={{ color: 'var(--text3)' }}>{new Date(c.created_at).toLocaleString()}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text1)' }}>{c.content}</p>
        </div>
      ))}
    </div>
  )
}

/* ── Token Metadata Editor ───────────────────────────────────────────────── */
function TokenMetadataEditor({ factoryAddress, chainId }: { factoryAddress: `0x${string}` | undefined; chainId: number }) {
  const [tokenAddr, setTokenAddr] = useState('')
  const [fields, setFields]       = useState({ imageUri: '', description: '', twitter: '', telegram: '', website: '' })
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const valid = tokenAddr.startsWith('0x') && tokenAddr.length === 42

  return (
    <SectionCard title="Update Token Metadata" icon={Image} accent="#6366f1">
      <p className="text-xs mb-4" style={{ color: 'var(--text2)' }}>Permanently update logo, description, and socials on-chain. Changes reflect everywhere the CA is read.</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text2)' }}>Token Contract Address</label>
          <input value={tokenAddr} onChange={e => setTokenAddr(e.target.value)} placeholder="0x..." className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text2)' }}>Logo URL (IPFS preferred: ipfs://Qm...)</label>
          <input value={fields.imageUri} onChange={e => setFields(f => ({ ...f, imageUri: e.target.value }))} placeholder="ipfs://Qm... or https://..." className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text2)' }}>Description</label>
          <textarea value={fields.description} onChange={e => setFields(f => ({ ...f, description: e.target.value }))} placeholder="Token description..." rows={2} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['twitter','telegram','website'] as const).map(k => (
            <div key={k}>
              <label className="text-xs font-medium block mb-1 capitalize" style={{ color: 'var(--text2)' }}>{k}</label>
              <input value={fields[k]} onChange={e => setFields(f => ({ ...f, [k]: e.target.value }))} placeholder={k === 'website' ? 'https://' : '@handle'} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
            </div>
          ))}
        </div>
        {isSuccess && (
          <div className="flex items-center gap-2 text-xs py-2 px-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', color: '#4ade80' }}>
            <Check size={12} />Metadata updated on-chain successfully
          </div>
        )}
        <button
          onClick={() => {
            if (!factoryAddress || !valid) return
            writeContract({ address: factoryAddress, abi: FACTORY_ABI, functionName: 'updateTokenMetadata', args: [tokenAddr as `0x${string}`, fields.imageUri, fields.description, fields.twitter, fields.telegram, fields.website], chainId: chainId as any } as any)
          }}
          disabled={!valid || isPending || confirming || !factoryAddress}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white' }}
        >
          {isPending || confirming ? <><Loader2 size={14} className="animate-spin" />Confirming...</> : <><Save size={14} />Save Metadata On-Chain</>}
        </button>
      </div>
    </SectionCard>
  )
}

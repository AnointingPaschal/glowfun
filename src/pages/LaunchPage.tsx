import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useSwitchChain, useReadContract,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import ImageUpload from '@/components/ImageUpload'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { parseOnchainError } from '@/utils/errors'
import { ConnectKitButton } from 'connectkit'
import {
  Rocket, Twitter, Send, Globe, ChevronDown, Zap,
  DollarSign, Loader2, ShieldCheck, ArrowRight,
  AlertTriangle, Info, RotateCcw, Check,
  Users, Lock, TrendingUp, Flame,
} from 'lucide-react'

/* ─── helpers ──────────────────────────────────────────────────────── */
const fmt = (n: bigint) => {
  const v = Number(n) / 1e18
  return v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v.toLocaleString()
}
const fmtUsdc = (v: bigint) => {
  const n = Number(v) / 1e6
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(2)}`
}
const pct = (n: number) => `${n.toFixed(1)}%`

/* ─── constants ────────────────────────────────────────────────────── */
const SUPPLIES = [
  { label: '100M',  val: 100_000_000n  * 10n ** 18n, desc: 'Micro-cap'  },
  { label: '500M',  val: 500_000_000n  * 10n ** 18n, desc: 'Mid-size'   },
  { label: '1B',    val: 1_000_000_000n * 10n ** 18n, desc: 'Classic ⭐' },
  { label: '5B',    val: 5_000_000_000n * 10n ** 18n, desc: 'Large'      },
  { label: '10B',   val: 10_000_000_000n * 10n ** 18n, desc: 'Doge-style' },
  { label: 'Custom', val: 0n, desc: 'Enter value'  },
]

const GRADS = [
  { label: '$10K',  val: 10_000n  * 1_000_000n, desc: 'Fast grad'   },
  { label: '$25K',  val: 25_000n  * 1_000_000n, desc: 'Quick'       },
  { label: '$50K',  val: 50_000n  * 1_000_000n, desc: 'Mid-tier'    },
  { label: '$69K',  val: 69_000n  * 1_000_000n, desc: 'Standard ⭐' },
  { label: '$100K', val: 100_000n * 1_000_000n, desc: 'Premium'     },
  { label: '$200K', val: 200_000n * 1_000_000n, desc: 'Large'       },
  { label: 'Custom', val: 0n, desc: 'Enter value' },
]

// Tax modes (UI-only labeling — maps to curve/creator bps presets)
const TAX_MODES = [
  { id: 'community',     label: 'Community',    sub: 'No creator cut',    curve: 8000, creator: 0    },
  { id: 'creator',       label: 'Creator',      sub: '5% to creator',     curve: 7500, creator: 500  },
  { id: 'deflationary',  label: 'Deflationary', sub: '8% to DEX',         curve: 9200, creator: 0    },
  { id: 'whale',         label: 'Whale',        sub: '10% to creator',    curve: 7000, creator: 1000 },
  { id: 'custom',        label: 'Custom',       sub: 'Your own split',    curve: -1,   creator: -1   },
]

interface Form {
  name: string; symbol: string; description: string; imageUri: string
  twitter: string; telegram: string; website: string; discord: string
}
const INIT: Form = { name: '', symbol: '', description: '', imageUri: '', twitter: '', telegram: '', website: '', discord: '' }
type Step = 'form' | 'approving' | 'launching' | 'done'

/* ─── Donut SVG ─────────────────────────────────────────────────────── */
function Donut({ curve, creator, dex }: { curve: number; creator: number; dex: number }) {
  const R = 52; const stroke = 14; const C = 2 * Math.PI * R
  const segments = [
    { pct: curve,   color: '#6366f1', label: 'Curve'   },
    { pct: creator, color: '#f59e0b', label: 'Creator' },
    { pct: dex,     color: '#22c55e', label: 'DEX'     },
  ]
  let offset = 0
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <circle cx={60} cy={60} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke}/>
      {segments.map(({ pct: p, color }) => {
        const len = (p / 100) * C
        const el = (
          <circle key={color} cx={60} cy={60} r={R} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset * C / 100}
            strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dasharray 0.4s ease' }}/>
        )
        offset += p
        return el
      })}
      <text x={60} y={56} textAnchor="middle" fill="white" fontSize={14} fontWeight="bold" fontFamily="Space Grotesk">{(curve + creator + dex).toFixed(0)}%</text>
      <text x={60} y={70} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={8}>Total split</text>
    </svg>
  )
}

/* ─── Tooltip ───────────────────────────────────────────────────────── */
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onClick={() => setShow(v => !v)}>
        <Info size={11} style={{ color: 'var(--text3)' }}/>
      </button>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
            style={{ minWidth: 180 }}>
            <div className="text-[10px] leading-relaxed px-2.5 py-2 rounded-xl shadow-xl"
              style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Section card ──────────────────────────────────────────────────── */
function Section({ title, subtitle, icon: Icon, iconColor = '#818cf8', children, badge }:
  { title: string; subtitle?: string; icon: any; iconColor?: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${iconColor}18` }}>
            <Icon size={14} style={{ color: iconColor }}/>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: 'var(--text1)' }}>{title}</span>
              {badge && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>{badge}</span>}
            </div>
            {subtitle && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ─── Field ─────────────────────────────────────────────────────────── */
function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>{label}</label>
        {tip && <Tip text={tip}/>}
      </div>
      {children}
    </div>
  )
}

/* ─── Input style ───────────────────────────────────────────────────── */
const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
const inputStyle = { background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text1)' }

/* ═══════════════════════════════════════════════════════════════════ */
/*  LAUNCH PAGE                                                        */
/* ═══════════════════════════════════════════════════════════════════ */
export function LaunchPage() {
  const navigate = useNavigate()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID } = useConfig()

  /* ── form state ── */
  const [form, setForm]         = useState<Form>(INIT)
  const [step, setStep]         = useState<Step>('form')
  const [showSocials, setSoc]   = useState(false)

  /* ── supply ── */
  const [supplyIdx, setSI]      = useState(2)                   // 1B default
  const [customSupply, setCS]   = useState('')                  // billions string
  const isCustomSupply          = supplyIdx === SUPPLIES.length - 1

  /* ── graduation ── */
  const [gradIdx, setGI]        = useState(3)                   // $69K default
  const [customGrad, setCG]     = useState('')                  // dollar string
  const isCustomGrad            = gradIdx === GRADS.length - 1

  /* ── allocation ── */
  const [taxMode, setTaxMode]   = useState('community')
  const [curveBps, setCurve]    = useState(8000)
  const [creatorBps, setCr]     = useState(0)
  const isCustomTax             = taxMode === 'custom'

  /* ── tx hashes ── */
  const [approveTx, setAppTx]   = useState<`0x${string}` | undefined>()
  const [launchTx,  setLTx]     = useState<`0x${string}` | undefined>()

  /* ── computed values ── */
  const supply: bigint = (() => {
    if (isCustomSupply) {
      const v = parseFloat(customSupply)
      if (!isNaN(v) && v > 0) return BigInt(Math.round(v * 1e9)) * 10n ** 9n  // v billion tokens × 1e18
      return 1_000_000_000n * 10n ** 18n
    }
    return SUPPLIES[supplyIdx]?.val ?? 1_000_000_000n * 10n ** 18n
  })()

  const grad: bigint = (() => {
    if (isCustomGrad) {
      const v = parseFloat(customGrad)
      if (!isNaN(v) && v > 0) return BigInt(Math.round(v * 1e6))
      return 69_000n * 1_000_000n
    }
    return GRADS[gradIdx]?.val ?? 69_000n * 1_000_000n
  })()

  const curveTokens   = (supply * BigInt(curveBps)) / 10_000n
  const creatorTokens = (supply * BigInt(creatorBps)) / 10_000n
  const dexTokens     = supply - curveTokens - creatorTokens
  const curvePct      = curveBps / 100
  const creatorPct    = creatorBps / 100
  const dexPct        = Number(dexTokens) * 100 / Number(supply)
  const totalPct      = curvePct + creatorPct + dexPct

  /* ── contract reads ── */
  const { data: feeRaw } = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'creationFee',
    chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS },
  })
  const fee = (feeRaw as bigint) ?? 0n

  const { data: usdcBal } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: !!address },
  })
  const usdcBalance = (usdcBal as bigint) ?? 0n

  const { data: usdcAllow } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
    args: address && FACTORY_ADDRESS ? [address, FACTORY_ADDRESS] : undefined,
    chainId: CHAIN_ID as any, query: { enabled: !!address && !!FACTORY_ADDRESS && fee > 0n },
  })
  const usdcAllowance = (usdcAllow as bigint) ?? 0n
  const needApprove   = fee > 0n && usdcAllowance < fee

  /* ── write hooks ── */
  const { writeContract, isPending } = useWriteContract()
  const { isLoading: appConfirming, isSuccess: appDone } = useWaitForTransactionReceipt({ hash: approveTx })
  const { isLoading: lnchConfirming, isSuccess: lnchDone } = useWaitForTransactionReceipt({ hash: launchTx })

  useEffect(() => { if (appDone && step === 'approving') doLaunch() }, [appDone])
  useEffect(() => { if (lnchDone) setStep('done') }, [lnchDone])

  const busy = isPending || appConfirming || lnchConfirming

  /* ── tax mode sync ── */
  const applyMode = (id: string) => {
    setTaxMode(id)
    const m = TAX_MODES.find(t => t.id === id)
    if (m && m.curve !== -1) { setCurve(m.curve); setCr(m.creator) }
  }

  /* ── form updater ── */
  const up = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  /* ── reset ── */
  const reset = () => {
    setForm(INIT); setSI(2); setCS(''); setGI(3); setCG('')
    setTaxMode('community'); setCurve(8000); setCr(0)
  }

  /* ── tx funcs ── */
  const doApprove = () => {
    setStep('approving')
    writeContract(
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [FACTORY_ADDRESS as any, fee], chainId: CHAIN_ID as any } as any,
      { onSuccess: h => setAppTx(h), onError: (e: any) => { setStep('form'); toast.error(parseOnchainError(e)) } }
    )
  }

  const doLaunch = () => {
    if (!FACTORY_ADDRESS) { toast.error('Factory address not set'); return }
    setStep('launching')
    writeContract({
      address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'launchToken',
      args: [{
        name: form.name.trim(), symbol: form.symbol.trim().toUpperCase(),
        description: form.description, imageUri: form.imageUri,
        twitter: form.twitter, telegram: form.telegram, website: form.website,
        totalSupply: supply, curveAllocationBps: BigInt(curveBps),
        creatorAllocationBps: BigInt(creatorBps), graduationThresholdUsdc: grad,
      }],
      chainId: CHAIN_ID as any,
    } as any, {
      onSuccess: h => setLTx(h),
      onError: (e: any) => { setStep('form'); toast.error(parseOnchainError(e)) },
    })
  }

  const handleSubmit = () => {
    if (!isConnected) { toast.error('Connect wallet first'); return }
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID as any }); return }
    if (!form.name.trim() || !form.symbol.trim()) { toast.error('Name and symbol are required'); return }
    if (fee > 0n && usdcBalance < fee) { toast.error(`Need ${fmtUsdc(fee)} USDC to launch`); return }
    needApprove ? doApprove() : doLaunch()
  }

  /* ── preview helpers ── */
  const hue      = form.name ? (form.name.charCodeAt(0) * 37) % 360 : 260
  const initials = form.symbol ? form.symbol.slice(0, 2).toUpperCase() : '??'
  const gradLabel = isCustomGrad
    ? (customGrad ? `$${parseFloat(customGrad).toLocaleString()}` : '—')
    : GRADS[gradIdx]?.label ?? '$69K'

  /* ═══════════════════════════════════════════════════════════════════ */
  /* SUCCESS                                                            */
  /* ═══════════════════════════════════════════════════════════════════ */
  if (step === 'done') return (
    <div className="max-w-md mx-auto text-center py-20">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
        <motion.div animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="text-5xl mb-6">🚀</motion.div>
        <h2 className="text-3xl font-black mb-2" style={{ fontFamily: 'Space Grotesk,sans-serif', letterSpacing: '-0.03em', color: 'var(--text1)' }}>
          Token Launched!
        </h2>
        <p className="text-sm mb-1" style={{ color: 'var(--text2)' }}>
          <strong style={{ color: 'var(--text1)' }}>${form.symbol.toUpperCase()}</strong> is live on Arc Mainnet
        </p>
        <p className="text-xs mb-8 tabular-nums" style={{ color: 'var(--text3)' }}>
          {fmt(supply)} supply · {curvePct}% curve · graduates at {gradLabel}
        </p>
        <div className="flex flex-col gap-3">
          <button onClick={() => navigate('/')}
            className="py-3.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
            View All Tokens →
          </button>
          <button onClick={() => { reset(); setStep('form') }}
            className="py-3.5 rounded-2xl text-sm font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text1)', border: '1px solid var(--border)' }}>
            Launch Another Token
          </button>
        </div>
      </motion.div>
    </div>
  )

  /* ═══════════════════════════════════════════════════════════════════ */
  /* MAIN FORM                                                          */
  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <div>
      {/* ── header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-px flex-1" style={{ background: 'var(--border)' }}/>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text3)' }}>Launch</span>
          <div className="h-px flex-1" style={{ background: 'var(--border)' }}/>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-black" style={{ fontFamily: 'Space Grotesk,sans-serif', letterSpacing: '-0.03em', color: 'var(--text1)' }}>
              Create a token
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Fair launch bonding curve · USDC powered · No liquidity needed</p>
          </div>
          {isConnected && (
            <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
              <RotateCcw size={11}/> Reset
            </button>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="max-w-sm mx-auto rounded-2xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Rocket size={26} style={{ color: '#818cf8' }}/>
          </div>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text1)' }}>Connect your wallet</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--text2)' }}>Connect to Arc Mainnet to launch your token.</p>
          <ConnectKitButton/>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">

          {/* ═══ LEFT COLUMN ══════════════════════════════════════════ */}
          <div className="space-y-4">

            {/* ── fee banner ── */}
            {fee > 0n && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: usdcBalance >= fee ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                  border: `1px solid ${usdcBalance >= fee ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}`,
                }}>
                <DollarSign size={15} style={{ color: usdcBalance >= fee ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}/>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold tabular-nums" style={{ color: usdcBalance >= fee ? 'var(--green)' : 'var(--red)' }}>
                    Launch fee: {fmtUsdc(fee)}
                  </span>
                  <span className="text-xs ml-2" style={{ color: 'var(--text2)' }}>
                    {usdcBalance >= fee ? `Balance: ${fmtUsdc(usdcBalance)} · Ready` : `Need ${fmtUsdc(fee)} · Have ${fmtUsdc(usdcBalance)}`}
                  </span>
                </div>
                {step !== 'form' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                    {step === 'approving' ? 'Approving…' : 'Launching…'}
                  </span>
                )}
              </div>
            )}

            {/* ── SECTION 1: Coin Details ── */}
            <Section title="Coin details" icon={Zap} iconColor="#818cf8">
              {/* Image + Name/Ticker row */}
              <div className="flex gap-4 mb-4">
                {/* Image upload — compact left column */}
                <div className="flex-shrink-0">
                  <Field label="Token image">
                    <div className="w-[120px]">
                      <ImageUpload value={form.imageUri} onChange={url => setForm(f => ({ ...f, imageUri: url }))}/>
                    </div>
                  </Field>
                </div>

                {/* Name + ticker + description */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name *">
                      <input className={inputCls} style={inputStyle}
                        placeholder="e.g. Glow Cat" value={form.name} onChange={up('name')} maxLength={64}/>
                    </Field>
                    <Field label="Ticker *">
                      <input className={`${inputCls} uppercase font-mono`} style={inputStyle}
                        placeholder="GCAT" value={form.symbol} onChange={up('symbol')} maxLength={12}/>
                    </Field>
                  </div>
                  <Field label="Description" tip="Shown on the token page. Markdown not supported. Max 500 chars.">
                    <div className="relative">
                      <textarea className={`${inputCls} resize-none`} style={{ ...inputStyle, minHeight: 72 }}
                        placeholder="A short description of the token…"
                        value={form.description} onChange={up('description') as any} maxLength={500}/>
                      <span className="absolute bottom-2 right-3 text-[9px] tabular-nums" style={{ color: 'var(--text3)' }}>
                        {form.description.length}/500
                      </span>
                    </div>
                  </Field>
                </div>
              </div>

              {/* Socials — collapsible */}
              <button type="button" onClick={() => setSoc(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold mb-2"
                style={{ color: showSocials ? '#818cf8' : 'var(--text2)' }}>
                <ChevronDown size={13} style={{ transform: showSocials ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                Add social links <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
              </button>

              <AnimatePresence>
                {showSocials && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {([
                        ['twitter',  'Twitter / X', Twitter, '@handle or URL'],
                        ['telegram', 'Telegram',    Send,    't.me/…'        ],
                        ['website',  'Website',     Globe,   'https://…'     ],
                        ['discord',  'Discord',     Users,   'discord.gg/…'  ],
                      ] as const).map(([k, label, Icon, ph]) => (
                        <div key={k} className="relative">
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>
                          <div className="relative">
                            <Icon size={11} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text3)' }}/>
                            <input className={`${inputCls} pl-8`} style={inputStyle}
                              placeholder={ph} value={(form as any)[k]}
                              onChange={(e) => setForm(f => ({ ...f, [k]: e.target.value }))}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            {/* ── SECTION 2: Tokenomics ── */}
            <Section title="Tokenomics" icon={TrendingUp} iconColor="#22c55e"
              subtitle="Set your token's total supply and graduation target">
              {/* Total supply */}
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Total Supply</span>
                  <Tip text="Total number of tokens that will ever exist. A higher supply means a lower initial price per token."/>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {SUPPLIES.map((s, i) => (
                    <button key={s.label} type="button" onClick={() => { setSI(i); setCS('') }}
                      className="py-2.5 rounded-xl text-[11px] font-bold transition-all"
                      style={{
                        background: supplyIdx === i ? 'rgba(99,102,241,0.14)' : 'var(--surface2)',
                        color:      supplyIdx === i ? '#818cf8'                : 'var(--text2)',
                        border:     `1px solid ${supplyIdx === i ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                      }}>
                      <div>{s.label}</div>
                      <div className="text-[8px] mt-0.5 opacity-60">{s.desc}</div>
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {isCustomSupply && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}>
                      <div className="relative mt-2.5">
                        <input className={inputCls} style={inputStyle} type="number" min={1} step={0.1}
                          placeholder="Supply in billions (e.g. 2 = 2,000,000,000)"
                          value={customSupply} onChange={e => setCS(e.target.value)}/>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--text3)' }}>B tokens</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Graduation threshold */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Graduation Target</span>
                  <Tip text="The USDC raised goal. When this amount is raised on the bonding curve, the token graduates to a DEX. The first buy triggers the curve — graduation can happen instantly."/>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {GRADS.map((g, i) => (
                    <button key={g.label} type="button" onClick={() => { setGI(i); setCG('') }}
                      className="py-2.5 rounded-xl text-[11px] font-bold transition-all"
                      style={{
                        background: gradIdx === i ? 'rgba(34,197,94,0.12)' : 'var(--surface2)',
                        color:      gradIdx === i ? 'var(--green)'          : 'var(--text2)',
                        border:     `1px solid ${gradIdx === i ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                      }}>
                      <div>{g.label}</div>
                      <div className="text-[8px] mt-0.5 opacity-60">{g.desc}</div>
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {isCustomGrad && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}>
                      <div className="relative mt-2.5">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--text3)' }}>$</span>
                        <input className={`${inputCls} pl-7`} style={inputStyle} type="number" min={1000} step={1000}
                          placeholder="e.g. 30000"
                          value={customGrad} onChange={e => setCG(e.target.value)}/>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'var(--text3)' }}>USDC</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Section>

            {/* ── SECTION 3: Advanced ── */}
            <Section title="Advanced" icon={Flame} iconColor="#f59e0b"
              badge="Optional" subtitle="Token allocation, tax mode, and creator controls">

              {/* Tax mode selector */}
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Allocation mode</span>
                  <Tip text="Determines how the total token supply is split between the bonding curve, DEX liquidity, and the creator. Each share stops where the others leave off."/>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {TAX_MODES.map(m => (
                    <button key={m.id} type="button" onClick={() => applyMode(m.id)}
                      className="py-2.5 px-2 rounded-xl text-[10px] text-left transition-all"
                      style={{
                        background: taxMode === m.id ? 'rgba(99,102,241,0.14)' : 'var(--surface2)',
                        color:      taxMode === m.id ? '#818cf8'                : 'var(--text2)',
                        border:     `1px solid ${taxMode === m.id ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                      }}>
                      <div className="font-bold">{m.label}</div>
                      <div className="opacity-60 mt-0.5 leading-tight">{m.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Donut + sliders */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
                {/* Sliders */}
                <div className="space-y-4">
                  {/* Curve */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#6366f1' }}/>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Curve allocation</span>
                        <Tip text="Tokens reserved for the bonding curve. Buyers purchase from this pool. A higher curve % means more supply available before graduation."/>
                      </div>
                      <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-lg"
                        style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                        {curvePct.toFixed(0)}%
                      </span>
                    </div>
                    <input type="range" min={4000} max={9900} step={100} value={curveBps}
                      onChange={e => { setCurve(Number(e.target.value)); setTaxMode('custom') }}
                      className="w-full accent-indigo-500"/>
                    <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>
                      <span>40%</span><span>99%</span>
                    </div>
                  </div>

                  {/* Creator */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }}/>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Creator allocation</span>
                        <Tip text="Tokens sent directly to your wallet at launch. These may be subject to a lock period set by the platform."/>
                      </div>
                      <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-lg"
                        style={{ background: creatorBps > 0 ? 'rgba(245,158,11,0.1)' : 'var(--surface2)', color: creatorBps > 0 ? 'var(--gold)' : 'var(--text3)' }}>
                        {creatorPct.toFixed(0)}%
                      </span>
                    </div>
                    <input type="range" min={0} max={1000} step={100} value={creatorBps}
                      onChange={e => { setCr(Number(e.target.value)); setTaxMode('custom') }}
                      className="w-full accent-amber-500"/>
                    <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>
                      <span>None</span><span>10%</span>
                    </div>
                  </div>

                  {/* DEX (read-only derived) */}
                  <div className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                    style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)' }}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)' }}/>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--green)' }}>DEX Liquidity (at graduation)</span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>{dexPct.toFixed(1)}%</span>
                  </div>

                  {/* Warning if curve + creator > 100% */}
                  {totalPct > 100.01 && (
                    <div className="flex items-start gap-2 p-2.5 rounded-xl"
                      style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                      <AlertTriangle size={12} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }}/>
                      <p className="text-[10px]" style={{ color: 'var(--text2)' }}>
                        Total exceeds 100%. Reduce curve or creator allocation.
                      </p>
                    </div>
                  )}

                  {/* Creator lock notice */}
                  {creatorBps > 0 && (
                    <div className="flex items-start gap-2 p-2.5 rounded-xl"
                      style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <Lock size={11} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }}/>
                      <p className="text-[10px]" style={{ color: 'var(--text2)' }}>
                        <strong style={{ color: 'var(--gold)' }}>{fmt(creatorTokens)} tokens ({creatorPct.toFixed(0)}%)</strong> will be sent to your wallet at launch and may be subject to a platform lock period.
                      </p>
                    </div>
                  )}
                </div>

                {/* Donut chart */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-28 h-28">
                    <Donut curve={curvePct} creator={creatorPct} dex={dexPct}/>
                  </div>
                  <div className="space-y-1 w-full">
                    {[
                      { color: '#6366f1', label: 'Curve',   pct: pct(curvePct)   },
                      { color: '#f59e0b', label: 'Creator', pct: pct(creatorPct) },
                      { color: '#22c55e', label: 'DEX',     pct: pct(dexPct)     },
                    ].map(({ color, label, pct: p }) => (
                      <div key={label} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }}/>
                          <span style={{ color: 'var(--text2)' }}>{label}</span>
                        </div>
                        <span className="font-bold tabular-nums" style={{ color: 'var(--text1)' }}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Submit ── */}
            <div className="space-y-3">
              {chainId !== CHAIN_ID ? (
                <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID as any })}
                  className="w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--gold)' }}>
                  <AlertTriangle size={15}/> Switch to Arc Mainnet
                </button>
              ) : (
                <motion.button type="button" whileHover={{ scale: busy ? 1 : 1.01 }} whileTap={{ scale: busy ? 1 : 0.98 }}
                  onClick={handleSubmit}
                  disabled={busy || !form.name.trim() || !form.symbol.trim() || (fee > 0n && usdcBalance < fee) || totalPct > 100.01}
                  className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
                  {busy
                    ? <><Loader2 size={16} className="animate-spin"/>{step === 'approving' ? 'Approving USDC…' : 'Launching…'}</>
                    : needApprove
                      ? <><ShieldCheck size={16}/>Approve {fmtUsdc(fee)} USDC</>
                      : <><Rocket size={16}/>Launch Token<ArrowRight size={14}/></>
                  }
                </motion.button>
              )}
              {needApprove && !busy && (
                <p className="text-center text-[11px]" style={{ color: 'var(--text3)' }}>
                  Step 1 of 2 — approve USDC, then the launch fires automatically
                </p>
              )}
            </div>
          </div>

          {/* ═══ RIGHT COLUMN: Token Preview ═══════════════════════════ */}
          <div className="xl:sticky xl:top-20 space-y-4 self-start">

            {/* Live preview card */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--text3)' }}>Token Preview</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>Live</span>
              </div>

              {/* Hero image */}
              <div className="relative h-32 overflow-hidden"
                style={{ background: form.imageUri ? 'black' : `linear-gradient(135deg,hsl(${hue},55%,28%),hsl(${(hue + 120) % 360},50%,22%))` }}>
                {form.imageUri ? (
                  <img src={form.imageUri} className="w-full h-full object-cover opacity-60"/>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-black text-white/20" style={{ fontFamily: 'Space Grotesk' }}>{initials}</span>
                  </div>
                )}
                {/* Overlay logo */}
                <div className="absolute bottom-3 left-4 flex items-end gap-2.5">
                  {form.imageUri
                    ? <img src={form.imageUri} className="w-10 h-10 rounded-xl object-cover border-2" style={{ borderColor: 'rgba(255,255,255,0.2)' }}/>
                    : <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white"
                        style={{ background: `linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue + 120) % 360},55%,40%))` }}>{initials}</div>}
                  <div>
                    <div className="text-sm font-black text-white leading-none" style={{ fontFamily: 'Space Grotesk', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                      {form.name || 'Token Name'}
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: '#a5b4fc', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                      ${form.symbol || 'SYMBOL'}
                    </div>
                  </div>
                </div>
                {/* 0% milestone badge */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ background: 'rgba(0,0,0,0.5)', color: 'white', backdropFilter: 'blur(8px)' }}>
                  0% of milestone
                </div>
              </div>

              {/* Stats */}
              <div className="p-4 space-y-2.5">
                {form.description && (
                  <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text2)' }}>{form.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Market Cap', value: '$2.5K' },
                    { label: 'Price',      value: '$0.0000025' },
                    { label: 'Supply',     value: fmt(supply) },
                    { label: 'Graduates',  value: gradLabel },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-2.5 py-2 rounded-xl" style={{ background: 'var(--surface2)' }}>
                      <div className="text-[8px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>{label}</div>
                      <div className="text-[11px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text1)' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Curve progress bar */}
                <div>
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: 'var(--text3)' }}>Bonding curve progress</span>
                    <span className="tabular-nums" style={{ color: 'var(--text3)' }}>0%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
                    <div className="h-full rounded-full w-0" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Launch summary */}
            <div className="rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--text3)' }}>Launch Summary</span>
              </div>
              <div className="p-4 space-y-0">
                {[
                  { k: 'Network',      v: 'Arc Mainnet',      accent: false },
                  { k: 'Currency',     v: 'USDC',             accent: false },
                  { k: 'Total Supply', v: fmt(supply),         accent: false },
                  { k: 'Curve',        v: `${curvePct.toFixed(0)}%`,  accent: false },
                  { k: 'Creator',      v: `${creatorPct.toFixed(0)}%`, accent: creatorBps > 0 },
                  { k: 'DEX Liq.',     v: `${dexPct.toFixed(1)}%`,   accent: false },
                  { k: 'Graduates at', v: gradLabel,           accent: true  },
                  ...(fee > 0n ? [{ k: 'Launch fee', v: fmtUsdc(fee), accent: false }] : []),
                ].map(({ k, v, accent }) => (
                  <div key={k} className="flex justify-between items-center py-1.5 border-b last:border-0 text-xs" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--text2)' }}>{k}</span>
                    <span className="font-semibold tabular-nums" style={{ color: accent ? '#818cf8' : 'var(--text1)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Checklist */}
            <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] block mb-3" style={{ color: 'var(--text3)' }}>Checklist</span>
              {[
                { label: 'Name set',        done: !!form.name.trim()         },
                { label: 'Ticker set',      done: !!form.symbol.trim()       },
                { label: 'Logo uploaded',   done: !!form.imageUri            },
                { label: 'Description',     done: !!form.description.trim()  },
                { label: 'Socials added',   done: !!(form.twitter || form.telegram || form.website) },
                { label: 'Enough USDC',     done: fee === 0n || usdcBalance >= fee },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-2 py-1">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ background: done ? 'rgba(34,197,94,0.15)' : 'var(--surface2)', border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : 'var(--border)'}` }}>
                    {done && <Check size={9} style={{ color: 'var(--green)' }}/>}
                  </div>
                  <span className="text-[10px]" style={{ color: done ? 'var(--text1)' : 'var(--text3)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

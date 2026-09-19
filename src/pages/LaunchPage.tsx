import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useSwitchChain, useReadContract,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { ImageUpload } from '@/components/ImageUpload'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { parseOnchainError } from '@/utils/errors'
import {
  Rocket, Twitter, Send, Globe, Info, ExternalLink, ChevronDown,
  ChevronRight, TrendingUp, Zap, Trophy, Users, AlertTriangle,
  Check, DollarSign, Loader2, ShieldCheck,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const SUPPLY_PRESETS = [
  { label: '100M', value: 100_000_000n * 10n ** 18n, desc: 'Micro-cap' },
  { label: '500M', value: 500_000_000n * 10n ** 18n, desc: 'Mid-size' },
  { label: '1B',   value: 1_000_000_000n * 10n ** 18n, desc: 'Classic' },
  { label: '10B',  value: 10_000_000_000n * 10n ** 18n, desc: 'Doge-style' },
]

const GRAD_PRESETS = [
  { label: '$10K',  value: 10_000n * 1_000_000n,  desc: 'Fast' },
  { label: '$25K',  value: 25_000n * 1_000_000n,  desc: 'Quick' },
  { label: '$69K',  value: 69_000n * 1_000_000n,  desc: 'Standard' },
  { label: '$100K', value: 100_000n * 1_000_000n, desc: 'Premium' },
  { label: '$200K', value: 200_000n * 1_000_000n, desc: 'Large' },
]

interface FormState {
  name: string; symbol: string; description: string
  imageUri: string; twitter: string; telegram: string; website: string
}
const INITIAL: FormState = { name: '', symbol: '', description: '', imageUri: '', twitter: '', telegram: '', website: '' }

type Step = 'form' | 'approving' | 'launching' | 'done'

function formatUsdc(v: bigint) {
  const n = Number(v) / 1e6
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`
}
function formatSupply(n: bigint) {
  const v = Number(n) / 1e18
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`
  return v.toLocaleString()
}
function estimateLaunchPrice() {
  return `$${(30_000 / 1_073_000_191 / 1e12).toExponential(3)}`
}

// ── Slider ────────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format: (v: number) => string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.45)' }}>{label}</span>
        <span className="text-sm font-bold text-white">{format(value)}</span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" style={{ margin: 0 }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow-lg pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)`, background: 'white', borderColor: '#8b5cf6', boxShadow: '0 0 8px rgba(139,92,246,0.5)' }} />
      </div>
    </div>
  )
}

// ── Fee Banner ────────────────────────────────────────────────────────────────
function FeeBanner({
  creationFee, usdcBalance, usdcAllowance, step,
}: {
  creationFee: bigint; usdcBalance: bigint; usdcAllowance: bigint; step: Step
}) {
  if (creationFee === 0n) return null

  const hasBalance  = usdcBalance  >= creationFee
  const hasApproval = usdcAllowance >= creationFee

  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl mb-4"
      style={{
        background: hasBalance ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
        border: `1px solid ${hasBalance ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
      }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: hasBalance ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)' }}>
        <DollarSign size={16} style={{ color: hasBalance ? '#34d399' : '#f87171' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: hasBalance ? '#34d399' : '#f87171' }}>
            Launch fee: {formatUsdc(creationFee)} USDC
          </span>
          {hasApproval && hasBalance && (
            <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
              <ShieldCheck size={10} />Approved
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {!hasBalance
            ? `Insufficient USDC — you have ${formatUsdc(usdcBalance)}`
            : hasApproval
              ? `You have ${formatUsdc(usdcBalance)} USDC · approval ready`
              : `You have ${formatUsdc(usdcBalance)} USDC · approval required before launch`}
        </div>

        {/* Step indicator */}
        {step !== 'form' && (
          <div className="flex items-center gap-2 mt-2">
            {[
              { key: 'approving', label: 'Approve USDC' },
              { key: 'launching', label: 'Launch token' },
            ].map((s, i) => {
              const done = step === 'launching' && s.key === 'approving' || step === 'done'
              const active = step === s.key
              return (
                <div key={s.key} className="flex items-center gap-1.5">
                  {i > 0 && <div className="w-4 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />}
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: done ? 'rgba(52,211,153,0.2)' : active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)' }}>
                      {done
                        ? <Check size={9} style={{ color: '#34d399' }} />
                        : active
                          ? <Loader2 size={9} className="animate-spin" style={{ color: '#a78bfa' }} />
                          : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>{i + 1}</span>}
                    </div>
                    <span className="text-[10px]" style={{ color: done ? '#34d399' : active ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}>
                      {s.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── PreviewCard ───────────────────────────────────────────────────────────────
function PreviewCard({ form, supply, curveBps, creatorBps, gradUsdc, creationFee }: {
  form: FormState; supply: bigint; curveBps: number; creatorBps: number; gradUsdc: bigint; creationFee: bigint
}) {
  const curveTokens   = (supply * BigInt(curveBps)) / 10_000n
  const creatorTokens = (supply * BigInt(creatorBps)) / 10_000n
  const gradTokens    = supply - curveTokens - creatorTokens
  const hue = form.name ? (form.name.charCodeAt(0) * 37 + (form.symbol.charCodeAt(0) || 0) * 13) % 360 : 260
  const tokenGrad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue + 120) % 360},70%,40%))`

  return (
    <div className="space-y-3">
      <GlassCard className="overflow-hidden" glow>
        <div className="h-[2px]" style={{ background: SPECTRAL }} />
        <div className="p-5">
          <div className="flex gap-4 items-start mb-4">
            {form.imageUri
              ? <img src={form.imageUri} alt="" className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" style={{ border: '2px solid rgba(255,255,255,0.1)' }} />
              : <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-xl" style={{ background: tokenGrad }}>
                  {form.symbol ? form.symbol.slice(0, 2).toUpperCase() : '??'}
                </div>
            }
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold text-white truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {form.name || 'Token Name'}
              </div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: 'rgba(0,0,0,0.45)' }}>
                ${form.symbol || 'SYMBOL'}
              </div>
              <p className="text-xs mt-1.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {form.description || 'Your token description will appear here.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Launch Price', value: estimateLaunchPrice() },
              { label: 'Grad at', value: Number(gradUsdc) / 1e6 >= 1000 ? `$${(Number(gradUsdc) / 1e9).toFixed(0)}K` : `$${(Number(gradUsdc) / 1e6).toFixed(0)}` },
              { label: 'Total Supply', value: formatSupply(supply) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: '#f9fafb', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="text-xs font-bold" style={{ color: "#111827" }}>{value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Token Allocation</div>
        <div className="space-y-2">
          {[
            { label: 'Bonding Curve', pct: curveBps / 100, tokens: curveTokens, color: '#8b5cf6', icon: <TrendingUp size={11} />, desc: 'Tradeable on launch' },
            { label: 'DEX Liquidity', pct: Number(gradTokens) * 100 / Number(supply), tokens: gradTokens, color: '#34d399', icon: <Trophy size={11} />, desc: 'Released at graduation' },
            ...(creatorBps > 0 ? [{ label: 'Creator', pct: creatorBps / 100, tokens: creatorTokens, color: '#f59e0b', icon: <Users size={11} />, desc: 'To your wallet' }] : []),
          ].map(({ label, pct, tokens, color, icon, desc }) => (
            <div key={label}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5" style={{ color }}>
                  {icon}
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>· {desc}</span>
                </div>
                <span className="text-xs font-bold" style={{ color: "#111827" }}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Launch Summary</div>
        <div className="space-y-2">
          {[
            { label: 'Network',       value: 'Arc Mainnet' },
            { label: 'Currency',      value: 'USDC' },
            { label: 'Curve model',   value: 'Constant-product AMM' },
            { label: 'Protocol fee',  value: '1%' },
            { label: 'Graduates at',  value: `${Number(gradUsdc) / 1e6 >= 1000 ? '$' + (Number(gradUsdc) / 1e9).toFixed(0) + 'K' : '$' + (Number(gradUsdc) / 1e6).toFixed(0)} USDC` },
            ...(creationFee > 0n ? [{ label: 'Launch fee', value: `${formatUsdc(creationFee)} USDC` }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>{label}</span>
              <span className="text-xs font-semibold" style={{ color: "#111827" }}>{value}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

// ── Main LaunchPage ───────────────────────────────────────────────────────────
export function LaunchPage() {
  const nav = useNavigate()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()

  const [form, setForm]             = useState<FormState>(INITIAL)
  const [step, setStep]             = useState<Step>('form')
  const [launchTxHash, setLaunchTxHash] = useState<`0x${string}` | undefined>()
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [supplyPreset, setSupplyPreset] = useState(2)
  const [customSupply, setCustomSupply] = useState('')
  const [curveBps, setCurveBps]     = useState(8000)
  const [creatorBps, setCreatorBps] = useState(0)
  const [gradPreset, setGradPreset] = useState(2)
  const [customGrad, setCustomGrad] = useState('')

  const supply: bigint = useMemo(() => {
    if (customSupply) {
      const n = parseFloat(customSupply)
      if (!isNaN(n) && n >= 1_000_000) return BigInt(Math.floor(n)) * 10n ** 18n
    }
    return SUPPLY_PRESETS[supplyPreset]?.value ?? 1_000_000_000n * 10n ** 18n
  }, [supplyPreset, customSupply])

  const gradUsdc: bigint = useMemo(() => {
    if (customGrad) {
      const n = parseFloat(customGrad)
      if (!isNaN(n) && n > 0) return BigInt(Math.floor(n * 1_000_000))
    }
    return GRAD_PRESETS[gradPreset]?.value ?? 69_000n * 1_000_000n
  }, [gradPreset, customGrad])

  const isWrongChain = isConnected && chainId !== CHAIN_ID

  // ── On-chain reads ────────────────────────────────────────────────────────
  const { data: creationFeeRaw } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'creationFee',
    chainId: CHAIN_ID as any,
    query: { enabled: !!FACTORY_ADDRESS },
  })
  const creationFee = (creationFeeRaw as bigint) ?? 0n

  const { data: usdcBalanceRaw, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID as any,
    query: { enabled: !!address && creationFee > 0n },
  })
  const usdcBalance = (usdcBalanceRaw as bigint) ?? 0n

  const { data: usdcAllowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && FACTORY_ADDRESS ? [address, FACTORY_ADDRESS] : undefined,
    chainId: CHAIN_ID as any,
    query: { enabled: !!address && !!FACTORY_ADDRESS && creationFee > 0n },
  })
  const usdcAllowance = (usdcAllowanceRaw as bigint) ?? 0n

  const needsApproval = creationFee > 0n && usdcAllowance < creationFee

  // ── Transactions ──────────────────────────────────────────────────────────
  const { writeContract, isPending } = useWriteContract()

  // Wait for approval tx
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  // Wait for launch tx
  const { isLoading: launchConfirming, isSuccess: launchSuccess } =
    useWaitForTransactionReceipt({ hash: launchTxHash })

  // After approval confirmed → auto-launch
  useEffect(() => {
    if (!approveSuccess || step !== 'approving') return
    refetchAllowance()
    refetchBalance()
    toast.success('USDC approved! Submitting launch transaction…')
    doLaunch()
  }, [approveSuccess])

  // After launch confirmed → done
  useEffect(() => {
    if (launchSuccess && launchTxHash) setStep('done')
  }, [launchSuccess, launchTxHash])

  const update = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // ── Core actions ──────────────────────────────────────────────────────────
  const doApprove = () => {
    setStep('approving')
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [FACTORY_ADDRESS as `0x${string}`, creationFee],
      chainId: CHAIN_ID as any,
    } as any, {
      onSuccess: hash => {
        setApproveTxHash(hash)
        toast.info('Approval submitted — waiting for confirmation…')
      },
      onError: e => {
        setStep('form')
        toast.error(parseOnchainError(e))
      },
    })
  }

  const doLaunch = () => {
    if (!FACTORY_ADDRESS) { toast.error('Launching is not available yet.'); return }
    setStep('launching')
    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'launchToken',
      args: [{
        name:                     form.name.trim(),
        symbol:                   form.symbol.trim().toUpperCase(),
        description:              form.description,
        imageUri:                 form.imageUri,
        twitter:                  form.twitter,
        telegram:                 form.telegram,
        website:                  form.website,
        totalSupply:              supply,
        curveAllocationBps:       BigInt(curveBps),
        creatorAllocationBps:     BigInt(creatorBps),
        graduationThresholdUsdc:  gradUsdc,
      }],
      chainId: CHAIN_ID as any,
    } as any, {
      onSuccess: hash => {
        setLaunchTxHash(hash)
        toast.success('Token launch submitted! Waiting for confirmation…')
      },
      onError: e => {
        setStep('form')
        toast.error(parseOnchainError(e))
      },
    })
  }

  const handleLaunch = () => {
    if (!isConnected)   { toast.error('Connect your wallet first.');    return }
    if (isWrongChain)   { switchChain({ chainId: CHAIN_ID as any });    return }
    if (!FACTORY_ADDRESS) { toast.error('Launching is not available yet.'); return }
    if (!form.name.trim() || !form.symbol.trim()) { toast.error('Name and ticker are required.'); return }
    if (creationFee > 0n && usdcBalance < creationFee) {
      toast.error(`Insufficient USDC. You need ${formatUsdc(creationFee)} to launch.`)
      return
    }

    if (needsApproval) {
      doApprove()
    } else {
      doLaunch()
    }
  }

  const busy = isPending || approveConfirming || launchConfirming

  const inputStyle: React.CSSProperties = {
    background: '#f3f4f6', border: '1px solid rgba(0,0,0,0.09)',
    borderRadius: 12, color: '#111827', outline: 'none', width: '100%',
    padding: '10px 12px', fontSize: 13,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4, display: 'block',
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 0 40px rgba(139,92,246,0.4)' }}>
            <Check size={36} className="text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
            Token Launched! 🚀
          </h2>
          <p className="text-sm mb-2" style={{ color: '#6b7280' }}>
            <strong className="text-white">${form.symbol.toUpperCase()}</strong> is live on Arc Mainnet.
          </p>
          <p className="text-xs mb-8" style={{ color: 'rgba(0,0,0,0.35)' }}>
            {formatSupply(supply)} supply · {curveBps / 100}% on curve · graduates at {Number(gradUsdc) / 1e6 >= 1000 ? '$' + (Number(gradUsdc) / 1e9).toFixed(0) + 'K' : '$' + (Number(gradUsdc) / 1e6).toFixed(0)} USDC
          </p>
          <div className="flex flex-col gap-3">
            {launchTxHash && (
              <a href={`${EXPLORER_BASE}/tx/${launchTxHash}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium no-underline"
                style={{ background: '#f3f4f6', color: '#1f2937', border: '1px solid rgba(0,0,0,0.08)' }}>
                <ExternalLink size={14} />View Transaction
              </a>
            )}
            <button onClick={() => nav('/')} className="py-3 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              View All Tokens →
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.35)' }}>Token Factory</span>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "#111827", fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Launch a Token</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(0,0,0,0.45)' }}>
          Deploy your meme token to the Arc bonding curve. Customize supply, allocation, and graduation target.
        </p>
      </motion.div>

      {!isConnected ? (
        <GlassCard className="p-12 text-center max-w-md mx-auto">
          <Rocket size={32} className="mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p className="text-base font-semibold text-white mb-2">Connect your wallet</p>
          <p className="text-sm mb-6" style={{ color: 'rgba(0,0,0,0.45)' }}>You need a wallet connected to Arc Mainnet to launch.</p>
          <ConnectKitButton />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* ── LEFT: Form ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">

            {/* Fee banner */}
            <FeeBanner
              creationFee={creationFee}
              usdcBalance={usdcBalance}
              usdcAllowance={usdcAllowance}
              step={step}
            />

            {/* Token Details */}
            <GlassCard className="overflow-hidden">
              <div className="h-[2px]" style={{ background: SPECTRAL }} />
              <div className="p-6 space-y-4">
                <div className="text-sm font-semibold" style={{ color: "#111827", fontFamily: 'Space Grotesk, sans-serif' }}>Token Details</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={labelStyle}>Token Name *</label>
                    <input style={inputStyle} placeholder="e.g. Glow Cat" value={form.name} onChange={update('name')} maxLength={64} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ticker *</label>
                    <input style={{ ...inputStyle, textTransform: 'uppercase' }} placeholder="e.g. GCAT" value={form.symbol} onChange={update('symbol')} maxLength={12} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea style={{ ...inputStyle, resize: 'none', minHeight: 80 }}
                    placeholder="What is this token about?" value={form.description}
                    onChange={update('description') as any} maxLength={500} />
                  <div className="text-right text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{form.description.length}/500</div>
                </div>

                <div>
                  <label style={labelStyle}>Token Logo</label>
                  <ImageUpload value={form.imageUri} onChange={url => setForm(f => ({ ...f, imageUri: url }))} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'twitter' as const,  icon: <Twitter size={9} />, label: 'Twitter',  placeholder: '@handle' },
                    { key: 'telegram' as const, icon: <Send size={9} />,    label: 'Telegram', placeholder: 't.me/...' },
                    { key: 'website' as const,  icon: <Globe size={9} />,   label: 'Website',  placeholder: 'https://...' },
                  ].map(({ key, icon, label, placeholder }) => (
                    <div key={key}>
                      <label style={labelStyle}>{icon} {label}</label>
                      <input style={inputStyle} placeholder={placeholder} value={form[key]} onChange={update(key)} />
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* Supply */}
            <GlassCard className="p-6 space-y-4">
              <div className="text-sm font-semibold" style={{ color: "#111827", fontFamily: 'Space Grotesk, sans-serif' }}>Total Supply</div>
              <div className="grid grid-cols-4 gap-2">
                {SUPPLY_PRESETS.map((p, i) => (
                  <button key={p.label} onClick={() => { setSupplyPreset(i); setCustomSupply('') }}
                    className="py-2.5 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      background: supplyPreset === i && !customSupply ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                      color: supplyPreset === i && !customSupply ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                      border: supplyPreset === i && !customSupply ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(255,255,255,0.05)',
                    }}>
                    <div>{p.label}</div><div className="text-[10px] mt-0.5 opacity-60">{p.desc}</div>
                  </button>
                ))}
              </div>
              <div>
                <label style={labelStyle}>Custom supply</label>
                <input style={inputStyle} type="number" placeholder="e.g. 250000000"
                  value={customSupply} onChange={e => { setCustomSupply(e.target.value); setSupplyPreset(-1) }} />
              </div>
            </GlassCard>

            {/* Advanced tokenomics */}
            <GlassCard className="overflow-hidden">
              <button onClick={() => setShowAdvanced(v => !v)}
                className="w-full flex items-center justify-between p-5 text-left" style={{ color: '#111827' }}>
                <div className="flex items-center gap-2">
                  <Zap size={15} style={{ color: '#a78bfa' }} />
                  <span className="text-sm font-semibold">Advanced Tokenomics</span>
                  <span className="text-xs px-2 py-0.5 rounded-full ml-1" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>Optional</span>
                </div>
                <ChevronDown size={16} style={{ color: 'rgba(0,0,0,0.45)', transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                    <div className="px-5 pb-5 space-y-6 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                      <div className="pt-4">
                        <Slider label="Bonding Curve Allocation" value={curveBps} min={5000} max={9500} step={100}
                          onChange={setCurveBps} format={v => `${(v / 100).toFixed(0)}%`} />
                      </div>
                      <div>
                        <Slider label="Creator Allocation" value={creatorBps} min={0} max={1000} step={100}
                          onChange={setCreatorBps} format={v => v === 0 ? 'None (trustless)' : `${(v / 100).toFixed(0)}%`} />
                        {creatorBps > 0 && (
                          <div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-lg" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.1)' }}>
                            <AlertTriangle size={12} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                            <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
                              {(creatorBps / 100).toFixed(0)}% ({formatSupply((supply * BigInt(creatorBps)) / 10_000n)} tokens) sent to your wallet at launch.
                            </p>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(0,0,0,0.45)' }}>Graduation Threshold</div>
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          {GRAD_PRESETS.map((p, i) => (
                            <button key={p.label} onClick={() => { setGradPreset(i); setCustomGrad('') }}
                              className="py-2 rounded-xl text-xs font-semibold transition-all"
                              style={{
                                background: gradPreset === i && !customGrad ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                                color: gradPreset === i && !customGrad ? '#34d399' : 'rgba(255,255,255,0.4)',
                                border: gradPreset === i && !customGrad ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(255,255,255,0.05)',
                              }}>{p.label}</button>
                          ))}
                        </div>
                        <input style={inputStyle} type="number" placeholder="Custom USDC amount"
                          value={customGrad} onChange={e => { setCustomGrad(e.target.value); setGradPreset(-1) }} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>

            {/* Info */}
            <div className="flex gap-2 p-3.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
              <Info size={13} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                <strong className="text-white/60">{formatSupply(supply)} tokens</strong> will be minted.{' '}
                <strong className="text-white/60">{(curveBps / 100).toFixed(0)}%</strong> on the bonding curve,{' '}
                {creatorBps > 0 && <><strong className="text-white/60">{(creatorBps / 100).toFixed(0)}%</strong> to creator, </>}
                the rest reserved for DEX liquidity at graduation.
              </p>
            </div>

            {/* CTA button */}
            {isWrongChain ? (
              <button onClick={() => switchChain({ chainId: CHAIN_ID as any })}
                className="w-full py-4 rounded-2xl text-sm font-bold"
                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                Switch to Arc Mainnet
              </button>
            ) : (
              <motion.button whileHover={{ scale: busy ? 1 : 1.01 }} whileTap={{ scale: busy ? 1 : 0.98 }}
                onClick={handleLaunch}
                disabled={busy || !form.name.trim() || !form.symbol.trim() || (creationFee > 0n && usdcBalance < creationFee)}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2.5 disabled:opacity-50"
                style={{
                  background: busy ? 'rgba(139,92,246,0.4)' : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  boxShadow: busy ? 'none' : '0 4px 24px rgba(139,92,246,0.3)',
                }}>
                {busy
                  ? <><Loader2 size={16} className="animate-spin" />{step === 'approving' ? 'Approving USDC…' : 'Launching…'}</>
                  : needsApproval
                    ? <><ShieldCheck size={16} />Approve {formatUsdc(creationFee)} USDC<ChevronRight size={14} /></>
                    : <><Rocket size={16} />Launch Token<ChevronRight size={14} /></>}
              </motion.button>
            )}

            {/* Two-step hint */}
            {needsApproval && !busy && (
              <p className="text-center text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
                Step 1 of 2 — approve USDC, then the launch transaction fires automatically
              </p>
            )}
          </motion.div>

          {/* ── RIGHT: Live preview ──────────────────────────────── */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div className="lg:sticky lg:top-6">
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(0,0,0,0.35)' }}>Live Preview</div>
              <PreviewCard form={form} supply={supply} curveBps={curveBps} creatorBps={creatorBps} gradUsdc={gradUsdc} creationFee={creationFee} />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

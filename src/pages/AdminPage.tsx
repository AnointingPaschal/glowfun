import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { formatUsdc, formatAddress } from '@/utils/format'
import {
  Shield, Settings, Key, Database, Globe, Loader2, Check, Eye, EyeOff,
  RefreshCw, Save, ExternalLink, AlertTriangle, Users, BarChart2, Image, MessageSquare,
  DollarSign, Zap, Lock, Unlock
} from 'lucide-react'
import { parseOnchainError } from '@/utils/errors'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

// Keys that live in Cloudflare KV (via /api/config)
const KV_KEYS = [
  { key: 'FACTORY_ADDRESS', label: 'Factory Contract Address', placeholder: '0x...', category: 'contract', secret: false },
  { key: 'USDC_ADDRESS', label: 'USDC Contract Address', placeholder: '0x3600000000000000000000000000000000000000', category: 'contract', secret: false },
  { key: 'FEE_RECIPIENT', label: 'Fee Recipient Address', placeholder: '0x...', category: 'contract', secret: false },
  { key: 'GRADUATION_RECIPIENT', label: 'Graduation Recipient Address', placeholder: '0x...', category: 'contract', secret: false },
  { key: 'WALLETCONNECT_PROJECT_ID', label: 'WalletConnect Project ID', placeholder: 'Get from cloud.walletconnect.com', category: 'keys', secret: false },
  { key: 'CIRCLE_APP_ID', label: 'Circle App ID', placeholder: 'Get from Circle Dev Console', category: 'keys', secret: false },
  { key: 'CIRCLE_API_KEY', label: 'Circle API Key', placeholder: 'TEST_API_KEY:...', category: 'keys', secret: true },
  { key: 'ADMIN_SECRET', label: 'Admin Panel Password', placeholder: 'Strong password', category: 'keys', secret: true },
  { key: 'R2_PUBLIC_URL', label: 'R2 Public URL (for images)', placeholder: 'https://images.glowfun.pages.dev', category: 'storage', secret: false },
  { key: 'SITE_TITLE', label: 'Site Name', placeholder: 'GlowFun', category: 'site', secret: false },
  { key: 'SITE_LOGO', label: 'Site Logo URL', placeholder: 'https://... (square image, shown in navbar)', category: 'site', secret: false },
  { key: 'SITE_DESCRIPTION', label: 'Site Description', placeholder: 'Launch and trade meme tokens on Arc', category: 'site', secret: false },
  { key: 'TWITTER_HANDLE', label: 'Twitter Handle', placeholder: '@glowfun', category: 'site', secret: false },
  { key: 'RPC_URL', label: 'Custom RPC URL', placeholder: 'https://rpc.arc.io (leave blank for default)', category: 'contract', secret: false },
  { key: 'CREATION_FEE_USDC', label: 'Creation Fee display (USDC)', placeholder: '10', category: 'fees', secret: false },
  { key: 'PROTOCOL_FEE_BPS', label: 'Protocol Fee display (basis points)', placeholder: '100', category: 'fees', secret: false },
  { key: 'GRADUATION_THRESHOLD_USDC', label: 'Graduation Threshold display (USDC)', placeholder: '69000', category: 'fees', secret: false },
  { key: 'REFERRAL_FEE_BPS', label: 'Referral Fee display (basis points)', placeholder: '2500', category: 'fees', secret: false },
  { key: 'ANTI_SNIPE_DURATION', label: 'Anti-Snipe Window (seconds)', placeholder: '60', category: 'fees', secret: false },
  { key: 'ANTI_SNIPE_TAX_BPS', label: 'Anti-Snipe Tax (basis points)', placeholder: '500', category: 'fees', secret: false },
  { key: 'MAX_BUY_BPS', label: 'Max Buy per TX (basis points of curve)', placeholder: '500', category: 'fees', secret: false },
  { key: 'BUY_COOLDOWN_SECONDS', label: 'Buy Cooldown (seconds)', placeholder: '30', category: 'fees', secret: false },
  { key: 'CREATOR_LOCK_DAYS', label: 'Creator Lock Duration (days)', placeholder: '7', category: 'fees', secret: false },
  { key: 'PER_TOKEN_GRAD_FEE_BPS', label: 'Per-Token Graduation Platform Fee (bps)', placeholder: '100', category: 'fees', secret: false },
  { key: 'CREATOR_GRAD_FEE_BPS', label: 'Creator Graduation Bonus (basis points)', placeholder: '500', category: 'fees', secret: false },
]

const CATEGORIES = [
  { id: 'all', label: 'All Settings', icon: Settings },
  { id: 'contract', label: 'Contract', icon: Zap },
  { id: 'keys', label: 'API Keys', icon: Key },
  { id: 'fees', label: 'Fees', icon: DollarSign },
  { id: 'site', label: 'Site', icon: Globe },
  { id: 'storage', label: 'Storage', icon: Database },
]

type Tab = 'config' | 'onchain' | 'tokens' | 'comments'

export function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [authError, setAuthError] = useState('')

  // Config state from KV
  const [kvValues, setKvValues] = useState<Record<string, string>>({})
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [tab, setTab] = useState<Tab>('config')

  // Onchain admin
  const { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrong = isConnected && chainId !== CHAIN_ID
  const { writeContract: adminWrite, data: adminHash, isPending: isAdminPending } = useWriteContract()
  const { isLoading: isAdminConfirming } = useWaitForTransactionReceipt({ hash: adminHash })

  // Onchain reads
  const { data: feeRecipient, refetch: rfFeeRecip } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'feeRecipient', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: gradRecipient } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'graduationRecipient', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: feeBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'protocolFeeBps', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: creationFee } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'creationFee', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: gradThresh } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'graduationThreshold', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: creatorGradFeeBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'creatorGraduationFeeBps', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: referralFeeBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'referralFeeBps', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: antiSnipeDuration } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'antiSnipeDuration', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: antiSnipeTaxBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'antiSnipeTaxBps', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: maxBuyBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'maxBuyBps', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: buyCooldown } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'buyCooldown', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: creatorLockDuration } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'creatorLockDuration', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: perTokenGradFeeBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'perTokenGraduationFeeBps', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: kingOfHill } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'kingOfHill', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: kingRaised } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'kingOfHillRaised', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: paused } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'paused', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: tokenCount } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'tokenCount', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: allTokens } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'allTokens', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })

  // Onchain input state — existing
  const [creationFeeInput, setCreationFeeInput] = useState('')
  const [feeBpsInput, setFeeBpsInput] = useState('')
  const [creatorGradFeeInput, setCreatorGradFeeInput] = useState('')
  const [feeRecipInput, setFeeRecipInput] = useState('')
  const [gradRecipInput, setGradRecipInput] = useState('')
  const [gradThreshInput, setGradThreshInput] = useState('')
  // V2 inputs
  const [referralFeeBpsInput, setReferralFeeBpsInput] = useState('')
  const [antiSnipeDurInput, setAntiSnipeDurInput] = useState('')
  const [antiSnipeTaxInput, setAntiSnipeTaxInput] = useState('')
  const [maxBuyBpsInput, setMaxBuyBpsInput] = useState('')
  const [buyCooldownInput, setBuyCooldownInput] = useState('')
  const [creatorLockInput, setCreatorLockInput] = useState('')
  const [perTokenGradFeeInput, setPerTokenGradFeeInput] = useState('')
  const [blacklistTokenInput, setBlacklistTokenInput] = useState('')
  const [blacklistWalletInput, setBlacklistWalletInput] = useState('')

  const adminAction = (fn: any) => {
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }
    adminWrite(fn, {
      onSuccess: () => toast.success('Transaction submitted'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const checkAuth = () => {
    const stored = kvValues['ADMIN_SECRET'] || 'glowfun_admin_change_me'
    if (pw === stored) { setAuthed(true); setAuthError('') }
    else setAuthError('Incorrect password.')
  }

  const loadConfig = async () => {
    setLoadingConfig(true)
    try {
      const res = await fetch('/api/config')
      const data = await res.json() as Record<string, string>
      setKvValues(data)
      setEditValues(data)
    } catch {
      toast.error('Could not load config from KV. Is the Worker deployed?')
    }
    setLoadingConfig(false)
  }

  useEffect(() => { loadConfig() }, [])

  const saveKey = async (key: string) => {
    const value = editValues[key] ?? ''
    setSaving(s => ({ ...s, [key]: true }))
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': pw,
        },
        body: JSON.stringify({ key, value }),
      })
      const data = await res.json() as any
      if (!data.ok) throw new Error(data.error ?? 'Failed to save')
      setKvValues(v => ({ ...v, [key]: value }))
      setSaved(s => ({ ...s, [key]: true }))
      toast.success(`${key} saved to KV storage`)
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed')
    }
    setSaving(s => ({ ...s, [key]: false }))
  }

  const saveAllInCategory = async (category: string) => {
    const keys = KV_KEYS.filter(k => category === 'all' || k.category === category).map(k => k.key)
    for (const key of keys) {
      if (editValues[key] !== undefined) await saveKey(key)
    }
  }

  const filteredKeys = KV_KEYS.filter(k => activeCategory === 'all' || k.category === activeCategory)

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
          <GlassCard className="p-8" glow>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Shield size={24} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Admin Access</h1>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Enter your admin password to continue</p>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && checkAuth()}
                placeholder="Admin password"
                className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                autoFocus
              />
              {authError && <p className="text-xs text-red-400">{authError}</p>}
              <button onClick={checkAuth} className="w-full py-3 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                Unlock Admin Panel
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Admin</span>
            </div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Control Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadConfig} disabled={loadingConfig} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
              <RefreshCw size={12} className={loadingConfig ? 'animate-spin' : ''} />Refresh
            </button>
            <button onClick={() => setAuthed(false)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
              <Lock size={12} />Lock
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Tokens Launched', value: tokenCount ? tokenCount.toString() : '—', icon: Zap, color: '#a78bfa' },
            { label: 'Factory', value: FACTORY_ADDRESS ? formatAddress(FACTORY_ADDRESS) : 'Not set', icon: Settings, color: '#34d399' },
            { label: 'Protocol Fee', value: feeBps !== undefined ? `${Number(feeBps as bigint) / 100}%` : '—', icon: DollarSign, color: '#fb923c' },
            { label: 'Status', value: paused ? 'PAUSED' : 'Active', icon: paused ? Lock : Unlock, color: paused ? '#f87171' : '#34d399' },
          ].map(({ label, value, icon: Icon, color }) => (
            <GlassCard key={label} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} style={{ color }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
              </div>
              <div className="text-sm font-bold text-white truncate">{value}</div>
            </GlassCard>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'config', label: 'Configuration', icon: Key },
            { id: 'onchain', label: 'Onchain Settings', icon: Zap },
            { id: 'tokens', label: 'All Tokens', icon: BarChart2 },
            { id: 'comments', label: 'Comments', icon: MessageSquare },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all" style={{
              background: tab === id ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: tab === id ? '#a78bfa' : 'rgba(255,255,255,0.4)',
              border: tab === id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
            }}>
              <Icon size={12} /><span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>

        {/* CONFIG TAB */}
        {tab === 'config' && (
          <div className="space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-start gap-2">
                <Database size={14} style={{ color: '#a78bfa', marginTop: 1, flexShrink: 0 }} />
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  All settings below are stored in <strong className="text-white/60">Cloudflare KV</strong> and read by the Workers at runtime. Changes take effect immediately without a redeploy. Secret values are masked.
                </div>
              </div>
            </GlassCard>

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveCategory(id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{
                  background: activeCategory === id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                  color: activeCategory === id ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                  border: activeCategory === id ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Icon size={11} />{label}
                </button>
              ))}
            </div>

            {/* Save all in category */}
            <div className="flex justify-end">
              <button onClick={() => saveAllInCategory(activeCategory)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Save size={12} />Save All {activeCategory !== 'all' ? CATEGORIES.find(c => c.id === activeCategory)?.label : 'Settings'}
              </button>
            </div>

            {/* KV fields */}
            <div className="space-y-3">
              {filteredKeys.map(({ key, label, placeholder, secret }) => {
                const val = editValues[key] ?? ''
                const isSaving = saving[key]
                const isSaved = saved[key]
                const isDirty = val !== (kvValues[key] ?? '')
                const show = showSecret[key]

                return (
                  <GlassCard key={key} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-semibold text-white">{label}</div>
                        <div className="text-xs mt-0.5 font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{key}</div>
                      </div>
                      {isDirty && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>unsaved</span>}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type={secret && !show ? 'password' : 'text'}
                          value={val}
                          onChange={e => setEditValues(v => ({ ...v, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none pr-8"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: secret ? 'monospace' : 'inherit' }}
                        />
                        {secret && (
                          <button onClick={() => setShowSecret(s => ({ ...s, [key]: !s[key] }))} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {show ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => saveKey(key)}
                        disabled={isSaving}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                        style={{ background: isSaved ? 'rgba(52,211,153,0.15)' : 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: isSaved ? '#34d399' : 'white', border: isSaved ? '1px solid rgba(52,211,153,0.2)' : 'none' }}
                      >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : isSaved ? <><Check size={12} />Saved</> : <><Save size={12} />Save</>}
                      </button>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          </div>
        )}

        {/* ONCHAIN TAB */}
        {tab === 'onchain' && (
          <div className="space-y-4">
            {!isConnected ? (
              <GlassCard className="p-8 text-center">
                <p className="text-sm text-white mb-3">Connect your wallet to manage onchain settings</p>
                <ConnectKitButton />
              </GlassCard>
            ) : (
              <>
                {wrong && (
                  <GlassCard className="p-4 flex items-center gap-3">
                    <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
                    <span className="text-sm" style={{ color: '#fbbf24' }}>Wrong network. </span>
                    <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="text-sm underline" style={{ color: '#fbbf24' }}>Switch to Arc Mainnet</button>
                  </GlassCard>
                )}

                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign size={14} style={{ color: '#a78bfa' }} />
                    <span className="text-sm font-semibold text-white">Fee Settings</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'Creation Fee (USDC, 0 = free)', value: creationFeeInput, setValue: setCreationFeeInput, current: creationFee !== undefined ? `Current: ${Number(creationFee as bigint) / 1e6} USDC` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setCreationFee', args: [BigInt(Math.round(parseFloat(creationFeeInput || '0') * 1e6))], chainId: CHAIN_ID as any }), valid: creationFeeInput !== '' },
                      { label: 'Protocol Fee on Trades (bps, max 500 = 5%)', value: feeBpsInput, setValue: setFeeBpsInput, current: feeBps !== undefined ? `Current: ${Number(feeBps as bigint)} bps = ${Number(feeBps as bigint) / 100}%` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setProtocolFeeBps', args: [BigInt(feeBpsInput || '0')], chainId: CHAIN_ID as any }), valid: feeBpsInput !== '' && Number(feeBpsInput) <= 500 },
                      { label: 'Creator Graduation Bonus (bps, max 2000 = 20%)', value: creatorGradFeeInput, setValue: setCreatorGradFeeInput, current: creatorGradFeeBps !== undefined ? `Current: ${Number(creatorGradFeeBps as bigint)} bps = ${Number(creatorGradFeeBps as bigint) / 100}% of graduation USDC to creator` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setCreatorGraduationFeeBps', args: [BigInt(creatorGradFeeInput || '0')], chainId: CHAIN_ID as any }), valid: creatorGradFeeInput !== '' && Number(creatorGradFeeInput) <= 2000 },
                      { label: 'Graduation Threshold (USDC, min $1,000)', value: gradThreshInput, setValue: setGradThreshInput, current: gradThresh !== undefined ? `Current: $${(Number(gradThresh as bigint) / 1e6).toLocaleString()} USDC` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setGraduationThreshold', args: [BigInt(Math.round(parseFloat(gradThreshInput || '0') * 1e6))], chainId: CHAIN_ID as any }), valid: !!gradThreshInput && parseFloat(gradThreshInput) >= 1000 },
                    ].map(({ label, value, setValue, current, fn, valid }) => (
                      <div key={label} className="flex gap-3 items-end">
                        <label className="flex-1 space-y-1.5">
                          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                          {current && <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{current}</div>}
                          <input value={value} onChange={e => setValue(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                        </label>
                        <button onClick={fn} disabled={!valid || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                          {isAdminPending || isAdminConfirming ? <Loader2 size={12} className="animate-spin" /> : <><Save size={12} />Set</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Users size={14} style={{ color: '#a78bfa' }} />
                    <span className="text-sm font-semibold text-white">Recipients</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'Fee Recipient (propose — new address must call acceptFeeRecipient)', value: feeRecipInput, setValue: setFeeRecipInput, current: feeRecipient ? `Current: ${formatAddress(feeRecipient as string)}` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'proposeFeeRecipient', args: [feeRecipInput as `0x${string}`], chainId: CHAIN_ID as any }) },
                      { label: 'Graduation Recipient (propose — new address must call acceptGraduationRecipient)', value: gradRecipInput, setValue: setGradRecipInput, current: gradRecipient ? `Current: ${formatAddress(gradRecipient as string)}` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'proposeGraduationRecipient', args: [gradRecipInput as `0x${string}`], chainId: CHAIN_ID as any }) },
                    ].map(({ label, value, setValue, current, fn }) => (
                      <div key={label} className="flex gap-3 items-end">
                        <label className="flex-1 space-y-1.5">
                          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                          {current && <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{current}</div>}
                          <input value={value} onChange={e => setValue(e.target.value)} placeholder="0x..." className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                        </label>
                        <button onClick={fn} disabled={!value || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                          {isAdminPending || isAdminConfirming ? <Loader2 size={12} className="animate-spin" /> : <><Save size={12} />Set</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {/* V2: Advanced Fee Controls */}
                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={14} style={{ color: '#f59e0b' }} />
                    <span className="text-sm font-semibold text-white">Advanced Fee Controls (V2)</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'Referral Fee (bps of protocol fee, max 5000 = 50%)', value: referralFeeBpsInput, setValue: setReferralFeeBpsInput, current: referralFeeBps !== undefined ? `Current: ${Number(referralFeeBps as bigint)} bps = ${Number(referralFeeBps as bigint) / 100}% of trade fee to referrer` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setReferralFeeBps', args: [BigInt(referralFeeBpsInput || '0')], chainId: CHAIN_ID as any }), valid: referralFeeBpsInput !== '' && Number(referralFeeBpsInput) <= 5000 },
                      { label: 'Anti-Snipe Window (seconds, max 300)', value: antiSnipeDurInput, setValue: setAntiSnipeDurInput, current: antiSnipeDuration !== undefined ? `Current: ${Number(antiSnipeDuration as bigint)}s` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setAntiSnipeConfig', args: [BigInt(antiSnipeDurInput || '0'), BigInt(antiSnipeTaxInput || Number(antiSnipeTaxBps as bigint ?? 500).toString())], chainId: CHAIN_ID as any }), valid: antiSnipeDurInput !== '' },
                      { label: 'Anti-Snipe Tax (bps, max 2000 = 20%)', value: antiSnipeTaxInput, setValue: setAntiSnipeTaxInput, current: antiSnipeTaxBps !== undefined ? `Current: ${Number(antiSnipeTaxBps as bigint)} bps = ${Number(antiSnipeTaxBps as bigint) / 100}%` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setAntiSnipeConfig', args: [BigInt(antiSnipeDurInput || Number(antiSnipeDuration as bigint ?? 60).toString()), BigInt(antiSnipeTaxInput || '0')], chainId: CHAIN_ID as any }), valid: antiSnipeTaxInput !== '' && Number(antiSnipeTaxInput) <= 2000 },
                      { label: 'Max Buy per TX (bps of curve, 0=off, max 5000=50%)', value: maxBuyBpsInput, setValue: setMaxBuyBpsInput, current: maxBuyBps !== undefined ? `Current: ${Number(maxBuyBps as bigint)} bps = ${Number(maxBuyBps as bigint) / 100}% of curve tokens per tx` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setMaxBuyBps', args: [BigInt(maxBuyBpsInput || '0')], chainId: CHAIN_ID as any }), valid: maxBuyBpsInput !== '' && Number(maxBuyBpsInput) <= 5000 },
                      { label: 'Buy Cooldown (seconds between buys, 0=off, max 300)', value: buyCooldownInput, setValue: setBuyCooldownInput, current: buyCooldown !== undefined ? `Current: ${Number(buyCooldown as bigint)}s` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setBuyCooldown', args: [BigInt(buyCooldownInput || '0')], chainId: CHAIN_ID as any }), valid: buyCooldownInput !== '' && Number(buyCooldownInput) <= 300 },
                      { label: 'Creator Lock Duration (seconds, max 30 days = 2592000)', value: creatorLockInput, setValue: setCreatorLockInput, current: creatorLockDuration !== undefined ? `Current: ${Number(creatorLockDuration as bigint)}s = ${(Number(creatorLockDuration as bigint) / 86400).toFixed(1)} days` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setCreatorLockDuration', args: [BigInt(creatorLockInput || '0')], chainId: CHAIN_ID as any }), valid: creatorLockInput !== '' && Number(creatorLockInput) <= 2592000 },
                      { label: 'Per-Token Graduation Platform Fee (bps, max 500 = 5%)', value: perTokenGradFeeInput, setValue: setPerTokenGradFeeInput, current: perTokenGradFeeBps !== undefined ? `Current: ${Number(perTokenGradFeeBps as bigint)} bps = ${Number(perTokenGradFeeBps as bigint) / 100}% of graduation USDC to platform` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setPerTokenGraduationFeeBps', args: [BigInt(perTokenGradFeeInput || '0')], chainId: CHAIN_ID as any }), valid: perTokenGradFeeInput !== '' && Number(perTokenGradFeeInput) <= 500 },
                    ].map(({ label, value, setValue, current, fn, valid }) => (
                      <div key={label} className="flex gap-3 items-end">
                        <label className="flex-1 space-y-1.5">
                          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                          {current && <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{current}</div>}
                          <input value={value} onChange={e => setValue(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                        </label>
                        <button onClick={fn} disabled={!valid || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                          {isAdminPending || isAdminConfirming ? <Loader2 size={12} className="animate-spin" /> : <><Save size={12} />Set</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {/* V2: Blacklists + King of Hill */}
                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle size={14} style={{ color: '#f87171' }} />
                    <span className="text-sm font-semibold text-white">Blacklists & King of Hill</span>
                  </div>
                  <div className="space-y-4">
                    {/* King of Hill */}
                    <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      <p className="text-xs font-semibold text-yellow-400 mb-1">👑 King of the Hill</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Token: <span className="font-mono text-white">{kingOfHill ? (kingOfHill as string).slice(0, 10) + '...' : 'None yet'}</span></p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Raised: <span className="text-yellow-300">${kingRaised ? (Number(kingRaised as bigint) / 1e6).toFixed(2) : '0'} USDC</span></p>
                    </div>
                    {/* Blacklist token */}
                    <div className="flex gap-3 items-end">
                      <label className="flex-1 space-y-1.5">
                        <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Blacklist / Unblacklist Token Address</span>
                        <input value={blacklistTokenInput} onChange={e => setBlacklistTokenInput(e.target.value)} placeholder="0x..." className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                      </label>
                      <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'blacklistToken', args: [blacklistTokenInput as `0x${string}`, true], chainId: CHAIN_ID as any })} disabled={!blacklistTokenInput || isAdminPending} className="px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>Block</button>
                      <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'blacklistToken', args: [blacklistTokenInput as `0x${string}`, false], chainId: CHAIN_ID as any })} disabled={!blacklistTokenInput || isAdminPending} className="px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>Allow</button>
                    </div>
                    {/* Blacklist wallet */}
                    <div className="flex gap-3 items-end">
                      <label className="flex-1 space-y-1.5">
                        <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Blacklist / Unblacklist Wallet Address</span>
                        <input value={blacklistWalletInput} onChange={e => setBlacklistWalletInput(e.target.value)} placeholder="0x..." className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                      </label>
                      <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'blacklistWallet', args: [blacklistWalletInput as `0x${string}`, true], chainId: CHAIN_ID as any })} disabled={!blacklistWalletInput || isAdminPending} className="px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>Block</button>
                      <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'blacklistWallet', args: [blacklistWalletInput as `0x${string}`, false], chainId: CHAIN_ID as any })} disabled={!blacklistWalletInput || isAdminPending} className="px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>Allow</button>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={14} style={{ color: '#a78bfa' }} />
                    <span className="text-sm font-semibold text-white">Emergency Controls</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'pause', chainId: CHAIN_ID as any })} disabled={!!paused || isAdminPending} className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                      <Lock size={13} />Pause Contract
                    </button>
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'unpause', chainId: CHAIN_ID as any })} disabled={!paused || isAdminPending} className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                      <Unlock size={13} />Unpause Contract
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Status: <span style={{ color: paused ? '#f87171' : '#34d399' }}>{paused === undefined ? 'Loading...' : paused ? 'PAUSED' : 'Active'}</span>
                  </div>
                </GlassCard>
              </>
            )}
          </div>
        )}

        {/* TOKENS TAB */}
        {tab === 'tokens' && (
          <GlassCard className="overflow-hidden">
            <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">All Launched Tokens</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>{tokenCount?.toString() ?? '0'} tokens</span>
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {!FACTORY_ADDRESS ? (
                <div className="p-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Set FACTORY_ADDRESS in Configuration tab first.</div>
              ) : !allTokens || (allTokens as string[]).length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No tokens launched yet.</div>
              ) : (
                [...(allTokens as string[])].reverse().map((addr, i) => (
                  <div key={addr} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: `hsl(${parseInt(addr.slice(2,6),16)%360},60%,35%)`, color: 'white' }}>{i + 1}</div>
                      <div>
                        <div className="text-xs font-mono text-white">{formatAddress(addr)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`/token/${addr}`} className="text-xs px-2.5 py-1 rounded-lg no-underline" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>View</a>
                      <a href={`${EXPLORER_BASE}/address/${addr}`} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg no-underline flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                        <ExternalLink size={10} />Explorer
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        )}

        {/* COMMENTS TAB */}
        {tab === 'comments' && (
          <GlassCard className="overflow-hidden">
            <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <span className="text-sm font-semibold text-white">Recent Comments (All Tokens)</span>
            </div>
            <AdminComments />
          </GlassCard>
        )}
      </motion.div>
    </div>
  )
}

function AdminComments() {
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/comments?limit=50')
      .then(r => r.json())
      .then((d: any) => { setComments(d.comments ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
    </div>
  )

  if (comments.length === 0) return (
    <div className="p-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No comments yet.</div>
  )

  return (
    <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      {comments.map(c => (
        <div key={c.id} className="px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono" style={{ color: '#a78bfa' }}>{formatAddress(c.author)}</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>on</span>
            <a href={`/token/${c.token_address}`} className="text-xs font-mono no-underline" style={{ color: 'rgba(255,255,255,0.4)' }}>{formatAddress(c.token_address)}</a>
            <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.2)' }}>{new Date(c.created_at).toLocaleString()}</span>
          </div>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{c.content}</p>
        </div>
      ))}
    </div>
  )
}

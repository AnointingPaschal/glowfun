import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'
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
  { key: 'SITE_TITLE', label: 'Site Title', placeholder: 'GlowFun', category: 'site', secret: false },
  { key: 'SITE_DESCRIPTION', label: 'Site Description', placeholder: 'Launch and trade meme tokens on Arc', category: 'site', secret: false },
  { key: 'TWITTER_HANDLE', label: 'Twitter Handle', placeholder: '@glowfun', category: 'site', secret: false },
  { key: 'CREATION_FEE_USDC', label: 'Creation Fee (USDC)', placeholder: '0', category: 'fees', secret: false },
  { key: 'PROTOCOL_FEE_BPS', label: 'Protocol Fee (basis points)', placeholder: '100', category: 'fees', secret: false },
  { key: 'GRADUATION_THRESHOLD_USDC', label: 'Graduation Threshold (USDC)', placeholder: '69000', category: 'fees', secret: false },
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
  const { data: paused } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'paused', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: tokenCount } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'tokenCount', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })
  const { data: allTokens } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'allTokens', chainId: CHAIN_ID as any, query: { enabled: !!FACTORY_ADDRESS } })

  // Onchain input state
  const [creationFeeInput, setCreationFeeInput] = useState('')
  const [feeBpsInput, setFeeBpsInput] = useState('')
  const [feeRecipInput, setFeeRecipInput] = useState('')
  const [gradRecipInput, setGradRecipInput] = useState('')
  const [gradThreshInput, setGradThreshInput] = useState('')

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
        headers: { 'Content-Type': 'application/json' },
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
                      { label: 'Creation Fee (USDC)', value: creationFeeInput, setValue: setCreationFeeInput, current: creationFee !== undefined ? `Current: ${Number(creationFee as bigint) / 1e6} USDC` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setCreationFee', args: [BigInt(Math.round(parseFloat(creationFeeInput) * 1e6))], chainId: CHAIN_ID as any }), valid: !!creationFeeInput },
                      { label: 'Protocol Fee (basis points, max 500)', value: feeBpsInput, setValue: setFeeBpsInput, current: feeBps !== undefined ? `Current: ${Number(feeBps as bigint)} bps (${Number(feeBps as bigint) / 100}%)` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setProtocolFeeBps', args: [BigInt(feeBpsInput)], chainId: CHAIN_ID as any }), valid: !!feeBpsInput && Number(feeBpsInput) <= 500 },
                      { label: 'Graduation Threshold (USDC)', value: gradThreshInput, setValue: setGradThreshInput, current: gradThresh !== undefined ? `Current: ${Number(gradThresh as bigint) / 1e6} USDC` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setGraduationThreshold', args: [BigInt(Math.round(parseFloat(gradThreshInput) * 1e6))], chainId: CHAIN_ID as any }), valid: !!gradThreshInput },
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
                      { label: 'Fee Recipient', value: feeRecipInput, setValue: setFeeRecipInput, current: feeRecipient ? `Current: ${formatAddress(feeRecipient as string)}` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setFeeRecipient', args: [feeRecipInput as `0x${string}`], chainId: CHAIN_ID as any }) },
                      { label: 'Graduation Recipient', value: gradRecipInput, setValue: setGradRecipInput, current: gradRecipient ? `Current: ${formatAddress(gradRecipient as string)}` : '', fn: () => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setGraduationRecipient', args: [gradRecipInput as `0x${string}`], chainId: CHAIN_ID as any }) },
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

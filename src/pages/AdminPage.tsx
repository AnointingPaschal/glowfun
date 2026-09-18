import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Settings, Key, DollarSign, Globe, Shield, Database, Eye, EyeOff, ExternalLink, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'
import { formatUsdc, formatAddress } from '@/utils/format'
import { parseOnchainError } from '@/utils/errors'
import { useTokenList } from '@/hooks/useTokenList'
import { useTokenData } from '@/hooks/useTokenData'
import type { TokenInfo } from '@/types'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET ?? 'glowfun_admin_change_me'

type AdminTab = 'overview' | 'contract' | 'keys' | 'tokens' | 'metadata'

function TokenRow({ address }: { address: `0x${string}` }) {
  const { token } = useTokenData(address)
  if (!token) return <tr><td colSpan={5} className="px-4 py-2"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} /></td></tr>
  return (
    <tr className="border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-white">{token.name}</div>
        <div className="text-xs" style={{ color: '#a78bfa' }}>${token.symbol}</div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatAddress(address)}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatAddress(token.creator)}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-white">{formatUsdc(token.marketCap)}</span>
      </td>
      <td className="px-4 py-3">
        {token.state?.graduated ? (
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(250,204,21,0.1)', color: '#fbbf24' }}>Graduated</span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>Active</span>
        )}
      </td>
      <td className="px-4 py-3">
        <a href={`${EXPLORER_BASE}/address/${address}`} target="_blank" rel="noopener" className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <ExternalLink size={11} />
        </a>
      </td>
    </tr>
  )
}

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [authed, setAuthed] = useState(false)
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [authError, setAuthError] = useState('')

  // Contract write state
  const { address: wallet, chainId: walletChain } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrong = wallet && walletChain !== CHAIN_ID
  const deployed = !!FACTORY_ADDRESS

  // Admin form fields
  const [creationFeeInput, setCreationFeeInput] = useState('')
  const [feeBpsInput, setFeeBpsInput] = useState('')
  const [feeRecipInput, setFeeRecipInput] = useState('')
  const [gradRecipInput, setGradRecipInput] = useState('')
  const [gradThreshInput, setGradThreshInput] = useState('')

  // On-chain reads
  const { data: creationFee, refetch: refetchFee } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'creationFee', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: feeBps, refetch: refetchBps } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'protocolFeeBps', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: feeRecip, refetch: refetchFeeRecip } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'feeRecipient', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: gradRecip, refetch: refetchGradRecip } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'graduationRecipient', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: gradThresh, refetch: refetchGradThresh } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'graduationThreshold', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: paused } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'paused', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: tokenCount } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'tokenCount', chainId: CHAIN_ID as any, query: { enabled: deployed } })
  const { data: contractOwner } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'owner', chainId: CHAIN_ID as any, query: { enabled: deployed } })

  const { addresses } = useTokenList()

  const { writeContract: adminWrite, data: adminHash, isPending: isAdminPending } = useWriteContract()
  const { isLoading: isAdminConfirming, isSuccess: isAdminDone } = useWaitForTransactionReceipt({ hash: adminHash })

  useEffect(() => {
    if (isAdminDone) {
      toast.success('Transaction confirmed')
      void refetchFee(); void refetchBps(); void refetchFeeRecip(); void refetchGradRecip(); void refetchGradThresh()
    }
  }, [isAdminDone])

  const handleAuth = () => {
    if (pwd === ADMIN_SECRET) { setAuthed(true); setAuthError('') }
    else setAuthError('Incorrect password.')
  }

  const adminAction = (fn: any) => {
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }
    adminWrite(fn, {
      onSuccess: () => toast.success('Transaction submitted'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const TABS: { id: AdminTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Settings },
    { id: 'contract', label: 'Contract', icon: Shield },
    { id: 'keys', label: 'Keys & APIs', icon: Key },
    { id: 'tokens', label: 'Token Data', icon: Database },
    { id: 'metadata', label: 'Site Meta', icon: Globe },
  ]

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto py-10">
        <GlassCard className="p-8">
          <div className="h-[2px] -mx-8 -mt-8 mb-8 rounded-t-2xl" style={{ background: SPECTRAL }} />
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              <Shield size={20} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Admin Access</h1>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Enter your admin password to continue.</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <input type={showPwd ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} placeholder="Admin password" className="flex-1 py-2.5 text-sm text-white placeholder-white/20 bg-transparent outline-none" />
              <button onClick={() => setShowPwd(v => !v)} style={{ color: 'rgba(255,255,255,0.3)' }}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            <button onClick={handleAuth} className="w-full py-3 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              Enter Admin Panel
            </button>
          </div>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Admin</span>
        </div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Admin Panel</h1>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 flex-wrap" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all" style={{
            background: tab === id ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: tab === id ? '#a78bfa' : 'rgba(255,255,255,0.45)',
            border: tab === id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
          }}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Contract', value: deployed ? 'Deployed' : 'Not Deployed', ok: deployed },
            { label: 'Tokens', value: tokenCount?.toString() ?? '0', ok: true },
            { label: 'Status', value: paused ? 'Paused' : 'Active', ok: !paused },
            { label: 'Chain', value: 'Arc Mainnet', ok: true },
          ].map(({ label, value, ok }) => (
            <GlassCard key={label} className="p-4">
              <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
              <div className="text-lg font-bold flex items-center gap-1.5" style={{ color: ok ? 'white' : '#f87171', fontFamily: 'Space Grotesk, sans-serif' }}>
                {ok ? <CheckCircle2 size={14} style={{ color: '#34d399', flexShrink: 0 }} /> : <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />}
                {value}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Contract settings */}
      {tab === 'contract' && (
        <div className="space-y-4">
          {!deployed && (
            <GlassCard className="p-4" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-sm font-medium flex items-center gap-2" style={{ color: '#fbbf24' }}><AlertTriangle size={14} />Factory not deployed</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Deploy GlowFunFactory to Arc Mainnet. Then set <code>VITE_FACTORY_ADDRESS</code> in your <code>.env</code> file and restart the app.</p>
            </GlassCard>
          )}

          {!wallet ? (
            <GlassCard className="p-4 text-center">
              <p className="text-sm text-white mb-3">Connect wallet to manage contract settings</p>
              <ConnectKitButton />
            </GlassCard>
          ) : wrong ? (
            <GlassCard className="p-4">
              <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="flex items-center gap-2 text-sm font-medium" style={{ color: '#f87171' }}>
                <AlertTriangle size={14} />Switch to Arc Mainnet to manage contract
              </button>
            </GlassCard>
          ) : (
            <>
              {/* On-chain info */}
              <GlassCard className="p-5">
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Current On-Chain State</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                  {[
                    { k: 'Factory Address', v: formatAddress(FACTORY_ADDRESS) },
                    { k: 'Owner', v: contractOwner ? formatAddress(contractOwner as string) : '...' },
                    { k: 'Creation Fee', v: creationFee !== undefined ? formatUsdc(creationFee as bigint) : '...' },
                    { k: 'Protocol Fee', v: feeBps !== undefined ? `${Number(feeBps)}bps (${Number(feeBps) / 100}%)` : '...' },
                    { k: 'Fee Recipient', v: feeRecip ? formatAddress(feeRecip as string) : '...' },
                    { k: 'Grad. Recipient', v: gradRecip ? formatAddress(gradRecip as string) : '...' },
                    { k: 'Grad. Threshold', v: gradThresh !== undefined ? formatUsdc(gradThresh as bigint) : '...' },
                    { k: 'Status', v: paused ? '⚠️ PAUSED' : '✅ Active' },
                    { k: 'Token Count', v: tokenCount?.toString() ?? '0' },
                  ].map(({ k, v }) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>{k}</span>
                      <span className="text-white font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* Edit fields */}
              <GlassCard className="p-5">
                <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Edit Contract Settings</div>
                <div className="space-y-4">
                  {/* Creation fee */}
                  <div className="flex gap-3 items-end">
                    <label className="flex-1 space-y-1.5">
                      <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Creation Fee (USDC)</span>
                      <input value={creationFeeInput} onChange={e => setCreationFeeInput(e.target.value)} placeholder={creationFee !== undefined ? `${Number(creationFee as bigint) / 1e6}` : '0'} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                    </label>
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setCreationFee', args: [BigInt(Math.round(parseFloat(creationFeeInput) * 1e6))], chainId: CHAIN_ID as any })} disabled={!creationFeeInput || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                      {isAdminPending || isAdminConfirming ? <Loader2 size={14} className="animate-spin" /> : 'Set'}
                    </button>
                  </div>

                  {/* Protocol fee bps */}
                  <div className="flex gap-3 items-end">
                    <label className="flex-1 space-y-1.5">
                      <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Protocol Fee (basis points, max 500)</span>
                      <input value={feeBpsInput} onChange={e => setFeeBpsInput(e.target.value)} placeholder={feeBps?.toString() ?? '100'} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                    </label>
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setProtocolFeeBps', args: [BigInt(feeBpsInput)], chainId: CHAIN_ID as any })} disabled={!feeBpsInput || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                      {isAdminPending || isAdminConfirming ? <Loader2 size={14} className="animate-spin" /> : 'Set'}
                    </button>
                  </div>

                  {/* Fee recipient */}
                  <div className="flex gap-3 items-end">
                    <label className="flex-1 space-y-1.5">
                      <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Fee Recipient Address</span>
                      <input value={feeRecipInput} onChange={e => setFeeRecipInput(e.target.value)} placeholder="0x..." className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                    </label>
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setFeeRecipient', args: [feeRecipInput as `0x${string}`], chainId: CHAIN_ID as any })} disabled={!feeRecipInput || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                      {isAdminPending || isAdminConfirming ? <Loader2 size={14} className="animate-spin" /> : 'Set'}
                    </button>
                  </div>

                  {/* Grad recipient */}
                  <div className="flex gap-3 items-end">
                    <label className="flex-1 space-y-1.5">
                      <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Graduation Recipient Address</span>
                      <input value={gradRecipInput} onChange={e => setGradRecipInput(e.target.value)} placeholder="0x..." className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                    </label>
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setGraduationRecipient', args: [gradRecipInput as `0x${string}`], chainId: CHAIN_ID as any })} disabled={!gradRecipInput || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                      {isAdminPending || isAdminConfirming ? <Loader2 size={14} className="animate-spin" /> : 'Set'}
                    </button>
                  </div>

                  {/* Graduation threshold */}
                  <div className="flex gap-3 items-end">
                    <label className="flex-1 space-y-1.5">
                      <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Graduation Threshold (USDC)</span>
                      <input value={gradThreshInput} onChange={e => setGradThreshInput(e.target.value)} placeholder={gradThresh !== undefined ? `${Number(gradThresh as bigint) / 1e6}` : '69000'} className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                    </label>
                    <button onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'setGraduationThreshold', args: [BigInt(Math.round(parseFloat(gradThreshInput) * 1e6))], chainId: CHAIN_ID as any })} disabled={!gradThreshInput || isAdminPending || isAdminConfirming} className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                      {isAdminPending || isAdminConfirming ? <Loader2 size={14} className="animate-spin" /> : 'Set'}
                    </button>
                  </div>

                  {/* Pause/Unpause */}
                  <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <button
                      onClick={() => adminAction({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: paused ? 'unpause' : 'pause', args: [], chainId: CHAIN_ID as any })}
                      disabled={isAdminPending || isAdminConfirming}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      style={{ background: paused ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: paused ? '#34d399' : '#f87171', border: `1px solid ${paused ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}
                    >
                      {isAdminPending || isAdminConfirming ? <Loader2 size={14} className="animate-spin inline mr-1.5" /> : null}
                      {paused ? 'Unpause Contract' : 'Pause Contract'}
                    </button>
                  </div>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      )}

      {/* Keys & APIs */}
      {tab === 'keys' && (
        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="h-[2px] -mx-5 -mt-5 mb-5 rounded-t-2xl" style={{ background: SPECTRAL }} />
            <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Environment Variables</div>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Set these in your <code className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>.env</code> file, then restart the dev server.</p>
            <div className="space-y-3">
              {[
                { name: 'VITE_FACTORY_ADDRESS', desc: 'Deployed GlowFunFactory contract address on Arc Mainnet', example: '0x...', required: true },
                { name: 'VITE_WALLETCONNECT_PROJECT_ID', desc: 'Get from cloud.walletconnect.com', example: 'abc123...', required: true },
                { name: 'VITE_CIRCLE_APP_ID', desc: 'Circle App ID from Wallets > User Controlled > Configurator', example: 'xxxxxxxx-xxxx...', required: false },
                { name: 'CIRCLE_API_KEY', desc: 'Circle developer API key (server-side only)', example: 'TEST_API_KEY:...', required: false },
                { name: 'VITE_ADMIN_SECRET', desc: 'Admin panel password', example: 'your_secret', required: true },
                { name: 'VITE_USDC_ADDRESS', desc: 'USDC contract address on Arc', example: '0x3600...', required: false },
              ].map(({ name, desc, example, required }) => (
                <div key={name} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs font-bold" style={{ color: '#a78bfa' }}>{name}</code>
                    {required && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Required</span>}
                  </div>
                  <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{desc}</p>
                  <code className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Example: {example}</code>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Deploy Contract (Arc Mainnet)</div>
            <div className="space-y-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <p>To deploy the <code>GlowFunFactory</code> contract to Arc Mainnet:</p>
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-semibold text-white mb-2">Prerequisites</p>
                <ol className="space-y-1.5 list-decimal list-inside">
                  <li>Set up a Circle developer account at <a href="https://console.circle.com" target="_blank" rel="noopener" className="text-purple-400">console.circle.com</a></li>
                  <li>Enable mainnet access in Circle Console</li>
                  <li>Get a mainnet Circle API key and paste in <code>.env</code></li>
                  <li>Register an entity secret (use the Wallet page)</li>
                  <li>Run <code className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>forge build</code> to compile the contract</li>
                  <li>Run the self-deploy script with Arc mainnet config</li>
                </ol>
              </div>
              <p>Constructor args: <code className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>usdc, feeRecipient, graduationRecipient, owner</code></p>
              <p>USDC on Arc Mainnet: <code className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>0x3600000000000000000000000000000000000000</code></p>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Token Data */}
      {tab === 'tokens' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white font-semibold">{addresses.length} tokens launched</span>
          </div>
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Token', 'Address', 'Creator', 'Market Cap', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {addresses.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No tokens launched yet</td></tr>
                  ) : (
                    addresses.map(addr => <TokenRow key={addr} address={addr as `0x${string}`} />)
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Site Metadata */}
      {tab === 'metadata' && (
        <GlassCard className="p-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Site Metadata</div>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>To customize site metadata (SEO, title, description), edit <code className="px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>index.html</code> in the project root.</p>
          <div className="space-y-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {[
              { field: 'Site Title', value: 'GlowFun — Launch Meme Tokens on Arc', file: 'index.html' },
              { field: 'Description', value: 'Pump.fun-style token launchpad powered by USDC on Arc Mainnet', file: 'index.html' },
              { field: 'OG Image', value: '/og-image.png', file: 'public/' },
              { field: 'Favicon', value: '/favicon.ico', file: 'public/' },
            ].map(({ field, value, file }) => (
              <div key={field} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-white font-medium mb-0.5">{field}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)' }}>{value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Edit: <code>{file}</code></div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

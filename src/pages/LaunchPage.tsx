import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { GlassCard } from '@/components/GlassCard'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'
import { parseOnchainError } from '@/utils/errors'
import { Rocket, Twitter, Send, Globe, Info, ExternalLink } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { ImageUpload } from '@/components/ImageUpload'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

interface FormState {
  name: string; symbol: string; description: string; imageUri: string
  twitter: string; telegram: string; website: string
}

const INITIAL: FormState = { name: '', symbol: '', description: '', imageUri: '', twitter: '', telegram: '', website: '' }

export function LaunchPage() {
  const nav = useNavigate()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [step, setStep] = useState<'form' | 'approving' | 'launching' | 'done'>('form')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [launched, setLaunched] = useState<string | null>(null)

  const { writeContract, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const isWrongChain = isConnected && chainId !== CHAIN_ID

  const update = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleLaunch = async () => {
    if (!isConnected) { toast.error('Connect your wallet first.'); return }
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID as any }); return }
    if (!FACTORY_ADDRESS) { toast.error('Factory contract not deployed yet. See Admin panel.'); return }
    if (!form.name.trim() || !form.symbol.trim()) { toast.error('Name and symbol are required.'); return }

    try {
      setStep('launching')
      writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'launchToken',
        args: [form.name.trim(), form.symbol.trim().toUpperCase(), form.description, form.imageUri, form.twitter, form.telegram, form.website],
        chainId: CHAIN_ID as any,
      } as any, {
        onSuccess: hash => {
          setTxHash(hash)
          toast.success('Transaction submitted! Waiting for confirmation...')
        },
        onError: e => {
          setStep('form')
          toast.error(parseOnchainError(e))
        },
      })
    } catch (e) {
      setStep('form')
      toast.error(parseOnchainError(e))
    }
  }

  // Watch for success
  if (isSuccess && txHash && step === 'launching') {
    setStep('done')
    toast.success('Token launched successfully!')
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: 'white',
    borderRadius: 10,
    outline: 'none',
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
  } as React.CSSProperties

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 4, display: 'block' }

  if (step === 'done') {
    return (
      <div className="max-w-xl mx-auto text-center py-10">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
          <Rocket size={32} className="text-white" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Token Launched!</h2>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
          ${form.symbol.toUpperCase()} is live on Arc Mainnet and ready to trade.
        </p>
        <div className="flex flex-col gap-3">
          {txHash && (
            <a href={`${EXPLORER_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium no-underline" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ExternalLink size={13} />View Transaction
            </a>
          )}
          <button onClick={() => nav('/')} className="py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>View All Tokens</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1.5" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Launch a Token</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Deploy your meme token to the Arc bonding curve in one click.</p>
        </div>

        {!isConnected ? (
          <GlassCard className="p-8 text-center">
            <Rocket size={28} className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <p className="text-sm font-medium text-white mb-4">Connect your wallet to launch a token</p>
            <ConnectKitButton />
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden">
            <div className="h-[2px]" style={{ background: SPECTRAL }} />
            <div className="p-6 space-y-4">
              {/* Name + Symbol */}
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

              {/* Description */}
              <div>
                <label style={labelStyle}>Description</label>
                <textarea style={{ ...inputStyle, resize: 'none', minHeight: 72 }} placeholder="What is this token about?" value={form.description} onChange={update('description') as any} maxLength={500} />
              </div>

              {/* Image Upload */}
              <div>
                <label style={labelStyle}>Token Image</label>
                <ImageUpload value={form.imageUri} onChange={url => setForm(f => ({ ...f, imageUri: url }))} />
              </div>

              {/* Social links */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label style={labelStyle}><Twitter size={10} style={{ display: 'inline', marginRight: 3 }} />Twitter</label>
                  <input style={inputStyle} placeholder="@handle" value={form.twitter} onChange={update('twitter')} />
                </div>
                <div>
                  <label style={labelStyle}><Send size={10} style={{ display: 'inline', marginRight: 3 }} />Telegram</label>
                  <input style={inputStyle} placeholder="t.me/..." value={form.telegram} onChange={update('telegram')} />
                </div>
                <div>
                  <label style={labelStyle}><Globe size={10} style={{ display: 'inline', marginRight: 3 }} />Website</label>
                  <input style={inputStyle} placeholder="https://..." value={form.website} onChange={update('website')} />
                </div>
              </div>

              {/* Info box */}
              <div className="flex gap-2 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
                <Info size={13} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 1 }} />
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <strong className="text-white/60">1 billion tokens</strong> will be minted. 800M on the bonding curve, 200M reserved for graduation. When $69K USDC is raised, the token graduates to a DEX.
                </div>
              </div>

              {isWrongChain ? (
                <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                  Switch to Arc Mainnet
                </button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  onClick={handleLaunch}
                  disabled={isPending || isConfirming || step === 'launching'}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: isPending || isConfirming ? 'rgba(139,92,246,0.5)' : 'linear-gradient(135deg, #8b5cf6, #ec4899)', opacity: isPending || isConfirming ? 0.8 : 1, cursor: isPending || isConfirming ? 'not-allowed' : 'pointer' }}
                >
                  {isPending ? 'Confirm in wallet...' : isConfirming ? 'Launching...' : <><Rocket size={14} />Launch Token</>}
                </motion.button>
              )}
            </div>
          </GlassCard>
        )}
      </motion.div>
    </div>
  )
}

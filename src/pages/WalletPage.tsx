import { useState } from 'react'
import { motion } from 'framer-motion'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Wallet, Shield, Key, ExternalLink, LogOut, Copy, Check, AlertTriangle, Loader2, Zap, User } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { useCircleWallet } from '@/hooks/useCircleWallet'
import { USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'
import { formatUsdc, formatAddress } from '@/utils/format'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

export function WalletPage() {
  const { address: evmAddress } = useAccount()
  const { data: evmUsdc } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: evmAddress ? [evmAddress] : undefined, chainId: CHAIN_ID as any, query: { enabled: !!evmAddress } })

  const { credentials, wallets, selectedWallet, isLoading, status, createUser, getToken, initializeWallet, disconnect, sdkReady } = useCircleWallet()

  const [userId, setUserId] = useState('')
  const [circleTab, setCircleTab] = useState<'connect' | 'wallet'>('connect')
  const [copied, setCopied] = useState<string | null>(null)

  const copyText = (text: string) => { navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500) }

  const hasCreds = !!credentials
  const hasWallet = wallets.length > 0
  const appIdSet = !!(import.meta.env.VITE_CIRCLE_APP_ID && import.meta.env.VITE_CIRCLE_APP_ID !== 'YOUR_CIRCLE_APP_ID')

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Account</span>
        </div>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Wallet</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Manage your Web3 wallet and Circle-powered wallet.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* EVM Wallet */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Wallet size={14} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Web3 Wallet</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>MetaMask, Rainbow, etc.</div>
              </div>
            </div>

            {evmAddress ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Connected Address</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-mono">{formatAddress(evmAddress)}</span>
                    <button onClick={() => copyText(evmAddress)} className="text-xs">{copied === evmAddress ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />}</button>
                  </div>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>USDC Balance (Arc)</div>
                  <div className="text-xl font-bold text-white tabular-nums" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{formatUsdc(evmUsdc as bigint ?? 0n)}</div>
                </div>
                <a href={`${EXPLORER_BASE}/address/${evmAddress}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-xs" style={{ color: '#a78bfa' }}>
                  <ExternalLink size={11} />View on Arc Explorer
                </a>
                <div className="flex justify-end pt-1">
                  <ConnectKitButton />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-12 h-12 rounded-2xl mb-3 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <Wallet size={20} style={{ color: '#a78bfa' }} />
                </div>
                <p className="text-sm text-white font-medium mb-1">Connect a wallet</p>
                <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Use MetaMask, Rainbow, or any WalletConnect wallet to trade.</p>
                <ConnectKitButton />
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* Circle Wallet */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard className="p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
                  <Shield size={14} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Circle Wallet</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>User-controlled MPC</div>
                </div>
              </div>
              {hasCreds && (
                <button onClick={disconnect} className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <LogOut size={11} />Sign out
                </button>
              )}
            </div>

            {!appIdSet ? (
              <div className="py-4">
                <div className="flex gap-2 p-3 rounded-xl mb-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.12)' }}>
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
                  <p className="text-xs" style={{ color: '#fbbf24' }}>Set <code>VITE_CIRCLE_APP_ID</code> and <code>CIRCLE_API_KEY</code> in the Admin panel to enable Circle Wallets.</p>
                </div>
              </div>
            ) : !sdkReady ? (
              <div className="py-4 text-center">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Initializing Circle SDK...</p>
              </div>
            ) : hasWallet && selectedWallet ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Wallet Address</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-mono">{formatAddress(selectedWallet.address)}</span>
                    <button onClick={() => copyText(selectedWallet.address)}>{copied === selectedWallet.address ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />}</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {[
                    { k: 'State', v: selectedWallet.state },
                    { k: 'Account Type', v: selectedWallet.accountType },
                    { k: 'Chain', v: selectedWallet.blockchain },
                  ].map(({ k, v }) => (
                    <div key={k} className="flex justify-between text-xs py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>{k}</span>
                      <span className="text-white font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : hasCreds ? (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Signed in. Click below to create your Arc wallet.</p>
                {status && <p className="text-xs" style={{ color: '#a78bfa' }}>{status}</p>}
                <button onClick={initializeWallet} disabled={isLoading} className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }}>
                  {isLoading ? <><Loader2 size={15} className="animate-spin" />Working...</> : <><Zap size={15} />Create Arc Wallet</>}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Create a non-custodial wallet secured by your PIN. Your keys stay yours.</p>
                {status && <p className="text-xs" style={{ color: status.includes('Failed') ? '#f87171' : '#a78bfa' }}>{status}</p>}
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>User ID (email or username)</span>
                  <div className="flex items-center gap-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <User size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
                    <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="user@example.com" className="flex-1 py-2.5 text-sm text-white placeholder-white/20 bg-transparent outline-none" />
                  </div>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => createUser(userId)} disabled={userId.length < 5 || isLoading} className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>
                    {isLoading ? <Loader2 size={13} className="animate-spin" /> : <User size={13} />}Register
                  </button>
                  <button onClick={() => getToken(userId)} disabled={userId.length < 5 || isLoading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 text-white" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
                    {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}Sign In
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* What is Circle Wallet info */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-5">
        <GlassCard className="p-5">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>About Circle Wallet</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Non-custodial', desc: 'Your keys, your crypto. Circle cannot access your funds — ever.' },
              { icon: Key, title: 'PIN-secured', desc: 'Secured by PIN + security questions. No seed phrases to manage.' },
              { icon: Zap, title: 'USDC-native', desc: 'Optimized for USDC on Arc. Sub-second finality, stable gas fees.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#a78bfa' }} />
                <div>
                  <div className="text-xs font-semibold text-white mb-0.5">{title}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}

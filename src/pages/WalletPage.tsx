import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useSendTransaction } from 'wagmi'
import { erc20Abi, isAddress, parseEther } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  Wallet, Shield, Key, ExternalLink, LogOut, Copy, Check, AlertTriangle,
  Loader2, Zap, User, Send, ArrowDownLeft, Activity, BarChart3, Coins,
  TrendingUp, DollarSign, RefreshCw, Clock, ChevronRight, Package, X,
  ArrowUpRight, Scan, Settings, Eye, EyeOff, Globe
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { useCircleWallet } from '@/hooks/useCircleWallet'
import { useConfig } from '@/context/ConfigContext'
import { formatUsdc, formatTokens, formatAddress, formatPrice, timeAgo } from '@/utils/format'
import { useTokenList } from '@/hooks/useTokenList'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

/* ── Portfolio hook: batch-read user balances for all glow tokens ── */
function usePortfolio(userAddress: `0x${string}` | undefined, tokenAddresses: `0x${string}`[]) {
  const enabled = !!userAddress && tokenAddresses.length > 0

  // Batch read balances
  const { data: balances, isLoading, refetch } = useReadContracts({
    contracts: tokenAddresses.map(addr => ({
      address: addr, abi: GLOW_TOKEN_ABI, functionName: 'balanceOf', args: [userAddress!], chainId: CHAIN_ID as any,
    })),
    query: { enabled },
  })

  // Batch read prices for tokens with non-zero balance
  const tokensWithBalance = tokenAddresses
    .map((addr, i) => ({ addr, balance: balances?.[i]?.result as bigint | undefined }))
    .filter(t => t.balance && t.balance > 0n)

  const { data: prices } = useReadContracts({
    contracts: tokensWithBalance.map(t => ({
      address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTokenPrice', args: [t.addr], chainId: CHAIN_ID as any,
    })),
    query: { enabled: tokensWithBalance.length > 0 && !!FACTORY_ADDRESS },
  })

  const { data: names } = useReadContracts({
    contracts: tokensWithBalance.map(t => ({
      address: t.addr, abi: GLOW_TOKEN_ABI, functionName: 'name', chainId: CHAIN_ID as any,
    })),
    query: { enabled: tokensWithBalance.length > 0 },
  })
  const { data: symbols } = useReadContracts({
    contracts: tokensWithBalance.map(t => ({
      address: t.addr, abi: GLOW_TOKEN_ABI, functionName: 'symbol', chainId: CHAIN_ID as any,
    })),
    query: { enabled: tokensWithBalance.length > 0 },
  })
  const { data: imageUris } = useReadContracts({
    contracts: tokensWithBalance.map(t => ({
      address: t.addr, abi: GLOW_TOKEN_ABI, functionName: 'imageUri', chainId: CHAIN_ID as any,
    })),
    query: { enabled: tokensWithBalance.length > 0 },
  })

  const portfolio = tokensWithBalance.map((t, i) => {
    const balance = t.balance ?? 0n
    const pricesArr = prices as unknown as any[]
    const price = pricesArr?.[i]?.result as bigint | undefined
    // price is in USDC per token, scaled by 1e30: value = balance * price / 1e30 / 1e18 * 1e6
    // = balance * price / 1e42
    const valueUsdc = price ? (Number(balance) * Number(price)) / 1e42 : 0

    return {
      address: t.addr,
      name: names?.[i]?.result as string ?? '…',
      symbol: symbols?.[i]?.result as string ?? '…',
      imageUri: imageUris?.[i]?.result as string ?? '',
      balance,
      price,
      valueUsdc,
    }
  })

  const totalValueUsdc = portfolio.reduce((sum, t) => sum + t.valueUsdc, 0)

  return { portfolio, totalValueUsdc, isLoading, refetch }
}

/* ── Mini stat card ─────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="flex flex-col p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={10} style={{ color }} />
        </div>
        <span className="text-[9px] uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
      </div>
      <div className="text-sm font-bold text-white tabular-nums" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</div>
      {sub && <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</div>}
    </div>
  )
}

/* ── Send panel ─────────────────────────────────────────────────── */
function SendPanel({ address: wallet, usdcBalance, tokenHoldings }: {
  address: `0x${string}`
  usdcBalance: bigint
  tokenHoldings: any[]
}) {
  const [asset, setAsset] = useState<'usdc' | string>('usdc')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form')
  const [validAddr, setValidAddr] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { sendTransaction, data: ethHash, isPending: sendingEth } = useSendTransaction()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: hash ?? ethHash })

  useEffect(() => { setValidAddr(isAddress(to)) }, [to])
  useEffect(() => { if (isSuccess) { setStep('done'); toast.success('Transfer confirmed!') } }, [isSuccess])

  const selectedToken = tokenHoldings.find(t => t.address === asset)
  const isUsdc = asset === 'usdc'

  const maxAmount = isUsdc
    ? (Number(usdcBalance) / 1e6).toString()
    : selectedToken ? (Number(selectedToken.balance) / 1e18).toFixed(6) : '0'

  const send = () => {
    if (!validAddr || !amount) return
    if (isUsdc) {
      const amt = BigInt(Math.floor(parseFloat(amount) * 1e6))
      writeContract({
        address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer',
        args: [to as `0x${string}`, amt], chainId: CHAIN_ID as any,
      } as any, {
        onSuccess: () => setStep('done'),
        onError: (e: any) => toast.error(e.message),
      })
    } else if (selectedToken) {
      const amt = BigInt(Math.floor(parseFloat(amount) * 1e18))
      writeContract({
        address: selectedToken.address, abi: GLOW_TOKEN_ABI, functionName: 'transfer',
        args: [to as `0x${string}`, amt], chainId: CHAIN_ID as any,
      } as any, {
        onSuccess: () => setStep('done'),
        onError: (e: any) => toast.error(e.message),
      })
    }
  }

  const busy = isPending || sendingEth || confirming

  return (
    <div className="max-w-sm mx-auto space-y-4">
      {step === 'done' ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-8">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <Check size={28} style={{ color: '#34d399' }} />
          </div>
          <div className="text-white font-semibold mb-1">Transfer sent!</div>
          <div className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Your transfer has been submitted to the network</div>
          {(hash ?? ethHash) && (
            <a href={`${EXPLORER_BASE}/tx/${hash ?? ethHash}`} target="_blank" rel="noopener"
              className="flex items-center justify-center gap-1.5 text-xs" style={{ color: '#a78bfa' }}>
              <ExternalLink size={12} />View on explorer
            </a>
          )}
          <button onClick={() => { setStep('form'); setTo(''); setAmount('') }}
            className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Send another
          </button>
        </motion.div>
      ) : (
        <>
          {/* Asset selector */}
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Asset</div>
            <div className="space-y-1.5">
              <button onClick={() => setAsset('usdc')}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                style={{ background: asset === 'usdc' ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${asset === 'usdc' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(59,130,246,0.2)' }}>💲</div>
                <div className="flex-1 text-left">
                  <div className="text-xs font-medium text-white">USDC</div>
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>USD Coin</div>
                </div>
                <div className="text-xs font-medium text-white">{formatUsdc(usdcBalance)}</div>
                {asset === 'usdc' && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }} />}
              </button>
              {tokenHoldings.map(t => (
                <button key={t.address} onClick={() => setAsset(t.address)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{ background: asset === t.address ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${asset === t.address ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                  {t.imageUri ? (
                    <img src={t.imageUri} alt={t.symbol} className="w-8 h-8 rounded-full object-cover" onError={e => { (e.target as any).style.display = 'none' }} />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `hsl(${parseInt(t.address.slice(2,6),16) % 360},60%,35%)`, color: 'white' }}>
                      {t.symbol.slice(0,1)}
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <div className="text-xs font-medium text-white">{t.symbol}</div>
                    <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.name}</div>
                  </div>
                  <div className="text-xs font-medium text-white">{formatTokens(t.balance)}</div>
                  {asset === t.address && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }} />}
                </button>
              ))}
            </div>
          </div>

          {/* To address */}
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Recipient</div>
            <div className="flex items-center gap-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${validAddr && to ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
              <ArrowUpRight size={13} style={{ color: validAddr && to ? '#34d399' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="0x... wallet address"
                className="flex-1 py-3 text-sm text-white bg-transparent outline-none placeholder-white/20 font-mono" />
              {to && <button onClick={() => setTo('')}><X size={12} style={{ color: 'rgba(255,255,255,0.3)' }} /></button>}
            </div>
            {to && !validAddr && <p className="text-[10px] mt-1 ml-1" style={{ color: '#f87171' }}>Invalid address</p>}
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Amount</span>
              <button onClick={() => setAmount(maxAmount)} className="text-[10px]" style={{ color: '#a78bfa' }}>
                Max: {isUsdc ? formatUsdc(usdcBalance) : formatTokens(selectedToken?.balance)}
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number"
                className="flex-1 py-3 text-lg font-bold text-white bg-transparent outline-none" />
              <span className="text-sm font-medium px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                {isUsdc ? 'USDC' : selectedToken?.symbol ?? ''}
              </span>
            </div>
          </div>

          {/* Send button */}
          <motion.button
            onClick={send}
            disabled={!validAddr || !amount || parseFloat(amount) <= 0 || busy}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 16px rgba(139,92,246,0.25)' }}>
            {busy ? <><Loader2 size={15} className="animate-spin" />Sending…</> : <><Send size={15} />Send</>}
          </motion.button>
        </>
      )}
    </div>
  )
}

/* ── Receive panel ──────────────────────────────────────────────── */
function ReceivePanel({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="max-w-sm mx-auto text-center space-y-5">
      <div>
        <div className="text-sm font-semibold text-white mb-1">Your Wallet Address</div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Scan QR code or copy address to receive tokens on Arc Mainnet</p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="p-4 rounded-2xl" style={{ background: 'white' }}>
          <QRCodeSVG value={address} size={180} level="H" includeMargin={false}
            imageSettings={{ src: '', height: 0, width: 0, excavate: false }} />
        </div>
      </div>

      {/* Address */}
      <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-xs font-mono text-white break-all">{address}</div>
      </div>

      <div className="flex gap-3">
        <button onClick={copy}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white"
          style={{ background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
          {copied ? <><Check size={14} style={{ color: '#34d399' }} />Copied!</> : <><Copy size={14} />Copy Address</>}
        </button>
        <a href={`${EXPLORER_BASE}/address/${address}`} target="_blank" rel="noopener"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', color: '#a78bfa' }}>
          <ExternalLink size={14} />Explorer
        </a>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
        <AlertTriangle size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />
        <p className="text-[10px] text-left" style={{ color: '#fde68a' }}>Only send assets on Arc Mainnet (chain ID {CHAIN_ID}) to this address.</p>
      </div>
    </div>
  )
}

/* ── Activity panel ─────────────────────────────────────────────── */
function ActivityPanel({ address }: { address: string }) {
  return (
    <div className="max-w-sm mx-auto text-center py-6">
      <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)' }}>
        <Activity size={20} style={{ color: '#a78bfa' }} />
      </div>
      <div className="text-sm font-medium text-white mb-1">Transaction History</div>
      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>View your complete on-chain history on the Arc Explorer</p>
      <a href={`${EXPLORER_BASE}/address/${address}`} target="_blank" rel="noopener"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
        <ExternalLink size={14} />Open Explorer
      </a>
    </div>
  )
}

/* ── Portfolio tab ──────────────────────────────────────────────── */
function PortfolioTab({ portfolio, isLoading, totalValueUsdc, usdcBalance, refetch }: {
  portfolio: any[]; isLoading: boolean; totalValueUsdc: number; usdcBalance: bigint; refetch: () => void
}) {
  const total = (Number(usdcBalance) / 1e6) + totalValueUsdc

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1,2,3].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="w-10 h-10 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-2 w-16 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
            </div>
            <div className="h-4 w-14 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Total portfolio value */}
      <div className="p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))', border: '1px solid rgba(139,92,246,0.15)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Portfolio Value</div>
        <div className="text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Arc Mainnet · USDC-denominated</div>
      </div>

      {/* Holdings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>Holdings</span>
          <button onClick={refetch} style={{ color: 'rgba(255,255,255,0.3)' }}><RefreshCw size={11} /></button>
        </div>

        {/* USDC always first */}
        <div className="flex items-center gap-3 p-3 rounded-xl mb-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.2)' }}>💲</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">USDC</div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>USD Coin</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-white">{formatUsdc(usdcBalance)}</div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{(Number(usdcBalance)/1e6).toFixed(2)} USDC</div>
          </div>
        </div>

        {/* GlowFun tokens */}
        {portfolio.length === 0 ? (
          <div className="text-center py-6">
            <Coins size={20} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>No GlowFun tokens yet. Trade to build your portfolio.</p>
          </div>
        ) : (
          portfolio.map(t => (
            <div key={t.address} className="flex items-center gap-3 p-3 rounded-xl mb-1.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {t.imageUri ? (
                <img src={t.imageUri} alt={t.symbol} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white"
                  style={{ background: `hsl(${parseInt(t.address.slice(2,6),16) % 360},60%,30%)` }}>
                  {t.symbol.slice(0,1)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{t.symbol}</div>
                <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.name}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-white">${t.valueUsdc.toFixed(4)}</div>
                <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{formatTokens(t.balance)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ── Circle Wallet section ──────────────────────────────────────── */
function CircleSection() {
  const { credentials, wallets, selectedWallet, isLoading, status, createUser, getToken, initializeWallet, disconnect, sdkReady } = useCircleWallet()
  const [userId, setUserId] = useState('')
  const [copied, setCopied] = useState(false)
  const appIdSet = !!(import.meta.env.VITE_CIRCLE_APP_ID && import.meta.env.VITE_CIRCLE_APP_ID !== 'YOUR_CIRCLE_APP_ID')
  const hasCreds = !!credentials
  const hasWallet = wallets.length > 0

  const copyAddr = (addr: string) => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
            <Shield size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Circle MPC Wallet</div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Non-custodial · PIN-secured</div>
          </div>
        </div>
        {hasCreds && (
          <button onClick={disconnect} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <LogOut size={11} />Sign out
          </button>
        )}
      </div>

      {!appIdSet ? (
        <div className="flex gap-2 p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.12)' }}>
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>Circle MPC Wallets are not available on this deployment.</p>
        </div>
      ) : !sdkReady ? (
        <div className="text-center py-3">
          <Loader2 size={16} className="animate-spin mx-auto mb-1" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Initializing…</p>
        </div>
      ) : hasWallet && selectedWallet ? (
        <div className="space-y-3">
          <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>MPC Wallet Address</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white font-mono">{formatAddress(selectedWallet.address)}</span>
              <button onClick={() => copyAddr(selectedWallet.address)}>
                {copied ? <Check size={12} style={{ color: '#34d399' }} /> : <Copy size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />}
              </button>
              <a href={`${EXPLORER_BASE}/address/${selectedWallet.address}`} target="_blank" rel="noopener">
                <ExternalLink size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
              </a>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ k: 'State', v: selectedWallet.state }, { k: 'Type', v: selectedWallet.accountType }, { k: 'Chain', v: selectedWallet.blockchain }].map(({ k, v }) => (
              <div key={k} className="p-2 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{k}</div>
                <div className="text-[10px] font-medium text-white truncate">{v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : hasCreds ? (
        <div className="space-y-2">
          {status && <p className="text-[10px]" style={{ color: '#a78bfa' }}>{status}</p>}
          <button onClick={initializeWallet} disabled={isLoading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
            {isLoading ? <><Loader2 size={14} className="animate-spin" />Working…</> : <><Zap size={14} />Create MPC Wallet</>}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <User size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="email or username"
              className="flex-1 py-2.5 text-sm text-white placeholder-white/20 bg-transparent outline-none" />
          </div>
          {status && <p className="text-[10px]" style={{ color: status.includes('Failed') || status.includes('Error') ? '#f87171' : '#a78bfa' }}>{status}</p>}
          <div className="flex gap-2">
            <button onClick={() => createUser(userId)} disabled={userId.length < 3 || isLoading}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 text-white"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <User size={12} />}Register
            </button>
            <button onClick={() => getToken(userId)} disabled={userId.length < 3 || isLoading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 text-white"
              style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Key size={12} />}Sign In
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

/* ── Main Wallet Page ───────────────────────────────────────────── */
export function WalletPage() {
  const { address: evmAddress, isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'send' | 'receive' | 'activity'>('overview')
  const [hideBalance, setHideBalance] = useState(false)

  // USDC balance
  const { data: evmUsdc, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf',
    args: evmAddress ? [evmAddress] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: !!evmAddress, refetchInterval: 15000 },
  })
  const usdcBalance = (evmUsdc as bigint) ?? 0n

  // Native balance - proxy via 0 transfer
  const { addresses: allTokens } = useTokenList()
  const { portfolio, totalValueUsdc, isLoading: portfolioLoading, refetch: refetchPortfolio } = usePortfolio(evmAddress, allTokens)

  const totalUSD = (Number(usdcBalance) / 1e6) + totalValueUsdc

  const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'portfolio', label: 'Portfolio', icon: Coins },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
    { id: 'activity', label: 'Activity', icon: Activity },
  ] as const

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Account</span>
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Wallet</h1>
        </motion.div>

        <GlassCard className="p-8 text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.15))', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Wallet size={28} style={{ color: '#a78bfa' }} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Connect Your Wallet</h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>Connect to view your portfolio, send tokens, and manage your GlowFun assets.</p>
          <ConnectKitButton />
        </GlassCard>

        <div className="mt-4">
          <CircleSection />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Account</span>
            </div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Wallet</h1>
          </div>
          <ConnectKitButton />
        </div>
      </motion.div>

      {/* Hero balance card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <GlassCard className="p-5 mb-4" glow>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Total Balance</div>
              <div className="text-4xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {hideBalance ? '••••••' : `$${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Arc Mainnet</span>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatAddress(evmAddress ?? '')}</span>
              </div>
            </div>
            <button onClick={() => setHideBalance(v => !v)} className="p-2 rounded-xl transition-all hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {hideBalance ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>

          {/* Spectral progress bar (decorative) */}
          <div className="h-px mb-4" style={{ background: SPECTRAL, opacity: 0.3 }} />

          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Send', icon: Send, tab: 'send' as const, color: '#8b5cf6' },
              { label: 'Receive', icon: ArrowDownLeft, tab: 'receive' as const, color: '#ec4899' },
              { label: 'Portfolio', icon: BarChart3, tab: 'portfolio' as const, color: '#f59e0b' },
              { label: 'Activity', icon: Activity, tab: 'activity' as const, color: '#10b981' },
            ].map(({ label, icon: Icon, tab, color }) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: activeTab === tab ? `${color}15` : 'rgba(255,255,255,0.04)', border: `1px solid ${activeTab === tab ? `${color}25` : 'rgba(255,255,255,0.06)'}` }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <span className="text-[10px] font-medium" style={{ color: activeTab === tab ? color : 'rgba(255,255,255,0.5)' }}>{label}</span>
              </button>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* Stats row */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatCard label="USDC" value={hideBalance ? '••••' : formatUsdc(usdcBalance)} icon={DollarSign} color="#60a5fa" />
          <StatCard label="Tokens" value={String(portfolio.length)} sub="GlowFun assets" icon={Coins} color="#f59e0b" />
          <StatCard label="Token Value" value={hideBalance ? '••••' : `$${totalValueUsdc.toFixed(2)}`} icon={TrendingUp} color="#34d399" />
        </div>
      </motion.div>

      {/* Tab content */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all"
              style={{ background: activeTab === id ? 'rgba(139,92,246,0.15)' : 'transparent', color: activeTab === id ? '#a78bfa' : 'rgba(255,255,255,0.4)', border: activeTab === id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent' }}>
              <Icon size={10} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            <GlassCard className="p-5">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-white mb-3">Wallet Info</div>
                    {[
                      { k: 'Connected Address', v: evmAddress ?? '', isAddr: true },
                      { k: 'Network', v: 'Arc Mainnet' },
                      { k: 'Chain ID', v: String(CHAIN_ID) },
                    ].map(({ k, v, isAddr }) => (
                      <div key={k} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>{k}</span>
                        {isAddr ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-white">{formatAddress(v)}</span>
                            <button onClick={() => navigator.clipboard.writeText(v)}><Copy size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /></button>
                            <a href={`${EXPLORER_BASE}/address/${v}`} target="_blank" rel="noopener"><ExternalLink size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /></a>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-white">{v}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Security tips */}
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#a78bfa' }}>Security Reminders</div>
                    {['Never share your private key or seed phrase.', 'Always verify transaction details before signing.', 'Be cautious of phishing sites — double-check URLs.'].map(tip => (
                      <div key={tip} className="flex items-start gap-2 mb-1">
                        <Shield size={9} className="flex-shrink-0 mt-0.5" style={{ color: '#a78bfa' }} />
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'portfolio' && (
                <PortfolioTab portfolio={portfolio} isLoading={portfolioLoading} totalValueUsdc={totalValueUsdc} usdcBalance={usdcBalance} refetch={refetchPortfolio} />
              )}

              {activeTab === 'send' && evmAddress && (
                <SendPanel address={evmAddress} usdcBalance={usdcBalance} tokenHoldings={portfolio} />
              )}

              {activeTab === 'receive' && evmAddress && <ReceivePanel address={evmAddress} />}
              {activeTab === 'activity' && evmAddress && <ActivityPanel address={evmAddress} />}
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Circle wallet section */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mt-4">
        <CircleSection />
      </motion.div>
    </div>
  )
}

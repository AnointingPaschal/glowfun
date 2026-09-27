import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress, parseUnits, formatUnits } from 'viem'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import {
  ChevronLeft, Send, ArrowDownLeft, Repeat, Link2, Copy, Check,
  ExternalLink, AlertTriangle, Loader2,
} from 'lucide-react'
import { getWalletAsset } from '@/constants/walletAssets'
import { AssetLogo } from '@/components/wallet/AssetLogo'
import { SwapPanel } from '@/components/wallet/SwapPanel'
import { BridgePanel } from '@/components/wallet/BridgePanel'
import { CHAIN_ID, EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'

type Action = 'send' | 'receive' | 'swap' | 'bridge'
const ACTIONS: { id: Action; label: string; icon: any }[] = [
  { id: 'send',    label: 'Send',    icon: Send },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
  { id: 'swap',    label: 'Swap',    icon: Repeat },
  { id: 'bridge',  label: 'Bridge',  icon: Link2 },
]

export function AssetDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const asset = getWalletAsset(slug)
  const { address: wallet } = useAccount()
  const [action, setAction] = useState<Action>('send')
  const [toAddr, setTo] = useState('')
  const [amt, setAmt] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: balRaw, refetch } = useReadContract({
    address: asset?.address, abi: erc20Abi, functionName: 'balanceOf',
    args: wallet ? [wallet] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: !!asset && !!wallet, refetchInterval: 15000 },
  })
  const balance = (balRaw as bigint) ?? 0n

  const { writeContract, isPending: sending, data: sendHash } = useWriteContract()
  const { isLoading: confirming, isSuccess: sendDone } = useWaitForTransactionReceipt({ hash: sendHash })
  useEffect(() => { if (sendDone) { toast.success(`${asset?.symbol} sent!`); refetch(); setTo(''); setAmt('') } }, [sendDone])

  if (!asset) return (
    <div className="max-w-md mx-auto text-center py-16">
      <p className="text-sm" style={{ color: 'var(--text2)' }}>Unknown asset.</p>
      <Link to="/wallet" className="text-xs font-semibold no-underline" style={{ color: '#818cf8' }}>Back to Wallet</Link>
    </div>
  )

  const copy = (s: string) => { navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const doSend = () => {
    if (!isAddress(toAddr) || !amt) return
    let value: bigint
    try { value = parseUnits(amt, asset.decimals) } catch { toast.error('Invalid amount'); return }
    writeContract({ address: asset.address, abi: erc20Abi, functionName: 'transfer', args: [toAddr as `0x${string}`, value], chainId: CHAIN_ID as any } as any, {
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }

  const balanceStr = formatUnits(balance, asset.decimals)
  const maxStr = balance > 0n ? (Number(balanceStr) < 1e-6 ? balanceStr : Number(balanceStr).toFixed(Math.min(6, asset.decimals))) : '0'

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <button onClick={() => navigate('/wallet')} className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text2)', background: 'none', border: 'none' }}>
        <ChevronLeft size={14} /> Wallet
      </button>

      {/* Asset header */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <AssetLogo symbol={asset.symbol} src={asset.logo} size={52} />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold truncate" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>{asset.symbol}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text2)' }}>{asset.name}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-bold" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>
            {asset.unitPrefix ?? ''}{Number(balanceStr).toLocaleString('en', { maximumFractionDigits: asset.decimals >= 8 ? 6 : 4 })}
          </div>
          {asset.symbol === 'USDC' && <div className="text-xs" style={{ color: 'var(--text2)' }}>${Number(balanceStr).toLocaleString('en', { maximumFractionDigits: 2 })}</div>}
        </div>
      </div>

      <p className="text-xs leading-relaxed px-1" style={{ color: 'var(--text3)' }}>{asset.blurb}</p>

      {/* Action tabs */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAction(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: action === id ? '#6366f1' : 'transparent', color: action === id ? '#fff' : 'var(--text2)' }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={action} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {action === 'send' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text1)' }}>Send {asset.symbol}</h3>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>Recipient Address</label>
                  <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
                    placeholder="0x…" value={toAddr} onChange={e => setTo(e.target.value)} />
                  {toAddr && !isAddress(toAddr) && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>Invalid address</p>}
                </div>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Amount ({asset.symbol})</label>
                    <button className="text-xs font-semibold" style={{ color: '#818cf8' }} onClick={() => setAmt(maxStr)}>Max: {maxStr}</button>
                  </div>
                  <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
                    type="number" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)} />
                </div>
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  onClick={doSend} disabled={!isAddress(toAddr) || !amt || sending || confirming}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.25)' }}>
                  {sending || confirming ? <><Loader2 size={15} className="animate-spin" />Sending…</> : <><Send size={15} />Send {asset.symbol}</>}
                </motion.button>
              </div>
            )}

            {action === 'receive' && wallet && (
              <div className="text-center space-y-4">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text1)' }}>Receive {asset.symbol}</h3>
                <div className="flex justify-center">
                  <div className="p-4 rounded-2xl" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <QRCodeSVG value={wallet} size={160} level="H" />
                  </div>
                </div>
                <div className="px-4 py-3 rounded-xl text-left" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-mono break-all" style={{ color: 'var(--text1)' }}>{wallet}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => copy(wallet)} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                    style={{ background: copied ? 'rgba(34,197,94,0.08)' : 'var(--surface2)', border: copied ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)', color: copied ? 'var(--green)' : 'var(--text1)' }}>
                    {copied ? <><Check size={14} />Copied!</> : <><Copy size={14} />Copy Address</>}
                  </button>
                  <a href={`${EXPLORER_BASE}/address/${wallet}`} target="_blank" rel="noopener"
                    className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 no-underline"
                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', color: '#818cf8' }}>
                    <ExternalLink size={14} />Explorer
                  </a>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl text-left" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>Only send {asset.symbol} on Arc Mainnet (chain ID {CHAIN_ID}) to this address — sending it from another network or as a different asset can lose it permanently.</p>
                </div>
              </div>
            )}

            {action === 'swap' && (
              <div>
                <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text1)' }}>Swap {asset.symbol}</h3>
                <SwapPanel asset={asset} wallet={wallet} balance={balance} />
              </div>
            )}

            {action === 'bridge' && (
              <div>
                <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text1)' }}>Bridge {asset.symbol}</h3>
                <BridgePanel asset={asset} wallet={wallet} />
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

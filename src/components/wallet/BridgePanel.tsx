import { useEffect, useState } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress, pad, parseUnits } from 'viem'
import { toast } from 'sonner'
import { ShieldAlert, ExternalLink, Loader2 } from 'lucide-react'
import { TOKEN_MESSENGER_V2_ABI, CCTP_DOMAINS, CCTP_STANDARD_FINALITY_THRESHOLD } from '@/abi/CCTP'
import { CCTP_ARC_DOMAIN, CCTP_BRIDGE_DISABLED_REASON, CCTP_TOKEN_MESSENGER_V2, CCTP_MESSAGE_TRANSMITTER_V2, CHAIN_ID } from '@/constants'
import { formatAddress } from '@/utils/format'
import type { WalletAsset } from '@/constants/walletAssets'

const DESTINATIONS = [
  { label: 'Ethereum', domain: CCTP_DOMAINS.ethereum },
  { label: 'Base', domain: CCTP_DOMAINS.base },
  { label: 'Arbitrum', domain: CCTP_DOMAINS.arbitrum },
  { label: 'Avalanche', domain: CCTP_DOMAINS.avalanche },
  { label: 'OP Mainnet', domain: CCTP_DOMAINS.optimism },
  { label: 'Polygon', domain: CCTP_DOMAINS.polygon },
]

/**
 * Bridge OUT via Circle's CCTP V2 (burn on Arc, mint on the destination chain). The contracts,
 * ABIs, and Arc's domain ID (26) are all real and verified — see src/abi/CCTP.ts — but the
 * live burn stays disabled: Circle's own attestation indexer currently has an open,
 * unacknowledged bug specific to Arc's domain where burns confirm on-chain but never get
 * attested, so the mint on the other side never arrives. That's already cost real users stuck
 * funds (github.com/circlefin/arc-node/issues/200). A CCTP burn can't be reversed once it
 * lands on-chain, so this form is intentionally read-only until that's fixed.
 */
export function BridgePanel({ asset, wallet }: { asset: WalletAsset; wallet?: `0x${string}` }) {
  const [destDomain, setDestDomain] = useState(DESTINATIONS[0].domain)
  const [amt, setAmt] = useState('')
  const [recipient, setRecipient] = useState('')
  const supported = asset.symbol === 'USDC' // CCTP on Arc is documented for USDC (and EURC); scoped to USDC here for the initial build
  const disabledReason = CCTP_BRIDGE_DISABLED_REASON // set to '' in constants.ts once Circle fixes the Arc attestation bug — that alone re-enables the button below

  let amountRaw = 0n
  try { amountRaw = amt ? parseUnits(amt, asset.decimals) : 0n } catch { /* mid-typing */ }

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: asset.address, abi: erc20Abi, functionName: 'allowance',
    args: wallet ? [wallet, CCTP_TOKEN_MESSENGER_V2] : undefined, chainId: CHAIN_ID as any,
    query: { enabled: !disabledReason && !!wallet },
  })
  const needsApproval = amountRaw > 0n && ((allowance as bigint | undefined) ?? 0n) < amountRaw

  const { writeContract, isPending: burning, data: txHash } = useWriteContract()
  const { isLoading: confirming, isSuccess: txDone } = useWaitForTransactionReceipt({ hash: txHash })
  useEffect(() => {
    if (!txDone) return
    if (needsApproval) refetchAllowance()
    else toast.success('Burned on Arc — track the mint via Circle’s attestation API using this transaction hash.')
  }, [txDone])

  const doApprove = () => {
    writeContract({ address: asset.address, abi: erc20Abi, functionName: 'approve', args: [CCTP_TOKEN_MESSENGER_V2, amountRaw], chainId: CHAIN_ID as any } as any, {
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }
  const doBridge = () => {
    if (!wallet || !amt) return
    const dest = recipient && isAddress(recipient) ? recipient : wallet
    let amount: bigint
    try { amount = parseUnits(amt, asset.decimals) } catch { toast.error('Invalid amount'); return }
    const mintRecipient = pad(dest as `0x${string}`, { size: 32 })
    const destinationCaller = pad('0x0', { size: 32 })
    writeContract({
      address: CCTP_TOKEN_MESSENGER_V2, abi: TOKEN_MESSENGER_V2_ABI, functionName: 'depositForBurn',
      args: [amount, destDomain, mintRecipient, asset.address, destinationCaller, 0n, CCTP_STANDARD_FINALITY_THRESHOLD],
      chainId: CHAIN_ID as any,
    } as any, { onError: (e: any) => toast.error(e.shortMessage ?? e.message) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
        <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
        <div className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p className="font-bold mb-1" style={{ color: 'var(--text1)' }}>Bridging out is disabled</p>
          <p>{CCTP_BRIDGE_DISABLED_REASON}</p>
          <a href="https://github.com/circlefin/arc-node/issues/200" target="_blank" rel="noopener"
            className="inline-flex items-center gap-1 mt-1.5 font-semibold no-underline" style={{ color: 'var(--red)' }}>
            See the open issue <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {!supported && (
        <p className="text-xs px-1" style={{ color: 'var(--text3)' }}>This preview is scoped to USDC for now — {asset.symbol} bridging via CCTP isn't wired up here yet.</p>
      )}

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>Destination chain</label>
        <div className="grid grid-cols-3 gap-1.5">
          {DESTINATIONS.map(d => (
            <button key={d.domain} onClick={() => setDestDomain(d.domain)}
              className="py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: destDomain === d.domain ? 'rgba(99,102,241,0.14)' : 'var(--surface2)', color: destDomain === d.domain ? '#818cf8' : 'var(--text2)', border: destDomain === d.domain ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)' }}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>Amount ({asset.symbol})</label>
        <input disabled={!!disabledReason} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
          type="number" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)} />
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--text2)' }}>Recipient on destination chain</label>
        <input disabled={!!disabledReason} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
          placeholder="0x… (defaults to your address)" value={recipient} onChange={e => setRecipient(e.target.value)} />
        {recipient && !isAddress(recipient) && <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>Invalid address</p>}
      </div>

      <button
        disabled={!!disabledReason || !supported || amountRaw === 0n || burning || confirming}
        onClick={needsApproval ? doApprove : doBridge}
        className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
        {burning || confirming
          ? <><Loader2 size={15} className="animate-spin" />Confirming…</>
          : disabledReason ? 'Bridging disabled' : needsApproval ? `Approve ${asset.symbol}` : `Burn on Arc → mint on ${DESTINATIONS.find(d=>d.domain===destDomain)?.label}`}
      </button>

      <div className="text-[10px] leading-relaxed px-1 space-y-0.5" style={{ color: 'var(--text3)' }}>
        <p>Arc CCTP domain: <b>{CCTP_ARC_DOMAIN}</b> · TokenMessengerV2: <span className="font-mono">{formatAddress(CCTP_TOKEN_MESSENGER_V2)}</span> · MessageTransmitterV2: <span className="font-mono">{formatAddress(CCTP_MESSAGE_TRANSMITTER_V2)}</span></p>
        <p>These are Circle's real, canonical CCTP V2 contract addresses (identical on every CCTP chain). The burn (and its approval step) is fully implemented above — it's just gated by <code>disabledReason</code> until Circle's indexer bug is fixed. There's no in-app claim/mint step yet: once your burn is attested, you'd currently need to call <span className="font-mono">MessageTransmitterV2.receiveMessage</span> on the destination chain yourself (e.g. via a block explorer) with the message + attestation from Circle's API.</p>
      </div>
    </div>
  )
}

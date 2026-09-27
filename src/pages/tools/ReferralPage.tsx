import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Gift, Link2, ShoppingCart, Wallet as WalletIcon } from 'lucide-react'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ReferralPanel } from '@/components/tools/panels'
import { useFactoryConfig } from '@/hooks/useFactoryConfig'

const Step = ({ n, icon: Icon, title, body }: { n: number; icon: any; title: string; body: string }) => (
  <div className="flex gap-3">
    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black" style={{ background: 'rgba(236,72,153,0.14)', color: '#ec4899' }}>{n}</div>
    <div>
      <div className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--text1)' }}><Icon size={12} />{title}</div>
      <div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text2)' }}>{body}</div>
    </div>
  </div>
)

export function ReferralPage() {
  const { address: wallet, isConnected } = useAccount()
  const cfg = useFactoryConfig()
  const effective = (Number(cfg.protocolFeeBps) * Number(cfg.referralFeeBps)) / 1e6

  return (
    <ToolPageShell
      icon={Gift} tone="#ec4899" title="Referral program"
      tagline="One link, every token on GlowFun. Earn a cut of the protocol fee any time someone you referred buys."
      about={<>
        <p>This is per-wallet, not per-token — the same link works for every launch on the platform, forever.</p>
        <p>Paid directly by the factory contract in USDC, tracked per-referrer on-chain — nothing routes through a server or a database that could lose it.</p>
        <p>A wallet can't refer itself: the buy flow ignores <code>?ref=</code> when it matches the buyer's own address.</p>
      </>}
    >
      {!isConnected ? (
        <div className="rounded-2xl p-5 flex flex-wrap items-center gap-4" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>Connect your wallet to get your referral link.</p>
          <ConnectKitButton />
        </div>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <ReferralPanel wallet={wallet} />
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>How it works</div>
          <Step n={1} icon={Link2} title="Share your link" body="Anyone who opens it has your wallet remembered as their referrer for the rest of that session." />
          <Step n={2} icon={ShoppingCart} title="They buy any token" body="At the moment of the trade, your address is passed into the buy as the referrer — set once per session, on whichever token they buy first." />
          <Step n={3} icon={WalletIcon} title="You earn, they don't pay extra" body={`You get ${(Number(cfg.referralFeeBps) / 100).toFixed(0)}% of the ${(Number(cfg.protocolFeeBps) / 100).toFixed(1)}% protocol fee already built into the price — about ${effective.toFixed(2)}% of the buy total. The buyer pays exactly what they'd pay anyway.`} />
        </div>
      </div>
    </ToolPageShell>
  )
}

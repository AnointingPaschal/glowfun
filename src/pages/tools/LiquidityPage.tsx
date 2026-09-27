import { Droplets, ShieldCheck } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { LpPanel, Note } from '@/components/tools/panels'

export function LiquidityPage() {
  return (
    <ToolPageShell
      icon={Droplets} tone="#0ea5e9" title="Liquidity lock"
      tagline="See exactly who holds the Uniswap LP position after graduation, when it unlocks, and — if you choose — lock it forever."
      about={<>
        <p><b>How the lock works:</b> at graduation the factory itself creates the Uniswap V3 pool and keeps the LP position NFT in the factory contract, not in the creator's wallet, for a fixed period (<code>lpLockDuration</code>, 30 days by default).</p>
        <p>While the factory holds it, nobody — including the creator — can pull that liquidity. Anyone can verify this on-chain by checking who owns the NFT.</p>
        <p><b>After it unlocks</b>, the creator can claim it into their own wallet. At that point the creator technically <i>could</i> remove liquidity, so this page also offers a one-way "lock forever" (burn the NFT to the dead address) as the strongest possible signal.</p>
        <p><b>Third-party lockers</b> (independent time-lock contracts you send the NFT to instead) may exist on Arc — this isn't one, and we haven't verified any specific one works here.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, curve, wallet, refetch }) => (
          <div className="space-y-4">
            <LpPanel token={token} info={info} curve={curve} wallet={wallet} refetch={refetch} />
            <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)' }}>
              <ShieldCheck size={16} style={{ color: '#22c55e' }} className="flex-shrink-0 mt-0.5" />
              <Note>Buyers don't have to take your word for any of this — the LP position's owner and unlock time are public on-chain (via the position manager contract linked below), so a locked-then-forever-burned position is independently verifiable by anyone, anytime.</Note>
            </div>
          </div>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

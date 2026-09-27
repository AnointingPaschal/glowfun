import { Coins } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { PayoutsPanel, Note } from '@/components/tools/panels'

export function PayoutsPage() {
  return (
    <ToolPageShell
      icon={Coins} tone="#22c55e" title="Creator payouts"
      tagline="Claim the USDC graduation bonus the factory owes you once this token graduates to a Uniswap pool."
      about={<>
        <p>When a token graduates, a slice of the raised USDC is set aside on the factory as a bonus for the recorded creator — on top of anything already withdrawn during the bonding-curve phase.</p>
        <p>It sits in the factory's own balance, tied to your address, until you call <code>claimCreatorGraduation()</code>. There's no deadline to claim it and no one else can redirect it.</p>
        <p>Only the wallet the factory recorded as creator at graduation time can claim — not whoever currently holds the token's admin functions, if those ever differ.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, curve, wallet, refetch }) => (
          <>
            {(info.creatorBonus > 0n || curve?.graduated) ? (
              <PayoutsPanel token={token} info={info} curve={curve} wallet={wallet} refetch={refetch} />
            ) : (
              <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>
                ${info.symbol || 'This token'} hasn't graduated yet — there's no bonus to claim until it hits its funding target and moves to a Uniswap pool.
              </div>
            )}
            <Note>Curious how close this token is to graduating? That progress lives on the token's own page, under Bonding curve.</Note>
          </>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

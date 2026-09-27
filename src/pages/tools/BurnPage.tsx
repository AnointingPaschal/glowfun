import { Flame } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { BurnPanel, Note, Row, fmtTokens } from '@/components/tools/panels'

export function BurnPage() {
  return (
    <ToolPageShell
      icon={Flame} tone="#ef4444" title="Token burner"
      tagline="Permanently destroy tokens — yours, or the whole supply if you're the creator with a plan — to shrink circulating supply."
      about={<>
        <p>Any holder can burn their own balance; the creator can't burn on anyone else's behalf.</p>
        <p>If the token was launched as <b>burnable</b>, this calls the contract's own <code>burn()</code>, which also lowers <b>total supply</b>. If it wasn't, tokens are sent to the standard dead address instead — gone from circulation, but total supply is unchanged.</p>
        <p>Burning is <b>permanent</b>. There's no undo, no admin override, and no recovery — check the amount twice.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, curve, refetch, wallet }) => (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <BurnPanel token={token} info={info} curve={curve} wallet={wallet} refetch={refetch} />
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Why burn?</div>
              <Row k="Circulating supply" v={fmtTokens(info.totalSupply)} />
              <Row k="Your balance" v={`${fmtTokens(info.balance)} ${info.symbol}`} />
              <Row k="Your share of supply" v={info.totalSupply > 0n ? `${(Number(info.balance * 10000n / info.totalSupply) / 100).toFixed(3)}%` : '—'} />
              <Note>Burning reduces the denominator that market cap and everyone else's ownership percentage are measured against — a common way projects signal commitment or offset an earlier over-mint.</Note>
              <Note warn>It does nothing to price by itself unless buyers notice and react — burning isn't a substitute for real demand.</Note>
            </div>
          </div>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

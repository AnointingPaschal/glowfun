import { PlusCircle } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { MintPanel, MultisigPanel, Note, Row, fmtTokens } from '@/components/tools/panels'

export function MintPage() {
  return (
    <ToolPageShell
      icon={PlusCircle} tone="#6366f1" title="Minter"
      tagline="Mint additional supply, up to the hard cap the token was launched with. Creator-only, and only if the token was launched as mintable."
      about={<>
        <p>Only the wallet recorded as this token's creator can mint, and only up to <code>maxSupply</code> set at launch — the contract reverts anything above it.</p>
        <p>Minting dilutes every existing holder proportionally. There's no on-chain notice sent to holders when you do it — communicate it yourself if it's part of your tokenomics (e.g. team unlocks, LP top-ups, rewards).</p>
        <p>Typing <b>MINT</b> to confirm doesn't require a second signer — it's just friction against a misclick. For real multi-party approval, the creator wallet itself needs to be a multisig; see the Security page.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, wallet, refetch }) => info.mintable ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <MintPanel token={token} info={info} curve={null} wallet={wallet} refetch={refetch} />
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Supply headroom</div>
              <Row k="Total supply" v={fmtTokens(info.totalSupply)} />
              <Row k="Hard cap" v={fmtTokens(info.maxSupply)} />
              <Row k="Headroom used" v={info.maxSupply > 0n ? `${(Number(info.totalSupply * 10000n / info.maxSupply) / 100).toFixed(2)}%` : '—'} />
              <Note>Buyers and explorers can always see <code>maxSupply</code> on-chain — a large unused headroom is something a diligent buyer will notice and price in.</Note>
            </div>
            <div className="lg:col-span-2"><MultisigPanel token={token} info={info} curve={null} wallet={wallet} refetch={refetch} /></div>
          </div>
        ) : (
          <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>
            ${info.symbol || 'This token'} wasn't launched as mintable — its supply is fixed and this contract has no mint function at all, for anyone.
          </div>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

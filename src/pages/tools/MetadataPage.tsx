import { PenLine } from 'lucide-react'
import { ToolPageShell, PerTokenTool } from '@/components/tools/ToolPageShell'
import { MetadataPanel, Note } from '@/components/tools/panels'

export function MetadataPage() {
  return (
    <ToolPageShell
      icon={PenLine} tone="#818cf8" title="Edit token details"
      tagline="Update the logo, description and social links stored on the token contract itself — creator-only, effective immediately everywhere."
      about={<>
        <p>These fields live on the token contract, not on GlowFun's servers — any explorer, wallet or aggregator reading the contract directly will pick up your change.</p>
        <p>The banner image is stored separately (off-chain, signed by your wallet) and is edited from the token's own page, not here.</p>
        <p>There's no history kept of previous values — if you're rebranding, save a copy of the old details somewhere first if you might want them back.</p>
      </>}
    >
      <PerTokenTool>
        {({ token, info, refetch }) => (
          <>
            <MetadataPanel token={token} info={info} curve={null} refetch={refetch} />
            <Note>Want to change the banner instead? That's on the token's own page — open it from the header above.</Note>
          </>
        )}
      </PerTokenTool>
    </ToolPageShell>
  )
}

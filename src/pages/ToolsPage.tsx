import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAccount, useReadContracts } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, Wrench, Search, ArrowUpRight } from 'lucide-react'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { useConfig } from '@/context/ConfigContext'
import { useTokenList } from '@/hooks/useTokenList'
import { useTokenTools } from '@/hooks/useTokenTools'
import {
  BurnPanel, MintPanel, VestingPanel, CreatorLockPanel, PayoutsPanel, LpPanel, ControlsPanel, MetadataPanel, ReferralPanel, type PanelProps,
} from '@/components/tools/panels'

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s)

function TokenTools({ token, wallet }: { token: `0x${string}`; wallet?: `0x${string}` }) {
  const { info, curve, refetch, isLoading } = useTokenTools(token, wallet)
  if (isLoading || !info) return <div className="flex items-center gap-2 py-10 justify-center text-xs" style={{ color: 'var(--text2)' }}><Loader2 size={14} className="animate-spin" />Reading token…</div>
  if (info.creator === '0x0000000000000000000000000000000000000000') {
    return <p className="text-sm py-8 text-center" style={{ color: 'var(--text2)' }}>That address isn't a GlowFun token on this network.</p>
  }
  const p: PanelProps = { token, info, curve, wallet, refetch }
  const creator = info.isCreator
  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div>
          <div className="text-lg font-black" style={{ color: 'var(--text1)', letterSpacing: '-0.02em' }}>{info.name} <span style={{ color: 'var(--text2)' }}>${info.symbol}</span></div>
          <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{token}</div>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: creator ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', color: creator ? 'var(--green)' : 'var(--text2)' }}>
          {creator ? 'You are the creator' : wallet ? 'Holder view' : 'Connect wallet for actions'}
        </span>
        <Link to={`/token/${token}`} className="no-underline text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>Token page <ArrowUpRight size={11} /></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
        {wallet && <BurnPanel {...p} />}
        {creator && info.mintable && <MintPanel {...p} />}
        {creator && info.vesting.total > 0n && <VestingPanel {...p} />}
        {creator && (curve?.creatorTokens ?? 0n) > 0n && info.vesting.total === 0n && <CreatorLockPanel {...p} />}
        {creator && (info.creatorBonus > 0n || curve?.graduated) && <PayoutsPanel {...p} />}
        <LpPanel {...p} />
        {creator && (info.pausable || info.hasBlacklist) && <ControlsPanel {...p} />}
        {creator && <MetadataPanel key={token + info.meta.description + info.meta.imageUri} {...p} />}
      </div>
      {!creator && wallet && <p className="text-[11px]" style={{ color: 'var(--text3)' }}>Minting, vesting, payouts and editing are only available to the wallet that launched the token.</p>}
    </div>
  )
}

export function ToolsPage() {
  const { address: wallet, isConnected } = useAccount()
  const { CHAIN_ID } = useConfig()
  const [params, setParams] = useSearchParams()
  const [paste, setPaste] = useState('')
  const { addresses } = useTokenList()

  const q = params.get('token') ?? ''
  const selected = isAddr(q) ? (q as `0x${string}`) : undefined

  // Names + creators for the picker (batched; the token list is small)
  const { data: meta } = useReadContracts({
    contracts: addresses.flatMap(a => [
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'symbol', chainId: CHAIN_ID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'creator', chainId: CHAIN_ID as any },
    ]) as any[],
    query: { enabled: addresses.length > 0 },
  })
  const rows = useMemo(() => addresses.map((a, i) => ({
    address: a,
    symbol: (meta?.[i * 2]?.result as string) ?? '…',
    mine: !!wallet && String(meta?.[i * 2 + 1]?.result ?? '').toLowerCase() === wallet.toLowerCase(),
  })), [addresses, meta, wallet])
  const mine = rows.filter(r => r.mine)
  const choose = (a: string) => setParams({ token: a })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="section-eyebrow">Creator &amp; holder tools</div>
        <h1 className="text-3xl font-black mt-1 flex items-center gap-2.5" style={{ letterSpacing: '-0.03em', color: 'var(--text1)' }}><Wrench size={26} style={{ color: '#818cf8' }} />Tools</h1>
        <p className="text-sm mt-1.5 max-w-2xl" style={{ color: 'var(--text2)' }}>Burn, mint, release vesting, lock liquidity, claim payouts and manage your token. Everything runs straight against the contracts from your wallet.</p>
      </div>

      {!isConnected && (
        <div className="rounded-2xl p-5 flex flex-wrap items-center gap-4" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>Connect your wallet to see your tokens and use the tools.</p>
          <ConnectKitButton />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {/* Picker */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>{mine.length ? 'Your tokens' : 'Choose a token'}</div>
            <div className="flex flex-wrap gap-2">
              {(mine.length ? mine : rows.slice(0, 12)).map(r => (
                <button key={r.address} onClick={() => choose(r.address)} className="px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: selected === r.address ? 'rgba(99,102,241,0.16)' : 'var(--surface2)', color: selected === r.address ? '#a5b4fc' : 'var(--text1)', border: `1px solid ${selected === r.address ? 'rgba(99,102,241,0.35)' : 'var(--border)'}` }}>
                  ${r.symbol}
                </button>
              ))}
              {!rows.length && <span className="text-xs" style={{ color: 'var(--text3)' }}>No tokens yet.</span>}
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}>
                <Search size={13} style={{ color: 'var(--text3)' }} />
                <input className="flex-1 py-2.5 text-xs bg-transparent outline-none font-mono" style={{ color: 'var(--text1)' }} placeholder="…or paste any token address (0x…)" value={paste} onChange={e => setPaste(e.target.value.trim())} />
              </div>
              <button disabled={!isAddr(paste)} onClick={() => choose(paste)} className="px-4 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Open</button>
            </div>
          </div>

          {selected
            ? <TokenTools token={selected} wallet={wallet} />
            : <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>Pick a token above to see the tools available for it.</div>}
        </div>

        {/* Wallet-level tools */}
        <div className="space-y-4 xl:sticky xl:top-20">
          <ReferralPanel wallet={wallet} />
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Wrench, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useTokenTools } from '@/hooks/useTokenTools'
import { TokenPicker } from '@/components/tools/TokenPicker'
import { ReferralPanel } from '@/components/tools/panels'
import { TOOL_LINKS, toolPath } from '@/components/tools/toolLinks'

const ZERO = '0x0000000000000000000000000000000000000000'

/** Which tools actually apply to this token, so the hub doesn't link to a dead end. */
function applicableTools(info: NonNullable<ReturnType<typeof useTokenTools>['info']> | null, curve: ReturnType<typeof useTokenTools>['curve']) {
  if (!info) return new Set<string>()
  const s = new Set<string>(['burn', 'security', 'liquidity'])
  if (info.isCreator) {
    if (info.mintable) s.add('mint')
    if (info.vesting.total > 0n) s.add('vesting')
    if ((curve?.creatorTokens ?? 0n) > 0n && info.vesting.total === 0n) s.add('lock')
    if (info.creatorBonus > 0n || curve?.graduated) s.add('payouts')
    s.add('metadata')
  }
  return s
}

function TokenToolGrid({ token }: { token: `0x${string}` }) {
  const { address: wallet } = useAccount()
  const { info, curve, isLoading } = useTokenTools(token, wallet)
  if (isLoading || !info) return <div className="text-xs py-8 text-center" style={{ color: 'var(--text2)' }}>Reading token…</div>
  if (info.creator === ZERO) return <p className="text-sm py-8 text-center" style={{ color: 'var(--text2)' }}>That address isn't a GlowFun token on this network.</p>
  const applicable = applicableTools(info, curve)
  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div>
          <div className="text-lg font-black" style={{ color: 'var(--text1)', letterSpacing: '-0.02em' }}>{info.name} <span style={{ color: 'var(--text2)' }}>${info.symbol}</span></div>
          <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{token}</div>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: info.isCreator ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', color: info.isCreator ? 'var(--green)' : 'var(--text2)' }}>
          {info.isCreator ? 'You are the creator' : wallet ? 'Holder view' : 'Connect wallet for actions'}
        </span>
        <Link to={`/token/${token}`} className="no-underline text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>Token page <ArrowUpRight size={11} /></Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOL_LINKS.filter(t => t.perToken).map(t => {
          const on = applicable.has(t.slug)
          const Icon = t.icon
          return (
            <Link key={t.slug} to={toolPath(t.slug, token)} className="no-underline rounded-2xl p-4 flex items-start gap-3 transition-all hover:-translate-y-0.5"
              style={{ background: 'var(--surface)', border: `1px solid ${on ? 'var(--border)' : 'var(--border)'}`, opacity: on ? 1 : 0.55 }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${t.tone}18` }}><Icon size={16} style={{ color: t.tone }} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text1)' }}>{t.label}</div>
                <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text2)' }}>{t.short}</div>
                {!on && <div className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--text3)' }}>Not applicable to this token</div>}
              </div>
              <ArrowRight size={14} className="flex-shrink-0 mt-1" style={{ color: 'var(--text3)' }} />
            </Link>
          )
        })}
      </div>
      {!info.isCreator && wallet && <p className="text-[11px]" style={{ color: 'var(--text3)' }}>Minting, vesting, payouts and editing are only available to the wallet that launched the token. Burning, security info and the liquidity lock status are visible to everyone.</p>}
    </div>
  )
}

export function ToolsHubPage() {
  const { address: wallet, isConnected } = useAccount()
  const [params, setParams] = useSearchParams()
  const q = params.get('token') ?? ''
  const selected = /^0x[0-9a-fA-F]{40}$/.test(q) ? (q as `0x${string}`) : undefined
  const choose = (a: string) => setParams({ token: a })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="section-eyebrow">Creator &amp; holder tools</div>
        <h1 className="text-3xl font-black mt-1 flex items-center gap-2.5" style={{ letterSpacing: '-0.03em', color: 'var(--text1)' }}><Wrench size={26} style={{ color: '#818cf8' }} />Tools</h1>
        <p className="text-sm mt-1.5 max-w-2xl" style={{ color: 'var(--text2)' }}>Burn, mint, release vesting, lock liquidity, check multisig security, claim payouts and manage your token — each as its own page. Everything runs straight against the contracts from your wallet, nothing routes through a server.</p>
      </div>

      {!isConnected && (
        <div className="rounded-2xl p-5 flex flex-wrap items-center gap-4" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>Connect your wallet to see your tokens and use the tools.</p>
          <ConnectKitButton />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <TokenPicker selected={selected} wallet={wallet} onChoose={choose} />
          {selected
            ? <TokenToolGrid token={selected} />
            : <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>Pick a token above to see the tools available for it.</div>}
        </div>

        <div className="space-y-4 xl:sticky xl:top-20">
          <ReferralPanel wallet={wallet} />
          <Link to={toolPath('referral')} className="block no-underline text-[11px] font-semibold text-center" style={{ color: 'var(--accent)' }}>Open the full referral page →</Link>
        </div>
      </div>
    </div>
  )
}

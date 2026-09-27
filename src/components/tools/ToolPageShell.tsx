import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Loader2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { useSearchParams } from 'react-router-dom'
import { useTokenTools } from '@/hooks/useTokenTools'
import { TokenPicker } from './TokenPicker'
import { toolPath } from './toolLinks'

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s)
const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * The shell every dedicated tool page (/tools/burn, /tools/mint, …) shares:
 * a back-link, an icon/title/description header, an "about this tool" panel,
 * and — for per-token tools — the token picker + a small token header card.
 * The page itself only supplies the action panel(s) and any extra content.
 */
export function ToolPageShell({
  icon: Icon, title, tone, tagline, about, children,
}: { icon: any; title: string; tone: string; tagline: string; about: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link to="/tools" className="inline-flex items-center gap-1.5 text-xs font-semibold no-underline" style={{ color: 'var(--text2)' }}>
        <ArrowLeft size={13} /> All tools
      </Link>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${tone}18`, border: `1px solid ${tone}30` }}>
          <Icon size={20} style={{ color: tone }} />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-black" style={{ letterSpacing: '-0.03em', color: 'var(--text1)' }}>{title}</h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text2)' }}>{tagline}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-4 min-w-0">{children}</div>
        <div className="rounded-2xl p-4 space-y-2.5 xl:sticky xl:top-20" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>About this tool</div>
          <div className="text-[12px] leading-relaxed space-y-2" style={{ color: 'var(--text2)' }}>{about}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Wraps a per-token tool's body: reads ?token= from the URL, shows the picker
 * when nothing is selected yet, and hands the loaded token info down once it
 * is. Every /tools/<slug> page (other than Referral) is built on this.
 */
export function PerTokenTool({ children }: { children: (ctx: { token: `0x${string}`; info: NonNullable<ReturnType<typeof useTokenTools>['info']>; curve: ReturnType<typeof useTokenTools>['curve']; wallet?: `0x${string}`; refetch: () => Promise<void>; isCreator: boolean }) => ReactNode }) {
  const { address: wallet, isConnected } = useAccount()
  const [params, setParams] = useSearchParams()
  const q = params.get('token') ?? ''
  const selected = isAddr(q) ? (q as `0x${string}`) : undefined
  const choose = (a: string) => setParams({ token: a })
  const { info, curve, refetch, isLoading } = useTokenTools(selected, wallet)

  return (
    <>
      {!isConnected && (
        <div className="rounded-2xl p-4 flex flex-wrap items-center gap-4" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Connect your wallet to use this tool.</p>
          <ConnectKitButton />
        </div>
      )}
      <TokenPicker selected={selected} wallet={wallet} onChoose={choose} />

      {!selected && (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px dashed var(--border2)', color: 'var(--text2)' }}>
          Pick a token above to continue.
        </div>
      )}
      {selected && (isLoading || !info) && (
        <div className="flex items-center gap-2 py-10 justify-center text-xs" style={{ color: 'var(--text2)' }}>
          <Loader2 size={14} className="animate-spin" />Reading token…
        </div>
      )}
      {selected && info && info.creator === ZERO && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text2)' }}>That address isn't a GlowFun token on this network.</p>
      )}
      {selected && info && info.creator !== ZERO && (<>
        <TokenHeader token={selected} name={info.name} symbol={info.symbol} isCreator={info.isCreator} connected={!!wallet} />
        {children({ token: selected, info, curve, wallet, refetch, isCreator: info.isCreator })}
      </>)}
    </>
  )
}

function TokenHeader({ token, name, symbol, isCreator, connected }: { token: string; name: string; symbol: string; isCreator: boolean; connected: boolean }) {
  return (
    <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div>
        <div className="text-lg font-black" style={{ color: 'var(--text1)', letterSpacing: '-0.02em' }}>{name} <span style={{ color: 'var(--text2)' }}>${symbol}</span></div>
        <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{token}</div>
      </div>
      <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: isCreator ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', color: isCreator ? 'var(--green)' : 'var(--text2)' }}>
        {isCreator ? 'You are the creator' : connected ? 'Holder view' : 'Connect wallet for actions'}
      </span>
      <Link to={`/token/${token}`} className="no-underline text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>Token page <ArrowUpRight size={11} /></Link>
    </div>
  )
}

export { toolPath }

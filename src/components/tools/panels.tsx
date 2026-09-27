import { useState, useMemo, type ReactNode } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { toast } from 'sonner'
import {
  Flame, PlusCircle, Hourglass, Lock, Coins, Droplets, ShieldAlert, PenLine, Gift, Loader2, Copy, Check, AlertTriangle, ExternalLink, ShieldCheck, KeyRound, Users,
} from 'lucide-react'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { POSITION_MANAGER_ABI } from '@/abi/PositionManager'
import { useConfig } from '@/context/ConfigContext'
import { useTx } from '@/hooks/useTx'
import { useFactoryConfig } from '@/hooks/useFactoryConfig'
import { useIsContractWallet } from '@/hooks/useWalletKind'
import { DEAD, useTokenTools } from '@/hooks/useTokenTools'
import ImageUpload from '@/components/ImageUpload'
import { parseTokens } from '@/utils/format'
import { referralLink } from '@/utils/referral'

type Info = NonNullable<ReturnType<typeof useTokenTools>['info']>
type Curve = ReturnType<typeof useTokenTools>['curve']
export interface PanelProps { token: `0x${string}`; info: Info; curve: Curve; wallet?: `0x${string}`; refetch: () => Promise<void> }

const ZERO = '0x0000000000000000000000000000000000000000'
const card = { background: 'var(--surface)', border: '1px solid var(--border)' }
const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none'
const inputSt = { background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text1)' }

export const fmtTokens = (n: bigint) => {
  const v = Number(n) / 1e18
  return v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toLocaleString('en', { maximumFractionDigits: 4 })
}
export const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export const until = (sec: number) => {
  const d = sec - Math.floor(Date.now() / 1000)
  if (d <= 0) return 'now'
  const days = Math.floor(d / 86400), hrs = Math.floor((d % 86400) / 3600), mins = Math.floor((d % 3600) / 60)
  return days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
}
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s)

/* ── shell ─────────────────────────────────────────────────────────────── */
export function ToolShell({ icon: Icon, title, badge, tone = '#818cf8', children }: { icon: any; title: string; badge?: string; tone?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${tone}18` }}><Icon size={14} style={{ color: tone }} /></div>
        <span className="text-sm font-bold" style={{ color: 'var(--text1)' }}>{title}</span>
        {badge && <span className="ml-auto text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${tone}18`, color: tone }}>{badge}</span>}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}
export const Note = ({ children, warn }: { children: ReactNode; warn?: boolean }) => (
  <p className="text-[11px] leading-relaxed flex gap-2" style={{ color: warn ? 'var(--gold)' : 'var(--text2)' }}>
    {warn && <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />}<span>{children}</span>
  </p>
)
export const Btn = ({ onClick, disabled, busy, children, tone = 'primary' }: { onClick: () => void; disabled?: boolean; busy?: boolean; children: ReactNode; tone?: 'primary' | 'danger' | 'ghost' }) => (
  <button onClick={onClick} disabled={disabled || busy} className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
    style={tone === 'danger' ? { background: 'rgba(239,68,68,0.14)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }
      : tone === 'ghost' ? { background: 'var(--surface2)', color: 'var(--text1)', border: '1px solid var(--border)' }
      : { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>
    {busy && <Loader2 size={12} className="animate-spin" />}{children}
  </button>
)
export const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between items-center text-[11px] py-1" style={{ borderBottom: '1px solid var(--border)' }}>
    <span style={{ color: 'var(--text2)' }}>{k}</span><span className="font-semibold tabular-nums" style={{ color: 'var(--text1)' }}>{v}</span>
  </div>
)

/**
 * Extra friction on a high-impact, single-key action: the caller must type an
 * exact phrase before the button unlocks. This is NOT cryptographic multisig
 * (nothing here requires a second signer) — it just makes a single misclick
 * or a compromised session harder to turn into an irreversible action. Real
 * multi-party protection means the creator wallet itself is a multisig (see
 * the Security tool page).
 */
function TypeToConfirm({ phrase, value, onChange }: { phrase: string; value: string; onChange: (v: string) => void }) {
  return (
    <input className={inputCls} style={inputSt} placeholder={`Type ${phrase} to confirm`} value={value} onChange={e => onChange(e.target.value)} />
  )
}

/* ── Burn (any holder) ─────────────────────────────────────────────────── */
export function BurnPanel({ token, info, refetch }: PanelProps) {
  const { CHAIN_ID } = useConfig()
  const [amt, setAmt] = useState('')
  const [ok, setOk] = useState(false)
  const { send, busy } = useTx(() => { setAmt(''); setOk(false); void refetch() })
  const amount = parseTokens(amt)
  const invalid = amount <= 0n || amount > info.balance
  const go = () => send(
    info.burnable
      ? { address: token, abi: GLOW_TOKEN_ABI, functionName: 'burn', args: [amount], chainId: CHAIN_ID }
      : { address: token, abi: GLOW_TOKEN_ABI, functionName: 'transfer', args: [DEAD, amount], chainId: CHAIN_ID },
    info.burnable ? `Burned ${amt} ${info.symbol}` : `Sent ${amt} ${info.symbol} to the dead address`)
  const pick = (pct: number) => setAmt((Number((info.balance * BigInt(pct)) / 100n) / 1e18).toString())
  return (
    <ToolShell icon={Flame} title="Token burner" badge={info.burnable ? 'Burnable' : 'Dead-address burn'} tone="#ef4444">
      <Row k="Your balance" v={`${fmtTokens(info.balance)} ${info.symbol}`} />
      <Row k="Total supply" v={fmtTokens(info.totalSupply)} />
      {info.burnable
        ? <Note>Burning permanently destroys tokens and <b>reduces total supply</b>.</Note>
        : <Note>This token isn't burnable on-chain, so tokens are sent to the dead address <code>0x…dEaD</code>: they're gone for good, but total supply stays the same.</Note>}
      <input className={inputCls} style={inputSt} placeholder={`Amount of ${info.symbol || 'tokens'}`} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />
      <div className="flex gap-1.5">{[25, 50, 100].map(p => <button key={p} onClick={() => pick(p)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{p === 100 ? 'MAX' : `${p}%`}</button>)}</div>
      <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text2)' }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />I understand this can't be undone</label>
      <Btn tone="danger" onClick={go} busy={busy} disabled={invalid || !ok}>{amount > info.balance ? 'Amount exceeds balance' : `Burn ${amt || ''} ${info.symbol}`}</Btn>
    </ToolShell>
  )
}

/* ── Mint (creator, mintable tokens) ─────────────────────────────────────── */
export function MintPanel({ token, info, wallet, refetch }: PanelProps) {
  const { CHAIN_ID } = useConfig()
  const [to, setTo] = useState(wallet ?? '')
  const [amt, setAmt] = useState('')
  const [confirm, setConfirm] = useState('')
  const { send, busy } = useTx(() => { setAmt(''); setConfirm(''); void refetch() })
  const amount = parseTokens(amt)
  const remaining = info.maxSupply > info.totalSupply ? info.maxSupply - info.totalSupply : 0n
  const newSupply = info.totalSupply + amount
  const dilutionPct = info.totalSupply > 0n && amount > 0n ? Number((amount * 10000n) / info.totalSupply) / 100 : 0
  const invalid = !isAddr(to) || amount <= 0n || amount > remaining || confirm.trim().toUpperCase() !== 'MINT'
  return (
    <ToolShell icon={PlusCircle} title="Minter" badge="Creator" tone="#6366f1">
      <Row k="Total supply" v={fmtTokens(info.totalSupply)} />
      <Row k="Max supply (hard cap)" v={fmtTokens(info.maxSupply)} />
      <Row k="Mintable remaining" v={fmtTokens(remaining)} />
      {remaining === 0n && <Note warn>The supply cap has been reached: no more tokens can be minted.</Note>}
      <input className={inputCls} style={inputSt} placeholder="Recipient address (0x…)" value={to} onChange={e => setTo(e.target.value.trim())} />
      <input className={inputCls} style={inputSt} placeholder={`Amount of ${info.symbol || 'tokens'}`} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />
      {amount > 0n && amount <= remaining && (
        <Note warn={dilutionPct > 5}>New supply would be <b>{fmtTokens(newSupply)}</b>, a <b>{dilutionPct.toFixed(2)}%</b> increase — every existing holder's share is diluted by that much.</Note>
      )}
      <TypeToConfirm phrase="MINT" value={confirm} onChange={setConfirm} />
      <Btn onClick={() => send({ address: token, abi: GLOW_TOKEN_ABI, functionName: 'mint', args: [to as `0x${string}`, amount], chainId: CHAIN_ID }, `Minted ${amt} ${info.symbol}`)} busy={busy} disabled={invalid}>
        {amount > remaining ? 'Above the cap' : `Mint ${amt || ''} ${info.symbol}`}
      </Btn>
    </ToolShell>
  )
}

/* ── Vesting (creator) ───────────────────────────────────────────────────── */
export function VestingPanel({ token, info, refetch }: PanelProps) {
  const { CHAIN_ID } = useConfig()
  const { send, busy } = useTx(() => void refetch())
  const v = info.vesting
  const claimable = v.vested > v.released ? v.vested - v.released : 0n
  const pct = v.total > 0n ? Math.min(100, Number((v.vested * 10000n) / v.total) / 100) : 0
  const relPct = v.total > 0n ? Math.min(100, Number((v.released * 10000n) / v.total) / 100) : 0
  return (
    <ToolShell icon={Hourglass} title="Vesting" badge="Creator" tone="#f59e0b">
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: 'rgba(245,158,11,0.45)' }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${relPct}%`, background: '#f59e0b' }} />
      </div>
      <Row k="Total under vesting" v={fmtTokens(v.total)} />
      <Row k="Vested so far" v={`${fmtTokens(v.vested)} (${pct.toFixed(1)}%)`} />
      <Row k="Already released" v={fmtTokens(v.released)} />
      <Row k="Claimable now" v={fmtTokens(claimable)} />
      <Row k="Cliff ends" v={v.cliff > 0 ? fmtDate(v.start + v.cliff) : 'No cliff'} />
      <Row k="Fully vested" v={fmtDate(v.start + v.duration)} />
      <Btn onClick={() => send({ address: token, abi: GLOW_TOKEN_ABI, functionName: 'releaseVested', chainId: CHAIN_ID }, `Released ${fmtTokens(claimable)} ${info.symbol}`)} busy={busy} disabled={claimable === 0n}>
        {claimable === 0n ? 'Nothing to release yet' : `Release ${fmtTokens(claimable)} ${info.symbol}`}
      </Btn>
    </ToolShell>
  )
}

/* ── Creator token lock (no vesting) ─────────────────────────────────────── */
export function CreatorLockPanel({ token, info, curve, refetch }: PanelProps) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { send, busy } = useTx(() => void refetch())
  const expiry = curve?.lockExpiry ?? 0
  const locked = info.creatorLocked
  const ready = locked && expiry > 0 && Date.now() / 1000 >= expiry
  return (
    <ToolShell icon={Lock} title="Creator token lock" badge={locked ? (ready ? 'Ready' : 'Locked') : 'Unlocked'} tone="#22c55e">
      <Row k="Creator allocation" v={curve ? fmtTokens(curve.creatorTokens) : '—'} />
      <Row k="Status" v={locked ? (expiry > 0 ? `Locked until ${fmtDate(expiry)}` : 'Locked') : 'Not locked'} />
      {locked && !ready && expiry > 0 && <Note>Time left: <b>{until(expiry)}</b>. Buyers can see this lock, so extending trust means leaving it in place.</Note>}
      {!locked && <Note>Your allocation isn't locked: it's already transferable.</Note>}
      {ready && <Btn onClick={() => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'unlockCreatorTokens', args: [token], chainId: CHAIN_ID }, 'Creator tokens unlocked')} busy={busy}>Unlock creator tokens</Btn>}
    </ToolShell>
  )
}

/* ── Payouts (graduation bonus) ──────────────────────────────────────────── */
export function PayoutsPanel({ token, info, wallet, refetch }: PanelProps) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { send, busy } = useTx(() => void refetch())
  const mine = !!wallet && info.bonusOwner.toLowerCase() === wallet.toLowerCase()
  const amt = Number(info.creatorBonus) / 1e6
  return (
    <ToolShell icon={Coins} title="Creator payouts" badge={amt > 0 && mine ? 'Claimable' : undefined} tone="#22c55e">
      <Row k="Graduation bonus (USDC)" v={`$${amt.toLocaleString('en', { maximumFractionDigits: 2 })}`} />
      <Note>When a token graduates, the creator earns a bonus in USDC. It stays in the factory until you claim it.</Note>
      <Btn onClick={() => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'claimCreatorGraduation', args: [token], chainId: CHAIN_ID }, `Claimed $${amt.toFixed(2)} USDC`)} busy={busy} disabled={!(amt > 0 && mine)}>
        {amt > 0 ? (mine ? `Claim $${amt.toFixed(2)} USDC` : 'Only the recorded creator can claim') : 'Nothing to claim'}
      </Btn>
    </ToolShell>
  )
}

/* ── Find the LP NFT a wallet holds for this token (after claiming it) ───── */
function useMyLpNft(token: `0x${string}`, wallet: `0x${string}` | undefined, pm: `0x${string}`, enabled: boolean) {
  const { CHAIN_ID } = useConfig()
  const on = enabled && !!wallet && pm !== ZERO
  const { data: bal } = useReadContract({ address: pm, abi: POSITION_MANAGER_ABI, functionName: 'balanceOf', args: [wallet ?? ZERO], chainId: CHAIN_ID as any, query: { enabled: on } })
  const n = Math.min(Number(bal ?? 0n), 40)
  const { data: idRes } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ address: pm, abi: POSITION_MANAGER_ABI, functionName: 'tokenOfOwnerByIndex', args: [wallet!, BigInt(i)], chainId: CHAIN_ID as any })) as any[],
    query: { enabled: on && n > 0 },
  })
  const ids = useMemo(() => (idRes ?? []).map(r => (r.status === 'success' ? (r.result as bigint) : null)).filter((x): x is bigint => x !== null), [idRes])
  const { data: posRes } = useReadContracts({
    contracts: ids.map(id => ({ address: pm, abi: POSITION_MANAGER_ABI, functionName: 'positions', args: [id], chainId: CHAIN_ID as any })) as any[],
    query: { enabled: on && ids.length > 0 },
  })
  return useMemo(() => {
    const t = token.toLowerCase()
    for (let i = 0; i < (posRes?.length ?? 0); i++) {
      const r = posRes![i]
      if (r.status !== 'success') continue
      const p = r.result as readonly any[]
      if (String(p[2]).toLowerCase() === t || String(p[3]).toLowerCase() === t) return ids[i]
    }
    return undefined
  }, [posRes, ids, token])
}

/* ── Liquidity lock ───────────────────────────────────────────────────────── */
export function LpPanel({ token, info, curve, wallet, refetch }: PanelProps) {
  const { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()
  const { send, busy } = useTx(() => void refetch())
  const [confirm, setConfirm] = useState('')
  const lp = info.lp
  const heldByFactory = lp.nftId > 0n
  const iOwn = !!wallet && lp.owner.toLowerCase() === wallet.toLowerCase()
  const now = Math.floor(Date.now() / 1000)
  const unlocked = heldByFactory && now >= lp.unlockTime
  const myNft = useMyLpNft(token, wallet, info.positionManager, !!curve?.graduated && !heldByFactory)
  const lockForever = () => send({ address: info.positionManager, abi: POSITION_MANAGER_ABI, functionName: 'transferFrom', args: [wallet!, DEAD, myNft!], chainId: CHAIN_ID }, 'LP position locked forever')

  return (
    <ToolShell icon={Droplets} title="Liquidity lock" badge={heldByFactory ? (unlocked ? 'Unlocked' : 'Locked') : curve?.graduated ? 'Claimed / none' : 'Not graduated'} tone="#0ea5e9">
      {!curve?.graduated && <Note>Liquidity is created when the token graduates to Uniswap. At that moment the factory contract takes the pool's LP position (an NFT) and <b>holds it for the lock period</b>, so it can't be pulled.</Note>}
      {heldByFactory && (<>
        <Row k="LP position" v={`#${lp.nftId.toString()}`} />
        <Row k="Held by" v="Factory contract (locked)" />
        <Row k={unlocked ? 'Unlocked since' : 'Unlocks'} v={fmtDate(lp.unlockTime)} />
        {!unlocked && <Note>Time left: <b>{until(lp.unlockTime)}</b>. Buyers can verify this on-chain: while it is held by the factory, the liquidity cannot be removed.</Note>}
        <Btn onClick={() => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'claimLpPosition', args: [token], chainId: CHAIN_ID }, 'LP position claimed to your wallet')} busy={busy} disabled={!unlocked || !iOwn}>
          {!iOwn ? 'Only the creator at graduation can claim' : unlocked ? 'Claim LP position to my wallet' : `Locked for ${until(lp.unlockTime)}`}
        </Btn>
        {unlocked && iOwn && <Note warn>After you claim it, the lock is over: the LP position is in your wallet and you could remove the liquidity. To keep buyers safe, lock it again (below) right after claiming.</Note>}
      </>)}
      {curve?.graduated && !heldByFactory && (<>
        <Note>The factory no longer holds an LP position for this token{myNft !== undefined ? '. Your wallet holds it:' : ' (already claimed, or the pool wasn\'t created by the factory).'}</Note>
        {myNft !== undefined && (<>
          <Row k="Your LP position" v={`#${myNft.toString()}`} />
          <Note warn><b>Lock forever:</b> sends the LP position to the dead address <code>0x…dEaD</code>. The liquidity can then never be withdrawn by anyone, which is the strongest promise you can make to buyers. <b>This is permanent</b>, and it also gives up the trading fees that position earns.</Note>
          <input className={inputCls} style={inputSt} placeholder='Type LOCK FOREVER to confirm' value={confirm} onChange={e => setConfirm(e.target.value)} />
          <Btn tone="danger" onClick={lockForever} busy={busy} disabled={confirm.trim() !== 'LOCK FOREVER'}>Lock liquidity forever</Btn>
        </>)}
      </>)}
      <Note>Other option: put the LP position into a third-party locker (a time-lock contract). Check that one exists on Arc first. The factory lock above is the only one built into GlowFun.</Note>
      {info.positionManager !== ZERO && <a href={`${EXPLORER_BASE}/address/${info.positionManager}`} target="_blank" rel="noopener" className="text-[10px] no-underline inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>Position manager <ExternalLink size={9} /></a>}
    </ToolShell>
  )
}

/* ── Pause & blacklist (tokens launched with those features) ─────────────── */
export function ControlsPanel({ token, info, refetch }: PanelProps) {
  const { CHAIN_ID } = useConfig()
  const { send, busy } = useTx(() => void refetch())
  const [who, setWho] = useState('')
  const [pauseConfirm, setPauseConfirm] = useState('')
  const [blConfirm, setBlConfirm] = useState('')
  const valid = isAddr(who)
  const { data: isBl } = useReadContract({ address: token, abi: GLOW_TOKEN_ABI, functionName: 'blacklisted', args: [valid ? (who as `0x${string}`) : (ZERO as `0x${string}`)], chainId: CHAIN_ID as any, query: { enabled: valid && info.hasBlacklist } })
  return (
    <ToolShell icon={ShieldAlert} title="Compliance controls" badge="Creator" tone="#f59e0b">
      {info.pausable && (<>
        <Row k="Trading status" v={info.paused ? 'Paused' : 'Active'} />
        {!info.paused && <Note warn>Pausing stops every holder from transferring or trading this token, instantly and for everyone, until you resume it.</Note>}
        {!info.paused && <TypeToConfirm phrase="PAUSE" value={pauseConfirm} onChange={setPauseConfirm} />}
        <Btn tone={info.paused ? 'primary' : 'danger'} busy={busy} disabled={!info.paused && pauseConfirm.trim().toUpperCase() !== 'PAUSE'}
          onClick={() => { send({ address: token, abi: GLOW_TOKEN_ABI, functionName: 'setTokenPaused', args: [!info.paused], chainId: CHAIN_ID }, info.paused ? 'Token resumed' : 'Token paused'); setPauseConfirm('') }}>
          {info.paused ? 'Resume transfers' : 'Pause all transfers'}
        </Btn>
      </>)}
      {info.hasBlacklist && (<>
        <input className={inputCls} style={inputSt} placeholder="Wallet address to restrict (0x…)" value={who} onChange={e => setWho(e.target.value.trim())} />
        {valid && <Note>{isBl ? 'This wallet is currently blacklisted.' : 'This wallet is not blacklisted.'}</Note>}
        {valid && !isBl && <TypeToConfirm phrase="BLOCK" value={blConfirm} onChange={setBlConfirm} />}
        <div className="flex gap-2">
          <Btn tone="danger" busy={busy} disabled={!valid || !!isBl || blConfirm.trim().toUpperCase() !== 'BLOCK'}
            onClick={() => { send({ address: token, abi: GLOW_TOKEN_ABI, functionName: 'setBlacklisted', args: [who, true], chainId: CHAIN_ID }, 'Wallet blacklisted'); setBlConfirm('') }}>Blacklist</Btn>
          <Btn tone="ghost" busy={busy} disabled={!valid || !isBl} onClick={() => send({ address: token, abi: GLOW_TOKEN_ABI, functionName: 'setBlacklisted', args: [who, false], chainId: CHAIN_ID }, 'Wallet un-blacklisted')}>Remove</Btn>
        </div>
      </>)}
      {!info.pausable && !info.hasBlacklist && <Note>This token wasn't launched with pause or blacklist controls, so there's nothing to configure here.</Note>}
    </ToolShell>
  )
}

/* ── Multisig / wallet-security analysis (Security page) ─────────────────── */
export function MultisigPanel({ info }: PanelProps) {
  const { isContract, isLoading } = useIsContractWallet(info.creator)
  return (
    <ToolShell icon={isContract ? ShieldCheck : KeyRound} title="Creator wallet security" badge={isLoading ? undefined : isContract ? 'Multisig-capable' : isContract === false ? 'Single key' : 'Unknown'} tone={isContract ? '#22c55e' : '#f59e0b'}>
      <Row k="Recorded creator" v={<span className="font-mono text-[10px]">{info.creator.slice(0, 8)}…{info.creator.slice(-6)}</span>} />
      {isLoading ? (
        <Note>Checking whether this address is a wallet or a contract…</Note>
      ) : isContract ? (
        <Note>This address is a <b>contract</b>, not a plain wallet — consistent with a multisig like Safe. If it's a Safe with a threshold above 1, every creator-only action here (mint, pause, blacklist, edit details, unlock your allocation, claim payouts and LP) requires that many owners to approve before it executes, because the contracts only check that the final caller is this address.</Note>
      ) : isContract === false ? (
        <Note warn>This is a single-key wallet (EOA). Anyone with that one private key can mint, pause, blacklist or edit this token instantly — there's no approval threshold. GlowFun's contracts don't have multisig logic built in; they simply require <code>msg.sender == creator</code>.</Note>
      ) : (
        <Note>Couldn't determine the wallet type right now — try again shortly.</Note>
      )}
      <Note>
        <b>To get real multi-signature protection</b>, launch (or relaunch) the token from a Safe (Gnosis Safe) multisig address instead of a personal wallet, so <i>that</i> address becomes the recorded creator. Once it is, connecting any of the Safe's owner wallets here will route each action through the Safe for approval before anything executes.
      </Note>
      <Note warn>This can't be retrofitted after launch: a token's creator is set immutably when it's deployed, and the factory's own "transfer creator" bookkeeping doesn't change who the token contract itself checks — so an already-launched token stays tied to whichever wallet created it.</Note>
    </ToolShell>
  )
}

/* ── Metadata editor ─────────────────────────────────────────────────────── */
export function MetadataPanel({ token, info, refetch }: PanelProps) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { send, busy } = useTx(() => void refetch())
  const m = info.meta
  const [f, setF] = useState({ imageUri: m.imageUri, description: m.description, twitter: m.twitter, telegram: m.telegram, website: m.website })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }))
  const dirty = JSON.stringify(f) !== JSON.stringify(m)
  return (
    <ToolShell icon={PenLine} title="Edit token details" badge="Creator" tone="#818cf8">
      <ImageUpload value={f.imageUri} onChange={u => setF(p => ({ ...p, imageUri: u }))} label="Logo" />
      <textarea className={`${inputCls} resize-none`} style={{ ...inputSt, minHeight: 72 }} placeholder="Description" maxLength={500} value={f.description} onChange={set('description')} />
      <input className={inputCls} style={inputSt} placeholder="Twitter / X" value={f.twitter} onChange={set('twitter')} />
      <input className={inputCls} style={inputSt} placeholder="Telegram" value={f.telegram} onChange={set('telegram')} />
      <input className={inputCls} style={inputSt} placeholder="Website" value={f.website} onChange={set('website')} />
      <Btn busy={busy} disabled={!dirty || f.imageUri.startsWith('blob:')} onClick={() => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'updateTokenMetadata', args: [token, f.imageUri, f.description, f.twitter, f.telegram, f.website], chainId: CHAIN_ID }, 'Token details updated on-chain')}>Save on-chain</Btn>
      <Note>Saved on the token contract itself, so wallets and explorers pick it up. The banner is changed from the token page.</Note>
    </ToolShell>
  )
}

/* ── Referral program (per wallet, not per token) ────────────────────────── */
export function ReferralPanel({ wallet }: { wallet?: `0x${string}` }) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const cfg = useFactoryConfig()
  const { data, refetch } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'referralEarnings', args: [wallet ?? (ZERO as `0x${string}`)], chainId: CHAIN_ID as any, query: { enabled: !!wallet && !!FACTORY_ADDRESS, refetchInterval: 20_000 } })
  const { send, busy } = useTx(() => void refetch())
  const [copied, setCopied] = useState(false)
  const earned = Number((data as bigint) ?? 0n) / 1e6
  const link = wallet ? referralLink(wallet) : ''
  const effective = (Number(cfg.protocolFeeBps) * Number(cfg.referralFeeBps)) / 1e6   // % of each referred buy
  const copy = () => { navigator.clipboard.writeText(link).then(() => { setCopied(true); toast.success('Referral link copied'); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <ToolShell icon={Gift} title="Referral program" badge="Earn USDC" tone="#ec4899">
      {!wallet ? <Note>Connect your wallet to get your referral link.</Note> : (<>
        <Note>Share your link. When someone opens it and buys any token, you earn <b>{(Number(cfg.referralFeeBps) / 100).toFixed(0)}% of the platform fee</b> — about <b>{effective.toFixed(2)}%</b> of every buy they make. It's paid in USDC by the contract.</Note>
        <div className="flex gap-2">
          <input readOnly className={`${inputCls} font-mono text-[11px]`} style={inputSt} value={link} onFocus={e => e.currentTarget.select()} />
          <button onClick={copy} className="px-3 rounded-xl flex items-center" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)' }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
        </div>
        <Row k="Earned so far (claimable)" v={`$${earned.toLocaleString('en', { maximumFractionDigits: 4 })}`} />
        <Btn busy={busy} disabled={earned <= 0} onClick={() => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'claimReferral', chainId: CHAIN_ID }, `Claimed $${earned.toFixed(4)} USDC`)}>{earned > 0 ? `Claim $${earned.toFixed(4)} USDC` : 'Nothing to claim yet'}</Btn>
      </>)}
    </ToolShell>
  )
}

import { useEffect, useState } from 'react'
import { useReadContract } from 'wagmi'
import {
  ShieldCheck, KeyRound, ShieldAlert, Activity, Hourglass, ExternalLink,
} from 'lucide-react'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { useTx } from '@/hooks/useTx'
import { useIsContractWallet } from '@/hooks/useWalletKind'
import { useFactoryOwner, useFactoryPaused } from '@/hooks/useFactoryAdmin'
import { useSecurityActivity } from '@/hooks/useSecurityActivity'
import { ConfirmActionModal } from '@/components/tools/ConfirmActionModal'
import { ToolShell, Note, Btn, Row, fmtDate, fmtTokens, inputCls, inputSt, type PanelProps } from '@/components/tools/panels'

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s)
const short = (a?: unknown) => (typeof a === 'string' && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a ?? '—'))

/* ── shared: address-transfer form with retype-to-confirm + destination check ── */
function RoleTransferForm({
  tone, phrase, confirmLabel, title, warningExtra, onSend, busy, wallet,
}: {
  tone: string; phrase: string; confirmLabel: string; title: string; warningExtra: string
  onSend: (addr: `0x${string}`) => void; busy?: boolean; wallet?: `0x${string}`
}) {
  const [addr, setAddr] = useState('')
  const [confirmAddr, setConfirmAddr] = useState('')
  const [open, setOpen] = useState(false)
  const valid = isAddr(addr)
  const matches = valid && addr.toLowerCase() === confirmAddr.toLowerCase()
  const { isContract, isLoading } = useIsContractWallet(valid ? (addr as `0x${string}`) : undefined)
  return (
    <div className="space-y-2 pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
      <label className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Move this role to a new address</label>
      <input className={inputCls} style={inputSt} placeholder="New address — ideally a Safe multisig (0x…)" value={addr} onChange={(e) => setAddr(e.target.value.trim())} />
      <input className={inputCls} style={inputSt} placeholder="Retype the same address to confirm" value={confirmAddr} onChange={(e) => setConfirmAddr(e.target.value.trim())} />
      {valid && !isLoading && (isContract
        ? <Note>Destination is a <b>contract</b> — consistent with a Safe multisig.</Note>
        : <Note warn>Destination is a plain wallet (EOA) — a single key would still control this. Consider pointing this at a Safe instead.</Note>)}
      {addr && confirmAddr && !matches && <Note warn>Addresses don't match yet.</Note>}
      <Btn tone="danger" disabled={!matches} onClick={() => setOpen(true)}>{title}</Btn>
      <ConfirmActionModal
        open={open} onClose={() => setOpen(false)} onConfirm={() => { onSend(addr as `0x${string}`); setOpen(false) }}
        busy={busy} wallet={wallet} tone={tone} icon={KeyRound} title={title} phrase={phrase} confirmLabel={confirmLabel}
        summary={<>You're about to move this permanently to <b>{addr.slice(0, 6)}…{addr.slice(-4)}</b>.</>}
        warning={warningExtra}
      />
    </div>
  )
}

/* ── Factory ownership (platform-wide) ────────────────────────────────────── */
export function OwnershipPanel({ wallet }: { wallet?: `0x${string}` }) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { owner, isOwner, isLoading: ownerLoading, refetch } = useFactoryOwner(wallet)
  const { isContract, isLoading } = useIsContractWallet(owner !== ZERO ? owner : undefined)
  const { send, busy } = useTx(() => void refetch())
  return (
    <ToolShell icon={isContract ? ShieldCheck : KeyRound} title="Factory ownership"
      badge={ownerLoading ? undefined : isContract ? 'Multisig-capable' : isContract === false ? 'Single key' : undefined}
      tone={isContract ? '#22c55e' : '#f59e0b'}>
      <Row k="Factory owner" v={<span className="font-mono text-[10px]">{owner.slice(0, 8)}…{owner.slice(-6)}</span>} />
      <Note>This one address controls every platform-wide admin function on the whole factory: fees, thresholds, boost tiers, Uniswap pool config, emergency withdrawals, force-graduate, and the platform-wide pause below. It's OpenZeppelin's standard <code>Ownable</code>, so moving it is a single <code>transferOwnership</code> call — no redeploy needed.</Note>
      {isLoading ? <Note>Checking whether the owner is a wallet or a contract…</Note>
        : isContract ? <Note>Owner is a <b>contract</b> — consistent with a Safe. If it's a Safe with a threshold above 1, every function above already requires that many approvals.</Note>
        : isContract === false ? <Note warn>Owner is a single-key wallet (EOA). Whoever holds that one private key controls every function above, alone.</Note> : null}
      {isOwner ? (
        <RoleTransferForm tone="#ef4444" phrase="TRANSFER OWNERSHIP" confirmLabel="Transfer ownership" title="Transfer factory ownership"
          wallet={wallet} busy={busy}
          onSend={(addr) => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'transferOwnership', args: [addr], chainId: CHAIN_ID }, 'Factory ownership transferred')}
          warningExtra="This hands over every onlyOwner function on the whole platform, for every token, permanently. If the new address is wrong or you don't control its keys, platform admin is gone for good — there is no recovery function. Verify the address through a second channel first."
        />
      ) : wallet && <Note>Only the current owner ({owner.slice(0, 6)}…{owner.slice(-4)}) can transfer this role — connect that wallet to act.</Note>}
    </ToolShell>
  )
}

/* ── Per-token creator role(s) — replaces the old read-only MultisigPanel ─── */
export function CreatorRolePanel({ token, info, wallet, refetch }: PanelProps) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const tokenCreatorKind = useIsContractWallet(info.creator !== ZERO ? info.creator : undefined)
  const factoryCreatorKind = useIsContractWallet(info.factoryCreator !== ZERO ? info.factoryCreator : undefined)
  const { send, busy } = useTx(() => void refetch())
  const sameAddr = info.creator.toLowerCase() === info.factoryCreator.toLowerCase()
  const symbol = info.symbol || 'TOKEN'
  return (
    <ToolShell icon={tokenCreatorKind.isContract ? ShieldCheck : KeyRound} title="Creator role & wallet security"
      badge={tokenCreatorKind.isLoading ? undefined : tokenCreatorKind.isContract ? 'Multisig-capable' : tokenCreatorKind.isContract === false ? 'Single key' : undefined}
      tone={tokenCreatorKind.isContract ? '#22c55e' : '#f59e0b'}>
      <Row k="Token creator (immutable)" v={<span className="font-mono text-[10px]">{info.creator.slice(0, 8)}…{info.creator.slice(-6)}</span>} />
      <Note>Set once at deployment. Gates <b>mint, pause and blacklist</b> forever, for the life of the token — it can <b>never</b> be changed, not by the factory, not by the owner, not by anyone.</Note>
      {tokenCreatorKind.isLoading ? <Note>Checking wallet type…</Note>
        : tokenCreatorKind.isContract ? <Note>This is a <b>contract</b> — consistent with a Safe. Mint/pause/blacklist already inherit its approval rules.</Note>
        : tokenCreatorKind.isContract === false ? <Note warn>Single-key wallet. Whoever holds that key can mint, pause or blacklist instantly, with no second approval.</Note> : null}

      <div className="pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <Row k="Factory creator record (mutable)" v={<span className="font-mono text-[10px]">{info.factoryCreator.slice(0, 8)}…{info.factoryCreator.slice(-6)}</span>} />
        <Note>{sameAddr ? "The factory's own creator record currently matches the immutable one above." : "Different from the immutable creator above — it's already been redirected."} It gates <b>metadata edits, unlocking your allocation, force-graduating, and any unclaimed graduation bonus</b> — and unlike the immutable field, it <b>can be moved right now</b>, for this already-launched token, via <code>transferCreatorRole</code>.</Note>
        {factoryCreatorKind.isLoading ? null
          : factoryCreatorKind.isContract ? <Note>Factory-recorded creator is a contract — those actions are already Safe-gated.</Note>
          : factoryCreatorKind.isContract === false ? <Note warn>Factory-recorded creator is a single key too.</Note> : null}
      </div>

      {info.isFactoryCreator ? (
        <RoleTransferForm tone="#f59e0b" phrase={`TRANSFER ${symbol}`} confirmLabel="Transfer creator role" title={`Move ${symbol}'s creator role`}
          wallet={wallet} busy={busy}
          onSend={(addr) => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'transferCreatorRole', args: [token, addr], chainId: CHAIN_ID }, 'Creator role transferred')}
          warningExtra="Moves metadata/unlock/force-graduate rights, and any unclaimed graduation bonus, to the new address. Mint, pause and blacklist are unaffected — those stay with the original wallet forever."
        />
      ) : wallet && <Note>Only the factory-recorded creator ({info.factoryCreator.slice(0, 6)}…{info.factoryCreator.slice(-4)}) can transfer this role.</Note>}
    </ToolShell>
  )
}

/* ── Platform-wide circuit breaker (owner only) ───────────────────────────── */
export function PlatformCircuitBreakerPanel({ wallet }: { wallet?: `0x${string}` }) {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()
  const { isOwner } = useFactoryOwner(wallet)
  const { paused, isLoading, refetch } = useFactoryPaused()
  const { send, busy } = useTx(() => void refetch())
  const [open, setOpen] = useState(false)
  return (
    <ToolShell icon={ShieldAlert} title="Platform circuit breaker" badge={isLoading ? undefined : paused ? 'PAUSED' : 'Live'} tone={paused ? '#ef4444' : '#22c55e'}>
      <Note>A single owner-only switch that halts buys, sells and new launches across <b>every</b> token on this factory at once — the fastest way to stop an active exploit while you investigate, at the cost of freezing trading for everyone.</Note>
      {!isOwner ? <Note>Only the factory owner can flip this switch.</Note> : paused ? (
        <Btn onClick={() => send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'unpause', chainId: CHAIN_ID }, 'Platform resumed')} busy={busy}>Resume the platform</Btn>
      ) : (<>
        <Btn tone="danger" onClick={() => setOpen(true)}>Emergency-pause the platform</Btn>
        <ConfirmActionModal
          open={open} onClose={() => setOpen(false)} busy={busy} wallet={wallet}
          onConfirm={() => { send({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'pause', chainId: CHAIN_ID }, 'Platform paused'); setOpen(false) }}
          tone="#ef4444" icon={ShieldAlert} title="Pause the whole platform" phrase="PAUSE PLATFORM" confirmLabel="Pause platform"
          summary="Every token on this factory stops trading immediately, for everyone, until you unpause."
          warning="Use this only when something is actively being exploited — it stops all trading platform-wide, not just one token."
        />
      </>)}
    </ToolShell>
  )
}

/* ── Admin activity log — read straight from on-chain events ──────────────── */
const EVENT_META: Record<string, { label: string; tone: string; describe: (a: any) => string }> = {
  OwnershipTransferred:        { label: 'Ownership transferred',        tone: '#ef4444', describe: (a) => `${short(a.previousOwner)} → ${short(a.newOwner)}` },
  CreatorTransferred:          { label: 'Creator role transferred',     tone: '#f59e0b', describe: (a) => `${short(a.token)}: ${short(a.oldCreator)} → ${short(a.newCreator)}` },
  EmergencyWithdraw:           { label: 'Emergency withdrawal',         tone: '#ef4444', describe: (a) => `${fmtTokens(a.amount ?? 0n)} from ${short(a.token)} to ${short(a.to)}` },
  Paused:                      { label: 'Platform paused',              tone: '#ef4444', describe: (a) => `by ${short(a.account)}` },
  Unpaused:                    { label: 'Platform resumed',             tone: '#22c55e', describe: (a) => `by ${short(a.account)}` },
  TokenBlacklisted:            { label: 'Token blacklisted (platform)', tone: '#f59e0b', describe: (a) => `${short(a.token)} → ${a.blacklisted ? 'blocked' : 'cleared'}` },
  WalletBlacklisted:           { label: 'Wallet blacklisted (platform)',tone: '#f59e0b', describe: (a) => `${short(a.wallet)} → ${a.blacklisted ? 'blocked' : 'cleared'}` },
  FeeRecipientProposed:        { label: 'Fee recipient proposed',       tone: '#818cf8', describe: (a) => short(a.proposed) },
  FeeRecipientUpdated:         { label: 'Fee recipient updated',        tone: '#818cf8', describe: (a) => short(a.newRecipient) },
  GraduationRecipientProposed: { label: 'Graduation recipient proposed',tone: '#818cf8', describe: (a) => short(a.proposed) },
  GraduationRecipientUpdated:  { label: 'Graduation recipient updated', tone: '#818cf8', describe: (a) => short(a.newRecipient) },
}

export function ActivityLogPanel() {
  const { EXPLORER_BASE } = useConfig()
  const { events, loadMore, loading, exhausted, error, hasLoaded } = useSecurityActivity()
  useEffect(() => { if (!hasLoaded) void loadMore() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ToolShell icon={Activity} title="Admin activity log" badge={`${events.length} event${events.length === 1 ? '' : 's'}`} tone="#818cf8">
      <Note>Every ownership change, creator-role transfer, emergency withdrawal, platform blacklist action and pause/unpause on this factory — read straight from on-chain logs, not a database anyone could quietly edit. Bookmark this and check it any time something looks off.</Note>
      {events.length === 0 && !loading && <Note>No security-relevant admin actions found in the range scanned so far.</Note>}
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {events.map((e, i) => {
          const meta = EVENT_META[e.name]
          return (
            <div key={`${e.transactionHash}-${i}`} className="flex flex-wrap items-center gap-2 text-[11px] py-1.5 px-2 rounded-lg" style={{ background: 'var(--surface2)' }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta?.tone ?? '#818cf8' }} />
              <span className="font-semibold flex-shrink-0" style={{ color: 'var(--text1)' }}>{meta?.label ?? e.name}</span>
              <span className="truncate" style={{ color: 'var(--text2)' }}>{meta ? meta.describe(e.args) : ''}</span>
              <span className="ml-auto flex-shrink-0" style={{ color: 'var(--text3)' }}>{e.timestamp ? fmtDate(e.timestamp) : `block ${e.blockNumber}`}</span>
              <a href={`${EXPLORER_BASE}/tx/${e.transactionHash}`} target="_blank" rel="noopener" className="flex-shrink-0" style={{ color: 'var(--accent)' }}><ExternalLink size={11} /></a>
            </div>
          )
        })}
      </div>
      {error && <Note warn>{error}</Note>}
      {!exhausted && <Btn tone="ghost" busy={loading} onClick={() => void loadMore()}>{hasLoaded ? 'Load older activity' : 'Load activity'}</Btn>}
      {exhausted && events.length > 0 && <Note>Reached the earliest block scanned.</Note>}
    </ToolShell>
  )
}

/* ── Security checklist / score (per token) ───────────────────────────────── */
export function SecurityScorePanel({ info }: PanelProps) {
  const tokenCreatorKind = useIsContractWallet(info.creator !== ZERO ? info.creator : undefined)
  const factoryCreatorKind = useIsContractWallet(info.factoryCreator !== ZERO ? info.factoryCreator : undefined)
  const items = [
    { label: 'Mint / pause / blacklist key is a multisig', pass: tokenCreatorKind.isContract === true, unknown: tokenCreatorKind.isContract === null || tokenCreatorKind.isLoading },
    { label: 'Factory creator role is a multisig', pass: factoryCreatorKind.isContract === true, unknown: factoryCreatorKind.isContract === null || factoryCreatorKind.isLoading },
    { label: 'Creator allocation still time-locked (visible commitment)', pass: info.creatorLocked, unknown: false },
    { label: 'Supply is capped (maxSupply set)', pass: info.maxSupply > 0n, unknown: false },
  ]
  const known = items.filter((i) => !i.unknown)
  const score = known.length ? Math.round((known.filter((i) => i.pass).length / known.length) * 100) : 0
  return (
    <ToolShell icon={ShieldCheck} title="Security checklist" badge={`${score}/100`} tone={score >= 75 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px] py-1">
          <span style={{ color: it.unknown ? 'var(--text3)' : it.pass ? '#22c55e' : '#ef4444' }}>{it.unknown ? '•' : it.pass ? '✓' : '✗'}</span>
          <span style={{ color: 'var(--text2)' }}>{it.label}</span>
        </div>
      ))}
      <Note>A transparency signal for holders, not a guarantee — it only reflects what's checkable on-chain right now, and a passing score can still be undone by a later admin action.</Note>
    </ToolShell>
  )
}

/* ── Timelock detection + guidance ─────────────────────────────────────────── */
const TIMELOCK_PROBE_ABI = [
  { name: 'getMinDelay', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export function TimelockPanel({ wallet }: { wallet?: `0x${string}` }) {
  const { CHAIN_ID } = useConfig()
  const { owner } = useFactoryOwner(wallet)
  const { data: minDelay, isError, isLoading } = useReadContract({
    address: owner, abi: TIMELOCK_PROBE_ABI, functionName: 'getMinDelay', chainId: CHAIN_ID as any,
    query: { enabled: owner !== ZERO },
  })
  const looksLikeTimelock = !isLoading && !isError && minDelay !== undefined
  return (
    <ToolShell icon={Hourglass} title="Timelock (delay on admin actions)" badge={looksLikeTimelock ? 'Detected' : undefined} tone="#0ea5e9">
      <Note>A multisig stops a single stolen key from acting alone. A <b>timelock</b> adds the other half: even a fully-approved admin action (a mint, a blacklist, a fee change) has to sit publicly for a fixed delay — 24-48h, say — before it executes. That window is what lets you or your community catch and react to something malicious before it lands, instead of after the fact.</Note>
      {looksLikeTimelock ? (
        <Note>The current factory owner responds like a <code>TimelockController</code> (it answers <code>getMinDelay()</code>) — minimum delay looks like <b>{(Number(minDelay) / 3600).toFixed(1)}h</b>. Confirm the exact contract on the explorer before relying on this.</Note>
      ) : (
        <Note warn>The current owner doesn't respond like a timelock. OpenZeppelin's <code>TimelockController</code> is already vendored in this repo's contracts (no new dependency needed) — deploy one with your Safe as proposer/executor, then transfer factory ownership to it from the panel above. See <code>docs/SECURITY.md</code> and <code>contracts/script/DeployTimelock.s.sol</code> for the exact steps.</Note>
      )}
    </ToolShell>
  )
}

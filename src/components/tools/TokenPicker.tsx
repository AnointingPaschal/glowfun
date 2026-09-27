import { useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { Search } from 'lucide-react'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { useConfig } from '@/context/ConfigContext'
import { useTokenList } from '@/hooks/useTokenList'

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s)

/**
 * Reused on every per-token tool page: pick one of your own tokens, any launched
 * token, or paste an address. Reports the chosen address via onChoose so each
 * page can put it in its own ?token= query param.
 */
export function TokenPicker({ selected, wallet, onChoose }: { selected?: string; wallet?: `0x${string}`; onChoose: (a: string) => void }) {
  const { CHAIN_ID } = useConfig()
  const [paste, setPaste] = useState('')
  const { addresses } = useTokenList()

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

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>{mine.length ? 'Your tokens' : 'Choose a token'}</div>
      <div className="flex flex-wrap gap-2">
        {(mine.length ? mine : rows.slice(0, 12)).map(r => (
          <button key={r.address} onClick={() => onChoose(r.address)} className="px-3 py-1.5 rounded-xl text-xs font-bold"
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
        <button disabled={!isAddr(paste)} onClick={() => onChoose(paste)} className="px-4 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Open</button>
      </div>
    </div>
  )
}

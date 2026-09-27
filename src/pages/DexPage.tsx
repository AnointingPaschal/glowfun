import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Flame, Sprout, Trophy, Search, X, RefreshCw,
  TrendingUp, TrendingDown, Activity, Droplets, Zap, Filter,
} from 'lucide-react'
import { useArcMarket, type ArcMarketTab, type ArcMarketToken } from '@/hooks/useArcMarket'
import { useTokenList } from '@/hooks/useTokenList'
import { timeAgo } from '@/utils/format'

/* ── Formatting ─────────────────────────────────────────────────────── */
function fmtUsd(n: number, digits = 2): string {
  if (!n) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(digits)}`
}
function fmtPrice(n: number): string {
  if (!n) return '$0'
  if (n >= 1) return `$${n.toLocaleString('en', { maximumFractionDigits: 4 })}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  if (n >= 0.0001) return `$${n.toFixed(6)}`
  const s = n.toFixed(18)
  const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return `$0.0${sub(m[1].length)}${m[2]}`
  return `$${n.toExponential(2)}`
}
const SUB: Record<string, string> = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' }
const sub = (n: number) => String(n).split('').map(d => SUB[d]).join('')
function fmtAge(sec: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec/60)}m`
  if (sec < 86400) return `${Math.floor(sec/3600)}h`
  return `${Math.floor(sec/86400)}d`
}

/* ── Small building blocks ──────────────────────────────────────────── */
function ChangePill({ v }: { v?: number }) {
  if (v === undefined || v === null || Number.isNaN(v)) return <span className="text-[11px]" style={{ color: 'var(--text3)' }}>—</span>
  const pos = v >= 0
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>
      {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}{Math.abs(v).toFixed(1)}%
    </span>
  )
}

function TokenLogo({ url, symbol, address, size = 32 }: { url: string; symbol: string; address: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const hue = parseInt(address.slice(2, 6), 16) % 360
  if (!url || broken) {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.32, background: `linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))` }}>
        {symbol?.slice(0, 2).toUpperCase() || '??'}
      </div>
    )
  }
  return <img src={url} alt={symbol} width={size} height={size} className="rounded-full object-cover flex-shrink-0"
    style={{ border: '1px solid var(--border2)' }} onError={() => setBroken(true)} />
}

/* ── Featured banner strip ─────────────────────────────────────────────
 * GlowFun tokens open their internal trading page; every other Arc token
 * opens its own live trade page here too — nothing ever navigates off
 * this site. */
function BannerStrip({ tokens, glowSet }: { tokens: ArcMarketToken[]; glowSet: Set<string> }) {
  const featured = useMemo(() => tokens.filter(t => t.bannerUrl).slice(0, 8), [tokens])
  if (!featured.length) return null
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
      {featured.map(t => {
        const isGlow = glowSet.has(t.address.toLowerCase())
        const card = (
          <div className="relative flex-shrink-0 w-64 h-28 rounded-2xl overflow-hidden group"
            style={{ border: '1px solid var(--border)' }}>
            <img src={t.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,transparent 30%,rgba(0,0,0,0.85))' }} />
            <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center gap-2">
              <TokenLogo url={t.logoUrl} symbol={t.symbol} address={t.address} size={26} />
              <div className="min-w-0">
                <div className="text-xs font-black text-white truncate">{t.symbol}</div>
                <div className="text-[10px] text-white/70 truncate">{fmtPrice(t.priceUsd)}</div>
              </div>
              <ChangePill v={t.change24h} />
            </div>
          </div>
        )
        return <Link key={t.address} to={isGlow ? `/token/${t.address}` : `/dex/${t.address}`} className="no-underline">{card}</Link>
      })}
    </div>
  )
}

/* ── Desktop table row ───────────────────────────────────────────────── */
function Row({ t, rank, isGlow }: { t: ArcMarketToken; rank: number; isGlow: boolean }) {
  const inner = (
    <>
      <td className="py-2.5 pl-3 text-[11px] font-bold" style={{ color: 'var(--text3)' }}>{rank}</td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TokenLogo url={t.logoUrl} symbol={t.symbol} address={t.address} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold truncate" style={{ color: 'var(--text1)' }}>{t.symbol}</span>
              {isGlow && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}>GLOWFUN</span>}
            </div>
            <div className="text-[10px] truncate" style={{ color: 'var(--text2)', maxWidth: 160 }}>{t.name || 'Unknown'}</div>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2 text-right text-[12px] font-bold whitespace-nowrap" style={{ color: 'var(--text1)' }}>{fmtPrice(t.priceUsd)}</td>
      <td className="py-2.5 px-2 text-right"><ChangePill v={t.change5m} /></td>
      <td className="py-2.5 px-2 text-right"><ChangePill v={t.change1h} /></td>
      <td className="py-2.5 px-2 text-right"><ChangePill v={t.change6h} /></td>
      <td className="py-2.5 px-2 text-right"><ChangePill v={t.change24h} /></td>
      <td className="py-2.5 px-2 text-right text-[12px] whitespace-nowrap" style={{ color: 'var(--text1)' }}>{fmtUsd(t.volUsd)}</td>
      <td className="py-2.5 px-2 text-right text-[12px] whitespace-nowrap" style={{ color: 'var(--text1)' }}>{fmtUsd(t.liqUsd)}</td>
      <td className="py-2.5 px-2 text-right text-[12px] whitespace-nowrap" style={{ color: 'var(--text1)' }}>{fmtUsd(t.mcapUsd)}</td>
      <td className="py-2.5 px-2 text-right text-[11px]" style={{ color: 'var(--text2)' }}>{fmtAge(t.ageSec)}</td>
      <td className="py-2.5 pr-3 text-right">
        <span className="text-[9px] font-bold" style={{ color: isGlow ? '#818cf8' : 'var(--green)' }}>Trade →</span>
      </td>
    </>
  )
  const rowStyle = { borderColor: 'var(--border)' }
  return (
    <Link to={isGlow ? `/token/${t.address}` : `/dex/${t.address}`} className="table-row no-underline border-b transition-colors hover:bg-white/[0.03] cursor-pointer" style={rowStyle as any}>
      {inner}
    </Link>
  )
}

/* ── Mobile card ─────────────────────────────────────────────────────── */
function MobileCard({ t, isGlow }: { t: ArcMarketToken; isGlow: boolean }) {
  const body = (
    <div className="flex items-center gap-2.5 p-3 rounded-xl no-underline" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <TokenLogo url={t.logoUrl} symbol={t.symbol} address={t.address} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold truncate" style={{ color: 'var(--text1)' }}>{t.symbol}</span>
          {isGlow && <span className="text-[7px] font-black px-1 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(99,102,241,0.14)', color: '#818cf8' }}>GLOWFUN</span>}
        </div>
        <div className="text-[10px] truncate" style={{ color: 'var(--text2)' }}>{fmtUsd(t.volUsd)} vol · {fmtUsd(t.liqUsd)} liq</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[12px] font-bold" style={{ color: 'var(--text1)' }}>{fmtPrice(t.priceUsd)}</div>
        <ChangePill v={t.change24h} />
      </div>
    </div>
  )
  return <Link to={isGlow ? `/token/${t.address}` : `/dex/${t.address}`} className="no-underline block">{body}</Link>
}

/* ── Main ─────────────────────────────────────────────────────────────── */
const TABS: { id: ArcMarketTab; label: string; icon: any; color: string }[] = [
  { id: 'trending', label: 'Trending', icon: Flame,   color: '#ef4444' },
  { id: 'new',      label: 'New',      icon: Sprout,  color: '#22c55e' },
  { id: 'top',      label: 'Top',      icon: Trophy,  color: 'var(--gold)' },
]

export function DexPage() {
  const [tab, setTab] = useState<ArcMarketTab>('trending')
  const [search, setSearch] = useState('')
  const [glowOnly, setGlowOnly] = useState(false)
  const { tokens, stats, total, loading, error, lastFetched, refresh } = useArcMarket(tab, search)
  const { addresses: glowAddrs } = useTokenList()
  const glowSet = useMemo(() => new Set(glowAddrs.map(a => a.toLowerCase())), [glowAddrs])

  const displayed = useMemo(() => {
    const list = glowOnly ? tokens.filter(t => glowSet.has(t.address.toLowerCase())) : tokens
    // Keep the backend's real ranking (volume/mcap/age) as the primary order —
    // only break ties (mostly a pile of 0-volume tokens) by preferring the
    // ones with a real logo, so the page doesn't open on a wall of monograms.
    const metric = (t: ArcMarketToken) => tab === 'top' ? t.mcapUsd : tab === 'new' ? -(t.ageSec || 0) : (t.vol5m || t.volUsd || 0)
    return [...list].sort((a, b) => {
      const diff = metric(b) - metric(a)
      if (diff !== 0) return diff
      return (b.logoUrl ? 1 : 0) - (a.logoUrl ? 1 : 0)
    })
  }, [tokens, glowOnly, glowSet, tab])

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(180deg,#22c55e,#16a34a)' }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#22c55e' }}>Arc Mainnet · Live</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black" style={{ letterSpacing: '-0.03em', color: 'var(--text1)' }}>Arc DEX</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Every token trading on Arc, live — every GlowFun launch plus everything else on the network.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--text3)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--green)' }} />
            {lastFetched ? `Updated ${timeAgo(Math.floor(lastFetched / 1000))}` : 'Loading…'}
          </span>
          <button onClick={refresh} className="p-2 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text2)' }} />
          </button>
        </div>
      </div>

      {/* ── Global stats ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Tokens tracked', value: total.toLocaleString(), icon: Activity, color: '#818cf8' },
          { label: '5m volume',      value: fmtUsd(stats.vol5m),    icon: Zap,      color: 'var(--green)' },
          { label: '5m txns',        value: stats.txns.toLocaleString(), icon: Droplets, color: 'var(--gold)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-2.5 p-3 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
              <Icon size={14} style={{ color }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-widest truncate" style={{ color: 'var(--text2)' }}>{label}</div>
              <div className="text-sm font-black" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Featured banners ───────────────────────────────────────── */}
      <BannerStrip tokens={tokens} glowSet={glowSet} />

      {/* ── Controls ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(({ id, label, icon: Icon, color }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: active ? `${color}16` : 'var(--surface)', color: active ? color : 'var(--text2)', border: `1.5px solid ${active ? `${color}35` : 'var(--border)'}` }}>
              <Icon size={11} />{label}
            </button>
          )
        })}
        <button onClick={() => setGlowOnly(v => !v)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: glowOnly ? 'rgba(99,102,241,0.14)' : 'var(--surface)', color: glowOnly ? '#818cf8' : 'var(--text2)', border: `1.5px solid ${glowOnly ? 'rgba(99,102,241,0.3)' : 'var(--border)'}` }}>
          <Filter size={11} />GlowFun only
        </button>
        <div className="flex-1 min-w-[140px] flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Search size={11} style={{ color: 'var(--text2)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, symbol or address…"
            className="text-xs bg-transparent outline-none w-full" style={{ color: 'var(--text1)' }} />
          {search && <button onClick={() => setSearch('')}><X size={11} style={{ color: 'var(--text2)' }} /></button>}
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: 'var(--red)' }}>
          Couldn't refresh market data ({error}) — showing the last known data.
        </div>
      )}

      {/* ── Table (desktop) ────────────────────────────────────────── */}
      <div className="hidden lg:block rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading && !displayed.length ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 rounded-xl shimmer" />)}</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <Search size={22} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>No tokens match{search ? ` "${search}"` : ''}.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                <th className="py-2.5 pl-3 text-left">#</th>
                <th className="py-2.5 text-left">Token</th>
                <th className="py-2.5 px-2 text-right">Price</th>
                <th className="py-2.5 px-2 text-right">5m</th>
                <th className="py-2.5 px-2 text-right">1h</th>
                <th className="py-2.5 px-2 text-right">6h</th>
                <th className="py-2.5 px-2 text-right">24h</th>
                <th className="py-2.5 px-2 text-right">Volume</th>
                <th className="py-2.5 px-2 text-right">Liquidity</th>
                <th className="py-2.5 px-2 text-right">MCap</th>
                <th className="py-2.5 px-2 text-right">Age</th>
                <th className="py-2.5 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t, i) => <Row key={t.address} t={t} rank={i + 1} isGlow={glowSet.has(t.address.toLowerCase())} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Cards (mobile) ─────────────────────────────────────────── */}
      <div className="lg:hidden space-y-2">
        {loading && !displayed.length ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)
        ) : displayed.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text2)' }}>No tokens match{search ? ` "${search}"` : ''}.</p>
          </div>
        ) : (
          displayed.map(t => <MobileCard key={t.address} t={t} isGlow={glowSet.has(t.address.toLowerCase())} />)
        )}
      </div>

      <p className="text-[10px] text-center px-4" style={{ color: 'var(--text3)' }}>
        Live prices and liquidity read directly from Arc network pools. Every token here opens its own trading page — buy and sell right on GlowFun.
      </p>
    </div>
  )
}

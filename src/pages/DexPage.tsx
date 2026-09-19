import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useReadContracts } from 'wagmi'
import { Search, X, RefreshCw, ExternalLink, Twitter, Send as TgIcon, Globe, Zap, ArrowUpRight, ArrowDownRight, Copy, Check, ChevronRight } from 'lucide-react'
import { CandlestickChart, generateSyntheticOHLCV, OHLCV } from '@/components/CandlestickChart'
import { useTokenList } from '@/hooks/useTokenList'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { useConfig } from '@/context/ConfigContext'
import { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'
import { formatPriceNumber, formatAddress, timeAgo } from '@/utils/format'
import type { TokenInfo } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Pair {
  id: string
  source: 'glowfun' | 'market'
  address: string        // token/pair address
  name: string
  symbol: string
  imageUrl: string
  priceUsd: number
  change5m?: number
  change1h?: number
  change6h?: number
  change24h?: number
  liquidityUsd?: number
  volumeUsd?: number
  mcapUsd?: number
  age?: number           // seconds since creation
  buys24h?: number
  sells24h?: number
  pairAddress?: string   // for DEX pairs
  glowToken?: TokenInfo  // if this is a GlowFun token
  ohlcv?: OHLCV[]
}

// ── Market data fetch ──────────────────────────────────────────────────────

async function fetchMarketPairs(): Promise<Pair[]> {
  const results: Pair[] = []

  // Fetch from GeckoTerminal (Arc network)
  try {
    const r = await fetch(
      'https://api.geckoterminal.com/api/v2/networks/arc/pools?page=1&sort=h24_volume_usd_liquidity_desc',
      { signal: AbortSignal.timeout(8000) }
    )
    if (r.ok) {
      const d = await r.json()
      const pools = d.data ?? []
      for (const pool of pools) {
        const attr = pool.attributes ?? {}
        const baseToken = attr.base_token_price_usd !== undefined
        const symbol = attr.name?.split(' / ')?.[0] ?? attr.name ?? '?'
        results.push({
          id: `gt-${pool.id}`,
          source: 'market',
          address: attr.address ?? pool.id,
          pairAddress: attr.address,
          name: attr.name ?? symbol,
          symbol,
          imageUrl: '',
          priceUsd: parseFloat(attr.base_token_price_usd ?? '0') || 0,
          change5m: attr.price_change_percentage?.m5 !== undefined ? parseFloat(attr.price_change_percentage.m5) : undefined,
          change1h: attr.price_change_percentage?.h1 !== undefined ? parseFloat(attr.price_change_percentage.h1) : undefined,
          change24h: attr.price_change_percentage?.h24 !== undefined ? parseFloat(attr.price_change_percentage.h24) : undefined,
          liquidityUsd: parseFloat(attr.reserve_in_usd ?? '0') || undefined,
          volumeUsd: parseFloat(attr.volume_usd?.h24 ?? '0') || undefined,
          mcapUsd: parseFloat(attr.fdv_usd ?? '0') || undefined,
          age: attr.pool_created_at ? Math.floor((Date.now() - new Date(attr.pool_created_at).getTime()) / 1000) : undefined,
          buys24h: attr.transactions?.h24?.buys,
          sells24h: attr.transactions?.h24?.sells,
        })
      }
    }
  } catch { /* silent */ }

  return results
}

async function fetchGeckoOHLCV(poolAddress: string): Promise<OHLCV[] | null> {
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/arc/pools/${poolAddress}/ohlcv/hour?limit=168`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!r.ok) return null
    const d = await r.json()
    const raw: number[][] = d.data?.attributes?.ohlcv_list ?? []
    return raw.reverse().map(([t, o, h, l, c, v]) => ({
      time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: v,
    }))
  } catch { return null }
}

// ── GlowFun on-chain batch loader ─────────────────────────────────────────

function useGlowTokens(addresses: `0x${string}`[]) {
  const { FACTORY_ADDRESS: FA, CHAIN_ID: CID } = useConfig()
  const n = addresses.length

  const { data: meta } = useReadContracts({
    contracts: addresses.flatMap(a => [
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'name', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'symbol', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'imageUri', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'creator', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'createdAt', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'description', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'twitter', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'telegram', chainId: CID as any },
      { address: a, abi: GLOW_TOKEN_ABI, functionName: 'website', chainId: CID as any },
    ]),
    query: { enabled: n > 0, staleTime: 60_000 },
  })

  const { data: states } = useReadContracts({
    contracts: addresses.flatMap(a => [
      { address: FA, abi: FACTORY_ABI, functionName: 'getTokenState', args: [a], chainId: CID as any },
      { address: FA, abi: FACTORY_ABI, functionName: 'getTokenPrice', args: [a], chainId: CID as any },
      { address: FA, abi: FACTORY_ABI, functionName: 'getMarketCap', args: [a], chainId: CID as any },
      { address: FA, abi: FACTORY_ABI, functionName: 'getProgress', args: [a], chainId: CID as any },
    ]),
    query: { enabled: n > 0 && !!FA, staleTime: 30_000 },
  })

  const pairs: Pair[] = []
  for (let i = 0; i < addresses.length; i++) {
    const m = meta?.slice(i * 9, i * 9 + 9) ?? []
    const statesArr = (states as unknown as any[]) ?? []
    const s = statesArr.slice(i * 4, i * 4 + 4)
    if (m[0]?.status !== 'success') continue
    const st = s[0]?.result as any
    const priceRaw = s[1]?.result as unknown as bigint ?? 0n
    const mcapRaw = s[2]?.result as unknown as bigint ?? 0n
    const priceUsd = Number(priceRaw) / 1e42
    const mcapUsd = Number(mcapRaw) / 1e6
    const createdAt = Number(m[4]?.result ?? 0)
    const token: TokenInfo = {
      address: addresses[i],
      name: m[0]?.result as string ?? '',
      symbol: m[1]?.result as string ?? '',
      description: m[5]?.result as string ?? '',
      imageUri: m[2]?.result as string ?? '',
      twitter: m[6]?.result as string ?? '',
      telegram: m[7]?.result as string ?? '',
      website: m[8]?.result as string ?? '',
      creator: m[3]?.result as `0x${string}` ?? '0x0',
      createdAt,
      state: st ? {
        creator: st.creator, virtualUsdcReserves: st.virtualUsdcReserves,
        virtualTokenReserves: st.virtualTokenReserves, realUsdcRaised: st.realUsdcRaised,
        realTokensSold: st.realTokensSold, graduated: st.graduated, createdAt: st.createdAt,
      } : { creator: '0x' as `0x${string}`, virtualUsdcReserves: 0n, virtualTokenReserves: 0n, realUsdcRaised: 0n, realTokensSold: 0n, graduated: false, createdAt: 0n },
      price: priceRaw,
      marketCap: mcapRaw,
      progress: s[3]?.result as unknown as bigint ?? 0n,
    }
    pairs.push({
      id: `gf-${addresses[i]}`,
      source: 'glowfun',
      address: addresses[i],
      name: token.name,
      symbol: token.symbol,
      imageUrl: token.imageUri,
      priceUsd,
      mcapUsd,
      volumeUsd: Number(st?.realUsdcRaised ?? 0n) / 1e6,
      age: createdAt ? Math.floor(Date.now() / 1000) - createdAt : undefined,
      glowToken: token,
    })
  }
  return pairs
}

// ── Format helpers ─────────────────────────────────────────────────────────

function fmtUsd(n?: number): string {
  if (!n || n === 0) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtAge(s?: number): string {
  if (!s) return ''
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function fmtPct(n?: number): string {
  if (n === undefined || n === null) return ''
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

// ── Pair row ───────────────────────────────────────────────────────────────

function PairRow({ pair, rank, onClick }: { pair: Pair; rank: number; onClick: () => void }) {
  const hue = parseInt(pair.address.slice(2, 6), 16) % 360
  const grad = `linear-gradient(135deg, hsl(${hue},65%,50%), hsl(${(hue+120)%360},60%,40%))`
  const c24 = pair.change24h
  const c5m = pair.change5m

  return (
    <div
      onClick={onClick}
      className="px-3 py-2.5 border-b cursor-pointer active:bg-white/5 transition-colors"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}
    >
      {/* Row 1: logo + symbol + price + 5m + 24h */}
      <div className="flex items-center gap-2">
        {/* Rank */}
        <span className="text-[9px] w-5 text-right flex-shrink-0 tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>#{rank}</span>

        {/* Logo */}
        <div className="relative flex-shrink-0">
          {pair.imageUrl ? (
            <img src={pair.imageUrl} alt={pair.symbol} className="w-8 h-8 rounded-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} />
          ) : null}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${pair.imageUrl ? 'hidden' : ''}`} style={{ background: grad }}>
            {pair.symbol.slice(0, 1)}
          </div>
          {/* Source badge */}
          {pair.source === 'glowfun' && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
              <Zap size={7} color="white" />
            </div>
          )}
        </div>

        {/* Name + full name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white truncate">{pair.symbol}</span>
            {pair.age !== undefined && pair.age < 86400 && (
              <span className="text-[8px] px-1 py-px rounded font-medium flex-shrink-0" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                ↑{fmtAge(pair.age)}
              </span>
            )}
          </div>
          <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{pair.name}</div>
        </div>

        {/* Price + changes */}
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-white tabular-nums">${formatPriceNumber(pair.priceUsd)}</div>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            {c5m !== undefined && (
              <span className="text-[9px] font-medium tabular-nums" style={{ color: c5m >= 0 ? '#34d399' : '#f87171' }}>
                5M {fmtPct(c5m)}
              </span>
            )}
            {c24 !== undefined && (
              <span className="text-[9px] font-bold tabular-nums" style={{ color: c24 >= 0 ? '#34d399' : '#f87171' }}>
                24H {fmtPct(c24)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: LIQ / VOL / MCAP pills */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-[52px]">
        {pair.liquidityUsd !== undefined && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
            LIQ {fmtUsd(pair.liquidityUsd)}
          </span>
        )}
        {pair.volumeUsd !== undefined && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
            VOL {fmtUsd(pair.volumeUsd)}
          </span>
        )}
        {pair.mcapUsd !== undefined && pair.mcapUsd > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
            MCAP {fmtUsd(pair.mcapUsd)}
          </span>
        )}
        {pair.source === 'glowfun' && pair.glowToken && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium ml-auto" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
            {pair.glowToken.state.graduated ? '🎓 Grad' : 'Bonding'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Pair detail modal ──────────────────────────────────────────────────────

function PairDetail({ pair, onClose }: { pair: Pair; onClose: () => void }) {
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'chart' | 'info'>('chart')
  const { EXPLORER_BASE: EXPL } = useConfig()

  const hue = parseInt(pair.address.slice(2, 6), 16) % 360
  const grad = `linear-gradient(135deg, hsl(${hue},65%,50%), hsl(${(hue+120)%360},60%,40%))`

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let data: OHLCV[] | null = null
      if (pair.pairAddress) data = await fetchGeckoOHLCV(pair.pairAddress)
      if (!data || !data.length) {
        const t = pair.glowToken
        data = generateSyntheticOHLCV(
          pair.priceUsd,
          t?.state?.realUsdcRaised ?? 0n,
          BigInt(t?.createdAt ?? Math.floor(Date.now() / 1000) - 3600),
        )
      }
      if (!cancelled) { setOhlcv(data); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [pair.id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const copy = (s: string) => { navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const c24 = pair.change24h
  const explorerBase = EXPL || EXPLORER_BASE

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl"
          style={{ background: 'rgba(10,10,20,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
            style={{ background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              {pair.imageUrl
                ? <img src={pair.imageUrl} alt={pair.symbol} className="w-9 h-9 rounded-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: grad }}>{pair.symbol.slice(0,1)}</div>
              }
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-white">{pair.symbol}</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{pair.name}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatAddress(pair.address)}</span>
                  <button onClick={() => copy(pair.address)}>{copied ? <Check size={9} style={{ color: '#34d399' }} /> : <Copy size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />}</button>
                  <a href={`${explorerBase}/address/${pair.address}`} target="_blank" rel="noopener"><ExternalLink size={9} style={{ color: 'rgba(255,255,255,0.3)' }} /></a>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {pair.source === 'glowfun' && (
                <Link to={`/token/${pair.address}`} onClick={onClose}
                  className="flex items-center gap-1 text-[9px] px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <Zap size={9} />Trade
                </Link>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Price hero */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-bold text-white tabular-nums">${formatPriceNumber(pair.priceUsd)}</div>
                {c24 !== undefined && (
                  <div className="flex items-center gap-1 mt-0.5 text-xs font-medium" style={{ color: c24 >= 0 ? '#34d399' : '#f87171' }}>
                    {c24 >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(c24).toFixed(2)}% (24h)
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { k: 'Liquidity', v: fmtUsd(pair.liquidityUsd) },
                  { k: 'Volume', v: fmtUsd(pair.volumeUsd) },
                  { k: 'Mkt Cap', v: fmtUsd(pair.mcapUsd) },
                ].map(s => (
                  <div key={s.k} className="px-2 py-1 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[7px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.k}</div>
                    <div className="text-[10px] font-bold text-white">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5m / 1h / 6h / 24h change row */}
            {(pair.change5m !== undefined || pair.change1h !== undefined || pair.change6h !== undefined || pair.change24h !== undefined) && (
              <div className="flex gap-2 mt-2">
                {[
                  { label: '5M', val: pair.change5m },
                  { label: '1H', val: pair.change1h },
                  { label: '6H', val: pair.change6h },
                  { label: '24H', val: pair.change24h },
                ].filter(x => x.val !== undefined).map(({ label, val }) => (
                  <div key={label} className="flex-1 px-1.5 py-1 rounded text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-[7px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</div>
                    <div className="text-[10px] font-bold tabular-nums" style={{ color: val! >= 0 ? '#34d399' : '#f87171' }}>{fmtPct(val)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex px-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {[{ id: 'chart', label: 'Chart' }, { id: 'info', label: 'Info' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className="px-4 py-2 text-[11px] font-medium transition-all"
                style={{ borderBottom: tab === t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: tab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.35)', marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-3">
            {tab === 'chart' && (
              <CandlestickChart data={ohlcv} height={240} loading={loading} symbol={pair.symbol} />
            )}

            {tab === 'info' && (
              <div className="space-y-3">
                {pair.glowToken?.description && (
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{pair.glowToken.description}</p>
                )}
                <div className="space-y-1.5">
                  {[
                    { k: 'Contract', v: pair.address, isAddr: true },
                    pair.glowToken?.creator ? { k: 'Creator', v: pair.glowToken.creator, isAddr: true } : null,
                    pair.glowToken?.createdAt ? { k: 'Launched', v: new Date(pair.glowToken.createdAt * 1000).toLocaleString() } : null,
                    pair.age ? { k: 'Age', v: fmtAge(pair.age) } : null,
                    pair.buys24h !== undefined ? { k: 'Buys 24h', v: String(pair.buys24h) } : null,
                    pair.sells24h !== undefined ? { k: 'Sells 24h', v: String(pair.sells24h) } : null,
                  ].filter(Boolean).map((row: any) => (
                    <div key={row.k} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{row.k}</span>
                      {row.isAddr ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono text-white">{formatAddress(row.v)}</span>
                          <button onClick={() => copy(row.v)}><Copy size={8} style={{ color: 'rgba(255,255,255,0.3)' }} /></button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-white">{row.v}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Social links */}
                {pair.glowToken && (pair.glowToken.twitter || pair.glowToken.telegram || pair.glowToken.website) && (
                  <div className="flex gap-1.5 flex-wrap pt-1">
                    {pair.glowToken.twitter && <a href={pair.glowToken.twitter} target="_blank" rel="noopener" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px]" style={{ background: 'rgba(29,161,242,0.1)', color: '#1da1f2', border: '1px solid rgba(29,161,242,0.15)' }}><Twitter size={10} />Twitter</a>}
                    {pair.glowToken.telegram && <a href={pair.glowToken.telegram} target="_blank" rel="noopener" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px]" style={{ background: 'rgba(0,136,204,0.1)', color: '#0088cc', border: '1px solid rgba(0,136,204,0.15)' }}><TgIcon size={10} />Telegram</a>}
                    {pair.glowToken.website && <a href={pair.glowToken.website} target="_blank" rel="noopener" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}><Globe size={10} />Website</a>}
                  </div>
                )}

                {/* Explorer link */}
                <a href={`${explorerBase}/address/${pair.address}`} target="_blank" rel="noopener"
                  className="flex items-center gap-1.5 w-full px-3 py-2.5 rounded-xl text-xs font-semibold justify-center mt-1"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <ExternalLink size={11} />View on Arc Explorer
                </a>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function TrendingPage() {
  const { addresses } = useTokenList()
  const glowPairs = useGlowTokens(addresses)

  const [marketPairs, setMarketPairs] = useState<Pair[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Pair | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetch, setLastFetch] = useState(0)

  const fetchMarket = useCallback(async () => {
    setRefreshing(true)
    const pairs = await fetchMarketPairs()
    setMarketPairs(pairs)
    setLastFetch(Date.now())
    setRefreshing(false)
  }, [])

  // Initial load + auto-refresh every 60s
  useEffect(() => {
    fetchMarket()
    const t = setInterval(fetchMarket, 60_000)
    return () => clearInterval(t)
  }, [fetchMarket])

  // Merge: GlowFun + market, deduplicate by address
  const merged: Pair[] = [...glowPairs]
  const glowAddrs = new Set(glowPairs.map(p => p.address.toLowerCase()))
  for (const mp of marketPairs) {
    if (!glowAddrs.has(mp.address.toLowerCase())) merged.push(mp)
  }

  // Filter + sort
  const displayed = merged
    .filter(p => {
      if (!search) return true
      const q = search.toLowerCase()
      return p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      // GlowFun tokens first, then by volume/mcap
      if (a.source === 'glowfun' && b.source !== 'glowfun') return -1
      if (b.source === 'glowfun' && a.source !== 'glowfun') return 1
      return (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0)
    })

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0, paddingBottom: 56 }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-white">Markets</h1>
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Arc Mainnet · {displayed.length} pairs</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="text-[11px] text-white bg-transparent outline-none w-24 placeholder-white/20"
            />
            {search && <button onClick={() => setSearch('')}><X size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /></button>}
          </div>
          {/* Refresh */}
          <button onClick={fetchMarket} className="p-1.5 rounded-xl transition-all" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-1.5 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-[8px] uppercase tracking-widest w-5 text-center flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>#</span>
        <span className="text-[8px] uppercase tracking-widest ml-10 flex-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Token</span>
        <span className="text-[8px] uppercase tracking-widest text-right" style={{ color: 'rgba(255,255,255,0.2)' }}>Price / Changes</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-2xl mb-2">📈</div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {search ? 'No tokens match your search' : 'Loading market data…'}
            </p>
          </div>
        ) : (
          displayed.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}>
              <PairRow pair={p} rank={i + 1} onClick={() => setSelected(p)} />
            </motion.div>
          ))
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && <PairDetail pair={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  )
}

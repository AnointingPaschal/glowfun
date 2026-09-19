import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Search, ExternalLink, Flame, Globe, Twitter, Send as TgIcon,
  BarChart3, Activity, ArrowUpRight, ArrowDownRight, Loader2, X, Star,
  RefreshCw, ChevronUp, ChevronDown, Zap, Trophy, DollarSign,
  Copy, Check, Layers, Wifi, WifiOff, Filter,
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { PriceChart, generateSyntheticOHLCV, OHLCV } from '@/components/PriceChart'
import { useTokenList } from '@/hooks/useTokenList'
import { useConfig } from '@/context/ConfigContext'
import { formatPriceNumber, formatAddress, timeAgo } from '@/utils/format'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const GREEN = '#26a69a'
const RED   = '#ef5350'

/* ── DexScreener types ──────────────────────────────────────────── */
interface DSToken {
  address: string
  name: string
  symbol: string
}
interface DSPair {
  chainId: string
  pairAddress: string
  baseToken: DSToken
  quoteToken: DSToken
  priceUsd: string
  priceNative: string
  volume: { h24: number; h6: number; h1: number; m5: number }
  priceChange: { h24: number; h6: number; h1: number; m5: number }
  liquidity?: { usd: number; base: number; quote: number }
  fdv?: number
  marketCap?: number
  txns: { h24: { buys: number; sells: number }; h6?: { buys: number; sells: number }; h1?: { buys: number; sells: number } }
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] }
  pairCreatedAt?: number
}

/* ── GeckoTerminal types ────────────────────────────────────────── */
interface GTPool {
  id: string
  attributes: {
    name: string
    address: string
    base_token_price_usd: string
    quote_token_price_usd: string
    volume_usd: { h24: string; h6: string; h1: string }
    price_change_percentage: { h24: string; h6: string; h1: string }
    fdv_usd: string
    market_cap_usd: string
    reserve_in_usd: string
    transactions: { h24: { buys: number; sells: number } }
    pool_created_at: string
  }
  relationships: {
    base_token: { data: { id: string } }
    quote_token: { data: { id: string } }
  }
}
interface GTTokenAttr { name: string; symbol: string; address: string; image_url?: string }

/* ── Normalised pair type ───────────────────────────────────────── */
export interface NormPair {
  source: 'dexscreener' | 'geckoterminal' | 'glowfun'
  pairAddress: string
  tokenAddress: string
  name: string
  symbol: string
  imageUrl?: string
  priceUsd: number
  change24h?: number
  change1h?: number
  volume24h: number
  liquidity?: number
  fdv?: number
  mcap?: number
  buys24h?: number
  sells24h?: number
  createdAt?: number
  website?: string
  twitter?: string
  chainId: string
}

/* ── Fetchers ───────────────────────────────────────────────────── */
async function fetchAllDexScreenerArc(): Promise<NormPair[]> {
  try {
    // DexScreener: search for top pairs on Arc
    const r = await fetch('https://api.dexscreener.com/latest/dex/search/?q=USDC&chainIds=arc', { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return []
    const d = await r.json()
    const pairs: DSPair[] = (d.pairs ?? []).filter((p: DSPair) => p.chainId === 'arc')
    return pairs.map(p => ({
      source: 'dexscreener',
      pairAddress: p.pairAddress,
      tokenAddress: p.baseToken.address,
      name: p.baseToken.name,
      symbol: p.baseToken.symbol,
      imageUrl: p.info?.imageUrl,
      priceUsd: parseFloat(p.priceUsd) || 0,
      change24h: p.priceChange?.h24,
      change1h: p.priceChange?.h1,
      volume24h: p.volume?.h24 ?? 0,
      liquidity: p.liquidity?.usd,
      fdv: p.fdv,
      mcap: p.marketCap,
      buys24h: p.txns?.h24?.buys,
      sells24h: p.txns?.h24?.sells,
      createdAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : undefined,
      website: p.info?.websites?.[0]?.url,
      twitter: p.info?.socials?.find(s => s.type === 'twitter')?.url,
      chainId: 'arc',
    }))
  } catch { return [] }
}

async function fetchGeckoTerminalArc(): Promise<NormPair[]> {
  try {
    const r = await fetch('https://api.geckoterminal.com/api/v2/networks/arc/pools?page=1&sort=h24_volume_usd_desc', { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return []
    const d = await r.json()
    const pools: GTPool[] = d.data ?? []
    const included: { id: string; type: string; attributes: GTTokenAttr }[] = d.included ?? []
    const tokenMap = new Map(included.filter(i => i.type === 'token').map(i => [i.id, i.attributes]))

    return pools.map(pool => {
      const baseId = pool.relationships.base_token.data.id
      const baseTok = tokenMap.get(baseId)
      const a = pool.attributes
      return {
        source: 'geckoterminal' as const,
        pairAddress: a.address,
        tokenAddress: baseTok?.address ?? pool.id.split('_')[1] ?? '',
        name: baseTok?.name ?? a.name.split(' / ')[0],
        symbol: baseTok?.symbol ?? a.name.split(' / ')[0],
        imageUrl: baseTok?.image_url,
        priceUsd: parseFloat(a.base_token_price_usd) || 0,
        change24h: parseFloat(a.price_change_percentage?.h24) || 0,
        change1h: parseFloat(a.price_change_percentage?.h1) || 0,
        volume24h: parseFloat(a.volume_usd?.h24) || 0,
        liquidity: parseFloat(a.reserve_in_usd) || undefined,
        fdv: parseFloat(a.fdv_usd) || undefined,
        mcap: parseFloat(a.market_cap_usd) || undefined,
        buys24h: a.transactions?.h24?.buys,
        sells24h: a.transactions?.h24?.sells,
        createdAt: a.pool_created_at ? Math.floor(new Date(a.pool_created_at).getTime() / 1000) : undefined,
        chainId: 'arc',
      }
    })
  } catch { return [] }
}

/* ── Token row ──────────────────────────────────────────────────── */
function PairRow({ pair, rank, onClick }: { pair: NormPair; rank: number; onClick: () => void }) {
  const hue = parseInt((pair.tokenAddress ?? pair.pairAddress).slice(2, 6), 16) % 360
  const grad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue+120)%360},65%,40%))`
  const isUp = (pair.change24h ?? 0) >= 0

  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClick} className="cursor-pointer border-b group transition-all"
      style={{ borderColor: 'rgba(255,255,255,0.04)' }} whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
      <td className="px-3 py-2.5 text-center"><span className="text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>#{rank}</span></td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          {pair.imageUrl ? (
            <img src={pair.imageUrl} alt={pair.symbol} className="w-8 h-8 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: grad }}>{pair.symbol.slice(0,1)}</div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors truncate">{pair.symbol}</div>
            <div className="text-[9px] truncate max-w-[80px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{pair.name}</div>
          </div>
          <span className="text-[8px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: pair.source === 'dexscreener' ? 'rgba(93,188,123,0.1)' : 'rgba(139,92,246,0.1)', color: pair.source === 'dexscreener' ? '#5dbc7b' : '#a78bfa', border: `1px solid ${pair.source === 'dexscreener' ? 'rgba(93,188,123,0.15)' : 'rgba(139,92,246,0.15)'}` }}>
            {pair.source === 'dexscreener' ? 'DS' : 'GT'}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="text-xs font-mono text-white tabular-nums">${formatPriceNumber(pair.priceUsd)}</div>
      </td>
      <td className="px-3 py-2.5 text-right">
        {pair.change24h !== undefined ? (
          <div className="flex items-center justify-end gap-0.5 text-xs font-medium tabular-nums" style={{ color: isUp ? GREEN : RED }}>
            {isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(pair.change24h).toFixed(2)}%
          </div>
        ) : <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
      </td>
      <td className="px-3 py-2.5 text-right hidden sm:table-cell">
        <div className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.65)' }}>
          {pair.fdv ? (pair.fdv >= 1e6 ? `$${(pair.fdv/1e6).toFixed(1)}M` : pair.fdv >= 1e3 ? `$${(pair.fdv/1e3).toFixed(0)}K` : `$${pair.fdv.toFixed(0)}`) : '—'}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right hidden md:table-cell">
        <div className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {pair.volume24h >= 1e6 ? `$${(pair.volume24h/1e6).toFixed(1)}M` : pair.volume24h >= 1e3 ? `$${(pair.volume24h/1e3).toFixed(1)}K` : `$${pair.volume24h.toFixed(0)}`}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right hidden lg:table-cell">
        <div className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {pair.liquidity ? (pair.liquidity >= 1e3 ? `$${(pair.liquidity/1e3).toFixed(1)}K` : `$${pair.liquidity.toFixed(0)}`) : '—'}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right hidden xl:table-cell">
        {pair.buys24h !== undefined ? (
          <div className="text-[10px] tabular-nums">
            <span style={{ color: GREEN }}>{pair.buys24h}B</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}> / </span>
            <span style={{ color: RED }}>{pair.sells24h ?? 0}S</span>
          </div>
        ) : <span style={{ color: 'rgba(255,255,255,0.2)' }} className="text-xs">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right hidden sm:table-cell">
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{pair.createdAt ? timeAgo(pair.createdAt) : '—'}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[9px] font-medium px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.18)' }}>
          Chart →
        </span>
      </td>
    </motion.tr>
  )
}

/* ── Pair detail overlay ────────────────────────────────────────── */
function PairDetail({ pair, glowTokenAddr, onClose }: { pair: NormPair; glowTokenAddr?: string; onClose: () => void }) {
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<'5m' | '1h' | '4h' | '1d'>('1h')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'chart' | 'info'>('chart')
  const { EXPLORER_BASE } = useConfig()

  const hue = parseInt((pair.tokenAddress ?? pair.pairAddress).slice(2, 6), 16) % 360
  const grad = `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue+120)%360},65%,40%))`
  const isUp = (pair.change24h ?? 0) >= 0

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let data: OHLCV[] | null = null
      // Try GeckoTerminal OHLCV
      try {
        const tf = timeframe === '5m' ? 'minute?aggregate=5' : timeframe === '1h' ? 'hour' : timeframe === '4h' ? 'hour?aggregate=4' : 'day'
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/pools/${pair.pairAddress}/ohlcv/${tf}&limit=200`, { signal: AbortSignal.timeout(6000) })
        if (r.ok) {
          const d = await r.json()
          const raw: number[][] = d.data?.attributes?.ohlcv_list ?? []
          if (raw.length > 0) data = raw.reverse().map(([t, o, h, l, c, v]) => ({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: v }))
        }
      } catch { /* fall through */ }
      // Synthetic fallback
      if (!data || data.length === 0) data = generateSyntheticOHLCV(pair.priceUsd, BigInt(Math.floor(pair.volume24h * 1e6)), BigInt(pair.createdAt ?? Math.floor(Date.now()/1000) - 86400 * 7))
      if (!cancelled) { setOhlcv(data); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [pair.pairAddress, timeframe])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl"
          style={{ background: 'rgba(10,10,20,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
          {/* Header */}
          <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(8,8,18,0.97)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              {pair.imageUrl ? (
                <img src={pair.imageUrl} alt={pair.symbol} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: grad }}>{pair.symbol.slice(0,1)}</div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{pair.symbol}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{pair.name}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatAddress(pair.pairAddress)}</span>
                  <button onClick={() => copy(pair.pairAddress)}>{copied ? <Check size={9} style={{ color: GREEN }} /> : <Copy size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />}</button>
                  {EXPLORER_BASE && <a href={`${EXPLORER_BASE}/address/${pair.pairAddress}`} target="_blank" rel="noopener"><ExternalLink size={9} style={{ color: 'rgba(255,255,255,0.3)' }} /></a>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Link to GlowFun token page if it's a GlowFun token */}
              {glowTokenAddr && (
                <Link to={`/token/${glowTokenAddr}`} className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg no-underline" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <Zap size={10} />Trade
                </Link>
              )}
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.4)' }}><X size={16} /></button>
            </div>
          </div>

          {/* Price hero */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-3xl font-bold text-white tabular-nums" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  ${formatPriceNumber(pair.priceUsd)}
                </div>
                {pair.change24h !== undefined && (
                  <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: isUp ? GREEN : RED }}>
                    {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(pair.change24h).toFixed(2)}% (24h)
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: 'FDV', v: pair.fdv ? (pair.fdv >= 1e6 ? `$${(pair.fdv/1e6).toFixed(1)}M` : `$${(pair.fdv/1e3).toFixed(0)}K`) : '—' },
                  { k: '24h Vol', v: pair.volume24h >= 1e3 ? `$${(pair.volume24h/1e3).toFixed(1)}K` : `$${pair.volume24h.toFixed(0)}` },
                  { k: 'Liquidity', v: pair.liquidity ? (pair.liquidity >= 1e3 ? `$${(pair.liquidity/1e3).toFixed(1)}K` : `$${pair.liquidity.toFixed(0)}`) : '—' },
                ].map(s => (
                  <div key={s.k} className="px-2 py-1.5 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.k}</div>
                    <div className="text-xs font-bold text-white">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex px-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {[{ id: 'chart', label: 'Chart' }, { id: 'info', label: 'Info' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className="px-4 py-2.5 text-xs font-medium transition-all"
                style={{ borderBottom: tab === t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: tab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.4)', marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
            {tab === 'chart' && (
              <div className="flex gap-1 ml-auto py-1">
                {(['5m', '1h', '4h', '1d'] as const).map(tf => (
                  <button key={tf} onClick={() => setTimeframe(tf)}
                    className="px-2 py-1 rounded-lg text-[9px] font-medium transition-all"
                    style={{ background: timeframe === tf ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: timeframe === tf ? '#a78bfa' : 'rgba(255,255,255,0.35)', border: `1px solid ${timeframe === tf ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
                    {tf}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            {tab === 'chart' && (
              <div>
                <PriceChart data={ohlcv} loading={loading} symbol={pair.symbol} height={340} />
                <div className="flex gap-2 mt-3 flex-wrap">
                  <a href={`https://dexscreener.com/arc/${pair.pairAddress}`} target="_blank" rel="noopener"
                    className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <BarChart3 size={10} />DexScreener
                  </a>
                  <a href={`https://www.geckoterminal.com/arc/pools/${pair.pairAddress}`} target="_blank" rel="noopener"
                    className="flex items-center gap-1.5 text-[10px] px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Activity size={10} />GeckoTerminal
                  </a>
                </div>
              </div>
            )}
            {tab === 'info' && (
              <div className="space-y-3">
                {[
                  { k: 'Token Address',  v: pair.tokenAddress, copy: true },
                  { k: 'Pair Address',   v: pair.pairAddress,  copy: true },
                  { k: '1h Change',      v: pair.change1h !== undefined ? `${pair.change1h > 0 ? '+' : ''}${pair.change1h.toFixed(2)}%` : '—' },
                  { k: '24h Buys/Sells', v: pair.buys24h !== undefined ? `${pair.buys24h} / ${pair.sells24h ?? 0}` : '—' },
                  { k: 'Chain',          v: 'Arc Mainnet' },
                  { k: 'Data Source',    v: pair.source === 'dexscreener' ? 'DexScreener' : 'GeckoTerminal' },
                  { k: 'Created',        v: pair.createdAt ? new Date(pair.createdAt * 1000).toLocaleDateString() : '—' },
                ].map(({ k, v, copy: canCopy }) => (
                  <div key={k} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{k}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-white">{canCopy ? formatAddress(v) : v}</span>
                      {canCopy && <button onClick={() => copy(v)} style={{ color: 'rgba(255,255,255,0.3)' }}><Copy size={9} /></button>}
                    </div>
                  </div>
                ))}
                {(pair.website || pair.twitter) && (
                  <div className="flex gap-2 pt-1">
                    {pair.twitter && <a href={pair.twitter} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(29,161,242,0.08)', color: '#1da1f2', border: '1px solid rgba(29,161,242,0.12)' }}><Twitter size={12} />Twitter</a>}
                    {pair.website && <a href={pair.website} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}><Globe size={12} />Website</a>}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */
type SortKey = 'mcap' | 'price' | 'change24h' | 'volume' | 'liquidity' | 'new'
type FilterKey = 'all' | 'ds' | 'gt' | 'glowfun'

export function TrendingPage() {
  const { addresses } = useTokenList()
  const [pairs, setPairs]             = useState<NormPair[]>([])
  const [loading, setLoading]         = useState(true)
  const [lastFetch, setLastFetch]     = useState<Date | null>(null)
  const [online, setOnline]           = useState(true)
  const [search, setSearch]           = useState('')
  const [sort, setSort]               = useState<SortKey>('volume')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter]           = useState<FilterKey>('all')
  const [selected, setSelected]       = useState<NormPair | null>(null)
  const [refreshing, setRefreshing]   = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = async () => {
    setRefreshing(true)
    const [ds, gt] = await Promise.all([fetchAllDexScreenerArc(), fetchGeckoTerminalArc()])
    // Merge: DS takes priority; deduplicate by pairAddress
    const seen = new Set<string>()
    const merged: NormPair[] = []
    for (const p of [...ds, ...gt]) {
      if (!seen.has(p.pairAddress.toLowerCase())) {
        seen.add(p.pairAddress.toLowerCase())
        merged.push(p)
      }
    }
    // Merge in GlowFun-only tokens (those not already in merged)
    // (GlowFun tokens will appear via DS/GT once they have DEX pools; for bonding curve ones show via useTokenList)
    setPairs(merged)
    setLoading(false)
    setRefreshing(false)
    setLastFetch(new Date())
    setOnline(merged.length > 0)
  }

  useEffect(() => {
    fetchAll()
    intervalRef.current = setInterval(fetchAll, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const glowAddresses = new Set(addresses.map(a => a.toLowerCase()))

  const displayed = pairs
    .filter(p => {
      if (filter === 'ds') return p.source === 'dexscreener'
      if (filter === 'gt') return p.source === 'geckoterminal'
      if (filter === 'glowfun') return glowAddresses.has(p.tokenAddress.toLowerCase())
      return true
    })
    .filter(p => {
      if (!search) return true
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.symbol.toLowerCase().includes(q) || p.tokenAddress.toLowerCase().includes(q) || p.pairAddress.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let va = 0, vb = 0
      if (sort === 'mcap')    { va = a.fdv ?? 0; vb = b.fdv ?? 0 }
      else if (sort === 'price')   { va = a.priceUsd; vb = b.priceUsd }
      else if (sort === 'change24h') { va = a.change24h ?? 0; vb = b.change24h ?? 0 }
      else if (sort === 'volume')  { va = a.volume24h; vb = b.volume24h }
      else if (sort === 'liquidity') { va = a.liquidity ?? 0; vb = b.liquidity ?? 0 }
      else if (sort === 'new')     { va = a.createdAt ?? 0; vb = b.createdAt ?? 0 }
      return sortDir === 'desc' ? vb - va : va - vb
    })

  const totVol  = pairs.reduce((s, p) => s + p.volume24h, 0)
  const totLiq  = pairs.reduce((s, p) => s + (p.liquidity ?? 0), 0)

  const toggleSort = (k: SortKey) => {
    if (sort === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSort(k); setSortDir('desc') }
  }
  const SortIcon = ({ k }: { k: SortKey }) => sort === k
    ? (sortDir === 'desc' ? <ChevronDown size={10} style={{ color: '#a78bfa' }} /> : <ChevronUp size={10} style={{ color: '#a78bfa' }} />)
    : null

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-[3px] w-8 rounded-full" style={{ background: SPECTRAL }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Live</span>
          {online ? <Wifi size={10} style={{ color: GREEN }} /> : <WifiOff size={10} style={{ color: RED }} />}
        </div>
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>
              Arc <span style={{ background: SPECTRAL, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Markets</span>
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              All tokens on Arc Mainnet · DexScreener + GeckoTerminal
              {lastFetch && <span style={{ color: 'rgba(255,255,255,0.25)' }}> · updated {lastFetch.toLocaleTimeString()}</span>}
            </p>
          </div>
          <button onClick={fetchAll} disabled={refreshing} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl transition-all disabled:opacity-50" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />Refresh
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Tracked Tokens', value: String(pairs.length), icon: Layers, color: '#a78bfa' },
            { label: 'Total Volume 24h', value: totVol >= 1e6 ? `$${(totVol/1e6).toFixed(1)}M` : totVol >= 1e3 ? `$${(totVol/1e3).toFixed(0)}K` : `$${totVol.toFixed(0)}`, icon: TrendingUp, color: '#60a5fa' },
            { label: 'Total Liquidity', value: totLiq >= 1e6 ? `$${(totLiq/1e6).toFixed(1)}M` : totLiq >= 1e3 ? `$${(totLiq/1e3).toFixed(0)}K` : `$${totLiq.toFixed(0)}`, icon: DollarSign, color: GREEN },
            { label: 'GlowFun Tokens', value: String(addresses.length), icon: Zap, color: '#fbbf24' },
          ].map(s => (
            <GlassCard key={s.label} className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}18` }}>
                <s.icon size={14} style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</div>
                <div className="text-sm font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</div>
              </div>
            </GlassCard>
          ))}
        </div>
      </motion.div>

      {/* Filters + search */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
        className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'all',      label: 'All' },
            { id: 'ds',       label: 'DexScreener' },
            { id: 'gt',       label: 'GeckoTerminal' },
            { id: 'glowfun',  label: '⚡ GlowFun' },
          ] as const).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: filter === f.id ? 'rgba(139,92,246,0.15)' : 'transparent', color: filter === f.id ? '#a78bfa' : 'rgba(255,255,255,0.4)', border: filter === f.id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl min-w-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 280 }}>
          <Search size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, symbol, address…"
            className="text-xs text-white bg-transparent outline-none w-full placeholder-white/20" />
          {search && <button onClick={() => setSearch('')}><X size={11} style={{ color: 'rgba(255,255,255,0.3)' }} /></button>}
        </div>
        <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.25)' }}>{displayed.length} pairs</span>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { key: null,         label: '#',        cls: 'text-center w-10' },
                    { key: null,         label: 'Token',    cls: '' },
                    { key: 'price' as SortKey,     label: 'Price',    cls: 'text-right' },
                    { key: 'change24h' as SortKey, label: '24h %',    cls: 'text-right' },
                    { key: 'mcap' as SortKey,      label: 'FDV',      cls: 'text-right hidden sm:table-cell' },
                    { key: 'volume' as SortKey,    label: 'Vol 24h',  cls: 'text-right hidden md:table-cell' },
                    { key: 'liquidity' as SortKey, label: 'Liquidity',cls: 'text-right hidden lg:table-cell' },
                    { key: null,         label: 'Txns',     cls: 'text-right hidden xl:table-cell' },
                    { key: 'new' as SortKey,       label: 'Age',      cls: 'text-right hidden sm:table-cell' },
                    { key: null,         label: '',         cls: '' },
                  ].map((col, i) => (
                    <th key={i} className={`px-3 py-2.5 ${col.cls}`}>
                      {col.key ? (
                        <button onClick={() => toggleSort(col.key!)} className="flex items-center gap-1 text-[9px] uppercase tracking-widest font-semibold" style={{ color: sort === col.key ? '#a78bfa' : 'rgba(255,255,255,0.3)', ...(col.cls.includes('right') ? { marginLeft: 'auto' } : {}) }}>
                          {col.label}<SortIcon k={col.key} />
                        </button>
                      ) : (
                        <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse border-b" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                      <td className="px-3 py-3"><div className="w-5 h-3 rounded mx-auto" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} /><div className="space-y-1"><div className="w-16 h-3 rounded" style={{ background: 'rgba(255,255,255,0.09)' }} /><div className="w-10 h-2 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} /></div></div></td>
                      {[...Array(7)].map((_, j) => <td key={j} className="px-3 py-3"><div className="h-3 rounded ml-auto" style={{ background: 'rgba(255,255,255,0.05)', width: 48 }} /></td>)}
                      <td />
                    </tr>
                  ))
                ) : displayed.length === 0 ? (
                  <tr><td colSpan={10} className="py-16 text-center">
                    <Flame size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {search ? 'No tokens match your search' : 'No tokens found on Arc yet. Be the first to launch one!'}
                    </p>
                    {!search && <Link to="/launch" className="inline-block mt-3 text-xs text-purple-400 hover:text-purple-300">Launch a token →</Link>}
                  </td></tr>
                ) : (
                  displayed.map((p, i) => (
                    <PairRow key={p.pairAddress} pair={p} rank={i + 1}
                      onClick={() => setSelected(p)} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </motion.div>

      {/* Detail overlay */}
      <AnimatePresence>
        {selected && (
          <PairDetail
            pair={selected}
            glowTokenAddr={glowAddresses.has(selected.tokenAddress.toLowerCase()) ? selected.tokenAddress : undefined}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

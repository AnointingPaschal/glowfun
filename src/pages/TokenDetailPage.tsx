import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, ExternalLink, Copy, Check, BarChart3, Activity,
  Zap, ArrowUpRight, ArrowDownRight, Globe, Twitter, Send as TgIcon,
} from 'lucide-react'
import { CustomChart, CandleData } from '@/components/CustomChart'
import { EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'

/* ── helpers ─────────────────────────────────────────────────────── */
function PriceDisplay({ price }: { price: number }) {
  if (!price) return <span>$0</span>
  if (price >= 0.01) return <span>${price >= 100 ? price.toLocaleString('en', { maximumFractionDigits: 2 }) : price.toFixed(price >= 1 ? 4 : 6)}</span>
  const s = price.toFixed(20)
  const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{ fontSize: '0.6em' }}>{m[1].length}</sub>{m[2]}</span>
  return <span>${price.toFixed(8)}</span>
}

const fmtUsd = (n?: number) => !n ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(2)}`
const pctColor = (v?: number) => (v ?? 0) >= 0 ? '#22c55e' : '#ef4444'
const fmtPct = (v?: number) => v == null ? '' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtAge = (s?: number) => !s ? '—' : s < 3600 ? `${Math.floor(s/60)}m` : s < 86400 ? `${Math.floor(s/3600)}h` : `${Math.floor(s/86400)}d`

interface Token {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source?: string; isGlowFun?: boolean
}

async function fetchTokenFromAPI(address: string): Promise<Token | null> {
  try {
    const r = await fetch(`/api/market?q=${address}&limit=10`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return null
    const d = await r.json() as any
    const tokens: Token[] = d.data?.tokens ?? []
    return tokens.find(t => t.address.toLowerCase() === address.toLowerCase()) ?? tokens[0] ?? null
  } catch { return null }
}

async function fetchOHLCV(pool: string, token: string, tf: string, price: number, change24h: number, age: number): Promise<CandleData[]> {
  try {
    const params = new URLSearchParams({ tf })
    if (pool)  params.set('pool', pool)
    if (token) params.set('token', token)
    if (price) params.set('price', String(price))
    if (change24h) params.set('change24h', String(change24h))
    if (age)   params.set('age', String(age))
    const r = await fetch(`/api/market/ohlcv?${params}`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return []
    const d = await r.json() as any
    return d.data ?? []
  } catch { return [] }
}

export function TokenDetailPage() {
  const { address } = useParams<{ address: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  // Try to use token passed via navigation state (instant)
  const [token, setToken] = useState<Token | null>((location.state as any)?.token ?? null)
  const [loading, setLoading] = useState(!token)
  const [ohlcv, setOhlcv] = useState<CandleData[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [tf, setTf] = useState<'5m'|'15m'|'1h'|'4h'|'1d'>('1h')
  const [tab, setTab] = useState<'chart'|'info'>('chart')
  const [copied, setCopied] = useState(false)

  // Fetch token if not in state
  useEffect(() => {
    if (token || !address) return
    fetchTokenFromAPI(address).then(t => { setToken(t); setLoading(false) })
  }, [address])

  // Fetch OHLCV whenever token or timeframe changes
  useEffect(() => {
    if (!token) return
    setChartLoading(true)
    setOhlcv([])
    fetchOHLCV(
      token.pairAddress ?? '',
      token.address,
      tf,
      token.priceUsd,
      token.change24h ?? 0,
      token.age ?? 86400
    ).then(d => { setOhlcv(d); setChartLoading(false) })
  }, [token?.address, token?.pairAddress, tf])

  const copy = (s: string) => { navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const hue = parseInt((address ?? '0x000000').slice(2, 6), 16) % 360

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(34,197,94,0.2)', borderTopColor: '#22c55e' }}/>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="text-center py-16">
        <p className="text-white mb-4">Token not found</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm text-white" style={{ background: 'rgba(255,255,255,0.08)' }}>
          ← Go Back
        </button>
      </div>
    )
  }

  const buyRatio = token.buys24h && token.sells24h
    ? token.buys24h / (token.buys24h + token.sells24h)
    : null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
          <ArrowLeft size={16}/>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {token.logoUrl
            ? <img src={token.logoUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as any).style.display='none' }}/>
            : <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background:`linear-gradient(135deg,hsl(${hue},70%,50%),hsl(${(hue+120)%360},65%,40%))` }}>{token.symbol.slice(0,2)}</div>}
          <span className="font-bold text-white text-base truncate">{token.symbol}</span>
          <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{token.name}</span>
        </div>
        {token.dexId && <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background:'rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.45)' }}>{token.dexId}</span>}
        {token.isGlowFun && <Link to={`/token/${token.address}`} className="no-underline text-[10px] px-2.5 py-1.5 rounded-xl font-bold text-white flex-shrink-0 flex items-center gap-1" style={{ background:'linear-gradient(135deg,#8b5cf6,#ec4899)' }}><Zap size={10}/>Trade</Link>}
      </div>

      {/* Price hero */}
      <div className="rounded-2xl p-4 mb-3" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily:'Space Grotesk,sans-serif', letterSpacing:'-0.02em' }}>
              <PriceDisplay price={token.priceUsd}/>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {([['5M', token.change5m], ['1H', token.change1h], ['6H', token.change6h], ['24H', token.change24h]] as [string, number|undefined][])
                .filter(([,v]) => v != null).map(([label, v]) => (
                <span key={label} className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                  style={{ background: (v??0)>=0?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)', color: pctColor(v) }}>
                  {label} {(v??0)>=0?<ArrowUpRight size={10} className="inline"/>:<ArrowDownRight size={10} className="inline"/>}{fmtPct(v)}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right">
            {[
              { k:'MCap',  v: fmtUsd(token.mcapUsd) },
              { k:'Vol',   v: fmtUsd(token.volumeUsd) },
              { k:'Liq',   v: fmtUsd(token.liquidityUsd) },
              { k:'Age',   v: fmtAge(token.age) },
            ].map(s => (
              <div key={s.k} className="px-3 py-2 rounded-xl" style={{ background:'rgba(255,255,255,0.04)' }}>
                <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color:'rgba(255,255,255,0.3)' }}>{s.k}</div>
                <div className="text-xs font-bold text-white">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Buy/sell bars */}
        {buyRatio !== null && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]" style={{ color:'rgba(255,255,255,0.4)' }}>
              <span style={{ color:'#22c55e' }}>▲ {token.buys24h} buys</span>
              <span style={{ color:'#ef4444' }}>{token.sells24h} sells ▼</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
              <div className="rounded-l-full" style={{ width:`${buyRatio*100}%`, background:'#22c55e' }}/>
              <div className="rounded-r-full flex-1" style={{ background:'#ef4444' }}/>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
        {(['chart','info'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all"
            style={{ background:tab===t?'rgba(34,197,94,0.12)':'transparent', color:tab===t?'#22c55e':'rgba(255,255,255,0.4)', border:tab===t?'1px solid rgba(34,197,94,0.2)':'1px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Chart tab */}
      {tab === 'chart' && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            {(['5m','15m','1h','4h','1d'] as const).map(t => (
              <button key={t} onClick={() => setTf(t)} className="px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                style={{ background:tf===t?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)', color:tf===t?'#22c55e':'rgba(255,255,255,0.4)', border:`1px solid ${tf===t?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.06)'}` }}>
                {t}
              </button>
            ))}
            <span className="ml-auto text-[9px]" style={{ color:'rgba(255,255,255,0.25)' }}>
              {chartLoading ? 'Loading…' : ohlcv.length ? `${ohlcv.length} candles` : 'No data'}
            </span>
          </div>
          <CustomChart data={ohlcv} height={320} loading={chartLoading}/>
          <div className="flex gap-2 mt-3 flex-wrap">
            {token.pairAddress && <a href={`https://www.geckoterminal.com/arc/pools/${token.pairAddress}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] px-3 py-2 rounded-xl no-underline" style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}><BarChart3 size={10}/>GeckoTerminal</a>}
            <a href={`https://dexscreener.com/arc/${token.pairAddress??token.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] px-3 py-2 rounded-xl no-underline" style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}><Activity size={10}/>DexScreener</a>
            <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] px-3 py-2 rounded-xl no-underline" style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.07)' }}><ExternalLink size={10}/>Explorer</a>
          </div>
        </div>
      )}

      {/* Info tab */}
      {tab === 'info' && (
        <div className="rounded-2xl overflow-hidden" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          {[
            { k:'Token Address', v: token.address,     copy: true },
            { k:'Pair Address',  v: token.pairAddress, copy: !!token.pairAddress },
            { k:'DEX',           v: token.dexId || '—' },
            { k:'Network',       v: 'Arc Mainnet' },
            { k:'Data Source',   v: token.source || '—' },
            { k:'Age',           v: fmtAge(token.age) },
            { k:'Price',         v: `$${token.priceUsd}` },
            { k:'Market Cap',    v: fmtUsd(token.mcapUsd) },
            { k:'24h Volume',    v: fmtUsd(token.volumeUsd) },
            { k:'Liquidity',     v: fmtUsd(token.liquidityUsd) },
            { k:'24h Buys',      v: token.buys24h != null ? String(token.buys24h) : '—' },
            { k:'24h Sells',     v: token.sells24h != null ? String(token.sells24h) : '—' },
          ].filter(r => r.v && r.v !== 'undefined').map(({ k, v, copy: hasCopy }) => (
            <div key={k} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0" style={{ borderColor:'rgba(255,255,255,0.05)' }}>
              <span className="text-[10px] uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.35)' }}>{k}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-white">{(v as string).length > 20 ? formatAddress(v as string) : v}</span>
                {hasCopy && <button onClick={() => copy(v as string)}>{copied ? <Check size={9} style={{ color:'#22c55e' }}/> : <Copy size={9} style={{ color:'rgba(255,255,255,0.3)' }}/>}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

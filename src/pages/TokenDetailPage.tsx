import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Copy, Check, BarChart3, Activity, Zap, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { TVChart, ChartType } from '@/components/TVChart'
import type { CandleData } from '@/components/CustomChart'
import { EXPLORER_BASE } from '@/constants'
import { formatAddress } from '@/utils/format'

/* ── Tiny helpers ─────────────────────────────────────────────────── */
function fmtPrice(v: number): string {
  if (!v) return '$0'
  if (v >= 1000) return `$${v.toLocaleString('en',{maximumFractionDigits:2})}`
  if (v >= 0.01) return `$${v.toFixed(v>=1?2:4)}`
  const s = v.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,5})/)
  if (m) return `$${s.slice(0,2)}${m[1].length}${m[2]}`   // $0.0₃5041 as text
  return `$${v.toFixed(8)}`
}
// Subscript version for React
function Price({ v }: { v: number }) {
  if (!v) return <span>$0</span>
  if (v >= 0.01) return <span>${v >= 1000 ? v.toLocaleString('en',{maximumFractionDigits:2}) : v >= 1 ? v.toFixed(2) : v.toFixed(4)}</span>
  const s = v.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,5})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{fontSize:'0.55em',verticalAlign:'sub'}}>{m[1].length}</sub>{m[2]}</span>
  return <span>${v.toFixed(8)}</span>
}
const usd = (n?: number) => !n?'—': n>=1e9?`$${(n/1e9).toFixed(2)}B`: n>=1e6?`$${(n/1e6).toFixed(2)}M`: n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(2)}`
const pct = (v?: number) => v==null?null:`${v>=0?'+':''}${Math.abs(v).toFixed(2)}%`
const ageStr = (s?: number) => !s?'—': s<60?`${s}s`: s<3600?`${Math.floor(s/60)}m`: s<86400?`${Math.floor(s/3600)}h`: `${Math.floor(s/86400)}d`

interface Token {
  address:string; name:string; symbol:string; logoUrl:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liquidityUsd?:number; volumeUsd?:number; mcapUsd?:number
  age?:number; buys24h?:number; sells24h?:number
  pairAddress?:string; dexId?:string; source?:string; isGlowFun?:boolean
}

/* ── Synthetic OHLCV ─────────────────────────────────────────────── */
function makeSynthetic(price: number, ch24: number, ageSec: number, tf: string): CandleData[] {
  if (!price||price<=0) return []
  const n=60, start = Math.abs(ch24)>0.5 ? price/(1+ch24/100) : price*0.72
  const now=Math.floor(Date.now()/1000)
  const iv = {'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400}[tf]??3600
  let seed=(Math.abs(Math.round(price*1e9))^0x5f3759df)%65535||12345
  const rng=()=>{seed=(seed*1664525+1013904223)&0xffffffff;return(seed>>>0)/0xffffffff}
  return Array.from({length:n},(_,i)=>{
    const t=now-(n-i-1)*iv, p=(i+1)/n
    const base=start+(price-start)*Math.pow(p,0.75)+Math.sin(p*Math.PI*4)*start*0.015
    const ns=0.02+rng()*0.05, dir=rng()>0.43?1:-1
    const o=Math.max(base*(1+(rng()-0.5)*ns*0.6),1e-30)
    const c=Math.max(base*(1+dir*ns*0.4*rng()),1e-30)
    return{time:t,open:o,high:Math.max(o,c)*(1+ns*0.1*rng()),low:Math.min(o,c)*(1-ns*0.07*rng()),close:c,volume:(rng()*5000+200)}
  })
}

async function fetchToken(addr:string):Promise<Token|null>{
  try{
    const r=await fetch(`/api/market?q=${addr}&limit=10`,{signal:AbortSignal.timeout(15_000)})
    if(!r.ok)return null
    const d=await r.json() as any
    const ts:Token[]=d.data?.tokens??[]
    return ts.find(t=>t.address.toLowerCase()===addr.toLowerCase())??ts[0]??null
  }catch{return null}
}

async function fetchLiveOHLCV(pool:string,token:string,tf:string):Promise<CandleData[]>{
  try{
    const p=new URLSearchParams({tf}); if(pool)p.set('pool',pool); if(token)p.set('token',token)
    const r=await fetch(`/api/market/ohlcv?${p}`,{signal:AbortSignal.timeout(10_000)})
    if(!r.ok)return []
    const d=await r.json() as any
    return(d.data??[]).filter((c:any)=>c.open>0&&c.close>0)
  }catch{return[]}
}

/* ── Market signal score from price changes ──────────────────────── */
function calcSignal(ch24?: number, ch1h?: number): { label: string; score: number; color: string; icon: React.ReactNode } {
  const c = (ch24 ?? 0) + (ch1h ?? 0) * 0.5
  if (c > 50)  return { label: 'Very Bullish', score: Math.min(98, 88 + c * 0.05), color: '#16a34a', icon: <TrendingUp size={16} /> }
  if (c > 10)  return { label: 'Bullish',      score: Math.min(88, 70 + c * 0.4),  color: '#16a34a', icon: <TrendingUp size={14} /> }
  if (c > 2)   return { label: 'Slightly Bullish', score: 60 + c * 2,              color: '#65a30d', icon: <TrendingUp size={12} /> }
  if (c > -2)  return { label: 'Neutral',      score: 50,                            color: '#ca8a04', icon: <Minus size={12} /> }
  if (c > -10) return { label: 'Slightly Bearish', score: 40 + c * 2,              color: '#ea580c', icon: <TrendingDown size={12} /> }
  if (c > -50) return { label: 'Bearish',      score: Math.max(12, 30 + c * 0.4),  color: '#dc2626', icon: <TrendingDown size={14} /> }
  return       { label: 'Very Bearish', score: Math.max(2, 12 + c * 0.05),          color: '#991b1b', icon: <TrendingDown size={16} /> }
}

/* ── Stat cell ───────────────────────────────────────────────────── */
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 px-4">
      <div className="text-xs mb-1 flex items-center gap-1" style={{ color: '#6b7280' }}>
        {label} <span className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] border" style={{ borderColor: '#d1d5db', color: '#9ca3af' }}>i</span>
      </div>
      {children}
    </div>
  )
}

/* ── Timeframe range button ──────────────────────────────────────── */
function RangeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
      style={{ background: active ? '#6366f1' : 'transparent', color: active ? '#fff' : '#6b7280', fontWeight: active ? 700 : 500 }}>
      {label}
    </button>
  )
}

/* ── Main ─────────────────────────────────────────────────────────── */
export function TokenDetailPage() {
  const { address } = useParams<{ address: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  const [token, setToken]         = useState<Token | null>((location.state as any)?.token ?? null)
  const [loading, setLoading]     = useState(!token)
  const [ohlcv, setOhlcv]         = useState<CandleData[]>([])
  const [chartLoading, setCL]     = useState(true)
  const [tf, setTf]               = useState<'5m'|'15m'|'1h'|'4h'|'1d'>('1h')
  const [range, setRange]         = useState<'1D'|'7D'|'1M'|'3M'|'1Y'|'MAX'>('7D')
  const [chartType, setChartType] = useState<ChartType>('candle')
  const [isSynth, setIsSynth]     = useState(false)
  const [copied, setCopied]       = useState(false)

  useEffect(() => {
    if (token || !address) return
    fetchToken(address).then(t => { setToken(t); setLoading(false) })
  }, [address])

  useEffect(() => {
    if (!token) return
    let alive = true; setCL(true); setOhlcv([])
    ;(async () => {
      const live = await fetchLiveOHLCV(token.pairAddress ?? '', token.address, tf)
      if (!alive) return
      if (live.length >= 5) { setOhlcv(live); setIsSynth(false) }
      else {
        const synth = makeSynthetic(token.priceUsd, token.change24h ?? 0, token.age ?? 86400, tf)
        setOhlcv(synth); setIsSynth(true)
      }
      setCL(false)
    })()
    return () => { alive = false }
  }, [token?.address, token?.pairAddress, tf])

  const copyAddr = (s: string) => { navigator.clipboard.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1200) }
  const hue = parseInt((address ?? '0x000000').slice(2,6), 16) % 360
  const signal = calcSignal(token?.change24h, token?.change1h)
  const buyRatio = (token?.buys24h ?? 0) + (token?.sells24h ?? 0) > 0
    ? token!.buys24h! / (token!.buys24h! + token!.sells24h!) : null

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(99,102,241,0.15)', borderTopColor: '#6366f1' }}/>
    </div>
  )
  if (!token) return (
    <div className="text-center py-20">
      <p className="mb-3 font-medium" style={{ color: '#111827' }}>Token not found</p>
      <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: '#f3f4f6', color: '#374151' }}>← Back</button>
    </div>
  )

  const ch24 = token.change24h ?? 0
  const ch24Pos = ch24 >= 0

  return (
    <div className="max-w-lg mx-auto" style={{ color: '#111827' }}>

      {/* ── Breadcrumb + header ──────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs mb-3" style={{ color: '#9ca3af' }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 hover:text-gray-700 transition-colors">
          <ArrowLeft size={13}/> Back
        </button>
        <span>/</span>
        <span style={{ color: '#374151' }}>{token.name} ({token.symbol})</span>
      </div>

      {/* ── Token header card ─────────────────────────────────── */}
      <div className="rounded-2xl mb-3 overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="px-4 pt-4 pb-3">
          {/* Logo + name row */}
          <div className="flex items-start gap-3 mb-3">
            {token.logoUrl
              ? <img src={token.logoUrl} className="w-14 h-14 rounded-full object-cover flex-shrink-0 border" style={{ borderColor: 'rgba(0,0,0,0.08)' }} onError={e => { (e.target as any).style.display='none' }}/>
              : <div className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-bold text-white" style={{ background: `linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))` }}>{token.symbol.slice(0,2)}</div>}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold leading-tight" style={{ color: '#111827' }}>{token.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#374151' }}>{token.symbol}</span>
                {token.dexId && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#7c3aed' }}>{token.dexId}</span>}
                {token.isGlowFun && <Link to={`/token/${token.address}`} className="no-underline text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>⚡ Trade</Link>}
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-end gap-3 mb-1">
            <span className="text-4xl font-bold" style={{ color: '#111827', fontFamily: 'Space Grotesk,sans-serif', letterSpacing:'-0.02em' }}>
              <Price v={token.priceUsd}/>
            </span>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold mb-1"
              style={{ background: ch24Pos ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)', color: ch24Pos ? '#16a34a' : '#dc2626' }}>
              {ch24Pos ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
              {Math.abs(ch24).toFixed(2)}%
            </div>
          </div>
          <p className="text-xs" style={{ color: '#9ca3af' }}>
            Updated {ageStr(token.age)} ago · Data via DexScreener + GeckoTerminal · Arc Mainnet
          </p>

          {/* Address copy */}
          <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl" style={{ background: '#f9fafb', border: '1px solid rgba(0,0,0,0.06)' }}>
            <span className="text-[10px] font-mono flex-1 truncate" style={{ color: '#6b7280' }}>{token.address}</span>
            <button onClick={() => copyAddr(token.address)} className="flex-shrink-0">
              {copied ? <Check size={12} style={{ color: '#16a34a' }}/> : <Copy size={12} style={{ color: '#9ca3af' }}/>}
            </button>
            <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener">
              <ExternalLink size={12} style={{ color: '#9ca3af' }}/>
            </a>
          </div>
        </div>

        {/* ── Market signal ─────────────────────────────────── */}
        <div className="px-4 py-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>Market Signal</div>
          <div className="flex items-center gap-2 mb-2">
            <div style={{ color: signal.color }}>{signal.icon}</div>
            <span className="text-lg font-bold" style={{ color: signal.color }}>{signal.label}</span>
            <span className="text-sm ml-auto" style={{ color: '#6b7280' }}>{Math.round(signal.score)} / 100</span>
          </div>
          {/* Gradient bar */}
          <div className="relative h-2 rounded-full overflow-hidden mb-1" style={{ background: 'linear-gradient(90deg,#dc2626 0%,#f59e0b 40%,#65a30d 60%,#16a34a 100%)' }}>
            <div className="absolute top-0 h-full w-0.5 rounded-full bg-white shadow-md transition-all" style={{ left: `${signal.score}%`, transform: 'translateX(-50%)' }}/>
          </div>
          <div className="flex justify-between text-[9px]" style={{ color: '#9ca3af' }}>
            <span>Bearish</span><span>Neutral</span><span>Bullish</span>
          </div>
          {/* Extra info */}
          {(token.change24h != null || token.change1h != null) && (
            <div className="flex gap-3 mt-2 text-xs" style={{ color: '#6b7280' }}>
              {token.change24h != null && <span className={ch24Pos ? 'text-green-600' : 'text-red-600'}>24H {ch24Pos?'+':''}{token.change24h.toFixed(2)}%</span>}
              {token.change1h != null && <span>· 1H {token.change1h>=0?'+':''}{token.change1h.toFixed(2)}%</span>}
              {token.pairAddress && <span>· <a href={`https://dexscreener.com/arc/${token.pairAddress}`} target="_blank" rel="noopener" className="underline" style={{ color: '#6366f1' }}>View on DexScreener</a></span>}
            </div>
          )}
        </div>

        {/* ── Stats grid ────────────────────────────────────── */}
        <div className="grid grid-cols-2 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          {/* Market cap */}
          <StatCell label="Market cap">
            <div className="text-base font-bold" style={{ color: '#111827' }}>{usd(token.mcapUsd)}</div>
          </StatCell>
          {/* Volume */}
          <StatCell label="Volume (24h)">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold" style={{ color: '#111827' }}>{usd(token.volumeUsd)}</span>
              {token.change24h != null && (
                <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: ch24Pos ? '#16a34a' : '#dc2626' }}>
                  {ch24Pos ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}{Math.abs(token.change24h).toFixed(2)}%
                </span>
              )}
            </div>
          </StatCell>
          {/* Liquidity */}
          <StatCell label="Liquidity">
            <div className="text-base font-bold" style={{ color: '#111827' }}>{usd(token.liquidityUsd)}</div>
          </StatCell>
          {/* Age / Pair */}
          <StatCell label="Pair age">
            <div className="text-base font-bold" style={{ color: '#111827' }}>{ageStr(token.age)}</div>
          </StatCell>
          {/* FDV full width */}
          <div className="col-span-2 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
            <StatCell label="FDV">
              <div className="text-base font-bold" style={{ color: '#111827' }}>{usd(token.mcapUsd)}</div>
            </StatCell>
          </div>
        </div>

        {/* Buy/Sell bar */}
        {buyRatio !== null && (
          <div className="px-4 pb-3 border-t pt-3" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
            <div className="flex justify-between text-xs mb-1.5 font-medium">
              <span style={{ color: '#16a34a' }}>▲ {token.buys24h} buys (24h)</span>
              <span style={{ color: '#dc2626' }}>{token.sells24h} sells ▼</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden">
              <div style={{ width:`${buyRatio*100}%`,background:'linear-gradient(90deg,#16a34a,#22c55e)'}}/>
              <div style={{ flex:1, background:'linear-gradient(90deg,#ef4444,#dc2626)'}}/>
            </div>
            <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#9ca3af' }}>
              <span>Buy Vol {usd(token.volumeUsd ? token.volumeUsd * buyRatio : 0)}</span>
              <span>Sell Vol {usd(token.volumeUsd ? token.volumeUsd * (1 - buyRatio) : 0)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Chart card ────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-3" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {/* Chart title */}
        <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          <BarChart3 size={16} style={{ color: '#6366f1' }}/>
          <span className="text-sm font-semibold" style={{ color: '#111827' }}>
            {token.name} ({token.symbol}) price chart
          </span>
          {isSynth && <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>Simulated</span>}
        </div>

        {/* Range buttons */}
        <div className="px-4 py-2 flex items-center justify-between border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          <div className="flex gap-0.5">
            {(['1D','7D','1M','3M','1Y','MAX'] as const).map(r => <RangeBtn key={r} label={r} active={range===r} onClick={()=>setRange(r)}/>)}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setChartType('candle')} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background: chartType==='candle' ? '#6366f1' : 'transparent', color: chartType==='candle' ? '#fff' : '#6b7280' }}>
              ╥ Candle
            </button>
            <button onClick={() => setChartType('line')} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background: chartType==='line' ? '#6366f1' : 'transparent', color: chartType==='line' ? '#fff' : '#6b7280' }}>
              ↗ Line
            </button>
          </div>
        </div>

        {/* Sub-timeframe */}
        <div className="px-4 py-2 flex items-center gap-1 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          {(['5m','15m','1h','4h','1d'] as const).map(t => (
            <button key={t} onClick={() => setTf(t)} className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background: tf===t ? '#f3f4f6' : 'transparent', color: tf===t ? '#111827' : '#9ca3af', fontWeight: tf===t ? 700 : 400 }}>
              {t}
            </button>
          ))}
          <span className="ml-auto text-[9px]" style={{ color: '#9ca3af' }}>
            {chartLoading ? 'Loading…' : `${ohlcv.length} candles`}
          </span>
        </div>

        {/* The chart */}
        <TVChart data={ohlcv} height={340} type={chartType} loading={chartLoading}/>
      </div>

      {/* ── External links row ────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-3">
        {token.pairAddress && <a href={`https://www.geckoterminal.com/arc/pools/${token.pairAddress}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl no-underline font-medium" style={{ background: '#fff', border:'1px solid rgba(0,0,0,0.08)', color:'#374151' }}><BarChart3 size={11}/>GeckoTerminal</a>}
        <a href={`https://dexscreener.com/arc/${token.pairAddress??token.address}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl no-underline font-medium" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)', color:'#374151' }}><Activity size={11}/>DexScreener</a>
        <a href={`${EXPLORER_BASE}/address/${token.address}`} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl no-underline font-medium" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)', color:'#374151' }}><ExternalLink size={11}/>Explorer</a>
      </div>

      {/* ── Contract info card ────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#9ca3af' }}>Contract Details</span>
        </div>
        {[
          { k:'Token Address', v:token.address,      c:true },
          { k:'Pair Address',  v:token.pairAddress,  c:!!token.pairAddress },
          { k:'DEX',           v:token.dexId||'—' },
          { k:'Network',       v:'Arc Mainnet' },
          { k:'Data source',   v:token.source||'—' },
          { k:'Change 1H',     v:pct(token.change1h)??'—' },
          { k:'Change 6H',     v:pct(token.change6h)??'—' },
          { k:'Change 5M',     v:pct(token.change5m)??'—' },
        ].filter(r=>r.v&&r.v!=='undefined').map(({k,v,c})=>(
          <div key={k} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0" style={{ borderColor:'rgba(0,0,0,0.05)' }}>
            <span className="text-xs" style={{ color:'#6b7280' }}>{k}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium font-mono" style={{ color:'#111827' }}>{(v as string).length>22?formatAddress(v as string):v}</span>
              {c && <button onClick={()=>copyAddr(v as string)}><Copy size={10} style={{ color:'#9ca3af' }}/></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

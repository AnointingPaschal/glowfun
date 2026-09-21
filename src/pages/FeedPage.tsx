import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Sprout, Trophy, Search, X, Rocket, Zap, TrendingUp, Users, DollarSign, ArrowUpRight, Star, Clock, BarChart3 } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'
import { TokenCard } from '@/components/TokenCard'
import { prefetchAllMarketData } from '@/hooks/useMarketPrice'
import { useTokenData } from '@/hooks/useTokenData'
import { formatProgress, timeAgo } from '@/utils/format'

type Tab = 'new' | 'hot' | 'graduating'

/* ── Animated counter ─────────────────────────────────────────────── */
function Counter({ to, prefix='', suffix='' }: { to:number; prefix?:string; suffix?:string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const dur=1200, start=Date.now()
    const tick = () => { const p=Math.min(1,(Date.now()-start)/dur); setV(Math.round(to*(1-Math.pow(1-p,3)))); if(p<1)requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }, [to])
  return <span>{prefix}{v.toLocaleString()}{suffix}</span>
}

/* ── Live ticker ─────────────────────────────────────────────────── */
function LiveTicker({ addresses }: { addresses: readonly `0x${string}`[] }) {
  const items = addresses.slice(-6).reverse()
  if (!items.length) return null
  return (
    <div className="rounded-xl px-3 py-2 flex items-center gap-2 overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'var(--green)'}}/>
        <span className="text-[8px] font-bold uppercase tracking-widest" style={{color:'var(--green)'}}>Live</span>
      </div>
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide text-[9px]">
        {items.map(a => (
          <Link key={a} to={`/token/${a}`} className="flex items-center gap-1 no-underline flex-shrink-0" style={{color:'var(--text2)'}}>
            <span className="font-mono">{a.slice(0,6)}…</span>
            <span style={{color:'var(--green)'}}>new</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ── King of Hill mini card ──────────────────────────────────────── */
function KingCard({ address }: { address: `0x${string}` }) {
  const { token } = useTokenData(address)
  if (!token) return null
  const hue = parseInt(address.slice(2,6),16)%360
  const raised = Number(token.state?.realUsdcRaised??0n)/1e6
  return (
    <Link to={`/token/${address}`} className="block no-underline flex-shrink-0 w-48">
      <div className="relative rounded-2xl p-3 overflow-hidden h-full"
        style={{background:'linear-gradient(135deg,rgba(245,158,11,0.07),rgba(239,68,68,0.05),rgba(139,92,246,0.07))',border:'1px solid rgba(245,158,11,0.18)'}}>
        <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 0% 0%,rgba(245,158,11,0.1),transparent 60%)'}}/>
        <div className="flex items-center gap-1 mb-2 relative">
          <Trophy size={9} style={{color:'var(--gold)'}}/><span className="text-[8px] font-black uppercase tracking-widest" style={{color:'var(--gold)'}}>King</span>
        </div>
        <div className="flex items-center gap-2 relative">
          {token.imageUri?<img src={token.imageUri} className="w-9 h-9 rounded-xl object-cover" style={{border:'1px solid rgba(245,158,11,0.3)'}}/>
            :<div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black text-white" style={{background:`linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))`}}>{token.symbol?.slice(0,2)}</div>}
          <div><div className="text-sm font-black" style={{color:'var(--text1)'}}>{token.symbol}</div><div className="text-[8px]" style={{color:'var(--gold)'}}>+${raised.toFixed(0)}</div></div>
        </div>
      </div>
    </Link>
  )
}

/* ── Featured token horizontal card ─────────────────────────────── */
function HotCard({ address, rank }: { address:`0x${string}`; rank:number }) {
  const { token } = useTokenData(address)
  if (!token) return <div className="rounded-xl shimmer flex-shrink-0 w-40 h-24" style={{border:'1px solid var(--border)'}}/>
  const hue = parseInt(address.slice(2,6),16)%360
  const raised = Number(token.state?.realUsdcRaised??0n)/1e6
  const progress = formatProgress(token.progress)
  return (
    <Link to={`/token/${address}`} className="block no-underline flex-shrink-0 w-40">
      <div className="rounded-xl p-3 h-full" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black text-white flex-shrink-0" style={{background:`linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))`}}>
            {token.imageUri?<img src={token.imageUri} className="w-7 h-7 rounded-lg object-cover"/>:token.symbol?.slice(0,2)}
          </div>
          <div><div className="text-[11px] font-black" style={{color:'var(--text1)'}}>{token.symbol}</div><div className="text-[8px]" style={{color:'var(--text2)'}}>{token.name?.slice(0,12)}</div></div>
        </div>
        <div className="h-1 rounded-full overflow-hidden mb-1" style={{background:'var(--surface3)'}}>
          <div className="h-full rounded-full" style={{width:`${Math.min(100,progress)}%`,background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/>
        </div>
        <div className="flex justify-between text-[8px]"><span style={{color:'var(--text2)'}}>{progress.toFixed(1)}%</span><span style={{color:'var(--green)'}}>${raised.toFixed(0)}</span></div>
      </div>
    </Link>
  )
}

/* ── How it works ────────────────────────────────────────────────── */
const HOW = [
  { n:'01', title:'Launch', desc:'Deploy your token with a bonding curve. No liquidity needed — 1% fee.', icon:Rocket, color:'var(--accent)' },
  { n:'02', title:'Trade',  desc:'Anyone can buy or sell on the bonding curve. Price rises as more buy.', icon:TrendingUp, color:'var(--green)' },
  { n:'03', title:'Graduate', desc:'Reach $69K in the bonding curve and your token goes to a DEX.', icon:Trophy, color:'var(--gold)' },
]

/* ── Main ─────────────────────────────────────────────────────────── */
export function FeedPage() {
  const { addresses, isLoading } = useTokenList()
  const [tab, setTab]       = useState<Tab>('new')
  const [search, setSearch] = useState('')

  useEffect(() => { prefetchAllMarketData() }, [])

  const reversed = useMemo(() => [...addresses].reverse(), [addresses])
  const total    = addresses.length

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? reversed.filter(a => a.toLowerCase().includes(q)) : reversed
  }, [reversed, search])

  const displayed = useMemo(() => {
    if (tab==='graduating') return [...filtered].slice(0, 20)
    if (tab==='hot')        return [...filtered].reverse().slice(0, 50)
    return filtered
  }, [filtered, tab])

  const TABS = [
    {id:'new' as Tab, label:'New', icon:Sprout, color:'#22c55e'},
    {id:'hot' as Tab, label:'Hot', icon:Flame,  color:'#ef4444'},
    {id:'graduating' as Tab, label:'Graduating', icon:Trophy, color:'var(--gold)'},
  ]

  return (
    <div className="space-y-4">

      {/* ── Hero ────────────────────────────────────────────────── */}
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="relative rounded-3xl p-5 overflow-hidden"
        style={{background:'linear-gradient(135deg,rgba(99,102,241,0.07),rgba(139,92,246,0.05),rgba(236,72,153,0.04))',border:'1px solid rgba(99,102,241,0.12)'}}>
        <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 30% 0%,rgba(99,102,241,0.15),transparent 60%)'}}/>
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full" style={{background:'linear-gradient(180deg,#8b5cf6,#6366f1)'}}/>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{color:'#818cf8'}}>GlowFun · Arc Mainnet</span>
          </div>
          <h1 className="text-2xl font-black mb-1.5 leading-tight" style={{letterSpacing:'-0.04em'}}>
            <span style={{color:'var(--text1)'}}>Launch your </span>
            <span style={{background:'linear-gradient(135deg,#a78bfa,#6366f1)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>meme token</span>
            <br/><span style={{color:'var(--text1)'}}>on Arc instantly.</span>
          </h1>
          <p className="text-xs mb-4" style={{color:'var(--text2)'}}>Fair bonding curve. No liquidity needed. No rug pulls.</p>
          <div className="flex gap-2.5">
            <Link to="/launch" className="no-underline">
              <motion.button whileTap={{scale:0.97}} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 20px rgba(99,102,241,0.3)'}}>
                <Rocket size={13}/>Launch Token
              </motion.button>
            </Link>
            <Link to="/ide" className="no-underline">
              <motion.button whileTap={{scale:0.97}} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text1)'}}>
                <Zap size={13}/>IDE
              </motion.button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── Live ticker ──────────────────────────────────────────── */}
      <LiveTicker addresses={addresses}/>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {icon:TrendingUp, label:'Tokens',    value:<Counter to={total}/>,       color:'var(--accent)'},
          {icon:DollarSign, label:'On Bonding', value:<Counter to={total} suffix=" active"/>, color:'var(--green)'},
          {icon:Users,      label:'Network',   value:'Arc',                       color:'var(--gold)'},
        ].map(({icon:Icon,label,value,color})=>(
          <div key={label} className="flex flex-col gap-1.5 p-3 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:`${color}15`}}><Icon size={13} style={{color}}/></div>
            <div className="text-[8px] uppercase tracking-widest font-semibold" style={{color:'var(--text2)'}}>{label}</div>
            <div className="text-sm font-black" style={{color:'var(--text1)',fontFamily:'Space Grotesk'}}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Token grid ────────────────────────────────────────── */}
      {isLoading && !addresses.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl shimmer" style={{ height:160, border:'1px solid var(--border)' }}/>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background:'var(--surface)' }}>
            <Search size={24} style={{ color:'var(--text3)' }}/>
          </div>
          <p className="text-sm font-medium" style={{ color:'var(--text2)' }}>No tokens found</p>
          <p className="text-xs mt-1" style={{ color:'var(--text3)' }}>
            {search ? 'Try a different search' : 'Be the first to launch on GlowFun!'}
          </p>
          {!search && (
            <Link to="/launch" className="no-underline mt-4 inline-block">
              <button className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                Launch now →
              </button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {displayed.map((addr, i) => (
            <TokenCard key={addr} address={addr as `0x${string}`} index={i}/>
          ))}
        </div>
      )}

      {/* ── Tabs + search ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {TABS.map(t=>{
          const active=tab===t.id; const Icon=t.icon
          return <button key={t.id} onClick={()=>setTab(t.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
            style={{background:active?`${t.color}14`:'var(--surface)',color:active?t.color:'var(--text2)',border:`1.5px solid ${active?`${t.color}30`:'var(--border)'}`}}>
            <Icon size={11}/>{t.label}
          </button>
        })}
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-xl min-w-0" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <Search size={10} style={{color:'var(--text2)',flexShrink:0}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="text-[10px] bg-transparent outline-none w-full" style={{color:'var(--text1)'}}/>
          {search&&<button onClick={()=>setSearch('')}><X size={9} style={{color:'var(--text2)'}}/></button>}
        </div>
        <span className="text-[9px] flex-shrink-0" style={{color:'var(--text2)'}}>{displayed.length}</span>
      </div>

      {/* ── Token grid ─────────────────────────────────────────────── */}
      {isLoading && !addresses.length
        ?<div className="grid grid-cols-2 gap-2.5">{Array.from({length:8}).map((_,i)=><div key={i} className="rounded-2xl shimmer" style={{height:160,border:'1px solid var(--border)'}}/>)}</div>
        :displayed.length===0
        ?<div className="text-center py-16">
           <Search size={24} style={{color:'var(--text3)'}} className="mx-auto mb-3"/>
           <p className="text-sm" style={{color:'var(--text2)'}}>{search?'No results':'Be the first to launch!'}</p>
           {!search&&<Link to="/launch" className="no-underline mt-4 inline-block"><button className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>Launch now →</button></Link>}
         </div>
        :<div className="grid grid-cols-2 gap-2.5">{displayed.map((a,i)=><TokenCard key={a} address={a as `0x${string}`} index={i}/>)}</div>}

      {/* ── How it works ──────────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="flex items-center gap-1.5 mb-4"><BarChart3 size={12} style={{color:'var(--accent)'}}/><span className="text-xs font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>How it works</span></div>
        <div className="space-y-3">
          {HOW.map(({n,title,desc,icon:Icon,color})=>(
            <div key={n} className="flex gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[9px] font-black" style={{background:`${color}15`,color}}>{n}</div>
              <div><div className="text-xs font-bold mb-0.5" style={{color:'var(--text1)'}}>{title}</div><div className="text-[10px] leading-relaxed" style={{color:'var(--text2)'}}>{desc}</div></div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.4}}
        className="rounded-2xl p-5 text-center relative overflow-hidden"
        style={{background:'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.06))',border:'1px solid rgba(99,102,241,0.15)'}}>
        <div className="absolute inset-0" style={{background:'radial-gradient(ellipse at 50% -20%,rgba(99,102,241,0.12),transparent 60%)'}}/>
        <p className="text-xs font-medium mb-3 relative" style={{color:'var(--text2)'}}>Ready to create your token?</p>
        <Link to="/launch" className="no-underline relative">
          <button className="px-6 py-2.5 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 20px rgba(99,102,241,0.3)'}}>
            <Rocket size={13}/>Create Token — Free
          </button>
        </Link>
      </motion.div>
    </div>
  )
}

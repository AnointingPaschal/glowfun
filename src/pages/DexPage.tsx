import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, RefreshCw, ChevronDown, Filter, Loader2, Globe } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'

/* ── Chain config ─────────────────────────────────────────────── */
// Logos from DexScreener's public CDN: dd.dexscreener.com/ds-data/chains/{id}.png
const CHAINS = [
  { id:'arc',        name:'Arc',         logo:'https://dd.dexscreener.com/ds-data/chains/arc.png',        fallback:'#6366f1', abbr:'A'  },
  { id:'ethereum',   name:'Ethereum',    logo:'https://dd.dexscreener.com/ds-data/chains/ethereum.png',   fallback:'#627eea', abbr:'Ξ'  },
  { id:'solana',     name:'Solana',      logo:'https://dd.dexscreener.com/ds-data/chains/solana.png',     fallback:'#9945ff', abbr:'◎'  },
  { id:'bsc',        name:'BSC',         logo:'https://dd.dexscreener.com/ds-data/chains/bsc.png',        fallback:'#f0b90b', abbr:'B'  },
  { id:'base',       name:'Base',        logo:'https://dd.dexscreener.com/ds-data/chains/base.png',       fallback:'#0052ff', abbr:'Ba' },
  { id:'polygon',    name:'Polygon',     logo:'https://dd.dexscreener.com/ds-data/chains/polygon.png',    fallback:'#8247e5', abbr:'P'  },
  { id:'avalanche',  name:'Avalanche',   logo:'https://dd.dexscreener.com/ds-data/chains/avalanche.png',  fallback:'#e84142', abbr:'AV' },
  { id:'arbitrum',   name:'Arbitrum',    logo:'https://dd.dexscreener.com/ds-data/chains/arbitrum.png',   fallback:'#28a0f0', abbr:'Ar' },
  { id:'pulsechain', name:'PulseChain',  logo:'https://dd.dexscreener.com/ds-data/chains/pulsechain.png', fallback:'#0f90e8', abbr:'Pu' },
  { id:'optimism',   name:'Optimism',    logo:'https://dd.dexscreener.com/ds-data/chains/optimism.png',   fallback:'#ff0420', abbr:'Op' },
  { id:'hyperevm',   name:'HyperEVM',    logo:'https://dd.dexscreener.com/ds-data/chains/hyperevm.png',   fallback:'#21b882', abbr:'Hy' },
  { id:'ton',        name:'TON',         logo:'https://dd.dexscreener.com/ds-data/chains/ton.png',        fallback:'#0098ea', abbr:'TO' },
  { id:'all',        name:'All Chains',  logo:'',                                                          fallback:'#374151', abbr:'∞'  },
]

const LS_KEY = 'glowfun:dex:v7'
const LS_TTL = 15 * 60 * 1000

/* ── Token type ─────────────────────────────────────────────────── */
export interface Token {
  address:string; name:string; symbol:string; logoUrl:string; chain:string
  chainLogoUrl?:string; dexLogoUrl?:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liquidityUsd?:number; volumeUsd?:number; mcapUsd?:number
  age?:number; buys24h?:number; sells24h?:number; txns5m?:number; vol5m?:number
  pairAddress?:string; dexId?:string; source:string; isGlowFun?:boolean
}

/* ── LocalStorage ───────────────────────────────────────────────── */
function lsGet(chain:string,tab:string):Token[]|null {
  try{ const d=JSON.parse(localStorage.getItem(`${LS_KEY}:${chain}:${tab}`)||'{}'); return d.ts&&Date.now()-d.ts<LS_TTL?d.v:null }catch{return null}
}
function lsSet(chain:string,tab:string,v:Token[]){
  try{localStorage.setItem(`${LS_KEY}:${chain}:${tab}`,JSON.stringify({v,ts:Date.now()}))}catch{}
}

/* ── Fetch ──────────────────────────────────────────────────────── */
async function loadTokens(chain:string,tab:string,q=''):Promise<{tokens:Token[];total:number;stats:any}>{
  try{
    const p=new URLSearchParams({chain,tab,limit:'500'});if(q)p.set('q',q)
    const r=await fetch(`/api/market?${p}`,{signal:AbortSignal.timeout(30_000)})
    if(!r.ok)return{tokens:[],total:0,stats:{}}
    const d=await r.json() as any
    return{tokens:d.data?.tokens??[],total:d.data?.total??0,stats:d.data?.stats??{}}
  }catch{return{tokens:[],total:0,stats:{}}}
}

/* ── Format ─────────────────────────────────────────────────────── */
function Px({p}:{p:number}){
  if(!p)return<span>$0</span>
  if(p>=0.01)return<span>${p>=100?p.toLocaleString('en',{maximumFractionDigits:2}):p.toFixed(p>=1?4:6)}</span>
  const s=p.toFixed(20);const m=s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if(m&&m[1].length>=3)return<span>$0.0<sub style={{fontSize:'0.6em'}}>{m[1].length}</sub>{m[2]}</span>
  return<span>${p.toFixed(8)}</span>
}
const fC=(v?:number)=>!v?'—':v>=1e9?`$${(v/1e9).toFixed(1)}B`:v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${v.toFixed(0)}`
const pC=(v?:number)=>(v??0)>=0?'#16a34a':'#dc2626'
const fP=(v?:number)=>v==null?'':v>=1000?`+${(v/1000).toFixed(1)}K%`:v<=-1000?`${(v/1000).toFixed(1)}K%`:`${v>=0?'+':''}${v.toFixed(2)}%`
const fA=(s?:number)=>!s?'':s<60?`${s}s`:s<3600?`${Math.floor(s/60)}m`:s<86400?`${Math.floor(s/3600)}h`:`${Math.floor(s/86400)}d`

/* ── ChainLogo: uses DexScreener CDN ───────────────────────────── */
function ChainLogo({chain,size=16,border=true}:{chain:string;size?:number;border?:boolean}){
  const cfg=CHAINS.find(c=>c.id===chain)||{logo:'',fallback:'#9ca3af',abbr:chain.slice(0,2).toUpperCase()}
  const [err,setErr]=useState(false)
  if (!cfg.logo||err||chain==='all') return(
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{width:size,height:size,background:cfg.fallback,fontSize:size*0.4,border:border?`2px solid white`:undefined}}>
      {cfg.abbr?.slice(0,2)}
    </div>
  )
  return <img src={cfg.logo} onError={()=>setErr(true)} className="rounded-full object-contain flex-shrink-0" style={{width:size,height:size,border:border?`2px solid white`:undefined}} alt={chain}/>
}

/* ── DexLogo: uses DexScreener CDN ─────────────────────────────── */
function DexLogo({dexId,logoUrl,size=14}:{dexId?:string;logoUrl?:string;size?:number}){
  const [err,setErr]=useState(false)
  const src=(!err&&logoUrl)||(!err&&dexId?`https://dd.dexscreener.com/ds-data/dexes/${dexId.toLowerCase()}.png`:null)
  if (!src) return<span style={{fontSize:size*0.85,color:'#9ca3af'}}>🔄</span>
  return <img src={src} onError={()=>setErr(true)} className="rounded-md object-contain flex-shrink-0" style={{width:size,height:size}} alt={dexId||'dex'}/>
}

/* ── Token row ──────────────────────────────────────────────────── */
function TokenRow({token,onClick}:{token:Token;onClick:()=>void}){
  const hue=parseInt((token.address||'000000').slice(2,6),16)%360
  const c24=token.change24h,c5m=token.change5m
  const score=token.txns5m?Math.min(999,token.txns5m):null
  return(
    <div onClick={onClick} className="flex flex-col px-3 py-2 border-b cursor-pointer transition-colors active:bg-gray-50"
      style={{borderColor:'rgba(0,0,0,0.05)'}}>
      <div className="flex items-center gap-2.5">
        {/* Token logo + chain badge */}
        <div className="relative flex-shrink-0">
          {token.logoUrl
            ?<img src={token.logoUrl} className="w-9 h-9 rounded-full object-cover border" style={{borderColor:'rgba(0,0,0,0.08)'}}
               onError={e=>{(e.target as any).style.display='none'}}/>
            :<div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
               style={{background:`linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))`}}>
               {token.symbol.slice(0,2)}
             </div>}
          <div className="absolute -bottom-0.5 -right-0.5">
            <ChainLogo chain={token.chain} size={14} border/>
          </div>
        </div>
        {/* Symbol + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-bold leading-tight" style={{color:'#111827'}}>{token.symbol}</span>
            {token.age!=null&&<span className="text-[9px] font-semibold" style={{color:'#16a34a'}}>▼{fA(token.age)}</span>}
            {score!=null&&(
              <span className="text-[8px] font-bold px-1 py-px rounded flex items-center gap-0.5" style={{background:'#fef9c3',color:'#854d0e',border:'1px solid #fde68a'}}>
                ⚡{score}
              </span>
            )}
            {token.isGlowFun&&<span className="text-[7px] px-1 py-px rounded font-bold" style={{background:'rgba(99,102,241,0.1)',color:'#6366f1'}}>GLW</span>}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <DexLogo dexId={token.dexId} logoUrl={token.dexLogoUrl} size={11}/>
            <span className="text-[9px] truncate max-w-[90px]" style={{color:'#9ca3af'}}>{token.name}</span>
          </div>
        </div>
        {/* Price + changes */}
        <div className="text-right flex-shrink-0">
          <div className="text-[12px] font-bold tabular-nums leading-tight" style={{color:'#111827'}}><Px p={token.priceUsd}/></div>
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            {c5m!=null&&<span className="text-[9px] font-semibold" style={{color:pC(c5m)}}>5M {fP(c5m)}</span>}
            <span className="text-[10px] font-bold" style={{color:pC(c24)}}>24H {fP(c24)}</span>
          </div>
        </div>
      </div>
      {/* Row 2: LIQ / VOL / MCAP */}
      <div className="flex items-center gap-2 mt-1 pl-11">
        {[{k:'LIQ',v:token.liquidityUsd},{k:'VOL',v:token.volumeUsd},{k:'MCAP',v:token.mcapUsd}].map(({k,v})=>(
          <span key={k} className="text-[8.5px]" style={{color:'#6b7280'}}>
            {k} <span style={{color:'#374151',fontWeight:600}}>{fC(v)}</span>
          </span>
        ))}
        {token.buys24h!=null&&(
          <span className="text-[8px] ml-auto">
            <span style={{color:'#16a34a'}}>{token.buys24h}B</span>/<span style={{color:'#dc2626'}}>{token.sells24h??0}S</span>
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Chain selector sheet ───────────────────────────────────────── */
function ChainSheet({selected,onSelect,onClose}:{selected:string;onSelect:(id:string)=>void;onClose:()=>void}){
  const [q,setQ]=useState('')
  const list=CHAINS.filter(c=>!q||c.name.toLowerCase().includes(q.toLowerCase()))
  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-end" style={{background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring',stiffness:350,damping:32}}
        className="w-full rounded-t-3xl overflow-hidden" style={{background:'#fff',maxHeight:'88dvh'}}>
        <div className="flex justify-center pt-3 pb-0.5 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{background:'#e5e7eb'}}/>
        </div>
        <div className="px-4 py-3 overflow-y-auto">
          <h3 className="text-base font-bold mb-3" style={{color:'#111827'}}>Select Chain</h3>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4" style={{background:'#f3f4f6',border:'1px solid rgba(0,0,0,0.07)'}}>
            <Search size={13} style={{color:'#9ca3af'}}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search chains…" autoFocus
              className="text-sm bg-transparent outline-none flex-1" style={{color:'#111827'}}/>
          </div>
          <div className="grid grid-cols-2 gap-2 pb-6">
            {list.map(chain=>{
              const active=selected===chain.id
              return(
                <button key={chain.id} onClick={()=>{onSelect(chain.id);onClose()}}
                  className="flex items-center gap-3 p-3.5 rounded-2xl transition-all text-left"
                  style={{background:active?`rgba(99,102,241,0.06)`:'#f9fafb',border:`1.5px solid ${active?'#6366f1':'rgba(0,0,0,0.07)'}`}}>
                  {chain.id==='all'
                    ?<div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{background:'#f3f4f6'}}>🌐</div>
                    :<ChainLogo chain={chain.id} size={40} border={false}/>}
                  <div>
                    <div className="text-sm font-bold" style={{color:active?'#6366f1':'#111827'}}>{chain.name}</div>
                    {active&&<div className="text-[9px] font-semibold" style={{color:'#6366f1'}}>Selected ✓</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── DEX selector sheet ─────────────────────────────────────────── */
function DexSheet({dexes,selected,onSelect,onClose}:{dexes:{id:string;logo:string}[];selected:string;onSelect:(d:string)=>void;onClose:()=>void}){
  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-end" style={{background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring',stiffness:350,damping:32}}
        className="w-full rounded-t-3xl overflow-hidden" style={{background:'#fff',maxHeight:'75dvh'}}>
        <div className="flex justify-center pt-3 pb-0.5"><div className="w-10 h-1 rounded-full" style={{background:'#e5e7eb'}}/></div>
        <div className="px-4 py-3 overflow-y-auto pb-6">
          <h3 className="text-base font-bold mb-3" style={{color:'#111827'}}>Select DEX</h3>
          <div className="grid grid-cols-2 gap-2">
            {/* All DEXes */}
            <button onClick={()=>{onSelect('all');onClose()}}
              className="flex items-center gap-3 p-3.5 rounded-2xl"
              style={{background:selected==='all'?'rgba(99,102,241,0.06)':'#f9fafb',border:`1.5px solid ${selected==='all'?'#6366f1':'rgba(0,0,0,0.07)'}`}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{background:'#f3f4f6'}}>↔</div>
              <span className="text-sm font-bold" style={{color:selected==='all'?'#6366f1':'#111827'}}>All DEXes</span>
            </button>
            {dexes.map(d=>{
              const active=selected===d.id
              return(
                <button key={d.id} onClick={()=>{onSelect(d.id);onClose()}}
                  className="flex items-center gap-3 p-3.5 rounded-2xl"
                  style={{background:active?'rgba(99,102,241,0.06)':'#f9fafb',border:`1.5px solid ${active?'#6366f1':'rgba(0,0,0,0.07)'}`}}>
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center" style={{background:'#f3f4f6'}}>
                    <DexLogo dexId={d.id} logoUrl={d.logo} size={28}/>
                  </div>
                  <span className="text-sm font-bold capitalize" style={{color:active?'#6366f1':'#111827'}}>{d.id}</span>
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────── */
type Tab='trending'|'new'|'top'
const TABS=[
  {id:'trending' as Tab,icon:'🔥',label:'Trending',sub:'5M',color:'#6366f1'},
  {id:'new'      as Tab,icon:'🌱',label:'New',     sub:'',  color:'#16a34a'},
  {id:'top'      as Tab,icon:'📊',label:'Top',     sub:'',  color:'#f59e0b'},
]

export function TrendingPage(){
  const navigate=useNavigate()
  const {addresses:glowAddrs}=useTokenList()

  const [chain,setChain]=useState('arc')
  const [tab,setTab]    =useState<Tab>('trending')
  const [tokens,setToks]=useState<Token[]>(()=>lsGet('arc','trending')??[])
  const [total,setTotal]=useState(0)
  const [stats,setStats]=useState<any>({})
  const [loading,setLoad]=useState(!(lsGet('arc','trending')?.length))
  const [silent,setSilent]=useState(false)
  const [search,setSearch]=useState('')
  const [dexF,setDexF]  =useState('all')
  const [showCS,setCS]  =useState(false)
  const [showDS,setDS]  =useState(false)

  const chainCfg=CHAINS.find(c=>c.id===chain)??CHAINS[0]

  const load=useCallback(async(ch:string,t:string,q='',sil=false)=>{
    sil?setSilent(true):setLoad(true)
    const{tokens:raw,total:tot,stats:st}=await loadTokens(ch,t,q)
    if(raw.length){
      const gs=new Set(glowAddrs.map(a=>a.toLowerCase()))
      setToks(raw.map(tk=>({...tk,isGlowFun:gs.has(tk.address.toLowerCase())})))
      setTotal(tot);setStats(st)
      if(!q)lsSet(ch,t,raw)
    }
    setLoad(false);setSilent(false)
  },[glowAddrs.join(',')])

  useEffect(()=>{
    const cached=lsGet(chain,tab)
    if(cached?.length){setToks(cached);setLoad(false);load(chain,tab,'',true)}
    else load(chain,tab)
    setDexF('all')
  },[chain,tab])

  useEffect(()=>{
    if(!glowAddrs.length)return
    const s=new Set(glowAddrs.map(a=>a.toLowerCase()))
    setToks(p=>p.map(t=>({...t,isGlowFun:s.has(t.address.toLowerCase())})))
  },[glowAddrs.join(',')])

  useEffect(()=>{
    const t=setTimeout(()=>{if(search.length>=2||search==='')load(chain,tab,search.length>=2?search:'',false)},400)
    return()=>clearTimeout(t)
  },[search])

  const dexes=useMemo(()=>{
    const m=new Map<string,string>()
    tokens.forEach(t=>{if(t.dexId&&!m.has(t.dexId))m.set(t.dexId,t.dexLogoUrl??`https://dd.dexscreener.com/ds-data/dexes/${t.dexId.toLowerCase()}.png`)})
    return[...m.entries()].slice(0,16).map(([id,logo])=>({id,logo}))
  },[tokens.length])

  const displayed=useMemo(()=>(dexF==='all'?tokens:tokens.filter(t=>t.dexId===dexF)),[tokens,dexF])

  const v5m  = fC(stats.vol5m  || displayed.reduce((s,t)=>s+(t.vol5m??0),0))
  const txns = (stats.txns || displayed.reduce((s,t)=>s+(t.txns5m??0),0)).toLocaleString()

  return(
    <div>
      {/* ── Tab bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3">
        {TABS.map(t=>{
          const active=tab===t.id
          return(
            <button key={t.id} onClick={()=>{setTab(t.id);setDexF('all')}}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
              style={{background:active?t.color:'#fff',color:active?'#fff':'#6b7280',
                border:`1.5px solid ${active?t.color:'rgba(0,0,0,0.08)'}`,
                boxShadow:active?`0 2px 10px ${t.color}35`:'none'}}>
              {t.icon} {t.label} {t.sub&&<span className="text-[8px] opacity-70">{t.sub}</span>}
            </button>
          )
        })}
        <button onClick={()=>load(chain,tab,search,false)} className="ml-auto p-2 rounded-xl"
          style={{background:'#fff',border:'1px solid rgba(0,0,0,0.08)'}}>
          <RefreshCw size={13} className={loading||silent?'animate-spin':''} style={{color:'#6b7280'}}/>
        </button>
      </div>

      {/* ── Stats strip ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[{label:'5M VOLUME',val:v5m},{label:'5M TXNS',val:txns},{label:'TOKENS',val:String(total||displayed.length)}].map(s=>(
          <div key={s.label} className="px-2 py-2 rounded-xl text-center" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.07)'}}>
            <div className="text-[8px] font-bold uppercase tracking-widest" style={{color:'#9ca3af'}}>{s.label}</div>
            <div className="text-sm font-bold mt-0.5" style={{color:'#111827',fontFamily:'Space Grotesk,sans-serif'}}>
              {loading&&!tokens.length?<Loader2 size={12} className="animate-spin inline" style={{color:'#9ca3af'}}/>:s.val}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chain + DEX + search row ───────────────────────── */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
        {/* Chain button with real logo */}
        <button onClick={()=>setCS(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
          style={{background:chainCfg.fallback,color:'#fff',border:`1.5px solid ${chainCfg.fallback}`,boxShadow:`0 2px 8px ${chainCfg.fallback}35`}}>
          <ChainLogo chain={chain} size={16} border={false}/>
          <span>{chainCfg.name}</span>
          <ChevronDown size={10}/>
        </button>
        {/* DEX filter button */}
        <button onClick={()=>setDS(true)}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
          style={{background:'#fff',color:'#374151',border:'1.5px solid rgba(0,0,0,0.09)'}}>
          {dexF!=='all'
            ?<DexLogo dexId={dexF} size={14}/>
            :<Filter size={11} style={{color:'#6b7280'}}/>}
          <span>{dexF==='all'?'All DEXes':dexF}</span>
          <ChevronDown size={10}/>
        </button>
        {/* Search */}
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-xl min-w-0"
          style={{background:'#fff',border:'1px solid rgba(0,0,0,0.08)'}}>
          <Search size={11} style={{color:'#9ca3af',flexShrink:0}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            className="text-[11px] bg-transparent outline-none w-full min-w-0" style={{color:'#111827'}}/>
          {search&&<button onClick={()=>setSearch('')}><X size={10} style={{color:'#9ca3af'}}/></button>}
        </div>
        <span className="text-[10px] flex-shrink-0 font-medium" style={{color:'#9ca3af'}}>{displayed.length}</span>
      </div>

      {/* ── Token list ─────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
        {loading&&!tokens.length
          ?Array.from({length:12}).map((_,i)=>(
            <div key={i} className="flex items-center gap-2.5 px-3 py-3 border-b animate-pulse" style={{borderColor:'rgba(0,0,0,0.04)'}}>
              <div className="w-9 h-9 rounded-full flex-shrink-0" style={{background:'#f3f4f6'}}/>
              <div className="flex-1 space-y-1.5">
                <div className="flex gap-2"><div className="h-3 w-16 rounded" style={{background:'#e5e7eb'}}/><div className="h-2 w-8 rounded" style={{background:'#f3f4f6'}}/></div>
                <div className="flex gap-2"><div className="h-2 w-12 rounded" style={{background:'#f3f4f6'}}/><div className="h-2 w-10 rounded" style={{background:'#f3f4f6'}}/></div>
              </div>
              <div className="space-y-1.5"><div className="h-3 w-14 rounded ml-auto" style={{background:'#e5e7eb'}}/><div className="h-2 w-16 rounded ml-auto" style={{background:'#f3f4f6'}}/></div>
            </div>
          ))
          :displayed.length===0
            ?<div className="py-12 text-center"><p className="text-sm font-medium" style={{color:'#9ca3af'}}>{search?'No matching tokens':'No tokens found — fetching from DexScreener…'}</p></div>
            :displayed.map((t,i)=><TokenRow key={`${t.chain}:${t.address}:${i}`} token={t} onClick={()=>navigate(`/dex/${t.address}`,{state:{token:t}})}/>)}
        {silent&&<div className="flex items-center justify-center gap-1.5 py-2 text-[9px]" style={{color:'#9ca3af'}}><Loader2 size={9} className="animate-spin"/>Refreshing from DexScreener…</div>}
      </div>

      {/* ── Sheets ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showCS&&<ChainSheet selected={chain} onSelect={c=>{setChain(c)}} onClose={()=>setCS(false)}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showDS&&<DexSheet dexes={dexes} selected={dexF} onSelect={setDexF} onClose={()=>setDS(false)}/>}
      </AnimatePresence>
    </div>
  )
}

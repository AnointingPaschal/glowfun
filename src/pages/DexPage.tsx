import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, RefreshCw, ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'

const LS_KEY = 'glowfun:dex:v5'
const LS_TTL = 10 * 60 * 1000

export interface Token {
  address:string; name:string; symbol:string; logoUrl:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liquidityUsd?:number; volumeUsd?:number; mcapUsd?:number
  age?:number; buys24h?:number; sells24h?:number
  pairAddress?:string; dexId?:string; source:string; isGlowFun?:boolean
}

function loadCache(): Token[]|null {
  try { const d=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); return d.ts&&Date.now()-d.ts<LS_TTL?d.tokens:null } catch { return null }
}
function saveCache(t:Token[]) { try{localStorage.setItem(LS_KEY,JSON.stringify({tokens:t,ts:Date.now()}))}catch{} }

/* ── helpers ───────────────────────────────────────────────────── */
function Px({p}:{p:number}) {
  if (!p) return <span>$0</span>
  if (p>=0.01) return <span>${p>=100?p.toLocaleString('en',{maximumFractionDigits:2}):p.toFixed(p>=1?4:6)}</span>
  const s=p.toFixed(20); const m=s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m&&m[1].length>=3) return <span>$0.0<sub style={{fontSize:'0.6em'}}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
}
const fC=(v?:number)=>!v?'—':v>=1e9?`$${(v/1e9).toFixed(1)}B`:v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${v.toFixed(0)}`
const pC=(v?:number)=>(v??0)>=0?'#16a34a':'#dc2626'
const fP=(v?:number)=>v==null?'':`${v>=0?'+':''}${v.toFixed(2)}%`
const fA=(s?:number)=>!s?'':s<3600?`${Math.floor(s/60)}m`:s<86400?`${Math.floor(s/3600)}h`:`${Math.floor(s/86400)}d`

async function fetchTokens(q=''): Promise<{tokens:Token[];total:number}> {
  try {
    const p=new URLSearchParams({limit:'500'}); if(q)p.set('q',q)
    const r=await fetch(`/api/market?${p}`,{signal:AbortSignal.timeout(25_000)})
    if(!r.ok)return{tokens:[],total:0}
    const d=await r.json() as any
    return{tokens:d.data?.tokens??[],total:d.data?.total??0}
  } catch{return{tokens:[],total:0}}
}

/* ── Token row ────────────────────────────────────────────────── */
function TokenRow({token,onClick}:{token:Token;onClick:()=>void}) {
  const hue=parseInt(token.address.slice(2,6),16)%360
  const c24=token.change24h

  return (
    <div onClick={onClick}
      className="flex flex-col px-3 py-2.5 border-b cursor-pointer transition-colors"
      style={{ borderColor:'rgba(0,0,0,0.05)' }}
      onMouseEnter={e=>(e.currentTarget.style.background='rgba(0,0,0,0.02)')}
      onMouseLeave={e=>(e.currentTarget.style.background='')}>
      {/* Row 1 */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          {token.logoUrl
            ? <img src={token.logoUrl} className="w-9 h-9 rounded-full object-cover border" style={{borderColor:'rgba(0,0,0,0.07)'}} onError={e=>{(e.target as any).style.display='none'}}/>
            : <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{background:`linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))`}}>{token.symbol.slice(0,2)}</div>}
          {token.isGlowFun&&<div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px]" style={{background:'linear-gradient(135deg,#8b5cf6,#ec4899)',border:'1.5px solid white'}}>⚡</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold leading-tight" style={{color:'#111827'}}>{token.symbol}</span>
            {fA(token.age)&&<span className="text-[9px] font-semibold" style={{color:'#16a34a'}}>▼{fA(token.age)}</span>}
          </div>
          <div className="text-[9px] truncate" style={{color:'#9ca3af'}}>{token.name}{token.dexId&&<span className="ml-1 opacity-70">· {token.dexId}</span>}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[12px] font-bold tabular-nums leading-tight" style={{color:'#111827'}}><Px p={token.priceUsd}/></div>
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            {token.change5m!=null&&<span className="text-[9px] font-medium" style={{color:pC(token.change5m)}}>5M {fP(token.change5m)}</span>}
            <span className="text-[10px] font-bold" style={{color:pC(c24)}}>24H {fP(c24)}</span>
          </div>
        </div>
      </div>
      {/* Row 2 */}
      <div className="flex items-center gap-1 mt-1 pl-11">
        {[{k:'LIQ',v:token.liquidityUsd},{k:'VOL',v:token.volumeUsd},{k:'MCAP',v:token.mcapUsd}].map(({k,v})=>(
          <span key={k} className="text-[8.5px] px-1.5 py-0.5 rounded-md" style={{background:'#f9fafb',border:'1px solid rgba(0,0,0,0.08)',color:'#6b7280'}}>
            {k} <span style={{color:'#374151',fontWeight:600}}>{fC(v)}</span>
          </span>
        ))}
        {token.buys24h!=null&&<span className="text-[8.5px] ml-auto"><span style={{color:'#16a34a'}}>{token.buys24h}B</span>/<span style={{color:'#dc2626'}}>{token.sells24h??0}S</span></span>}
      </div>
    </div>
  )
}

type SK='volume'|'mcap'|'change24h'|'change1h'|'liquidity'|'age'|'price'
type FK='all'|'glowfun'|'new'|'trending'

export function TrendingPage() {
  const navigate = useNavigate()
  const { addresses: glowAddrs } = useTokenList()
  const cached = useMemo(loadCache, [])

  const [tokens, setTokens]   = useState<Token[]>(cached??[])
  const [total, setTotal]     = useState(cached?.length??0)
  const [loading, setLoading] = useState(!cached)
  const [silentRef, setSR]    = useState(false)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<FK>('all')
  const [dexF, setDexF]       = useState('all')
  const [sort, setSort]       = useState<SK>('volume')
  const [dir, setDir]         = useState<'desc'|'asc'>('desc')

  const load = useCallback(async (q='',silent=false) => {
    silent?setSR(true):setLoading(true)
    const {tokens:raw,total:tot}=await fetchTokens(q)
    if(raw.length){setTokens(raw);setTotal(tot);if(!q)saveCache(raw)}
    setLoading(false);setSR(false)
  },[])

  useEffect(()=>{cached?load('',true):load()},[])

  useEffect(()=>{
    if(!glowAddrs.length)return
    const s=new Set(glowAddrs.map(a=>a.toLowerCase()))
    setTokens(p=>p.map(t=>({...t,isGlowFun:s.has(t.address.toLowerCase())})))
  },[glowAddrs.join(',')])

  useEffect(()=>{
    const t=setTimeout(()=>load(search.length>=2||search===''?search:''),350)
    return()=>clearTimeout(t)
  },[search,load])

  const dexes = useMemo(()=>{
    const m=new Map<string,number>()
    tokens.forEach(t=>{if(t.dexId)m.set(t.dexId,(m.get(t.dexId)??0)+1)})
    return[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id])=>id)
  },[tokens.length])

  const toggleSort=(k:SK)=>{ if(sort===k)setDir(d=>d==='desc'?'asc':'desc'); else{setSort(k);setDir('desc')} }

  const displayed = useMemo(()=>{
    let list=[...tokens]
    if(dexF!=='all')list=list.filter(t=>t.dexId===dexF)
    if(filter==='glowfun')list=list.filter(t=>t.isGlowFun)
    else if(filter==='new')list=list.filter(t=>(t.age??Infinity)<86400)
    else if(filter==='trending')list=[...list].sort((a,b)=>((b.buys24h??0)+(b.sells24h??0))-((a.buys24h??0)+(a.sells24h??0))).slice(0,50)
    // Sort
    list.sort((a,b)=>{
      const g=(t:Token)=>({volume:t.volumeUsd??0,mcap:t.mcapUsd??0,change24h:t.change24h??-999,change1h:t.change1h??-999,liquidity:t.liquidityUsd??0,age:t.age??999999,price:t.priceUsd})[sort]??0
      const diff=dir==='desc'?g(b)-g(a):g(a)-g(b)
      if(diff!==0)return diff
      return(b.logoUrl?1:0)-(a.logoUrl?1:0) // logos first as tiebreaker
    })
    // Tokens with logos bubble up
    if(filter!=='new'){
      list.sort((a,b)=>{
        if(!!a.logoUrl===!!b.logoUrl)return 0
        return b.logoUrl?1:-1
      })
    }
    return list
  },[tokens,filter,dexF,sort,dir])

  const Pill=({label,active,onClick}:{label:string;active:boolean;onClick:()=>void})=>(
    <button onClick={onClick} className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold capitalize whitespace-nowrap flex-shrink-0 transition-all"
      style={{background:active?'#6366f1':active?'#fff':'#f9fafb',color:active?'#fff':'#374151',border:`1px solid ${active?'#6366f1':'rgba(0,0,0,0.1)'}`}}>
      {label}
    </button>
  )

  const SortBtn=({k,label}:{k:SK;label:string})=>(
    <button onClick={()=>toggleSort(k)} className="flex items-center gap-0.5 text-[9px] font-semibold px-2 py-1 rounded-lg transition-all flex-shrink-0"
      style={{background:sort===k?'#6366f1':'#f3f4f6',color:sort===k?'#fff':'#6b7280',border:`1px solid ${sort===k?'#6366f1':'rgba(0,0,0,0.08)'}`}}>
      {label}{sort===k&&(dir==='desc'?<ChevronDown size={8}/>:<ChevronUp size={8}/>)}
    </button>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold" style={{fontFamily:'Space Grotesk,sans-serif',color:'#111827'}}>
            Dex <span style={{color:'#6366f1'}}>Arc</span>
          </h1>
          <p className="text-[10px]" style={{color:'#9ca3af'}}>
            {loading&&!tokens.length?<span className="flex items-center gap-1"><Loader2 size={9} className="animate-spin"/>Fetching…</span>:`${total} tokens · DexScreener + GeckoTerminal`}
          </p>
        </div>
        <button onClick={()=>load('',false)} disabled={loading} className="p-2 rounded-xl disabled:opacity-40 transition-all"
          style={{background:'#f3f4f6',border:'1px solid rgba(0,0,0,0.08)'}}>
          <RefreshCw size={13} className={loading||silentRef?'animate-spin':''} style={{color:'#6b7280'}}/>
        </button>
      </div>

      {/* Category + search */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
        <Pill label="All" active={filter==='all'} onClick={()=>setFilter('all')}/>
        <Pill label="Trending" active={filter==='trending'} onClick={()=>setFilter('trending')}/>
        <Pill label="New <24h" active={filter==='new'} onClick={()=>setFilter('new')}/>
        <Pill label="GlowFun" active={filter==='glowfun'} onClick={()=>setFilter('glowfun')}/>
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl flex-1 min-w-0 ml-1" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.1)'}}>
          <Search size={10} style={{color:'#9ca3af',flexShrink:0}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="text-[10px] bg-transparent outline-none w-full min-w-0" style={{color:'#111827'}}/>
          {search&&<button onClick={()=>setSearch('')}><X size={9} style={{color:'#9ca3af'}}/></button>}
        </div>
      </div>

      {/* DEX pills */}
      {dexes.length>0&&(
        <div className="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-hide">
          <button onClick={()=>setDexF('all')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap flex-shrink-0"
            style={{background:dexF==='all'?'#374151':'#f3f4f6',color:dexF==='all'?'#fff':'#6b7280',border:`1px solid ${dexF==='all'?'#374151':'rgba(0,0,0,0.08)'}`}}>
            ↔ All DEXes
          </button>
          {dexes.map(d=>(
            <button key={d} onClick={()=>setDexF(dexF===d?'all':d)}
              className="px-2.5 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap flex-shrink-0"
              style={{background:dexF===d?'#6366f1':'#f3f4f6',color:dexF===d?'#fff':'#6b7280',border:`1px solid ${dexF===d?'#6366f1':'rgba(0,0,0,0.08)'}`}}>
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-hide">
        <span className="text-[9px] flex-shrink-0" style={{color:'#9ca3af'}}>Sort:</span>
        <SortBtn k="volume" label="Vol"/>
        <SortBtn k="mcap" label="MCap"/>
        <SortBtn k="change24h" label="24H%"/>
        <SortBtn k="change1h" label="1H%"/>
        <SortBtn k="liquidity" label="Liq"/>
        <SortBtn k="age" label="New"/>
        <SortBtn k="price" label="Price"/>
        <span className="ml-auto text-[9px] flex-shrink-0 pl-1" style={{color:'#9ca3af'}}>{displayed.length}</span>
      </div>

      {/* List */}
      <div className="rounded-2xl overflow-hidden" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
        {loading&&!tokens.length
          ?Array.from({length:12}).map((_,i)=>(
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b animate-pulse" style={{borderColor:'rgba(0,0,0,0.05)'}}>
                <div className="w-9 h-9 rounded-full flex-shrink-0" style={{background:'#f3f4f6'}}/>
                <div className="flex-1 space-y-1.5"><div className="flex gap-2"><div className="h-3 w-16 rounded" style={{background:'#e5e7eb'}}/><div className="h-2 w-8 rounded" style={{background:'#f3f4f6'}}/></div><div className="flex gap-1"><div className="h-2 w-12 rounded" style={{background:'#f3f4f6'}}/><div className="h-2 w-10 rounded" style={{background:'#f3f4f6'}}/></div></div>
                <div className="text-right space-y-1.5"><div className="h-3 w-14 rounded ml-auto" style={{background:'#e5e7eb'}}/><div className="h-2 w-16 rounded ml-auto" style={{background:'#f3f4f6'}}/></div>
              </div>
            ))
          :displayed.length===0
            ?<div className="py-12 text-center"><p className="text-sm" style={{color:'#9ca3af'}}>{search?'No matching tokens':'No tokens found'}</p></div>
            :displayed.map((t,i)=><TokenRow key={`${t.address}-${i}`} token={t} onClick={()=>navigate(`/dex/${t.address}`,{state:{token:t}})}/>)}
        {silentRef&&<div className="flex items-center justify-center gap-1.5 py-2 text-[9px]" style={{color:'#9ca3af'}}><Loader2 size={9} className="animate-spin"/>Refreshing…</div>}
      </div>
    </div>
  )
}

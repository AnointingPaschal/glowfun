import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, RefreshCw, ChevronDown, Filter, Loader2, Flame, Sprout, BarChart3, Circle } from 'lucide-react'
import { useTokenList } from '@/hooks/useTokenList'

const LS_KEY = 'glowfun:arc:v3'
const LS_TTL = 5 * 60 * 1000  // 5 min

export interface Token {
  address:string; pairAddress:string; name:string; symbol:string; logoUrl:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liqUsd:number; volUsd:number; mcapUsd:number; ageSec:number
  buys24h:number; sells24h:number; txns5m:number; vol5m:number; dexId:string
  updatedAt:number; isGlowFun?:boolean
}

/* ── LS cache ─────────────────────────────────────────────────── */
function lsGet(tab:string):Token[]|null {
  try{const d=JSON.parse(localStorage.getItem(`${LS_KEY}:${tab}`)||'{}');return d.ts&&Date.now()-d.ts<LS_TTL?d.v:null}catch{return null}
}
function lsSet(tab:string,v:Token[]){
  try{localStorage.setItem(`${LS_KEY}:${tab}`,JSON.stringify({v,ts:Date.now()}))}catch{}
}

/* ── Fetch ─────────────────────────────────────────────────────── */
async function fetchArcTokens(tab:string,q=''):Promise<{tokens:Token[];total:number;stats:any;newestAgeSec?:number}>{
  try{
    const p=new URLSearchParams({tab,limit:'500'}); if(q)p.set('q',q)
    const r=await fetch(`/api/market?${p}`,{signal:AbortSignal.timeout(20_000)})
    if(!r.ok)return{tokens:[],total:0,stats:{}}
    const d=await r.json() as any
    const tokens=(d.data?.tokens??[]).map((t:any)=>({
      address:    t.address??'',
      pairAddress:t.pairAddress??t.pair_address??'',
      name:       t.name??'',
      symbol:     t.symbol??'',
      logoUrl:    t.logoUrl??t.logo_url??'',
      priceUsd:   t.priceUsd??t.price_usd??0,
      change5m:   t.change5m??t.change_5m,
      change1h:   t.change1h??t.change_1h,
      change6h:   t.change6h??t.change_6h,
      change24h:  t.change24h??t.change_24h,
      liqUsd:     t.liqUsd??t.liq_usd??0,
      volUsd:     t.volUsd??t.vol_usd??0,
      mcapUsd:    t.mcapUsd??t.mcap_usd??0,
      ageSec:     t.ageSec??t.age_sec??0,
      buys24h:    t.buys24h??t.buys_24h??0,
      sells24h:   t.sells24h??t.sells_24h??0,
      txns5m:     t.txns5m??t.txns_5m??0,
      vol5m:      t.vol5m??t.vol_5m??0,
      dexId:      t.dexId??t.dex_id??'',
      updatedAt:  t.updatedAt??t.updated_at??0,
    }))
    return{tokens,total:d.data?.total??0,stats:d.data?.stats??{},newestAgeSec:d.data?.newestAgeSec}
  }catch{return{tokens:[],total:0,stats:{}}}
}

/* ── Format ────────────────────────────────────────────────────── */
function Px({p}:{p:number}){
  if(!p)return<span>$0</span>
  if(p>=0.01)return<span>${p>=100?p.toLocaleString('en',{maximumFractionDigits:2}):p.toFixed(p>=1?4:6)}</span>
  const s=p.toFixed(20);const m=s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if(m&&m[1].length>=3)return<span>$0.0<sub style={{fontSize:'0.6em'}}>{m[1].length}</sub>{m[2]}</span>
  return<span>${p.toFixed(8)}</span>
}
const fC=(v:number)=>!v?'—':v>=1e9?`$${(v/1e9).toFixed(1)}B`:v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${v.toFixed(0)}`
const pC=(v?:number)=>(v??0)>=0?'#16a34a':'#dc2626'
const fP=(v?:number)=>v==null?'':v>=1000?`+${(v/1000).toFixed(1)}K%`:v<=-1000?`${(v/1000).toFixed(1)}K%`:`${v>=0?'+':''}${v.toFixed(2)}%`
const fA=(s:number)=>{
  if(!s)return''
  if(s<60)return`${s}s`
  if(s<3600)return`${Math.floor(s/60)}m`
  if(s<86400)return`${Math.floor(s/3600)}h`
  return`${Math.floor(s/86400)}d`
}

/* ── Arc chain logo ────────────────────────────────────────────── */
function ArcLogo({size=20}:{size?:number}){
  const [err,setErr]=useState(false)
  if(!err) return(
    <img src="https://dd.dexscreener.com/ds-data/chains/arc.png" onError={()=>setErr(true)}
      style={{width:size,height:size,borderRadius:4,objectFit:'contain'}} alt="Arc"/>
  )
  // Fallback: dark square "A" matching DexScreener's Arc icon style
  return(
    <div className="flex items-center justify-center rounded text-white font-black flex-shrink-0"
      style={{width:size,height:size,background:'#1a1a2e',fontSize:size*0.5}}>A</div>
  )
}

/* ── Token logo — question mark fallback, NO colored background ── */
function TokenLogo({token,size}:{token:Token;size:number}){
  const [idx,setIdx]=useState(0)
  const [failed,setFailed]=useState(!token.logoUrl&&!token.address)
  const srcs=[
    token.logoUrl||null,
    token.address?`https://dd.dexscreener.com/ds-data/tokens/arc/${token.address}.png`:null,
  ].filter(Boolean) as string[]

  useEffect(()=>{ setIdx(0); setFailed(!token.logoUrl&&!token.address) },[token.address])

  if(failed||!srcs.length||!srcs[idx]) return(
    <div className="rounded-full flex items-center justify-center flex-shrink-0 border"
      style={{width:size,height:size,background:'#f9fafb',borderColor:'#e5e7eb'}}>
      <span style={{color:'#9ca3af',fontSize:size*0.45,fontWeight:500}}>?</span>
    </div>
  )
  return(
    <img src={srcs[idx]} className="rounded-full object-cover flex-shrink-0 border"
      style={{width:size,height:size,borderColor:'rgba(0,0,0,0.08)'}}
      onError={()=>{ if(idx+1<srcs.length)setIdx(i=>i+1); else setFailed(true) }}/>
  )
}

/* ── DEX logo ──────────────────────────────────────────────────── */
function DexLogo({dexId,size=12}:{dexId:string;size?:number}){
  const [err,setErr]=useState(false)
  if(!dexId||err)return<Circle size={size} style={{color:'#d1d5db'}}/>
  return<img src={`https://dd.dexscreener.com/ds-data/dexes/${dexId.toLowerCase()}.png`}
    className="rounded flex-shrink-0" style={{width:size,height:size}} onError={()=>setErr(true)} alt={dexId}/>
}

/* ── Token row ─────────────────────────────────────────────────── */
function TokenRow({token,onClick}:{token:Token;onClick:()=>void}){
  const c24=token.change24h,c5m=token.change5m
  const score=token.txns5m?Math.min(999,token.txns5m):null
  const ageLabel=fA(token.ageSec)
  return(
    <div onClick={onClick} className="flex flex-col px-3 py-2 border-b cursor-pointer transition-colors active:bg-gray-50"
      style={{borderColor:'rgba(0,0,0,0.05)'}}>
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <TokenLogo token={token} size={36}/>
          {/* Arc badge */}
          <div className="absolute -bottom-0.5 -right-0.5">
            <ArcLogo size={14}/>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold leading-tight" style={{color:'#111827'}}>{token.symbol}</span>
            {ageLabel&&(
              <span className="text-[9px] font-semibold flex items-center gap-0.5" style={{color:'#16a34a'}}>
                <Sprout size={9}/>{ageLabel}
              </span>
            )}
            {score!=null&&<span className="text-[8px] font-bold px-1 py-px rounded" style={{background:'#fef9c3',color:'#854d0e',border:'1px solid #fde68a'}}>⚡{score}</span>}
            {token.isGlowFun&&<span className="text-[7px] px-1 rounded font-bold" style={{background:'rgba(99,102,241,0.1)',color:'#6366f1'}}>GLW</span>}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <DexLogo dexId={token.dexId} size={11}/>
            <span className="text-[9px] truncate max-w-[100px]" style={{color:'#9ca3af'}}>{token.name}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[12px] font-bold tabular-nums leading-tight" style={{color:'#111827'}}><Px p={token.priceUsd}/></div>
          <div className="flex items-center gap-1.5 mt-0.5 justify-end">
            {c5m!=null&&<span className="text-[9px] font-semibold" style={{color:pC(c5m)}}>5M {fP(c5m)}</span>}
            <span className="text-[10px] font-bold" style={{color:pC(c24)}}>24H {fP(c24)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1 pl-11">
        {[{k:'LIQ',v:token.liqUsd},{k:'VOL',v:token.volUsd},{k:'MCAP',v:token.mcapUsd}].map(({k,v})=>(
          <span key={k} className="text-[8.5px]" style={{color:'#6b7280'}}>{k} <span style={{color:'#374151',fontWeight:600}}>{fC(v)}</span></span>
        ))}
        {(token.buys24h+token.sells24h)>0&&<span className="text-[8.5px] ml-auto"><span style={{color:'#16a34a'}}>{token.buys24h}B</span>/<span style={{color:'#dc2626'}}>{token.sells24h}S</span></span>}
      </div>
    </div>
  )
}

/* ── DEX filter sheet ──────────────────────────────────────────── */
function DexSheet({dexes,selected,onSelect,onClose}:{dexes:string[];selected:string;onSelect:(d:string)=>void;onClose:()=>void}){
  return(
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-end" style={{background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring',stiffness:350,damping:32}}
        className="w-full rounded-t-3xl flex flex-col" style={{background:'#fff',maxHeight:'70dvh'}}>
        <div className="flex justify-center pt-3 pb-0.5 flex-shrink-0"><div className="w-10 h-1 rounded-full" style={{background:'#e5e7eb'}}/></div>
        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0 pb-6">
          <h3 className="text-base font-bold mb-3" style={{color:'#111827'}}>Filter by DEX</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>{onSelect('all');onClose()}} className="flex items-center gap-3 p-3.5 rounded-2xl"
              style={{background:selected==='all'?'rgba(99,102,241,0.08)':'#f9fafb',border:`1.5px solid ${selected==='all'?'#6366f1':'rgba(0,0,0,0.07)'}`}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'#f3f4f6'}}><Filter size={18} style={{color:'#6b7280'}}/></div>
              <span className="text-sm font-bold" style={{color:selected==='all'?'#6366f1':'#111827'}}>All DEXes</span>
            </button>
            {dexes.map(d=>(
              <button key={d} onClick={()=>{onSelect(d);onClose()}} className="flex items-center gap-3 p-3.5 rounded-2xl"
                style={{background:selected===d?'rgba(99,102,241,0.08)':'#f9fafb',border:`1.5px solid ${selected===d?'#6366f1':'rgba(0,0,0,0.07)'}`}}>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center" style={{background:'#f3f4f6'}}>
                  <DexLogo dexId={d} size={28}/>
                </div>
                <span className="text-sm font-bold capitalize" style={{color:selected===d?'#6366f1':'#111827'}}>{d}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Live pulse dot ────────────────────────────────────────────── */
function LiveDot(){
  return(
    <span className="relative flex w-2 h-2 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{background:'#16a34a'}}/>
      <span className="relative inline-flex rounded-full w-2 h-2" style={{background:'#16a34a'}}/>
    </span>
  )
}

/* ── Tabs config (icons only, no emoji) ────────────────────────── */
type Tab='trending'|'new'|'top'
const TABS = [
  { id:'trending' as Tab, icon: Flame,     label:'Trending', sub:'5M', color:'#6366f1' },
  { id:'new'      as Tab, icon: Sprout,    label:'New',      sub:'',   color:'#16a34a' },
  { id:'top'      as Tab, icon: BarChart3, label:'Top',      sub:'',   color:'#f59e0b' },
]

/* ── Main page ─────────────────────────────────────────────────── */
export function TrendingPage(){
  const navigate=useNavigate()
  const {addresses:glowAddrs}=useTokenList()

  const [tab,setTab]        =useState<Tab>('new')   // default to New for real-time feel
  const [tokens,setToks]    =useState<Token[]>(()=>lsGet('new')??[])
  const [total,setTotal]    =useState(0)
  const [stats,setSts]      =useState<any>({})
  const [loading,setLd]     =useState(!(lsGet('new')?.length))
  const [silent,setSil]     =useState(false)
  const [search,setSrch]    =useState('')
  const [dexF,setDexF]      =useState('all')
  const [showDS,setDS]      =useState(false)
  const [newCount,setNewCnt]=useState(0)  // count of new tokens since last full load
  const intervalRef=useRef<ReturnType<typeof setInterval>|null>(null)

  const glowSet=useMemo(()=>new Set(glowAddrs.map(a=>a.toLowerCase())),[glowAddrs])

  const mergeTokens=useCallback((fresh:Token[],existing:Token[])=>{
    const map=new Map(existing.map(t=>[t.address,t]))
    let added=0
    fresh.forEach(t=>{
      if(!map.has(t.address))added++
      map.set(t.address,{...t,isGlowFun:glowSet.has(t.address.toLowerCase())})
    })
    return{tokens:[...map.values()],added}
  },[glowSet])

  const load=useCallback(async(t:Tab,q='',sil=false)=>{
    sil?setSil(true):setLd(true)
    const{tokens:raw,total:tot,stats:st}=await fetchArcTokens(t,q)
    if(raw.length){
      const tagged=raw.map(tk=>({...tk,isGlowFun:glowSet.has(tk.address.toLowerCase())}))
      setToks(tagged); setTotal(tot); setSts(st)
      if(!q)lsSet(t,tagged)
    }
    setLd(false); setSil(false)
  },[glowSet])

  // Initial load
  useEffect(()=>{
    const cached=lsGet(tab)
    if(cached?.length){setToks(cached);setLd(false);load(tab,'',true)}
    else load(tab)
    setDexF('all'); setNewCnt(0)
  },[tab])

  // Auto-refresh every 3 seconds — silently checks for new tokens
  useEffect(()=>{
    if(intervalRef.current)clearInterval(intervalRef.current)
    intervalRef.current=setInterval(async()=>{
      if(search) return  // don't auto-refresh while searching
      const{tokens:fresh,total:tot}=await fetchArcTokens(tab)
      if(!fresh.length) return
      setToks(prev=>{
        const{tokens:merged,added}=mergeTokens(fresh,prev)
        if(added>0)setNewCnt(c=>c+added)
        // Sort merged by tab
        if(tab==='new')merged.sort((a,b)=>(a.ageSec||999999)-(b.ageSec||999999))
        else if(tab==='top')merged.sort((a,b)=>(b.mcapUsd)-(a.mcapUsd))
        else merged.sort((a,b)=>(b.vol5m||b.volUsd)-(a.vol5m||a.volUsd))
        setTotal(tot||merged.length)
        if(!search)lsSet(tab,merged.slice(0,500))
        return merged.slice(0,1000)
      })
    },3000)
    return()=>{ if(intervalRef.current)clearInterval(intervalRef.current) }
  },[tab,search,mergeTokens])

  useEffect(()=>{
    const s=new Set(glowAddrs.map(a=>a.toLowerCase()))
    setToks(p=>p.map(t=>({...t,isGlowFun:s.has(t.address.toLowerCase())})))
  },[glowAddrs.join(',')])

  useEffect(()=>{
    const t=setTimeout(()=>{if(search.length>=2||search==='')load(tab,search.length>=2?search:'',false)},400)
    return()=>clearTimeout(t)
  },[search])

  const dexes=useMemo(()=>{
    const s=new Set<string>(); tokens.forEach(t=>{if(t.dexId)s.add(t.dexId)}); return[...s].slice(0,12)
  },[tokens.length])

  const displayed=useMemo(()=>dexF==='all'?tokens:tokens.filter(t=>t.dexId===dexF),[tokens,dexF])

  const v5m=fC(stats.vol5m||displayed.reduce((s,t)=>s+(t.vol5m||0),0))
  const txns=(stats.txns||displayed.reduce((s,t)=>s+(t.txns5m||0),0)).toLocaleString()

  return(
    <div>
      {/* Tab bar — icons only, no emoji */}
      <div className="flex items-center gap-1.5 mb-3">
        {TABS.map(t=>{
          const active=tab===t.id; const Icon=t.icon
          return(
            <button key={t.id} onClick={()=>{setTab(t.id);setNewCnt(0)}}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
              style={{background:active?t.color:'#fff',color:active?'#fff':'#6b7280',border:`1.5px solid ${active?t.color:'rgba(0,0,0,0.08)'}`,boxShadow:active?`0 2px 10px ${t.color}35`:'none'}}>
              <Icon size={13}/>{t.label}
              {t.sub&&<span className="text-[8px] opacity-70">{t.sub}</span>}
            </button>
          )
        })}
        {/* Live indicator */}
        <div className="ml-auto flex items-center gap-1.5">
          <LiveDot/>
          <span className="text-[9px] font-semibold" style={{color:'#16a34a'}}>Live</span>
          {newCount>0&&<span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{background:'#16a34a'}}>+{newCount}</span>}
        </div>
      </div>

      {/* Stats */}
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

      {/* Filter row */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
        {/* Arc badge with real logo */}
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0"
          style={{background:'#1a1a2e',color:'#fff',border:'1.5px solid #1a1a2e'}}>
          <ArcLogo size={16}/> Arc
        </div>
        {/* DEX filter */}
        <button onClick={()=>setDS(true)} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold flex-shrink-0"
          style={{background:'#fff',color:'#374151',border:'1.5px solid rgba(0,0,0,0.09)'}}>
          {dexF!=='all'?<DexLogo dexId={dexF} size={14}/>:<Filter size={11} style={{color:'#6b7280'}}/>}
          {dexF==='all'?'All DEXes':dexF}<ChevronDown size={10}/>
        </button>
        {/* Search */}
        <div className="flex-1 flex items-center gap-1.5 px-2.5 py-2 rounded-xl min-w-0" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.08)'}}>
          <Search size={11} style={{color:'#9ca3af',flexShrink:0}}/>
          <input value={search} onChange={e=>setSrch(e.target.value)} placeholder="Search…"
            className="text-[11px] bg-transparent outline-none w-full min-w-0" style={{color:'#111827'}}/>
          {search&&<button onClick={()=>setSrch('')}><X size={10} style={{color:'#9ca3af'}}/></button>}
        </div>
        <span className="text-[10px] flex-shrink-0 font-medium" style={{color:'#9ca3af'}}>{displayed.length}</span>
      </div>

      {/* Token list */}
      <div className="rounded-2xl overflow-hidden" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
        {loading&&!tokens.length
          ?Array.from({length:12}).map((_,i)=>(
            <div key={i} className="flex items-center gap-2.5 px-3 py-3 border-b animate-pulse" style={{borderColor:'rgba(0,0,0,0.04)'}}>
              <div className="w-9 h-9 rounded-full flex-shrink-0" style={{background:'#f3f4f6'}}/>
              <div className="flex-1 space-y-1.5"><div className="flex gap-2"><div className="h-3 w-16 rounded" style={{background:'#e5e7eb'}}/><div className="h-2 w-8 rounded" style={{background:'#f3f4f6'}}/></div><div className="h-2 w-12 rounded" style={{background:'#f3f4f6'}}/></div>
              <div className="space-y-1.5"><div className="h-3 w-14 rounded ml-auto" style={{background:'#e5e7eb'}}/><div className="h-2 w-16 rounded ml-auto" style={{background:'#f3f4f6'}}/></div>
            </div>))
          :displayed.length===0
            ?<div className="py-12 text-center"><p className="text-sm font-medium" style={{color:'#9ca3af'}}>Fetching tokens…</p></div>
            :displayed.map((t,i)=><TokenRow key={`${t.address}:${i}`} token={t} onClick={()=>navigate(`/dex/${t.address}`,{state:{token:t}})}/>)}
        {/* Live refresh indicator */}
        <div className="flex items-center justify-center gap-1.5 py-2 text-[9px]" style={{color:'#9ca3af'}}>
          <LiveDot/> Auto-updating every 3s
        </div>
      </div>

      <AnimatePresence>
        {showDS&&<DexSheet dexes={dexes} selected={dexF} onSelect={setDexF} onClose={()=>setDS(false)}/>}
      </AnimatePresence>
    </div>
  )
}

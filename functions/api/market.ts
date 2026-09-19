/**
 * /api/market — DexScreener discovery with accumulative KV (tokens grow over time)
 *
 * Discovery sources:
 *   1. token-boosts/top/v1       (promoted tokens, all chains)
 *   2. token-profiles/latest/v1  (newest listings, all chains)
 *   3. /latest/dex/search?q=X    (50+ queries per chain → thousands of tokens)
 *   4. /token-pairs/v1/{chain}/{addr} (accurate per-chain pair data)
 *
 * KV accumulation:  acc:tokens:{chain}  → grows over time (7d TTL)
 * KV fresh cache:   mkt:v6:{chain}:{tab} → 5min TTL
 * KV backup:        mkt:v6:{chain}:{tab}:bak → 24h TTL
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json' }
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, (_,v) => typeof v==='bigint'?v.toString():v), { status:s, headers:CORS })

/* ── Chain mappings ──────────────────────────────────────────────────────── */
const DS_CHAIN: Record<string,string> = {
  arc:'arc', ethereum:'ethereum', solana:'solana', bsc:'bsc', base:'base',
  polygon:'polygon', avalanche:'avalanche', arbitrum:'arbitrum',
  pulsechain:'pulsechain', optimism:'optimism', fantom:'fantom', cronos:'cronos',
  hyperevm:'hyperevm', ton:'ton', tron:'tron', sui:'sui', aptos:'aptos',
}

// Many search queries per chain — yields thousands of tokens
const CHAIN_QUERIES: Record<string, string[]> = {
  arc:      ['arc usdc','glow fun arc','arc meme','arc ai','arc cat dog','arc inu','USDC arc','arc defi','arc token','arc pump'],
  ethereum: ['pepe eth','shib eth','doge eth','floki','baby eth','inu eth','meme eth','ai gpt eth','elon eth','wojak','chad eth','defi eth','nft eth','dao eth','moon eth','cum','based eth','frog eth','poop eth','brett'],
  solana:   ['sol meme','pump fun','bonk sol','popcat','dogwifhat','wif sol','silly dragon','bome','wen sol','mog sol','slerf','fwog','ponke','pnut','cheems sol','sol ai','sol cat','sol dog','sol inu','jup sol'],
  bsc:      ['bsc meme','bnb dog','baby bnb','cake bnb','doge bsc','shib bsc','inu bsc','bsc cat','bsc ai','moon bsc','bsc pump','bsc nft','bsc defi','pig bsc','baby bsc','mini bsc','pepe bsc'],
  base:     ['base meme','brett base','toshi base','degen base','based ai','base cat','base dog','base inu','base pump','coinbase','blue base','base defi'],
  polygon:  ['matic meme','poly dog','polygon cat','poly inu','polygon defi','poly ai','quick swap'],
  avalanche:['avax meme','avax dog','avax cat','avax inu','avax ai','trader joe','avax defi'],
  arbitrum: ['arb meme','arb dog','arb cat','camelot arb','arb ai','arb defi','arb inu'],
  all:      ['meme coin','pump fun','doge inu','pepe cat','ai token','defi swap','moon rocket','baby token','shib inu','elon musk','gm wagmi','nft dao'],
}

function matchChain(chainId: string, target: string) {
  if (target==='all') return true
  const c = chainId.toLowerCase()
  if (target==='arc') return c==='arc'||c.includes('arc')||c==='5042'
  return c===(DS_CHAIN[target]??target)
}

/* ── Token type ─────────────────────────────────────────────────────────── */
type Token = {
  address:string; name:string; symbol:string; logoUrl:string; chain:string
  chainLogoUrl:string; dexLogoUrl:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liquidityUsd?:number; volumeUsd?:number; mcapUsd?:number
  age?:number; buys24h?:number; sells24h?:number; txns5m?:number; vol5m?:number
  pairAddress?:string; dexId?:string; source:string; updatedAt:number
}

function normDS(p: any, targetChain='all'): Token|null {
  const base=p.baseToken??{}
  const addr=(base.address??'').toLowerCase()
  if (!addr||addr==='0x'+'0'.repeat(40)) return null
  const cid=(p.chainId??targetChain).toLowerCase()
  // DexScreener CDN logos
  const dsTokenLogo=`https://dd.dexscreener.com/ds-data/tokens/${cid}/${addr}.png`
  const logoUrl = p.info?.imageUrl || p.info?.header || dsTokenLogo
  return {
    address:addr, name:base.name??'', symbol:base.symbol??'',
    logoUrl, chain:cid,
    chainLogoUrl:`https://dd.dexscreener.com/ds-data/chains/${cid}.png`,
    dexLogoUrl: p.dexId?`https://dd.dexscreener.com/ds-data/dexes/${p.dexId.toLowerCase()}.png`:'',
    priceUsd:  parseFloat(p.priceUsd??'0')||0,
    change5m:  p.priceChange?.m5  !=null?parseFloat(p.priceChange.m5):undefined,
    change1h:  p.priceChange?.h1  !=null?parseFloat(p.priceChange.h1):undefined,
    change6h:  p.priceChange?.h6  !=null?parseFloat(p.priceChange.h6):undefined,
    change24h: p.priceChange?.h24 !=null?parseFloat(p.priceChange.h24):undefined,
    liquidityUsd:parseFloat(p.liquidity?.usd??'0')||undefined,
    volumeUsd:   parseFloat(p.volume?.h24??'0')||undefined,
    vol5m:       parseFloat(p.volume?.m5??'0')||undefined,
    txns5m:      (p.txns?.m5?.buys??0)+(p.txns?.m5?.sells??0)||undefined,
    mcapUsd:     parseFloat(p.marketCap??p.fdv??'0')||undefined,
    age:         p.pairCreatedAt?Math.floor((Date.now()-p.pairCreatedAt)/1000):undefined,
    buys24h:p.txns?.h24?.buys, sells24h:p.txns?.h24?.sells,
    pairAddress:(p.pairAddress??'').toLowerCase(), dexId:p.dexId,
    source:'dexscreener', updatedAt:Date.now(),
  }
}

/* ── Fetch helpers ──────────────────────────────────────────────────────── */
async function fetchBoostsProfiles(chain: string): Promise<string[]> {
  const [bR,pR] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-boosts/top/v1',    {headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)}).then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
    fetch('https://api.dexscreener.com/token-profiles/latest/v1',{headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)}).then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
  ])
  const all=[...(bR.status==='fulfilled'?bR.value:[]),...(pR.status==='fulfilled'?pR.value:[])]
  const seen=new Set<string>()
  for (const t of all) {
    if (!t.tokenAddress) continue
    const cid=(t.chainId??'').toLowerCase()
    if (matchChain(cid,chain)) seen.add(t.tokenAddress)
  }
  return [...seen]
}

async function searchDexScreener(queries: string[], chain: string): Promise<any[]> {
  const pairs: any[]=[]
  const BATCH=8
  for (let i=0;i<queries.length;i+=BATCH) {
    const batch=queries.slice(i,i+BATCH)
    const results=await Promise.allSettled(batch.map(q=>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,{signal:AbortSignal.timeout(10_000)})
        .then(r=>r.ok?r.json():{pairs:[]}).then((d:any)=>(d.pairs??[]).filter((p:any)=>matchChain(p.chainId??'',chain))).catch(()=>[])
    ))
    for (const r of results) if (r.status==='fulfilled') pairs.push(...r.value)
  }
  return pairs
}

async function bulkFetchPairs(addrs: string[], chain: string): Promise<any[]> {
  const pairs: any[]=[]
  const dsChain=DS_CHAIN[chain]??chain
  const unique=[...new Set(addrs)].slice(0,200)
  // New endpoint: token-pairs/v1/{chain}/{address} (from Snipe Spirit)
  const BATCH=8
  for (let i=0;i<Math.min(unique.length,80);i+=BATCH) {
    const slice=unique.slice(i,i+BATCH)
    const results=await Promise.allSettled(slice.map(addr=>
      chain==='all'
        ?fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`,{signal:AbortSignal.timeout(8_000)}).then(r=>r.ok?r.json():{pairs:[]}).then((d:any)=>d.pairs??[])
        :fetch(`https://api.dexscreener.com/token-pairs/v1/${dsChain}/${addr}`,{signal:AbortSignal.timeout(8_000)}).then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:(d.pairs??[]))
    ))
    for (const r of results) if (r.status==='fulfilled') pairs.push(...r.value)
  }
  // Bulk endpoint for remaining
  for (let i=80;i<unique.length;i+=30) {
    const chunk=unique.slice(i,i+30).join(',')
    try {
      const r=await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`,{signal:AbortSignal.timeout(10_000)})
      if (r.ok){const d:any=await r.json();pairs.push(...(d.pairs??[]).filter((p:any)=>matchChain(p.chainId??'',chain)))}
    }catch{}
  }
  return pairs
}

function sortByTab(tokens:Token[], tab:string): Token[] {
  return [...tokens].sort((a,b)=>{
    if (tab==='new')  return (a.age??999999)-(b.age??999999)
    if (tab==='top')  return (b.mcapUsd??0)-(a.mcapUsd??0)
    const vd=(b.vol5m??b.volumeUsd??0)-(a.vol5m??a.volumeUsd??0)
    return vd!==0?vd:(b.txns5m??0)-(a.txns5m??0)
  })
}

/* ── KV accumulation ────────────────────────────────────────────────────── */
async function loadAccumulated(chain:string, env:Env): Promise<Map<string,Token>> {
  const map=new Map<string,Token>()
  if (!env.CONFIG) return map
  try {
    const raw=await env.CONFIG.get(`acc:${chain}`).catch(()=>null)
    if (raw) { const tokens:Token[]=JSON.parse(raw); tokens.forEach(t=>map.set(`${t.chain}:${t.address}`,t)) }
  }catch{}
  return map
}

async function saveAccumulated(chain:string, map:Map<string,Token>, env:Env) {
  if (!env.CONFIG) return
  // Keep top 3000 by volume, always newest prices
  const tokens=[...map.values()].sort((a,b)=>(b.volumeUsd??0)-(a.volumeUsd??0)).slice(0,3000)
  await env.CONFIG.put(`acc:${chain}`,JSON.stringify(tokens),{expirationTtl:7*86400}).catch(()=>{})
}

/* ── Main fetch & store ─────────────────────────────────────────────────── */
async function fetchAndStore(chain:string, tab:string, fKey:string, bKey:string, env:Env): Promise<Token[]> {
  // Load accumulated tokens first (these grow over time → thousands)
  const accMap=await loadAccumulated(chain,env)

  // 1. Boosts + profiles → addresses
  const boostAddrs=await fetchBoostsProfiles(chain)

  // 2. Many search queries → pairs directly
  const queries=CHAIN_QUERIES[chain]??CHAIN_QUERIES['all']
  const [pairsFromSearch, pairsFromPairs] = await Promise.allSettled([
    searchDexScreener(queries, chain),
    bulkFetchPairs(boostAddrs, chain),
  ])

  const allPairs=[
    ...(pairsFromSearch.status==='fulfilled'?pairsFromSearch.value:[]),
    ...(pairsFromPairs.status==='fulfilled'?pairsFromPairs.value:[]),
  ]

  // 3. Normalise and merge into accumulated map
  let newCount=0
  for (const p of allPairs) {
    if (!matchChain(p.chainId??'',chain)) continue
    const t=normDS(p,chain)
    if (!t) continue
    const key=`${t.chain}:${t.address}`
    const ex=accMap.get(key)
    // Update if new or higher volume
    if (!ex||(t.volumeUsd??0)>=(ex.volumeUsd??0)) { accMap.set(key,t); if(!ex)newCount++ }
  }

  // 4. Save updated accumulation (background)
  saveAccumulated(chain,accMap,env).catch(()=>{})

  // 5. Sort by tab and return
  const tokens=sortByTab([...accMap.values()],tab)

  // 6. Cache sorted result (5min fresh)
  const payload=JSON.stringify(tokens)
  if (env.CONFIG) {
    Promise.allSettled([
      env.CONFIG.put(fKey,payload,{expirationTtl:300}),
      env.CONFIG.put(bKey,payload,{expirationTtl:86400}),
    ]).catch(()=>{})
  }
  return tokens
}

async function getTokens(chain:string, tab:string, env:Env, ctx:any): Promise<Token[]> {
  const fKey=`mkt:v6:${chain}:${tab}`, bKey=`mkt:v6:${chain}:${tab}:bak`
  const fresh=env.CONFIG?await env.CONFIG.get(fKey).catch(()=>null):null
  if (fresh) { ctx?.waitUntil?.(fetchAndStore(chain,tab,fKey,bKey,env).catch(()=>{})); return JSON.parse(fresh) }
  const backup=env.CONFIG?await env.CONFIG.get(bKey).catch(()=>null):null
  if (backup) { ctx?.waitUntil?.(fetchAndStore(chain,tab,fKey,bKey,env).catch(()=>{})); return JSON.parse(backup) }
  return fetchAndStore(chain,tab,fKey,bKey,env)
}

/* ── Synthetic OHLCV ────────────────────────────────────────────────────── */
function synth(price:number,ch24:number,age:number,n=60):any[]{
  if(!price)return[]
  const start=Math.abs(ch24)>0.5?price/(1+ch24/100):price*0.7
  const now=Math.floor(Date.now()/1000),iv=Math.max(Math.floor(age/n),300)
  let seed=(Math.abs(Math.round(price*1e9))^0x5f3759df)%65535||12345
  const rng=()=>{seed=(seed*1664525+1013904223)&0xffffffff;return(seed>>>0)/0xffffffff}
  return Array.from({length:n},(_,i)=>{
    const t=now-(n-i-1)*iv,prog=(i+1)/n
    const base=start+(price-start)*Math.pow(prog,0.75)
    const ns=0.025+rng()*0.05,dir=rng()>0.44?1:-1
    const o=Math.max(base*(1+(rng()-0.5)*ns*0.55),1e-30),c=Math.max(base*(1+dir*ns*0.4*rng()),1e-30)
    return{time:t,open:o,high:Math.max(o,c)*(1+ns*0.1*rng()),low:Math.min(o,c)*(1-ns*0.07*rng()),close:c,volume:rng()*6000+300}
  })
}

/* ── Handler ────────────────────────────────────────────────────────────── */
export const onRequest: PagesFunction<Env> = async(ctx)=>{
  const{request,env}=ctx
  if(request.method==='OPTIONS')return new Response(null,{headers:CORS})
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')

  if(path.endsWith('/logo')){
    const lu=url.searchParams.get('url');if(!lu)return new Response('',{status:400})
    try{const r=await fetch(lu,{signal:AbortSignal.timeout(5_000)});if(!r.ok)return new Response('',{status:r.status});return new Response(await r.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400','Access-Control-Allow-Origin':'*'}})}catch{return new Response('',{status:502})}
  }

  if(path.endsWith('/ohlcv')){
    const pool=url.searchParams.get('pool')??'',token=url.searchParams.get('token')??''
    const tf=url.searchParams.get('tf')?? '1h',price=parseFloat(url.searchParams.get('price')??'0')
    const ch24=parseFloat(url.searchParams.get('change24h')??'0'),age=parseInt(url.searchParams.get('age')??'86400')
    const ck=`ohlcv:v2:${pool||token}:${tf}`
    const cached=env.CONFIG?await env.CONFIG.get(ck).catch(()=>null):null
    if(cached)return j({success:true,data:JSON.parse(cached),cached:true})
    const[res,agg]=tf==='5m'?['minute','5']:tf==='15m'?['minute','15']:tf==='4h'?['hour','4']:tf==='1d'?['day','1']:['hour','1']
    let candles:any[]=[]
    const tryGT=async(addr:string,net='arc')=>{try{const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${addr}/ohlcv/${res}?aggregate=${agg}&limit=300`,{signal:AbortSignal.timeout(8_000)});if(!r.ok)return[];const d:any=await r.json();return(d.data?.attributes?.ohlcv_list??[]).reverse().map(([t,o,h,l,c,v]:number[])=>({time:Math.floor(t/1000),open:o,high:h,low:l,close:c,volume:v}))}catch{return[]}}
    if(pool)candles=await tryGT(pool)
    if(!candles.length&&token){try{const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${token}/pools?page=1`,{signal:AbortSignal.timeout(6_000)});if(r.ok){const d:any=await r.json();const p=d.data?.[0]?.attributes?.address;if(p)candles=await tryGT(p)}}catch{}}
    if(!candles.length)candles=synth(price,ch24,age)
    if(candles.length&&env.CONFIG)env.CONFIG.put(ck,JSON.stringify(candles),{expirationTtl:900}).catch(()=>{})
    return j({success:true,data:candles})
  }

  const chain=(url.searchParams.get('chain')?? 'arc').toLowerCase()
  const tab  =(url.searchParams.get('tab')  ??' trending').toLowerCase()
  const q    =(url.searchParams.get('q')    ?? '').trim().toLowerCase()
  const limit=Math.min(500,parseInt(url.searchParams.get('limit')??'200'))

  let tokens=await getTokens(chain,tab,env,ctx)
  tokens=sortByTab(tokens,tab)
  if(q)tokens=tokens.filter(t=>t.name.toLowerCase().includes(q)||t.symbol.toLowerCase().includes(q)||t.address.includes(q))

  const total=tokens.length,page=Math.max(1,parseInt(url.searchParams.get('page')??'1'))
  const result=tokens.slice((page-1)*limit,page*limit)
  const vol5m=tokens.reduce((s,t)=>s+(t.vol5m??0),0)
  const txns =tokens.reduce((s,t)=>s+(t.txns5m??0),0)

  return j({success:true,data:{tokens:result,total,page,limit,stats:{vol5m,txns}}})
}

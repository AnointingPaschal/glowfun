/**
 * Arc Token Market API — Hybrid: On-chain RPC + DexScreener
 *
 * Method 1: On-chain RPC (instant — catches pools within SECONDS of creation)
 *   Arc RPC: https://rpc.mainnet.arc.io
 *   Uniswap Factory: 0x1F98431c8aD98523631AE4a59f267346ea31F984
 *   PoolCreated event → pair addresses → DexScreener pairs endpoint
 *
 * Method 2: DexScreener search (coverage — fills in price/volume data)
 *   /latest/dex/pairs/arc/{pairAddresses}  ← exact pair lookup
 *   /latest/dex/tokens/{tokenAddresses}     ← token lookup
 *   token-profiles/v1 + token-boosts/v1    ← discovery
 *
 * D1: arc_tokens table — permanent storage, no duplicates (address PK)
 * KV: fast cache — 15s for 'new', 60s for others
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json' }
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d,(_,v)=>typeof v==='bigint'?v.toString():v),{status:s,headers:CORS})

/* ── Arc chain constants ──────────────────────────────────────────────── */
const ARC_RPC             = 'https://rpc.mainnet.arc.io'
const UNISWAP_FACTORY_ARC = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
const USDC_ARC            = '0x3600000000000000000000000000000000000000'
// keccak256("PoolCreated(address,address,uint24,int24,address)")
const POOL_CREATED_TOPIC  = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118'

/* ── D1 setup ─────────────────────────────────────────────────────────── */
const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS arc_tokens (
    address      TEXT PRIMARY KEY,
    pair_address TEXT DEFAULT '',
    name         TEXT NOT NULL DEFAULT '',
    symbol       TEXT NOT NULL DEFAULT '',
    logo_url     TEXT DEFAULT '',
    price_usd    REAL DEFAULT 0,
    change_5m    REAL,
    change_1h    REAL,
    change_6h    REAL,
    change_24h   REAL,
    liq_usd      REAL DEFAULT 0,
    vol_usd      REAL DEFAULT 0,
    mcap_usd     REAL DEFAULT 0,
    age_sec      INTEGER DEFAULT 0,
    buys_24h     INTEGER DEFAULT 0,
    sells_24h    INTEGER DEFAULT 0,
    txns_5m      INTEGER DEFAULT 0,
    vol_5m       REAL DEFAULT 0,
    dex_id       TEXT DEFAULT '',
    updated_at   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_arc_vol  ON arc_tokens(vol_usd  DESC);
  CREATE INDEX IF NOT EXISTS idx_arc_age  ON arc_tokens(age_sec  ASC);
  CREATE INDEX IF NOT EXISTS idx_arc_mcap ON arc_tokens(mcap_usd DESC);
`

type Token = {
  address:string; pairAddress:string; name:string; symbol:string; logoUrl:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liqUsd:number; volUsd:number; mcapUsd:number; ageSec:number
  buys24h:number; sells24h:number; txns5m:number; vol5m:number; dexId:string
  updatedAt:number
}

function isArc(chainId:string):boolean {
  const c=(chainId??'').toLowerCase()
  return c==='arc'||c==='5042'||c.includes('arc')
}

function pairToToken(p:any): Token|null {
  const base=p.baseToken??{}
  const addr=(base.address??'').toLowerCase()
  if (!addr||addr==='0x'+'0'.repeat(40)) return null
  if (!isArc(p.chainId??'')) return null
  return {
    address:     addr,
    pairAddress: (p.pairAddress??'').toLowerCase(),
    name:        base.name??'',
    symbol:      base.symbol??'',
    logoUrl:     p.info?.imageUrl||p.info?.header||`https://dd.dexscreener.com/ds-data/tokens/arc/${addr}.png`,
    priceUsd:    parseFloat(p.priceUsd??'0')||0,
    change5m:    p.priceChange?.m5  !=null?parseFloat(p.priceChange.m5):undefined,
    change1h:    p.priceChange?.h1  !=null?parseFloat(p.priceChange.h1):undefined,
    change6h:    p.priceChange?.h6  !=null?parseFloat(p.priceChange.h6):undefined,
    change24h:   p.priceChange?.h24 !=null?parseFloat(p.priceChange.h24):undefined,
    liqUsd:      parseFloat(p.liquidity?.usd??'0')||0,
    volUsd:      parseFloat(p.volume?.h24??'0')||0,
    mcapUsd:     parseFloat(p.marketCap??p.fdv??'0')||0,
    ageSec:      p.pairCreatedAt?Math.floor((Date.now()-p.pairCreatedAt)/1000):0,
    buys24h:     p.txns?.h24?.buys??0,
    sells24h:    p.txns?.h24?.sells??0,
    txns5m:      (p.txns?.m5?.buys??0)+(p.txns?.m5?.sells??0),
    vol5m:       parseFloat(p.volume?.m5??'0')||0,
    dexId:       p.dexId??'',
    updatedAt:   Math.floor(Date.now()/1000),
  }
}

function rowToToken(r:any): Token {
  return {
    address:r.address,pairAddress:r.pair_address??'',name:r.name??'',symbol:r.symbol??'',
    logoUrl:r.logo_url??'',priceUsd:r.price_usd??0,change5m:r.change_5m??undefined,
    change1h:r.change_1h??undefined,change6h:r.change_6h??undefined,change24h:r.change_24h??undefined,
    liqUsd:r.liq_usd??0,volUsd:r.vol_usd??0,mcapUsd:r.mcap_usd??0,
    ageSec:r.age_sec??0,buys24h:r.buys_24h??0,sells24h:r.sells_24h??0,
    txns5m:r.txns_5m??0,vol5m:r.vol_5m??0,dexId:r.dex_id??'',updatedAt:r.updated_at??0,
  }
}

/* ── D1 helpers ───────────────────────────────────────────────────────── */
async function dbSetup(env:Env){
  if (!env.DB) return
  for (const s of CREATE_SQL.split(';').map(x=>x.trim()).filter(Boolean)) {
    await env.DB.exec(s+';').catch(()=>{})
  }
}

async function dbLoad(env:Env,tab='trending',limit=500):Promise<Token[]>{
  if (!env.DB) return []
  try {
    await dbSetup(env)
    const order=tab==='new'?'age_sec ASC':tab==='top'?'mcap_usd DESC':'vol_5m DESC,vol_usd DESC'
    const rows=await env.DB.prepare(`SELECT * FROM arc_tokens WHERE price_usd > 0 ORDER BY ${order} LIMIT ?`).bind(limit).all()
    return (rows.results??[]).map(rowToToken)
  } catch { return [] }
}

async function dbSave(tokens:Token[],env:Env){
  if (!env.DB||!tokens.length) return
  try {
    await dbSetup(env)
    const BATCH=50
    for (let i=0;i<tokens.length;i+=BATCH) {
      const batch=tokens.slice(i,i+BATCH)
      await env.DB.batch(batch.map(t=>env.DB.prepare(
        `INSERT OR REPLACE INTO arc_tokens
          (address,pair_address,name,symbol,logo_url,price_usd,change_5m,change_1h,change_6h,change_24h,
           liq_usd,vol_usd,mcap_usd,age_sec,buys_24h,sells_24h,txns_5m,vol_5m,dex_id,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        t.address,t.pairAddress,t.name,t.symbol,t.logoUrl,
        t.priceUsd,t.change5m??null,t.change1h??null,t.change6h??null,t.change24h??null,
        t.liqUsd,t.volUsd,t.mcapUsd,t.ageSec,t.buys24h,t.sells24h,t.txns5m,t.vol5m,
        t.dexId,t.updatedAt
      ))
    }
  } catch(e){console.error('[D1]',e)}
}

/* ── METHOD 1: On-chain RPC — catches new pools in SECONDS ───────────── */
async function fetchNewPoolsFromChain(blocksBack=1000): Promise<{tokenAddr:string;poolAddr:string}[]> {
  try {
    // Get latest block
    const r1 = await fetch(ARC_RPC,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',params:[],id:1}),signal:AbortSignal.timeout(6_000)})
    const d1:any = await r1.json()
    const latest = parseInt(d1.result,16)
    if (!latest) return []
    const fromBlock = '0x'+(Math.max(0,latest-blocksBack)).toString(16)

    // Get PoolCreated events from Uniswap factory
    const r2 = await fetch(ARC_RPC,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',method:'eth_getLogs',params:[{
        address:UNISWAP_FACTORY_ARC,
        topics:[POOL_CREATED_TOPIC],
        fromBlock, toBlock:'latest'
      }],id:2}),signal:AbortSignal.timeout(10_000)})
    const d2:any = await r2.json()
    const logs:any[] = d2.result??[]

    const results:{tokenAddr:string;poolAddr:string}[] = []
    const usdc = USDC_ARC.toLowerCase()
    for (const log of logs) {
      if (!log.topics||log.topics.length<3) continue
      const t0 = ('0x'+log.topics[1].slice(26)).toLowerCase()
      const t1 = ('0x'+log.topics[2].slice(26)).toLowerCase()
      // Pool address: second 32 bytes of data (bytes 32-63)
      const data = (log.data??'').replace('0x','')
      const poolAddr = data.length>=128 ? '0x'+data.slice(64+24,128) : ''  // skip tickSpacing + padding
      const tokenAddr = t0===usdc ? t1 : t0  // the non-USDC side is the actual token
      if (poolAddr&&tokenAddr!==usdc) results.push({tokenAddr,poolAddr})
    }
    console.log(`[RPC] ${logs.length} PoolCreated events → ${results.length} tokens from last ${blocksBack} blocks`)
    return results
  } catch(e){console.error('[RPC]',e);return[]}
}

/* ── METHOD 2: DexScreener ────────────────────────────────────────────── */
async function fetchDSByPairs(pairAddrs:string[]): Promise<any[]> {
  // /latest/dex/pairs/arc/{addresses} — exact pair lookup (30 per req)
  const pairs:any[] = []
  const unique=[...new Set(pairAddrs)].filter(Boolean)
  for (let i=0;i<unique.length;i+=30) {
    const chunk=unique.slice(i,i+30).join(',')
    try {
      const r=await fetch(`https://api.dexscreener.com/latest/dex/pairs/arc/${chunk}`,{signal:AbortSignal.timeout(10_000)})
      if (r.ok){const d:any=await r.json();pairs.push(...(d.pairs??[]))}
    } catch {}
  }
  return pairs
}

async function fetchDSByTokens(tokenAddrs:string[]): Promise<any[]> {
  const pairs:any[] = []
  const unique=[...new Set(tokenAddrs)].filter(Boolean)
  for (let i=0;i<unique.length;i+=30) {
    const chunk=unique.slice(i,i+30).join(',')
    try {
      const r=await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`,{signal:AbortSignal.timeout(10_000)})
      if (r.ok){const d:any=await r.json();pairs.push(...(d.pairs??[]).filter((p:any)=>isArc(p.chainId??'')))}
    } catch {}
  }
  return pairs
}

async function discoverViaSearches(): Promise<any[]> {
  // Comprehensive search queries — USDC hits all Arc pairs (main base currency)
  const QUERIES = [
    'USDC','usdc',         // hits virtually ALL Arc/USDC pairs
    'arc','ARC',
    // Single letters — catches any token by first letter
    ...'abcdefghijklmnopqrstuvwxyz'.split(''),
    // Known Arc token patterns
    'cat','dog','inu','meme','glow','fun','pump','ai','moon','baby','pepe',
    'arcat','arcflow','arcfun','arcade','arcinu','arcdoge','arcoon',
    'bcat','gdog','gcat','longcat','upcat','ucat','argus','duke','tolly',
    'rope','circle','murmur','faze','bounce','jump','arc index',
  ]
  const pairs:any[] = []
  for (let i=0;i<QUERIES.length;i+=8) {
    const batch=QUERIES.slice(i,i+8)
    const results=await Promise.allSettled(batch.map(q=>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,{signal:AbortSignal.timeout(10_000)})
        .then(r=>r.ok?r.json():{pairs:[]}).then((d:any)=>(d.pairs??[]).filter((p:any)=>isArc(p.chainId??''))).catch(()=>[])
    ))
    for (const r of results) if (r.status==='fulfilled') pairs.push(...r.value)
  }
  return pairs
}

async function discoverViaBoostsProfiles(): Promise<string[]> {
  const addrs=new Set<string>()
  const [bR,pR]=await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-boosts/top/v1',    {headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)}).then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
    fetch('https://api.dexscreener.com/token-profiles/latest/v1',{headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)}).then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
  ])
  for (const res of [bR,pR]) {
    if (res.status!=='fulfilled') continue
    for (const t of res.value) {
      if (isArc(t.chainId??'')&&t.tokenAddress) addrs.add(t.tokenAddress)
    }
  }
  return [...addrs]
}

/* ── Sort ─────────────────────────────────────────────────────────────── */
function sortTokens(tokens:Token[],tab:string):Token[]{
  return [...tokens].sort((a,b)=>
    tab==='new'  ? (a.ageSec||999999)-(b.ageSec||999999) :
    tab==='top'  ? (b.mcapUsd)-(a.mcapUsd) :
    ((b.vol5m||b.volUsd)-(a.vol5m||a.volUsd))||(b.txns5m-a.txns5m)
  )
}

/* ── Main fetch — combines all methods ───────────────────────────────── */
async function fetchAllArcTokens(): Promise<Token[]> {
  // Load existing D1 data first
  const existing = await dbLoad({} as any,'trending',2000).catch(()=>[])
  // Can't pass env here so we'll handle in the route handler

  // Run all discovery methods in parallel
  const [onChain, boostAddrs, searchPairs] = await Promise.allSettled([
    fetchNewPoolsFromChain(2000),     // Last ~2000 blocks (~70 min on Arc)
    discoverViaBoostsProfiles(),
    discoverViaSearches(),
  ])

  const chainData  = onChain.status==='fulfilled'      ? onChain.value    : []
  const boosts     = boostAddrs.status==='fulfilled'   ? boostAddrs.value : []
  const fromSearch = searchPairs.status==='fulfilled'  ? searchPairs.value : []

  // Fetch DexScreener data for on-chain discovered pairs (pair address → rich data)
  const pairAddrs   = chainData.map(c=>c.poolAddr).filter(Boolean)
  const tokenAddrs  = [...new Set([...chainData.map(c=>c.tokenAddr),...boosts])].filter(Boolean)

  const [pairsData, tokensData] = await Promise.allSettled([
    fetchDSByPairs(pairAddrs),    // exact pair lookup — most accurate
    fetchDSByTokens(tokenAddrs),  // token lookup — gets all pairs for each token
  ])

  const allPairs = [
    ...(fromSearch),
    ...(pairsData.status==='fulfilled'  ? pairsData.value  : []),
    ...(tokensData.status==='fulfilled' ? tokensData.value : []),
  ]

  // Merge — deduplicate by token address, keep highest volume
  const map = new Map<string,Token>()
  for (const p of allPairs) {
    const t = pairToToken(p); if (!t) continue
    const ex = map.get(t.address)
    if (!ex||t.volUsd>=ex.volUsd) map.set(t.address,t)
  }

  console.log(`[fetch] on-chain:${chainData.length} boosts:${boosts.length} search-pairs:${fromSearch.length} total-unique:${map.size}`)
  return [...map.values()]
}

/* ── Synthetic OHLCV (last resort) ───────────────────────────────────── */
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

/* ── Handler ──────────────────────────────────────────────────────────── */
export const onRequest:PagesFunction<Env> = async(ctx)=>{
  const{request,env}=ctx
  if (request.method==='OPTIONS') return new Response(null,{headers:CORS})
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')

  /* Logo proxy */
  if (path.endsWith('/logo')){
    const lu=url.searchParams.get('url');if(!lu)return new Response('',{status:400})
    try{const r=await fetch(lu,{signal:AbortSignal.timeout(5_000)});if(!r.ok)return new Response('',{status:r.status});return new Response(await r.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400','Access-Control-Allow-Origin':'*'}})}catch{return new Response('',{status:502})}
  }

  /* OHLCV — real data only */
  if (path.endsWith('/ohlcv')){
    const pool=url.searchParams.get('pool')??'',token=url.searchParams.get('token')??''
    const tf=url.searchParams.get('tf')?? '1h'
    const ck=`ohlcv:arc:${pool||token}:${tf}`
    const cached=env.CONFIG?await env.CONFIG.get(ck).catch(()=>null):null
    if(cached)return j({success:true,data:JSON.parse(cached),cached:true})
    const[res,agg]=tf==='5m'?['minute','5']:tf==='15m'?['minute','15']:tf==='4h'?['hour','4']:tf==='1d'?['day','1']:['hour','1']
    let candles:any[]=[]
    const tryGT=async(addr:string)=>{try{const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/pools/${addr}/ohlcv/${res}?aggregate=${agg}&limit=300`,{signal:AbortSignal.timeout(8_000)});if(!r.ok)return[];const d:any=await r.json();return(d.data?.attributes?.ohlcv_list??[]).reverse().map(([t,o,h,l,c,v]:number[])=>({time:Math.floor(t/1000),open:o,high:h,low:l,close:c,volume:v}))}catch{return[]}}
    if(pool)candles=await tryGT(pool)
    if(!candles.length&&token){try{const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${token}/pools?page=1`,{signal:AbortSignal.timeout(6_000)});if(r.ok){const d:any=await r.json();const p=d.data?.[0]?.attributes?.address;if(p)candles=await tryGT(p)}}catch{}}
    if(candles.length>=5&&env.CONFIG)env.CONFIG.put(ck,JSON.stringify(candles),{expirationTtl:900}).catch(()=>{})
    return j({success:true,data:candles,real:candles.length>=5})
  }

  /* Token list */
  const tab  =(url.searchParams.get('tab')?? 'trending').toLowerCase()
  const q    =(url.searchParams.get('q')  ?? '').trim().toLowerCase()
  const limit=Math.min(500,parseInt(url.searchParams.get('limit')??'200'))

  const kvKey=`arc:v2:${tab}`
  const kvRaw=env.CONFIG?await env.CONFIG.get(kvKey).catch(()=>null):null

  let tokens:Token[]
  if (kvRaw) {
    tokens=JSON.parse(kvRaw)
    // Always refresh in background — catches new on-chain pools
    ctx.waitUntil((async()=>{
      const fresh=await fetchAllArcTokens()
      if (!fresh.length) return
      const d1merged=await dbLoad(env,'trending',2000)
      const map=new Map(d1merged.map(t=>[t.address,t]))
      fresh.forEach(t=>{if(!map.has(t.address)||t.volUsd>=(map.get(t.address)?.volUsd??0))map.set(t.address,t)})
      const merged=[...map.values()]
      await Promise.allSettled([
        dbSave(merged,env),
        env.CONFIG?.put(`arc:v2:trending`,JSON.stringify(sortTokens(merged,'trending')),{expirationTtl:60}),
        env.CONFIG?.put(`arc:v2:new`,     JSON.stringify(sortTokens(merged,'new')),     {expirationTtl:15}),
        env.CONFIG?.put(`arc:v2:top`,     JSON.stringify(sortTokens(merged,'top')),     {expirationTtl:60}),
        env.CONFIG?.put('arc:last_refresh',String(Math.floor(Date.now()/1000)),{expirationTtl:3600}),
      ])
    })().catch(()=>{}))
  } else {
    // Try D1 (survives KV expiry)
    const d1tokens=await dbLoad(env,tab,limit)
    if (d1tokens.length>=5) {
      tokens=d1tokens
      ctx.waitUntil((async()=>{
        const fresh=await fetchAllArcTokens()
        if (!fresh.length) return
        const map=new Map(d1tokens.map(t=>[t.address,t]))
        fresh.forEach(t=>{if(!map.has(t.address)||t.volUsd>=(map.get(t.address)?.volUsd??0))map.set(t.address,t)})
        const merged=[...map.values()]
        await Promise.allSettled([
          dbSave(merged,env),
          env.CONFIG?.put(`arc:v2:trending`,JSON.stringify(sortTokens(merged,'trending')),{expirationTtl:60}),
          env.CONFIG?.put(`arc:v2:new`,     JSON.stringify(sortTokens(merged,'new')),     {expirationTtl:15}),
          env.CONFIG?.put(`arc:v2:top`,     JSON.stringify(sortTokens(merged,'top')),     {expirationTtl:60}),
        ])
      })().catch(()=>{}))
    } else {
      // First ever load
      const fresh=await fetchAllArcTokens()
      tokens=sortTokens(fresh,tab)
      ctx.waitUntil(Promise.allSettled([
        dbSave(fresh,env),
        env.CONFIG?.put(`arc:v2:trending`,JSON.stringify(sortTokens(fresh,'trending')),{expirationTtl:60}),
        env.CONFIG?.put(`arc:v2:new`,     JSON.stringify(sortTokens(fresh,'new')),     {expirationTtl:15}),
        env.CONFIG?.put(`arc:v2:top`,     JSON.stringify(sortTokens(fresh,'top')),     {expirationTtl:60}),
      ]))
    }
  }

  tokens=sortTokens(tokens,tab)
  if(q)tokens=tokens.filter(t=>t.name.toLowerCase().includes(q)||t.symbol.toLowerCase().includes(q)||t.address.includes(q))

  const total=tokens.length,page=Math.max(1,parseInt(url.searchParams.get('page')??'1'))
  const result=tokens.slice((page-1)*limit,page*limit)
  const vol5m=tokens.reduce((s,t)=>s+(t.vol5m||0),0)
  const txns =tokens.reduce((s,t)=>s+(t.txns5m||0),0)
  const newestAgeSec=result.length?Math.min(...result.map(t=>t.ageSec||999999)):0

  return j({success:true,data:{tokens:result,total,page,limit,stats:{vol5m,txns},newestAgeSec,fetchedAt:Date.now()}})
}

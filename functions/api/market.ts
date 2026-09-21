/**
 * Arc Token Market API — DexScreener only, real data, D1 persistent storage
 *
 * Official DexScreener API (docs.dexscreener.com/api/reference):
 *   GET /token-profiles/latest/v1       → newest token listings
 *   GET /token-boosts/top/v1            → top promoted tokens
 *   GET /token-boosts/active/v1         → currently active boosts
 *   GET /latest/dex/search?q={q}        → search pairs by query
 *   GET /latest/dex/tokens/{addresses}  → pairs for token addresses (max 30)
 *   GET /token-pairs/v1/arc/{address}   → all pairs for a token on Arc
 *
 * D1 table: arc_tokens (address PRIMARY KEY — no duplicates)
 * KV: fast 5-min read cache on top of D1
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json' }
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d,(_,v)=>typeof v==='bigint'?v.toString():v),{status:s,headers:CORS})

/* ── D1 table setup ───────────────────────────────────────────────────── */
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

function isArc(chainId: string): boolean {
  const c = (chainId ?? '').toLowerCase()
  return c === 'arc' || c === '5042' || c.includes('arc')
}

function pairToToken(p: any): Token | null {
  const base = p.baseToken ?? {}
  const addr = (base.address ?? '').toLowerCase()
  if (!addr || addr === '0x'+'0'.repeat(40)) return null
  if (!isArc(p.chainId ?? '')) return null
  return {
    address:     addr,
    pairAddress: (p.pairAddress ?? '').toLowerCase(),
    name:        base.name ?? '',
    symbol:      base.symbol ?? '',
    logoUrl:     p.info?.imageUrl ?? p.info?.header ?? `https://dd.dexscreener.com/ds-data/tokens/arc/${addr}.png`,
    priceUsd:    parseFloat(p.priceUsd ?? '0') || 0,
    change5m:    p.priceChange?.m5  != null ? parseFloat(p.priceChange.m5)  : undefined,
    change1h:    p.priceChange?.h1  != null ? parseFloat(p.priceChange.h1)  : undefined,
    change6h:    p.priceChange?.h6  != null ? parseFloat(p.priceChange.h6)  : undefined,
    change24h:   p.priceChange?.h24 != null ? parseFloat(p.priceChange.h24) : undefined,
    liqUsd:      parseFloat(p.liquidity?.usd ?? '0') || 0,
    volUsd:      parseFloat(p.volume?.h24 ?? '0') || 0,
    mcapUsd:     parseFloat(p.marketCap ?? p.fdv ?? '0') || 0,
    ageSec:      p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 1000) : 0,
    buys24h:     p.txns?.h24?.buys ?? 0,
    sells24h:    p.txns?.h24?.sells ?? 0,
    txns5m:      (p.txns?.m5?.buys ?? 0) + (p.txns?.m5?.sells ?? 0),
    vol5m:       parseFloat(p.volume?.m5 ?? '0') || 0,
    dexId:       p.dexId ?? '',
    updatedAt:   Math.floor(Date.now() / 1000),
  }
}

function rowToToken(r: any): Token {
  return {
    address:r.address, pairAddress:r.pair_address??'', name:r.name??'', symbol:r.symbol??'',
    logoUrl:r.logo_url??'', priceUsd:r.price_usd??0, change5m:r.change_5m??undefined,
    change1h:r.change_1h??undefined, change6h:r.change_6h??undefined, change24h:r.change_24h??undefined,
    liqUsd:r.liq_usd??0, volUsd:r.vol_usd??0, mcapUsd:r.mcap_usd??0,
    ageSec:r.age_sec??0, buys24h:r.buys_24h??0, sells24h:r.sells_24h??0,
    txns5m:r.txns_5m??0, vol5m:r.vol_5m??0, dexId:r.dex_id??'', updatedAt:r.updated_at??0,
  }
}

/* ── D1 read / write ──────────────────────────────────────────────────── */
async function dbSetup(env: Env) {
  if (!env.DB) return
  for (const stmt of CREATE_SQL.split(';').map(s=>s.trim()).filter(Boolean)) {
    await env.DB.exec(stmt + ';').catch(()=>{})
  }
}

async function dbLoad(env: Env, tab='trending', limit=500): Promise<Token[]> {
  if (!env.DB) return []
  try {
    await dbSetup(env)
    const order = tab==='new' ? 'age_sec ASC' : tab==='top' ? 'mcap_usd DESC' : 'vol_5m DESC, vol_usd DESC'
    const rows = await env.DB.prepare(`SELECT * FROM arc_tokens ORDER BY ${order} LIMIT ?`).bind(limit).all()
    return (rows.results ?? []).map(rowToToken)
  } catch { return [] }
}

async function dbSave(tokens: Token[], env: Env) {
  if (!env.DB || !tokens.length) return
  try {
    await dbSetup(env)
    // Batch INSERT OR REPLACE — no duplicates (address is PK)
    const BATCH = 50
    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH)
      await env.DB.batch(
        batch.map(t => env.DB.prepare(`
          INSERT OR REPLACE INTO arc_tokens
            (address,pair_address,name,symbol,logo_url,price_usd,change_5m,change_1h,change_6h,change_24h,
             liq_usd,vol_usd,mcap_usd,age_sec,buys_24h,sells_24h,txns_5m,vol_5m,dex_id,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          t.address, t.pairAddress, t.name, t.symbol, t.logoUrl,
          t.priceUsd, t.change5m??null, t.change1h??null, t.change6h??null, t.change24h??null,
          t.liqUsd, t.volUsd, t.mcapUsd, t.ageSec, t.buys24h, t.sells24h, t.txns5m, t.vol5m,
          t.dexId, t.updatedAt
        ))
      )
    }
    console.log(`[D1] saved ${tokens.length} Arc tokens`)
  } catch (e) { console.error('[D1] save error', e) }
}

/* ── DexScreener Arc discovery ────────────────────────────────────────── */
const ARC_QUERIES = [
  'arc','USDC arc','glow arc','cat arc','dog arc','inu arc','meme arc',
  'ai arc','fun arc','token arc','pump arc','pepe arc','moon arc','baby arc',
  'defi arc','nft arc','dao arc','swap arc','usdt arc','weth arc',
]

async function discoverArcAddresses(): Promise<Set<string>> {
  const addrs = new Set<string>()
  // Official endpoints
  const [profiles, boosts, active] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-profiles/latest/v1', {headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)})
      .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
    fetch('https://api.dexscreener.com/token-boosts/top/v1', {headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)})
      .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
    fetch('https://api.dexscreener.com/token-boosts/active/v1', {headers:{accept:'application/json'},signal:AbortSignal.timeout(12_000)})
      .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
  ])
  for (const res of [profiles, boosts, active]) {
    if (res.status !== 'fulfilled') continue
    for (const t of res.value) {
      if (isArc(t.chainId ?? '') && t.tokenAddress) addrs.add(t.tokenAddress)
    }
  }
  return addrs
}

async function searchArcPairs(queries: string[]): Promise<any[]> {
  const pairs: any[] = []
  for (let i = 0; i < queries.length; i += 6) {
    const batch = queries.slice(i, i + 6)
    const results = await Promise.allSettled(batch.map(q =>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, {signal:AbortSignal.timeout(10_000)})
        .then(r=>r.ok?r.json():{pairs:[]}).then((d:any)=>(d.pairs??[]).filter((p:any)=>isArc(p.chainId??''))).catch(()=>[])
    ))
    for (const r of results) if (r.status==='fulfilled') pairs.push(...r.value)
  }
  return pairs
}

async function fetchArcPairsByAddresses(addrs: string[]): Promise<any[]> {
  const pairs: any[] = []
  const unique = [...new Set(addrs)]
  // Use /token-pairs/v1/arc/{address} for per-address (most accurate)
  for (let i = 0; i < Math.min(unique.length, 60); i += 6) {
    const batch = unique.slice(i, i + 6)
    const results = await Promise.allSettled(batch.map(addr =>
      fetch(`https://api.dexscreener.com/token-pairs/v1/arc/${addr}`, {signal:AbortSignal.timeout(8_000)})
        .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:(d.pairs??[])).catch(()=>[])
    ))
    for (const r of results) if (r.status==='fulfilled') pairs.push(...r.value)
  }
  // Bulk endpoint for remaining
  for (let i = 60; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30).join(',')
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, {signal:AbortSignal.timeout(10_000)})
      if (r.ok) { const d:any=await r.json(); pairs.push(...(d.pairs??[]).filter((p:any)=>isArc(p.chainId??''))) }
    } catch {}
  }
  return pairs
}

async function fetchAllArcTokens(): Promise<Token[]> {
  // 1. Discover addresses from official endpoints
  const [addrs, searchPairs] = await Promise.allSettled([
    discoverArcAddresses(),
    searchArcPairs(ARC_QUERIES),
  ])

  const addrSet = addrs.status==='fulfilled' ? addrs.value : new Set<string>()
  const directPairs = searchPairs.status==='fulfilled' ? searchPairs.value : []

  // 2. Fetch pairs for discovered addresses
  const addrPairs = await fetchArcPairsByAddresses([...addrSet])

  // 3. Merge all pairs → deduplicate by token address (keep highest volume)
  const map = new Map<string, Token>()
  for (const p of [...directPairs, ...addrPairs]) {
    const t = pairToToken(p)
    if (!t) continue
    const ex = map.get(t.address)
    if (!ex || t.volUsd >= ex.volUsd) map.set(t.address, t)
  }

  return [...map.values()]
}

/* ── Sort ─────────────────────────────────────────────────────────────── */
function sortTokens(tokens: Token[], tab: string): Token[] {
  return [...tokens].sort((a, b) =>
    tab==='new'  ? (a.ageSec||999999)-(b.ageSec||999999) :
    tab==='top'  ? (b.mcapUsd)-(a.mcapUsd) :
    ((b.vol5m||b.volUsd)-(a.vol5m||a.volUsd)) || (b.txns5m-a.txns5m)
  )
}

/* ── Synthetic OHLCV (fallback only) ─────────────────────────────────── */
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
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx
  if (request.method === 'OPTIONS') return new Response(null, {headers:CORS})
  const url = new URL(request.url), path = url.pathname.replace(/\/$/,'')

  /* Logo proxy */
  if (path.endsWith('/logo')) {
    const lu = url.searchParams.get('url'); if (!lu) return new Response('',{status:400})
    try {
      const r = await fetch(lu, {signal:AbortSignal.timeout(5_000)})
      if (!r.ok) return new Response('',{status:r.status})
      return new Response(await r.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400','Access-Control-Allow-Origin':'*'}})
    } catch { return new Response('',{status:502}) }
  }

  /* OHLCV — real data from GeckoTerminal, no simulation */
  if (path.endsWith('/ohlcv')) {
    const pool  = url.searchParams.get('pool') ?? ''
    const token = url.searchParams.get('token') ?? ''
    const tf    = url.searchParams.get('tf') ?? '1h'
    const [res, agg] = tf==='5m'?['minute','5']:tf==='15m'?['minute','15']:tf==='4h'?['hour','4']:tf==='1d'?['day','1']:['hour','1']

    const ck = `ohlcv:arc:${pool||token}:${tf}`
    const cached = env.CONFIG ? await env.CONFIG.get(ck).catch(()=>null) : null
    if (cached) return j({success:true,data:JSON.parse(cached),cached:true})

    let candles: any[] = []
    const tryGT = async (addr: string) => {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/pools/${addr}/ohlcv/${res}?aggregate=${agg}&limit=300`,{signal:AbortSignal.timeout(8_000)})
        if (!r.ok) return []
        const d: any = await r.json()
        return (d.data?.attributes?.ohlcv_list ?? []).reverse().map(([t,o,h,l,c,v]:number[])=>({time:Math.floor(t/1000),open:o,high:h,low:l,close:c,volume:v}))
      } catch { return [] }
    }

    if (pool)  candles = await tryGT(pool)
    if (!candles.length && token) {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${token}/pools?page=1`,{signal:AbortSignal.timeout(6_000)})
        if (r.ok) { const d:any=await r.json(); const p=d.data?.[0]?.attributes?.address; if(p)candles=await tryGT(p) }
      } catch {}
    }

    // Only cache real data
    if (candles.length >= 5 && env.CONFIG) {
      env.CONFIG.put(ck, JSON.stringify(candles), {expirationTtl:900}).catch(()=>{})
    }
    return j({success:true,data:candles,real:candles.length>=5})
  }

  /* Token list */
  const tab   = (url.searchParams.get('tab') ?? 'trending').toLowerCase()
  const q     = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '200'))

  // Try KV fast cache first (5-min TTL)
  const kvKey = `arc:tokens:${tab}`
  const kvRaw = env.CONFIG ? await env.CONFIG.get(kvKey).catch(()=>null) : null
  
  // Track last successful refresh time so we know how stale data is
  const lastRefreshKey = 'arc:last_refresh'
  const lastRefresh = env.CONFIG ? parseInt(await env.CONFIG.get(lastRefreshKey).catch(()=>'0') || '0') : 0
  const dataAgeMs = Date.now() - lastRefresh * 1000
  const needsRefresh = dataAgeMs > 5 * 60 * 1000  // refresh every 5 min

  let tokens: Token[]
  if (kvRaw) {
    tokens = JSON.parse(kvRaw)
    // Background: fetch fresh + save to D1
    ctx.waitUntil((async () => {
      const fresh = await fetchAllArcTokens()
      if (!fresh.length) return
      const sorted = sortTokens(fresh, 'trending')
      await Promise.allSettled([
        dbSave(fresh, env),
        env.CONFIG?.put(`arc:tokens:trending`, JSON.stringify(sortTokens(sorted,'trending')), {expirationTtl:300}),
        env.CONFIG?.put(`arc:tokens:new`,      JSON.stringify(sortTokens(sorted,'new')),      {expirationTtl:300}),
        env.CONFIG?.put(`arc:tokens:top`,      JSON.stringify(sortTokens(sorted,'top')),      {expirationTtl:300}),
      ])
    })().catch(()=>{}))
  } else {
    // Try D1 first (persistent store)
    const dbTokens = await dbLoad(env, tab, 1000)
    if (dbTokens.length >= 5) {
      tokens = dbTokens
      // Refresh in background
      ctx.waitUntil((async () => {
        const fresh = await fetchAllArcTokens()
        if (!fresh.length) return
        await dbSave(fresh, env)
        const sorted = sortTokens(fresh, 'trending')
        await Promise.allSettled([
          env.CONFIG?.put(`arc:tokens:trending`, JSON.stringify(sortTokens(sorted,'trending')), {expirationTtl:300}),
          env.CONFIG?.put(`arc:tokens:new`,      JSON.stringify(sortTokens(sorted,'new')),      {expirationTtl:300}),
          env.CONFIG?.put(`arc:tokens:top`,      JSON.stringify(sortTokens(sorted,'top')),      {expirationTtl:300}),
        ])
      })().catch(()=>{}))
    } else {
      // First ever load — fetch synchronously
      const fresh = await fetchAllArcTokens()
      tokens = sortTokens(fresh, tab)
      ctx.waitUntil(Promise.allSettled([
        dbSave(fresh, env),
        env.CONFIG?.put(`arc:tokens:trending`, JSON.stringify(sortTokens(fresh,'trending')), {expirationTtl:300}),
        env.CONFIG?.put(`arc:tokens:new`,      JSON.stringify(sortTokens(fresh,'new')),      {expirationTtl:300}),
        env.CONFIG?.put(`arc:tokens:top`,      JSON.stringify(sortTokens(fresh,'top')),      {expirationTtl:300}),
      ]))
    }
  }

  tokens = sortTokens(tokens, tab)
  if (q) tokens = tokens.filter(t => t.name.toLowerCase().includes(q)||t.symbol.toLowerCase().includes(q)||t.address.includes(q))

  const total = tokens.length
  const page  = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const result = tokens.slice((page-1)*limit, page*limit)
  const vol5m  = tokens.reduce((s,t)=>s+(t.vol5m||0),0)
  const txns   = tokens.reduce((s,t)=>s+(t.txns5m||0),0)

  return j({success:true,data:{tokens:result,total,page,limit,stats:{vol5m,txns}}})
}

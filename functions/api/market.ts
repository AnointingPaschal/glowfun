/**
 * /api/market — Multi-chain DexScreener discovery (Snipe Spirit approach)
 * Sources:  token-boosts/top/v1  +  token-profiles/latest/v1
 *           then  /token-pairs/v1/{chain}/{address}  per token
 * KV stale-while-revalidate — tokens NEVER clear between reloads.
 *
 * GET /api/market?chain=arc&tab=trending&limit=200&q=
 * GET /api/market/ohlcv?pool=&token=&tf=1h
 * GET /api/market/logo?url=
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json' }
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d,(_,v)=>typeof v==='bigint'?v.toString():v),{status:s,headers:CORS})

/* ── Chain IDs (DexScreener uses these) ────────────────────────────────── */
const DS_CHAINS: Record<string,string> = {
  arc:'arc', ethereum:'ethereum', solana:'solana', bsc:'bsc', base:'base',
  polygon:'polygon', avalanche:'avalanche', arbitrum:'arbitrum',
  pulsechain:'pulsechain', optimism:'optimism', fantom:'fantom', cronos:'cronos',
  hyperevm:'hyperevm', ton:'ton',
}
const GT_NETS: Record<string,string> = {
  arc:'arc', ethereum:'eth', solana:'solana', bsc:'bsc', base:'base',
  polygon:'polygon_pos', avalanche:'avax', arbitrum:'arbitrum',
  optimism:'optimism', fantom:'ftm', cronos:'cronos',
}

function matchChain(pChainId:string, target:string): boolean {
  if (target==='all') return true
  const c = pChainId.toLowerCase()
  if (target==='arc') return c==='arc' || c.includes('arc') || c==='5042'
  return c === (DS_CHAINS[target] ?? target)
}

/* ── Token shape ────────────────────────────────────────────────────────── */
type Token = {
  address:string; name:string; symbol:string; logoUrl:string; chain:string
  priceUsd:number; change5m?:number; change1h?:number; change6h?:number; change24h?:number
  liquidityUsd?:number; volumeUsd?:number; mcapUsd?:number
  age?:number; buys24h?:number; sells24h?:number; txns5m?:number; vol5m?:number
  pairAddress?:string; dexId?:string; dexLogoUrl?:string; chainLogoUrl?:string; source:string
}

function normDS(p:any, targetChain:string): Token|null {
  const base = p.baseToken??{}
  const addr = (base.address??'').toLowerCase()
  if (!addr || addr==='0x'+'0'.repeat(40)) return null
  const cid  = (p.chainId??targetChain).toLowerCase()
  // Chain logo from DexScreener's own CDN
  const chainLogoUrl = `https://dd.dexscreener.com/ds-data/chains/${cid}.png`
  // DEX logo from DexScreener's own CDN
  const dexLogoUrl   = p.dexId ? `https://dd.dexscreener.com/ds-data/dexes/${p.dexId.toLowerCase()}.png` : ''
  return {
    address:addr, name:base.name??'', symbol:base.symbol??'',
    logoUrl: p.info?.imageUrl ?? p.info?.header ?? '',
    chain:cid, chainLogoUrl, dexLogoUrl,
    priceUsd:     parseFloat(p.priceUsd??'0')||0,
    change5m:     p.priceChange?.m5  !=null ? parseFloat(p.priceChange.m5)  : undefined,
    change1h:     p.priceChange?.h1  !=null ? parseFloat(p.priceChange.h1)  : undefined,
    change6h:     p.priceChange?.h6  !=null ? parseFloat(p.priceChange.h6)  : undefined,
    change24h:    p.priceChange?.h24 !=null ? parseFloat(p.priceChange.h24) : undefined,
    liquidityUsd: parseFloat(p.liquidity?.usd??'0')||undefined,
    volumeUsd:    parseFloat(p.volume?.h24??'0')||undefined,
    vol5m:        parseFloat(p.volume?.m5??'0')||undefined,
    txns5m:       (p.txns?.m5?.buys??0)+(p.txns?.m5?.sells??0)||undefined,
    mcapUsd:      parseFloat(p.marketCap??p.fdv??'0')||undefined,
    age:          p.pairCreatedAt ? Math.floor((Date.now()-p.pairCreatedAt)/1000) : undefined,
    buys24h:      p.txns?.h24?.buys, sells24h:p.txns?.h24?.sells,
    pairAddress:  (p.pairAddress??'').toLowerCase(), dexId:p.dexId, source:'dexscreener',
  }
}

/* ── Step 1: discover token addresses (Snipe Spirit approach) ─────────── */
async function discoverAddresses(chain:string): Promise<Map<string,string[]>> {
  // Returns map of chainId → [tokenAddress]
  const [boostsR, profilesR] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-boosts/top/v1',    {headers:{accept:'application/json'},signal:AbortSignal.timeout(10_000)})
      .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
    fetch('https://api.dexscreener.com/token-profiles/latest/v1',{headers:{accept:'application/json'},signal:AbortSignal.timeout(10_000)})
      .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:[]),
  ])
  const all = [
    ...(boostsR.status==='fulfilled'  ? boostsR.value  : []),
    ...(profilesR.status==='fulfilled' ? profilesR.value : []),
  ]
  const byChain = new Map<string,string[]>()
  for (const t of all) {
    const cid = (t.chainId??'').toLowerCase()
    if (!cid || !t.tokenAddress) continue
    if (!byChain.has(cid)) byChain.set(cid,[])
    byChain.get(cid)!.push(t.tokenAddress)
  }
  return byChain
}

/* ── Step 2: fetch pair data per chain (Snipe Spirit: token-pairs/v1) ─── */
async function fetchPairsForChain(chain:string, addresses:string[]): Promise<any[]> {
  const pairs: any[] = []
  const dsChain = DS_CHAINS[chain]??chain
  const unique  = [...new Set(addresses)].slice(0,120) // cap 120 addresses

  // A) Per-address using the new token-pairs endpoint (most accurate, per-chain)
  //    Batch: run 6 in parallel to stay within rate limits
  const BATCH = 6
  for (let i=0; i<Math.min(unique.length,60); i+=BATCH) {
    const slice = unique.slice(i,i+BATCH)
    const results = await Promise.allSettled(
      slice.map(addr =>
        chain==='all'
          ? fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`,{signal:AbortSignal.timeout(8_000)})
              .then(r=>r.ok?r.json():{pairs:[]}).then((d:any)=>d.pairs??[])
          : fetch(`https://api.dexscreener.com/token-pairs/v1/${dsChain}/${addr}`,{signal:AbortSignal.timeout(8_000)})
              .then(r=>r.ok?r.json():[]).then((d:any)=>Array.isArray(d)?d:(d.pairs??[]))
      )
    )
    for (const r of results) if (r.status==='fulfilled') pairs.push(...r.value)
  }

  // B) Bulk fallback for remaining addresses
  for (let i=60; i<unique.length; i+=30) {
    const chunk = unique.slice(i,i+30).join(',')
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`,{signal:AbortSignal.timeout(10_000)})
      if (r.ok) { const d:any = await r.json(); pairs.push(...(d.pairs??[])) }
    } catch {}
  }

  return pairs
}

/* ── GeckoTerminal supplement ─────────────────────────────────────────── */
async function fetchGeckoForChain(chain:string): Promise<Token[]> {
  const nets = chain==='all' ? Object.values(GT_NETS) : [GT_NETS[chain]].filter(Boolean)
  const tokens: Token[] = []
  for (const net of nets.slice(0,5)) {  // max 5 networks for 'all'
    const urls = [
      `https://api.geckoterminal.com/api/v2/networks/${net}/trending_pools?duration=24h`,
      `https://api.geckoterminal.com/api/v2/networks/${net}/new_pools?page=1`,
      `https://api.geckoterminal.com/api/v2/networks/${net}/pools?page=1&sort=h24_volume_usd_liquidity_desc`,
    ]
    const results = await Promise.allSettled(urls.map(u=>
      fetch(u,{signal:AbortSignal.timeout(8_000)}).then(r=>r.ok?r.json():{data:[]}).then((d:any)=>d.data??[]).catch(()=>[])
    ))
    for (const r of results) {
      if (r.status!=='fulfilled') continue
      for (const pool of r.value) {
        const a = pool.attributes??{}
        const baseId = pool.relationships?.base_token?.data?.id??''
        const addr = (baseId.includes('_') ? baseId.split('_').slice(1).join('_') : '').toLowerCase()
        if (!addr || tokens.some(t=>t.address===addr)) continue
        const sym = (a.name??'').split(' / ')[0]||'?'
        const chainLogoUrl = `https://dd.dexscreener.com/ds-data/chains/${net}.png`
        tokens.push({
          address:addr, name:a.name??sym, symbol:sym, logoUrl:'', chain:net,
          chainLogoUrl, dexLogoUrl:'',
          priceUsd:  parseFloat(a.base_token_price_usd??'0')||0,
          change5m:  a.price_change_percentage?.m5  !=null?parseFloat(a.price_change_percentage.m5):undefined,
          change1h:  a.price_change_percentage?.h1  !=null?parseFloat(a.price_change_percentage.h1):undefined,
          change6h:  a.price_change_percentage?.h6  !=null?parseFloat(a.price_change_percentage.h6):undefined,
          change24h: a.price_change_percentage?.h24 !=null?parseFloat(a.price_change_percentage.h24):undefined,
          liquidityUsd:parseFloat(a.reserve_in_usd??'0')||undefined,
          volumeUsd:   parseFloat(a.volume_usd?.h24??'0')||undefined,
          vol5m:       parseFloat(a.volume_usd?.m5??'0')||undefined,
          mcapUsd:     parseFloat(a.fdv_usd??'0')||undefined,
          age:a.pool_created_at?Math.floor((Date.now()-new Date(a.pool_created_at).getTime())/1000):undefined,
          buys24h:a.transactions?.h24?.buys, sells24h:a.transactions?.h24?.sells,
          txns5m:(a.transactions?.m5?.buys??0)+(a.transactions?.m5?.sells??0)||undefined,
          pairAddress:(a.address??'').toLowerCase(), source:'geckoterminal',
        })
      }
    }
  }
  return tokens
}

/* ── Sort by tab ────────────────────────────────────────────────────────── */
function sortByTab(tokens:Token[], tab:string): Token[] {
  return [...tokens].sort((a,b) => {
    if (tab==='new')  return (a.age??999999)-(b.age??999999)
    if (tab==='top')  return (b.mcapUsd??0)-(a.mcapUsd??0)
    // trending: 5m vol then txns
    const vd = (b.vol5m??b.volumeUsd??0)-(a.vol5m??a.volumeUsd??0)
    if (vd!==0) return vd
    return (b.txns5m??0)-(a.txns5m??0)
  })
}

/* ── Logo cache (D1) ────────────────────────────────────────────────────── */
async function fillLogos(tokens:Token[], env:Env) {
  const need = tokens.filter(t=>!t.logoUrl).slice(0,30)
  if (!need.length||!env.DB) return
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS token_logos (address TEXT,chain TEXT,logo_url TEXT NOT NULL,cached_at INTEGER NOT NULL,PRIMARY KEY(address,chain))`)
    const ph   = need.map(()=>'(?,?)').join(',')
    const args = need.flatMap(t=>[t.address,t.chain])
    const rows = await env.DB.prepare(`SELECT address,chain,logo_url FROM token_logos WHERE (address,chain) IN (${ph}) AND cached_at>?`)
      .bind(...args,Math.floor(Date.now()/1000)-86400).all()
    const cached = new Map((rows.results??[]).map((r:any)=>[`${r.chain}:${r.address}`,r.logo_url]))
    const stillNeed: Token[] = []
    for (const t of need) {
      const l = cached.get(`${t.chain}:${t.address}`)
      if (l) t.logoUrl=l; else stillNeed.push(t)
    }
    // Fetch remaining from GeckoTerminal (batch 8)
    for (let i=0;i<Math.min(stillNeed.length,16);i+=8) {
      const batch = stillNeed.slice(i,i+8)
      const logos = await Promise.allSettled(batch.map(t=>{
        const net=GT_NETS[t.chain]??t.chain
        return fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${t.address}`,{signal:AbortSignal.timeout(4_000)})
          .then(r=>r.ok?r.json():{}).then((d:any)=>d.data?.attributes?.image_url??'').catch(()=>'')
      }))
      const writes:Promise<any>[]=[]
      for (let b=0;b<batch.length;b++) {
        const logo=logos[b].status==='fulfilled'?logos[b].value:''
        if (logo) batch[b].logoUrl=logo
        writes.push(env.DB.prepare(`INSERT OR REPLACE INTO token_logos VALUES(?,?,?,?)`).bind(batch[b].address,batch[b].chain,logo,Math.floor(Date.now()/1000)).run().catch(()=>{}))
      }
      await Promise.allSettled(writes)
    }
  } catch {}
}

/* ── KV stale-while-revalidate ──────────────────────────────────────────── */
const FRESH_TTL  = 300    // 5 min
const BACKUP_TTL = 86400  // 24 hr

async function getOrFetch(chain:string, tab:string, env:Env, ctx:any): Promise<Token[]> {
  const fKey = `market:v5:${chain}:${tab}`
  const bKey = `market:v5:${chain}:${tab}:bak`

  // Fresh cache
  const fresh = env.CONFIG ? await env.CONFIG.get(fKey).catch(()=>null) : null
  if (fresh) {
    // Refresh in background every time (cheap since we just return cached)
    ctx?.waitUntil?.(fetchAndStore(chain,tab,fKey,bKey,env).catch(()=>{}))
    return JSON.parse(fresh)
  }
  // Backup — return stale immediately, refresh in bg
  const backup = env.CONFIG ? await env.CONFIG.get(bKey).catch(()=>null) : null
  if (backup) {
    ctx?.waitUntil?.(fetchAndStore(chain,tab,fKey,bKey,env).catch(()=>{}))
    return JSON.parse(backup)
  }
  // Nothing cached — fetch synchronously
  return fetchAndStore(chain,tab,fKey,bKey,env)
}

async function fetchAndStore(chain:string, tab:string, fKey:string, bKey:string, env:Env): Promise<Token[]> {
  // 1. Discover addresses from DexScreener boosts + profiles
  const byChain = await discoverAddresses(chain)

  // 2. Get addresses for target chain
  let targetAddresses: string[]
  if (chain==='all') {
    targetAddresses = [...byChain.values()].flat()
  } else {
    const dsId = DS_CHAINS[chain]??chain
    // Try exact match first, then fuzzy
    targetAddresses = byChain.get(dsId) ?? byChain.get(chain) ?? []
    // Also check variants (e.g. arc might be stored as 'arc' or '5042')
    if (!targetAddresses.length) {
      for (const [cid,addrs] of byChain) {
        if (matchChain(cid,chain)) { targetAddresses.push(...addrs) }
      }
    }
  }

  // 3. Fetch pair data per chain using proper endpoints
  const [dsPairs, gtTokens] = await Promise.allSettled([
    fetchPairsForChain(chain, [...new Set(targetAddresses)]),
    fetchGeckoForChain(chain),
  ])

  // 4. Merge: DS wins on same address+chain
  const map = new Map<string,Token>()
  if (gtTokens.status==='fulfilled') gtTokens.value.forEach(t=>map.set(`${t.chain}:${t.address}`,t))
  if (dsPairs.status==='fulfilled') {
    for (const p of dsPairs.value) {
      if (!matchChain(p.chainId??'',chain)) continue
      const t = normDS(p,chain)
      if (!t) continue
      const key = `${t.chain}:${t.address}`
      const ex  = map.get(key)
      if (!ex||(t.volumeUsd??0)>(ex.volumeUsd??0)) map.set(key,t)
    }
  }

  const tokens = [...map.values()]

  // 5. Fill missing logos
  await fillLogos(tokens,env)

  // 6. Sort and cache
  const sorted = sortByTab(tokens,'trending')  // store as trending; re-sort per tab client-side
  const payload = JSON.stringify(sorted)
  if (env.CONFIG) {
    await Promise.allSettled([
      env.CONFIG.put(fKey,payload,{expirationTtl:FRESH_TTL}),
      env.CONFIG.put(bKey,payload,{expirationTtl:BACKUP_TTL}),
    ])
  }
  return sorted
}

/* ── Synthetic OHLCV ───────────────────────────────────────────────────── */
function synth(price:number,ch24:number,age:number,n=60):any[] {
  if (!price) return []
  const start=Math.abs(ch24)>0.5?price/(1+ch24/100):price*0.7
  const now=Math.floor(Date.now()/1000); const iv=Math.max(Math.floor(age/n),300)
  let seed=(Math.abs(Math.round(price*1e9))^0x5f3759df)%65535||12345
  const rng=()=>{seed=(seed*1664525+1013904223)&0xffffffff;return(seed>>>0)/0xffffffff}
  return Array.from({length:n},(_,i)=>{
    const t=now-(n-i-1)*iv,prog=(i+1)/n
    const base=start+(price-start)*Math.pow(prog,0.75)
    const ns=0.025+rng()*0.05; const dir=rng()>0.44?1:-1
    const o=Math.max(base*(1+(rng()-0.5)*ns*0.55),1e-30)
    const c=Math.max(base*(1+dir*ns*0.4*rng()),1e-30)
    return{time:t,open:o,high:Math.max(o,c)*(1+ns*0.1*rng()),low:Math.min(o,c)*(1-ns*0.07*rng()),close:c,volume:rng()*6000+300}
  })
}

/* ── Main handler ──────────────────────────────────────────────────────── */
export const onRequest:PagesFunction<Env> = async(ctx)=>{
  const {request,env}=ctx
  if (request.method==='OPTIONS') return new Response(null,{headers:CORS})
  const url=new URL(request.url)
  const path=url.pathname.replace(/\/$/,'')

  // Logo proxy
  if (path.endsWith('/logo')) {
    const lu=url.searchParams.get('url'); if (!lu) return new Response('',{status:400})
    try{
      const r=await fetch(lu,{signal:AbortSignal.timeout(5_000)})
      if (!r.ok) return new Response('',{status:r.status})
      return new Response(await r.arrayBuffer(),{headers:{'Content-Type':r.headers.get('content-type')?'image/png':'image/png','Cache-Control':'public,max-age=86400','Access-Control-Allow-Origin':'*'}})
    }catch{return new Response('',{status:502})}
  }

  // OHLCV
  if (path.endsWith('/ohlcv')) {
    const pool=url.searchParams.get('pool')??'', token=url.searchParams.get('token')??''
    const tf=url.searchParams.get('tf')?? '1h', price=parseFloat(url.searchParams.get('price')??'0')
    const ch24=parseFloat(url.searchParams.get('change24h')??'0'), age=parseInt(url.searchParams.get('age')??'86400')
    const ck=`ohlcv:v2:${pool||token}:${tf}`
    const cached=env.CONFIG?await env.CONFIG.get(ck).catch(()=>null):null
    if (cached) return j({success:true,data:JSON.parse(cached),cached:true})
    const [res,agg]=tf==='5m'?['minute','5']:tf==='15m'?['minute','15']:tf==='4h'?['hour','4']:tf==='1d'?['day','1']:['hour','1']
    let candles:any[]=[]
    const tryGT=async(addr:string,net='arc')=>{
      try{const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${addr}/ohlcv/${res}?aggregate=${agg}&limit=300`,{signal:AbortSignal.timeout(8_000)})
        if (!r.ok) return []
        const d:any=await r.json()
        return(d.data?.attributes?.ohlcv_list??[]).reverse().map(([t,o,h,l,c,v]:number[])=>({time:Math.floor(t/1000),open:o,high:h,low:l,close:c,volume:v}))
      }catch{return[]}
    }
    if (pool) candles=await tryGT(pool)
    if (!candles.length&&token){
      try{const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${token}/pools?page=1`,{signal:AbortSignal.timeout(6_000)})
        if (r.ok){const d:any=await r.json();const p=d.data?.[0]?.attributes?.address;if(p)candles=await tryGT(p)}
      }catch{}
    }
    if (!candles.length) candles=synth(price,ch24,age)
    if (candles.length&&env.CONFIG) env.CONFIG.put(ck,JSON.stringify(candles),{expirationTtl:900}).catch(()=>{})
    return j({success:true,data:candles})
  }

  // Token list
  const chain=(url.searchParams.get('chain')?? 'arc').toLowerCase()
  const tab  =(url.searchParams.get('tab')  ??' trending').toLowerCase()
  const q    =(url.searchParams.get('q')    ?? '').trim().toLowerCase()
  const limit=Math.min(500,parseInt(url.searchParams.get('limit')??'200'))

  let tokens=await getOrFetch(chain,tab,env,ctx)
  tokens=sortByTab(tokens,tab)
  if (q) tokens=tokens.filter(t=>t.name.toLowerCase().includes(q)||t.symbol.toLowerCase().includes(q)||t.address.includes(q))

  const total=tokens.length, page=Math.max(1,parseInt(url.searchParams.get('page')??'1'))
  const result=tokens.slice((page-1)*limit,page*limit)
  const vol24h=tokens.reduce((s,t)=>s+(t.volumeUsd??0),0)
  const vol5m =tokens.reduce((s,t)=>s+(t.vol5m??0),0)
  const txns  =tokens.reduce((s,t)=>s+(t.txns5m??0),0)

  return j({success:true,data:{tokens:result,total,page,limit,stats:{vol24h,vol5m,txns}}})
}

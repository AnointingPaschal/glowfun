/**
 * /api/market — Multi-chain token data from DexScreener + GeckoTerminal
 * KV-cached with stale-while-revalidate — tokens NEVER clear between reloads.
 *
 * GET /api/market?chain=arc&tab=trending&limit=200&q=search
 * GET /api/market/ohlcv?pool=<addr>&token=<addr>&tf=1h
 * GET /api/market/logo?url=<encoded>
 * Chains: arc | ethereum | solana | bsc | base | polygon | avalanche | arbitrum | all
 * Tabs:   trending | new | top
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json' }
const j = (d: unknown, s = 200) => new Response(JSON.stringify(d, (_k, v) => typeof v === 'bigint' ? v.toString() : v), { status: s, headers: CORS })

/* ── Chain mappings ─────────────────────────────────────────────────────────── */
const DS_CHAIN: Record<string, string> = {
  arc: 'arc', ethereum: 'ethereum', solana: 'solana', bsc: 'bsc',
  base: 'base', polygon: 'polygon', avalanche: 'avalanche', arbitrum: 'arbitrum',
  pulsechain: 'pulsechain', hyperevm: 'hyperevm', ton: 'ton',
}
const GT_NETWORK: Record<string, string> = {
  arc: 'arc', ethereum: 'eth', solana: 'solana', bsc: 'bsc',
  base: 'base', polygon: 'polygon_pos', avalanche: 'avax', arbitrum: 'arbitrum',
  pulsechain: 'pulsechain', hyperevm: 'hyperevm',
}

/* ── Normalised token shape ─────────────────────────────────────────────────── */
type Token = {
  address: string; name: string; symbol: string; logoUrl: string; chain: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number; txns5m?: number; vol5m?: number
  pairAddress?: string; dexId?: string; source: string
}

/* ── DexScreener helpers ────────────────────────────────────────────────────── */
const isChain = (p: any, chain: string) => {
  if (chain === 'all') return true
  const c = (p?.chainId ?? '').toLowerCase()
  if (chain === 'arc') return c === 'arc' || c.includes('arc') || c === '5042'
  return c === DS_CHAIN[chain]
}

function normDS(p: any, chain: string): Token | null {
  const base = p.baseToken ?? {}
  const addr = (base.address ?? '').toLowerCase()
  if (!addr || addr === '0x' + '0'.repeat(40)) return null
  return {
    address: addr, name: base.name ?? '', symbol: base.symbol ?? '',
    logoUrl: p.info?.imageUrl ?? p.info?.header ?? '', chain: p.chainId ?? chain,
    priceUsd:     parseFloat(p.priceUsd ?? '0') || 0,
    change5m:     p.priceChange?.m5  != null ? parseFloat(p.priceChange.m5)  : undefined,
    change1h:     p.priceChange?.h1  != null ? parseFloat(p.priceChange.h1)  : undefined,
    change6h:     p.priceChange?.h6  != null ? parseFloat(p.priceChange.h6)  : undefined,
    change24h:    p.priceChange?.h24 != null ? parseFloat(p.priceChange.h24) : undefined,
    liquidityUsd: parseFloat(p.liquidity?.usd ?? '0') || undefined,
    volumeUsd:    parseFloat(p.volume?.h24 ?? '0') || undefined,
    vol5m:        parseFloat(p.volume?.m5 ?? '0') || undefined,
    txns5m:       (p.txns?.m5?.buys ?? 0) + (p.txns?.m5?.sells ?? 0) || undefined,
    mcapUsd:      parseFloat(p.marketCap ?? p.fdv ?? '0') || undefined,
    age:          p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 1000) : undefined,
    buys24h:      p.txns?.h24?.buys, sells24h: p.txns?.h24?.sells,
    pairAddress:  (p.pairAddress ?? '').toLowerCase(), dexId: p.dexId, source: 'dexscreener',
  }
}

async function fetchDSForChain(chain: string): Promise<Token[]> {
  const pairs: any[] = []
  // 1. Token profiles & boosts (all chains — filter later)
  const [profilesR, boostsR] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-profiles/latest/v1', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : []).then((d: any) => Array.isArray(d) ? d : []),
    fetch('https://api.dexscreener.com/token-boosts/latest/v1', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : []).then((d: any) => Array.isArray(d) ? d : []),
  ])

  // Collect addresses from profiles/boosts for this chain
  const addrs = new Set<string>()
  for (const res of [profilesR, boostsR]) {
    if (res.status === 'fulfilled') {
      for (const p of res.value) {
        const cid = (p?.chainId ?? '').toLowerCase()
        if (chain === 'all' || isChain({ chainId: cid }, chain)) {
          if (p?.tokenAddress) addrs.add(p.tokenAddress)
        }
      }
    }
  }

  // 2. Bulk fetch pairs for those addresses
  const addrList = [...addrs]
  for (let i = 0; i < addrList.length; i += 30) {
    const chunk = addrList.slice(i, i + 30).join(',')
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, { signal: AbortSignal.timeout(10_000) })
      if (r.ok) { const d: any = await r.json(); pairs.push(...(d.pairs ?? []).filter((p: any) => isChain(p, chain))) }
    } catch {}
  }

  // 3. Search queries for the chain
  const queries = chain === 'arc'
    ? ['arc', 'USDC', 'meme', 'fun', 'glow', 'cat', 'dog', 'AI', 'inu', 'pepe']
    : chain === 'all'
    ? ['trending', 'meme', 'pepe', 'inu', 'AI', 'cat']
    : [`${chain}`, 'meme', 'trending']

  const searchResults = await Promise.allSettled(queries.map(q =>
    fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : { pairs: [] })
      .then((d: any) => (d.pairs ?? []).filter((p: any) => isChain(p, chain)))
      .catch(() => [])
  ))
  for (const r of searchResults) if (r.status === 'fulfilled') pairs.push(...r.value)

  // Deduplicate by address+chain, keep highest volume
  const tokenMap = new Map<string, Token>()
  for (const p of pairs) {
    const t = normDS(p, chain)
    if (!t) continue
    const key = `${t.chain}:${t.address}`
    const ex = tokenMap.get(key)
    if (!ex || (t.volumeUsd ?? 0) > (ex.volumeUsd ?? 0)) tokenMap.set(key, t)
  }
  return [...tokenMap.values()]
}

/* ── GeckoTerminal helpers ──────────────────────────────────────────────────── */
async function fetchGTForChain(chain: string): Promise<Token[]> {
  const networks = chain === 'all'
    ? Object.values(GT_NETWORK)
    : [GT_NETWORK[chain]].filter(Boolean)

  const results: Token[] = []
  for (const net of networks) {
    const pages = await Promise.allSettled([
      ...[1,2,3,4,5].map(p => `https://api.geckoterminal.com/api/v2/networks/${net}/new_pools?page=${p}`),
      ...[1,2,3].map(p => `https://api.geckoterminal.com/api/v2/networks/${net}/pools?page=${p}&sort=h24_volume_usd_liquidity_desc`),
      `https://api.geckoterminal.com/api/v2/networks/${net}/trending_pools?duration=24h`,
    ].map(url =>
      fetch(url, { signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : { data: [] }).then((d: any) => d.data ?? []).catch(() => [])
    ))

    for (const r of pages) {
      if (r.status !== 'fulfilled') continue
      for (const pool of r.value) {
        const a = pool.attributes ?? {}
        const baseId = pool.relationships?.base_token?.data?.id ?? ''
        const addr = (baseId.includes('_') ? baseId.split('_').slice(1).join('_') : '').toLowerCase()
        if (!addr || results.some(t => t.address === addr && t.chain === net)) continue
        const sym = (a.name ?? '').split(' / ')[0] || '?'
        results.push({
          address: addr, name: a.name ?? sym, symbol: sym, logoUrl: '', chain: net,
          priceUsd: parseFloat(a.base_token_price_usd ?? '0') || 0,
          change5m: a.price_change_percentage?.m5  != null ? parseFloat(a.price_change_percentage.m5)  : undefined,
          change1h: a.price_change_percentage?.h1  != null ? parseFloat(a.price_change_percentage.h1)  : undefined,
          change6h: a.price_change_percentage?.h6  != null ? parseFloat(a.price_change_percentage.h6)  : undefined,
          change24h:a.price_change_percentage?.h24 != null ? parseFloat(a.price_change_percentage.h24) : undefined,
          liquidityUsd: parseFloat(a.reserve_in_usd ?? '0') || undefined,
          volumeUsd: parseFloat(a.volume_usd?.h24 ?? '0') || undefined,
          vol5m:     parseFloat(a.volume_usd?.m5 ?? '0')  || undefined,
          mcapUsd:   parseFloat(a.fdv_usd ?? '0') || undefined,
          age:       a.pool_created_at ? Math.floor((Date.now() - new Date(a.pool_created_at).getTime()) / 1000) : undefined,
          buys24h:   a.transactions?.h24?.buys, sells24h: a.transactions?.h24?.sells,
          txns5m:    (a.transactions?.m5?.buys ?? 0) + (a.transactions?.m5?.sells ?? 0) || undefined,
          pairAddress: (a.address ?? '').toLowerCase(), source: 'geckoterminal',
        })
      }
    }
  }
  return results
}

/* ── Logo fetch ─────────────────────────────────────────────────────────────── */
async function fetchGTLogo(addr: string, chain: string): Promise<string> {
  const net = GT_NETWORK[chain] ?? chain
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${addr}`, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return ''
    const d: any = await r.json()
    return d.data?.attributes?.image_url ?? ''
  } catch { return '' }
}

/* ── Sort by tab ─────────────────────────────────────────────────────────────── */
function sortByTab(tokens: Token[], tab: string): Token[] {
  const sorted = [...tokens]
  if (tab === 'new')      sorted.sort((a, b) => (a.age ?? 999999) - (b.age ?? 999999))
  else if (tab === 'top') sorted.sort((a, b) => (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0))
  else /* trending */     sorted.sort((a, b) => ((b.vol5m ?? b.volumeUsd ?? 0) - (a.vol5m ?? a.volumeUsd ?? 0)) || ((b.txns5m ?? 0) - (a.txns5m ?? 0)))
  // Tokens with logos always come first within same tier
  return sorted.sort((a, b) => {
    const av = tab === 'trending' ? (a.vol5m ?? a.volumeUsd ?? 0) : tab === 'new' ? (a.age ?? 0) : (a.mcapUsd ?? 0)
    const bv = tab === 'trending' ? (b.vol5m ?? b.volumeUsd ?? 0) : tab === 'new' ? (b.age ?? 0) : (b.mcapUsd ?? 0)
    const diff = tab === 'new' ? av - bv : bv - av
    if (Math.abs(diff) > (bv + av) * 0.1) return diff  // only sort logos up within 10% tier
    return (b.logoUrl ? 1 : 0) - (a.logoUrl ? 1 : 0)
  })
}

/* ── KV stale-while-revalidate ───────────────────────────────────────────────── */
async function fetchAndCache(chain: string, tab: string, env: Env, ctx: any): Promise<Token[]> {
  const freshKey  = `market:v4:${chain}:${tab}`
  const backupKey = `market:v4:${chain}:${tab}:bak`

  // 1. Try fresh cache (< 5 min)
  const freshRaw = env.CONFIG ? await env.CONFIG.get(freshKey).catch(() => null) : null
  if (freshRaw) {
    const parsed = JSON.parse(freshRaw)
    // Refresh in background if close to expiry (we can't check TTL directly, refresh every call)
    ctx?.waitUntil?.(doFetch(chain, tab, freshKey, backupKey, env).catch(() => {}))
    return parsed
  }

  // 2. Try backup (< 24 hr) — serve stale while refreshing
  const backupRaw = env.CONFIG ? await env.CONFIG.get(backupKey).catch(() => null) : null
  if (backupRaw) {
    ctx?.waitUntil?.(doFetch(chain, tab, freshKey, backupKey, env).catch(() => {}))
    return JSON.parse(backupRaw)
  }

  // 3. No cache — fetch synchronously
  return doFetch(chain, tab, freshKey, backupKey, env)
}

async function doFetch(chain: string, tab: string, freshKey: string, backupKey: string, env: Env): Promise<Token[]> {
  const [dsTokens, gtTokens] = await Promise.allSettled([
    fetchDSForChain(chain), fetchGTForChain(chain),
  ])

  // Merge: DS wins on same address+chain
  const map = new Map<string, Token>()
  if (gtTokens.status === 'fulfilled') gtTokens.value.forEach(t => { map.set(`${t.chain}:${t.address}`, t) })
  if (dsTokens.status === 'fulfilled') dsTokens.value.forEach(t => { map.set(`${t.chain}:${t.address}`, t) })  // DS overwrites GT

  // Fetch missing logos (batch, max 30 per fetch)
  const tokens = [...map.values()]
  const noLogo = tokens.filter(t => !t.logoUrl).slice(0, 30)
  if (noLogo.length && env.DB) {
    try {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS token_logos (address TEXT, chain TEXT, logo_url TEXT NOT NULL, cached_at INTEGER NOT NULL, PRIMARY KEY(address,chain))`)
      const ph   = noLogo.map(() => '(?,?)').join(',')
      const args = noLogo.flatMap(t => [t.address, t.chain ?? 'arc'])
      const rows = await env.DB.prepare(
        `SELECT address, chain, logo_url FROM token_logos WHERE (address,chain) IN (${ph}) AND cached_at > ?`
      ).bind(...args, Math.floor(Date.now()/1000) - 86400).all()
      const logoDb = new Map((rows.results ?? []).map((r: any) => [`${r.chain}:${r.address}`, r.logo_url]))
      for (const t of noLogo) { const l = logoDb.get(`${t.chain}:${t.address}`); if (l) t.logoUrl = l }
    } catch {}
  }

  // Fetch remaining logos from GeckoTerminal (max 15)
  const stillNoLogo = noLogo.filter(t => !t.logoUrl).slice(0, 15)
  const logoResults = await Promise.allSettled(stillNoLogo.map(t => fetchGTLogo(t.address, t.chain ?? 'arc')))
  const dbWrites: Promise<any>[] = []
  for (let i = 0; i < stillNoLogo.length; i++) {
    const logo = logoResults[i].status === 'fulfilled' ? logoResults[i].value : ''
    if (logo) stillNoLogo[i].logoUrl = logo
    if (env.DB) dbWrites.push(
      env.DB.prepare(`INSERT OR REPLACE INTO token_logos VALUES (?,?,?,?)`).bind(stillNoLogo[i].address, stillNoLogo[i].chain ?? 'arc', logo, Math.floor(Date.now()/1000)).run().catch(() => {})
    )
  }
  await Promise.allSettled(dbWrites)

  const sorted = sortByTab(tokens, 'trending')  // store as trending, re-sort client-side for other tabs

  if (env.CONFIG) {
    const payload = JSON.stringify(sorted)
    await Promise.allSettled([
      env.CONFIG.put(freshKey, payload, { expirationTtl: 300 }),    // 5 min fresh
      env.CONFIG.put(backupKey, payload, { expirationTtl: 86400 }), // 24 hr backup
    ])
  }
  return sorted
}

/* ── OHLCV ──────────────────────────────────────────────────────────────────── */
function syntheticOHLCV(price: number, change24h: number, age: number, n = 60): any[] {
  if (!price) return []
  const start = Math.abs(change24h) > 0.5 ? price / (1 + change24h / 100) : price * 0.7
  const now = Math.floor(Date.now() / 1000)
  const iv  = Math.max(Math.floor(age / n), 300)
  let seed  = (Math.abs(Math.round(price * 1e9)) ^ 0x5f3759df) % 65535 || 12345
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }
  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - i - 1) * iv, prog = (i + 1) / n
    const base = start + (price - start) * Math.pow(prog, 0.75)
    const ns = 0.025 + rng() * 0.05; const dir = rng() > 0.44 ? 1 : -1
    const o = Math.max(base * (1 + (rng() - 0.5) * ns * 0.55), 1e-30)
    const c = Math.max(base * (1 + dir * ns * 0.4 * rng()), 1e-30)
    return { time: t, open: o, high: Math.max(o, c) * (1 + ns * 0.1 * rng()), low: Math.min(o, c) * (1 - ns * 0.07 * rng()), close: c, volume: rng() * 6000 + 300 }
  })
}

/* ── Main handler ───────────────────────────────────────────────────────────── */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url  = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '')

  // ── Logo proxy ──────────────────────────────────────────────────────────────
  if (path.endsWith('/logo')) {
    const logoUrl = url.searchParams.get('url')
    if (!logoUrl) return new Response('', { status: 400 })
    try {
      const r = await fetch(logoUrl, { signal: AbortSignal.timeout(5_000) })
      if (!r.ok) return new Response('', { status: r.status })
      return new Response(await r.arrayBuffer(), { headers: { 'Content-Type': r.headers.get('content-type') ?? 'image/png', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } })
    } catch { return new Response('', { status: 502 }) }
  }

  // ── OHLCV ───────────────────────────────────────────────────────────────────
  if (path.endsWith('/ohlcv')) {
    const pool    = url.searchParams.get('pool') ?? ''
    const token   = url.searchParams.get('token') ?? ''
    const tf      = url.searchParams.get('tf') ?? '1h'
    const price   = parseFloat(url.searchParams.get('price') ?? '0')
    const ch24    = parseFloat(url.searchParams.get('change24h') ?? '0')
    const age     = parseInt(url.searchParams.get('age') ?? '86400')
    const cacheKey = `ohlcv:v2:${pool || token}:${tf}`
    const cached  = env.CONFIG ? await env.CONFIG.get(cacheKey).catch(() => null) : null
    if (cached) return j({ success: true, data: JSON.parse(cached), cached: true })
    const [res, agg] = tf==='5m'?['minute','5']:tf==='15m'?['minute','15']:tf==='4h'?['hour','4']:tf==='1d'?['day','1']:['hour','1']
    let candles: any[] = []
    const tryGT = async (addr: string) => {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/pools/${addr}/ohlcv/${res}?aggregate=${agg}&limit=300`, { signal: AbortSignal.timeout(8_000) })
        if (!r.ok) return []
        const d: any = await r.json()
        return (d.data?.attributes?.ohlcv_list ?? []).reverse().map(([t,o,h,l,c,v]: number[]) => ({ time: Math.floor(t/1000), open: o, high: h, low: l, close: c, volume: v }))
      } catch { return [] }
    }
    if (pool)  candles = await tryGT(pool)
    if (!candles.length && token) {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${token}/pools?page=1`, { signal: AbortSignal.timeout(6_000) })
        if (r.ok) { const d: any = await r.json(); const p = d.data?.[0]?.attributes?.address; if (p) candles = await tryGT(p) }
      } catch {}
    }
    if (!candles.length) candles = syntheticOHLCV(price, ch24, age)
    if (candles.length && env.CONFIG) env.CONFIG.put(cacheKey, JSON.stringify(candles), { expirationTtl: 900 }).catch(() => {})
    return j({ success: true, data: candles })
  }

  // ── Token list ───────────────────────────────────────────────────────────────
  const chain  = (url.searchParams.get('chain') ?? 'arc').toLowerCase()
  const tab    = (url.searchParams.get('tab')   ?? 'trending').toLowerCase()
  const q      = (url.searchParams.get('q')     ?? '').trim().toLowerCase()
  const limit  = Math.min(500, parseInt(url.searchParams.get('limit') ?? '200'))

  let tokens = await fetchAndCache(chain, tab, env, ctx)
  tokens = sortByTab(tokens, tab)  // re-sort for the requested tab

  if (q) tokens = tokens.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.includes(q) || (t.chain ?? '').includes(q))

  const total  = tokens.length
  const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const result = tokens.slice((page - 1) * limit, page * limit)

  // Aggregate stats
  const vol24h = tokens.reduce((s, t) => s + (t.volumeUsd ?? 0), 0)
  const vol5m  = tokens.reduce((s, t) => s + (t.vol5m ?? 0), 0)
  const txns   = tokens.reduce((s, t) => s + (t.txns5m ?? 0), 0)

  return j({ success: true, data: { tokens: result, total, page, limit, stats: { vol24h, vol5m, txns } } })
}

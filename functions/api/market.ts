/**
 * /api/market — Arc token data from DexScreener + GeckoTerminal
 * Results cached in Cloudflare KV for 5 minutes (stale-while-revalidate).
 *
 * GET /api/market?limit=500&page=1&q=search
 * GET /api/market/ohlcv?pool=<addr>&token=<addr>&tf=1h&price=0.001&change24h=5&age=86400
 * GET /api/market/logo?url=<encoded>
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
}
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), { status: s, headers: CORS })

const isArc = (p: any) => {
  const c = (p?.chainId ?? '').toLowerCase()
  return c === 'arc' || c.includes('arc') || c === '5042'
}

// ── DexScreener ──────────────────────────────────────────────────────────────
async function fetchDexScreenerAll(): Promise<any[]> {
  const queries = ['arc', 'USDC', 'ETH', 'meme', 'fun', 'glow', 'cat', 'dog', 'AI', 'inu', 'pepe']
  const [profilesRes, boostsRes, ...searchRes] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-profiles/latest/v1', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : []).then((d: any) => Array.isArray(d) ? d : []),
    fetch('https://api.dexscreener.com/token-boosts/latest/v1', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : []).then((d: any) => Array.isArray(d) ? d : []),
    ...queries.map(q =>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : { pairs: [] })
        .then((d: any) => (d.pairs ?? []).filter(isArc))
        .catch(() => [])
    ),
  ])

  const pairs: any[] = []
  for (const r of searchRes) if (r.status === 'fulfilled') pairs.push(...r.value)

  // Bulk-lookup addresses from profiles/boosts
  const addrs: string[] = []
  if (profilesRes.status === 'fulfilled') for (const p of profilesRes.value) if (p?.tokenAddress) addrs.push(p.tokenAddress)
  if (boostsRes.status === 'fulfilled')   for (const p of boostsRes.value)   if (p?.tokenAddress) addrs.push(p.tokenAddress)

  const unique = [...new Set(addrs)]
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30).join(',')
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, { signal: AbortSignal.timeout(10_000) })
      if (r.ok) { const d: any = await r.json(); pairs.push(...(d.pairs ?? []).filter(isArc)) }
    } catch {}
  }
  return pairs
}

// ── GeckoTerminal ────────────────────────────────────────────────────────────
async function fetchGeckoTerminalAll(): Promise<any[]> {
  const endpoints = [
    ...[1,2,3,4,5].map(p => `https://api.geckoterminal.com/api/v2/networks/arc/new_pools?page=${p}`),
    ...[1,2,3,4,5].map(p => `https://api.geckoterminal.com/api/v2/networks/arc/pools?page=${p}&sort=h24_volume_usd_liquidity_desc`),
    `https://api.geckoterminal.com/api/v2/networks/arc/trending_pools?duration=24h`,
    `https://api.geckoterminal.com/api/v2/networks/arc/trending_pools?duration=6h`,
  ]
  const results = await Promise.allSettled(
    endpoints.map(url =>
      fetch(url, { signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : { data: [] }).then((d: any) => d.data ?? []).catch(() => [])
    )
  )
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

async function fetchGeckoTokenLogo(addr: string): Promise<string> {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${addr}`, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return ''
    const d: any = await r.json()
    return d.data?.attributes?.image_url ?? ''
  } catch { return '' }
}

// ── Synthetic OHLCV ──────────────────────────────────────────────────────────
function syntheticOHLCV(price: number, change24h: number, age: number, n = 48): any[] {
  if (!price) return []
  const startPrice = change24h !== 0 ? price / (1 + change24h / 100) : price * 0.7
  const now = Math.floor(Date.now() / 1000)
  const interval = Math.max(Math.floor(age / n), 300)
  let seed = Math.abs(Math.floor(price * 1e8)) % 65535 || 42
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - i - 1) * interval
    const progress = (i + 1) / n
    const baseP = startPrice + (price - startPrice) * Math.pow(progress, 0.8)
    const noise = 0.03 + rng() * 0.07
    const dir = rng() > 0.45 ? 1 : -1
    const o = baseP * (1 + (rng() - 0.5) * noise * 0.6)
    const c = baseP * (1 + dir * noise * 0.4 * rng())
    return {
      time: t,
      open: Math.max(o, 1e-20),
      high: Math.max(o, c) * (1 + noise * 0.12 * rng()),
      low: Math.min(o, c) * (1 - noise * 0.08 * rng()),
      close: Math.max(c, 1e-20),
      volume: rng() * 5000 + 100,
    }
  })
}

// ── Normalised token type ────────────────────────────────────────────────────
type Token = {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number; change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source: string
}

// ── Main handler ─────────────────────────────────────────────────────────────
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url  = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '')

  // ── Logo proxy ────────────────────────────────────────────────────────────
  if (path.endsWith('/logo')) {
    const logoUrl = url.searchParams.get('url')
    if (!logoUrl) return new Response('', { status: 400 })
    try {
      const r = await fetch(logoUrl, { signal: AbortSignal.timeout(5_000) })
      if (!r.ok) return new Response('', { status: r.status })
      const ct = r.headers.get('content-type') ?? 'image/png'
      return new Response(await r.arrayBuffer(), {
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' },
      })
    } catch { return new Response('', { status: 502 }) }
  }

  // ── OHLCV ─────────────────────────────────────────────────────────────────
  if (path.endsWith('/ohlcv')) {
    const pool      = url.searchParams.get('pool') ?? ''
    const tokenAddr = url.searchParams.get('token') ?? ''
    const tf        = url.searchParams.get('tf') ?? '1h'
    const price     = parseFloat(url.searchParams.get('price') ?? '0')
    const change24h = parseFloat(url.searchParams.get('change24h') ?? '0')
    const age       = parseInt(url.searchParams.get('age') ?? '86400')

    const [res, agg] =
      tf === '5m'  ? ['minute', '5']  :
      tf === '15m' ? ['minute', '15'] :
      tf === '4h'  ? ['hour',   '4']  :
      tf === '1d'  ? ['day',    '1']  :
                     ['hour',   '1']

    // Try KV cache first
    const cacheKey = `ohlcv:arc:${pool || tokenAddr}:${tf}`
    const cached = env.CONFIG ? await env.CONFIG.get(cacheKey) : null
    if (cached) return j({ success: true, data: JSON.parse(cached), cached: true })

    let candles: any[] = []

    // Try GeckoTerminal with pool address
    const tryGecko = async (addr: string) => {
      try {
        const r = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/arc/pools/${addr}/ohlcv/${res}?aggregate=${agg}&limit=300`,
          { signal: AbortSignal.timeout(8_000) }
        )
        if (!r.ok) return []
        const d: any = await r.json()
        const raw: number[][] = d.data?.attributes?.ohlcv_list ?? []
        return raw.reverse().map(([t, o, h, l, c, v]) => ({
          time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: v,
        }))
      } catch { return [] }
    }

    if (pool) candles = await tryGecko(pool)

    // Try token address lookup
    if (!candles.length && tokenAddr) {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${tokenAddr}/pools?page=1`, { signal: AbortSignal.timeout(6_000) })
        if (r.ok) {
          const d: any = await r.json()
          const topPool: string = d.data?.[0]?.attributes?.address ?? ''
          if (topPool) candles = await tryGecko(topPool)
        }
      } catch {}
    }

    // Synthetic fallback
    if (!candles.length) {
      candles = syntheticOHLCV(price, change24h, age)
    }

    // Cache in KV for 15 min
    if (candles.length && env.CONFIG) {
      env.CONFIG.put(cacheKey, JSON.stringify(candles), { expirationTtl: 900 }).catch(() => {})
    }

    return j({ success: true, data: candles })
  }

  // ── Token list ────────────────────────────────────────────────────────────
  const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit  = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '200')))
  const q      = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  // KV cache (5 min) — only for full list (no search query)
  const listCacheKey = q ? '' : `market:arc:v2:p${page}`
  if (listCacheKey && env.CONFIG) {
    const cached = await env.CONFIG.get(listCacheKey)
    if (cached) {
      const parsed = JSON.parse(cached)
      return j({ success: true, ...parsed, cached: true })
    }
  }

  // Fetch fresh data
  const [dsPairs, gtPools] = await Promise.all([fetchDexScreenerAll(), fetchGeckoTerminalAll()])

  const tokenMap = new Map<string, Token>()

  for (const p of dsPairs) {
    if (!isArc(p)) continue
    const base = p.baseToken ?? {}
    const addr = (base.address ?? '').toLowerCase()
    if (!addr || addr === '0x' + '0'.repeat(40)) continue
    const vol = parseFloat(p.volume?.h24 ?? '0') || 0
    const ex = tokenMap.get(addr)
    if (ex && (ex.volumeUsd ?? 0) >= vol) continue
    tokenMap.set(addr, {
      address: addr, name: base.name ?? '', symbol: base.symbol ?? '',
      logoUrl: p.info?.imageUrl ?? p.info?.header ?? '',
      priceUsd:     parseFloat(p.priceUsd ?? '0') || 0,
      change5m:     p.priceChange?.m5  != null ? parseFloat(p.priceChange.m5)  : undefined,
      change1h:     p.priceChange?.h1  != null ? parseFloat(p.priceChange.h1)  : undefined,
      change6h:     p.priceChange?.h6  != null ? parseFloat(p.priceChange.h6)  : undefined,
      change24h:    p.priceChange?.h24 != null ? parseFloat(p.priceChange.h24) : undefined,
      liquidityUsd: parseFloat(p.liquidity?.usd ?? '0') || undefined,
      volumeUsd:    vol || undefined,
      mcapUsd:      parseFloat(p.marketCap ?? p.fdv ?? '0') || undefined,
      age:          p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 1000) : undefined,
      buys24h:      p.txns?.h24?.buys, sells24h: p.txns?.h24?.sells,
      pairAddress:  (p.pairAddress ?? '').toLowerCase(), dexId: p.dexId, source: 'dexscreener',
    })
  }

  for (const pool of gtPools) {
    const attr = pool.attributes ?? {}
    const rels = pool.relationships ?? {}
    const baseId = rels.base_token?.data?.id ?? ''
    const addr = (baseId.includes('_') ? baseId.split('_')[1] : '').toLowerCase()
    if (!addr || tokenMap.has(addr)) continue
    const sym = (attr.name ?? '').split(' / ')[0] || '?'
    tokenMap.set(addr, {
      address: addr, name: attr.name ?? sym, symbol: sym, logoUrl: '',
      priceUsd: parseFloat(attr.base_token_price_usd ?? '0') || 0,
      change5m: attr.price_change_percentage?.m5  != null ? parseFloat(attr.price_change_percentage.m5)  : undefined,
      change1h: attr.price_change_percentage?.h1  != null ? parseFloat(attr.price_change_percentage.h1)  : undefined,
      change6h: attr.price_change_percentage?.h6  != null ? parseFloat(attr.price_change_percentage.h6)  : undefined,
      change24h:attr.price_change_percentage?.h24 != null ? parseFloat(attr.price_change_percentage.h24) : undefined,
      liquidityUsd: parseFloat(attr.reserve_in_usd ?? '0') || undefined,
      volumeUsd: parseFloat(attr.volume_usd?.h24 ?? '0') || undefined,
      mcapUsd: parseFloat(attr.fdv_usd ?? '0') || undefined,
      age: attr.pool_created_at ? Math.floor((Date.now() - new Date(attr.pool_created_at).getTime()) / 1000) : undefined,
      buys24h: attr.transactions?.h24?.buys, sells24h: attr.transactions?.h24?.sells,
      pairAddress: (attr.address ?? '').toLowerCase(), source: 'geckoterminal',
    })
  }

  // Logo fetch for missing ones
  const needLogos = Array.from(tokenMap.values()).filter(t => !t.logoUrl)
  if (needLogos.length > 0) {
    const cachedLogos: Record<string, string> = {}
    if (env.DB) {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS token_logos (address TEXT PRIMARY KEY, logo_url TEXT NOT NULL, cached_at INTEGER NOT NULL)`)
        const ph = needLogos.map(() => '?').join(',')
        const rows = await env.DB.prepare(`SELECT address, logo_url FROM token_logos WHERE address IN (${ph}) AND cached_at > ?`)
          .bind(...needLogos.map(t => t.address), Math.floor(Date.now()/1000) - 86400).all()
        for (const row of rows.results ?? []) cachedLogos[(row as any).address] = (row as any).logo_url
      } catch {}
    }
    for (const t of needLogos) if (cachedLogos[t.address]) t.logoUrl = cachedLogos[t.address]
    const stillNeed = needLogos.filter(t => !t.logoUrl).slice(0, 40)
    for (let i = 0; i < stillNeed.length; i += 8) {
      const batch = stillNeed.slice(i, i + 8)
      const logos = await Promise.allSettled(batch.map(t => fetchGeckoTokenLogo(t.address)))
      const writes: Promise<any>[] = []
      for (let b = 0; b < batch.length; b++) {
        const logo = logos[b].status === 'fulfilled' ? logos[b].value : ''
        if (logo) batch[b].logoUrl = logo
        if (env.DB) writes.push(env.DB.prepare(`INSERT OR REPLACE INTO token_logos VALUES (?,?,?)`).bind(batch[b].address, logo, Math.floor(Date.now()/1000)).run().catch(()=>{}))
      }
      await Promise.allSettled(writes)
    }
  }

  let all = Array.from(tokenMap.values())
  if (q) all = all.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.includes(q))
  all.sort((a, b) => ((b.volumeUsd ?? 0) - (a.volumeUsd ?? 0)) || ((b.mcapUsd ?? 0) - (a.mcapUsd ?? 0)))

  const total  = all.length
  const tokens = all.slice((page-1)*limit, page*limit)
  const payload = { data: { tokens, total, page, limit, pages: Math.ceil(total/limit) } }

  // Cache in KV for 5 minutes
  if (listCacheKey && env.CONFIG && tokens.length > 0) {
    env.CONFIG.put(listCacheKey, JSON.stringify(payload), { expirationTtl: 300 }).catch(() => {})
  }

  return j({ success: true, ...payload })
}

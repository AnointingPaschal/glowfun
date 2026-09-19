/**
 * /api/market — proxies ALL Arc token data from DexScreener + GeckoTerminal
 * Runs as a Cloudflare Pages Function (server-side) — avoids CORS.
 *
 * GET /api/market?limit=200&page=1&q=search
 * GET /api/market/ohlcv?pool=<address>&tf=1h   — candlestick data
 * GET /api/market/logo?url=<encoded>            — proxies logo images
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
}
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), { status: s, headers: CORS })

// ── DexScreener ─────────────────────────────────────────────────────────────
// Use multiple search strategies to maximise coverage of Arc tokens.
async function fetchDexScreenerAll(): Promise<any[]> {
  // Strategy 1: token-profiles endpoint (newest listings)
  // Strategy 2: boosted tokens (popular/paid)
  // Strategy 3: search with different queries to catch varied token names
  const queries = ['arc', 'USDC', 'ETH', 'BTC', 'meme', 'fun', 'glow', 'AI', 'cat', 'dog', 'pepe']

  const [profilesRes, boostsRes, ...searchResults] = await Promise.allSettled([
    fetch('https://api.dexscreener.com/token-profiles/latest/v1', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : []).then((d: any) => Array.isArray(d) ? d : []),
    fetch('https://api.dexscreener.com/token-boosts/latest/v1', { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.json() : []).then((d: any) => Array.isArray(d) ? d : []),
    ...queries.map(q =>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : { pairs: [] })
        .then((d: any) => (d.pairs ?? []).filter((p: any) => { const c=(p?.chainId??'').toLowerCase(); return c==='arc'||c.includes('arc')||c==='5042' }))
        .catch(() => [])
    ),
  ])

  // Collect all pair objects
  const pairs: any[] = []

  // From search results
  for (const r of searchResults) {
    if (r.status === 'fulfilled') pairs.push(...r.value)
  }

  // From token-profiles — these give us token addresses to then look up pairs
  const profileAddrs: string[] = []
  if (profilesRes.status === 'fulfilled') {
    for (const p of profilesRes.value) {
      if (p?.tokenAddress) profileAddrs.push(p.tokenAddress)  // collect all, filter by pair later
    }
  }
  if (boostsRes.status === 'fulfilled') {
    for (const p of boostsRes.value) {
      if (p?.tokenAddress) profileAddrs.push(p.tokenAddress)  // collect all, filter by pair later
    }
  }

  // Bulk-fetch pairs for profile addresses (DexScreener allows up to 30 per request)
  if (profileAddrs.length) {
    const unique = [...new Set(profileAddrs)]
    for (let i = 0; i < unique.length; i += 30) {
      const chunk = unique.slice(i, i + 30).join(',')
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`, { signal: AbortSignal.timeout(10_000) })
        if (r.ok) {
          const d: any = await r.json()
          const arcPairs = (d.pairs ?? []).filter((p: any) => { const c=(p?.chainId??'').toLowerCase(); return c==='arc'||c.includes('arc')||c==='5042' })
          pairs.push(...arcPairs)
        }
      } catch {}
    }
  }

  return pairs
}

// ── GeckoTerminal ────────────────────────────────────────────────────────────
// Fetch pages sorted by volume + new pools + trending — up to 10 pages each
async function fetchGeckoTerminalAll(): Promise<any[]> {
  const endpoints: string[] = []

  // New pools — pages 1-5
  for (let p = 1; p <= 5; p++) {
    endpoints.push(`https://api.geckoterminal.com/api/v2/networks/arc/new_pools?page=${p}`)
  }
  // Volume-sorted pools — pages 1-5
  for (let p = 1; p <= 5; p++) {
    endpoints.push(`https://api.geckoterminal.com/api/v2/networks/arc/pools?page=${p}&sort=h24_volume_usd_liquidity_desc`)
  }
  // Trending
  endpoints.push(`https://api.geckoterminal.com/api/v2/networks/arc/trending_pools?duration=24h`)
  endpoints.push(`https://api.geckoterminal.com/api/v2/networks/arc/trending_pools?duration=6h`)

  const results = await Promise.allSettled(
    endpoints.map(url =>
      fetch(url, { signal: AbortSignal.timeout(10_000) })
        .then(r => r.ok ? r.json() : { data: [] })
        .then((d: any) => d.data ?? [])
        .catch(() => [])
    )
  )

  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
}

async function fetchGeckoTokenLogo(addr: string): Promise<string> {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/arc/tokens/${addr}`, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return ''
    const d: any = await r.json()
    return d.data?.attributes?.image_url ?? ''
  } catch { return '' }
}

// ── Normalised token shape ───────────────────────────────────────────────────
type Token = {
  address: string; name: string; symbol: string; logoUrl: string
  priceUsd: number
  change5m?: number; change1h?: number; change6h?: number; change24h?: number
  liquidityUsd?: number; volumeUsd?: number; mcapUsd?: number
  age?: number; buys24h?: number; sells24h?: number
  pairAddress?: string; dexId?: string; source: string
}

// ── Main handler ─────────────────────────────────────────────────────────────
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url  = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '')

  // ── /api/market/logo — proxy logo images ──────────────────────────────────
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

  // ── /api/market/ohlcv — candlestick data via GeckoTerminal ────────────────
  if (path.endsWith('/ohlcv')) {
    const pool = url.searchParams.get('pool')
    const tf   = url.searchParams.get('tf') ?? '1h'
    if (!pool) return j({ success: false, error: 'pool required' }, 400)

    const [res, agg] =
      tf === '5m'  ? ['minute', '5']  :
      tf === '15m' ? ['minute', '15'] :
      tf === '4h'  ? ['hour',   '4']  :
      tf === '1d'  ? ['day',    '1']  :
                     ['hour',   '1']

    try {
      const r = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/arc/pools/${pool}/ohlcv/${res}?aggregate=${agg}&limit=300`,
        { signal: AbortSignal.timeout(10_000) }
      )
      if (!r.ok) return j({ success: false, error: 'upstream error' }, 502)
      const d: any = await r.json()
      const raw: number[][] = d.data?.attributes?.ohlcv_list ?? []
      const candles = raw.reverse().map(([t, o, h, l, c, v]) => ({
        time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: v,
      }))
      return j({ success: true, data: candles })
    } catch { return j({ success: false, error: 'fetch failed' }, 502) }
  }

  // ── /api/market — full token list ─────────────────────────────────────────
  const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit  = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '200')))
  const q      = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  // Fetch everything in parallel
  const [dsPairs, gtPools] = await Promise.all([
    fetchDexScreenerAll(),
    fetchGeckoTerminalAll(),
  ])

  const tokenMap = new Map<string, Token>()

  // ── DexScreener pairs (highest priority — most complete data) ────────────
  for (const p of dsPairs) {
    if (!p || p.chainId !== 'arc') continue
    const base = p.baseToken ?? {}
    const addr = (base.address ?? '').toLowerCase()
    if (!addr || addr === '0x0000000000000000000000000000000000000000') continue

    const vol = parseFloat(p.volume?.h24 ?? '0') || 0
    const existing = tokenMap.get(addr)
    if (existing && (existing.volumeUsd ?? 0) >= vol) continue   // keep highest-volume entry

    tokenMap.set(addr, {
      address:      addr,
      name:         base.name   ?? '',
      symbol:       base.symbol ?? '',
      logoUrl:      p.info?.imageUrl ?? p.info?.header ?? '',
      priceUsd:     parseFloat(p.priceUsd ?? '0') || 0,
      change5m:     p.priceChange?.m5  != null ? parseFloat(p.priceChange.m5)  : undefined,
      change1h:     p.priceChange?.h1  != null ? parseFloat(p.priceChange.h1)  : undefined,
      change6h:     p.priceChange?.h6  != null ? parseFloat(p.priceChange.h6)  : undefined,
      change24h:    p.priceChange?.h24 != null ? parseFloat(p.priceChange.h24) : undefined,
      liquidityUsd: parseFloat(p.liquidity?.usd ?? '0') || undefined,
      volumeUsd:    vol || undefined,
      mcapUsd:      parseFloat(p.marketCap ?? p.fdv ?? '0') || undefined,
      age:          p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 1000) : undefined,
      buys24h:      p.txns?.h24?.buys,
      sells24h:     p.txns?.h24?.sells,
      pairAddress:  (p.pairAddress ?? '').toLowerCase(),
      dexId:        p.dexId,
      source:       'dexscreener',
    })
  }

  // ── GeckoTerminal (fill gaps not covered by DexScreener) ────────────────
  for (const pool of gtPools) {
    const attr = pool.attributes ?? {}
    const rels = pool.relationships ?? {}
    const baseId  = rels.base_token?.data?.id ?? ''
    const gtAddr  = baseId.includes('_') ? baseId.split('_')[1] : ''
    const addr    = gtAddr.toLowerCase()
    if (!addr || tokenMap.has(addr)) continue   // DS data wins

    const sym = (attr.name ?? '').split(' / ')[0] || '?'
    tokenMap.set(addr, {
      address:      addr,
      name:         attr.name ?? sym,
      symbol:       sym,
      logoUrl:      '',
      priceUsd:     parseFloat(attr.base_token_price_usd ?? '0') || 0,
      change5m:     attr.price_change_percentage?.m5  != null ? parseFloat(attr.price_change_percentage.m5)  : undefined,
      change1h:     attr.price_change_percentage?.h1  != null ? parseFloat(attr.price_change_percentage.h1)  : undefined,
      change6h:     attr.price_change_percentage?.h6  != null ? parseFloat(attr.price_change_percentage.h6)  : undefined,
      change24h:    attr.price_change_percentage?.h24 != null ? parseFloat(attr.price_change_percentage.h24) : undefined,
      liquidityUsd: parseFloat(attr.reserve_in_usd ?? '0') || undefined,
      volumeUsd:    parseFloat(attr.volume_usd?.h24 ?? '0') || undefined,
      mcapUsd:      parseFloat(attr.fdv_usd ?? '0') || undefined,
      age:          attr.pool_created_at ? Math.floor((Date.now() - new Date(attr.pool_created_at).getTime()) / 1000) : undefined,
      buys24h:      attr.transactions?.h24?.buys,
      sells24h:     attr.transactions?.h24?.sells,
      pairAddress:  (attr.address ?? '').toLowerCase(),
      source:       'geckoterminal',
    })
  }

  // ── Fetch missing logos (batched, with D1 cache) ─────────────────────────
  const needLogos = Array.from(tokenMap.values()).filter(t => !t.logoUrl)

  if (needLogos.length > 0) {
    const cachedLogos: Record<string, string> = {}
    if (env.DB) {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS token_logos (address TEXT PRIMARY KEY, logo_url TEXT NOT NULL, cached_at INTEGER NOT NULL)`)
        const ph   = needLogos.map(() => '?').join(',')
        const rows = await env.DB.prepare(
          `SELECT address, logo_url FROM token_logos WHERE address IN (${ph}) AND cached_at > ?`
        ).bind(...needLogos.map(t => t.address), Math.floor(Date.now() / 1000) - 86400).all()
        for (const row of rows.results ?? []) cachedLogos[(row as any).address] = (row as any).logo_url
      } catch {}
    }

    for (const t of needLogos) {
      if (cachedLogos[t.address]) t.logoUrl = cachedLogos[t.address]
    }

    const stillNeed = needLogos.filter(t => !t.logoUrl).slice(0, 40)
    for (let i = 0; i < stillNeed.length; i += 8) {
      const batch  = stillNeed.slice(i, i + 8)
      const logos  = await Promise.allSettled(batch.map(t => fetchGeckoTokenLogo(t.address)))
      const writes: Promise<any>[] = []
      for (let b = 0; b < batch.length; b++) {
        const logo = logos[b].status === 'fulfilled' ? logos[b].value : ''
        if (logo) batch[b].logoUrl = logo
        if (env.DB) {
          writes.push(
            env.DB.prepare(`INSERT OR REPLACE INTO token_logos (address, logo_url, cached_at) VALUES (?, ?, ?)`)
              .bind(batch[b].address, logo, Math.floor(Date.now() / 1000)).run().catch(() => {})
          )
        }
      }
      await Promise.allSettled(writes)
    }
  }

  // ── Apply search filter, sort, paginate ──────────────────────────────────
  let all = Array.from(tokenMap.values())

  if (q) {
    all = all.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    )
  }

  // Sort: volume desc primary, then mcap desc
  all.sort((a, b) => {
    const vd = (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0)
    return vd !== 0 ? vd : (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0)
  })

  const total  = all.length
  const tokens = all.slice((page - 1) * limit, page * limit)

  return j({ success: true, data: { tokens, total, page, limit, pages: Math.ceil(total / limit) } })
}

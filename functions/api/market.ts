/**
 * /api/market — proxies Arc token data from DexScreener + GeckoTerminal
 * Runs as a Cloudflare Pages Function (server-side), avoiding CORS issues.
 * Logos are cached in D1 for 24 hours.
 *
 * GET /api/market?limit=100&page=1&q=search
 * GET /api/market/logo?url=<encoded>  — proxies logo images (avoids mixed-content / CORS)
 */

interface Env {
  CONFIG: KVNamespace
  DB: D1Database
  IMAGES: R2Bucket
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS })
}

// ── External data fetchers ────────────────────────────────────────────────────

async function fetchDexScreenerArc(): Promise<any[]> {
  try {
    // Fetch top pairs on Arc chain by volume
    const r = await fetch(
      'https://api.dexscreener.com/latest/dex/search?q=arc',
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!r.ok) return []
    const d = await r.json() as any
    return (d.pairs ?? []).filter((p: any) => p.chainId === 'arc')
  } catch { return [] }
}

async function fetchDexScreenerSearch(q: string): Promise<any[]> {
  try {
    const r = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!r.ok) return []
    const d = await r.json() as any
    return (d.pairs ?? []).filter((p: any) => p.chainId === 'arc')
  } catch { return [] }
}

async function fetchGeckoTerminalArc(): Promise<any[]> {
  try {
    const responses = await Promise.all([1, 2, 3].map(page =>
      fetch(
        `https://api.geckoterminal.com/api/v2/networks/arc/pools?page=${page}&sort=h24_volume_usd_liquidity_desc`,
        { signal: AbortSignal.timeout(10_000) }
      )
      .then(r => r.ok ? r.json() : { data: [] })
      .then((d: any) => d.data ?? [])
      .catch(() => [])
    ))
    return responses.flat()
  } catch { return [] }
}

async function fetchGeckoTokenLogo(tokenAddress: string): Promise<string> {
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/arc/tokens/${tokenAddress}`,
      { signal: AbortSignal.timeout(5_000) }
    )
    if (!r.ok) return ''
    const d = await r.json() as any
    return d.data?.attributes?.image_url ?? ''
  } catch { return '' }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const url  = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '')

  // ── /api/market/logo?url=... — proxy logo images server-side ─────────────
  if (path.endsWith('/logo')) {
    const logoUrl = url.searchParams.get('url')
    if (!logoUrl) return new Response('', { status: 400 })
    try {
      const r = await fetch(logoUrl, { signal: AbortSignal.timeout(5_000) })
      if (!r.ok) return new Response('', { status: r.status })
      const ct   = r.headers.get('content-type') ?? 'image/png'
      const body = await r.arrayBuffer()
      return new Response(body, {
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        }
      })
    } catch { return new Response('', { status: 502 }) }
  }

  // ── /api/market — full token list ─────────────────────────────────────────
  const page  = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100')))
  const q     = (url.searchParams.get('q') ?? '').trim()

  // Fetch both sources in parallel
  const [dsPairs, gtPools] = await Promise.all([
    q ? fetchDexScreenerSearch(q) : fetchDexScreenerArc(),
    fetchGeckoTerminalArc(),
  ])

  // ── Normalize into a unified token map keyed by lowercase token address ───
  type NormalizedToken = {
    address: string
    name: string
    symbol: string
    logoUrl: string
    priceUsd: number
    change5m?: number
    change1h?: number
    change6h?: number
    change24h?: number
    liquidityUsd?: number
    volumeUsd?: number
    mcapUsd?: number
    age?: number
    buys24h?: number
    sells24h?: number
    pairAddress?: string
    dexId?: string
    source: 'dexscreener' | 'geckoterminal'
  }

  const tokenMap = new Map<string, NormalizedToken>()

  // Process DexScreener — highest priority
  for (const p of dsPairs) {
    if (!p || p.chainId !== 'arc') continue
    const base = p.baseToken ?? {}
    const addr = (base.address ?? '').toLowerCase()
    if (!addr || addr === '0x0000000000000000000000000000000000000000') continue

    const vol = parseFloat(p.volume?.h24 ?? '0') || 0
    const existing = tokenMap.get(addr)
    if (existing && (existing.volumeUsd ?? 0) >= vol) continue

    tokenMap.set(addr, {
      address:      addr,
      name:         base.name ?? '',
      symbol:       base.symbol ?? '',
      logoUrl:      p.info?.imageUrl ?? p.info?.header ?? '',
      priceUsd:     parseFloat(p.priceUsd ?? '0') || 0,
      change5m:     p.priceChange?.m5  !== undefined ? parseFloat(p.priceChange.m5)  : undefined,
      change1h:     p.priceChange?.h1  !== undefined ? parseFloat(p.priceChange.h1)  : undefined,
      change6h:     p.priceChange?.h6  !== undefined ? parseFloat(p.priceChange.h6)  : undefined,
      change24h:    p.priceChange?.h24 !== undefined ? parseFloat(p.priceChange.h24) : undefined,
      liquidityUsd: parseFloat(p.liquidity?.usd ?? '0') || undefined,
      volumeUsd:    vol || undefined,
      mcapUsd:      parseFloat(p.marketCap ?? '0') || undefined,
      age:          p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 1000) : undefined,
      buys24h:      p.txns?.h24?.buys,
      sells24h:     p.txns?.h24?.sells,
      pairAddress:  (p.pairAddress ?? '').toLowerCase(),
      dexId:        p.dexId,
      source:       'dexscreener',
    })
  }

  // Process GeckoTerminal — fill in gaps not covered by DexScreener
  for (const pool of gtPools) {
    const attr = pool.attributes ?? {}
    const rels = pool.relationships ?? {}
    const baseTokenId: string = rels.base_token?.data?.id ?? ''
    const gtAddr = baseTokenId.includes('_') ? baseTokenId.split('_')[1] : ''
    const addr   = gtAddr.toLowerCase()
    if (!addr || tokenMap.has(addr)) continue

    const symbol = (attr.name ?? '').split(' / ')[0] || '?'
    tokenMap.set(addr, {
      address:      addr,
      name:         attr.name ?? symbol,
      symbol:       symbol,
      logoUrl:      '',
      priceUsd:     parseFloat(attr.base_token_price_usd ?? '0') || 0,
      change5m:     attr.price_change_percentage?.m5  !== undefined ? parseFloat(attr.price_change_percentage.m5)  : undefined,
      change1h:     attr.price_change_percentage?.h1  !== undefined ? parseFloat(attr.price_change_percentage.h1)  : undefined,
      change6h:     attr.price_change_percentage?.h6  !== undefined ? parseFloat(attr.price_change_percentage.h6)  : undefined,
      change24h:    attr.price_change_percentage?.h24 !== undefined ? parseFloat(attr.price_change_percentage.h24) : undefined,
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

  // ── Fetch + cache logos for tokens that don't have one ───────────────────
  const needLogos = Array.from(tokenMap.values()).filter(t => !t.logoUrl && t.address)

  // Check D1 cache
  const cachedLogos: Record<string, string> = {}
  if (env.DB && needLogos.length > 0) {
    try {
      await env.DB.exec(`
        CREATE TABLE IF NOT EXISTS token_logos (
          address  TEXT PRIMARY KEY,
          logo_url TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        )
      `)
      const placeholders = needLogos.map(() => '?').join(',')
      const rows = await env.DB.prepare(
        `SELECT address, logo_url FROM token_logos WHERE address IN (${placeholders}) AND cached_at > ?`
      ).bind(...needLogos.map(t => t.address), Math.floor(Date.now() / 1000) - 86400).all()
      for (const row of rows.results ?? []) {
        cachedLogos[(row as any).address] = (row as any).logo_url
      }
    } catch { /* D1 not available or query failed */ }
  }

  // Apply cached logos + determine what still needs fetching
  for (const t of needLogos) {
    if (cachedLogos[t.address]) t.logoUrl = cachedLogos[t.address]
  }

  const stillNeed = needLogos.filter(t => !t.logoUrl)
  if (stillNeed.length > 0) {
    // Fetch logos in batches of 8 (up to 24 total to stay within Worker CPU limits)
    const BATCH = 8
    const toFetch = stillNeed.slice(0, 24)
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const batch = toFetch.slice(i, i + BATCH)
      const logos = await Promise.allSettled(
        batch.map(t => fetchGeckoTokenLogo(t.address))
      )
      const dbInserts: Promise<any>[] = []
      for (let j = 0; j < batch.length; j++) {
        const result = logos[j]
        const logo   = result.status === 'fulfilled' ? result.value : ''
        if (logo) {
          batch[j].logoUrl = logo
          if (env.DB) {
            dbInserts.push(
              env.DB.prepare(
                `INSERT OR REPLACE INTO token_logos (address, logo_url, cached_at) VALUES (?, ?, ?)`
              ).bind(batch[j].address, logo, Math.floor(Date.now() / 1000)).run().catch(() => {})
            )
          }
        } else if (env.DB) {
          // Cache empty string to avoid re-fetching missing logos
          dbInserts.push(
            env.DB.prepare(
              `INSERT OR REPLACE INTO token_logos (address, logo_url, cached_at) VALUES (?, ?, ?)`
            ).bind(batch[j].address, '', Math.floor(Date.now() / 1000)).run().catch(() => {})
          )
        }
      }
      await Promise.allSettled(dbInserts)
    }
  }

  // ── Sort + paginate ───────────────────────────────────────────────────────
  const all    = Array.from(tokenMap.values()).sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0))
  const total  = all.length
  const tokens = all.slice((page - 1) * limit, (page - 1) * limit + limit)

  return jsonResp({
    success: true,
    data: { tokens, total, page, limit, pages: Math.ceil(total / limit) }
  })
}

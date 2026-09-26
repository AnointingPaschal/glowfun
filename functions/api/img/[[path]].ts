// GET /api/img/ipfs/<cid>[/file]   — cached, same-origin IPFS image proxy
// GET /api/img/r2/<key>            — serve an image stored in our R2 bucket
//
// Why: public IPFS gateways are slow, rate-limited and often fail on first hit, so token
// logos/banners looked broken. This fetches from several gateways in parallel ONCE, stores the
// bytes in R2, and serves them with immutable caching (browser + Cloudflare edge) afterwards.
//
// Only raster images are served (no SVG, so a token can't host script on our origin), and only
// CIDs / whitelisted R2 prefixes are accepted, so this can't be used as an open proxy.

interface Env { IMAGES: R2Bucket }

const GATEWAYS = [
  'https://w3s.link/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
]
// CIDv0 (Qm…) or CIDv1 base32 (b…), optionally followed by up to 3 safe path segments
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,120})(\/[A-Za-z0-9._-]{1,100}){0,3}$/
const R2_PREFIXES = ['tokens/', 'logo/', 'banners/', 'ipfs/']
const OK_TYPE = /^image\/(png|jpe?g|gif|webp|avif)/i
const MAX_BYTES = 8 * 1024 * 1024

const baseHeaders = (type: string, immutable = true): HeadersInit => ({
  'Content-Type': type,
  'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=30',
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
})

async function fromGateways(path: string): Promise<{ buf: ArrayBuffer; type: string } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 9000)
  const attempts = GATEWAYS.map(async g => {
    const r = await fetch(g + path, { signal: ctrl.signal, cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit)
    if (!r.ok) throw new Error('bad status')
    const type = r.headers.get('content-type') ?? ''
    if (!OK_TYPE.test(type)) throw new Error('not an image')
    const len = Number(r.headers.get('content-length') ?? 0)
    if (len > MAX_BYTES) throw new Error('too big')
    const buf = await r.arrayBuffer()
    if (buf.byteLength > MAX_BYTES || buf.byteLength === 0) throw new Error('bad size')
    return { buf, type: type.split(';')[0] }
  })
  try {
    const first = await Promise.any(attempts)
    ctrl.abort()               // stop the slower gateways
    return first
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params, waitUntil }) => {
  const parts = (Array.isArray(params.path) ? params.path : [params.path as string]).filter(Boolean)
  const kind = parts[0]
  const rest = parts.slice(1).join('/')
  const notFound = () => new Response('Not found', { status: 404, headers: baseHeaders('text/plain', false) })

  // Edge cache first
  const cache = (caches as any).default as Cache
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  let res: Response | null = null

  if (kind === 'r2') {
    if (!R2_PREFIXES.some(p => rest.startsWith(p)) || rest.includes('..')) return notFound()
    const obj = await env.IMAGES.get(rest)
    if (!obj) return notFound()
    const type = obj.httpMetadata?.contentType ?? 'image/png'
    if (!OK_TYPE.test(type)) return notFound()
    res = new Response(obj.body, { headers: baseHeaders(type) })
  } else if (kind === 'ipfs') {
    if (!CID_RE.test(rest)) return notFound()
    const r2Key = `ipfs/${rest}`
    const stored = await env.IMAGES.get(r2Key)
    if (stored && OK_TYPE.test(stored.httpMetadata?.contentType ?? '')) {
      res = new Response(stored.body, { headers: baseHeaders(stored.httpMetadata!.contentType!) })
    } else {
      const got = await fromGateways(rest)
      if (!got) return new Response('Gateway timeout', { status: 504, headers: baseHeaders('text/plain', false) })
      waitUntil(env.IMAGES.put(r2Key, got.buf, { httpMetadata: { contentType: got.type } }).catch(() => {}))
      res = new Response(got.buf, { headers: baseHeaders(got.type) })
    }
  } else {
    return notFound()
  }

  waitUntil(cache.put(cacheKey, res.clone()))
  return res
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })

/**
 * GlowFun Public API v1
 * Base URL: /api/v1/
 *
 * Endpoints:
 *   GET /api/v1/tokens                        — paginated token list
 *   GET /api/v1/tokens/:address               — single token details
 *   GET /api/v1/tokens/:address/price         — current price + market cap
 *   GET /api/v1/tokens/:address/buy-quote     — buy quote (?usdc=amount)
 *   GET /api/v1/tokens/:address/sell-quote    — sell quote (?tokens=amount)
 *   GET /api/v1/stats                         — platform stats
 *   GET /api/v1/config                        — public contract config
 *   GET /api/v1/king                          — king of the hill token
 *   GET /api/v1/trending                      — top tokens
 *
 * All responses: { success: true, data: ... } or { success: false, error: "..." }
 * CORS: open (any origin) — suitable for snipers, bots, and third-party builders
 */

interface Env {
  CONFIG: KVNamespace
  DB: D1Database
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ), { status, headers: CORS_HEADERS })
}
function ok(data: unknown) { return json({ success: true, data }) }
function err(msg: string, status = 400) { return json({ success: false, error: msg }, status) }

// ── RPC ──────────────────────────────────────────────────────────────────────

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  })
  const d = await res.json() as any
  if (d.error) throw new Error(d.error.message ?? JSON.stringify(d.error))
  return d.result as string
}

function addrParam(addr: string) { return addr.toLowerCase().replace('0x', '').padStart(64, '0') }
function uintParam(n: bigint)    { return n.toString(16).padStart(64, '0') }

function decodeAddresses(raw: string): string[] {
  const hex = raw.slice(2)
  const arrOffset = Number(BigInt('0x' + hex.slice(0, 64))) * 2
  const arrLen = Number(BigInt('0x' + hex.slice(arrOffset, arrOffset + 64)))
  const out: string[] = []
  for (let i = 0; i < arrLen; i++) {
    const slot = hex.slice(arrOffset + 64 + i * 64, arrOffset + 64 + i * 64 + 64)
    out.push('0x' + slot.slice(24))
  }
  return out
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const url    = new URL(request.url)
  const path   = url.pathname.replace(/^\/api\/v1\/?/, '').replace(/\/$/, '')
  const segs   = path.split('/').filter(Boolean)

  // Read runtime config from KV (admin-set)
  const [factory, kvRpc] = await Promise.all([
    env.CONFIG.get('FACTORY_ADDRESS'),
    env.CONFIG.get('RPC_URL'),
  ])

  if (!factory) return err('Platform not yet configured', 503)

  // RPC: prefer admin-set RPC_URL from KV, fall back to Arc public RPC (read from KV default)
  const rpc = kvRpc || await env.CONFIG.get('RPC_URL_DEFAULT') || 'https://rpc.arc.io' // arc-studio-allow-onchain-literal

  try {

    // ── GET /api/v1/config ──────────────────────────────────────────────────
    if (segs[0] === 'config' && segs.length === 1) {
      const raw = await ethCall(rpc, factory, '0x243a7134')
      const h = raw.slice(2)
      const f = (i: number) => h.slice(i * 64, i * 64 + 64)
      const addr = (i: number) => '0x' + f(i).slice(24)
      const num  = (i: number) => Number(BigInt('0x' + f(i)))
      const big  = (i: number) => BigInt('0x' + f(i)).toString()
      return ok({
        factoryAddress:           factory,
        usdcAddress:              addr(0),
        feeRecipient:             addr(1),
        graduationRecipient:      addr(2),
        graduationThresholdRaw:   big(3),
        graduationThresholdUsdc:  num(3) / 1e6,
        protocolFeeBps:           num(4),
        creationFeeRaw:           big(5),
        creationFeeUsdc:          num(5) / 1e6,
        creatorGraduationFeeBps:  num(6),
        referralFeeBps:           num(7),
        antiSnipeDuration:        num(8),
        antiSnipeTaxBps:          num(9),
        maxBuyBps:                num(10),
        buyCooldown:              num(11),
        creatorLockDuration:      num(12),
        perTokenGraduationFeeBps: num(13),
        kingOfHill:               addr(14),
        kingOfHillRaisedRaw:      big(15),
        chainId:                  5042,
        network:                  'Arc Mainnet',
        version:                  2,
      })
    }

    // ── GET /api/v1/stats ───────────────────────────────────────────────────
    if (segs[0] === 'stats' && segs.length === 1) {
      const countHex = await ethCall(rpc, factory, '0x9f181b5e')
      return ok({
        totalTokens:    Number(BigInt(countHex)),
        network:        'Arc Mainnet',
        chainId:        5042,
        factoryAddress: factory,
      })
    }

    // ── GET /api/v1/king ────────────────────────────────────────────────────
    if (segs[0] === 'king' && segs.length === 1) {
      const [kohRaw, raisedRaw] = await Promise.all([
        ethCall(rpc, factory, '0x7f98dc3e'),
        ethCall(rpc, factory, '0x3c01a15f'),
      ])
      const king   = '0x' + kohRaw.slice(26)
      const raised = BigInt(raisedRaw)
      return ok({
        king:          king === '0x0000000000000000000000000000000000000000' ? null : king,
        raisedRaw:     raised.toString(),
        raisedUsdc:    (Number(raised) / 1e6).toFixed(6),
      })
    }

    // ── GET /api/v1/tokens ──────────────────────────────────────────────────
    if (segs[0] === 'tokens' && segs.length === 1) {
      const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'))
      const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')))
      const offset = (page - 1) * limit

      const countHex = await ethCall(rpc, factory, '0x9f181b5e')
      const total    = Number(BigInt(countHex))

      const data     = '0x9e1a3b8c' + uintParam(BigInt(offset)) + uintParam(BigInt(limit))
      const raw      = await ethCall(rpc, factory, data)
      const addresses = decodeAddresses(raw)

      return ok({
        tokens:     addresses,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    }

    // ── GET /api/v1/trending ────────────────────────────────────────────────
    if (segs[0] === 'trending' && segs.length === 1) {
      const countHex  = await ethCall(rpc, factory, '0x9f181b5e')
      const count     = Math.min(Number(BigInt(countHex)), 50)
      const data      = '0x9e1a3b8c' + uintParam(0n) + uintParam(BigInt(count))
      const raw       = await ethCall(rpc, factory, data)
      const addresses = decodeAddresses(raw)
      return ok({ tokens: addresses, count: addresses.length })
    }

    // ── GET /api/v1/tokens/:address ─────────────────────────────────────────
    if (segs[0] === 'tokens' && segs.length === 2) {
      const token = segs[1]
      if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return err('Invalid token address')
      const ap = addrParam(token)

      const [stateRaw, priceRaw, mcapRaw, progressRaw] = await Promise.all([
        ethCall(rpc, factory, '0x8a5b783b' + ap),
        ethCall(rpc, factory, '0x2b4e5a8f' + ap),
        ethCall(rpc, factory, '0x3e64a696' + ap),
        ethCall(rpc, factory, '0x77d4d5f5' + ap),
      ])

      const h   = stateRaw.slice(2)
      const f   = (i: number) => h.slice(i * 64, i * 64 + 64)
      const big = (i: number) => BigInt('0x' + f(i))

      return ok({
        address:           token,
        creator:           '0x' + f(0).slice(24),
        graduated:         f(5).slice(-1) !== '0',
        createdAt:         Number(big(6)),
        totalSupply:       (Number(big(10)) / 1e18).toFixed(0),
        curveTokens:       (Number(big(7))  / 1e18).toFixed(0),
        graduationTokens:  (Number(big(8))  / 1e18).toFixed(0),
        creatorTokens:     (Number(big(9))  / 1e18).toFixed(0),
        realUsdcRaised:    (Number(big(3))  / 1e6).toFixed(6),
        realTokensSold:    (Number(big(4))  / 1e18).toFixed(2),
        priceRaw:          BigInt(priceRaw).toString(),
        marketCapUsdc:     (Number(BigInt(mcapRaw)) / 1e6).toFixed(6),
        progressPercent:   (Number(BigInt(progressRaw)) / 1e16).toFixed(4),
        chainId:           5042,
        network:           'Arc Mainnet',
      })
    }

    // ── GET /api/v1/tokens/:address/price ───────────────────────────────────
    if (segs[0] === 'tokens' && segs.length === 3 && segs[2] === 'price') {
      const token = segs[1]
      if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return err('Invalid token address')
      const ap = addrParam(token)

      const [priceRaw, mcapRaw, progressRaw] = await Promise.all([
        ethCall(rpc, factory, '0x2b4e5a8f' + ap),
        ethCall(rpc, factory, '0x3e64a696' + ap),
        ethCall(rpc, factory, '0x77d4d5f5' + ap),
      ])

      return ok({
        token,
        priceRaw:        BigInt(priceRaw).toString(),
        marketCapRaw:    BigInt(mcapRaw).toString(),
        marketCapUsdc:   (Number(BigInt(mcapRaw)) / 1e6).toFixed(6),
        progressPercent: (Number(BigInt(progressRaw)) / 1e16).toFixed(4),
        timestamp:       Date.now(),
      })
    }

    // ── GET /api/v1/tokens/:address/buy-quote?usdc=1000000 ──────────────────
    if (segs[0] === 'tokens' && segs.length === 3 && segs[2] === 'buy-quote') {
      const token  = segs[1]
      const usdcIn = url.searchParams.get('usdc')
      if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return err('Invalid token address')
      if (!usdcIn) return err('Missing ?usdc=amount (6-decimal USDC, e.g. 1000000 = $1.00)')

      const raw       = await ethCall(rpc, factory, '0x7d7c2a1c' + addrParam(token) + uintParam(BigInt(usdcIn)))
      const tokensOut = BigInt(raw)

      return ok({
        token,
        usdcIn,
        usdcInUsdc:        (Number(BigInt(usdcIn)) / 1e6).toFixed(6),
        tokensOut:         tokensOut.toString(),
        tokensOutFormatted:(Number(tokensOut) / 1e18).toFixed(6),
        hint: 'Apply your slippage tolerance and pass as minTokensOut to buyTokens()',
      })
    }

    // ── GET /api/v1/tokens/:address/sell-quote?tokens=1000000000000000000 ───
    if (segs[0] === 'tokens' && segs.length === 3 && segs[2] === 'sell-quote') {
      const token    = segs[1]
      const tokensIn = url.searchParams.get('tokens')
      if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return err('Invalid token address')
      if (!tokensIn) return err('Missing ?tokens=amount (18-decimal token wei)')

      const raw     = await ethCall(rpc, factory, '0x9c6d0f6b' + addrParam(token) + uintParam(BigInt(tokensIn)))
      const usdcOut = BigInt(raw)

      return ok({
        token,
        tokensIn,
        tokensInFormatted: (Number(BigInt(tokensIn)) / 1e18).toFixed(6),
        usdcOut:           usdcOut.toString(),
        usdcOutUsdc:       (Number(usdcOut) / 1e6).toFixed(6),
        hint: 'Apply your slippage tolerance and pass as minUsdcOut to sellTokens()',
      })
    }

    return err('Endpoint not found', 404)

  } catch (e: any) {
    return err('RPC error: ' + (e?.message ?? 'unknown error'), 500)
  }
}

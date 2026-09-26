// GET  /api/banner/{token}                        -> { bannerUri: string }
// POST /api/banner/{token}  { bannerUri, timestamp, signature }
//
// The token contract has no banner field, so banners live in KV (key "banner:<token>").
// Writes must be signed by the token's on-chain creator():
//   message = `GlowFun banner\ntoken: <address>\nbanner: <uri>\ntimestamp: <unix seconds>`
// Timestamps older than 10 minutes are rejected (replay protection). An empty bannerUri clears it.

import { recoverMessageAddress, toFunctionSelector } from 'viem'

interface Env { CONFIG: KVNamespace }

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/
const DEFAULT_RPC = 'https://rpc.mainnet.arc.io'
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra },
  })

const bannerMessage = (token: string, uri: string, ts: number) =>
  `GlowFun banner\ntoken: ${token.toLowerCase()}\nbanner: ${uri}\ntimestamp: ${ts}`

async function tokenCreator(env: Env, token: string): Promise<string | null> {
  const rpc = (await env.CONFIG.get('RPC_URL')) || DEFAULT_RPC
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: token, data: toFunctionSelector('creator()') }, 'latest'],
    }),
  })
  const j = await r.json() as { result?: string }
  if (!j.result || j.result.length < 66) return null
  return ('0x' + j.result.slice(-40)).toLowerCase()
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const token = String(params.address ?? '').toLowerCase()
  if (!ADDR_RE.test(token)) return json({ error: 'bad address' }, 400)
  const raw = await env.CONFIG.get(`banner:${token}`)
  const rec = raw ? JSON.parse(raw) as { uri: string } : null
  return json({ bannerUri: rec?.uri ?? '' }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' })
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const token = String(params.address ?? '').toLowerCase()
  if (!ADDR_RE.test(token)) return json({ error: 'bad address' }, 400)

  let body: { bannerUri?: string; timestamp?: number; signature?: `0x${string}` }
  try { body = await request.json() } catch { return json({ error: 'bad json' }, 400) }
  const uri = (body.bannerUri ?? '').trim()
  const ts = Number(body.timestamp)
  const sig = body.signature
  if (uri && !(/^(ipfs:\/\/[A-Za-z0-9]{40,120}(\/[\w.\-]+)?|https:\/\/[^\s]{4,480})$/.test(uri))) {
    return json({ error: 'bannerUri must be ipfs:// or https://' }, 400)
  }
  if (!sig || !Number.isFinite(ts)) return json({ error: 'missing signature' }, 400)
  if (Math.abs(Date.now() / 1000 - ts) > 600) return json({ error: 'signature expired' }, 400)

  let signer: string
  try { signer = (await recoverMessageAddress({ message: bannerMessage(token, uri, ts), signature: sig })).toLowerCase() }
  catch { return json({ error: 'bad signature' }, 400) }

  const creator = await tokenCreator(env, token).catch(() => null)
  if (!creator) return json({ error: 'could not verify token creator' }, 502)
  if (signer !== creator) return json({ error: 'only the token creator can set the banner' }, 403)

  if (uri) await env.CONFIG.put(`banner:${token}`, JSON.stringify({ uri, by: signer, at: Date.now() }))
  else await env.CONFIG.delete(`banner:${token}`)
  return json({ ok: true, bannerUri: uri })
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } })

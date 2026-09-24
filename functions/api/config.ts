// GET  /api/config            — returns all public config keys from KV
// POST /api/config { key, value }               — write one key
// POST /api/config { updates: JSON.stringify({}) } — write multiple keys at once

interface Env { CONFIG: KVNamespace }

const PUBLIC_KEYS = [
  'FACTORY_ADDRESS',
  'FACTORY_ADDRESSES',   // JSON array [{address,label,version}] — multi-factory
  'USDC_ADDRESS', 'FEE_RECIPIENT', 'GRADUATION_RECIPIENT',
  'RPC_URL',
  'WALLETCONNECT_PROJECT_ID', 'CIRCLE_APP_ID', 'R2_PUBLIC_URL',
  'SITE_TITLE', 'SITE_LOGO', 'SITE_DESCRIPTION', 'TWITTER_HANDLE',
  'CREATION_FEE_USDC', 'PROTOCOL_FEE_BPS', 'GRADUATION_THRESHOLD_USDC',
  'REFERRAL_FEE_BPS',
]

const ALL_KEYS = [
  ...PUBLIC_KEYS,
  'ADMIN_SECRET', 'CIRCLE_API_KEY', 'PINATA_JWT',
]

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const result: Record<string, string> = {}
  await Promise.all(
    ALL_KEYS.map(async (k) => {
      const v = await env.CONFIG.get(k)
      if (v !== null) result[k] = v
    })
  )
  return Response.json(result)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as Record<string, string>

    // Auth check
    const adminSecret = await env.CONFIG.get('ADMIN_SECRET')
    const reqSecret   = request.headers.get('X-Admin-Token')
    const authed      = !adminSecret || reqSecret === adminSecret

    // ── Batch write: { updates: JSON.stringify({ KEY: val, ... }) } ──────────
    if (body['updates']) {
      if (!authed) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      }
      let updates: Record<string, string>
      try { updates = JSON.parse(body['updates']) }
      catch { return Response.json({ ok: false, error: 'Invalid updates JSON' }, { status: 400 }) }

      const written: string[] = []
      const skipped: string[] = []
      await Promise.all(Object.entries(updates).map(async ([k, v]) => {
        if (!ALL_KEYS.includes(k)) { skipped.push(k); return }
        if (v === '' || v === null || v === undefined) {
          await env.CONFIG.delete(k)
        } else {
          await env.CONFIG.put(k, String(v))
        }
        written.push(k)
      }))
      return Response.json({ ok: true, written, skipped })
    }

    // ── Single write: { key, value } ─────────────────────────────────────────
    const { key, value } = body
    if (!key || !ALL_KEYS.includes(key)) {
      return Response.json({ ok: false, error: `Unknown key: ${key}` }, { status: 400 })
    }
    // Allow setting ADMIN_SECRET even without auth (bootstrap)
    if (!authed && key !== 'ADMIN_SECRET') {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (value === '' || value === null || value === undefined) {
      await env.CONFIG.delete(key)
    } else {
      await env.CONFIG.put(key, String(value))
    }
    return Response.json({ ok: true, key })

  } catch (e: any) {
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token' }
  })

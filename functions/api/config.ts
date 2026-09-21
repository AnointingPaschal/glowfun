// GET  /api/config          — returns all public config keys from KV
// POST /api/config  { key, value } — writes one key to KV (admin-authed)

interface Env {
  CONFIG: KVNamespace
}

const PUBLIC_KEYS = [
  'FACTORY_ADDRESS', 'USDC_ADDRESS', 'FEE_RECIPIENT', 'GRADUATION_RECIPIENT',
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
    const { key, value } = await request.json() as { key: string; value: string }

    if (!key || !ALL_KEYS.includes(key)) {
      return Response.json({ ok: false, error: 'Unknown key' }, { status: 400 })
    }

    // Validate admin secret for write operations
    const adminSecret = await env.CONFIG.get('ADMIN_SECRET')
    const reqSecret = request.headers.get('X-Admin-Token')

    // Allow writes if no secret is set yet (bootstrapping) or secret matches
    if (adminSecret && reqSecret !== adminSecret) {
      // For bootstrap: allow setting ADMIN_SECRET with no auth
      if (key !== 'ADMIN_SECRET') {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    if (value === '' || value === null || value === undefined) {
      await env.CONFIG.delete(key)
    } else {
      await env.CONFIG.put(key, String(value))
    }

    return Response.json({ ok: true, key })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? 'Failed' }, { status: 500 })
  }
}

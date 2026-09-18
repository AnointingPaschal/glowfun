interface Env { CONFIG: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = await env.CONFIG.get('CIRCLE_API_KEY')
  if (!apiKey) return Response.json({ error: 'Circle API not configured' }, { status: 503 })

  const { userToken } = await request.json() as { userToken: string }
  if (!userToken) return Response.json({ error: 'userToken required' }, { status: 400 })

  try {
    const res = await fetch('https://api.circle.com/v1/w3s/user/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-User-Token': userToken },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), blockchains: ['ARC-MAINNET'], accountType: 'EOA' }),
    })
    const data = await res.json() as any
    if (data?.code === 155106) return Response.json({ code: 155106 })
    return Response.json(data?.data ?? data)
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Network error' }, { status: 500 })
  }
}

interface Env { CONFIG: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = await env.CONFIG.get('CIRCLE_API_KEY')
  if (!apiKey) return Response.json({ error: 'Circle API not configured' }, { status: 503 })

  const { userToken } = await request.json() as { userToken: string }
  if (!userToken) return Response.json({ error: 'userToken required' }, { status: 400 })

  try {
    const res = await fetch('https://api.circle.com/v1/w3s/wallets', {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'X-User-Token': userToken },
    })
    const data = await res.json() as any
    return Response.json({ wallets: data?.data?.wallets ?? [] })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Network error' }, { status: 500 })
  }
}

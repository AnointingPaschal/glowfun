interface Env { CONFIG: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = await env.CONFIG.get('CIRCLE_API_KEY')
  if (!apiKey) return Response.json({ error: 'Circle API not configured' }, { status: 503 })

  const { userId } = await request.json() as { userId: string }
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })

  try {
    const res = await fetch('https://api.circle.com/v1/w3s/users/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json() as any
    return Response.json(data?.data ?? data)
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Network error' }, { status: 500 })
  }
}

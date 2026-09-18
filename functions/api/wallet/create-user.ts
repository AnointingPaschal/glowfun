// POST /api/wallet/create-user

interface Env {
  CONFIG: KVNamespace
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const apiKey = await env.CONFIG.get('CIRCLE_API_KEY')
  if (!apiKey) return Response.json({ error: 'Circle API not configured. Set CIRCLE_API_KEY in Admin → Keys.' }, { status: 503 })

  const { userId } = await request.json() as { userId: string }
  if (!userId || userId.length < 5) return Response.json({ error: 'userId must be at least 5 chars' }, { status: 400 })

  try {
    const res = await fetch('https://api.circle.com/v1/w3s/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json() as any
    if (data?.code === 155106) return Response.json({ code: 155106, message: 'User already exists' })
    return Response.json(data)
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Network error' }, { status: 500 })
  }
}

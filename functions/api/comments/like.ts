// POST /api/comments/like  { id: number }

interface Env { DB: D1Database }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const { id } = await request.json() as { id: number }
    if (!id) return Response.json({ error: 'id required' }, { status: 400 })
    await env.DB.prepare(`UPDATE comments SET likes = likes + 1 WHERE id = ?`).bind(id).run()
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Failed' }, { status: 500 })
  }
}

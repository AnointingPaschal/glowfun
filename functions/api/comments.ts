// GET  /api/comments?token=0x...&page=1&limit=20  — list comments for a token
// POST /api/comments  { token_address, author, content }  — post a comment

interface Env {
  DB: D1Database
}

interface Comment {
  id: number
  token_address: string
  author: string
  content: string
  likes: number
  created_at: string
}

// Lazy-create table if it doesn't exist
async function ensureTable(db: D1Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT NOT NULL,
      author       TEXT NOT NULL,
      content      TEXT NOT NULL,
      likes        INTEGER NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_comments_token ON comments(token_address);
    CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
  `)
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureTable(env.DB)
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50)
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1'), 1)
    const offset = (page - 1) * limit

    let stmt: D1PreparedStatement
    if (token) {
      stmt = env.DB.prepare(
        `SELECT * FROM comments WHERE token_address = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(token.toLowerCase(), limit, offset)
    } else {
      stmt = env.DB.prepare(
        `SELECT * FROM comments ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(limit, offset)
    }

    const { results } = await stmt.all<Comment>()

    // Get total count
    const countRes = token
      ? await env.DB.prepare(`SELECT COUNT(*) as cnt FROM comments WHERE token_address = ?`).bind(token.toLowerCase()).first<{ cnt: number }>()
      : await env.DB.prepare(`SELECT COUNT(*) as cnt FROM comments`).first<{ cnt: number }>()

    return Response.json({ comments: results, total: countRes?.cnt ?? 0, page, limit })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Failed to load comments' }, { status: 500 })
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureTable(env.DB)
    const { token_address, author, content } = await request.json() as {
      token_address: string
      author: string
      content: string
    }

    if (!token_address || !author || !content) {
      return Response.json({ error: 'token_address, author, and content are required' }, { status: 400 })
    }

    if (content.trim().length < 1 || content.length > 500) {
      return Response.json({ error: 'Comment must be 1–500 characters' }, { status: 400 })
    }

    // Basic address validation
    if (!/^0x[0-9a-fA-F]{40}$/.test(author)) {
      return Response.json({ error: 'Invalid author address' }, { status: 400 })
    }

    const result = await env.DB.prepare(
      `INSERT INTO comments (token_address, author, content) VALUES (?, ?, ?) RETURNING *`
    ).bind(token_address.toLowerCase(), author.toLowerCase(), content.trim()).first<Comment>()

    return Response.json({ ok: true, comment: result })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Failed to post comment' }, { status: 500 })
  }
}

// POST /api/upload — upload token image to R2, returns public URL

interface Env {
  IMAGES: R2Bucket
  CONFIG: KVNamespace
}

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: 'Invalid file type. Use JPEG, PNG, GIF or WebP.' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'File too large. Max 5MB.' }, { status: 400 })
    }

    // Generate unique key — prefix can be 'logo' for site assets, defaults to 'tokens'
    const prefix = (formData.get('prefix') as string | null) === 'logo' ? 'logo' : 'tokens'
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const arrayBuffer = await file.arrayBuffer()

    await env.IMAGES.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000',
      },
    })

    // Return the public URL — R2 public bucket URL or custom domain
    // Prefer a configured public R2 URL; otherwise serve through our own cached /api/img proxy
    // (the old fallback pointed at images.glowfun.pages.dev, which doesn't resolve).
    const configured = (await env.CONFIG.get('R2_PUBLIC_URL'))?.replace(/\/+$/, '')
    const baseUrl = configured || `${new URL(request.url).origin}/api/img/r2`
    const url = `${baseUrl}/${key}`

    return Response.json({ ok: true, url, key })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Upload failed' }, { status: 500 })
  }
}

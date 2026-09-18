// CORS + admin auth middleware for all /api/* routes
export const onRequest: PagesFunction = async (ctx) => {
  const origin = ctx.request.headers.get('Origin') ?? '*'

  // Handle preflight
  if (ctx.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const response = await ctx.next()
  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token')
  return response
}

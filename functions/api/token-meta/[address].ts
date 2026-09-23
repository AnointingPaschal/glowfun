/**
 * GET /api/token-meta/{address}
 *
 * Returns ERC-7572 / OpenSea-compatible token metadata JSON.
 * Also readable by many wallets and indexers that support tokenURI-style metadata.
 *
 * Response matches the shape returned by contractURI() on the GlowToken contract,
 * but resolves ipfs:// to HTTPS and adds decimals/chainId fields.
 */

interface Env { DB: D1Database; CONFIG: KVNamespace }

function resolveImage(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) return `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`
  return uri
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  }

  const address = (params.address as string).toLowerCase()
  const origin  = new URL(request.url).origin

  try {
    const row = await env.DB.prepare(
      `SELECT name, symbol, logo_url, price_usd FROM arc_tokens WHERE LOWER(address) = ?`
    ).bind(address).first()

    if (!row) {
      return new Response(JSON.stringify({ error: 'Token not found' }), { status: 404, headers: cors })
    }

    const logoURI = resolveImage(row.logo_url as string) || ''

    const meta = {
      name:         row.name,
      symbol:       row.symbol,
      decimals:     18,
      chainId:      5042,
      address:      address,
      description:  `${row.name} (${row.symbol}) — launched on GlowFun on Arc Mainnet`,
      image:        logoURI,
      logoURI,                          // Uniswap token list field
      external_url: `${origin}/token/${address}`,
    }

    return new Response(JSON.stringify(meta, null, 2), { headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: cors })
  }
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })

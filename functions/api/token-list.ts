/**
 * GET /api/token-list.json
 *
 * Returns a Uniswap Token List (https://tokenlists.org) for all GlowFun tokens.
 * This format is understood by:
 *   - Uniswap interface (add as custom list)
 *   - Rainbow Wallet
 *   - 1inch
 *   - Sushiswap
 *   - Any wallet that supports EIP-2612 token lists
 *
 * Add to Uniswap: https://app.uniswap.org → Tokens → Manage → Lists
 *   → paste: https://glowaide.com/api/token-list.json
 */

interface Env { DB: D1Database; CONFIG: KVNamespace }

function resolveImage(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) {
    const hash = uri.slice(7)
    return `https://gateway.pinata.cloud/ipfs/${hash}`
  }
  return uri
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  }

  const origin = new URL(request.url).origin

  try {
    // Read all tokens from D1 — only include tokens that have a logo and name
    const { results } = await env.DB.prepare(`
      SELECT address, name, symbol, logo_url, price_usd, mcap_usd
      FROM   arc_tokens
      WHERE  name != '' AND symbol != ''
      ORDER  BY updated_at DESC
      LIMIT  1000
    `).all()

    const tokens = (results ?? []).map((r: any) => ({
      chainId:  5042,
      address:  r.address,
      name:     r.name,
      symbol:   r.symbol,
      decimals: 18,
      logoURI:  resolveImage(r.logo_url) || `${origin}/api/token-logo/${r.address}`,
      tags:     ['glowfun'],
      extensions: {
        glowfun: `${origin}/token/${r.address}`,
        priceUsd: r.price_usd ?? 0,
      },
    }))

    const list = {
      name:      'GlowFun Arc Tokens',
      logoURI:   `${origin}/icon.png`,
      keywords:  ['glowfun', 'arc', 'usdc', 'meme', 'defi'],
      timestamp: new Date().toISOString(),
      version:   { major: 1, minor: 0, patch: 0 },
      tokens,
    }

    return new Response(JSON.stringify(list, null, 2), { headers: cors })
  } catch (e) {
    // Return empty list on error rather than crashing
    return new Response(JSON.stringify({
      name: 'GlowFun Arc Tokens',
      logoURI: `${origin}/icon.png`,
      keywords: ['glowfun', 'arc'],
      timestamp: new Date().toISOString(),
      version: { major: 1, minor: 0, patch: 0 },
      tokens: [],
    }), { headers: cors })
  }
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' } })

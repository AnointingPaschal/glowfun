/**
 * GET /api/token-list.json
 *
 * Returns a Uniswap-compatible Token List (https://tokenlists.org) covering
 * every token launched across all three GlowFun factory contracts.
 *
 * Add to Uniswap: App → Tokens → Manage → Lists
 *   → paste: https://glowaide.com/api/token-list.json
 *
 * Supported by: Uniswap, Rainbow, 1inch, Sushi, and any EIP-2612 token list client.
 */

interface Env { DB: D1Database; CONFIG: KVNamespace }

// arc-studio-allow-onchain-literal — public Arc Mainnet RPC, no credentials
const ARC_RPC = 'https://rpc.arc.io'
const CHAIN_ID = 5042

// arc-studio-allow-onchain-literal — verified deployed GlowFun factory addresses (public, read-only)
const FACTORIES = [
  '0x96f460a73fCcF8301Aa3E14B1d5c684b7f714cb3', // V1
  '0x12FBDe4338D9f78DF4d3c24d42F4AA00A98741DA', // V2
  '0xf54c92d87B271Ca707C89ED0c929bb51139a407d', // V3
]

function toHex32(n: number): string {
  return n.toString(16).padStart(64, '0')
}

function stripHex(s: string): string {
  return s.startsWith('0x') ? s.slice(2) : s
}

function decodeUint(hex: string, offset = 0): bigint {
  const s = stripHex(hex)
  const chunk = s.slice(offset * 64, offset * 64 + 64)
  return chunk ? BigInt('0x' + chunk) : 0n
}

function decodeAddress(hex: string): string {
  const s = stripHex(hex)
  if (s.length < 64) return ''
  return '0x' + s.slice(24, 64)
}

function decodeString(hex: string): string {
  try {
    const s = stripHex(hex)
    const dataOffset = Number(decodeUint(hex, 0)) * 2
    const len = Number(BigInt('0x' + s.slice(dataOffset, dataOffset + 64)))
    const raw = s.slice(dataOffset + 64, dataOffset + 64 + len * 2)
    return decodeURIComponent(raw.replace(/../g, '%$&'))
  } catch { return '' }
}

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(ARC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  })
  const json: any = await res.json()
  return (json.result as string) || '0x'
}

async function getTokenCount(factory: string): Promise<number> {
  try {
    const res = await ethCall(factory, '0x4b35026c')
    return Number(decodeUint(res))
  } catch { return 0 }
}

async function getTokenAt(factory: string, index: number): Promise<string> {
  try {
    const res = await ethCall(factory, '0x8a3b4a11' + toHex32(index))
    return decodeAddress(res)
  } catch { return '' }
}

function resolveIpfs(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) return `https://w3s.link/ipfs/${uri.slice(7)}`
  return uri
}

async function getTokenInfo(tokenAddr: string, factory: string): Promise<{
  name: string; symbol: string; decimals: number; logoURI: string
}> {
  // Try factory getTokenMetadata (V2/V3): returns (string,string,string,string,string,string,string)
  try {
    const addrPadded = tokenAddr.slice(2).toLowerCase().padStart(64, '0')
    const metaRes = await ethCall(factory, '0x3b89e3c3' + addrPadded)
    if (metaRes && metaRes !== '0x' && metaRes.length > 130) {
      const hex = stripHex(metaRes)
      const readStr = (slotIdx: number) => {
        const offset = Number(decodeUint(metaRes, slotIdx)) * 2
        const len = Number(BigInt('0x' + hex.slice(offset, offset + 64)))
        const raw = hex.slice(offset + 64, offset + 64 + len * 2)
        try { return decodeURIComponent(raw.replace(/../g, '%$&')) } catch { return '' }
      }
      const name    = readStr(0)
      const symbol  = readStr(1)
      const logoRaw = readStr(3) // imageUri is index 3
      if (name && symbol) {
        return { name, symbol, decimals: 18, logoURI: resolveIpfs(logoRaw) }
      }
    }
  } catch { /* fall through */ }

  // Fallback: direct ERC-20 calls
  try {
    const [nameRes, symbolRes, decimalsRes] = await Promise.all([
      ethCall(tokenAddr, '0x06fdde03'),
      ethCall(tokenAddr, '0x95d89b41'),
      ethCall(tokenAddr, '0x313ce567'),
    ])
    return {
      name:     decodeString(nameRes),
      symbol:   decodeString(symbolRes),
      decimals: Number(decodeUint(decimalsRes)) || 18,
      logoURI:  '',
    }
  } catch {
    return { name: '', symbol: '', decimals: 18, logoURI: '' }
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
  }

  const origin = new URL(request.url).origin

  try {
    // Collect all token addresses from all factories in parallel
    const allEntries: Array<{ addr: string; factory: string }> = []

    await Promise.all(FACTORIES.map(async (factory) => {
      const count = await getTokenCount(factory)
      const addrs = await Promise.all(
        Array.from({ length: count }, (_, i) => getTokenAt(factory, i))
      )
      addrs.forEach(addr => {
        if (addr && addr.toLowerCase() !== '0x' + '0'.repeat(40)) {
          allEntries.push({ addr, factory })
        }
      })
    }))

    // Deduplicate
    const seen = new Set<string>()
    const unique = allEntries.filter(({ addr }) => {
      const key = addr.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Fetch metadata for every token
    const tokenEntries = await Promise.all(
      unique.map(async ({ addr, factory }) => {
        const info = await getTokenInfo(addr, factory)
        if (!info.name || !info.symbol) return null
        return {
          chainId:  CHAIN_ID,
          address:  addr,
          name:     info.name,
          symbol:   info.symbol,
          decimals: info.decimals,
          ...(info.logoURI ? { logoURI: info.logoURI } : {}),
          tags: ['glowfun'],
          extensions: {
            factory,
            launchpadUrl: `${origin}/token/${addr}`,
          },
        }
      })
    )

    const tokens = tokenEntries.filter(Boolean)

    return new Response(JSON.stringify({
      name:      'GlowFun Token List',
      logoURI:   `${origin}/logo.png`,
      timestamp: new Date().toISOString(),
      version:   { major: 1, minor: 0, patch: 0 },
      keywords:  ['glowfun', 'arc', 'meme', 'bonding-curve'],
      tokens,
    }, null, 2), { headers: cors })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: cors,
    })
  }
}

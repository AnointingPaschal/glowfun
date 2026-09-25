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
const FACTORIES: Array<{ address: string; version: 1 | 2 | 3 }> = [
  { address: '0x96f460a73fCcF8301Aa3E14B1d5c684b7f714cb3', version: 1 }, // V1 — uses allTokens()
  { address: '0x12FBDe4338D9f78DF4d3c24d42F4AA00A98741DA', version: 2 }, // V2 — uses launchedTokensCount + launchedTokens(i)
  { address: '0xf54c92d87B271Ca707C89ED0c929bb51139a407d', version: 3 }, // V3 — uses launchedTokensCount + launchedTokens(i)
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
    const res = await ethCall(factory, '0xfa9e0e92') // launchedTokensCount()
    return Number(decodeUint(res))
  } catch { return 0 }
}

async function getTokenAt(factory: string, index: number): Promise<string> {
  try {
    const res = await ethCall(factory, '0x10f2b141' + toHex32(index)) // launchedTokens(uint256)
    return decodeAddress(res)
  } catch { return '' }
}

// V1 only — returns all token addresses in a single call via allTokens()
async function getAllTokensV1(factory: string): Promise<string[]> {
  try {
    const res = await ethCall(factory, '0x6ff97f1d') // allTokens()
    if (!res || res === '0x') return []
    const hex = stripHex(res)
    // ABI: offset (32 bytes) + length (32 bytes) + addresses (32 bytes each)
    const arrOffset = Number(decodeUint(res, 0)) * 2
    const count = Number(BigInt('0x' + hex.slice(arrOffset, arrOffset + 64)))
    const addrs: string[] = []
    for (let i = 0; i < count; i++) {
      const slot = hex.slice(arrOffset + 64 + i * 64, arrOffset + 64 + i * 64 + 64)
      if (slot) addrs.push('0x' + slot.slice(24))
    }
    return addrs
  } catch { return [] }
}

function resolveIpfs(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) return `https://w3s.link/ipfs/${uri.slice(7)}`
  return uri
}

async function getTokenInfo(tokenAddr: string): Promise<{
  name: string; symbol: string; decimals: number; logoURI: string
}> {
  // Read directly from the token contract's own ERC-20 + metadata fields.
  // No factory has a getTokenMetadata() function — name/symbol/decimals/imageUri
  // are public state on the GlowToken contract itself (V1, V2, V3 all share this).
  try {
    const [nameRes, symbolRes, decimalsRes, imageRes] = await Promise.all([
      ethCall(tokenAddr, '0x06fdde03'), // name()
      ethCall(tokenAddr, '0x95d89b41'), // symbol()
      ethCall(tokenAddr, '0x313ce567'), // decimals()
      ethCall(tokenAddr, '0x0bf82da4'), // imageUri()
    ])
    const logoRaw = imageRes && imageRes !== '0x' ? decodeString(imageRes) : ''
    return {
      name:     decodeString(nameRes),
      symbol:   decodeString(symbolRes),
      decimals: Number(decodeUint(decimalsRes)) || 18,
      logoURI:  resolveIpfs(logoRaw),
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

    await Promise.all(FACTORIES.map(async ({ address: factory, version }) => {
      let addrs: string[] = []
      if (version === 1) {
        // V1 uses allTokens() — returns full array in one call
        addrs = await getAllTokensV1(factory)
      } else {
        // V2/V3 use launchedTokensCount() + launchedTokens(i)
        const count = await getTokenCount(factory)
        addrs = await Promise.all(
          Array.from({ length: count }, (_, i) => getTokenAt(factory, i))
        )
      }
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
        const info = await getTokenInfo(addr)
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

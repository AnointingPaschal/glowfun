/**
 * GET /api/factory-tokens
 *
 * Returns all token addresses from ALL configured factory contracts.
 * Auto-detects factory version:
 *   V1 → allTokens()                         selector 0x6ff97f1d  (returns address[])
 *   V2/V3 → launchedTokensCount()            selector 0xfa9e0e92
 *          + launchedTokens(uint256)          selector 0x10f2b141
 *
 * All function selectors verified via ethereum-cryptography keccak256.
 */

interface Env { CONFIG: KVNamespace; DB: D1Database }

const CORS  = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const RPC   = 'https://rpc.mainnet.arc.io'
const BATCH = 20

// ── Verified selectors (keccak256 via ethereum-cryptography) ─────────────────
const SEL = {
  allTokens:           '0x6ff97f1d', // allTokens() → address[]          V1
  launchedTokensCount: '0xfa9e0e92', // launchedTokensCount() → uint256  V2/V3
  launchedTokens:      '0x10f2b141', // launchedTokens(uint256) → address
  tokenStates:         '0x89cb096a', // tokenStates(address) → struct
  name:                '0x06fdde03', // name() → string
  symbol:              '0x95d89b41', // symbol() → string
  imageUri:            '0x0bf82da4', // imageUri() → string
}

async function rpc(calls: object[]): Promise<any[]> {
  try {
    const r = await fetch(RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calls), signal: AbortSignal.timeout(12_000),
    })
    const d: any[] = await r.json()
    return d
  } catch { return [] }
}

async function call(to: string, data: string): Promise<string> {
  const res = await rpc([{ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }])
  return res[0]?.result ?? '0x'
}

// ABI decode string from eth_call result
function decStr(hex: string): string {
  try {
    const h = hex.replace('0x', '')
    if (h.length < 128) return ''
    const offsetBytes = parseInt(h.slice(0, 64), 16) * 2   // pointer to data
    const len  = parseInt(h.slice(offsetBytes, offsetBytes + 64), 16) * 2
    if (!len) return ''
    const data = h.slice(offsetBytes + 64, offsetBytes + 64 + len)
    return Buffer.from(data, 'hex').toString('utf8').replace(/\0/g, '')
  } catch { return '' }
}

// ABI decode address[] from eth_call result (for allTokens())
function decAddrArray(hex: string): string[] {
  try {
    const h = hex.replace('0x', '')
    if (h.length < 128) return []
    // h[0..64] = offset to array data (should be 0x20 = 32)
    const arrStart = parseInt(h.slice(0, 64), 16) * 2
    const len      = parseInt(h.slice(arrStart, arrStart + 64), 16)
    const addrs: string[] = []
    for (let i = 0; i < len; i++) {
      const slot = h.slice(arrStart + 64 + i * 64, arrStart + 64 + (i + 1) * 64)
      if (slot.length === 64) {
        const addr = '0x' + slot.slice(24).toLowerCase()
        if (addr !== '0x' + '0'.repeat(40)) addrs.push(addr)
      }
    }
    return addrs
  } catch { return [] }
}

// ABI decode single address (padded to 32 bytes)
function decAddr(hex: string): string {
  const h = hex.replace('0x', '')
  if (h.length < 64) return ''
  const addr = '0x' + h.slice(24, 64).toLowerCase()
  return addr === '0x' + '0'.repeat(40) ? '' : addr
}

// ── V1: use allTokens() — returns full array in one call ─────────────────────
async function getTokensV1(factory: string): Promise<string[]> {
  const res = await call(factory, SEL.allTokens)
  if (!res || res === '0x') return []
  const addrs = decAddrArray(res)
  console.log(`[V1 ${factory.slice(0,10)}] allTokens() → ${addrs.length} tokens`)
  return addrs
}

// ── V2/V3: use launchedTokensCount() + launchedTokens(i) ────────────────────
async function getTokensV2(factory: string): Promise<string[]> {
  const countHex = await call(factory, SEL.launchedTokensCount)
  const count    = parseInt(countHex ?? '0x0', 16)
  if (!count) return []

  const addrs: string[] = []
  for (let start = 0; start < count; start += BATCH) {
    const calls = []
    for (let i = start; i < Math.min(start + BATCH, count); i++) {
      calls.push({
        jsonrpc: '2.0', id: i, method: 'eth_call',
        params: [{
          to: factory,
          data: SEL.launchedTokens + i.toString(16).padStart(64, '0'),
        }, 'latest'],
      })
    }
    const results = await rpc(calls)
    for (const r of results) {
      const addr = decAddr(r?.result ?? '')
      if (addr) addrs.push(addr)
    }
  }
  console.log(`[V2/V3 ${factory.slice(0,10)}] launchedTokens → ${addrs.length} tokens`)
  return addrs
}

// ── Auto-detect factory version, get token addresses ────────────────────────
async function getTokenAddresses(factory: string): Promise<string[]> {
  // Try V1 first (allTokens)
  const v1 = await getTokensV1(factory)
  if (v1.length > 0) return v1

  // Fall back to V2/V3
  return getTokensV2(factory)
}

// ── Read metadata for a batch of token addresses ─────────────────────────────
async function readMetadata(
  factory: string,
  tokenAddrs: string[],
  label: string,
): Promise<TokenInfo[]> {
  const results: TokenInfo[] = []

  for (let start = 0; start < tokenAddrs.length; start += BATCH) {
    const chunk = tokenAddrs.slice(start, start + BATCH)

    // Per token: name(), symbol(), imageUri(), tokenStates(addr)
    const calls = chunk.flatMap((addr, i) => [
      { jsonrpc:'2.0', id:i*4,   method:'eth_call', params:[{to:addr,   data:SEL.name},                                                          'latest'] },
      { jsonrpc:'2.0', id:i*4+1, method:'eth_call', params:[{to:addr,   data:SEL.symbol},                                                        'latest'] },
      { jsonrpc:'2.0', id:i*4+2, method:'eth_call', params:[{to:addr,   data:SEL.imageUri},                                                      'latest'] },
      { jsonrpc:'2.0', id:i*4+3, method:'eth_call', params:[{to:factory, data:SEL.tokenStates + '000000000000000000000000' + addr.slice(2)}, 'latest'] },
    ])

    const raw = await rpc(calls)
    const map = new Map(raw.map(r => [r.id, r.result ?? '0x']))

    for (let i = 0; i < chunk.length; i++) {
      const addr      = chunk[i]
      const nameHex   = map.get(i * 4)     ?? '0x'
      const symHex    = map.get(i * 4 + 1) ?? '0x'
      const logoHex   = map.get(i * 4 + 2) ?? '0x'
      const stateHex  = map.get(i * 4 + 3) ?? '0x'

      const name   = decStr(nameHex)   || addr.slice(0, 8)
      const symbol = decStr(symHex)    || '???'
      const logoRaw= decStr(logoHex)
      const logoUrl= logoRaw.startsWith('ipfs://')
        ? `https://gateway.pinata.cloud/ipfs/${logoRaw.slice(7)}`
        : logoRaw

      // tokenStates struct layout (V2/V3):
      // slot 0: creator address (32 bytes)
      // slot 1: virtualUsdcReserves (32 bytes)
      // slot 2: virtualTokenReserves (32 bytes)
      // slot 3: realUsdcRaised (32 bytes)
      // slot 4: realTokensSold (32 bytes)
      // slot 5: graduated bool (32 bytes)
      const st       = (stateHex ?? '').replace('0x', '')
      const raised   = st.length >= 256 ? parseInt(st.slice(192, 256), 16) / 1e6 : 0
      const graduated= st.length >= 384 ? parseInt(st.slice(352, 384), 16) === 1  : false

      results.push({ address: addr, factory: factory.toLowerCase(), label, name, symbol, logoUrl, raisedUsdc: raised, graduated })
    }
  }
  return results
}

interface TokenInfo {
  address:    string
  factory:    string
  label:      string
  name:       string
  symbol:     string
  logoUrl:    string
  raisedUsdc: number
  graduated:  boolean
}

// ── Main handler ─────────────────────────────────────────────────────────────
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  // 1. Read factory list from KV
  let factories: Array<{ address: string; label: string; version: number }> = []
  try {
    const raw = await env.CONFIG?.get('FACTORY_ADDRESSES')
    if (raw) factories = JSON.parse(raw)
  } catch {}

  if (!factories.length) {
    const single = await env.CONFIG?.get('FACTORY_ADDRESS').catch(() => null)
    if (single) factories = [{ address: single, label: 'V1', version: 1 }]
  }

  if (!factories.length) {
    return new Response(JSON.stringify({ tokens: [], factories: 0 }), { headers: CORS })
  }

  // 2. Try D1 fast-path (tokens already indexed)
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT address, name, symbol, logo_url, factory_address, raised_usdc, graduated
         FROM   arc_tokens
         WHERE  factory_address != ''
         ORDER  BY rowid DESC
         LIMIT  2000`
      ).all()

      if ((results ?? []).length > 0) {
        const tokens = (results ?? []).map((r: any) => {
          const entry = factories.find(f => f.address.toLowerCase() === r.factory_address?.toLowerCase())
          return {
            address:    r.address,
            factory:    r.factory_address ?? '',
            label:      entry?.label ?? 'V?',
            name:       r.name,
            symbol:     r.symbol,
            logoUrl:    r.logo_url ?? '',
            raisedUsdc: r.raised_usdc ?? 0,
            graduated:  r.graduated === 1,
          }
        })
        // Kick off background re-sync
        // (no waitUntil here — this is a simple function)
        return new Response(
          JSON.stringify({ tokens, factories: factories.length, source: 'd1' }),
          { headers: CORS }
        )
      }
    } catch (e) { console.error('[D1]', e) }
  }

  // 3. RPC fallback — query every factory
  const all: TokenInfo[] = []
  const seen = new Set<string>()

  for (const f of factories) {
    try {
      const addrs = await getTokenAddresses(f.address)
      const meta  = await readMetadata(f.address, addrs, f.label)
      for (const t of meta) {
        if (!seen.has(t.address)) { seen.add(t.address); all.push(t) }
      }
    } catch (e) { console.error(`[factory ${f.address}]`, e) }
  }

  // 4. Cache to D1
  if (env.DB && all.length) {
    const now = Math.floor(Date.now() / 1000)
    try {
      await env.DB.batch(all.map(t =>
        env.DB.prepare(`
          INSERT OR REPLACE INTO arc_tokens
            (address,name,symbol,logo_url,factory_address,raised_usdc,graduated,updated_at,
             pair_address,price_usd,liq_usd,vol_usd,mcap_usd,age_sec,
             buys_24h,sells_24h,txns_5m,vol_5m,dex_id,change_5m,change_1h,change_6h,change_24h)
          VALUES(?,?,?,?,?,?,?,?,  '',0,0,0,0,0,0,0,0,0,'',null,null,null,null)
        `).bind(t.address, t.name, t.symbol, t.logoUrl,
                t.factory, t.raisedUsdc, t.graduated ? 1 : 0, now)
      ))
    } catch (e) { console.error('[D1 write]', e) }
  }

  return new Response(
    JSON.stringify({ tokens: all, factories: factories.length, source: 'rpc' }),
    { headers: CORS }
  )
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })

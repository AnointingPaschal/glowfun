/**
 * Token banners are stored off-chain (the token contract has no banner field) and writes are signed
 * by the token creator. The message format MUST match functions/api/banner/[address].ts.
 */
export const bannerMessage = (token: string, uri: string, ts: number) =>
  `GlowFun banner\ntoken: ${token.toLowerCase()}\nbanner: ${uri}\ntimestamp: ${ts}`

type SignFn = (args: { message: string }) => Promise<`0x${string}`>

export async function saveBanner(token: string, bannerUri: string, sign: SignFn): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await sign({ message: bannerMessage(token, bannerUri, timestamp) })
  const r = await fetch(`/api/banner/${token.toLowerCase()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bannerUri, timestamp, signature }),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { error?: string }
    throw new Error(j.error ?? `HTTP ${r.status}`)
  }
}

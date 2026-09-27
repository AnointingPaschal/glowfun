/**
 * Referrals: buyTokens(token, minOut, referrer) pays the referrer a share of the protocol fee.
 * A visitor arriving on any page with ?ref=0x… is remembered (localStorage) and that address is passed
 * as the referrer on their buys (never their own address).
 */
const KEY = 'gf_ref'
const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`
const ADDR = /^0x[0-9a-fA-F]{40}$/

export function captureReferral() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && ADDR.test(ref)) localStorage.setItem(KEY, ref.toLowerCase())
  } catch { /* private mode etc: referrals are best-effort */ }
}

export function getReferrer(buyer?: string): `0x${string}` {
  try {
    const r = localStorage.getItem(KEY)
    if (r && ADDR.test(r) && r !== buyer?.toLowerCase()) return r as `0x${string}`
  } catch {}
  return ZERO
}

export const referralLink = (address: string) => `${window.location.origin}/?ref=${address}`

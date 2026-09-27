import {
  Flame, PlusCircle, Hourglass, Lock, Coins, Droplets, ShieldAlert, PenLine, Gift,
} from 'lucide-react'

/**
 * Single source of truth for the tool sub-pages: used by the /tools hub grid,
 * the mobile "Tools" pop-up menu, and anywhere else that needs to list them.
 */
export interface ToolLink {
  slug: string          // path segment under /tools/
  label: string
  short: string         // one-line description
  icon: any
  tone: string
  /** Whether this tool needs a specific token selected (all but Referral). */
  perToken: boolean
}

export const TOOL_LINKS: ToolLink[] = [
  { slug: 'burn',      label: 'Token burner',      short: 'Destroy tokens to reduce supply',        icon: Flame,       tone: '#ef4444', perToken: true },
  { slug: 'mint',      label: 'Minter',            short: 'Mint new tokens up to the hard cap',      icon: PlusCircle,  tone: '#6366f1', perToken: true },
  { slug: 'vesting',   label: 'Vesting',           short: 'Release tokens on their unlock schedule', icon: Hourglass,   tone: '#f59e0b', perToken: true },
  { slug: 'lock',      label: 'Creator lock',      short: 'Unlock your allocation once it matures',  icon: Lock,        tone: '#22c55e', perToken: true },
  { slug: 'liquidity', label: 'Liquidity lock',    short: 'View, claim or permanently lock the LP',  icon: Droplets,    tone: '#0ea5e9', perToken: true },
  { slug: 'payouts',   label: 'Creator payouts',   short: 'Claim your graduation bonus in USDC',     icon: Coins,       tone: '#22c55e', perToken: true },
  { slug: 'security',  label: 'Security & multisig', short: 'Pause, blacklist and multisig guidance', icon: ShieldAlert, tone: '#f59e0b', perToken: true },
  { slug: 'metadata',  label: 'Edit token details', short: 'Update logo, description and socials',    icon: PenLine,     tone: '#818cf8', perToken: true },
  { slug: 'referral',  label: 'Referral program',  short: 'Your link, earnings and claiming',         icon: Gift,        tone: '#ec4899', perToken: false },
]

export const toolPath = (slug: string, token?: string) => `/tools/${slug}${token ? `?token=${token}` : ''}`

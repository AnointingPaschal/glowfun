/**
 * useFactoryConfig
 * Reads all admin-configurable values live from GlowFunFactory_V2.
 * Any admin change via updateConfig() is instantly reflected in the UI.
 */
import { useReadContracts } from 'wagmi'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'

export interface FactoryConfig {
  /** Launch fee in USDC (6 dec).  e.g. 10_000_000n = $10 */
  creationFee:             bigint
  /** Global graduation threshold in USDC (6 dec). e.g. 69_000_000_000n = $69K */
  graduationThreshold:     bigint
  /** Protocol fee in BPS. 100 = 1% */
  protocolFeeBps:          bigint
  /** Creator graduation bonus in BPS. 500 = 5% */
  creatorGraduationFeeBps: bigint
  /** Referral fee in BPS. 250 = 2.5% */
  referralFeeBps:          bigint
  /** Anti-snipe window in seconds */
  antiSnipeDuration:       bigint
  /** Anti-snipe tax in BPS */
  antiSnipeTaxBps:         bigint
  /** Max single-buy as BPS of curve supply. 0 = no limit */
  maxBuyBps:               bigint
  /** Cooldown between buys per wallet in seconds */
  buyCooldown:             bigint
  /** Creator token lock duration in seconds */
  creatorLockDuration:     bigint
  /** Per-token graduation fee in BPS */
  perTokenGraduationFeeBps:bigint
  /** True while the data is loading */
  isLoading: boolean

  /* Convenience computed values */
  /** Creation fee in USD number */
  creationFeeUsd:        number
  /** Graduation threshold in USD number */
  graduationThresholdUsd:number
  /** Protocol fee as percentage (e.g. 1.0) */
  protocolFeePct:        number
  /** Referral fee as percentage */
  referralFeePct:        number
  /** Creator graduation bonus as percentage */
  creatorGradPct:        number
  /** Anti-snipe tax as percentage */
  antiSnipePct:          number
}

const DEFAULTS: FactoryConfig = {
  creationFee:              10_000_000n,
  graduationThreshold:      69_000_000_000n,
  protocolFeeBps:           100n,
  creatorGraduationFeeBps:  500n,
  referralFeeBps:           250n,
  antiSnipeDuration:        60n,
  antiSnipeTaxBps:          500n,
  maxBuyBps:                0n,
  buyCooldown:              0n,
  creatorLockDuration:      0n,
  perTokenGraduationFeeBps: 100n,
  isLoading:                true,
  creationFeeUsd:           10,
  graduationThresholdUsd:   69_000,
  protocolFeePct:           1,
  referralFeePct:           2.5,
  creatorGradPct:           5,
  antiSnipePct:             5,
}

const FIELDS = [
  'creationFee', 'graduationThreshold', 'protocolFeeBps',
  'creatorGraduationFeeBps', 'referralFeeBps', 'antiSnipeDuration',
  'antiSnipeTaxBps', 'maxBuyBps', 'buyCooldown',
  'creatorLockDuration', 'perTokenGraduationFeeBps',
] as const

export function useFactoryConfig(): FactoryConfig {
  const { FACTORY_ADDRESS, CHAIN_ID } = useConfig()

  const { data, isLoading } = useReadContracts({
    contracts: FIELDS.map(fn => ({
      address: FACTORY_ADDRESS as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: fn,
      chainId: CHAIN_ID as number,
    })),
    query: { enabled: !!FACTORY_ADDRESS, staleTime: 60_000 },
  })

  if (!data || isLoading) return { ...DEFAULTS, isLoading }

  const get = (i: number): bigint => {
    const r = data[i]?.result
    return typeof r === 'bigint' ? r : DEFAULTS[FIELDS[i] as keyof typeof DEFAULTS] as bigint
  }

  const creationFee              = get(0)
  const graduationThreshold      = get(1)
  const protocolFeeBps           = get(2)
  const creatorGraduationFeeBps  = get(3)
  const referralFeeBps           = get(4)
  const antiSnipeDuration        = get(5)
  const antiSnipeTaxBps          = get(6)
  const maxBuyBps                = get(7)
  const buyCooldown              = get(8)
  const creatorLockDuration      = get(9)
  const perTokenGraduationFeeBps = get(10)

  return {
    creationFee, graduationThreshold, protocolFeeBps,
    creatorGraduationFeeBps, referralFeeBps, antiSnipeDuration,
    antiSnipeTaxBps, maxBuyBps, buyCooldown,
    creatorLockDuration, perTokenGraduationFeeBps,
    isLoading: false,
    creationFeeUsd:           Number(creationFee) / 1e6,
    graduationThresholdUsd:   Number(graduationThreshold) / 1e6,
    protocolFeePct:           Number(protocolFeeBps) / 100,
    referralFeePct:           Number(referralFeeBps) / 100,
    creatorGradPct:           Number(creatorGraduationFeeBps) / 100,
    antiSnipePct:             Number(antiSnipeTaxBps) / 100,
  }
}

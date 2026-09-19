/**
 * ConfigContext — fetches all runtime config from /api/config (Cloudflare KV)
 * and exposes it app-wide. No VITE_ build-time env vars needed for runtime config.
 *
 * Also writes values into the configStore so that legacy hook code that
 * cannot easily call useConfig() (inner functions, non-component hooks) can
 * still read the latest values via getConfig().
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

// ── Defaults (fallback if KV is empty) ───────────────────────────────────────
const ARC_MAINNET_CHAIN_ID = 5042
const ARC_USDC             = '0x3600000000000000000000000000000000000000' as `0x${string}`
const ARC_EXPLORER         = 'https://explorer.arc.io'

export interface AppConfig {
  FACTORY_ADDRESS:         `0x${string}`
  USDC_ADDRESS:            `0x${string}`
  CHAIN_ID:                number
  EXPLORER_BASE:           string
  WALLETCONNECT_PROJECT_ID: string
  CIRCLE_APP_ID:           string
  R2_PUBLIC_URL:           string
  SITE_TITLE:              string
  SITE_LOGO:               string
  SITE_DESCRIPTION:        string
  TWITTER_HANDLE:          string
  ADMIN_SECRET:            string
  loaded:                  boolean
}

const DEFAULT_CONFIG: AppConfig = {
  FACTORY_ADDRESS:          (import.meta.env.VITE_FACTORY_ADDRESS ?? '') as `0x${string}`,
  USDC_ADDRESS:             (import.meta.env.VITE_USDC_ADDRESS    ?? ARC_USDC) as `0x${string}`,
  CHAIN_ID:                 Number(import.meta.env.VITE_CHAIN_ID  ?? ARC_MAINNET_CHAIN_ID),
  EXPLORER_BASE:            ARC_EXPLORER,
  WALLETCONNECT_PROJECT_ID: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  CIRCLE_APP_ID:            import.meta.env.VITE_CIRCLE_APP_ID ?? '',
  R2_PUBLIC_URL:            '',
  SITE_TITLE:               'GlowFun',
  SITE_LOGO:                '',
  SITE_DESCRIPTION:         'Launch and trade meme tokens on Arc',
  TWITTER_HANDLE:           '',
  ADMIN_SECRET:             '',
  loaded:                   false,
}

// ── Module-level store so non-React code can read the latest values ───────────
let _store: AppConfig = { ...DEFAULT_CONFIG }

export function getConfig(): AppConfig { return _store }

// ── Context ───────────────────────────────────────────────────────────────────
const ConfigCtx = createContext<AppConfig>(DEFAULT_CONFIG)

export function useConfig() { return useContext(ConfigCtx) }

// ── Provider ──────────────────────────────────────────────────────────────────
export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/config')
      if (!res.ok) return
      const data = await res.json() as Record<string, string>

      setCfg(prev => {
        const next: AppConfig = {
          ...prev,
          FACTORY_ADDRESS:          (data['FACTORY_ADDRESS']          || prev.FACTORY_ADDRESS)  as `0x${string}`,
          USDC_ADDRESS:             (data['USDC_ADDRESS']             || prev.USDC_ADDRESS)     as `0x${string}`,
          CHAIN_ID:                 data['CHAIN_ID'] ? Number(data['CHAIN_ID']) : prev.CHAIN_ID,
          WALLETCONNECT_PROJECT_ID: data['WALLETCONNECT_PROJECT_ID']  || prev.WALLETCONNECT_PROJECT_ID,
          CIRCLE_APP_ID:            data['CIRCLE_APP_ID']             || prev.CIRCLE_APP_ID,
          R2_PUBLIC_URL:            data['R2_PUBLIC_URL']             || prev.R2_PUBLIC_URL,
          SITE_TITLE:               data['SITE_TITLE']                || prev.SITE_TITLE,
          SITE_LOGO:                data['SITE_LOGO']                 || prev.SITE_LOGO,
          SITE_DESCRIPTION:         data['SITE_DESCRIPTION']          || prev.SITE_DESCRIPTION,
          TWITTER_HANDLE:           data['TWITTER_HANDLE']            || prev.TWITTER_HANDLE,
          ADMIN_SECRET:             data['ADMIN_SECRET']              || prev.ADMIN_SECRET,
          EXPLORER_BASE:            ARC_EXPLORER,
          loaded:                   true,
        }
        _store = next
        return next
      })
    } catch {
      setCfg(prev => { _store = { ...prev, loaded: true }; return { ...prev, loaded: true } })
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Update document title from KV
  useEffect(() => {
    if (cfg.SITE_TITLE) document.title = cfg.SITE_TITLE
  }, [cfg.SITE_TITLE])

  return (
    <ConfigCtx.Provider value={cfg}>
      {children}
    </ConfigCtx.Provider>
  )
}

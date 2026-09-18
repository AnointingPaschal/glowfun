import { useState, useEffect, useRef } from 'react'
import type { WalletCredentials, CircleWallet } from '@/types'

const APP_ID = import.meta.env.VITE_CIRCLE_APP_ID ?? ''

export function useCircleWallet() {
  const sdkRef = useRef<any>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [credentials, setCredentials] = useState<WalletCredentials | null>(null)
  const [wallets, setWallets] = useState<CircleWallet[]>([])
  const [selectedWallet, setSelectedWallet] = useState<CircleWallet | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!APP_ID || APP_ID === 'YOUR_CIRCLE_APP_ID') { setSdkReady(false); return }

    const init = async () => {
      try {
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
        sdkRef.current = sdk
        const stored = localStorage.getItem('gf_deviceId')
        if (!stored) {
          const id = await sdk.getDeviceId()
          localStorage.setItem('gf_deviceId', id)
        } else {
          await sdk.getDeviceId()
        }
        const ut = localStorage.getItem('gf_userToken')
        const ek = localStorage.getItem('gf_encKey')
        if (ut && ek) setCredentials({ userToken: ut, encryptionKey: ek })
        setSdkReady(true)
      } catch (e) {
        console.error('Circle SDK init error', e)
        setSdkReady(false)
      }
    }
    void init()
  }, [])

  const createUser = async (userId: string) => {
    setIsLoading(true); setStatus('Creating user...')
    try {
      const res = await fetch('/api/wallet/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      const data = await res.json()
      if (data.code === 155106) { setStatus('User already exists. Sign in to continue.') }
      else if (data.error) { setStatus(`Error: ${data.error}`) }
      else { setStatus('User created. Sign in to get started.') }
    } catch { setStatus('Network error') }
    setIsLoading(false)
  }

  const getToken = async (userId: string) => {
    setIsLoading(true); setStatus('Signing in...')
    try {
      const res = await fetch('/api/wallet/get-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
      const data = await res.json()
      if (data.userToken) {
        const creds = { userToken: data.userToken, encryptionKey: data.encryptionKey }
        setCredentials(creds)
        localStorage.setItem('gf_userToken', creds.userToken)
        localStorage.setItem('gf_encKey', creds.encryptionKey)
        setStatus('Signed in successfully!')
        await fetchWallets(creds.userToken)
      } else {
        setStatus(`Error: ${data.error ?? 'Failed to get token'}`)
      }
    } catch { setStatus('Network error') }
    setIsLoading(false)
  }

  const fetchWallets = async (userToken: string) => {
    try {
      const res = await fetch('/api/wallet/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken }) })
      const data = await res.json()
      if (data.wallets?.length) {
        setWallets(data.wallets)
        setSelectedWallet(data.wallets[0])
      }
    } catch {}
  }

  const initializeWallet = async () => {
    if (!credentials || !sdkRef.current) return
    setIsLoading(true); setStatus('Initializing wallet...')
    try {
      const res = await fetch('/api/wallet/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userToken: credentials.userToken }) })
      const data = await res.json()
      if (data.code === 155106) {
        await fetchWallets(credentials.userToken)
        setStatus('Wallet loaded.')
      } else if (data.challengeId) {
        setStatus('Complete PIN setup in the popup...')
        const sdk = sdkRef.current
        sdk.setAuthentication({ userToken: credentials.userToken, encryptionKey: credentials.encryptionKey })
        sdk.execute(data.challengeId, async (error: any, result: any) => {
          if (error) { setStatus(`Failed: ${error.message ?? 'Unknown error'}`); setIsLoading(false); return }
          await fetchWallets(credentials.userToken)
          setStatus('Wallet created successfully!')
          setIsLoading(false)
        })
        return
      } else {
        setStatus(`Error: ${data.error ?? 'Unknown'}`)
      }
    } catch { setStatus('Network error') }
    setIsLoading(false)
  }

  const disconnect = () => {
    setCredentials(null); setWallets([]); setSelectedWallet(null); setStatus('')
    localStorage.removeItem('gf_userToken'); localStorage.removeItem('gf_encKey')
  }

  return { credentials, wallets, selectedWallet, isLoading, status, sdkReady, createUser, getToken, initializeWallet, disconnect }
}

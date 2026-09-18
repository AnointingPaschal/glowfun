import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? ''

let circleClient: any = null

async function getCircleClient() {
  if (!CIRCLE_API_KEY) return null
  if (!circleClient) {
    try {
      const { initiateUserControlledWalletsClient, Blockchain } = await import('@circle-fin/user-controlled-wallets')
      circleClient = { client: initiateUserControlledWalletsClient({ apiKey: CIRCLE_API_KEY }), Blockchain }
    } catch (e) {
      console.error('Circle SDK init error:', e)
      return null
    }
  }
  return circleClient
}

// Health
app.get('/health', (_req, res) => res.json({ ok: true }))

// Create user
app.post('/wallet/create-user', async (req, res) => {
  const { userId } = req.body
  if (!userId || userId.length < 5) { res.status(400).json({ error: 'userId must be at least 5 chars' }); return }
  const cc = await getCircleClient()
  if (!cc) { res.status(503).json({ error: 'Circle API not configured. Set CIRCLE_API_KEY.' }); return }
  try {
    const response = await cc.client.createUser({ userId })
    res.json(response.data ?? { ok: true })
  } catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 155106) { res.json({ code: 155106, message: 'User already exists' }); return }
    res.status(400).json({ error: e?.response?.data?.message ?? e?.message ?? 'Unknown error', code })
  }
})

// Get user token
app.post('/wallet/get-token', async (req, res) => {
  const { userId } = req.body
  if (!userId) { res.status(400).json({ error: 'userId required' }); return }
  const cc = await getCircleClient()
  if (!cc) { res.status(503).json({ error: 'Circle API not configured' }); return }
  try {
    const response = await cc.client.createUserToken({ userId })
    res.json(response.data)
  } catch (e: any) {
    res.status(400).json({ error: e?.response?.data?.message ?? e?.message ?? 'Unknown error' })
  }
})

// Initialize wallet
app.post('/wallet/initialize', async (req, res) => {
  const { userToken } = req.body
  if (!userToken) { res.status(400).json({ error: 'userToken required' }); return }
  const cc = await getCircleClient()
  if (!cc) { res.status(503).json({ error: 'Circle API not configured' }); return }
  try {
    const response = await cc.client.createUserPinWithWallets({
      userToken,
      blockchains: ['ARC-MAINNET'],
      accountType: 'EOA',
    })
    res.json(response.data)
  } catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 155106) { res.json({ code: 155106, message: 'User already has wallets' }); return }
    res.status(400).json({ error: e?.response?.data?.message ?? e?.message ?? 'Unknown error', code })
  }
})

// List wallets
app.post('/wallet/list', async (req, res) => {
  const { userToken } = req.body
  if (!userToken) { res.status(400).json({ error: 'userToken required' }); return }
  const cc = await getCircleClient()
  if (!cc) { res.status(503).json({ error: 'Circle API not configured' }); return }
  try {
    const response = await cc.client.listWallets({ userToken })
    res.json({ wallets: response.data?.wallets ?? [] })
  } catch (e: any) {
    res.status(400).json({ error: e?.response?.data?.message ?? e?.message ?? 'Unknown error' })
  }
})

const PORT = 3001
app.listen(PORT, () => console.log(`GlowFun backend running on :${PORT}`))

#!/usr/bin/env node
// GlowFun factory security monitor — polls for the same "an admin key did something"
// events the in-app Security Center's activity log shows (src/hooks/useSecurityActivity.ts),
// and pushes an alert to Discord/Telegram the moment one appears. Designed to run on a
// schedule with nothing but a plain Node runtime + `viem` — no server, no database.
//
// State (the last block already scanned) is kept in a small JSON file so re-runs don't
// re-alert the same event. See .github/workflows/security-monitor.yml for how this repo
// runs it: every 10 minutes, on GitHub's own infra, committing the state file back with
// [skip ci] so it doesn't loop. You can just as easily run this from any cron (a VPS,
// a Cloudflare Worker cron trigger, your laptop) — it only needs the env vars below.
//
// Required env:
//   RPC_URL            - an Arc Mainnet RPC endpoint
//   FACTORY_ADDRESS     - the GlowFunFactory_V3 address to watch
// At least one of:
//   DISCORD_WEBHOOK_URL
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
// Optional:
//   STATE_FILE          - path to the JSON file tracking the last scanned block (default: ./.security-monitor-state.json)
//   LOOKBACK_BLOCKS      - how far back to scan on the very first run (default: 50000)
//   CHUNK_BLOCKS         - max block range per eth_getLogs call (default: 5000 — many RPCs cap this)

import { createPublicClient, http, parseAbiItem } from 'viem'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const RPC_URL = process.env.RPC_URL
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS
const STATE_FILE = process.env.STATE_FILE ?? './.security-monitor-state.json'
const LOOKBACK_BLOCKS = BigInt(process.env.LOOKBACK_BLOCKS ?? '50000')
const CHUNK_BLOCKS = BigInt(process.env.CHUNK_BLOCKS ?? '5000')

if (!RPC_URL || !FACTORY_ADDRESS) {
  console.error('RPC_URL and FACTORY_ADDRESS are required.')
  process.exit(1)
}
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
if (!DISCORD_WEBHOOK_URL && !(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)) {
  console.error('Set DISCORD_WEBHOOK_URL and/or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID so alerts have somewhere to go.')
  process.exit(1)
}

// Mirrors src/hooks/useSecurityActivity.ts's SECURITY_EVENT_NAMES — keep these in sync.
const EVENTS = [
  { name: 'OwnershipTransferred', abi: parseAbiItem('event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)'),
    describe: (a) => `Factory ownership moved from ${short(a.previousOwner)} to ${short(a.newOwner)}`, severity: 'critical' },
  { name: 'CreatorTransferred', abi: parseAbiItem('event CreatorTransferred(address indexed token, address indexed oldCreator, address indexed newCreator)'),
    describe: (a) => `Creator role for ${short(a.token)} moved from ${short(a.oldCreator)} to ${short(a.newCreator)}`, severity: 'warning' },
  { name: 'EmergencyWithdraw', abi: parseAbiItem('event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount)'),
    describe: (a) => `Emergency withdrawal: ${a.amount} of ${short(a.token)} sent to ${short(a.to)}`, severity: 'critical' },
  { name: 'Paused', abi: parseAbiItem('event Paused(address account)'),
    describe: (a) => `Platform paused by ${short(a.account)}`, severity: 'critical' },
  { name: 'Unpaused', abi: parseAbiItem('event Unpaused(address account)'),
    describe: (a) => `Platform resumed by ${short(a.account)}`, severity: 'info' },
  { name: 'TokenBlacklisted', abi: parseAbiItem('event TokenBlacklisted(address indexed token, bool blacklisted)'),
    describe: (a) => `Platform-level blacklist on ${short(a.token)} set to ${a.blacklisted}`, severity: 'warning' },
  { name: 'WalletBlacklisted', abi: parseAbiItem('event WalletBlacklisted(address indexed wallet, bool blacklisted)'),
    describe: (a) => `Platform-level blacklist on wallet ${short(a.wallet)} set to ${a.blacklisted}`, severity: 'warning' },
  { name: 'FeeRecipientProposed', abi: parseAbiItem('event FeeRecipientProposed(address indexed proposed)'),
    describe: (a) => `New fee recipient proposed: ${short(a.proposed)}`, severity: 'warning' },
  { name: 'FeeRecipientUpdated', abi: parseAbiItem('event FeeRecipientUpdated(address indexed newRecipient)'),
    describe: (a) => `Fee recipient updated to ${short(a.newRecipient)}`, severity: 'warning' },
  { name: 'GraduationRecipientProposed', abi: parseAbiItem('event GraduationRecipientProposed(address indexed proposed)'),
    describe: (a) => `New graduation recipient proposed: ${short(a.proposed)}`, severity: 'warning' },
  { name: 'GraduationRecipientUpdated', abi: parseAbiItem('event GraduationRecipientUpdated(address indexed newRecipient)'),
    describe: (a) => `Graduation recipient updated to ${short(a.newRecipient)}`, severity: 'warning' },
]

function short(a) { return typeof a === 'string' ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a) }

function loadState() {
  if (!existsSync(STATE_FILE)) return { lastBlock: null }
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return { lastBlock: null } }
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
}

async function sendAlert(text) {
  const jobs = []
  if (DISCORD_WEBHOOK_URL) {
    jobs.push(fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).catch((e) => console.error('Discord alert failed:', e.message)))
  }
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch((e) => console.error('Telegram alert failed:', e.message)))
  }
  await Promise.all(jobs)
}

const SEVERITY_EMOJI = { critical: '🚨', warning: '⚠️', info: 'ℹ️' }

async function main() {
  const client = createPublicClient({ transport: http(RPC_URL) })
  const state = loadState()
  const latest = await client.getBlockNumber()
  const fromBlock = state.lastBlock != null ? BigInt(state.lastBlock) + 1n : (latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n)

  if (fromBlock > latest) {
    console.log('Nothing new to scan.')
    return
  }

  const found = []
  for (let start = fromBlock; start <= latest; start += CHUNK_BLOCKS) {
    const end = start + CHUNK_BLOCKS - 1n > latest ? latest : start + CHUNK_BLOCKS - 1n
    for (const evt of EVENTS) {
      try {
        const logs = await client.getLogs({ address: FACTORY_ADDRESS, event: evt.abi, fromBlock: start, toBlock: end })
        for (const log of logs) found.push({ evt, log })
      } catch (e) {
        console.error(`getLogs(${evt.name}, ${start}-${end}) failed:`, e.shortMessage ?? e.message)
        // Don't advance the state past a range we couldn't actually scan.
        saveState({ lastBlock: (start - 1n).toString() })
        process.exit(1)
      }
    }
  }

  found.sort((a, b) => Number(a.log.blockNumber - b.log.blockNumber))
  console.log(`Scanned blocks ${fromBlock}-${latest}: found ${found.length} security event(s).`)

  for (const { evt, log } of found) {
    const emoji = SEVERITY_EMOJI[evt.severity] ?? '•'
    const text = `${emoji} GlowFun factory — ${evt.describe(log.args)}\nBlock ${log.blockNumber} · tx ${log.transactionHash}`
    console.log(text)
    await sendAlert(text)
  }

  saveState({ lastBlock: latest.toString() })
}

main().catch((e) => { console.error(e); process.exit(1) })

import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Zap, Code2, Globe, BookOpen } from 'lucide-react'

const BASE = typeof window !== 'undefined' ? window.location.origin : ''

interface Endpoint {
  method: 'GET' | 'POST'
  path: string
  desc: string
  params?: { name: string; in: 'query' | 'path'; required: boolean; desc: string; example: string }[]
  example: string
  response: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET', path: '/api/v1/config',
    desc: 'Returns all platform configuration: fees, thresholds, contract address, king of the hill.',
    example: '/api/v1/config',
    response: `{
  "success": true,
  "data": {
    "factoryAddress": "0x96f4...",
    "graduationThresholdUsdc": 69000,
    "protocolFeeBps": 100,
    "creationFeeUsdc": 10,
    "creatorGraduationFeeBps": 500,
    "referralFeeBps": 2500,
    "antiSnipeDuration": 60,
    "antiSnipeTaxBps": 500,
    "maxBuyBps": 500,
    "buyCooldown": 30,
    "chainId": 5042
  }
}`,
  },
  {
    method: 'GET', path: '/api/v1/stats',
    desc: 'Platform-level stats: total tokens launched, network info.',
    example: '/api/v1/stats',
    response: `{
  "success": true,
  "data": { "totalTokens": 42, "network": "Arc Mainnet", "chainId": 5042 }
}`,
  },
  {
    method: 'GET', path: '/api/v1/king',
    desc: 'Returns the current King of the Hill — the token with the most USDC raised.',
    example: '/api/v1/king',
    response: `{
  "success": true,
  "data": { "king": "0x8C99...", "raisedUsdc": "1250.00" }
}`,
  },
  {
    method: 'GET', path: '/api/v1/tokens',
    desc: 'Paginated list of all launched token addresses.',
    params: [
      { name: 'page',  in: 'query', required: false, desc: 'Page number (default 1)',          example: '1'  },
      { name: 'limit', in: 'query', required: false, desc: 'Results per page (max 100, default 20)', example: '20' },
    ],
    example: '/api/v1/tokens?page=1&limit=20',
    response: `{
  "success": true,
  "data": {
    "tokens": ["0xabc...", "0xdef..."],
    "pagination": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
  }
}`,
  },
  {
    method: 'GET', path: '/api/v1/trending',
    desc: 'Top 50 token addresses by recency (most recently launched first).',
    example: '/api/v1/trending',
    response: `{
  "success": true,
  "data": { "tokens": ["0xabc...", "0xdef..."], "count": 42 }
}`,
  },
  {
    method: 'GET', path: '/api/v1/tokens/:address',
    desc: 'Full on-chain state for a single token: price, market cap, graduation progress, reserves.',
    params: [
      { name: 'address', in: 'path', required: true, desc: 'Token contract address (0x...)', example: '0x8C99...daB8' },
    ],
    example: '/api/v1/tokens/0x8C991d3aDF0B6d5673217Bdf42eb2fbbD5B4daB8',
    response: `{
  "success": true,
  "data": {
    "address": "0x8C99...daB8",
    "creator": "0xCca9...",
    "graduated": false,
    "totalSupply": "1000000000",
    "realUsdcRaised": "1.000855",
    "priceRaw": "29855633912937",
    "marketCapUsdc": "29.855633",
    "progressPercent": "0.0014"
  }
}`,
  },
  {
    method: 'GET', path: '/api/v1/tokens/:address/price',
    desc: 'Fast price-only endpoint for polling. Returns current price, market cap, and graduation progress.',
    params: [
      { name: 'address', in: 'path', required: true, desc: 'Token contract address', example: '0x8C99...daB8' },
    ],
    example: '/api/v1/tokens/0x8C991d3aDF0B6d5673217Bdf42eb2fbbD5B4daB8/price',
    response: `{
  "success": true,
  "data": {
    "priceRaw": "29855633912937",
    "marketCapUsdc": "29.855633",
    "progressPercent": "0.0014",
    "timestamp": 1726651200000
  }
}`,
  },
  {
    method: 'GET', path: '/api/v1/tokens/:address/buy-quote',
    desc: 'Get expected token output for a given USDC input. Use for sniper bots and trade calculators.',
    params: [
      { name: 'address', in: 'path',  required: true,  desc: 'Token address',                        example: '0x8C99...' },
      { name: 'usdc',    in: 'query', required: true,  desc: 'USDC amount in 6-decimal wei (e.g. 1000000 = $1.00)', example: '1000000' },
    ],
    example: '/api/v1/tokens/0x8C991d3aDF0B6d5673217Bdf42eb2fbbD5B4daB8/buy-quote?usdc=1000000',
    response: `{
  "success": true,
  "data": {
    "usdcIn": "1000000",
    "usdcInUsdc": "1.000000",
    "tokensOut": "33455890120000000000000000",
    "tokensOutFormatted": "33455890.120000",
    "hint": "Apply your slippage tolerance and pass as minTokensOut to buyTokens()"
  }
}`,
  },
  {
    method: 'GET', path: '/api/v1/tokens/:address/sell-quote',
    desc: 'Get expected USDC output for a given token input.',
    params: [
      { name: 'address', in: 'path',  required: true, desc: 'Token address',                                    example: '0x8C99...' },
      { name: 'tokens',  in: 'query', required: true, desc: 'Token amount in 18-decimal wei (e.g. 1e18 = 1 token)', example: '1000000000000000000' },
    ],
    example: '/api/v1/tokens/0x8C991d3aDF0B6d5673217Bdf42eb2fbbD5B4daB8/sell-quote?tokens=1000000000000000000000000',
    response: `{
  "success": true,
  "data": {
    "tokensIn": "1000000000000000000000000",
    "tokensInFormatted": "1000000.000000",
    "usdcOut": "29799",
    "usdcOutUsdc": "0.029799",
    "hint": "Apply your slippage tolerance and pass as minUsdcOut to sellTokens()"
  }
}`,
  },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1.5 rounded transition-colors"
      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  )
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false)
  const fullUrl = BASE + ep.example

  return (
    <div
      className="rounded-xl mb-2 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span
          className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0"
          style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}
        >
          {ep.method}
        </span>
        <code className="text-sm text-purple-300 font-mono flex-1">{ep.path}</code>
        <span className="text-xs text-white/30 hidden sm:block flex-1">{ep.desc}</span>
        {open ? <ChevronDown size={14} className="text-white/30 flex-shrink-0" /> : <ChevronRight size={14} className="text-white/30 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <p className="text-xs text-white/50 pt-3">{ep.desc}</p>

          {ep.params && ep.params.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Parameters</p>
              <div className="space-y-1">
                {ep.params.map(p => (
                  <div key={p.name} className="flex items-start gap-3 text-xs">
                    <code className="text-purple-300 w-24 flex-shrink-0">{p.name}</code>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                      style={{ background: p.required ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)', color: p.required ? '#f87171' : '#6b7280' }}
                    >
                      {p.required ? 'required' : 'optional'}
                    </span>
                    <span className="text-white/40">{p.desc}</span>
                    <code className="text-white/30 ml-auto flex-shrink-0">{p.example}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Example</p>
              <CopyButton text={fullUrl} />
            </div>
            <div
              className="rounded-lg px-3 py-2 font-mono text-xs text-green-300 overflow-x-auto"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            >
              GET {fullUrl}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Response</p>
            <pre
              className="rounded-lg px-3 py-2 text-xs text-white/60 overflow-x-auto"
              style={{ background: 'rgba(0,0,0,0.4)', fontFamily: 'monospace' }}
            >
              {ep.response}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ApiPage() {
  const [copied, setCopied] = useState(false)
  const baseUrl = BASE + '/api/v1'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
            <Code2 size={12} className="text-white" />
          </div>
          <span className="text-xs text-white/30 uppercase tracking-widest font-semibold">Developer API</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk,sans-serif' }}>
          GlowFun API v1
        </h1>
        <p className="text-sm text-white/50">
          Public REST API for building snipers, bots, dashboards, and integrations on top of GlowFun.
          No API key required. All data is read directly from Arc Mainnet.
        </p>
      </div>

      {/* Base URL */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-purple-400" />
            <span className="text-xs font-semibold text-purple-300">Base URL</span>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(baseUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <code className="text-sm text-white font-mono">{baseUrl}</code>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Zap,      color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.15)',  title: 'No Auth Required',  desc: 'All GET endpoints are open. No API key needed.' },
          { icon: BookOpen, color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.15)',  title: 'CORS: Open',         desc: 'Call from any frontend, mobile app, or bot.' },
          { icon: Code2,    color: '#f472b6', bg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.15)', title: 'On-Chain Data',      desc: 'Reads live from Arc Mainnet via RPC.' },
        ].map(({ icon: Icon, color, bg, border, title, desc }) => (
          <div key={title} className="rounded-xl p-3" style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={13} style={{ color }} />
              <span className="text-xs font-semibold" style={{ color }}>{title}</span>
            </div>
            <p className="text-xs text-white/40">{desc}</p>
          </div>
        ))}
      </div>

      {/* Quick example */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Quick Start</p>
        <div
          className="rounded-xl p-4 font-mono text-xs overflow-x-auto"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-white/30 mb-1">{'// Fetch all tokens'}</div>
          <div className="text-green-300">{`const res = await fetch('${BASE}/api/v1/tokens')`}</div>
          <div className="text-white/60">{`const { data } = await res.json()`}</div>
          <div className="mt-2 text-white/30">{'// Get buy quote for $10 USDC'}</div>
          <div className="text-green-300">{`const q = await fetch('${BASE}/api/v1/tokens/0xTOKEN.../buy-quote?usdc=10000000')`}</div>
          <div className="text-white/60">{`// returns tokensOut (apply slippage, then call buyTokens on-chain)`}</div>
        </div>
      </div>

      {/* Contract interaction note */}
      <div
        className="rounded-xl p-4 text-xs text-white/50"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="font-semibold text-white/70 mb-1">On-chain writes (buy, sell, launch)</p>
        <p>Call the factory contract directly on Arc Mainnet (Chain ID 5042) using viem, ethers.js, or any EVM library. Use <code className="text-purple-300">/api/v1/config</code> to get the factory address and fee settings dynamically — never hardcode them.</p>
      </div>

      {/* Endpoints */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Endpoints</p>
        {ENDPOINTS.map(ep => <EndpointCard key={ep.path + ep.method} ep={ep} />)}
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  ArrowLeft, Twitter, Send, Globe, ExternalLink, Trophy,
  Loader2, AlertTriangle, Copy, Check, RefreshCw, Share2,
  Star, Zap, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Activity, BarChart3, MessageCircle, Info, Flame, Sprout, Pencil, Image,
} from 'lucide-react'
import { Comments } from '@/components/Comments'
import { TVChart } from '@/components/TVChart'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { useTokenData, useTokenBalance } from '@/hooks/useTokenData'
import { formatProgress, formatAddress, timeAgo, parseUsdc, parseTokens } from '@/utils/format'
import { parseOnchainError } from '@/utils/errors'

type TradeMode = 'buy'|'sell'
type TabId     = 'chart'|'info'|'comments'
const SLIP_OPTIONS = [0.5, 1, 3, 5]

/* ── Price helpers (fix the scientific notation bug) ─────────────── */
// Contract getTokenPrice returns (virtualUsdc * 1e30) / virtualTokenReserves
// where usdc has 6 decimals, token has 18 decimals
// USD price = contractRaw / 1e18
function calcPrice(token: any): number {
  if (!token) return 0
  // Prefer market price if available
  if (token.market?.priceUsd && token.market.priceUsd > 0) return token.market.priceUsd
  // Calculate from virtual reserves (most accurate for bonding curve)
  const vU = Number(token.state?.virtualUsdcReserves ?? 0n)  // USDC 6 dec
  const vT = Number(token.state?.virtualTokenReserves ?? 0n)  // token 18 dec
  if (!vU || !vT) return 0
  // price = (vU / 1e6) / (vT / 1e18) = vU * 1e12 / vT
  return vU * 1e12 / vT
}

function fmtPx(p: number): string {
  if (!p) return '$0'
  if (p >= 1_000_000) return `$${(p/1e6).toFixed(2)}M`
  if (p >= 1_000)     return `$${(p/1e3).toFixed(2)}K`
  if (p >= 0.01)      return `$${p.toFixed(p >= 1 ? 4 : 6)}`
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return `$0.0[${m[1].length}]${m[2]}`
  return `$${p.toFixed(8)}`
}

function PxDisplay({ p }: { p: number }) {
  if (!p) return <span>$0</span>
  if (p >= 0.01) return <span>${p >= 100 ? p.toLocaleString('en',{maximumFractionDigits:2}) : p.toFixed(p>=1?4:6)}</span>
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{fontSize:'0.6em'}}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
}

function fmtC(v: number) {
  if (!v) return '$0'
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}

/* ── DS enrichment ───────────────────────────────────────────────── */
interface DSPair { pairAddress:string; priceUsd:string; volume:{h24:number;h6:number;h1:number;m5:number}; priceChange:{h24:number;h6:number;h1:number;m5:number}; liquidity?:{usd:number}; fdv?:number; txns:{h24:{buys:number;sells:number}} }

async function fetchDS(address: string): Promise<DSPair|null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {signal:AbortSignal.timeout(6000)})
    if (!r.ok) return null
    const d = await r.json(); const pairs: DSPair[] = d.pairs??[]
    return pairs.find((p:any) => p.chainId==='arc') ?? pairs[0] ?? null
  } catch { return null }
}

async function fetchOHLCV(pool: string, tf: string): Promise<any[]> {
  const [res,agg] = tf==='5m'?['minute','5']:tf==='4h'?['hour','4']:tf==='1d'?['day','1']:['hour','1']
  try {
    const r = await fetch(`/api/market/ohlcv?pool=${pool}&tf=${tf}`, {signal:AbortSignal.timeout(8000)})
    if (!r.ok) return []
    const d = await r.json(); return d.data ?? []
  } catch { return [] }
}

/* ── Stat cell ───────────────────────────────────────────────────── */
function Stat({ label, value, sub, accent }: { label:string; value:string; sub?:string; accent?:string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
      <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color:'var(--text2)' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: accent ?? 'var(--text1)', fontFamily:'Space Grotesk,sans-serif' }}>{value}</span>
      {sub && <span className="text-[9px]" style={{ color:'var(--text2)' }}>{sub}</span>}
    </div>
  )
}

/* ── Change pill ─────────────────────────────────────────────────── */
function ChangePill({ label, value }: { label:string; value:number|null|undefined }) {
  if (value == null) return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl flex-1" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
      <span className="text-[8px] uppercase tracking-widest mb-1" style={{ color:'var(--text2)' }}>{label}</span>
      <span className="text-[10px] font-bold" style={{ color:'var(--text2)' }}>—</span>
    </div>
  )
  const pos = value >= 0
  return (
    <div className="flex flex-col items-center px-2 py-2 rounded-xl flex-1"
      style={{ background: pos?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)', border:`1px solid ${pos?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'}` }}>
      <span className="text-[8px] uppercase tracking-widest mb-1" style={{ color:'var(--text2)' }}>{label}</span>
      <div className="flex items-center gap-0.5">
        {pos ? <TrendingUp size={9} style={{color:'var(--green)'}}/> : <TrendingDown size={9} style={{color:'var(--red)'}}/>}
        <span className="text-[10px] font-bold" style={{ color: pos?'var(--green)':'var(--red)' }}>
          {pos?'+':''}{value.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────────── */
export function TokenPage() {
  const { address: tokenAddr } = useParams<{address:string}>()
  const { address: wallet, chainId: walletChain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()

  const { token, isLoading, refetch } = useTokenData(tokenAddr as `0x${string}`|undefined)
  const { balance: tokenBalance, allowance: tokenAllowance, refetch: refetchBal } = useTokenBalance(tokenAddr as `0x${string}`|undefined, wallet)

  const { data: usdcBalance }   = useReadContract({ address:USDC_ADDRESS, abi:erc20Abi, functionName:'balanceOf',  args:wallet?[wallet]:undefined,                                   chainId:CHAIN_ID as any, query:{enabled:!!wallet} })
  const { data: usdcAllowance } = useReadContract({ address:USDC_ADDRESS, abi:erc20Abi, functionName:'allowance', args:wallet&&FACTORY_ADDRESS?[wallet,FACTORY_ADDRESS]:undefined, chainId:CHAIN_ID as any, query:{enabled:!!wallet&&!!FACTORY_ADDRESS} })

  const [mode,setMode]     = useState<TradeMode>('buy')
  const [amount,setAmount] = useState('')
  const [slip,setSlip]     = useState(1)
  const [tab,setTab]       = useState<TabId>('chart')
  const [copied,setCopied] = useState(false)
  const [starred,setStarred] = useState(false)
  const [showSlip,setShowSlip] = useState(false)
  const [ohlcv,setOhlcv]   = useState<any[]>([])
  const [tf,setTf]         = useState('1h')
  const [dsData,setDsData] = useState<DSPair|null>(null)
  const [chartLoad,setCL]  = useState(false)

  // Price — fixed calculation
  const priceUsd   = calcPrice(token)
  const change24h  = dsData?.priceChange?.h24 ?? token?.market?.change24h
  const change1h   = dsData?.priceChange?.h1  ?? token?.market?.change1h
  const change6h   = dsData?.priceChange?.h6  ?? token?.market?.change6h
  const change5m   = dsData?.priceChange?.m5  ?? token?.market?.change5m
  const mcapUsd    = token?.market?.mcapUsd ?? (token ? Number(token.state?.virtualUsdcReserves??0n)*1e12/Math.max(1,Number(token.state?.virtualTokenReserves??1n))*1e18 : 0)
  const raisedUsd  = token ? Number(token.state?.realUsdcRaised??0n)/1e6 : 0
  const liqUsd     = dsData?.liquidity?.usd ?? raisedUsd
  const progress   = token ? formatProgress(token.progress) : 0
  const graduated  = token?.state?.graduated
  const hue        = tokenAddr ? parseInt(tokenAddr.slice(2,6),16)%360 : 200
  const tokenGrad  = `linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))`
  const buys24h    = dsData?.txns?.h24?.buys  ?? 0
  const sells24h   = dsData?.txns?.h24?.sells ?? 0
  const totalTxns  = buys24h + sells24h
  const buyPct     = totalTxns > 0 ? (buys24h/totalTxns)*100 : 50

  const parsedUsdc   = parseUsdc(amount)
  const parsedTokens = parseTokens(amount)

  // Market signal (0–100, based on progress)
  const signalScore = Math.min(100, Math.round(progress))
  const signalLabel = signalScore >= 75 ? 'Very Bullish' : signalScore >= 55 ? 'Bullish' : signalScore >= 40 ? 'Neutral' : signalScore >= 20 ? 'Bearish' : 'Very Bearish'
  const signalColor = signalScore >= 60 ? 'var(--green)' : signalScore >= 40 ? 'var(--gold)' : 'var(--red)'

  const wrong = walletChain !== CHAIN_ID

  // Fetch DS + OHLCV
  useEffect(() => {
    if (!tokenAddr) return; let dead = false
    ;(async () => {
      const ds = await fetchDS(tokenAddr)
      if (dead) return; setDsData(ds)
      setCL(true)
      const data = ds?.pairAddress ? await fetchOHLCV(ds.pairAddress, tf) : []
      if (dead) return; setOhlcv(data); setCL(false)
    })()
    return () => { dead = true }
  }, [tokenAddr, tf])

  // Auto-refresh 30s
  useEffect(() => {
    const id = setInterval(() => { void refetch(); void refetchBal() }, 30_000)
    return () => clearInterval(id)
  }, [refetch, refetchBal])

  // Quotes
  const { data: buyQuote  } = useReadContract({ address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'getBuyQuote',  args:[tokenAddr as `0x${string}`,parsedUsdc],   chainId:CHAIN_ID as any, query:{enabled:!!tokenAddr&&!!FACTORY_ADDRESS&&mode==='buy' &&parsedUsdc>0n} })
  const { data: sellQuote } = useReadContract({ address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'getSellQuote', args:[tokenAddr as `0x${string}`,parsedTokens], chainId:CHAIN_ID as any, query:{enabled:!!tokenAddr&&!!FACTORY_ADDRESS&&mode==='sell'&&parsedTokens>0n} })

  const { writeContract: approveUsdc,  data: approveHash,      isPending: isApproving      } = useWriteContract()
  const { isLoading: isApproveConf }   = useWaitForTransactionReceipt({ hash:approveHash })
  const { writeContract: approveToken, data: approveTokHash,   isPending: isApprovingTok   } = useWriteContract()
  const { isLoading: isApproveTokConf } = useWaitForTransactionReceipt({ hash:approveTokHash })
  const { writeContract: trade, data: tradeHash, isPending: isTrading } = useWriteContract()
  const { isLoading: isTxConf, isSuccess: isTxDone } = useWaitForTransactionReceipt({ hash:tradeHash })

  useEffect(() => { if (isTxDone) { void refetch(); void refetchBal(); setAmount('') } }, [isTxDone])

  const needsUsdcApproval  = mode==='buy'  && parsedUsdc>0n   && (usdcAllowance  as bigint??0n) < parsedUsdc
  const needsTokenApproval = mode==='sell' && parsedTokens>0n && tokenAllowance < parsedTokens
  const txBusy = isApproving||isApproveConf||isApprovingTok||isApproveTokConf||isTrading||isTxConf

  const handleApproveUsdc  = () => { if (!FACTORY_ADDRESS) return; approveUsdc({ address:USDC_ADDRESS, abi:erc20Abi, functionName:'approve', args:[FACTORY_ADDRESS,parsedUsdc*2n], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Approval submitted'), onError:(e)=>toast.error(parseOnchainError(e)) }) }
  const handleApproveToken = () => { if (!FACTORY_ADDRESS||!tokenAddr) return; approveToken({ address:tokenAddr as `0x${string}`, abi:erc20Abi, functionName:'approve', args:[FACTORY_ADDRESS,parsedTokens*2n], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Approval submitted'), onError:(e)=>toast.error(parseOnchainError(e)) }) }
  const handleTrade = () => {
    if (!FACTORY_ADDRESS||!tokenAddr||!wallet) return
    if (wrong) { switchChain({ chainId:CHAIN_ID as any }); return }
    if (mode==='buy') {
      const min = buyQuote ? (buyQuote as bigint)*BigInt(100-Math.ceil(slip))/100n : 0n
      trade({ address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'buyTokens', args:[tokenAddr as `0x${string}`,min], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Buy submitted!'), onError:(e)=>toast.error(parseOnchainError(e)) })
    } else {
      const min = sellQuote ? (sellQuote as bigint)*BigInt(100-Math.ceil(slip))/100n : 0n
      trade({ address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'sellTokens', args:[tokenAddr as `0x${string}`,parsedTokens,min], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Sell submitted!'), onError:(e)=>toast.error(parseOnchainError(e)) })
    }
  }

  const copyAddr = () => { if (!tokenAddr) return; navigator.clipboard.writeText(tokenAddr).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000) }) }

  const usdcBal = Number(usdcBalance??0n)/1e6
  const tokBal  = Number(tokenBalance??0n)/1e18

  // Loading skeleton
  if (isLoading) return (
    <div className="space-y-3 pt-2">
      {[160,100,200].map((h,i) => <div key={i} className="rounded-2xl shimmer" style={{ height:h, border:'1px solid var(--border)' }}/>)}
    </div>
  )

  if (!token) return (
    <div className="text-center py-16">
      <AlertTriangle size={32} style={{ color:'var(--text2)' }} className="mx-auto mb-3"/>
      <p style={{ color:'var(--text2)' }}>Token not found</p>
      <Link to="/"><button className="mt-4 px-4 py-2 rounded-xl text-sm" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text1)' }}>← Back</button></Link>
    </div>
  )

  const TABS = [
    { id:'chart'    as TabId, label:'Chart',    icon:BarChart3      },
    { id:'info'     as TabId, label:'Info',      icon:Info           },
    { id:'comments' as TabId, label:'Comments',  icon:MessageCircle  },
  ]

  return (
    <div className="space-y-3">

      {/* ── Header bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5 no-underline" style={{ color:'var(--text2)' }}>
          <ArrowLeft size={14}/><span className="text-xs font-medium">Tokens</span>
        </Link>
        <div className="flex items-center gap-2">
          {!graduated
            ? <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold" style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', color:'var(--green)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background:'var(--green)' }}/>Live
              </div>
            : <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold" style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'var(--gold)' }}>
                <Trophy size={9}/>Graduated
              </div>}
          <button onClick={() => void refetch()} className="p-1.5 rounded-lg" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
            <RefreshCw size={12} style={{ color:'var(--text2)' }}/>
          </button>
          <button onClick={() => setStarred(v=>!v)} className="p-1.5 rounded-lg" style={{ background:'var(--surface2)', border:'1px solid var(--border)', color:starred?'var(--gold)':'var(--text2)' }}>
            <Star size={12} fill={starred?'currentColor':'none'}/>
          </button>
          <button onClick={() => { navigator.share?.({ url:window.location.href, title:token.name }).catch(()=>{}) }}
            className="p-1.5 rounded-lg" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
            <Share2 size={12} style={{ color:'var(--text2)' }}/>
          </button>
        </div>
      </div>

      {/* ── Token hero card ──────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        {/* Logo + name + socials */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative flex-shrink-0">
            {token.imageUri
              ? <img src={token.imageUri} className="w-14 h-14 rounded-2xl object-cover" style={{ border:'1.5px solid var(--border2)', boxShadow:`0 0 20px ${tokenGrad.slice(22,38)}25` }}/>
              : <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white" style={{ background:tokenGrad, boxShadow:`0 4px 20px ${tokenGrad.slice(22,38)}30` }}>
                  {token.symbol?.slice(0,2)}
                </div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg font-black" style={{ color:'var(--text1)', letterSpacing:'-0.02em' }}>{token.symbol}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8', border:'1px solid rgba(99,102,241,0.2)' }}>${token.symbol}</span>
              {token.createdAt > 0 && (
                <span className="text-[9px] flex items-center gap-0.5" style={{ color:'var(--green)' }}>
                  <Sprout size={8}/>{timeAgo(token.createdAt)}
                </span>
              )}
            </div>
            <div className="text-xs font-medium mb-2" style={{ color:'var(--text2)' }}>{token.name}</div>
            {/* Socials */}
            <div className="flex items-center gap-1.5">
              {token.twitter  && <a href={`https://x.com/${token.twitter.replace('@','')}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}><Twitter size={11} style={{ color:'var(--text2)' }}/></a>}
              {token.telegram && <a href={`https://t.me/${token.telegram.replace('@','')}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}><Send size={11} style={{ color:'var(--text2)' }}/></a>}
              {token.website  && <a href={token.website} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}><Globe size={11} style={{ color:'var(--text2)' }}/></a>}
              <a href={`${EXPLORER_BASE}/address/${tokenAddr}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}><ExternalLink size={11} style={{ color:'var(--text2)' }}/></a>
            </div>
          </div>
        </div>

        {/* Price row */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[10px] font-semibold mb-0.5 uppercase tracking-widest" style={{ color:'var(--text2)' }}>Price</div>
            <div className="text-2xl font-black tabular-nums" style={{ color:'var(--text1)', fontFamily:'Space Grotesk,monospace', letterSpacing:'-0.03em' }}>
              <PxDisplay p={priceUsd}/>
            </div>
          </div>
          {change24h != null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: change24h>=0?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)', border:`1px solid ${change24h>=0?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}` }}>
              {change24h>=0 ? <TrendingUp size={13} style={{color:'var(--green)'}}/> : <TrendingDown size={13} style={{color:'var(--red)'}}/>}
              <span className="text-sm font-bold" style={{ color:change24h>=0?'var(--green)':'var(--red)' }}>
                {change24h>=0?'+':''}{change24h.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Change pills */}
        <div className="flex gap-1.5 mb-4">
          <ChangePill label="5M"  value={change5m}/>
          <ChangePill label="1H"  value={change1h}/>
          <ChangePill label="6H"  value={change6h}/>
          <ChangePill label="24H" value={change24h}/>
        </div>

        {/* Contract address */}
        <button onClick={copyAddr}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all"
          style={{ background:'var(--surface3)', border:'1px solid var(--border)', color:'var(--text2)' }}>
          <span className="font-mono truncate">{tokenAddr?.slice(0,8)}...{tokenAddr?.slice(-8)}</span>
          {copied ? <Check size={12} style={{color:'var(--green)'}}/> : <Copy size={12}/>}
        </button>
      </div>

      {/* ── Market signal ─────────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Activity size={12} style={{ color:'var(--accent)' }}/>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color:'var(--text2)' }}>Market Signal</span>
          </div>
          <span className="text-xs font-bold" style={{ color:'var(--text2)' }}>{signalScore} / 100</span>
        </div>
        <div className="text-base font-black mb-2" style={{ color:signalColor }}>{signalLabel}</div>
        <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background:'var(--surface3)' }}>
          <div className="h-full rounded-full" style={{ width:`${signalScore}%`, background:'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e)', transition:'width 1s ease' }}/>
        </div>
        <div className="flex justify-between text-[8px]" style={{ color:'var(--text2)' }}>
          <span>Bearish</span><span>Neutral</span><span>Bullish</span>
        </div>
        <div className="flex items-center gap-2 mt-2.5 text-[9px]" style={{ color:'var(--text2)' }}>
          {change24h!=null && <span style={{color:change24h>=0?'var(--green)':'var(--red)',fontWeight:700}}>24H {change24h>=0?'+':''}{change24h.toFixed(2)}%</span>}
          {change1h!=null  && <span>· 1H {change1h>=0?'+':''}{change1h.toFixed(2)}%</span>}
        </div>
      </div>

      {/* ── Stats grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Market Cap"  value={fmtC(mcapUsd)}/>
        <Stat label="USDC Raised" value={fmtC(raisedUsd)} accent="var(--accent)"/>
        <Stat label="Liquidity"   value={fmtC(liqUsd)}/>
        <Stat label="Pair Age"    value={token.createdAt>0 ? timeAgo(token.createdAt) : '—'}/>
      </div>

      {/* ── Bonding progress ──────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color:'var(--text2)' }}>Bonding Curve Progress</span>
          <span className="text-sm font-black" style={{ color: progress>=80?'var(--gold)':progress>=50?'var(--accent)':'var(--text1)' }}>
            {progress.toFixed(1)}%
          </span>
        </div>

        {/* Progress bar with milestones */}
        <div className="relative h-3 rounded-full overflow-hidden mb-2" style={{ background:'var(--surface3)' }}>
          <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(100,progress)}%` }} transition={{ duration:1, ease:'easeOut' }}
            className="h-full rounded-full relative"
            style={{ background: progress>=80 ? 'linear-gradient(90deg,#6366f1,#8b5cf6,#f59e0b)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)', boxShadow:'0 0 10px rgba(99,102,241,0.5)' }}>
            <div className="absolute right-0 top-0 bottom-0 w-3 bg-white opacity-20 rounded-full"/>
          </motion.div>
          {/* Milestone dots */}
          {[25,50,75].map(p => (
            <div key={p} className="absolute top-0 bottom-0 flex items-center" style={{ left:`${p}%` }}>
              <div className="w-0.5 h-full" style={{ background: progress>=p ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)' }}/>
            </div>
          ))}
        </div>

        {/* Milestone labels */}
        <div className="flex justify-between text-[7.5px]" style={{ color:'var(--text2)' }}>
          <span>Start</span><span>25%</span><span>50%</span><span>75%</span>
          <span style={{color:'var(--gold)'}}>🎓 Grad</span>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[9px]">
          <div className="flex-1 px-2.5 py-2 rounded-lg text-center" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
            <div style={{ color:'var(--text2)' }}>Raised</div>
            <div className="font-bold" style={{ color:'var(--text1)' }}>{fmtC(raisedUsd)}</div>
          </div>
          <div className="flex-1 px-2.5 py-2 rounded-lg text-center" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
            <div style={{ color:'var(--text2)' }}>Target</div>
            <div className="font-bold" style={{ color:'var(--gold)' }}>$69K</div>
          </div>
          <div className="flex-1 px-2.5 py-2 rounded-lg text-center" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
            <div style={{ color:'var(--text2)' }}>Status</div>
            <div className="font-bold" style={{ color: graduated?'var(--gold)':'var(--green)' }}>{graduated?'Grad':'Live'}</div>
          </div>
        </div>
      </div>

      {/* ── Buy/Sell volume bar ───────────────────────────────────── */}
      {totalTxns > 0 && (
        <div className="rounded-2xl px-4 py-3" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2 text-[9px]">
            <span style={{color:'var(--green)',fontWeight:700}}>▲ {buys24h} buys (24h)</span>
            <span style={{color:'var(--red)',fontWeight:700}}>{sells24h} sells ▼</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex" style={{ background:'var(--surface3)' }}>
            <div className="h-full" style={{ width:`${buyPct}%`, background:'var(--green)', borderRadius:'4px 0 0 4px' }}/>
            <div className="h-full flex-1" style={{ background:'var(--red)', borderRadius:'0 4px 4px 0' }}/>
          </div>
        </div>
      )}

      {/* ── Chart + Info + Comments tabs ─────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        {/* Tab bar */}
        <div className="flex border-b" style={{ borderColor:'var(--border)' }}>
          {TABS.map(t => {
            const active = tab === t.id; const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all"
                style={{ color: active?'var(--accent)':'var(--text2)', borderBottom: active?'2px solid var(--accent)':'2px solid transparent', background:'transparent' }}>
                <Icon size={11}/>{t.label}
              </button>
            )
          })}
        </div>

        {/* Chart */}
        {tab === 'chart' && (
          <div className="p-3">
            {/* TF selector */}
            <div className="flex items-center gap-1.5 mb-3">
              {['5m','1h','4h','1d'].map(t => (
                <button key={t} onClick={() => setTf(t)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                  style={{ background: tf===t?'rgba(99,102,241,0.15)':'transparent', color:tf===t?'#818cf8':'var(--text2)', border:`1px solid ${tf===t?'rgba(99,102,241,0.3)':'transparent'}` }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            {chartLoad
              ? <div className="flex items-center justify-center gap-2 py-12" style={{ color:'var(--text2)' }}>
                  <Loader2 size={16} className="animate-spin"/><span className="text-xs">Loading chart…</span>
                </div>
              : ohlcv.length >= 5
              ? <TVChart data={ohlcv} height={260} type="candle" loading={false}/>
              : <div className="flex flex-col items-center justify-center py-10" style={{ background:'var(--surface2)', borderRadius:12, height:240 }}>
                  <BarChart3 size={28} style={{color:'var(--text3)'}} className="mb-2"/>
                  <p className="text-sm font-medium" style={{color:'var(--text2)'}}>Chart coming soon</p>
                  <p className="text-xs mt-1" style={{color:'var(--text3)'}}>Price history will appear as trading activity grows</p>
                </div>}
          </div>
        )}

        {/* Info */}
        {tab === 'info' && (
          <div className="p-4 space-y-3">
            {token.description && (
              <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background:'var(--surface2)', color:'var(--text2)', border:'1px solid var(--border)' }}>
                {token.description}
              </div>
            )}
            {[
              { label:'Token Contract', value:tokenAddr??'', link:`${EXPLORER_BASE}/address/${tokenAddr}` },
              { label:'Creator',        value:token.creator ? formatAddress(token.creator as string) : '—', link:token.creator?`${EXPLORER_BASE}/address/${token.creator}`:undefined },
              { label:'Launched',       value:token.createdAt>0 ? new Date(token.createdAt*1000).toLocaleDateString() : '—' },
              { label:'Total Supply',   value:'1B tokens' },
            ].map(({ label,value,link }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor:'var(--border)' }}>
                <span className="text-[10px] font-medium" style={{ color:'var(--text2)' }}>{label}</span>
                {link
                  ? <a href={link} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] font-mono no-underline" style={{ color:'var(--accent)' }}>{value}<ExternalLink size={9}/></a>
                  : <span className="text-[10px] font-mono" style={{ color:'var(--text1)' }}>{value}</span>}
              </div>
            ))}

            {/* Creator metadata editor — only visible to the token creator */}
            {wallet && token.creator && wallet.toLowerCase() === (token.creator as string).toLowerCase() && (
              <EditMetadataPanel
                tokenAddr={tokenAddr!}
                token={token}
                factoryAddress={FACTORY_ADDRESS}
                chainId={CHAIN_ID}
                onSuccess={() => { void refetch() }}
              />
            )}
          </div>
        )}

        {/* Comments */}
        {tab === 'comments' && (
          <div className="p-3">
            <Comments tokenAddress={tokenAddr!}/>
          </div>
        )}
      </div>

      {/* ── Trade panel ───────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        {/* Buy / Sell toggle */}
        <div className="flex p-1.5 gap-1" style={{ background:'var(--surface2)' }}>
          {(['buy','sell'] as TradeMode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setAmount('') }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all capitalize"
              style={{
                background: mode===m ? m==='buy'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)' : 'transparent',
                color: mode===m ? m==='buy'?'var(--green)':'var(--red)' : 'var(--text2)',
                border: mode===m ? `1px solid ${m==='buy'?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}` : '1px solid transparent',
              }}>
              {m === 'buy' ? '▲ Buy' : '▼ Sell'}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {/* Balance */}
          <div className="flex items-center justify-between text-[9px]" style={{ color:'var(--text2)' }}>
            <span>Balance: <span style={{ color:'var(--text1)', fontWeight:600 }}>{mode==='buy' ? `${usdcBal.toFixed(2)} USDC` : `${tokBal.toLocaleString('en',{maximumFractionDigits:0})} ${token.symbol}`}</span></span>
            <button onClick={() => setAmount(mode==='buy' ? usdcBal.toFixed(6) : tokBal.toFixed(6))}
              className="px-1.5 py-0.5 rounded font-bold" style={{ background:'rgba(99,102,241,0.12)', color:'var(--accent)' }}>MAX</button>
          </div>

          {/* Amount input */}
          <div className="relative">
            <input
              type="number" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-base font-bold outline-none"
              style={{ background:'var(--surface2)', border:`1px solid ${amount?'rgba(99,102,241,0.3)':'var(--border)'}`, color:'var(--text1)', fontFamily:'Space Grotesk,monospace' }}/>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color:'var(--text2)' }}>
              {mode === 'buy' ? 'USDC' : token.symbol}
            </div>
          </div>

          {/* Quick amounts (buy only) */}
          {mode === 'buy' && (
            <div className="flex gap-1.5">
              {['10','50','100','500'].map(v => (
                <button key={v} onClick={() => setAmount(v)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={{ background: amount===v?'rgba(99,102,241,0.15)':'var(--surface2)', color: amount===v?'var(--accent)':'var(--text2)', border:`1px solid ${amount===v?'rgba(99,102,241,0.3)':'var(--border)'}` }}>
                  ${v}
                </button>
              ))}
            </div>
          )}

          {/* Quote output */}
          {((mode==='buy'&&buyQuote)||(mode==='sell'&&sellQuote)) && (
            <div className="px-3 py-2 rounded-xl text-xs" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <span style={{ color:'var(--text2)' }}>You receive</span>
                <span className="font-bold" style={{ color:'var(--text1)' }}>
                  {mode==='buy'
                    ? `~${(Number(buyQuote??0n)/1e18).toLocaleString('en',{maximumFractionDigits:0})} ${token.symbol}`
                    : `~${(Number(sellQuote??0n)/1e6).toFixed(4)} USDC`}
                </span>
              </div>
            </div>
          )}

          {/* Slippage */}
          <div>
            <button onClick={() => setShowSlip(v=>!v)} className="flex items-center gap-1 text-[9px] mb-2" style={{ color:'var(--text2)', background:'none', border:'none', padding:0, cursor:'pointer' }}>
              Slippage: <span style={{color:'var(--accent)',fontWeight:700}}>{slip}%</span>
              {showSlip ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
            </button>
            <AnimatePresence>
              {showSlip && (
                <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                  <div className="flex gap-1.5 mb-2">
                    {SLIP_OPTIONS.map(s => (
                      <button key={s} onClick={()=>setSlip(s)}
                        className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                        style={{ background:slip===s?'rgba(99,102,241,0.15)':'var(--surface2)', color:slip===s?'var(--accent)':'var(--text2)', border:`1px solid ${slip===s?'rgba(99,102,241,0.3)':'var(--border)'}` }}>
                        {s}%
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action button */}
          {!wallet ? (
            <div className="w-full rounded-xl overflow-hidden" style={{ border:'1px solid var(--border)' }}>
              <div className="text-center py-3 text-sm font-bold" style={{ color:'var(--text2)' }}>Connect wallet to trade</div>
            </div>
          ) : wrong ? (
            <button onClick={() => switchChain({chainId:CHAIN_ID as any})}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background:'rgba(245,158,11,0.12)', color:'var(--gold)', border:'1px solid rgba(245,158,11,0.25)' }}>
              <AlertTriangle size={14}/> Switch to Arc Network
            </button>
          ) : needsUsdcApproval ? (
            <button onClick={handleApproveUsdc} disabled={txBusy}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', opacity:txBusy?0.6:1 }}>
              {txBusy ? <Loader2 size={14} className="animate-spin"/> : <Zap size={14}/>}
              Approve USDC
            </button>
          ) : needsTokenApproval ? (
            <button onClick={handleApproveToken} disabled={txBusy}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', opacity:txBusy?0.6:1 }}>
              {txBusy ? <Loader2 size={14} className="animate-spin"/> : <Zap size={14}/>}
              Approve {token.symbol}
            </button>
          ) : (
            <button onClick={handleTrade} disabled={txBusy||!amount||parseFloat(amount)<=0}
              className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{
                background: mode==='buy' ? 'linear-gradient(135deg,rgba(34,197,94,0.8),rgba(34,197,94,1))' : 'linear-gradient(135deg,rgba(239,68,68,0.8),rgba(239,68,68,1))',
                color:'#fff',
                opacity: txBusy||!amount||parseFloat(amount)<=0 ? 0.5 : 1,
                boxShadow: mode==='buy' ? '0 4px 20px rgba(34,197,94,0.25)' : '0 4px 20px rgba(239,68,68,0.25)',
              }}>
              {txBusy
                ? <><Loader2 size={14} className="animate-spin"/>Processing…</>
                : mode==='buy'
                ? <><Flame size={14}/>Buy {token.symbol}</>
                : <><TrendingDown size={14}/>Sell {token.symbol}</>}
            </button>
          )}

          {/* Fee notice */}
          <p className="text-[8px] text-center" style={{ color:'var(--text3)' }}>
            1% protocol fee · {slip}% slippage tolerance · Powered by GlowFun bonding curve
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Creator metadata editor ──────────────────────────────────────────── */
interface EditMetadataPanelProps {
  tokenAddr: string
  token: any
  factoryAddress: `0x${string}` | undefined
  chainId: number
  onSuccess: () => void
}

function EditMetadataPanel({ tokenAddr, token, factoryAddress, chainId, onSuccess }: EditMetadataPanelProps) {
  const [open, setOpen]   = useState(false)
  const [fields, setFields] = useState({
    imageUri:    token.imageUri    ?? '',
    description: token.description ?? '',
    twitter:     token.twitter     ?? '',
    telegram:    token.telegram    ?? '',
    website:     token.website     ?? '',
  })

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess }      = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) { toast.success('Metadata updated on-chain!'); onSuccess(); setOpen(false) }
  }, [isSuccess])

  const handleSave = () => {
    if (!factoryAddress) return
    writeContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: 'updateTokenMetadata',
      args: [
        tokenAddr as `0x${string}`,
        fields.imageUri,
        fields.description,
        fields.twitter,
        fields.telegram,
        fields.website,
      ],
      chainId: chainId as any,
    } as any, {
      onError: (e: any) => toast.error(parseOnchainError(e)),
    })
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)' }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Pencil size={11} style={{ color: '#818cf8' }} />
          </div>
          <span className="text-xs font-semibold" style={{ color: '#818cf8' }}>Edit Token Info</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>Creator only</span>
        </div>
        <ChevronDown size={13} style={{ color: '#818cf8', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(99,102,241,0.1)' }}>
              <p className="text-[10px] pt-3" style={{ color: 'var(--text2)' }}>
                Changes are written permanently on-chain and show up everywhere your token contract address is read.
              </p>

              {/* Logo URL */}
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--text2)' }}>
                  Logo URL
                </label>
                <div className="flex gap-2 items-center">
                  {fields.imageUri && (
                    <img src={fields.imageUri} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  {!fields.imageUri && (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface3)' }}>
                      <Image size={12} style={{ color: 'var(--text3)' }} />
                    </div>
                  )}
                  <input
                    value={fields.imageUri}
                    onChange={e => setFields(f => ({ ...f, imageUri: e.target.value }))}
                    placeholder="ipfs://Qm... or https://..."
                    className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--text2)' }}>Description</label>
                <textarea
                  value={fields.description}
                  onChange={e => setFields(f => ({ ...f, description: e.target.value }))}
                  placeholder="What is this token about?"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                  style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
                />
              </div>

              {/* Socials row */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['twitter',  'Twitter',  '@handle'  ],
                  ['telegram', 'Telegram', '@group'   ],
                  ['website',  'Website',  'https://…'],
                ] as const).map(([k, label, ph]) => (
                  <div key={k}>
                    <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--text2)' }}>{label}</label>
                    <input
                      value={fields[k]}
                      onChange={e => setFields(f => ({ ...f, [k]: e.target.value }))}
                      placeholder={ph}
                      className="w-full px-2 py-2 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={!factoryAddress || isPending || confirming}
                className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white' }}
              >
                {isPending || confirming
                  ? <><Loader2 size={12} className="animate-spin" />Confirming…</>
                  : <><Check size={12} />Save Changes On-Chain</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  ArrowLeft, Twitter, Send, Globe, ExternalLink, Trophy,
  Loader2, AlertTriangle, Copy, Check, RefreshCw, Share2,
  Star, Zap, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Activity, BarChart3, MessageCircle, Info, Flame, Sprout,
  List, Users, BookOpen, ArrowUpRight, ArrowDownLeft,
} from 'lucide-react'
import { Comments } from '@/components/Comments'
import { TVChart } from '@/components/TVChart'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { GLOW_TOKEN_ABI } from '@/abi/GlowToken'
import { useConfig } from '@/context/ConfigContext'
import { useTokenData, useTokenBalance } from '@/hooks/useTokenData'
import { formatProgress, formatAddress, timeAgo, parseUsdc, parseTokens, ipfsToHttp } from '@/utils/format'
import { parseOnchainError } from '@/utils/errors'

type TradeMode = 'buy' | 'sell'
type TabId = 'chart' | 'orderbook' | 'holders' | 'txns' | 'comments'
const SLIP_OPTIONS = [0.5, 1, 3, 5]

/* ── Price calculation (fixed — no scientific notation) ─────────── */
function calcPrice(token: any): number {
  if (!token) return 0
  if (token.market?.priceUsd > 0) return token.market.priceUsd
  const vU = Number(token.state?.virtualUsdcReserves ?? 0n)
  const vT = Number(token.state?.virtualTokenReserves ?? 0n)
  if (!vU || !vT) return 0
  return vU * 1e12 / vT  // (vU/1e6) / (vT/1e18) = vU*1e12/vT
}

function PxDisplay({ p }: { p: number }) {
  if (!p) return <span>$0</span>
  if (p >= 0.01) return <span>${p >= 100 ? p.toLocaleString('en',{maximumFractionDigits:2}) : p.toFixed(p>=1?4:6)}</span>
  const s = p.toFixed(20); const m = s.match(/^0\.(0+)([1-9]\d{0,3})/)
  if (m && m[1].length >= 3) return <span>$0.0<sub style={{fontSize:'0.55em'}}>{m[1].length}</sub>{m[2]}</span>
  return <span>${p.toFixed(8)}</span>
}

function fmtC(v: number) {
  if (!v) return '$0'
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}

/* ── DS pair ────────────────────────────────────────────────────── */
interface DSPair { pairAddress:string; priceUsd:string; volume:{h24:number;h6:number;h1:number;m5:number}; priceChange:{h24:number;h6:number;h1:number;m5:number}; liquidity?:{usd:number}; fdv?:number; txns:{h24:{buys:number;sells:number}} }

async function fetchDS(addr: string): Promise<DSPair|null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`,{signal:AbortSignal.timeout(6000)})
    if (!r.ok) return null
    const d = await r.json(); const pairs: DSPair[] = d.pairs??[]
    return pairs.find((p:any)=>p.chainId==='arc')??pairs[0]??null
  } catch { return null }
}

async function fetchOHLCV(pool: string, tf: string): Promise<any[]> {
  try {
    const r = await fetch(`/api/market/ohlcv?pool=${pool}&tf=${tf}`,{signal:AbortSignal.timeout(8000)})
    if (!r.ok) return []; const d = await r.json(); return d.data??[]
  } catch { return [] }
}



/* ── Stat cell ──────────────────────────────────────────────────── */
function Stat({ label, value, accent }: { label:string; value:string; accent?:string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
      <span className="text-[8.5px] uppercase tracking-widest font-semibold" style={{ color:'var(--text2)' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color:accent??'var(--text1)', fontFamily:'Space Grotesk,sans-serif' }}>{value}</span>
    </div>
  )
}

/* ── Change pill ────────────────────────────────────────────────── */
function ChangePill({ label, value }: { label:string; value:number|null|undefined }) {
  const pos = (value??0) >= 0
  return (
    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl flex-1"
      style={{ background:value!=null?(pos?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)'):'var(--surface2)', border:`1px solid ${value!=null?(pos?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'):'var(--border)'}` }}>
      <span className="text-[7.5px] uppercase tracking-widest mb-0.5" style={{ color:'var(--text2)' }}>{label}</span>
      {value != null
        ? <span className="text-[9px] font-bold" style={{ color:pos?'var(--green)':'var(--red)' }}>{pos?'+':''}{value.toFixed(2)}%</span>
        : <span className="text-[9px]" style={{ color:'var(--text3)' }}>—</span>}
    </div>
  )
}

/* ── Order book (bonding curve virtual) ─────────────────────────── */
function OrderBook({ price, state }: { price:number; state:any }) {
  if (!price || !state) return <div className="py-8 text-center text-xs" style={{color:'var(--text2)'}}>Loading…</div>
  const vU = Number(state.virtualUsdcReserves??0n)/1e6
  const vT = Number(state.virtualTokenReserves??0n)/1e18
  // Generate ask/bid levels from bonding curve
  const levels = [0.02, 0.05, 0.10, 0.20, 0.50].map(pct => {
    const tokensToSell = vT * pct
    const usdc = vU * tokensToSell / (vT + tokensToSell)
    const sellPrice = usdc / tokensToSell
    const tokensToGet = vT * pct * 0.9
    const usdcCost = vU * tokensToGet / (vT - tokensToGet)
    const buyPrice = usdcCost / tokensToGet
    return { tokensToSell, usdc, sellPrice, tokensToGet, usdcCost, buyPrice }
  })
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 text-center text-[9px] font-bold py-1 rounded-lg" style={{ background:'rgba(34,197,94,0.08)', color:'var(--green)' }}>BUY SIDE</div>
        <div className="flex-1 text-center text-[9px] font-bold py-1 rounded-lg" style={{ background:'rgba(239,68,68,0.08)', color:'var(--red)' }}>SELL SIDE</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-1">
          <div className="flex justify-between text-[8px] px-2 py-1 font-semibold" style={{color:'var(--text2)'}}>
            <span>Price</span><span>Size</span>
          </div>
          {levels.map((l,i) => (
            <div key={i} className="flex justify-between px-2 py-1.5 rounded-lg text-[9px] relative overflow-hidden"
              style={{ background:'var(--surface3)' }}>
              <div className="absolute right-0 top-0 bottom-0 rounded-lg" style={{ width:`${(i+1)*18}%`, background:'rgba(34,197,94,0.08)' }}/>
              <span style={{ color:'var(--green)', fontWeight:600 }}>${l.buyPrice.toFixed(8).replace(/\.?0+$/,'').slice(0,10)}</span>
              <span style={{ color:'var(--text2)' }}>{(l.tokensToGet/1e3).toFixed(0)}K</span>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[8px] px-2 py-1 font-semibold" style={{color:'var(--text2)'}}>
            <span>Price</span><span>Size</span>
          </div>
          {levels.map((l,i) => (
            <div key={i} className="flex justify-between px-2 py-1.5 rounded-lg text-[9px] relative overflow-hidden"
              style={{ background:'var(--surface3)' }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-lg" style={{ width:`${(i+1)*18}%`, background:'rgba(239,68,68,0.08)' }}/>
              <span style={{ color:'var(--red)', fontWeight:600 }}>${l.sellPrice.toFixed(8).replace(/\.?0+$/,'').slice(0,10)}</span>
              <span style={{ color:'var(--text2)' }}>{(l.tokensToSell/1e3).toFixed(0)}K</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 p-3 rounded-xl text-center" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
        <div className="text-[8px] mb-0.5" style={{color:'var(--text2)'}}>Current Price (AMM)</div>
        <div className="text-sm font-black" style={{color:'var(--text1)'}}><PxDisplay p={price}/></div>
      </div>
    </div>
  )
}

/* ── Txns tab ────────────────────────────────────────────────────── */
function TxnsTab({ tokenAddr, factoryAddr, explorer }: { tokenAddr:string; factoryAddr:string; explorer:string }) {
  const [txns, setTxns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tokenAddr) return
    ;(async () => {
      try {
        // Use DexScreener for transactions
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`, {signal:AbortSignal.timeout(8000)})
        if (r.ok) {
          // Real transaction data would come from an indexer; DexScreener only provides
          // pair-level stats, not individual txns. Show empty until we have a real source.
          void r.json()
        }
      } catch {}
      setLoading(false)
    })()
  }, [tokenAddr])

  if (loading) return <div className="flex items-center justify-center py-8 gap-2" style={{color:'var(--text2)'}}><Loader2 size={14} className="animate-spin"/><span className="text-xs">Loading…</span></div>

  return (
    <div>
      <div className="flex text-[8.5px] font-bold px-3 py-2 mb-2 rounded-lg" style={{color:'var(--text2)', background:'var(--surface3)'}}>
        <span className="flex-1">Type</span><span className="w-20 text-right">USDC</span><span className="w-20 text-right">Tokens</span><span className="w-16 text-right">Wallet</span><span className="w-12 text-right">Age</span>
      </div>
      <div className="space-y-1">
        {txns.length===0 ? <div className="py-6 text-center text-xs" style={{color:'var(--text2)'}}>No transactions yet</div>
          : txns.map((t,i)=>(
          <div key={i} className="flex items-center text-[9px] px-3 py-2 rounded-lg" style={{background:'var(--surface3)'}}>
            <div className="flex-1 flex items-center gap-1.5">
              {t.type==='buy'
                ? <><ArrowUpRight size={10} style={{color:'var(--green)'}}/><span style={{color:'var(--green)',fontWeight:700}}>BUY</span></>
                : <><ArrowDownLeft size={10} style={{color:'var(--red)'}}/><span style={{color:'var(--red)',fontWeight:700}}>SELL</span></>}
            </div>
            <span className="w-20 text-right font-mono" style={{color:'var(--text1)'}}>${t.usd}</span>
            <span className="w-20 text-right font-mono" style={{color:'var(--text2)'}}>{(Number(t.tokens)/1e3).toFixed(1)}K</span>
            <a href={`${explorer}/address/${t.addr}`} target="_blank" rel="noopener" className="w-16 text-right no-underline" style={{color:'var(--accent)'}}>{t.addr}…</a>
            <span className="w-12 text-right" style={{color:'var(--text2)'}}>{timeAgo(t.time)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Holders tab — real on-chain balances ───────────────────────── */
function HoldersTab({ tokenAddr, creator, explorer }: { tokenAddr:string; creator:string; explorer:string }) {
  const { CHAIN_ID } = useConfig()
  const enabled = !!tokenAddr && !!creator && creator !== '0x'
  const { data: supplyRaw } = useReadContract({
    address: tokenAddr as `0x${string}`, abi: GLOW_TOKEN_ABI,
    functionName: 'totalSupply', chainId: CHAIN_ID as any, query: { enabled: !!tokenAddr },
  })
  const { data: bals, isLoading } = useReadContracts({
    contracts: enabled ? [
      { address:tokenAddr as `0x${string}`, abi:GLOW_TOKEN_ABI, functionName:'balanceOf', args:[creator as `0x${string}`],   chainId:CHAIN_ID as any },
      { address:tokenAddr as `0x${string}`, abi:GLOW_TOKEN_ABI, functionName:'balanceOf', args:[tokenAddr as `0x${string}`], chainId:CHAIN_ID as any },
    ] : [],
    query: { enabled },
  })
  const totalSupply = (supplyRaw as bigint) ?? 0n
  const creatorBal  = (bals?.[0]?.result as bigint) ?? 0n
  const curveBal    = (bals?.[1]?.result as bigint) ?? 0n
  const pctOf = (bal: bigint) => totalSupply > 0n ? Number(bal * 10000n / totalSupply) / 100 : 0

  const holders = totalSupply > 0n ? [
    ...(creatorBal > 0n ? [{ addr:creator,    bal:creatorBal, pct:pctOf(creatorBal), label:'Creator',      color:'var(--gold)'   }] : []),
    ...(curveBal   > 0n ? [{ addr:tokenAddr,  bal:curveBal,  pct:pctOf(curveBal),  label:'Bonding Curve', color:'var(--accent)' }] : []),
  ].sort((a,b) => b.pct - a.pct) : []

  if (isLoading) return (
    <div className="flex items-center justify-center py-8 gap-2" style={{color:'var(--text2)'}}>
      <Loader2 size={14} className="animate-spin"/><span className="text-xs">Loading holders…</span>
    </div>
  )
  return (
    <div>
      <div className="text-[9px] font-medium mb-3" style={{color:'var(--text2)'}}>
        On-chain holders{holders.length > 0 ? ` · ${holders.length} tracked` : ''}
      </div>
      {holders.length === 0 ? (
        <div className="py-8 text-center rounded-xl" style={{background:'var(--surface3)'}}>
          <Users size={20} style={{color:'var(--text3)'}} className="mx-auto mb-2"/>
          <p className="text-xs font-medium" style={{color:'var(--text2)'}}>No external holders yet</p>
          <p className="text-[9px] mt-1" style={{color:'var(--text3)'}}>Be the first to buy</p>
        </div>
      ) : holders.map((h,i) => (
        <div key={h.addr} className="flex items-center gap-2.5 p-2.5 rounded-xl mb-2" style={{background:'var(--surface3)', border:'1px solid var(--border)'}}>
          <span className="text-[9px] font-bold w-4" style={{color:'var(--text2)'}}>#{i+1}</span>
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <a href={`${explorer}/address/${h.addr}`} target="_blank" rel="noopener" className="text-[10px] font-mono no-underline" style={{color:'var(--accent)'}}>{formatAddress(h.addr)}</a>
              <span className="text-[8px] px-1 py-px rounded font-bold" style={{background:h.color+'20', color:h.color}}>{h.label}</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{background:'var(--surface2)'}}>
              <div className="h-full rounded-full" style={{width:`${Math.min(100,h.pct)}%`, background:h.color}}/>
            </div>
          </div>
          <span className="text-[10px] font-bold" style={{color:'var(--text1)'}}>{h.pct.toFixed(1)}%</span>
        </div>
      ))}
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

  const [mode, setMode]       = useState<TradeMode>('buy')
  const [amount, setAmount]   = useState('')
  const [slip, setSlip]       = useState(1)
  const [tab, setTab]         = useState<TabId>('chart')
  const [copied, setCopied]   = useState(false)
  const [starred, setStarred] = useState(false)
  const [showSlip, setShowSlip] = useState(false)
  const [ohlcv, setOhlcv]     = useState<any[]>([])
  const [tf, setTf]           = useState('1h')
  const [dsData, setDsData]   = useState<DSPair|null>(null)
  const [chartLoad, setCL]    = useState(false)
  const tradeRef              = useRef<HTMLDivElement>(null)

  const priceUsd  = calcPrice(token)
  const change24h = dsData?.priceChange?.h24 ?? token?.market?.change24h
  const change1h  = dsData?.priceChange?.h1  ?? token?.market?.change1h
  const change6h  = dsData?.priceChange?.h6  ?? token?.market?.change6h
  const change5m  = dsData?.priceChange?.m5  ?? token?.market?.change5m
  // Always use on-chain market cap for bonding curve tokens — never DexScreener override
  const mcapUsd   = token ? Number(token.marketCap ?? 0n) / 1e6 : 0
  const raisedUsd = token ? Number(token.state?.realUsdcRaised??0n)/1e6 : 0
  const liqUsd    = dsData?.liquidity?.usd ?? 0
  const progress  = token ? formatProgress(token.progress) : 0
  const graduated = token?.state?.graduated
  const hue       = tokenAddr ? parseInt(tokenAddr.slice(2,6),16)%360 : 200
  const tokenGrad = `linear-gradient(135deg,hsl(${hue},70%,55%),hsl(${(hue+120)%360},65%,45%))`
  const buys24h   = dsData?.txns?.h24?.buys  ?? 0
  const sells24h  = dsData?.txns?.h24?.sells ?? 0
  const totalTxns = buys24h + sells24h
  const buyPct    = totalTxns > 0 ? (buys24h/totalTxns)*100 : 50
  const signalScore = Math.min(100, Math.round(progress))
  const signalLabel = signalScore>=75?'Very Bullish':signalScore>=55?'Bullish':signalScore>=40?'Neutral':signalScore>=20?'Bearish':'Very Bearish'
  const signalColor = signalScore>=60?'var(--green)':signalScore>=40?'var(--gold)':'var(--red)'
  const wrong       = walletChain !== CHAIN_ID

  const parsedUsdc   = parseUsdc(amount)
  const parsedTokens = parseTokens(amount)

  useEffect(() => {
    if (!tokenAddr) return; let dead = false
    ;(async () => {
      const ds = await fetchDS(tokenAddr)
      if (dead) return; setDsData(ds)
      setCL(true)
      let data: any[] = []
      if (ds?.pairAddress) data = await fetchOHLCV(ds.pairAddress, tf)
      if (dead) return
      // Only show real OHLCV data — no synthetic candles
      setOhlcv(data); setCL(false)
    })()
    return () => { dead = true }
  }, [tokenAddr, tf])

  // Chart data comes only from real DEX pair OHLCV — no synthetic data

  useEffect(() => {
    const id = setInterval(() => { void refetch(); void refetchBal() }, 30_000)
    return () => clearInterval(id)
  }, [refetch, refetchBal])

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

  const handleApproveUsdc  = () => { approveUsdc({ address:USDC_ADDRESS, abi:erc20Abi, functionName:'approve', args:[FACTORY_ADDRESS!,parsedUsdc*2n], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Approved'), onError:(e)=>toast.error(parseOnchainError(e)) }) }
  const handleApproveToken = () => { approveToken({ address:tokenAddr as `0x${string}`, abi:erc20Abi, functionName:'approve', args:[FACTORY_ADDRESS!,parsedTokens*2n], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Approved'), onError:(e)=>toast.error(parseOnchainError(e)) }) }
  const handleTrade = () => {
    if (!FACTORY_ADDRESS||!tokenAddr||!wallet) return
    if (wrong) { switchChain({chainId:CHAIN_ID as any}); return }
    if (mode==='buy') {
      const min = buyQuote?(buyQuote as bigint)*BigInt(100-Math.ceil(slip))/100n:0n
      trade({ address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'buyTokens', args:[tokenAddr as `0x${string}`,min], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Buy submitted!'), onError:(e)=>toast.error(parseOnchainError(e)) })
    } else {
      const min = sellQuote?(sellQuote as bigint)*BigInt(100-Math.ceil(slip))/100n:0n
      trade({ address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'sellTokens', args:[tokenAddr as `0x${string}`,parsedTokens,min], chainId:CHAIN_ID as any } as any, { onSuccess:()=>toast.success('Sell submitted!'), onError:(e)=>toast.error(parseOnchainError(e)) })
    }
  }

  const scrollToTrade = (m: TradeMode) => {
    setMode(m)
    setTimeout(() => tradeRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 50)
  }
  const copyAddr = () => { navigator.clipboard.writeText(tokenAddr??'').then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000)}) }
  const usdcBal = Number(usdcBalance??0n)/1e6
  const tokBal  = Number(tokenBalance??0n)/1e18

  if (isLoading) return (
    <div className="space-y-3 pt-2">{[160,100,200,280].map((h,i)=><div key={i} className="rounded-2xl shimmer" style={{height:h,border:'1px solid var(--border)'}}/>)}</div>
  )
  if (!token) return (
    <div className="text-center py-16"><AlertTriangle size={32} style={{color:'var(--text2)'}} className="mx-auto mb-3"/><p style={{color:'var(--text2)'}}>Token not found</p><Link to="/"><button className="mt-4 px-4 py-2 rounded-xl text-sm" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text1)'}}>← Back</button></Link></div>
  )

  const TABS = [
    { id:'chart'     as TabId, label:'Chart',    icon:BarChart3   },
    { id:'orderbook' as TabId, label:'Book',     icon:BookOpen    },
    { id:'holders'   as TabId, label:'Holders',  icon:Users       },
    { id:'txns'      as TabId, label:'Txns',     icon:List        },
    { id:'comments'  as TabId, label:'Chat',     icon:MessageCircle },
  ]

  return (
    <div className="space-y-3 pb-24">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5 no-underline" style={{color:'var(--text2)'}}>
          <ArrowLeft size={14}/><span className="text-xs font-medium">Tokens</span>
        </Link>
        <div className="flex items-center gap-1.5">
          {!graduated
            ?<span className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold" style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',color:'var(--green)'}}>
               <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{background:'var(--green)'}}/>Live
             </span>
            :<span className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',color:'var(--gold)'}}>
               <Trophy size={8}/>Graduated
             </span>}
          <button onClick={()=>void refetch()} className="p-1.5 rounded-lg" style={{background:'var(--surface2)',border:'1px solid var(--border)'}}><RefreshCw size={11} style={{color:'var(--text2)'}}/></button>
          <button onClick={()=>setStarred(v=>!v)} className="p-1.5 rounded-lg" style={{background:'var(--surface2)',border:'1px solid var(--border)',color:starred?'var(--gold)':'var(--text2)'}}><Star size={11} fill={starred?'currentColor':'none'}/></button>
          <button onClick={()=>navigator.share?.({url:window.location.href,title:token.name}).catch(()=>{})} className="p-1.5 rounded-lg" style={{background:'var(--surface2)',border:'1px solid var(--border)'}}><Share2 size={11} style={{color:'var(--text2)'}}/></button>
        </div>
      </div>

      {/* ── Token hero ────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0">
            {token.imageUri
              ?<img src={ipfsToHttp(token.imageUri)} className="w-14 h-14 rounded-2xl object-cover" style={{border:'1.5px solid var(--border2)'}}/>
              :<div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white" style={{background:tokenGrad}}>{token.symbol?.slice(0,2)}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg font-black" style={{color:'var(--text1)',letterSpacing:'-0.02em'}}>{token.symbol}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{background:'rgba(99,102,241,0.1)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.2)'}}>${token.symbol}</span>
              {token.createdAt>0 && <span className="text-[9px] flex items-center gap-0.5" style={{color:'var(--green)'}}><Sprout size={8}/>{timeAgo(token.createdAt)}</span>}
            </div>
            <div className="text-xs font-medium mb-2" style={{color:'var(--text2)'}}>{token.name}</div>
            <div className="flex items-center gap-1.5">
              {token.twitter&&<a href={`https://x.com/${token.twitter.replace('@','')}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{background:'var(--surface3)',border:'1px solid var(--border)'}}><Twitter size={11} style={{color:'var(--text2)'}}/></a>}
              {token.telegram&&<a href={`https://t.me/${token.telegram.replace('@','')}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{background:'var(--surface3)',border:'1px solid var(--border)'}}><Send size={11} style={{color:'var(--text2)'}}/></a>}
              {token.website&&<a href={token.website} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{background:'var(--surface3)',border:'1px solid var(--border)'}}><Globe size={11} style={{color:'var(--text2)'}}/></a>}
              <a href={`${EXPLORER_BASE}/address/${tokenAddr}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg no-underline" style={{background:'var(--surface3)',border:'1px solid var(--border)'}}><ExternalLink size={11} style={{color:'var(--text2)'}}/></a>
            </div>
          </div>
        </div>
        {/* Price */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{color:'var(--text2)'}}>Price</div>
            <div className="text-2xl font-black tabular-nums" style={{color:'var(--text1)',fontFamily:'Space Grotesk,monospace',letterSpacing:'-0.03em'}}><PxDisplay p={priceUsd}/></div>
          </div>
          {change24h!=null&&(
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl" style={{background:change24h>=0?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${change24h>=0?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`}}>
              {change24h>=0?<TrendingUp size={12} style={{color:'var(--green)'}}/>:<TrendingDown size={12} style={{color:'var(--red)'}}/>}
              <span className="text-sm font-bold" style={{color:change24h>=0?'var(--green)':'var(--red)'}}>{change24h>=0?'+':''}{change24h.toFixed(2)}%</span>
            </div>
          )}
        </div>
        {/* Change pills */}
        <div className="flex gap-1.5 mb-3"><ChangePill label="5M" value={change5m}/><ChangePill label="1H" value={change1h}/><ChangePill label="6H" value={change6h}/><ChangePill label="24H" value={change24h}/></div>
        {/* Contract */}
        <button onClick={copyAddr} className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px]" style={{background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text2)'}}>
          <span className="font-mono">{tokenAddr?.slice(0,10)}...{tokenAddr?.slice(-8)}</span>
          {copied?<Check size={11} style={{color:'var(--green)'}}/>:<Copy size={11}/>}
        </button>
      </div>

      {/* ── Market signal ─────────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5"><Activity size={11} style={{color:'var(--accent)'}}/><span className="text-[9px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Market Signal</span></div>
          <span className="text-[11px] font-bold" style={{color:'var(--text2)'}}>{signalScore} / 100</span>
        </div>
        <div className="text-sm font-black mb-2" style={{color:signalColor}}>{signalLabel}</div>
        <div className="h-2 rounded-full overflow-hidden mb-1" style={{background:'var(--surface3)'}}>
          <div className="h-full rounded-full transition-all duration-1000" style={{width:`${signalScore}%`,background:'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e)'}}/>
        </div>
        <div className="flex justify-between text-[8px]" style={{color:'var(--text2)'}}><span>Bearish</span><span>Neutral</span><span>Bullish</span></div>
        {(change24h!=null||change1h!=null)&&(
          <div className="flex items-center gap-2 mt-2 text-[9px]">
            {change24h!=null&&<span style={{color:change24h>=0?'var(--green)':'var(--red)',fontWeight:700}}>24H {change24h>=0?'+':''}{change24h.toFixed(2)}%</span>}
            {change1h!=null&&<span style={{color:'var(--text2)'}}>· 1H {change1h>=0?'+':''}{change1h.toFixed(2)}%</span>}
          </div>
        )}
      </div>

      {/* ── Stats grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Market Cap"  value={fmtC(mcapUsd)}/>
        <Stat label="USDC Raised" value={fmtC(raisedUsd)} accent="var(--accent)"/>
        <Stat label="Liquidity"   value={fmtC(liqUsd)}/>
        <Stat label="Pair Age"    value={token.createdAt>0?timeAgo(token.createdAt):'—'}/>
      </div>

      {/* ── Bonding progress ──────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Bonding Curve Progress</span>
          <span className="text-sm font-black" style={{color:progress>=80?'var(--gold)':progress>=50?'var(--accent)':'var(--text1)'}}>{progress.toFixed(1)}%</span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden mb-2" style={{background:'var(--surface3)'}}>
          <motion.div initial={{width:0}} animate={{width:`${Math.min(100,progress)}%`}} transition={{duration:1,ease:'easeOut'}} className="h-full rounded-full"
            style={{background:progress>=80?'linear-gradient(90deg,#6366f1,#8b5cf6,#f59e0b)':'linear-gradient(90deg,#6366f1,#8b5cf6)',boxShadow:'0 0 8px rgba(99,102,241,0.5)'}}/>
          {[25,50,75].map(p=><div key={p} className="absolute top-0 bottom-0" style={{left:`${p}%`,width:1,background:'rgba(255,255,255,0.1)'}}/>)}
        </div>
        <div className="flex justify-between text-[7.5px] mb-3" style={{color:'var(--text2)'}}><span>Start</span><span>25%</span><span>50%</span><span>75%</span><span style={{color:'var(--gold)'}}>🎓 Grad</span></div>
        <div className="flex gap-2 text-[9px]">
          {[{l:'Raised',v:fmtC(raisedUsd)},{l:'Target',v:'$69K',c:'var(--gold)'},{l:'Status',v:graduated?'Graduated':'Live',c:graduated?'var(--gold)':'var(--green)'}].map(({l,v,c})=>(
            <div key={l} className="flex-1 px-2 py-2 rounded-lg text-center" style={{background:'var(--surface3)',border:'1px solid var(--border)'}}><div style={{color:'var(--text2)'}}>{l}</div><div className="font-bold mt-0.5" style={{color:c??'var(--text1)'}}>{v}</div></div>
          ))}
        </div>
      </div>

      {/* ── Buy/Sell volume bar ───────────────────────────────────── */}
      {totalTxns > 0 && (
        <div className="rounded-2xl px-4 py-3" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <div className="flex justify-between text-[9px] mb-2"><span style={{color:'var(--green)',fontWeight:700}}>▲ {buys24h} buys (24h)</span><span style={{color:'var(--red)',fontWeight:700}}>{sells24h} sells ▼</span></div>
          <div className="h-2 rounded-full overflow-hidden flex">
            <div style={{width:`${buyPct}%`,background:'var(--green)',borderRadius:'4px 0 0 4px'}}/>
            <div className="flex-1" style={{background:'var(--red)',borderRadius:'0 4px 4px 0'}}/>
          </div>
        </div>
      )}

      {/* ── Token Info (always visible) ───────────────────────────── */}
      {token.description && (
        <div className="rounded-2xl p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <div className="flex items-center gap-1.5 mb-2"><Info size={11} style={{color:'var(--accent)'}}/><span className="text-[9px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>About</span></div>
          <p className="text-xs leading-relaxed" style={{color:'var(--text2)'}}>{token.description}</p>
        </div>
      )}

      {/* ── Chart + Tabs ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="flex border-b overflow-x-auto scrollbar-hide" style={{borderColor:'var(--border)'}}>
          {TABS.map(t=>{
            const active=tab===t.id; const Icon=t.icon
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} className="flex-1 flex items-center justify-center gap-1 py-3 text-[10px] font-semibold transition-all whitespace-nowrap px-2"
                style={{color:active?'var(--accent)':'var(--text2)',borderBottom:active?'2px solid var(--accent)':'2px solid transparent',background:'transparent',minWidth:56}}>
                <Icon size={10}/>{t.label}
              </button>
            )
          })}
        </div>
        <div className="p-3">
          {tab==='chart' && (
            <div>
              <div className="flex gap-1.5 mb-3">
                {['5m','1h','4h','1d'].map(t=>(
                  <button key={t} onClick={()=>setTf(t)} className="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all"
                    style={{background:tf===t?'rgba(99,102,241,0.15)':'transparent',color:tf===t?'#818cf8':'var(--text2)',border:`1px solid ${tf===t?'rgba(99,102,241,0.3)':'transparent'}`}}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
              {chartLoad
                ?<div className="flex items-center justify-center gap-2 py-12" style={{color:'var(--text2)'}}><Loader2 size={14} className="animate-spin"/><span className="text-xs">Loading chart…</span></div>
                :ohlcv.length>=5
                ?<TVChart data={ohlcv} height={240} type="candle" loading={false}/>
                :<div className="flex flex-col items-center justify-center py-10 rounded-xl" style={{background:'var(--surface2)',height:220}}>
                   <BarChart3 size={24} style={{color:'var(--text3)'}} className="mb-2"/>
                   <p className="text-sm font-medium" style={{color:'var(--text2)'}}>Chart coming soon</p>
                   <p className="text-xs mt-1" style={{color:'var(--text3)'}}>Price history will appear as trading activity grows</p>
                 </div>}
            </div>
          )}
          {tab==='orderbook' && <OrderBook price={priceUsd} state={token.state}/>}
          {tab==='holders'   && <HoldersTab tokenAddr={tokenAddr!} creator={token.creator as string} explorer={EXPLORER_BASE}/>}
          {tab==='txns'      && <TxnsTab tokenAddr={tokenAddr!} factoryAddr={FACTORY_ADDRESS??''} explorer={EXPLORER_BASE}/>}
          {tab==='comments'  && <Comments tokenAddress={tokenAddr!}/>}
        </div>
      </div>

      {/* ── Contract details ─────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <div className="px-4 py-3 border-b" style={{borderColor:'var(--border)'}}>
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Contract Details</span>
        </div>
        {[
          {label:'Token Contract',value:formatAddress(tokenAddr??''),link:`${EXPLORER_BASE}/address/${tokenAddr}`},
          {label:'Creator',value:formatAddress(token.creator as string),link:`${EXPLORER_BASE}/address/${token.creator}`},
          {label:'Launched',value:token.createdAt>0?new Date(token.createdAt*1000).toLocaleDateString():'—'},
          {label:'Total Supply',value: token.totalSupply > 0n ? (Number(token.totalSupply)/1e18).toLocaleString('en',{maximumFractionDigits:0}) : '—'},
        ].map(({label,value,link})=>(
          <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0" style={{borderColor:'var(--border)'}}>
            <span className="text-[9px]" style={{color:'var(--text2)'}}>{label}</span>
            {link?<a href={link} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] font-mono no-underline" style={{color:'var(--accent)'}}>{value}<ExternalLink size={8}/></a>
              :<span className="text-[10px] font-mono" style={{color:'var(--text1)'}}>{value}</span>}
          </div>
        ))}
      </div>

      {/* ── Trade panel ─────────────────────────────────────────────── */}
      <div ref={tradeRef} id="trade-form" className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        {/* Buy/Sell toggle */}
        <div className="flex p-1.5 gap-1" style={{background:'var(--surface2)'}}>
          {(['buy','sell'] as TradeMode[]).map(m=>(
            <button key={m} onClick={()=>{setMode(m);setAmount('')}} className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all capitalize"
              style={{background:mode===m?(m==='buy'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'):'transparent',color:mode===m?(m==='buy'?'var(--green)':'var(--red)'):'var(--text2)',border:mode===m?`1px solid ${m==='buy'?'rgba(34,197,94,0.3)':'rgba(239,68,68,0.3)'}`:'1px solid transparent'}}>
              {m==='buy'?'▲ Buy':'▼ Sell'}
            </button>
          ))}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-[9px]" style={{color:'var(--text2)'}}>
            <span>Balance: <span style={{color:'var(--text1)',fontWeight:600}}>{mode==='buy'?`${usdcBal.toFixed(2)} USDC`:`${tokBal.toLocaleString('en',{maximumFractionDigits:0})} ${token.symbol}`}</span></span>
            <button onClick={()=>setAmount(mode==='buy'?usdcBal.toFixed(6):tokBal.toFixed(6))} className="px-1.5 py-0.5 rounded font-bold" style={{background:'rgba(99,102,241,0.12)',color:'var(--accent)'}}>MAX</button>
          </div>
          <div className="relative">
            <input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-base font-bold outline-none"
              style={{background:'var(--surface2)',border:`1px solid ${amount?'rgba(99,102,241,0.3)':'var(--border)'}`,color:'var(--text1)',fontFamily:'Space Grotesk,monospace'}}/>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{color:'var(--text2)'}}>{mode==='buy'?'USDC':token.symbol}</div>
          </div>
          {mode==='buy' && (
            <div className="flex gap-1.5">
              {['10','50','100','500'].map(v=>(
                <button key={v} onClick={()=>setAmount(v)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={{background:amount===v?'rgba(99,102,241,0.15)':'var(--surface2)',color:amount===v?'var(--accent)':'var(--text2)',border:`1px solid ${amount===v?'rgba(99,102,241,0.3)':'var(--border)'}`}}>
                  ${v}
                </button>
              ))}
            </div>
          )}
          {((mode==='buy'&&buyQuote)||(mode==='sell'&&sellQuote)) && (
            <div className="px-3 py-2 rounded-xl text-xs" style={{background:'var(--surface2)',border:'1px solid var(--border)'}}>
              <div className="flex justify-between"><span style={{color:'var(--text2)'}}>You receive</span><span className="font-bold" style={{color:'var(--text1)'}}>{mode==='buy'?`~${(Number(buyQuote??0n)/1e18).toLocaleString('en',{maximumFractionDigits:0})} ${token.symbol}`:`~${(Number(sellQuote??0n)/1e6).toFixed(4)} USDC`}</span></div>
            </div>
          )}
          <div>
            <button onClick={()=>setShowSlip(v=>!v)} className="flex items-center gap-1 text-[9px]" style={{color:'var(--text2)',background:'none',border:'none',padding:0,cursor:'pointer'}}>
              Slippage: <span style={{color:'var(--accent)',fontWeight:700}}>{slip}%</span>{showSlip?<ChevronUp size={9}/>:<ChevronDown size={9}/>}
            </button>
            <AnimatePresence>
              {showSlip && (
                <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                  <div className="flex gap-1.5 mt-2">
                    {SLIP_OPTIONS.map(s=>(
                      <button key={s} onClick={()=>setSlip(s)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                        style={{background:slip===s?'rgba(99,102,241,0.15)':'var(--surface2)',color:slip===s?'var(--accent)':'var(--text2)',border:`1px solid ${slip===s?'rgba(99,102,241,0.3)':'var(--border)'}`}}>
                        {s}%
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {!wallet
            ?<div className="text-center py-3 text-sm font-bold rounded-xl" style={{background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text2)'}}>Connect wallet to trade</div>
            :wrong
            ?<button onClick={()=>switchChain({chainId:CHAIN_ID as any})} className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{background:'rgba(245,158,11,0.12)',color:'var(--gold)',border:'1px solid rgba(245,158,11,0.25)'}}>
               <AlertTriangle size={13}/>Switch to Arc Network
             </button>
            :needsUsdcApproval
            ?<button onClick={handleApproveUsdc} disabled={txBusy} className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',opacity:txBusy?0.6:1}}>
               {txBusy?<Loader2 size={13} className="animate-spin"/>:<Zap size={13}/>}Approve USDC
             </button>
            :needsTokenApproval
            ?<button onClick={handleApproveToken} disabled={txBusy} className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',opacity:txBusy?0.6:1}}>
               {txBusy?<Loader2 size={13} className="animate-spin"/>:<Zap size={13}/>}Approve {token.symbol}
             </button>
            :<button onClick={handleTrade} disabled={txBusy||!amount||parseFloat(amount)<=0} className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
               style={{background:mode==='buy'?'linear-gradient(135deg,rgba(34,197,94,0.9),rgba(34,197,94,1))':'linear-gradient(135deg,rgba(239,68,68,0.9),rgba(239,68,68,1))',color:'#fff',opacity:txBusy||!amount||parseFloat(amount)<=0?0.5:1,boxShadow:mode==='buy'?'0 4px 20px rgba(34,197,94,0.25)':'0 4px 20px rgba(239,68,68,0.25)'}}>
               {txBusy?<><Loader2 size={13} className="animate-spin"/>Processing…</>:mode==='buy'?<><Flame size={13}/>Buy {token.symbol}</>:<><TrendingDown size={13}/>Sell {token.symbol}</>}
             </button>}
          <p className="text-[8px] text-center" style={{color:'var(--text3)'}}>1% protocol fee · {slip}% slippage · GlowFun bonding curve</p>
        </div>
      </div>

      {/* ── Floating Buy/Sell ─────────────────────────────────────── */}
      <div className="fixed bottom-20 left-4 right-4 z-40 md:hidden">
        <div className="flex gap-2 p-2 rounded-2xl" style={{background:'rgba(7,7,14,0.92)',backdropFilter:'blur(20px)',border:'1px solid var(--border)',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
          <motion.button whileTap={{scale:0.97}} onClick={()=>scrollToTrade('buy')} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-black"
            style={{background:'linear-gradient(135deg,rgba(34,197,94,0.15),rgba(34,197,94,0.2))',color:'var(--green)',border:'1px solid rgba(34,197,94,0.3)'}}>
            <Flame size={13}/>Buy
          </motion.button>
          <motion.button whileTap={{scale:0.97}} onClick={()=>scrollToTrade('sell')} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-black"
            style={{background:'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.2))',color:'var(--red)',border:'1px solid rgba(239,68,68,0.3)'}}>
            <TrendingDown size={13}/>Sell
          </motion.button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useSwitchChain, useReadContract,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import ImageUpload from '@/components/ImageUpload'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { parseUsdc } from '@/utils/format'
import { useFactoryConfig } from '@/hooks/useFactoryConfig'
import { parseOnchainError } from '@/utils/errors'
import { ConnectKitButton } from 'connectkit'
import {
  Rocket, Twitter, Send, Globe, ChevronDown, Zap,
  Loader2, ShieldCheck, ArrowRight,
  AlertTriangle, Info, RotateCcw, Check,
  Lock, TrendingUp, Star, PlusCircle, Flame,
  MessageCircle, Hash, Image, Settings2,
} from 'lucide-react'

/* ─── helpers ─────────────────────────────────────────────────────── */
const fmt = (n: bigint) => {
  const v = Number(n) / 1e18
  return v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v.toLocaleString()
}
const fmtUsdc = (v: bigint) => {
  const n = Number(v) / 1e6
  return n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n.toFixed(2)}`
}
const pct = (n: number) => `${n.toFixed(1)}%`

/* ─── supply presets ──────────────────────────────────────────────── */
const SUPPLIES = [
  { label: '100M',  val: 100_000_000n  * 10n**18n, desc: 'Micro',    color: '#60a5fa' },
  { label: '500M',  val: 500_000_000n  * 10n**18n, desc: 'Mid',      color: '#818cf8' },
  { label: '1B',    val: 1_000_000_000n * 10n**18n, desc: 'Classic',  color: '#a78bfa', star: true },
  { label: '5B',    val: 5_000_000_000n * 10n**18n, desc: 'Large',    color: '#c084fc' },
  { label: '10B',   val: 10_000_000_000n*10n**18n,  desc: 'Doge',     color: '#e879f9' },
  { label: 'Custom',val: 0n,                         desc: 'Custom',   color: 'var(--text3)' },
]

/* graduation is protocol-controlled — read from contract, not user-settable */

/* ─── allocation modes ────────────────────────────────────────────── */
const ALLOC_MODES = [
  { id: 'community',    label: 'Community',    sub: 'No creator cut',  curve: 8000, creator: 0,    color: '#22c55e' },
  { id: 'creator',      label: 'Creator',      sub: '5% reserved',     curve: 7500, creator: 500,  color: '#818cf8' },
  { id: 'deflationary', label: 'Deflationary', sub: 'Max DEX liq.',    curve: 9200, creator: 0,    color: '#60a5fa' },
  { id: 'whale',        label: 'Whale mode',   sub: '10% to creator',  curve: 7000, creator: 1000, color: '#f59e0b' },
  { id: 'custom',       label: 'Custom',       sub: 'Your own split',  curve: -1,   creator: -1,   color: '#a78bfa' },
]

/* ─── form types ──────────────────────────────────────────────────── */
interface Form {
  name: string; symbol: string; description: string; imageUri: string; bannerUri: string
  twitter: string; telegram: string; website: string; discord: string
}
const INIT: Form = { name:'', symbol:'', description:'', imageUri:'', bannerUri:'', twitter:'', telegram:'', website:'', discord:'' }

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`
type Step = 'form'|'approving'|'launching'|'done'

/* ─── Donut SVG ───────────────────────────────────────────────────── */
function Donut({ curve, creator, dex }: { curve:number; creator:number; dex:number }) {
  const R=52, stroke=13, C=2*Math.PI*R
  const segs = [
    { p: curve,   c: '#6366f1' },
    { p: creator, c: '#f59e0b' },
    { p: dex,     c: '#22c55e' },
  ]
  let off=0
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <circle cx={60} cy={60} r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke}/>
      {segs.map(({p,c},i) => {
        const len=(p/100)*C
        const el=(
          <circle key={i} cx={60} cy={60} r={R} fill="none" stroke={c} strokeWidth={stroke}
            strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-off*C/100}
            strokeLinecap="butt"
            style={{transform:'rotate(-90deg)',transformOrigin:'60px 60px',transition:'stroke-dasharray 0.4s ease'}}/>
        )
        off+=p; return el
      })}
      <text x={60} y={54} textAnchor="middle" fill="white" fontSize={15} fontWeight="bold" fontFamily="Space Grotesk">{(curve+creator+dex).toFixed(0)}%</text>
      <text x={60} y={68} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8}>Total split</text>
    </svg>
  )
}

/* ─── Tooltip ─────────────────────────────────────────────────────── */
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-flex">
      <button type="button"
        onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}
        onClick={()=>setShow(v=>!v)} className="flex items-center justify-center w-4 h-4">
        <Info size={11} style={{color:'var(--text3)'}}/>
      </button>
      <AnimatePresence>
        {show && (
          <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-48">
            <div className="text-[10px] leading-relaxed px-3 py-2 rounded-xl shadow-xl"
              style={{background:'var(--surface3)',border:'1px solid var(--border2)',color:'var(--text2)'}}>
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Section wrapper ─────────────────────────────────────────────── */
function Section({ title, subtitle, icon:Icon, iconColor='#818cf8', children, badge, step }:
  { title:string; subtitle?:string; icon:any; iconColor?:string; children:React.ReactNode; badge?:string; step?:number }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
      <div className="px-5 pt-5 pb-4 flex items-start gap-3" style={{borderBottom:'1px solid var(--border)'}}>
        {step !== undefined && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black mt-0.5"
            style={{background:`${iconColor}20`,color:iconColor}}>{step}</div>
        )}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{background:`${iconColor}15`}}>
          <Icon size={14} style={{color:iconColor}}/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{color:'var(--text1)'}}>{title}</span>
            {badge && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{background:'rgba(99,102,241,0.1)',color:'#818cf8'}}>{badge}</span>}
          </div>
          {subtitle && <p className="text-[10px] mt-0.5" style={{color:'var(--text3)'}}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ─── Field label ─────────────────────────────────────────────────── */
function Label({ text, tip, required }: { text:string; tip?:string; required?:boolean }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>{text}</label>
      {required && <span className="text-[9px] font-bold" style={{color:'#f87171'}}>*</span>}
      {tip && <Tip text={tip}/>}
    </div>
  )
}

const inCls = "w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-1"
const inSt  = { background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)' }
const inFocus = { '--tw-ring-color':'rgba(99,102,241,0.4)' } as React.CSSProperties

/* ══════════════════════════════════════════════════════════════════════ */
/*  LAUNCH PAGE                                                           */
/* ══════════════════════════════════════════════════════════════════════ */
export function LaunchPage() {
  const navigate = useNavigate()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID } = useConfig()

  /* form */
  const [form, setForm]       = useState<Form>(INIT)
  const [txStep, setTxStep]   = useState<Step>('form')
  const [showSocials, setSoc]   = useState(false)
  const [showBanner, setBanner] = useState(false)

  /* supply */
  const [supplyIdx, setSI]  = useState(2)
  const [customSup, setCS]  = useState('')
  const isCSup = supplyIdx === SUPPLIES.length-1

  /* graduation is set by protocol — use factory's tokenGraduationThreshold */

  /* allocation */
  const [allocMode, setAllocMode] = useState('community')
  const [curveBps,  setCurve]     = useState(8000)
  const [creatorBps,setCr]        = useState(0)

  // V3 Feature toggles
  const [mintable,    setMintable]    = useState(false)
  const [burnable,    setBurnable]    = useState(false)
  const [hasBlacklist,setBlacklist]   = useState(false)
  const [pairToken,   setPairToken]   = useState<string>('')  // '' = default (USDC)
  const [vestingDays, setVestingDays] = useState('')   // vesting duration in days
  const [vestingCliffDays, setVCliff] = useState('')   // cliff in days

  /* tx */
  const [approveTx, setAppTx] = useState<`0x${string}`|undefined>()
  const [launchTx,  setLTx]         = useState<`0x${string}`|undefined>()
  const [launchedAddr, setLaunched] = useState<string>('')

  /* computed supply */
  const supply: bigint = (() => {
    if (isCSup) { const v=parseFloat(customSup); if(!isNaN(v)&&v>0) return BigInt(Math.round(v*1e9))*10n**9n; return 1_000_000_000n*10n**18n }
    return SUPPLIES[supplyIdx]?.val ?? 1_000_000_000n*10n**18n
  })()

  /* graduation threshold comes from factory contract */

  const curveTokens   = (supply * BigInt(curveBps))   / 10_000n
  const creatorTokens = (supply * BigInt(creatorBps))  / 10_000n
  const dexTokens     = supply - curveTokens - creatorTokens
  const curvePct      = curveBps/100
  const creatorPct    = creatorBps/100
  const dexPct        = Number(dexTokens)*100/Number(supply)
  // Contract enforces curveBps >= 5000, curveBps <= 9500, curveBps + creatorBps <= 9500
  const overLimit     = curveBps < 5000 || curveBps + creatorBps > 9500

  const [initLiqRaw, setInitLiq] = useState('')  // USDC the creator seeds the Uniswap pool with

  /* Live contract config — all admin-set values pulled from chain */
  const cfg  = useFactoryConfig()
  const fee  = cfg.creationFee
  const grad = cfg.graduationThreshold   // 0 = admin has enabled instant graduation mode

  /* Instant graduation mode — admin must have set threshold to 0, AND user must have entered liquidity */
  const instantMode      = grad === 0n   // admin has enabled the option
  const userChoseInstant = instantMode && initLiqRaw !== ''
  const initLiqUsdc   = parseUsdc(initLiqRaw)    // bigint in 6 dec
  const initLiqUsd    = Number(initLiqUsdc) / 1e6

  /* Total USDC the creator must have approved: launch fee + initial liquidity (instant mode) */
  const totalUsdcNeeded = fee + (userChoseInstant ? initLiqUsdc : 0n)

  const { data: usdcBal } = useReadContract({
    address:USDC_ADDRESS, abi:erc20Abi, functionName:'balanceOf',
    args:address?[address]:undefined, chainId:CHAIN_ID as any, query:{enabled:!!address},
  })
  const usdcBalance = (usdcBal as bigint) ?? 0n

  const { data: usdcAllow } = useReadContract({
    address:USDC_ADDRESS, abi:erc20Abi, functionName:'allowance',
    args:address&&FACTORY_ADDRESS?[address,FACTORY_ADDRESS]:undefined,
    chainId:CHAIN_ID as any, query:{enabled:!!address&&!!FACTORY_ADDRESS},
  })
  const usdcAllowance  = (usdcAllow as bigint) ?? 0n
  const needApprove    = totalUsdcNeeded > 0n && usdcAllowance < totalUsdcNeeded
  const canAfford      = usdcBalance >= totalUsdcNeeded
  const canSubmit      = !!form.name.trim() && !!form.symbol.trim() && canAfford && !overLimit
                      && (!userChoseInstant || initLiqUsdc > 0n)

  /* wagmi writes */
  const { writeContract, isPending } = useWriteContract()
  const { isLoading: appConf, isSuccess: appDone } = useWaitForTransactionReceipt({ hash: approveTx })
  const { isLoading: lnchConf, isSuccess: lnchDone } = useWaitForTransactionReceipt({ hash: launchTx })

  useEffect(()=>{ if(appDone && txStep==='approving') doLaunch() },[appDone])
  const { data: lnchReceipt } = useWaitForTransactionReceipt({ hash: launchTx })
  useEffect(()=>{
    if (!lnchDone || !lnchReceipt) return
    setTxStep('done')
    // Extract the deployed token address from the TokenLaunched event log (topic[1])
    const log = lnchReceipt.logs?.find((l: any) => l.topics?.[0]?.toLowerCase().startsWith('0x'))
    const tokenAddr = log?.topics?.[1]
      ? '0x' + log.topics[1].slice(26)   // ABI-decode address from topic
      : ''
    if (tokenAddr) setLaunched(tokenAddr)

    // wallet_watchAsset — adds token to MetaMask/Coinbase/Rainbow with logo instantly
    const logoUrl = form.imageUri
      ? (form.imageUri.startsWith('ipfs://')
          ? `https://gateway.pinata.cloud/ipfs/${form.imageUri.slice(7)}`
          : form.imageUri)
      : ''
    if (tokenAddr && (window as any).ethereum) {
      ;(window as any).ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: tokenAddr,
            symbol:  form.symbol.toUpperCase().slice(0, 11),
            decimals: 18,
            image:   logoUrl,
          },
        },
      }).catch(() => {}) // silent — user may dismiss
    }
  }, [lnchDone, lnchReceipt])

  const busy = isPending || appConf || lnchConf

  /* helpers */
  const up = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) =>
    setForm(f=>({...f,[k]:e.target.value}))

  const applyMode = (id: string) => {
    setAllocMode(id)
    const m = ALLOC_MODES.find(x=>x.id===id)
    if (m && m.curve !== -1) { setCurve(m.curve); setCr(m.creator) }
  }

  const reset = useCallback(()=>{
    setForm(INIT); setSI(2); setCS('')
    applyMode('community')
  },[])

  const doApprove = () => {
    setTxStep('approving')
    // Approve the full amount: creation fee + initial liquidity (if instant mode)
    writeContract(
      {address:USDC_ADDRESS,abi:erc20Abi,functionName:'approve',args:[FACTORY_ADDRESS as any, totalUsdcNeeded],chainId:CHAIN_ID as any} as any,
      {onSuccess:h=>setAppTx(h),onError:(e:any)=>{setTxStep('form');toast.error(parseOnchainError(e))}}
    )
  }

  const doLaunch = () => {
    if (!FACTORY_ADDRESS) { toast.error('Factory address not set'); return }
    setTxStep('launching')
    writeContract({
      address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'launchToken',
      args:[{
        name:form.name.trim(), symbol:form.symbol.trim().toUpperCase(),
        description:form.description, imageUri:form.imageUri,
        twitter:form.twitter, telegram:form.telegram, website:form.website,
        totalSupply:supply, curveAllocationBps:BigInt(curveBps),
        creatorAllocationBps:BigInt(creatorBps),
        graduationThresholdUsdc: grad,
        initialLiquidityUsdc:    userChoseInstant ? initLiqUsdc : 0n,
        pairToken:  (pairToken && pairToken !== '' && pairToken !== 'EURC') ? pairToken as `0x${string}` : ZERO_ADDR,
        mintable,   burnable,   pausable: false,   hasBlacklist,
        maxSupply:  mintable ? supply * 2n : 0n,   // allow up to 2x if mintable
        vestingDuration: vestingDays ? BigInt(Math.round(parseFloat(vestingDays) * 86400)) : 0n,
        vestingCliff:    vestingCliffDays ? BigInt(Math.round(parseFloat(vestingCliffDays) * 86400)) : 0n,
      }],
      chainId:CHAIN_ID as any,
    } as any, {
      onSuccess:h=>setLTx(h),
      onError:(e:any)=>{setTxStep('form');toast.error(parseOnchainError(e))},
    })
  }

  const handleSubmit = () => {
    if (!isConnected) { toast.error('Connect wallet first'); return }
    if (chainId !== CHAIN_ID) { switchChain({chainId:CHAIN_ID as any}); return }
    if (!form.name.trim()||!form.symbol.trim()) { toast.error('Name and symbol required'); return }
    if (userChoseInstant && initLiqUsdc === 0n) { toast.error('Enter initial liquidity USDC to seed Uniswap'); return }
    if (!canAfford) { toast.error(`Need ${fmtUsdc(totalUsdcNeeded)} USDC to launch`); return }
    if (curveBps < 5000) { toast.error('Curve allocation must be at least 50%'); return }
    if (curveBps > 9500) { toast.error('Curve allocation cannot exceed 95%'); return }
    if (creatorBps > 1000) { toast.error('Creator allocation cannot exceed 10%'); return }
    if (curveBps + creatorBps > 9500) { toast.error(`Curve + creator cannot exceed 95%`); return }
    needApprove ? doApprove() : doLaunch()
  }

  /* preview */
  const hue     = form.name ? (form.name.charCodeAt(0)*37)%360 : 260
  const initials= form.symbol ? form.symbol.slice(0,2).toUpperCase() : '??'
  /* checklist */
  const checks = [
    { label:'Token name',    done:!!form.name.trim()      },
    { label:'Ticker symbol', done:!!form.symbol.trim()    },
    { label:'Logo uploaded', done:!!form.imageUri         },
    { label:'Description',   done:!!form.description.trim()},
    { label:'Social links',  done:!!(form.twitter||form.telegram||form.website) },
    { label:'Enough USDC',   done: canAfford              },
  ]
  const checksDone = checks.filter(c=>c.done).length

  /* ══ SUCCESS ══════════════════════════════════════════════════════ */
  if (txStep==='done') return (
    <div className="min-h-[70vh] flex items-center justify-center py-8">
      <motion.div initial={{scale:0.85,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:200}}
        className="max-w-sm w-full mx-auto text-center px-4 space-y-4">
        <motion.div animate={{y:[0,-14,0]}} transition={{repeat:Infinity,duration:2.4,ease:'easeInOut'}}>
          <Rocket size={52} className="mx-auto" style={{color:'#818cf8'}}/>
        </motion.div>

        <div>
          <h2 className="text-3xl font-black mb-1.5"
            style={{fontFamily:'Space Grotesk,sans-serif',letterSpacing:'-0.03em',color:'var(--text1)'}}>
            Token Launched!
          </h2>
          <p className="text-sm" style={{color:'var(--text2)'}}>
            <strong style={{color:'var(--text1)'}}>${form.symbol.toUpperCase()}</strong> is live on Arc Mainnet
          </p>
          <p className="text-xs mt-1 tabular-nums" style={{color:'var(--text3)'}}>
            {fmt(supply)} supply · {curvePct.toFixed(0)}% curve · {creatorPct.toFixed(0)}% creator
          </p>
        </div>

        {/* Token address */}
        {launchedAddr && (
          <div className="rounded-xl px-3 py-2.5 text-left" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{color:'var(--text2)'}}>Token Address</p>
            <p className="text-[10px] font-mono break-all" style={{color:'var(--accent)'}}>{launchedAddr}</p>
          </div>
        )}

        {/* wallet_watchAsset button */}
        {launchedAddr && (window as any).ethereum && (
          <button
            onClick={()=>{
              const logoUrl = form.imageUri?.startsWith('ipfs://')
                ? `https://gateway.pinata.cloud/ipfs/${form.imageUri.slice(7)}`
                : (form.imageUri || '')
              ;(window as any).ethereum.request({
                method:'wallet_watchAsset',
                params:{ type:'ERC20', options:{ address:launchedAddr, symbol:form.symbol.toUpperCase().slice(0,11), decimals:18, image:logoUrl }}
              }).catch(()=>{})
            }}
            className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
            style={{background:'rgba(99,102,241,0.1)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.25)'}}>
            <Zap size={14}/> Add to Wallet with Logo
          </button>
        )}

        {/* Logo visibility info */}
        <div className="rounded-xl p-3 text-left space-y-2" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Logo Visibility</p>
          {[
            { Icon:Check,      color:'var(--green)', label:'contractURI()',     desc:'Wallets that support ERC-7572 show your logo immediately' },
            { Icon:Check,      color:'var(--green)', label:'wallet_watchAsset', desc:'MetaMask/Coinbase/Rainbow — click "Add to Wallet" above' },
            { Icon:ArrowRight, color:'#818cf8',       label:'DexScreener',       desc:'Auto-detected once trading activity appears' },
            { Icon:Hash,       color:'var(--text3)',  label:'Token List',        desc:`Add ${window.location.origin}/api/token-list.json to Uniswap` },
          ].map(({Icon,color,label,desc})=>(
            <div key={label} className="flex items-start gap-2">
              <Icon size={12} style={{color,flexShrink:0,marginTop:2}}/>
              <div>
                <span className="text-[10px] font-bold" style={{color:'var(--text1)'}}>{label}</span>
                <span className="text-[9px] ml-1" style={{color:'var(--text2)'}}>{desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Copy token list URL */}
        <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <span className="text-[9px] font-bold flex-shrink-0" style={{color:'var(--text2)'}}>Token List:</span>
          <span className="text-[9px] font-mono flex-1 truncate" style={{color:'var(--accent)'}}>
            {window.location.origin}/api/token-list.json
          </span>
          <button onClick={()=>navigator.clipboard.writeText(`${window.location.origin}/api/token-list.json`).then(()=>toast.success('Copied!'))}
            className="text-[9px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
            style={{background:'rgba(99,102,241,0.1)',color:'#818cf8'}}>Copy</button>
        </div>

        <div className="flex flex-col gap-2.5">
          {launchedAddr
            ? <button onClick={()=>navigate(`/token/${launchedAddr}`)}
                className="py-3.5 rounded-2xl text-sm font-bold text-white"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 24px rgba(99,102,241,0.35)'}}>
                View My Token <ArrowRight size={14} className="inline ml-1"/>
              </button>
            : <button onClick={()=>navigate('/')}
                className="py-3.5 rounded-2xl text-sm font-bold text-white"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                View All Tokens <ArrowRight size={14} className="inline ml-1"/>
              </button>}
          <button onClick={()=>{reset();setTxStep('form')}}
            className="py-3 rounded-2xl text-sm font-semibold"
            style={{background:'var(--surface2)',color:'var(--text1)',border:'1px solid var(--border)'}}>
            Launch Another
          </button>
        </div>
      </motion.div>
    </div>
  )

  /* ══ MAIN FORM ════════════════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1" style={{background:'var(--border)'}}/>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{color:'var(--text3)'}}>Launch</span>
          <div className="h-px flex-1" style={{background:'var(--border)'}}/>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black leading-none"
              style={{fontFamily:'Space Grotesk,sans-serif',letterSpacing:'-0.03em',color:'var(--text1)'}}>
              Create a token
            </h1>
            <p className="text-sm mt-2" style={{color:'var(--text2)'}}>
              Fair launch bonding curve · USDC powered · No liquidity needed
            </p>
          </div>
          <button onClick={reset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
            style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)'}}>
            <RotateCcw size={11}/> Reset
          </button>
        </div>
      </div>

      {/* ── Insufficient balance warning only ── */}
      {isConnected && fee > 0n && !canAfford && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-5"
          style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.18)'}}>
          <AlertTriangle size={13} style={{color:'var(--red)',flexShrink:0}}/>
          <div className="text-xs" style={{color:'var(--red)'}}>
            You need {fmtUsdc(fee - usdcBalance)} more USDC to launch. Your balance: {fmtUsdc(usdcBalance)}
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">

        {/* ═══ LEFT: Form sections ═════════════════════════════════ */}
        <div className="space-y-5">

          {/* ─── 1. Coin Details ─── */}
          <Section title="Coin details" icon={Zap} iconColor="#818cf8" step={1}
            subtitle="Basic identity of your token — shown across the platform">

            {/* Image + core fields: side by side on sm+ */}
            <div className="flex flex-col sm:flex-row gap-5">

              {/* Logo upload — compact square */}
              <div className="flex-shrink-0 sm:w-[148px]">
                <Label text="Token logo" tip="Square image. Pinned to IPFS permanently via Pinata."/>
                <ImageUpload value={form.imageUri} onChange={url=>setForm(f=>({...f,imageUri:url}))}
                  label=""/>
              </div>

              {/* Right: name, ticker, description */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label text="Token name" required tip="The full display name, e.g. 'Glow Cat'"/>
                    <input className={inCls} style={{...inSt,...inFocus}}
                      placeholder="e.g. Glow Cat" value={form.name} onChange={up('name')} maxLength={64}/>
                  </div>
                  <div>
                    <Label text="Ticker" required tip="Short symbol, uppercase. Max 12 characters."/>
                    <input className={`${inCls} uppercase font-mono tracking-wider`} style={{...inSt,...inFocus}}
                      placeholder="GCAT" value={form.symbol} onChange={up('symbol')} maxLength={12}/>
                  </div>
                </div>
                <div>
                  <Label text="Description" tip="Shown on the token page. Max 500 characters."/>
                  <div className="relative">
                    <textarea className={`${inCls} resize-none`} style={{...inSt,...inFocus,minHeight:90}}
                      placeholder="Tell the world about your token…"
                      value={form.description} onChange={up('description') as any} maxLength={500}/>
                    <span className="absolute bottom-2 right-3 text-[9px] tabular-nums"
                      style={{color:'var(--text3)'}}>{form.description.length}/500</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Optional banner */}
            <div className="mt-4">
              <button type="button" onClick={()=>setBanner(v=>!v)}
                className="flex items-center gap-2 text-xs font-semibold py-1"
                style={{color: showBanner ? '#818cf8' : 'var(--text2)'}}>
                <ChevronDown size={13} style={{transform:showBanner?'rotate(180deg)':'none',transition:'transform 0.2s'}}/>
                Banner image
                <span className="font-normal text-[10px]" style={{color:'var(--text3)'}}>(optional)</span>
                {form.bannerUri && <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1"/>}
              </button>
              <AnimatePresence>
                {showBanner && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                    style={{overflow:'hidden'}}>
                    <div className="pt-3 space-y-2">
                      <p className="text-[10px]" style={{color:'var(--text3)'}}>
                        Wide banner shown at the top of your token page (16:5 ratio recommended). Pinned to IPFS.
                      </p>
                      <ImageUpload value={form.bannerUri} onChange={url=>setForm(f=>({...f,bannerUri:url}))} label=""/>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Socials collapsible */}
            <div className="mt-4">
              <button type="button" onClick={()=>setSoc(v=>!v)}
                className="flex items-center gap-2 text-xs font-semibold py-1"
                style={{color: showSocials ? '#818cf8' : 'var(--text2)'}}>
                <ChevronDown size={13} style={{transform:showSocials?'rotate(180deg)':'none',transition:'transform 0.2s'}}/>
                Social links
                <span className="font-normal text-[10px]" style={{color:'var(--text3)'}}>(optional)</span>
                {(form.twitter||form.telegram||form.website||form.discord) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1"/>
                )}
              </button>

              <AnimatePresence>
                {showSocials && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                    style={{overflow:'hidden'}}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                      {([
                        ['twitter',  'Twitter / X',  Twitter,        '@handle or full URL',  '#1DA1F2'],
                        ['telegram', 'Telegram',     Send,           't.me/yourcommunity',    '#0088cc'],
                        ['website',  'Website',      Globe,          'https://yoursite.com',  '#22c55e'],
                        ['discord',  'Discord',      MessageCircle,  'discord.gg/yourserver', '#5865F2'],
                      ] as const).map(([k,label,Icon,ph,ic])=>(
                        <div key={k}>
                          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1.5"
                            style={{color:'var(--text2)'}}>
                            <Icon size={10} style={{color:ic}}/>{label}
                          </label>
                          <input className={inCls} style={{...inSt,...inFocus}}
                            placeholder={ph} value={(form as any)[k]}
                            onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Section>

          {/* ─── 2. Tokenomics ─── */}
          <Section title="Tokenomics" icon={TrendingUp} iconColor="#22c55e" step={2}
            subtitle="Configure total supply and how your token reaches a DEX">

            {/* Total supply */}
            <div className="mb-6">
              <Label text="Total supply" tip="Total tokens that will ever exist. Higher supply = lower initial price per token."/>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {SUPPLIES.map((s,i)=>(
                  <button key={s.label} type="button" onClick={()=>{setSI(i);setCS('')}}
                    className="relative py-3 rounded-xl text-center transition-all"
                    style={{
                      background: supplyIdx===i ? `${s.color}15` : 'var(--surface2)',
                      border:`1px solid ${supplyIdx===i ? `${s.color}40` : 'var(--border)'}`,
                    }}>
                    {s.star && (
                      <Star size={7} className="absolute top-1.5 right-1.5"
                        style={{color:s.color,fill:s.color}}/>
                    )}
                    <div className="text-[12px] font-bold"
                      style={{color: supplyIdx===i ? s.color : 'var(--text1)'}}>{s.label}</div>
                    <div className="text-[9px] mt-0.5"
                      style={{color: supplyIdx===i ? `${s.color}cc` : 'var(--text3)'}}>{s.desc}</div>
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {isCSup && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                    style={{overflow:'hidden'}}>
                    <div className="relative mt-2.5">
                      <Hash size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{color:'var(--text3)'}}/>
                      <input className={`${inCls} pl-8`} style={{...inSt,...inFocus}}
                        type="number" min={1} step={0.1}
                        placeholder="Supply in billions (e.g. 2.5 = 2,500,000,000)"
                        value={customSup} onChange={e=>setCS(e.target.value)}/>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{color:'var(--text3)'}}>B</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


            {/* Listing mode selector */}
            <div className="mt-2">
              <Label text="Listing mode" tip="Choose how your token gets to a DEX."/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {/* Option A: Bonding curve */}
                <button type="button"
                  onClick={()=>setInitLiq('')}
                  className="p-4 rounded-2xl text-left transition-all"
                  style={{
                    background: initLiqRaw==='' ? 'rgba(99,102,241,0.08)' : 'var(--surface2)',
                    border: `1.5px solid ${initLiqRaw==='' ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{background:'rgba(99,102,241,0.12)'}}>
                      <TrendingUp size={13} style={{color:'#818cf8'}}/>
                    </div>
                    {initLiqRaw==='' && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{background:'#6366f1'}}>
                        <Check size={9} style={{color:'#fff'}}/>
                      </div>
                    )}
                  </div>
                  <p className="text-[12px] font-bold mb-1" style={{color:'var(--text1)'}}>Raise on Bonding Curve</p>
                  <p className="text-[10px] leading-relaxed" style={{color:'var(--text2)'}}>
                    Raise liquidity through trading. Token auto-lists on a DEX when the curve fills.
                  </p>
                </button>

                {/* Option B: Instant listing — always visible */}
                <button type="button"
                  onClick={()=>{ if(!initLiqRaw) setInitLiq('500') }}
                  className="p-4 rounded-2xl text-left transition-all"
                  style={{
                    background: initLiqRaw!=='' ? 'rgba(245,158,11,0.08)' : 'var(--surface2)',
                    border: `1.5px solid ${initLiqRaw!=='' ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                    opacity: !instantMode ? 0.5 : 1,
                    cursor: !instantMode ? 'not-allowed' : 'pointer',
                  }}
                  disabled={!instantMode}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{background:'rgba(245,158,11,0.12)'}}>
                      <Rocket size={13} style={{color:'#f59e0b'}}/>
                    </div>
                    {initLiqRaw!=='' && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{background:'#f59e0b'}}>
                        <Check size={9} style={{color:'#fff'}}/>
                      </div>
                    )}
                    {!instantMode && (
                      <Lock size={11} style={{color:'var(--text3)'}}/>
                    )}
                  </div>
                  <p className="text-[12px] font-bold mb-1" style={{color: initLiqRaw!=='' ? '#f59e0b' : 'var(--text1)'}}>Seed Initial Liquidity</p>
                  <p className="text-[10px] leading-relaxed" style={{color:'var(--text2)'}}>
                    {instantMode
                      ? 'Deposit USDC to seed a Uniswap pool at launch. Token is tradeable immediately.'
                      : 'Disabled — admin has not enabled instant listing yet.'}
                  </p>
                </button>
              </div>

              {/* Instant listing USDC input — shown when selected */}
              {instantMode && initLiqRaw!=='' && (
                <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                  className="rounded-2xl p-4 space-y-4"
                  style={{background:'rgba(245,158,11,0.04)',border:'1px solid rgba(245,158,11,0.18)'}}>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      {Icon:Zap,       label:'You deposit',   val:initLiqUsd>0?`$${initLiqUsd.toFixed(0)} USDC`:'—'},
                      {Icon:Settings2, label:'Pool tokens',   val:initLiqUsd>0?`${dexPct.toFixed(0)}% supply`:'—'},
                      {Icon:TrendingUp,label:'Opening price', val:initLiqUsd>0&&Number(dexTokens)>0?`$${(initLiqUsd/(Number(dexTokens)/1e18)).toFixed(8).replace(/0+$/,'')}`:'—'},
                    ].map(({Icon,label,val})=>(
                      <div key={label} className="rounded-xl p-2.5"
                        style={{background:'var(--surface2)',border:'1px solid var(--border)'}}>
                        <div className="flex justify-center mb-1.5">
                          <Icon size={13} style={{color:'#f59e0b'}}/>
                        </div>
                        <div className="text-[8.5px] font-semibold uppercase tracking-widest mb-0.5"
                          style={{color:'var(--text2)'}}>{label}</div>
                        <div className="text-[11px] font-bold" style={{color:'var(--text1)'}}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* USDC input */}
                  <div>
                    <Label text="Initial liquidity (USDC)" required
                      tip="Seeds your Uniswap pool. More liquidity means less price impact for buyers."/>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-sm"
                        style={{color:'var(--text3)'}}>$</span>
                      <input className={`${inCls} pl-7`} style={{...inSt,...inFocus}}
                        type="number" min={1} step={10}
                        placeholder="e.g. 500"
                        value={initLiqRaw} onChange={e=>setInitLiq(e.target.value)}/>
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{color:'var(--text2)'}}>USDC</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {['100','500','1000','5000'].map(v=>(
                        <button key={v} type="button" onClick={()=>setInitLiq(v)}
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                          style={{
                            background:initLiqRaw===v?'rgba(245,158,11,0.12)':'var(--surface2)',
                            color:initLiqRaw===v?'var(--gold)':'var(--text2)',
                            border:`1px solid ${initLiqRaw===v?'rgba(245,158,11,0.3)':'var(--border)'}`,
                          }}>
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </Section>

          {/* ─── 3. Token Features ─── */}
          <Section title="Token Features" icon={Zap} iconColor="#818cf8" step={3}
            subtitle="Optional capabilities baked into your token's bytecode at deploy time">
            <div className="space-y-5">

              {/* Feature toggles — 2 col, compact */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  {
                    key: 'mintable', label: 'Mintable',
                    Icon: PlusCircle, color: '#6366f1',
                    desc: 'Owner can increase total supply after launch',
                    val: mintable, set: setMintable,
                  },
                  {
                    key: 'burnable', label: 'Burnable',
                    Icon: Flame, color: '#ef4444',
                    desc: 'Holders can permanently destroy their tokens',
                    val: burnable, set: setBurnable,
                  },
                  {
                    key: 'hasBlacklist', label: 'Compliance',
                    Icon: ShieldCheck, color: '#22c55e',
                    desc: 'Restrict specific wallets — aligns with Arc institutional standards',
                    val: hasBlacklist, set: setBlacklist,
                  },
                ] as const).map(({ key, label, Icon, color, desc, val, set }) => (
                  <button key={key} type="button" onClick={() => set((v: boolean) => !v)}
                    className="p-3 rounded-xl text-left transition-all"
                    style={{
                      background: val ? `${color}0d` : 'var(--surface2)',
                      border: `1px solid ${val ? `${color}35` : 'var(--border)'}`,
                    }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: val ? `${color}18` : 'var(--surface3)' }}>
                        <Icon size={12} style={{ color: val ? color : 'var(--text3)' }} />
                      </div>
                      <div className="w-8 h-4 rounded-full relative transition-colors flex-shrink-0"
                        style={{ background: val ? color : 'var(--surface3)' }}>
                        <div className="w-3 h-3 rounded-full bg-white absolute top-[2px] shadow-sm transition-all"
                          style={{ left: val ? '17px' : '2px' }} />
                      </div>
                    </div>
                    <p className="text-[11px] font-bold mb-0.5" style={{ color: val ? color : 'var(--text1)' }}>{label}</p>
                    <p className="text-[9.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>{desc}</p>
                  </button>
                ))}

                {/* Mintable cap notice — only shown when mintable is on */}
                {mintable && (
                  <div className="col-span-2 flex items-start gap-2.5 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                    <Info size={12} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
                    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text2)' }}>
                      Mintable tokens allow the owner to increase supply after launch. The max supply cap is set to 2× total supply at deploy. Future mints require an on-chain transaction.
                    </p>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Pair token selector */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--text2)' }}>
                  Pair Token
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { addr: '', name: 'USDC', sub: 'USD Coin · Circle', logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
                    { addr: 'EURC', name: 'EURC', sub: 'Euro Coin · Circle', logo: 'https://assets.coingecko.com/coins/images/26045/small/euro-coin.png' },
                  ] as const).map(({ addr, name, sub, logo }) => {
                    const active = pairToken === addr
                    return (
                      <button key={addr} type="button" onClick={() => setPairToken(addr)}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                        style={{
                          background: active ? 'rgba(99,102,241,0.08)' : 'var(--surface2)',
                          border: `1.5px solid ${active ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                        }}>
                        <img src={logo} alt={name} className="w-7 h-7 rounded-full flex-shrink-0"
                          style={{ border: '1px solid var(--border)' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        <div>
                          <p className="text-[12px] font-black" style={{ color: active ? '#818cf8' : 'var(--text1)' }}>{name}</p>
                          <p className="text-[9px] mt-0.5" style={{ color: 'var(--text2)' }}>{sub}</p>
                        </div>
                        {active && (
                          <div className="ml-auto w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
                            <Check size={9} style={{ color: '#fff' }} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Vesting for creator tokens — optional, only if creator allocation > 0 */}
              {creatorBps > 0 && (
                <div className="rounded-xl overflow-hidden" style={{border:'1px solid var(--border)'}}>
                  {/* Header row with toggle */}
                  <button type="button"
                    onClick={()=>{ if(vestingDays) { setVestingDays(''); setVCliff('') } else setVestingDays('365') }}
                    className="w-full flex items-center justify-between p-3"
                    style={{background:'var(--surface2)'}}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{background: vestingDays ? 'rgba(99,102,241,0.15)' : 'var(--surface3)'}}>
                        <Lock size={12} style={{color: vestingDays ? '#818cf8' : 'var(--text3)'}}/>
                      </div>
                      <div className="text-left">
                        <p className="text-[11px] font-bold" style={{color: vestingDays ? '#818cf8' : 'var(--text1)'}}>Creator Token Vesting</p>
                        <p className="text-[9px]" style={{color:'var(--text2)'}}>Optional — lock your tokens to build buyer trust</p>
                      </div>
                    </div>
                    <div className="w-8 h-4 rounded-full relative transition-colors flex-shrink-0"
                      style={{background: vestingDays ? '#6366f1' : 'var(--surface3)'}}>
                      <div className="w-3 h-3 rounded-full bg-white absolute top-[2px] shadow-sm transition-all"
                        style={{left: vestingDays ? '17px' : '2px'}}/>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {vestingDays && (
                    <div className="p-3 space-y-3" style={{background:'rgba(99,102,241,0.04)', borderTop:'1px solid var(--border)'}}>

                      {/* Explanation */}
                      <div className="flex items-start gap-2 p-2.5 rounded-lg"
                        style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.12)'}}>
                        <Info size={11} style={{color:'#818cf8',flexShrink:0,marginTop:1}}/>
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold" style={{color:'#818cf8'}}>What is vesting?</p>
                          <p className="text-[9.5px] leading-relaxed" style={{color:'var(--text2)'}}>
                            You have a <strong style={{color:'var(--text1)'}}>{(creatorBps/100).toFixed(0)}% creator allocation</strong> — {Math.round(Number(supply)/1e18 * creatorBps / 10000).toLocaleString()} tokens sent to your wallet at launch.
                          </p>
                          <p className="text-[9.5px] leading-relaxed" style={{color:'var(--text2)'}}>
                            Without vesting, you could sell all of them instantly — which buyers see as a risk. With vesting, your tokens are locked on-chain and released gradually over time. This signals long-term commitment and increases buyer confidence.
                          </p>
                          <p className="text-[9.5px] leading-relaxed" style={{color:'var(--text2)'}}>
                            <strong style={{color:'var(--text1)'}}>Duration</strong> — how many days until all your tokens are fully unlocked.<br/>
                            <strong style={{color:'var(--text1)'}}>Cliff</strong> — a waiting period before any tokens unlock at all. During the cliff, nothing is released even if the vesting has started.
                          </p>
                        </div>
                      </div>

                      {/* Inputs */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest block mb-1" style={{color:'var(--text2)'}}>Duration (days)</label>
                          <input type="number" min={1} step={1} placeholder="e.g. 365"
                            value={vestingDays} onChange={e=>setVestingDays(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-[12px] outline-none"
                            style={{background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text1)'}}/>
                          <p className="text-[8.5px] mt-1" style={{color:'var(--text3)'}}>How long until fully unlocked</p>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase tracking-widest block mb-1" style={{color:'var(--text2)'}}>Cliff (days)</label>
                          <input type="number" min={0} step={1} placeholder="e.g. 90"
                            value={vestingCliffDays} onChange={e=>setVCliff(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-[12px] outline-none"
                            style={{background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text1)'}}/>
                          <p className="text-[8.5px] mt-1" style={{color:'var(--text3)'}}>Wait before any tokens unlock</p>
                        </div>
                      </div>

                      {/* Summary line */}
                      {vestingDays && (
                        <p className="text-[9px] flex items-center gap-1.5 font-medium" style={{color:'var(--green)'}}>
                          <Check size={10}/>
                          {vestingCliffDays ? `${vestingCliffDays}-day cliff, then ` : ''}linear release over {vestingDays} days
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ─── 4. Advanced ─── */}
          <Section title="Advanced settings" icon={Settings2} iconColor="#f59e0b"
            badge="Optional" step={3}
            subtitle="Token allocation split — how supply is distributed across curve, DEX, and creator">

            {/* Mode pills */}
            <div className="mb-5">
              <Label text="Allocation mode"
                tip="Presets that determine how the token supply is split. Each share stops where the others leave off."/>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {ALLOC_MODES.map(m=>(
                  <button key={m.id} type="button" onClick={()=>applyMode(m.id)}
                    className="py-3 px-2 rounded-xl text-left transition-all"
                    style={{
                      background: allocMode===m.id ? `${m.color}15` : 'var(--surface2)',
                      border:`1px solid ${allocMode===m.id ? `${m.color}40` : 'var(--border)'}`,
                    }}>
                    <div className="text-[11px] font-bold leading-tight"
                      style={{color: allocMode===m.id ? m.color : 'var(--text1)'}}>{m.label}</div>
                    <div className="text-[9px] mt-0.5 leading-tight"
                      style={{color: allocMode===m.id ? `${m.color}99` : 'var(--text3)'}}>{m.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders + Donut */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_150px] gap-5 items-start">

              {/* Sliders */}
              <div className="space-y-5">

                {/* Curve */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:'#6366f1'}}/>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Curve allocation</span>
                      <Tip text="Tokens sold on the bonding curve. Higher = more tokens available before graduation."/>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums px-2.5 py-1 rounded-lg"
                      style={{background:'rgba(99,102,241,0.1)',color:'#818cf8'}}>
                      {curvePct.toFixed(0)}%
                    </span>
                  </div>
                  <input type="range" min={5000} max={9500} step={100} value={curveBps}
                    onChange={e=>{setCurve(Number(e.target.value));setAllocMode('custom')}}
                    className="w-full h-1.5 rounded-full accent-indigo-500 cursor-pointer"/>
                  <div className="flex justify-between text-[9px] mt-1" style={{color:'var(--text3)'}}>
                    <span>50%</span><span style={{color:'#6366f1'}}>now: {curvePct.toFixed(0)}%</span><span>95%</span>
                  </div>
                </div>

                {/* Creator */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:'#f59e0b'}}/>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Creator allocation</span>
                      <Tip text="Tokens sent directly to your wallet at launch. May be subject to a lock period."/>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums px-2.5 py-1 rounded-lg"
                      style={{
                        background: creatorBps>0 ? 'rgba(245,158,11,0.1)' : 'var(--surface2)',
                        color: creatorBps>0 ? '#f59e0b' : 'var(--text3)',
                      }}>
                      {creatorPct.toFixed(0)}%
                    </span>
                  </div>
                  <input type="range" min={0} max={1000} step={100} value={creatorBps}
                    onChange={e=>{setCr(Number(e.target.value));setAllocMode('custom')}}
                    className="w-full h-1.5 rounded-full accent-amber-500 cursor-pointer"/>
                  <div className="flex justify-between text-[9px] mt-1" style={{color:'var(--text3)'}}>
                    <span>0%</span><span>10% max</span>
                  </div>
                </div>

                {/* DEX derived */}
                <div className="flex items-center justify-between px-3.5 py-3 rounded-xl"
                  style={{background:'rgba(34,197,94,0.05)',border:'1px solid rgba(34,197,94,0.14)'}}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{background:'#22c55e'}}/>
                    <span className="text-[10px] font-semibold" style={{color:'var(--green)'}}>DEX liquidity at graduation</span>
                    <Tip text="Auto-calculated. These tokens seed the DEX liquidity pool when the token graduates."/>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums" style={{color:'var(--green)'}}>{dexPct.toFixed(1)}%</span>
                </div>

                {/* Warnings / notices */}
                <AnimatePresence>
                  {overLimit && (
                    <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                      className="flex items-start gap-2.5 p-3 rounded-xl"
                      style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)'}}>
                      <AlertTriangle size={13} style={{color:'var(--red)',flexShrink:0,marginTop:1}}/>
                      <p className="text-[11px]" style={{color:'var(--text2)'}}>
                        Allocations exceed 100%. Reduce curve or creator.
                      </p>
                    </motion.div>
                  )}
                  {creatorBps > 0 && (
                    <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                      className="flex items-start gap-2.5 p-3 rounded-xl"
                      style={{background:'rgba(245,158,11,0.05)',border:'1px solid rgba(245,158,11,0.15)'}}>
                      <Lock size={12} style={{color:'#f59e0b',flexShrink:0,marginTop:1}}/>
                      <p className="text-[11px]" style={{color:'var(--text2)'}}>
                        <span style={{color:'#f59e0b',fontWeight:700}}>{fmt(creatorTokens)} tokens ({creatorPct.toFixed(0)}%)</span>{' '}
                        will be sent to your wallet. This is visible to buyers — high creator allocations reduce trust.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Donut */}
              <div className="flex flex-col items-center gap-4">
                <div className="w-32 h-32">
                  <Donut curve={curvePct} creator={creatorPct} dex={dexPct}/>
                </div>
                <div className="w-full space-y-1.5">
                  {[
                    {color:'#6366f1',label:'Curve',   val:pct(curvePct)  },
                    {color:'#f59e0b',label:'Creator',  val:pct(creatorPct)},
                    {color:'#22c55e',label:'DEX liq.', val:pct(dexPct)    },
                  ].map(({color,label,val})=>(
                    <div key={label} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{background:color}}/>
                        <span style={{color:'var(--text2)'}}>{label}</span>
                      </div>
                      <span className="font-bold tabular-nums" style={{color:'var(--text1)'}}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ─── Submit ─── */}
          <div className="space-y-3 pb-8">
            {!isConnected ? (
              <div className="flex flex-col items-center gap-3 p-5 rounded-2xl"
                style={{background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.15)'}}>
                <p className="text-sm font-semibold text-center" style={{color:'var(--text2)'}}>
                  Connect your wallet to launch
                </p>
                <ConnectKitButton/>
              </div>
            ) : chainId !== CHAIN_ID ? (
              <button type="button" onClick={()=>switchChain({chainId:CHAIN_ID as any})}
                className="w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',color:'var(--gold)'}}>
                <AlertTriangle size={15}/> Switch to Arc Mainnet
              </button>
            ) : (
              <motion.button type="button"
                whileHover={{scale: busy||!canSubmit ? 1 : 1.01}}
                whileTap={{scale: busy||!canSubmit ? 1 : 0.98}}
                onClick={handleSubmit}
                disabled={busy || !canSubmit}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 24px rgba(99,102,241,0.3)'}}>
                {busy
                  ? <><Loader2 size={16} className="animate-spin"/>{txStep==='approving' ? 'Approving USDC…' : 'Launching token…'}</>
                  : needApprove
                    ? <><ShieldCheck size={16}/>Approve USDC &amp; Launch</>
                    : <><Rocket size={16}/>Launch Token<ArrowRight size={14}/></>
                }
              </motion.button>
            )}
            {needApprove && !busy && isConnected && (
              <p className="text-center text-[11px]" style={{color:'var(--text3)'}}>
                Step 1 of 2 — approve USDC, then the launch fires automatically
              </p>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Sticky preview ═══════════════════════════════ */}
        <div className="xl:sticky xl:top-20 space-y-4 self-start">

          {/* ─── Token preview card ─── */}
          <div className="rounded-2xl overflow-hidden"
            style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="px-4 py-2.5 flex items-center justify-between"
              style={{borderBottom:'1px solid var(--border)'}}>
              <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--text3)'}}>
                Token Preview
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                style={{background:'rgba(34,197,94,0.1)',color:'var(--green)'}}>Live</span>
            </div>

            {/* Hero */}
            <div className="relative h-36 overflow-hidden"
              style={{background: form.bannerUri ? 'black' : `linear-gradient(135deg,hsl(${hue},55%,25%),hsl(${(hue+120)%360},50%,20%))`}}>
              {/* Banner fills background; logo is NOT used as background */}
              {form.bannerUri && (
                <img src={form.bannerUri} className="w-full h-full object-cover opacity-80"
                  onError={e=>(e.currentTarget.style.display='none')}/>
              )}
              {!form.bannerUri && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Image size={36} style={{color:'rgba(255,255,255,0.06)'}}/>
                </div>
              )}
              {/* gradient overlay */}
              <div className="absolute inset-0" style={{background:'linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 55%)'}}/>

              {/* Name overlay */}
              <div className="absolute bottom-3 left-4 flex items-end gap-2.5">
                {form.imageUri
                  ? <img src={form.imageUri} className="w-10 h-10 rounded-xl object-cover border-2 flex-shrink-0"
                      style={{borderColor:'rgba(255,255,255,0.2)'}}
                      onError={e=>(e.currentTarget.style.display='none')}/>
                  : <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                      style={{background:`linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,40%))`}}>{initials}</div>
                }
                <div>
                  <div className="text-sm font-black text-white leading-none"
                    style={{fontFamily:'Space Grotesk',textShadow:'0 1px 6px rgba(0,0,0,0.7)'}}>
                    {form.name || 'Token Name'}
                  </div>
                  <div className="text-[11px] font-bold" style={{color:'#a5b4fc',textShadow:'0 1px 4px rgba(0,0,0,0.6)'}}>
                    ${form.symbol || 'SYMBOL'}
                  </div>
                </div>
              </div>

              {/* Milestone badge */}
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold"
                style={{background:'rgba(0,0,0,0.55)',color:'white',backdropFilter:'blur(8px)'}}>
                0% of milestone
              </div>
            </div>

            {/* Stats grid */}
            <div className="p-4 space-y-3">
              {form.description && (
                <p className="text-[11px] leading-relaxed line-clamp-2" style={{color:'var(--text2)'}}>
                  {form.description}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:'Supply',  value: fmt(supply)                  },
                  {label:'Curve',   value: `${curvePct.toFixed(0)}%`   },
                  {label:'Creator', value: `${creatorPct.toFixed(0)}%` },
                ].map(({label,value})=>(
                  <div key={label} className="px-3 py-2 rounded-xl" style={{background:'var(--surface2)'}}>
                    <div className="text-[8px] font-semibold uppercase tracking-widest" style={{color:'var(--text3)'}}>{label}</div>
                    <div className="text-[12px] font-bold tabular-nums mt-0.5" style={{color:'var(--text1)'}}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Bonding curve bar */}
              <div>
                <div className="flex justify-between text-[9px] mb-1">
                  <span style={{color:'var(--text3)'}}>Bonding curve progress</span>
                  <span className="tabular-nums" style={{color:'var(--text3)'}}>0%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{background:'var(--surface3)'}}>
                  <div className="h-full w-0 rounded-full" style={{background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Launch summary ─── */}
          <div className="rounded-2xl overflow-hidden"
            style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="px-4 py-2.5" style={{borderBottom:'1px solid var(--border)'}}>
              <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--text3)'}}>
                Launch Summary
              </span>
            </div>
            <div className="p-4">
              {[
                {k:'Network',      v:'Arc Mainnet',              hi: false },
                {k:'Currency',     v:'USDC',                     hi: false },
                {k:'Total Supply', v:fmt(supply),                hi: false },
                {k:'Curve alloc.', v:`${curvePct.toFixed(0)}%`,  hi: false },
                {k:'Creator alloc.',v:`${creatorPct.toFixed(0)}%`,hi: creatorBps>0 },
                {k:'DEX liquidity',v:`${dexPct.toFixed(1)}%`,    hi: false },
              ].map(({k,v,hi})=>(
                <div key={k} className="flex justify-between items-center py-1.5 text-xs"
                  style={{borderBottom:'1px solid var(--border)'}}>
                  <span style={{color:'var(--text2)'}}>{k}</span>
                  <span className="font-semibold tabular-nums"
                    style={{color: hi ? '#818cf8' : 'var(--text1)'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Checklist ─── */}
          <div className="rounded-2xl p-4"
            style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--text3)'}}>
                Checklist
              </span>
              <span className="text-[10px] font-bold tabular-nums"
                style={{color: checksDone===checks.length ? 'var(--green)' : 'var(--text3)'}}>
                {checksDone}/{checks.length}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1 rounded-full overflow-hidden mb-3" style={{background:'var(--surface3)'}}>
              <motion.div className="h-full rounded-full"
                animate={{width:`${(checksDone/checks.length)*100}%`}}
                transition={{duration:0.4}}
                style={{background:'linear-gradient(90deg,#6366f1,#22c55e)'}}/>
            </div>
            <div className="space-y-1.5">
              {checks.map(({label,done})=>(
                <div key={label} className="flex items-center gap-2.5">
                  <motion.div animate={{scale:done?[1.3,1]:1}} transition={{duration:0.2}}
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: done ? 'rgba(34,197,94,0.15)' : 'var(--surface2)',
                      border:`1px solid ${done ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                    }}>
                    {done && <Check size={9} style={{color:'var(--green)'}}/>}
                  </motion.div>
                  <span className="text-[10px] transition-colors"
                    style={{color: done ? 'var(--text1)' : 'var(--text3)'}}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Network badge ─── */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:'var(--green)',boxShadow:'0 0 8px var(--green)'}}/>
            <div className="text-[10px]" style={{color:'var(--text2)'}}>
              <span className="font-bold" style={{color:'var(--text1)'}}>Arc Mainnet</span>
              {' '} · USDC as gas · Sub-second finality · Fair launch bonding curve
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

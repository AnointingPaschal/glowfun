import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { ConnectKitButton } from 'connectkit'
import ImageUpload from '@/components/ImageUpload'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { parseOnchainError } from '@/utils/errors'
import {
  Rocket, Twitter, Send, Globe, ChevronDown, Zap, DollarSign,
  Loader2, ShieldCheck, ArrowRight, AlertTriangle, Info, RotateCcw,
  Check, Users, Lock, TrendingUp, Flame, Wallet, Sparkles,
} from 'lucide-react'

/* ── helpers ──────────────────────────────────────────────────────── */
const fmt      = (n: bigint) => { const v=Number(n)/1e18; return v>=1e9?`${(v/1e9).toFixed(1)}B`:v>=1e6?`${(v/1e6).toFixed(0)}M`:v.toLocaleString() }
const fmtUsdc  = (v: bigint) => { const n=Number(v)/1e6; return n>=1000?`$${(n/1000).toFixed(0)}K`:`$${n.toFixed(2)}` }
const pct      = (n: number) => `${n.toFixed(1)}%`
const inputCls = "w-full px-3.5 py-3 rounded-xl text-sm outline-none transition-all"
const inputSty = { background:'var(--surface2)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--text1)' } as const

/* ── constants ────────────────────────────────────────────────────── */
const SUPPLIES = [
  { label:'100M', val:100_000_000n*10n**18n,  desc:'Micro' },
  { label:'500M', val:500_000_000n*10n**18n,  desc:'Small' },
  { label:'1B',   val:1_000_000_000n*10n**18n, desc:'⭐' },
  { label:'5B',   val:5_000_000_000n*10n**18n, desc:'Large' },
  { label:'10B',  val:10_000_000_000n*10n**18n,desc:'Huge' },
  { label:'∞',    val:0n,                       desc:'Custom' },
]
const GRADS = [
  { label:'$10K', val:10_000n*1_000_000n, desc:'Fast'   },
  { label:'$25K', val:25_000n*1_000_000n, desc:'Quick'  },
  { label:'$50K', val:50_000n*1_000_000n, desc:'Mid'    },
  { label:'$69K', val:69_000n*1_000_000n, desc:'⭐'     },
  { label:'$100K',val:100_000n*1_000_000n,desc:'High'   },
  { label:'$200K',val:200_000n*1_000_000n,desc:'Elite'  },
  { label:'∞',    val:0n,                  desc:'Custom' },
]
const TAX_MODES = [
  { id:'community',    label:'Community',    sub:'No creator',  curve:8000, creator:0    },
  { id:'creator',      label:'Creator 5%',   sub:'Creator cut', curve:7500, creator:500  },
  { id:'deflationary', label:'DEX-heavy',    sub:'More DEX liq',curve:9200, creator:0    },
  { id:'whale',        label:'Whale 10%',    sub:'Max creator', curve:7000, creator:1000 },
  { id:'custom',       label:'Custom',       sub:'Manual',      curve:-1,   creator:-1   },
]
interface Form { name:string; symbol:string; description:string; imageUri:string; twitter:string; telegram:string; website:string; discord:string }
const INIT: Form = { name:'', symbol:'', description:'', imageUri:'', twitter:'', telegram:'', website:'', discord:'' }

/* ── Donut SVG ────────────────────────────────────────────────────── */
function Donut({ curve, creator, dex }: { curve:number; creator:number; dex:number }) {
  const R=44, stroke=12, C=2*Math.PI*R
  const segs=[{pct:curve,color:'#6366f1'},{pct:creator,color:'#f59e0b'},{pct:dex,color:'#22c55e'}]
  let offset=0
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx={50} cy={50} r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke}/>
      {segs.map(({pct:p,color})=>{
        const len=(p/100)*C
        const el=<circle key={color} cx={50} cy={50} r={R} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-offset*C/100}
          style={{transform:'rotate(-90deg)',transformOrigin:'50px 50px',transition:'stroke-dasharray 0.4s ease'}}/>
        offset+=p; return el
      })}
      <text x={50} y={47} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold" fontFamily="Space Grotesk">{(curve+creator+dex).toFixed(0)}%</text>
      <text x={50} y={59} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={7}>split</text>
    </svg>
  )
}

/* ── Tooltip ──────────────────────────────────────────────────────── */
function Tip({ text }: { text:string }) {
  const [show,setShow]=useState(false)
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)} onClick={()=>setShow(v=>!v)}>
        <Info size={10} style={{color:'var(--text3)'}}/>
      </button>
      <AnimatePresence>
        {show && <motion.div initial={{opacity:0,y:3}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none" style={{minWidth:180}}>
          <div className="text-[10px] leading-relaxed px-2.5 py-2 rounded-xl" style={{background:'var(--surface3)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text2)'}}>{text}</div>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

/* ── Section wrapper ──────────────────────────────────────────────── */
function Section({ title, sub, icon:Icon, color='#818cf8', badge, children }: any) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
      <div className="flex items-center gap-3 px-5 py-4" style={{borderBottom:'1px solid var(--border)'}}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:`${color}15`}}>
          <Icon size={15} style={{color}}/>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{color:'var(--text1)'}}>{title}</span>
            {badge && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide" style={{background:'rgba(99,102,241,0.1)',color:'#818cf8'}}>{badge}</span>}
          </div>
          {sub && <p className="text-[10px] mt-0.5" style={{color:'var(--text3)'}}>{sub}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ── Field ────────────────────────────────────────────────────────── */
function Field({ label, tip, required, children }: { label:string; tip?:string; required?:boolean; children:React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>{label}</label>
        {required && <span className="text-[8px] font-bold" style={{color:'var(--red)'}}>*</span>}
        {tip && <Tip text={tip}/>}
      </div>
      {children}
    </div>
  )
}

/* ── Pill selector ────────────────────────────────────────────────── */
function Pill({ active, onClick, label, sub, color='rgba(99,102,241,0.14)', activeColor='#818cf8', activeBorder='rgba(99,102,241,0.3)' }: any) {
  return (
    <button type="button" onClick={onClick} className="py-2.5 rounded-xl text-[11px] font-bold transition-all"
      style={{background:active?color:'var(--surface2)',color:active?activeColor:'var(--text2)',border:`1px solid ${active?activeBorder:'var(--border)'}`}}>
      <div>{label}</div>
      {sub && <div className="text-[8px] mt-0.5 opacity-60">{sub}</div>}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
export function LaunchPage() {
  const navigate = useNavigate()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID } = useConfig()

  const [form, setForm]       = useState<Form>(INIT)
  const [step, setStep]       = useState<'form'|'approving'|'launching'|'done'>('form')
  const [showSocials, setSoc] = useState(false)
  const [supplyIdx, setSI]    = useState(2)
  const [customSupply, setCS] = useState('')
  const [gradIdx, setGI]      = useState(3)
  const [customGrad, setCG]   = useState('')
  const [taxMode, setTM]      = useState('community')
  const [curveBps, setCurve]  = useState(8000)
  const [creatorBps, setCr]   = useState(0)
  const [approveTx, setATx]   = useState<`0x${string}`|undefined>()
  const [launchTx, setLTx]    = useState<`0x${string}`|undefined>()

  const isCS = supplyIdx===SUPPLIES.length-1
  const isCG = gradIdx===GRADS.length-1

  const supply: bigint = isCS
    ? (()=>{ const v=parseFloat(customSupply); return !isNaN(v)&&v>0?BigInt(Math.round(v*1e9))*10n**9n:1_000_000_000n*10n**18n })()
    : SUPPLIES[supplyIdx]?.val ?? 1_000_000_000n*10n**18n

  const grad: bigint = isCG
    ? (()=>{ const v=parseFloat(customGrad); return !isNaN(v)&&v>0?BigInt(Math.round(v*1e6)):69_000n*1_000_000n })()
    : GRADS[gradIdx]?.val ?? 69_000n*1_000_000n

  const curveTokens   = supply*BigInt(curveBps)/10_000n
  const creatorTokens = supply*BigInt(creatorBps)/10_000n
  const dexTokens     = supply-curveTokens-creatorTokens
  const curvePct      = curveBps/100
  const creatorPct    = creatorBps/100
  const dexPct        = Number(dexTokens)*100/Number(supply)
  const totalPct      = curvePct+creatorPct+dexPct

  const {data:feeRaw}   = useReadContract({address:FACTORY_ADDRESS,abi:FACTORY_ABI,functionName:'creationFee',chainId:CHAIN_ID as any,query:{enabled:!!FACTORY_ADDRESS}})
  const fee             = (feeRaw as bigint)??0n
  const {data:usdcBal}  = useReadContract({address:USDC_ADDRESS,abi:erc20Abi,functionName:'balanceOf',args:address?[address]:undefined,chainId:CHAIN_ID as any,query:{enabled:!!address}})
  const usdcBalance     = (usdcBal as bigint)??0n
  const {data:usdcAllow}= useReadContract({address:USDC_ADDRESS,abi:erc20Abi,functionName:'allowance',args:address&&FACTORY_ADDRESS?[address,FACTORY_ADDRESS]:undefined,chainId:CHAIN_ID as any,query:{enabled:!!address&&!!FACTORY_ADDRESS&&fee>0n}})
  const usdcAllowance   = (usdcAllow as bigint)??0n
  const needApprove     = fee>0n&&usdcAllowance<fee

  const {writeContract,isPending} = useWriteContract()
  const {isLoading:appConf,isSuccess:appDone} = useWaitForTransactionReceipt({hash:approveTx})
  const {isLoading:lnchConf,isSuccess:lnchDone} = useWaitForTransactionReceipt({hash:launchTx})
  const busy = isPending||appConf||lnchConf

  useEffect(()=>{ if(appDone&&step==='approving')doLaunch() },[appDone])
  useEffect(()=>{ if(lnchDone)setStep('done') },[lnchDone])

  const applyMode=(id:string)=>{ setTM(id); const m=TAX_MODES.find(t=>t.id===id); if(m&&m.curve!==-1){setCurve(m.curve);setCr(m.creator)} }
  const up=(k:keyof Form)=>(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setForm(f=>({...f,[k]:e.target.value}))
  const reset=()=>{ setForm(INIT);setSI(2);setCS('');setGI(3);setCG('');setTM('community');setCurve(8000);setCr(0) }

  const doApprove=()=>{ setStep('approving'); writeContract({address:USDC_ADDRESS,abi:erc20Abi,functionName:'approve',args:[FACTORY_ADDRESS as any,fee],chainId:CHAIN_ID as any} as any,{onSuccess:h=>setATx(h),onError:(e:any)=>{setStep('form');toast.error(parseOnchainError(e))}}) }
  const doLaunch=()=>{
    if(!FACTORY_ADDRESS){toast.error('Factory not configured');return}
    setStep('launching')
    writeContract({address:FACTORY_ADDRESS,abi:FACTORY_ABI,functionName:'launchToken',args:[{name:form.name.trim(),symbol:form.symbol.trim().toUpperCase(),description:form.description,imageUri:form.imageUri,twitter:form.twitter,telegram:form.telegram,website:form.website,totalSupply:supply,curveAllocationBps:BigInt(curveBps),creatorAllocationBps:BigInt(creatorBps),graduationThresholdUsdc:grad}],chainId:CHAIN_ID as any} as any,{onSuccess:h=>setLTx(h),onError:(e:any)=>{setStep('form');toast.error(parseOnchainError(e))}})
  }
  const handleSubmit=()=>{
    if(!isConnected){toast.error('Connect wallet first');return}
    if(chainId!==CHAIN_ID){switchChain({chainId:CHAIN_ID as any});return}
    if(!form.name.trim()||!form.symbol.trim()){toast.error('Name and ticker are required');return}
    if(fee>0n&&usdcBalance<fee){toast.error(`Need ${fmtUsdc(fee)} USDC to launch`);return}
    needApprove?doApprove():doLaunch()
  }

  const hue      = form.name?(form.name.charCodeAt(0)*37)%360:260
  const initials = form.symbol?form.symbol.slice(0,2).toUpperCase():'??'
  const gradLabel= isCG?(customGrad?`$${parseFloat(customGrad).toLocaleString()}`:'—'):GRADS[gradIdx]?.label??'$69K'
  const canSubmit= !!form.name.trim()&&!!form.symbol.trim()&&totalPct<=100.01

  /* ── Success ── */
  if (step==='done') return (
    <div className="max-w-sm mx-auto text-center py-16">
      <motion.div initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:200}}>
        <motion.div animate={{y:[0,-12,0]}} transition={{repeat:Infinity,duration:2.5,ease:'easeInOut'}} className="text-5xl mb-5">🚀</motion.div>
        <h2 className="text-3xl font-black mb-2" style={{fontFamily:'Space Grotesk',letterSpacing:'-0.03em',color:'var(--text1)'}}>Token Live!</h2>
        <p className="text-sm mb-1" style={{color:'var(--text2)'}}><strong style={{color:'var(--text1)'}}>${form.symbol.toUpperCase()}</strong> is live on Arc Mainnet</p>
        <p className="text-xs mb-8" style={{color:'var(--text3)'}}>{fmt(supply)} supply · {curvePct.toFixed(0)}% curve · graduates at {gradLabel}</p>
        <div className="flex flex-col gap-2.5">
          <button onClick={()=>navigate('/')} className="py-3.5 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>View All Tokens →</button>
          <button onClick={()=>{reset();setStep('form')}} className="py-3.5 rounded-2xl text-sm font-semibold" style={{background:'var(--surface2)',color:'var(--text1)',border:'1px solid var(--border)'}}>Launch Another</button>
        </div>
      </motion.div>
    </div>
  )

  return (
    <div>
      {/* ── Hero header ─────────────────────────────────────────── */}
      <div className="relative rounded-3xl px-5 py-6 mb-5 overflow-hidden"
        style={{background:'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.05))',border:'1px solid rgba(99,102,241,0.12)'}}>
        <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 20% 50%,rgba(99,102,241,0.12),transparent 65%)'}}/>
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:'var(--green)'}}/>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{color:'var(--green)'}}>Arc Mainnet · Live</span>
            </div>
            <h1 className="text-2xl font-black mb-1" style={{fontFamily:'Space Grotesk',letterSpacing:'-0.04em',color:'var(--text1)'}}>
              Launch a Token 🚀
            </h1>
            <p className="text-xs" style={{color:'var(--text2)'}}>Fair bonding curve · No liquidity needed · 1% fee</p>
          </div>
          <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium flex-shrink-0"
            style={{background:'var(--surface2)',border:'1px solid var(--border)',color:'var(--text2)'}}>
            <RotateCcw size={10}/>Reset
          </button>
        </div>
      </div>

      {/* ── Wallet status banner (not blocking) ─────────────────── */}
      {!isConnected && (
        <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-4"
          style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)'}}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Wallet size={14} style={{color:'#818cf8',flexShrink:0}}/>
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{color:'var(--text1)'}}>Wallet not connected</p>
              <p className="text-[10px]" style={{color:'var(--text2)'}}>Fill in the form below · connect before launching</p>
            </div>
          </div>
          <div className="flex-shrink-0"><ConnectKitButton/></div>
        </motion.div>
      )}

      {/* Fee banner (connected) */}
      {isConnected && fee>0n && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl mb-4"
          style={{background:usdcBalance>=fee?'rgba(34,197,94,0.05)':'rgba(239,68,68,0.05)',border:`1px solid ${usdcBalance>=fee?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)'}`}}>
          <DollarSign size={13} style={{color:usdcBalance>=fee?'var(--green)':'var(--red)',flexShrink:0}}/>
          <span className="text-xs font-bold" style={{color:usdcBalance>=fee?'var(--green)':'var(--red)'}}>Launch fee: {fmtUsdc(fee)}</span>
          <span className="text-[10px]" style={{color:'var(--text2)'}}>{usdcBalance>=fee?`Balance: ${fmtUsdc(usdcBalance)} ✓`:`Need ${fmtUsdc(fee)} · Have ${fmtUsdc(usdcBalance)}`}</span>
        </div>
      )}

      {/* ── Main layout: form left, preview right ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">

        {/* ═══ FORM COLUMN ════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* ── 1. Coin Details ── */}
          <Section title="Coin Details" sub="The basics — name, ticker, image and description" icon={Sparkles} color="#818cf8">

            {/* Image + Name/Ticker */}
            <div className="flex gap-4 mb-4">
              <div className="flex-shrink-0">
                <Field label="Logo"><div className="w-28"><ImageUpload value={form.imageUri} onChange={url=>setForm(f=>({...f,imageUri:url}))}/></div></Field>
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Name" required tip="Full token name, up to 64 characters.">
                    <input className={inputCls} style={inputSty} placeholder="e.g. Glow Cat" value={form.name} onChange={up('name')} maxLength={64}/>
                  </Field>
                  <Field label="Ticker" required tip="Symbol shown in wallets and DEXes. Auto-uppercased. Max 12 chars.">
                    <input className={`${inputCls} uppercase font-mono tracking-widest`} style={inputSty} placeholder="GCAT" value={form.symbol} onChange={up('symbol')} maxLength={12}/>
                  </Field>
                </div>
                <Field label="Description" tip="Shown on your token page. Max 500 chars.">
                  <div className="relative">
                    <textarea className={`${inputCls} resize-none`} style={{...inputSty,minHeight:76}} rows={3}
                      placeholder="Tell people what makes your token special…" value={form.description} onChange={up('description') as any} maxLength={500}/>
                    <span className="absolute bottom-2 right-3 text-[8px] tabular-nums" style={{color:'var(--text3)'}}>{form.description.length}/500</span>
                  </div>
                </Field>
              </div>
            </div>

            {/* Socials toggle */}
            <button type="button" onClick={()=>setSoc(v=>!v)}
              className="flex items-center gap-1.5 text-xs font-semibold w-full"
              style={{color:showSocials?'#818cf8':'var(--text2)',background:'none',border:'none',padding:0,cursor:'pointer',textAlign:'left'}}>
              <div className="flex items-center gap-1.5 flex-1">
                <ChevronDown size={12} style={{transform:showSocials?'rotate(180deg)':'none',transition:'transform 0.2s'}}/>
                Social links <span style={{color:'var(--text3)',fontWeight:400}}>(optional but recommended)</span>
              </div>
              {(form.twitter||form.telegram||form.website) && <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{background:'rgba(34,197,94,0.1)',color:'var(--green)'}}>Added ✓</span>}
            </button>

            <AnimatePresence>
              {showSocials && (
                <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
                  <div className="grid grid-cols-2 gap-2.5 mt-3">
                    {([['twitter','Twitter / X',Twitter,'@handle or URL'],['telegram','Telegram',Send,'t.me/…'],['website','Website',Globe,'https://…'],['discord','Discord',Users,'discord.gg/…']] as const).map(([k,label,Icon,ph])=>(
                      <div key={k}>
                        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{color:'var(--text2)'}}>{label}</label>
                        <div className="relative">
                          <Icon size={11} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{color:'var(--text3)'}}/>
                          <input className={`${inputCls} pl-8`} style={inputSty} placeholder={ph} value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* ── 2. Tokenomics ── */}
          <Section title="Tokenomics" sub="Set total supply and graduation target" icon={TrendingUp} color="#22c55e">
            {/* Supply */}
            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Total Supply</span>
                <Tip text="Total tokens that will ever exist. Higher supply = lower price per token at the same market cap."/>
              </div>
              <div className="grid grid-cols-6 gap-1.5 mb-2">
                {SUPPLIES.map((s,i)=>(
                  <Pill key={s.label} active={supplyIdx===i} onClick={()=>{setSI(i);setCS('')}} label={s.label} sub={s.desc}/>
                ))}
              </div>
              <AnimatePresence>
                {isCS && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
                    <div className="relative">
                      <input className={inputCls} style={inputSty} type="number" min={0.1} step={0.1} placeholder="Supply in billions (e.g. 2 = 2B tokens)" value={customSupply} onChange={e=>setCS(e.target.value)}/>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{color:'var(--text3)'}}>B tokens</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Graduation */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Graduation Target</span>
                <Tip text="When this much USDC is raised on the bonding curve, the token graduates to a DEX automatically."/>
              </div>
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {GRADS.map((g,i)=>(
                  <Pill key={g.label} active={gradIdx===i} onClick={()=>{setGI(i);setCG('')}} label={g.label} sub={g.desc} color="rgba(34,197,94,0.12)" activeColor="var(--green)" activeBorder="rgba(34,197,94,0.3)"/>
                ))}
              </div>
              <AnimatePresence>
                {isCG && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} style={{overflow:'hidden'}}>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{color:'var(--text3)'}}>$</span>
                      <input className={`${inputCls} pl-7`} style={inputSty} type="number" min={1000} step={1000} placeholder="e.g. 30000" value={customGrad} onChange={e=>setCG(e.target.value)}/>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{color:'var(--text3)'}}>USDC</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Section>

          {/* ── 3. Advanced ── */}
          <Section title="Token Allocation" sub="How supply is split between bonding curve, DEX, and creator" icon={Flame} color="#f59e0b" badge="Advanced">
            {/* Mode pills */}
            <div className="grid grid-cols-5 gap-1.5 mb-5">
              {TAX_MODES.map(m=>(
                <Pill key={m.id} active={taxMode===m.id} onClick={()=>applyMode(m.id)} label={m.label} sub={m.sub}/>
              ))}
            </div>

            {/* Sliders + Donut */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-5">
              <div className="space-y-4">
                {/* Curve slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{background:'#6366f1'}}/>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Curve</span>
                      <Tip text="Tokens for the bonding curve. Buyers purchase from this pool."/>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{background:'rgba(99,102,241,0.1)',color:'#818cf8'}}>{curvePct.toFixed(0)}%</span>
                  </div>
                  <input type="range" min={4000} max={9900} step={100} value={curveBps} onChange={e=>{setCurve(Number(e.target.value));setTM('custom')}} className="w-full accent-indigo-500"/>
                  <div className="flex justify-between text-[9px] mt-0.5" style={{color:'var(--text3)'}}><span>40%</span><span>99%</span></div>
                </div>
                {/* Creator slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{background:'#f59e0b'}}/>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:'var(--text2)'}}>Creator</span>
                      <Tip text="Tokens sent directly to your wallet at launch."/>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{background:creatorBps>0?'rgba(245,158,11,0.1)':'var(--surface2)',color:creatorBps>0?'var(--gold)':'var(--text3)'}}>{creatorPct.toFixed(0)}%</span>
                  </div>
                  <input type="range" min={0} max={1000} step={100} value={creatorBps} onChange={e=>{setCr(Number(e.target.value));setTM('custom')}} className="w-full accent-amber-500"/>
                  <div className="flex justify-between text-[9px] mt-0.5" style={{color:'var(--text3)'}}><span>0%</span><span>10%</span></div>
                </div>
                {/* DEX display */}
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{background:'rgba(34,197,94,0.05)',border:'1px solid rgba(34,197,94,0.12)'}}>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{background:'var(--green)'}}/><span className="text-[10px] font-semibold" style={{color:'var(--green)'}}>DEX Liquidity</span><span className="text-[8px]" style={{color:'var(--text3)'}}>(on graduation)</span></div>
                  <span className="text-[11px] font-bold" style={{color:'var(--green)'}}>{dexPct.toFixed(1)}%</span>
                </div>
                {/* Warnings */}
                {totalPct>100.01 && <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.18)'}}><AlertTriangle size={11} style={{color:'var(--red)',flexShrink:0,marginTop:1}}/><p className="text-[10px]" style={{color:'var(--text2)'}}>Total exceeds 100%. Reduce curve or creator allocation.</p></div>}
                {creatorBps>0 && <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{background:'rgba(245,158,11,0.05)',border:'1px solid rgba(245,158,11,0.15)'}}><Lock size={10} style={{color:'var(--gold)',flexShrink:0,marginTop:1}}/><p className="text-[10px]" style={{color:'var(--text2)'}}><strong style={{color:'var(--gold)'}}>{fmt(creatorTokens)} tokens</strong> go to your wallet at launch · may be locked.</p></div>}
              </div>
              {/* Donut */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24"><Donut curve={curvePct} creator={creatorPct} dex={dexPct}/></div>
                <div className="space-y-1 w-full">
                  {[{color:'#6366f1',label:'Curve',p:pct(curvePct)},{color:'#f59e0b',label:'Creator',p:pct(creatorPct)},{color:'#22c55e',label:'DEX',p:pct(dexPct)}].map(({color,label,p})=>(
                    <div key={label} className="flex items-center justify-between text-[9px]">
                      <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full" style={{background:color}}/><span style={{color:'var(--text2)'}}>{label}</span></div>
                      <span className="font-bold" style={{color:'var(--text1)'}}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ── Submit area ── */}
          <div className="space-y-3">
            {!isConnected ? (
              /* Not connected — show prominent connect prompt */
              <div className="rounded-2xl p-5 text-center" style={{background:'var(--surface)',border:'1px solid rgba(99,102,241,0.2)'}}>
                <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{background:'rgba(99,102,241,0.1)'}}>
                  <Wallet size={22} style={{color:'#818cf8'}}/>
                </div>
                <p className="text-sm font-bold mb-1" style={{color:'var(--text1)'}}>Ready to launch?</p>
                <p className="text-xs mb-4" style={{color:'var(--text2)'}}>Connect your wallet to submit — your form data is preserved.</p>
                <ConnectKitButton/>
              </div>
            ) : chainId!==CHAIN_ID ? (
              <button type="button" onClick={()=>switchChain({chainId:CHAIN_ID as any})} className="w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',color:'var(--gold)'}}>
                <AlertTriangle size={15}/>Switch to Arc Mainnet
              </button>
            ) : (
              <motion.button type="button" whileHover={{scale:busy?1:1.01}} whileTap={{scale:busy?1:0.98}}
                onClick={handleSubmit} disabled={busy||!canSubmit||(fee>0n&&usdcBalance<fee)}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 24px rgba(99,102,241,0.35)'}}>
                {busy?<><Loader2 size={15} className="animate-spin"/>{step==='approving'?'Approving USDC…':'Launching…'}</>
                :needApprove?<><ShieldCheck size={15}/>Approve {fmtUsdc(fee)} USDC</>
                :<><Rocket size={15}/>Launch {form.symbol?`$${form.symbol.toUpperCase()}`:' Token'}<ArrowRight size={14}/></>}
              </motion.button>
            )}
            {isConnected&&needApprove&&!busy&&<p className="text-center text-[10px]" style={{color:'var(--text3)'}}>Step 1 of 2 · approve USDC, then launch fires automatically</p>}
          </div>
        </div>

        {/* ═══ PREVIEW COLUMN ════════════════════════════════════ */}
        <div className="xl:sticky xl:top-20 space-y-4 self-start order-first xl:order-last">

          {/* Token preview card */}
          <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{borderBottom:'1px solid var(--border)'}}>
              <span className="text-[8.5px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--text3)'}}>Token Preview</span>
              <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:'var(--green)'}}/><span className="text-[8px] font-bold" style={{color:'var(--green)'}}>Live</span></div>
            </div>
            {/* Hero */}
            <div className="relative h-28 overflow-hidden" style={{background:form.imageUri?'black':`linear-gradient(135deg,hsl(${hue},55%,22%),hsl(${(hue+120)%360},50%,18%))`}}>
              {form.imageUri?<img src={form.imageUri} className="w-full h-full object-cover opacity-50"/>
                :<div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl font-black" style={{color:'rgba(255,255,255,0.08)',fontFamily:'Space Grotesk'}}>{initials}</span></div>}
              <div className="absolute bottom-3 left-3 flex items-end gap-2">
                {form.imageUri?<img src={form.imageUri} className="w-9 h-9 rounded-xl object-cover border-2" style={{borderColor:'rgba(255,255,255,0.15)'}}/>
                  :<div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{background:`linear-gradient(135deg,hsl(${hue},65%,50%),hsl(${(hue+120)%360},60%,42%))`}}>{initials}</div>}
                <div>
                  <div className="text-sm font-black text-white leading-none" style={{fontFamily:'Space Grotesk',textShadow:'0 1px 4px rgba(0,0,0,0.8)'}}>{form.name||'Token Name'}</div>
                  <div className="text-[10px] font-bold" style={{color:'#a5b4fc',textShadow:'0 1px 4px rgba(0,0,0,0.8)'}}>${form.symbol||'SYMBOL'}</div>
                </div>
              </div>
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-bold" style={{background:'rgba(0,0,0,0.5)',color:'white',backdropFilter:'blur(8px)'}}>0%</div>
            </div>
            <div className="p-4 space-y-3">
              {form.description&&<p className="text-[10px] leading-relaxed line-clamp-2" style={{color:'var(--text2)'}}>{form.description}</p>}
              <div className="grid grid-cols-2 gap-1.5">
                {[{l:'Supply',v:fmt(supply)},{l:'Graduates',v:gradLabel},{l:'Curve %',v:`${curvePct.toFixed(0)}%`},{l:'Network',v:'Arc'}].map(({l,v})=>(
                  <div key={l} className="px-2.5 py-2 rounded-lg" style={{background:'var(--surface2)'}}>
                    <div className="text-[7.5px] font-semibold uppercase tracking-widest" style={{color:'var(--text3)'}}>{l}</div>
                    <div className="text-[11px] font-bold mt-0.5" style={{color:'var(--text1)'}}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-[8px] mb-1"><span style={{color:'var(--text3)'}}>Bonding progress</span><span style={{color:'var(--text3)'}}>0%</span></div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{background:'var(--surface3)'}}><div className="h-full rounded-full w-0" style={{background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/></div>
              </div>
            </div>
          </div>

          {/* Launch summary */}
          <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="px-4 py-2.5" style={{borderBottom:'1px solid var(--border)'}}><span className="text-[8.5px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--text3)'}}>Summary</span></div>
            <div className="p-4 divide-y" style={{borderColor:'var(--border)'}}>
              {[
                {k:'Network',v:'Arc Mainnet'},{k:'Currency',v:'USDC'},{k:'Supply',v:fmt(supply)},
                {k:'Curve',v:`${curvePct.toFixed(0)}%`},{k:'Creator',v:`${creatorPct.toFixed(0)}%`,hi:creatorBps>0},
                {k:'DEX Liq.',v:`${dexPct.toFixed(1)}%`},{k:'Graduates',v:gradLabel,hi:true},
                ...(fee>0n?[{k:'Launch fee',v:fmtUsdc(fee),hi:false}]:[]),
              ].map(({k,v,hi})=>(
                <div key={k} className="flex justify-between py-1.5 text-xs"><span style={{color:'var(--text2)'}}>{k}</span><span className="font-semibold" style={{color:hi?'#818cf8':'var(--text1)'}}>{v}</span></div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-2xl p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <span className="text-[8.5px] font-bold uppercase tracking-[0.15em] block mb-3" style={{color:'var(--text3)'}}>Checklist</span>
            {[
              {l:'Name set',           done:!!form.name.trim()},
              {l:'Ticker set',         done:!!form.symbol.trim()},
              {l:'Logo uploaded',      done:!!form.imageUri},
              {l:'Description',        done:!!form.description.trim()},
              {l:'Social links',       done:!!(form.twitter||form.telegram||form.website)},
              {l:'Wallet connected',   done:isConnected},
              {l:'Enough USDC',        done:fee===0n||usdcBalance>=fee},
            ].map(({l,done})=>(
              <div key={l} className="flex items-center gap-2 py-1">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all" style={{background:done?'rgba(34,197,94,0.12)':'var(--surface2)',border:`1px solid ${done?'rgba(34,197,94,0.3)':'var(--border)'}`}}>
                  {done&&<Check size={8} style={{color:'var(--green)'}}/>}
                </div>
                <span className="text-[10px]" style={{color:done?'var(--text1)':'var(--text3)'}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

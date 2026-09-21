import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import ImageUpload from '@/components/ImageUpload'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { parseOnchainError } from '@/utils/errors'
import { Rocket, Twitter, Send, Globe, ChevronDown, Zap, Trophy, Check, DollarSign, Loader2, ShieldCheck, ArrowRight, AlertTriangle } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'

/* ── helpers ─────────────────────────────────────────────────────── */
function fmt(n: bigint) { const v=Number(n)/1e18; return v>=1e9?`${(v/1e9).toFixed(1)}B`:v>=1e6?`${(v/1e6).toFixed(0)}M`:v.toLocaleString() }
function fmtUsdc(v: bigint) { const n=Number(v)/1e6; return n>=1000?`$${(n/1000).toFixed(0)}K`:`$${n.toFixed(2)}` }

const SUPPLIES = [
  { label:'100M',  val:100_000_000n*10n**18n, desc:'Micro-cap' },
  { label:'500M',  val:500_000_000n*10n**18n, desc:'Mid-size'  },
  { label:'1B',    val:1_000_000_000n*10n**18n, desc:'Classic'  },
  { label:'10B',   val:10_000_000_000n*10n**18n, desc:'Doge-style' },
]
const GRADS = [
  { label:'$10K',  val:10_000n*1_000_000n,  desc:'Fast grad' },
  { label:'$25K',  val:25_000n*1_000_000n,  desc:'Quick'     },
  { label:'$69K',  val:69_000n*1_000_000n,  desc:'Standard ⭐' },
  { label:'$100K', val:100_000n*1_000_000n, desc:'Premium'   },
  { label:'$200K', val:200_000n*1_000_000n, desc:'Large'     },
]

interface Form { name:string;symbol:string;description:string;imageUri:string;twitter:string;telegram:string;website:string }
const INIT: Form = { name:'',symbol:'',description:'',imageUri:'',twitter:'',telegram:'',website:'' }
type Step = 'form'|'approving'|'launching'|'done'

export function LaunchPage() {
  const navigate = useNavigate()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID } = useConfig()

  const [form, setForm]       = useState<Form>(INIT)
  const [step, setStep]       = useState<Step>('form')
  const [supplyIdx, setSI]    = useState(2)
  const [gradIdx, setGI]      = useState(2)
  const [curveBps, setCurve]  = useState(8000)
  const [creatorBps, setCr]   = useState(0)
  const [showAdv, setAdv]     = useState(false)
  const [approveTx, setAppTx] = useState<`0x${string}`|undefined>()
  const [launchTx, setLTx]    = useState<`0x${string}`|undefined>()

  const supply = SUPPLIES[supplyIdx]?.val ?? 1_000_000_000n*10n**18n
  const grad   = GRADS[gradIdx]?.val ?? 69_000n*1_000_000n

  const { data: feeRaw } = useReadContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'creationFee', chainId: CHAIN_ID as any, query:{ enabled:!!FACTORY_ADDRESS } })
  const fee = (feeRaw as bigint)??0n

  const { data: usdcBal } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: address?[address]:undefined, chainId: CHAIN_ID as any, query:{ enabled:!!address&&fee>0n } })
  const usdcBalance = (usdcBal as bigint)??0n

  const { data: usdcAllow } = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: address&&FACTORY_ADDRESS?[address,FACTORY_ADDRESS]:undefined, chainId: CHAIN_ID as any, query:{ enabled:!!address&&!!FACTORY_ADDRESS&&fee>0n } })
  const usdcAllowance = (usdcAllow as bigint)??0n
  const needApprove = fee>0n && usdcAllowance<fee

  const { writeContract, isPending } = useWriteContract()
  const { isLoading: appConfirming, isSuccess: appDone } = useWaitForTransactionReceipt({ hash: approveTx })
  const { isLoading: lnchConfirming, isSuccess: lnchDone } = useWaitForTransactionReceipt({ hash: launchTx })

  useEffect(() => { if(appDone&&step==='approving') doLaunch() }, [appDone])
  useEffect(() => { if(lnchDone) setStep('done') }, [lnchDone])

  const up = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => setForm(f=>({...f,[k]:e.target.value}))

  const doApprove = () => {
    setStep('approving')
    writeContract({ address:USDC_ADDRESS, abi:erc20Abi, functionName:'approve', args:[FACTORY_ADDRESS as any, fee], chainId:CHAIN_ID as any } as any, {
      onSuccess:h=>setAppTx(h),
      onError:(e:any)=>{ setStep('form'); toast.error(parseOnchainError(e)) }
    })
  }

  const doLaunch = () => {
    if(!FACTORY_ADDRESS){ toast.error('Not available yet.'); return }
    setStep('launching')
    writeContract({
      address:FACTORY_ADDRESS, abi:FACTORY_ABI, functionName:'launchToken',
      args:[{ name:form.name.trim(), symbol:form.symbol.trim().toUpperCase(), description:form.description, imageUri:form.imageUri, twitter:form.twitter, telegram:form.telegram, website:form.website, totalSupply:supply, curveAllocationBps:BigInt(curveBps), creatorAllocationBps:BigInt(creatorBps), graduationThresholdUsdc:grad }],
      chainId:CHAIN_ID as any
    } as any, {
      onSuccess:h=>setLTx(h),
      onError:(e:any)=>{ setStep('form'); toast.error(parseOnchainError(e)) }
    })
  }

  const handleSubmit = () => {
    if(!isConnected){ toast.error('Connect wallet first'); return }
    if(chainId!==CHAIN_ID){ switchChain({chainId:CHAIN_ID as any}); return }
    if(!form.name.trim()||!form.symbol.trim()){ toast.error('Name and symbol required'); return }
    if(fee>0n&&usdcBalance<fee){ toast.error(`Need ${fmtUsdc(fee)} USDC to launch`); return }
    needApprove ? doApprove() : doLaunch()
  }

  const busy = isPending||appConfirming||lnchConfirming

  // Preview calc
  const curveTokens   = (supply * BigInt(curveBps)) / 10_000n
  const creatorTokens = (supply * BigInt(creatorBps)) / 10_000n
  const dexTokens     = supply - curveTokens - creatorTokens
  const hue = form.name ? (form.name.charCodeAt(0)*37)%360 : 260

  // Success screen
  if (step==='done') return (
    <div className="max-w-md mx-auto text-center py-16">
      <motion.div initial={{scale:0.85,opacity:0}} animate={{scale:1,opacity:1}}>
        <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 8px 32px rgba(99,102,241,0.35)' }}>
          <Rocket size={34} className="text-white"/>
        </div>
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily:'Space Grotesk,sans-serif', color:'var(--text1)' }}>Token Launched! 🚀</h2>
        <p className="text-sm mb-1" style={{ color:'var(--text2)' }}><strong style={{ color:'var(--text1)' }}>${form.symbol.toUpperCase()}</strong> is now live on Arc Mainnet.</p>
        <p className="text-xs mb-8" style={{ color:'var(--text3)' }}>{fmt(supply)} total supply · {curveBps/100}% on bonding curve</p>
        <div className="flex flex-col gap-3">
          <button onClick={()=>navigate('/')} className="py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            View All Tokens →
          </button>
          <button onClick={()=>{setForm(INIT);setStep('form')}} className="py-3.5 rounded-2xl text-sm font-semibold" style={{ background:'var(--surface2)', color:'var(--text1)', border:'1px solid var(--border)' }}>
            Launch Another
          </button>
        </div>
      </motion.div>
    </div>
  )

  return (
    <div>
      <div className="h-1 w-14 rounded-full mb-5" style={{ background:'linear-gradient(90deg,#6366f1,#8b5cf6)' }}/>
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily:'Space Grotesk,sans-serif', color:'var(--text1)' }}>Launch a Token</h1>
      <p className="text-sm mb-6" style={{ color:'var(--text2)' }}>Create your meme token on the Arc bonding curve. No upfront liquidity needed.</p>

      {!isConnected ? (
        <div className="max-w-md mx-auto rounded-2xl p-10 text-center" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background:'rgba(99,102,241,0.1)' }}>
            <Rocket size={28} style={{ color:'#818cf8' }}/>
          </div>
          <h2 className="text-lg font-bold mb-2" style={{ color:'var(--text1)' }}>Connect Your Wallet</h2>
          <p className="text-sm mb-5" style={{ color:'var(--text2)' }}>Connect to Arc Mainnet to launch your token.</p>
          <ConnectKitButton/>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">

          {/* ── Left: Form ──────────────────────────────────── */}
          <div className="space-y-4">
            {/* Fee notice */}
            {fee>0n&&(
              <div className="flex items-center gap-3 p-3.5 rounded-2xl"
                style={{ background:usdcBalance>=fee?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)', border:`1px solid ${usdcBalance>=fee?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}` }}>
                <DollarSign size={16} style={{ color:usdcBalance>=fee?'var(--green)':'var(--red)' }}/>
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color:usdcBalance>=fee?'var(--green)':'var(--red)' }}>Launch fee: {fmtUsdc(fee)}</div>
                  <div className="text-xs" style={{ color:'var(--text2)' }}>{usdcBalance>=fee?`Balance: ${fmtUsdc(usdcBalance)} · Ready`:`Need ${fmtUsdc(fee)} USDC · You have ${fmtUsdc(usdcBalance)}`}</div>
                </div>
                {step!=='form'&&<div className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8' }}>{step==='approving'?'Approving…':'Launching…'}</div>}
              </div>
            )}

            {/* Token details */}
            <div className="rounded-2xl p-5" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color:'var(--text1)' }}>
                <Zap size={15} style={{ color:'#818cf8' }}/>Token Details
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color:'var(--text2)' }}>Name *</label>
                  <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)' }}
                    placeholder="e.g. Glow Cat" value={form.name} onChange={up('name')} maxLength={64}/>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color:'var(--text2)' }}>Ticker *</label>
                  <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none uppercase"
                    style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)' }}
                    placeholder="e.g. GCAT" value={form.symbol} onChange={up('symbol')} maxLength={12}/>
                </div>
              </div>
              <div className="mb-3">
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color:'var(--text2)' }}>Description</label>
                <textarea className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)', minHeight:72 }}
                  placeholder="Tell your story…" value={form.description} onChange={up('description') as any} maxLength={500}/>
                <div className="text-right text-[10px] mt-0.5" style={{ color:'var(--text3)' }}>{form.description.length}/500</div>
              </div>
              <div className="mb-4">
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color:'var(--text2)' }}>Logo</label>
                <ImageUpload value={form.imageUri} onChange={url=>setForm(f=>({...f,imageUri:url}))}/>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[['twitter','Twitter',Twitter,'@handle'],['telegram','Telegram',Send,'t.me/…'],['website','Website',Globe,'https://…']].map(([k,label,Icon,ph]:any)=>(
                  <div key={k}>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color:'var(--text2)' }}>{label}</label>
                    <div className="relative">
                      <Icon size={11} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'var(--text3)' }}/>
                      <input className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)' }}
                        placeholder={ph} value={(form as any)[k]} onChange={up(k as keyof Form)}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Supply */}
            <div className="rounded-2xl p-5" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <h3 className="text-sm font-bold mb-3" style={{ color:'var(--text1)' }}>Total Supply</h3>
              <div className="grid grid-cols-4 gap-2">
                {SUPPLIES.map((s,i)=>(
                  <button key={s.label} onClick={()=>setSI(i)}
                    className="py-2.5 rounded-xl text-xs font-bold transition-all"
                    style={{ background:supplyIdx===i?'rgba(99,102,241,0.15)':'var(--surface2)', color:supplyIdx===i?'#818cf8':'var(--text2)', border:supplyIdx===i?'1px solid rgba(99,102,241,0.3)':'1px solid var(--border)' }}>
                    <div>{s.label}</div><div className="text-[9px] mt-0.5 opacity-70">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced */}
            <div className="rounded-2xl overflow-hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <button onClick={()=>setAdv(v=>!v)} className="w-full flex items-center justify-between px-5 py-4">
                <span className="text-sm font-bold flex items-center gap-2" style={{ color:'var(--text1)' }}>
                  <Trophy size={14} style={{ color:'var(--gold)' }}/>Graduation &amp; Allocation
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background:'rgba(99,102,241,0.08)', color:'#818cf8' }}>Optional</span>
                </span>
                <ChevronDown size={15} style={{ color:'var(--text3)', transform:showAdv?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
              </button>
              <AnimatePresence>
                {showAdv&&(
                  <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} style={{ overflow:'hidden' }}>
                    <div className="px-5 pb-5 space-y-4" style={{ borderTop:'1px solid var(--border)' }}>
                      <div className="pt-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color:'var(--text2)' }}>Graduation Threshold</label>
                        <div className="grid grid-cols-5 gap-1.5">
                          {GRADS.map((g,i)=>(
                            <button key={g.label} onClick={()=>setGI(i)}
                              className="py-2 rounded-xl text-[10px] font-bold transition-all"
                              style={{ background:gradIdx===i?'rgba(34,197,94,0.12)':'var(--surface2)', color:gradIdx===i?'var(--green)':'var(--text2)', border:gradIdx===i?'1px solid rgba(34,197,94,0.25)':'1px solid var(--border)' }}>
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color:'var(--text2)' }}>Curve Allocation — {(curveBps/100).toFixed(0)}%</label>
                        <input type="range" min={5000} max={9500} step={100} value={curveBps} onChange={e=>setCurve(Number(e.target.value))} className="w-full accent-indigo-500"/>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color:'var(--text2)' }}>Creator Allocation — {creatorBps===0?'None':`${(creatorBps/100).toFixed(0)}%`}</label>
                        <input type="range" min={0} max={1000} step={100} value={creatorBps} onChange={e=>setCr(Number(e.target.value))} className="w-full accent-indigo-500"/>
                        {creatorBps>0&&(
                          <div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-xl" style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)' }}>
                            <AlertTriangle size={11} style={{ color:'var(--gold)', flexShrink:0, marginTop:1 }}/>
                            <p className="text-[10px]" style={{ color:'var(--text2)' }}>{(creatorBps/100).toFixed(0)}% ({fmt((supply*BigInt(creatorBps))/10_000n)} tokens) sent to your wallet at launch.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Submit */}
            {chainId!==CHAIN_ID ? (
              <button onClick={()=>switchChain({chainId:CHAIN_ID as any})} className="w-full py-4 rounded-2xl text-sm font-bold"
                style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', color:'var(--gold)' }}>
                Switch to Arc Mainnet
              </button>
            ) : (
              <motion.button whileHover={{scale:busy?1:1.01}} whileTap={{scale:busy?1:0.99}} onClick={handleSubmit}
                disabled={busy||!form.name.trim()||!form.symbol.trim()||(fee>0n&&usdcBalance<fee)}
                className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 20px rgba(99,102,241,0.3)' }}>
                {busy?<><Loader2 size={16} className="animate-spin"/>{step==='approving'?'Approving USDC…':'Launching…'}</>
                :needApprove?<><ShieldCheck size={16}/>Approve {fmtUsdc(fee)} USDC</>
                :<><Rocket size={16}/>Launch Token<ArrowRight size={14}/></>}
              </motion.button>
            )}
            {needApprove&&!busy&&<p className="text-center text-xs" style={{ color:'var(--text3)' }}>Step 1 of 2 — approve USDC, then launch fires automatically</p>}
          </div>

          {/* ── Right: Preview ───────────────────────────────── */}
          <div className="xl:sticky xl:top-20 space-y-4 self-start">
            {/* Token preview card */}
            <div className="rounded-2xl overflow-hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <div className="h-1.5" style={{ background:'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)' }}/>
              <div className="p-5">
                <div className="flex gap-3 mb-4">
                  {form.imageUri
                    ? <img src={form.imageUri} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ border:'1px solid var(--border2)' }}/>
                    : <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-bold text-white" style={{ background:`linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))` }}>{form.symbol?form.symbol.slice(0,2).toUpperCase():'??'}</div>}
                  <div>
                    <div className="text-lg font-bold" style={{ color:'var(--text1)', fontFamily:'Space Grotesk,sans-serif' }}>{form.name||'Token Name'}</div>
                    <div className="text-sm font-bold" style={{ color:'#818cf8' }}>${form.symbol||'SYMBOL'}</div>
                    {form.description&&<p className="text-xs mt-1 line-clamp-2" style={{ color:'var(--text2)' }}>{form.description}</p>}
                  </div>
                </div>
                {/* Allocation bars */}
                {[
                  { label:'Bonding Curve', pct:curveBps/100, color:'#6366f1' },
                  { label:'DEX Liquidity (at grad)', pct:Number(dexTokens)*100/Number(supply), color:'var(--green)' },
                  ...(creatorBps>0?[{ label:'Creator', pct:creatorBps/100, color:'var(--gold)' }]:[]),
                ].map(({label,pct,color})=>(
                  <div key={label} className="mb-2.5">
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color:'var(--text2)' }}>{label}</span>
                      <span className="font-bold" style={{ color:'var(--text1)' }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'var(--surface3)' }}>
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background:color }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch summary */}
            <div className="rounded-2xl p-4" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color:'var(--text2)' }}>Launch Summary</h4>
              {[
                {k:'Network',      v:'Arc Mainnet'},
                {k:'Currency',     v:'USDC'},
                {k:'Total Supply', v:fmt(supply)},
                {k:'Graduates at', v:GRADS[gradIdx]?.label??'$69K'},
                {k:'Protocol fee', v:'1%'},
                ...(fee>0n?[{k:'Launch fee',v:fmtUsdc(fee)}]:[]),
              ].map(({k,v})=>(
                <div key={k} className="flex justify-between py-1.5 border-b last:border-0 text-xs" style={{ borderColor:'var(--border)' }}>
                  <span style={{ color:'var(--text2)' }}>{k}</span>
                  <span className="font-semibold" style={{ color:'var(--text1)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { ImageUpload } from '@/components/ImageUpload'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig } from '@/context/ConfigContext'
import { parseOnchainError } from '@/utils/errors'
import { Rocket, Twitter, Send, Globe, ChevronDown, Zap, Trophy, Check, DollarSign, Loader2, ShieldCheck, ArrowRight, Info, AlertTriangle } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'

/* ── helpers ─────────────────────────────────────────────────────── */
const card: React.CSSProperties = { background:'#fff', border:'1px solid rgba(0,0,0,0.08)', borderRadius:20, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' }
const inp: React.CSSProperties  = { background:'#f9fafb', border:'1px solid rgba(0,0,0,0.09)', borderRadius:12, color:'#111827', outline:'none', width:'100%', padding:'10px 13px', fontSize:14 }
const lbl: React.CSSProperties  = { fontSize:11, fontWeight:700, color:'#9ca3af', letterSpacing:'0.07em', textTransform:'uppercase', display:'block', marginBottom:5 }

function fmt(n: bigint) { const v=Number(n)/1e18; return v>=1e9?`${(v/1e9).toFixed(1)}B`:v>=1e6?`${(v/1e6).toFixed(0)}M`:v.toLocaleString() }
function fmtUsdc(v: bigint) { const n=Number(v)/1e6; return n>=1000?`$${(n/1000).toFixed(0)}K`:`$${n.toFixed(2)}` }

const SUPPLIES = [
  { label:'100M',  val:100_000_000n*10n**18n, desc:'Micro-cap starter' },
  { label:'500M',  val:500_000_000n*10n**18n, desc:'Mid-size' },
  { label:'1B',    val:1_000_000_000n*10n**18n, desc:'Classic meme' },
  { label:'10B',   val:10_000_000_000n*10n**18n, desc:'Doge-style' },
]
const GRADS = [
  { label:'$10K', val:10_000n*1_000_000n, desc:'Fast grad' },
  { label:'$25K', val:25_000n*1_000_000n, desc:'Quick' },
  { label:'$69K', val:69_000n*1_000_000n, desc:'Standard ⭐' },
  { label:'$100K',val:100_000n*1_000_000n, desc:'Premium' },
  { label:'$200K',val:200_000n*1_000_000n, desc:'Large' },
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
    <div className="max-w-md mx-auto text-center py-12">
      <motion.div initial={{scale:0.85,opacity:0}} animate={{scale:1,opacity:1}}>
        <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 8px 32px rgba(99,102,241,0.35)' }}>
          <Rocket size={34} className="text-white"/>
        </div>
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily:'Space Grotesk,sans-serif', color:'#111827' }}>Token Launched! 🚀</h2>
        <p className="text-sm mb-1" style={{ color:'#6b7280' }}><strong style={{ color:'#111827' }}>${form.symbol.toUpperCase()}</strong> is now live on Arc Mainnet.</p>
        <p className="text-xs mb-6" style={{ color:'#9ca3af' }}>{fmt(supply)} total supply · {curveBps/100}% on bonding curve</p>
        <div className="flex flex-col gap-3">
          <button onClick={()=>navigate('/')} className="py-3.5 rounded-2xl text-sm font-bold text-white" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            View All Tokens →
          </button>
          <button onClick={()=>{setForm(INIT);setStep('form')}} className="py-3.5 rounded-2xl text-sm font-semibold" style={{ background:'#f3f4f6', color:'#374151' }}>
            Launch Another
          </button>
        </div>
      </motion.div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <div className="h-1 w-14 rounded-full mb-5" style={{ background:'linear-gradient(90deg,#6366f1,#8b5cf6)' }}/>
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily:'Space Grotesk,sans-serif', color:'#111827' }}>Launch a Token</h1>
      <p className="text-sm mb-6" style={{ color:'#6b7280' }}>Create your meme token on the Arc bonding curve. No upfront liquidity needed.</p>

      {!isConnected ? (
        <div className="rounded-2xl p-10 text-center" style={card}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background:'rgba(99,102,241,0.08)' }}>
            <Rocket size={28} style={{ color:'#6366f1' }}/>
          </div>
          <h2 className="text-lg font-bold mb-2" style={{ color:'#111827' }}>Connect Your Wallet</h2>
          <p className="text-sm mb-5" style={{ color:'#6b7280' }}>Connect to Arc Mainnet to launch your token.</p>
          <ConnectKitButton/>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          {/* ── Left: Form ──────────────────────────────────── */}
          <div className="space-y-4">
            {/* Fee notice */}
            {fee>0n&&(
              <div className="flex items-center gap-3 p-3.5 rounded-2xl" style={{ background:usdcBalance>=fee?'#f0fdf4':'#fef2f2', border:`1px solid ${usdcBalance>=fee?'#bbf7d0':'#fecaca'}` }}>
                <DollarSign size={16} style={{ color:usdcBalance>=fee?'#16a34a':'#dc2626' }}/>
                <div className="flex-1">
                  <div className="text-sm font-bold" style={{ color:usdcBalance>=fee?'#15803d':'#dc2626' }}>Launch fee: {fmtUsdc(fee)}</div>
                  <div className="text-xs" style={{ color:'#6b7280' }}>{usdcBalance>=fee?`Balance: ${fmtUsdc(usdcBalance)} · Ready`:`Need ${fmtUsdc(fee)} USDC · You have ${fmtUsdc(usdcBalance)}`}</div>
                </div>
                {step!=='form'&&<div className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{step==='approving'?'Approving…':step==='launching'?'Launching…':''}</div>}
              </div>
            )}

            {/* Token details */}
            <div className="rounded-2xl p-5" style={card}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color:'#111827' }}><Zap size={15} style={{ color:'#6366f1' }}/>Token Details</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label style={lbl}>Name *</label>
                  <input style={inp} placeholder="e.g. Glow Cat" value={form.name} onChange={up('name')} maxLength={64}/>
                </div>
                <div>
                  <label style={lbl}>Ticker *</label>
                  <input style={{ ...inp, textTransform:'uppercase' }} placeholder="e.g. GCAT" value={form.symbol} onChange={up('symbol')} maxLength={12}/>
                </div>
              </div>
              <div className="mb-3">
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize:'none', minHeight:72 }} placeholder="Tell your story…" value={form.description} onChange={up('description') as any} maxLength={500}/>
                <div className="text-right text-[10px] mt-0.5" style={{ color:'#9ca3af' }}>{form.description.length}/500</div>
              </div>
              <div className="mb-3">
                <label style={lbl}>Logo</label>
                <ImageUpload value={form.imageUri} onChange={url=>setForm(f=>({...f,imageUri:url}))}/>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[['twitter','Twitter',Twitter,'@handle'],['telegram','Telegram',Send,'t.me/…'],['website','Website',Globe,'https://…']].map(([k,label,Icon,ph]:any)=>(
                  <div key={k}>
                    <label style={lbl}>{label}</label>
                    <div className="relative">
                      <Icon size={11} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'#9ca3af' }}/>
                      <input style={{ ...inp, paddingLeft:28 }} placeholder={ph} value={(form as any)[k]} onChange={up(k as keyof Form)}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Supply */}
            <div className="rounded-2xl p-5" style={card}>
              <h3 className="text-sm font-bold mb-3" style={{ color:'#111827' }}>Total Supply</h3>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {SUPPLIES.map((s,i)=>(
                  <button key={s.label} onClick={()=>setSI(i)}
                    className="py-2.5 rounded-xl text-xs font-bold transition-all"
                    style={{ background:supplyIdx===i?'#6366f1':'#f3f4f6', color:supplyIdx===i?'#fff':'#6b7280', border:supplyIdx===i?'none':'1px solid rgba(0,0,0,0.07)' }}>
                    <div>{s.label}</div><div className="text-[9px] mt-0.5 opacity-70">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced */}
            <div className="rounded-2xl overflow-hidden" style={card}>
              <button onClick={()=>setAdv(v=>!v)} className="w-full flex items-center justify-between px-5 py-4">
                <span className="text-sm font-bold flex items-center gap-2" style={{ color:'#111827' }}>
                  <Trophy size={14} style={{ color:'#f59e0b' }}/>Graduation &amp; Allocation
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background:'rgba(99,102,241,0.08)', color:'#6366f1' }}>Optional</span>
                </span>
                <ChevronDown size={15} style={{ color:'#9ca3af', transform:showAdv?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
              </button>
              <AnimatePresence>
                {showAdv&&(
                  <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} style={{ overflow:'hidden' }}>
                    <div className="px-5 pb-5 space-y-4 border-t" style={{ borderColor:'rgba(0,0,0,0.06)' }}>
                      <div className="pt-4">
                        <label style={lbl}>Graduation Threshold</label>
                        <div className="grid grid-cols-5 gap-1.5 mb-2">
                          {GRADS.map((g,i)=>(
                            <button key={g.label} onClick={()=>setGI(i)}
                              className="py-2 rounded-xl text-[10px] font-bold"
                              style={{ background:gradIdx===i?'#16a34a':'#f3f4f6', color:gradIdx===i?'#fff':'#6b7280', border:gradIdx===i?'none':'1px solid rgba(0,0,0,0.07)' }}>
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={lbl}>Curve Allocation — {(curveBps/100).toFixed(0)}%</label>
                        <input type="range" min={5000} max={9500} step={100} value={curveBps} onChange={e=>setCurve(Number(e.target.value))} className="w-full accent-indigo-500"/>
                      </div>
                      <div>
                        <label style={lbl}>Creator Allocation — {creatorBps===0?'None':`${(creatorBps/100).toFixed(0)}%`}</label>
                        <input type="range" min={0} max={1000} step={100} value={creatorBps} onChange={e=>setCr(Number(e.target.value))} className="w-full accent-indigo-500"/>
                        {creatorBps>0&&<div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-xl" style={{ background:'#fffbeb', border:'1px solid #fed7aa' }}><AlertTriangle size={11} style={{ color:'#f59e0b' }}/><p className="text-[10px]" style={{ color:'#92400e' }}>{(creatorBps/100).toFixed(0)}% ({fmt((supply*BigInt(creatorBps))/10_000n)} tokens) sent to your wallet at launch.</p></div>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Submit */}
            {chainId!==CHAIN_ID ? (
              <button onClick={()=>switchChain({chainId:CHAIN_ID as any})} className="w-full py-4 rounded-2xl text-sm font-bold" style={{ background:'#fef3c7', border:'1px solid #fed7aa', color:'#92400e' }}>
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
            {needApprove&&!busy&&<p className="text-center text-xs" style={{ color:'#9ca3af' }}>Step 1 of 2 — approve USDC, then launch fires automatically</p>}
          </div>

          {/* ── Right: Preview ───────────────────────────────── */}
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Token preview */}
            <div className="rounded-2xl overflow-hidden" style={card}>
              <div className="h-1.5" style={{ background:'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)' }}/>
              <div className="p-5">
                <div className="flex gap-3 mb-4">
                  {form.imageUri
                    ? <img src={form.imageUri} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border" style={{ borderColor:'rgba(0,0,0,0.08)' }}/>
                    : <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-bold text-white" style={{ background:`linear-gradient(135deg,hsl(${hue},60%,50%),hsl(${(hue+120)%360},55%,42%))` }}>{form.symbol?form.symbol.slice(0,2).toUpperCase():'??'}</div>}
                  <div>
                    <div className="text-lg font-bold" style={{ color:'#111827', fontFamily:'Space Grotesk,sans-serif' }}>{form.name||'Token Name'}</div>
                    <div className="text-sm font-bold" style={{ color:'#6366f1' }}>${form.symbol||'SYMBOL'}</div>
                    {form.description&&<p className="text-xs mt-1 line-clamp-2" style={{ color:'#6b7280' }}>{form.description}</p>}
                  </div>
                </div>
                {/* Allocation bars */}
                {[
                  { label:'Bonding Curve', pct:curveBps/100, color:'#6366f1' },
                  { label:'DEX Liquidity (at grad)', pct:Number(dexTokens)*100/Number(supply), color:'#16a34a' },
                  ...(creatorBps>0?[{ label:'Creator', pct:creatorBps/100, color:'#f59e0b' }]:[]),
                ].map(({label,pct,color})=>(
                  <div key={label} className="mb-2.5">
                    <div className="flex justify-between text-xs mb-1"><span style={{ color:'#6b7280' }}>{label}</span><span className="font-bold" style={{ color:'#111827' }}>{pct.toFixed(1)}%</span></div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'#f3f4f6' }}><div className="h-full rounded-full" style={{ width:`${pct}%`, background:color }}/></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-2xl p-4" style={card}>
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'#9ca3af' }}>Launch Summary</h4>
              {[
                {k:'Network',     v:'Arc Mainnet'},
                {k:'Currency',    v:'USDC'},
                {k:'Total Supply',v:fmt(supply)},
                {k:'Graduates at',v:GRADS[gradIdx]?.label??'$69K'},
                {k:'Protocol fee', v:'1%'},
                ...(fee>0n?[{k:'Launch fee',v:fmtUsdc(fee)}]:[]),
              ].map(({k,v})=>(
                <div key={k} className="flex justify-between py-1.5 border-b last:border-0 text-xs" style={{ borderColor:'rgba(0,0,0,0.05)' }}>
                  <span style={{ color:'#9ca3af' }}>{k}</span>
                  <span className="font-semibold" style={{ color:'#111827' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

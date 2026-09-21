import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  Wallet, Shield, ExternalLink, Copy, Check, AlertTriangle,
  Loader2, Send, ArrowDownLeft, Activity, BarChart3, Coins,
  TrendingUp, DollarSign, RefreshCw, Eye, EyeOff,
} from 'lucide-react'
import { formatUsdc, formatAddress } from '@/utils/format'
import { useTokenList } from '@/hooks/useTokenList'
import { FACTORY_ADDRESS, USDC_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'

function fmtUsd(n: number) { return n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(2)}` }

<<<<<<< HEAD
/* ── Tab button ─────────────────────────────────────────────────── */
function Tab({ id, label, icon: Icon, active, onClick }: any) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all"
      style={{ background:active?'#6366f1':'transparent', color:active?'var(--surface)':'#9ca3af' }}>
      <Icon size={12}/>{label}
    </button>
  )
}

/* ── Stat card ───────────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl" style={card}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:`${color}12` }}>
        <Icon size={16} style={{ color }}/>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color:'#9ca3af' }}>{label}</div>
        <div className="text-sm font-bold" style={{ color:'#111827', fontFamily:'Space Grotesk,sans-serif' }}>{value}</div>
      </div>
    </div>
  )
}

=======
>>>>>>> 801c1d5 (fix: admin KV unknown key (add PINATA_JWT/RPC_URL/SITE_LOGO/REFERRAL_FEE_BPS); dark mode for LaunchPage+WalletPage; desktop multi-column layout (1400px max, 4-col feed, 2-col wallet+launch))
type WTab = 'overview'|'portfolio'|'send'|'receive'|'activity'

const TABS: { id: WTab; label: string; icon: any }[] = [
  { id:'overview',   label:'Overview',   icon:BarChart3     },
  { id:'portfolio',  label:'Portfolio',  icon:Coins         },
  { id:'send',       label:'Send',       icon:Send          },
  { id:'receive',    label:'Receive',    icon:ArrowDownLeft },
  { id:'activity',   label:'Activity',   icon:Activity      },
]

export function WalletPage() {
  const { address: evmAddr, isConnected } = useAccount()
  const [tab, setTab]         = useState<WTab>('overview')
  const [hideBalance, setHide]= useState(false)
  const [toAddr, setTo]       = useState('')
  const [sendAmt, setSendAmt] = useState('')
  const [copied, setCopied]   = useState(false)

  const { data: usdcRaw, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf',
    args: evmAddr?[evmAddr]:undefined, chainId: CHAIN_ID as any, query:{ enabled:!!evmAddr, refetchInterval:15000 },
  })
  const usdcBal = (usdcRaw as bigint)??0n
  const usdcUsd = Number(usdcBal)/1e6

  const { addresses: glowAddrs } = useTokenList()

  const copy = (s: string) => { navigator.clipboard.writeText(s); setCopied(true); setTimeout(()=>setCopied(false),1500) }

  const { writeContract, isPending: sending, data: sendHash } = useWriteContract()
  const { isLoading: sendConfirming, isSuccess: sendDone } = useWaitForTransactionReceipt({ hash: sendHash })
  useEffect(() => { if(sendDone){ toast.success('Sent!'); refetchUsdc(); setTo(''); setSendAmt('') } }, [sendDone])

  const doSend = () => {
    if(!isAddress(toAddr)||!sendAmt) return
    const amt = BigInt(Math.floor(parseFloat(sendAmt)*1e6))
    writeContract({ address:USDC_ADDRESS, abi:erc20Abi, functionName:'transfer', args:[toAddr as any, amt], chainId:CHAIN_ID as any } as any, {
      onError:(e:any)=>toast.error(e.shortMessage??e.message)
    })
  }

  if (!isConnected) return (
    <div className="max-w-md mx-auto">
      <div className="h-1 w-14 rounded-full mb-5" style={{ background:'linear-gradient(90deg,#6366f1,#8b5cf6)' }}/>
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily:'Space Grotesk,sans-serif', color:'var(--text1)' }}>Wallet</h1>
      <p className="text-sm mb-6" style={{ color:'var(--text2)' }}>Connect your wallet to view your portfolio and manage assets.</p>
      <div className="rounded-2xl p-8 text-center" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background:'rgba(99,102,241,0.1)' }}>
          <Wallet size={28} style={{ color:'#818cf8' }}/>
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color:'var(--text1)' }}>Connect Your Wallet</h2>
        <p className="text-sm mb-5" style={{ color:'var(--text2)' }}>View your portfolio, send USDC, and manage your GlowFun tokens.</p>
        <ConnectKitButton/>
      </div>
    </div>
  )

  return (
    <div className="max-w-xl mx-auto xl:max-w-none xl:grid xl:grid-cols-[340px_1fr] xl:gap-6 xl:items-start">

      {/* ── Left column: hero card ─────────────────────────── */}
      <div className="space-y-4">
        <div className="h-1 w-14 rounded-full" style={{ background:'linear-gradient(90deg,#6366f1,#8b5cf6)' }}/>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily:'Space Grotesk,sans-serif', color:'var(--text1)' }}>Wallet</h1>
            <p className="text-xs" style={{ color:'var(--text2)' }}>Arc Mainnet</p>
          </div>
          <ConnectKitButton/>
        </div>

        {/* Balance hero */}
        <div className="rounded-2xl p-5" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 8px 24px rgba(99,102,241,0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">Total Balance</span>
            <button onClick={()=>setHide(v=>!v)} className="text-white/60">{hideBalance?<Eye size={16}/>:<EyeOff size={16}/>}</button>
          </div>
          <div className="text-4xl font-bold text-white mb-1" style={{ fontFamily:'Space Grotesk,sans-serif', letterSpacing:'-0.02em' }}>
            {hideBalance?'••••••':`$${usdcUsd.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
          </div>
          <div className="text-white/60 text-xs mb-5 font-mono">{formatAddress(evmAddr??'')}</div>
          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-2">
            {([['send','Send',Send],['receive','Receive',ArrowDownLeft],['portfolio','Portfolio',BarChart3],['activity','Activity',Activity]] as const).map(([t,label,Icon])=>(
              <button key={t} onClick={()=>setTab(t)}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all text-white"
                style={{ background:tab===t?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)' }}>
                <Icon size={16}/>
                <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label:'USDC',    value:hideBalance?'••••':formatUsdc(usdcBal), icon:DollarSign, color:'var(--green)' },
            { label:'Tokens',  value:String(glowAddrs.length),               icon:Coins,      color:'#818cf8'      },
            { label:'Network', value:'Arc',                                   icon:TrendingUp, color:'var(--gold)'  },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2.5 p-3 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:`color-mix(in srgb,${color} 15%,transparent)` }}>
                <Icon size={14} style={{ color }}/>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-widest" style={{ color:'var(--text2)' }}>{label}</div>
                <div className="text-sm font-bold" style={{ color:'var(--text1)', fontFamily:'Space Grotesk,sans-serif' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop tab nav (hidden on mobile — tabs sit below on mobile) */}
        <div className="hidden xl:flex flex-col gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={()=>setTab(id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
              style={{
                background: tab===id ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: tab===id ? '#818cf8' : 'var(--text2)',
                border: tab===id ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              }}>
              <Icon size={14}/>{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right column: tab content ──────────────────────── */}
      <div className="mt-4 xl:mt-0">
        {/* Mobile tab bar */}
        <div className="flex gap-1 p-1 rounded-2xl mb-4 xl:hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={()=>setTab(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{ background:tab===id?'#6366f1':'transparent', color:tab===id?'#fff':'var(--text2)' }}>
              <Icon size={12}/><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

<<<<<<< HEAD
      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background:'var(--surface)', border:'1px solid rgba(0,0,0,0.08)' }}>
        {[['overview','Overview',BarChart3],['portfolio','Portfolio',Coins],['send','Send',Send],['receive','Receive',ArrowDownLeft],['activity','Activity',Activity]].map(([id,label,Icon]:any)=>(
          <Tab key={id} id={id} label={label} icon={Icon} active={tab===id} onClick={()=>setTab(id)}/>
        ))}
      </div>
=======
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:0.15 }}>
            <div className="rounded-2xl p-5" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
>>>>>>> 801c1d5 (fix: admin KV unknown key (add PINATA_JWT/RPC_URL/SITE_LOGO/REFERRAL_FEE_BPS); dark mode for LaunchPage+WalletPage; desktop multi-column layout (1400px max, 4-col feed, 2-col wallet+launch))

              {/* Overview */}
              {tab==='overview' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold" style={{ color:'var(--text1)' }}>Wallet Details</h3>
                  {[
                    {k:'Address', v:evmAddr??'', mono:true},
                    {k:'Network', v:'Arc Mainnet'},
                    {k:'Chain ID', v:String(CHAIN_ID)},
                  ].map(({k,v,mono})=>(
                    <div key={k} className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor:'var(--border)' }}>
                      <span className="text-xs uppercase tracking-widest font-semibold" style={{ color:'var(--text2)' }}>{k}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${mono?'font-mono':''}`} style={{ color:'var(--text1)' }}>{v.length>22?formatAddress(v):v}</span>
                        {mono&&<button onClick={()=>copy(v)}>{copied?<Check size={11} style={{color:'var(--green)'}}/>:<Copy size={11} style={{color:'var(--text3)'}}/>}</button>}
                        {mono&&<a href={`${EXPLORER_BASE}/address/${v}`} target="_blank" rel="noopener"><ExternalLink size={11} style={{color:'var(--text3)'}}/></a>}
                      </div>
                    </div>
                  ))}
                  <div className="p-3.5 rounded-xl" style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.15)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color:'var(--green)' }}>Security Tips</div>
                    {['Never share your private key or seed phrase.','Verify all transaction details before signing.','Check URLs carefully — phishing sites look legitimate.'].map(t=>(
                      <div key={t} className="flex items-start gap-2 mt-1.5">
                        <Shield size={10} className="flex-shrink-0 mt-0.5" style={{ color:'var(--green)' }}/>
                        <span className="text-[10px]" style={{ color:'var(--text2)' }}>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Portfolio */}
              {tab==='portfolio' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold" style={{ color:'var(--text1)' }}>Holdings</h3>
                    <button onClick={()=>refetchUsdc()} style={{ color:'var(--text2)' }}><RefreshCw size={13}/></button>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-base" style={{ background:'rgba(59,130,246,0.12)' }}>💲</div>
                    <div className="flex-1">
                      <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>USDC</div>
                      <div className="text-xs" style={{ color:'var(--text2)' }}>USD Coin</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>{hideBalance?'••••':formatUsdc(usdcBal)}</div>
                      <div className="text-xs" style={{ color:'var(--text2)' }}>Arc Mainnet</div>
                    </div>
                  </div>
                  {glowAddrs.length===0&&<p className="text-xs text-center py-4" style={{ color:'var(--text3)' }}>No GlowFun tokens held yet</p>}
                </div>
              )}

<<<<<<< HEAD
            {/* Receive */}
            {tab==='receive' && evmAddr && (
              <div className="text-center space-y-4">
                <h3 className="text-sm font-bold" style={{ color:'#111827' }}>Your Wallet Address</h3>
                <div className="flex justify-center">
                  <div className="p-4 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid rgba(0,0,0,0.08)' }}>
                    <QRCodeSVG value={evmAddr} size={160} level="H"/>
=======
              {/* Send */}
              {tab==='send' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold" style={{ color:'var(--text1)' }}>Send USDC</h3>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color:'var(--text2)' }}>Recipient Address</label>
                    <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)' }}
                      placeholder="0x…" value={toAddr} onChange={e=>setTo(e.target.value)}/>
                    {toAddr&&!isAddress(toAddr)&&<p className="text-xs mt-1" style={{ color:'var(--red)' }}>Invalid address</p>}
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color:'var(--text2)' }}>Amount (USDC)</label>
                      <button className="text-xs font-semibold" style={{ color:'#818cf8' }} onClick={()=>setSendAmt((Number(usdcBal)/1e6).toFixed(6))}>Max: {formatUsdc(usdcBal)}</button>
                    </div>
                    <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background:'var(--surface2)', border:'1px solid var(--border2)', color:'var(--text1)' }}
                      type="number" placeholder="0.00" value={sendAmt} onChange={e=>setSendAmt(e.target.value)}/>
                  </div>
                  <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.99}}
                    onClick={doSend} disabled={!isAddress(toAddr)||!sendAmt||sending||sendConfirming}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 16px rgba(99,102,241,0.25)' }}>
                    {sending||sendConfirming?<><Loader2 size={15} className="animate-spin"/>Sending…</>:<><Send size={15}/>Send USDC</>}
                  </motion.button>
                </div>
              )}

              {/* Receive */}
              {tab==='receive' && evmAddr && (
                <div className="text-center space-y-4">
                  <h3 className="text-sm font-bold" style={{ color:'var(--text1)' }}>Your Wallet Address</h3>
                  <div className="flex justify-center">
                    <div className="p-4 rounded-2xl" style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)' }}>
                      <QRCodeSVG value={evmAddr} size={160} level="H"/>
                    </div>
                  </div>
                  <div className="px-4 py-3 rounded-xl text-left" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                    <p className="text-xs font-mono break-all" style={{ color:'var(--text1)' }}>{evmAddr}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={()=>copy(evmAddr)} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                      style={{ background:copied?'rgba(34,197,94,0.08)':'var(--surface2)', border:copied?'1px solid rgba(34,197,94,0.2)':'1px solid var(--border)', color:copied?'var(--green)':'var(--text1)' }}>
                      {copied?<><Check size={14}/>Copied!</>:<><Copy size={14}/>Copy Address</>}
                    </button>
                    <a href={`${EXPLORER_BASE}/address/${evmAddr}`} target="_blank" rel="noopener"
                      className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 no-underline"
                      style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.15)', color:'#818cf8' }}>
                      <ExternalLink size={14}/>Explorer
                    </a>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)' }}>
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color:'var(--gold)' }}/>
                    <p className="text-xs text-left" style={{ color:'var(--text2)' }}>Only send Arc Mainnet (chain ID {CHAIN_ID}) assets to this address.</p>
>>>>>>> 801c1d5 (fix: admin KV unknown key (add PINATA_JWT/RPC_URL/SITE_LOGO/REFERRAL_FEE_BPS); dark mode for LaunchPage+WalletPage; desktop multi-column layout (1400px max, 4-col feed, 2-col wallet+launch))
                  </div>
                </div>
              )}

              {/* Activity */}
              {tab==='activity' && (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background:'rgba(99,102,241,0.08)' }}>
                    <Activity size={22} style={{ color:'#818cf8' }}/>
                  </div>
                  <h3 className="text-sm font-bold mb-1" style={{ color:'var(--text1)' }}>Transaction History</h3>
                  <p className="text-xs mb-4" style={{ color:'var(--text2)' }}>View all your on-chain activity on Arc Explorer</p>
                  <a href={`${EXPLORER_BASE}/address/${evmAddr}`} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold no-underline text-white"
                    style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    <ExternalLink size={14}/>Open Arc Explorer
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

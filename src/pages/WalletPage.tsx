import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  Wallet, Shield, ExternalLink, Copy, Check, AlertTriangle,
  Loader2, Send, ArrowDownLeft, Activity, BarChart3,
  RefreshCw, Eye, EyeOff, PieChart,
} from 'lucide-react'
import { formatUsdc, formatAddress } from '@/utils/format'
import { useHeldTokens } from '@/hooks/usePortfolio'
import { PortfolioTokenRow } from '@/components/wallet/PortfolioTokenRow'
import { AssetLogo } from '@/components/wallet/AssetLogo'
import { USDC_ADDRESS, EURC_ADDRESS, USYC_ADDRESS, CIRBTC_ADDRESS, CHAIN_ID, EXPLORER_BASE } from '@/constants'

/** Format a raw balance for a non-USDC Circle asset — arbitrary decimals, no $ assumption. */
const fmtAsset = (raw: bigint | undefined, decimals: number): string => {
  const n = Number(raw ?? 0n) / 10 ** decimals
  if (n === 0) return '0'
  if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 })
  return n.toFixed(decimals >= 8 ? 6 : 4).replace(/\.?0+$/, '') || '0'
}

type WTab = 'portfolio'|'overview'|'send'|'receive'|'activity'

const TABS: { id: WTab; label: string; icon: any }[] = [
  { id:'portfolio',  label:'Portfolio',  icon:PieChart      },
  { id:'send',       label:'Send',       icon:Send          },
  { id:'receive',    label:'Receive',    icon:ArrowDownLeft },
  { id:'activity',   label:'Activity',   icon:Activity      },
  { id:'overview',   label:'Details',    icon:BarChart3     },
]

export function WalletPage() {
  const { address: evmAddr, isConnected } = useAccount()
  const [tab, setTab]         = useState<WTab>('portfolio')
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

  // Other Circle-issued assets on Arc. Shown only when actually held (unlike USDC, these
  // aren't the platform's settlement asset) — no live FX/BTC price feed here, so their
  // balances are shown in their own unit rather than folded into the USD total below.
  const { data: eurcRaw }   = useReadContract({ address: EURC_ADDRESS,   abi: erc20Abi, functionName: 'balanceOf', args: evmAddr?[evmAddr]:undefined, chainId: CHAIN_ID as any, query:{ enabled:!!evmAddr, refetchInterval:15000 } })
  const { data: usycRaw }   = useReadContract({ address: USYC_ADDRESS,   abi: erc20Abi, functionName: 'balanceOf', args: evmAddr?[evmAddr]:undefined, chainId: CHAIN_ID as any, query:{ enabled:!!evmAddr, refetchInterval:15000 } })
  const { data: cirbtcRaw } = useReadContract({ address: CIRBTC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: evmAddr?[evmAddr]:undefined, chainId: CHAIN_ID as any, query:{ enabled:!!evmAddr, refetchInterval:15000 } })
  const eurcBal   = (eurcRaw as bigint)   ?? 0n
  const usycBal   = (usycRaw as bigint)   ?? 0n
  const cirbtcBal = (cirbtcRaw as bigint) ?? 0n

  // All platform-launched tokens this wallet actually holds (balance > 0), across every
  // GlowFun factory version — not just a count, real balances + logos + live USD value.
  const { held, isLoading: heldLoading, refetch: refetchHeld } = useHeldTokens()
  const [tokenValues, setTokenValues] = useState<Record<string, number>>({})
  const onRowValue = useCallback((address: string, usd: number) => {
    setTokenValues((v) => (v[address.toLowerCase()] === usd ? v : { ...v, [address.toLowerCase()]: usd }))
  }, [])
  const tokensUsd = Object.values(tokenValues).reduce((a, b) => a + b, 0)
  const totalUsd  = usdcUsd + tokensUsd

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
    <div className="max-w-xl mx-auto lg:max-w-none lg:grid lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] lg:gap-7 lg:items-start">

      {/* ── Left column: hero card ─────────────────────────── */}
      <div className="space-y-4">
        {/* Balance hero */}
        <div className="rounded-2xl p-5" style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 8px 24px rgba(99,102,241,0.3)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">Total Balance</span>
            <button onClick={()=>setHide(v=>!v)} className="text-white/60">{hideBalance?<Eye size={16}/>:<EyeOff size={16}/>}</button>
          </div>
          <div className="text-4xl font-bold text-white mb-1" style={{ fontFamily:'Space Grotesk,sans-serif', letterSpacing:'-0.02em' }}>
            {hideBalance?'••••••':`$${totalUsd.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
          </div>
          {!hideBalance && held.length > 0 && (
            <div className="text-white/50 text-[11px] mb-1">
              {formatUsdc(usdcBal)} USDC · ${tokensUsd.toLocaleString('en',{maximumFractionDigits:2})} in {held.length} token{held.length===1?'':'s'}
            </div>
          )}
          <div className="text-white/60 text-xs mb-5 font-mono">{formatAddress(evmAddr??'')}</div>
          {/* Quick actions — the only tab switcher below xl; the sidebar tab nav takes over on xl+ */}
          <div className="grid grid-cols-5 gap-1.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={()=>setTab(id)}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all text-white"
                style={{ background:tab===id?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)' }}>
                <Icon size={15}/>
                <span className="text-[8px] font-bold uppercase tracking-wide">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop tab nav (hidden below xl — the hero's quick actions above cover it there) */}
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
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:0.15 }}>
            <div className="rounded-2xl p-5" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>

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
                    <div>
                      <h3 className="text-sm font-bold" style={{ color:'var(--text1)' }}>Holdings</h3>
                      <p className="text-[10px]" style={{ color:'var(--text3)' }}>USDC + every GlowFun token you hold, across every launch</p>
                    </div>
                    <button onClick={()=>{ refetchUsdc(); refetchHeld() }} style={{ color:'var(--text2)' }}><RefreshCw size={13}/></button>
                  </div>

                  {/* USDC — always shown, the platform's own settlement asset */}
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                    <AssetLogo symbol="USDC" size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>USDC</div>
                      <div className="text-xs" style={{ color:'var(--text2)' }}>USD Coin</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>{hideBalance?'••••':formatUsdc(usdcBal)}</div>
                      <div className="text-xs" style={{ color:'var(--text2)' }}>{hideBalance?'••••':`$${usdcUsd.toLocaleString('en',{maximumFractionDigits:2})}`}</div>
                    </div>
                  </div>

                  {/* Other Circle-issued assets — shown only if actually held, since most
                      wallets won't hold these. No live FX/BTC price feed here, so these show
                      their own-unit balance rather than a guessed $ figure. */}
                  {eurcBal > 0n && (
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                      <AssetLogo symbol="EURC" size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>EURC</div>
                        <div className="text-xs" style={{ color:'var(--text2)' }}>Euro Coin</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>{hideBalance?'••••':`€${fmtAsset(eurcBal,6)}`}</div>
                      </div>
                    </div>
                  )}
                  {usycBal > 0n && (
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                      <AssetLogo symbol="USYC" size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>USYC</div>
                        <div className="text-xs" style={{ color:'var(--text2)' }}>Tokenized money-market fund shares</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>{hideBalance?'••••':fmtAsset(usycBal,6)}</div>
                      </div>
                    </div>
                  )}
                  {cirbtcBal > 0n && (
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                      <AssetLogo symbol="cirBTC" size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>cirBTC</div>
                        <div className="text-xs" style={{ color:'var(--text2)' }}>Circle wrapped Bitcoin</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold" style={{ color:'var(--text1)' }}>{hideBalance?'••••':fmtAsset(cirbtcBal,8)}</div>
                      </div>
                    </div>
                  )}

                  {/* Every platform token actually held, with real logos + live value */}
                  {held.map((h) => (
                    <PortfolioTokenRow key={h.address} address={h.address} balance={h.balance} hideBalance={hideBalance} onValue={onRowValue} />
                  ))}

                  {heldLoading && held.length===0 && (
                    <div className="space-y-2 mt-1">
                      {[0,1].map(i => <div key={i} className="h-[64px] rounded-xl shimmer" style={{ border:'1px solid var(--border)' }}/>)}
                    </div>
                  )}
                  {!heldLoading && held.length===0 && eurcBal===0n && usycBal===0n && cirbtcBal===0n && (
                    <p className="text-xs text-center py-6" style={{ color:'var(--text3)' }}>No GlowFun tokens held yet — buy or launch one to see it here.</p>
                  )}
                </div>
              )}

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

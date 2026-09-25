import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract, useReadContracts } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { FACTORY_ABI } from '@/abi/GlowFunFactory'
import { useConfig, type FactoryEntry } from '@/context/ConfigContext'
import { formatUsdc, formatAddress } from '@/utils/format'
import {
  Shield, Settings, Key, Database, Globe, Loader2, Check, Eye, EyeOff,
  RefreshCw, Save, ExternalLink, AlertTriangle, BarChart2, Image,
  MessageSquare, DollarSign, Zap, Lock, Unlock, Users, Crown,
  Ban, Activity, ChevronRight, Server, Sliders, Upload, X as XIcon,
  Trophy, Settings2, Info, PlusCircle
} from 'lucide-react'
import { parseOnchainError } from '@/utils/errors'
import { useTokenList } from '@/hooks/useTokenList'

const SPECTRAL = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'

const KV_KEYS = [
  { key: 'FACTORY_ADDRESS',          label: 'Factory Contract',         placeholder: '0x...',                                                    category: 'contract', secret: false },
  { key: 'USDC_ADDRESS',             label: 'USDC Contract',            placeholder: '0x3600000000000000000000000000000000000000',               category: 'contract', secret: false },
  { key: 'FEE_RECIPIENT',            label: 'Fee Recipient',            placeholder: '0x...',                                                    category: 'contract', secret: false },
  { key: 'GRADUATION_RECIPIENT',     label: 'Graduation Recipient',     placeholder: '0x...',                                                    category: 'contract', secret: false },
  { key: 'RPC_URL',                  label: 'Custom RPC URL',           placeholder: 'https://rpc.arc.io',                                       category: 'contract', secret: false },
  { key: 'WALLETCONNECT_PROJECT_ID', label: 'WalletConnect Project ID', placeholder: 'Get from cloud.walletconnect.com',                         category: 'keys',    secret: false },
  { key: 'CIRCLE_APP_ID',            label: 'Circle App ID',            placeholder: 'Get from Circle Dev Console',                              category: 'keys',    secret: false },
  { key: 'CIRCLE_API_KEY',           label: 'Circle API Key',           placeholder: 'TEST_API_KEY:...',                                         category: 'keys',    secret: true  },
  { key: 'ADMIN_SECRET',             label: 'Admin Password',           placeholder: 'Strong password',                                          category: 'keys',    secret: true  },
  { key: 'PINATA_JWT',               label: 'Pinata JWT (IPFS)',        placeholder: 'eyJhbGci... from app.pinata.cloud',                        category: 'storage', secret: true  },
  { key: 'R2_PUBLIC_URL',            label: 'R2 Public URL',            placeholder: 'https://pub-xxx.r2.dev',                                   category: 'storage', secret: false },
  { key: 'SITE_TITLE',               label: 'Site Name',                placeholder: 'GlowFun',                                                  category: 'site',    secret: false },
  { key: 'SITE_DESCRIPTION',         label: 'Site Description',         placeholder: 'Launch and trade meme tokens on Arc',                      category: 'site',    secret: false },
  { key: 'TWITTER_HANDLE',           label: 'Twitter Handle',           placeholder: '@glowfun',                                                 category: 'site',    secret: false },
  { key: 'CREATION_FEE_USDC',        label: 'Creation Fee display',     placeholder: '10',                                                       category: 'fees',    secret: false },
  { key: 'PROTOCOL_FEE_BPS',         label: 'Protocol Fee (bps)',       placeholder: '100',                                                      category: 'fees',    secret: false },
  { key: 'GRADUATION_THRESHOLD_USDC',label: 'Graduation Threshold',     placeholder: '69000',                                                    category: 'fees',    secret: false },
  { key: 'REFERRAL_FEE_BPS',         label: 'Referral Fee (bps)',       placeholder: '2500',                                                     category: 'fees',    secret: false },
]

const SECTIONS = [
  { id: 'overview',  label: 'Overview',      icon: Activity  },
  { id: 'config',    label: 'Configuration', icon: Key       },
  { id: 'onchain',   label: 'On-Chain',      icon: Zap       },
  { id: 'tokens',    label: 'Tokens',        icon: BarChart2 },
  { id: 'comments',  label: 'Comments',      icon: MessageSquare },
]

const CATS = [
  { id: 'all',      label: 'All',       icon: Settings  },
  { id: 'contract', label: 'Contract',  icon: Zap       },
  { id: 'keys',     label: 'API Keys',  icon: Key       },
  { id: 'fees',     label: 'Fees',      icon: DollarSign},
  { id: 'site',     label: 'Site',      icon: Globe     },
  { id: 'storage',  label: 'Storage',   icon: Database  },
]

/* ── Reusable sub-components ───────────────────────────────────────────── */

function SectionCard({ title, icon: Icon, accent = '#a78bfa', children }: {
  title: string; icon: any; accent?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, accent = '#a78bfa', sub }: {
  label: string; value: string; icon: any; accent?: string; sub?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={13} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-lg font-bold" style={{ color: 'var(--text1)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{sub}</div>}
    </div>
  )
}

function FieldRow({ label, placeholder, value, onChange, onSave, saving, saved, secret, note }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; onSave: () => void;
  saving: boolean; saved: boolean; secret: boolean; note?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text1)' }}>{label}</div>
          {note && <div className="text-xs mb-2" style={{ color: 'var(--text2)' }}>{note}</div>}
          <div className="relative">
            <input
              type={secret && !show ? 'password' : 'text'}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSave()}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none pr-8"
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border2)',
                color: 'var(--text1)',
                fontFamily: secret ? 'monospace' : 'inherit',
              }}
            />
            {secret && (
              <button onClick={() => setShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            )}
          </div>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="mt-6 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition-all"
          style={saved
            ? { background: 'rgba(34,197,94,0.1)', color: '#34d399', border: '1px solid rgba(34,197,94,0.2)' }
            : { background: 'var(--accent)', color: 'white', border: 'none' }
          }
        >
          {saving ? <Loader2 size={11} className="animate-spin" />
            : saved ? <><Check size={11} />Saved</>
            : <><Save size={11} />Save</>}
        </button>
      </div>
    </div>
  )
}

/* ── Site Logo Upload Row ───────────────────────────────────────────────── */
function LogoUploadRow({ adminToken, currentUrl, onSaved }: {
  adminToken: string
  currentUrl: string
  onSaved: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview]     = useState(currentUrl)
  const [saved, setSaved]         = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync preview when parent currentUrl changes (e.g. after KV load)
  useEffect(() => { if (currentUrl && !preview) setPreview(currentUrl) }, [currentUrl])

  const upload = async (file: File) => {
    if (!file) return
    if (!['image/jpeg','image/jpg','image/png','image/gif','image/webp'].includes(file.type)) {
      toast.error('Use JPEG, PNG, GIF or WebP'); return
    }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5 MB'); return }

    // Local preview immediately
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      // Try R2 first
      const fd = new FormData()
      fd.append('file', file)
      fd.append('prefix', 'logo') // hint for the worker to use logo/ key
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json() as any
      if (!d.ok) throw new Error(d.error ?? 'R2 upload failed')

      // Save URL to KV
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
        body: JSON.stringify({ key: 'SITE_LOGO', value: d.url }),
      })
      const rd = await res.json() as any
      if (!rd.ok) throw new Error(rd.error ?? 'KV save failed')

      setPreview(d.url)
      setSaved(true)
      onSaved(d.url)
      toast.success('Site logo updated — takes effect immediately')
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      toast.error(e.message)
      setPreview(currentUrl) // revert preview on failure
    }
    setUploading(false)
  }

  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text1)' }}>Site Logo</div>
      <div className="text-xs mb-3" style={{ color: 'var(--text2)' }}>Square image, min 64×64px. PNG, JPG, GIF or WebP, max 5 MB. Takes effect site-wide immediately.</div>
      <div className="flex items-center gap-4">
        {/* Current logo preview */}
        <div
          className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
          style={{ background: 'var(--surface3)', border: `2px dashed ${dragOver ? '#818cf8' : 'var(--border2)'}` }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
        >
          {preview
            ? <img src={preview} alt="logo" className="w-full h-full object-cover" onError={() => setPreview('')} />
            : <Image size={20} style={{ color: 'var(--text3)' }} />
          }
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <Loader2 size={16} className="animate-spin text-white" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 space-y-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={saved
              ? { background: 'rgba(34,197,94,0.1)', color: '#34d399', border: '1px solid rgba(34,197,94,0.2)' }
              : { background: 'var(--accent)', color: 'white', border: 'none' }
            }
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} /> : <Upload size={11} />}
            {uploading ? 'Uploading...' : saved ? 'Logo saved!' : 'Upload logo'}
          </button>
          {preview && (
            <button
              onClick={() => {
                setPreview('')
                fetch('/api/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
                  body: JSON.stringify({ key: 'SITE_LOGO', value: '' }),
                }).then(() => { onSaved(''); toast.success('Logo removed') })
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ color: 'var(--text3)', background: 'transparent' }}
            >
              <XIcon size={9} />Remove
            </button>
          )}
          <p className="text-[10px]" style={{ color: 'var(--text3)' }}>Or drag and drop onto the preview</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
    </div>
  )
}

function OnchainInput({ label, note, value, onChange, onSet, disabled, placeholder = '' }: {
  label: string; note?: string; value: string; onChange: (v: string) => void;
  onSet: () => void; disabled: boolean; placeholder?: string
}) {
  return (
    <div className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text1)' }}>{label}</div>
      {note && <div className="text-xs mb-2" style={{ color: 'var(--text2)' }}>{note}</div>}
      <div className="flex gap-2 mt-1.5">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }}
        />
        <button
          onClick={onSet}
          disabled={disabled || !value}
          className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Save size={11} />Set
        </button>
      </div>
    </div>
  )
}

/* ── Main AdminPage ─────────────────────────────────────────────────────── */

/* ── Boost Tier Editor ───────────────────────────────────────────── */
/* ── Factory Address Editor ──────────────────────────────────────────── */
function FactoryAddressEditor({ onSave }: { onSave?: (f: FactoryEntry[]) => void }) {
  const { FACTORY_ADDRESSES, FACTORY_ADDRESS, ADMIN_SECRET } = useConfig()
  const [entries, setEntries] = useState<FactoryEntry[]>([])
  const [dirty,   setDirty]   = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (dirty) return
    if (FACTORY_ADDRESSES.length > 0) {
      setEntries(FACTORY_ADDRESSES.map(e => ({ ...e })))
    } else if (FACTORY_ADDRESS) {
      setEntries([{ address: FACTORY_ADDRESS, label: 'V1', version: 1, enabled: true }])
    }
  }, [FACTORY_ADDRESSES, FACTORY_ADDRESS, dirty])

  const update = (i: number, field: keyof FactoryEntry, val: string | number | boolean) => {
    setEntries(prev => prev.map((e, j) => j === i ? { ...e, [field]: val } : e))
    setDirty(true)
  }

  const add = () => {
    const nextV = (entries[entries.length - 1]?.version ?? 0) + 1
    setEntries(prev => [...prev, { address: '' as `0x${string}`, label: `V${nextV}`, version: nextV, enabled: true }])
    setDirty(true)
  }

  const remove = (i: number) => {
    if (entries.length <= 1) { toast.error('Keep at least one factory'); return }
    setEntries(prev => prev.filter((_, j) => j !== i))
    setDirty(true)
  }

  const save = async () => {
    const valid = entries.filter(e => e.address?.startsWith('0x') && e.address.length >= 10)
    if (!valid.length) { toast.error('Add at least one valid address'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_SECRET ?? '' },
        body: JSON.stringify({
          updates: JSON.stringify({
            FACTORY_ADDRESSES: JSON.stringify(valid),
            FACTORY_ADDRESS:   valid[0].address,
          }),
        }),
      })
      if (res.ok) {
        toast.success(`✓ ${valid.length} factory address${valid.length > 1 ? 'es' : ''} saved`)
        setDirty(false)
        onSave?.(valid)
      } else {
        const err = await res.json().catch(() => ({})) as any
        toast.error(`Save failed: ${err.error ?? res.status}`)
      }
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#14b8a6','#0ea5e9']

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:'1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:'rgba(99,102,241,0.12)' }}>
            <Database size={15} style={{ color:'var(--accent)' }}/>
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color:'var(--text1)' }}>Factory Contracts</p>
            <p className="text-[10px]" style={{ color:'var(--text3)' }}>
              Tokens from ALL factories appear in the feed. V1, V2, V3 — add any version.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background:'rgba(245,158,11,0.12)', color:'var(--gold)' }}>Unsaved</span>}
          <button onClick={add}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background:'rgba(99,102,241,0.1)', color:'var(--accent)', border:'1px solid rgba(99,102,241,0.2)' }}>
            <span className="text-base leading-none">+</span> Add factory
          </button>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {!entries.length && (
          <p className="text-xs text-center py-4" style={{ color:'var(--text2)' }}>
            No factories. Click "+ Add factory" to add your first contract address.
          </p>
        )}

        {entries.map((entry, i) => {
          const color   = COLORS[i % COLORS.length]
          const primary = i === 0
          return (
            <div key={i} className="rounded-xl overflow-hidden"
              style={{ border:`1px solid ${primary ? color+'35' : 'var(--border)'}`, background:'var(--surface2)' }}>
              {/* Label row */}
              <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.enabled !== false ? color : 'var(--text3)' }}/>
                <input
                  value={entry.label}
                  onChange={e => update(i, 'label', e.target.value)}
                  placeholder={`Version ${i + 1}`}
                  maxLength={30}
                  className="flex-1 bg-transparent outline-none text-xs font-bold truncate min-w-0"
                  style={{ color: entry.enabled !== false ? color : 'var(--text3)' }}
                />
                {primary && (
                  <span className="text-[8px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background:`${color}18`, color, border:`1px solid ${color}30` }}>
                    PRIMARY
                  </span>
                )}
                {/* Active toggle */}
                <button
                  onClick={() => update(i, 'enabled', entry.enabled !== false ? false : true)}
                  title={entry.enabled !== false ? 'Disable this factory' : 'Enable this factory'}
                  className="relative flex-shrink-0 w-8 h-4 rounded-full transition-colors duration-200 focus:outline-none"
                  style={{ background: entry.enabled !== false ? '#22c55e' : 'var(--surface3)', border:'1px solid var(--border)' }}>
                  <span className="absolute top-0.5 transition-transform duration-200 w-3 h-3 rounded-full bg-white shadow"
                    style={{ left: entry.enabled !== false ? '17px' : '1px' }}/>
                </button>
                <button onClick={() => remove(i)} disabled={entries.length <= 1}
                  className="w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 disabled:opacity-20"
                  style={{ background:'rgba(239,68,68,0.08)', color:'var(--red)', border:'none', cursor:'pointer' }}>
                  <XIcon size={10}/>
                </button>
              </div>
              {/* Address input */}
              <div className="px-3 pb-3">
                <input
                  value={entry.address}
                  onChange={e => update(i, 'address', e.target.value as `0x${string}`)}
                  placeholder="0x contract address"
                  className="w-full px-3 py-2.5 rounded-lg text-[11px] font-mono outline-none transition-opacity"
                  style={{
                    background:'var(--surface3)',
                    border:`1px solid ${entry.address?.startsWith('0x') && entry.enabled !== false ? color+'25' : 'var(--border)'}`,
                    color: entry.enabled !== false ? 'var(--text1)' : 'var(--text3)',
                    opacity: entry.enabled !== false ? 1 : 0.5,
                  }}
                />
                {entry.enabled === false && (
                  <p className="text-[9px] mt-1 pl-1" style={{ color:'var(--text3)' }}>
                    Disabled — tokens from this factory are hidden from the feed
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {entries.length > 1 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[10px]"
            style={{ background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.12)', color:'var(--text2)' }}>
            <Info size={11} style={{ color:'var(--accent)', flexShrink:0, marginTop:1 }}/>
            <span>
              Feed shows tokens from <strong style={{ color:'var(--text1)' }}>all factories</strong> combined.
              New launches use the <strong style={{ color:'var(--accent)' }}>PRIMARY</strong> factory.
              Buy/sell routes automatically to the correct factory per token.
            </span>
          </div>
        )}

        <button onClick={save} disabled={saving || !dirty}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background:dirty?'linear-gradient(135deg,#6366f1,#8b5cf6)':'var(--surface3)', color:dirty?'#fff':'var(--text2)' }}>
          {saving
            ? <><Loader2 size={14} className="animate-spin"/>Saving…</>
            : <><Save size={14}/>Save {entries.length} factory address{entries.length !== 1 ? 'es' : ''}</>}
        </button>
      </div>
    </div>
  )
}

function BoostTierEditor({ chainId, factoryAddress, adminBusy, adminCall, wrong, switchChain }: {
  chainId:number; factoryAddress:`0x${string}`|null;
  adminBusy:boolean; adminCall:(fn:string,args:any[])=>void;
  wrong:boolean; switchChain:(args:any)=>void;
}) {
  const { data: tiersRaw, refetch } = useReadContract({
    address: factoryAddress as any, abi: FACTORY_ABI, functionName: 'getBoostTiers',
    chainId: chainId as any, query: { enabled: !!factoryAddress, staleTime: 5000 },
  })
  const onChainTiers = (tiersRaw as any[] ?? []) as Array<{boostBps:bigint;feeBps:bigint;label:string}>

  // Local editable copy
  const [tiers, setTiers] = useState<Array<{boostBps:string;feeBps:string;label:string}>>([])
  const [dirty, setDirty] = useState(false)

  // Sync from chain whenever loaded
  useEffect(() => {
    if (onChainTiers.length > 0 && !dirty) {
      setTiers(onChainTiers.map(t => ({
        boostBps: (Number(t.boostBps)/100).toString(),
        feeBps:   (Number(t.feeBps)/100).toString(),
        label:    t.label,
      })))
    }
  }, [tiersRaw, dirty])

  const update = (i: number, field: string, val: string) => {
    setTiers(prev => prev.map((t,j) => j===i ? {...t,[field]:val} : t))
    setDirty(true)
  }

  const saveTiers = () => {
    if (wrong) { switchChain({ chainId: chainId as any }); return }
    const boostBpsArr = tiers.map(t => BigInt(Math.round(parseFloat(t.boostBps||'0') * 100)))
    const feeBpsArr   = tiers.map(t => BigInt(Math.round(parseFloat(t.feeBps||'0')   * 100)))
    const labels      = tiers.map(t => t.label)
    adminCall('setBoostTiers', [boostBpsArr as any, feeBpsArr as any, labels as any])
    setDirty(false)
    setTimeout(() => refetch(), 3000)
  }

  const addTier = () => {
    if (tiers.length >= 10) { toast.error('Max 10 tiers'); return }
    setTiers(prev => [...prev, { boostBps:'10', feeBps:'1', label:'10%' }])
    setDirty(true)
  }

  const removeTier = (i: number) => {
    setTiers(prev => prev.filter((_,j) => j!==i))
    setDirty(true)
  }

  // Quick-fill label when boostBps changes
  const handleBoostChange = (i: number, val: string) => {
    const n = parseFloat(val)
    const autoLabel = !isNaN(n) ? (n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`) : val
    setTiers(prev => prev.map((t,j) => j===i ? {...t, boostBps:val, label:autoLabel} : t))
    setDirty(true)
  }

  // Tier colour palette
  const COLORS = ['#6366f1','#8b5cf6','#a855f7','#ec4899','#f59e0b','#22c55e','#14b8a6','#0ea5e9','#3b82f6','#818cf8']

  return (
    <div className="rounded-2xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
      <div className="flex items-center justify-between px-5 py-4" style={{borderBottom:'1px solid var(--border)'}}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(245,158,11,0.12)'}}>
            <Zap size={15} style={{color:'var(--gold)'}}/>
          </div>
          <div>
            <p className="text-sm font-bold" style={{color:'var(--text1)'}}>Boost Graduation Tiers</p>
            <p className="text-[10px]" style={{color:'var(--text3)'}}>
              Each tier fills a % of the remaining gap. Fee is added on top of the fill amount.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{background:'rgba(245,158,11,0.12)',color:'var(--gold)'}}>Unsaved</span>}
          <button onClick={addTier} disabled={tiers.length>=10||adminBusy}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg disabled:opacity-40"
            style={{background:'rgba(99,102,241,0.1)',color:'var(--accent)',border:'1px solid rgba(99,102,241,0.2)'}}>
            + Add tier
          </button>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {/* Column headers */}
        <div className="grid gap-2 text-[9px] font-bold uppercase tracking-widest px-1" style={{gridTemplateColumns:'28px 1fr 1fr 1fr 32px',color:'var(--text3)'}}>
          <span/>
          <span>Boost % of gap</span>
          <span>Platform fee %</span>
          <span>Display label</span>
          <span/>
        </div>

        {tiers.length === 0 && (
          <p className="text-xs text-center py-4" style={{color:'var(--text2)'}}>
            No tiers. Click "+ Add tier" to create boost options.
          </p>
        )}

        {tiers.map((tier, i) => {
          const color    = COLORS[i % COLORS.length]
          const boostNum = parseFloat(tier.boostBps||'0')
          const feeNum   = parseFloat(tier.feeBps||'0')
          return (
            <div key={i} className="grid items-center gap-2 p-2.5 rounded-xl"
              style={{gridTemplateColumns:'28px 1fr 1fr 1fr 32px',background:'var(--surface2)',border:`1px solid ${color}20`}}>

              {/* Colour dot + index */}
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white"
                style={{background:color}}>{i+1}</div>

              {/* Boost % */}
              <div className="relative">
                <input type="number" min={0.1} max={100} step={1}
                  value={tier.boostBps} onChange={e=>handleBoostChange(i,e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-sm font-bold outline-none pr-7"
                  style={{background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text1)'}}/>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{color:'var(--text3)'}}>%</span>
              </div>

              {/* Fee % */}
              <div className="relative">
                <input type="number" min={0} max={50} step={0.1}
                  value={tier.feeBps} onChange={e=>update(i,'feeBps',e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-sm outline-none pr-7"
                  style={{background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text1)'}}/>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{color:'var(--text3)'}}>%</span>
              </div>

              {/* Label */}
              <input value={tier.label} onChange={e=>update(i,'label',e.target.value)}
                placeholder={`${boostNum}%`}
                className="w-full px-2.5 py-2 rounded-lg text-sm outline-none"
                style={{background:'var(--surface3)',border:'1px solid var(--border)',color:'var(--text1)'}}/>

              {/* Remove */}
              <button onClick={()=>removeTier(i)} disabled={adminBusy}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{background:'rgba(239,68,68,0.08)',color:'var(--red)',border:'none',cursor:'pointer'}}>
                ×
              </button>
            </div>
          )
        })}

        {/* Preview row */}
        {tiers.length > 0 && (
          <div className="rounded-xl p-3 space-y-1.5" style={{background:'var(--surface3)',border:'1px solid var(--border)'}}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{color:'var(--text3)'}}>Preview (on $10,000 gap)</p>
            <div className="grid grid-cols-4 gap-1.5">
              {tiers.map((tier,i)=>{
                const boost = parseFloat(tier.boostBps||'0')
                const fee   = parseFloat(tier.feeBps||'0')
                const fill  = 10000 * boost / 100
                const feeAmt= fill * fee / 100
                const color = COLORS[i % COLORS.length]
                return (
                  <div key={i} className="rounded-lg p-2 text-center" style={{background:`${color}10`,border:`1px solid ${color}25`}}>
                    <div className="text-sm font-black" style={{color}}>{tier.label||`${boost}%`}</div>
                    <div className="text-[8px] mt-0.5" style={{color:'var(--text2)'}}>Fill ${fill.toFixed(0)}</div>
                    <div className="text-[8px]" style={{color:'var(--red)'}}>+fee ${feeAmt.toFixed(0)}</div>
                    <div className="text-[9px] font-bold mt-0.5" style={{color:'var(--text1)'}}>=${(fill+feeAmt).toFixed(0)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Save button */}
        <button onClick={saveTiers} disabled={adminBusy||!dirty||tiers.length===0}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          style={{background:dirty?'linear-gradient(135deg,#6366f1,#8b5cf6)':'var(--surface3)',color:dirty?'#fff':'var(--text2)'}}>
          {adminBusy?<><span className="animate-spin">⟳</span> Saving…</>:<><Save size={13}/>Save {tiers.length} tier{tiers.length!==1?'s':''} on-chain</>}
        </button>

        <p className="text-[9px] text-center" style={{color:'var(--text3)'}}>
          Tiers are stored on-chain. Users see live data when boosting.
          Max 10 tiers. Boost% = portion of gap filled. Fee% added on top.
        </p>
      </div>
    </div>
  )
}

export function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw]         = useState('')
  const [authErr, setAuthErr] = useState('')
  const [section, setSection] = useState('overview')
  const [cat, setCat]         = useState('all')

  const [kvValues, setKvValues]   = useState<Record<string, string>>({})
  const [editVals, setEditVals]   = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState<Record<string, boolean>>({})
  const [saved, setSaved]         = useState<Record<string, boolean>>({})
  const [loading, setLoading]     = useState(false)

  const { FACTORY_ADDRESS, CHAIN_ID, EXPLORER_BASE } = useConfig()
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrong = isConnected && chainId !== CHAIN_ID
  const { writeContract: adminWrite, data: adminHash, isPending: adminPending } = useWriteContract()
  const { isLoading: adminConfirming } = useWaitForTransactionReceipt({ hash: adminHash })
  const adminBusy = adminPending || adminConfirming

  // Onchain reads
  const q = { enabled: !!FACTORY_ADDRESS }
  const args = (fn: string) => ({ address: FACTORY_ADDRESS, abi: FACTORY_ABI as any, functionName: fn as any, chainId: CHAIN_ID as any, query: q })
  const { data: feeBps }           = useReadContract(args('protocolFeeBps'))
  const { data: creationFee }      = useReadContract(args('creationFee'))
  const { data: gradThresh }       = useReadContract(args('graduationThreshold'))
  const { data: creatorGradBps }   = useReadContract(args('creatorGraduationFeeBps'))
  const { data: referralBps }      = useReadContract(args('referralFeeBps'))
  const { data: antiSnipeDur }     = useReadContract(args('antiSnipeDuration'))
  const { data: antiSnipeTax }     = useReadContract(args('antiSnipeTaxBps'))
  const { data: maxBuyBps }        = useReadContract(args('maxBuyBps'))
  const { data: buyCooldown }      = useReadContract(args('buyCooldown'))
  const { data: creatorLock }      = useReadContract(args('creatorLockDuration'))
  const { data: perGradBps }       = useReadContract(args('perTokenGraduationFeeBps'))
  const { data: feeRecipient }     = useReadContract(args('feeRecipient'))
  const { data: gradRecipient }    = useReadContract(args('graduationRecipient'))
  const { data: paused }           = useReadContract(args('paused'))
  const { data: kingToken }        = useReadContract(args('kingOfHill'))
  const { data: kingRaised }       = useReadContract(args('kingOfHillRaised'))
  const { data: tokenCountRaw }    = useReadContract(args('launchedTokensCount'))
  const tokenCountNum = tokenCountRaw ? Number(tokenCountRaw) : 0
  // getTokensPaginated not in deployed bytecode — use individual launchedTokens(i) calls
  const { addresses: allTokens }   = useTokenList()

  // Input state
  const [inp, setInp] = useState<Record<string, string>>({})
  const i = (key: string) => inp[key] ?? ''
  const si = (key: string) => (val: string) => setInp(s => ({ ...s, [key]: val }))

  const n = (v: unknown) => Number(v ?? 0)

  /** Contract limits — mirrors GlowFunFactory_V2 validation exactly */
  const LIMITS = {
    graduationThreshold:     { min: 0,    max: Infinity, note: '0 = instant mode, or ≥ $1,000 USDC. Values 1–999 rejected.' },
    protocolFeeBps:          { min: 0,    max: 1000,     note: 'Max 10% (1000 bps)' },
    creationFee:             { min: 0,    max: Infinity, note: 'USDC amount' },
    creatorGraduationFeeBps: { min: 0,    max: 1000,     note: 'Max 10% (1000 bps)' },
    referralFeeBps:          { min: 0,    max: 5000,     note: 'Max 50% of protocol fee (5000 bps)' },
    antiSnipeDuration:       { min: 0,    max: Infinity, note: 'Seconds' },
    antiSnipeTaxBps:         { min: 0,    max: 2000,     note: 'Max 20% (2000 bps)' },
    maxBuyBps:               { min: 0,    max: 5000,     note: 'Max 50% of curve (5000 bps). 0 = no limit' },
    buyCooldown:             { min: 0,    max: 300,      note: 'Max 300 seconds between buys' },
    creatorLockDuration:     { min: 0,    max: 2592000,  note: 'Max 30 days (2,592,000 seconds)' },
    perTokenGraduationFeeBps:{ min: 0,    max: 500,      note: 'Max 5% per-token graduation fee (500 bps)' },
  }

  /** Build the full UpdateSettingsParams struct from current on-chain values,
   *  then merge in whichever field(s) you're changing.
   *  Validates locally first to give clear errors before the tx fires. */
  const updateConfigWith = (overrides: Partial<{
    graduationThreshold: bigint; protocolFeeBps: bigint; creationFee: bigint;
    creatorGraduationFeeBps: bigint; referralFeeBps: bigint; antiSnipeDuration: bigint;
    antiSnipeTaxBps: bigint; maxBuyBps: bigint; buyCooldown: bigint;
    creatorLockDuration: bigint; perTokenGraduationFeeBps: bigint;
  }>) => {
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }

    const params = {
      graduationThreshold:      overrides.graduationThreshold      ?? BigInt(n(gradThresh)),
      protocolFeeBps:           overrides.protocolFeeBps           ?? BigInt(n(feeBps)),
      creationFee:              overrides.creationFee              ?? BigInt(n(creationFee)),
      creatorGraduationFeeBps:  overrides.creatorGraduationFeeBps  ?? BigInt(n(creatorGradBps)),
      referralFeeBps:           overrides.referralFeeBps           ?? BigInt(n(referralBps)),
      antiSnipeDuration:        overrides.antiSnipeDuration        ?? BigInt(n(antiSnipeDur)),
      antiSnipeTaxBps:          overrides.antiSnipeTaxBps          ?? BigInt(n(antiSnipeTax)),
      maxBuyBps:                overrides.maxBuyBps                ?? BigInt(n(maxBuyBps)),
      buyCooldown:              overrides.buyCooldown              ?? BigInt(n(buyCooldown)),
      creatorLockDuration:      overrides.creatorLockDuration      ?? BigInt(n(creatorLock)),
      perTokenGraduationFeeBps: overrides.perTokenGraduationFeeBps ?? BigInt(n(perGradBps)),
    }

    // V3 contract allows 0 for instant graduation — no minimum enforced
    if (Number(params.protocolFeeBps)           > 1000) { toast.error('Protocol fee max 10% (1000 bps)'); return }
    if (Number(params.creatorGraduationFeeBps)  > 1000) { toast.error('Creator graduation fee max 10% (1000 bps)'); return }
    if (Number(params.referralFeeBps)           > 5000) { toast.error('Referral fee max 50% of protocol fee (5000 bps)'); return }
    if (Number(params.antiSnipeTaxBps)          > 2000) { toast.error('Anti-snipe tax max 20% (2000 bps)'); return }
    if (Number(params.maxBuyBps)                > 5000) { toast.error('Max buy limit max 50% (5000 bps)'); return }
    if (Number(params.buyCooldown)              > 300)  { toast.error('Buy cooldown max 300 seconds'); return }
    if (Number(params.creatorLockDuration)      > 2592000) { toast.error('Creator lock max 30 days (2,592,000 seconds)'); return }
    if (Number(params.perTokenGraduationFeeBps) > 500)  { toast.error('Per-token graduation fee max 5% (500 bps)'); return }

    adminWrite(
      { address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'updateConfig',
        args: [
          params.graduationThreshold,
          params.protocolFeeBps,
          params.creationFee,
          params.creatorGraduationFeeBps,
          params.referralFeeBps,
          params.antiSnipeDuration,
          params.antiSnipeTaxBps,
          params.maxBuyBps,
          params.buyCooldown,
          params.creatorLockDuration,
          params.perTokenGraduationFeeBps,
        ], chainId: CHAIN_ID as any } as any,
      { onSuccess: () => toast.success('Config updated on-chain ✓'),
        onError:   (e) => toast.error(parseOnchainError(e)) }
    )
  }

  /** For non-settings calls (blacklist, pause, fee recipient, etc.) */
  const adminCall = (fn: string, fnArgs: any[]) => {
    if (wrong) { switchChain({ chainId: CHAIN_ID as any }); return }
    adminWrite({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: fn, args: fnArgs, chainId: CHAIN_ID as any } as any, {
      onSuccess: () => toast.success('Transaction submitted ✓'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }

  const loadConfig = async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/config').then(r => r.json()) as Record<string, string>
      setKvValues(d); setEditVals(d)
    } catch { toast.error('Could not load KV config — is the Worker deployed?') }
    setLoading(false)
  }

  useEffect(() => { loadConfig() }, [])

  const saveKey = async (key: string) => {
    const value = editVals[key] ?? ''
    setSaving(s => ({ ...s, [key]: true }))
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': pw },
        body: JSON.stringify({ key, value }),
      })
      const d = await res.json() as any
      if (!d.ok) throw new Error(d.error ?? 'Failed')
      setKvValues(v => ({ ...v, [key]: value }))
      setSaved(s => ({ ...s, [key]: true }))
      toast.success(`${key} saved`)
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e: any) { toast.error(e.message) }
    setSaving(s => ({ ...s, [key]: false }))
  }

  // n() helper defined above in updateConfigWith block

  /* ── Login screen ──────────────────────────────────────────────────── */
  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
          <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.3)' }}>
                <Shield size={28} className="text-white" />
              </div>
              <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text1)', fontFamily: 'Space Grotesk,sans-serif' }}>Admin Panel</h1>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Enter your password to continue</p>
            </div>
            <div className="space-y-3">
              <input
                type="password" value={pw}
                onChange={e => { setPw(e.target.value); setAuthErr('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const stored = kvValues['ADMIN_SECRET'] || 'glowfun_admin_change_me'
                    if (pw === stored) { setAuthed(true); setAuthErr('') } else setAuthErr('Incorrect password.')
                  }
                }}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--surface3)', border: `1px solid ${authErr ? 'rgba(239,68,68,0.4)' : 'var(--border2)'}`, color: 'var(--text1)' }}
                autoFocus
              />
              {authErr && <p className="text-xs" style={{ color: '#f87171' }}>{authErr}</p>}
              <button
                onClick={() => {
                  const stored = kvValues['ADMIN_SECRET'] || 'glowfun_admin_change_me'
                  if (pw === stored) { setAuthed(true); setAuthErr('') } else setAuthErr('Incorrect password.')
                }}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                Unlock
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  const filteredKeys = KV_KEYS.filter(k => cat === 'all' || k.category === cat)

  /* ── Main layout ───────────────────────────────────────────────────── */
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-[3px] w-6 rounded-full" style={{ background: SPECTRAL }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Admin</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text1)', letterSpacing: '-0.02em', fontFamily: 'Space Grotesk,sans-serif' }}>Control Panel</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadConfig} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
          <button onClick={() => setAuthed(false)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <Lock size={11} />Lock
          </button>
        </div>
      </div>

      {/* Mobile section pills — above the layout row, only on small screens */}
      <div className="md:hidden mb-4 overflow-x-auto" style={{WebkitOverflowScrolling:'touch'}}>
        <div className="flex gap-2 pb-1 min-w-max">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSection(id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0 transition-all"
              style={{
                background: section === id ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                color: section === id ? '#818cf8' : 'var(--text2)',
                border: section === id ? '1px solid rgba(99,102,241,0.2)' : '1px solid var(--border)',
              }}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-5">
        {/* Sidebar — desktop only */}
        <aside className="w-44 flex-shrink-0 hidden md:block">
          <nav className="sticky top-20 space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSection(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
                style={{
                  background: section === id ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: section === id ? '#818cf8' : 'var(--text2)',
                  border: section === id ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                }}>
                <Icon size={14} />
                {label}
                {section === id && <ChevronRight size={12} className="ml-auto opacity-60" />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content — full width on mobile */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── OVERVIEW ── */}
          <AnimatePresence mode="wait">
            {section === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="Tokens Launched" value={tokenCountNum ? tokenCountNum.toString() : '—'} icon={Zap} accent="#a78bfa" />
                  <StatCard label="Protocol Fee" value={feeBps !== undefined ? `${n(feeBps) / 100}%` : '—'} icon={DollarSign} accent="#fb923c" sub={`${n(feeBps ?? 0)} bps`} />
                  <StatCard label="Creation Fee" value={creationFee !== undefined ? `$${n(creationFee) / 1e6}` : '—'} icon={Server} accent="#34d399" />
                  <StatCard label="Status" value={paused ? 'Paused' : 'Active'} icon={paused ? Lock : Unlock} accent={paused ? '#f87171' : '#34d399'} />
                </div>

                <SectionCard title="Platform" icon={Activity} accent="#6366f1">
                  <div className="space-y-2 text-sm">
                    {[
                      ['Factory', FACTORY_ADDRESS ? formatAddress(FACTORY_ADDRESS) : 'Not set'],
                      ['Fee Recipient', feeRecipient ? formatAddress(feeRecipient as any) : '—'],
                      ['Graduation Recipient', gradRecipient ? formatAddress(gradRecipient as any) : '—'],
                      ['Graduation Threshold', gradThresh !== undefined ? `$${(n(gradThresh) / 1e6).toLocaleString()} USDC` : '—'],
                      ['Creator Grad Bonus', creatorGradBps !== undefined ? `${n(creatorGradBps) / 100}%` : '—'],
                      ['Referral Fee', referralBps !== undefined ? `${n(referralBps) / 100}% of trade fee` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text2)' }}>{k}</span>
                        <span className="font-mono text-xs" style={{ color: 'var(--text1)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {kingToken && kingToken !== '0x0000000000000000000000000000000000000000' && (
                  <SectionCard title="King of the Hill" icon={Crown} accent="#f59e0b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(245,158,11,0.12)' }}>👑</div>
                      <div>
                        <div className="text-sm font-mono font-medium" style={{ color: 'var(--text1)' }}>{formatAddress(kingToken as any)}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>${(n(kingRaised ?? 0) / 1e6).toFixed(2)} USDC raised</div>
                      </div>
                      {EXPLORER_BASE && (
                        <a href={`${EXPLORER_BASE}/address/${kingToken}`} target="_blank" rel="noreferrer" className="ml-auto">
                          <ExternalLink size={14} style={{ color: 'var(--text2)' }} />
                        </a>
                      )}
                    </div>
                  </SectionCard>
                )}
              </motion.div>
            )}

            {/* ── CONFIG ── */}
            {section === 'config' && (
              <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

                <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                  <Database size={14} style={{ color: '#818cf8', marginTop: 2, flexShrink: 0 }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                    All values are stored in <strong style={{ color: 'var(--text1)' }}>Cloudflare KV</strong> and read at runtime. Changes take effect immediately — no redeploy needed.
                  </p>
                </div>

                {/* Category pills */}
                <div className="flex gap-2 flex-wrap">
                  {CATS.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setCat(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: cat === id ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                        color: cat === id ? '#818cf8' : 'var(--text2)',
                        border: cat === id ? '1px solid rgba(99,102,241,0.2)' : '1px solid var(--border)',
                      }}>
                      <Icon size={11} />{label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {/* Site logo upload row — only shown in All / Site categories */}
                  {(cat === 'all' || cat === 'site') && (
                    <div className="px-5">
                      <LogoUploadRow
                        adminToken={pw}
                        currentUrl={kvValues['SITE_LOGO'] ?? ''}
                        onSaved={url => {
                          setKvValues(v => ({ ...v, SITE_LOGO: url }))
                          setEditVals(v => ({ ...v, SITE_LOGO: url }))
                        }}
                      />
                    </div>
                  )}
                  {/* Factory address editor — shown in Contract + All tabs */}
                  {(cat === 'contract' || cat === 'all') && (
                    <FactoryAddressEditor
                      onSave={factories => {
                        setEditVals(v => ({ ...v, FACTORY_ADDRESS: factories[0]?.address ?? '' }))
                      }}
                    />
                  )}

                  {filteredKeys
                    .filter(f => !(f.key === 'FACTORY_ADDRESS' && cat === 'contract'))
                    .map(({ key, label, placeholder, secret }) => (
                    <FieldRow
                      key={key}
                      label={label}
                      placeholder={placeholder}
                      value={editVals[key] ?? ''}
                      onChange={v => setEditVals(s => ({ ...s, [key]: v }))}
                      onSave={() => saveKey(key)}
                      saving={!!saving[key]}
                      saved={!!saved[key]}
                      secret={secret}
                    />
                  ))}
                  {filteredKeys.length === 0 && cat !== 'all' && cat !== 'site' && (
                    <div className="p-8 text-center text-sm" style={{ color: 'var(--text2)' }}>No settings in this category.</div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => filteredKeys.forEach(({ key }) => saveKey(key))}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                  >
                    <Save size={13} />Save All
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── ON-CHAIN ── */}
            {section === 'onchain' && (
              <motion.div key="onchain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                {!isConnected ? (
                  <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <Zap size={24} className="mx-auto mb-3" style={{ color: 'var(--text2)' }} />
                    <p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>Connect wallet to manage on-chain settings</p>
                    <ConnectKitButton />
                  </div>
                ) : (
                  <>
                    {wrong && (
                      <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                        <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
                        <span className="text-sm" style={{ color: '#fbbf24' }}>Wrong network.</span>
                        <button onClick={() => switchChain({ chainId: CHAIN_ID as any })} className="text-sm underline" style={{ color: '#fbbf24' }}>Switch to Arc Mainnet</button>
                      </div>
                    )}

                    <SectionCard title="Fee Settings" icon={DollarSign} accent="#fb923c">
                      <OnchainInput label="Creation Fee (USDC)" note={creationFee !== undefined ? `Current: $${n(creationFee) / 1e6} USDC` : ''} value={i('creationFee')} onChange={si('creationFee')} disabled={adminBusy} placeholder="10" onSet={() => updateConfigWith({ creationFee: BigInt(Math.round(parseFloat(i('creationFee') || '0') * 1e6)) })} />
                      <OnchainInput label="Protocol Fee (bps, max 1000 = 10%)" note={feeBps !== undefined ? `Current: ${n(feeBps)} bps = ${n(feeBps) / 100}%` : ''} value={i('feeBps')} onChange={si('feeBps')} disabled={adminBusy} placeholder="100" onSet={() => updateConfigWith({ protocolFeeBps: BigInt(i('feeBps') || '0') })} />
                      <OnchainInput label="Creator Graduation Bonus (bps, max 1000 = 10%)" note={creatorGradBps !== undefined ? `Current: ${n(creatorGradBps)} bps = ${n(creatorGradBps) / 100}%` : ''} value={i('creatorGradBps')} onChange={si('creatorGradBps')} disabled={adminBusy} placeholder="500" onSet={() => updateConfigWith({ creatorGraduationFeeBps: BigInt(i('creatorGradBps') || '0') })} />
                      <OnchainInput
                        label="Graduation Threshold (USDC) — set 0 for instant graduation"
                        note={gradThresh !== undefined
                          ? `On-chain: $${(n(gradThresh) / 1e6).toLocaleString()} USDC · Enter dollar amount (0 = instant, 69000 = $69K)`
                          : 'Enter dollar amount · 0 = instant graduation'}
                        value={i('gradThresh')}
                        onChange={si('gradThresh')}
                        disabled={adminBusy}
                        placeholder="0 (instant) or 69000 (default)"
                        onSet={() => {
                          const usd = parseFloat(i('gradThresh') || '0')
                          updateConfigWith({ graduationThreshold: BigInt(Math.round(usd * 1_000_000)) })
                        }}
                      />
                    </SectionCard>

                    <SectionCard title="Anti-Bot Controls" icon={Sliders} accent="#6366f1">
                      <OnchainInput label="Referral Fee (bps of protocol fee, max 5000)" note={referralBps !== undefined ? `Current: ${n(referralBps)} bps = ${n(referralBps) / 100}%` : ''} value={i('referralBps')} onChange={si('referralBps')} disabled={adminBusy} placeholder="2500" onSet={() => updateConfigWith({ referralFeeBps: BigInt(i('referralBps') || '0') })} />
                      <OnchainInput label="Anti-Snipe Duration (seconds)" note={antiSnipeDur !== undefined ? `Current: ${n(antiSnipeDur)}s` : ''} value={i('antiSnipeDur')} onChange={si('antiSnipeDur')} disabled={adminBusy} placeholder="60" onSet={() => updateConfigWith({ antiSnipeDuration: BigInt(i('antiSnipeDur') || '0') })} />
                      <OnchainInput label="Anti-Snipe Tax (bps, max 2000)" note={antiSnipeTax !== undefined ? `Current: ${n(antiSnipeTax)} bps = ${n(antiSnipeTax) / 100}%` : ''} value={i('antiSnipeTax')} onChange={si('antiSnipeTax')} disabled={adminBusy} placeholder="500" onSet={() => updateConfigWith({ antiSnipeTaxBps: BigInt(i('antiSnipeTax') || '0') })} />
                      <OnchainInput label="Max Buy per TX (bps of curve, 0=off)" note={maxBuyBps !== undefined ? `Current: ${n(maxBuyBps)} bps = ${n(maxBuyBps) / 100}%` : ''} value={i('maxBuyBps')} onChange={si('maxBuyBps')} disabled={adminBusy} placeholder="500" onSet={() => updateConfigWith({ maxBuyBps: BigInt(i('maxBuyBps') || '0') })} />
                      <OnchainInput label="Buy Cooldown (seconds, 0=off, max 300)" note={buyCooldown !== undefined ? `Current: ${n(buyCooldown)}s` : ''} value={i('buyCooldown')} onChange={si('buyCooldown')} disabled={adminBusy} placeholder="30" onSet={() => updateConfigWith({ buyCooldown: BigInt(i('buyCooldown') || '0') })} />
                      <OnchainInput label="Creator Lock Duration (seconds, max 2592000 = 30d)" note={creatorLock !== undefined ? `Current: ${n(creatorLock)}s = ${(n(creatorLock) / 86400).toFixed(1)} days` : ''} value={i('creatorLock')} onChange={si('creatorLock')} disabled={adminBusy} placeholder="604800" onSet={() => updateConfigWith({ creatorLockDuration: BigInt(i('creatorLock') || '0') })} />
                      <OnchainInput label="Per-Token Graduation Platform Fee (bps, max 500)" note={perGradBps !== undefined ? `Current: ${n(perGradBps)} bps = ${n(perGradBps) / 100}%` : ''} value={i('perGradBps')} onChange={si('perGradBps')} disabled={adminBusy} placeholder="100" onSet={() => updateConfigWith({ perTokenGraduationFeeBps: BigInt(i('perGradBps') || '0') })} />
                    </SectionCard>

                    <SectionCard title="Recipients (Two-Step)" icon={Users} accent="#34d399">
                      <p className="text-xs mb-4" style={{ color: 'var(--text2)' }}>Propose a new address — the new address must call <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface3)', color: 'var(--text1)' }}>acceptFeeRecipient()</code> or <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface3)', color: 'var(--text1)' }}>acceptGraduationRecipient()</code> to confirm.</p>
                      <OnchainInput label="Propose Fee Recipient" note={feeRecipient ? `Current: ${formatAddress(feeRecipient as any)}` : ''} value={i('feeRecip')} onChange={si('feeRecip')} disabled={adminBusy} placeholder="0x..." onSet={() => adminCall('proposeFeeRecipient', [i('feeRecip') as `0x${string}`])} />
                      <OnchainInput label="Propose Graduation Recipient" note={gradRecipient ? `Current: ${formatAddress(gradRecipient as any)}` : ''} value={i('gradRecip')} onChange={si('gradRecip')} disabled={adminBusy} placeholder="0x..." onSet={() => adminCall('proposeGraduationRecipient', [i('gradRecip') as `0x${string}`])} />
                    </SectionCard>

                    <SectionCard title="Blacklists" icon={Ban} accent="#f87171">
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text2)' }}>Token Address</label>
                          <div className="flex gap-2">
                            <input value={i('blToken')} onChange={e => setInp(s => ({ ...s, blToken: e.target.value }))} placeholder="0x..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                            <button onClick={() => adminCall('blacklistToken', [i('blToken') as `0x${string}`, true])} disabled={!i('blToken') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>Block</button>
                            <button onClick={() => adminCall('blacklistToken', [i('blToken') as `0x${string}`, false])} disabled={!i('blToken') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#34d399' }}>Allow</button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text2)' }}>Wallet Address</label>
                          <div className="flex gap-2">
                            <input value={i('blWallet')} onChange={e => setInp(s => ({ ...s, blWallet: e.target.value }))} placeholder="0x..." className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                            <button onClick={() => adminCall('blacklistWallet', [i('blWallet') as `0x${string}`, true])} disabled={!i('blWallet') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>Block</button>
                            <button onClick={() => adminCall('blacklistWallet', [i('blWallet') as `0x${string}`, false])} disabled={!i('blWallet') || adminBusy} className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#34d399' }}>Allow</button>
                          </div>
                        </div>
                      </div>
                    </SectionCard>

                    {/* ── V3: Boost Fee ── */}
                    <BoostTierEditor chainId={CHAIN_ID} factoryAddress={FACTORY_ADDRESS} adminBusy={adminBusy} adminCall={adminCall} wrong={wrong} switchChain={switchChain} />

                    {/* ── V3: Force Graduate ── */}
                    <SectionCard title="Force Graduate Token" icon={Trophy} accent="#f59e0b">
                      <p className="text-xs mb-3" style={{ color: 'var(--text2)' }}>
                        Pay the USDC gap yourself to graduate any token immediately. USDC goes to the Uniswap pool at graduation.
                      </p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--text2)' }}>Token Address</label>
                          <input value={i('forceGradToken')} onChange={e => setInp(s => ({ ...s, forceGradToken: e.target.value }))}
                            placeholder="0x..." className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                        </div>
                        <button
                          onClick={() => adminCall('forceGraduate', [i('forceGradToken') as `0x${string}`])}
                          disabled={!i('forceGradToken') || adminBusy}
                          className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--gold)' }}>
                          <Trophy size={14} />Force Graduate (you pay USDC gap)
                        </button>
                      </div>
                    </SectionCard>

                    {/* ── V3: Per-Token Override ── */}
                    <SectionCard title="Per-Token Tools" icon={Settings2} accent="#818cf8">
                      <p className="text-xs mb-3" style={{ color: 'var(--text2)' }}>
                        Override a specific token's graduation threshold or set it to 0 to graduate it immediately.
                      </p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--text2)' }}>Token Address</label>
                          <input value={i('ptToken')} onChange={e => setInp(s => ({ ...s, ptToken: e.target.value }))}
                            placeholder="0x..." className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--text2)' }}>New threshold (USDC)</label>
                            <input value={i('ptThresh')} onChange={e => setInp(s => ({ ...s, ptThresh: e.target.value }))}
                              placeholder="0 = graduate now" type="number" className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
                          </div>
                          <button
                            onClick={() => adminCall('setTokenGraduationThreshold', [i('ptToken') as `0x${string}`, BigInt(Math.round(parseFloat(i('ptThresh') || '0') * 1_000_000))])}
                            disabled={!i('ptToken') || adminBusy}
                            className="self-end py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                            Set Threshold
                          </button>
                        </div>
                        <p className="text-[9px]" style={{ color: 'var(--text3)' }}>
                          Enter 0 to graduate the token immediately (no USDC required). Any value ≥ 0 is accepted.
                        </p>
                      </div>
                    </SectionCard>

                    {/* ── Emergency Controls ── */}
                    <SectionCard title="Emergency Controls" icon={Shield} accent="#a78bfa">
                      <div className="flex gap-3 mb-4">
                        <button onClick={() => adminCall('pause', [])} disabled={!!paused || adminBusy} className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-80" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>
                          <Lock size={14} />Pause
                        </button>
                        <button onClick={() => adminCall('unpause', [])} disabled={!paused || adminBusy} className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-80" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', color: '#34d399' }}>
                          <Unlock size={14} />Unpause
                        </button>
                      </div>
                      <div className="mb-4 text-center text-xs" style={{ color: 'var(--text2)' }}>
                        Status: <span style={{ color: paused ? '#f87171' : '#34d399', fontWeight: 600 }}>{paused === undefined ? '...' : paused ? 'PAUSED' : 'Active'}</span>
                      </div>
                      {/* Emergency withdraw */}
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--red)' }}>Emergency Withdraw</p>
                      <div className="space-y-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                        <p className="text-[10px]" style={{ color: 'var(--text2)' }}>⚠️ Only for genuinely stuck funds. USDC in active bonding curves belongs to users.</p>
                        <input value={i('ewToken')} onChange={e => setInp(s => ({ ...s, ewToken: e.target.value }))} placeholder="Token/asset address" className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--surface3)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--text1)' }} />
                        <input value={i('ewTo')}    onChange={e => setInp(s => ({ ...s, ewTo: e.target.value }))}    placeholder="Recipient address" className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--surface3)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--text1)' }} />
                        <input value={i('ewAmt')}   onChange={e => setInp(s => ({ ...s, ewAmt: e.target.value }))}   placeholder="Amount (raw — 18 dec for tokens, 6 dec for USDC)" className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--surface3)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--text1)' }} />
                        <button
                          onClick={() => { if (!confirm('⚠️ Emergency withdraw — are you sure?')) return; adminCall('emergencyWithdraw', [i('ewToken') as `0x${string}`, i('ewTo') as `0x${string}`, BigInt(i('ewAmt') || '0')]) }}
                          disabled={!i('ewToken') || !i('ewTo') || !i('ewAmt') || adminBusy}
                          className="w-full py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)' }}>
                          Emergency Withdraw
                        </button>
                      </div>
                    </SectionCard>
                  </>
                )}
              </motion.div>
            )}

            {/* ── TOKENS ── */}
            {section === 'tokens' && (
              <motion.div key="tokens" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <TokenMetadataEditor factoryAddress={FACTORY_ADDRESS} chainId={CHAIN_ID} />

                <SectionCard title={`All Tokens (${tokenCountNum})`} icon={BarChart2} accent="#a78bfa">
                  {!FACTORY_ADDRESS ? (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--text2)' }}>Set FACTORY_ADDRESS in Configuration first.</p>
                  ) : tokenCountNum === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--text2)' }}>No tokens launched yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {allTokens && [...(allTokens as unknown as string[])].reverse().map((addr, i) => (
                        <AdminTokenRow key={addr} addr={addr} index={i} factoryAddress={FACTORY_ADDRESS!} chainId={CHAIN_ID} explorerBase={EXPLORER_BASE} />
                      ))}
                    </div>
                  )}
                </SectionCard>
              </motion.div>
            )}

            {/* ── COMMENTS ── */}
            {section === 'comments' && (
              <motion.div key="comments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <SectionCard title="Recent Comments" icon={MessageSquare} accent="#a78bfa">
                  <AdminComments />
                </SectionCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

/* ── AdminTokenRow ──────────────────────────────────────────────────────── */
function AdminTokenRow({ addr, index, factoryAddress, chainId, explorerBase }: { addr: string; index: number; factoryAddress: string; chainId: number; explorerBase: string }) {
  const { writeContract, data: claimHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: claimHash })
  const { data: results } = useReadContracts({ contracts: [
    { address: factoryAddress as `0x${string}`, abi: FACTORY_ABI, functionName: 'getTokenState', args: [addr as `0x${string}`], chainId: chainId as any },
    { address: factoryAddress as `0x${string}`, abi: FACTORY_ABI, functionName: 'pendingGraduationUsdc', args: [addr as `0x${string}`], chainId: chainId as any },
  ]})

  const state = results?.[0]?.result as any
  const pendingUsdc = results?.[1]?.result as bigint | undefined
  const graduated = state?.graduated === true || (pendingUsdc !== undefined && pendingUsdc > 0n)
  const hasPending = pendingUsdc !== undefined && pendingUsdc > 0n
  const busy = isPending || isConfirming

  const handleClaim = () => {
    writeContract(
      { address: factoryAddress as `0x${string}`, abi: FACTORY_ABI, functionName: 'claimGraduation', args: [addr as `0x${string}`], chainId: chainId as any } as any,
      { onSuccess: () => toast.success('Graduation funds claimed!'), onError: (e) => toast.error(parseOnchainError(e)) }
    )
  }

  useEffect(() => { if (isSuccess) toast.success('Claimed successfully') }, [isSuccess])

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: `hsl(${parseInt(addr.slice(2,6),16)%360},55%,28%)`, color: 'white' }}>{index + 1}</div>
          <span className="text-xs font-mono" style={{ color: 'var(--text1)' }}>{formatAddress(addr)}</span>
          {graduated && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Graduated</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <a href={`/token/${addr}`} className="text-[10px] px-2 py-1 rounded-lg no-underline" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>View</a>
          {explorerBase && (
            <a href={`${explorerBase}/address/${addr}`} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-1 rounded-lg no-underline flex items-center gap-1" style={{ background: 'var(--surface)', color: 'var(--text2)' }}>
              <ExternalLink size={8} />Exp
            </a>
          )}
        </div>
      </div>
      {hasPending && (
        <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div>
            <p className="text-[10px] font-semibold" style={{ color: '#f59e0b' }}>Pending graduation funds</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text1)' }}>{formatUsdc(pendingUsdc!)} USDC ready to claim</p>
          </div>
          <button
            onClick={handleClaim}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: busy ? 'var(--surface)' : 'rgba(245,158,11,0.2)', color: busy ? 'var(--text2)' : '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Crown size={11} />}
            {busy ? 'Claiming…' : 'Claim'}
          </button>
        </div>
      )}
      {graduated && !hasPending && (
        <p className="text-[10px]" style={{ color: 'var(--text3)' }}>Graduation funds already claimed.</p>
      )}
    </div>
  )
}

/* ── Comments sub-component ─────────────────────────────────────────────── */
function AdminComments() {
  const [comments, setComments] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const { EXPLORER_BASE } = useConfig()

  useEffect(() => {
    fetch('/api/comments?limit=50')
      .then(r => r.json()).then((d: any) => { setComments(d.comments ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text3)' }} />
    </div>
  )
  if (!comments.length) return <p className="text-sm py-8 text-center" style={{ color: 'var(--text2)' }}>No comments yet.</p>

  return (
    <div className="space-y-1">
      {comments.map(c => (
        <div key={c.id} className="px-3 py-3 rounded-xl" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono" style={{ color: '#a78bfa' }}>{formatAddress(c.author)}</span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>on</span>
            <a href={`/token/${c.token_address}`} className="text-xs font-mono no-underline" style={{ color: 'var(--text2)' }}>{formatAddress(c.token_address)}</a>
            <span className="ml-auto text-xs" style={{ color: 'var(--text3)' }}>{new Date(c.created_at).toLocaleString()}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text1)' }}>{c.content}</p>
        </div>
      ))}
    </div>
  )
}

/* ── Token Metadata Editor ───────────────────────────────────────────────── */
function TokenMetadataEditor({ factoryAddress, chainId }: { factoryAddress: `0x${string}` | undefined; chainId: number }) {
  const [tokenAddr, setTokenAddr] = useState('')
  const [fields, setFields]       = useState({ imageUri: '', description: '', twitter: '', telegram: '', website: '' })
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const valid = tokenAddr.startsWith('0x') && tokenAddr.length === 42

  return (
    <SectionCard title="Update Token Metadata" icon={Image} accent="#6366f1">
      <p className="text-xs mb-4" style={{ color: 'var(--text2)' }}>Permanently update logo, description, and socials on-chain. Changes reflect everywhere the CA is read.</p>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text2)' }}>Token Contract Address</label>
          <input value={tokenAddr} onChange={e => setTokenAddr(e.target.value)} placeholder="0x..." className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text2)' }}>Logo URL (IPFS preferred: ipfs://Qm...)</label>
          <input value={fields.imageUri} onChange={e => setFields(f => ({ ...f, imageUri: e.target.value }))} placeholder="ipfs://Qm... or https://..." className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text2)' }}>Description</label>
          <textarea value={fields.description} onChange={e => setFields(f => ({ ...f, description: e.target.value }))} placeholder="Token description..." rows={2} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['twitter','telegram','website'] as const).map(k => (
            <div key={k}>
              <label className="text-xs font-medium block mb-1 capitalize" style={{ color: 'var(--text2)' }}>{k}</label>
              <input value={fields[k]} onChange={e => setFields(f => ({ ...f, [k]: e.target.value }))} placeholder={k === 'website' ? 'https://' : '@handle'} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text1)' }} />
            </div>
          ))}
        </div>
        {isSuccess && (
          <div className="flex items-center gap-2 text-xs py-2 px-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', color: '#4ade80' }}>
            <Check size={12} />Metadata updated on-chain successfully
          </div>
        )}
        <button
          onClick={() => {
            if (!factoryAddress || !valid) return
            writeContract({ address: factoryAddress, abi: FACTORY_ABI, functionName: 'updateTokenMetadata', args: [tokenAddr as `0x${string}`, fields.imageUri, fields.description, fields.twitter, fields.telegram, fields.website], chainId: chainId as any } as any)
          }}
          disabled={!valid || isPending || confirming || !factoryAddress}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white' }}
        >
          {isPending || confirming ? <><Loader2 size={14} className="animate-spin" />Confirming...</> : <><Save size={14} />Save Metadata On-Chain</>}
        </button>
      </div>
    </SectionCard>
  )
}

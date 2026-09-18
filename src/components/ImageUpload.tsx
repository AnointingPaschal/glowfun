import { useState, useRef, useCallback } from 'react'
import { Upload, X, Link, Loader2, Image } from 'lucide-react'
import { toast } from 'sonner'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  label?: string
}

export function ImageUpload({ value, onChange, label = 'Token Logo' }: ImageUploadProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Logo must be under 5MB.'); return }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json() as { ok?: boolean; url?: string; error?: string }
      if (data.ok && data.url) {
        onChange(data.url)
        toast.success('Logo uploaded!')
      } else {
        // Fallback: use object URL for preview (won't persist after page close)
        const objectUrl = URL.createObjectURL(file)
        onChange(objectUrl)
        toast.info('Using local preview. R2 upload will activate after Cloudflare setup.')
      }
    } catch {
      const objectUrl = URL.createObjectURL(file)
      onChange(objectUrl)
      toast.info('Using local preview — R2 not configured yet.')
    } finally {
      setUploading(false)
    }
  }, [onChange])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }, [upload])

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload(file)
  }, [upload])

  const applyUrl = () => {
    const u = urlInput.trim()
    if (!u) return
    if (!u.startsWith('http')) { toast.error('Enter a valid URL starting with http(s)://'); return }
    onChange(u)
    toast.success('Logo URL set.')
  }

  const clear = () => { onChange(''); setUrlInput('') }

  return (
    <div className="space-y-2">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {(['upload', 'url'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{
              background: mode === m ? 'rgba(139,92,246,0.18)' : 'transparent',
              color: mode === m ? '#a78bfa' : 'rgba(255,255,255,0.4)',
            }}>
            {m === 'upload' ? <><Upload size={10} style={{ display: 'inline', marginRight: 4 }} />Upload</> : <><Link size={10} style={{ display: 'inline', marginRight: 4 }} />URL</>}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-start">
        {/* Preview square */}
        <div className="w-20 h-20 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.05)', border: value ? '2px solid rgba(139,92,246,0.3)' : '1.5px dashed rgba(255,255,255,0.1)' }}>
          {value ? (
            <img src={value} alt="logo" className="w-full h-full object-cover" onError={() => onChange('')} />
          ) : (
            <Image size={22} style={{ color: 'rgba(255,255,255,0.15)' }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {mode === 'upload' ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl cursor-pointer transition-all"
              style={{
                background: dragging ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                border: dragging ? '1.5px dashed rgba(139,92,246,0.4)' : '1.5px dashed rgba(255,255,255,0.08)',
              }}>
              {uploading ? (
                <Loader2 size={18} className="animate-spin" style={{ color: '#a78bfa' }} />
              ) : (
                <Upload size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
              )}
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {uploading ? 'Uploading…' : 'Drop logo or click'}
              </span>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>PNG, JPG, GIF, WebP · max 5MB</span>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                placeholder="https://..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyUrl()}
              />
              <button onClick={applyUrl} className="px-3 py-2.5 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                Set
              </button>
            </div>
          )}

          {value && (
            <button onClick={clear} className="flex items-center gap-1 mt-1.5 text-xs"
              style={{ color: 'rgba(255,82,82,0.7)' }}>
              <X size={10} /> Remove logo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

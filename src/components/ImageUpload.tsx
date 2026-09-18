import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Image, Loader2, Link } from 'lucide-react'

interface Props {
  value: string
  onChange: (url: string) => void
}

export function ImageUpload({ value, onChange }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState<'upload' | 'url'>('upload')
  const [urlInput, setUrlInput] = useState(value ?? '')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json() as any
      if (!data.ok) throw new Error(data.error ?? 'Upload failed')
      onChange(data.url)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed')
    }
    setUploading(false)
  }, [onChange])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setUrlInput('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
        {(['upload', 'url'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} className="px-3 py-1 rounded-md text-xs font-medium transition-all capitalize" style={{
            background: mode === m ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: mode === m ? '#a78bfa' : 'rgba(255,255,255,0.4)',
          }}>
            {m === 'upload' ? <><Upload size={10} style={{ display: 'inline', marginRight: 4 }} />Upload</> : <><Link size={10} style={{ display: 'inline', marginRight: 4 }} />URL</>}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <div className="flex gap-2">
          <input
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); onChange(e.target.value) }}
            placeholder="https://i.imgur.com/..."
            className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
          {value && (
            <img src={value} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)' }} onError={() => {}} />
          )}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {value ? (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', height: 120 }}
            >
              <img src={value} alt="Token" className="w-full h-full object-cover" />
              <button type="button" onClick={clear}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <X size={12} className="text-white" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className="rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
              style={{
                height: 100,
                background: dragging ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px dashed ${dragging ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {uploading
                ? <Loader2 size={20} className="animate-spin" style={{ color: '#a78bfa' }} />
                : <Image size={20} style={{ color: 'rgba(255,255,255,0.2)' }} />
              }
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {uploading ? 'Uploading...' : 'Drop image or click to upload (JPG, PNG, GIF, WebP · max 5MB)'}
              </span>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onFileChange} />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}

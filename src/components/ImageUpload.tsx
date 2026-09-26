import { useRef, useState, useCallback, useEffect } from 'react'
import { Upload, Link, X, CheckCircle, Loader2, Globe } from 'lucide-react'
import { clsx } from 'clsx'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  label?: string
}

type UploadMode = 'upload' | 'url'
type UploadState = 'idle' | 'uploading' | 'ipfs' | 'r2' | 'error'

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
]

export function resolveImageUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('ipfs://')) {
    const hash = url.slice(7).replace(/^ipfs\//, '')
    return `${IPFS_GATEWAYS[0]}${hash}`
  }
  return url
}

/** All URLs worth trying for an image, in order (ipfs:// expands to every gateway). */
export function imageCandidates(url: string): string[] {
  if (!url) return []
  if (url.startsWith('ipfs://')) {
    const hash = url.slice(7).replace(/^ipfs\//, '')
    return IPFS_GATEWAYS.map(g => `${g}${hash}`)
  }
  return [url]
}

/**
 * <img> that understands ipfs:// and falls through gateways on error.
 * Renders nothing once every candidate has failed (or when src is empty).
 */
export function SmartImg({ src, ...rest }: { src: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>) {
  const [idx, setIdx] = useState(0)
  useEffect(() => setIdx(0), [src])
  const urls = imageCandidates(src)
  if (!urls.length || idx >= urls.length) return null
  return <img {...rest} src={urls[idx]} onError={() => setIdx(i => i + 1)} />
}

export default function ImageUpload({ value, onChange, label = 'Token Logo' }: ImageUploadProps) {
  const [mode, setMode] = useState<UploadMode>('upload')
  const [urlInput, setUrlInput] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadedHash, setUploadedHash] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const displayUrl = value

  // Pull a human-readable reason out of a failed API response
  const reason = async (res: Response) => {
    try { const j = await res.json() as { error?: string }; return j.error ?? `HTTP ${res.status}` }
    catch { return `HTTP ${res.status}` }
  }

  const uploadFile = useCallback(async (file: File) => {
    setError('')
    setUploadState('uploading')

    try {
      // Try IPFS first
      const form = new FormData()
      form.append('file', file)
      const ipfsRes = await fetch('/api/ipfs', { method: 'POST', body: form })

      if (ipfsRes.ok) {
        const { ipfsHash, ipfsUrl } = await ipfsRes.json() as { ipfsHash: string; ipfsUrl: string }
        setUploadedHash(ipfsHash)
        setUploadState('ipfs')
        onChange(ipfsUrl) // store ipfs:// URL — permanent
        return
      }
      const ipfsWhy = await reason(ipfsRes)

      // Fallback to R2
      const r2Form = new FormData()
      r2Form.append('file', file)
      const r2Res = await fetch('/api/upload', { method: 'POST', body: r2Form })

      if (r2Res.ok) {
        const { url } = await r2Res.json() as { url: string }
        setUploadState('r2')
        onChange(url)
        return
      }
      const r2Why = await reason(r2Res)

      // Last resort: local object URL (preview only — LaunchPage refuses to launch with it)
      const localUrl = URL.createObjectURL(file)
      setUploadState('idle')
      onChange(localUrl)
      setError(`Preview only — not uploaded. IPFS: ${ipfsWhy}. CDN: ${r2Why}. Fix in Admin → Keys & APIs (PINATA_JWT / R2_PUBLIC_URL).`)
    } catch (e: any) {
      setUploadState('error')
      setError(`Upload failed: ${e?.message ?? 'network error'}`)
    }
  }, [onChange])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5MB')
      return
    }
    uploadFile(file)
  }, [uploadFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleUrlSubmit = useCallback(() => {
    const url = urlInput.trim()
    if (!url) return
    // Normalize ipfs:// URLs
    if (url.startsWith('ipfs://') || url.startsWith('https://') || url.startsWith('http://')) {
      onChange(url)
      setUrlInput('')
    } else {
      setError('Enter a valid URL (https://) or IPFS URI (ipfs://...)')
    }
  }, [urlInput, onChange])

  const clear = useCallback(() => {
    onChange('')
    setUploadedHash('')
    setUploadState('idle')
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }, [onChange])

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{label}</label>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            mode === 'upload' ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white/80'
          )}
        >
          <Upload className="w-3 h-3" /> Upload
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            mode === 'url' ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white/80'
          )}
        >
          <Link className="w-3 h-3" /> URL / IPFS
        </button>
      </div>

      <div className="flex gap-3 items-start">
        {/* Preview */}
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
            {displayUrl ? (
              <SmartImg src={displayUrl} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-white/20 text-3xl font-bold">?</div>
            )}
          </div>
          {value && (
            <button
              type="button"
              onClick={clear}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="flex-1 space-y-2">
          {mode === 'upload' ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all text-center',
                dragOver ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
              )}
            >
              {uploadState === 'uploading' ? (
                <div className="flex flex-col items-center gap-1.5">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                  <p className="text-xs text-white/50">Uploading to IPFS...</p>
                </div>
              ) : uploadState === 'ipfs' ? (
                <div className="flex flex-col items-center gap-1.5">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <p className="text-xs text-green-400 font-medium">Pinned to IPFS</p>
                  <p className="text-[10px] text-white/30 font-mono break-all">{uploadedHash.slice(0, 20)}...</p>
                </div>
              ) : uploadState === 'r2' ? (
                <div className="flex flex-col items-center gap-1.5">
                  <CheckCircle className="w-5 h-5 text-blue-400" />
                  <p className="text-xs text-blue-400 font-medium">Uploaded to CDN</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload className="w-5 h-5 text-white/30" />
                  <p className="text-xs text-white/50">Drop image or click</p>
                  <p className="text-[10px] text-white/30">PNG, JPG, GIF, WEBP · max 5MB</p>
                  <p className="text-[10px] text-purple-400/70 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Stored permanently on IPFS
                  </p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                placeholder="https://... or ipfs://Qm..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-medium text-white transition-colors"
              >
                Use
              </button>
            </div>
          )}

          {error && <p className="text-xs text-amber-400">{error}</p>}
          {value && uploadState !== 'ipfs' && uploadState !== 'r2' && (
            <p className="text-[10px] text-white/30 break-all">{value.slice(0, 60)}{value.length > 60 ? '...' : ''}</p>
          )}
        </div>
      </div>
    </div>
  )
}

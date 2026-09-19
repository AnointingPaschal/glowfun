import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

export interface OHLCV {
  time: number   // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Props {
  data: OHLCV[]
  loading?: boolean
  symbol?: string
  height?: number
}

const PAD = { top: 20, right: 60, bottom: 40, left: 12 }
const VOL_HEIGHT_RATIO = 0.18

/* ── colour palette ────────────────────────────────────────────── */
const GREEN = '#26a69a'
const RED   = '#ef5350'
const GRID  = 'rgba(255,255,255,0.05)'
const TEXT  = 'rgba(255,255,255,0.35)'
const AXIS  = 'rgba(255,255,255,0.08)'
const CROSS = 'rgba(139,92,246,0.6)'

/* ── helpers ───────────────────────────────────────────────────── */
function fmtPrice(v: number): string {
  if (v === 0) return '0'
  if (v >= 1000) return `$${(v/1000).toFixed(1)}K`
  if (v >= 1)    return `$${v.toFixed(4)}`
  if (v >= 0.001) return `$${v.toFixed(6)}`
  if (v >= 0.000001) return `$${v.toFixed(8)}`
  // Subscript-zero notation
  const s = v.toFixed(20).replace(/0+$/, '')
  const m = s.match(/^0\.(0+)([1-9].*)$/)
  if (m) {
    const zeros = m[1].length
    const sig   = m[2].slice(0, 5)
    if (zeros > 3) {
      const sub: Record<string, string> = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'}
      const subscript = zeros.toString().split('').map(d => sub[d]).join('')
      return `$0.0${subscript}${sig}`
    }
  }
  return `$${v.toFixed(10).replace(/0+$/, '')}`
}

function fmtTime(ts: number, span: number): string {
  const d = new Date(ts * 1000)
  if (span < 3600 * 6)  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (span < 86400 * 3) return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtVol(v: number): string {
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

/* ── synthetic data generator ──────────────────────────────────── */
export function generateSyntheticOHLCV(
  currentPrice: number,
  realUsdcRaised: bigint,
  createdAt: bigint | number,
): OHLCV[] {
  const now   = Math.floor(Date.now() / 1000)
  const start = Number(createdAt) || now - 3600 * 48
  const span  = now - start
  const intervalSecs = Math.max(300, Math.floor(span / 120))
  const bars: OHLCV[] = []
  let price = currentPrice * 0.2 || 1e-12

  for (let t = start; t < now; t += intervalSecs) {
    const frac  = (t - start) / Math.max(span, 1)
    const drift = 1 + frac * 4 + (Math.random() - 0.35) * 0.3
    const open  = price
    price = Math.max(price * drift, 1e-20)
    const hi  = Math.max(open, price) * (1 + Math.random() * 0.05)
    const lo  = Math.min(open, price) * (1 - Math.random() * 0.05)
    const vol = (Number(realUsdcRaised) / 1e6) * (0.02 + Math.random() * 0.08)
    bars.push({ time: t, open, high: hi, low: lo, close: price, volume: vol })
  }
  return bars
}

/* ── main chart component ──────────────────────────────────────── */
export function PriceChart({ data, loading, symbol, height = 380 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; bar?: OHLCV } | null>(null)
  const [hoveredBar, setHoveredBar] = useState<OHLCV | null>(null)
  const [visRange, setVisRange] = useState<[number, number]>([0, 200])
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; range: [number, number] } | null>(null)

  const drawRef = useRef<((bars: OHLCV[], vis: [number, number], xhair?: { x: number; y: number }) => void) | null>(null)

  const draw = useCallback((bars: OHLCV[], vis: [number, number], xhair?: { x: number; y: number }) => {
    const canvas = canvasRef.current
    if (!canvas || bars.length === 0) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const [vStart, vEnd] = vis
    const slice = bars.slice(Math.max(0, vStart), Math.min(bars.length, vEnd))
    if (slice.length === 0) return

    const priceH = H * (1 - VOL_HEIGHT_RATIO) - PAD.top - PAD.bottom
    const volH   = H * VOL_HEIGHT_RATIO
    const plotW  = W - PAD.left - PAD.right

    const minLow  = Math.min(...slice.map(b => b.low))
    const maxHigh = Math.max(...slice.map(b => b.high))
    const priceRange = maxHigh - minLow || maxHigh * 0.1 || 1e-20
    const maxVol  = Math.max(...slice.map(b => b.volume)) || 1

    const toX = (i: number) => PAD.left + (i / (slice.length)) * plotW + plotW / slice.length / 2
    const toY = (p: number) => PAD.top  + (1 - (p - minLow) / priceRange) * priceH
    const toYV = (v: number) => H - PAD.bottom * 0.4 - (v / maxVol) * volH

    // Background
    ctx.clearRect(0, 0, W, H)

    // Grid lines
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    const gridCount = 5
    for (let i = 0; i <= gridCount; i++) {
      const y = PAD.top + (i / gridCount) * priceH
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
      const price = maxHigh - (i / gridCount) * priceRange
      ctx.fillStyle = TEXT
      ctx.font = `10px JetBrains Mono, monospace`
      ctx.textAlign = 'right'
      ctx.fillText(fmtPrice(price), W - 4, y + 3.5)
    }

    // Axis line
    ctx.strokeStyle = AXIS
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top + priceH)
    ctx.lineTo(W - PAD.right, PAD.top + priceH)
    ctx.stroke()

    // X-axis labels
    ctx.textAlign = 'center'
    ctx.fillStyle = TEXT
    ctx.font = '9px system-ui'
    const span = (slice[slice.length - 1]?.time ?? 0) - (slice[0]?.time ?? 0)
    const labelStep = Math.max(1, Math.floor(slice.length / 8))
    slice.forEach((bar, i) => {
      if (i % labelStep !== 0) return
      ctx.fillText(fmtTime(bar.time, span), toX(i), H - PAD.bottom * 0.3)
    })

    // Candles
    const candleW = Math.max(1, plotW / slice.length * 0.65)

    slice.forEach((bar, i) => {
      const x  = toX(i)
      const yO = toY(bar.open)
      const yC = toY(bar.close)
      const yH = toY(bar.high)
      const yL = toY(bar.low)
      const col = bar.close >= bar.open ? GREEN : RED

      // Wick
      ctx.strokeStyle = col
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, yH); ctx.lineTo(x, yL)
      ctx.stroke()

      // Body
      ctx.fillStyle = col
      const bodyTop = Math.min(yO, yC)
      const bodyH   = Math.max(1, Math.abs(yO - yC))
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
    })

    // Volume bars
    slice.forEach((bar, i) => {
      const x  = toX(i)
      const yV = toYV(bar.volume)
      const col = bar.close >= bar.open ? `${GREEN}55` : `${RED}55`
      ctx.fillStyle = col
      ctx.fillRect(x - candleW / 2, yV, candleW, H - PAD.bottom * 0.4 - yV)
    })

    // Crosshair
    if (xhair) {
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = CROSS
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(xhair.x, PAD.top); ctx.lineTo(xhair.x, PAD.top + priceH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD.left, xhair.y); ctx.lineTo(W - PAD.right, xhair.y); ctx.stroke()
      ctx.setLineDash([])

      // Price label on right axis
      const hoverPrice = maxHigh - ((xhair.y - PAD.top) / priceH) * priceRange
      if (hoverPrice > 0) {
        const label = fmtPrice(hoverPrice)
        ctx.fillStyle = '#8b5cf6'
        ctx.fillRect(W - PAD.right + 1, xhair.y - 9, PAD.right - 2, 18)
        ctx.fillStyle = 'white'
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.textAlign = 'right'
        ctx.fillText(label, W - 3, xhair.y + 3.5)
      }
    }

    // Latest price line
    const lastBar = slice[slice.length - 1]
    if (lastBar) {
      const y = toY(lastBar.close)
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = lastBar.close >= lastBar.open ? `${GREEN}66` : `${RED}66`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
      ctx.setLineDash([])
    }
  }, [])

  drawRef.current = draw

  useEffect(() => {
    if (data.length > 0) {
      const end = data.length
      const start = Math.max(0, end - 120)
      setVisRange([start, end])
    }
  }, [data.length])

  useEffect(() => {
    drawRef.current?.(data, visRange, crosshair ? { x: crosshair.x, y: crosshair.y } : undefined)
  }, [data, visRange, crosshair])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      drawRef.current?.(data, visRange, undefined)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [data, visRange])

  const getBarAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const [vStart, vEnd] = visRange
    const slice = data.slice(Math.max(0, vStart), Math.min(data.length, vEnd))
    const W = canvas.offsetWidth
    const plotW = W - PAD.left - PAD.right
    const barIdx = Math.round((x - PAD.left) / (plotW / slice.length))
    const bar = slice[Math.max(0, Math.min(slice.length - 1, barIdx))]
    return { bar, x, y }
  }, [data, visRange])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const result = getBarAt(e.clientX, e.clientY)
    if (result) { setCrosshair({ x: result.x, y: result.y, bar: result.bar }); setHoveredBar(result.bar ?? null) }
    if (isPanning && panStart.current) {
      const canvas = canvasRef.current
      if (!canvas) return
      const dx = e.clientX - panStart.current.x
      const W = canvas.offsetWidth - PAD.left - PAD.right
      const [s, e2] = panStart.current.range
      const span = e2 - s
      const shift = -Math.round(dx / (W / span))
      const maxEnd = data.length
      const newEnd = Math.min(maxEnd, Math.max(span, e2 + shift))
      const newStart = Math.max(0, newEnd - span)
      setVisRange([newStart, newStart + span])
    }
  }, [getBarAt, isPanning, data.length])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const [s, end] = visRange
    const span = end - s
    const delta = e.deltaY > 0 ? Math.ceil(span * 0.1) : -Math.ceil(span * 0.1)
    const newSpan = Math.max(20, Math.min(data.length, span + delta))
    const newEnd = Math.min(data.length, Math.max(newSpan, end))
    setVisRange([Math.max(0, newEnd - newSpan), newEnd])
  }, [visRange, data.length])

  const lastBar = data[data.length - 1]
  const prevBar = data[data.length - 2]
  const displayBar = hoveredBar ?? lastBar
  const change = displayBar && prevBar ? ((displayBar.close - prevBar.close) / prevBar.close) * 100 : 0

  return (
    <div className="relative w-full select-none" style={{ height }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl" style={{ background: 'rgba(10,10,20,0.7)' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: '#8b5cf6' }} />
        </div>
      )}

      {/* OHLCV tooltip */}
      {displayBar && (
        <div className="absolute top-1 left-2 flex items-center gap-3 z-10 flex-wrap">
          <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>{symbol}/USDC</span>
          {[
            { label: 'O', value: fmtPrice(displayBar.open) },
            { label: 'H', value: fmtPrice(displayBar.high) },
            { label: 'L', value: fmtPrice(displayBar.low) },
            { label: 'C', value: fmtPrice(displayBar.close) },
            { label: 'V', value: fmtVol(displayBar.volume) },
          ].map(({ label, value }) => (
            <span key={label} className="text-[10px] tabular-nums">
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>{label} </span>
              <span style={{ color: label === 'C' ? (displayBar.close >= displayBar.open ? GREEN : RED) : 'rgba(255,255,255,0.7)' }}>{value}</span>
            </span>
          ))}
          {change !== 0 && (
            <span className="text-[10px] tabular-nums font-medium" style={{ color: change >= 0 ? GREEN : RED }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </span>
          )}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-xl cursor-crosshair"
        style={{ background: 'rgba(8,8,16,0.6)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setCrosshair(null); setHoveredBar(null) }}
        onMouseDown={e => { setIsPanning(true); panStart.current = { x: e.clientX, range: [...visRange] as [number, number] } }}
        onMouseUp={() => { setIsPanning(false); panStart.current = null }}
        onWheel={handleWheel}
      />
    </div>
  )
}

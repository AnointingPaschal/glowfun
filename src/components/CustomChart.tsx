import { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react'

export interface CandleData {
  time: number   // unix seconds
  open: number; high: number; low: number; close: number
  volume?: number
}

/* ── colours ────────────────────────────────────────────────────── */
const C = {
  bg:        '#0b0b14',
  upBody:    '#26a69a', upWick:  '#26a69a',
  downBody:  '#ef5350', downWick:'#ef5350',
  volUp:     'rgba(38,166,154,0.3)',
  volDown:   'rgba(239,83,80,0.25)',
  grid:      'rgba(255,255,255,0.05)',
  axis:      'rgba(255,255,255,0.25)',
  crosshair: 'rgba(255,255,255,0.4)',
  label:     'rgba(255,255,255,0.65)',
  tooltip:   'rgba(14,14,24,0.95)',
}

/* ── helpers ────────────────────────────────────────────────────── */
const fmtP = (p: number) => {
  if (p === 0) return '0'
  if (p >= 1000) return p.toLocaleString('en', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(4)
  if (p >= 0.01) return p.toFixed(6)
  return p.toExponential(4)
}
const fmtV = (v: number) => {
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(2)}K`
  return `$${v.toFixed(0)}`
}
const fmtT = (ts: number, span: number) => {
  const d = new Date(ts * 1000)
  if (span > 6 * 86400)   return `${d.getMonth()+1}/${d.getDate()}`
  if (span > 12 * 3600)   return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}h`
  if (span > 1800)         return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function niceY(lo: number, hi: number, steps = 6) {
  const range = hi - lo || 1
  const raw   = range / steps
  const mag   = Math.pow(10, Math.floor(Math.log10(raw)))
  const nice  = [1,2,2.5,5,10].map(f => f * mag).find(n => n >= raw) ?? mag
  const start = Math.floor(lo / nice) * nice
  const ticks: number[] = []
  for (let v = start; v <= hi + nice; v = +(v + nice).toPrecision(12)) ticks.push(v)
  return ticks
}

/* ── layout constants ───────────────────────────────────────────── */
const PAD = { left: 72, right: 10, top: 10, bottom: 30, volH: 60, gap: 6 }

interface Props {
  data: CandleData[]
  height?: number
  loading?: boolean
}

export function CustomChart({ data, height = 380, loading = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const stateRef  = useRef({ startIdx: 0, count: Math.min(80, data.length), drag: false, dragX: 0, dragIdx: 0 })
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; idx: number } | null>(null)

  /* resize */
  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  /* Reset view when data first arrives (count was 0 from empty init) */
  useEffect(() => {
    if (data.length > 0) {
      const cnt = Math.min(80, data.length)
      stateRef.current.count    = cnt
      stateRef.current.startIdx = Math.max(0, data.length - cnt)
    }
  }, [data.length])

  /* clamp view */
  const clamp = useCallback((s: number, c: number) => {
    const n   = data.length
    const cnt = Math.max(10, Math.min(c, n))
    const st  = Math.max(0, Math.min(s, n - cnt))
    return { startIdx: st, count: cnt }
  }, [data.length])

  /* draw */
  const draw = useCallback(() => {
    const cv  = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d');    if (!ctx) return
    const { startIdx, count } = stateRef.current
    if (count === 0) return
    const dpr = window.devicePixelRatio || 1

    cv.width  = w   * dpr
    cv.height = height * dpr
    ctx.scale(dpr, dpr)

    const chartH = height - PAD.bottom - PAD.top - PAD.volH - PAD.gap
    const chartW = w - PAD.left - PAD.right
    const volTop = PAD.top + chartH + PAD.gap

    /* background */
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, w, height)

    if (!data.length) {
      ctx.fillStyle = C.bg
      ctx.fillRect(0, 0, w, height)
      // Draw placeholder grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
      for (let i = 1; i <= 5; i++) {
        const y = (height / 6) * i
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(w - PAD.right, y); ctx.stroke()
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.font = '11px "Space Grotesk",system-ui'; ctx.textAlign = 'center'
      ctx.fillText('Loading chart…', w/2, height/2)
      return
    }

    const visible = data.slice(startIdx, startIdx + count)
    if (!visible.length) return

    const minP = Math.min(...visible.map(d => d.low))
    const maxP = Math.max(...visible.map(d => d.high))
    const padP = (maxP - minP) * 0.08
    const lo   = minP - padP, hi = maxP + padP

    const maxVol = Math.max(...visible.map(d => d.volume ?? 0)) || 1

    const cw  = chartW / count        // width per candle slot
    const bw  = Math.max(1, cw * 0.6) // body width

    const py = (p: number) => PAD.top + chartH * (1 - (p - lo) / (hi - lo))
    const px = (i: number) => PAD.left + (i + 0.5) * cw

    /* ── Y grid + price axis ── */
    const yticks = niceY(lo, hi)
    ctx.font = '10px "Space Grotesk", system-ui'
    yticks.forEach(tick => {
      if (tick < lo || tick > hi) return
      const y = py(tick)
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(w - PAD.right, y); ctx.stroke()
      ctx.fillStyle = C.axis; ctx.textAlign = 'right'
      ctx.fillText(fmtP(tick), PAD.left - 6, y + 3)
    })

    /* ── X grid + time axis ── */
    const spanSecs = (visible[visible.length-1]?.time ?? 0) - (visible[0]?.time ?? 0)
    const xStep = Math.max(1, Math.round(count / 6))
    ctx.textAlign = 'center'
    visible.forEach((d, i) => {
      if (i % xStep !== 0) return
      const x = px(i)
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + chartH); ctx.stroke()
      ctx.fillStyle = C.axis
      ctx.fillText(fmtT(d.time, spanSecs), x, height - 8)
    })

    /* ── Candles ── */
    visible.forEach((d, i) => {
      const up  = d.close >= d.open
      const x   = px(i)
      const bColor = up ? C.upBody  : C.downBody
      const wColor = up ? C.upWick  : C.downWick

      /* wick */
      ctx.strokeStyle = wColor; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, py(d.high))
      ctx.lineTo(x, py(d.low))
      ctx.stroke()

      /* body */
      const y1 = py(Math.max(d.open, d.close))
      const y2 = py(Math.min(d.open, d.close))
      ctx.fillStyle = bColor
      ctx.fillRect(x - bw/2, y1, bw, Math.max(1, y2 - y1))
    })

    /* ── Volume bars ── */
    visible.forEach((d, i) => {
      if (!d.volume) return
      const up   = d.close >= d.open
      const x    = px(i)
      const barH = (d.volume / maxVol) * PAD.volH
      ctx.fillStyle = up ? C.volUp : C.volDown
      ctx.fillRect(x - bw/2, volTop + PAD.volH - barH, bw, barH)
    })

    /* separator line */
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD.left, volTop); ctx.lineTo(w - PAD.right, volTop); ctx.stroke()

    /* ── Crosshair ── */
    const ch = crosshair
    if (ch && ch.idx >= 0 && ch.idx < count) {
      const x = px(ch.idx)
      ctx.strokeStyle = C.crosshair; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + chartH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD.left, ch.y); ctx.lineTo(w - PAD.right, ch.y); ctx.stroke()
      ctx.setLineDash([])

      /* price label on y-axis */
      const price = lo + (1 - (ch.y - PAD.top) / chartH) * (hi - lo)
      ctx.fillStyle = C.crosshair
      ctx.fillRect(0, ch.y - 9, PAD.left - 2, 18)
      ctx.fillStyle = C.bg; ctx.textAlign = 'right'
      ctx.fillText(fmtP(price), PAD.left - 6, ch.y + 3)
    }
  }, [data, w, height, crosshair])

  useEffect(() => { draw() }, [draw, data, w, height])

  /* ── Event handlers ── */
  const idxFromX = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return -1
    const relX = clientX - rect.left - PAD.left
    const { count } = stateRef.current
    const cw = (w - PAD.left - PAD.right) / count
    return Math.floor(relX / cw)
  }

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const { startIdx, count } = stateRef.current
    const factor = e.deltaY > 0 ? 1.12 : 0.88
    const newCount = Math.round(count * factor)
    const pinI = idxFromX(e.clientX)
    const pivot = Math.max(0, pinI)
    const ratio = pivot / count
    const newStart = Math.round(startIdx + ratio * (count - newCount))
    const { startIdx: s, count: c } = clamp(newStart, newCount)
    stateRef.current = { ...stateRef.current, startIdx: s, count: c }
    draw()
  }, [w, clamp, draw])

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    stateRef.current.drag   = true
    stateRef.current.dragX  = e.clientX
    stateRef.current.dragIdx = stateRef.current.startIdx
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = e.clientX - rect.left - PAD.left
    const relY = e.clientY - rect.top
    const cw   = (w - PAD.left - PAD.right) / s.count
    const idx  = Math.max(0, Math.min(s.count - 1, Math.floor(relX / cw)))
    setCrosshair({ x: e.clientX - rect.left, y: relY, idx })

    if (s.drag) {
      const dx    = e.clientX - s.dragX
      const dIdx  = Math.round(-dx / cw)
      const { startIdx: ns, count: nc } = clamp(s.dragIdx + dIdx, s.count)
      stateRef.current = { ...s, startIdx: ns, count: nc }
    }
    draw()
  }, [w, clamp, draw])

  const onMouseLeave = useCallback(() => {
    stateRef.current.drag = false
    setCrosshair(null)
    draw()
  }, [draw])

  const onMouseUp = useCallback(() => { stateRef.current.drag = false }, [])

  /* tooltip data */
  const tipCandle = crosshair && data[stateRef.current.startIdx + crosshair.idx]

  return (
    <div ref={wrapRef} className="relative select-none" style={{ background: C.bg, borderRadius: 12, overflow: 'hidden', userSelect: 'none' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(11,11,20,0.7)' }}>
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(38,166,154,0.3)', borderTopColor: '#26a69a' }} />
        </div>
      )}

      {/* OHLCV tooltip bar */}
      <div className="absolute top-2 left-2 right-2 flex items-center gap-3 pointer-events-none" style={{ height: 20 }}>
        {tipCandle ? (
          <div className="flex items-center gap-3 text-[10px] font-mono px-2 py-1 rounded-lg" style={{ background: C.tooltip }}>
            {[['O', tipCandle.open], ['H', tipCandle.high], ['L', tipCandle.low], ['C', tipCandle.close]].map(([k, v]) => (
              <span key={k as string}>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{k} </span>
                <span style={{ color: tipCandle.close >= tipCandle.open ? '#26a69a' : '#ef5350' }}>{fmtP(v as number)}</span>
              </span>
            ))}
            {tipCandle.volume !== undefined && (
              <span>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>Vol </span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{fmtV(tipCandle.volume)}</span>
              </span>
            )}
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>
              {new Date(tipCandle.time * 1000).toLocaleString()}
            </span>
          </div>
        ) : data.length > 0 && (
          <span className="text-[10px] px-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Scroll to zoom · Drag to pan</span>
        )}
      </div>

      <canvas ref={canvasRef}
        style={{ width: '100%', height, display: 'block', cursor: stateRef.current.drag ? 'grabbing' : 'crosshair' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave} onMouseUp={onMouseUp}
      />
    </div>
  )
}

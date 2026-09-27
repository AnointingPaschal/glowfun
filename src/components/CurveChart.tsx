import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, AreaSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts'
import { BarChart3 } from 'lucide-react'
import { fmtPrice, type Candle } from '@/utils/candles'

export type ChartKind = 'candle' | 'area'

interface Props {
  candles: Candle[]
  kind?: ChartKind
  height?: number
  loading?: boolean
  emptyText?: string
}

const UP = '#22c55e'
const DOWN = '#ef4444'
const tzShift = () => -new Date().getTimezoneOffset() * 60     // chart shows UTC; shift so axis reads in local time
const fmtVol = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`

export function CurveChart({ candles, kind = 'candle', height = 400, loading = false, emptyText = 'No trades yet — the chart starts with the first buy' }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainRef = useRef<ISeriesApi<any> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const byTime = useRef<Map<number, Candle>>(new Map())
  const [hover, setHover] = useState<Candle | null>(null)

  const last = candles[candles.length - 1]
  const shown = hover ?? last
  const chg = shown && shown.open ? ((shown.close - shown.open) / shown.open) * 100 : 0

  // Create the chart (again when the chart kind or height changes)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const chart = createChart(el, {
      width: el.clientWidth, height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8892a4', fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.035)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(129,140,248,0.5)', labelBackgroundColor: '#4f46e5', style: LineStyle.Dashed },
        horzLine: { color: 'rgba(129,140,248,0.5)', labelBackgroundColor: '#4f46e5', style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 10, minBarSpacing: 2, maxBarSpacing: 14 },
      localization: { priceFormatter: (p: number) => fmtPrice(p) },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    } as any)

    const priceFormat = { type: 'custom' as const, minMove: 1e-12, formatter: (p: number) => fmtPrice(p) }
    // Never zoom the price axis tighter than ~2% of the price: otherwise a 0.01% move fills the whole
    // pane and a handful of trades render as giant candles.
    const autoscaleInfoProvider = (original: () => any) => {
      const r = original()
      if (!r || !r.priceRange) return r
      const { minValue, maxValue } = r.priceRange
      const mid = (minValue + maxValue) / 2
      const minSpan = Math.abs(mid) * 0.02
      if (maxValue - minValue >= minSpan) return r
      return { ...r, priceRange: { minValue: mid - minSpan / 2, maxValue: mid + minSpan / 2 } }
    }
    const main = kind === 'candle'
      ? chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat, priceLineColor: '#818cf8', autoscaleInfoProvider })
      : chart.addSeries(AreaSeries, { lineColor: '#818cf8', topColor: 'rgba(99,102,241,0.35)', bottomColor: 'rgba(99,102,241,0.02)', lineWidth: 2, priceFormat, priceLineColor: '#818cf8', autoscaleInfoProvider })
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    chart.subscribeCrosshairMove(p => {
      if (!p.time) return setHover(null)
      setHover(byTime.current.get((p.time as number) - tzShift()) ?? null)
    })

    const ro = new ResizeObserver(() => { if (wrap.current) chart.applyOptions({ width: wrap.current.clientWidth }) })
    ro.observe(el)
    chartRef.current = chart; mainRef.current = main; volRef.current = vol
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; mainRef.current = null; volRef.current = null }
  }, [kind, height])

  // Push data (declared after the creation effect so it runs after it on (re)mount)
  const fitted = useRef(false)
  useEffect(() => { fitted.current = false }, [kind])
  useEffect(() => {
    const main = mainRef.current, vol = volRef.current, chart = chartRef.current
    if (!main || !vol || !chart) return
    const off = tzShift()
    byTime.current = new Map(candles.map(c => [c.time, c]))
    if (kind === 'candle') main.setData(candles.map(c => ({ time: (c.time + off) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })))
    else main.setData(candles.map(c => ({ time: (c.time + off) as UTCTimestamp, value: c.close })))
    vol.setData(candles.map(c => ({ time: (c.time + off) as UTCTimestamp, value: c.volume, color: c.close >= c.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)' })))
    if (!fitted.current && candles.length) {
      // With few candles fitContent() stretches each one across the whole pane. Show a fixed-size window
      // (right-aligned) instead so candles keep a normal width; with lots of history, fit everything.
      const SLOTS = 60
      if (candles.length < SLOTS) chart.timeScale().setVisibleLogicalRange({ from: candles.length - SLOTS, to: candles.length + 2 })
      else chart.timeScale().fitContent()
      fitted.current = true
    }
  }, [candles, kind, height])

  const empty = useMemo(() => candles.length === 0, [candles])

  return (
    <div className="relative" style={{ height }}>
      {/* Legend */}
      {shown && (
        <div className="absolute left-3 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] pointer-events-none tabular-nums" style={{ color: 'var(--text2)' }}>
          {kind === 'candle' && <>
            <span>O <b style={{ color: 'var(--text1)' }}>{fmtPrice(shown.open)}</b></span>
            <span>H <b style={{ color: 'var(--text1)' }}>{fmtPrice(shown.high)}</b></span>
            <span>L <b style={{ color: 'var(--text1)' }}>{fmtPrice(shown.low)}</b></span>
          </>}
          <span>C <b style={{ color: 'var(--text1)' }}>{fmtPrice(shown.close)}</b></span>
          <b style={{ color: chg >= 0 ? UP : DOWN }}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</b>
          <span>Vol <b style={{ color: 'var(--text1)' }}>{fmtVol(shown.volume)}</b></span>
        </div>
      )}
      <div ref={wrap} style={{ width: '100%', height }} />
      {(empty || loading) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none" style={{ color: 'var(--text2)' }}>
          {loading
            ? <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(99,102,241,0.2)', borderTopColor: '#6366f1' }} />
            : <><BarChart3 size={26} style={{ color: 'var(--text3)' }} /><span className="text-xs">{emptyText}</span></>}
        </div>
      )}
    </div>
  )
}

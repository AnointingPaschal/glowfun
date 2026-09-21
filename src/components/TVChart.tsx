import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import {
  createChart, IChartApi, ColorType, CrosshairMode,
  CandlestickSeries, HistogramSeries, LineSeries,
} from 'lightweight-charts'
import type { CandleData } from './CustomChart'

export type ChartType = 'candle' | 'line'

interface Props {
  data:   CandleData[]
  height?: number
  type?:  ChartType
  loading?: boolean
}

export function TVChart({ data, height = 360, type = 'candle', loading = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const [w, setW]    = useState(400)

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || data.length === 0) return

    chartRef.current?.remove()

    const chart = createChart(el, {
      width:  w || el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor:  '#6b7280',
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize:   10,
      },
      grid: {
        vertLines: { color: 'rgba(0,0,0,0.04)' },
        horzLines: { color: 'rgba(0,0,0,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,0,0,0.25)', labelBackgroundColor: '#374151' },
        horzLine: { color: 'rgba(0,0,0,0.25)', labelBackgroundColor: '#374151' },
      },
      rightPriceScale: {
        borderColor: 'rgba(0,0,0,0.08)',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor:    'rgba(0,0,0,0.08)',
        timeVisible:    true,
        secondsVisible: false,
        tickMarkFormatter: (t: number) => {
          const d = new Date(t * 1000)
          return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}h`
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { mouseWheel: true, pinch: true },
    })

    if (type === 'line') {
      const line = chart.addSeries(LineSeries, {
        color:     '#6366f1',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
      })
      line.setData(data.map(d => ({ time: d.time as any, value: d.close })))
    } else {
      const candle = chart.addSeries(CandlestickSeries, {
        upColor:        '#16a34a',
        downColor:      '#dc2626',
        borderUpColor:  '#16a34a',
        borderDownColor:'#dc2626',
        wickUpColor:    '#16a34a',
        wickDownColor:  '#dc2626',
        priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
      })
      candle.setData(data.map(d => ({ time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close })))

      // Volume bars
      const vol = chart.addSeries(HistogramSeries, {
        color: 'rgba(99,102,241,0.2)',
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      })
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
      vol.setData(data.map(d => ({
        time:  d.time as any,
        value: d.volume ?? 0,
        color: d.close >= d.open ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.15)',
      })))
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const ro2 = new ResizeObserver(() => {
      if (el && chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth })
    })
    ro2.observe(el)

    return () => { ro2.disconnect(); chart.remove(); chartRef.current = null }
  }, [data, height, type, w])

  return (
    <div className="relative" style={{ background: '#fff', borderRadius: 0 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(255,255,255,0.8)' }}>
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(99,102,241,0.2)', borderTopColor: '#6366f1' }}/>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height }}/>

    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  createChart, IChartApi, ColorType, CrosshairMode,
  ISeriesApi, SeriesType, CandlestickSeries, HistogramSeries,
} from 'lightweight-charts'

export interface OHLCV {
  time: number   // unix timestamp (seconds)
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface Props {
  data: OHLCV[]
  height?: number
  loading?: boolean
  symbol?: string
}

export function CandlestickChart({ data, height = 320, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [tooltip, setTooltip] = useState<{ price: string; time: string; change: string; color: string } | null>(null)

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return
    const el = containerRef.current
    chartRef.current?.remove()

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.3)',
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.12)', labelBackgroundColor: '#1a1a2e' },
        horzLine: { color: 'rgba(255,255,255,0.12)', labelBackgroundColor: '#1a1a2e' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: number) => {
          const d = new Date(t * 1000)
          return `${(d.getMonth()+1)}/${d.getDate()} ${d.getHours()}h`
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    })

    // Candlestick series (v5 API)
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderUpColor: '#34d399',
      borderDownColor: '#f87171',
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
      priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
    })
    candle.setData(data.map(d => ({ time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close })))

    // Volume histogram
    if (data.some(d => d.volume !== undefined)) {
      const vol = chart.addSeries(HistogramSeries, {
        color: 'rgba(139,92,246,0.2)',
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      })
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
      vol.setData(data.map(d => ({
        time: d.time as any,
        value: d.volume ?? 0,
        color: d.close >= d.open ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.15)',
      })))
    }

    candleRef.current = candle
    chartRef.current = chart

    // Crosshair tooltip
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.seriesData.has(candle)) { setTooltip(null); return }
      const bar = param.seriesData.get(candle) as any
      if (!bar) { setTooltip(null); return }
      const d = new Date((param.time as number) * 1000)
      const change = ((bar.close - bar.open) / bar.open) * 100
      setTooltip({
        price: `O:${bar.open.toExponential(3)} H:${bar.high.toExponential(3)} L:${bar.low.toExponential(3)} C:${bar.close.toExponential(3)}`,
        time: `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`,
        change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        color: change >= 0 ? '#34d399' : '#f87171',
      })
    })

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth })
    })
    ro.observe(el)
    chart.timeScale().fitContent()

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [data, height])

  return (
    <div className="relative" style={{ background: 'rgba(6,6,12,0.8)', borderRadius: 12, overflow: 'hidden' }}>
      {tooltip && (
        <div className="absolute top-2 left-3 z-10 flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{tooltip.time}</span>
          <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.55)' }}>{tooltip.price}</span>
          <span className="text-[9px] font-semibold" style={{ color: tooltip.color }}>{tooltip.change}</span>
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: 'rgba(6,6,12,0.7)' }}>
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(139,92,246,0.3)', borderTopColor: '#8b5cf6' }} />
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height }} />
    </div>
  )
}

/* ── Synthetic OHLCV from bonding curve ─────────────────────────── */
export function generateSyntheticOHLCV(
  currentPriceNum: number,
  realUsdcRaised: bigint,
  createdAt: bigint,
  candles = 60,
): OHLCV[] {
  const now = Math.floor(Date.now() / 1000)
  const created = Number(createdAt) || (now - 7 * 24 * 3600)
  const totalRaised = Number(realUsdcRaised) / 1e6
  const vUsdc = 30_000, vTokens = 1_073_000_191

  const intervalSecs = Math.max(Math.floor((now - created) / candles), 3600)
  const result: OHLCV[] = []
  let seed = parseInt(String(realUsdcRaised).slice(0, 8)) || 42

  const rand = () => {
    seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
    return ((seed >>> 0) / 0xFFFFFFFF)
  }

  for (let i = 0; i < candles; i++) {
    const t = created + i * intervalSecs
    const prog = ease(i / candles)
    const raised = totalRaised * prog
    const toks = raised * vTokens / (vUsdc + raised)
    const p = (vUsdc + raised) / ((vTokens - toks) * 1e18) * 1e6

    const noise = 0.04 + rand() * 0.08
    const dir = rand() > 0.45 ? 1 : -1
    const o = p * (1 + (rand() - 0.5) * noise * 0.5)
    const c = p * (1 + dir * noise * 0.3 * rand())
    const h = Math.max(o, c) * (1 + noise * 0.12 * rand())
    const l = Math.min(o, c) * (1 - noise * 0.08 * rand())

    result.push({ time: t, open: Math.max(o, 1e-20), high: Math.max(h, 1e-20), low: Math.max(l, 1e-20), close: Math.max(c, 1e-20), volume: (raised / candles) * (0.4 + rand() * 0.8) })
  }
  return result
}

function ease(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }

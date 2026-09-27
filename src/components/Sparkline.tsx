/** Tiny inline price trend (no axes). Green if the last point is >= the first, red otherwise. */
export function Sparkline({ values, width = 64, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  // Flat series: draw a centered line instead of dividing by zero, and don't exaggerate tiny moves
  const span = Math.max(max - min, Math.abs(max) * 0.02) || 1
  const mid = (max + min) / 2
  const y = (v: number) => height - 2 - ((v - (mid - span / 2)) / span) * (height - 4)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  const color = up ? '#22c55e' : '#ef4444'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(width - 1).toFixed(1)} cy={y(values[values.length - 1]).toFixed(1)} r={2} fill={color} />
    </svg>
  )
}

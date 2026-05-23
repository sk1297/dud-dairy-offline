// ReportsCharts.jsx — Pure SVG chart components for the Reports page
// All charts are hand-rolled SVG — no external chart library dependencies.
// Every component is a pure function; pass data as props.

import React from 'react'

// ── 1. DeliveryRing ──────────────────────────────────────────────────────────
// Donut ring showing delivery completion %.  served/total → pct arc.
export function DeliveryRing({ served, total }) {
  const pct    = total > 0 ? Math.min(100, (served / total) * 100) : 0
  const r      = 46
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)
  const color  = pct >= 90 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        {/* Background track */}
        <circle cx={60} cy={60} r={r} fill="none" stroke="var(--surface2)" strokeWidth={14} />
        {/* Progress arc */}
        <circle
          cx={60} cy={60} r={r}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition:'stroke-dashoffset 0.6s ease' }}
        />
        {/* Center text */}
        <text x={60} y={56} textAnchor="middle" fill="var(--text)" fontSize={18} fontWeight={800} fontFamily="inherit">
          {pct.toFixed(0)}%
        </text>
        <text x={60} y={72} textAnchor="middle" fill="var(--text2)" fontSize={11} fontFamily="inherit">
          पूर्ण
        </text>
      </svg>
      <div style={{ fontSize:11, color:'var(--text2)', textAlign:'center' }}>
        {served} / {total} ग्राहक
      </div>
    </div>
  )
}

// ── 2. MiniTrendBars ─────────────────────────────────────────────────────────
// 7-day delivery quantity mini bar chart.
// data: [{ date:'YYYY-MM-DD', qty:number }] — must be pre-filled for all 7 days
export function MiniTrendBars({ data }) {
  if (!data || data.length === 0) return null
  const W = 51, H = 50, BOTTOM = 18
  const maxQty = Math.max(...data.map(d => d.qty), 0.1)
  const today  = new Date().toISOString().split('T')[0]

  const dayLabel = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00')
    return ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'][d.getDay()]
  }

  return (
    <svg width="100%" viewBox={`0 0 ${data.length * W} ${H + BOTTOM}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const barH   = maxQty > 0 ? (d.qty / maxQty) * H : 2
        const isToday = d.date === today
        const barX   = i * W + (W - 22) / 2
        const barY   = H - barH
        return (
          <g key={i}>
            {/* bar */}
            <rect
              x={barX} y={barY} width={22} height={Math.max(barH, 3)}
              rx={4}
              fill={isToday ? '#10b981' : 'rgba(16,185,129,0.45)'}
            />
            {/* qty label above bar */}
            {d.qty > 0 && (
              <text x={barX + 11} y={barY - 3} textAnchor="middle" fill={isToday ? '#10b981' : 'var(--text2)'} fontSize={9} fontWeight={isToday ? 800 : 500} fontFamily="inherit">
                {d.qty.toFixed(1)}
              </text>
            )}
            {/* day label */}
            <text x={i * W + W / 2} y={H + 14} textAnchor="middle" fill={isToday ? '#10b981' : 'var(--text2)'} fontSize={11} fontWeight={isToday ? 800 : 500} fontFamily="inherit">
              {dayLabel(d.date)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 3. MonthlyDayBars ────────────────────────────────────────────────────────
// Day-by-day delivery bars for a full month (up to 31 days).
// data: [{ day:number(1-31), qty:number, hasPartial:bool }]
export function MonthlyDayBars({ data, daysInMonth }) {
  if (!data || data.length === 0) return null
  const W      = 360
  const H      = 80
  const BOTTOM = 16
  const barW   = Math.floor((W - 4) / daysInMonth) - 1
  const maxQty = Math.max(...data.map(d => d.qty), 0.1)

  // milestone day labels
  const labelDays = new Set([1, 10, 20, daysInMonth])

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + BOTTOM}`} preserveAspectRatio="xMidYMid meet">
      {/* Baseline */}
      <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={1} />

      {Array.from({ length: daysInMonth }, (_, i) => {
        const day   = i + 1
        const entry = data.find(d => d.day === day) || { qty: 0, hasPartial: false }
        const barH  = entry.qty > 0 ? Math.max((entry.qty / maxQty) * H, 4) : 0
        const barX  = i * (barW + 1) + 2
        const barY  = H - barH
        const color = entry.qty === 0 ? 'var(--surface2)' : entry.hasPartial ? '#f59e0b' : '#10b981'
        return (
          <g key={day}>
            <rect x={barX} y={entry.qty === 0 ? H - 3 : barY} width={barW} height={entry.qty === 0 ? 3 : barH} rx={2} fill={color} />
            {labelDays.has(day) && (
              <text x={barX + barW / 2} y={H + 13} textAnchor="middle" fill="var(--text2)" fontSize={9} fontFamily="inherit">{day}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── 4. PaymentModeDonut ──────────────────────────────────────────────────────
// Donut/ring chart for payment mode breakdown.
// modes: [{ mode:'cash'|'upi'|'bank'|'cheque', total:number }]
const MODE_COLORS = { cash: '#10b981', upi: '#3b82f6', bank: '#8b5cf6', cheque: '#f59e0b' }
const MODE_LABELS = { cash: 'रोख', upi: 'UPI', bank: 'बँक', cheque: 'चेक' }

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function donutArcPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const o1 = polarToCartesian(cx, cy, outerR, startAngle)
  const o2 = polarToCartesian(cx, cy, outerR, endAngle)
  const i1 = polarToCartesian(cx, cy, innerR, endAngle)
  const i2 = polarToCartesian(cx, cy, innerR, startAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ')
}

export function PaymentModeDonut({ modes }) {
  if (!modes || modes.length === 0) return (
    <div style={{ textAlign:'center', color:'var(--text2)', fontSize:12, padding:'20px 0' }}>पेमेंट नोंदी नाहीत</div>
  )

  const total   = modes.reduce((s, m) => s + (m.total || 0), 0)
  if (total === 0) return null

  const cx = 70, cy = 70, outerR = 62, innerR = 40
  let startAngle = 0
  const segments = modes.map(m => {
    const pct  = (m.total / total) * 100
    const span = (m.total / total) * 360
    const seg  = { ...m, pct, startAngle, endAngle: startAngle + span }
    startAngle += span
    return seg
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {segments.map((seg, i) => (
          <path
            key={i}
            d={donutArcPath(cx, cy, outerR, innerR, seg.startAngle, seg.endAngle - 0.5)}
            fill={MODE_COLORS[seg.mode] || '#94a3b8'}
          />
        ))}
        {/* Center total */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize={11} fontFamily="inherit" fontWeight={700}>एकूण</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text)" fontSize={13} fontWeight={900} fontFamily="inherit">
          ₹{total >= 1000 ? (total / 1000).toFixed(1) + 'k' : total.toFixed(0)}
        </text>
      </svg>
      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 12px', justifyContent:'center' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:2, background: MODE_COLORS[seg.mode] || '#94a3b8', flexShrink:0 }} />
            <span style={{ fontSize:11, color:'var(--text2)' }}>{MODE_LABELS[seg.mode] || seg.mode}</span>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{seg.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 5. EfficiencyLine ────────────────────────────────────────────────────────
// 6-month collection efficiency trend line.
// data: [{ month:'मार्च', billed:number, collected:number }] — 6 items
export function EfficiencyLine({ data }) {
  if (!data || data.length === 0) return null
  const W = 360, H = 70, BOTTOM = 20, LEFT = 28
  const plotW = W - LEFT
  const slotW = plotW / data.length

  const points = data.map((d, i) => ({
    pct:   d.billed > 0 ? Math.min(100, (d.collected / d.billed) * 100) : 0,
    x:     LEFT + i * slotW + slotW / 2,
    month: d.month,
  }))

  // y coordinate (0% = bottom, 100% = top)
  const yFor = (pct) => H - (pct / 100) * H

  // Dashed threshold lines
  const y90 = yFor(90)
  const y70 = yFor(70)

  const polylinePoints = points.map(p => `${p.x},${yFor(p.pct)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + BOTTOM}`} preserveAspectRatio="xMidYMid meet">
      {/* Y-axis labels */}
      <text x={LEFT - 4} y={y90 + 4} textAnchor="end" fill="#10b981" fontSize={9} fontFamily="inherit">90%</text>
      <text x={LEFT - 4} y={y70 + 4} textAnchor="end" fill="#f59e0b" fontSize={9} fontFamily="inherit">70%</text>

      {/* Threshold lines */}
      <line x1={LEFT} y1={y90} x2={W} y2={y90} stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      <line x1={LEFT} y1={y70} x2={W} y2={y70} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      {/* Baseline */}
      <line x1={LEFT} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={1} />

      {/* Trend polyline */}
      <polyline points={polylinePoints} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points */}
      {points.map((p, i) => {
        const dotColor = p.pct >= 90 ? '#10b981' : p.pct >= 70 ? '#f59e0b' : '#ef4444'
        return (
          <g key={i}>
            <circle cx={p.x} cy={yFor(p.pct)} r={5} fill={dotColor} stroke="var(--bg)" strokeWidth={2} />
            <text x={p.x} y={yFor(p.pct) - 9} textAnchor="middle" fill={dotColor} fontSize={9} fontWeight={700} fontFamily="inherit">
              {p.pct.toFixed(0)}%
            </text>
            {/* Month label */}
            <text x={p.x} y={H + 14} textAnchor="middle" fill="var(--text2)" fontSize={10} fontFamily="inherit">{p.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 6. LitersTrendBars ───────────────────────────────────────────────────────
// 6-month milk liters bar chart (teal-blue).
// data: [{ month:'मार्च', liters:number }]
export function LitersTrendBars({ data }) {
  if (!data || data.length === 0) return null
  const W = 360, H = 90, BOTTOM = 20
  const slotW  = W / data.length
  const barW   = slotW * 0.65
  const maxL   = Math.max(...data.map(d => d.liters), 0.1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + BOTTOM}`} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines at 50% */}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      {/* Baseline */}
      <line x1={0} y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth={1} />

      {data.map((d, i) => {
        const barH = d.liters > 0 ? Math.max((d.liters / maxL) * H, 4) : 0
        const barX = i * slotW + (slotW - barW) / 2
        const barY = H - barH
        return (
          <g key={i}>
            {/* Bar with gradient feel via two rects */}
            <rect x={barX} y={barY} width={barW} height={barH} rx={4} fill="#06b6d4" opacity={0.85} />
            {/* Value label */}
            {d.liters > 0 && (
              <text x={barX + barW / 2} y={barY - 4} textAnchor="middle" fill="#06b6d4" fontSize={9} fontWeight={700} fontFamily="inherit">
                {d.liters >= 1000 ? (d.liters / 1000).toFixed(1) + 'k' : d.liters.toFixed(0)}
              </text>
            )}
            {/* Month label */}
            <text x={barX + barW / 2} y={H + 14} textAnchor="middle" fill="var(--text2)" fontSize={10} fontFamily="inherit">{d.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 7. StatusDistBar ─────────────────────────────────────────────────────────
// 3-segment horizontal bar for customer status distribution.
export function StatusDistBar({ active, paused, stopped }) {
  const total = active + paused + stopped || 1
  const segments = [
    { label:'सक्रिय',  count:active,  color:'#10b981', pct:(active/total)*100 },
    { label:'थांबले',  count:paused,  color:'#f59e0b', pct:(paused/total)*100 },
    { label:'बंद',     count:stopped, color:'#ef4444', pct:(stopped/total)*100 },
  ].filter(s => s.count > 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {/* Segmented bar */}
      <div style={{ display:'flex', height:10, borderRadius:20, overflow:'hidden', gap:2 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ width:`${s.pct}%`, background:s.color, borderRadius: i===0?'20px 0 0 20px':i===segments.length-1?'0 20px 20px 0':0 }} />
        ))}
      </div>
      {/* Pills */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }} />
            <span style={{ fontSize:12, color:'var(--text2)' }}>{s.label}</span>
            <span style={{ fontSize:12, fontWeight:800, color:'var(--text)' }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

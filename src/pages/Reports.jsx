import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import { formatCurrency, getMonthYear, todayStr } from '../utils.js'
import db from '../db/database.js'
import {
  DeliveryRing, MiniTrendBars,
  MonthlyDayBars, PaymentModeDonut,
  EfficiencyLine, LitersTrendBars,
  StatusDistBar,
} from './ReportsCharts.jsx'

const MR_MONTHS = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']
const MR_SHORT  = ['जाने','फेब्रु','मार्च','एप्रि','मे','जून','जुलै','ऑग','सप्टे','ऑक्टो','नोव्हे','डिसे']
const TABS = ['आजचा', 'मासिक', 'ग्राहक', 'तक्ता']

function monthRange(month, year) {
  const mm  = String(month).padStart(2, '0')
  const end = new Date(year, month, 0).getDate()
  return { sd: `${year}-${mm}-01`, ed: `${year}-${mm}-${String(end).padStart(2,'0')}` }
}

function prevMonthYear(month, year) {
  return month === 1 ? { pm: 12, py: year - 1 } : { pm: month - 1, py: year }
}

// ── sub-components ────────────────────────────────────────────────────────────
function StatRow({ label, value, color = 'var(--text)', sub, delta }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:11 }}>
      <div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>{sub}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
        {delta != null && delta !== 0 && (
          <span style={{
            fontSize:10, fontWeight:800, padding:'2px 6px', borderRadius:10,
            background: delta > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: delta > 0 ? '#10b981' : '#ef4444',
          }}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        <span style={{ fontSize:15, fontWeight:800, color }}>{value}</span>
      </div>
    </div>
  )
}

function SectionCard({ title, children, noPad }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
      {title && (
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
          {title}
        </div>
      )}
      <div style={noPad ? {} : { padding:'12px 14px' }}>
        {children}
      </div>
    </div>
  )
}

function EfficiencyBar({ billed, collected }) {
  const pct   = billed > 0 ? Math.min(100, (collected / billed) * 100) : 0
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>वसुली कार्यक्षमता</span>
        <span style={{ fontSize:20, fontWeight:900, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height:10, background:'var(--surface2)', borderRadius:20, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:20, transition:'width 0.6s ease' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:12, color:'var(--text2)' }}>
        <span>बिल: <strong style={{ color:'var(--text)' }}>{formatCurrency(billed)}</strong></span>
        <span>जमा: <strong style={{ color }}>{formatCurrency(collected)}</strong></span>
        <span>बाकी: <strong style={{ color:'var(--red)' }}>{formatCurrency(Math.max(0, billed - collected))}</strong></span>
      </div>
    </div>
  )
}

function TabLoader() {
  return <div className="loading"><span className="spinner" /> लोड होत आहे...</div>
}

// ── fill 7-day trend array (fill missing dates with qty:0) ────────────────────
function fill7DayArray(rows) {
  const map = {}
  for (const r of rows) map[r.date] = r.qty || 0
  const result = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    result.push({ date: key, qty: map[key] || 0 })
  }
  return result
}

// ── per-tab SQL loaders ───────────────────────────────────────────────────────

async function loadTodayData() {
  const today = todayStr()
  const [
    sessionStats, totalActive, todayCollect, productStats, pendingCusts,
    weekTrend, weekCollect,
  ] = await Promise.all([
    db.query(`
      SELECT d.session,
             SUM(CASE WHEN d.status IN ('delivered','partial') THEN d.qty ELSE 0 END) as delivered_qty,
             COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_count
      FROM deliveries d WHERE d.date = ? GROUP BY d.session
    `, [today]),
    db.query(`SELECT COUNT(*) as cnt FROM customers WHERE status = 'active'`),
    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date = ?`, [today]),
    db.query(`
      SELECT COALESCE(p.name,'दूध') as name, COALESCE(p.unit,'L') as unit, COALESCE(p.type,'milk') as type,
             SUM(d.qty) as qty
      FROM deliveries d LEFT JOIN products p ON p.id = d.product_id
      WHERE d.date = ? AND d.status IN ('delivered','partial') GROUP BY d.product_id
    `, [today]),
    db.query(`
      SELECT DISTINCT c.name FROM deliveries d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.date = ? AND d.status = 'pending' ORDER BY c.name
    `, [today]),
    // 7-day delivery trend
    db.query(`
      SELECT date, SUM(CASE WHEN status IN ('delivered','partial') THEN qty ELSE 0 END) as qty
      FROM deliveries WHERE date >= date('now','-6 days') AND date <= date('now')
      GROUP BY date ORDER BY date
    `),
    // 7-day payment total
    db.query(`
      SELECT COALESCE(SUM(amount),0) as total FROM payments
      WHERE date >= date('now','-6 days') AND date <= date('now')
    `),
  ])

  const morning = sessionStats.find(r => r.session === 'morning') || { delivered_qty: 0, pending_count: 0 }
  const evening = sessionStats.find(r => r.session === 'evening') || { delivered_qty: 0, pending_count: 0 }

  const servedRow = await db.query(`
    SELECT COUNT(DISTINCT customer_id) as cnt
    FROM deliveries WHERE date = ? AND status IN ('delivered','partial')
  `, [today])

  const totalLiters  = (morning.delivered_qty || 0) + (evening.delivered_qty || 0)
  const todayCollectAmt = todayCollect[0]?.total || 0
  const week7Liters  = (weekTrend || []).reduce((s, r) => s + (r.qty || 0), 0)

  return {
    mlDelivered:  morning.delivered_qty || 0,
    elDelivered:  evening.delivered_qty || 0,
    mlPending:    morning.pending_count || 0,
    elPending:    evening.pending_count || 0,
    totalLiters,
    servedCusts:  servedRow[0]?.cnt || 0,
    totalActive:  totalActive[0]?.cnt || 0,
    todayCollect: todayCollectAmt,
    todayByProd:  productStats,
    pendingCusts: pendingCusts.map(r => r.name),
    weekTrend:    fill7DayArray(weekTrend || []),
    weekCollect:  weekCollect[0]?.total || 0,
    week7Liters,
    avgRate:      totalLiters > 0 && todayCollectAmt > 0 ? todayCollectAmt / totalLiters : 0,
  }
}

async function loadMonthlyData(month, year) {
  const { sd, ed } = monthRange(month, year)
  const { pm, py } = prevMonthYear(month, year)
  const { sd: psd, ed: ped } = monthRange(pm, py)

  const [
    milkQty, activeDays, billTotals, collected, productRevenue, topCusts,
    dayBars, payModes, prevBilled, prevCollect,
  ] = await Promise.all([
    db.query(`
      SELECT COALESCE(SUM(d.qty),0) as total FROM deliveries d
      JOIN products p ON p.id = d.product_id
      WHERE d.date >= ? AND d.date <= ? AND d.status IN ('delivered','partial') AND p.unit = 'L'
    `, [sd, ed]),
    db.query(`
      SELECT COUNT(DISTINCT date) as cnt FROM deliveries
      WHERE date >= ? AND date <= ? AND status IN ('delivered','partial')
    `, [sd, ed]),
    db.query(`
      SELECT COALESCE(SUM(total_amount),0) as billed, COUNT(*) as bill_count
      FROM monthly_bills WHERE month = ? AND year = ?
    `, [month, year]),
    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date >= ? AND date <= ?`, [sd, ed]),
    db.query(`
      SELECT p.name, p.unit, p.type,
             COALESCE(SUM(bi.amount),0) as revenue, COALESCE(SUM(bi.qty),0) as qty
      FROM bill_items bi
      JOIN monthly_bills mb ON mb.id = bi.bill_id
      JOIN products p ON p.id = bi.product_id
      WHERE mb.month = ? AND mb.year = ?
      GROUP BY p.id ORDER BY revenue DESC
    `, [month, year]),
    db.query(`
      SELECT c.name, mb.total_amount as amount FROM monthly_bills mb
      JOIN customers c ON c.id = mb.customer_id
      WHERE mb.month = ? AND mb.year = ?
      ORDER BY mb.total_amount DESC LIMIT 5
    `, [month, year]),
    // day-by-day deliveries
    db.query(`
      SELECT CAST(strftime('%d', date) AS INTEGER) as day,
             SUM(CASE WHEN status IN ('delivered','partial') THEN qty ELSE 0 END) as qty,
             COUNT(CASE WHEN status = 'partial' THEN 1 END) as partial_count
      FROM deliveries WHERE date >= ? AND date <= ?
      GROUP BY date ORDER BY date
    `, [sd, ed]),
    // payment mode breakdown
    db.query(`
      SELECT mode, COALESCE(SUM(amount),0) as total
      FROM payments WHERE date >= ? AND date <= ?
      GROUP BY mode ORDER BY total DESC
    `, [sd, ed]),
    // prev month billed
    db.query(`SELECT COALESCE(SUM(total_amount),0) as billed FROM monthly_bills WHERE month = ? AND year = ?`, [pm, py]),
    // prev month collected
    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date >= ? AND date <= ?`, [psd, ped]),
  ])

  const totalBilled   = billTotals[0]?.billed    || 0
  const totalCollect  = collected[0]?.total       || 0
  const totalLiters   = milkQty[0]?.total         || 0
  const activeDaysCnt = activeDays[0]?.cnt        || 0
  const billCount     = billTotals[0]?.bill_count || 0
  const prevBilledAmt = prevBilled[0]?.billed     || 0
  const prevCollectAmt= prevCollect[0]?.total     || 0

  // MoM deltas (% change vs prev month)
  const momBilled   = prevBilledAmt  > 0 ? ((totalBilled  - prevBilledAmt)  / prevBilledAmt)  * 100 : null
  const momCollect  = prevCollectAmt > 0 ? ((totalCollect - prevCollectAmt) / prevCollectAmt) * 100 : null
  const momLiters   = null // would need prev month liters query; skip for now

  const daysInMonth = new Date(year, month, 0).getDate()

  return {
    totalLiters, totalBilled, totalCollect,
    totalOut:    Math.max(0, totalBilled - totalCollect),
    activeDays:  activeDaysCnt,
    avgPerDay:   activeDaysCnt > 0 ? totalLiters / activeDaysCnt : 0,
    avgCustValue: billCount > 0 ? totalBilled / billCount : 0,
    monthByProd: productRevenue,
    topCusts,
    dayBars:     (dayBars || []).map(r => ({ day: r.day, qty: r.qty || 0, hasPartial: (r.partial_count || 0) > 0 })),
    daysInMonth,
    payModes:    payModes || [],
    momBilled, momCollect,
  }
}

async function loadCustomerReport() {
  return db.query(`
    SELECT c.id, c.name, c.status, c.mobile,
           ar.name as area, pr.name as prodName,
           COALESCE(SUM(mb.total_amount),0) as billed,
           COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id),0) as paid,
           COUNT(DISTINCT mb.id) as bill_months
    FROM customers c
    LEFT JOIN areas ar ON ar.id = c.area_id
    LEFT JOIN products pr ON pr.id = c.product_id
    LEFT JOIN monthly_bills mb ON mb.customer_id = c.id
    GROUP BY c.id
    ORDER BY (COALESCE(SUM(mb.total_amount),0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id),0)) DESC
  `)
}

async function loadChartData(month, year) {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(year, month - 1 - i, 1)
    const cm = d.getMonth() + 1
    const cy = d.getFullYear()
    months.push({ cm, cy, label: MR_SHORT[cm - 1], fullMonth: MR_MONTHS[cm - 1] })
  }

  // 6-month window bounds
  const first = months[0], last = months[months.length - 1]
  const windowStart = `${first.cy}-${String(first.cm).padStart(2,'0')}-01`
  const windowEnd   = (() => { const end = new Date(last.cy, last.cm, 0); return end.toISOString().split('T')[0] })()

  const [bills, pays, litersRows, payModes6m] = await Promise.all([
    db.query(`SELECT month, year, SUM(total_amount) as billed FROM monthly_bills GROUP BY month, year`),
    db.query(`SELECT strftime('%Y-%m', date) as ym, SUM(amount) as collected FROM payments WHERE date IS NOT NULL GROUP BY ym`),
    // 6-month liters trend
    db.query(`
      SELECT strftime('%Y-%m', date) as ym, COALESCE(SUM(qty),0) as liters
      FROM deliveries WHERE status IN ('delivered','partial') AND date >= ? AND date <= ?
      GROUP BY ym ORDER BY ym
    `, [windowStart, windowEnd]),
    // 6-month payment mode breakdown
    db.query(`
      SELECT mode, COALESCE(SUM(amount),0) as total
      FROM payments WHERE date >= ? AND date <= ? GROUP BY mode ORDER BY total DESC
    `, [windowStart, windowEnd]),
  ])

  const billMap = {}
  for (const b of bills) billMap[`${b.year}-${b.month}`] = b.billed || 0
  const payMap = {}
  for (const p of pays) payMap[p.ym] = p.collected || 0
  const litersMap = {}
  for (const l of litersRows) litersMap[l.ym] = l.liters || 0

  const chartData = months.map(m => {
    const ym = `${m.cy}-${String(m.cm).padStart(2,'0')}`
    return {
      month:     m.label,
      fullMonth: m.fullMonth,
      billed:    billMap[`${m.cy}-${m.cm}`] || 0,
      collected: payMap[ym] || 0,
      liters:    litersMap[ym] || 0,
    }
  })

  return { chartData, payModes6m: payModes6m || [] }
}

// ── main component ────────────────────────────────────────────────────────────
export default function Reports() {
  const navigate = useNavigate()
  const { month, year } = getMonthYear()
  const [tab,      setTab]      = useState(0)
  const [selMonth, setSelMonth] = useState(month)
  const [selYear,  setSelYear]  = useState(year)

  const [daily,      setDaily]      = useState(null)
  const [monthly,    setMonthly]    = useState(null)
  const [custReport, setCustReport] = useState(null)
  const [chartInfo,  setChartInfo]  = useState(null)   // { chartData, payModes6m }
  const [loadingTab, setLoadingTab] = useState(-1)

  // Customer tab UI state
  const [openTier,    setOpenTier]    = useState('C')
  const [openArea,    setOpenArea]    = useState(false)
  const [custSearch,  setCustSearch]  = useState('')

  const loaded = useRef({ daily: null, monthly: null, cust: false, chart: null })

  const loadTab = useCallback(async (t, force = false) => {
    setLoadingTab(t)
    try {
      if (t === 0) {
        if (!force && loaded.current.daily === todayStr()) return
        setDaily(await loadTodayData())
        loaded.current.daily = todayStr()
      } else if (t === 1) {
        const key = `${selMonth}-${selYear}`
        if (!force && loaded.current.monthly === key) return
        setMonthly(await loadMonthlyData(selMonth, selYear))
        loaded.current.monthly = key
      } else if (t === 2) {
        if (!force && loaded.current.cust) return
        setCustReport(await loadCustomerReport())
        loaded.current.cust = true
      } else if (t === 3) {
        const key = `${selMonth}-${selYear}`
        if (!force && loaded.current.chart === key) return
        setChartInfo(await loadChartData(selMonth, selYear))
        loaded.current.chart = key
      }
    } finally {
      setLoadingTab(-1)
    }
  }, [selMonth, selYear])

  useEffect(() => { loadTab(tab) }, [tab, selMonth, selYear, loadTab])

  const handleRefresh = useCallback(() => {
    loaded.current = { daily: null, monthly: null, cust: false, chart: null }
    loadTab(tab, true)
  }, [tab, loadTab])

  const { containerRef, indicator: refreshIndicator } = usePullToRefresh(handleRefresh)
  const isLoading = loadingTab === tab

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-root">
      <Header title="अहवाल" icon="📊" subtitle="उत्पन्न, डिलिव्हरी व थकबाकी विश्लेषण" onBack={() => navigate('/more')} />

      <div style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg)', padding:'10px 16px 0', borderBottom:'1px solid var(--border)' }}>
        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={i} className={`tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
      </div>

      <div ref={containerRef} style={{ flex:1, padding:'12px 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {refreshIndicator}

        {/* ══ TAB 0 — TODAY ══════════════════════════════════════════════════ */}
        {tab === 0 && (isLoading ? <TabLoader /> : daily ? (
          <>
            {/* Date + Delivery Ring */}
            <SectionCard>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <DeliveryRing served={daily.servedCusts} total={daily.totalActive} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>
                    {new Date().toLocaleDateString('mr-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                  </div>
                  {/* Milk hero */}
                  <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>🥛 एकूण दूध</div>
                  <div style={{ fontSize:28, fontWeight:900, color:'#10b981', lineHeight:1 }}>
                    {daily.totalLiters.toFixed(1)}<span style={{ fontSize:14, fontWeight:600, marginLeft:4 }}>L</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>☀️ {daily.mlDelivered.toFixed(1)}L &nbsp;🌙 {daily.elDelivered.toFixed(1)}L</div>
                </div>
              </div>
            </SectionCard>

            {/* Session breakdown with horizontal bars */}
            <SectionCard title="सत्र स्थिती">
              {[
                { label:'☀️ सकाळ',      liters:daily.mlDelivered, pending:daily.mlPending, color:'#f59e0b' },
                { label:'🌙 संध्याकाळ', liters:daily.elDelivered, pending:daily.elPending, color:'#8b5cf6' },
              ].map((s, i) => {
                const maxL = Math.max(daily.mlDelivered, daily.elDelivered, 0.1)
                const pct  = (s.liters / maxL) * 100
                return (
                  <div key={i} style={{ marginBottom: i === 0 ? 12 : 0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{s.label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {s.pending > 0
                          ? <span style={{ fontSize:11, color:'var(--red)', background:'rgba(239,68,68,0.1)', borderRadius:20, padding:'2px 8px' }}>⏳ {s.pending} बाकी</span>
                          : <span style={{ fontSize:11, color:'var(--green)' }}>✓ पूर्ण</span>}
                        <span style={{ fontSize:15, fontWeight:800, color:s.color }}>{s.liters.toFixed(1)} L</span>
                      </div>
                    </div>
                    <div style={{ height:7, background:'var(--surface2)', borderRadius:20, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:s.color, borderRadius:20, transition:'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </SectionCard>

            {/* 4 Stat tiles */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { icon:'💰', label:'आजची वसुली',    value:formatCurrency(daily.todayCollect), color:'#f59e0b' },
                { icon:'⏳', label:'बाकी ग्राहक',   value:`${daily.mlPending + daily.elPending}`, color: (daily.mlPending + daily.elPending) > 0 ? 'var(--red)' : 'var(--green)' },
                { icon:'📅', label:'७ दिवसांचे दूध', value:`${daily.week7Liters.toFixed(1)} L`,   color:'#06b6d4' },
                { icon:'🏦', label:'७ दिवसांची वसुली', value:formatCurrency(daily.weekCollect),  color:'#10b981' },
              ].map((t, i) => (
                <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px' }}>
                  <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{t.icon} {t.label}</div>
                  <div style={{ fontSize:18, fontWeight:900, color:t.color }}>{t.value}</div>
                </div>
              ))}
            </div>

            {/* 7-day trend */}
            <SectionCard title="📈 ७ दिवसांचा डिलिव्हरी कल">
              <MiniTrendBars data={daily.weekTrend} />
            </SectionCard>

            {/* Product-wise today */}
            {daily.todayByProd.length > 0 && (
              <SectionCard title="📦 उत्पादननिहाय आज">
                {daily.todayByProd.map((p, i) => {
                  const color = p.type === 'milk_buffalo' ? '#8b5cf6' : p.type === 'milk_cow' ? '#f59e0b' : '#06b6d4'
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom: i < daily.todayByProd.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize:13, color:'var(--text)' }}>{p.name}</span>
                      <span style={{ fontSize:13, fontWeight:700, color }}>{Number(p.qty).toFixed(2)} {p.unit}</span>
                    </div>
                  )
                })}
              </SectionCard>
            )}

            {/* Pending customers */}
            {daily.pendingCusts.length > 0 && (
              <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:12, padding:'12px 14px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>⏳ बाकी ग्राहक ({daily.pendingCusts.length})</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {daily.pendingCusts.map((n, i) => (
                    <span key={i} style={{ background:'rgba(239,68,68,0.12)', color:'var(--red)', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:600 }}>{n}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null)}

        {/* ══ TAB 1 — MONTHLY ════════════════════════════════════════════════ */}
        {tab === 1 && (
          <>
            <div style={{ display:'flex', gap:8 }}>
              <BottomPicker className="form-input" style={{ flex:1 }}
                options={MR_MONTHS.map((name, i) => ({ label:name, value:i+1 }))}
                value={selMonth} onChange={val => setSelMonth(parseInt(val))} />
              <BottomPicker className="form-input" style={{ width:90 }}
                options={[year-1, year, year+1].map(y => ({ label:String(y), value:y }))}
                value={selYear} onChange={val => setSelYear(parseInt(val))} />
            </div>

            {isLoading ? <TabLoader /> : monthly ? (
              <>
                <EfficiencyBar billed={monthly.totalBilled} collected={monthly.totalCollect} />

                {/* Day-by-day delivery bars */}
                <SectionCard title="📅 दैनिक डिलिव्हरी">
                  <div style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                      {[{color:'#10b981',label:'डिलिव्हर'},{color:'#f59e0b',label:'अंशतः'},{color:'var(--surface2)',label:'नाही'}].map((l,i)=>(
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <div style={{ width:10, height:10, borderRadius:2, background:l.color }}/>
                          <span style={{ fontSize:10, color:'var(--text2)' }}>{l.label}</span>
                        </div>
                      ))}
                    </div>
                    <MonthlyDayBars data={monthly.dayBars} daysInMonth={monthly.daysInMonth} />
                  </div>
                </SectionCard>

                <StatRow label="🥛 एकूण लिटर (दूध)"   value={`${monthly.totalLiters.toFixed(1)} L`}       color="var(--green)" />
                <StatRow label="📅 सक्रिय दिवस"        value={`${monthly.activeDays} दिवस`}                color="#3b82f6" />
                <StatRow label="📊 दैनिक सरासरी"       value={`${monthly.avgPerDay.toFixed(1)} L/दिवस`}    color="#8b5cf6" />
                <StatRow label="🧾 एकूण बिल रक्कम"     value={formatCurrency(monthly.totalBilled)}          color="var(--text)"  delta={monthly.momBilled} />
                <StatRow label="✅ जमा झाले"            value={formatCurrency(monthly.totalCollect)}         color="var(--green)" delta={monthly.momCollect} />
                <StatRow label="⚠️ बाकी थकबाकी"        value={formatCurrency(monthly.totalOut)}             color={monthly.totalOut > 0 ? 'var(--red)' : 'var(--green)'} />
                <StatRow label="👤 सरासरी ग्राहक मूल्य" value={formatCurrency(monthly.avgCustValue)}        color="#f59e0b" />

                {monthly.monthByProd.length > 0 && (
                  <SectionCard title="📦 उत्पादननिहाय महसूल" noPad>
                    {monthly.monthByProd.map((p, i) => {
                      const color = p.type === 'milk_buffalo' ? '#8b5cf6' : p.type === 'milk_cow' ? '#f59e0b' : '#06b6d4'
                      const pct   = monthly.totalBilled > 0 ? (p.revenue / monthly.totalBilled) * 100 : 0
                      return (
                        <div key={i} style={{ padding:'10px 14px', borderBottom: i < monthly.monthByProd.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                            <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{p.name}</span>
                            <div style={{ textAlign:'right' }}>
                              <span style={{ fontSize:13, fontWeight:800, color }}>{formatCurrency(p.revenue)}</span>
                              <span style={{ fontSize:11, color:'var(--text2)', marginLeft:6 }}>{Number(p.qty).toFixed(2)} {p.unit}</span>
                            </div>
                          </div>
                          <div style={{ height:5, background:'var(--surface2)', borderRadius:10 }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:10 }} />
                          </div>
                        </div>
                      )
                    })}
                  </SectionCard>
                )}

                {/* Payment mode donut */}
                {monthly.payModes.length > 0 && (
                  <SectionCard title="💳 पेमेंट पद्धत">
                    <div style={{ display:'flex', justifyContent:'center' }}>
                      <PaymentModeDonut modes={monthly.payModes} />
                    </div>
                  </SectionCard>
                )}

                {monthly.topCusts.length > 0 && (
                  <SectionCard title="🏆 शीर्ष ग्राहक (बिलानुसार)" noPad>
                    {monthly.topCusts.map((c, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < monthly.topCusts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ width:26, height:26, borderRadius:8, background: i===0 ? 'rgba(251,191,36,0.2)' : 'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color: i===0 ? '#fbbf24' : 'var(--text2)' }}>
                          {i + 1}
                        </div>
                        <span style={{ flex:1, fontSize:13, color:'var(--text)', fontWeight:600 }}>{c.name}</span>
                        <span style={{ fontSize:13, fontWeight:800, color:'var(--accent)' }}>{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </SectionCard>
                )}

                {monthly.totalBilled > 0 && (
                  <button
                    onClick={() => {
                      const lines = [
                        `📊 *मासिक अहवाल — ${MR_MONTHS[selMonth-1]} ${selYear}*`,
                        `━━━━━━━━━━━━━━━━━━`,
                        `🥛 एकूण दूध: ${monthly.totalLiters.toFixed(1)} L`,
                        `📅 सक्रिय दिवस: ${monthly.activeDays}`,
                        `📊 दैनिक सरासरी: ${monthly.avgPerDay.toFixed(1)} L/दिवस`,
                        ``,
                        `🧾 एकूण बिल: ₹${monthly.totalBilled.toFixed(0)}`,
                        `✅ जमा: ₹${monthly.totalCollect.toFixed(0)}`,
                        `⚠️ बाकी थकबाकी: ₹${monthly.totalOut.toFixed(0)}`,
                        ``,
                        `वसुली: ${monthly.totalBilled > 0 ? ((monthly.totalCollect/monthly.totalBilled)*100).toFixed(1) : 0}%`,
                      ].join('\n')
                      if (navigator.share) navigator.share({ title:`अहवाल ${MR_MONTHS[selMonth-1]} ${selYear}`, text:lines }).catch(()=>{})
                      else navigator.clipboard?.writeText(lines)
                    }}
                    style={{ width:'100%', padding:'12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, cursor:'pointer', color:'var(--accent)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    मासिक सारांश शेअर करा
                  </button>
                )}

                {monthly.totalBilled === 0 && (
                  <div className="empty">
                    <div className="empty-icon">📋</div>
                    <div className="empty-title">या महिन्याचे बिल नाही</div>
                    <div className="empty-desc">बिल बनवल्यानंतर इथे दिसेल</div>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}

        {/* ══ TAB 2 — CUSTOMERS ══════════════════════════════════════════════ */}
        {tab === 2 && (isLoading ? <TabLoader /> : custReport ? (() => {
          const active  = custReport.filter(c => c.status === 'active').length
          const paused  = custReport.filter(c => c.status === 'paused').length
          const stopped = custReport.filter(c => c.status === 'stopped').length

          // Customer health tiers
          const tierA = custReport.filter(c => { const pct = c.billed > 0 ? c.paid / c.billed * 100 : 100; return pct >= 90 })
          const tierB = custReport.filter(c => { const pct = c.billed > 0 ? c.paid / c.billed * 100 : 100; return pct >= 60 && pct < 90 })
          const tierC = custReport.filter(c => { const pct = c.billed > 0 ? c.paid / c.billed * 100 : 100; return pct < 60 })

          // Area-wise grouping
          const areaMap = {}
          for (const c of custReport) {
            const a = c.area || 'इतर'
            if (!areaMap[a]) areaMap[a] = { count:0, billed:0, outstanding:0 }
            areaMap[a].count++
            areaMap[a].billed += c.billed || 0
            areaMap[a].outstanding += Math.max(0, (c.billed || 0) - (c.paid || 0))
          }
          const areas = Object.entries(areaMap).sort((a, b) => b[1].outstanding - a[1].outstanding)
          const maxAreaBilled = Math.max(...areas.map(([,v]) => v.billed), 1)

          const TIERS = [
            { key:'A', label:'🟢 उत्तम (≥90% जमा)', color:'#10b981', bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.25)', data:tierA },
            { key:'B', label:'🟡 ठीक (60–89% जमा)', color:'#f59e0b', bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.25)',  data:tierB },
            { key:'C', label:'🔴 जोखीम (<60% जमा)',  color:'#ef4444', bg:'rgba(239,68,68,0.08)',   border:'rgba(239,68,68,0.25)',   data:tierC },
          ]

          const searchLower = custSearch.toLowerCase()

          return (
            <>
              {/* Status distribution */}
              <SectionCard title={`👥 ग्राहक स्थिती — एकूण ${custReport.length}`}>
                <StatusDistBar active={active} paused={paused} stopped={stopped} />
              </SectionCard>

              {/* Area-wise analysis */}
              {areas.length > 1 && (
                <SectionCard noPad>
                  <button
                    onClick={() => setOpenArea(v => !v)}
                    style={{ width:'100%', padding:'11px 14px', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                  >
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px' }}>📍 क्षेत्रनिहाय विश्लेषण</span>
                    <span style={{ fontSize:12, color:'var(--text2)' }}>{openArea ? '▲' : '▼'}</span>
                  </button>
                  {openArea && (
                    <div style={{ borderTop:'1px solid var(--border)', padding:'10px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                      {areas.map(([aName, av], i) => {
                        const pct = (av.billed / maxAreaBilled) * 100
                        return (
                          <div key={i}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <div>
                                <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{aName}</span>
                                <span style={{ fontSize:11, color:'var(--text2)', marginLeft:6 }}>{av.count} ग्राहक</span>
                              </div>
                              <div style={{ textAlign:'right' }}>
                                <span style={{ fontSize:12, fontWeight:800, color:'var(--text)' }}>{formatCurrency(av.billed)}</span>
                                {av.outstanding > 0 && <span style={{ fontSize:11, color:'var(--red)', marginLeft:6 }}>बाकी {formatCurrency(av.outstanding)}</span>}
                              </div>
                            </div>
                            <div style={{ height:5, background:'var(--surface2)', borderRadius:10 }}>
                              <div style={{ height:'100%', width:`${pct}%`, background:'var(--accent)', borderRadius:10 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Search */}
              <input
                className="form-input"
                placeholder="🔍 ग्राहक शोधा..."
                value={custSearch}
                onChange={e => setCustSearch(e.target.value)}
                style={{ fontSize:13 }}
              />

              {/* Tier accordions */}
              {TIERS.map(tier => {
                const filtered = custSearch
                  ? tier.data.filter(c => c.name.toLowerCase().includes(searchLower))
                  : tier.data
                if (filtered.length === 0 && !custSearch) return null
                const isOpen = openTier === tier.key || !!custSearch
                return (
                  <div key={tier.key} style={{ border:`1px solid ${tier.border}`, borderRadius:14, overflow:'hidden', background:tier.bg }}>
                    <button
                      onClick={() => setOpenTier(k => k === tier.key ? '' : tier.key)}
                      style={{ width:'100%', padding:'12px 14px', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                    >
                      <span style={{ fontSize:13, fontWeight:700, color:tier.color }}>{tier.label}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ background:tier.color, color:'#fff', borderRadius:20, fontSize:11, fontWeight:800, padding:'2px 8px' }}>{filtered.length}</span>
                        <span style={{ fontSize:12, color:'var(--text2)' }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isOpen && filtered.map(c => {
                      const outstanding = Math.max(0, (c.billed || 0) - (c.paid || 0))
                      const pct   = c.billed > 0 ? Math.min(100, (c.paid / c.billed) * 100) : 100
                      const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? '#f59e0b' : 'var(--red)'
                      const badge = c.status === 'active' ? 'badge-green' : c.status === 'paused' ? 'badge-yellow' : 'badge-red'
                      const statusLabel = c.status === 'active' ? 'सक्रिय' : c.status === 'paused' ? 'थांबले' : 'बंद'
                      return (
                        <div key={c.id}
                          style={{ background:'var(--surface)', borderTop:'1px solid var(--border)', padding:14, cursor:'pointer' }}
                          onClick={() => navigate(`/customers/${c.id}`)}
                        >
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                            <div>
                              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{c.name}</span>
                                <span className={`badge ${badge}`}>{statusLabel}</span>
                                {c.bill_months > 0 && (
                                  <span style={{ fontSize:10, color:'var(--text2)', background:'var(--surface2)', borderRadius:20, padding:'1px 7px' }}>{c.bill_months} महिने</span>
                                )}
                              </div>
                              <div style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>{c.area} • {c.prodName}</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              {outstanding > 0
                                ? <div style={{ fontSize:16, fontWeight:900, color:'var(--red)' }}>{formatCurrency(outstanding)}</div>
                                : <div style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>✓ क्लिअर</div>}
                              <div style={{ fontSize:10, color:'var(--text2)', marginTop:2 }}>थकबाकी</div>
                            </div>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
                            <div style={{ background:'var(--surface2)', borderRadius:8, padding:'6px 10px' }}>
                              <div style={{ fontSize:10, color:'var(--text2)' }}>एकूण बिल</div>
                              <div style={{ fontSize:13, fontWeight:800, color:'var(--text)' }}>{formatCurrency(c.billed)}</div>
                            </div>
                            <div style={{ background:'var(--surface2)', borderRadius:8, padding:'6px 10px' }}>
                              <div style={{ fontSize:10, color:'var(--text2)' }}>एकूण जमा</div>
                              <div style={{ fontSize:13, fontWeight:800, color:'var(--green)' }}>{formatCurrency(c.paid)}</div>
                            </div>
                          </div>
                          {c.billed > 0 && (
                            <div>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                                <span style={{ fontSize:11, color:'var(--text2)' }}>वसुली</span>
                                <span style={{ fontSize:11, fontWeight:700, color }}>{pct.toFixed(0)}%</span>
                              </div>
                              <div style={{ height:5, background:'var(--surface2)', borderRadius:10 }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:10, transition:'width 0.5s ease' }} />
                              </div>
                            </div>
                          )}
                          {c.billed === 0 && <div style={{ fontSize:12, color:'var(--text2)', textAlign:'center' }}>अद्याप बिल नाही</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )
        })() : null)}

        {/* ══ TAB 3 — CHARTS ═════════════════════════════════════════════════ */}
        {tab === 3 && (isLoading ? <TabLoader /> : chartInfo ? (() => {
          const { chartData, payModes6m } = chartInfo
          const totalBilled6m   = chartData.reduce((s, d) => s + d.billed, 0)
          const totalCollect6m  = chartData.reduce((s, d) => s + d.collected, 0)
          const avgEfficiency   = chartData.filter(d => d.billed > 0).length > 0
            ? chartData.filter(d => d.billed > 0).reduce((s, d) => s + (d.collected / d.billed) * 100, 0) / chartData.filter(d => d.billed > 0).length
            : 0
          const bestMonth = chartData.reduce((best, d) => d.billed > best.billed ? d : best, chartData[0] || { billed:0, fullMonth:'—' })

          // MoM growth
          const momBadges = chartData.map((d, i) => {
            if (i === 0) return { ...d, mom: null }
            const prev = chartData[i - 1]
            const mom  = prev.billed > 0 ? ((d.billed - prev.billed) / prev.billed) * 100 : null
            return { ...d, mom }
          })

          // Best growth month
          const bestGrowth = momBadges.filter(m => m.mom != null).reduce((best, m) => m.mom > (best?.mom ?? -Infinity) ? m : best, null)

          return (
            <>
              {/* Revenue chart */}
              <SectionCard title="📊 महसूल तुलना (बिल vs वसुली — ६ महिने)">
                <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                  {[{ color:'#8b5cf6', label:'बिल' }, { color:'#10b981', label:'वसुली' }, { color:'rgba(239,68,68,0.4)', label:'थकबाकी' }].map((l, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:l.color }} />
                      <span style={{ fontSize:11, color:'var(--text2)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
                {/* Upgraded DualBarChart inline */}
                {(() => {
                  const data   = chartData
                  const maxVal = Math.max(...data.flatMap(d => [d.billed, d.collected]), 1)
                  const W = 70, H = 150, BAR = 26, GAP = 4, BOTTOM = 30
                  const gridPcts = [0.25, 0.5, 0.75]
                  return (
                    <svg width="100%" height={H + BOTTOM} viewBox={`0 0 ${data.length * W} ${H + BOTTOM}`} preserveAspectRatio="xMidYMid meet">
                      {/* Grid lines */}
                      {gridPcts.map((p, i) => (
                        <line key={i} x1={0} y1={H - p * H} x2={data.length * W} y2={H - p * H} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
                      ))}
                      {/* Baseline */}
                      <line x1={0} y1={H} x2={data.length * W} y2={H} stroke="var(--border)" strokeWidth={1} />

                      {data.map((d, i) => {
                        const billedH    = maxVal > 0 ? (d.billed    / maxVal) * H : 0
                        const collectedH = maxVal > 0 ? (d.collected / maxVal) * H : 0
                        const xBase      = i * W + (W - BAR * 2 - GAP) / 2
                        const outstandingH = Math.max(0, billedH - collectedH)
                        return (
                          <g key={i}>
                            <rect x={xBase} y={H - billedH} width={BAR} height={billedH} rx={4} fill="rgba(139,92,246,0.35)" />
                            <rect x={xBase} y={H - collectedH} width={BAR} height={collectedH} rx={4} fill="#8b5cf6" />
                            {outstandingH > 2 && <rect x={xBase} y={H - billedH} width={BAR} height={outstandingH} rx={4} fill="rgba(239,68,68,0.35)" />}
                            <rect x={xBase + BAR + GAP} y={H - collectedH} width={BAR} height={collectedH} rx={4} fill="#10b981" />
                            {d.billed > 0 && <text x={xBase + BAR / 2} y={H - billedH - 4} textAnchor="middle" fill="#a78bfa" fontSize="9">₹{(d.billed/1000).toFixed(1)}k</text>}
                            {d.collected > 0 && <text x={xBase + BAR + GAP + BAR / 2} y={H - collectedH - 4} textAnchor="middle" fill="#34d399" fontSize="9">₹{(d.collected/1000).toFixed(1)}k</text>}
                            <text x={i * W + W / 2} y={H + 18} textAnchor="middle" fill="#94a3b8" fontSize="11">{d.month}</text>
                          </g>
                        )
                      })}
                    </svg>
                  )
                })()}
              </SectionCard>

              {/* Liters trend */}
              <SectionCard title="🥛 दूध प्रमाण कल (६ महिने)">
                <LitersTrendBars data={chartData.map(d => ({ month: d.month, liters: d.liters }))} />
              </SectionCard>

              {/* Efficiency line */}
              <SectionCard title="📈 वसुली कार्यक्षमता कल">
                <EfficiencyLine data={chartData} />
              </SectionCard>

              {/* Payment mode donut (6 months) */}
              {payModes6m.length > 0 && (
                <SectionCard title="💳 ६ महिने पेमेंट पद्धत">
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <PaymentModeDonut modes={payModes6m} />
                  </div>
                </SectionCard>
              )}

              {/* MoM growth badge scroll */}
              <SectionCard title="📅 महिनेनिहाय वाढ">
                <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
                  {momBadges.map((d, i) => {
                    const pct   = d.billed > 0 ? Math.round((d.collected / d.billed) * 100) : 0
                    const eff   = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444'
                    return (
                      <div key={i} style={{ flexShrink:0, width:80, background:'var(--surface2)', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{d.month}</div>
                        <div style={{ fontSize:12, fontWeight:800, color:'var(--text)' }}>{d.billed > 0 ? `₹${(d.billed/1000).toFixed(1)}k` : '—'}</div>
                        {d.mom != null ? (
                          <div style={{ fontSize:11, fontWeight:700, marginTop:4, color: d.mom >= 0 ? '#10b981' : '#ef4444' }}>
                            {d.mom >= 0 ? '▲' : '▼'} {Math.abs(d.mom).toFixed(0)}%
                          </div>
                        ) : <div style={{ fontSize:10, color:'var(--text2)', marginTop:4 }}>—</div>}
                        <div style={{ fontSize:10, color:eff, marginTop:3 }}>{pct > 0 ? `${pct}% जमा` : ''}</div>
                      </div>
                    )
                  })}
                </div>
              </SectionCard>

              {/* Monthly summary table */}
              <SectionCard title="महिनेनिहाय सारांश" noPad>
                <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 60px', gap:4, padding:'7px 14px', background:'var(--surface2)' }}>
                  {['महिना','बिल','वसुली','कार्य'].map(h => (
                    <span key={h} style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.3px' }}>{h}</span>
                  ))}
                </div>
                {chartData.map((d, i) => {
                  const pct   = d.billed > 0 ? Math.min(100, (d.collected / d.billed) * 100) : 0
                  const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? '#f59e0b' : 'var(--red)'
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 60px', gap:4, padding:'9px 14px', borderBottom: i < chartData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{d.fullMonth}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{d.billed > 0 ? formatCurrency(d.billed) : '—'}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--green)' }}>{d.collected > 0 ? formatCurrency(d.collected) : '—'}</span>
                      <span style={{ fontSize:12, fontWeight:800, color }}>{d.billed > 0 ? `${pct.toFixed(0)}%` : '—'}</span>
                    </div>
                  )
                })}
              </SectionCard>

              {/* 6 stat tiles */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { label:'6 महिने एकूण बिल',     value:formatCurrency(totalBilled6m),    color:'#8b5cf6' },
                  { label:'6 महिने एकूण वसुली',   value:formatCurrency(totalCollect6m),   color:'#10b981' },
                  { label:'सर्वोत्तम महिना',       value:bestMonth.fullMonth,              color:'#f59e0b' },
                  { label:'एकूण थकबाकी',           value:formatCurrency(Math.max(0, totalBilled6m - totalCollect6m)), color:'var(--red)' },
                  { label:'सर्वोच्च वृद्धी महिना', value: bestGrowth ? `${bestGrowth.fullMonth} (+${bestGrowth.mom?.toFixed(0)}%)` : '—', color:'#06b6d4' },
                  { label:'सरासरी कार्यक्षमता',   value:`${avgEfficiency.toFixed(1)}%`,   color: avgEfficiency >= 90 ? '#10b981' : avgEfficiency >= 70 ? '#f59e0b' : 'var(--red)' },
                ].map((s, i) => (
                  <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontSize:14, fontWeight:900, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          )
        })() : null)}
      </div>
    </div>
  )
}

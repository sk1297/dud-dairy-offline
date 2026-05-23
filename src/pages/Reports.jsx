import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import { formatCurrency, getMonthYear, todayStr } from '../utils.js'
import db from '../db/database.js'

const MR_MONTHS = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']
const TABS = ['आजचा','मासिक','ग्राहक','तक्ता']

// ── helpers ───────────────────────────────────────────────────────────────────
function monthRange(month, year) {
  const mm  = String(month).padStart(2, '0')
  const end = new Date(year, month, 0).getDate()
  return { sd: `${year}-${mm}-01`, ed: `${year}-${mm}-${String(end).padStart(2,'0')}` }
}

// ── sub-components ────────────────────────────────────────────────────────────
function StatRow({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:11 }}>
      <div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>{sub}</div>}
      </div>
      <span style={{ fontSize:15, fontWeight:800, color }}>{value}</span>
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

function DualBarChart({ data }) {
  if (!data.length) return null
  const maxVal = Math.max(...data.flatMap(d => [d.billed, d.collected]), 1)
  const W = 70, H = 130, BAR = 22, GAP = 4, BOTTOM = 30
  return (
    <svg width="100%" height={H + BOTTOM} viewBox={`0 0 ${data.length * W} ${H + BOTTOM}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const billedH    = maxVal > 0 ? (d.billed    / maxVal) * H : 0
        const collectedH = maxVal > 0 ? (d.collected / maxVal) * H : 0
        const xBase      = i * W + (W - BAR * 2 - GAP) / 2
        const outstandingH = Math.max(0, billedH - collectedH)
        return (
          <g key={i}>
            <rect x={xBase} y={H - billedH} width={BAR} height={billedH} rx="4" fill="rgba(139,92,246,0.35)" />
            <rect x={xBase} y={H - collectedH} width={BAR} height={collectedH} rx="4" fill="#8b5cf6" />
            {outstandingH > 2 && <rect x={xBase} y={H - billedH} width={BAR} height={outstandingH} rx="4" fill="rgba(239,68,68,0.3)" />}
            <rect x={xBase + BAR + GAP} y={H - collectedH} width={BAR} height={collectedH} rx="4" fill="#10b981" />
            {d.billed > 0 && <text x={xBase + BAR / 2} y={H - billedH - 4} textAnchor="middle" fill="#a78bfa" fontSize="9">₹{(d.billed/1000).toFixed(1)}k</text>}
            {d.collected > 0 && <text x={xBase + BAR + GAP + BAR / 2} y={H - collectedH - 4} textAnchor="middle" fill="#34d399" fontSize="9">₹{(d.collected/1000).toFixed(1)}k</text>}
            <text x={i * W + W / 2} y={H + 18} textAnchor="middle" fill="#94a3b8" fontSize="11">{d.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

function TabLoader() {
  return <div className="loading"><span className="spinner" /> लोड होत आहे...</div>
}

// ── per-tab data loaders (SQL-only, no JS-side full-table scan) ───────────────

async function loadTodayData() {
  const today = todayStr()

  const [
    sessionStats,
    totalActive,
    todayCollect,
    productStats,
    pendingCusts,
  ] = await Promise.all([
    // morning/evening delivered qty + pending count in one pass
    db.query(`
      SELECT d.session,
             SUM(CASE WHEN d.status IN ('delivered','partial') THEN d.qty ELSE 0 END) as delivered_qty,
             COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_count
      FROM deliveries d
      WHERE d.date = ?
      GROUP BY d.session
    `, [today]),

    db.query(`SELECT COUNT(*) as cnt FROM customers WHERE status = 'active'`),

    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date = ?`, [today]),

    // product-wise delivered qty today
    db.query(`
      SELECT COALESCE(p.name,'दूध') as name, COALESCE(p.unit,'L') as unit, COALESCE(p.type,'milk') as type,
             SUM(d.qty) as qty
      FROM deliveries d
      LEFT JOIN products p ON p.id = d.product_id
      WHERE d.date = ? AND d.status IN ('delivered','partial')
      GROUP BY d.product_id
    `, [today]),

    // pending customer names
    db.query(`
      SELECT DISTINCT c.name
      FROM deliveries d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.date = ? AND d.status = 'pending'
      ORDER BY c.name
    `, [today]),
  ])

  const morning = sessionStats.find(r => r.session === 'morning') || { delivered_qty: 0, pending_count: 0 }
  const evening = sessionStats.find(r => r.session === 'evening') || { delivered_qty: 0, pending_count: 0 }

  // served customers count
  const servedRow = await db.query(`
    SELECT COUNT(DISTINCT customer_id) as cnt
    FROM deliveries WHERE date = ? AND status IN ('delivered','partial')
  `, [today])

  return {
    mlDelivered:  morning.delivered_qty || 0,
    elDelivered:  evening.delivered_qty || 0,
    mlPending:    morning.pending_count || 0,
    elPending:    evening.pending_count || 0,
    totalLiters:  (morning.delivered_qty || 0) + (evening.delivered_qty || 0),
    servedCusts:  servedRow[0]?.cnt || 0,
    totalActive:  totalActive[0]?.cnt || 0,
    todayCollect: todayCollect[0]?.total || 0,
    todayByProd:  productStats,
    pendingCusts: pendingCusts.map(r => r.name),
  }
}

async function loadMonthlyData(month, year) {
  const { sd, ed } = monthRange(month, year)

  const [
    milkQty,
    activeDays,
    billTotals,
    collected,
    productRevenue,
    topCusts,
  ] = await Promise.all([
    // total milk litres (products with unit=L)
    db.query(`
      SELECT COALESCE(SUM(d.qty),0) as total
      FROM deliveries d
      JOIN products p ON p.id = d.product_id
      WHERE d.date >= ? AND d.date <= ? AND d.status IN ('delivered','partial') AND p.unit = 'L'
    `, [sd, ed]),

    // active delivery days
    db.query(`
      SELECT COUNT(DISTINCT date) as cnt
      FROM deliveries WHERE date >= ? AND date <= ? AND status IN ('delivered','partial')
    `, [sd, ed]),

    // bill totals for month
    db.query(`
      SELECT COALESCE(SUM(total_amount),0) as billed,
             COUNT(*) as bill_count
      FROM monthly_bills WHERE month = ? AND year = ?
    `, [month, year]),

    // payments collected this month
    db.query(`
      SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE date >= ? AND date <= ?
    `, [sd, ed]),

    // product-wise revenue from bill_items
    db.query(`
      SELECT p.name, p.unit, p.type,
             COALESCE(SUM(bi.amount),0) as revenue,
             COALESCE(SUM(bi.qty),0) as qty
      FROM bill_items bi
      JOIN monthly_bills mb ON mb.id = bi.bill_id
      JOIN products p ON p.id = bi.product_id
      WHERE mb.month = ? AND mb.year = ?
      GROUP BY p.id
      ORDER BY revenue DESC
    `, [month, year]),

    // top 5 customers by billed amount this month
    db.query(`
      SELECT c.name, mb.total_amount as amount
      FROM monthly_bills mb
      JOIN customers c ON c.id = mb.customer_id
      WHERE mb.month = ? AND mb.year = ?
      ORDER BY mb.total_amount DESC
      LIMIT 5
    `, [month, year]),
  ])

  const totalBilled   = billTotals[0]?.billed || 0
  const totalCollect  = collected[0]?.total   || 0
  const totalLiters   = milkQty[0]?.total     || 0
  const activeDaysCnt = activeDays[0]?.cnt    || 0

  return {
    totalLiters,
    totalBilled,
    totalCollect,
    totalOut:    Math.max(0, totalBilled - totalCollect),
    activeDays:  activeDaysCnt,
    avgPerDay:   activeDaysCnt > 0 ? totalLiters / activeDaysCnt : 0,
    monthByProd: productRevenue,
    topCusts,
  }
}

async function loadCustomerReport() {
  return db.query(`
    SELECT c.id, c.name, c.status, c.mobile,
           ar.name as area,
           pr.name as prodName,
           COALESCE(SUM(mb.total_amount),0) as billed,
           COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id),0) as paid
    FROM customers c
    LEFT JOIN areas ar ON ar.id = c.area_id
    LEFT JOIN products pr ON pr.id = c.product_id
    LEFT JOIN monthly_bills mb ON mb.customer_id = c.id
    GROUP BY c.id
    ORDER BY (COALESCE(SUM(mb.total_amount),0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id),0)) DESC
  `)
}

async function loadChartData(month, year) {
  // Build last 6 month keys
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(year, month - 1 - i, 1)
    const cm = d.getMonth() + 1
    const cy = d.getFullYear()
    months.push({ cm, cy, label: d.toLocaleDateString('mr-IN', { month: 'short' }), fullMonth: MR_MONTHS[cm-1] })
  }

  // Single query: bill totals grouped by month+year
  const bills = await db.query(`
    SELECT month, year, SUM(total_amount) as billed
    FROM monthly_bills GROUP BY month, year
  `)
  const billMap = {}
  for (const b of bills) billMap[`${b.year}-${b.month}`] = b.billed || 0

  // Single query: payment totals grouped by month
  const pays = await db.query(`
    SELECT strftime('%Y-%m', date) as ym, SUM(amount) as collected
    FROM payments WHERE date IS NOT NULL GROUP BY ym
  `)
  const payMap = {}
  for (const p of pays) payMap[p.ym] = p.collected || 0

  return months.map(m => ({
    month:     m.label,
    fullMonth: m.fullMonth,
    billed:    billMap[`${m.cy}-${m.cm}`] || 0,
    collected: payMap[`${m.cy}-${String(m.cm).padStart(2,'0')}`] || 0,
  }))
}

// ── main component ────────────────────────────────────────────────────────────
export default function Reports() {
  const navigate = useNavigate()
  const { month, year } = getMonthYear()
  const [tab,      setTab]      = useState(0)
  const [selMonth, setSelMonth] = useState(month)
  const [selYear,  setSelYear]  = useState(year)

  // Per-tab data + loading state
  const [daily,      setDaily]      = useState(null)
  const [monthly,    setMonthly]    = useState(null)
  const [custReport, setCustReport] = useState(null)
  const [chartData,  setChartData]  = useState(null)

  const [loadingTab, setLoadingTab] = useState(-1) // which tab is loading

  // Track which tabs have been loaded (to avoid re-loading on tab switch)
  const loaded = useRef({ daily: null, monthly: null, cust: false, chart: null })

  const loadTab = useCallback(async (t, force = false) => {
    setLoadingTab(t)
    try {
      if (t === 0) {
        if (!force && loaded.current.daily === todayStr()) return
        const data = await loadTodayData()
        setDaily(data)
        loaded.current.daily = todayStr()
      } else if (t === 1) {
        const key = `${selMonth}-${selYear}`
        if (!force && loaded.current.monthly === key) return
        const data = await loadMonthlyData(selMonth, selYear)
        setMonthly(data)
        loaded.current.monthly = key
      } else if (t === 2) {
        if (!force && loaded.current.cust) return
        const data = await loadCustomerReport()
        setCustReport(data)
        loaded.current.cust = true
      } else if (t === 3) {
        const key = `${selMonth}-${selYear}`
        if (!force && loaded.current.chart === key) return
        const data = await loadChartData(selMonth, selYear)
        setChartData(data)
        loaded.current.chart = key
      }
    } finally {
      setLoadingTab(-1)
    }
  }, [selMonth, selYear])

  // Load current tab on mount + when tab/month/year changes
  useEffect(() => {
    loadTab(tab)
  }, [tab, selMonth, selYear, loadTab])

  // Pull to refresh reloads current tab
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
        {tab === 0 && (
          isLoading ? <TabLoader /> : daily ? (
            <>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text2)' }}>
                {new Date().toLocaleDateString('mr-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
              </div>

              {/* Hero: Liters + Customers */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ background:'linear-gradient(135deg,rgba(16,185,129,0.18),rgba(16,185,129,0.06))', border:'1px solid rgba(16,185,129,0.3)', borderRadius:14, padding:'16px 14px' }}>
                  <div style={{ fontSize:11, color:'#6ee7b7', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>🥛 एकूण दूध</div>
                  <div style={{ fontSize:30, fontWeight:900, color:'#10b981', margin:'6px 0 2px' }}>{daily.totalLiters.toFixed(1)}<span style={{ fontSize:14, fontWeight:600, marginLeft:4 }}>L</span></div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>☀️ {daily.mlDelivered.toFixed(1)}L &nbsp;🌙 {daily.elDelivered.toFixed(1)}L</div>
                </div>
                <div style={{ background:'linear-gradient(135deg,rgba(59,130,246,0.18),rgba(59,130,246,0.06))', border:'1px solid rgba(59,130,246,0.3)', borderRadius:14, padding:'16px 14px' }}>
                  <div style={{ fontSize:11, color:'#93c5fd', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>👥 ग्राहक</div>
                  <div style={{ fontSize:30, fontWeight:900, color:'#3b82f6', margin:'6px 0 2px' }}>{daily.servedCusts}<span style={{ fontSize:14, fontWeight:600, color:'var(--text2)', marginLeft:4 }}>/ {daily.totalActive}</span></div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>डिलिव्हरी पूर्ण</div>
                </div>
              </div>

              {/* Session breakdown */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:10 }}>सत्र स्थिती</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { label:'☀️ सकाळ',      liters:daily.mlDelivered, pending:daily.mlPending },
                    { label:'🌙 संध्याकाळ', liters:daily.elDelivered, pending:daily.elPending },
                  ].map((s, i) => (
                    <div key={i} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{s.liters.toFixed(1)} L</div>
                      {s.pending > 0
                        ? <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>⏳ {s.pending} बाकी</div>
                        : <div style={{ fontSize:11, color:'var(--green)', marginTop:2 }}>✓ सर्व झाले</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Today collection */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:12, color:'var(--text2)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>💰 आजची वसुली</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#f59e0b', marginTop:4 }}>{formatCurrency(daily.todayCollect)}</div>
                </div>
                {daily.todayCollect === 0 && (
                  <span style={{ fontSize:12, color:'var(--text2)', background:'var(--surface2)', padding:'4px 10px', borderRadius:20 }}>आज नाही</span>
                )}
              </div>

              {/* Product-wise today */}
              {daily.todayByProd.length > 0 && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>📦 उत्पादननिहाय</div>
                  {daily.todayByProd.map((p, i) => {
                    const color = p.type === 'milk_buffalo' ? '#8b5cf6' : p.type === 'milk_cow' ? '#f59e0b' : '#06b6d4'
                    return (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:13, color:'var(--text)' }}>{p.name}</span>
                        <span style={{ fontSize:13, fontWeight:700, color }}>{Number(p.qty).toFixed(2)} {p.unit}</span>
                      </div>
                    )
                  })}
                </div>
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
          ) : null
        )}

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
                <StatRow label="🥛 एकूण लिटर (दूध)"   value={`${monthly.totalLiters.toFixed(1)} L`}          color="var(--green)" />
                <StatRow label="📅 सक्रिय दिवस"        value={`${monthly.activeDays} दिवस`}                   color="#3b82f6" />
                <StatRow label="📊 दैनिक सरासरी"       value={`${monthly.avgPerDay.toFixed(1)} L/दिवस`}       color="#8b5cf6" />
                <StatRow label="🧾 एकूण बिल रक्कम"     value={formatCurrency(monthly.totalBilled)}             color="var(--text)" />
                <StatRow label="✅ जमा झाले"            value={formatCurrency(monthly.totalCollect)}            color="var(--green)" />
                <StatRow label="⚠️ बाकी थकबाकी"        value={formatCurrency(monthly.totalOut)}                color={monthly.totalOut > 0 ? 'var(--red)' : 'var(--green)'} />

                {monthly.monthByProd.length > 0 && (
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
                      📦 उत्पादननिहाय महसूल
                    </div>
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
                  </div>
                )}

                {monthly.topCusts.length > 0 && (
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
                      🏆 शीर्ष ग्राहक (बिलानुसार)
                    </div>
                    {monthly.topCusts.map((c, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < monthly.topCusts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ width:26, height:26, borderRadius:8, background: i===0 ? 'rgba(251,191,36,0.2)' : 'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color: i===0 ? '#fbbf24' : 'var(--text2)' }}>
                          {i + 1}
                        </div>
                        <span style={{ flex:1, fontSize:13, color:'var(--text)', fontWeight:600 }}>{c.name}</span>
                        <span style={{ fontSize:13, fontWeight:800, color:'var(--accent)' }}>{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </div>
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
        {tab === 2 && (
          isLoading ? <TabLoader /> : custReport ? (
            <>
              <div style={{ fontSize:12, color:'var(--text2)', fontWeight:600 }}>
                एकूण {custReport.length} ग्राहक — थकबाकीनुसार क्रम
              </div>
              {custReport.map(c => {
                const outstanding = Math.max(0, (c.billed || 0) - (c.paid || 0))
                const pct   = c.billed > 0 ? Math.min(100, (c.paid / c.billed) * 100) : 100
                const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? '#f59e0b' : 'var(--red)'
                const badge = c.status === 'active' ? 'badge-green' : c.status === 'paused' ? 'badge-yellow' : 'badge-red'
                const statusLabel = c.status === 'active' ? 'सक्रिय' : c.status === 'paused' ? 'थांबले' : 'बंद'
                return (
                  <div key={c.id}
                    style={{ background:'var(--surface)', border:`1px solid ${outstanding > 0 ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`, borderRadius:13, padding:14, cursor:'pointer' }}
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{c.name}</span>
                          <span className={`badge ${badge}`}>{statusLabel}</span>
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
            </>
          ) : null
        )}

        {/* ══ TAB 3 — CHART ══════════════════════════════════════════════════ */}
        {tab === 3 && (
          isLoading ? <TabLoader /> : chartData ? (
            <>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>गेल्या ६ महिन्यांचा महसूल</div>
                <div style={{ fontSize:12, color:'var(--text2)', marginBottom:14 }}>बिल vs वसुली तुलना</div>
                <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                  {[{ color:'#8b5cf6', label:'बिल' }, { color:'#10b981', label:'वसुली' }, { color:'rgba(239,68,68,0.4)', label:'थकबाकी' }].map((l,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:l.color }} />
                      <span style={{ fontSize:11, color:'var(--text2)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
                <DualBarChart data={chartData} />
              </div>

              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.4px' }}>
                  महिनेनिहाय सारांश
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 70px', gap:4, padding:'7px 14px', background:'var(--surface2)' }}>
                  {['महिना','बिल','वसुली','कार्यक्षमता'].map(h => (
                    <span key={h} style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.3px' }}>{h}</span>
                  ))}
                </div>
                {chartData.map((d, i) => {
                  const pct   = d.billed > 0 ? Math.min(100, (d.collected / d.billed) * 100) : 0
                  const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? '#f59e0b' : 'var(--red)'
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 70px', gap:4, padding:'9px 14px', borderBottom: i < chartData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{d.fullMonth}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{d.billed > 0 ? formatCurrency(d.billed) : '—'}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--green)' }}>{d.collected > 0 ? formatCurrency(d.collected) : '—'}</span>
                      <span style={{ fontSize:12, fontWeight:800, color }}>{d.billed > 0 ? `${pct.toFixed(0)}%` : '—'}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { label:'6 महिने एकूण बिल',   value:formatCurrency(chartData.reduce((s,d)=>s+d.billed,0)),    color:'#8b5cf6' },
                  { label:'6 महिने एकूण वसुली', value:formatCurrency(chartData.reduce((s,d)=>s+d.collected,0)), color:'#10b981' },
                  { label:'सर्वोत्तम महिना',    value:chartData.reduce((best,d)=>d.billed>best.billed?d:best, chartData[0]||{billed:0,fullMonth:'—'}).fullMonth, color:'#f59e0b' },
                  { label:'एकूण थकबाकी',         value:formatCurrency(Math.max(0, chartData.reduce((s,d)=>s+(d.billed-d.collected),0))), color:'var(--red)' },
                ].map((s,i) => (
                  <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontSize:14, fontWeight:900, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null
        )}
      </div>
    </div>
  )
}

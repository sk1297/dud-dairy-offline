import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import { formatCurrency, getMonthYear, todayStr } from '../utils.js'
import db from '../db/database.js'

const MR_MONTHS = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']
const TABS = ['आजचा','मासिक','ग्राहक','तक्ता']

// ── small reusable stat row ──────────────────────────────────────────────────
function StatRow({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 15, fontWeight: 800, color }}>{value}</span>
    </div>
  )
}

// ── collection efficiency progress bar ──────────────────────────────────────
function EfficiencyBar({ billed, collected }) {
  const pct = billed > 0 ? Math.min(100, (collected / billed) * 100) : 0
  const color = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>वसुली कार्यक्षमता</span>
        <span style={{ fontSize: 20, fontWeight: 900, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 20, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
        <span>बिल: <strong style={{ color: 'var(--text)' }}>{formatCurrency(billed)}</strong></span>
        <span>जमा: <strong style={{ color }}>{formatCurrency(collected)}</strong></span>
        <span>बाकी: <strong style={{ color: 'var(--red)' }}>{formatCurrency(Math.max(0, billed - collected))}</strong></span>
      </div>
    </div>
  )
}

// ── dual bar chart ───────────────────────────────────────────────────────────
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
            {/* Billed bar (background) */}
            <rect x={xBase} y={H - billedH} width={BAR} height={billedH} rx="4" fill="rgba(139,92,246,0.35)" />
            {/* Collected portion */}
            <rect x={xBase} y={H - collectedH} width={BAR} height={collectedH} rx="4" fill="#8b5cf6" />
            {/* Outstanding portion indicator */}
            {outstandingH > 2 && (
              <rect x={xBase} y={H - billedH} width={BAR} height={outstandingH} rx="4" fill="rgba(239,68,68,0.3)" />
            )}

            {/* Collection bar */}
            <rect x={xBase + BAR + GAP} y={H - collectedH} width={BAR} height={collectedH} rx="4" fill="#10b981" />

            {/* Value labels */}
            {d.billed > 0 && (
              <text x={xBase + BAR / 2} y={H - billedH - 4} textAnchor="middle" fill="#a78bfa" fontSize="9">
                ₹{(d.billed / 1000).toFixed(1)}k
              </text>
            )}
            {d.collected > 0 && (
              <text x={xBase + BAR + GAP + BAR / 2} y={H - collectedH - 4} textAnchor="middle" fill="#34d399" fontSize="9">
                ₹{(d.collected / 1000).toFixed(1)}k
              </text>
            )}

            {/* Month label */}
            <text x={i * W + W / 2} y={H + 18} textAnchor="middle" fill="#94a3b8" fontSize="11">{d.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── main component ───────────────────────────────────────────────────────────
export default function Reports() {
  const navigate = useNavigate()
  const { month, year } = getMonthYear()
  const [tab,        setTab]        = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [selMonth,   setSelMonth]   = useState(month)
  const [selYear,    setSelYear]    = useState(year)

  // data buckets
  const [daily,      setDaily]      = useState(null)
  const [monthly,    setMonthly]    = useState(null)
  const [custReport, setCustReport] = useState([])
  const [chartData,  setChartData]  = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = todayStr()
      const [deliveries, payments, bills, customers, products, areas] = await Promise.all([
        db.query('SELECT * FROM deliveries'),
        db.query('SELECT * FROM payments'),
        db.query('SELECT * FROM monthly_bills'),
        db.query('SELECT * FROM customers'),
        db.query('SELECT * FROM products'),
        db.query('SELECT * FROM areas'),
      ])

      const prodMap   = {}
      for (const p of products) prodMap[p.id] = p
      const isMilk    = (d) => { const p = prodMap[d.product_id]; return !p || p.unit === 'L' }
      const isDelivered = (d) => d.status === 'delivered' || d.status === 'partial'

      // ── TAB 0 : Today ──────────────────────────────────────────────────
      const todayDels = deliveries.filter(d => d.date === today)
      const todayPays = payments.filter(p => p.date === today)

      const morningDels = todayDels.filter(d => d.session === 'morning')
      const eveningDels = todayDels.filter(d => d.session === 'evening')

      const mlDelivered  = morningDels.filter(d => isDelivered(d) && isMilk(d)).reduce((s,d)=>s+(d.qty||0),0)
      const elDelivered  = eveningDels.filter(d => isDelivered(d) && isMilk(d)).reduce((s,d)=>s+(d.qty||0),0)
      const mlPending    = morningDels.filter(d => d.status === 'pending').length
      const elPending    = eveningDels.filter(d => d.status === 'pending').length
      const totalLiters  = mlDelivered + elDelivered
      const servedCusts  = new Set(todayDels.filter(d=>isDelivered(d)).map(d=>d.customer_id)).size
      const todayCollect = todayPays.reduce((s,p)=>s+(p.amount||0),0)

      // product-wise today
      const todayByProd = {}
      for (const d of todayDels.filter(isDelivered)) {
        const p = prodMap[d.product_id]
        if (!p) continue
        if (!todayByProd[p.name]) todayByProd[p.name] = { qty: 0, unit: p.unit, color: p.type === 'milk_buffalo' ? '#8b5cf6' : p.type === 'milk_cow' ? '#f59e0b' : '#06b6d4' }
        todayByProd[p.name].qty += (d.qty || 0)
      }

      // pending customers list
      const pendingCusts = [...new Set(todayDels.filter(d=>d.status==='pending').map(d=>d.customer_id))]
        .map(cid => customers.find(c=>c.id===cid)?.name || '—')

      setDaily({ totalLiters, mlDelivered, elDelivered, mlPending, elPending, servedCusts, totalActive: customers.filter(c=>c.status==='active').length, todayCollect, todayByProd, pendingCusts })

      // ── TAB 1 : Monthly ────────────────────────────────────────────────
      const sd = `${selYear}-${String(selMonth).padStart(2,'0')}-01`
      const ed = `${selYear}-${String(selMonth).padStart(2,'0')}-31`
      const mDels  = deliveries.filter(d => d.date >= sd && d.date <= ed && isDelivered(d))
      const mPays  = payments.filter(p => p.date >= sd && p.date <= ed)
      const mBills = bills.filter(b => b.month === selMonth && b.year === selYear)

      const totalLitersM  = mDels.filter(isMilk).reduce((s,d)=>s+(d.qty||0),0)
      const totalBilled   = mBills.reduce((s,b)=>s+(b.total_amount||0),0)
      const totalCollectM = mPays.reduce((s,p)=>s+(p.amount||0),0)
      const totalOutM     = Math.max(0, totalBilled - totalCollectM)
      const activeDays    = new Set(mDels.map(d=>d.date)).size
      const avgPerDay     = activeDays > 0 ? totalLitersM / activeDays : 0

      // product-wise monthly breakdown
      const monthByProd = {}
      for (const d of mDels) {
        const p = prodMap[d.product_id]
        if (!p) continue
        if (!monthByProd[p.id]) monthByProd[p.id] = { name: p.name, unit: p.unit, qty: 0, revenue: 0, type: p.type }
        monthByProd[p.id].qty += (d.qty || 0)
        // revenue from bill items for this month
      }
      // get revenue from bill_items for this month
      const mBillIds = mBills.map(b => b.id)
      const mItems   = mBillIds.length > 0 ? await db.query(`SELECT * FROM bill_items WHERE bill_id IN (${mBillIds.map(()=>'?').join(',')})`, mBillIds) : []
      for (const item of mItems) {
        const p = prodMap[item.product_id]
        if (!p) continue
        if (!monthByProd[item.product_id]) monthByProd[item.product_id] = { name: item.product_name || p.name, unit: item.unit || p.unit, qty: 0, revenue: 0, type: p.type }
        monthByProd[item.product_id].revenue += (item.amount || 0)
      }

      // top 5 customers this month by billed amount
      const topCusts = mBills
        .map(b => ({ name: customers.find(c=>c.id===b.customer_id)?.name || '—', amount: b.total_amount || 0 }))
        .sort((a,b)=>b.amount-a.amount).slice(0,5)

      setMonthly({ totalLiters: totalLitersM, totalBilled, totalCollect: totalCollectM, totalOut: totalOutM, activeDays, avgPerDay, monthByProd: Object.values(monthByProd).sort((a,b)=>b.revenue-a.revenue), topCusts })

      // ── TAB 2 : Customer Report ────────────────────────────────────────
      const custData = customers.map(c => {
        const custBills = bills.filter(b => b.customer_id === c.id)
        const custPays  = payments.filter(p => p.customer_id === c.id)
        const billed    = custBills.reduce((s,b)=>s+(b.total_amount||0),0)
        const paid      = custPays.reduce((s,p)=>s+(p.amount||0),0)
        const outstanding = Math.max(0, billed - paid)
        const pct       = billed > 0 ? Math.min(100, (paid/billed)*100) : 100
        const area      = areas.find(a=>a.id===c.area_id)?.name || '—'
        const prod      = prodMap[c.product_id]
        return { ...c, billed, paid, outstanding, pct, area, prodName: prod?.name || 'दूध' }
      }).sort((a,b)=>b.outstanding-a.outstanding)
      setCustReport(custData)

      // ── TAB 3 : Chart — last 6 months ─────────────────────────────────
      const chart = []
      for (let i = 5; i >= 0; i--) {
        const d  = new Date(selYear, selMonth - 1 - i, 1)
        const cm = d.getMonth() + 1
        const cy = d.getFullYear()
        const cBills = bills.filter(b=>b.month===cm&&b.year===cy)
        const cPays  = payments.filter(p=>{
          const pd = p.date?.slice(0,7)
          return pd === `${cy}-${String(cm).padStart(2,'0')}`
        })
        chart.push({
          month:     d.toLocaleDateString('mr-IN', { month: 'short' }),
          fullMonth: MR_MONTHS[cm-1],
          billed:    cBills.reduce((s,b)=>s+(b.total_amount||0),0),
          collected: cPays.reduce((s,p)=>s+(p.amount||0),0),
        })
      }
      setChartData(chart)

    } finally {
      setLoading(false)
    }
  }, [selMonth, selYear])

  useEffect(() => { load() }, [load])

  const { containerRef: reportsListRef, indicator: reportsRefreshIndicator } = usePullToRefresh(load)

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>
      <Header title="अहवाल" icon="📊" subtitle="उत्पन्न, डिलिव्हरी व थकबाकी विश्लेषण" onBack={() => navigate('/more')} />

      <div style={{ padding: '12px 16px 0' }}>
        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={i} className={`tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
      </div>

      {loading
        ? <div className="loading"><span className="spinner" /> लोड होत आहे...</div>
        : <div ref={reportsListRef} style={{ flex: 1, padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reportsRefreshIndicator}

          {/* ══════════════════════════════ TAB 0 — TODAY ══════════════════════════════ */}
          {tab === 0 && daily && (
            <>
              {/* Date heading */}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>
                {new Date().toLocaleDateString('mr-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>

              {/* Hero: Liters + Customers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.18),rgba(16,185,129,0.06))', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 14, padding: '16px 14px' }}>
                  <div style={{ fontSize: 11, color: '#6ee7b7', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>🥛 एकूण दूध</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#10b981', margin: '6px 0 2px' }}>{daily.totalLiters.toFixed(1)}<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 4 }}>L</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>☀️ {daily.mlDelivered.toFixed(1)}L &nbsp;🌙 {daily.elDelivered.toFixed(1)}L</div>
                </div>
                <div style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.18),rgba(59,130,246,0.06))', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 14, padding: '16px 14px' }}>
                  <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>👥 ग्राहक</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#3b82f6', margin: '6px 0 2px' }}>{daily.servedCusts}<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginLeft: 4 }}>/ {daily.totalActive}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>डिलिव्हरी पूर्ण</div>
                </div>
              </div>

              {/* Session breakdown */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>सत्र स्थिती</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: '☀️ सकाळ', liters: daily.mlDelivered, pending: daily.mlPending },
                    { label: '🌙 संध्याकाळ', liters: daily.elDelivered, pending: daily.elPending },
                  ].map((s, i) => (
                    <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{s.liters.toFixed(1)} L</div>
                      {s.pending > 0
                        ? <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>⏳ {s.pending} बाकी</div>
                        : <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>✓ सर्व झाले</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's collection */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>💰 आजची वसुली</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b', marginTop: 4 }}>{formatCurrency(daily.todayCollect)}</div>
                </div>
                {daily.todayCollect === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--surface2)', padding: '4px 10px', borderRadius: 20 }}>आज नाही</span>
                )}
              </div>

              {/* Product-wise today */}
              {Object.keys(daily.todayByProd).length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>📦 उत्पादननिहाय</div>
                  {Object.entries(daily.todayByProd).map(([name, d]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: d.color }}>{d.qty.toFixed(2)} {d.unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending customers */}
              {daily.pendingCusts.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>⏳ बाकी ग्राहक ({daily.pendingCusts.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {daily.pendingCusts.map((n, i) => (
                      <span key={i} style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════ TAB 1 — MONTHLY ══════════════════════════ */}
          {tab === 1 && (
            <>
              {/* Month selector */}
              <div style={{ display: 'flex', gap: 8 }}>
                <BottomPicker
                  className="form-input"
                  style={{ flex: 1 }}
                  options={MR_MONTHS.map((name, i) => ({ label: name, value: i + 1 }))}
                  value={selMonth}
                  onChange={val => setSelMonth(parseInt(val))}
                />
                <BottomPicker
                  className="form-input"
                  style={{ width: 90 }}
                  options={[year-1, year, year+1].map(y => ({ label: String(y), value: y }))}
                  value={selYear}
                  onChange={val => setSelYear(parseInt(val))}
                />
              </div>

              {monthly && (
                <>
                  {/* Efficiency bar */}
                  <EfficiencyBar billed={monthly.totalBilled} collected={monthly.totalCollect} />

                  {/* 6 stat rows */}
                  <StatRow label="🥛 एकूण लिटर (दूध)" value={`${monthly.totalLiters.toFixed(1)} L`} color="var(--green)" />
                  <StatRow label="📅 सक्रिय दिवस" value={`${monthly.activeDays} दिवस`} color="#3b82f6" />
                  <StatRow label="📊 दैनिक सरासरी" value={`${monthly.avgPerDay.toFixed(1)} L/दिवस`} color="#8b5cf6" />
                  <StatRow label="🧾 एकूण बिल रक्कम" value={formatCurrency(monthly.totalBilled)} color="var(--text)" />
                  <StatRow label="✅ जमा झाले" value={formatCurrency(monthly.totalCollect)} color="var(--green)" />
                  <StatRow label="⚠️ बाकी थकबाकी" value={formatCurrency(monthly.totalOut)} color={monthly.totalOut > 0 ? 'var(--red)' : 'var(--green)'} />

                  {/* Product-wise breakdown */}
                  {monthly.monthByProd.length > 0 && (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        📦 उत्पादननिहाय महसूल
                      </div>
                      {monthly.monthByProd.map((p, i) => {
                        const color = p.type === 'milk_buffalo' ? '#8b5cf6' : p.type === 'milk_cow' ? '#f59e0b' : '#06b6d4'
                        const pct   = monthly.totalBilled > 0 ? (p.revenue / monthly.totalBilled) * 100 : 0
                        return (
                          <div key={i} style={{ padding: '10px 14px', borderBottom: i < monthly.monthByProd.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color }}>{formatCurrency(p.revenue)}</span>
                                <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{p.qty.toFixed(2)} {p.unit}</span>
                              </div>
                            </div>
                            <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 10 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 10 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Top 5 customers */}
                  {monthly.topCusts.length > 0 && (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        🏆 शीर्ष ग्राहक (बिलानुसार)
                      </div>
                      {monthly.topCusts.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < monthly.topCusts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 8, background: i === 0 ? 'rgba(251,191,36,0.2)' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: i === 0 ? '#fbbf24' : 'var(--text2)' }}>
                            {i + 1}
                          </div>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{c.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {monthly.totalBilled === 0 && (
                    <div className="empty">
                      <div className="empty-icon">📋</div>
                      <div className="empty-title">या महिन्याचे बिल नाही</div>
                      <div className="empty-desc">बिल बनवल्यानंतर इथे दिसेल</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ══════════════════════════════ TAB 2 — CUSTOMERS ═══════════════════════ */}
          {tab === 2 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                एकूण {custReport.length} ग्राहक — थकबाकीनुसार क्रम
              </div>
              {custReport.map(c => {
                const pct   = c.billed > 0 ? Math.min(100, (c.paid / c.billed) * 100) : 100
                const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? '#f59e0b' : 'var(--red)'
                const badge = c.status === 'active' ? 'badge-green' : c.status === 'paused' ? 'badge-yellow' : 'badge-red'
                const statusLabel = c.status === 'active' ? 'सक्रिय' : c.status === 'paused' ? 'थांबले' : 'बंद'
                return (
                  <div key={c.id}
                    style={{ background: 'var(--surface)', border: `1px solid ${c.outstanding > 0 ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`, borderRadius: 13, padding: 14, cursor: 'pointer' }}
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
                          <span className={`badge ${badge}`}>{statusLabel}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{c.area} • {c.prodName}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {c.outstanding > 0
                          ? <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--red)' }}>{formatCurrency(c.outstanding)}</div>
                          : <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>✓ क्लिअर</div>}
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>थकबाकी</div>
                      </div>
                    </div>

                    {/* Billing summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)' }}>एकूण बिल</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{formatCurrency(c.billed)}</div>
                      </div>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)' }}>एकूण जमा</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{formatCurrency(c.paid)}</div>
                      </div>
                    </div>

                    {/* Collection % bar */}
                    {c.billed > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>वसुली</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 10 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 10, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    )}

                    {c.billed === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>अद्याप बिल नाही</div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* ══════════════════════════════ TAB 3 — CHART ════════════════════════════ */}
          {tab === 3 && (
            <>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>गेल्या ६ महिन्यांचा महसूल</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>बिल vs वसुली तुलना</div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                  {[{ color: '#8b5cf6', label: 'बिल' }, { color: '#10b981', label: 'वसुली' }, { color: 'rgba(239,68,68,0.4)', label: 'थकबाकी' }].map((l,i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>

                <DualBarChart data={chartData} />
              </div>

              {/* Month-wise summary table */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  महिनेनिहाय सारांश
                </div>
                {/* header */}
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 70px', gap: 4, padding: '7px 14px', background: 'var(--surface2)' }}>
                  {['महिना','बिल','वसुली','कार्यक्षमता'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</span>
                  ))}
                </div>
                {chartData.map((d, i) => {
                  const pct   = d.billed > 0 ? Math.min(100, (d.collected / d.billed) * 100) : 0
                  const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? '#f59e0b' : 'var(--red)'
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 70px', gap: 4, padding: '9px 14px', borderBottom: i < chartData.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{d.fullMonth}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{d.billed > 0 ? formatCurrency(d.billed) : '—'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{d.collected > 0 ? formatCurrency(d.collected) : '—'}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color }}>{d.billed > 0 ? `${pct.toFixed(0)}%` : '—'}</span>
                    </div>
                  )
                })}
              </div>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: '6 महिने एकूण बिल',   value: formatCurrency(chartData.reduce((s,d)=>s+d.billed,0)),    color: '#8b5cf6' },
                  { label: '6 महिने एकूण वसुली', value: formatCurrency(chartData.reduce((s,d)=>s+d.collected,0)), color: '#10b981' },
                  { label: 'सर्वोत्तम महिना',    value: chartData.reduce((best,d)=>d.billed>best.billed?d:best, chartData[0] || {billed:0,fullMonth:'—'}).fullMonth, color: '#f59e0b' },
                  { label: 'एकूण थकबाकी',         value: formatCurrency(Math.max(0, chartData.reduce((s,d)=>s+(d.billed-d.collected),0))), color: 'var(--red)' },
                ].map((s,i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      }
    </div>
  )
}

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCurrency, todayStr } from '../utils.js'
import { PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import db from '../db/database.js'

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    if (!target) { setVal(0); return }
    let start = null
    const animate = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(eased * target * 10) / 10)
      if (p < 1) raf.current = requestAnimationFrame(animate)
      else setVal(target)
    }
    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return val
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [recentActivity, setRecentActivity] = useState([])
  const [productBreakdown, setProductBreakdown] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(new Date())
  const [dairyName, setDairyName] = useState('दूध डेअरी')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setMounted(false)
    try {
      const today = todayStr()
      const settings = await db.query('SELECT key, value FROM settings')
      const settingsMap = {}
      for (const s of settings) settingsMap[s.key] = s.value
      if (settingsMap.dairy_name) setDairyName(settingsMap.dairy_name)

      const [customers, deliveries, payments, bills, allPayments, products] = await Promise.all([
        db.query('SELECT * FROM customers'),
        db.query('SELECT * FROM deliveries WHERE date = ?', [today]),
        db.query('SELECT * FROM payments WHERE date = ?', [today]),
        db.query('SELECT * FROM monthly_bills'),
        db.query('SELECT * FROM payments'),
        db.query('SELECT * FROM products'),
      ])

      const productMap = {}
      for (const p of products) productMap[p.id] = p

      const activeCustomers  = customers.filter(c => c.status === 'active')
      const deliveredToday   = deliveries.filter(d => d.status === 'delivered')
      const customersServed  = new Set(deliveredToday.map(d => d.customer_id)).size
      const paymentsToday    = payments.reduce((s, p) => s + (p.amount || 0), 0)

      const totalBilledAll   = bills.reduce((s, b) => s + (b.total_amount || 0), 0)
      const totalPaidAll     = allPayments.reduce((s, p) => s + (p.amount || 0), 0)
      const totalOutstanding = Math.max(0, totalBilledAll - totalPaidAll)

      // ── Per-product breakdown for today ──────────────────────────────────
      const prodTotals = {}  // { product_id: { name, type, unit, qty } }
      for (const d of deliveredToday) {
        const prod = productMap[d.product_id]
        if (!prod) continue
        if (!prodTotals[d.product_id]) {
          prodTotals[d.product_id] = { name: prod.name, type: prod.type, unit: prod.unit, qty: 0 }
        }
        prodTotals[d.product_id].qty += d.qty || 0
      }
      const breakdown = Object.values(prodTotals)
        .filter(p => p.qty > 0)
        .sort((a, b) => b.qty - a.qty)
      setProductBreakdown(breakdown)

      // ── Recent activity ───────────────────────────────────────────────────
      const activity = [
        ...deliveries.slice(-5).reverse().map(d => {
          const c    = customers.find(c => c.id === d.customer_id)
          const prod = productMap[d.product_id]
          return {
            type:        'delivery',
            customerId:   d.customer_id,
            customerName: c?.name || 'ग्राहक',
            productName:  prod?.name || 'दूध',
            productType:  prod?.type || 'milk_buffalo',
            qty:          d.qty,
            unit:         prod?.unit || 'L',
            session:      d.session,
            status:       d.status,
          }
        }),
        ...payments.slice(-3).reverse().map(p => {
          const c = customers.find(c => c.id === p.customer_id)
          return {
            type:        'payment',
            customerId:   p.customer_id,
            customerName: c?.name || 'ग्राहक',
            amount:       p.amount,
            mode:         p.mode,
            status:       'paid',
          }
        }),
      ]
        .sort((a, b) => (b.type === 'delivery' ? 0 : -1) - (a.type === 'delivery' ? 0 : -1))  // deliveries first
        .slice(0, 6)

      setData({ customersServed, totalCustomers: activeCustomers.length, paymentsToday, totalOutstanding })
      setRecentActivity(activity)

      // ── Smart alerts ──────────────────────────────────────────────────────
      const smartAlerts = []
      const todayDate = new Date()

      // 1. 30+ day outstanding customers
      const outstandingCustomers = activeCustomers.filter(c => {
        const custPaid   = allPayments.filter(p => p.customer_id === c.id).reduce((s, p) => s + (p.amount || 0), 0)
        const custBilled = bills.filter(b => b.customer_id === c.id).reduce((s, b) => s + (b.total_amount || 0), 0)
        const due = custBilled - custPaid
        if (due <= 0) return false
        // Check oldest unpaid bill age
        const unpaidBills = bills.filter(b => b.customer_id === c.id && b.amount_due > 0)
          .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
        if (!unpaidBills.length) return false
        const oldest = unpaidBills[0]
        const billDate = new Date(oldest.year, oldest.month - 1, 1)
        const days = Math.floor((todayDate - billDate) / 86400000)
        return days >= 30
      })
      if (outstandingCustomers.length > 0) {
        smartAlerts.push({
          type: 'warning',
          icon: '⚠️',
          title: `${outstandingCustomers.length} ग्राहकांची 30+ दिवस थकबाकी`,
          sub: outstandingCustomers.slice(0, 3).map(c => c.name).join(', ') + (outstandingCustomers.length > 3 ? '...' : ''),
          action: { label: 'पाहा', path: '/bills', state: { openOutstandingTab: true } },
          color: 'var(--red)', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.25)',
        })
      }

      // 2. Month-end reminder — last 3 days of month, bills not generated
      const dayOfMonth = todayDate.getDate()
      const daysInMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate()
      const thisMonth = todayDate.getMonth() + 1
      const thisYear  = todayDate.getFullYear()
      if (dayOfMonth >= daysInMonth - 2) {
        const missingBills = activeCustomers.filter(c =>
          !bills.find(b => b.customer_id === c.id && b.month === thisMonth && b.year === thisYear)
        )
        if (missingBills.length > 0) {
          smartAlerts.push({
            type: 'info',
            icon: '📋',
            title: `महिना संपत आहे — ${missingBills.length} बिले बाकी`,
            sub: 'या महिन्याची बिले अजून बनवली नाहीत',
            action: { label: 'बिले बनवा', path: '/bills' },
            color: 'var(--yellow)', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.25)',
          })
        }
      }

      // 3. Today's deliveries incomplete — show if afternoon/evening and morning still pending
      const morningPending = deliveries.filter(d => d.session === 'morning' && d.status === 'pending').length
      if (morningPending > 0 && todayDate.getHours() >= 10) {
        smartAlerts.push({
          type: 'info',
          icon: '☀️',
          title: `${morningPending} सकाळची डिलिव्हरी बाकी`,
          sub: 'आजची सकाळची नोंद अद्याप पूर्ण झाली नाही',
          action: { label: 'डिलिव्हरी', path: '/delivery' },
          color: 'var(--accent)', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.25)',
        })
      }

      setAlerts(smartAlerts)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setTimeout(() => setMounted(true), 80)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { containerRef: dashRef, indicator: dashRefreshIndicator } = usePullToRefresh(load)

  const payAmt = useCountUp(mounted ? (data?.paymentsToday    || 0) : 0)
  const outAmt = useCountUp(mounted ? (data?.totalOutstanding || 0) : 0)

  const hour    = now.getHours()
  const greet   = hour < 12 ? 'सुप्रभात' : hour < 17 ? 'नमस्कार' : 'शुभ संध्याकाळ'
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString('mr-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[180, 100, 160].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 16, background: 'var(--surface)', animation: `skel 1.6s ease-in-out ${i * 0.12}s infinite` }} />
        ))}
      </div>
      <style>{`@keyframes skel{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
    </div>
  )

  const quickActions = [
    {
      label: 'डिलिव्हरी', sub: 'आजची नोंद',
      color: '#10b981', tint: 'rgba(16,185,129,0.12)', path: '/delivery',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 8h14M5 8a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2"/>
          <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      ),
    },
    {
      label: 'पैसे जमा', sub: 'Payment नोंद',
      color: '#f59e0b', tint: 'rgba(245,158,11,0.12)', path: '/bills', state: { openPayTab: true },
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <circle cx="12" cy="12" r="2.5"/>
          <path d="M6 12h.01M18 12h.01"/>
        </svg>
      ),
    },
    {
      label: 'बिल बनवा', sub: 'Generate bill',
      color: '#8b5cf6', tint: 'rgba(139,92,246,0.12)', path: '/bills',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="13" y2="17"/>
        </svg>
      ),
    },
    {
      label: 'ग्राहक', sub: 'व्यवस्थापन',
      color: '#06b6d4', tint: 'rgba(6,182,212,0.12)', path: '/customers',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        minHeight: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>🥛</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dairyName}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{dateStr}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.3, flexShrink: 0 }}>{timeStr}</div>
      </div>

      {/* flex:1 + minHeight:0 lets this div fill remaining height and scroll */}
      <div ref={dashRef} style={{ flex: 1, minHeight: 0, padding: 16, paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 36px) + 24px)', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {dashRefreshIndicator}

        {/* ── Hero Card ──────────────────────────────────────────────────────── */}
        <div
          className="dash-hero"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(12px)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 2 }}>{greet}, {user?.name || 'मालक'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 14 }}>आजचा आढावा</div>

          {/* 3 stat cells */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: productBreakdown.length > 0 ? 12 : 0 }}>
            {/* Customers served */}
            <div className="dash-stat-cell" style={{ cursor: 'pointer' }} onClick={() => navigate('/delivery')}>
              <div className="dash-stat-val" style={{ color: '#6ee7b7' }}>{data?.customersServed || 0}</div>
              <div className="dash-stat-label">ग्राहक</div>
              <div className="dash-stat-sub">/{data?.totalCustomers || 0} सक्रिय</div>
            </div>
            {/* Today payment */}
            <div className="dash-stat-cell" style={{ cursor: 'pointer' }} onClick={() => navigate('/bills', { state: { openPayTab: true } })}>
              <div className="dash-stat-val" style={{ color: '#fde68a' }}>₹{payAmt.toFixed(0)}</div>
              <div className="dash-stat-label">आजचे पैसे</div>
              <div className="dash-stat-sub">जमा झाले</div>
            </div>
            {/* Outstanding */}
            <div className="dash-stat-cell" style={{ cursor: 'pointer' }} onClick={() => navigate('/bills', { state: { openOutstandingTab: true } })}>
              <div className="dash-stat-val" style={{ color: '#fca5a5' }}>₹{outAmt.toFixed(0)}</div>
              <div className="dash-stat-label">थकबाकी</div>
              <div className="dash-stat-sub">एकूण बाकी</div>
            </div>
          </div>

          {/* Per-product delivery breakdown */}
          {productBreakdown.length > 0 && (
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: 10,
              display: 'flex', flexWrap: 'wrap', gap: 8,
            }}>
              {productBreakdown.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.08)', borderRadius: 8,
                  padding: '5px 10px',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: PRODUCT_TYPE_COLOR[p.type] || '#10b981', flexShrink: 0,
                  }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                    {p.qty % 1 === 0 ? p.qty : p.qty.toFixed(1)}{p.unit}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{p.name}</div>
                </div>
              ))}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.05)', borderRadius: 8,
                padding: '5px 10px',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {data?.customersServed || 0} ग्राहक सेवित
                </div>
              </div>
            </div>
          )}

          {/* No deliveries yet today */}
          {productBreakdown.length === 0 && (
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10,
              fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic',
            }}>
              आजची डिलिव्हरी अजून नोंदवली नाही
            </div>
          )}
        </div>

        {/* ── Smart Alerts ─────────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease 0.2s' }}>
            {alerts.map((alert, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px',
                background: alert.bg, border: `1px solid ${alert.border}`, borderRadius: 12,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{alert.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: alert.color }}>{alert.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{alert.sub}</div>
                </div>
                <button
                  onClick={() => navigate(alert.action.path, alert.action.state ? { state: alert.action.state } : undefined)}
                  style={{ background: alert.color, border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                >
                  {alert.action.label}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Quick Actions ─────────────────────────────────────────────────── */}
        <div>
          <div className="section-header" style={{ marginBottom: 10 }}>
            <span className="section-title">जलद कृती</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {quickActions.map((qa, i) => (
              <button
                key={i}
                className="quick-action-btn"
                onClick={() => navigate(qa.path, qa.state ? { state: qa.state } : undefined)}
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'none' : 'translateY(10px)',
                  transition: `opacity 0.4s ease ${i * 0.06 + 0.1}s, transform 0.4s ease ${i * 0.06 + 0.1}s`,
                }}
              >
                <div className="quick-action-icon" style={{ background: qa.tint, color: qa.color }}>
                  {qa.icon}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div className="quick-action-label">{qa.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{qa.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Recent Activity ───────────────────────────────────────────────── */}
        <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease 0.35s' }}>
          <div className="section-header" style={{ marginBottom: 10 }}>
            <span className="section-title">अलीकडील नोंदी</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => navigate('/delivery')} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}>
                सर्व पाहा →
              </button>
              <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}>
                ↻
              </button>
            </div>
          </div>

          {recentActivity.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" style={{ fontSize: 28 }}>🥛</div>
              <div className="empty-state-title">आजची नोंद नाही</div>
              <div className="empty-state-sub">डिलिव्हरी नोंद करा किंवा पैसे जमा करा</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentActivity.map((a, i) => {
                const isDelivery = a.type === 'delivery'
                const prodColor  = PRODUCT_TYPE_COLOR[a.productType] || '#10b981'
                const prodTint   = PRODUCT_TYPE_TINT[a.productType]  || 'rgba(16,185,129,0.15)'
                const sessionIcon = a.session === 'morning' ? '☀️' : '🌙'

                const handleActivityClick = () => {
                  if (!a.customerId) return
                  // delivery → CustomerProfile deliveries tab (1), payment → payments tab (2)
                  navigate(`/customers/${a.customerId}`, { state: { tab: isDelivery ? 1 : 2 } })
                }

                return (
                  <div key={i} onClick={handleActivityClick} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px',
                    background: 'var(--surface)', borderRadius: 12,
                    border: '1px solid var(--border)',
                    cursor: a.customerId ? 'pointer' : 'default',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'background 0.15s',
                  }}>
                    {/* Avatar — product-colored for deliveries, yellow for payments */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0,
                      background: isDelivery ? prodTint : 'rgba(245,158,11,0.15)',
                      color:      isDelivery ? prodColor : 'var(--yellow)',
                    }}>
                      {isDelivery ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M3 12h18M3 18h18"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>
                        </svg>
                      )}
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Customer name */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.customerName}
                      </div>
                      {/* Product info / payment info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                        {isDelivery ? (
                          <>
                            {/* Product color dot + name */}
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: prodColor, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.productName}</span>
                            <span style={{ fontSize: 11, color: 'var(--text2)' }}>·</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: prodColor }}>
                              {a.qty % 1 === 0 ? a.qty : Number(a.qty).toFixed(1)}{a.unit}
                            </span>
                            <span style={{ fontSize: 11 }}>{sessionIcon}</span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow)' }}>₹{a.amount}</span>
                            {a.mode && <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {a.mode}</span>}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status badge + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span className={`badge ${a.status === 'delivered' || a.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>
                        {a.status === 'delivered' ? 'दिले' : a.status === 'paid' ? 'जमा' : a.status}
                      </span>
                      {a.customerId && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

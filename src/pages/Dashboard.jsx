import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatCurrency, todayStr } from '../utils.js'
import { PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'
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
      const settings = await db.settings.toArray()
      const settingsMap = {}
      for (const s of settings) settingsMap[s.key] = s.value
      if (settingsMap.dairy_name) setDairyName(settingsMap.dairy_name)

      const [customers, deliveries, payments, bills, allPayments, products] = await Promise.all([
        db.customers.toArray(),
        db.deliveries.where('date').equals(today).toArray(),
        db.payments.where('date').equals(today).toArray(),
        db.monthly_bills.toArray(),
        db.payments.toArray(),
        db.products.toArray(),
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
          prodTotals[d.product_id] = { name: prod.name, type: prod.product_type, unit: prod.unit, qty: 0 }
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
            customerName: c?.name || 'ग्राहक',
            productName:  prod?.name || 'दूध',
            productType:  prod?.product_type || 'milk_buffalo',
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
            customerName: c?.name || 'ग्राहक',
            amount:       p.amount,
            mode:         p.mode,
            status:       'paid',
          }
        }),
      ]
        .sort(() => -1)  // keep deliveries first, payments after
        .slice(0, 6)

      setData({ customersServed, totalCustomers: activeCustomers.length, paymentsToday, totalOutstanding })
      setRecentActivity(activity)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setTimeout(() => setMounted(true), 80)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
      color: '#f59e0b', tint: 'rgba(245,158,11,0.12)', path: '/bills',
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 16px', minHeight: 56,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.3 }}>{timeStr}</div>
          <button
            onClick={logout}
            title="लॉगआउट"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

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
            <div className="dash-stat-cell">
              <div className="dash-stat-val" style={{ color: '#6ee7b7' }}>{data?.customersServed || 0}</div>
              <div className="dash-stat-label">ग्राहक</div>
              <div className="dash-stat-sub">/{data?.totalCustomers || 0} सक्रिय</div>
            </div>
            {/* Today payment */}
            <div className="dash-stat-cell">
              <div className="dash-stat-val" style={{ color: '#fde68a' }}>₹{payAmt.toFixed(0)}</div>
              <div className="dash-stat-label">आजचे पैसे</div>
              <div className="dash-stat-sub">जमा झाले</div>
            </div>
            {/* Outstanding */}
            <div className="dash-stat-cell">
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
                onClick={() => navigate(qa.path)}
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
            <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}>
              ↻ रिफ्रेश
            </button>
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

                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px',
                    background: 'var(--surface)', borderRadius: 12,
                    border: '1px solid var(--border)',
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

                    {/* Status badge */}
                    <span className={`badge ${a.status === 'delivered' || a.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>
                      {a.status === 'delivered' ? 'दिले' : a.status === 'paid' ? 'जमा' : a.status}
                    </span>
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

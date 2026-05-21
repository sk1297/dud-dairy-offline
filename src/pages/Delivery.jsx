import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header.jsx'
import TextInput from '../components/TextInput.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { todayStr } from '../utils.js'
import { upsertDelivery, getDeliveriesForDate } from '../services/deliveryService.js'
import { getActiveCustomers, addCustomer } from '../services/customerService.js'
import { getAreas } from '../services/areaService.js'
import { getProducts, getCustomerProducts, addCustomerProduct, PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'

const STATUS_LABELS = { delivered: 'दिले', pending: 'बाकी', skip: 'सुट्टी', partial: 'कमी' }
const STATUS_COLORS = { delivered: 'green', pending: 'yellow', skip: 'gray', partial: 'blue' }

// ── QuickAdd: minimal customer + today delivery in one modal ─────────────────
function QuickAddModal({ products, areas, date, session, onClose, onSaved, show }) {
  const milkProds = products.filter(p => p.type === 'milk_buffalo' || p.type === 'milk_cow')
  const [form, setForm] = useState({
    name: '', mobile: '', area_id: '',
    product_id: milkProds[0]?.id || '',
    morning_qty: '', evening_qty: '', rate: String(milkProds[0]?.default_rate || 62),
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const selProd = products.find(p => p.id === parseInt(form.product_id))

  const handleProductChange = (id) => {
    const p = products.find(p => p.id === parseInt(id))
    setForm(f => ({ ...f, product_id: id, rate: String(p?.default_rate || 62) }))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())                             e.name = 'नाव आवश्यक आहे'
    if (!form.product_id)                              e.product_id = 'उत्पादन निवडा'
    if (!form.morning_qty && !form.evening_qty)        e.qty = 'किमान एक प्रमाण टाका'
    if (!form.rate || parseFloat(form.rate) <= 0)     e.rate = 'दर टाका'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const mq = parseFloat(form.morning_qty) || 0
      const eq = parseFloat(form.evening_qty) || 0
      const custId = await addCustomer({
        name:        form.name.trim(),
        mobile:      form.mobile.trim(),
        address:     '',
        area_id:     form.area_id ? parseInt(form.area_id) : null,
        product_id:  parseInt(form.product_id),
        morning_qty: mq,
        evening_qty: eq,
        rate:        parseFloat(form.rate),
        status:      'active',
        start_date:  date,
      })

      // Auto-mark today's delivery for this session
      const qty = session === 'morning' ? mq : eq
      if (qty > 0) {
        await upsertDelivery(custId, parseInt(form.product_id), date, session, { qty, status: 'delivered', notes: '' })
      }

      show(`${form.name.trim()} जोडले आणि आज दिले नोंद झाली ✓`, 'success')
      onSaved()
      onClose()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">⚡ नवीन ग्राहक + आज दिले</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '4px 0' }}>

          {/* Name */}
          <div className="form-group">
            <label className="form-label">ग्राहकाचे नाव *</label>
            <TextInput className={`form-input${errors.name ? ' error' : ''}`} placeholder="उदा. रमेश पाटील"
              value={form.name} onChange={e => { setForm(f=>({...f,name:e.target.value})); setErrors(p=>({...p,name:''})) }} autoFocus />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>

          {/* Mobile + Area */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">मोबाईल</label>
              <input className="form-input" type="tel" inputMode="numeric" maxLength={10} placeholder="वैकल्पिक"
                value={form.mobile} onChange={e => setForm(f=>({...f,mobile:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">भाग</label>
              <select className="form-input" value={form.area_id} onChange={e => setForm(f=>({...f,area_id:e.target.value}))}>
                <option value="">निवडा</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Product toggle */}
          <div className="form-group">
            <label className="form-label">दुधाचा प्रकार *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {milkProds.map(p => {
                const sel   = parseInt(form.product_id) === p.id
                const color = PRODUCT_TYPE_COLOR[p.type]
                const tint  = PRODUCT_TYPE_TINT[p.type]
                return (
                  <button key={p.id} type="button" onClick={() => handleProductChange(String(p.id))}
                    style={{ background: sel ? tint : 'var(--surface2)', border: `1.5px solid ${sel ? color : 'var(--border)'}`,
                      borderRadius: 10, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                      color: sel ? color : 'var(--text2)', fontWeight: sel ? 700 : 500, fontSize: 14 }}>
                    <span style={{ fontSize: 20 }}>{p.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>{p.name}
                  </button>
                )
              })}
            </div>
            {errors.product_id && <div className="form-error">{errors.product_id}</div>}
          </div>

          {/* Qty + Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">☀️ सकाळ ({selProd?.unit||'L'})</label>
              <input className="form-input" type="number" step="0.5" min="0" placeholder="0"
                value={form.morning_qty} onChange={e => { setForm(f=>({...f,morning_qty:e.target.value})); setErrors(p=>({...p,qty:''})) }} />
            </div>
            <div className="form-group">
              <label className="form-label">🌙 संध्या ({selProd?.unit||'L'})</label>
              <input className="form-input" type="number" step="0.5" min="0" placeholder="0"
                value={form.evening_qty} onChange={e => { setForm(f=>({...f,evening_qty:e.target.value})); setErrors(p=>({...p,qty:''})) }} />
            </div>
            <div className="form-group">
              <label className="form-label">दर (₹)</label>
              <input className={`form-input${errors.rate ? ' error' : ''}`} type="number" step="0.5" min="0"
                value={form.rate} onChange={e => { setForm(f=>({...f,rate:e.target.value})); setErrors(p=>({...p,rate:''})) }} />
            </div>
          </div>
          {errors.qty && <div className="form-error" style={{ marginTop: -6 }}>{errors.qty}</div>}

          {/* Info hint */}
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 12, color: '#6ee7b7' }}>
            ⚡ ग्राहक जोडला जाईल आणि आजची <strong>{session === 'morning' ? 'सकाळची' : 'संध्याकाळची'}</strong> डिलिव्हरी आपोआप "दिले" म्हणून नोंद होईल.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>रद्द</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                जोडा + दिले नोंद करा
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ExtraProduct: add a one-time or permanent extra product from delivery page ─
function ExtraProductModal({ customer, products, session, date, onClose, onSaved, show }) {
  // All products EXCEPT customer's primary — so cow+buffalo can both be subscribed
  const availableProds = products.filter(p => p.id !== customer.product_id)
  const [productId, setProductId] = useState(availableProds[0]?.id ? String(availableProds[0].id) : '')
  const [qty,       setQty]       = useState('')
  const [permanent, setPermanent] = useState(false)
  const [saving,    setSaving]    = useState(false)

  const selProd = products.find(p => p.id === parseInt(productId))

  const handleSave = async () => {
    const q = parseFloat(qty)
    if (!productId)       { show('उत्पादन निवडा', 'warning'); return }
    if (!q || q <= 0)     { show('प्रमाण टाका', 'warning'); return }

    setSaving(true)
    try {
      if (permanent) {
        // Add to customer subscription
        await addCustomerProduct({
          customer_id: customer.id,
          product_id:  parseInt(productId),
          morning_qty: session === 'morning' ? q : 0,
          evening_qty: session === 'evening' ? q : 0,
          rate: selProd?.default_rate || 0,
        })
      }
      // Record today's delivery
      await upsertDelivery(customer.id, parseInt(productId), date, session, { qty: q, status: 'delivered', notes: '' })
      show(`${customer.name} — ${selProd?.name} ${permanent ? 'खात्यात जोडले +' : ''} आज दिले ✓`, 'success')
      onSaved()
      onClose()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">📦 एक्स्ट्रा उत्पादन — {customer.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>

          {/* Product selector */}
          <div className="form-group">
            <label className="form-label">उत्पादन *</label>
            {availableProds.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text2)', padding: '10px 0' }}>
                कोणतेही अतिरिक्त उत्पादन उपलब्ध नाही.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availableProds.map(p => {
                  const sel   = parseInt(productId) === p.id
                  const color = PRODUCT_TYPE_COLOR[p.type] || 'var(--accent)'
                  const tint  = PRODUCT_TYPE_TINT[p.type]  || 'rgba(16,185,129,0.12)'
                  const emoji = p.type === 'milk_buffalo' ? '🐃' : p.type === 'milk_cow' ? '🐄' : '📦'
                  return (
                    <button key={p.id} type="button" onClick={() => setProductId(String(p.id))}
                      style={{
                        padding: '8px 14px', borderRadius: 10,
                        border: `1.5px solid ${sel ? color : 'var(--border)'}`,
                        background: sel ? tint : 'var(--surface2)',
                        color: sel ? color : 'var(--text)', fontWeight: sel ? 700 : 500,
                        fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                      <span>{emoji}</span>
                      <span>{p.name}</span>
                      {p.default_rate ? <span style={{ fontSize: 11, opacity: 0.7 }}>₹{p.default_rate}/{p.unit}</span> : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Qty */}
          <div className="form-group">
            <label className="form-label">
              {session === 'morning' ? '☀️ सकाळ' : '🌙 संध्याकाळ'} प्रमाण ({selProd?.unit || 'kg'}) *
            </label>
            <input
              className="form-input" type="number" step="0.5" min="0"
              placeholder="0.5" value={qty} onChange={e => setQty(e.target.value)} autoFocus
            />
          </div>

          {/* Permanent toggle */}
          <button
            type="button"
            onClick={() => setPermanent(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
              background: permanent ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
              border: `1.5px solid ${permanent ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
              borderRadius: 10, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, border: `2px solid ${permanent ? 'var(--green)' : 'var(--border)'}`,
              background: permanent ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {permanent && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: permanent ? 'var(--green)' : 'var(--text)' }}>
                नेहमीसाठी खात्यात जोडा
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {permanent ? 'खात्यात सदस्यता जोडली जाईल + आजची डिलिव्हरी नोंद होईल' : 'फक्त आजच्या डिलिव्हरीसाठी — खात्यात बदल नाही'}
              </div>
            </div>
          </button>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>रद्द</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || availableProds.length === 0}>
            {saving ? <span className="spinner" /> : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                {permanent ? 'जोडा + दिले नोंद करा' : 'फक्त आज दिले नोंद करा'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DeliveryRow: big tap-to-deliver + overflow for other options ─────────────
function DeliveryRow({ label, delivery, onMark, isExtra, productType }) {
  const [showOptions, setShowOptions] = useState(false)
  const [dropPos,     setDropPos]     = useState({ top: 0, right: 0 })
  const btnRef = React.useRef(null)
  const status = delivery?.status

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setDropPos({
        top:   spaceBelow > 180 ? rect.bottom + 6 : rect.top - 6,
        right: window.innerWidth - rect.right,
        openUp: spaceBelow <= 180,
      })
    }
    setShowOptions(true)
  }

  // Color config
  const statusStyle = {
    delivered: { bg: 'rgba(16,185,129,0.15)', color: 'var(--green)',  border: 'rgba(16,185,129,0.4)' },
    pending:   { bg: 'rgba(245,158,11,0.12)', color: 'var(--yellow)', border: 'rgba(245,158,11,0.4)' },
    skip:      { bg: 'rgba(148,163,184,0.1)', color: 'var(--text2)', border: 'rgba(148,163,184,0.3)' },
    partial:   { bg: 'rgba(59,130,246,0.12)', color: 'var(--blue)',   border: 'rgba(59,130,246,0.4)' },
  }
  const sty = statusStyle[status] || { bg: 'var(--surface2)', color: 'var(--text2)', border: 'var(--border)' }

  return (
    <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Main big tap button — toggles delivered/pending */}
        <button
          onClick={() => onMark(status === 'delivered' ? 'pending' : 'delivered')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            background: sty.bg, border: `1.5px solid ${sty.border}`,
            borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {/* Status icon */}
          <div style={{ width: 28, height: 28, borderRadius: 8, background: sty.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {status === 'delivered' ? '✅' : status === 'skip' ? '⏭' : status === 'partial' ? '🔢' : '⬜'}
          </div>
          {/* Label + status */}
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
              {isExtra && (
                <span style={{ fontSize: 13 }}>
                  {productType === 'milk_buffalo' ? '🐃' : productType === 'milk_cow' ? '🐄' : '📦'}
                </span>
              )}
              {label}
            </div>
            <div style={{ fontSize: 11, color: sty.color, fontWeight: 700, marginTop: 1 }}>
              {status ? `${STATUS_LABELS[status]}${delivery?.qty > 0 && status !== 'delivered' ? ` — ${delivery.qty}` : ''}` : 'नोंद नाही — टॅप करा'}
            </div>
          </div>
          {/* Tap hint for unrecorded */}
          {!status && (
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
              दिले ↗
            </div>
          )}
        </button>

        {/* More options button */}
        <button
          ref={btnRef}
          onClick={openMenu}
          style={{ width: 36, height: 44, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="5"  r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>
          </svg>
        </button>

        {showOptions && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowOptions(false)} />
            <div style={{
              position: 'fixed',
              top:   dropPos.openUp ? 'auto' : dropPos.top,
              bottom: dropPos.openUp ? window.innerHeight - dropPos.top : 'auto',
              right: dropPos.right,
              zIndex: 100,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 150, overflow: 'hidden',
            }}>
              {[
                { s: 'delivered', emoji: '✅', label: 'दिले'  },
                { s: 'pending',   emoji: '⬜', label: 'बाकी'   },
                { s: 'partial',   emoji: '🔢', label: 'कमी प्रमाण' },
                { s: 'skip',      emoji: '⏭', label: 'सुट्टी' },
              ].map(btn => (
                <button key={btn.s}
                  onClick={() => { onMark(btn.s); setShowOptions(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '11px 14px', background: status === btn.s ? 'rgba(16,185,129,0.1)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    color: status === btn.s ? 'var(--accent)' : 'var(--text)', fontWeight: status === btn.s ? 700 : 500, fontSize: 13,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{btn.emoji}</span>{btn.label}
                  {status === btn.s && <svg style={{ marginLeft: 'auto' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Delivery() {
  const { show } = useToast()
  const [session,       setSession]       = useState('morning')
  const [selectedArea,  setSelectedArea]  = useState('all')
  const [date,          setDate]          = useState(todayStr())
  const [customers,     setCustomers]     = useState([])
  const [deliveries,    setDeliveries]    = useState({})
  const [areas,         setAreas]         = useState([])
  const [products,      setProducts]      = useState([])
  const [custExtraSubs, setCustExtraSubs] = useState({})
  const [loading,       setLoading]       = useState(true)
  const [partialModal,  setPartialModal]  = useState(null)
  const [partialQty,    setPartialQty]    = useState('')
  const [quickAddOpen,  setQuickAddOpen]  = useState(false)
  const [extraModal,    setExtraModal]    = useState(null)  // { customer }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [custs, areaList, delivList, prodList] = await Promise.all([
        getActiveCustomers(), getAreas(), getDeliveriesForDate(date), getProducts()
      ])
      setCustomers(custs)
      setAreas(areaList)
      setProducts(prodList)

      const map = {}
      for (const d of delivList) {
        map[`${d.customer_id}_${d.product_id || 1}_${d.session}`] = d
      }
      setDeliveries(map)

      const subsMap = {}
      for (const c of custs) {
        const subs = await getCustomerProducts(c.id)
        if (subs.length > 0) subsMap[c.id] = subs
      }
      setCustExtraSubs(subsMap)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const getProductById = (id) => products.find(p => p.id === id)

  const getDefaultQty = (customer, productId, isPrimary) => {
    if (isPrimary) return session === 'morning' ? (customer.morning_qty || 0) : (customer.evening_qty || 0)
    const sub = (custExtraSubs[customer.id] || []).find(s => s.product_id === productId)
    if (!sub) return 0
    return session === 'morning' ? (sub.morning_qty || 0) : (sub.evening_qty || 0)
  }

  const markStatus = async (customer, productId, status, defaultQty) => {
    if (defaultQty === 0 && status === 'delivered') {
      show(`या ग्राहकाचे ${session === 'morning' ? 'सकाळचे' : 'संध्याकाळचे'} प्रमाण शून्य आहे`, 'warning')
      return
    }
    const qty = status === 'delivered' ? defaultQty : status === 'partial' ? parseFloat(partialQty) || 0 : 0
    try {
      await upsertDelivery(customer.id, productId, date, session, { qty, status, notes: '' })
      const key = `${customer.id}_${productId}_${session}`
      setDeliveries(prev => ({ ...prev, [key]: { customer_id: customer.id, product_id: productId, date, session, qty, status } }))
      if (status !== 'partial') show(`${customer.name} — ${STATUS_LABELS[status]}`, 'success')
    } catch (err) {
      show('Error: ' + err.message, 'error')
    }
  }

  const markAllDelivered = async () => {
    let count = 0
    for (const c of filteredCustomers) {
      const pQty = getDefaultQty(c, c.product_id, true)
      if (pQty > 0) {
        await upsertDelivery(c.id, c.product_id, date, session, { qty: pQty, status: 'delivered', notes: '' })
        count++
      }
      for (const sub of (custExtraSubs[c.id] || [])) {
        const eQty = session === 'morning' ? (sub.morning_qty || 0) : (sub.evening_qty || 0)
        if (eQty > 0) {
          await upsertDelivery(c.id, sub.product_id, date, session, { qty: eQty, status: 'delivered', notes: '' })
          count++
        }
      }
    }
    await load()
    show(`${count} नोंदी दिले म्हणून केल्या`, 'success')
  }

  const handlePartialSave = async () => {
    const qty = parseFloat(partialQty)
    if (!qty || qty <= 0) { show('प्रमाण टाका', 'warning'); return }
    const { customer, product } = partialModal
    await upsertDelivery(customer.id, product.id, date, session, { qty, status: 'partial', notes: '' })
    const key = `${customer.id}_${product.id}_${session}`
    setDeliveries(prev => ({ ...prev, [key]: { customer_id: customer.id, product_id: product.id, date, session, qty, status: 'partial' } }))
    show(`${customer.name} — ${product.name} कमी प्रमाण नोंद झाली`, 'success')
    setPartialModal(null); setPartialQty('')
  }

  const filteredCustomers = customers.filter(c =>
    selectedArea === 'all' || c.area_id === parseInt(selectedArea)
  )

  const summary = filteredCustomers.reduce((s, c) => {
    const key = `${c.id}_${c.product_id || 1}_${session}`
    const d = deliveries[key]
    if (d?.status === 'delivered' || d?.status === 'partial') {
      s.delivered++
      const prod = getProductById(c.product_id)
      if (!prod || prod.unit === 'L') s.liters += (d.qty || 0)
    }
    // Also count extra milk product deliveries
    for (const sub of (custExtraSubs[c.id] || [])) {
      const subKey = `${c.id}_${sub.product_id}_${session}`
      const sd = deliveries[subKey]
      if (sd?.status === 'delivered' || sd?.status === 'partial') {
        const subProd = getProductById(sub.product_id)
        if (!subProd || subProd.unit === 'L') s.liters += (sd.qty || 0)
      }
    }
    return s
  }, { delivered: 0, liters: 0 })

  // Count how many still have no record at all (not even pending)
  const noRecordCount = filteredCustomers.filter(c => {
    const key = `${c.id}_${c.product_id || 1}_${session}`
    return !deliveries[key]
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(var(--nav-h) + 60px)' }}>

      <Header
        title="डिलिव्हरी"
        icon="🥛"
        subtitle={`${date} · ${session === 'morning' ? '☀️ सकाळ' : '🌙 संध्याकाळ'}`}
        rightContent={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setQuickAddOpen(true)}
            style={{ gap: 5 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + नोंद
          </button>
        }
      />

      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Date + Session */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ flex: 1 }} value={date} onChange={e => setDate(e.target.value)} />
          <div className="segment" style={{ minWidth: 160 }}>
            {['morning', 'evening'].map(s => (
              <button key={s} className={`segment-btn${session === s ? ' active' : ''}`} onClick={() => setSession(s)}>
                {s === 'morning' ? '☀️ सकाळ' : '🌙 सं.'}
              </button>
            ))}
          </div>
        </div>

        {/* Area chips */}
        <div className="chip-row">
          <button className={`chip${selectedArea === 'all' ? ' active' : ''}`} onClick={() => setSelectedArea('all')}>
            सर्व ({customers.length})
          </button>
          {areas.map(a => {
            const cnt = customers.filter(c => c.area_id === a.id).length
            return (
              <button key={a.id} className={`chip${selectedArea === String(a.id) ? ' active' : ''}`} onClick={() => setSelectedArea(String(a.id))}>
                {a.name} ({cnt})
              </button>
            )
          })}
        </div>

        {/* Mark All button */}
        <button onClick={markAllDelivered} style={{
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 10, padding: '10px 16px', color: 'var(--green)', fontWeight: 700, fontSize: 13,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          सर्वांना दिले म्हणून नोंद करा
        </button>
      </div>

      {/* Delivery list */}
      <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, color: 'var(--text2)' }}>
            <span className="spinner" /> लोड होत आहे...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div className="empty-state-title">ग्राहक नाही</div>
            <div className="empty-state-sub">वर + नवीन ग्राहक बटण दाबा</div>
          </div>
        ) : filteredCustomers.map(c => {
          const primaryProduct  = getProductById(c.product_id)
          const primaryQty      = getDefaultQty(c, c.product_id, true)
          const primaryKey      = `${c.id}_${c.product_id || 1}_${session}`
          const primaryDelivery = deliveries[primaryKey]
          const areaName        = areas.find(a => a.id === c.area_id)?.name || ''
          const extraSubs       = custExtraSubs[c.id] || []
          const isDone          = primaryDelivery?.status === 'delivered'

          return (
            <div key={c.id} style={{
              background: 'var(--surface)',
              border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
              borderRadius: 14,
              transition: 'border-color 0.2s',
            }}>
              {/* Customer header */}
              <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Done indicator dot */}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isDone ? 'var(--green)' : 'var(--border)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                    {areaName && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{areaName}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {primaryProduct && (
                    <span className="badge" style={{ background: PRODUCT_TYPE_TINT[primaryProduct.type], color: PRODUCT_TYPE_COLOR[primaryProduct.type] }}>
                      {primaryProduct.type === 'milk_buffalo' ? '🐃' : '🐄'} {primaryProduct.name}
                    </span>
                  )}
                  <button
                    title="एक्स्ट्रा उत्पादन जोडा"
                    onClick={() => setExtraModal({ customer: c })}
                    style={{
                      border: '1px solid var(--border)', borderRadius: 8,
                      background: 'var(--surface2)', color: 'var(--text2)',
                      padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    एक्स्ट्रा
                  </button>
                </div>
              </div>

              {/* Primary delivery row */}
              {primaryQty > 0 && (
                <DeliveryRow
                  label={`${primaryProduct?.name || 'दूध'} — ${primaryQty}${primaryProduct?.unit || 'L'}`}
                  delivery={primaryDelivery}
                  onMark={(status) => {
                    if (status === 'partial') {
                      setPartialModal({ customer: c, product: primaryProduct, defaultQty: primaryQty })
                      setPartialQty(String(primaryQty))
                      return
                    }
                    markStatus(c, c.product_id, status, primaryQty)
                  }}
                />
              )}

              {/* Extra product rows */}
              {extraSubs.filter(sub => (session === 'morning' ? sub.morning_qty : sub.evening_qty) > 0).map(sub => {
                const prod      = getProductById(sub.product_id)
                const subQty    = session === 'morning' ? sub.morning_qty : sub.evening_qty
                const subDelivery = deliveries[`${c.id}_${sub.product_id}_${session}`]
                return (
                  <DeliveryRow
                    key={sub.id || sub.product_id}
                    label={`${prod?.name || '—'} — ${subQty}${prod?.unit || 'kg'}`}
                    delivery={subDelivery}
                    isExtra
                    productType={prod?.type}
                    onMark={(status) => {
                      if (status === 'partial') {
                        setPartialModal({ customer: c, product: prod, defaultQty: subQty })
                        setPartialQty(String(subQty))
                        return
                      }
                      markStatus(c, sub.product_id, status, subQty)
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Summary Footer */}
      <div style={{
        position: 'fixed', bottom: 'var(--nav-h)', left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '10px 24px', display: 'flex', gap: 20, justifyContent: 'center', zIndex: 30,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{summary.liters.toFixed(1)}L</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>एकूण लिटर</div>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
            {summary.delivered}/{filteredCustomers.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>ग्राहक</div>
        </div>
        {noRecordCount > 0 && (
          <>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{noRecordCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>नोंद नाही</div>
            </div>
          </>
        )}
      </div>

      {/* Extra Product Modal */}
      {extraModal && (
        <ExtraProductModal
          customer={extraModal.customer}
          products={products}
          session={session}
          date={date}
          onClose={() => setExtraModal(null)}
          onSaved={load}
          show={show}
        />
      )}

      {/* Quick Add Modal */}
      {quickAddOpen && (
        <QuickAddModal
          products={products}
          areas={areas}
          date={date}
          session={session}
          onClose={() => setQuickAddOpen(false)}
          onSaved={load}
          show={show}
        />
      )}

      {/* Partial Qty Modal */}
      {partialModal && (
        <div className="modal-backdrop" onClick={() => setPartialModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">कमी प्रमाण</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', marginBottom: 14 }}>
              {partialModal.customer.name} — {partialModal.product?.name}
            </div>
            <div className="form-group">
              <label className="form-label">प्रत्यक्ष प्रमाण ({partialModal.product?.unit || 'L'})</label>
              <input className="form-input" type="number" step="0.5" min="0" value={partialQty}
                onChange={e => setPartialQty(e.target.value)} placeholder="0.5" autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPartialModal(null)}>रद्द</button>
              <button className="btn btn-primary" onClick={handlePartialSave}>जतन करा</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

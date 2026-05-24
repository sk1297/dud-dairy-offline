import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import TextInput from '../components/TextInput.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { todayStr } from '../utils.js'
import { upsertDelivery, getDeliveriesForDate } from '../services/deliveryService.js'
import { getActiveCustomers, addCustomer } from '../services/customerService.js'
import { getAreas } from '../services/areaService.js'
import { getProducts, addCustomerProduct, PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'
import db from '../db/database.js'

const STATUS_LABELS = { delivered: 'दिले', pending: 'बाकी', skip: 'सुट्टी', partial: 'कमी' }

// ── Date helpers ─────────────────────────────────────────────────────────────
const addDays = (dateStr, n) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
const formatDateLabel = (dateStr) => {
  const today = todayStr()
  if (dateStr === today)            return 'आज'
  if (dateStr === addDays(today,-1)) return 'काल'
  if (dateStr === addDays(today, 1)) return 'उद्या'
  const d = new Date(dateStr)
  const days   = ['रवि','सोम','मंगळ','बुध','गुरु','शुक्र','शनि']
  const months = ['जाने','फेब्रु','मार्च','एप्रिल','मे','जून','जुलै','ऑग','सप्टे','ऑक्टो','नोव्हे','डिसे']
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
}

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
    if (!form.name.trim())                         e.name = 'नाव आवश्यक आहे'
    if (!form.product_id)                          e.product_id = 'उत्पादन निवडा'
    if (!form.morning_qty && !form.evening_qty)    e.qty = 'किमान एक प्रमाण टाका'
    if (!form.rate || parseFloat(form.rate) <= 0)  e.rate = 'दर टाका'
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
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9, padding: '9px 12px', fontSize: 12, color: '#6ee7b7' }}>
            ⚡ ग्राहक जोडला जाईल आणि आजची <strong>{session === 'morning' ? 'सकाळची' : 'संध्याकाळची'}</strong> डिलिव्हरी आपोआप "दिले" म्हणून नोंद होईल.
          </div>
          <div className="form-group">
            <label className="form-label">ग्राहकाचे नाव *</label>
            <TextInput className={`form-input${errors.name ? ' error' : ''}`} placeholder="उदा. रमेश पाटील"
              value={form.name} onChange={e => { setForm(f=>({...f,name:e.target.value})); setErrors(p=>({...p,name:''})) }} autoFocus />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">मोबाईल</label>
              <input className="form-input" type="tel" inputMode="numeric" maxLength={10} placeholder="वैकल्पिक"
                value={form.mobile} onChange={e => setForm(f=>({...f,mobile:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">भाग</label>
              <BottomPicker
                className="form-input"
                options={[{ label:'निवडा', value:'' }, ...areas.map(a=>({ label:a.name, value:String(a.id) }))]}
                value={form.area_id}
                onChange={val=>setForm(f=>({...f,area_id:val}))}
                placeholder="निवडा"
              />
            </div>
          </div>
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

// ── ExtraProduct modal ────────────────────────────────────────────────────────
function ExtraProductModal({ customer, products, session, date, onClose, onSaved, show }) {
  const availableProds = products.filter(p => p.id !== customer.product_id)
  const [productId, setProductId] = useState(availableProds[0]?.id ? String(availableProds[0].id) : '')
  const [qty,       setQty]       = useState('')
  const [permanent, setPermanent] = useState(false)
  const [saving,    setSaving]    = useState(false)

  const selProd = products.find(p => p.id === parseInt(productId))

  const handleSave = async () => {
    const q = parseFloat(qty)
    if (!productId)   { show('उत्पादन निवडा', 'warning'); return }
    if (!q || q <= 0) { show('प्रमाण टाका', 'warning'); return }
    setSaving(true)
    try {
      if (permanent) {
        await addCustomerProduct({
          customer_id: customer.id,
          product_id:  parseInt(productId),
          morning_qty: session === 'morning' ? q : 0,
          evening_qty: session === 'evening' ? q : 0,
          rate: selProd?.default_rate || 0,
        })
      }
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
          <div className="form-group">
            <label className="form-label">
              {session === 'morning' ? '☀️ सकाळ' : '🌙 संध्याकाळ'} प्रमाण ({selProd?.unit || 'kg'}) *
            </label>
            <input
              className="form-input" type="number" step="0.5" min="0"
              placeholder="0.5" value={qty} onChange={e => setQty(e.target.value)} autoFocus
            />
          </div>
          <button type="button" onClick={() => setPermanent(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
              background: permanent ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
              border: `1.5px solid ${permanent ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
              borderRadius: 10, cursor: 'pointer', textAlign: 'left',
            }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6, border: `2px solid ${permanent ? 'var(--green)' : 'var(--border)'}`,
              background: permanent ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {permanent && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: permanent ? 'var(--green)' : 'var(--text)' }}>नेहमीसाठी खात्यात जोडा</div>
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Delivery() {
  const navigate = useNavigate()
  const { show } = useToast()
  const dateInputRef = useRef(null)

  const [session,       setSession]       = useState('morning')
  const [selectedArea,  setSelectedArea]  = useState('all')
  const [date,          setDate]          = useState(todayStr())
  const [customers,     setCustomers]     = useState([])
  const [deliveries,    setDeliveries]    = useState({})
  const [areas,         setAreas]         = useState([])
  const [products,      setProducts]      = useState([])
  const [custExtraSubs, setCustExtraSubs] = useState({})
  const [dairyName,     setDairyName]     = useState('दूध डेअरी')
  const [loading,       setLoading]       = useState(true)
  const [partialModal,  setPartialModal]  = useState(null)
  const [partialQty,    setPartialQty]    = useState('')
  const [quickAddOpen,  setQuickAddOpen]  = useState(false)
  const [extraModal,    setExtraModal]    = useState(null)
  const [editQtyModal,  setEditQtyModal]  = useState(null)
  const [editQtyVal,    setEditQtyVal]    = useState('')
  const [undoBar,       setUndoBar]       = useState(null)
  const [deleteDeliveryId, setDeleteDeliveryId] = useState(null)
  const [viewMode,    setViewMode]    = useState(() => localStorage.getItem('delivery_view') || 'grid')
  const [optionsModal, setOptionsModal] = useState(null) // { customer, primaryProduct, primaryDelivery, primaryKey, primaryQty }

  const toggleView = (mode) => { setViewMode(mode); localStorage.setItem('delivery_view', mode) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [custs, areaList, delivList, prodList, settingRow] = await Promise.all([
        getActiveCustomers(), getAreas(), getDeliveriesForDate(date), getProducts(),
        db.first("SELECT value FROM settings WHERE key = 'dairy_name' LIMIT 1"),
      ])
      setCustomers(custs)
      setAreas(areaList)
      setProducts(prodList)
      if (settingRow?.value) setDairyName(settingRow.value)

      const map = {}
      for (const d of delivList) {
        map[`${d.customer_id}_${d.product_id || 1}_${d.session}`] = d
      }
      setDeliveries(map)

      const subsMap = {}
      const [allSubs, allProducts] = await Promise.all([
        db.query('SELECT * FROM customer_products'),
        db.query('SELECT * FROM products'),
      ])
      const productById = {}
      for (const p of allProducts) productById[p.id] = p
      for (const s of allSubs) {
        if (!subsMap[s.customer_id]) subsMap[s.customer_id] = []
        subsMap[s.customer_id].push({ ...s, product: productById[s.product_id] })
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

  const clearDelivery = useCallback(async (deliveryId, key) => {
    if (deliveryId) await db.run('DELETE FROM deliveries WHERE id = ?', [deliveryId])
    setDeliveries(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    show('नोंद साफ केली', 'success')
  }, [show])

  const markAllDelivered = async () => {
    const snapshot = { ...deliveries }
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
    setUndoBar({ date, session, snapshot })
    setTimeout(() => setUndoBar(null), 12000)
  }

  const handleUndoMarkAll = async () => {
    if (!undoBar) return
    const delivsForSession = await getDeliveriesForDate(undoBar.date)
    for (const d of delivsForSession) {
      if (d.session !== undoBar.session) continue
      const snapKey      = `${d.customer_id}_${d.product_id || 1}_${undoBar.session}`
      const snapDelivery = undoBar.snapshot[snapKey]
      if (!snapDelivery) {
        await db.run('DELETE FROM deliveries WHERE id = ?', [d.id])
      } else if (snapDelivery.status !== 'delivered') {
        await db.run('UPDATE deliveries SET status = ?, qty = ? WHERE id = ?', [snapDelivery.status, snapDelivery.qty, d.id])
      }
    }
    setUndoBar(null)
    await load()
    show('सर्व नोंदी पूर्ववत केल्या', 'success')
  }

  const handleEditQtySave = async () => {
    const qty = parseFloat(editQtyVal)
    if (!qty || qty <= 0) { show('प्रमाण टाका', 'warning'); return }
    const { customer, product } = editQtyModal
    await upsertDelivery(customer.id, product.id, date, session, { qty, status: 'delivered', notes: '' })
    const key = `${customer.id}_${product.id}_${session}`
    setDeliveries(prev => ({ ...prev, [key]: { customer_id: customer.id, product_id: product.id, date, session, qty, status: 'delivered' } }))
    show(`${customer.name} — ${qty}${product.unit || 'L'} अपडेट झाले`, 'success')
    setEditQtyModal(null); setEditQtyVal('')
  }

  const handleDeleteDelivery = async () => {
    if (!deleteDeliveryId) return
    await db.run('DELETE FROM deliveries WHERE id = ?', [deleteDeliveryId])
    setDeliveries(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (next[k]?.id === deleteDeliveryId) delete next[k]
      }
      return next
    })
    show('डिलिव्हरी नोंद हटवली', 'success')
    setDeleteDeliveryId(null)
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

  const noRecordCount = filteredCustomers.filter(c => {
    const key = `${c.id}_${c.product_id || 1}_${session}`
    return !deliveries[key]
  }).length

  const progressPct = filteredCustomers.length > 0
    ? Math.round((summary.delivered / filteredCustomers.length) * 100)
    : 0
  const remaining = filteredCustomers.length - summary.delivered

  // ── Summary stats (computed for the always-visible strip) ──
  const allDelivered = Object.values(deliveries).filter(
    d => d.date === date && d.session === session && (d.status === 'delivered' || d.status === 'partial')
  )
  const stripLitres    = allDelivered.reduce((s, d) => s + (d.qty || 0), 0)
  const stripCustomers = new Set(allDelivered.map(d => d.customer_id)).size
  const stripRevenue   = allDelivered.reduce((s, d) => {
    const c = customers.find(cu => cu.id === d.customer_id)
    return s + (d.qty || 0) * (c?.rate || 0)
  }, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 100px)' }}>

      <Header
        title="डिलिव्हरी"
        icon="🥛"
        rightContent={
          <button className="btn btn-primary btn-sm" onClick={() => setQuickAddOpen(true)} style={{ gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + नोंद
          </button>
        }
      />

      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Date navigation row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setDate(addDays(date, -1))}
            style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <button
            onClick={() => setDate(todayStr())}
            style={{
              flex: 1, height: 40, borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: date === todayStr() ? 'rgba(16,185,129,0.12)' : 'var(--surface2)',
              border: `1.5px solid ${date === todayStr() ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
              color: date === todayStr() ? 'var(--green)' : 'var(--text)',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {formatDateLabel(date)}
          </button>

          <button
            onClick={() => setDate(addDays(date, 1))}
            style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {/* Calendar icon — triggers hidden date input */}
          <button
            onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
            style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <input ref={dateInputRef} type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
        </div>

        {/* ── Session segment — tall, full-width ── */}
        <div className="segment" style={{ height: 52 }}>
          {['morning', 'evening'].map(s => (
            <button key={s} className={`segment-btn${session === s ? ' active' : ''}`}
              onClick={() => setSession(s)}
              style={{ fontSize: 15, fontWeight: 700, height: '100%' }}>
              {s === 'morning' ? '☀️ सकाळ' : '🌙 संध्याकाळ'}
            </button>
          ))}
        </div>

        {/* ── Progress bar ── */}
        {!loading && filteredCustomers.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              <span style={{ color: progressPct === 100 ? 'var(--green)' : 'var(--text)' }}>
                {progressPct === 100 ? '✓ सर्व दिले!' : `${summary.delivered} / ${filteredCustomers.length} दिले`}
              </span>
              {remaining > 0 && <span style={{ color: 'var(--yellow)' }}>{remaining} बाकी</span>}
            </div>
            <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct === 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {/* ── Area chips + view toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="chip-row" style={{ flex: 1, margin: 0 }}>
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
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {[
              { mode: 'list', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
              { mode: 'grid', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg> },
            ].map(({ mode, icon }) => (
              <button key={mode} onClick={() => toggleView(mode)} style={{
                width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: viewMode === mode ? 'var(--accent)' : 'var(--surface2)',
                color: viewMode === mode ? '#fff' : 'var(--text2)',
              }}>{icon}</button>
            ))}
          </div>
        </div>

        {/* ── Always-visible summary stats strip ── */}
        {!loading && filteredCustomers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { label: 'एकूण दूध', value: `${stripLitres % 1 === 0 ? stripLitres : stripLitres.toFixed(1)}L`, color: 'var(--accent)' },
              { label: 'दिले ✓', value: stripCustomers, color: 'var(--green)' },
              { label: 'अंदाज', value: `₹${Math.round(stripRevenue).toLocaleString('en-IN')}`, color: 'var(--text)' },
              { label: 'बाकी ⚠', value: noRecordCount, color: noRecordCount > 0 ? 'var(--yellow)' : 'var(--green)' },
            ].map((stat, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '8px 4px', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text2)', marginTop: 1 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Mark All — full-width solid green ── */}
        <button onClick={markAllDelivered} style={{
          background: 'var(--green)', border: 'none', borderRadius: 12, padding: '13px 16px',
          color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 2px 10px rgba(16,185,129,0.35)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          सर्वांना दिले करा
        </button>
      </div>

      {/* ── Customer list / grid ── */}
      <div style={{ flex: 1, padding: '10px 16px', paddingBottom: 0 }}>
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
            <div className="empty-state-sub">वर + नोंद बटण दाबा</div>
          </div>
        ) : viewMode === 'grid' ? (
          /* ══════════════ GRID VIEW ══════════════ */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: 10 }}>
            {filteredCustomers.map(c => {
              const primaryProduct  = getProductById(c.product_id)
              const primaryQty      = getDefaultQty(c, c.product_id, true)
              const primaryKey      = `${c.id}_${c.product_id || 1}_${session}`
              const primaryDelivery = deliveries[primaryKey]
              const primaryStatus   = primaryDelivery?.status
              const areaName        = areas.find(a => a.id === c.area_id)?.name || ''
              const extraSubs       = custExtraSubs[c.id] || []
              const extraCount      = extraSubs.filter(s => (session === 'morning' ? s.morning_qty : s.evening_qty) > 0).length

              // Avatar colors
              const avColors = { milk_buffalo: { bg: '#f59e0b', fg: '#1c1400' }, milk_cow: { bg: '#0ea5e9', fg: '#fff' } }
              const avCol    = avColors[primaryProduct?.type] || { bg: '#10b981', fg: '#fff' }
              const avBg     = primaryStatus === 'delivered' ? '#10b981' : primaryStatus === 'partial' ? '#3b82f6' : primaryStatus === 'skip' ? '#475569' : avCol.bg
              const avFg     = (primaryStatus === 'delivered' || primaryStatus === 'partial') ? '#fff' : primaryStatus === 'skip' ? '#fff' : avCol.fg

              // Strip + card colors
              const stripColor = primaryStatus === 'delivered' ? '#10b981' : primaryStatus === 'partial' ? '#3b82f6' : primaryStatus === 'skip' ? '#334155' : '#334155'
              const cardBg     = primaryStatus === 'delivered' ? 'rgba(16,185,129,0.07)' : primaryStatus === 'partial' ? 'rgba(59,130,246,0.07)' : 'var(--surface)'
              const cardBorder = primaryStatus === 'delivered' ? '1.5px solid rgba(16,185,129,0.35)' : primaryStatus === 'partial' ? '1.5px solid rgba(59,130,246,0.3)' : '1px solid var(--border)'

              // Action button
              const btnBg    = primaryStatus === 'delivered' ? '#10b981' : primaryStatus === 'partial' ? '#3b82f6' : primaryStatus === 'skip' ? 'rgba(148,163,184,0.15)' : 'transparent'
              const btnColor = (primaryStatus === 'delivered' || primaryStatus === 'partial') ? '#fff' : primaryStatus === 'skip' ? 'var(--text2)' : '#10b981'
              const btnBorder= (primaryStatus === 'delivered' || primaryStatus === 'partial') ? 'none' : primaryStatus === 'skip' ? '1px solid rgba(148,163,184,0.4)' : '1.5px solid rgba(16,185,129,0.5)'
              const btnLabel = primaryStatus === 'delivered' ? `✓ ${Number(primaryDelivery?.qty||0).toFixed(1)}L`
                : primaryStatus === 'partial' ? `≈ ${Number(primaryDelivery?.qty||0).toFixed(1)}L`
                : primaryStatus === 'skip' ? '⏭ सुट्टी'
                : 'दिले ✓'

              return (
                <div key={c.id} style={{ position: 'relative', background: cardBg, border: cardBorder, borderRadius: 16, overflow: 'hidden', height: 186, display: 'flex', flexDirection: 'column', opacity: primaryStatus === 'skip' ? 0.7 : 1, transition: 'all 0.2s' }}>

                  {/* Status strip */}
                  <div style={{ height: 5, background: primaryStatus === 'delivered' ? '#10b981' : primaryStatus === 'partial' ? '#3b82f6' : 'var(--border)', flexShrink: 0 }} />

                  {/* Delivered watermark */}
                  {primaryStatus === 'delivered' && (
                    <svg style={{ position: 'absolute', right: -8, top: 12, opacity: 0.07, pointerEvents: 'none' }} width="90" height="90" viewBox="0 0 24 24" fill="#10b981"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                  )}

                  {/* ⋮ options */}
                  <button
                    onClick={e => { e.stopPropagation(); setOptionsModal({ customer: c, primaryProduct, primaryDelivery, primaryKey, primaryQty }) }}
                    style={{ position: 'absolute', top: 8, right: 6, width: 28, height: 28, borderRadius: 7, background: 'rgba(0,0,0,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: primaryStatus === 'delivered' ? 'rgba(255,255,255,0.7)' : 'var(--text2)', zIndex: 2 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                  </button>

                  {/* Main tap area */}
                  <button
                    onClick={() => {
                      if (primaryStatus === 'skip') { clearDelivery(primaryDelivery?.id, primaryKey); return }
                      if (!primaryStatus)            { markStatus(c, c.product_id, 'delivered', primaryQty); return }
                      setEditQtyModal({ customer: c, product: primaryProduct })
                      setEditQtyVal(String(primaryDelivery?.qty || primaryQty))
                    }}
                    style={{ flex: 1, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '4px 8px 0' }}
                  >
                    {/* Avatar */}
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: avBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: avFg, marginBottom: 2, flexShrink: 0, transition: 'background 0.2s' }}>
                      {primaryStatus === 'delivered'
                        ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : primaryStatus === 'partial'
                        ? <span style={{ fontSize: 22, fontWeight: 900 }}>≈</span>
                        : primaryStatus === 'skip'
                        ? <span style={{ fontSize: 20, fontWeight: 800 }}>—</span>
                        : <span style={{ fontSize: 20, fontWeight: 800 }}>{c.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    {/* Name */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'center', lineHeight: 1.25, maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.name}</div>
                    {/* Area */}
                    {areaName && <div style={{ fontSize: 10, color: 'var(--text2)', textAlign: 'center' }}>📍 {areaName}</div>}
                    {/* Product + qty */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: primaryStatus === 'delivered' ? '#10b981' : primaryStatus === 'partial' ? '#3b82f6' : 'var(--text2)', textAlign: 'center', marginTop: 1 }}>
                      {primaryProduct?.type === 'milk_buffalo' ? '🐃' : '🐄'} {primaryQty}{primaryProduct?.unit || 'L'}
                      {extraCount > 0 && <span style={{ marginLeft: 4, fontSize: 9, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', color: 'var(--text2)' }}>+{extraCount}</span>}
                    </div>
                  </button>

                  {/* Action button */}
                  <div style={{ padding: '6px 8px 8px', flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        if (primaryStatus === 'skip') { clearDelivery(primaryDelivery?.id, primaryKey); return }
                        if (!primaryStatus)            { markStatus(c, c.product_id, 'delivered', primaryQty); return }
                        setEditQtyModal({ customer: c, product: primaryProduct })
                        setEditQtyVal(String(primaryDelivery?.qty || primaryQty))
                      }}
                      style={{ width: '100%', height: 36, borderRadius: 10, background: btnBg, border: btnBorder, color: btnColor, fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                    >{btnLabel}</button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ══════════════ LIST VIEW ══════════════ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 10 }}>
          {filteredCustomers.map(c => {
          const primaryProduct  = getProductById(c.product_id)
          const primaryQty      = getDefaultQty(c, c.product_id, true)
          const primaryKey      = `${c.id}_${c.product_id || 1}_${session}`
          const primaryDelivery = deliveries[primaryKey]
          const primaryStatus   = primaryDelivery?.status
          const areaName        = areas.find(a => a.id === c.area_id)?.name || ''
          const extraSubs       = custExtraSubs[c.id] || []
          const activeExtraSubs = extraSubs.filter(sub => (session === 'morning' ? sub.morning_qty : sub.evening_qty) > 0)

          // ── Avatar color by product type ──
          const avatarColors = {
            milk_buffalo: { bg: '#f59e0b', color: '#1c1400' },
            milk_cow:     { bg: '#0ea5e9', color: '#fff'    },
          }
          const avCol = avatarColors[primaryProduct?.type] || { bg: 'var(--accent)', color: '#fff' }

          // ── Avatar content by status ──
          const avatarContent = primaryStatus === 'delivered'
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : primaryStatus === 'partial'
            ? <span style={{ fontSize: 18, fontWeight: 900 }}>≈</span>
            : primaryStatus === 'skip'
            ? <span style={{ fontSize: 20, fontWeight: 900 }}>—</span>
            : <span style={{ fontSize: 17, fontWeight: 800 }}>{c.name.charAt(0).toUpperCase()}</span>

          const avatarBg = primaryStatus === 'delivered' ? '#10b981'
            : primaryStatus === 'partial' ? '#3b82f6'
            : primaryStatus === 'skip' ? 'rgba(148,163,184,0.3)'
            : avCol.bg

          // ── Card wrapper style by status ──
          const cardBg = primaryStatus === 'delivered' ? 'rgba(16,185,129,0.05)'
            : primaryStatus === 'partial' ? 'rgba(59,130,246,0.05)'
            : 'var(--surface)'
          const cardBorder = primaryStatus === 'delivered' ? '1.5px solid rgba(16,185,129,0.4)'
            : primaryStatus === 'partial' ? '1.5px solid rgba(59,130,246,0.35)'
            : '1px solid var(--border)'

          // ── Right tap zone ──
          const tapBg = primaryStatus === 'delivered' ? '#10b981'
            : primaryStatus === 'partial' ? '#3b82f6'
            : primaryStatus === 'skip' ? 'rgba(148,163,184,0.15)'
            : 'transparent'
          const tapBorder = primaryStatus === 'delivered' ? 'none'
            : primaryStatus === 'partial' ? 'none'
            : primaryStatus === 'skip' ? '1px solid rgba(148,163,184,0.3)'
            : '1.5px solid rgba(16,185,129,0.5)'

          const whatsappMsg = (() => {
            const delivQty  = primaryDelivery?.qty || primaryQty
            const prodName  = primaryProduct?.name || 'दूध'
            const unit      = primaryProduct?.unit || 'L'
            const sessLabel = session === 'morning' ? '☀️ सकाळ' : '🌙 संध्याकाळ'
            return `🥛 नमस्कार ${c.name} जी!\n\nआपले दूध पोहोचले ✓\n${sessLabel}: ${delivQty}${unit} ${prodName}\nदिनांक: ${date}\n\n— ${dairyName}`
          })()

          // ── Helper: render one delivery row (primary + extra subs) ──
          const renderDeliveryRow = ({ key, delivery, status, qty, product, customer: cust, isSub }) => {
            const rowTapBg = status === 'delivered' ? '#10b981'
              : status === 'partial' ? '#3b82f6'
              : status === 'skip' ? 'rgba(148,163,184,0.15)'
              : 'transparent'
            const rowTapBorder = status === 'delivered' ? 'none'
              : status === 'partial' ? 'none'
              : status === 'skip' ? '1px solid rgba(148,163,184,0.3)'
              : '1.5px solid rgba(6,182,212,0.5)'
            const rowTapColor = (status === 'delivered' || status === 'partial') ? '#fff'
              : status === 'skip' ? 'var(--text2)' : '#06b6d4'

            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'stretch',
                borderTop: '1px solid var(--border)',
                background: isSub ? 'rgba(6,182,212,0.03)' : 'transparent',
              }}>
                {/* Sub left info */}
                <div style={{ flex: 1, padding: '8px 10px 8px 12px', display: 'flex', alignItems: 'center', gap: 8, opacity: status === 'skip' ? 0.5 : 1 }}>
                  <span style={{ fontSize: 16 }}>{product?.type === 'milk_buffalo' ? '🐃' : product?.type === 'milk_cow' ? '🐄' : '📦'}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{product?.name || 'दूध'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {status === 'delivered' ? `✓ ${Number(delivery?.qty || 0).toFixed(1)}${product?.unit || 'L'} दिले` :
                       status === 'partial'   ? `≈ ${Number(delivery?.qty || 0).toFixed(1)}${product?.unit || 'L'} दिले` :
                       status === 'skip'      ? 'सुट्टी' :
                       `${qty}${product?.unit || 'L'} द्यायचे`}
                    </div>
                  </div>
                </div>
                {/* Sub tap zone */}
                <button
                  onClick={() => {
                    if (status === 'skip') { clearDelivery(delivery?.id, key); return }
                    if (!status) { markStatus(cust, product.id, 'delivered', qty); return }
                    setEditQtyModal({ customer: cust, product })
                    setEditQtyVal(String(delivery?.qty || qty))
                  }}
                  style={{
                    width: 72, background: rowTapBg, border: 'none', borderLeft: rowTapBorder,
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 2, color: rowTapColor, fontWeight: 700,
                    borderRadius: '0 0 0 0', transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                >
                  {status === 'delivered' ? <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 9 }}>दिले</span>
                  </> : status === 'partial' ? <>
                    <span style={{ fontSize: 16 }}>≈</span>
                    <span style={{ fontSize: 9 }}>{Number(delivery?.qty || 0).toFixed(1)}L</span>
                  </> : status === 'skip' ? <>
                    <span style={{ fontSize: 16 }}>⏭</span>
                    <span style={{ fontSize: 9 }}>सुट्टी</span>
                  </> : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 9 }}>दिले</span>
                  </>}
                </button>
                {/* Sub secondary chips */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '6px 6px 6px 0' }}>
                  <button onClick={() => markStatus(cust, product.id, 'skip', qty)}
                    style={{ padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>⏭</button>
                  <button onClick={() => { setPartialModal({ customer: cust, product, defaultQty: qty }); setPartialQty(String(qty)) }}
                    style={{ padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>≈</button>
                </div>
              </div>
            )
          }

          return (
            <div key={c.id} style={{
              background: cardBg,
              border: cardBorder,
              borderRadius: 14,
              overflow: 'hidden',
              transition: 'background 0.2s, border-color 0.2s',
            }}>

              {/* ── Main row: avatar + info + tap zone ── */}
              <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 80 }}>

                {/* Avatar */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px 0 12px', flexShrink: 0 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: avatarBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: (primaryStatus === 'delivered' || primaryStatus === 'partial') ? '#fff' : avCol.color,
                    flexShrink: 0, transition: 'background 0.2s',
                  }}>
                    {avatarContent}
                  </div>
                </div>

                {/* Info column — tappable to navigate */}
                <div
                  onClick={() => navigate(`/customers/${c.id}`)}
                  style={{ flex: 1, padding: '10px 8px 10px 8px', cursor: 'pointer', minWidth: 0, opacity: primaryStatus === 'skip' ? 0.5 : 1 }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  {areaName && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>📍 {areaName}</div>}
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{primaryProduct?.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                    <span style={{ fontWeight: 600 }}>{primaryQty}{primaryProduct?.unit || 'L'}</span>
                    {primaryStatus === 'delivered' && (
                      <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>· ✓ {Number(primaryDelivery?.qty || 0).toFixed(1)}L दिले</span>
                    )}
                    {primaryStatus === 'partial' && (
                      <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: 11 }}>· ≈ {Number(primaryDelivery?.qty || 0).toFixed(1)}L</span>
                    )}
                  </div>
                  {/* WhatsApp — shown below name when delivered + has mobile */}
                  {primaryStatus === 'delivered' && c.mobile && (
                    <button
                      onClick={e => { e.stopPropagation(); window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(whatsappMsg)}`, '_blank') }}
                      style={{ marginTop: 4, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    >💬 WhatsApp</button>
                  )}
                </div>

                {/* Right tap zone — the PRIMARY action */}
                <button
                  onClick={() => {
                    if (primaryStatus === 'skip') { clearDelivery(primaryDelivery?.id, primaryKey); return }
                    if (!primaryStatus) { markStatus(c, c.product_id, 'delivered', primaryQty); return }
                    setEditQtyModal({ customer: c, product: primaryProduct })
                    setEditQtyVal(String(primaryDelivery?.qty || primaryQty))
                  }}
                  style={{
                    width: 80, background: tapBg, border: 'none', borderLeft: tapBorder,
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 4, transition: 'all 0.2s', flexShrink: 0,
                    borderRadius: '0 14px 14px 0',
                  }}
                >
                  {primaryStatus === 'delivered' ? (
                    <>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>दिले</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{Number(primaryDelivery?.qty || 0).toFixed(1)}L</span>
                    </>
                  ) : primaryStatus === 'partial' ? (
                    <>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>≈</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{Number(primaryDelivery?.qty || 0).toFixed(1)}L</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>दिले</span>
                    </>
                  ) : primaryStatus === 'skip' ? (
                    <>
                      <span style={{ fontSize: 22 }}>⏭</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>सुट्टी</span>
                    </>
                  ) : (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,0.9)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(16,185,129,0.9)' }}>दिले</span>
                      <span style={{ fontSize: 9, color: 'var(--text2)' }}>{primaryQty}L</span>
                    </>
                  )}
                </button>
              </div>

              {/* Extra subscription rows */}
              {activeExtraSubs.map(sub => {
                const prod        = getProductById(sub.product_id)
                const subQty      = session === 'morning' ? sub.morning_qty : sub.evening_qty
                const subKey      = `${c.id}_${sub.product_id}_${session}`
                const subDelivery = deliveries[subKey]
                const subStatus   = subDelivery?.status
                return renderDeliveryRow({ key: subKey, delivery: subDelivery, status: subStatus, qty: subQty, product: prod, customer: c, isSub: true })
              })}

              {/* Options strip — single ⋮ button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 8px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                <button
                  onClick={() => setOptionsModal({ customer: c, primaryProduct, primaryDelivery, primaryKey, primaryQty })}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                  पर्याय
                </button>
                {primaryStatus === 'delivered' && c.mobile && (() => {
                  const delivQty  = primaryDelivery?.qty || primaryQty
                  const prodName  = primaryProduct?.name || 'दूध'
                  const unit      = primaryProduct?.unit || 'L'
                  const sessLabel = session === 'morning' ? '☀️ सकाळ' : '🌙 संध्याकाळ'
                  const msg = `🥛 नमस्कार ${c.name} जी!\n\nआपले दूध पोहोचले ✓\n${sessLabel}: ${delivQty}${unit} ${prodName}\nदिनांक: ${date}\n\n— ${dairyName}`
                  return (
                    <button onClick={() => window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(msg)}`, '_blank')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366' }}>
                      💬 WhatsApp
                    </button>
                  )
                })()}
              </div>
            </div>
          )
        })}
          </div>
        )}
      </div>

      {/* Undo bar */}
      {undoBar && (
        <div style={{
          position: 'fixed', bottom: `calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 64px)`, left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)', maxWidth: 398,
          background: '#1e293b', border: '1.5px solid rgba(16,185,129,0.4)',
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 40, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>सर्व "{undoBar.session === 'morning' ? 'सकाळ' : 'संध्याकाळ'}" नोंदी दिले केल्या</div>
          <button onClick={handleUndoMarkAll}
            style={{ background: 'rgba(16,185,129,0.15)', border: '1.5px solid rgba(16,185,129,0.5)', borderRadius: 10, padding: '7px 14px', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            ↩ पूर्ववत
          </button>
        </div>
      )}

      {/* Fixed footer */}
      <div style={{
        position: 'fixed', bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)',
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
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{summary.delivered}/{filteredCustomers.length}</div>
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

      {/* ── Options Bottom Sheet ── */}
      {optionsModal && (() => {
        const { customer: oc, primaryProduct: op, primaryDelivery: od, primaryKey: ok, primaryQty: oq } = optionsModal
        const ocStatus = od?.status
        return (
          <div className="modal-backdrop" onClick={() => setOptionsModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ paddingBottom: 8 }}>
              <div className="modal-handle" />
              <div style={{ padding: '4px 4px 12px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{oc.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {op?.type === 'milk_buffalo' ? '🐃' : '🐄'} {op?.name} · {oq}{op?.unit || 'L'}
                  {ocStatus && <span style={{ marginLeft: 8, fontWeight: 700, color: ocStatus === 'delivered' ? 'var(--green)' : ocStatus === 'partial' ? '#3b82f6' : 'var(--text2)' }}>· {STATUS_LABELS[ocStatus]}</span>}
                </div>
              </div>
              {[
                { icon: '⏭', label: 'सुट्टी — आज वगळा', color: 'var(--text2)', action: () => { markStatus(oc, oc.product_id, 'skip', oq); setOptionsModal(null) } },
                { icon: '≈', label: 'कमी प्रमाण द्या', color: '#3b82f6', action: () => { setPartialModal({ customer: oc, product: op, defaultQty: oq }); setPartialQty(String(oq)); setOptionsModal(null) } },
                { icon: '📦', label: 'एक्स्ट्रा उत्पादन जोडा', color: 'var(--accent)', action: () => { setExtraModal({ customer: oc }); setOptionsModal(null) } },
                ...(od?.id ? [{ icon: '🗑️', label: 'नोंद हटवा', color: 'var(--red)', action: () => { setDeleteDeliveryId(od.id); setOptionsModal(null) } }] : []),
              ].map((opt, i) => (
                <button key={i} onClick={opt.action} style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  padding: '13px 4px', background: 'transparent', border: 'none',
                  borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', color: opt.color, fontSize: 14, fontWeight: 600,
                }}>
                  <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

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

      {/* Edit Quantity Modal */}
      {editQtyModal && (
        <div className="modal-backdrop" onClick={() => setEditQtyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">✏️ प्रमाण बदला</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', marginBottom: 14 }}>
              {editQtyModal.customer.name} — {editQtyModal.product?.name}
            </div>
            <div className="form-group">
              <label className="form-label">नवीन प्रमाण ({editQtyModal.product?.unit || 'L'})</label>
              <input className="form-input" type="number" step="0.5" min="0" value={editQtyVal}
                onChange={e => setEditQtyVal(e.target.value)} autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditQtyModal(null)}>रद्द</button>
              <button className="btn btn-primary" onClick={handleEditQtySave}>जतन करा</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Delivery Confirm */}
      {deleteDeliveryId && (
        <div className="modal-backdrop" onClick={() => setDeleteDeliveryId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">नोंद हटवायची का?</div>
            <p className="confirm-msg" style={{ textAlign: 'center', padding: '8px 0 16px' }}>ही डिलिव्हरी नोंद कायमची हटेल.</p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteDeliveryId(null)}>नाही</button>
              <button className="btn btn-danger" onClick={handleDeleteDelivery}>हो, हटवा</button>
            </div>
          </div>
        </div>
      )}

      {/* Partial Qty Modal */}
      {partialModal && (
        <div className="modal-backdrop" onClick={() => setPartialModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">≈ कमी प्रमाण</div>
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

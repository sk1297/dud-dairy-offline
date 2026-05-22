import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import TextInput from '../components/TextInput.jsx'
import Modal from '../components/Modal.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import { useToast } from '../context/ToastContext.jsx'
import db from '../db/database.js'
import { getAreas } from '../services/areaService.js'
import { getCustomers, addCustomer, updateCustomer, deleteCustomer } from '../services/customerService.js'
import { getProducts, getCustomerProducts, addCustomerProduct, deleteCustomerProduct, PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'
import { upsertDelivery } from '../services/deliveryService.js'
import { todayStr, getInitials } from '../utils.js'

const STATUS_LABELS = { active: 'सक्रिय', paused: 'थांबले', stopped: 'बंद' }
const STATUS_COLORS = { active: 'green',  paused: 'yellow',  stopped: 'red'  }

const EMPTY_FORM = {
  name: '', mobile: '', address: '', area_id: '',
  product_id: '',        // primary product (milk type)
  morning_qty: '', evening_qty: '', rate: '',
  status: 'active', start_date: todayStr(),
}

export default function Customers() {
  const { show } = useToast()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [areas,     setAreas]     = useState([])
  const [products,  setProducts]  = useState([])  // all active products
  const [search,    setSearch]    = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [modal,     setModal]     = useState(null)  // 'add' | 'edit' | 'delete'
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [errors,    setErrors]    = useState({})
  const [saving,    setSaving]    = useState(false)
  const [defaultRate, setDefaultRate] = useState('62')
  const [todayDelivered, setTodayDelivered] = useState({}) // { custId: bool }

  // Extra product subscriptions (for add/edit modal)
  const [extraSubs,    setExtraSubs]    = useState([])  // existing saved subs
  const [newExtraSub,  setNewExtraSub]  = useState({ product_id: '', morning_qty: '', evening_qty: '', rate: '' })
  const [showExtraForm, setShowExtraForm] = useState(false)

  const load = useCallback(async () => {
    const [custs, areaList, prodList] = await Promise.all([getCustomers(), getAreas(), getProducts()])
    setCustomers(custs)
    setAreas(areaList)
    setProducts(prodList)
    const rateSetting = await db.first("SELECT value FROM settings WHERE key = 'default_rate' LIMIT 1")
    if (rateSetting) setDefaultRate(rateSetting.value)
    // Load today's morning deliveries
    const today = todayStr()
    const deliveries = await db.query('SELECT * FROM deliveries WHERE date = ?', [today])
    const map = {}
    deliveries.forEach(d => { if (d.session === 'morning' && d.status === 'delivered') map[d.customer_id] = true })
    setTodayDelivered(map)
  }, [])

  useEffect(() => { load() }, [load])

  const { containerRef: custListRef, indicator: custRefreshIndicator } = usePullToRefresh(load)

  // Milk products only (for primary product selector)
  const milkProducts = products.filter(p => p.type === 'milk_buffalo' || p.type === 'milk_cow')
  // All products EXCEPT the currently selected primary — so cow+buffalo can both be subscribed
  const extraProducts = products.filter(p => p.id !== parseInt(form.product_id || '0'))

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.mobile && c.mobile.includes(search))
    const matchArea   = areaFilter === 'all' || c.area_id === parseInt(areaFilter)
    return matchSearch && matchArea
  })

  const openAdd = () => {
    const defaultMilk = milkProducts[0]
    setForm({ ...EMPTY_FORM, product_id: defaultMilk?.id || '', rate: defaultMilk?.default_rate || defaultRate })
    setErrors({})
    setExtraSubs([])
    setNewExtraSub({ product_id: '', morning_qty: '', evening_qty: '', rate: '' })
    setShowExtraForm(false)
    setModal('add')
  }

  const openEdit = async (c) => {
    setSelected(c)
    setForm({
      name: c.name, mobile: c.mobile || '', address: c.address || '',
      area_id: c.area_id || '', product_id: c.product_id || milkProducts[0]?.id || '',
      morning_qty: c.morning_qty || '', evening_qty: c.evening_qty || '',
      rate: c.rate || defaultRate, status: c.status || 'active', start_date: c.start_date || todayStr(),
    })
    setErrors({})
    setShowExtraForm(false)
    setNewExtraSub({ product_id: '', morning_qty: '', evening_qty: '', rate: '' })
    // Load existing extra subscriptions
    const subs = await getCustomerProducts(c.id)
    setExtraSubs(subs)
    setModal('edit')
  }

  const [deleteBillCount, setDeleteBillCount] = useState(0)

  const openDelete = async (c) => {
    setSelected(c)
    const bills = await db.query('SELECT id FROM monthly_bills WHERE customer_id = ?', [c.id])
    setDeleteBillCount(bills.length)
    setModal('delete')
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())  e.name = 'नाव आवश्यक आहे'
    if (form.mobile && !/^\d{10}$/.test(form.mobile.trim())) e.mobile = '१० अंकी मोबाईल नंबर टाका'
    if (!form.product_id)   e.product_id = 'दुधाचा प्रकार निवडा'
    if (!form.rate)         e.rate = 'दर आवश्यक आहे'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const data = {
        name:        form.name.trim(),
        mobile:      form.mobile.trim(),
        address:     form.address.trim(),
        area_id:     form.area_id ? parseInt(form.area_id) : null,
        product_id:  parseInt(form.product_id),
        morning_qty: parseFloat(form.morning_qty) || 0,
        evening_qty: parseFloat(form.evening_qty) || 0,
        rate:        parseFloat(form.rate) || parseFloat(defaultRate),
        status:      form.status,
        start_date:  form.start_date,
      }
      let custId
      if (modal === 'add') {
        custId = await addCustomer(data)
        // Save any queued extra product subscriptions
        for (const sub of extraSubs.filter(s => s._temp)) {
          await addCustomerProduct({
            customer_id: custId,
            product_id:  sub.product_id,
            morning_qty: sub.morning_qty,
            evening_qty: sub.evening_qty,
            rate:        sub.rate,
          })
        }
        show('ग्राहक जोडला गेला', 'success')
      } else {
        custId = selected.id
        await updateCustomer(selected.id, data)
        show('माहिती अपडेट झाली', 'success')
      }
      setModal(null)
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteCustomer(selected.id)
      show('ग्राहक हटवला गेला', 'success')
      setModal(null)
      load()
    } catch (err) {
      show(err.message, 'error')
    }
  }

  // Add an extra product subscription
  const handleAddExtraSub = async () => {
    if (!newExtraSub.product_id) { show('उत्पादन निवडा', 'warning'); return }
    if (!newExtraSub.rate)       { show('दर टाका', 'warning'); return }
    if (modal === 'edit' && selected) {
      // Save immediately for edit mode
      await addCustomerProduct({
        customer_id: selected.id,
        product_id:  parseInt(newExtraSub.product_id),
        morning_qty: parseFloat(newExtraSub.morning_qty) || 0,
        evening_qty: parseFloat(newExtraSub.evening_qty) || 0,
        rate:        parseFloat(newExtraSub.rate),
      })
      const subs = await getCustomerProducts(selected.id)
      setExtraSubs(subs)
      show('उत्पादन जोडले', 'success')
    } else {
      // For add mode, just queue it — save after customer is created
      const product = products.find(p => p.id === parseInt(newExtraSub.product_id))
      setExtraSubs(prev => [...prev, {
        _temp: true,
        product_id: parseInt(newExtraSub.product_id),
        product,
        morning_qty: parseFloat(newExtraSub.morning_qty) || 0,
        evening_qty: parseFloat(newExtraSub.evening_qty) || 0,
        rate: parseFloat(newExtraSub.rate),
      }])
    }
    setNewExtraSub({ product_id: '', morning_qty: '', evening_qty: '', rate: '' })
    setShowExtraForm(false)
  }

  const handleRemoveExtraSub = async (sub) => {
    if (sub._temp) {
      setExtraSubs(prev => prev.filter(s => s !== sub))
    } else {
      await deleteCustomerProduct(sub.id)
      const subs = await getCustomerProducts(selected.id)
      setExtraSubs(subs)
      show('उत्पादन हटवले', 'success')
    }
  }

  // When new extra sub product changes, auto-fill rate
  const handleExtraProductChange = (productId) => {
    const prod = products.find(p => p.id === parseInt(productId))
    setNewExtraSub(prev => ({ ...prev, product_id: productId, rate: prod?.default_rate || '' }))
  }

  // When primary product changes, auto-fill rate
  const handlePrimaryProductChange = (productId) => {
    const prod = products.find(p => p.id === parseInt(productId))
    setForm(prev => ({ ...prev, product_id: productId, rate: prod?.default_rate || prev.rate }))
    setErrors(prev => ({ ...prev, product_id: '' }))
  }

  const f = (k) => ({
    value: form[k],
    onChange: e => { setForm(p => ({ ...p, [k]: e.target.value })); setErrors(p => ({ ...p, [k]: '' })) }
  })

  const primaryProduct = products.find(p => p.id === parseInt(form.product_id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))' }}>
      <Header
        title="ग्राहक"
        icon="👥"
        subtitle={`${customers.filter(c => c.status === 'active').length} सक्रिय · ${customers.length} एकूण`}
        rightContent={
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            नवीन
          </button>
        }
      />

      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Search */}
        <div className="search-bar">
          <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <TextInput placeholder="नाव किंवा मोबाईल शोधा..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Summary strip */}
        {customers.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'सक्रिय',  count: customers.filter(c => c.status === 'active').length,  color: 'var(--green)',  bg: 'rgba(16,185,129,0.1)' },
              { label: 'थांबले',  count: customers.filter(c => c.status === 'paused').length,  color: 'var(--yellow)', bg: 'rgba(234,179,8,0.1)'   },
              { label: 'बंद',     count: customers.filter(c => c.status === 'stopped').length, color: 'var(--red)',    bg: 'rgba(239,68,68,0.1)'   },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 10, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Area Filter chips */}
        <div className="chip-row">
          <button className={`chip${areaFilter === 'all' ? ' active' : ''}`} onClick={() => setAreaFilter('all')}>सर्व ({customers.length})</button>
          {areas.map(a => {
            const count = customers.filter(c => c.area_id === a.id).length
            return (
              <button key={a.id} className={`chip${areaFilter === String(a.id) ? ' active' : ''}`} onClick={() => setAreaFilter(String(a.id))}>
                {a.name} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Customer List */}
      <div ref={custListRef} style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {custRefreshIndicator}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
            <div className="empty-state-title">ग्राहक नाही</div>
            <div className="empty-state-sub">नवीन ग्राहक जोडण्यासाठी + बटण दाबा</div>
          </div>
        ) : filtered.map(c => {
          const areaName  = areas.find(a => a.id === c.area_id)?.name || ''
          const prod      = products.find(p => p.id === c.product_id)
          const prodColor = prod ? PRODUCT_TYPE_COLOR[prod.type] : 'var(--text2)'
          const prodTint  = prod ? PRODUCT_TYPE_TINT[prod.type]  : 'var(--surface2)'
          const delivered = todayDelivered[c.id]
          return (
            <div
              key={c.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                display: 'flex',
              }}
            >
              {/* Left accent bar */}
              <div style={{ width: 4, flexShrink: 0, background: prodColor, opacity: c.status === 'stopped' ? 0.25 : c.status === 'paused' ? 0.5 : 1 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Main body — tappable to profile */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px 11px', cursor: 'pointer' }}
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  {/* Avatar with color ring */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 14,
                      background: prodTint,
                      border: `2px solid ${prodColor}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 17, fontWeight: 800, color: prodColor,
                      boxShadow: `0 0 0 3px ${prodColor}18`,
                    }}>
                      {getInitials(c.name)}
                    </div>
                    {/* Delivered dot indicator */}
                    {delivered && (
                      <div style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'var(--green)', border: '2px solid var(--surface)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, color: '#fff', fontWeight: 900,
                      }}>✓</div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span className={`badge badge-${STATUS_COLORS[c.status]}`} style={{ flexShrink: 0 }}>{STATUS_LABELS[c.status]}</span>
                    </div>

                    {/* Delivery row */}
                    {prod && (
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 12 }}>{prod.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: prodColor }}>{prod.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--border)' }}>│</span>
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>☀️ {c.morning_qty || 0}{prod.unit}</span>
                        <span style={{ fontSize: 10, color: 'var(--border)' }}>·</span>
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>🌙 {c.evening_qty || 0}{prod.unit}</span>
                        <span style={{ fontSize: 10, color: 'var(--border)' }}>│</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: prodColor }}>₹{c.rate}/{prod.unit}</span>
                      </div>
                    )}

                    {/* Contact row */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {areaName && <span style={{ fontSize: 11, color: 'var(--text2)' }}>📍 {areaName}</span>}
                      {c.mobile  && <span style={{ fontSize: 11, color: 'var(--text2)' }}>📱 {c.mobile}</span>}
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--border)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                </div>

                {/* Bottom action strip */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 12px 8px',
                  borderTop: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.15)',
                }}>
                  {/* Quick deliver toggle */}
                  <button
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      border: `1.5px solid ${delivered ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: delivered ? 'rgba(16,185,129,0.15)' : 'transparent',
                      color: delivered ? 'var(--green)' : 'var(--text2)',
                      transition: 'all 0.18s',
                    }}
                    onClick={async (e) => {
                      e.stopPropagation()
                      const newStatus = delivered ? 'pending' : 'delivered'
                      await upsertDelivery(c.id, c.product_id, todayStr(), 'morning', {
                        qty: newStatus === 'delivered' ? (c.morning_qty || 0) : 0,
                        status: newStatus, notes: ''
                      })
                      setTodayDelivered(prev => ({ ...prev, [c.id]: newStatus === 'delivered' }))
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{delivered ? '✅' : '🥛'}</span>
                    {delivered ? 'दिले' : 'दे'}
                  </button>

                  {/* Edit + Delete */}
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center' }}
                      onClick={() => openEdit(c)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 10, color: 'var(--red)', display: 'flex', alignItems: 'center' }}
                      onClick={() => openDelete(c)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Add / Edit Modal ── */}
      <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'add' ? 'नवीन ग्राहक' : 'ग्राहक माहिती बदला'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '...' : 'जतन करा'}</button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
          {/* Name */}
          <div className="form-group">
            <label className="form-label">नाव *</label>
            <TextInput className={`form-input${errors.name ? ' error' : ''}`} placeholder="ग्राहकाचे पूर्ण नाव" {...f('name')} />
            {errors.name && <div className="form-error">{errors.name}</div>}
          </div>

          {/* Mobile */}
          <div className="form-group">
            <label className="form-label">मोबाईल</label>
            <input className={`form-input${errors.mobile ? ' error' : ''}`} type="tel" inputMode="numeric" maxLength={10} placeholder="१० अंकी नंबर" {...f('mobile')} />
            {errors.mobile && <div className="form-error">{errors.mobile}</div>}
          </div>

          {/* Address */}
          <div className="form-group">
            <label className="form-label">पत्ता</label>
            <TextInput className="form-input" placeholder="घराचा पत्ता" {...f('address')} />
          </div>

          {/* Area */}
          <div className="form-group">
            <label className="form-label">भाग / क्षेत्र</label>
            <BottomPicker
              className="form-input"
              options={[{ label:'भाग नाही', value:'' }, ...areas.map(a=>({ label:a.name, value:String(a.id) }))]}
              value={form.area_id}
              onChange={val=>{ setForm(p=>({...p,area_id:val})); setErrors(p=>({...p,area_id:''})) }}
              placeholder="भाग निवडा"
            />
          </div>

          {/* Primary Product — milk type */}
          <div className="form-group">
            <label className="form-label">दुधाचा प्रकार *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {milkProducts.map(p => {
                const isSelected = parseInt(form.product_id) === p.id
                const color = PRODUCT_TYPE_COLOR[p.type]
                const tint  = PRODUCT_TYPE_TINT[p.type]
                return (
                  <button
                    key={p.id} type="button"
                    onClick={() => handlePrimaryProductChange(String(p.id))}
                    style={{
                      background: isSelected ? tint : 'var(--surface2)',
                      border: `1.5px solid ${isSelected ? color : 'var(--border)'}`,
                      borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: isSelected ? color : 'var(--text2)',
                      fontWeight: isSelected ? 700 : 500, fontSize: 14,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{p.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                    {p.name}
                  </button>
                )
              })}
            </div>
            {errors.product_id && <div className="form-error">{errors.product_id}</div>}
          </div>

          {/* Qty + Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">सकाळ ({primaryProduct?.unit || 'L'})</label>
              <input className="form-input" type="number" step="0.5" min="0" placeholder="0" {...f('morning_qty')} />
            </div>
            <div className="form-group">
              <label className="form-label">संध्याकाळ ({primaryProduct?.unit || 'L'})</label>
              <input className="form-input" type="number" step="0.5" min="0" placeholder="0" {...f('evening_qty')} />
            </div>
            <div className="form-group">
              <label className="form-label">दर (₹/{primaryProduct?.unit || 'L'}) *</label>
              <input className={`form-input${errors.rate ? ' error' : ''}`} type="number" step="0.5" min="0" placeholder="62" {...f('rate')} />
              {errors.rate && <div className="form-error">{errors.rate}</div>}
            </div>
          </div>

          {/* Status + Start Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">स्थिती</label>
              <BottomPicker
                className="form-input"
                options={[
                  { label:'सक्रिय', value:'active' },
                  { label:'थांबले', value:'paused' },
                  { label:'बंद', value:'stopped' },
                ]}
                value={form.status}
                onChange={val=>{ setForm(p=>({...p,status:val})); setErrors(p=>({...p,status:''})) }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">सुरुवात तारीख</label>
              <input className="form-input" type="date" {...f('start_date')} />
            </div>
          </div>

          {/* ── Extra Products Section ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                अतिरिक्त उत्पादने
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowExtraForm(p => !p)}>
                + जोडा
              </button>
            </div>

            {/* Existing extra subs */}
            {extraSubs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {extraSubs.map((sub, i) => {
                  const prod = sub.product || products.find(p => p.id === sub.product_id)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                      <span style={{ fontSize: 16 }}>📦</span>
                      <div style={{ flex: 1, fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{prod?.name || '—'}</span>
                        <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
                          सकाळ {sub.morning_qty}{prod?.unit} + सं. {sub.evening_qty}{prod?.unit} @ ₹{sub.rate}/{prod?.unit}
                        </span>
                      </div>
                      <button type="button" className="btn-icon" style={{ color: 'var(--red)', width: 28, height: 28 }} onClick={() => handleRemoveExtraSub(sub)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add extra product form */}
            {showExtraForm && (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">उत्पादन</label>
                  <BottomPicker
                    className="form-input"
                    options={extraProducts.map(p => {
                      const emoji = p.type === 'milk_buffalo' ? '🐃 ' : p.type === 'milk_cow' ? '🐄 ' : ''
                      return { label:`${emoji}${p.name} (${p.unit})`, value:String(p.id) }
                    })}
                    value={newExtraSub.product_id}
                    onChange={val=>handleExtraProductChange(val)}
                    placeholder="उत्पादन निवडा"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label className="form-label">सकाळ</label>
                    <input className="form-input" type="number" step="0.5" min="0" placeholder="0"
                      value={newExtraSub.morning_qty} onChange={e => setNewExtraSub(p => ({ ...p, morning_qty: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">संध्याकाळ</label>
                    <input className="form-input" type="number" step="0.5" min="0" placeholder="0"
                      value={newExtraSub.evening_qty} onChange={e => setNewExtraSub(p => ({ ...p, evening_qty: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">दर (₹)</label>
                    <input className="form-input" type="number" step="1" min="0" placeholder="80"
                      value={newExtraSub.rate} onChange={e => setNewExtraSub(p => ({ ...p, rate: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleAddExtraSub}>जोडा</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowExtraForm(false)}>रद्द</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm ── */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="ग्राहक हटवायचा का?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>नाही</button>
            <button className="btn btn-danger" onClick={handleDelete}>हो, हटवा</button>
          </>
        }
      >
        <p className="confirm-msg">
          <strong style={{ color: 'var(--text)' }}>{selected?.name}</strong> हा ग्राहक आणि त्याची सर्व डिलिव्हरी नोंद कायमची हटेल.
        </p>
        {deleteBillCount > 0 && (
          <div style={{ marginTop: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <span>या ग्राहकाची <strong>{deleteBillCount} बिले</strong> आणि संबंधित पैसे जमा नोंदी पण हटतील.</span>
          </div>
        )}
      </Modal>
    </div>
  )
}

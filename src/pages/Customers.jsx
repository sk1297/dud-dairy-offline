import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
import { todayStr, getInitials, formatCurrency } from '../utils.js'

const STATUS_LABELS = { active: 'सक्रिय', paused: 'थांबले', stopped: 'बंद' }
const STATUS_COLORS = { active: 'green',  paused: 'yellow',  stopped: 'red'  }
const STATUS_BG     = { active: 'rgba(16,185,129,0.1)', paused: 'rgba(234,179,8,0.1)', stopped: 'rgba(239,68,68,0.1)' }
const STATUS_ACCENT = { active: 'var(--green)', paused: 'var(--yellow)', stopped: 'var(--red)' }

const SORT_OPTIONS = [
  { label: 'नावाने (A-Z)',         value: 'name' },
  { label: 'थकबाकी (जास्त → कमी)', value: 'outstanding' },
  { label: 'आजची डिलिव्हरी बाकी', value: 'pending_first' },
  { label: 'नवीन ग्राहक आधी',      value: 'newest' },
]

const EMPTY_FORM = {
  name: '', mobile: '', address: '', area_id: '',
  product_id: '',
  morning_qty: '', evening_qty: '', rate: '',
  status: 'active', start_date: todayStr(),
}

export default function Customers() {
  const { show } = useToast()
  const navigate  = useNavigate()

  // ── Data ─────────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState([])
  const [areas,     setAreas]     = useState([])
  const [products,  setProducts]  = useState([])
  const [outstanding, setOutstanding] = useState({}) // { custId: amount }
  const [todayDelivered, setTodayDelivered] = useState({}) // { custId: bool }
  const [todayQty,  setTodayQty]  = useState(0)  // total litres delivered today

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')  // all | active | paused | stopped
  const [areaFilter,   setAreaFilter]   = useState('all')
  const [sortBy,       setSortBy]       = useState('name')

  // ── Modals ────────────────────────────────────────────────────────────────
  const [modal,    setModal]    = useState(null)   // 'add' | 'edit' | 'delete' | 'filters'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [errors,   setErrors]   = useState({})
  const [saving,   setSaving]   = useState(false)
  const [deleteBillCount, setDeleteBillCount] = useState(0)

  // ── Extra product subscriptions ───────────────────────────────────────────
  const [extraSubs,     setExtraSubs]     = useState([])
  const [newExtraSub,   setNewExtraSub]   = useState({ product_id: '', morning_qty: '', evening_qty: '', rate: '' })
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [defaultRate,   setDefaultRate]   = useState('62')

  // ── Active form section (for add/edit modal) ──────────────────────────────
  const [formSection, setFormSection] = useState(0) // 0=ओळख 1=डिलिव्हरी 2=अतिरिक्त

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [custs, areaList, prodList] = await Promise.all([getCustomers(), getAreas(), getProducts()])
    setCustomers(custs)
    setAreas(areaList)
    setProducts(prodList)

    const rateSetting = await db.first("SELECT value FROM settings WHERE key='default_rate' LIMIT 1")
    if (rateSetting) setDefaultRate(rateSetting.value)

    // Today's deliveries
    const today = todayStr()
    const deliveries = await db.query('SELECT * FROM deliveries WHERE date=?', [today])
    const dMap = {}
    let qtySum = 0
    deliveries.forEach(d => {
      if (d.status === 'delivered') {
        dMap[d.customer_id] = true
        qtySum += (d.qty || 0)
      }
    })
    setTodayDelivered(dMap)
    setTodayQty(qtySum)

    // Outstanding per customer (billed - paid)
    const outRows = await db.query(`
      SELECT c.id,
        COALESCE((SELECT SUM(mb.total_amount) FROM monthly_bills mb WHERE mb.customer_id=c.id),0)
        - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id=c.id),0) as due
      FROM customers c
    `)
    const oMap = {}
    outRows.forEach(r => { oMap[r.id] = Math.max(0, r.due || 0) })
    setOutstanding(oMap)
  }, [])

  useEffect(() => { load() }, [load])

  const { containerRef, indicator: refreshIndicator } = usePullToRefresh(load)

  // ── Derived counts ────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    all:     customers.length,
    active:  customers.filter(c => c.status === 'active').length,
    paused:  customers.filter(c => c.status === 'paused').length,
    stopped: customers.filter(c => c.status === 'stopped').length,
  }), [customers])

  const todayDoneCount    = Object.values(todayDelivered).filter(Boolean).length
  const todayPendingCount = customers.filter(c => c.status === 'active' && !todayDelivered[c.id]).length

  // ── Filter + Sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = customers.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (areaFilter !== 'all' && c.area_id !== parseInt(areaFilter)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.name.toLowerCase().includes(q) && !(c.mobile && c.mobile.includes(q))) return false
      }
      return true
    })

    switch (sortBy) {
      case 'outstanding':    list = [...list].sort((a,b) => (outstanding[b.id]||0) - (outstanding[a.id]||0)); break
      case 'pending_first':  list = [...list].sort((a,b) => (todayDelivered[a.id]?1:0) - (todayDelivered[b.id]?1:0)); break
      case 'newest':         list = [...list].sort((a,b) => b.id - a.id); break
      default:               list = [...list].sort((a,b) => a.name.localeCompare(b.name, 'mr')); break
    }
    return list
  }, [customers, statusFilter, areaFilter, search, sortBy, outstanding, todayDelivered])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const milkProducts  = products.filter(p => p.type === 'milk_buffalo' || p.type === 'milk_cow')
  const extraProducts = products.filter(p => p.id !== parseInt(form.product_id || '0'))
  const primaryProduct = products.find(p => p.id === parseInt(form.product_id))

  const hasActiveFilters = statusFilter !== 'all' || areaFilter !== 'all' || sortBy !== 'name'

  // ── Open modals ───────────────────────────────────────────────────────────
  const openAdd = () => {
    const defaultMilk = milkProducts[0]
    setForm({ ...EMPTY_FORM, product_id: defaultMilk?.id || '', rate: defaultMilk?.default_rate || defaultRate })
    setErrors({})
    setExtraSubs([])
    setNewExtraSub({ product_id: '', morning_qty: '', evening_qty: '', rate: '' })
    setShowExtraForm(false)
    setFormSection(0)
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
    setFormSection(0)
    const subs = await getCustomerProducts(c.id)
    setExtraSubs(subs)
    setModal('edit')
  }

  const openDelete = async (c) => {
    setSelected(c)
    const bills = await db.query('SELECT id FROM monthly_bills WHERE customer_id=?', [c.id])
    setDeleteBillCount(bills.length)
    setModal('delete')
  }

  // ── Validate + Save ───────────────────────────────────────────────────────
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
        for (const sub of extraSubs.filter(s => s._temp)) {
          await addCustomerProduct({ customer_id: custId, product_id: sub.product_id, morning_qty: sub.morning_qty, evening_qty: sub.evening_qty, rate: sub.rate })
        }
        show('ग्राहक जोडला गेला ✓', 'success')
      } else {
        await updateCustomer(selected.id, data)
        show('माहिती अपडेट झाली ✓', 'success')
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

  // ── Extra product subs ────────────────────────────────────────────────────
  const handleAddExtraSub = async () => {
    if (!newExtraSub.product_id) { show('उत्पादन निवडा', 'warning'); return }
    if (!newExtraSub.rate)       { show('दर टाका', 'warning'); return }
    if (modal === 'edit' && selected) {
      await addCustomerProduct({ customer_id: selected.id, product_id: parseInt(newExtraSub.product_id), morning_qty: parseFloat(newExtraSub.morning_qty)||0, evening_qty: parseFloat(newExtraSub.evening_qty)||0, rate: parseFloat(newExtraSub.rate) })
      const subs = await getCustomerProducts(selected.id)
      setExtraSubs(subs)
      show('उत्पादन जोडले', 'success')
    } else {
      const product = products.find(p => p.id === parseInt(newExtraSub.product_id))
      setExtraSubs(prev => [...prev, { _temp: true, product_id: parseInt(newExtraSub.product_id), product, morning_qty: parseFloat(newExtraSub.morning_qty)||0, evening_qty: parseFloat(newExtraSub.evening_qty)||0, rate: parseFloat(newExtraSub.rate) }])
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

  const handleExtraProductChange = (productId) => {
    const prod = products.find(p => p.id === parseInt(productId))
    setNewExtraSub(prev => ({ ...prev, product_id: productId, rate: prod?.default_rate || '' }))
  }

  const handlePrimaryProductChange = (productId) => {
    const prod = products.find(p => p.id === parseInt(productId))
    setForm(prev => ({ ...prev, product_id: productId, rate: prod?.default_rate || prev.rate }))
    setErrors(prev => ({ ...prev, product_id: '' }))
  }

  const f = (k) => ({
    value: form[k],
    onChange: e => { setForm(p => ({ ...p, [k]: e.target.value })); setErrors(p => ({ ...p, [k]: '' })) }
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-root">
      <Header
        title="ग्राहक"
        icon="👥"
        subtitle={`${counts.active} सक्रिय · ${counts.all} एकूण`}
        rightContent={
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            नवीन
          </button>
        }
      />

      {/* ── Filter bar ── */}
      <div style={{ padding:'10px 16px 0', display:'flex', flexDirection:'column', gap:8 }}>

        {/* Search + Filter button */}
        <div style={{ display:'flex', gap:8 }}>
          <div className="search-bar" style={{ flex:1 }}>
            <svg className="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <TextInput placeholder="नाव किंवा मोबाईल शोधा..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button
            onClick={() => setModal('filters')}
            style={{ flexShrink:0, width:42, height:42, borderRadius:12, border:`1.5px solid ${hasActiveFilters ? 'var(--accent)' : 'var(--border)'}`, background: hasActiveFilters ? 'rgba(16,185,129,0.12)' : 'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={hasActiveFilters ? 'var(--accent)' : 'var(--text2)'} strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
            {hasActiveFilters && (
              <div style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--accent)' }} />
            )}
          </button>
        </div>

        {/* Status filter chips — clickable to filter */}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
          {[
            { key:'all',     label:`सर्व`,     count:counts.all     },
            { key:'active',  label:`सक्रिय`,   count:counts.active  },
            { key:'paused',  label:`थांबले`,   count:counts.paused  },
            { key:'stopped', label:`बंद`,       count:counts.stopped },
          ].map(s => {
            const isActive = statusFilter === s.key
            const color    = s.key === 'all' ? 'var(--accent)' : STATUS_ACCENT[s.key]
            const bg       = s.key === 'all' ? 'rgba(16,185,129,0.12)' : STATUS_BG[s.key]
            return (
              <button key={s.key} onClick={() => setStatusFilter(s.key)}
                style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:20,
                  border:`1.5px solid ${isActive ? color : 'var(--border)'}`,
                  background: isActive ? bg : 'var(--surface)',
                  cursor:'pointer', transition:'all 0.15s' }}>
                <span style={{ fontSize:13, fontWeight:800, color: isActive ? color : 'var(--text)' }}>{s.count}</span>
                <span style={{ fontSize:12, color: isActive ? color : 'var(--text2)', fontWeight: isActive ? 700 : 400 }}>{s.label}</span>
              </button>
            )
          })}
        </div>

        {/* Today's delivery summary bar */}
        {counts.active > 0 && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'9px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:14 }}>✅</span>
                <span style={{ fontSize:13, fontWeight:800, color:'var(--green)' }}>{todayDoneCount}</span>
                <span style={{ fontSize:11, color:'var(--text2)' }}>दिले</span>
              </div>
              <div style={{ width:1, height:16, background:'var(--border)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:14 }}>⏳</span>
                <span style={{ fontSize:13, fontWeight:800, color: todayPendingCount > 0 ? 'var(--yellow)' : 'var(--green)' }}>{todayPendingCount}</span>
                <span style={{ fontSize:11, color:'var(--text2)' }}>बाकी</span>
              </div>
              <div style={{ width:1, height:16, background:'var(--border)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:14 }}>🥛</span>
                <span style={{ fontSize:13, fontWeight:800, color:'var(--accent)' }}>{todayQty.toFixed(1)}L</span>
              </div>
            </div>
            <span style={{ fontSize:10, color:'var(--text2)', background:'var(--surface2)', padding:'3px 8px', borderRadius:8 }}>आज</span>
          </div>
        )}

        {/* Active filter tags (show what's applied) */}
        {hasActiveFilters && (
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            {areaFilter !== 'all' && (
              <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:20, padding:'3px 10px', fontSize:11, color:'var(--accent)', fontWeight:600 }}>
                📍 {areas.find(a => String(a.id) === areaFilter)?.name}
                <button onClick={() => setAreaFilter('all')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', padding:'0 0 0 4px', fontSize:13, lineHeight:1 }}>×</button>
              </div>
            )}
            {sortBy !== 'name' && (
              <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:20, padding:'3px 10px', fontSize:11, color:'var(--accent)', fontWeight:600 }}>
                ↕ {SORT_OPTIONS.find(s => s.value === sortBy)?.label}
                <button onClick={() => setSortBy('name')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', padding:'0 0 0 4px', fontSize:13, lineHeight:1 }}>×</button>
              </div>
            )}
            <button onClick={() => { setStatusFilter('all'); setAreaFilter('all'); setSortBy('name') }}
              style={{ fontSize:11, color:'var(--red)', background:'none', border:'1px solid rgba(239,68,68,0.3)', borderRadius:20, padding:'3px 10px', cursor:'pointer' }}>
              सर्व फिल्टर काढा
            </button>
          </div>
        )}
      </div>

      {/* ── Customer Grid ── */}
      <div ref={containerRef} style={{ flex:1, padding:'10px 16px', paddingBottom:'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 80px)', overflowY:'auto' }}>
        {refreshIndicator}

        {/* Result count */}
        {filtered.length > 0 && filtered.length !== customers.length && (
          <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, paddingBottom:8 }}>
            {filtered.length} ग्राहक सापडले
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            <div className="empty-title">{customers.length === 0 ? 'ग्राहक नाही' : 'कोणी सापडले नाही'}</div>
            <div className="empty-desc">{customers.length === 0 ? 'नवीन ग्राहक जोडण्यासाठी + बटण दाबा' : 'शोध किंवा फिल्टर बदला'}</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {filtered.map(c => {
            const areaName  = areas.find(a => a.id === c.area_id)?.name || ''
            const prod      = products.find(p => p.id === c.product_id)
            const prodColor = prod ? PRODUCT_TYPE_COLOR[prod.type] : 'var(--text2)'
            const delivered = todayDelivered[c.id]
            const due       = outstanding[c.id] || 0

            // Avatar bg by status
            const avBg = delivered ? '#10b981'
              : c.status === 'stopped' ? '#475569'
              : c.status === 'paused'  ? '#d97706'
              : prod?.type === 'milk_buffalo' ? '#f59e0b'
              : prod?.type === 'milk_cow'     ? '#0ea5e9'
              : '#10b981'
            const avFg = (prod?.type === 'milk_buffalo' && !delivered && c.status === 'active') ? '#1c1400' : '#fff'

            // Strip color
            const stripColor = c.status === 'stopped' ? '#475569'
              : c.status === 'paused'  ? '#d97706'
              : delivered ? '#10b981'
              : prodColor

            // Card border/bg
            const cardBorder = due > 0 ? '1.5px solid rgba(239,68,68,0.35)'
              : delivered     ? '1.5px solid rgba(16,185,129,0.35)'
              : '1px solid var(--border)'
            const cardBg = due > 0   ? 'rgba(239,68,68,0.04)'
              : delivered ? 'rgba(16,185,129,0.06)'
              : 'var(--surface)'

            return (
              <div key={c.id} style={{ position:'relative', background:cardBg, border:cardBorder, borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 2px 8px rgba(0,0,0,0.18)', transition:'all 0.2s' }}>

                {/* Status strip */}
                <div style={{ height:5, background:stripColor, flexShrink:0 }} />

                {/* Delivered watermark */}
                {delivered && (
                  <svg style={{ position:'absolute', right:-8, top:12, opacity:0.06, pointerEvents:'none' }} width="90" height="90" viewBox="0 0 24 24" fill="#10b981"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                )}
                {due > 0 && (
                  <svg style={{ position:'absolute', right:-6, top:10, opacity:0.05, pointerEvents:'none' }} width="86" height="86" viewBox="0 0 24 24" fill="#ef4444"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                )}

                {/* Main tap → profile */}
                <button
                  onClick={() => navigate(`/customers/${c.id}`)}
                  style={{ flex:1, background:'transparent', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 8px 6px', gap:3 }}
                >
                  {/* Avatar */}
                  <div style={{ width:52, height:52, borderRadius:'50%', background:avBg, display:'flex', alignItems:'center', justifyContent:'center', color:avFg, fontSize:20, fontWeight:800, flexShrink:0, marginBottom:2, transition:'background 0.2s' }}>
                    {delivered
                      ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : c.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Name */}
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', textAlign:'center', lineHeight:1.25, maxWidth:'100%', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{c.name}</div>

                  {/* Area */}
                  {areaName && <div style={{ fontSize:10, color:'var(--text2)', textAlign:'center' }}>📍 {areaName}</div>}

                  {/* Product + qty */}
                  {prod && (
                    <div style={{ fontSize:11, fontWeight:700, color: delivered ? '#10b981' : prodColor, textAlign:'center', marginTop:1 }}>
                      {prod.type === 'milk_buffalo' ? '🐃' : '🐄'} {c.morning_qty||0}+{c.evening_qty||0}{prod.unit}
                    </div>
                  )}

                  {/* Outstanding badge */}
                  {due > 0 && (
                    <div style={{ fontSize:11, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, padding:'1px 7px', marginTop:2 }}>
                      ₹{due} थकबाकी
                    </div>
                  )}
                </button>

                {/* Action row */}
                <div style={{ display:'flex', borderTop:'1px solid var(--border)', flexShrink:0 }}>
                  {/* Quick deliver */}
                  <button
                    style={{ flex:1, height:36, background: delivered ? 'rgba(16,185,129,0.15)' : 'transparent', border:'none', borderRight:'1px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:700, color: delivered ? '#10b981' : 'var(--text2)', transition:'all 0.15s' }}
                    onClick={async e => {
                      e.stopPropagation()
                      const newStatus = delivered ? 'pending' : 'delivered'
                      await upsertDelivery(c.id, c.product_id, todayStr(), 'morning', { qty: newStatus === 'delivered' ? (c.morning_qty||0) : 0, status: newStatus, notes:'' })
                      setTodayDelivered(prev => ({ ...prev, [c.id]: newStatus === 'delivered' }))
                      setTodayQty(prev => newStatus === 'delivered' ? prev + (c.morning_qty||0) : prev - (c.morning_qty||0))
                    }}
                  >{delivered ? '✓ दिले' : '🥛 दे'}</button>

                  {/* Edit */}
                  <button
                    style={{ width:36, height:36, background:'transparent', border:'none', borderRight:'1px solid var(--border)', cursor:'pointer', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center' }}
                    onClick={e => { e.stopPropagation(); openEdit(c) }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>

                  {/* WhatsApp or Delete */}
                  {c.mobile && due > 0 ? (
                    <button
                      style={{ width:36, height:36, background:'transparent', border:'none', cursor:'pointer', color:'#25d366', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}
                      onClick={e => {
                        e.stopPropagation()
                        const msg = `🙏 नमस्कार ${c.name} जी,\n\nआपल्या खात्यावर थकबाकी आहे:\n💰 थकबाकी: ${formatCurrency(due)}\n\nकृपया लवकरात लवकर पैसे जमा करावेत.\n\nधन्यवाद!`
                        window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(msg)}`, '_blank')
                      }}
                    >💬</button>
                  ) : (
                    <button
                      style={{ width:36, height:36, background:'transparent', border:'none', cursor:'pointer', color:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center' }}
                      onClick={e => { e.stopPropagation(); openDelete(c) }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>

      {/* ══════════════════════ FILTER MODAL ══════════════════════ */}
      <Modal isOpen={modal === 'filters'} onClose={() => setModal(null)} title="🔍 फिल्टर व क्रम"
        footer={
          <div style={{ display:'flex', gap:8, width:'100%' }}>
            <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => { setStatusFilter('all'); setAreaFilter('all'); setSortBy('name') }}>
              रीसेट करा
            </button>
            <button className="btn btn-primary" style={{ flex:2 }} onClick={() => setModal(null)}>
              लागू करा
            </button>
          </div>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'4px 0' }}>

          {/* Status filter */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>स्थिती</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { key:'all',     label:'सर्व',   count:counts.all,     color:'var(--accent)' },
                { key:'active',  label:'सक्रिय', count:counts.active,  color:'var(--green)' },
                { key:'paused',  label:'थांबले', count:counts.paused,  color:'var(--yellow)' },
                { key:'stopped', label:'बंद',    count:counts.stopped, color:'var(--red)' },
              ].map(s => {
                const isSel = statusFilter === s.key
                return (
                  <button key={s.key} onClick={() => setStatusFilter(s.key)}
                    style={{ padding:'10px 12px', borderRadius:12, border:`1.5px solid ${isSel ? s.color : 'var(--border)'}`, background: isSel ? `${s.color}1a` : 'var(--surface2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:13, fontWeight:700, color: isSel ? s.color : 'var(--text)' }}>{s.label}</span>
                    <span style={{ fontSize:13, fontWeight:900, color: isSel ? s.color : 'var(--text2)' }}>{s.count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Area filter */}
          {areas.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>भाग / क्षेत्र</div>
              <BottomPicker
                className="form-input"
                options={[
                  { label:`सर्व भाग (${customers.length})`, value:'all' },
                  ...areas.map(a => ({ label:`${a.name} (${customers.filter(c => c.area_id === a.id).length})`, value:String(a.id) }))
                ]}
                value={areaFilter}
                onChange={val => setAreaFilter(val)}
              />
            </div>
          )}

          {/* Sort */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>क्रम (Sort)</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {SORT_OPTIONS.map(s => {
                const isSel = sortBy === s.value
                return (
                  <button key={s.value} onClick={() => setSortBy(s.value)}
                    style={{ padding:'11px 14px', borderRadius:12, border:`1.5px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`, background: isSel ? 'rgba(16,185,129,0.1)' : 'var(--surface2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:13, color: isSel ? 'var(--accent)' : 'var(--text)', fontWeight: isSel ? 700 : 400 }}>{s.label}</span>
                    {isSel && <span style={{ fontSize:16, color:'var(--accent)' }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════ ADD / EDIT MODAL ══════════════════════ */}
      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'add' ? '👤 नवीन ग्राहक' : '✏️ ग्राहक माहिती बदला'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner"/> : 'जतन करा'}
            </button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:0, padding:'4px 0' }}>

          {/* Section tabs */}
          <div style={{ display:'flex', gap:0, marginBottom:16, background:'var(--surface2)', borderRadius:10, padding:3 }}>
            {[
              { i:0, label:'ओळख' },
              { i:1, label:'डिलिव्हरी' },
              { i:2, label:'अतिरिक्त' },
            ].map(s => (
              <button key={s.i} onClick={() => setFormSection(s.i)}
                style={{ flex:1, padding:'8px 6px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight: formSection===s.i ? 700 : 500,
                  background: formSection===s.i ? 'var(--surface)' : 'transparent',
                  color: formSection===s.i ? 'var(--accent)' : 'var(--text2)',
                  boxShadow: formSection===s.i ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                  transition:'all 0.15s' }}>
                {s.label}
                {s.i === 1 && errors.product_id ? ' ⚠️' : ''}
                {s.i === 1 && errors.rate       ? ' ⚠️' : ''}
              </button>
            ))}
          </div>

          {/* ── Section 0: ओळख ── */}
          {formSection === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-group">
                <label className="form-label">नाव *</label>
                <TextInput className={`form-input${errors.name?' error':''}`} placeholder="ग्राहकाचे पूर्ण नाव" {...f('name')} />
                {errors.name && <div className="form-error">{errors.name}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">मोबाईल</label>
                <input className={`form-input${errors.mobile?' error':''}`} type="tel" inputMode="numeric" maxLength={10} placeholder="१० अंकी नंबर" {...f('mobile')} />
                {errors.mobile && <div className="form-error">{errors.mobile}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">पत्ता</label>
                <TextInput className="form-input" placeholder="घराचा पत्ता" {...f('address')} />
              </div>
              <div className="form-group">
                <label className="form-label">भाग / क्षेत्र</label>
                <BottomPicker className="form-input"
                  options={[{ label:'भाग नाही', value:'' }, ...areas.map(a=>({ label:a.name, value:String(a.id) }))]}
                  value={form.area_id}
                  onChange={val=>{ setForm(p=>({...p,area_id:val})); setErrors(p=>({...p,area_id:''})) }}
                  placeholder="भाग निवडा" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div className="form-group">
                  <label className="form-label">स्थिती</label>
                  <BottomPicker className="form-input"
                    options={[{ label:'सक्रिय', value:'active' },{ label:'थांबले', value:'paused' },{ label:'बंद', value:'stopped' }]}
                    value={form.status}
                    onChange={val=>setForm(p=>({...p,status:val}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">सुरुवात तारीख</label>
                  <input className="form-input" type="date" {...f('start_date')} />
                </div>
              </div>
              <button className="btn btn-primary" style={{ marginTop:4 }} onClick={() => setFormSection(1)}>
                पुढे → डिलिव्हरी तपशील
              </button>
            </div>
          )}

          {/* ── Section 1: डिलिव्हरी ── */}
          {formSection === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-group">
                <label className="form-label">दुधाचा प्रकार *</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {milkProducts.map(p => {
                    const isSel  = parseInt(form.product_id) === p.id
                    const color  = PRODUCT_TYPE_COLOR[p.type]
                    const tint   = PRODUCT_TYPE_TINT[p.type]
                    return (
                      <button key={p.id} type="button" onClick={() => handlePrimaryProductChange(String(p.id))}
                        style={{ background: isSel ? tint : 'var(--surface2)', border:`1.5px solid ${isSel ? color : 'var(--border)'}`, borderRadius:10, padding:'10px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:8, color: isSel ? color : 'var(--text2)', fontWeight: isSel ? 700 : 500, fontSize:14 }}>
                        <span style={{ fontSize:20 }}>{p.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                        {p.name}
                      </button>
                    )
                  })}
                </div>
                {errors.product_id && <div className="form-error">{errors.product_id}</div>}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                <div className="form-group">
                  <label className="form-label">सकाळ ({primaryProduct?.unit||'L'})</label>
                  <input className="form-input" type="number" step="0.5" min="0" placeholder="0" {...f('morning_qty')} />
                </div>
                <div className="form-group">
                  <label className="form-label">संध्याकाळ ({primaryProduct?.unit||'L'})</label>
                  <input className="form-input" type="number" step="0.5" min="0" placeholder="0" {...f('evening_qty')} />
                </div>
                <div className="form-group">
                  <label className="form-label">दर (₹/{primaryProduct?.unit||'L'}) *</label>
                  <input className={`form-input${errors.rate?' error':''}`} type="number" step="0.5" min="0" placeholder="62" {...f('rate')} />
                  {errors.rate && <div className="form-error">{errors.rate}</div>}
                </div>
              </div>

              {/* Quick summary */}
              {form.morning_qty && form.evening_qty && form.rate && (
                <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'var(--text2)' }}>
                  दैनिक अंदाज: <strong style={{ color:'var(--accent)' }}>
                    {((parseFloat(form.morning_qty)||0) + (parseFloat(form.evening_qty)||0)).toFixed(1)}{primaryProduct?.unit||'L'} × ₹{form.rate}
                    {' = '}₹{(((parseFloat(form.morning_qty)||0) + (parseFloat(form.evening_qty)||0)) * (parseFloat(form.rate)||0)).toFixed(0)}/दिवस
                  </strong>
                  <span style={{ marginLeft:8 }}>≈ ₹{(((parseFloat(form.morning_qty)||0) + (parseFloat(form.evening_qty)||0)) * (parseFloat(form.rate)||0) * 30).toFixed(0)}/महिना</span>
                </div>
              )}

              <button className="btn btn-primary" style={{ marginTop:4 }} onClick={() => setFormSection(2)}>
                पुढे → अतिरिक्त उत्पादने
              </button>
            </div>
          )}

          {/* ── Section 2: अतिरिक्त उत्पादने ── */}
          {formSection === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px', fontSize:12, color:'var(--text2)' }}>
                💡 जर ग्राहक म्हैस + गाय दूध दोन्ही घेत असेल, किंवा दुसरे उत्पादन घेत असेल तर इथे जोडा.
              </div>

              {extraSubs.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {extraSubs.map((sub, i) => {
                    const prod = sub.product || products.find(p => p.id === sub.product_id)
                    return (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--surface2)', borderRadius:10, padding:'9px 12px' }}>
                        <span style={{ fontSize:16 }}>📦</span>
                        <div style={{ flex:1, fontSize:12 }}>
                          <div style={{ fontWeight:700, color:'var(--text)' }}>{prod?.name || '—'}</div>
                          <div style={{ color:'var(--text2)', marginTop:1 }}>☀️{sub.morning_qty}{prod?.unit} · 🌙{sub.evening_qty}{prod?.unit} · ₹{sub.rate}/{prod?.unit}</div>
                        </div>
                        <button type="button" onClick={() => handleRemoveExtraSub(sub)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {!showExtraForm ? (
                <button type="button" className="btn btn-ghost" onClick={() => setShowExtraForm(true)}>
                  + अतिरिक्त उत्पादन जोडा
                </button>
              ) : (
                <div style={{ background:'var(--surface2)', borderRadius:10, padding:12, border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:10 }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">उत्पादन</label>
                    <BottomPicker className="form-input"
                      options={extraProducts.map(p => {
                        const emoji = p.type==='milk_buffalo'?'🐃 ':p.type==='milk_cow'?'🐄 ':''
                        return { label:`${emoji}${p.name} (${p.unit})`, value:String(p.id) }
                      })}
                      value={newExtraSub.product_id}
                      onChange={val => handleExtraProductChange(val)}
                      placeholder="उत्पादन निवडा" />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    <div>
                      <label className="form-label">सकाळ</label>
                      <input className="form-input" type="number" step="0.5" min="0" placeholder="0" value={newExtraSub.morning_qty} onChange={e => setNewExtraSub(p=>({...p,morning_qty:e.target.value}))} />
                    </div>
                    <div>
                      <label className="form-label">संध्याकाळ</label>
                      <input className="form-input" type="number" step="0.5" min="0" placeholder="0" value={newExtraSub.evening_qty} onChange={e => setNewExtraSub(p=>({...p,evening_qty:e.target.value}))} />
                    </div>
                    <div>
                      <label className="form-label">दर (₹)</label>
                      <input className="form-input" type="number" step="1" min="0" placeholder="80" value={newExtraSub.rate} onChange={e => setNewExtraSub(p=>({...p,rate:e.target.value}))} />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleAddExtraSub}>जोडा</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowExtraForm(false)}>रद्द</button>
                  </div>
                </div>
              )}

              {extraSubs.length === 0 && !showExtraForm && (
                <div style={{ textAlign:'center', fontSize:12, color:'var(--text2)', padding:'8px 0' }}>
                  अतिरिक्त उत्पादने नाहीत — ऐच्छिक
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ══════════════════════ DELETE MODAL ══════════════════════ */}
      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="ग्राहक हटवायचा का?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>नाही</button>
            <button className="btn btn-danger" onClick={handleDelete}>हो, हटवा</button>
          </>
        }
      >
        <p className="confirm-msg">
          <strong style={{ color:'var(--text)' }}>{selected?.name}</strong> हा ग्राहक आणि त्याची सर्व डिलिव्हरी नोंद कायमची हटेल.
        </p>
        {deleteBillCount > 0 && (
          <div style={{ marginTop:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'9px 12px', fontSize:12, color:'var(--red)', display:'flex', gap:8 }}>
            <span style={{ fontSize:16, flexShrink:0 }}>⚠️</span>
            <span>या ग्राहकाची <strong>{deleteBillCount} बिले</strong> आणि संबंधित पैसे जमा नोंदी पण हटतील.</span>
          </div>
        )}
      </Modal>
    </div>
  )
}

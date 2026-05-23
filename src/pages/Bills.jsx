import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Modal from '../components/Modal.jsx'
import TextInput from '../components/TextInput.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatCurrency, getMonthYear, todayStr } from '../utils.js'
import { getBills, generateBill, generateBillsForAll, lockBill, unlockBill, deleteBill, getBillItems } from '../services/billService.js'
import { getCustomers } from '../services/customerService.js'
import { addPayment, updatePayment, deletePayment, getPayments, getOutstanding } from '../services/paymentService.js'
import { shareBillAsPDF } from '../utils/billPdf.js'

const PAYMENT_MODES = { cash: 'रोख', upi: 'UPI', bank: 'बँक', cheque: 'चेक' }
const MODE_ICONS    = { cash: '💵', upi: '📲', bank: '🏦', cheque: '📝' }
const TABS = ['बिले', 'पैसे जमा', 'थकबाकी']
const MONTH_NAMES_MR = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']

function fmtDateMr(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(d)} ${MONTH_NAMES_MR[parseInt(m)-1]} ${y}`
}

export default function Bills() {
  const { show } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab]             = useState(() => location.state?.openOutstandingTab ? 2 : location.state?.openPayTab ? 1 : 0)
  const [bills, setBills]         = useState([])
  const [customers, setCustomers] = useState([])
  const [payments, setPayments]   = useState([])
  const [outstanding, setOutstanding] = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadingPay, setLoadingPay] = useState(false)
  const [loadingOut, setLoadingOut] = useState(false)
  const { month, year }           = getMonthYear()
  const [selMonth, setSelMonth]   = useState(month)
  const [selYear,  setSelYear]    = useState(year)

  // Track which tabs have been loaded (cache key for bills is month-year)
  const loadedRef = useRef({ billsKey: null, payments: false, outstanding: false })

  // Payment modal
  const [payModal,  setPayModal]  = useState(false)
  const [payForm,   setPayForm]   = useState({ customer_id: '', amount: '', mode: 'cash', notes: '', date: todayStr() })
  const [payErrors, setPayErrors] = useState({})
  const [savingPay, setSavingPay] = useState(false)

  // Bill detail modal
  const [billDetail, setBillDetail] = useState(null)
  const [billItems,  setBillItems]  = useState([])

  // Delete confirm (bill)
  const [deleteId, setDeleteId]   = useState(null)

  // Unlock confirm
  const [unlockId, setUnlockId]   = useState(null)

  // Edit payment
  const [editPayment, setEditPayment] = useState(null)
  const [editPayForm, setEditPayForm] = useState({ amount: '', mode: 'cash', notes: '', date: '' })
  const [savingEditPay, setSavingEditPay] = useState(false)

  // Delete payment confirm
  const [deletePayId, setDeletePayId] = useState(null)

  // Generate modal
  const [genModal,    setGenModal]    = useState(false)
  const [genCustomer, setGenCustomer] = useState('all')
  const [genning,     setGenning]     = useState(false)
  const [bulkModal,   setBulkModal]   = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [bulkResult,   setBulkResult]   = useState(null)

  // PDF sharing
  const [sharingBillId, setSharingBillId] = useState(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)

  // Payment filter
  const [payFilterCust, setPayFilterCust] = useState('')
  const [payFilterMonth, setPayFilterMonth] = useState('')

  const [dairyName, setDairyName] = useState('')

  // Load bills for selected month + customers (needed by all tabs for names/modal)
  const loadBills = useCallback(async (m, y) => {
    const key = `${m}-${y}`
    setLoading(true)
    try {
      const [b, c, setting] = await Promise.all([
        getBills(m, y),
        getCustomers(),
        import('../db/database.js').then(mod => mod.default.first("SELECT value FROM settings WHERE key='dairy_name' LIMIT 1")),
      ])
      setBills(b); setCustomers(c)
      if (setting?.value) setDairyName(setting.value)
      loadedRef.current.billsKey = key
    } finally {
      setLoading(false)
    }
  }, [])

  // Load payments (lazy — only when tab 1 opened or pull-to-refresh)
  const loadPayments = useCallback(async () => {
    setLoadingPay(true)
    try {
      const p = await getPayments()
      setPayments(p)
      loadedRef.current.payments = true
    } finally {
      setLoadingPay(false)
    }
  }, [])

  // Load outstanding (lazy — only when tab 2 opened or pull-to-refresh)
  const loadOutstanding = useCallback(async () => {
    setLoadingOut(true)
    try {
      const o = await getOutstanding()
      setOutstanding(o)
      loadedRef.current.outstanding = true
    } finally {
      setLoadingOut(false)
    }
  }, [])

  // Master refresh — reload everything currently visible
  const load = useCallback(async () => {
    const key = `${selMonth}-${selYear}`
    loadedRef.current = { billsKey: null, payments: false, outstanding: false }
    await loadBills(selMonth, selYear)
    if (tab === 1) await loadPayments()
    if (tab === 2) await loadOutstanding()
  }, [selMonth, selYear, tab, loadBills, loadPayments, loadOutstanding])

  // On mount: load bills tab first
  useEffect(() => { loadBills(selMonth, selYear) }, [])   // eslint-disable-line

  // When month/year changes: reload bills
  useEffect(() => {
    loadBills(selMonth, selYear)
  }, [selMonth, selYear])   // eslint-disable-line

  // When tab changes: lazy-load that tab's data
  useEffect(() => {
    if (tab === 1 && !loadedRef.current.payments)   loadPayments()
    if (tab === 2 && !loadedRef.current.outstanding) loadOutstanding()
  }, [tab])   // eslint-disable-line

  const { containerRef: billsListRef, indicator: billsRefreshIndicator } = usePullToRefresh(load)

  // bills are already filtered by selMonth/selYear from DB query
  const monthBills = bills

  const handleGenerate = async () => {
    setGenning(true)
    try {
      if (genCustomer === 'all') {
        const active = customers.filter(c => c.status === 'active')
        for (const c of active) await generateBill(c.id, selMonth, selYear)
        show(`${active.length} ग्राहकांचे बिल तयार झाले`, 'success')
      } else {
        await generateBill(parseInt(genCustomer), selMonth, selYear)
        show('बिल तयार झाले', 'success')
      }
      setGenModal(false)
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setGenning(false)
    }
  }

  const handleBulkGenerate = async () => {
    setBulkProgress({ current: 0, total: 0, name: '' })
    setBulkResult(null)
    try {
      const result = await generateBillsForAll(selMonth, selYear, (current, total, name) => {
        setBulkProgress({ current, total, name })
      })
      setBulkResult(result)
      setBulkProgress(null)
      load()
    } catch (e) {
      show(e.message, 'error')
      setBulkProgress(null)
    }
  }

  const openBillDetail = async (bill) => {
    const items = await getBillItems(bill.id)
    setBillItems(items)
    setBillDetail(bill)
  }

  const handleLock = async (id) => {
    await lockBill(id)
    show('बिल लॉक झाले', 'success')
    load()
  }

  const handleUnlock = async () => {
    await unlockBill(unlockId)
    show('बिल अनलॉक झाले — आता बदल करता येईल', 'success')
    setUnlockId(null)
    load()
  }

  const handleSharePDF = async (bill) => {
    const cust = customers.find(c => c.id === bill.customer_id)
    if (!cust) return
    setSharingBillId(bill.id)
    setPdfGenerating(true)
    try {
      const items = await getBillItems(bill.id)
      // Yield one frame so the full-screen overlay paints BEFORE html2canvas
      // locks the main thread — prevents the "half-white broken layout" glitch.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      await shareBillAsPDF({ customer: cust, bill, items, dairyName })
    } catch (err) {
      show('PDF तयार करताना त्रुटी: ' + err.message, 'error')
    } finally {
      setSharingBillId(null)
      setPdfGenerating(false)
    }
  }

  const openEditPayment = (p) => {
    setEditPayment(p)
    setEditPayForm({ amount: String(p.amount), mode: p.mode || 'cash', notes: p.notes || '', date: p.date })
  }

  const handleSaveEditPay = async () => {
    const amt = parseFloat(editPayForm.amount)
    if (!amt || amt <= 0) { show('योग्य रक्कम टाका', 'error'); return }
    setSavingEditPay(true)
    try {
      await updatePayment(editPayment.id, { amount: amt, date: editPayForm.date, mode: editPayForm.mode, notes: editPayForm.notes })
      show('पैसे जमा अपडेट झाले', 'success')
      setEditPayment(null)
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSavingEditPay(false)
    }
  }

  const handleDeletePayConfirm = async () => {
    await deletePayment(deletePayId)
    show('पैसे जमा नोंद हटवली', 'success')
    setDeletePayId(null)
    load()
  }

  const handleDeleteConfirm = async () => {
    await deleteBill(deleteId)
    show('बिल हटवले', 'success')
    setDeleteId(null)
    load()
  }

  const validatePay = () => {
    const e = {}
    if (!payForm.customer_id)                             e.customer_id = 'ग्राहक निवडा'
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) e.amount = 'रक्कम टाका'
    setPayErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSavePay = async () => {
    if (!validatePay()) return
    setSavingPay(true)
    try {
      const custId = parseInt(payForm.customer_id)
      const amount = parseFloat(payForm.amount)
      await addPayment({ customer_id: custId, bill_id: null, date: payForm.date, amount, mode: payForm.mode, notes: payForm.notes })
      const cust = customers.find(c => c.id === custId)
      if (cust?.mobile) {
        const receipt = `✅ पावती — ${dairyName || 'दूध डेअरी'}\n\nनमस्कार ${cust.name} जी,\nआपले पैसे मिळाले.\n\n💰 रक्कम: ${formatCurrency(amount)}\n📅 तारीख: ${payForm.date}\n💳 पद्धत: ${PAYMENT_MODES[payForm.mode] || payForm.mode}${payForm.notes ? `\n📝 नोंद: ${payForm.notes}` : ''}\n\nधन्यवाद! 🙏`
        window.open(`https://wa.me/91${cust.mobile}?text=${encodeURIComponent(receipt)}`, '_blank')
      }
      show('पैसे जमा नोंद झाली ✓', 'success')
      setPayModal(false)
      setPayForm({ customer_id: '', amount: '', mode: 'cash', notes: '', date: todayStr() })
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSavingPay(false)
    }
  }

  const pf = (k) => ({
    value: payForm[k],
    onChange: e => { setPayForm(p => ({ ...p, [k]: e.target.value })); setPayErrors(p => ({ ...p, [k]: '' })) }
  })

  const custName = (id) => customers.find(c => c.id === id)?.name || 'ग्राहक'

  const groupedItems = billItems.reduce((acc, item) => {
    const key = item.product_name || 'दूध'
    if (!acc[key]) acc[key] = { items: [], totalQty: 0, totalAmt: 0, unit: item.unit || 'L' }
    acc[key].items.push(item)
    acc[key].totalQty += Number(item.qty)  || 0
    acc[key].totalAmt += Number(item.amount) || 0
    return acc
  }, {})

  // Filtered payments
  const filteredPayments = [...payments].reverse().filter(p => {
    if (payFilterCust && String(p.customer_id) !== String(payFilterCust)) return false
    if (payFilterMonth && !p.date?.startsWith(payFilterMonth)) return false
    return true
  })

  // Group filtered payments by date
  const paysByDate = filteredPayments.reduce((acc, p) => {
    const d = p.date || 'unknown'
    if (!acc[d]) acc[d] = []
    acc[d].push(p)
    return acc
  }, {})

  return (
    <div className="page-root">
      <Header
        title="बिल व पैसे"
        icon="📋"
        subtitle={
          tab === 0 ? `${MONTH_NAMES_MR[selMonth-1]} ${selYear} · ${monthBills.length} बिले`
          : tab === 1 ? `${payments.length} पैसे जमा नोंदी`
          : `${outstanding.length} थकबाकी ग्राहक`
        }
      />

      {/* Sticky tab bar */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg)', padding:'10px 16px 0', borderBottom:'1px solid var(--border)' }}>
        <div className="tabs">
          {TABS.map((t,i) => (
            <button key={i} className={`tab${tab===i?' active':''}`} onClick={()=>setTab(i)}>
              {t}
              {i===2 && outstanding.length>0 && (
                <span style={{ marginLeft:5, background:'var(--red)', color:'#fff', borderRadius:10, fontSize:10, fontWeight:800, padding:'1px 6px' }}>
                  {outstanding.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════ BILLS TAB ══════════════════════ */}
      {tab===0 && (
        <div ref={billsListRef} style={{ flex:1, padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {billsRefreshIndicator}

          {/* Month selector + actions row */}
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <BottomPicker
              className="form-input"
              style={{ flex:1 }}
              options={Array.from({length:12},(_,i)=>i+1).map(m=>({ label:MONTH_NAMES_MR[m-1], value:m }))}
              value={selMonth}
              onChange={val=>setSelMonth(parseInt(val))}
            />
            <BottomPicker
              className="form-input"
              style={{ width:88 }}
              options={[year-1,year,year+1].map(y=>({ label:String(y), value:y }))}
              value={selYear}
              onChange={val=>setSelYear(parseInt(val))}
            />
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkResult(null); setBulkModal(true) }}>
              ⚡ सर्व
            </button>
            <button className="btn btn-primary btn-sm" onClick={()=>setGenModal(true)}>
              + बिल
            </button>
          </div>

          {/* Month summary strip */}
          {monthBills.length > 0 && (() => {
            const totalBilled = monthBills.reduce((s,b)=>s+(b.total_amount||0),0)
            const totalPaid   = monthBills.reduce((s,b)=>s+(b.payments_made||0),0)
            const totalDue    = monthBills.reduce((s,b)=>s+(b.amount_due||0),0)
            const locked      = monthBills.filter(b=>b.is_locked).length
            const paidPct     = totalBilled > 0 ? Math.round((totalPaid/totalBilled)*100) : 0
            return (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:'1px solid var(--border)' }}>
                  {[
                    { label:'एकूण बिल',  value:formatCurrency(totalBilled), color:'var(--text)'  },
                    { label:'जमा झाले',  value:formatCurrency(totalPaid),   color:'var(--green)' },
                    { label:'बाकी आहे',  value:formatCurrency(totalDue),    color:totalDue>0?'var(--red)':'var(--green)' },
                  ].map((s,i)=>(
                    <div key={i} style={{ padding:'10px 6px', textAlign:'center', borderRight:i<2?'1px solid var(--border)':'none' }}>
                      <div style={{ fontSize:14, fontWeight:800, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:10, color:'var(--text2)', marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Progress bar */}
                <div style={{ padding:'8px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <span style={{ fontSize:11, color:'var(--text2)' }}>
                      {monthBills.length} बिले
                      <span style={{ margin:'0 5px', color:'var(--border)' }}>·</span>
                      <span style={{ color:locked===monthBills.length?'var(--green)':'var(--yellow)', fontWeight:600 }}>
                        {locked===monthBills.length ? '✅ सर्व लॉक' : `🔒 ${locked}/${monthBills.length} लॉक`}
                      </span>
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)' }}>{paidPct}% जमा</span>
                  </div>
                  <div style={{ background:'var(--surface2)', borderRadius:20, height:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:20, background:'linear-gradient(to right,var(--green),var(--accent))', width:`${paidPct}%`, transition:'width 0.4s' }} />
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Empty guide */}
          {!loading && monthBills.length===0 && (
            <div style={{ background:'rgba(16,185,129,0.06)', border:'1.5px dashed rgba(16,185,129,0.3)', borderRadius:16, padding:'16px 16px 14px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', marginBottom:12 }}>📋 बिल प्रक्रिया — कशी करायची?</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { step:'१', icon:'🥛', title:'डिलिव्हरी नोंद', desc:'प्रतिदिन दूध दिल्याची नोंद "डिलिव्हरी" पानावर करा', cta: false },
                  { step:'२', icon:'📄', title:'बिल तयार करा', desc:'महिना संपल्यावर "+ बिल" बटण दाबून सर्व ग्राहकांचे बिल बनवा', cta: true },
                  { step:'३', icon:'🔒', title:'बिल लॉक करा', desc:'बिल तपासल्यावर लॉक करा — लॉक केल्यावर बदल होत नाही', cta: false },
                  { step:'४', icon:'💰', title:'पैसे जमा करा', desc:'ग्राहकाकडून पैसे मिळाल्यावर "पैसे जमा" टॅबमध्ये नोंद करा', cta: false },
                ].map((s,i)=>(
                  <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:'rgba(16,185,129,0.15)', border:'1.5px solid rgba(16,185,129,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
                      {s.icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:'var(--accent)' }}>पायरी {s.step}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{s.title}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--text2)', marginTop:2, lineHeight:1.5 }}>{s.desc}</div>
                      {s.cta && (
                        <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={()=>setGenModal(true)}>
                          + बिल बनवा
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="loading"><span className="spinner" /> लोड...</div>
          ) : monthBills.map(b => {
            const c = customers.find(c=>c.id===b.customer_id)
            const paidPct = b.total_amount > 0 ? Math.min(100, Math.round((b.payments_made / b.total_amount) * 100)) : 0
            const isSharing = sharingBillId === b.id
            return (
              <div key={b.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.18)' }}>

                {/* Card header */}
                <div style={{ padding:'13px 14px 10px', cursor:'pointer' }} onClick={()=>openBillDetail(b)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    {/* Customer info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                        <span
                          style={{ fontSize:15, fontWeight:700, color:'var(--accent)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}
                          onClick={e=>{ e.stopPropagation(); navigate(`/customers/${b.customer_id}`) }}
                        >{c?.name || 'ग्राहक'}</span>
                        {c?.area_name && (
                          <span style={{ fontSize:10, color:'var(--text2)', background:'var(--surface2)', borderRadius:6, padding:'2px 6px', flexShrink:0 }}>
                            {c.area_name}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text2)' }}>
                        {MONTH_NAMES_MR[b.month-1]} {b.year}
                        {b.prev_balance > 0 && (
                          <span style={{ marginLeft:6, color:'var(--yellow)', fontWeight:600 }}>
                            + मागील {formatCurrency(b.prev_balance)} बाकी
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status + due amount */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                      <span className={`badge ${b.is_locked?'badge-green':'badge-yellow'}`}>
                        {b.is_locked ? '🔒 लॉक' : '✏️ मसुदा'}
                      </span>
                      <span style={{ fontSize:16, fontWeight:900, color: b.amount_due > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {b.amount_due > 0 ? `बाकी ${formatCurrency(b.amount_due)}` : '✅ क्लिअर'}
                      </span>
                    </div>
                  </div>

                  {/* 3-col mini stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', background:'var(--surface2)', borderRadius:10, overflow:'hidden', marginBottom:8 }}>
                    {[
                      { label:'बिल', value:formatCurrency(b.total_amount), color:'var(--text)' },
                      { label:'जमा', value:formatCurrency(b.payments_made), color:'var(--green)' },
                      { label:'बाकी', value:formatCurrency(b.amount_due), color: b.amount_due > 0 ? 'var(--red)' : 'var(--green)' },
                    ].map((s,i) => (
                      <div key={i} style={{ padding:'7px 4px', textAlign:'center', borderRight:i<2?'1px solid var(--border)':'none' }}>
                        <div style={{ fontSize:12, fontWeight:800, color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:9, color:'var(--text2)', marginTop:1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Payment progress bar */}
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:10, color:'var(--text2)' }}>जमा प्रगती</span>
                      <span style={{ fontSize:10, fontWeight:700, color: paidPct===100 ? 'var(--green)' : 'var(--accent)' }}>{paidPct}%</span>
                    </div>
                    <div style={{ background:'var(--surface2)', borderRadius:20, height:5, overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:20, background: paidPct===100 ? 'var(--green)' : 'linear-gradient(to right,var(--accent),#34d399)', width:`${paidPct}%`, transition:'width 0.4s' }} />
                    </div>
                  </div>
                </div>

                {/* Action strip */}
                <div style={{ borderTop:'1px solid var(--border)', background:'rgba(0,0,0,0.10)', padding:'8px 12px', display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize:11, flex:1 }}
                    onClick={()=>openBillDetail(b)}
                  >
                    📋 तपशील
                  </button>

                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize:11, flex:1, color:'#25d366', borderColor:'rgba(37,211,102,0.35)', opacity: isSharing ? 0.6 : 1 }}
                    onClick={()=>handleSharePDF(b)}
                    disabled={isSharing}
                  >
                    {isSharing ? <span className="spinner" style={{ width:12, height:12 }}/> : '📤 PDF शेअर'}
                  </button>

                  {!b.is_locked ? (
                    <>
                      <button className="btn btn-primary btn-sm" style={{ fontSize:11 }} onClick={()=>handleLock(b.id)}>
                        🔒 लॉक
                      </button>
                      <button
                        style={{ background:'none', border:'1px solid rgba(239,68,68,0.35)', borderRadius:8, padding:'5px 9px', cursor:'pointer', color:'var(--red)' }}
                        onClick={()=>setDeleteId(b.id)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                      </button>
                    </>
                  ) : (
                    <button
                      style={{ background:'none', border:'1px solid rgba(245,158,11,0.4)', borderRadius:8, padding:'5px 10px', cursor:'pointer', color:'var(--yellow)', fontSize:11 }}
                      onClick={()=>setUnlockId(b.id)}
                    >
                      🔓 अनलॉक
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════ PAYMENTS TAB ══════════════════════ */}
      {tab===1 && (
        <div style={{ flex:1, padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>

          {loadingPay && <div className="loading"><span className="spinner" /> पैसे लोड...</div>}

          {/* Summary + Add button */}
          {!loadingPay && (() => {
            const total = payments.reduce((s,p)=>s+(p.amount||0),0)
            const byMode = payments.reduce((acc,p) => { acc[p.mode] = (acc[p.mode]||0) + p.amount; return acc }, {})
            return (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'14px 16px 12px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>एकूण जमा झालेले पैसे</div>
                  <div style={{ fontSize:30, fontWeight:900, color:'var(--green)', lineHeight:1 }}>{formatCurrency(total)}</div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:4 }}>{payments.length} नोंदी</div>
                  {/* Mode breakdown */}
                  {Object.keys(byMode).length > 0 && (
                    <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                      {Object.entries(byMode).map(([mode,amt]) => (
                        <div key={mode} style={{ background:'var(--surface2)', borderRadius:8, padding:'4px 10px', display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ fontSize:13 }}>{MODE_ICONS[mode]||'💰'}</span>
                          <span style={{ fontSize:11, color:'var(--text2)' }}>{PAYMENT_MODES[mode]||mode}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:'var(--green)' }}>{formatCurrency(amt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-primary" style={{ width:'100%', borderRadius:0 }} onClick={()=>setPayModal(true)}>
                  + 💰 पैसे जमा नोंद करा
                </button>
              </div>
            )
          })()}

          {/* Filter row */}
          {!loadingPay && payments.length > 0 && (
            <div style={{ display:'flex', gap:8 }}>
              <BottomPicker
                className="form-input"
                style={{ flex:1, fontSize:12 }}
                options={[
                  { label:'सर्व ग्राहक', value:'' },
                  ...customers.filter(c=>c.status!=='stopped').map(c=>({ label:c.name, value:String(c.id) }))
                ]}
                value={payFilterCust}
                onChange={val=>setPayFilterCust(val)}
                searchable={true}
              />
              <select
                className="form-input"
                style={{ width:120, fontSize:12 }}
                value={payFilterMonth}
                onChange={e=>setPayFilterMonth(e.target.value)}
              >
                <option value="">सर्व महिने</option>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={`${year}-${String(m).padStart(2,'0')}`}>{MONTH_NAMES_MR[m-1]} {year}</option>
                ))}
              </select>
            </div>
          )}

          {!loadingPay && filteredPayments.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">💰</div>
              <div className="empty-title">{payments.length===0 ? 'पैसे जमा नाही' : 'कोणतीही नोंद सापडली नाही'}</div>
              <div className="empty-desc">{payments.length===0 ? 'वर बटण दाबून पैसे जमा नोंद करा' : 'फिल्टर बदला'}</div>
            </div>
          ) : (
            Object.entries(paysByDate).map(([date, dayPayments]) => (
              <div key={date}>
                {/* Date group header */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, marginTop:2 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text2)', background:'var(--surface2)', borderRadius:8, padding:'3px 10px' }}>
                    📅 {fmtDateMr(date)}
                  </div>
                  <div style={{ flex:1, height:1, background:'var(--border)' }} />
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--green)' }}>
                    {formatCurrency(dayPayments.reduce((s,p)=>s+(p.amount||0),0))}
                  </div>
                </div>

                {/* Payment cards for that date */}
                {dayPayments.map(p => (
                  <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:8 }}>
                    <div style={{ padding:'11px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                      <div style={{ display:'flex', gap:10, alignItems:'center', flex:1, minWidth:0 }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:'rgba(16,185,129,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                          {MODE_ICONS[p.mode] || '💰'}
                        </div>
                        <div style={{ minWidth:0 }}>
                          <div
                            style={{ fontSize:14, fontWeight:700, color:'var(--accent)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}
                            onClick={()=>navigate(`/customers/${p.customer_id}`, { state: { tab: 2 } })}
                          >{custName(p.customer_id)}</div>
                          <div style={{ fontSize:11, color:'var(--text2)', marginTop:2, display:'flex', gap:6, alignItems:'center' }}>
                            <span style={{ background:'var(--surface2)', borderRadius:6, padding:'1px 6px' }}>{PAYMENT_MODES[p.mode]||p.mode}</span>
                            {p.notes && <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>· {p.notes}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize:18, fontWeight:900, color:'var(--green)', flexShrink:0 }}>
                        +{formatCurrency(p.amount)}
                      </div>
                    </div>
                    <div style={{ borderTop:'1px solid var(--border)', background:'rgba(0,0,0,0.06)', padding:'6px 12px', display:'flex', gap:6, justifyContent:'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={()=>openEditPayment(p)}>
                        ✏️ संपादन
                      </button>
                      <button
                        style={{ background:'none', border:'1px solid rgba(239,68,68,0.35)', borderRadius:8, padding:'4px 10px', cursor:'pointer', color:'var(--red)', fontSize:11 }}
                        onClick={()=>setDeletePayId(p.id)}
                      >
                        🗑️ हटवा
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════ OUTSTANDING TAB ══════════════════════ */}
      {tab===2 && (
        <div style={{ flex:1, padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>

          {loadingOut && <div className="loading"><span className="spinner" /> थकबाकी लोड...</div>}

          {/* Hero total */}
          {!loadingOut && outstanding.length > 0 && (() => {
            const totalDue    = outstanding.reduce((s,c)=>s+(c.outstanding||0),0)
            const totalBilled = outstanding.reduce((s,c)=>s+(c.totalBilled||0),0)
            const totalPaid   = outstanding.reduce((s,c)=>s+(c.totalPaid||0),0)
            return (
              <div style={{ background:'linear-gradient(135deg,rgba(239,68,68,0.14) 0%,rgba(239,68,68,0.05) 100%)', border:'1.5px solid rgba(239,68,68,0.3)', borderRadius:16, padding:'16px 18px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>🔴 एकूण थकबाकी</div>
                    <div style={{ fontSize:32, fontWeight:900, color:'var(--text)', lineHeight:1 }}>{formatCurrency(totalDue)}</div>
                    <div style={{ fontSize:12, color:'var(--text2)', marginTop:5 }}>{outstanding.length} ग्राहकांकडून बाकी</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={()=>setPayModal(true)}>
                    + पैसे जमा
                  </button>
                </div>
                {/* Overall progress */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:11, color:'var(--text2)' }}>एकूण जमा {formatCurrency(totalPaid)} / बिल {formatCurrency(totalBilled)}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)' }}>
                      {totalBilled > 0 ? Math.round((totalPaid/totalBilled)*100) : 0}%
                    </span>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:20, height:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:20, background:'var(--green)', width:`${totalBilled>0?Math.min(100,(totalPaid/totalBilled)*100):0}%`, transition:'width 0.4s' }} />
                  </div>
                </div>
              </div>
            )
          })()}

          {!loadingOut && outstanding.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">✅</div>
              <div className="empty-title">कोणाची थकबाकी नाही!</div>
              <div className="empty-desc">सर्व पैसे जमा झाले आहेत</div>
            </div>
          ) : !loadingOut && outstanding.map((c,i) => {
            const paidPct = c.totalBilled > 0 ? Math.min(100, Math.round((c.totalPaid/c.totalBilled)*100)) : 0
            // Urgency color based on outstanding amount
            const urgencyColor = c.outstanding > 5000 ? 'var(--red)' : c.outstanding > 2000 ? 'var(--yellow)' : 'var(--text2)'
            return (
              <div key={c.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 6px rgba(0,0,0,0.15)' }}>
                <div style={{ padding:14, cursor:'pointer' }} onClick={()=>navigate(`/customers/${c.id}`)}>

                  {/* Top row: rank + name + amount */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:'var(--text2)', background:'var(--surface2)', borderRadius:6, padding:'2px 7px', flexShrink:0 }}>#{i+1}</span>
                        <span style={{ fontSize:15, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                      </div>
                      {c.mobile && (
                        <div style={{ fontSize:11, color:'var(--text2)' }}>📱 {c.mobile}</div>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:20, fontWeight:900, color: urgencyColor }}>{formatCurrency(c.outstanding)}</div>
                        <div style={{ fontSize:10, color:'var(--text2)', marginTop:2 }}>थकबाकी</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>

                  {/* 3-col mini stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', background:'var(--surface2)', borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                    {[
                      { label:'एकूण बिल', value:formatCurrency(c.totalBilled), color:'var(--text)' },
                      { label:'जमा', value:formatCurrency(c.totalPaid), color:'var(--green)' },
                      { label:'बाकी', value:formatCurrency(c.outstanding), color: urgencyColor },
                    ].map((s,j) => (
                      <div key={j} style={{ padding:'6px 4px', textAlign:'center', borderRight:j<2?'1px solid var(--border)':'none' }}>
                        <div style={{ fontSize:12, fontWeight:800, color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:9, color:'var(--text2)', marginTop:1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  {c.totalBilled > 0 && (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:10, color:'var(--text2)' }}>जमा प्रगती</span>
                        <span style={{ fontSize:10, fontWeight:700, color: paidPct===100 ? 'var(--green)' : 'var(--accent)' }}>{paidPct}%</span>
                      </div>
                      <div style={{ background:'var(--surface2)', borderRadius:20, height:5, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:20, background:`linear-gradient(to right, var(--green), var(--accent))`, width:`${paidPct}%`, transition:'width 0.4s' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action row */}
                <div style={{ borderTop:'1px solid var(--border)', background:'rgba(0,0,0,0.08)', padding:'8px 12px', display:'flex', gap:8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ flex:1 }}
                    onClick={e => { e.stopPropagation(); setPayForm(p=>({...p, customer_id:String(c.id), amount:String(c.outstanding)})); setPayModal(true) }}
                  >
                    💰 पैसे जमा करा
                  </button>
                  {c.mobile && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color:'#25d366', borderColor:'rgba(37,211,102,0.35)', flexShrink:0 }}
                      onClick={e => {
                        e.stopPropagation()
                        const msg = `🙏 नमस्कार ${c.name} जी,\n\nआपल्या खात्यावर थकबाकी आहे:\n💰 थकबाकी: ${formatCurrency(c.outstanding)}\n\nकृपया लवकरात लवकर पैसे जमा करावेत.\n\nधन्यवाद!\n— ${dairyName}`
                        window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(msg)}`, '_blank')
                      }}
                    >
                      💬 WhatsApp
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════ PDF GENERATING OVERLAY ══════════════════════ */}
      {pdfGenerating && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <span className="spinner" style={{ width: 44, height: 44, borderWidth: 4, borderTopColor: '#10b981' }} />
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>PDF बनवत आहे...</div>
          <div style={{ color: '#a7f3d0', fontSize: 12 }}>कृपया थांबा, हे काही सेकंद लागू शकते</div>
        </div>
      )}

      {/* ══════════════════════ MODALS ══════════════════════ */}

      {/* Bulk Generate Modal */}
      <Modal isOpen={bulkModal} onClose={() => { if (!bulkProgress) { setBulkModal(false); setBulkResult(null) } }} title={`⚡ सर्व बिले — ${MONTH_NAMES_MR[selMonth-1]} ${selYear}`}
        footer={
          bulkResult ? (
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={() => { setBulkModal(false); setBulkResult(null) }}>बंद करा</button>
          ) : bulkProgress ? null : (
            <>
              <button className="btn btn-ghost" onClick={() => setBulkModal(false)}>रद्द</button>
              <button className="btn btn-primary" onClick={handleBulkGenerate}>⚡ सर्व बिले बनवा</button>
            </>
          )
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:14, padding:'4px 0' }}>
          {!bulkProgress && !bulkResult && (
            <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, padding:'12px 14px', fontSize:13, color:'var(--text)', lineHeight:1.6 }}>
              सर्व <strong>सक्रिय ग्राहकांचे</strong> {MONTH_NAMES_MR[selMonth-1]} {selYear} महिन्याचे बिल एकत्र तयार होईल.<br/>
              <span style={{ color:'var(--text2)', fontSize:12 }}>लॉक केलेली बिले वगळली जातील. आधीचे मसुदे बदलले जातील.</span>
            </div>
          )}
          {bulkProgress && (
            <div style={{ display:'flex', flexDirection:'column', gap:12, alignItems:'center', padding:'8px 0' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>बिले तयार होत आहेत...</div>
              <div style={{ width:'100%', background:'var(--surface2)', borderRadius:20, height:10, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:20, background:'var(--accent)', transition:'width 0.3s', width: bulkProgress.total > 0 ? `${(bulkProgress.current/bulkProgress.total)*100}%` : '0%' }} />
              </div>
              <div style={{ fontSize:13, color:'var(--text2)' }}>{bulkProgress.current} / {bulkProgress.total} — {bulkProgress.name}</div>
            </div>
          )}
          {bulkResult && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:10, padding:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:900, color:'var(--green)' }}>{bulkResult.success}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>बिले तयार</div>
                </div>
                <div style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:10, padding:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:900, color:'var(--yellow)' }}>{bulkResult.skipped}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>वगळले (लॉक)</div>
                </div>
              </div>
              {bulkResult.errors?.length > 0 && (
                <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--red)', marginBottom:6 }}>⚠️ {bulkResult.errors.length} त्रुटी</div>
                  {bulkResult.errors.map((e,i) => (
                    <div key={i} style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>{e.name}: {e.msg}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={payModal} onClose={()=>setPayModal(false)} title="💰 पैसे जमा नोंद करा"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setPayModal(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSavePay} disabled={savingPay}>
              {savingPay ? <span className="spinner"/> : 'जतन करा'}
            </button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:12, padding:'4px 0' }}>
          <div className="form-group">
            <label className="form-label">ग्राहक *</label>
            <BottomPicker
              className={`form-input${payErrors.customer_id?' error':''}`}
              options={customers.filter(c=>c.status!=='stopped').map(c=>({ label:c.name, value:c.id }))}
              value={payForm.customer_id}
              onChange={val=>{ setPayForm(p=>({...p,customer_id:val})); setPayErrors(p=>({...p,customer_id:''})) }}
              placeholder="ग्राहक निवडा"
              searchable={true}
            />
            {payErrors.customer_id && <div className="form-error">{payErrors.customer_id}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">रक्कम (₹) *</label>
            <input className={`form-input${payErrors.amount?' error':''}`} type="number" inputMode="decimal" min="1" placeholder="0" {...pf('amount')} />
            {payErrors.amount && <div className="form-error">{payErrors.amount}</div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group">
              <label className="form-label">पद्धत</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {Object.entries(PAYMENT_MODES).map(([k,v]) => {
                  const sel = payForm.mode === k
                  return (
                    <button key={k} type="button" onClick={()=>setPayForm(p=>({...p,mode:k}))}
                      style={{ padding:'8px 6px', borderRadius:10, border:`1.5px solid ${sel?'var(--accent)':'var(--border)'}`,
                        background:sel?'rgba(16,185,129,0.15)':'var(--surface2)',
                        color:sel?'var(--accent)':'var(--text2)', fontWeight:sel?700:500,
                        fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                      {MODE_ICONS[k]} {v}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">तारीख</label>
              <input className="form-input" type="date" {...pf('date')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">टीप (ऐच्छिक)</label>
            <TextInput className="form-input" placeholder="नोट्स" {...pf('notes')} />
          </div>
        </div>
      </Modal>

      {/* Generate Bill Modal */}
      <Modal isOpen={genModal} onClose={()=>setGenModal(false)} title="📄 बिल बनवा"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setGenModal(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={genning}>
              {genning ? <span className="spinner"/> : 'बिल बनवा'}
            </button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:14, padding:'4px 0' }}>
          <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'12px 14px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:8 }}>⚡ बिल बनवल्यावर काय होईल?</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                'निवडलेल्या महिन्यातील सर्व डिलिव्हरी मोजल्या जातील',
                'प्रत्येक ग्राहकाचे एकूण बिल आपोआप तयार होईल',
                'मागील थकबाकी असल्यास नव्या बिलात जोडली जाईल',
                'बिल तपासल्यावर "लॉक करा" बटण दाबा',
              ].map((s,i)=>(
                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <span style={{ color:'var(--accent)', fontWeight:800, fontSize:13, flexShrink:0 }}>✓</span>
                  <span style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">ग्राहक</label>
            <BottomPicker
              className="form-input"
              options={[
                { label:`सर्व सक्रिय ग्राहक (${customers.filter(c=>c.status==='active').length} जण)`, value:'all' },
                ...customers.filter(c=>c.status==='active').map(c=>({ label:c.name, value:String(c.id) }))
              ]}
              value={genCustomer}
              onChange={val=>setGenCustomer(val)}
              searchable={true}
            />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">महिना</label>
              <BottomPicker
                className="form-input"
                options={Array.from({length:12},(_,i)=>i+1).map(m=>({ label:MONTH_NAMES_MR[m-1], value:m }))}
                value={selMonth}
                onChange={val=>setSelMonth(parseInt(val))}
              />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">वर्ष</label>
              <BottomPicker
                className="form-input"
                options={[year-1,year,year+1].map(y=>({ label:String(y), value:y }))}
                value={selYear}
                onChange={val=>setSelYear(parseInt(val))}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={!!deleteId} onClose={()=>setDeleteId(null)} title="बिल हटवायचे का?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setDeleteId(null)}>नाही</button>
            <button className="btn btn-danger" onClick={handleDeleteConfirm}>हो, हटवा</button>
          </>
        }
      >
        <p className="confirm-msg">हे बिल आणि त्यातील सर्व तपशील कायमचा हटेल.</p>
      </Modal>

      {/* Unlock Confirm */}
      <Modal isOpen={!!unlockId} onClose={()=>setUnlockId(null)} title="बिल अनलॉक करायचे का?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setUnlockId(null)}>नाही</button>
            <button className="btn btn-primary" onClick={handleUnlock}>🔓 अनलॉक करा</button>
          </>
        }
      >
        <p className="confirm-msg">बिल अनलॉक केल्यावर पुन्हा बदल करता येईल. बदल केल्यावर पुन्हा लॉक करण्यास विसरू नका.</p>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal isOpen={!!editPayment} onClose={()=>setEditPayment(null)} title="✏️ पैसे जमा संपादन"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setEditPayment(null)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSaveEditPay} disabled={savingEditPay}>
              {savingEditPay ? <span className="spinner"/> : 'जतन करा'}
            </button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:12, padding:'4px 0' }}>
          {editPayment && (
            <div style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 14px', fontSize:13, color:'var(--text2)' }}>
              ग्राहक: <strong style={{ color:'var(--text)' }}>{custName(editPayment.customer_id)}</strong>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">रक्कम (₹) *</label>
            <input className="form-input" type="number" inputMode="decimal" min="1"
              value={editPayForm.amount} onChange={e=>setEditPayForm(p=>({...p,amount:e.target.value}))} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group">
              <label className="form-label">पद्धत</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {Object.entries(PAYMENT_MODES).map(([k,v]) => {
                  const sel = editPayForm.mode === k
                  return (
                    <button key={k} type="button" onClick={()=>setEditPayForm(p=>({...p,mode:k}))}
                      style={{ padding:'8px 6px', borderRadius:10, border:`1.5px solid ${sel?'var(--accent)':'var(--border)'}`,
                        background:sel?'rgba(16,185,129,0.15)':'var(--surface2)',
                        color:sel?'var(--accent)':'var(--text2)', fontWeight:sel?700:500,
                        fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                      {MODE_ICONS[k]} {v}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">तारीख</label>
              <input className="form-input" type="date" value={editPayForm.date} onChange={e=>setEditPayForm(p=>({...p,date:e.target.value}))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">टीप</label>
            <TextInput className="form-input" placeholder="नोट्स" value={editPayForm.notes} onChange={e=>setEditPayForm(p=>({...p,notes:e.target.value}))} />
          </div>
        </div>
      </Modal>

      {/* Delete Payment Confirm */}
      <Modal isOpen={!!deletePayId} onClose={()=>setDeletePayId(null)} title="पैसे जमा नोंद हटवायची का?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setDeletePayId(null)}>नाही</button>
            <button className="btn btn-danger" onClick={handleDeletePayConfirm}>हो, हटवा</button>
          </>
        }
      >
        <p className="confirm-msg">ही पैसे जमा नोंद कायमची हटेल. थकबाकी पुन्हा वाढेल.</p>
      </Modal>

      {/* Bill Detail Modal */}
      <Modal isOpen={!!billDetail} onClose={()=>setBillDetail(null)}
        title={`📋 बिल — ${custName(billDetail?.customer_id)}`}
        footer={
          <div style={{ display:'flex', gap:8, width:'100%' }}>
            <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setBillDetail(null)}>बंद करा</button>
            {billDetail && (
              <button
                className="btn btn-primary"
                style={{ flex:1, color:'#25d366', background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.4)' }}
                onClick={async () => {
                  await handleSharePDF(billDetail)
                  setBillDetail(null)
                }}
                disabled={sharingBillId === billDetail?.id}
              >
                {sharingBillId === billDetail?.id ? <span className="spinner"/> : '📤 PDF शेअर'}
              </button>
            )}
          </div>
        }
      >
        {billDetail && (
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:'65vh', overflowY:'auto' }}>
            {/* Financial summary */}
            <div style={{ background:'var(--surface2)', borderRadius:12, padding:'12px 14px', marginBottom:4 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:10 }}>
                💰 {MONTH_NAMES_MR[billDetail.month-1]} {billDetail.year} — आर्थिक सारांश
              </div>
              {[
                { label:'बिल रक्कम', value:formatCurrency(billDetail.total_amount), color:'var(--text)' },
                ...(billDetail.prev_balance>0 ? [{ label:'मागील बाकी (+)', value:formatCurrency(billDetail.prev_balance), color:'var(--yellow)' }] : []),
                { label:'जमा पैसे (−)', value:formatCurrency(billDetail.payments_made), color:'var(--green)' },
              ].map((r,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, paddingBottom:6, marginBottom:6, borderBottom:'1px solid var(--border)' }}>
                  <span style={{ color:'var(--text2)' }}>{r.label}</span>
                  <span style={{ fontWeight:700, color:r.color }}>{r.value}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:2 }}>
                <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>एकूण बाकी</span>
                <span style={{ fontSize:20, fontWeight:900, color:billDetail.amount_due>0?'var(--red)':'var(--green)' }}>
                  {billDetail.amount_due > 0 ? formatCurrency(billDetail.amount_due) : '✅ क्लिअर'}
                </span>
              </div>
            </div>

            {/* Delivery items */}
            {Object.entries(groupedItems).map(([prodName, group]) => (
              <div key={prodName} style={{ marginTop:4 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:6, padding:'6px 10px', background:'rgba(16,185,129,0.08)', borderRadius:8 }}>
                  <span>📦 {prodName}</span>
                  <span>{group.totalQty.toFixed(1)}{group.unit} = {formatCurrency(group.totalAmt)}</span>
                </div>
                {/* Column headers */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', padding:'4px 10px', marginBottom:2 }}>
                  {['तारीख','वेळ','प्रमाण','रक्कम'].map((h,i)=>(
                    <div key={i} style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textAlign: i===3 ? 'right' : 'left' }}>{h}</div>
                  ))}
                </div>
                {group.items.map((item,i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', padding:'5px 10px', background:i%2===0?'var(--surface2)':'transparent', borderRadius:6, marginBottom:2, fontSize:12 }}>
                    <span style={{ color:'var(--text2)' }}>{item.date.slice(5).replace('-','/')}</span>
                    <span style={{ color:'var(--text2)' }}>{item.session==='morning'?'☀️ सकाळ':'🌙 संध्या'}</span>
                    <span style={{ color:'var(--text)' }}>{Number(item.qty || 0).toFixed(1)}{group.unit} × ₹{item.rate}</span>
                    <span style={{ fontWeight:700, color:'var(--text)', textAlign:'right' }}>₹{Number(item.amount || 0).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Modal from '../components/Modal.jsx'
import TextInput from '../components/TextInput.jsx'
import BottomPicker from '../components/BottomPicker.jsx'
import usePullToRefresh from '../hooks/usePullToRefresh.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatCurrency, getMonthYear, todayStr } from '../utils.js'
import { getBills, generateBill, lockBill, unlockBill, deleteBill, getBillItems } from '../services/billService.js'
import { getCustomers } from '../services/customerService.js'
import { addPayment, updatePayment, deletePayment, getPayments, getOutstanding } from '../services/paymentService.js'

const PAYMENT_MODES = { cash: 'रोख', upi: 'UPI', bank: 'बँक', cheque: 'चेक' }
const TABS = ['बिले', 'पैसे जमा', 'थकबाकी']
const MONTH_NAMES_MR = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']

export default function Bills() {
  const { show } = useToast()
  const location = useLocation()
  const [tab, setTab]             = useState(() => location.state?.openPayTab ? 1 : 0)
  const [bills, setBills]         = useState([])
  const [customers, setCustomers] = useState([])
  const [payments, setPayments]   = useState([])
  const [outstanding, setOutstanding] = useState([])
  const [loading, setLoading]     = useState(true)
  const { month, year }           = getMonthYear()
  const [selMonth, setSelMonth]   = useState(month)
  const [selYear,  setSelYear]    = useState(year)

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
  const [editPayment, setEditPayment] = useState(null) // payment object being edited
  const [editPayForm, setEditPayForm] = useState({ amount: '', mode: 'cash', notes: '', date: '' })
  const [savingEditPay, setSavingEditPay] = useState(false)

  // Delete payment confirm
  const [deletePayId, setDeletePayId] = useState(null)

  // Generate modal
  const [genModal,    setGenModal]    = useState(false)
  const [genCustomer, setGenCustomer] = useState('all')
  const [genning,     setGenning]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, c, p, o] = await Promise.all([getBills(), getCustomers(), getPayments(), getOutstanding()])
      setBills(b); setCustomers(c); setPayments(p); setOutstanding(o)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { containerRef: billsListRef, indicator: billsRefreshIndicator } = usePullToRefresh(load)

  const monthBills = bills.filter(b => b.month === selMonth && b.year === selYear)

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
    if (!payForm.customer_id)                        e.customer_id = 'ग्राहक निवडा'
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) e.amount = 'रक्कम टाका'
    setPayErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSavePay = async () => {
    if (!validatePay()) return
    setSavingPay(true)
    try {
      await addPayment({
        customer_id: parseInt(payForm.customer_id),
        bill_id: null,
        date: payForm.date,
        amount: parseFloat(payForm.amount),
        mode: payForm.mode,
        notes: payForm.notes,
      })
      show('पैसे जमा नोंद झाली', 'success')
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

  // Group bill items by product for the detail modal
  const groupedItems = billItems.reduce((acc, item) => {
    const key = item.product_name || 'दूध'
    if (!acc[key]) acc[key] = { items: [], totalQty: 0, totalAmt: 0, unit: item.unit || 'L' }
    acc[key].items.push(item)
    acc[key].totalQty += item.qty
    acc[key].totalAmt += item.amount
    return acc
  }, {})

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100dvh', background:'var(--bg)', paddingBottom:'var(--nav-h)' }}>
      <Header
        title="बिल व पैसे"
        icon="📋"
        subtitle={tab === 0 ? `${MONTH_NAMES_MR[selMonth-1]} ${selYear} · ${monthBills.length} बिले` : tab === 1 ? `${payments.length} पैसे जमा नोंदी` : `${outstanding.length} थकबाकी ग्राहक`}
      />

      {/* Sticky tab bar */}
      <div style={{ position:'sticky', top:56, zIndex:10, background:'var(--bg)', padding:'10px 16px 0', borderBottom:'1px solid var(--border)' }}>
        <div className="tabs">
          {TABS.map((t,i) => (
            <button key={i} className={`tab${tab===i?' active':''}`} onClick={()=>setTab(i)}>{t}</button>
          ))}
        </div>
      </div>

      {/* ── Bills Tab ── */}
      {tab===0 && (
        <div ref={billsListRef} style={{ flex:1, padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {billsRefreshIndicator}

          {/* Month selector row */}
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
            <button className="btn btn-primary btn-sm" onClick={()=>setGenModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              बिल बनवा
            </button>
          </div>

          {/* Monthly stats strip — only shown when bills exist */}
          {monthBills.length > 0 && (() => {
            const totalBilled = monthBills.reduce((s,b)=>s+(b.total_amount||0),0)
            const totalPaid   = monthBills.reduce((s,b)=>s+(b.payments_made||0),0)
            const totalDue    = monthBills.reduce((s,b)=>s+(b.amount_due||0),0)
            const locked      = monthBills.filter(b=>b.is_locked).length
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
                <div style={{ padding:'8px 14px', display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, color:'var(--text2)' }}>
                    {monthBills.length} बिले
                  </span>
                  <span style={{ color:'var(--border)', fontSize:11 }}>·</span>
                  <span style={{ fontSize:11, color:locked===monthBills.length?'var(--green)':'var(--yellow)', fontWeight:600 }}>
                    {locked===monthBills.length ? '✅ सर्व लॉक' : `🔒 ${locked}/${monthBills.length} लॉक`}
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Process guide — shown only when no bills for selected month */}
          {!loading && monthBills.length===0 && (
            <div style={{ background:'rgba(16,185,129,0.06)', border:'1.5px dashed rgba(16,185,129,0.3)', borderRadius:16, padding:'16px 16px 14px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', marginBottom:12 }}>📋 बिल प्रक्रिया — कशी करायची?</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { step:'१', icon:'🥛', title:'डिलिव्हरी नोंद', desc:'प्रतिदिन दूध दिल्याची नोंद "डिलिव्हरी" पानावर करा', done:true },
                  { step:'२', icon:'📄', title:'बिल तयार करा', desc:'महिना संपल्यावर "बिल बनवा" बटण दाबून सर्व ग्राहकांचे बिल बनवा', done:false, cta:true },
                  { step:'३', icon:'🔒', title:'बिल लॉक करा', desc:'बिल तपासल्यावर लॉक करा — लॉक केल्यावर बदल होत नाही', done:false },
                  { step:'४', icon:'💰', title:'पैसे जमा करा', desc:'ग्राहकाकडून पैसे मिळाल्यावर "पैसे जमा" टॅबमध्ये नोंद करा', done:false },
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
                          बिल बनवा →
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
            const monthLabel = MONTH_NAMES_MR[b.month-1]+' '+b.year
            return (
              <div key={b.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.18)' }}>
                {/* Bill header — tappable for detail */}
                <div style={{ padding:'13px 14px 11px', cursor:'pointer' }} onClick={()=>openBillDetail(b)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c?.name||'ग्राहक'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>
                        {formatCurrency(b.total_amount)} बिल
                        <span style={{ margin:'0 5px', color:'var(--border)' }}>•</span>
                        <span style={{ color:'var(--green)' }}>{formatCurrency(b.payments_made)} जमा</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                      <span className={`badge ${b.is_locked?'badge-green':'badge-yellow'}`}>
                        {b.is_locked?'🔒 लॉक':'मसुदा'}
                      </span>
                      <span style={{ fontSize:13, fontWeight:800, color:b.amount_due>0?'var(--red)':'var(--green)' }}>
                        बाकी {formatCurrency(b.amount_due)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action strip */}
                <div style={{ borderTop:'1px solid var(--border)', background:'rgba(0,0,0,0.12)', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize:12 }}
                    onClick={()=>openBillDetail(b)}
                  >
                    📋 तपशील पाहा
                  </button>
                  <div style={{ display:'flex', gap:6 }}>
                    {!b.is_locked && (
                      <button className="btn btn-primary btn-sm" onClick={()=>handleLock(b.id)}>
                        🔒 लॉक करा
                      </button>
                    )}
                    {b.is_locked && (
                      <button
                        style={{ background:'none', border:'1px solid rgba(245,158,11,0.4)', borderRadius:8, padding:'5px 10px', cursor:'pointer', color:'var(--yellow)', display:'flex', alignItems:'center', gap:5, fontSize:12 }}
                        onClick={()=>setUnlockId(b.id)}
                      >
                        🔓 अनलॉक
                      </button>
                    )}
                    {!b.is_locked && (
                      <button
                        style={{ background:'none', border:'1px solid rgba(239,68,68,0.35)', borderRadius:8, padding:'5px 10px', cursor:'pointer', color:'var(--red)', display:'flex', alignItems:'center' }}
                        onClick={()=>setDeleteId(b.id)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Payments Tab ── */}
      {tab===1 && (
        <div style={{ flex:1, padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* Total collected strip + add button */}
          {(() => {
            const total = payments.reduce((s,p)=>s+(p.amount||0),0)
            return (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px 10px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>एकूण जमा झालेले पैसे</div>
                  <div style={{ fontSize:28, fontWeight:900, color:'var(--green)' }}>{formatCurrency(total)}</div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{payments.length} नोंदी</div>
                </div>
                <button className="btn btn-primary" style={{ width:'100%', borderRadius:0 }} onClick={()=>setPayModal(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  💰 पैसे जमा नोंद करा
                </button>
              </div>
            )
          })()}

          {payments.length===0 ? (
            <div className="empty">
              <div className="empty-icon">💰</div>
              <div className="empty-title">पैसे जमा नाही</div>
              <div className="empty-desc">वर बटण दाबून पैसे जमा नोंद करा</div>
            </div>
          ) : [...payments].reverse().map(p=>(
            <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', flex:1, minWidth:0 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'rgba(16,185,129,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {p.mode==='upi'?'📲':p.mode==='bank'?'🏦':p.mode==='cheque'?'📝':'💵'}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{custName(p.customer_id)}</div>
                    <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                      {p.date} · {PAYMENT_MODES[p.mode]||p.mode}
                      {p.notes?` · ${p.notes}`:''}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:17, fontWeight:800, color:'var(--green)', flexShrink:0 }}>+{formatCurrency(p.amount)}</div>
              </div>
              <div style={{ borderTop:'1px solid var(--border)', background:'rgba(0,0,0,0.08)', padding:'6px 12px', display:'flex', gap:6, justifyContent:'flex-end' }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize:12 }} onClick={()=>openEditPayment(p)}>
                  ✏️ संपादन
                </button>
                <button
                  style={{ background:'none', border:'1px solid rgba(239,68,68,0.35)', borderRadius:8, padding:'4px 10px', cursor:'pointer', color:'var(--red)', fontSize:12 }}
                  onClick={()=>setDeletePayId(p.id)}
                >
                  🗑️ हटवा
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Outstanding Tab ── */}
      {tab===2 && (
        <div style={{ flex:1, padding:'14px 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* Total outstanding hero */}
          {outstanding.length>0 && (() => {
            const totalDue = outstanding.reduce((s,c)=>s+(c.outstanding||0),0)
            return (
              <div style={{ background:'linear-gradient(135deg,rgba(239,68,68,0.14) 0%,rgba(239,68,68,0.05) 100%)', border:'1.5px solid rgba(239,68,68,0.3)', borderRadius:16, padding:'16px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>🔴 एकूण थकबाकी</div>
                  <div style={{ fontSize:32, fontWeight:900, color:'var(--text)', lineHeight:1 }}>{formatCurrency(totalDue)}</div>
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:5 }}>{outstanding.length} ग्राहकांकडून बाकी</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>setTab(1)}>
                  💰 जमा करा
                </button>
              </div>
            )
          })()}

          {outstanding.length===0 ? (
            <div className="empty">
              <div className="empty-icon">✅</div>
              <div className="empty-title">कोणाची थकबाकी नाही!</div>
              <div className="empty-desc">सर्व पैसे जमा झाले आहेत</div>
            </div>
          ) : outstanding.map((c,i)=>(
            <div key={c.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:14, boxShadow:'0 1px 6px rgba(0,0,0,0.15)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <span style={{ fontSize:11, fontWeight:800, color:'var(--text2)', background:'var(--surface2)', borderRadius:6, padding:'2px 7px', flexShrink:0 }}>#{i+1}</span>
                    <span style={{ fontSize:15, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:5 }}>
                    बिल {formatCurrency(c.totalBilled)}
                    <span style={{ margin:'0 5px', color:'var(--border)' }}>·</span>
                    <span style={{ color:'var(--green)' }}>जमा {formatCurrency(c.totalPaid)}</span>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:18, fontWeight:900, color:'var(--red)' }}>{formatCurrency(c.outstanding)}</div>
                  <div style={{ fontSize:10, color:'var(--text2)', marginTop:2 }}>थकबाकी</div>
                </div>
              </div>
              {c.totalBilled>0 && (
                <div style={{ background:'var(--surface2)', borderRadius:20, height:6, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:20, background:`linear-gradient(to right, var(--green), var(--accent))`, width:`${Math.min(100,(c.totalPaid/c.totalBilled)*100)}%`, transition:'width 0.4s' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Payment Modal ── */}
      <Modal isOpen={payModal} onClose={()=>setPayModal(false)} title="पैसे जमा नोंद करा"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setPayModal(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSavePay} disabled={savingPay}>
              {savingPay?<span className="spinner"/>:'जतन करा'}
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
            {payErrors.customer_id&&<div className="form-error">{payErrors.customer_id}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">रक्कम (₹) *</label>
            <input className={`form-input${payErrors.amount?' error':''}`} type="number" inputMode="decimal" min="1" placeholder="0" {...pf('amount')} />
            {payErrors.amount&&<div className="form-error">{payErrors.amount}</div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div className="form-group">
              <label className="form-label">पद्धत</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {Object.entries(PAYMENT_MODES).map(([k,v]) => {
                  const icons = { cash:'💵', upi:'📲', bank:'🏦', cheque:'📝' }
                  const sel = payForm.mode === k
                  return (
                    <button key={k} type="button" onClick={() => setPayForm(p=>({...p,mode:k}))}
                      style={{ padding:'8px 6px', borderRadius:10, border:`1.5px solid ${sel?'var(--accent)':'var(--border)'}`,
                        background: sel?'rgba(16,185,129,0.15)':'var(--surface2)',
                        color: sel?'var(--accent)':'var(--text2)', fontWeight: sel?700:500,
                        fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                      {icons[k]} {v}
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

      {/* ── Generate Bill Modal ── */}
      <Modal isOpen={genModal} onClose={()=>setGenModal(false)} title="बिल बनवा"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setGenModal(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={genning}>
              {genning?<span className="spinner"/>:'बिल बनवा'}
            </button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:14, padding:'4px 0' }}>

          {/* What will happen explanation */}
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

      {/* ── Delete Confirm Modal ── */}
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

      {/* ── Unlock Confirm Modal ── */}
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

      {/* ── Edit Payment Modal ── */}
      <Modal isOpen={!!editPayment} onClose={()=>setEditPayment(null)} title="पैसे जमा संपादन"
        footer={
          <>
            <button className="btn btn-ghost" onClick={()=>setEditPayment(null)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSaveEditPay} disabled={savingEditPay}>
              {savingEditPay?<span className="spinner"/>:'जतन करा'}
            </button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:12, padding:'4px 0' }}>
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
                  const icons = { cash:'💵', upi:'📲', bank:'🏦', cheque:'📝' }
                  const sel = editPayForm.mode === k
                  return (
                    <button key={k} type="button" onClick={()=>setEditPayForm(p=>({...p,mode:k}))}
                      style={{ padding:'8px 6px', borderRadius:10, border:`1.5px solid ${sel?'var(--accent)':'var(--border)'}`,
                        background:sel?'rgba(16,185,129,0.15)':'var(--surface2)',
                        color:sel?'var(--accent)':'var(--text2)', fontWeight:sel?700:500,
                        fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                      {icons[k]} {v}
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
            <input className="form-input" placeholder="नोट्स" value={editPayForm.notes} onChange={e=>setEditPayForm(p=>({...p,notes:e.target.value}))} />
          </div>
        </div>
      </Modal>

      {/* ── Delete Payment Confirm ── */}
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

      {/* ── Bill Detail Modal ── */}
      <Modal isOpen={!!billDetail} onClose={()=>setBillDetail(null)}
        title={`बिल — ${custName(billDetail?.customer_id)}`}
        footer={<button className="btn btn-primary" style={{ width:'100%' }} onClick={()=>setBillDetail(null)}>बंद करा</button>}
      >
        {billDetail&&(
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:'65vh', overflowY:'auto' }}>
            {/* Summary rows */}
            <div style={{ background:'var(--surface2)', borderRadius:12, padding:'10px 14px', display:'flex', flexDirection:'column', gap:6, marginBottom:4 }}>
              {[
                { label:'महिना', value:MONTH_NAMES_MR[billDetail.month-1]+' '+billDetail.year, color:'var(--text)' },
                { label:'बिल रक्कम', value:formatCurrency(billDetail.total_amount), color:'var(--text)' },
                ...(billDetail.prev_balance>0?[{ label:'मागील बाकी', value:formatCurrency(billDetail.prev_balance), color:'var(--yellow)' }]:[]),
                { label:'जमा पैसे', value:formatCurrency(billDetail.payments_made), color:'var(--green)' },
              ].map((r,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13 }}>
                  <span style={{ color:'var(--text2)' }}>{r.label}</span>
                  <span style={{ fontWeight:700, color:r.color }}>{r.value}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'2px solid var(--border)', paddingTop:8, marginTop:2 }}>
                <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>एकूण बाकी</span>
                <span style={{ fontSize:18, fontWeight:900, color:billDetail.amount_due>0?'var(--red)':'var(--green)' }}>
                  {formatCurrency(billDetail.amount_due)}
                </span>
              </div>
            </div>

            {/* Bill items grouped by product */}
            {Object.entries(groupedItems).map(([prodName,group])=>(
              <div key={prodName} style={{ marginTop:6 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:6, padding:'4px 0' }}>
                  📦 {prodName} — {group.totalQty.toFixed(1)}{group.unit} = {formatCurrency(group.totalAmt)}
                </div>
                {group.items.map((item,i)=>(
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 10px', background:i%2===0?'var(--surface2)':'transparent', borderRadius:6, marginBottom:2, fontSize:12 }}>
                    <span style={{ color:'var(--text2)' }}>{item.date.slice(5)} {item.session==='morning'?'☀️':'🌙'}</span>
                    <span style={{ color:'var(--text2)' }}>{item.qty}{group.unit} × ₹{item.rate}</span>
                    <span style={{ fontWeight:700, color:'var(--text)' }}>₹{item.amount?.toFixed(0)}</span>
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

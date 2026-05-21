import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Modal from '../components/Modal.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatCurrency, todayStr } from '../utils.js'
import db from '../db/database.js'
import { getBillItems, generateBill, lockBill, deleteBill } from '../services/billService.js'
import { getCustomerPayments, addPayment } from '../services/paymentService.js'
import { getCustomerProducts, PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'

const MONTH_NAMES_MR = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']
const SESSION_LABEL  = { morning: '☀️ सकाळ', evening: '🌙 संध्या' }
const PAYMENT_MODES  = { cash: 'रोख', upi: 'UPI', bank: 'बँक', cheque: 'चेक' }

// ── Format date DD/MM ────────────────────────────────────────────────────────
const fmtDate = (d) => { const p = d.split('-'); return `${p[2]}/${p[1]}` }

// ── WhatsApp bill text generator ─────────────────────────────────────────────
function buildWhatsAppText({ customer, bill, items, dairyName }) {
  const monthLabel = `${MONTH_NAMES_MR[bill.month - 1]} ${bill.year}`
  const grouped = items.reduce((acc, item) => {
    const k = item.product_name || 'दूध'
    if (!acc[k]) acc[k] = { totalQty: 0, totalAmt: 0, unit: item.unit || 'L', rate: item.rate }
    acc[k].totalQty += item.qty
    acc[k].totalAmt += item.amount
    return acc
  }, {})

  const productLines = Object.entries(grouped)
    .map(([name, g]) => `🥛 ${name}: ${g.totalQty.toFixed(1)}${g.unit} × ₹${g.rate} = ₹${g.totalAmt.toFixed(0)}`)
    .join('\n')

  const lines = [
    `🥛 *${dairyName}*`,
    `━━━━━━━━━━━━━━━━━━`,
    `📋 *मासिक बिल — ${monthLabel}*`,
    ``,
    `नमस्कार *${customer.name}* जी,`,
    `आपल्या ${monthLabel} महिन्याचे बिल तयार झाले आहे.`,
    ``,
    productLines,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `💰 एकूण बिल:   ₹${bill.total_amount?.toFixed(0)}`,
    ...(bill.prev_balance > 0 ? [`⏪ मागील बाकी:  ₹${bill.prev_balance?.toFixed(0)}`] : []),
    ...(bill.payments_made > 0 ? [`✅ जमा:         ₹${bill.payments_made?.toFixed(0)}`] : []),
    ``,
    `*❗ बाकी रक्कम: ₹${bill.amount_due?.toFixed(0)}*`,
    ``,
    `कृपया लवकरात लवकर पैसे जमा करावेत.`,
    `धन्यवाद! 🙏`,
  ]
  return lines.join('\n')
}

// ── Copy text to clipboard ────────────────────────────────────────────────────
async function copyToClipboard(text, show) {
  try {
    await navigator.clipboard.writeText(text)
    show('मजकूर कॉपी झाला', 'success')
  } catch {
    show('कॉपी होऊ शकला नाही', 'error')
  }
}

// ── PDF Bill Generator ────────────────────────────────────────────────────────
function printBill({ customer, bill, items, dairyName, area }) {
  const grouped = items.reduce((acc, item) => {
    const k = item.product_name || 'दूध'
    if (!acc[k]) acc[k] = { items: [], totalQty: 0, totalAmt: 0, unit: item.unit || 'L', rate: item.rate }
    acc[k].items.push(item)
    acc[k].totalQty += item.qty
    acc[k].totalAmt += item.amount
    return acc
  }, {})

  const monthLabel = `${MONTH_NAMES_MR[bill.month - 1]} ${bill.year}`
  const printDate  = new Date().toLocaleDateString('mr-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  // Build table sections — one per product
  const productSections = Object.entries(grouped).map(([prodName, g]) => {
    const sortedItems = [...g.items].sort((a, b) =>
      a.date.localeCompare(b.date) || (a.session === 'morning' ? -1 : 1))
    const rowsHtml = sortedItems.map((item, i) => `
      <tr class="${i % 2 === 0 ? 'even' : ''}">
        <td>${fmtDate(item.date)}</td>
        <td>${item.session === 'morning' ? '☀️ सकाळ' : '🌙 संध्या'}</td>
        <td style="text-align:right">${item.qty.toFixed(1)} ${item.unit}</td>
        <td style="text-align:right">₹${item.rate}</td>
        <td style="text-align:right;font-weight:700">₹${item.amount.toFixed(0)}</td>
      </tr>`).join('')
    return `
      <div class="prod-section">
        <div class="prod-header">
          <span class="prod-name">📦 ${prodName}</span>
          <span class="prod-total">${g.totalQty.toFixed(1)}${g.unit} = ₹${g.totalAmt.toFixed(0)}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>तारीख</th><th>वेळ</th>
              <th style="text-align:right">प्रमाण</th>
              <th style="text-align:right">दर</th>
              <th style="text-align:right">रक्कम</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="mr">
<head>
<meta charset="utf-8">
<title>बिल — ${customer.name} — ${monthLabel}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Segoe UI', 'Noto Sans Devanagari', Arial, sans-serif;
    font-size: 13px; color: #111827; background: #fff;
    max-width: 680px; margin: 0 auto; padding: 0;
  }

  /* ── Header bar ── */
  .top-bar {
    background: #065f46;
    color: #fff;
    padding: 18px 24px 14px;
    display: flex; justify-content: space-between; align-items: flex-start;
  }
  .dairy-name { font-size: 22px; font-weight: 900; letter-spacing: -0.3px; }
  .dairy-sub  { font-size: 11px; opacity: 0.75; margin-top: 3px; }
  .bill-meta  { text-align: right; }
  .bill-meta .bill-type { font-size: 13px; font-weight: 700; opacity: 0.9; }
  .bill-meta .bill-month { font-size: 18px; font-weight: 900; margin: 2px 0; }
  .bill-meta .bill-date  { font-size: 11px; opacity: 0.7; }

  /* ── Status ribbon ── */
  .status-ribbon {
    background: ${bill.is_locked ? '#d1fae5' : '#fef3c7'};
    color: ${bill.is_locked ? '#065f46' : '#92400e'};
    font-size: 11px; font-weight: 800;
    padding: 5px 24px;
    letter-spacing: 0.5px;
    border-bottom: 3px solid ${bill.is_locked ? '#10b981' : '#f59e0b'};
  }

  /* ── Customer info ── */
  .customer-section {
    padding: 16px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px;
  }
  .info-row { display: flex; flex-direction: column; gap: 2px; }
  .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: 700; }
  .info-value { font-size: 13px; font-weight: 600; color: #111827; }

  /* ── Product sections ── */
  .body { padding: 0 24px 16px; }
  .prod-section { margin-top: 18px; }
  .prod-header {
    display: flex; justify-content: space-between; align-items: center;
    background: #f0fdf4; border-left: 4px solid #10b981;
    padding: 7px 12px; margin-bottom: 0;
    border-radius: 0 6px 0 0;
  }
  .prod-name  { font-size: 13px; font-weight: 800; color: #065f46; }
  .prod-total { font-size: 13px; font-weight: 700; color: #065f46; }
  table { width: 100%; border-collapse: collapse; }
  th {
    background: #f9fafb; color: #374151;
    padding: 7px 10px; font-size: 11px;
    font-weight: 700; text-align: left;
    border-bottom: 2px solid #e5e7eb;
  }
  td { padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
  tr.even td { background: #f9fafb; }

  /* ── Summary ── */
  .summary {
    margin: 20px 24px 0;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
  }
  .sum-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 9px 16px; border-bottom: 1px solid #e5e7eb;
    font-size: 13px;
  }
  .sum-row:last-child { border-bottom: none; }
  .sum-label { color: #6b7280; }
  .sum-value { font-weight: 700; color: #111827; }
  .sum-row.total {
    background: #065f46; color: #fff;
    padding: 13px 16px;
  }
  .sum-row.total .sum-label { color: #d1fae5; font-size: 12px; }
  .sum-row.total .sum-value { color: #fff; font-size: 20px; font-weight: 900; }
  .sum-row.paid .sum-value  { color: #059669; }
  .sum-row.prev .sum-value  { color: #d97706; }

  /* ── Footer ── */
  .footer {
    margin: 20px 24px 24px;
    padding-top: 14px;
    border-top: 1px dashed #d1d5db;
    display: flex; justify-content: space-between; align-items: flex-end;
  }
  .footer-left  { font-size: 11px; color: #9ca3af; line-height: 1.7; }
  .footer-right {
    text-align: right;
    border-top: 1px solid #9ca3af;
    padding-top: 30px;
    font-size: 10px; color: #9ca3af;
    min-width: 120px;
  }

  @media print {
    body { max-width: 100%; }
    @page { margin: 8mm; size: A4; }
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="top-bar">
    <div>
      <div class="dairy-name">🥛 ${dairyName}</div>
      <div class="dairy-sub">दूध डेअरी व्यवस्थापन</div>
    </div>
    <div class="bill-meta">
      <div class="bill-type">मासिक बिल</div>
      <div class="bill-month">${monthLabel}</div>
      <div class="bill-date">दिनांक: ${printDate}</div>
    </div>
  </div>
  <div class="status-ribbon">${bill.is_locked ? '🔒 लॉक केलेले बिल — अंतिम' : '📝 मसुदा बिल — अंतिम नाही'}</div>

  <!-- Customer info -->
  <div class="customer-section">
    <div class="info-row">
      <span class="info-label">ग्राहकाचे नाव</span>
      <span class="info-value" style="font-size:16px;font-weight:900">${customer.name}</span>
    </div>
    ${customer.mobile ? `<div class="info-row"><span class="info-label">मोबाईल</span><span class="info-value">📱 ${customer.mobile}</span></div>` : '<div></div>'}
    ${area ? `<div class="info-row"><span class="info-label">भाग / क्षेत्र</span><span class="info-value">📍 ${area}</span></div>` : '<div></div>'}
    ${customer.address ? `<div class="info-row"><span class="info-label">पत्ता</span><span class="info-value">${customer.address}</span></div>` : '<div></div>'}
  </div>

  <!-- Product tables -->
  <div class="body">${productSections}</div>

  <!-- Summary box -->
  <div class="summary">
    <div class="sum-row">
      <span class="sum-label">एकूण बिल रक्कम</span>
      <span class="sum-value">₹${bill.total_amount?.toFixed(2)}</span>
    </div>
    ${bill.prev_balance > 0 ? `
    <div class="sum-row prev">
      <span class="sum-label">मागील थकबाकी</span>
      <span class="sum-value">₹${bill.prev_balance?.toFixed(2)}</span>
    </div>` : ''}
    ${bill.payments_made > 0 ? `
    <div class="sum-row paid">
      <span class="sum-label">जमा पैसे</span>
      <span class="sum-value">− ₹${bill.payments_made?.toFixed(2)}</span>
    </div>` : ''}
    <div class="sum-row total">
      <span class="sum-label">एकूण देणे (बाकी)</span>
      <span class="sum-value">₹${bill.amount_due?.toFixed(2)}</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      ${dairyName}<br>
      बिल तयार: ${printDate}<br>
      हे बिल संगणकाद्वारे तयार केले आहे.
    </div>
    <div class="footer-right">ग्राहकाची सही</div>
  </div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=820,height=780')
  if (win) { win.document.write(html); win.document.close() }
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function CustomerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { show } = useToast()
  const custId = parseInt(id)

  const [customer,   setCustomer]   = useState(null)
  const [area,       setArea]       = useState('')
  const [products,   setProducts]   = useState([])
  const [extraSubs,  setExtraSubs]  = useState([])
  const [bills,      setBills]      = useState([])
  const [payments,   setPayments]   = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [dairyName,  setDairyName]  = useState('दूध डेअरी')
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState(0)  // 0=बिले, 1=डिलिव्हरी, 2=पैसे

  // Bill detail expand
  const [expandedBill,  setExpandedBill]  = useState(null)
  const [billItemsMap,  setBillItemsMap]  = useState({})

  // Payment modal
  const [payModal,  setPayModal]  = useState(false)
  const [payForm,   setPayForm]   = useState({ amount: '', mode: 'cash', notes: '', date: todayStr() })
  const [payErrors, setPayErrors] = useState({})
  const [savingPay, setSavingPay] = useState(false)

  // Generate bill modal
  const now = new Date()
  const [genModal,  setGenModal]  = useState(false)
  const [genMonth,  setGenMonth]  = useState(now.getMonth() + 1)
  const [genYear,   setGenYear]   = useState(now.getFullYear())
  const [genning,   setGenning]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cust, allAreas, allProds, billList, payList, delivList, settings] = await Promise.all([
        db.first('SELECT * FROM customers WHERE id = ? LIMIT 1', [custId]),
        db.query('SELECT * FROM areas ORDER BY sequence'),
        db.query('SELECT * FROM products'),
        db.query('SELECT * FROM monthly_bills WHERE customer_id = ?', [custId]),
        db.query('SELECT * FROM payments WHERE customer_id = ?', [custId]),
        db.query('SELECT * FROM deliveries WHERE customer_id = ?', [custId]),
        db.query('SELECT key, value FROM settings'),
      ])
      if (!cust) { navigate('/customers'); return }
      const settingsMap = {}
      for (const s of settings) settingsMap[s.key] = s.value
      if (settingsMap.dairy_name) setDairyName(settingsMap.dairy_name)

      setCustomer(cust)
      setProducts(allProds)
      setArea(allAreas.find(a => a.id === cust.area_id)?.name || '')

      const subs = await getCustomerProducts(custId)
      setExtraSubs(subs)

      // Sort bills newest first
      setBills(billList.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month))
      // Sort payments newest first
      setPayments(payList.sort((a, b) => b.date.localeCompare(a.date)))
      // Sort deliveries newest first
      setDeliveries(delivList.sort((a, b) => b.date.localeCompare(a.date) || (a.session === 'morning' ? 1 : -1)))
    } finally {
      setLoading(false)
    }
  }, [custId, navigate])

  useEffect(() => { load() }, [load])

  const toggleBill = async (bill) => {
    if (expandedBill?.id === bill.id) { setExpandedBill(null); return }
    setExpandedBill(bill)
    if (!billItemsMap[bill.id]) {
      const items = await db.query('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id])
      setBillItemsMap(prev => ({ ...prev, [bill.id]: items }))
    }
  }

  const handlePrintBill = async (bill) => {
    let items = billItemsMap[bill.id]
    if (!items) {
      items = await db.query('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id])
      setBillItemsMap(prev => ({ ...prev, [bill.id]: items }))
    }
    printBill({ customer, bill, items, dairyName, area })
  }

  const handleGenerate = async () => {
    setGenning(true)
    try {
      await generateBill(custId, genMonth, genYear)
      show('बिल तयार झाले', 'success')
      setGenModal(false)
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setGenning(false)
    }
  }

  const handleLock = async (id) => {
    await lockBill(id)
    show('बिल लॉक झाले', 'success')
    load()
  }

  const handleDeleteBill = async (id) => {
    await deleteBill(id)
    show('बिल हटवले', 'success')
    if (expandedBill?.id === id) setExpandedBill(null)
    load()
  }

  const validatePay = () => {
    const e = {}
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) e.amount = 'रक्कम टाका'
    setPayErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSavePay = async () => {
    if (!validatePay()) return
    setSavingPay(true)
    try {
      await addPayment({ customer_id: custId, bill_id: null, date: payForm.date, amount: parseFloat(payForm.amount), mode: payForm.mode, notes: payForm.notes })
      show('पैसे जमा नोंद झाली', 'success')
      setPayModal(false)
      setPayForm({ amount: '', mode: 'cash', notes: '', date: todayStr() })
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSavingPay(false)
    }
  }

  const primaryProduct = customer ? products.find(p => p.id === customer.product_id) : null
  const prodColor = primaryProduct ? PRODUCT_TYPE_COLOR[primaryProduct.type] : 'var(--accent)'
  const prodTint  = primaryProduct ? PRODUCT_TYPE_TINT[primaryProduct.type]  : 'rgba(16,185,129,0.12)'

  const totalBilled = bills.reduce((s, b) => s + (b.total_amount || 0), 0)
  const totalPaid   = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const outstanding = Math.max(0, totalBilled - totalPaid)

  // Group deliveries by month
  const deliveriesByMonth = deliveries.reduce((acc, d) => {
    const key = d.date.slice(0, 7) // YYYY-MM
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <div style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[140, 80, 200].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 14, background: 'var(--surface)', animation: `skel 1.6s ease-in-out ${i * 0.1}s infinite` }} />
        ))}
      </div>
      <style>{`@keyframes skel{0%,100%{opacity:.9}50%{opacity:.4}}`}</style>
    </div>
  )

  if (!customer) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>
      <Header
        title={customer.name}
        subtitle={`${customer.status === 'active' ? '🟢 सक्रिय' : customer.status === 'paused' ? '🟡 थांबले' : '🔴 बंद'}${primaryProduct ? '  ·  ' + (primaryProduct.type === 'milk_buffalo' ? '🐃' : '🐄') + ' ' + primaryProduct.name : ''}`}
        onBack={() => navigate('/customers')}
      />

      {/* ── Customer Info Card ── */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Avatar */}
            <div style={{ width: 52, height: 52, borderRadius: 14, background: prodTint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: prodColor, flexShrink: 0 }}>
              {customer.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{customer.name}</span>
                <span className={`badge badge-${customer.status === 'active' ? 'green' : customer.status === 'paused' ? 'yellow' : 'red'}`}>
                  {customer.status === 'active' ? 'सक्रिय' : customer.status === 'paused' ? 'थांबले' : 'बंद'}
                </span>
              </div>
              {customer.mobile && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>📱 {customer.mobile}</div>}
              {area && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>📍 {area}</div>}
              {customer.address && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>🏠 {customer.address}</div>}
            </div>
          </div>

          {/* Delivery row — one structured line */}
          <div style={{ marginTop: 10, background: prodTint, border: `1px solid ${prodColor}22`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15 }}>{primaryProduct?.type === 'milk_cow' ? '🐄' : '🐃'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: prodColor }}>{primaryProduct?.name || 'दूध'}</span>
            <span style={{ color: `${prodColor}66`, fontSize: 12 }}>|</span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>☀️ {customer.morning_qty || 0}{primaryProduct?.unit || 'L'}</span>
            <span style={{ color: 'var(--border)', fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>🌙 {customer.evening_qty || 0}{primaryProduct?.unit || 'L'}</span>
            <span style={{ color: `${prodColor}66`, fontSize: 12 }}>|</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: prodColor }}>₹{customer.rate}/{primaryProduct?.unit || 'L'}</span>
          </div>

          {/* Extra product subs */}
          {extraSubs.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {extraSubs.map(s => (
                <div key={s.id} style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#06b6d4', fontWeight: 600 }}>
                  📦 {s.product?.name} — ₹{s.rate}/{s.product?.unit}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats + Actions — unified card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '12px 8px 10px' }}>
            {[
              { label: 'एकूण बिल',  value: formatCurrency(totalBilled), color: 'var(--text)' },
              { label: 'एकूण जमा',  value: formatCurrency(totalPaid),   color: 'var(--green)' },
              { label: 'थकबाकी',   value: formatCurrency(outstanding),  color: outstanding > 0 ? 'var(--red)' : 'var(--green)' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', display: 'flex', gap: 0 }}>
            <button className="btn btn-primary" style={{ flex: 1, borderRadius: 0, borderRight: '1px solid rgba(255,255,255,0.15)' }} onClick={() => setGenModal(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/></svg>
              📄 बिल बनवा
            </button>
            <button className="btn btn-ghost" style={{ flex: 1, borderRadius: 0, color: 'var(--green)', border: 'none', borderTop: '1px solid var(--border)' }} onClick={() => setPayModal(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>
              💰 पैसे जमा
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── sticky */}
      <div style={{ position: 'sticky', top: 56, zIndex: 10, background: 'var(--bg)', padding: '10px 16px 0', borderBottom: '1px solid var(--border)' }}>
        <div className="tabs">
          {['बिले', 'डिलिव्हरी', 'पैसे'].map((t, i) => (
            <button key={i} className={`tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 16px 16px' }}>

        {/* ── Bills Tab ── */}
        {tab === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bills.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <div className="empty-title">बिल नाही</div>
                <div className="empty-desc">वर "बिल बनवा" बटण दाबा</div>
              </div>
            ) : bills.map(bill => {
              const isExpanded = expandedBill?.id === bill.id
              const items = billItemsMap[bill.id] || []
              const monthLabel = `${MONTH_NAMES_MR[bill.month - 1]} ${bill.year}`

              return (
                <div key={bill.id} style={{ background: 'var(--surface)', border: `1px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  {/* Bill header row — clean 2-line collapsed */}
                  <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => toggleBill(bill)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{monthLabel}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                          {formatCurrency(bill.total_amount)} बिल
                          <span style={{ margin: '0 5px', color: 'var(--border)' }}>•</span>
                          <span style={{ color: 'var(--green)' }}>{formatCurrency(bill.payments_made)} जमा</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className={`badge ${bill.is_locked ? 'badge-green' : 'badge-yellow'}`}>
                          {bill.is_locked ? '🔒 लॉक' : 'मसुदा'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: bill.amount_due > 0 ? 'var(--red)' : 'var(--green)' }}>
                            बाकी {formatCurrency(bill.amount_due)}
                          </span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--text2)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {/* ── Share & Actions panel ── */}
                      <div style={{ borderBottom: '1px solid var(--border)' }}>

                        {/* Share section label */}
                        <div style={{ padding: '8px 14px 6px', background: 'rgba(0,0,0,0.1)' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            📤 बिल पाठवा / प्रिंट करा
                          </span>
                        </div>

                        {/* Share buttons row */}
                        <div style={{ display: 'grid', gridTemplateColumns: customer.mobile ? '1fr 1fr 1fr' : '1fr 1fr', gap: 0 }}>

                          {/* WhatsApp — only if mobile exists */}
                          {customer.mobile && (
                            <button
                              style={{
                                background: 'none', border: 'none', borderRight: '1px solid var(--border)',
                                padding: '12px 8px', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                              }}
                              onClick={() => {
                                const text = buildWhatsAppText({ customer, bill, items: billItemsMap[bill.id] || [], dairyName })
                                const url  = `https://wa.me/91${customer.mobile}?text=${encodeURIComponent(text)}`
                                window.open(url, '_blank')
                              }}
                            >
                              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(37,211,102,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                                💬
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#25d366' }}>WhatsApp</span>
                            </button>
                          )}

                          {/* Print / PDF */}
                          <button
                            style={{
                              background: 'none', border: 'none', borderRight: '1px solid var(--border)',
                              padding: '12px 8px', cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                            }}
                            onClick={() => handlePrintBill(bill)}
                          >
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                              🖨️
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Print / PDF</span>
                          </button>

                          {/* Copy text */}
                          <button
                            style={{
                              background: 'none', border: 'none',
                              padding: '12px 8px', cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                            }}
                            onClick={() => {
                              const text = buildWhatsAppText({ customer, bill, items: billItemsMap[bill.id] || [], dairyName })
                              copyToClipboard(text, show)
                            }}
                          >
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                              📋
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8' }}>मजकूर कॉपी</span>
                          </button>
                        </div>

                        {/* Lock + Delete row */}
                        {!bill.is_locked && (
                          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => handleLock(bill.id)}>
                              🔒 लॉक करा
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)', padding: '6px 14px', flexShrink: 0 }}
                              onClick={() => handleDeleteBill(bill.id)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Bill summary info */}
                      <div style={{ padding: '10px 14px 4px' }}>
                        {bill.prev_balance > 0 && (
                          <div className="bill-info-row">
                            <span className="bill-info-label">मागील बाकी</span>
                            <span className="bill-info-value" style={{ color: 'var(--yellow)' }}>{formatCurrency(bill.prev_balance)}</span>
                          </div>
                        )}
                        <div className="bill-info-row">
                          <span className="bill-info-label">एकूण बिल</span>
                          <span className="bill-info-value">{formatCurrency(bill.total_amount)}</span>
                        </div>
                        <div className="bill-info-row">
                          <span className="bill-info-label">जमा पैसे</span>
                          <span className="bill-info-value" style={{ color: 'var(--green)' }}>{formatCurrency(bill.payments_made)}</span>
                        </div>
                        <div className="bill-info-row" style={{ borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                          <span className="bill-info-label" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>एकूण देणे</span>
                          <span className="bill-info-value" style={{ fontSize: 16, color: bill.amount_due > 0 ? 'var(--red)' : 'var(--green)' }}>{formatCurrency(bill.amount_due)}</span>
                        </div>
                      </div>

                      {/* Day-wise delivery items */}
                      {items.length > 0 ? (
                        <div style={{ padding: '4px 14px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                            दिवसवार तपशील ({items.length} नोंदी)
                          </div>
                          {/* Group by product */}
                          {Object.entries(items.reduce((acc, item) => {
                            const k = item.product_name || 'दूध'
                            if (!acc[k]) acc[k] = []
                            acc[k].push(item)
                            return acc
                          }, {})).map(([prodName, prodItems]) => (
                            <div key={prodName} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                                📦 {prodName}
                                <span style={{ fontWeight: 500, color: 'var(--text2)', marginLeft: 8 }}>
                                  {prodItems.reduce((s,i)=>s+i.qty,0).toFixed(1)}{prodItems[0]?.unit} = {formatCurrency(prodItems.reduce((s,i)=>s+i.amount,0))}
                                </span>
                              </div>
                              {/* Table header */}
                              <div style={{ display: 'grid', gridTemplateColumns: '90px 70px 1fr 60px 60px', gap: 4, marginBottom: 2 }}>
                                {['तारीख','वेळ','दर','प्रमाण','रक्कम'].map(h => (
                                  <div key={h} style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</div>
                                ))}
                              </div>
                              {prodItems.sort((a, b) => a.date.localeCompare(b.date) || (a.session === 'morning' ? -1 : 1)).map((item, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 70px 1fr 60px 60px', gap: 4, padding: '5px 8px', background: i % 2 === 0 ? 'var(--surface2)' : 'transparent', borderRadius: 6, marginBottom: 2, fontSize: 12 }}>
                                  <span style={{ color: 'var(--text2)' }}>{item.date.slice(5)}</span>
                                  <span style={{ color: 'var(--text2)' }}>{item.session === 'morning' ? '☀️ सकाळ' : '🌙 सं.'}</span>
                                  <span style={{ color: 'var(--text2)' }}>₹{item.rate}</span>
                                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.qty.toFixed(1)}{item.unit}</span>
                                  <span style={{ color: 'var(--text)', fontWeight: 700, textAlign: 'right' }}>₹{item.amount.toFixed(0)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '10px 14px 14px', fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>
                          बिल तपशील उपलब्ध नाही
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Delivery Tab ── */}
        {tab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {deliveries.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🥛</div>
                <div className="empty-title">डिलिव्हरी नोंद नाही</div>
              </div>
            ) : Object.entries(deliveriesByMonth).sort((a,b) => b[0].localeCompare(a[0])).map(([monthKey, monthDels]) => {
              const [y, m] = monthKey.split('-').map(Number)
              const delivered = monthDels.filter(d => d.status === 'delivered' || d.status === 'partial')
              const totalQty  = delivered.reduce((s, d) => s + (d.qty || 0), 0)
              return (
                <div key={monthKey}>
                  {/* Month header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {MONTH_NAMES_MR[m - 1]} {y}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {delivered.length} दिवस • {totalQty.toFixed(1)} एकूण
                    </div>
                  </div>
                  {/* Delivery rows */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {monthDels.sort((a, b) => b.date.localeCompare(a.date) || (a.session === 'morning' ? -1 : 1)).map((d, i) => {
                      const prod = products.find(p => p.id === d.product_id)
                      const statusColors = { delivered: 'var(--green)', pending: 'var(--yellow)', skip: 'var(--text2)', partial: 'var(--blue)' }
                      const statusLabels = { delivered: 'दिले', pending: 'बाकी', skip: 'सुट्टी', partial: 'कमी' }
                      return (
                        <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < monthDels.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: 36, fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>
                            {d.date.slice(8)}
                            <div style={{ fontSize: 10 }}>{d.session === 'morning' ? '☀️' : '🌙'}</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                              {prod?.name || 'दूध'}
                              {d.qty > 0 && <span style={{ color: 'var(--text2)', fontWeight: 400, marginLeft: 6 }}>— {d.qty}{prod?.unit || 'L'}</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: statusColors[d.status] || 'var(--text2)' }}>
                            {statusLabels[d.status] || d.status}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Payments Tab ── */}
        {tab === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payments.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">💰</div>
                <div className="empty-title">पैसे जमा नाही</div>
              </div>
            ) : payments.map(p => (
              <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.date}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                    {PAYMENT_MODES[p.mode] || p.mode}
                    {p.notes ? ` • ${p.notes}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--green)' }}>+{formatCurrency(p.amount)}</div>
              </div>
            ))}

            {/* Payment total */}
            {payments.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'var(--green)33' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>एकूण जमा</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--green)' }}>{formatCurrency(totalPaid)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Payment Modal ── */}
      <Modal isOpen={payModal} onClose={() => setPayModal(false)} title="पैसे जमा नोंद करा"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPayModal(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleSavePay} disabled={savingPay}>
              {savingPay ? <span className="spinner" /> : 'जतन करा'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
            ग्राहक: <strong style={{ color: 'var(--text)' }}>{customer.name}</strong>
            {outstanding > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>थकबाकी: {formatCurrency(outstanding)}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">रक्कम (₹) *</label>
            <input className={`form-input${payErrors.amount ? ' error' : ''}`} type="number" inputMode="decimal" min="1" placeholder="0"
              value={payForm.amount} onChange={e => { setPayForm(p => ({ ...p, amount: e.target.value })); setPayErrors({}) }} autoFocus />
            {payErrors.amount && <div className="form-error">{payErrors.amount}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">पद्धत</label>
              <select className="form-input" value={payForm.mode} onChange={e => setPayForm(p => ({ ...p, mode: e.target.value }))}>
                {Object.entries(PAYMENT_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">तारीख</label>
              <input className="form-input" type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">टीप (Optional)</label>
            <input className="form-input" placeholder="नोट्स" value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* ── Generate Bill Modal ── */}
      <Modal isOpen={genModal} onClose={() => setGenModal(false)} title="बिल बनवा"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setGenModal(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={genning}>
              {genning ? <span className="spinner" /> : 'बिल बनवा'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
            ग्राहक: <strong style={{ color: 'var(--text)' }}>{customer.name}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">महिना</label>
              <select className="form-input" value={genMonth} onChange={e => setGenMonth(parseInt(e.target.value))}>
                {MONTH_NAMES_MR.map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">वर्ष</label>
              <select className="form-input" value={genYear} onChange={e => setGenYear(parseInt(e.target.value))}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#6ee7b7' }}>
            ⚡ त्या महिन्यातील सर्व डिलिव्हरी नोंदींवर बिल तयार होईल
          </div>
        </div>
      </Modal>
    </div>
  )
}

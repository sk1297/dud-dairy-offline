// billPdf.js — Generate bill PDF via html2canvas (full Marathi/Unicode support)
// Flow: build HTML template → render off-screen → html2canvas screenshot → jsPDF → share
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { Capacitor } from '@capacitor/core'

const MONTH_NAMES_MR = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']

function fmtDate(d) {
  const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`
}
function fmtCur(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── Build the bill HTML string ────────────────────────────────────────────────
function buildBillHTML({ customer, bill, items, dairyName, area }) {
  const monthLabel = `${MONTH_NAMES_MR[bill.month - 1]} ${bill.year}`
  const today      = fmtDate(new Date().toISOString().split('T')[0])

  // Group items by product
  const grouped = (items || []).reduce((acc, item) => {
    const k = item.product_name || 'दूध'
    if (!acc[k]) acc[k] = { items: [], totalQty: 0, totalAmt: 0, unit: item.unit || 'L', rate: item.rate }
    acc[k].items.push(item)
    acc[k].totalQty += item.qty
    acc[k].totalAmt += item.amount
    return acc
  }, {})

  // Sort each product's items by date + session
  for (const g of Object.values(grouped)) {
    g.items.sort((a, b) => a.date.localeCompare(b.date) || (a.session === 'morning' ? -1 : 1))
  }

  // Build delivery table rows HTML
  const deliveryTables = Object.entries(grouped).map(([prodName, g]) => `
    <div class="prod-header">
      <span>${prodName}</span>
      <span>${g.totalQty.toFixed(1)}${g.unit} = ${fmtCur(g.totalAmt)}</span>
    </div>
    <table class="delivery-table">
      <thead>
        <tr>
          <th>तारीख</th>
          <th>वेळ</th>
          <th>दर (₹)</th>
          <th>प्रमाण</th>
          <th style="text-align:right">रक्कम (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${g.items.map((item, idx) => `
          <tr class="${idx % 2 === 0 ? 'row-even' : ''}">
            <td>${item.date.slice(5).replace('-', '/')}</td>
            <td>${item.session === 'morning' ? 'सकाळ' : 'संध्या'}</td>
            <td>${item.rate}</td>
            <td>${item.qty.toFixed(1)}${item.unit || 'L'}</td>
            <td style="text-align:right;font-weight:700">${fmtCur(item.amount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `).join('')

  // Summary rows
  const summaryRows = [
    { label: 'एकूण बिल रक्कम', value: fmtCur(bill.total_amount), cls: '' },
    ...(bill.prev_balance > 0 ? [{ label: 'मागील थकबाकी (+)', value: fmtCur(bill.prev_balance), cls: 'yellow' }] : []),
    ...(bill.payments_made > 0 ? [{ label: 'जमा पैसे (−)', value: `− ${fmtCur(bill.payments_made)}`, cls: 'green' }] : []),
  ]

  const infoLine = [
    customer.mobile  ? `📱 ${customer.mobile}` : null,
    area             ? `📍 ${area}` : null,
    customer.address || null,
  ].filter(Boolean).join('   ')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans Devanagari', 'Mangal', 'Arial Unicode MS', sans-serif;
    background: #fff;
    color: #111827;
    width: 794px;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Header */
  .header {
    background: #065f46;
    padding: 18px 24px 14px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .header-left .dairy-name {
    font-size: 22px;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0.3px;
  }
  .header-left .sub {
    font-size: 12px;
    color: #a7f3d0;
    margin-top: 3px;
  }
  .header-right {
    text-align: right;
  }
  .header-right .bill-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .header-right .bill-month {
    font-size: 12px;
    color: #a7f3d0;
    margin-top: 2px;
  }
  .header-right .bill-date {
    font-size: 11px;
    color: #6ee7b7;
    margin-top: 1px;
  }

  /* Status ribbon */
  .status-ribbon {
    padding: 6px 24px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.5px;
  }
  .ribbon-locked   { background: #065f46; }
  .ribbon-unlocked { background: #b45309; }

  /* Customer info */
  .customer-section {
    padding: 16px 24px 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  .customer-name {
    font-size: 20px;
    font-weight: 800;
    color: #065f46;
    margin-bottom: 4px;
  }
  .customer-info {
    font-size: 12px;
    color: #6b7280;
  }

  /* Delivery tables */
  .delivery-section {
    padding: 0 24px 12px;
  }
  .prod-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f0fdf4;
    border-left: 3px solid #065f46;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 700;
    color: #065f46;
    margin-top: 12px;
    margin-bottom: 0;
  }
  .delivery-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .delivery-table thead tr {
    background: #f9fafb;
  }
  .delivery-table th {
    padding: 6px 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: #4b5563;
    border-bottom: 1px solid #e5e7eb;
  }
  .delivery-table td {
    padding: 5px 8px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
  }
  .delivery-table .row-even td {
    background: #f9fafb;
  }

  /* Summary box */
  .summary-section {
    margin: 8px 24px 0;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 14px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 13px;
  }
  .summary-row .label { color: #6b7280; }
  .summary-row .value { font-weight: 700; color: #111827; }
  .summary-row.yellow .label { color: #b45309; }
  .summary-row.green  .label { color: #059669; }
  .summary-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    background: #065f46;
  }
  .summary-total .label {
    font-size: 13px;
    font-weight: 700;
    color: #a7f3d0;
  }
  .summary-total .value {
    font-size: 20px;
    font-weight: 900;
    color: #fff;
  }

  /* Footer */
  .footer {
    margin: 14px 24px 0;
    padding-top: 10px;
    border-top: 1px dashed #d1d5db;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #9ca3af;
    padding-bottom: 20px;
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="dairy-name">${dairyName || 'दूध डेअरी'}</div>
      <div class="sub">दूध डेअरी व्यवस्थापन</div>
    </div>
    <div class="header-right">
      <div class="bill-title">मासिक बिल</div>
      <div class="bill-month">${monthLabel}</div>
      <div class="bill-date">दिनांक: ${today}</div>
    </div>
  </div>

  <!-- Status ribbon -->
  <div class="status-ribbon ${bill.is_locked ? 'ribbon-locked' : 'ribbon-unlocked'}">
    ${bill.is_locked ? 'LOCKED BILL — FINAL' : 'DRAFT BILL — NOT FINAL'}
  </div>

  <!-- Customer info -->
  <div class="customer-section">
    <div class="customer-name">${customer.name}</div>
    ${infoLine ? `<div class="customer-info">${infoLine}</div>` : ''}
  </div>

  <!-- Delivery tables -->
  <div class="delivery-section">
    ${deliveryTables || '<p style="padding:12px;color:#6b7280;font-size:12px;">या महिन्यात डिलिव्हरी नोंदी नाहीत.</p>'}
  </div>

  <!-- Summary -->
  <div class="summary-section">
    ${summaryRows.map(r => `
      <div class="summary-row ${r.cls}">
        <span class="label">${r.label}</span>
        <span class="value">${r.value}</span>
      </div>
    `).join('')}
    <div class="summary-total">
      <span class="label">एकूण देणे (बाकी)</span>
      <span class="value">${fmtCur(bill.amount_due)}</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${dairyName || 'दूध डेअरी'} · बिल तयार: ${today} · हे बिल संगणकाद्वारे तयार केले आहे.</span>
    <span>ग्राहकाची सही _______________</span>
  </div>

</body>
</html>`
}

// ── Crop a canvas to a vertical slice (for multi-page PDF) ───────────────────
function cropCanvas(srcCanvas, yStart, sliceHeight) {
  const c   = document.createElement('canvas')
  c.width   = srcCanvas.width
  c.height  = Math.min(sliceHeight, srcCanvas.height - yStart)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(srcCanvas, 0, yStart, c.width, c.height, 0, 0, c.width, c.height)
  return c
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function shareBillAsPDF({ customer, bill, items, dairyName, area }) {
  // 1. Create an off-screen container that does NOT affect app layout.
  //    Use position:absolute outside the visible scroll area + overflow:hidden
  //    on a wrapper so nothing shifts on screen.
  const wrapper = document.createElement('div')
  wrapper.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'overflow:hidden',
    'pointer-events:none',
    'z-index:-9999',
  ].join(';')

  const container = document.createElement('div')
  container.style.cssText = 'width:794px;background:#fff;'
  container.innerHTML = buildBillHTML({ customer, bill, items, dairyName, area })

  wrapper.appendChild(container)
  document.body.appendChild(wrapper)

  try {
    // 2. Wait for fonts + layout to fully render
    await new Promise(r => setTimeout(r, 200))

    // 3. Screenshot full bill with html2canvas at 2× scale
    const canvas = await html2canvas(container, {
      scale:           2,
      useCORS:         true,
      backgroundColor: '#ffffff',
      logging:         false,
      // Explicitly set dimensions so html2canvas doesn't measure wrongly
      width:           794,
      height:          container.scrollHeight,
      windowWidth:     794,
    })

    // 4. Build A4 PDF — crop canvas per page so content is never lost
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pgW = pdf.internal.pageSize.getWidth()   // 210 mm
    const pgH = pdf.internal.pageSize.getHeight()  // 297 mm

    // How many canvas pixels equal one PDF page height?
    const scale       = canvas.width / pgW          // px per mm
    const pageHeightPx = Math.floor(pgH * scale)    // canvas pixels per page
    const totalPages  = Math.ceil(canvas.height / pageHeightPx)

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage()

      // Crop exactly one page's worth of pixels
      const slice    = cropCanvas(canvas, page * pageHeightPx, pageHeightPx)
      const sliceH   = (slice.height / scale)       // mm height of this slice
      const imgData  = slice.toDataURL('image/jpeg', 0.92)

      pdf.addImage(imgData, 'JPEG', 0, 0, pgW, sliceH)
    }

    // 5. Share or download
    const filename = `bill-${customer.name.replace(/\s+/g, '-')}-${bill.month}-${bill.year}.pdf`

    if (Capacitor.getPlatform() !== 'web') {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share }                 = await import('@capacitor/share')
      const pdfBase64 = pdf.output('datauristring').split(',')[1]
      const result    = await Filesystem.writeFile({
        path:      filename,
        data:      pdfBase64,
        directory: Directory.Cache,
      })
      await Share.share({
        title:       `बिल — ${customer.name} — ${MONTH_NAMES_MR[bill.month - 1]} ${bill.year}`,
        url:         result.uri,
        dialogTitle: 'बिल शेअर करा',
      })
    } else {
      pdf.save(filename)
    }
  } finally {
    // Always remove wrapper — keeps DOM clean
    document.body.removeChild(wrapper)
  }
}

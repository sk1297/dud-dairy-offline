// billPdf.js — Generate bill PDF using jsPDF and share via Capacitor Share
import { jsPDF } from 'jspdf'
import { Capacitor } from '@capacitor/core'

const MONTH_NAMES_MR = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']

function fmtDate(d) {
  const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`
}

function fmtCur(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export async function shareBillAsPDF({ customer, bill, items, dairyName, area }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W = 210
  const margin = 14
  const contentW = W - margin * 2
  let y = 0

  // ── Color helpers ────────────────────────────────────────────────────────────
  const setFill   = (r, g, b) => doc.setFillColor(r, g, b)
  const setStroke = (r, g, b) => doc.setDrawColor(r, g, b)
  const setColor  = (r, g, b) => doc.setTextColor(r, g, b)
  const setFont   = (style, size) => { doc.setFontSize(size); doc.setFont('helvetica', style) }

  // ── Header bar ───────────────────────────────────────────────────────────────
  setFill(6, 95, 70)
  doc.rect(0, 0, W, 28, 'F')

  setFont('bold', 16)
  setColor(255, 255, 255)
  doc.text(dairyName || 'दूध डेअरी', margin, 11)

  setFont('normal', 9)
  setColor(209, 250, 229)
  doc.text('दूध डेअरी व्यवस्थापन', margin, 17)

  setFont('bold', 10)
  setColor(255, 255, 255)
  const monthLabel = `${MONTH_NAMES_MR[bill.month - 1]} ${bill.year}`
  doc.text('मासिक बिल', W - margin, 11, { align: 'right' })
  setFont('normal', 9)
  setColor(209, 250, 229)
  doc.text(monthLabel, W - margin, 17, { align: 'right' })
  doc.text(`दिनांक: ${fmtDate(new Date().toISOString().split('T')[0])}`, W - margin, 22, { align: 'right' })
  y = 28

  // ── Status ribbon ────────────────────────────────────────────────────────────
  setFill(bill.is_locked ? 6, 95, 70 : 180, 120, 0)
  doc.rect(0, y, W, 7, 'F')
  setFont('bold', 8)
  setColor(255, 255, 255)
  doc.text(bill.is_locked ? 'LOCKED BILL — FINAL' : 'DRAFT BILL — NOT FINAL', W / 2, y + 4.8, { align: 'center' })
  y += 7

  // ── Customer info ────────────────────────────────────────────────────────────
  y += 6
  setFont('bold', 13)
  setColor(17, 24, 39)
  doc.text(customer.name, margin, y)
  y += 6

  setFont('normal', 9)
  setColor(107, 114, 128)
  const infoLine = [
    customer.mobile ? `📱 ${customer.mobile}` : null,
    area            ? `📍 ${area}` : null,
    customer.address || null,
  ].filter(Boolean).join('   ')
  if (infoLine) { doc.text(infoLine, margin, y); y += 5 }
  y += 4

  // ── Divider ──────────────────────────────────────────────────────────────────
  setStroke(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.line(margin, y, W - margin, y)
  y += 5

  // ── Delivery items table ─────────────────────────────────────────────────────
  if (items && items.length > 0) {
    // Group by product
    const grouped = items.reduce((acc, item) => {
      const k = item.product_name || 'दूध'
      if (!acc[k]) acc[k] = { items: [], totalQty: 0, totalAmt: 0, unit: item.unit || 'L', rate: item.rate }
      acc[k].items.push(item)
      acc[k].totalQty += item.qty
      acc[k].totalAmt += item.amount
      return acc
    }, {})

    const colX = [margin, margin + 22, margin + 46, margin + 68, margin + 100, margin + 130, margin + 155]
    // col: Date | Session | Rate | Qty | Amount

    for (const [prodName, g] of Object.entries(grouped)) {
      // Product header
      setFill(240, 253, 244)
      doc.rect(margin, y, contentW, 7, 'F')
      setFont('bold', 9)
      setColor(6, 95, 70)
      doc.text(`${prodName}`, margin + 2, y + 5)
      setFont('bold', 9)
      doc.text(`${g.totalQty.toFixed(1)}${g.unit}  =  ${fmtCur(g.totalAmt)}`, W - margin - 2, y + 5, { align: 'right' })
      y += 7

      // Column headers
      setFill(249, 250, 251)
      doc.rect(margin, y, contentW, 6, 'F')
      setFont('bold', 7.5)
      setColor(75, 85, 99)
      const headers = ['तारीख', 'वेळ', 'दर (₹)', 'प्रमाण', 'रक्कम (₹)']
      const hX      = [margin + 2, margin + 28, margin + 60, margin + 95, W - margin - 2]
      const hAlign  = ['left','left','left','left','right']
      headers.forEach((h, i) => doc.text(h, hX[i], y + 4.2, { align: hAlign[i] }))
      y += 6

      // Rows
      const sorted = [...g.items].sort((a, b) => a.date.localeCompare(b.date) || (a.session === 'morning' ? -1 : 1))
      sorted.forEach((item, idx) => {
        if (y > 270) { doc.addPage(); y = 14 }
        if (idx % 2 === 0) {
          setFill(249, 250, 251)
          doc.rect(margin, y, contentW, 5.5, 'F')
        }
        setFont('normal', 7.5)
        setColor(55, 65, 81)
        doc.text(item.date.slice(5).replace('-', '/'), hX[0], y + 3.8, { align: 'left' })
        doc.text(item.session === 'morning' ? 'सकाळ' : 'संध्या', hX[1], y + 3.8)
        doc.text(String(item.rate), hX[2], y + 3.8)
        doc.text(`${item.qty.toFixed(1)}${item.unit}`, hX[3], y + 3.8)
        setFont('bold', 7.5)
        doc.text(fmtCur(item.amount), hX[4], y + 3.8, { align: 'right' })
        y += 5.5
      })
      y += 4
    }
  }

  // ── Summary box ──────────────────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 14 }
  y += 2
  setStroke(229, 231, 235)
  doc.setLineWidth(0.4)
  doc.rect(margin, y, contentW, bill.prev_balance > 0 ? 38 : 30, 'S')

  const sumRows = [
    { label: 'एकूण बिल रक्कम', value: fmtCur(bill.total_amount), bold: false },
    ...(bill.prev_balance > 0 ? [{ label: 'मागील थकबाकी', value: fmtCur(bill.prev_balance), bold: false, yellow: true }] : []),
    ...(bill.payments_made > 0 ? [{ label: 'जमा पैसे', value: `− ${fmtCur(bill.payments_made)}`, bold: false, green: true }] : []),
  ]

  sumRows.forEach((row, i) => {
    const ry = y + 1 + i * 7
    setFont(row.bold ? 'bold' : 'normal', 9)
    setColor(row.yellow ? 180 : row.green ? 5 : 107, row.yellow ? 120 : row.green ? 150 : 114, row.yellow ? 0 : row.green ? 105 : 128)
    doc.text(row.label, margin + 4, ry + 5)
    setFont('bold', 9)
    setColor(17, 24, 39)
    doc.text(row.value, W - margin - 4, ry + 5, { align: 'right' })
    if (i < sumRows.length - 1) {
      setStroke(229, 231, 235)
      doc.line(margin, ry + 7, W - margin, ry + 7)
    }
  })

  // Total due — highlighted row
  const totalY = y + 1 + sumRows.length * 7
  setFill(6, 95, 70)
  doc.rect(margin, totalY, contentW, 10, 'F')
  setFont('bold', 9)
  setColor(209, 250, 229)
  doc.text('एकूण देणे (बाकी)', margin + 4, totalY + 6.5)
  setFont('bold', 13)
  setColor(255, 255, 255)
  doc.text(fmtCur(bill.amount_due), W - margin - 4, totalY + 6.5, { align: 'right' })
  y = totalY + 14

  // ── Footer ───────────────────────────────────────────────────────────────────
  y += 4
  setStroke(209, 213, 219)
  doc.setLineDash([2, 2])
  doc.line(margin, y, W - margin, y)
  doc.setLineDash([])
  y += 6
  setFont('normal', 7.5)
  setColor(156, 163, 175)
  doc.text(`${dairyName}  ·  बिल तयार: ${fmtDate(new Date().toISOString().split('T')[0])}  ·  हे बिल संगणकाद्वारे तयार केले आहे.`, margin, y)

  // ── Signature line ───────────────────────────────────────────────────────────
  setColor(156, 163, 175)
  setFont('normal', 7.5)
  doc.text('ग्राहकाची सही _______________', W - margin - 2, y, { align: 'right' })

  // ── Share / Download ─────────────────────────────────────────────────────────
  const filename = `bill-${customer.name.replace(/\s+/g, '-')}-${bill.month}-${bill.year}.pdf`

  if (Capacitor.getPlatform() !== 'web') {
    // Native: save to cache → share via Android share sheet (WhatsApp shows up)
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const pdfBase64 = doc.output('datauristring').split(',')[1]
    const result = await Filesystem.writeFile({
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
    // Web: download directly
    doc.save(filename)
  }
}

import Dexie from 'dexie'

export const db = new Dexie('DudDairyDB')

// Version 1 — original schema (keep for migration)
db.version(1).stores({
  users:         '++id, mobile, password, role, isActive',
  customers:     '++id, name, mobile, address, area_id, morning_qty, evening_qty, rate, status, start_date',
  deliveries:    '++id, customer_id, date, session, qty, status, notes',
  monthly_bills: '++id, customer_id, month, year, total_qty, total_amount, prev_balance, payments_made, amount_due, is_locked, generated_date',
  bill_items:    '++id, bill_id, date, session, qty, rate, amount',
  payments:      '++id, customer_id, bill_id, date, amount, mode, notes',
  areas:         '++id, name, sequence',
  rate_history:  '++id, rate, effective_date, notes',
  settings:      '++id, key, value',
})

// Version 2 — multi-product support
db.version(2).stores({
  users:              '++id, mobile, password, role, isActive',
  customers:          '++id, name, mobile, address, area_id, product_id, morning_qty, evening_qty, rate, status, start_date',
  deliveries:         '++id, customer_id, product_id, date, session, qty, status, notes',
  monthly_bills:      '++id, customer_id, month, year, total_qty, total_amount, prev_balance, payments_made, amount_due, is_locked, generated_date',
  bill_items:         '++id, bill_id, product_id, date, session, qty, rate, amount, product_name',
  payments:           '++id, customer_id, bill_id, date, amount, mode, notes',
  areas:              '++id, name, sequence',
  rate_history:       '++id, rate, effective_date, notes',
  settings:           '++id, key, value',
  products:           '++id, name, type, unit, default_rate, is_active',
  customer_products:  '++id, customer_id, product_id, morning_qty, evening_qty, rate',
}).upgrade(async tx => {
  await tx.table('customers').toCollection().modify(c => { if (!c.product_id) c.product_id = 1 })
  await tx.table('deliveries').toCollection().modify(d => { if (!d.product_id) d.product_id = 1 })
})

// Version 3 — per-product rate history
db.version(3).stores({
  users:              '++id, mobile, password, role, isActive',
  customers:          '++id, name, mobile, address, area_id, product_id, morning_qty, evening_qty, rate, status, start_date',
  deliveries:         '++id, customer_id, product_id, date, session, qty, status, notes',
  monthly_bills:      '++id, customer_id, month, year, total_qty, total_amount, prev_balance, payments_made, amount_due, is_locked, generated_date',
  bill_items:         '++id, bill_id, product_id, date, session, qty, rate, amount, product_name',
  payments:           '++id, customer_id, bill_id, date, amount, mode, notes',
  areas:              '++id, name, sequence',
  rate_history:       '++id, product_id, rate, effective_date, notes',
  settings:           '++id, key, value',
  products:           '++id, name, type, unit, default_rate, is_active',
  customer_products:  '++id, customer_id, product_id, morning_qty, evening_qty, rate',
}).upgrade(async tx => {
  // Assign all existing rate_history records to buffalo (product_id=1, first seeded product)
  const bufProduct = await tx.table('products').filter(p => p.type === 'milk_buffalo').first()
  const bufId = bufProduct?.id || 1
  await tx.table('rate_history').toCollection().modify(r => { if (!r.product_id) r.product_id = bufId })
})

// ─── helpers ────────────────────────────────────────────────────────────────
const pad       = n  => String(n).padStart(2, '0')
const dateStr   = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const daysIn    = (y, m) => new Date(y, m, 0).getDate()

// Dynamic month helpers — always relative to current date
const nowDate   = new Date()
const CUR_Y     = nowDate.getFullYear()
const CUR_M     = nowDate.getMonth() + 1
const CUR_D     = nowDate.getDate()

// Two full months back and last month
const prevMonth = (offset) => {
  let m = CUR_M - offset
  let y = CUR_Y
  while (m <= 0) { m += 12; y-- }
  return { m, y }
}
const M2 = prevMonth(2)  // 2 months ago (full, locked bill)
const M1 = prevMonth(1)  // last month (full, locked bill)
// current month: days 1 .. CUR_D

// ─── seed ────────────────────────────────────────────────────────────────────
db.on('ready', async () => {
  const userCount = await db.users.count()
  if (userCount > 0) {
    if (await db.products.count() === 0) await seedProducts()
    return
  }

  // ── 1. Owner login ──────────────────────────────────────────────────────
  await db.users.add({ mobile: '9999999999', password: '1234', role: 'owner', isActive: 1, name: 'गणेश पाटील' })

  // ── 2. Products ─────────────────────────────────────────────────────────
  const allProds = await seedProducts()
  const P = {}
  for (const p of allProds) P[p.type === 'milk_buffalo' ? 'buf' : p.type === 'milk_cow' ? 'cow' : p.name] = p

  // ── 3. Areas ────────────────────────────────────────────────────────────
  const a1 = await db.areas.add({ name: 'भाग A — मेन रोड',    sequence: 1 })
  const a2 = await db.areas.add({ name: 'भाग B — मंदिर वाडी', sequence: 2 })
  const a3 = await db.areas.add({ name: 'भाग C — नवीन पेठ',  sequence: 3 })

  // ── 4. Settings ─────────────────────────────────────────────────────────
  await db.settings.bulkAdd([
    { key: 'dairy_name',   value: 'श्री गणेश दूध डेअरी' },
    { key: 'owner_name',   value: 'गणेश पाटील' },
    { key: 'mobile',       value: '9999999999' },
    { key: 'address',      value: 'मुख्य चौक, ग्राम पंचायत रोड, पुणे जिल्हा - ४१२३०१' },
    { key: 'default_rate', value: '62' },
    { key: 'currency',     value: '₹' },
  ])

  // ── 5. Rate history ─────────────────────────────────────────────────────
  await db.rate_history.bulkAdd([
    { rate: 55, effective_date: dateStr(CUR_Y, M2.m > 3 ? M2.m - 3 : 1, 1), notes: 'जुना दर — म्हैस दूध' },
    { rate: 60, effective_date: dateStr(M2.y, M2.m, 1),                     notes: 'दर वाढ — बाजारभाव' },
    { rate: 62, effective_date: dateStr(M1.y, M1.m, 1),                     notes: 'नवीन दर — सध्याचा दर' },
  ])

  // ── 6. Customers ────────────────────────────────────────────────────────
  // Columns: name, mobile, address, area_id, product, morning, evening, rate, status, start
  const custDefs = [
    // भाग A
    { name: 'रमेश पाटील',       mobile: '9876543201', address: 'मेन रोड, गल्ली क्र.१',        area_id: a1, prod: P.buf, mq: 2,   eq: 1,   rate: 62, status: 'active', start: dateStr(CUR_Y-1,11,1) },
    { name: 'सुरेश जाधव',       mobile: '9876543202', address: 'शाळेजवळ, गल्ली क्र.२',        area_id: a1, prod: P.buf, mq: 1.5, eq: 0,   rate: 62, status: 'active', start: dateStr(CUR_Y-1,12,1) },
    { name: 'प्रिया शिंदे',     mobile: '9876543203', address: 'नवीन वाडी, फ्लॅट नं.५',       area_id: a1, prod: P.cow, mq: 1,   eq: 1,   rate: 55, status: 'active', start: dateStr(CUR_Y,1,1)  },
    { name: 'मीरा पवार',        mobile: '9876543209', address: 'जवळचा रस्ता, घर क्र.१२',      area_id: a1, prod: P.cow, mq: 1.5, eq: 1,   rate: 55, status: 'active', start: dateStr(CUR_Y,M2.m,1) },
    // भाग B
    { name: 'विजय देशमुख',     mobile: '9876543204', address: 'मंदिराजवळ, वाडी क्र.३',       area_id: a2, prod: P.buf, mq: 2,   eq: 2,   rate: 62, status: 'active', start: dateStr(CUR_Y-1,10,1) },
    { name: 'अनिता कांबळे',    mobile: '9876543205', address: 'पाण्याच्या टाकीजवळ',          area_id: a2, prod: P.cow, mq: 0.5, eq: 0.5, rate: 55, status: 'active', start: dateStr(CUR_Y,1,15) },
    { name: 'संजय मोरे',        mobile: '9876543206', address: 'शेतकरी कॉलनी, घर क्र.२१',    area_id: a2, prod: P.buf, mq: 3,   eq: 0,   rate: 60, status: 'active', start: dateStr(CUR_Y-1,9,1)  },
    { name: 'राहुल शर्मा',      mobile: '9876543210', address: 'नवीन बिल्डिंग, फ्लॅट ब-४',   area_id: a2, prod: P.buf, mq: 1,   eq: 1,   rate: 62, status: 'active', start: dateStr(CUR_Y,M2.m,15) },
    // भाग C
    { name: 'गीता सावंत',       mobile: '9876543207', address: 'जुना बाजार, घर क्र.७',        area_id: a3, prod: P.buf, mq: 1,   eq: 1,   rate: 62, status: 'paused', start: dateStr(CUR_Y-1,12,1) },
    { name: 'दिनेश खोत',        mobile: '9876543208', address: 'नवीन पेठ, गल्ली क्र.४',       area_id: a3, prod: P.buf, mq: 2,   eq: 1,   rate: 62, status: 'active', start: dateStr(CUR_Y,1,1)  },
    { name: 'सोनाली भोसले',     mobile: '9876543211', address: 'गणपती मंदिर रोड, घर नं.३',    area_id: a3, prod: P.cow, mq: 2,   eq: 0,   rate: 55, status: 'active', start: dateStr(CUR_Y,M2.m,1) },
    { name: 'अजय निंबाळकर',    mobile: '9876543212', address: 'साखर कारखाना कॉलनी, क्र.८',   area_id: a3, prod: P.buf, mq: 2,   eq: 2,   rate: 65, status: 'active', start: dateStr(CUR_Y,M2.m,1) },
  ]

  const cIds = []
  for (const c of custDefs) {
    cIds.push(await db.customers.add({
      name: c.name, mobile: c.mobile, address: c.address,
      area_id: c.area_id, product_id: c.prod.id,
      morning_qty: c.mq, evening_qty: c.eq, rate: c.rate,
      status: c.status, start_date: c.start,
    }))
  }

  // ── 7. Extra product subscriptions ──────────────────────────────────────
  // रमेश (0) — दही 0.5kg every morning
  await db.customer_products.add({ customer_id: cIds[0], product_id: P['दही'].id,        morning_qty: 0.5, evening_qty: 0, rate: 80  })
  // विजय (4) — दही 1kg morning + तूप 0.25kg morning
  await db.customer_products.add({ customer_id: cIds[4], product_id: P['दही'].id,        morning_qty: 1,   evening_qty: 0, rate: 80  })
  await db.customer_products.add({ customer_id: cIds[4], product_id: P['तूप'].id,        morning_qty: 0.25,evening_qty: 0, rate: 600 })
  // मीरा (3) — ताक 0.5L morning
  await db.customer_products.add({ customer_id: cIds[3], product_id: P['ताक'].id,        morning_qty: 0.5, evening_qty: 0, rate: 20  })
  // दिनेश (9) — पनीर 0.5kg (twice a week, so only some days)
  await db.customer_products.add({ customer_id: cIds[9], product_id: P['पनीर'].id,       morning_qty: 0.5, evening_qty: 0, rate: 360 })

  // ── 8. Deliveries — 3 months ─────────────────────────────────────────────
  // skip[custIdx] = array of day-numbers to skip per month (realistic absences)
  const SKIPS = [
    [7, 14, 21],   // 0 रमेश
    [10, 25],      // 1 सुरेश
    [3, 18],       // 2 प्रिया
    [20],          // 3 मीरा
    [12],          // 4 विजय
    [8, 22],       // 5 अनिता
    [5, 19, 29],   // 6 संजय
    [16],          // 7 राहुल
    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], // 8 गीता paused = all skip
    [22],          // 9 दिनेश
    [11],          // 10 सोनाली
    [14, 28],      // 11 अजय
  ]
  // partial[custIdx] = { day: reducedQty } — morning qty reduced on this day
  const PARTIAL = [
    { 18: 1.5 },   // 0 रमेश — 1.5 instead of 2
    {},
    { 15: 0.5 },   // 2 प्रिया — 0.5 instead of 1
    {},
    { 25: 1.5 },   // 4 विजय — 1.5 instead of 2
    {},
    { 28: 2 },     // 6 संजय — 2 instead of 3
    {},
    {},
    { 20: 1 },     // 9 दिनेश — 1 instead of 2
    {},
    { 10: 1 },     // 11 अजय — 1 instead of 2
  ]

  // Paneer delivered only on specific days of week (Tue/Fri = days 2,5,9,12,16,19,23,26,30)
  const PANEER_DAYS = [2, 5, 9, 12, 16, 19, 23, 26, 30]

  for (const { y, m, maxDay } of [
    { y: M2.y, m: M2.m, maxDay: daysIn(M2.y, M2.m) },
    { y: M1.y, m: M1.m, maxDay: daysIn(M1.y, M1.m) },
    { y: CUR_Y, m: CUR_M, maxDay: CUR_D },
  ]) {
    for (let ci = 0; ci < custDefs.length; ci++) {
      const custId = cIds[ci]
      const cd     = custDefs[ci]
      const skips  = SKIPS[ci] || []
      const partial = PARTIAL[ci] || {}

      for (let day = 1; day <= maxDay; day++) {
        if (skips.includes(day)) continue
        const date = dateStr(y, m, day)

        // Morning — primary product
        if (cd.mq > 0) {
          const rawQty = partial[day] !== undefined ? partial[day] : cd.mq
          const status = partial[day] !== undefined ? 'partial' : 'delivered'
          await db.deliveries.add({ customer_id: custId, product_id: cd.prod.id, date, session: 'morning', qty: rawQty, status, notes: '' })
        }
        // Evening — primary product
        if (cd.eq > 0) {
          await db.deliveries.add({ customer_id: custId, product_id: cd.prod.id, date, session: 'evening', qty: cd.eq, status: 'delivered', notes: '' })
        }

        // Extra: रमेश — दही every morning
        if (ci === 0) {
          await db.deliveries.add({ customer_id: custId, product_id: P['दही'].id, date, session: 'morning', qty: 0.5, status: 'delivered', notes: '' })
        }
        // Extra: विजय — दही every morning
        if (ci === 4) {
          await db.deliveries.add({ customer_id: custId, product_id: P['दही'].id, date, session: 'morning', qty: 1, status: 'delivered', notes: '' })
        }
        // Extra: विजय — तूप on 1st and 15th
        if (ci === 4 && (day === 1 || day === 15)) {
          await db.deliveries.add({ customer_id: custId, product_id: P['तूप'].id, date, session: 'morning', qty: 0.5, status: 'delivered', notes: '' })
        }
        // Extra: मीरा — ताक every morning
        if (ci === 3) {
          await db.deliveries.add({ customer_id: custId, product_id: P['ताक'].id, date, session: 'morning', qty: 0.5, status: 'delivered', notes: '' })
        }
        // Extra: दिनेश — पनीर on specific days
        if (ci === 9 && PANEER_DAYS.includes(day) && day <= maxDay) {
          await db.deliveries.add({ customer_id: custId, product_id: P['पनीर'].id, date, session: 'morning', qty: 0.5, status: 'delivered', notes: '' })
        }
      }
    }
  }

  // ── 9. Bills for M2 and M1 (generated, locked) ───────────────────────────
  // Payment ratios per customer (how much they pay of the total due):
  // 1.0 = paid full, 0.8 = paid 80%, etc.
  const PAY_RATIO = [0.85, 1.0, 0.9, 0.75, 1.0, 1.0, 0.8, 1.0, 0.6, 0.7, 1.0, 0.85]
  const PAY_MODE  = ['cash','upi','cash','cash','upi','cash','cash','upi','cash','cash','upi','cash']
  const MR_MONTHS = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']

  // Rate lookup for extra products
  const extraRate = (ci, productId) => {
    if (ci === 0 && productId === P['दही'].id)  return 80
    if (ci === 4 && productId === P['दही'].id)  return 80
    if (ci === 4 && productId === P['तूप'].id)  return 600
    if (ci === 3 && productId === P['ताक'].id)  return 20
    if (ci === 9 && productId === P['पनीर'].id) return 360
    return custDefs[ci].rate
  }

  let prevDueMap = {} // { custId: amount_due } — carries forward month to month

  for (const { y, m } of [{ y: M2.y, m: M2.m }, { y: M1.y, m: M1.m }]) {
    const sd = dateStr(y, m, 1)
    const ed = dateStr(y, m, daysIn(y, m))
    const monthDels = await db.deliveries.where('date').between(sd, ed, true, true).toArray()

    for (let ci = 0; ci < custDefs.length; ci++) {
      const custId = cIds[ci]
      const cd     = custDefs[ci]

      // गीता (8) — paused, no bill
      if (ci === 8) continue

      const dels = monthDels.filter(d => d.customer_id === custId && (d.status === 'delivered' || d.status === 'partial'))
      if (dels.length === 0) continue

      // Build bill items
      let totalQty = 0, totalAmount = 0
      const items = dels.map(d => {
        const prod   = allProds.find(p => p.id === d.product_id)
        const rate   = d.product_id === cd.prod.id ? cd.rate : extraRate(ci, d.product_id)
        const qty    = d.qty || 0
        const amount = qty * rate
        totalQty    += qty
        totalAmount += amount
        return { date: d.date, session: d.session, qty, rate, amount, product_id: d.product_id, product_name: prod?.name || 'दूध', unit: prod?.unit || 'L' }
      })

      const prevBalance   = Math.max(0, prevDueMap[custId] || 0)
      const totalDue      = totalAmount + prevBalance
      const payRatio      = PAY_RATIO[ci]
      // Round payment to nearest ₹10
      const paymentsMade  = Math.round(totalDue * payRatio / 10) * 10
      const amountDue     = Math.max(0, totalDue - paymentsMade)

      const generatedDate = ed

      const billId = await db.monthly_bills.add({
        customer_id: custId, month: m, year: y,
        total_qty: totalQty, total_amount: totalAmount,
        prev_balance: prevBalance, payments_made: paymentsMade, amount_due: amountDue,
        is_locked: 1, generated_date: generatedDate,
      })

      for (const item of items) {
        await db.bill_items.add({ bill_id: billId, ...item })
      }

      // Add payment records (split into 1 or 2 payments realistically)
      if (paymentsMade > 0) {
        const p1Label = `${MR_MONTHS[m-1]} बिल जमा`
        if (paymentsMade > 800) {
          const half  = Math.round(paymentsMade * 0.55 / 10) * 10
          const rest  = paymentsMade - half
          const pDay1 = Math.min(12, daysIn(y, m))
          const pDay2 = Math.min(25, daysIn(y, m))
          await db.payments.add({ customer_id: custId, bill_id: billId, date: dateStr(y, m, pDay1), amount: half, mode: PAY_MODE[ci], notes: p1Label + ' (१ली हप्ता)' })
          await db.payments.add({ customer_id: custId, bill_id: billId, date: dateStr(y, m, pDay2), amount: rest, mode: PAY_MODE[ci], notes: p1Label + ' (२री हप्ता)' })
        } else {
          await db.payments.add({ customer_id: custId, bill_id: billId, date: dateStr(y, m, 20), amount: paymentsMade, mode: PAY_MODE[ci], notes: p1Label })
        }
      }

      prevDueMap[custId] = amountDue
    }
  }

  // ── 10. Advance payments this month (current month, no bill yet) ─────────
  const advPayments = [
    { ci: 0,  amount: 600,  day: 3,  notes: 'मे महिना अग्रिम' },
    { ci: 4,  amount: 1000, day: 5,  notes: 'GPay — मे अग्रिम' },
    { ci: 6,  amount: 1500, day: 2,  notes: 'रोख — मे आगाऊ जमा' },
    { ci: 9,  amount: 800,  day: 7,  notes: 'UPI — मे जमा' },
    { ci: 11, amount: 1200, day: 10, notes: 'मे महिना अर्धी रक्कम' },
  ]
  for (const p of advPayments) {
    if (p.day <= CUR_D) {
      await db.payments.add({ customer_id: cIds[p.ci], bill_id: null, date: dateStr(CUR_Y, CUR_M, p.day), amount: p.amount, mode: ['cash','upi','cash','upi','upi'][advPayments.indexOf(p)], notes: p.notes })
    }
  }

  console.log('✅ DudDairyDB — comprehensive seed done')
})

// ─── product seed ─────────────────────────────────────────────────────────────
async function seedProducts() {
  const existing = await db.products.toArray()
  if (existing.length > 0) return existing

  await db.products.bulkAdd([
    { name: 'म्हैस दूध',  type: 'milk_buffalo', unit: 'L',  default_rate: 62,  is_active: 1 },
    { name: 'गाय दूध',    type: 'milk_cow',     unit: 'L',  default_rate: 55,  is_active: 1 },
    { name: 'दही',         type: 'other',        unit: 'kg', default_rate: 80,  is_active: 1 },
    { name: 'तूप',         type: 'other',        unit: 'kg', default_rate: 600, is_active: 1 },
    { name: 'लोणी',        type: 'other',        unit: 'kg', default_rate: 350, is_active: 1 },
    { name: 'पनीर',        type: 'other',        unit: 'kg', default_rate: 350, is_active: 1 },
    { name: 'ताक',         type: 'other',        unit: 'L',  default_rate: 20,  is_active: 1 },
    { name: 'खवा / मावा',  type: 'other',        unit: 'kg', default_rate: 300, is_active: 1 },
  ])

  return db.products.toArray()
}

export default db

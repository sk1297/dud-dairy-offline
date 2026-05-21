import db from '../db/database.js'
import { getDeliveriesForCustomerMonth } from './deliveryService.js'

export const getBills         = ()    => db.query('SELECT * FROM monthly_bills ORDER BY year DESC, month DESC')
export const getBillById      = (id)  => db.first('SELECT * FROM monthly_bills WHERE id = ? LIMIT 1', [id])
export const getBillItems     = (id)  => db.query('SELECT * FROM bill_items WHERE bill_id = ?', [id])
export const getCustomerBills = (cid) => db.query('SELECT * FROM monthly_bills WHERE customer_id = ? ORDER BY year DESC, month DESC', [cid])
export const lockBill         = (id)  => db.run('UPDATE monthly_bills SET is_locked = 1 WHERE id = ?', [id])
export const unlockBill       = (id)  => db.run('UPDATE monthly_bills SET is_locked = 0 WHERE id = ?', [id])

export async function getBillForCustomerMonth(customer_id, month, year) {
  return db.first(
    'SELECT * FROM monthly_bills WHERE customer_id = ? AND month = ? AND year = ? LIMIT 1',
    [customer_id, month, year]
  )
}

export async function generateBill(customer_id, month, year) {
  const customer = await db.first('SELECT * FROM customers WHERE id = ? LIMIT 1', [customer_id])
  if (!customer) throw new Error('ग्राहक सापडला नाही')

  const products   = await db.query('SELECT * FROM products')
  const productMap = {}
  for (const p of products) productMap[p.id] = p

  const extraSubs    = await db.query('SELECT * FROM customer_products WHERE customer_id = ?', [customer_id])
  const extraRateMap = {}
  for (const s of extraSubs) extraRateMap[s.product_id] = s.rate

  // Load rate history for rate-per-delivery-date lookup
  const rateHistory = await db.query('SELECT * FROM rate_history ORDER BY effective_date DESC')

  const getRateForDelivery = (product_id, delivery_date) => {
    // Find the most recent rate history entry for this product on or before delivery_date
    const entry = rateHistory.find(r => r.product_id === product_id && r.effective_date <= delivery_date)
    if (entry) return entry.rate
    // Fallback: customer rate for primary product, extra sub rate, then product default
    if (product_id === customer.product_id) return customer.rate || 62
    if (extraRateMap[product_id] != null)  return extraRateMap[product_id]
    return productMap[product_id]?.default_rate || 62
  }

  const deliveries = await getDeliveriesForCustomerMonth(customer_id, month, year)
  const delivered  = deliveries.filter(d => d.status === 'delivered' || d.status === 'partial')

  let total_qty    = 0
  let total_amount = 0

  const items = delivered.map(d => {
    const pid     = d.product_id || customer.product_id
    const rate    = getRateForDelivery(pid, d.date)
    const qty     = d.qty || 0
    const amount  = qty * rate
    const product = productMap[pid]
    total_qty    += qty
    total_amount += amount
    return {
      date:         d.date,
      session:      d.session,
      qty,
      rate,
      amount,
      product_id:   pid,
      product_name: product?.name || 'दूध',
      unit:         product?.unit || 'L',
    }
  })

  // Previous balance — only latest prior bill's amount_due
  const prevBills = await db.query(
    'SELECT * FROM monthly_bills WHERE customer_id = ? AND (year < ? OR (year = ? AND month < ?)) ORDER BY year DESC, month DESC LIMIT 1',
    [customer_id, year, year, month]
  )
  const prev_balance = Math.max(0, prevBills[0]?.amount_due || 0)

  // Payments this month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate   = `${year}-${String(month).padStart(2, '0')}-31`
  const monthPayments = await db.query(
    'SELECT * FROM payments WHERE customer_id = ? AND date >= ? AND date <= ?',
    [customer_id, startDate, endDate]
  )
  const payments_made = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)

  const amount_due = Math.max(0, total_amount + prev_balance - payments_made)

  // Remove existing draft bill
  const existing = await getBillForCustomerMonth(customer_id, month, year)
  if (existing) {
    if (existing.is_locked) throw new Error('बिल लॉक आहे, बदल करता येणार नाही')
    await db.run('DELETE FROM bill_items WHERE bill_id = ?', [existing.id])
    await db.run('DELETE FROM monthly_bills WHERE id = ?', [existing.id])
  }

  const bill_id = await db.insert(
    'INSERT INTO monthly_bills (customer_id, month, year, total_qty, total_amount, prev_balance, payments_made, amount_due, is_locked, generated_date) VALUES (?,?,?,?,?,?,?,?,0,?)',
    [customer_id, month, year, total_qty, total_amount, prev_balance, payments_made, amount_due, new Date().toISOString().split('T')[0]]
  )

  for (const item of items) {
    await db.insert(
      'INSERT INTO bill_items (bill_id, date, session, qty, rate, amount, product_id, product_name, unit) VALUES (?,?,?,?,?,?,?,?,?)',
      [bill_id, item.date, item.session, item.qty, item.rate, item.amount, item.product_id, item.product_name, item.unit]
    )
  }

  return bill_id
}

export async function deleteBill(id) {
  await db.run('DELETE FROM bill_items WHERE bill_id = ?', [id])
  return db.run('DELETE FROM monthly_bills WHERE id = ?', [id])
}

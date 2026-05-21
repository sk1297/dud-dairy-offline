import db from '../db/database.js'
import { getDeliveriesForCustomerMonth } from './deliveryService.js'

export const getBills      = ()    => db.monthly_bills.toArray()
export const getBillById   = (id)  => db.monthly_bills.get(id)
export const getBillItems  = (id)  => db.bill_items.where('bill_id').equals(id).toArray()
export const getCustomerBills = (cid) => db.monthly_bills.where('customer_id').equals(cid).toArray()
export const lockBill      = (id)  => db.monthly_bills.update(id, { is_locked: 1 })

export async function getBillForCustomerMonth(customer_id, month, year) {
  return db.monthly_bills
    .filter(b => b.customer_id === customer_id && b.month === month && b.year === year)
    .first()
}

export async function generateBill(customer_id, month, year) {
  const customer = await db.customers.get(customer_id)
  if (!customer) throw new Error('ग्राहक सापडला नाही')

  // Load all products for rate lookup
  const products = await db.products.toArray()
  const productMap = {}
  for (const p of products) productMap[p.id] = p

  // Customer extra subscriptions for per-product rate
  const extraSubs = await db.customer_products.where('customer_id').equals(customer_id).toArray()
  const extraRateMap = {}
  for (const s of extraSubs) extraRateMap[s.product_id] = s.rate

  // Get rate for a product_id
  const getRateForProduct = (product_id) => {
    if (product_id === customer.product_id) return customer.rate || 62
    if (extraRateMap[product_id] != null) return extraRateMap[product_id]
    return productMap[product_id]?.default_rate || 62
  }

  const deliveries = await getDeliveriesForCustomerMonth(customer_id, month, year)
  const delivered  = deliveries.filter(d => d.status === 'delivered' || d.status === 'partial')

  let total_qty    = 0
  let total_amount = 0

  const items = delivered.map(d => {
    const rate    = getRateForProduct(d.product_id || customer.product_id)
    const qty     = d.qty || 0
    const amount  = qty * rate
    const product = productMap[d.product_id || customer.product_id]
    total_qty    += qty
    total_amount += amount
    return {
      date:         d.date,
      session:      d.session,
      qty,
      rate,
      amount,
      product_id:   d.product_id || customer.product_id,
      product_name: product?.name || 'दूध',
      unit:         product?.unit || 'L',
    }
  })

  // Previous balance = amount_due of the most recent previous bill only.
  // Each bill's amount_due already carries forward all older balances, so summing
  // multiple bills would double-count. We take only the latest one.
  const prevBills = await db.monthly_bills
    .filter(b => b.customer_id === customer_id && (b.year < year || (b.year === year && b.month < month)))
    .toArray()
  const sortedPrev = prevBills.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
  const prev_balance = Math.max(0, sortedPrev[0]?.amount_due || 0)

  // Payments this month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate   = `${year}-${String(month).padStart(2, '0')}-31`
  const monthPayments = await db.payments
    .where('customer_id').equals(customer_id)
    .filter(p => p.date >= startDate && p.date <= endDate)
    .toArray()
  const payments_made = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)

  const amount_due = Math.max(0, total_amount + prev_balance - payments_made)

  // Remove existing draft bill
  const existing = await getBillForCustomerMonth(customer_id, month, year)
  if (existing) {
    if (existing.is_locked) throw new Error('बिल लॉक आहे, बदल करता येणार नाही')
    await db.bill_items.where('bill_id').equals(existing.id).delete()
    await db.monthly_bills.delete(existing.id)
  }

  const bill_id = await db.monthly_bills.add({
    customer_id, month, year,
    total_qty, total_amount, prev_balance, payments_made, amount_due,
    is_locked: 0,
    generated_date: new Date().toISOString().split('T')[0],
  })

  for (const item of items) {
    await db.bill_items.add({ bill_id, ...item })
  }

  return bill_id
}

export async function deleteBill(id) {
  await db.bill_items.where('bill_id').equals(id).delete()
  return db.monthly_bills.delete(id)
}

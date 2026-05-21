import db from '../db/database.js'

export async function getDeliveriesForDate(date) {
  return db.deliveries.where('date').equals(date).toArray()
}

// Upsert delivery — now includes product_id
// Key: customer_id + product_id + date + session
export async function upsertDelivery(customer_id, product_id, date, session, data) {
  const existing = await db.deliveries
    .where('date').equals(date)
    .filter(d => d.customer_id === customer_id && d.product_id === product_id && d.session === session)
    .first()
  if (existing) {
    await db.deliveries.update(existing.id, { product_id, ...data })
    return existing.id
  } else {
    return db.deliveries.add({ customer_id, product_id, date, session, ...data })
  }
}

export async function updateDelivery(id, data) {
  return db.deliveries.update(id, data)
}

export async function getDeliveriesForMonth(month, year) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end   = `${year}-${String(month).padStart(2, '0')}-31`
  return db.deliveries.where('date').between(start, end, true, true).toArray()
}

export async function getDeliveriesForCustomerMonth(customer_id, month, year) {
  const all = await getDeliveriesForMonth(month, year)
  return all.filter(d => d.customer_id === customer_id)
}

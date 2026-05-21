import db from '../db/database.js'

export async function getDeliveriesForDate(date) {
  return db.query('SELECT * FROM deliveries WHERE date = ?', [date])
}

export async function upsertDelivery(customer_id, product_id, date, session, data) {
  const existing = await db.first(
    'SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND date = ? AND session = ? LIMIT 1',
    [customer_id, product_id, date, session]
  )
  if (existing) {
    const { qty, status, notes } = data
    await db.run(
      'UPDATE deliveries SET qty = ?, status = ?, notes = ? WHERE id = ?',
      [qty ?? existing.qty, status ?? existing.status, notes ?? existing.notes, existing.id]
    )
    return existing.id
  } else {
    const { qty = 0, status = 'delivered', notes = '' } = data
    return db.insert(
      'INSERT INTO deliveries (customer_id, product_id, date, session, qty, status, notes) VALUES (?,?,?,?,?,?,?)',
      [customer_id, product_id, date, session, qty, status, notes]
    )
  }
}

export async function updateDelivery(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  return db.run(`UPDATE deliveries SET ${fields} WHERE id = ?`, values)
}

export async function getDeliveriesForMonth(month, year) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end   = `${year}-${String(month).padStart(2, '0')}-31`
  return db.query('SELECT * FROM deliveries WHERE date >= ? AND date <= ?', [start, end])
}

export async function getDeliveriesForCustomerMonth(customer_id, month, year) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end   = `${year}-${String(month).padStart(2, '0')}-31`
  return db.query(
    'SELECT * FROM deliveries WHERE customer_id = ? AND date >= ? AND date <= ?',
    [customer_id, start, end]
  )
}

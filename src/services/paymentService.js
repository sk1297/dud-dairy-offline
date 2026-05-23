import db from '../db/database.js'

export async function getPayments() {
  return db.query('SELECT * FROM payments ORDER BY date DESC')
}

export async function getCustomerPayments(customer_id) {
  return db.query('SELECT * FROM payments WHERE customer_id = ? ORDER BY date DESC', [customer_id])
}

export async function addPayment(data) {
  const { customer_id, bill_id = null, amount, date, mode = 'cash', notes = '' } = data
  return db.insert(
    'INSERT INTO payments (customer_id, bill_id, date, amount, mode, notes) VALUES (?,?,?,?,?,?)',
    [customer_id, bill_id, date, amount, mode, notes]
  )
}

export async function updatePayment(id, data) {
  const { amount, date, mode, notes } = data
  return db.run(
    'UPDATE payments SET amount = ?, date = ?, mode = ?, notes = ? WHERE id = ?',
    [amount, date, mode, notes, id]
  )
}

export async function deletePayment(id) {
  return db.run('DELETE FROM payments WHERE id = ?', [id])
}

export async function getTodayPayments() {
  const today = new Date().toISOString().split('T')[0]
  return db.query('SELECT * FROM payments WHERE date = ?', [today])
}

export async function getOutstanding() {
  // Single SQL query — no full table loads into JS
  return db.query(`
    SELECT
      c.id, c.name, c.mobile, c.area_id, c.status,
      COALESCE(b.totalBilled, 0) AS totalBilled,
      COALESCE(p.totalPaid,   0) AS totalPaid,
      (COALESCE(b.totalBilled, 0) - COALESCE(p.totalPaid, 0)) AS outstanding
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(total_amount) AS totalBilled
      FROM monthly_bills
      GROUP BY customer_id
    ) b ON b.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id, SUM(amount) AS totalPaid
      FROM payments
      GROUP BY customer_id
    ) p ON p.customer_id = c.id
    WHERE c.status = 'active'
      AND (COALESCE(b.totalBilled, 0) - COALESCE(p.totalPaid, 0)) > 0
    ORDER BY outstanding DESC
  `)
}

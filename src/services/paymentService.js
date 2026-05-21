import db from '../db/database.js'

export async function getPayments() {
  return db.query('SELECT * FROM payments ORDER BY date DESC')
}

export async function getCustomerPayments(customer_id) {
  return db.query('SELECT * FROM payments WHERE customer_id = ? ORDER BY date DESC', [customer_id])
}

export async function addPayment(data) {
  const { customer_id, amount, date, notes = '', method = 'cash' } = data
  return db.insert(
    'INSERT INTO payments (customer_id, amount, date, notes, method) VALUES (?,?,?,?,?)',
    [customer_id, amount, date, notes, method]
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
  const customers = await db.query("SELECT * FROM customers WHERE status = 'active'")
  const bills     = await db.query('SELECT * FROM monthly_bills')
  const payments  = await db.query('SELECT * FROM payments')

  return customers.map(c => {
    const custBills    = bills.filter(b => b.customer_id === c.id)
    const custPayments = payments.filter(p => p.customer_id === c.id)
    const totalBilled  = custBills.reduce((s, b) => s + (b.total_amount || 0), 0)
    const totalPaid    = custPayments.reduce((s, p) => s + (p.amount || 0), 0)
    const outstanding  = totalBilled - totalPaid
    return { ...c, outstanding, totalBilled, totalPaid }
  }).filter(c => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding)
}

import db from '../db/database.js'

export async function getPayments() {
  return db.payments.toArray()
}

export async function getCustomerPayments(customer_id) {
  return db.payments.where('customer_id').equals(customer_id).toArray()
}

export async function addPayment(data) {
  return db.payments.add(data)
}

export async function deletePayment(id) {
  return db.payments.delete(id)
}

export async function getTodayPayments() {
  const today = new Date().toISOString().split('T')[0]
  return db.payments.where('date').equals(today).toArray()
}

export async function getOutstanding() {
  const customers = await db.customers.where('status').equals('active').toArray()
  const bills = await db.monthly_bills.toArray()
  const payments = await db.payments.toArray()

  return customers.map(c => {
    const custBills = bills.filter(b => b.customer_id === c.id)
    const custPayments = payments.filter(p => p.customer_id === c.id)
    const totalBilled = custBills.reduce((s, b) => s + (b.total_amount || 0), 0)
    const totalPaid = custPayments.reduce((s, p) => s + (p.amount || 0), 0)
    const outstanding = totalBilled - totalPaid
    return { ...c, outstanding, totalBilled, totalPaid }
  }).filter(c => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding)
}

import db from '../db/database.js'

export async function getCustomers() {
  return db.customers.toArray()
}

export async function getActiveCustomers() {
  return db.customers.where('status').equals('active').toArray()
}

export async function getCustomerById(id) {
  return db.customers.get(id)
}

export async function addCustomer(data) {
  return db.customers.add(data)
}

export async function updateCustomer(id, data) {
  return db.customers.update(id, data)
}

export async function deleteCustomer(id) {
  return db.customers.delete(id)
}

export async function searchCustomers(query) {
  const all = await db.customers.toArray()
  const q = query.toLowerCase()
  return all.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.mobile && c.mobile.includes(q))
  )
}

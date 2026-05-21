import db from '../db/database.js'

export async function getCustomers() {
  return db.query('SELECT * FROM customers ORDER BY name')
}

export async function getActiveCustomers() {
  return db.query("SELECT * FROM customers WHERE status = 'active' ORDER BY name")
}

export async function getCustomerById(id) {
  return db.first('SELECT * FROM customers WHERE id = ?', [id])
}

export async function addCustomer(data) {
  const { name, mobile, area_id, address, product_id, rate, morning_qty, evening_qty, status = 'active', notes = '' } = data
  return db.insert(
    'INSERT INTO customers (name, mobile, area_id, address, product_id, rate, morning_qty, evening_qty, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [name, mobile || '', area_id || null, address || '', product_id, rate || 0, morning_qty || 0, evening_qty || 0, status, notes]
  )
}

export async function updateCustomer(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  return db.run(`UPDATE customers SET ${fields} WHERE id = ?`, values)
}

export async function deleteCustomer(id) {
  return db.run('DELETE FROM customers WHERE id = ?', [id])
}

export async function searchCustomers(query) {
  const q = `%${query}%`
  return db.query('SELECT * FROM customers WHERE name LIKE ? OR mobile LIKE ? ORDER BY name', [q, q])
}

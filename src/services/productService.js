import db from '../db/database.js'

export const getProducts      = ()         => db.query('SELECT * FROM products WHERE is_active = 1')
export const getAllProducts    = ()         => db.query('SELECT * FROM products')
export const getById           = (id)       => db.first('SELECT * FROM products WHERE id = ? LIMIT 1', [id])

export async function addProduct(data) {
  const { name, type, unit = 'L', default_rate = 0 } = data
  return db.insert(
    'INSERT INTO products (name, type, unit, default_rate, is_active) VALUES (?,?,?,?,1)',
    [name, type, unit, default_rate]
  )
}

export async function updateProduct(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  return db.run(`UPDATE products SET ${fields} WHERE id = ?`, values)
}

export const deactivateProduct = (id) => db.run('UPDATE products SET is_active = 0 WHERE id = ?', [id])

// Product type labels & colors
export const PRODUCT_TYPE_LABEL = {
  milk_buffalo: 'म्हैस दूध',
  milk_cow:     'गाय दूध',
  other:        'इतर',
}

export const PRODUCT_TYPE_COLOR = {
  milk_buffalo: '#8b5cf6',
  milk_cow:     '#f59e0b',
  other:        '#06b6d4',
}

export const PRODUCT_TYPE_TINT = {
  milk_buffalo: 'rgba(139,92,246,0.12)',
  milk_cow:     'rgba(245,158,11,0.12)',
  other:        'rgba(6,182,212,0.12)',
}

export async function getCustomerProducts(customerId) {
  const subs     = await db.query('SELECT * FROM customer_products WHERE customer_id = ?', [customerId])
  const products = await db.query('SELECT * FROM products')
  return subs.map(s => ({ ...s, product: products.find(p => p.id === s.product_id) }))
}

export async function addCustomerProduct(data) {
  const { customer_id, product_id, rate = 0, morning_qty = 0, evening_qty = 0 } = data
  return db.insert(
    'INSERT INTO customer_products (customer_id, product_id, rate, morning_qty, evening_qty) VALUES (?,?,?,?,?)',
    [customer_id, product_id, rate, morning_qty, evening_qty]
  )
}

export async function updateCustomerProduct(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  return db.run(`UPDATE customer_products SET ${fields} WHERE id = ?`, values)
}

export const deleteCustomerProduct        = (id)         => db.run('DELETE FROM customer_products WHERE id = ?', [id])
export const deleteAllCustomerProducts    = (customerId) => db.run('DELETE FROM customer_products WHERE customer_id = ?', [customerId])

import db from '../db/database.js'

export const getProducts       = ()         => db.products.where('is_active').equals(1).toArray()
export const getAllProducts     = ()         => db.products.toArray()
export const getById            = (id)       => db.products.get(id)
export const addProduct         = (data)     => db.products.add({ ...data, is_active: 1 })
export const updateProduct      = (id, data) => db.products.update(id, data)
export const deactivateProduct  = (id)       => db.products.update(id, { is_active: 0 })

// Product type labels & colors
export const PRODUCT_TYPE_LABEL = {
  milk_buffalo: 'म्हैस दूध',
  milk_cow:     'गाय दूध',
  other:        'इतर',
}

export const PRODUCT_TYPE_COLOR = {
  milk_buffalo: '#8b5cf6',  // purple
  milk_cow:     '#f59e0b',  // amber/yellow
  other:        '#06b6d4',  // cyan
}

export const PRODUCT_TYPE_TINT = {
  milk_buffalo: 'rgba(139,92,246,0.12)',
  milk_cow:     'rgba(245,158,11,0.12)',
  other:        'rgba(6,182,212,0.12)',
}

// Get customer extra product subscriptions with product details
export const getCustomerProducts = async (customerId) => {
  const subs = await db.customer_products.where('customer_id').equals(customerId).toArray()
  const products = await db.products.toArray()
  return subs.map(s => ({ ...s, product: products.find(p => p.id === s.product_id) }))
}

export const addCustomerProduct    = (data) => db.customer_products.add(data)
export const updateCustomerProduct = (id, data) => db.customer_products.update(id, data)
export const deleteCustomerProduct = (id) => db.customer_products.delete(id)
export const deleteAllCustomerProducts = (customerId) =>
  db.customer_products.where('customer_id').equals(customerId).delete()

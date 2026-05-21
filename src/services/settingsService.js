import db from '../db/database.js'

export async function getSetting(key) {
  const row = await db.first('SELECT value FROM settings WHERE key = ? LIMIT 1', [key])
  return row ? row.value : null
}

export async function setSetting(key, value) {
  const existing = await db.first('SELECT id FROM settings WHERE key = ? LIMIT 1', [key])
  if (existing) {
    return db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key])
  } else {
    return db.insert('INSERT INTO settings (key, value) VALUES (?,?)', [key, value])
  }
}

export async function getAllSettings() {
  const rows = await db.query('SELECT key, value FROM settings')
  const obj = {}
  for (const row of rows) obj[row.key] = row.value
  return obj
}

export async function getRateHistory() {
  return db.query('SELECT * FROM rate_history ORDER BY effective_date DESC')
}

export async function addRateHistory(data) {
  const { product_id, rate, effective_date, notes = '' } = data
  return db.insert(
    'INSERT INTO rate_history (product_id, rate, effective_date, notes) VALUES (?,?,?,?)',
    [product_id, rate, effective_date, notes]
  )
}

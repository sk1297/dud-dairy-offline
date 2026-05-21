import db from '../db/database.js'

export async function getSetting(key) {
  const row = await db.settings.where('key').equals(key).first()
  return row ? row.value : null
}

export async function setSetting(key, value) {
  const existing = await db.settings.where('key').equals(key).first()
  if (existing) {
    return db.settings.update(existing.id, { value })
  } else {
    return db.settings.add({ key, value })
  }
}

export async function getAllSettings() {
  const rows = await db.settings.toArray()
  const obj = {}
  for (const row of rows) obj[row.key] = row.value
  return obj
}

export async function getRateHistory() {
  return db.rate_history.orderBy('effective_date').reverse().toArray()
}

export async function addRateHistory(data) {
  return db.rate_history.add(data)
}

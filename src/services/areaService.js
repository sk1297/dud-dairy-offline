import db from '../db/database.js'

export async function getAreas() {
  return db.areas.orderBy('sequence').toArray()
}

export async function addArea(data) {
  return db.areas.add(data)
}

export async function updateArea(id, data) {
  return db.areas.update(id, data)
}

export async function deleteArea(id) {
  return db.areas.delete(id)
}

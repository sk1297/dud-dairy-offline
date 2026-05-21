import db from '../db/database.js'

export async function getAreas() {
  return db.query('SELECT * FROM areas ORDER BY sequence')
}

export async function addArea(data) {
  const { name, sequence = 0 } = data
  return db.insert('INSERT INTO areas (name, sequence) VALUES (?,?)', [name, sequence])
}

export async function updateArea(id, data) {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(data), id]
  return db.run(`UPDATE areas SET ${fields} WHERE id = ?`, values)
}

export async function deleteArea(id) {
  return db.run('DELETE FROM areas WHERE id = ?', [id])
}

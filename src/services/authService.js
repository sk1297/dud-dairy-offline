import db from '../db/database.js'

const USER_KEY = 'dd_user'

export async function login(mobile, password) {
  try {
    const user = await db.users.where('mobile').equals(mobile).first()
    if (!user) return { success: false, error: 'मोबाईल नंबर सापडला नाही.' }
    if (user.password !== password) return { success: false, error: 'चुकीचा पासवर्ड / PIN.' }
    if (!user.isActive) return { success: false, error: 'खाते निष्क्रिय आहे.' }

    const u = { id: user.id, name: user.name, mobile: user.mobile, role: user.role }
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    return { success: true, user: u }
  } catch (err) {
    return { success: false, error: err.message || 'लॉगिन अयशस्वी.' }
  }
}

export function logout() {
  localStorage.removeItem(USER_KEY)
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

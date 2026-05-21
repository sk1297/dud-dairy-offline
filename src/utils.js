export function formatCurrency(amount) {
  if (amount == null) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()

  if (sameDay(date, today)) return 'आज'
  if (sameDay(date, yesterday)) return 'काल'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export function getMonthYear(date = new Date()) {
  return { month: date.getMonth() + 1, year: date.getFullYear() }
}

export function monthName(month, year) {
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('mr-IN', { month: 'long', year: 'numeric' })
}

export function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate()
}

export function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function getErrorMsg(err) {
  return err?.message || 'काहीतरी चूक झाली'
}

export function formatQty(qty) {
  if (qty == null) return '0'
  return Number(qty).toFixed(qty % 1 === 0 ? 0 : 1)
}

export function getDaysArray(month, year) {
  const days = daysInMonth(month, year)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(year, month - 1, i + 1)
    return d.toISOString().split('T')[0]
  })
}

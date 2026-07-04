// ── Cloud sync (owner app → Supabase) ─────────────────────────────────────────
// Pushes the owner's local SQLite data up to Supabase so customers can view
// their own records. Design notes:
//   • The owner must be signed in to Supabase (see cloudAuth.js). RLS then
//     restricts every write to the owner's own dairy — no service-role key ships
//     in the APK.
//   • Rows are keyed on (dairy_id, local_id) and pushed with UPSERT, so syncing
//     is idempotent: re-running never duplicates.
//   • A dairy's data is small (hundreds of rows), so v1 does a full upsert each
//     run. Delta sync via updated_at can be layered on later if needed.
import db from '../db/database.js'
import { supabase } from './supabaseClient.js'
import { getSetting, setSetting } from '../services/settingsService.js'

const DAIRY_ID_KEY   = 'cloud_dairy_id'
const DAIRY_CODE_KEY = 'cloud_dairy_code'
const LAST_SYNC_KEY  = 'cloud_last_sync'
const BATCH = 500

// All local tables included in the full-snapshot owner backup.
const BACKUP_TABLES = [
  'users', 'products', 'areas', 'settings', 'rate_history',
  'customers', 'customer_products', 'deliveries', 'monthly_bills',
  'bill_items', 'payments',
]

// Chunk an array into batches for upsert.
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function upsertAll(table, rows) {
  if (!rows.length) return
  for (const batch of chunk(rows, BATCH)) {
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'dairy_id,local_id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

// Remove cloud rows that no longer exist locally (propagate deletions), so a
// customer never sees data the owner has deleted.
async function deleteMissing(table, dairy_id, localIds) {
  let q = supabase.from(table).delete().eq('dairy_id', dairy_id)
  if (localIds.length) q = q.not('local_id', 'in', `(${localIds.join(',')})`)
  const { error } = await q
  if (error) throw new Error(`${table} delete: ${error.message}`)
}

// Ensure a cloud `dairies` row exists for this owner and return its id.
// Reuses the id cached in settings; otherwise finds/creates one owned by the
// signed-in user and caches it.
export async function ensureDairy() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('प्रथम क्लाउडमध्ये साइन इन करा')  // "Sign in to cloud first"

  let dairyId = await getSetting(DAIRY_ID_KEY)

  // Pull dairy profile from local settings.
  const s = await db.query('SELECT key, value FROM settings')
  const smap = Object.fromEntries(s.map(r => [r.key, r.value]))
  const profile = {
    name:       smap.dairy_name || '',
    owner_name: smap.owner_name || '',
    mobile:     smap.mobile || '',
    address:    smap.address || '',
    currency:   smap.currency || '₹',
    owner_auth_id: user.id,
    updated_at: new Date().toISOString(),
  }

  if (dairyId) {
    const { data } = await supabase.from('dairies').update(profile).eq('id', dairyId).select('code').single()
    if (data?.code) await setSetting(DAIRY_CODE_KEY, data.code)
    return dairyId
  }

  // Look for an existing dairy owned by this user, else create one.
  const { data: existing } = await supabase
    .from('dairies').select('id, code').eq('owner_auth_id', user.id).limit(1)
  if (existing && existing.length) {
    dairyId = existing[0].id
    await supabase.from('dairies').update(profile).eq('id', dairyId)
    if (existing[0].code) await setSetting(DAIRY_CODE_KEY, existing[0].code)
  } else {
    const { data, error } = await supabase
      .from('dairies').insert(profile).select('id, code').single()
    if (error) throw new Error(`dairy: ${error.message}`)
    dairyId = data.id
    if (data.code) await setSetting(DAIRY_CODE_KEY, data.code)
  }
  await setSetting(DAIRY_ID_KEY, dairyId)
  return dairyId
}

export async function getDairyCode() {
  return getSetting(DAIRY_CODE_KEY)
}

// Push all tables. Returns a summary { counts, at }.
export async function syncNow() {
  const dairy_id = await ensureDairy()

  // ── Load local data ──
  const [products, customers, areas, deliveries, bills, billItems, payments] =
    await Promise.all([
      db.query('SELECT * FROM products'),
      db.query('SELECT * FROM customers'),
      db.query('SELECT * FROM areas'),
      db.query('SELECT * FROM deliveries'),
      db.query('SELECT * FROM monthly_bills'),
      db.query('SELECT * FROM bill_items'),
      db.query('SELECT * FROM payments'),
    ])
  const areaName = id => areas.find(a => a.id === id)?.name || ''
  const now = new Date().toISOString()

  // ── Safety guard ──
  // Never let an empty phone wipe the cloud. If this device has no customers
  // but a cloud backup with data exists (e.g. after a reinstall), skip the
  // push entirely and signal that a restore is needed.
  if (customers.length === 0) {
    const { data: bk } = await supabase
      .from('owner_backups').select('customer_count').maybeSingle()
    if (bk && bk.customer_count > 0) {
      return { skipped: 'restore_needed' }
    }
  }

  // ── Map local rows → cloud shape ──
  const cProducts = products.map(p => ({
    dairy_id, local_id: p.id, name: p.name, type: p.type, unit: p.unit,
    default_rate: p.default_rate, is_active: p.is_active, updated_at: now,
  }))
  const cCustomers = customers.map(c => ({
    dairy_id, local_id: c.id, name: c.name, mobile: c.mobile, address: c.address,
    area_name: areaName(c.area_id), status: c.status, start_date: c.start_date,
    updated_at: now,
    // auth_user_id is set separately when the owner creates a customer login;
    // omit here so we never overwrite an existing link.
  }))
  const cDeliveries = deliveries.map(d => ({
    dairy_id, local_id: d.id, customer_id: d.customer_id, product_id: d.product_id,
    date: d.date, session: d.session, qty: d.qty, status: d.status,
    notes: d.notes, updated_at: now,
  }))
  const cBills = bills.map(b => ({
    dairy_id, local_id: b.id, customer_id: b.customer_id, month: b.month, year: b.year,
    total_qty: b.total_qty, total_amount: b.total_amount, prev_balance: b.prev_balance,
    payments_made: b.payments_made, amount_due: b.amount_due, is_locked: b.is_locked,
    generated_date: b.generated_date, updated_at: now,
  }))
  const cBillItems = billItems.map(bi => ({
    dairy_id, local_id: bi.id, bill_id: bi.bill_id,
    // resolve the owning customer via the bill so RLS can scope it
    customer_id: bills.find(b => b.id === bi.bill_id)?.customer_id ?? 0,
    product_id: bi.product_id, product_name: bi.product_name, date: bi.date,
    session: bi.session, qty: bi.qty, rate: bi.rate, amount: bi.amount,
    unit: bi.unit, updated_at: now,
  }))
  const cPayments = payments.map(p => ({
    dairy_id, local_id: p.id, customer_id: p.customer_id, bill_id: p.bill_id,
    date: p.date, amount: p.amount, mode: p.mode, notes: p.notes, updated_at: now,
  }))

  // ── Push (parents first for referential clarity) ──
  await upsertAll('products',       cProducts)
  await upsertAll('customers',      cCustomers)
  await upsertAll('deliveries',     cDeliveries)
  await upsertAll('monthly_bills',  cBills)
  await upsertAll('bill_items',     cBillItems)
  await upsertAll('payments',       cPayments)

  // ── Reconcile deletions (remove cloud rows deleted locally) ──
  await deleteMissing('products',      dairy_id, products.map(p => p.id))
  await deleteMissing('customers',     dairy_id, customers.map(c => c.id))
  await deleteMissing('deliveries',    dairy_id, deliveries.map(d => d.id))
  await deleteMissing('monthly_bills', dairy_id, bills.map(b => b.id))
  await deleteMissing('bill_items',    dairy_id, billItems.map(bi => bi.id))
  await deleteMissing('payments',      dairy_id, payments.map(p => p.id))

  // ── Full-snapshot owner backup (so the owner can restore after reinstall) ──
  await backupNow(dairy_id)

  await setSetting(LAST_SYNC_KEY, now)
  return {
    at: now,
    counts: {
      products: cProducts.length, customers: cCustomers.length,
      deliveries: cDeliveries.length, bills: cBills.length,
      bill_items: cBillItems.length, payments: cPayments.length,
    },
  }
}

export async function getLastSync() {
  return getSetting(LAST_SYNC_KEY)
}

// ── Owner backup / restore ─────────────────────────────────────────────────────
// Uploads a full JSON snapshot of every local table so the owner can recover
// their entire dairy after uninstalling / changing phones.
export async function backupNow(dairyId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('प्रथम क्लाउडमध्ये साइन इन करा')
  const dairy_id = dairyId || await getSetting(DAIRY_ID_KEY)

  const snapshot = {}
  for (const t of BACKUP_TABLES) {
    try { snapshot[t] = await db.query(`SELECT * FROM ${t}`) } catch { snapshot[t] = [] }
  }
  const customer_count = snapshot.customers?.length || 0

  const { error } = await supabase.from('owner_backups').upsert({
    owner_auth_id: user.id, dairy_id, data: snapshot, customer_count,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_auth_id' })
  if (error) throw new Error(`backup: ${error.message}`)
  return { customer_count }
}

// Info about the cloud backup (for UI): { customer_count, updated_at } or null.
export async function getCloudBackupInfo() {
  const { data } = await supabase
    .from('owner_backups').select('customer_count, updated_at').maybeSingle()
  return data || null
}

// True when this phone is empty but a cloud backup with data exists.
export async function needsRestore() {
  const local = await db.query('SELECT id FROM customers LIMIT 1')
  if (local.length > 0) return false
  const info = await getCloudBackupInfo()
  return !!(info && info.customer_count > 0)
}

// Rebuild the local database from the cloud backup (overwrites local tables).
export async function restoreFromCloud() {
  const { data, error } = await supabase.from('owner_backups').select('data').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.data) throw new Error('क्लाउडवर बॅकअप सापडला नाही')
  const snap = data.data

  for (const t of BACKUP_TABLES) {
    const rows = snap[t] || []
    await db.run(`DELETE FROM ${t}`)
    for (const row of rows) {
      const cols = Object.keys(row)
      if (!cols.length) continue
      const ph = cols.map(() => '?').join(',')
      await db.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph})`, cols.map(c => row[c]))
    }
  }
  return { restored: true }
}
import { Capacitor } from '@capacitor/core'

// ── Platform detection ────────────────────────────────────────────────────────
const IS_NATIVE = Capacitor.getPlatform() !== 'web'

// ── Native (Android) connection via @capacitor-community/sqlite ───────────────
let _conn = null          // native connection
let _sqljs = null         // sql.js Database instance (web only)
let _lastInsertId = 0

// ── sql.js web adapter ────────────────────────────────────────────────────────
// Wraps sql.js Database to expose the same run/query/insert API.
// Data is persisted in localStorage as a base64 blob between page reloads.
const WEB_KEY = 'duddairy_sqljs'

function webRun(sql, params = []) {
  _sqljs.run(sql, params.map(v => v === undefined ? null : v))
  _lastInsertId = _sqljs.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0
  _saveWeb()
}

function webQuery(sql, params = []) {
  const res = _sqljs.exec(sql, params)
  if (!res.length) return []
  const { columns, values } = res[0]
  return values.map(row => {
    const obj = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
}

function _saveWeb() {
  try {
    const data = _sqljs.export()
    const b64  = btoa(String.fromCharCode(...data))
    localStorage.setItem(WEB_KEY, b64)
  } catch { /* quota — ignore in dev */ }
}

async function _initWeb() {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
  const saved = localStorage.getItem(WEB_KEY)
  if (saved) {
    try {
      const raw = Uint8Array.from(atob(saved), c => c.charCodeAt(0))
      _sqljs = new SQL.Database(raw)
      // Verify schema is current — check for is_active column in users
      const cols = _sqljs.exec("PRAGMA table_info(users)")
      const colNames = cols[0]?.values.map(r => r[1]) ?? []
      if (!colNames.includes('is_active')) {
        // Old schema — wipe and start fresh
        console.warn('Old DB schema detected, clearing localStorage for fresh seed')
        localStorage.removeItem(WEB_KEY)
        _sqljs = new SQL.Database()
      }
    } catch {
      localStorage.removeItem(WEB_KEY)
      _sqljs = new SQL.Database()
    }
  } else {
    _sqljs = new SQL.Database()
  }
}

// ── Public DB API ─────────────────────────────────────────────────────────────
export const db = {
  async run(sql, params = []) {
    if (!IS_NATIVE) { webRun(sql, params); return }
    await _conn.run(sql, params, false)
  },

  async query(sql, params = []) {
    if (!IS_NATIVE) return webQuery(sql, params)
    const res = await _conn.query(sql, params)
    return res.values ?? []
  },

  async first(sql, params = []) {
    const rows = await db.query(sql, params)
    return rows[0] ?? null
  },

  async insert(sql, params = []) {
    if (!IS_NATIVE) {
      webRun(sql, params)
      return _lastInsertId
    }
    const res = await _conn.run(sql, params, false)
    return res.changes?.lastId
  },
}

// ── Schema ────────────────────────────────────────────────────────────────────
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'owner',
  is_active INTEGER DEFAULT 1,
  name TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT DEFAULT 'L',
  default_rate REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sequence INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT
);
CREATE TABLE IF NOT EXISTS rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  rate REAL NOT NULL,
  effective_date TEXT NOT NULL,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT,
  address TEXT,
  area_id INTEGER,
  product_id INTEGER,
  morning_qty REAL DEFAULT 0,
  evening_qty REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  status TEXT DEFAULT 'active',
  start_date TEXT
);
CREATE TABLE IF NOT EXISTS customer_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  morning_qty REAL DEFAULT 0,
  evening_qty REAL DEFAULT 0,
  rate REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER,
  date TEXT NOT NULL,
  session TEXT NOT NULL,
  qty REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS monthly_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_qty REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  prev_balance REAL DEFAULT 0,
  payments_made REAL DEFAULT 0,
  amount_due REAL DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  generated_date TEXT
);
CREATE TABLE IF NOT EXISTS bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT,
  date TEXT,
  session TEXT,
  qty REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  unit TEXT DEFAULT 'L'
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  bill_id INTEGER,
  date TEXT NOT NULL,
  amount REAL DEFAULT 0,
  mode TEXT DEFAULT 'cash',
  notes TEXT DEFAULT ''
);
`

// ── Seed ─────────────────────────────────────────────────────────────────────
// Production bootstrap only: a single owner login, the default product catalog,
// and empty (non-demo) settings. No demo customers / deliveries / bills /
// payments / areas / rate history are created.
async function seedIfEmpty() {
  const users = await db.query('SELECT id FROM users LIMIT 1')
  if (users.length > 0) return

  // 1. Owner login (default credentials — owner changes these in Settings)
  await db.run(
    `INSERT INTO users (mobile,password,role,is_active,name) VALUES (?,?,?,?,?)`,
    ['9999999999','1234','owner',1,'']
  )

  // 2. Product catalog (default rates — owner edits as needed)
  const prodDefs = [
    ['म्हैस दूध','milk_buffalo','L',62,1],
    ['गाय दूध','milk_cow','L',55,1],
    ['दही','other','kg',80,1],
    ['तूप','other','kg',600,1],
    ['लोणी','other','kg',350,1],
    ['पनीर','other','kg',350,1],
    ['ताक','other','L',20,1],
    ['खवा / मावा','other','kg',300,1],
  ]
  for (const [name,type,unit,rate,active] of prodDefs) {
    await db.run(
      `INSERT INTO products (name,type,unit,default_rate,is_active) VALUES (?,?,?,?,?)`,
      [name,type,unit,rate,active]
    )
  }

  // 3. Settings — keys only, owner fills in dairy details from Settings page
  const settingRows = [
    ['dairy_name',''],
    ['owner_name',''],
    ['mobile',''],
    ['address',''],
    ['default_rate','0'],
    ['currency','₹'],
  ]
  for (const [key,value] of settingRows) {
    await db.run(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`,[key,value])
  }

  console.log('✅ DudDairy bootstrap complete (no demo data)')
}

// ── Public init ───────────────────────────────────────────────────────────────
export async function initDB() {
  if (_conn || _sqljs) return

  if (!IS_NATIVE) {
    // Web / dev mode: use sql.js directly (no jeep-sqlite, no WASM version mismatch)
    await _initWeb()
    _sqljs.exec(DDL)   // exec() runs multiple statements; run() only runs one
    await seedIfEmpty()
    return
  }

  // Native Android: use @capacitor-community/sqlite
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
  const sqliteConnection = new SQLiteConnection(CapacitorSQLite)

  const dbName      = 'duddairy'
  const consistency = await sqliteConnection.checkConnectionsConsistency()
  const isConn      = (await sqliteConnection.isConnection(dbName, false)).result

  if (consistency.result && isConn) {
    _conn = await sqliteConnection.retrieveConnection(dbName, false)
  } else {
    _conn = await sqliteConnection.createConnection(dbName, false, 'no-encryption', 1, false)
  }

  await _conn.open()
  await _conn.execute(DDL, false)
  await seedIfEmpty()
}

export default db

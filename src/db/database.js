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

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad     = n => String(n).padStart(2, '0')
const dateStr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const daysIn  = (y, m) => new Date(y, m, 0).getDate()

function prevMonth(now, offset) {
  let m = now.m - offset
  let y = now.y
  while (m <= 0) { m += 12; y-- }
  return { m, y }
}

// ── Seed ─────────────────────────────────────────────────────────────────────
async function seedIfEmpty() {
  const users = await db.query('SELECT id FROM users LIMIT 1')
  if (users.length > 0) return

  const now = new Date()
  const CUR_Y = now.getFullYear()
  const CUR_M = now.getMonth() + 1
  const CUR_D = now.getDate()
  const M2    = prevMonth({ y: CUR_Y, m: CUR_M }, 2)
  const M1    = prevMonth({ y: CUR_Y, m: CUR_M }, 1)

  // 1. Owner
  await db.run(
    `INSERT INTO users (mobile,password,role,is_active,name) VALUES (?,?,?,?,?)`,
    ['9999999999','1234','owner',1,'गणेश पाटील']
  )

  // 2. Products
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
  const products = await db.query('SELECT * FROM products')
  const P = {}
  for (const p of products) {
    if (p.type==='milk_buffalo') P.buf = p
    else if (p.type==='milk_cow') P.cow = p
    else P[p.name] = p
  }

  // 3. Areas
  const a1 = await db.insert(`INSERT INTO areas (name,sequence) VALUES (?,?)`,['भाग A — मेन रोड',1])
  const a2 = await db.insert(`INSERT INTO areas (name,sequence) VALUES (?,?)`,['भाग B — मंदिर वाडी',2])
  const a3 = await db.insert(`INSERT INTO areas (name,sequence) VALUES (?,?)`,['भाग C — नवीन पेठ',3])

  // 4. Settings
  const settingRows = [
    ['dairy_name','श्री गणेश दूध डेअरी'],
    ['owner_name','गणेश पाटील'],
    ['mobile','9999999999'],
    ['address','मुख्य चौक, ग्राम पंचायत रोड, पुणे जिल्हा - ४१२३०१'],
    ['default_rate','62'],
    ['currency','₹'],
  ]
  for (const [key,value] of settingRows) {
    await db.run(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`,[key,value])
  }

  // 5. Rate history
  await db.run(
    `INSERT INTO rate_history (product_id,rate,effective_date,notes) VALUES (?,?,?,?)`,
    [P.buf.id,55,dateStr(CUR_Y, M2.m>3?M2.m-3:1, 1),'जुना दर — म्हैस दूध']
  )
  await db.run(
    `INSERT INTO rate_history (product_id,rate,effective_date,notes) VALUES (?,?,?,?)`,
    [P.buf.id,60,dateStr(M2.y,M2.m,1),'दर वाढ — बाजारभाव']
  )
  await db.run(
    `INSERT INTO rate_history (product_id,rate,effective_date,notes) VALUES (?,?,?,?)`,
    [P.buf.id,62,dateStr(M1.y,M1.m,1),'नवीन दर — सध्याचा दर']
  )

  // 6. Customers
  const custDefs = [
    {name:'रमेश पाटील',      mobile:'9876543201',address:'मेन रोड, गल्ली क्र.१',       area:a1,prod:P.buf,mq:2,  eq:1,  rate:62,status:'active',start:dateStr(CUR_Y-1,11,1)},
    {name:'सुरेश जाधव',      mobile:'9876543202',address:'शाळेजवळ, गल्ली क्र.२',       area:a1,prod:P.buf,mq:1.5,eq:0,  rate:62,status:'active',start:dateStr(CUR_Y-1,12,1)},
    {name:'प्रिया शिंदे',    mobile:'9876543203',address:'नवीन वाडी, फ्लॅट नं.५',      area:a1,prod:P.cow,mq:1,  eq:1,  rate:55,status:'active',start:dateStr(CUR_Y,1,1)},
    {name:'मीरा पवार',       mobile:'9876543209',address:'जवळचा रस्ता, घर क्र.१२',     area:a1,prod:P.cow,mq:1.5,eq:1,  rate:55,status:'active',start:dateStr(CUR_Y,M2.m,1)},
    {name:'विजय देशमुख',    mobile:'9876543204',address:'मंदिराजवळ, वाडी क्र.३',      area:a2,prod:P.buf,mq:2,  eq:2,  rate:62,status:'active',start:dateStr(CUR_Y-1,10,1)},
    {name:'अनिता कांबळे',   mobile:'9876543205',address:'पाण्याच्या टाकीजवळ',         area:a2,prod:P.cow,mq:0.5,eq:0.5,rate:55,status:'active',start:dateStr(CUR_Y,1,15)},
    {name:'संजय मोरे',       mobile:'9876543206',address:'शेतकरी कॉलनी, घर क्र.२१',   area:a2,prod:P.buf,mq:3,  eq:0,  rate:60,status:'active',start:dateStr(CUR_Y-1,9,1)},
    {name:'राहुल शर्मा',     mobile:'9876543210',address:'नवीन बिल्डिंग, फ्लॅट ब-४',  area:a2,prod:P.buf,mq:1,  eq:1,  rate:62,status:'active',start:dateStr(CUR_Y,M2.m,15)},
    {name:'गीता सावंत',      mobile:'9876543207',address:'जुना बाजार, घर क्र.७',       area:a3,prod:P.buf,mq:1,  eq:1,  rate:62,status:'paused',start:dateStr(CUR_Y-1,12,1)},
    {name:'दिनेश खोत',       mobile:'9876543208',address:'नवीन पेठ, गल्ली क्र.४',      area:a3,prod:P.buf,mq:2,  eq:1,  rate:62,status:'active',start:dateStr(CUR_Y,1,1)},
    {name:'सोनाली भोसले',    mobile:'9876543211',address:'गणपती मंदिर रोड, घर नं.३',   area:a3,prod:P.cow,mq:2,  eq:0,  rate:55,status:'active',start:dateStr(CUR_Y,M2.m,1)},
    {name:'अजय निंबाळकर',   mobile:'9876543212',address:'साखर कारखाना कॉलनी, क्र.८',  area:a3,prod:P.buf,mq:2,  eq:2,  rate:65,status:'active',start:dateStr(CUR_Y,M2.m,1)},
  ]

  const cIds = []
  for (const c of custDefs) {
    const id = await db.insert(
      `INSERT INTO customers (name,mobile,address,area_id,product_id,morning_qty,evening_qty,rate,status,start_date) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [c.name,c.mobile,c.address,c.area,c.prod.id,c.mq,c.eq,c.rate,c.status,c.start]
    )
    cIds.push(id)
  }

  // 7. Extra subscriptions
  await db.run(`INSERT INTO customer_products (customer_id,product_id,morning_qty,evening_qty,rate) VALUES (?,?,?,?,?)`,[cIds[0],P['दही'].id,0.5,0,80])
  await db.run(`INSERT INTO customer_products (customer_id,product_id,morning_qty,evening_qty,rate) VALUES (?,?,?,?,?)`,[cIds[4],P['दही'].id,1,0,80])
  await db.run(`INSERT INTO customer_products (customer_id,product_id,morning_qty,evening_qty,rate) VALUES (?,?,?,?,?)`,[cIds[4],P['तूप'].id,0.25,0,600])
  await db.run(`INSERT INTO customer_products (customer_id,product_id,morning_qty,evening_qty,rate) VALUES (?,?,?,?,?)`,[cIds[3],P['ताक'].id,0.5,0,20])
  await db.run(`INSERT INTO customer_products (customer_id,product_id,morning_qty,evening_qty,rate) VALUES (?,?,?,?,?)`,[cIds[9],P['पनीर'].id,0.5,0,360])

  // 8. Deliveries
  const SKIPS = [
    [7,14,21],[10,25],[3,18],[20],[12],[8,22],[5,19,29],[16],
    [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31],
    [22],[11],[14,28],
  ]
  const PARTIAL = [{18:1.5},{},{15:0.5},{},{25:1.5},{},{28:2},{},{},{20:1},{},{10:1}]
  const PANEER_DAYS = [2,5,9,12,16,19,23,26,30]

  for (const {y,m,maxDay} of [
    {y:M2.y,m:M2.m,maxDay:daysIn(M2.y,M2.m)},
    {y:M1.y,m:M1.m,maxDay:daysIn(M1.y,M1.m)},
    {y:CUR_Y,m:CUR_M,maxDay:CUR_D},
  ]) {
    for (let ci=0; ci<custDefs.length; ci++) {
      const custId  = cIds[ci]
      const cd      = custDefs[ci]
      const skips   = SKIPS[ci] || []
      const partial = PARTIAL[ci] || {}

      for (let day=1; day<=maxDay; day++) {
        if (skips.includes(day)) continue
        const date = dateStr(y,m,day)

        if (cd.mq > 0) {
          const rawQty = partial[day] !== undefined ? partial[day] : cd.mq
          const status = partial[day] !== undefined ? 'partial' : 'delivered'
          await db.run(
            `INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,
            [custId,cd.prod.id,date,'morning',rawQty,status,'']
          )
        }
        if (cd.eq > 0) {
          await db.run(
            `INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,
            [custId,cd.prod.id,date,'evening',cd.eq,'delivered','']
          )
        }

        if (ci===0) await db.run(`INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,[custId,P['दही'].id,date,'morning',0.5,'delivered',''])
        if (ci===4) await db.run(`INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,[custId,P['दही'].id,date,'morning',1,'delivered',''])
        if (ci===4&&(day===1||day===15)) await db.run(`INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,[custId,P['तूप'].id,date,'morning',0.5,'delivered',''])
        if (ci===3) await db.run(`INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,[custId,P['ताक'].id,date,'morning',0.5,'delivered',''])
        if (ci===9&&PANEER_DAYS.includes(day)) await db.run(`INSERT INTO deliveries (customer_id,product_id,date,session,qty,status,notes) VALUES (?,?,?,?,?,?,?)`,[custId,P['पनीर'].id,date,'morning',0.5,'delivered',''])
      }
    }
  }

  // 9. Bills for M2 and M1
  const PAY_RATIO = [0.85,1.0,0.9,0.75,1.0,1.0,0.8,1.0,0.6,0.7,1.0,0.85]
  const PAY_MODE  = ['cash','upi','cash','cash','upi','cash','cash','upi','cash','cash','upi','cash']
  const MR_MONTHS = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर']

  const extraRate = (ci, productId) => {
    if (ci===0 && productId===P['दही'].id)  return 80
    if (ci===4 && productId===P['दही'].id)  return 80
    if (ci===4 && productId===P['तूप'].id)  return 600
    if (ci===3 && productId===P['ताक'].id)  return 20
    if (ci===9 && productId===P['पनीर'].id) return 360
    return custDefs[ci].rate
  }

  let prevDueMap = {}

  for (const {y,m} of [{y:M2.y,m:M2.m},{y:M1.y,m:M1.m}]) {
    const sd = dateStr(y,m,1)
    const ed = dateStr(y,m,daysIn(y,m))
    const monthDels = await db.query(
      `SELECT * FROM deliveries WHERE date BETWEEN ? AND ? AND (status='delivered' OR status='partial')`,
      [sd,ed]
    )

    for (let ci=0; ci<custDefs.length; ci++) {
      if (ci===8) continue
      const custId = cIds[ci]
      const cd     = custDefs[ci]
      const dels   = monthDels.filter(d => d.customer_id === custId)
      if (dels.length === 0) continue

      let totalQty=0, totalAmount=0
      const items = dels.map(d => {
        const prod   = products.find(p => p.id === d.product_id)
        const rate   = d.product_id===cd.prod.id ? cd.rate : extraRate(ci,d.product_id)
        const qty    = d.qty||0
        const amount = qty*rate
        totalQty    += qty
        totalAmount += amount
        return {date:d.date,session:d.session,qty,rate,amount,product_id:d.product_id,product_name:prod?.name||'दूध',unit:prod?.unit||'L'}
      })

      const prevBalance  = Math.max(0, prevDueMap[custId]||0)
      const totalDue     = totalAmount + prevBalance
      const paymentsMade = Math.round(totalDue*PAY_RATIO[ci]/10)*10
      const amountDue    = Math.max(0, totalDue-paymentsMade)

      const billId = await db.insert(
        `INSERT INTO monthly_bills (customer_id,month,year,total_qty,total_amount,prev_balance,payments_made,amount_due,is_locked,generated_date) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [custId,m,y,totalQty,totalAmount,prevBalance,paymentsMade,amountDue,1,ed]
      )

      for (const item of items) {
        await db.run(
          `INSERT INTO bill_items (bill_id,product_id,product_name,date,session,qty,rate,amount,unit) VALUES (?,?,?,?,?,?,?,?,?)`,
          [billId,item.product_id,item.product_name,item.date,item.session,item.qty,item.rate,item.amount,item.unit]
        )
      }

      if (paymentsMade > 0) {
        const label = `${MR_MONTHS[m-1]} बिल जमा`
        if (paymentsMade > 800) {
          const half = Math.round(paymentsMade*0.55/10)*10
          const rest = paymentsMade - half
          await db.run(`INSERT INTO payments (customer_id,bill_id,date,amount,mode,notes) VALUES (?,?,?,?,?,?)`,[custId,billId,dateStr(y,m,12),half,PAY_MODE[ci],label+' (१ली हप्ता)'])
          await db.run(`INSERT INTO payments (customer_id,bill_id,date,amount,mode,notes) VALUES (?,?,?,?,?,?)`,[custId,billId,dateStr(y,m,25),rest,PAY_MODE[ci],label+' (२री हप्ता)'])
        } else {
          await db.run(`INSERT INTO payments (customer_id,bill_id,date,amount,mode,notes) VALUES (?,?,?,?,?,?)`,[custId,billId,dateStr(y,m,20),paymentsMade,PAY_MODE[ci],label])
        }
      }

      prevDueMap[custId] = amountDue
    }
  }

  // 10. Advance payments current month
  const advPayments = [
    {ci:0, amount:600,  day:3,  notes:'मे महिना अग्रिम',        mode:'cash'},
    {ci:4, amount:1000, day:5,  notes:'GPay — मे अग्रिम',       mode:'upi'},
    {ci:6, amount:1500, day:2,  notes:'रोख — मे आगाऊ जमा',     mode:'cash'},
    {ci:9, amount:800,  day:7,  notes:'UPI — मे जमा',           mode:'upi'},
    {ci:11,amount:1200, day:10, notes:'मे महिना अर्धी रक्कम',   mode:'upi'},
  ]
  for (const p of advPayments) {
    if (p.day <= CUR_D) {
      await db.run(
        `INSERT INTO payments (customer_id,bill_id,date,amount,mode,notes) VALUES (?,?,?,?,?,?)`,
        [cIds[p.ci],null,dateStr(CUR_Y,CUR_M,p.day),p.amount,p.mode,p.notes]
      )
    }
  }

  console.log('✅ DudDairy SQLite seed complete')
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

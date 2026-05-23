import React, { useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import Header from '../components/Header.jsx'
import { useToast } from '../context/ToastContext.jsx'
import db from '../db/database.js'

const IS_NATIVE = Capacitor.getPlatform() !== 'web'
const LAST_BACKUP_KEY = 'dud_last_backup'
const BATCH_SIZE = 500   // rows per INSERT statement

// ── Get actual columns that exist in a table ────────────────────────────────
async function getTableColumns(table) {
  const rows = await db.query(`PRAGMA table_info(${table})`)
  return rows.map(r => r.name)
}

// ── Batch restore a single table inside an open transaction ─────────────────
// Fetches real table columns first, then ignores any extra fields in the JSON
// that don't exist in the current schema (prevents "no column named X" errors).
async function batchRestoreTable(table, rows, onProgress) {
  if (!rows?.length) { onProgress(0, 0); return }

  // Only use columns that actually exist in the DB table
  const tableCols   = await getTableColumns(table)
  const backupCols  = Object.keys(rows[0])
  const cols        = backupCols.filter(c => tableCols.includes(c))

  if (cols.length === 0) throw new Error(`${table}: कोणतेही जुळणारे स्तंभ नाहीत`)

  const total = rows.length
  let done = 0

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk          = rows.slice(i, i + BATCH_SIZE)
    const placeholderRow = `(${cols.map(() => '?').join(',')})`
    const sql            = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES ${chunk.map(() => placeholderRow).join(',')}`
    const vals           = chunk.flatMap(row => cols.map(c => row[c]))
    await db.run(sql, vals)
    done += chunk.length
    onProgress(done, total)
    // Yield to UI thread between batches so progress bar updates
    await new Promise(r => setTimeout(r, 0))
  }
}

// ── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  { key: 'areas',         label: 'भाग/क्षेत्र',     icon: '📍', dataKey: 'areas' },
  { key: 'products',      label: 'उत्पादने',         icon: '🛒', dataKey: 'products' },
  { key: 'settings',      label: 'सेटिंग्ज',         icon: '⚙️', dataKey: 'settings' },
  { key: 'customers',     label: 'ग्राहक',            icon: '👥', dataKey: 'customers' },
  { key: 'deliveries',    label: 'डिलिव्हरी नोंदी',  icon: '🥛', dataKey: 'deliveries' },
  { key: 'monthly_bills', label: 'बिले',              icon: '📋', dataKey: 'monthly_bills' },
  { key: 'bill_items',    label: 'बिल तपशील',        icon: '📄', dataKey: 'bill_items' },
  { key: 'payments',      label: 'पैसे जमा',         icon: '💰', dataKey: 'payments' },
  { key: 'rate_history',  label: 'दर इतिहास',        icon: '📈', dataKey: 'rate_history' },
]

// ── RestoreProgress component ────────────────────────────────────────────────
function RestoreProgress({ stages }) {
  // stages: { key -> { done, total, status: 'waiting'|'running'|'done'|'skipped' } }
  const totalRows   = Object.values(stages).reduce((s, v) => s + (v.total || 0), 0)
  const doneRows    = Object.values(stages).reduce((s, v) => s + (v.done  || 0), 0)
  const overallPct  = totalRows > 0 ? Math.round((doneRows / totalRows) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Overall bar */}
      <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>📥 डेटा रिस्टोर होत आहे...</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--accent)' }}>{overallPct}%</span>
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: 20, height: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 20,
            background: 'linear-gradient(to right, var(--green), var(--accent))',
            width: `${overallPct}%`, transition: 'width 0.3s'
          }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
          {doneRows.toLocaleString('en-IN')} / {totalRows.toLocaleString('en-IN')} नोंदी
        </div>
      </div>

      {/* Per-stage rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STAGES.map(s => {
          const st = stages[s.key] || { status: 'waiting', done: 0, total: 0 }
          const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0
          const isDone    = st.status === 'done' || st.status === 'skipped'
          const isRunning = st.status === 'running'
          return (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '9px 12px',
              opacity: st.status === 'waiting' ? 0.45 : 1,
              transition: 'opacity 0.2s'
            }}>
              {/* Status icon */}
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                background: isDone ? 'rgba(16,185,129,0.15)' : isRunning ? 'rgba(16,185,129,0.08)' : 'var(--surface2)' }}>
                {isDone ? '✅' : isRunning ? <span className="spinner" style={{ width: 14, height: 14 }} /> : s.icon}
              </div>

              {/* Label + mini bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isRunning ? 4 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: isRunning ? 700 : 500, color: isDone ? 'var(--text2)' : 'var(--text)' }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0, marginLeft: 8 }}>
                    {st.status === 'skipped' ? 'रिकामे' :
                     isDone    ? `${st.total.toLocaleString('en-IN')} नोंदी` :
                     isRunning ? `${st.done.toLocaleString('en-IN')} / ${st.total.toLocaleString('en-IN')}` : ''}
                  </span>
                </div>
                {isRunning && st.total > 0 && (
                  <div style={{ background: 'var(--surface2)', borderRadius: 20, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 20, background: 'var(--accent)', width: `${pct}%`, transition: 'width 0.2s' }} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Backup() {
  const { show } = useToast()
  const [exporting,  setExporting]  = useState(false)
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem(LAST_BACKUP_KEY) || null)

  // Restore state
  const [restorePhase,  setRestorePhase]  = useState('idle') // idle | confirm | running | done | error
  const [restoreStages, setRestoreStages] = useState({})
  const [restoreError,  setRestoreError]  = useState(null)
  const [pendingFile,   setPendingFile]   = useState(null)
  const [restoreStats,  setRestoreStats]  = useState(null) // { totalRows, timeSec }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const setStage = (key, patch) =>
    setRestoreStages(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }))

  // ── Build backup JSON ────────────────────────────────────────────────────────
  const buildBackupData = async () => {
    const [customers, deliveries, bills, billItems, payments, areas, products, rateHistory, settings] = await Promise.all([
      db.query('SELECT * FROM customers'),
      db.query('SELECT * FROM deliveries'),
      db.query('SELECT * FROM monthly_bills'),
      db.query('SELECT * FROM bill_items'),
      db.query('SELECT * FROM payments'),
      db.query('SELECT * FROM areas'),
      db.query('SELECT * FROM products'),
      db.query('SELECT * FROM rate_history'),
      db.query('SELECT * FROM settings'),
    ])
    return {
      exported_at: new Date().toISOString(),
      version: '1.1',
      customers, deliveries,
      monthly_bills: bills,
      bill_items: billItems,
      payments, areas, products,
      rate_history: rateHistory,
      settings,
    }
  }

  // ── Share backup ─────────────────────────────────────────────────────────────
  const shareBackup = useCallback(async () => {
    setExporting(true)
    try {
      const data     = await buildBackupData()
      const json     = JSON.stringify(data, null, 2)
      const filename = `dud-dairy-backup-${new Date().toISOString().split('T')[0]}.json`

      if (IS_NATIVE) {
        const result = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: 'utf8' })
        await Share.share({
          title: `दूध डेअरी बॅकअप — ${new Date().toLocaleDateString('mr-IN')}`,
          text: 'दूध डेअरी अॅपचा पूर्ण बॅकअप. Gmail किंवा Drive मध्ये सेव्ह करा.',
          url: result.uri,
          dialogTitle: 'बॅकअप शेअर करा',
        })
      } else {
        const blob = new Blob([json], { type: 'application/json' })
        const url  = URL.createObjectURL(blob)
        Object.assign(document.createElement('a'), { href: url, download: filename }).click()
        URL.revokeObjectURL(url)
      }

      const now = new Date().toLocaleString('mr-IN')
      localStorage.setItem(LAST_BACKUP_KEY, now)
      setLastBackup(now)
      show('बॅकअप शेअर करण्यासाठी तयार!', 'success')
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('abort')) return
      show('बॅकअप त्रुटी: ' + err.message, 'error')
    } finally {
      setExporting(false)
    }
  }, [show])

  // ── File picked — show confirm dialog ────────────────────────────────────────
  const onFilePicked = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    setPendingFile(file)
    setRestorePhase('confirm')
    e.target.value = ''
  }, [])

  // ── Run restore ──────────────────────────────────────────────────────────────
  const runRestore = useCallback(async () => {
    if (!pendingFile) return
    setRestorePhase('running')
    setRestoreStages({})
    setRestoreError(null)

    const startTime = Date.now()
    try {
      const text = await pendingFile.text()
      const data = JSON.parse(text)
      if (!data.version) throw new Error('अवैध बॅकअप फाईल — version नाही')

      // Count total rows upfront so progress bar is accurate
      const initialStages = {}
      for (const s of STAGES) {
        const rows = data[s.dataKey]
        initialStages[s.key] = { status: 'waiting', done: 0, total: rows?.length || 0 }
      }
      setRestoreStages(initialStages)
      await new Promise(r => setTimeout(r, 50)) // let React render initial state

      // ── Single transaction wrapping everything ───────────────────────────────
      await db.run('BEGIN TRANSACTION')
      try {
        for (const s of STAGES) {
          const rows = data[s.dataKey]
          if (!rows?.length) {
            setStage(s.key, { status: 'skipped', done: 0, total: 0 })
            continue
          }
          setStage(s.key, { status: 'running', done: 0, total: rows.length })
          await batchRestoreTable(s.key, rows, (done, total) => {
            setStage(s.key, { status: 'running', done, total })
          })
          setStage(s.key, { status: 'done', done: rows.length, total: rows.length })
        }
        await db.run('COMMIT')
      } catch (err) {
        await db.run('ROLLBACK')
        throw err
      }

      const totalRows = STAGES.reduce((s, st) => s + (data[st.dataKey]?.length || 0), 0)
      const timeSec   = ((Date.now() - startTime) / 1000).toFixed(1)
      setRestoreStats({ totalRows, timeSec })
      setRestorePhase('done')
    } catch (err) {
      setRestoreError(err.message)
      setRestorePhase('error')
    }
  }, [pendingFile])

  const resetRestore = () => {
    setRestorePhase('idle')
    setRestoreStages({})
    setRestoreError(null)
    setPendingFile(null)
    setRestoreStats(null)
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  const exportCSV = useCallback(async (table, filename) => {
    try {
      const rows = await db.query(`SELECT * FROM ${table}`)
      if (!rows.length) { show('डेटा नाही', 'warning'); return }
      const keys = Object.keys(rows[0])
      const csv  = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
      if (IS_NATIVE) {
        const fname = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
        const res   = await Filesystem.writeFile({ path: fname, data: csv, directory: Directory.Cache, encoding: 'utf8' })
        await Share.share({ title: fname, url: res.uri, dialogTitle: 'CSV शेअर करा' })
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        Object.assign(document.createElement('a'), { href: url, download: `${filename}-${new Date().toISOString().split('T')[0]}.csv` }).click()
        URL.revokeObjectURL(url)
      }
      show(`${filename} CSV तयार!`, 'success')
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('abort')) return
      show('एक्सपोर्ट त्रुटी: ' + err.message, 'error')
    }
  }, [show])

  const csvExports = [
    { label: 'ग्राहक यादी',  sub: 'Customers',  table: 'customers',     filename: 'customers' },
    { label: 'डिलिव्हरी',    sub: 'Deliveries', table: 'deliveries',    filename: 'deliveries' },
    { label: 'बिल नोंदी',    sub: 'Bills',      table: 'monthly_bills', filename: 'bills' },
    { label: 'पेमेंट नोंदी', sub: 'Payments',   table: 'payments',      filename: 'payments' },
  ]

  const isRestoring = restorePhase === 'running'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-root">
      <Header title="बॅकअप व एक्सपोर्ट" icon="💾" subtitle="डेटा सुरक्षित ठेवा" />

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Last backup status */}
        <div style={{ background: lastBackup ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${lastBackup ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>{lastBackup ? '✅' : '⚠️'}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: lastBackup ? 'var(--green)' : 'var(--yellow)' }}>
              {lastBackup ? 'बॅकअप अद्ययावत' : 'बॅकअप नाही'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {lastBackup ? `शेवटचा: ${lastBackup}` : 'आजच बॅकअप घ्या'}
            </div>
          </div>
        </div>

        {/* ── Backup card ── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(16,185,129,0.12)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
              📤
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>पूर्ण बॅकअप शेअर करा</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Gmail, Drive, WhatsApp — कुठेही पाठवा</div>
            </div>
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[{ n: '1', t: 'खाली बटण दाबा' }, { n: '2', t: 'शेअर मेनू उघडेल' }, { n: '3', t: 'Gmail निवडा → Send' }].map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(16,185,129,0.2)', color: 'var(--accent)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</div>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.t}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', gap: 8 }} onClick={shareBackup} disabled={exporting}>
            {exporting
              ? <><span className="spinner" /> बॅकअप तयार होत आहे...</>
              : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>बॅकअप शेअर करा</>
            }
          </button>
        </div>

        {/* ── Restore card ── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(59,130,246,0.12)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
              📥
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>डेटा रिस्टोर करा</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>बॅकअप JSON फाईलमधून</div>
            </div>
          </div>

          {/* IDLE — show warning + file picker */}
          {restorePhase === 'idle' && (
            <>
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
                ⚠️ रिस्टोर केल्यास विद्यमान डेटावर बॅकअपचा डेटा येईल. आधी बॅकअप घ्या.
              </div>
              <label className="btn btn-ghost" style={{ width: '100%', cursor: 'pointer', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                बॅकअप फाईल निवडा
                <input type="file" accept=".json" onChange={onFilePicked} style={{ display: 'none' }} />
              </label>
            </>
          )}

          {/* CONFIRM — show file name + start button */}
          {restorePhase === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-all' }}>{pendingFile?.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {pendingFile ? (pendingFile.size / 1024).toFixed(0) + ' KB' : ''}
                  </div>
                </div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--yellow)', lineHeight: 1.6 }}>
                ⚠️ हा डेटा विद्यमान डेटावर लिहिला जाईल. सुरू करण्यापूर्वी खात्री करा.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={resetRestore}>रद्द करा</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={runRestore}>
                  📥 रिस्टोर सुरू करा
                </button>
              </div>
            </div>
          )}

          {/* RUNNING — progress UI */}
          {restorePhase === 'running' && (
            <RestoreProgress stages={restoreStages} />
          )}

          {/* DONE — success summary */}
          {restorePhase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.35)', borderRadius: 14, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>रिस्टोर यशस्वी!</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {restoreStats?.totalRows?.toLocaleString('en-IN')} नोंदी {restoreStats?.timeSec} सेकंदात लोड झाल्या
                </div>
              </div>
              {/* Per-table summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {STAGES.map(s => {
                  const st = restoreStages[s.key] || {}
                  return (
                    <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.icon} {s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: st.status === 'skipped' ? 'var(--text2)' : 'var(--green)' }}>
                        {st.status === 'skipped' ? '—' : `${(st.total || 0).toLocaleString('en-IN')} नोंदी`}
                      </span>
                    </div>
                  )
                })}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={resetRestore}>
                ठीक आहे
              </button>
            </div>
          )}

          {/* ERROR */}
          {restorePhase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>❌</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>रिस्टोर अयशस्वी</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all' }}>{restoreError}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
                  जुना डेटा सुरक्षित आहे — काहीही बदललेले नाही.
                </div>
              </div>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={resetRestore}>पुन्हा प्रयत्न करा</button>
            </div>
          )}
        </div>

        {/* ── CSV exports ── */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          CSV एक्सपोर्ट
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {csvExports.map(item => (
            <div key={item.table} className="list-item" style={{ cursor: 'pointer' }} onClick={() => exportCSV(item.table, item.filename)}>
              <div className="list-item-avatar" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <div className="list-item-body">
                <div className="list-item-title">{item.label}</div>
                <div className="list-item-sub">{item.sub} — CSV शेअर/डाउनलोड</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--text2)', flexShrink: 0 }}><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/></svg>
            </div>
          ))}
        </div>

        {/* Info note */}
        <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--yellow)' }}>💡 टीप:</strong> Gmail मध्ये पाठवलेली बॅकअप फाईल नेहमी तुमच्या Sent मध्ये सेव्ह असते. फोन बदलताना ती फाईल डाउनलोड करून रिस्टोर करा.
        </div>

      </div>
    </div>
  )
}

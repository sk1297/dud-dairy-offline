import React, { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import Header from '../components/Header.jsx'
import { useToast } from '../context/ToastContext.jsx'
import db from '../db/database.js'

const IS_NATIVE = Capacitor.getPlatform() !== 'web'
const LAST_BACKUP_KEY = 'dud_last_backup'

export default function Backup() {
  const { show } = useToast()
  const [exporting,  setExporting]  = useState(false)
  const [restoring,  setRestoring]  = useState(false)
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem(LAST_BACKUP_KEY) || null)

  // ── Build full backup JSON ───────────────────────────────────────────────────
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

  // ── Share via Android share sheet (Gmail, Drive, WhatsApp, etc.) ─────────────
  const shareBackup = useCallback(async () => {
    setExporting(true)
    try {
      const data     = await buildBackupData()
      const json     = JSON.stringify(data, null, 2)
      const filename = `dud-dairy-backup-${new Date().toISOString().split('T')[0]}.json`

      if (IS_NATIVE) {
        // Write file to cache dir, then share its URI
        const result = await Filesystem.writeFile({
          path:      filename,
          data:      json,
          directory: Directory.Cache,
          encoding:  'utf8',
        })
        await Share.share({
          title:      `दूध डेअरी बॅकअप — ${new Date().toLocaleDateString('mr-IN')}`,
          text:       'दूध डेअरी अॅपचा पूर्ण बॅकअप. Gmail किंवा Drive मध्ये सेव्ह करा.',
          url:        result.uri,
          dialogTitle: 'बॅकअप शेअर करा',
        })
      } else {
        // Web fallback — download via anchor
        const blob = new Blob([json], { type: 'application/json' })
        const url  = URL.createObjectURL(blob)
        const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
        a.click()
        URL.revokeObjectURL(url)
      }

      const now = new Date().toLocaleString('mr-IN')
      localStorage.setItem(LAST_BACKUP_KEY, now)
      setLastBackup(now)
      show('बॅकअप शेअर करण्यासाठी तयार!', 'success')
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('abort')) return // user dismissed share sheet
      show('बॅकअप त्रुटी: ' + err.message, 'error')
    } finally {
      setExporting(false)
    }
  }, [show])

  // ── Restore from JSON file ───────────────────────────────────────────────────
  const restoreJSON = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRestoring(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.version) { show('अवैध बॅकअप फाईल', 'error'); return }

      const bulkRestore = async (table, rows) => {
        if (!rows?.length) return
        for (const row of rows) {
          const cols         = Object.keys(row)
          const vals         = cols.map(c => row[c])
          const placeholders = cols.map(() => '?').join(',')
          await db.run(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals)
        }
      }
      await bulkRestore('customers',     data.customers)
      await bulkRestore('deliveries',    data.deliveries)
      await bulkRestore('monthly_bills', data.monthly_bills)
      await bulkRestore('bill_items',    data.bill_items)
      await bulkRestore('payments',      data.payments)
      await bulkRestore('areas',         data.areas)
      await bulkRestore('products',      data.products)
      await bulkRestore('rate_history',  data.rate_history)
      await bulkRestore('settings',      data.settings)

      show('डेटा यशस्वीरित्या पुनर्स्थापित झाला ✓', 'success')
    } catch (err) {
      show('रिस्टोर त्रुटी: ' + err.message, 'error')
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }, [show])

  // ── CSV export (web download) ────────────────────────────────────────────────
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
    { label: 'ग्राहक यादी',   sub: 'Customers',  table: 'customers',      filename: 'customers' },
    { label: 'डिलिव्हरी',     sub: 'Deliveries', table: 'deliveries',     filename: 'deliveries' },
    { label: 'बिल नोंदी',     sub: 'Bills',      table: 'monthly_bills',  filename: 'bills' },
    { label: 'पेमेंट नोंदी',  sub: 'Payments',   table: 'payments',       filename: 'payments' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))' }}>
      <Header title="बॅकअप व एक्सपोर्ट" icon="💾" subtitle="डेटा सुरक्षित ठेवा" />

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Last backup status ── */}
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

        {/* ── Main backup card ── */}
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

          {/* How it works */}
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { n: '1', t: 'खाली बटण दाबा' },
              { n: '2', t: 'शेअर मेनू उघडेल' },
              { n: '3', t: 'Gmail निवडा → Send' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(16,185,129,0.2)', color: 'var(--accent)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</div>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.t}</span>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', gap: 8 }} onClick={shareBackup} disabled={exporting}>
            {exporting ? <><span className="spinner" /> बॅकअप तयार होत आहे...</> : <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              बॅकअप शेअर करा
            </>}
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

          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
            ⚠️ रिस्टोर केल्यास विद्यमान डेटावर बॅकअपचा डेटा येईल. आधी बॅकअप घ्या.
          </div>

          <label className={`btn btn-ghost${restoring ? ' disabled' : ''}`} style={{ width: '100%', cursor: 'pointer', gap: 8 }}>
            {restoring ? <><span className="spinner" /> रिस्टोर होत आहे...</> : <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              बॅकअप फाईल निवडा
            </>}
            <input type="file" accept=".json" onChange={restoreJSON} style={{ display: 'none' }} disabled={restoring} />
          </label>
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

        {/* ── Info note ── */}
        <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--yellow)' }}>💡 टीप:</strong> Gmail मध्ये पाठवलेली बॅकअप फाईल नेहमी तुमच्या Sent मध्ये सेव्ह असते. फोन बदलताना ती फाईल डाउनलोड करून रिस्टोर करा.
        </div>

      </div>
    </div>
  )
}

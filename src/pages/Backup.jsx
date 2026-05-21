import React, { useState, useCallback } from 'react'
import Header from '../components/Header.jsx'
import { useToast } from '../context/ToastContext.jsx'
import db from '../db/database.js'

export default function Backup() {
  const { show } = useToast()
  const [exporting, setExporting] = useState(false)
  const [lastBackup, setLastBackup] = useState(null)

  const exportJSON = useCallback(async () => {
    setExporting(true)
    try {
      const [customers, deliveries, bills, billItems, payments, areas, rateHistory, settings] = await Promise.all([
        db.customers.toArray(),
        db.deliveries.toArray(),
        db.monthly_bills.toArray(),
        db.bill_items.toArray(),
        db.payments.toArray(),
        db.areas.toArray(),
        db.rate_history.toArray(),
        db.settings.toArray(),
      ])

      const data = {
        exported_at: new Date().toISOString(),
        version: '1.0',
        customers, deliveries, monthly_bills: bills, bill_items: billItems,
        payments, areas, rate_history: rateHistory, settings
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `dud-dairy-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      const now = new Date().toLocaleString('mr-IN')
      setLastBackup(now)
      show('बॅकअप यशस्वीरित्या डाउनलोड झाला', 'success')
    } catch (err) {
      show('बॅकअप करण्यात त्रुटी: ' + err.message, 'error')
    } finally {
      setExporting(false)
    }
  }, [show])

  const exportCSV = useCallback(async (table, filename) => {
    try {
      const rows = await db[table].toArray()
      if (rows.length === 0) { show('डेटा नाही', 'warning'); return }
      const keys = Object.keys(rows[0])
      const csv  = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      show(`${filename} CSV डाउनलोड झाला`, 'success')
    } catch (err) {
      show('एक्सपोर्ट त्रुटी', 'error')
    }
  }, [show])

  const restoreJSON = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.version) { show('अवैध बॅकअप फाईल', 'error'); return }

      if (data.customers?.length)     await db.customers.bulkPut(data.customers)
      if (data.deliveries?.length)    await db.deliveries.bulkPut(data.deliveries)
      if (data.monthly_bills?.length) await db.monthly_bills.bulkPut(data.monthly_bills)
      if (data.bill_items?.length)    await db.bill_items.bulkPut(data.bill_items)
      if (data.payments?.length)      await db.payments.bulkPut(data.payments)
      if (data.areas?.length)         await db.areas.bulkPut(data.areas)
      if (data.rate_history?.length)  await db.rate_history.bulkPut(data.rate_history)
      if (data.settings?.length)      await db.settings.bulkPut(data.settings)

      show('डेटा यशस्वीरित्या पुनर्स्थापित झाला', 'success')
    } catch (err) {
      show('रिस्टोर त्रुटी: ' + err.message, 'error')
    }
    e.target.value = ''
  }, [show])

  const csvExports = [
    { label: 'ग्राहक यादी', sub: 'Customers List', table: 'customers', filename: 'customers' },
    { label: 'डिलिव्हरी नोंदी', sub: 'Delivery Records', table: 'deliveries', filename: 'deliveries' },
    { label: 'बिल नोंदी', sub: 'Bills', table: 'monthly_bills', filename: 'bills' },
    { label: 'पेमेंट नोंदी', sub: 'Payments', table: 'payments', filename: 'payments' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>
      <Header title="बॅकअप व एक्सपोर्ट" icon="💾" subtitle="डेटा सुरक्षित ठेवा व एक्सपोर्ट करा" />
      <div style={{ padding: 16 }}>

        {/* Full Backup */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.12)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>पूर्ण बॅकअप (JSON)</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>सर्व डेटा एका फाईलमध्ये</div>
            </div>
          </div>
          {lastBackup && (
            <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>
              शेवटचा बॅकअप: {lastBackup}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={exportJSON} disabled={exporting}>
            {exporting ? <span className="spinner" /> : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/></svg>
                बॅकअप डाउनलोड करा
              </>
            )}
          </button>
        </div>

        {/* Restore */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.12)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 7 12 3 8 7"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M20 21H4a2 2 0 01-2-2V5"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>डेटा रिस्टोर करा</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>JSON बॅकअप फाईलमधून</div>
            </div>
          </div>
          <label className="btn btn-ghost" style={{ width: '100%', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            बॅकअप फाईल निवडा
            <input type="file" accept=".json" onChange={restoreJSON} style={{ display: 'none' }} />
          </label>
        </div>

        {/* CSV Exports */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>
          CSV एक्सपोर्ट
        </div>
        {csvExports.map(item => (
          <div key={item.table} className="list-item" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => exportCSV(item.table, item.filename)}>
            <div className="list-item-avatar" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div className="list-item-body">
              <div className="list-item-title">{item.label}</div>
              <div className="list-item-sub">{item.sub} — CSV</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: 'var(--text2)' }}><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/></svg>
          </div>
        ))}

        <div style={{ marginTop: 20, padding: 14, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--yellow)' }}>सूचना:</strong> नियमित बॅकअप घेत राहा. फोन बदलताना किंवा अॅप पुन्हा इन्स्टॉल करताना बॅकअप फाईलमधून डेटा परत आणता येतो.
          </div>
        </div>

      </div>
    </div>
  )
}

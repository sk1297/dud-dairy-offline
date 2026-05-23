import React, { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header.jsx'
import TextInput from '../components/TextInput.jsx'
import { useToast } from '../context/ToastContext.jsx'
import db from '../db/database.js'
import { PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'

export default function Settings() {
  const { show } = useToast()

  // ── State ────────────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState({
    dairy_name: '', owner_name: '', mobile: '', address: '', default_rate: '',
  })
  const [milkProducts,  setMilkProducts]  = useState([])
  const [rateHistory,   setRateHistory]   = useState([])
  const [areas,         setAreas]         = useState([])
  const [newRate,       setNewRate]       = useState('')
  const [rateNotes,     setRateNotes]     = useState('')
  const [rateProductId, setRateProductId] = useState(null)
  const [applyToAll,    setApplyToAll]    = useState(true)   // bulk apply toggle
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingRate,    setSavingRate]    = useState(false)
  const [affectedCount, setAffectedCount] = useState(0)      // how many customers will be updated

  // Area management
  const [newAreaName,   setNewAreaName]   = useState('')
  const [editAreaId,    setEditAreaId]    = useState(null)
  const [editAreaName,  setEditAreaName]  = useState('')

  const load = useCallback(async () => {
    const [rows, hist, prods, areaList] = await Promise.all([
      db.query('SELECT key, value FROM settings'),
      db.query('SELECT * FROM rate_history ORDER BY effective_date DESC'),
      db.query("SELECT * FROM products WHERE type IN ('milk_buffalo','milk_cow')"),
      db.query('SELECT * FROM areas ORDER BY sequence'),
    ])
    const map = {}
    for (const r of rows) map[r.key] = r.value
    setSettings(prev => ({ ...prev, ...map }))
    setRateHistory(hist)
    setMilkProducts(prods)
    setAreas(areaList)
    if (!rateProductId && prods.length > 0) setRateProductId(prods[0].id)
  }, [rateProductId])

  useEffect(() => { load() }, [load])

  // Count affected customers whenever product selection changes
  useEffect(() => {
    if (!rateProductId) return
    db.first('SELECT COUNT(*) as cnt FROM customers WHERE product_id = ? AND status != ?', [rateProductId, 'stopped'])
      .then(r => setAffectedCount(r?.cnt || 0))
  }, [rateProductId])

  // ── Save setting helper ───────────────────────────────────────────────────────
  const saveSetting = async (key, value) => {
    const existing = await db.first('SELECT id FROM settings WHERE key = ? LIMIT 1', [key])
    if (existing) await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key])
    else           await db.insert('INSERT INTO settings (key, value) VALUES (?,?)', [key, value])
  }

  // ── Save dairy profile ────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      await Promise.all(Object.entries(settings).map(([k, v]) => saveSetting(k, v)))
      show('डेअरी माहिती जतन झाली ✓', 'success')
    } catch { show('जतन करण्यात त्रुटी', 'error') }
    finally { setSavingProfile(false) }
  }

  // ── Apply new rate ────────────────────────────────────────────────────────────
  const handleAddRate = async () => {
    const rate = parseFloat(newRate)
    if (!rate || rate <= 0) { show('योग्य दर टाका', 'error'); return }
    if (!rateProductId)     { show('उत्पादन निवडा', 'error'); return }
    setSavingRate(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await db.insert('INSERT INTO rate_history (product_id, rate, effective_date, notes) VALUES (?,?,?,?)',
        [rateProductId, rate, today, rateNotes])
      await db.run('UPDATE products SET default_rate = ? WHERE id = ?', [rate, rateProductId])

      // Update global default_rate if buffalo
      const bufProd = milkProducts.find(p => p.type === 'milk_buffalo')
      if (!bufProd || rateProductId === bufProd.id) {
        await saveSetting('default_rate', String(rate))
        setSettings(prev => ({ ...prev, default_rate: String(rate) }))
      }

      // ── Bulk apply to all customers ───────────────────────────────────────────
      if (applyToAll) {
        await db.run('UPDATE customers SET rate = ? WHERE product_id = ? AND status != ?',
          [rate, rateProductId, 'stopped'])
      }

      const prod = milkProducts.find(p => p.id === rateProductId)
      const msg = applyToAll
        ? `${prod?.name} — ₹${rate}/L लागू झाला (${affectedCount} ग्राहक अपडेट)`
        : `${prod?.name} — नवीन दर ₹${rate}/L नोंद झाला`
      show(msg, 'success')
      setNewRate(''); setRateNotes('')
      await load()
    } catch (err) { show('त्रुटी: ' + err.message, 'error') }
    finally { setSavingRate(false) }
  }

  // ── Area management ───────────────────────────────────────────────────────────
  const handleAddArea = async () => {
    const name = newAreaName.trim()
    if (!name) { show('भागाचे नाव टाका', 'error'); return }
    const maxSeq = areas.reduce((m, a) => Math.max(m, a.sequence || 0), 0)
    await db.insert('INSERT INTO areas (name, sequence) VALUES (?,?)', [name, maxSeq + 1])
    setNewAreaName('')
    await load()
    show('भाग जोडला ✓', 'success')
  }

  const handleSaveArea = async (id) => {
    const name = editAreaName.trim()
    if (!name) { show('नाव टाका', 'error'); return }
    await db.run('UPDATE areas SET name = ? WHERE id = ?', [name, id])
    setEditAreaId(null)
    await load()
    show('भाग अपडेट झाला ✓', 'success')
  }

  const handleDeleteArea = async (id) => {
    const used = await db.first('SELECT COUNT(*) as cnt FROM customers WHERE area_id = ?', [id])
    if (used?.cnt > 0) { show(`${used.cnt} ग्राहक या भागात आहेत — आधी त्यांचा भाग बदला`, 'warning'); return }
    await db.run('DELETE FROM areas WHERE id = ?', [id])
    await load()
    show('भाग हटवला', 'success')
  }

  // ── Current rates for display ─────────────────────────────────────────────────
  const currentRates = milkProducts.map(p => ({
    ...p,
    currentRate: rateHistory.filter(r => r.product_id === p.id)[0]?.rate ?? p.default_rate,
  }))

  return (
    <div className="page-root">
      <Header title="सेटिंग्ज" icon="⚙️" subtitle="डेअरी व्यवस्थापन — सर्व सेटिंग्ज" />

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ══ SECTION 1 — डेअरी ओळख ══════════════════════════════════════════ */}
        <SectionCard icon="🏪" title="डेअरी ओळख">

          {/* Preview card */}
          <div style={{ margin: '0 0 14px', background: 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))', border: '1.5px solid rgba(16,185,129,0.28)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🥛</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{settings.dairy_name || 'डेअरीचे नाव'}</div>
              <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>{settings.owner_name || 'मालकाचे नाव'}</div>
              {settings.mobile && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>📱 {settings.mobile}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="डेअरीचे नाव"><TextInput className="form-input" value={settings.dairy_name} onChange={e => setSettings(p => ({ ...p, dairy_name: e.target.value }))} placeholder="उदा. श्री गणेश दूध डेअरी" /></Field>
            <Field label="मालकाचे नाव"><TextInput className="form-input" value={settings.owner_name} onChange={e => setSettings(p => ({ ...p, owner_name: e.target.value }))} placeholder="मालकाचे पूर्ण नाव" /></Field>
            <Field label="मोबाईल नंबर"><input className="form-input" type="tel" inputMode="numeric" maxLength={10} value={settings.mobile} onChange={e => setSettings(p => ({ ...p, mobile: e.target.value }))} placeholder="10 अंकी मोबाईल नंबर" /></Field>
            <Field label="पत्ता"><textarea className="form-input" rows={2} value={settings.address} onChange={e => setSettings(p => ({ ...p, address: e.target.value }))} placeholder="डेअरीचा पूर्ण पत्ता" style={{ resize: 'none' }} /></Field>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? <span className="spinner" /> : '💾 डेअरी माहिती जतन करा'}
          </button>
        </SectionCard>

        {/* ══ SECTION 2 — दर व्यवस्थापन ══════════════════════════════════════ */}
        <SectionCard icon="💰" title="दर व्यवस्थापन">

          {/* Current rate display */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {currentRates.map(prod => {
              const color   = PRODUCT_TYPE_COLOR[prod.type]
              const isActive = rateProductId === prod.id
              return (
                <div key={prod.id} onClick={() => setRateProductId(prod.id)} style={{ background: isActive ? `${color}18` : 'var(--surface2)', border: `${isActive ? 2 : 1}px solid ${isActive ? color + '66' : 'var(--border)'}`, borderRadius: 14, padding: '14px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>{prod.type === 'milk_buffalo' ? '🐃' : '🐄'} <span style={{ fontWeight: 700, color }}>{prod.name}</span></div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: isActive ? color : 'var(--text)', lineHeight: 1 }}>₹{prod.currentRate}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>/लिटर · सध्याचा दर</div>
                  {isActive && <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 6 }}>✓ निवडलेले</div>}
                </div>
              )
            })}
          </div>

          {/* New rate form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={`नवीन दर (₹/लिटर) — ${milkProducts.find(p => p.id === rateProductId)?.name || ''}`}>
              <input className="form-input" type="number" inputMode="decimal" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="उदा. 70" style={{ fontSize: 20, fontWeight: 800 }} />
            </Field>
            <Field label="कारण (ऐच्छिक)">
              <TextInput className="form-input" value={rateNotes} onChange={e => setRateNotes(e.target.value)} placeholder="उदा. हंगामी बदल, मागणी वाढ..." />
            </Field>

            {/* Bulk apply toggle — KEY FEATURE */}
            <div
              onClick={() => setApplyToAll(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: applyToAll ? 'rgba(16,185,129,0.08)' : 'var(--surface2)', border: `1.5px solid ${applyToAll ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {/* Toggle switch */}
              <div style={{ width: 44, height: 26, borderRadius: 13, background: applyToAll ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 3, left: applyToAll ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: applyToAll ? 'var(--accent)' : 'var(--text)' }}>सर्व ग्राहकांचा दर बदला</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {applyToAll
                    ? `✓ ${affectedCount} ग्राहकांचा दर आपोआप अपडेट होईल`
                    : 'फक्त नवीन ग्राहकांसाठी डिफॉल्ट दर बदलेल'}
                </div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleAddRate} disabled={savingRate || !newRate}>
              {savingRate ? <span className="spinner" /> : `🔄 ${milkProducts.find(p => p.id === rateProductId)?.name || 'दूध'} — नवीन दर लागू करा`}
            </button>
          </div>

          {/* Rate history — compact */}
          {milkProducts.map(prod => {
            const history = rateHistory.filter(r => r.product_id === prod.id).slice(0, 5)
            if (!history.length) return null
            const color = PRODUCT_TYPE_COLOR[prod.type]
            return (
              <div key={prod.id} style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  {prod.type === 'milk_buffalo' ? '🐃' : '🐄'} {prod.name} — दर इतिहास
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {history.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: i === 0 ? `${color}0d` : 'var(--surface2)', border: `1px solid ${i === 0 ? color + '30' : 'var(--border)'}`, borderRadius: 10, padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? color : 'var(--border)', flexShrink: 0 }} />
                        <div>
                          <span style={{ fontSize: 15, fontWeight: 800, color: i === 0 ? color : 'var(--text)' }}>₹{r.rate}</span>
                          <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 4 }}>/L</span>
                        </div>
                        {i === 0 && <span className="badge badge-green" style={{ fontSize: 9 }}>सध्याचा</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.effective_date}</div>
                        {r.notes && <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{r.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </SectionCard>

        {/* ══ SECTION 3 — भाग / क्षेत्र ════════════════════════════════════════ */}
        <SectionCard icon="🗺️" title="भाग / क्षेत्र व्यवस्थापन">

          {/* Existing areas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {areas.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '12px 0' }}>कोणताही भाग नाही</div>
            )}
            {areas.map(area => (
              <div key={area.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px', border: '1px solid var(--border)' }}>
                {editAreaId === area.id ? (
                  <>
                    <input
                      className="form-input"
                      style={{ flex: 1, marginBottom: 0, padding: '6px 10px', fontSize: 13 }}
                      value={editAreaName}
                      onChange={e => setEditAreaName(e.target.value)}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveArea(area.id)}>✓</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditAreaId(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 14 }}>📍</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{area.name}</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditAreaId(area.id); setEditAreaName(area.name) }}>✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => handleDeleteArea(area.id)}>🗑️</button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new area */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              style={{ flex: 1, marginBottom: 0 }}
              value={newAreaName}
              onChange={e => setNewAreaName(e.target.value)}
              placeholder="नवीन भागाचे नाव टाका"
              onKeyDown={e => e.key === 'Enter' && handleAddArea()}
            />
            <button className="btn btn-primary" style={{ flexShrink: 0, padding: '0 16px' }} onClick={handleAddArea}>
              + जोडा
            </button>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function SectionCard({ icon, title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{title}</span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

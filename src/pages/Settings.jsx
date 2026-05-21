import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Header from '../components/Header.jsx'
import { useToast } from '../context/ToastContext.jsx'
import db from '../db/database.js'
import { PRODUCT_TYPE_COLOR, PRODUCT_TYPE_TINT } from '../services/productService.js'

export default function Settings() {
  const { show } = useToast()
  const location = useLocation()
  const [settings, setSettings] = useState({
    dairy_name: '',
    owner_name: '',
    mobile: '',
    address: '',
    default_rate: '',
    currency: '₹',
  })
  const [milkProducts, setMilkProducts] = useState([])   // buffalo + cow products
  const [rateHistory,  setRateHistory]  = useState([])   // all rate history rows
  const [newRate,      setNewRate]      = useState('')
  const [rateNotes,    setRateNotes]    = useState('')
  const [rateProductId, setRateProductId] = useState(null) // which product the add-form targets
  const [saving,       setSaving]       = useState(false)
  const [tab,          setTab]          = useState(() => new URLSearchParams(location.search).get('tab') || 'profile')

  const load = useCallback(async () => {
    const rows = await db.query('SELECT key, value FROM settings')
    const map  = {}
    for (const r of rows) map[r.key] = r.value
    setSettings(prev => ({ ...prev, ...map }))
    const hist  = await db.query('SELECT * FROM rate_history ORDER BY effective_date DESC')
    setRateHistory(hist)
    const prods = await db.query("SELECT * FROM products WHERE type IN ('milk_buffalo','milk_cow')")
    setMilkProducts(prods)
    if (!rateProductId && prods.length > 0) setRateProductId(prods[0].id)
  }, [rateProductId])

  useEffect(() => { load() }, [load])

  const saveSetting = async (key, value) => {
    const existing = await db.first('SELECT id FROM settings WHERE key = ? LIMIT 1', [key])
    if (existing) await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key])
    else           await db.insert('INSERT INTO settings (key, value) VALUES (?,?)', [key, value])
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await Promise.all(Object.entries(settings).map(([k, v]) => saveSetting(k, v)))
      show('सेटिंग्ज जतन केल्या', 'success')
    } catch (err) {
      show('जतन करण्यात त्रुटी', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddRate = async () => {
    const rate = parseFloat(newRate)
    if (!rate || rate <= 0)  { show('योग्य दर टाका', 'error'); return }
    if (!rateProductId)      { show('उत्पादन निवडा', 'error'); return }
    const today = new Date().toISOString().split('T')[0]
    await db.insert('INSERT INTO rate_history (product_id, rate, effective_date, notes) VALUES (?,?,?,?)', [rateProductId, rate, today, rateNotes])
    // Also update product's default_rate
    await db.run('UPDATE products SET default_rate = ? WHERE id = ?', [rate, rateProductId])
    // Update global default_rate setting to buffalo rate (primary product)
    const bufProd = milkProducts.find(p => p.type === 'milk_buffalo')
    if (!bufProd || rateProductId === bufProd.id) {
      await saveSetting('default_rate', String(rate))
      setSettings(prev => ({ ...prev, default_rate: String(rate) }))
    }
    setNewRate(''); setRateNotes('')
    await load()
    const prod = milkProducts.find(p => p.id === rateProductId)
    show(`${prod?.name || 'दूध'} — नवीन दर ₹${rate}/लिटर लागू केला`, 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>
      <Header
        title="सेटिंग्ज"
        icon="⚙️"
        subtitle={tab === 'profile' ? 'डेअरी माहिती व ओळख' : 'दर व्यवस्थापन — म्हैस व गाय दूध'}
      />

      <div style={{ padding: '12px 16px 0' }}>
        <div className="segment">
          <button className={`segment-btn${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>
            डेअरी माहिती
          </button>
          <button className={`segment-btn${tab === 'rates' ? ' active' : ''}`} onClick={() => setTab('rates')}>
            दर व्यवस्थापन
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Dairy identity preview card ── */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0.04) 100%)',
              border: '1.5px solid rgba(16,185,129,0.3)',
              borderRadius: 18, padding: '18px 18px 16px',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              {/* Dairy avatar */}
              <div style={{
                width: 58, height: 58, borderRadius: 16, flexShrink: 0,
                background: 'rgba(16,185,129,0.15)',
                border: '2px solid rgba(16,185,129,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26,
              }}>🥛</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {settings.dairy_name || 'डेअरीचे नाव'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>
                  {settings.owner_name || 'मालकाचे नाव'}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
                  {settings.mobile && (
                    <span style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      📱 {settings.mobile}
                    </span>
                  )}
                  {settings.address && (
                    <span style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📍 {settings.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Edit fields ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>

              {/* Section: डेअरी */}
              <div style={{ padding: '12px 16px 4px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🏪 डेअरी ओळख
                </div>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">डेअरीचे नाव</label>
                  <input
                    className="form-input"
                    value={settings.dairy_name}
                    onChange={e => setSettings(p => ({ ...p, dairy_name: e.target.value }))}
                    placeholder="उदा. श्री गणेश दूध डेअरी"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">पत्ता</label>
                  <textarea
                    className="form-input" rows={2}
                    value={settings.address}
                    onChange={e => setSettings(p => ({ ...p, address: e.target.value }))}
                    placeholder="डेअरीचा पूर्ण पत्ता"
                    style={{ resize: 'none' }}
                  />
                </div>
              </div>

              {/* Section: मालक */}
              <div style={{ padding: '12px 16px 4px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  👤 मालक संपर्क
                </div>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">मालकाचे नाव</label>
                  <input
                    className="form-input"
                    value={settings.owner_name}
                    onChange={e => setSettings(p => ({ ...p, owner_name: e.target.value }))}
                    placeholder="मालकाचे पूर्ण नाव"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">मोबाईल नंबर</label>
                  <input
                    className="form-input"
                    type="tel" inputMode="numeric" maxLength={10}
                    value={settings.mobile}
                    onChange={e => setSettings(p => ({ ...p, mobile: e.target.value }))}
                    placeholder="10 अंकी मोबाईल नंबर"
                  />
                </div>
              </div>
            </div>

            {/* ── Info note about rates ── */}
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 12, padding: '10px 14px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                दर बदल करण्यासाठी <strong style={{ color: 'var(--yellow)' }}>दर व्यवस्थापन</strong> टॅब वापरा — तिथे म्हैस व गाय दूधाचे दर वेगळे ठेवता येतात.
              </span>
            </div>

            {/* ── Save button ── */}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveProfile} disabled={saving}>
              {saving ? <span className="spinner" /> : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  बदल जतन करा
                </>
              )}
            </button>
          </div>
        )}

        {tab === 'rates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Two product current-rate cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {milkProducts.map(prod => {
                const history  = rateHistory.filter(r => r.product_id === prod.id)
                const current  = history[0]
                const prev     = history[1]
                const delta    = current && prev ? (current.rate - prev.rate) : null
                const color    = PRODUCT_TYPE_COLOR[prod.type]
                const tint     = PRODUCT_TYPE_TINT[prod.type]
                const isActive = rateProductId === prod.id
                return (
                  <div
                    key={prod.id}
                    onClick={() => setRateProductId(prod.id)}
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${color}28 0%, ${color}0a 100%)`
                        : 'var(--surface)',
                      border: `${isActive ? '2px' : '1px'} solid ${isActive ? color + '66' : 'var(--border)'}`,
                      borderRadius: 16, padding: '14px 16px', cursor: 'pointer',
                      transition: 'all 0.18s',
                      boxShadow: isActive ? `0 0 0 3px ${color}18` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>{prod.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{prod.name}</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: isActive ? color : 'var(--text)', lineHeight: 1 }}>
                      ₹{current?.rate ?? prod.default_rate}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>/लिटर</div>
                    {delta !== null && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        marginTop: 6, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: delta > 0 ? 'rgba(16,185,129,0.12)' : delta < 0 ? 'rgba(239,68,68,0.12)' : 'var(--surface2)',
                        color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text2)',
                      }}>
                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Add new rate form ── */}
            {(() => {
              const activeProd = milkProducts.find(p => p.id === rateProductId)
              const color = activeProd ? PRODUCT_TYPE_COLOR[activeProd.type] : 'var(--accent)'
              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{activeProd?.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {activeProd?.name || 'दूध'} — नवीन दर
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>वरील कार्ड दाबून उत्पादन निवडा</div>
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">नवीन दर (₹/लिटर) *</label>
                      <input
                        className="form-input"
                        type="number" inputMode="decimal"
                        value={newRate} onChange={e => setNewRate(e.target.value)}
                        placeholder="उदा. 65"
                        style={{ fontSize: 22, fontWeight: 800, color }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">कारण / नोंद (ऐच्छिक)</label>
                      <input className="form-input" value={rateNotes} onChange={e => setRateNotes(e.target.value)} placeholder="उदा. हंगामी बदल, मागणी वाढ..." />
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: 2, background: color, borderColor: color }} onClick={handleAddRate}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      {activeProd?.name} — नवीन दर लागू करा
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* ── Per-product history timeline ── */}
            {milkProducts.map(prod => {
              const history = rateHistory.filter(r => r.product_id === prod.id)
              if (history.length === 0) return null
              const color = PRODUCT_TYPE_COLOR[prod.type]
              const tint  = PRODUCT_TYPE_TINT[prod.type]
              return (
                <div key={prod.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 15 }}>{prod.type === 'milk_buffalo' ? '🐃' : '🐄'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {prod.name} — दर इतिहास
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 2 }}>({history.length})</span>
                  </div>

                  <div style={{ position: 'relative' }}>
                    {/* Vertical timeline spine */}
                    <div style={{ position: 'absolute', left: 19, top: 14, bottom: 14, width: 2, background: `${color}33`, zIndex: 0 }} />

                    {history.map((r, i) => {
                      const prev      = history[i + 1]
                      const delta     = prev ? (r.rate - prev.rate) : null
                      const isCurrent = i === 0
                      return (
                        <div key={r.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '8px 0', position: 'relative', zIndex: 1 }}>
                          {/* Dot */}
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                            background: isCurrent ? color : 'var(--surface2)',
                            border: `2px solid ${isCurrent ? color : 'var(--border)'}`,
                            boxShadow: isCurrent ? `0 0 0 4px ${color}25` : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isCurrent && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                          </div>

                          {/* Card */}
                          <div style={{
                            flex: 1,
                            background: isCurrent ? `${color}0d` : 'var(--surface)',
                            border: `1px solid ${isCurrent ? color + '33' : 'var(--border)'}`,
                            borderRadius: 12, padding: '10px 14px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                <span style={{ fontSize: 22, fontWeight: 900, color: isCurrent ? color : 'var(--text)' }}>₹{r.rate}</span>
                                <span style={{ fontSize: 12, color: 'var(--text2)' }}>/लिटर</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {delta !== null && (
                                  <span style={{
                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                    color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text2)',
                                    background: delta > 0 ? 'rgba(16,185,129,0.12)' : delta < 0 ? 'rgba(239,68,68,0.12)' : 'var(--surface2)',
                                  }}>
                                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}
                                  </span>
                                )}
                                {isCurrent && <span className="badge badge-green">सध्याचा</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5, display: 'flex', gap: 8 }}>
                              <span>📅 {r.effective_date}</span>
                              {r.notes && <span>· {r.notes}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {rateHistory.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                </div>
                <div className="empty-state-title">दर इतिहास नाही</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

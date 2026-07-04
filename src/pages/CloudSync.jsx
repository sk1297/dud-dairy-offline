import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import Modal from '../components/Modal.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { getErrorMsg } from '../utils.js'
import { cloudSignIn, cloudSignUp, cloudSignOut, getCloudUser } from '../sync/cloudAuth.js'
import { syncNow, getLastSync, getDairyCode, getCloudBackupInfo, needsRestore, restoreFromCloud } from '../sync/syncService.js'

// ── Cloud Sync (owner) ────────────────────────────────────────────────────────
// Owner signs into Supabase and pushes local data to the cloud so their
// customers can view their own records in the customer app.
export default function CloudSync() {
  const { show } = useToast()
  const navigate = useNavigate()
  const [user, setUser]         = useState(null)
  const [checking, setChecking] = useState(true)
  const [mode, setMode]         = useState('signin')   // signin | signup
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [busy, setBusy]         = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [dairyCode, setDairyCode] = useState(null)
  const [backupInfo, setBackupInfo] = useState(null)
  const [restoreReady, setRestoreReady] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const refresh = useCallback(async () => {
    const u = await getCloudUser()
    setUser(u)
    setLastSync(await getLastSync())
    setDairyCode(await getDairyCode())
    if (u) {
      try { setBackupInfo(await getCloudBackupInfo()) } catch { setBackupInfo(null) }
      try { setRestoreReady(await needsRestore()) } catch { setRestoreReady(false) }
    }
    setChecking(false)
  }, [])

  const handleRestore = async () => {
    setConfirmRestore(false)
    setRestoring(true)
    try {
      await restoreFromCloud()
      show('डेटा पुनर्संचयित झाला ✅', 'success')
      setTimeout(() => window.location.reload(), 800)
    } catch (e) { show(getErrorMsg(e), 'error'); setRestoring(false) }
  }

  useEffect(() => { refresh() }, [refresh])

  const handleAuth = async () => {
    if (!email.trim() || !password) { show('ईमेल व पासवर्ड टाका', 'error'); return }
    setBusy(true)
    try {
      if (mode === 'signup') {
        await cloudSignUp(email.trim(), password, setupCode.trim())
        show('खाते तयार झाले', 'success')
      } else {
        await cloudSignIn(email.trim(), password)
        show('साइन इन झाले', 'success')
      }
      setPassword('')
      await refresh()
    } catch (e) { show(getErrorMsg(e), 'error') }
    finally { setBusy(false) }
  }

  const handleSync = async () => {
    setBusy(true)
    try {
      const res = await syncNow()
      const c = res.counts
      show(`सिंक झाले • ग्राहक ${c.customers}, डिलिव्हरी ${c.deliveries}, बिल ${c.bills}`, 'success')
      setLastSync(res.at)
      setDairyCode(await getDairyCode())
    } catch (e) { show(getErrorMsg(e), 'error') }
    finally { setBusy(false) }
  }

  const handleSignOut = async () => {
    await cloudSignOut()
    await refresh()
    show('साइन आउट झाले', 'info')
  }

  const card = {
    padding: 16, background: 'var(--surface)', borderRadius: 14,
    border: '1px solid var(--border)', marginBottom: 16,
  }
  const input = {
    width: '100%', padding: '12px 14px', fontSize: 15, marginBottom: 12,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)',
  }

  if (checking) {
    return <div className="page-root"><Header title="क्लाउड सिंक" onBack={() => navigate(-1)} /><div style={{ padding: 24, color: 'var(--text2)' }}>लोड होत आहे…</div></div>
  }

  return (
    <div className="page-root">
      <Header title="क्लाउड सिंक" onBack={() => navigate(-1)} />
      <div style={{ padding: 16 }}>

        {!user ? (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              {mode === 'signup' ? 'नवीन क्लाउड खाते' : 'क्लाउडमध्ये साइन इन'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
              ग्राहकांना त्यांचा डेटा दाखवण्यासाठी क्लाउडमध्ये साइन इन करा
            </div>
            <input style={input} type="email" placeholder="ईमेल" value={email}
              onChange={e => setEmail(e.target.value)} autoCapitalize="none" />
            <input style={input} type="password" placeholder="पासवर्ड" value={password}
              onChange={e => setPassword(e.target.value)} />
            {mode === 'signup' && (
              <input style={input} type="text" placeholder="सेटअप कोड" value={setupCode}
                onChange={e => setSetupCode(e.target.value)} autoCapitalize="none" />
            )}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={handleAuth}>
              {busy ? '...' : (mode === 'signup' ? 'खाते तयार करा' : 'साइन इन करा')}
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }}
              onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'आधीच खाते आहे? साइन इन करा' : 'नवीन खाते तयार करा'}
            </button>
          </div>
        ) : (
          <>
            {/* Restore prompt — this phone is empty but cloud has a backup */}
            {restoreReady && (
              <div style={{ ...card, borderColor: 'rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.10)' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>☁️ बॅकअप सापडला!</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.7 }}>
                  या फोनवर डेटा नाही, पण क्लाउडवर तुमचा बॅकअप आहे
                  {backupInfo?.customer_count ? ` (${backupInfo.customer_count} ग्राहक)` : ''}.
                  खालील बटण दाबून तुमचा सर्व डेटा परत आणा.
                </div>
                <button className="btn btn-primary" style={{ width: '100%', background: '#f59e0b', borderColor: '#f59e0b' }}
                  disabled={restoring} onClick={() => setConfirmRestore(true)}>
                  {restoring ? 'पुनर्संचयित होत आहे…' : '⬇️ माझा डेटा परत आणा'}
                </button>
              </div>
            )}

            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>साइन इन:</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{user.email}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                शेवटचे सिंक: {lastSync ? new Date(lastSync).toLocaleString('en-IN') : 'अजून नाही'}
              </div>
            </div>

            {/* Backup status */}
            <div style={{ ...card, borderColor: 'rgba(16,185,129,0.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{backupInfo ? '✅' : '☁️'}</span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {backupInfo ? 'तुमचा डेटा क्लाउडवर सुरक्षित आहे' : 'बॅकअप अजून नाही'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
                {backupInfo
                  ? `शेवटचा बॅकअप: ${new Date(backupInfo.updated_at).toLocaleString('en-IN')} · ${backupInfo.customer_count} ग्राहक. फोन बदलल्यास/पुन्हा install केल्यास डेटा परत मिळेल.`
                  : 'एकदा सिंक केल्यावर तुमचा सर्व डेटा आपोआप क्लाउडवर बॅकअप होईल.'}
              </div>
              {backupInfo && !restoreReady && (
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12, fontSize: 13 }} disabled={restoring} onClick={() => setConfirmRestore(true)}>
                  ⬇️ क्लाउडवरून डेटा पुनर्संचयित करा
                </button>
              )}
            </div>

            {dairyCode && (
              <div style={{ ...card, borderColor: 'rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.08)' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>तुमचा डेअरी कोड (ग्राहकांना सांगा):</div>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 3, color: '#3b82f6', fontFamily: 'monospace' }}>{dairyCode}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, lineHeight: 1.6 }}>
                  ग्राहक अ‍ॅपमध्ये लॉगिनसाठी ग्राहकाला हा कोड + त्यांचा मोबाईल + पासवर्ड लागेल.
                </div>
              </div>
            )}

            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>डेटा क्लाउडवर पाठवा</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
                सर्व ग्राहक, डिलिव्हरी, बिल व पेमेंट क्लाउडवर सिंक करा
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={handleSync}>
                {busy ? 'सिंक होत आहे…' : 'आता सिंक करा'}
              </button>
            </div>

            <button className="btn btn-ghost" style={{ color: 'var(--red)', width: '100%' }} onClick={handleSignOut}>
              क्लाउडमधून साइन आउट
            </button>
          </>
        )}
      </div>

      <Modal isOpen={confirmRestore} onClose={() => setConfirmRestore(false)} title="डेटा पुनर्संचयित करायचा?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmRestore(false)}>रद्द</button>
            <button className="btn btn-primary" onClick={handleRestore}>होय, परत आणा</button>
          </>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8, padding: '4px 0' }}>
          क्लाउडवरील बॅकअपमधून सर्व डेटा या फोनवर परत आणला जाईल. या फोनवरचा सध्याचा डेटा त्याने बदलला जाईल.
          {backupInfo?.customer_count ? ` (बॅकअपमध्ये ${backupInfo.customer_count} ग्राहक आहेत.)` : ''}
        </div>
      </Modal>
    </div>
  )
}

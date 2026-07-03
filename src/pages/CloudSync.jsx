import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { getErrorMsg } from '../utils.js'
import { cloudSignIn, cloudSignUp, cloudSignOut, getCloudUser } from '../sync/cloudAuth.js'
import { syncNow, getLastSync } from '../sync/syncService.js'

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

  const refresh = useCallback(async () => {
    setUser(await getCloudUser())
    setLastSync(await getLastSync())
    setChecking(false)
  }, [])

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
            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>साइन इन:</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{user.email}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                शेवटचे सिंक: {lastSync ? new Date(lastSync).toLocaleString('en-IN') : 'अजून नाही'}
              </div>
            </div>

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
    </div>
  )
}

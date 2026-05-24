import React, { useState, useEffect, useCallback } from 'react'

// ── Obfuscation salt — MUST match scripts/setup-master-key.mjs ───────────────
const _S = 'DudDairy_License_Obf_2025_v1_XZ9'

// ── Env vars: 3 parts of the obfuscated master key ───────────────────────────
const _P1 = import.meta.env.VITE_LK_P1 || ''
const _P2 = import.meta.env.VITE_LK_P2 || ''
const _P3 = import.meta.env.VITE_LK_P3 || ''
const _LN = parseInt(import.meta.env.VITE_LK_LEN || '0')
const _VH = import.meta.env.VITE_LK_VH  || ''

// ── Storage key ───────────────────────────────────────────────────────────────
const STORE_KEY = 'dd_lk_v2'

// ── Reconstruct master key from obfuscated parts ─────────────────────────────
function _getMaster() {
  const decode = (b64) => {
    try {
      const raw = atob(b64)
      return Array.from(raw).map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ _S.charCodeAt(i % _S.length))
      ).join('')
    } catch { return '' }
  }
  const full = decode(_P1) + decode(_P2) + decode(_P3)
  // Sanity: length must match what was set during setup
  if (_LN > 0 && full.length !== _LN) return null
  return full || null
}

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────
async function _hmac(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ── Parse key: DD-{CLIENT}-{YYYYMMDD}-{SIG8} ─────────────────────────────────
function _parseKey(raw) {
  const k = raw.trim().toUpperCase()
  const parts = k.split('-')
  // Expected: DD, CLIENT, YYYYMMDD, SIG8
  if (parts.length < 4) return null
  if (parts[0] !== 'DD') return null
  const sig    = parts[parts.length - 1]
  const expRaw = parts[parts.length - 2]
  const client = parts.slice(1, parts.length - 2).join('-')
  if (sig.length !== 8)   return null
  if (expRaw.length !== 8) return null
  const year  = parseInt(expRaw.slice(0, 4))
  const month = parseInt(expRaw.slice(4, 6)) - 1
  const day   = parseInt(expRaw.slice(6, 8))
  const expDate = new Date(year, month, day, 23, 59, 59)
  if (isNaN(expDate.getTime())) return null
  return { client, expRaw, expDate, sig, payload: `${client}|${expRaw}` }
}

// ── Full verification ─────────────────────────────────────────────────────────
async function _verify(raw) {
  const parsed = _parseKey(raw)
  if (!parsed) return { ok: false, reason: 'format' }

  // 1. Check expiry
  const now = new Date()
  if (now > parsed.expDate) {
    const y = parsed.expRaw.slice(0,4), m = parsed.expRaw.slice(4,6), d = parsed.expRaw.slice(6,8)
    return { ok: false, reason: 'expired', expiry: `${d}/${m}/${y}` }
  }

  // 2. Get master key
  const master = _getMaster()
  if (!master) return { ok: false, reason: 'config' }

  // 3. Verify HMAC signature
  const fullHmac   = await _hmac(master, parsed.payload)
  const expectSig  = fullHmac.slice(0, 8).toUpperCase()
  if (parsed.sig !== expectSig) return { ok: false, reason: 'invalid' }

  // ✅ Valid
  const daysLeft = Math.ceil((parsed.expDate - now) / (1000 * 60 * 60 * 24))
  return { ok: true, client: parsed.client, expiry: parsed.expDate, daysLeft }
}

// ── Days until expiry ─────────────────────────────────────────────────────────
function _daysLeft(stored) {
  try {
    const { expRaw } = JSON.parse(stored)
    if (!expRaw) return 0
    const y = parseInt(expRaw.slice(0,4)), m = parseInt(expRaw.slice(4,6))-1, d = parseInt(expRaw.slice(6,8))
    const exp = new Date(y, m, d, 23, 59, 59)
    return Math.ceil((exp - new Date()) / (1000*60*60*24))
  } catch { return 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LicenseGate({ children }) {
  const [status,   setStatus]   = useState('checking')  // 'checking'|'active'|'expired'|'locked'
  const [key,      setKey]      = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [info,     setInfo]     = useState(null)   // { client, daysLeft, expiry }
  const [expDate,  setExpDate]  = useState('')

  // ── On every launch: re-verify stored key ──────────────────────────────────
  useEffect(() => {
    async function check() {
      const stored = localStorage.getItem(STORE_KEY)
      if (!stored) { setStatus('locked'); return }
      try {
        const { key: savedKey } = JSON.parse(stored)
        if (!savedKey) { setStatus('locked'); return }
        const result = await _verify(savedKey)
        if (result.ok) {
          setInfo({ client: result.client, daysLeft: result.daysLeft, expiry: result.expiry })
          setStatus('active')
        } else if (result.reason === 'expired') {
          setExpDate(result.expiry)
          setStatus('expired')
          localStorage.removeItem(STORE_KEY)  // clear so user must re-enter
        } else {
          // Tampered / invalid key in storage — clear it
          localStorage.removeItem(STORE_KEY)
          setStatus('locked')
        }
      } catch {
        localStorage.removeItem(STORE_KEY)
        setStatus('locked')
      }
    }
    check()
  }, [])

  // ── Activate ───────────────────────────────────────────────────────────────
  const activate = useCallback(async () => {
    const trimmed = key.trim()
    if (!trimmed) { setError('कृपया लायसन्स की प्रविष्ट करा'); return }
    setLoading(true)
    setError('')
    try {
      const result = await _verify(trimmed)
      if (result.ok) {
        // Store the key + expiry info
        localStorage.setItem(STORE_KEY, JSON.stringify({
          key:    trimmed.toUpperCase(),
          expRaw: _parseKey(trimmed)?.expRaw,
          client: result.client,
        }))
        setInfo({ client: result.client, daysLeft: result.daysLeft, expiry: result.expiry })
        setStatus('active')
      } else if (result.reason === 'expired') {
        setError(`ही की ${result.expiry} रोजी संपली आहे. नवीन की मिळवा.`)
      } else if (result.reason === 'format') {
        setError('की चुकीच्या format मध्ये आहे. DD-XXXX-YYYYMMDD-SSSSSSSS')
      } else {
        setError('अवैध लायसन्स की. कृपया तपासा.')
      }
    } catch {
      setError('त्रुटी झाली. पुन्हा प्रयत्न करा.')
    } finally {
      setLoading(false)
    }
  }, [key])

  // ── Render: checking ───────────────────────────────────────────────────────
  if (status === 'checking') return null

  // ── Render: active → show app ──────────────────────────────────────────────
  if (status === 'active') {
    // Show expiry warning if ≤ 5 days left
    if (info?.daysLeft <= 5) {
      return (
        <>
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: info.daysLeft <= 2 ? '#7f1d1d' : '#78350f',
            borderTop: `2px solid ${info.daysLeft <= 2 ? '#ef4444' : '#f59e0b'}`,
            padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, color: '#fff', fontWeight: 700,
          }}>
            <span>
              {info.daysLeft <= 0
                ? '⚠️ लायसन्स आज संपते! नवीन की मिळवा.'
                : `⚠️ लायसन्स ${info.daysLeft} दिवसांत संपेल — नवीन की मिळवा.`}
            </span>
          </div>
          {children}
        </>
      )
    }
    return children
  }

  // ── Render: expired ────────────────────────────────────────────────────────
  if (status === 'expired') {
    return (
      <div style={outerStyle}>
        <div style={logoStyle}>🥛</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', marginBottom: 6 }}>Dud Dairy</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>डेअरी व्यवस्थापन अॅप</div>
        <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>⏰</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', textAlign: 'center', marginBottom: 8 }}>
            लायसन्स संपले
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 1.7, marginBottom: 20 }}>
            आपल्या लायसन्स की ची मुदत <strong style={{ color: '#fca5a5' }}>{expDate}</strong> रोजी संपली.<br/>
            अॅप पुन्हा सुरू करण्यासाठी नवीन की मिळवा.
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 14, textAlign: 'center', fontSize: 13, color: '#fca5a5', lineHeight: 1.8 }}>
            📞 विक्रेत्याशी संपर्क करा<br/>
            <span style={{ fontSize: 11, color: '#64748b' }}>नवीन की साठी</span>
          </div>
          <button
            onClick={() => setStatus('locked')}
            style={{ ...btnStyle, marginTop: 16, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 13 }}
          >नवीन की टाका</button>
        </div>
        <Footer />
      </div>
    )
  }

  // ── Render: locked → key entry ─────────────────────────────────────────────
  return (
    <div style={outerStyle}>
      <div style={logoStyle}>🥛</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', marginBottom: 6 }}>Dud Dairy</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>डेअरी व्यवस्थापन अॅप</div>

      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
          🔑 लायसन्स सक्रिय करा
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.7 }}>
          अॅप वापरण्यासाठी लायसन्स की आवश्यक आहे.<br/>
          की मिळवण्यासाठी विक्रेत्याशी संपर्क करा.
        </div>

        <input
          value={key}
          onChange={e => { setKey(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && activate()}
          placeholder="DD-NAME-YYYYMMDD-XXXXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%', background: '#0f172a',
            border: `1.5px solid ${error ? '#ef4444' : '#334155'}`,
            borderRadius: 10, padding: '13px 14px',
            color: '#f1f5f9', fontSize: 14, fontFamily: 'monospace',
            outline: 'none', letterSpacing: '1px',
            boxSizing: 'border-box', marginBottom: error ? 8 : 18,
            transition: 'border-color 0.2s',
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0 }}>⚠</span> {error}
          </div>
        )}

        <button onClick={activate} disabled={loading} style={btnStyle}>
          {loading
            ? <span style={spinnerStyle} />
            : <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                अॅप उघडा
              </>}
        </button>
      </div>

      <Footer />
      <style>{`@keyframes _spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const outerStyle = {
  minHeight: '100dvh', background: '#0f172a',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const logoStyle = {
  width: 72, height: 72, borderRadius: 20,
  background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 36, marginBottom: 20,
}
const cardStyle = {
  width: '100%', maxWidth: 360,
  background: '#1e293b', border: '1px solid #334155',
  borderRadius: 20, padding: 24,
}
const btnStyle = {
  width: '100%', padding: 14, borderRadius: 10, border: 'none',
  background: '#10b981', color: '#fff', fontSize: 15, fontWeight: 800,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  transition: 'background 0.15s',
}
const spinnerStyle = {
  width: 18, height: 18,
  border: '2.5px solid rgba(255,255,255,0.3)',
  borderTopColor: '#fff', borderRadius: '50%',
  animation: '_spin 0.7s linear infinite', display: 'inline-block',
}
function Footer() {
  return (
    <div style={{ marginTop: 24, fontSize: 11, color: '#334155', textAlign: 'center', lineHeight: 1.8 }}>
      © {new Date().getFullYear()} Dud Dairy · All rights reserved
    </div>
  )
}

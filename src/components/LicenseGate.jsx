import React, { useState, useEffect } from 'react'

const KEY_HASH = import.meta.env.VITE_APP_KEY_HASH
const STORAGE_KEY = 'dd_license_activated'

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function LicenseGate({ children }) {
  const [activated, setActivated] = useState(false)
  const [key, setKey]             = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [checking, setChecking]   = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === KEY_HASH) setActivated(true)
    setChecking(false)
  }, [])

  const activate = async () => {
    const trimmed = key.trim()
    if (!trimmed) { setError('कृपया लायसन्स की प्रविष्ट करा'); return }
    setLoading(true)
    setError('')
    try {
      const hash = await sha256(trimmed)
      if (hash === KEY_HASH) {
        localStorage.setItem(STORAGE_KEY, hash)
        setActivated(true)
      } else {
        setError('अवैध लायसन्स की. कृपया तपासा.')
      }
    } catch {
      setError('त्रुटी झाली. पुन्हा प्रयत्न करा.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return null
  if (activated) return children

  return (
    <div style={{
      minHeight: '100dvh', background: '#0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      {/* Logo */}
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, marginBottom: 20
      }}>🥛</div>

      <div style={{ fontSize: 22, fontWeight: 900, color: '#f1f5f9', marginBottom: 6 }}>Dud Dairy</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>डेअरी व्यवस्थापन अॅप</div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 360,
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 20, padding: 24
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
          लायसन्स सक्रिय करा
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
          अॅप वापरण्यासाठी लायसन्स की आवश्यक आहे. की मिळवण्यासाठी अॅप विक्रेत्याशी संपर्क करा.
        </div>

        <input
          value={key}
          onChange={e => { setKey(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && activate()}
          placeholder="DD-XXXX-XXXX-2025"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%', background: '#0f172a',
            border: `1px solid ${error ? '#ef4444' : '#334155'}`,
            borderRadius: 10, padding: '13px 14px',
            color: '#f1f5f9', fontSize: 15, fontFamily: 'monospace',
            outline: 'none', letterSpacing: '1px',
            boxSizing: 'border-box', marginBottom: error ? 8 : 16
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠</span> {error}
          </div>
        )}

        <button
          onClick={activate}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            borderRadius: 10, border: 'none',
            background: loading ? '#065f46' : '#10b981',
            color: '#fff', fontSize: 15, fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}
        >
          {loading ? (
            <span style={{
              width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite', display: 'inline-block'
            }} />
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              अॅप उघडा
            </>
          )}
        </button>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#334155', textAlign: 'center', lineHeight: 1.8 }}>
        © {new Date().getFullYear()} Dud Dairy · All rights reserved
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

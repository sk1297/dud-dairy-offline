import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login, loading } = useAuth()
  const [mobile, setMobile]     = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors]     = useState({})
  const [apiErr, setApiErr]     = useState('')
  const [shaking, setShaking]   = useState(false)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40)
    return () => clearTimeout(t)
  }, [])

  const shake = () => {
    setShaking(true)
    setTimeout(() => setShaking(false), 520)
  }

  const validate = () => {
    const e = {}
    if (!mobile.trim())                        e.mobile = 'मोबाईल नंबर आवश्यक आहे'
    else if (!/^\d{10}$/.test(mobile.trim()))  e.mobile = '१० अंकी मोबाईल नंबर टाका'
    if (!password)                             e.password = 'पासवर्ड / PIN आवश्यक आहे'
    else if (password.length < 4)             e.password = 'किमान ४ अक्षरे असावेत'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setApiErr('')
    if (!validate()) { shake(); return }
    const result = await login(mobile.trim(), password)
    if (!result.success) {
      setApiErr(result.error || 'चुकीची माहिती. पुन्हा प्रयत्न करा.')
      shake()
    }
  }

  return (
    <div className="lp-bg">
      <div className="lp-blob lp-blob-1" />
      <div className="lp-blob lp-blob-2" />

      {/* shake is on a wrapper div — not the card — to avoid CSS transition conflict */}
      <div className={`lp-card${mounted ? ' lp-card-in' : ''}${shaking ? ' lp-shake' : ''}`}>

        {/* Header */}
        <div className="lp-header">
          <div className="lp-logo-wrap">
            <div className="lp-logo-ring" />
            <div className="lp-logo">
              {/* Milk bottle icon */}
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2h8" />
                <path d="M9 2v2.5L6 8v12a2 2 0 002 2h8a2 2 0 002-2V8l-3-3.5V2" />
                <path d="M6 14h12" />
                <path d="M9.5 11.5c0 .8 1.1 1.5 2.5 1.5s2.5-.7 2.5-1.5" stroke="#10b981" strokeWidth="1.5" />
              </svg>
            </div>
          </div>
          <div className="lp-brand">दूध डेअरी</div>
          <div className="lp-tagline">Offline Dairy Management</div>
        </div>

        {/* API Error */}
        {apiErr && (
          <div className="lp-api-err" role="alert">
            <div className="lp-api-err-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <span className="lp-api-err-text">{apiErr}</span>
            <button type="button" className="lp-api-err-close" onClick={() => setApiErr('')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {/* Mobile */}
          <div className={`lp-input-wrap${errors.mobile ? ' lp-input-has-err' : ''}`} style={{ animationDelay: '0.08s' }}>
            <label className="lp-input-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
              </svg>
              मोबाईल नंबर
            </label>
            <input
              className="lp-input-field"
              type="tel"
              inputMode="numeric"
              placeholder="१० अंकी मोबाईल नंबर"
              value={mobile}
              onChange={e => {
                setMobile(e.target.value)
                setErrors(p => ({ ...p, mobile: '' }))
                setApiErr('')
              }}
              maxLength={10}
              autoComplete="username"
            />
            {errors.mobile && <div className="lp-field-err">{errors.mobile}</div>}
          </div>

          {/* Password */}
          <div className={`lp-input-wrap${errors.password ? ' lp-input-has-err' : ''}`} style={{ animationDelay: '0.14s' }}>
            <label className="lp-input-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              पासवर्ड / PIN
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="lp-input-field"
                type={showPass ? 'text' : 'password'}
                placeholder="पासवर्ड किंवा PIN टाका"
                value={password}
                onChange={e => {
                  setPassword(e.target.value)
                  setErrors(p => ({ ...p, password: '' }))
                  setApiErr('')
                }}
                autoComplete="current-password"
                style={{ paddingRight: 48 }}
              />
              <button type="button" className="lp-eye" onClick={() => setShowPass(p => !p)} aria-label="पासवर्ड दाखवा/लपवा">
                {showPass ? (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {errors.password && <div className="lp-field-err">{errors.password}</div>}
          </div>

          <button type="submit" className="lp-submit" disabled={loading} style={{ animationDelay: '0.20s' }}>
            {loading ? (
              <span className="lp-btn-dots"><span /><span /><span /></span>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                लॉगिन करा
              </>
            )}
          </button>
        </form>

        {/* Default credentials hint */}
        <div className="lp-hint-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>डिफॉल्ट: <strong>9999999999</strong> / PIN <strong>1234</strong></span>
        </div>

        <div className="lp-footer">
          <span className="lp-footer-dot" />
          दूध डेअरी v1.0
          <span className="lp-footer-dot" />
          Offline
        </div>
      </div>
    </div>
  )
}

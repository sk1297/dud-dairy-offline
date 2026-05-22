import React from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'

const moreItems = [
  {
    label: 'अहवाल',
    sub: 'Reports',
    color: '#10b981',
    tint: 'rgba(16,185,129,0.12)',
    path: '/more/reports',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    )
  },
  {
    label: 'दर व्यवस्थापन',
    sub: 'Rate History',
    color: '#f59e0b',
    tint: 'rgba(245,158,11,0.12)',
    path: '/more/settings?tab=rates',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    )
  },
  {
    label: 'सेटिंग्ज',
    sub: 'App Settings',
    color: '#8b5cf6',
    tint: 'rgba(139,92,246,0.12)',
    path: '/more/settings',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 00-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    )
  },
  {
    label: 'बॅकअप',
    sub: 'Export & Backup',
    color: '#06b6d4',
    tint: 'rgba(6,182,212,0.12)',
    path: '/more/backup',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
        <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
      </svg>
    )
  },
  {
    label: 'भाग व्यवस्थापन',
    sub: 'Area Management',
    color: '#ec4899',
    tint: 'rgba(236,72,153,0.12)',
    path: null,
    action: 'areas',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    )
  },
  {
    label: 'मदत व माहिती',
    sub: 'Help & Guide',
    color: '#10b981',
    tint: 'rgba(16,185,129,0.12)',
    path: '/more/help',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    )
  },
]

export default function More() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { show } = useToast()

  const handleItem = (item) => {
    if (item.action === 'areas') { show('भाग व्यवस्थापन लवकरच येणार आहे', 'info'); return }
    if (item.path) navigate(item.path)
    else if (!item.action) show('लवकरच येणार आहे', 'info')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <Header title="अधिक" />
      <div style={{ padding: 16 }}>
        <div className="more-grid">
          {moreItems.map((item, i) => (
            <button key={i} className="more-card" onClick={() => handleItem(item)}>
              <div className="more-card-icon" style={{ background: item.tint, color: item.color }}>
                {item.icon}
              </div>
              <div>
                <div className="more-card-label">{item.label}</div>
                <div className="more-card-sub">{item.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24, padding: 16, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>दूध डेअरी v1.0</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Offline Dairy Management App</div>
          <button className="btn btn-ghost" style={{ color: 'var(--red)', width: '100%' }} onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            लॉगआउट करा
          </button>
        </div>
      </div>
    </div>
  )
}

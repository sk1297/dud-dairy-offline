import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const navItems = [
  {
    path: '/',
    label: 'मुख्य पान',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" opacity={active ? 0.7 : 1} />
        <rect x="14" y="3" width="7" height="7" rx="1" opacity={active ? 0.7 : 1} />
        <rect x="3" y="14" width="7" height="7" rx="1" opacity={active ? 0.7 : 1} />
        <rect x="14" y="14" width="7" height="7" rx="1" opacity={active ? 0.7 : 1} />
      </svg>
    )
  },
  {
    path: '/delivery',
    label: 'डिलिव्हरी',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.2 : 1} />
        <polyline points="9 22 9 12 15 12 15 22" />
        {active && <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />}
      </svg>
    )
  },
  {
    path: '/customers',
    label: 'ग्राहक',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.25 : 1} />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    )
  },
  {
    path: '/bills',
    label: 'बिल/पैसे',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="18" rx="2" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.15 : 1} />
        <path d="M8 9h8M8 13h5" />
        {active && <circle cx="18" cy="18" r="3" fill="currentColor" stroke="none" />}
      </svg>
    )
  },
  {
    path: '/more',
    label: 'अधिक',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5"  r={active ? "2" : "1.5"} fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r={active ? "2" : "1.5"} fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r={active ? "2" : "1.5"} fill="currentColor" stroke="none" />
      </svg>
    )
  }
]

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const active = isActive(item.path)
        return (
          <button
            key={item.path}
            className={`nav-item${active ? ' active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            {item.icon(active)}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

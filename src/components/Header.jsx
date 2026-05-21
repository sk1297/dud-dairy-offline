import React from 'react'

export default function Header({ title, subtitle, icon, onBack, rightContent }) {
  return (
    <div className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button className="btn-icon" style={{ width: 34, height: 34, flexShrink: 0 }} onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        {icon && (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 className="header-title" style={{ lineHeight: subtitle ? 1.15 : undefined }}>{title}</h1>
          {subtitle && (
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {rightContent && <div className="header-right">{rightContent}</div>}
    </div>
  )
}

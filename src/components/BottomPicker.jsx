import React, { useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Android-native style bottom sheet option picker.
 * Replaces <select> for short lists (areas, status, customer, month/year).
 *
 * Props:
 *   options    — array of { label, value } objects
 *   value      — current selected value
 *   onChange   — (value) => void
 *   placeholder — shown when nothing selected
 *   searchable — show search input (for long lists like customers)
 *   className  — forwarded to trigger button
 *   style      — forwarded to trigger button
 */
export default function BottomPicker({
  options = [],
  value,
  onChange,
  placeholder = 'निवडा',
  searchable = false,
  className = 'form-input',
  style = {},
  disabled = false,
}) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const searchRef           = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  const filtered = searchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const pick = (val) => {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  // Focus search input when sheet opens
  useEffect(() => {
    if (open && searchable && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 150)
    }
  }, [open, searchable])

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else       document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Android back button closes the picker
  useEffect(() => {
    if (!open || Capacitor.getPlatform() === 'web') return
    const listener = App.addListener('backButton', () => { setOpen(false); setQuery('') })
    return () => { listener.then(h => h.remove()) }
  }, [open])

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        className={className}
        style={{
          textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          opacity: disabled ? 0.5 : 1, ...style,
        }}
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <span style={{ color: selected ? 'var(--text)' : 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginLeft: 6, color: 'var(--text2)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Bottom Sheet */}
      {open && (
        <div
          style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.55)', display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => { setOpen(false); setQuery('') }}
        >
          <div
            style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'70vh', display:'flex', flexDirection:'column', overflow:'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
              <div style={{ width:40, height:4, borderRadius:2, background:'var(--border)' }} />
            </div>

            {/* Search (if enabled) */}
            {searchable && (
              <div style={{ padding:'8px 16px 10px' }}>
                <input
                  ref={searchRef}
                  className="form-input"
                  placeholder="शोधा..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ fontSize:14 }}
                />
              </div>
            )}

            {/* Options list */}
            <div style={{ overflowY:'auto', flex:1, padding:'4px 0 16px' }}>
              {filtered.length === 0 && (
                <div style={{ textAlign:'center', color:'var(--text2)', padding:'24px 16px', fontSize:14 }}>
                  काहीच सापडले नाही
                </div>
              )}
              {filtered.map(opt => {
                const isSel = String(opt.value) === String(value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    style={{
                      width:'100%', textAlign:'left', background: isSel ? 'rgba(16,185,129,0.12)' : 'transparent',
                      border:'none', padding:'14px 20px', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      color: isSel ? 'var(--accent)' : 'var(--text)',
                      fontWeight: isSel ? 700 : 400, fontSize:15,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span>{opt.label}</span>
                    {isSel && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

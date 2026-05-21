import React, { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export default function Modal({ isOpen, onClose, title, children, footer }) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Android hardware back button closes the modal
  useEffect(() => {
    if (!isOpen || Capacitor.getPlatform() === 'web') return
    const listener = App.addListener('backButton', () => onClose())
    return () => { listener.then(h => h.remove()) }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-handle" />
        {title && <div className="modal-title">{title}</div>}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { Capacitor } from '@capacitor/core'
import { initDB } from './db/database.js'

async function start() {
  // jeep-sqlite custom element only needed on native Android
  if (Capacitor.getPlatform() !== 'web') {
    const { defineCustomElements } = await import('jeep-sqlite/loader')
    defineCustomElements(window)
    // small delay for the custom element to register
    await new Promise(r => setTimeout(r, 200))

    // Match status bar to app dark background
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#0f172a' })
    } catch (_) { /* ignore on older Android */ }
  }

  await initDB()

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

start()

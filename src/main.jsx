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

    // Edge-to-edge: status bar is transparent, WebView fills full screen.
    // Android 15 forces this anyway — we embrace it and handle via CSS.
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      await StatusBar.setOverlaysWebView({ overlay: true })
      await StatusBar.setStyle({ style: Style.Dark }) // white icons on dark header
    } catch (_) { /* ignore on older Android */ }

    // Measure actual status bar height via JS probe and store as --sat.
    // This is the most reliable approach: env(safe-area-inset-top) is
    // guaranteed to work when overlay=true, and reading it via getBoundingClientRect
    // gives us a concrete px value we can use as a CSS variable everywhere.
    try {
      await new Promise(r => requestAnimationFrame(r))
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      document.body.appendChild(probe)
      await new Promise(r => requestAnimationFrame(r))
      const sat = Math.round(probe.getBoundingClientRect().top)
      probe.remove()
      if (sat > 0) {
        document.documentElement.style.setProperty('--sat', sat + 'px')
      }
    } catch (_) { /* keep --sat at default 0px */ }
  }

  await initDB()

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

start()

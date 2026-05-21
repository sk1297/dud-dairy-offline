import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { Capacitor } from '@capacitor/core'
import { initDB } from './db/database.js'

// jeep-sqlite custom element only needed on native Android
if (Capacitor.getPlatform() !== 'web') {
  import('jeep-sqlite/loader').then(({ defineCustomElements }) => defineCustomElements(window))
}

window.addEventListener('DOMContentLoaded', async () => {
  await initDB()
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader'
import { initDB } from './db/database.js'

defineJeepSqlite(window)

window.addEventListener('DOMContentLoaded', async () => {
  await initDB()
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})

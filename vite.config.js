import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',           // relative paths — required for Capacitor WebView
  server: { port: 3001 }
})

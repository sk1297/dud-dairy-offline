import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/sql.js/dist/sql-wasm.wasm', dest: '.' },
      ],
    }),
  ],
  base: './',
  server: { port: 3001 },
  optimizeDeps: {
    exclude: ['@capacitor-community/sqlite'],
  },
})

// android-patch/apply.js
// Run after: npx cap sync android
// Usage:     npm run android:patch
//
// Patches android/app/src/main/res/values/styles.xml to set
// dark status bar + dark navigation bar colours matching the app theme.

import { copyFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const src  = resolve(__dirname, 'styles.xml')
const dest = resolve(root, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml')

if (!existsSync(resolve(root, 'android'))) {
  console.error('❌  android/ folder not found. Run: npx cap add android && npx cap sync android first.')
  process.exit(1)
}

copyFileSync(src, dest)
console.log('✅  android/app/src/main/res/values/styles.xml patched — dark status + nav bar applied.')

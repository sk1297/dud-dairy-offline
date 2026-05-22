// android-patch/apply.js
// Run after: npx cap sync android
// Usage:     npm run android:patch   (or use: npm run android:sync)
//
// Applies two patches to the Android project:
//   1. styles.xml  — dark status bar + dark navigation bar
//   2. mipmap icons — custom app launcher icon in all required sizes

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = resolve(__dirname, '..')
const androidRes = resolve(root, 'android', 'app', 'src', 'main', 'res')

if (!existsSync(resolve(root, 'android'))) {
  console.error('ERROR: android/ folder not found. Run: npx cap add android && npx cap sync android first.')
  process.exit(1)
}

// 1. Patch styles.xml
const stylesSrc  = resolve(__dirname, 'styles.xml')
const stylesDest = resolve(androidRes, 'values', 'styles.xml')
copyFileSync(stylesSrc, stylesDest)
console.log('Patched: android/app/src/main/res/values/styles.xml (dark status + nav bar)')

// 2. Copy mipmap icons
const mipmapFolders = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']
for (const folder of mipmapFolders) {
  const srcDir  = resolve(__dirname, 'res', folder)
  const destDir = resolve(androidRes, folder)
  if (!existsSync(srcDir)) continue
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  for (const file of readdirSync(srcDir)) {
    copyFileSync(join(srcDir, file), join(destDir, file))
  }
  console.log('Patched: ' + folder + ' icons')
}

console.log('All patches applied successfully.')

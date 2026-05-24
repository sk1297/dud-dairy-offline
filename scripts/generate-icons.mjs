/**
 * generate-icons.mjs
 * Generates all Android + Play Store icon sizes from public/icon.png
 * - Adds green background (#065f46)
 * - Pads logo to 72% of canvas so nothing is clipped on any phone shape
 * - Outputs to android-assets/  (copy these into android project)
 *
 * Usage: node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')
const SRC_ICON  = path.join(ROOT, 'public', 'icon.png')
const OUT_DIR   = path.join(ROOT, 'android-assets')

// ── Android mipmap sizes ─────────────────────────────────────────────────────
const MIPMAP_SIZES = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
]

// ── Adaptive icon foreground sizes (108dp each density) ─────────────────────
const ADAPTIVE_SIZES = [
  { folder: 'mipmap-mdpi',    size: 108 },
  { folder: 'mipmap-hdpi',    size: 162 },
  { folder: 'mipmap-xhdpi',   size: 216 },
  { folder: 'mipmap-xxhdpi',  size: 324 },
  { folder: 'mipmap-xxxhdpi', size: 432 },
]

const BG_COLOR  = { r: 6, g: 95, b: 70, alpha: 1 }   // #065f46 — app green
const PAD_PCT   = 0.72   // logo fills 72% of canvas, 14% padding each side

async function buildIcon(size, bgColor, padPct) {
  const logoSize = Math.round(size * padPct)
  const padding  = Math.round((size - logoSize) / 2)

  // Resize the source logo
  const logoBuffer = await sharp(SRC_ICON)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .toBuffer()

  // Composite onto colored background
  return sharp({
    create: { width: size, height: size, channels: 4, background: bgColor }
  })
    .composite([{ input: logoBuffer, top: padding, left: padding }])
    .png()
    .toBuffer()
}

async function buildAdaptiveForeground(size) {
  // Foreground layer: logo on transparent background, 58% safe zone
  const logoSize = Math.round(size * 0.58)
  const padding  = Math.round((size - logoSize) / 2)
  const logoBuffer = await sharp(SRC_ICON)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
  })
    .composite([{ input: logoBuffer, top: padding, left: padding }])
    .png()
    .toBuffer()
}

async function buildAdaptiveBackground(size) {
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG_COLOR }
  })
    .png()
    .toBuffer()
}

async function main() {
  console.log('🎨  Generating Android icons from public/icon.png ...\n')

  // ── 1. Standard launcher icons ──────────────────────────────────────────────
  const launcherDir = path.join(OUT_DIR, 'launcher')
  fs.mkdirSync(launcherDir, { recursive: true })

  for (const { folder, size } of MIPMAP_SIZES) {
    const dir = path.join(launcherDir, folder)
    fs.mkdirSync(dir, { recursive: true })

    const buf = await buildIcon(size, BG_COLOR, PAD_PCT)
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), buf)
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), buf)
    console.log(`  ✓  ${folder}/ic_launcher.png  (${size}×${size})`)
  }

  // ── 2. Adaptive icon layers ──────────────────────────────────────────────────
  const adaptiveDir = path.join(OUT_DIR, 'adaptive')
  fs.mkdirSync(adaptiveDir, { recursive: true })

  for (const { folder, size } of ADAPTIVE_SIZES) {
    const dir = path.join(adaptiveDir, folder)
    fs.mkdirSync(dir, { recursive: true })

    const fg = await buildAdaptiveForeground(size)
    const bg = await buildAdaptiveBackground(size)
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg)
    fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'), bg)
    console.log(`  ✓  ${folder}/ic_launcher_foreground.png  (${size}×${size})`)
  }

  // ── 3. Play Store icon (512×512) ─────────────────────────────────────────────
  const storeDir = path.join(OUT_DIR, 'store')
  fs.mkdirSync(storeDir, { recursive: true })

  const store512 = await buildIcon(512, BG_COLOR, 0.72)
  fs.writeFileSync(path.join(storeDir, 'icon-512x512.png'), store512)
  console.log('\n  ✓  store/icon-512x512.png  (Play Store listing icon)')

  // ── 4. Notification icon (white silhouette on transparent) ──────────────────
  const notifDir = path.join(OUT_DIR, 'notification')
  fs.mkdirSync(notifDir, { recursive: true })

  for (const { folder, size } of MIPMAP_SIZES) {
    const dir = path.join(notifDir, folder)
    fs.mkdirSync(dir, { recursive: true })

    const logoSize = Math.round(size * 0.7)
    const padding  = Math.round((size - logoSize) / 2)
    const whiteLogo = await sharp(SRC_ICON)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
      .greyscale()
      .threshold(128)
      .toBuffer()
    const notifBuf = await sharp({
      create: { width: size, height: size, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
    })
      .composite([{ input: whiteLogo, top: padding, left: padding }])
      .png()
      .toBuffer()
    fs.writeFileSync(path.join(dir, 'ic_stat_notify.png'), notifBuf)
  }
  console.log('  ✓  notification icons generated\n')

  console.log('✅  All icons saved to android-assets/')
  console.log('\nNext steps:')
  console.log('  1. Copy android-assets/launcher/mipmap-* → android/app/src/main/res/')
  console.log('  2. Copy android-assets/adaptive/mipmap-* foreground/background files → same res/ folders')
  console.log('  3. Upload android-assets/store/icon-512x512.png to Play Console')
}

main().catch(e => { console.error(e); process.exit(1) })

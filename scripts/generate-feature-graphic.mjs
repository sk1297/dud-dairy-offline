/**
 * generate-feature-graphic.mjs
 * Creates Play Store Feature Graphic: 1024×500 PNG
 * Green branded banner with logo + app name + tagline
 *
 * Usage: node scripts/generate-feature-graphic.mjs
 */

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT     = path.resolve(__dirname, '..')
const SRC_ICON = path.join(ROOT, 'public', 'icon.png')
const OUT_DIR  = path.join(ROOT, 'android-assets', 'store')

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Logo at 340px tall, centered on right side
  const logoH  = 340
  const logoW  = 340
  const logoBuffer = await sharp(SRC_ICON)
    .resize(logoW, logoH, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .toBuffer()

  // Smaller logo copy for left side watermark (low opacity)
  const watermarkBuf = await sharp(SRC_ICON)
    .resize(220, 220, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .toBuffer()

  // SVG text overlay
  const svg = `
<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <!-- Gradient background panels -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#043d2c"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Base background -->
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#shine)"/>

  <!-- Decorative circles -->
  <circle cx="820" cy="60"  r="180" fill="#ffffff" fill-opacity="0.03"/>
  <circle cx="900" cy="420" r="120" fill="#ffffff" fill-opacity="0.04"/>
  <circle cx="60"  cy="440" r="90"  fill="#ffffff" fill-opacity="0.03"/>

  <!-- Accent line -->
  <rect x="60" y="240" width="4" height="80" fill="#10b981" rx="2"/>

  <!-- App name -->
  <text x="84" y="200"
    font-family="Arial, sans-serif"
    font-size="72"
    font-weight="900"
    fill="#ffffff"
    letter-spacing="-1">Dud Dairy</text>

  <!-- Marathi name -->
  <text x="86" y="248"
    font-family="Arial, sans-serif"
    font-size="22"
    fill="#a7f3d0"
    letter-spacing="1">दूध डेअरी व्यवस्थापन</text>

  <!-- Tagline line 1 -->
  <text x="88" y="298"
    font-family="Arial, sans-serif"
    font-size="19"
    fill="#6ee7b7">डिलिव्हरी · बिल · पेमेंट · अहवाल</text>

  <!-- Tagline line 2 -->
  <text x="88" y="328"
    font-family="Arial, sans-serif"
    font-size="17"
    fill="#34d399">100% Offline · Works without internet</text>

  <!-- Badge -->
  <rect x="88" y="352" width="200" height="36" rx="18" fill="#10b981"/>
  <text x="188" y="376"
    font-family="Arial, sans-serif"
    font-size="14"
    font-weight="700"
    fill="#ffffff"
    text-anchor="middle">FREE · NO ADS · OFFLINE</text>
</svg>`

  const svgBuffer = Buffer.from(svg)

  const output = await sharp({
    create: { width: 1024, height: 500, channels: 4, background: { r:4, g:61, b:44, alpha:1 } }
  })
  .composite([
    { input: svgBuffer,    top: 0,                    left: 0    },
    { input: watermarkBuf, top: 20,                   left: 720, blend: 'over' },  // watermark right
    { input: logoBuffer,   top: Math.round((500-logoH)/2), left: 640 },
  ])
  .png()
  .toFile(path.join(OUT_DIR, 'feature-graphic-1024x500.png'))

  console.log('✅  store/feature-graphic-1024x500.png created')
}

main().catch(e => { console.error(e); process.exit(1) })

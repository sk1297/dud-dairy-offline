/**
 * setup-master-key.mjs
 * Run ONCE to set up your master signing secret.
 * Splits and obfuscates the master key into 3 env vars.
 *
 * Usage:  node scripts/setup-master-key.mjs
 *
 * KEEP YOUR MASTER SECRET SAFE — if you lose it, you cannot generate
 * new keys that work with existing APK builds.
 */

import { createInterface } from 'readline'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHmac } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')
const ENV_FILE  = resolve(ROOT, '.env')

// ── XOR obfuscation salt (hardcoded in both this script AND LicenseGate.jsx)
// Changing this breaks all existing keys — never change after first deploy
const XOR_SALT = 'DudDairy_License_Obf_2025_v1_XZ9'

function xorEncode(str, salt) {
  return Buffer.from(
    str.split('').map((c, i) =>
      c.charCodeAt(0) ^ salt.charCodeAt(i % salt.length)
    )
  ).toString('base64')
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║     Dud Dairy — Master Key Setup (Run Once)          ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')
  console.log('This creates your permanent license signing secret.')
  console.log('Write down your master secret and store it safely.\n')

  const master = await ask(rl, 'Enter your master secret (or press Enter to auto-generate): ')
  rl.close()

  // Auto-generate if blank
  let masterKey = master.trim()
  if (!masterKey) {
    const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const seg    = n => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    masterKey    = `DD-${seg(6)}-${seg(6)}-${seg(6)}-${new Date().getFullYear()}`
    console.log(`\n  Auto-generated master secret: \x1b[32m${masterKey}\x1b[0m`)
    console.log('  ⚠️  WRITE THIS DOWN — you need it to generate client keys\n')
  }

  // Split into 3 parts
  const len   = masterKey.length
  const s1    = Math.floor(len / 3)
  const s2    = Math.floor(2 * len / 3)
  const p1    = masterKey.slice(0, s1)
  const p2    = masterKey.slice(s1, s2)
  const p3    = masterKey.slice(s2)

  const e1    = xorEncode(p1, XOR_SALT)
  const e2    = xorEncode(p2, XOR_SALT)
  const e3    = xorEncode(p3, XOR_SALT)

  // Verification hash (to confirm key round-trips correctly — NOT stored in APK)
  const verifyHash = createHmac('sha256', masterKey).update('DD_VERIFY_2025').digest('hex').slice(0, 16)

  // Build .env content
  const newVars = [
    `# Dud Dairy License System — generated ${new Date().toISOString().split('T')[0]}`,
    `# DO NOT SHARE — DO NOT COMMIT TO GIT`,
    `VITE_LK_P1=${e1}`,
    `VITE_LK_P2=${e2}`,
    `VITE_LK_P3=${e3}`,
    `VITE_LK_LEN=${len}`,
    `VITE_LK_VH=${verifyHash}`,
  ].join('\n')

  // Read existing .env and remove old key vars
  let existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  existing = existing
    .split('\n')
    .filter(l => !l.startsWith('VITE_LK_') && !l.startsWith('VITE_APP_KEY_HASH') && !l.startsWith('# Dud Dairy License'))
    .join('\n')
    .trim()

  writeFileSync(ENV_FILE, (existing ? existing + '\n\n' : '') + newVars + '\n')

  console.log('\n✅  .env updated with new license vars:')
  console.log(`   VITE_LK_P1  = ${e1}`)
  console.log(`   VITE_LK_P2  = ${e2}`)
  console.log(`   VITE_LK_P3  = ${e3}`)
  console.log(`   VITE_LK_LEN = ${len}`)
  console.log(`   VITE_LK_VH  = ${verifyHash}`)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Next steps:')
  console.log('  1. Add all 5 VITE_LK_* vars as GitHub Actions secrets')
  console.log('  2. Open keygen.html → enter your master secret → generate client keys')
  console.log('  3. npm run build → APK will have new system baked in')
  console.log('  4. Give each client their OWN key with an expiry date')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()

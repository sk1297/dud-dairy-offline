# Dud Dairy — Complete Developer & Owner Documentation

> **Version:** 1.0.0  
> **App ID:** com.duddairy.app  
> **Platform:** Android (Capacitor + React + Vite)  
> **Owner / Developer:** Swapnil (swapnilks1297@gmail.com)  
> **Last Updated:** May 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [App Features](#4-app-features)
5. [Database Schema](#5-database-schema)
6. [License Key System](#6-license-key-system)
7. [Building the APK](#7-building-the-apk)
8. [GitHub Actions — Auto Build](#8-github-actions--auto-build)
9. [Google Play Store](#9-google-play-store)
10. [Icons & Assets](#10-icons--assets)
11. [Daily Operations — Owner Guide](#11-daily-operations--owner-guide)
12. [Giving App to a New Client](#12-giving-app-to-a-new-client)
13. [Renewing a Client Key](#13-renewing-a-client-key)
14. [Troubleshooting](#14-troubleshooting)
15. [Important Files Reference](#15-important-files-reference)
16. [Secrets & Passwords — Master List](#16-secrets--passwords--master-list)

---

## 1. Project Overview

**Dud Dairy** is an offline Android app for milk dairy business owners. It manages:
- Daily milk deliveries (morning + evening sessions)
- Customer records and subscriptions
- Monthly bill generation and PDF sharing
- Payment tracking and outstanding balances
- Reports and analytics

**Key principle:** 100% offline — no internet required, all data stored on the device in SQLite.

**Business model:** You (the developer) sell the app to dairy owners. Each client pays and gets a time-limited license key. When the key expires, the app locks until they pay again.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + React Router 6 |
| Build Tool | Vite 5 |
| Mobile Platform | Capacitor 8 (Android) |
| Database | SQLite via `@capacitor-community/sqlite` + `jeep-sqlite` |
| PDF Generation | jsPDF + html2canvas |
| File Sharing | `@capacitor/filesystem` + `@capacitor/share` |
| Icons/Assets | Node.js + sharp (build-time generation) |
| CI/CD | GitHub Actions (auto APK build on push) |

---

## 3. Project Structure

```
dud-dairy-offline/
│
├── src/
│   ├── pages/                  ← App screens
│   │   ├── Dashboard.jsx       ← Home screen (today summary)
│   │   ├── Delivery.jsx        ← Daily delivery tracking (main screen)
│   │   ├── Customers.jsx       ← Customer list (2-col grid view)
│   │   ├── CustomerProfile.jsx ← Individual customer details
│   │   ├── Bills.jsx           ← Monthly bill generation
│   │   ├── Reports.jsx         ← Analytics & charts
│   │   ├── ReportsCharts.jsx   ← SVG chart components
│   │   ├── Backup.jsx          ← Data backup & export
│   │   ├── Settings.jsx        ← App settings
│   │   ├── Help.jsx            ← In-app help guide
│   │   ├── More.jsx            ← More menu
│   │   └── Login.jsx           ← Login screen
│   │
│   ├── components/
│   │   ├── LicenseGate.jsx     ← License key verification (wraps entire app)
│   │   ├── Header.jsx          ← Sticky top header (used on all pages)
│   │   ├── BottomNav.jsx       ← Bottom navigation bar
│   │   ├── Modal.jsx           ← Reusable modal/bottom-sheet
│   │   ├── TextInput.jsx       ← Styled input component
│   │   ├── BottomPicker.jsx    ← iOS-style picker
│   │   └── Toast.jsx           ← Toast notification
│   │
│   ├── services/               ← All database operations
│   │   ├── deliveryService.js
│   │   ├── customerService.js
│   │   ├── billService.js
│   │   ├── paymentService.js
│   │   ├── productService.js
│   │   ├── areaService.js
│   │   ├── settingsService.js
│   │   └── authService.js
│   │
│   ├── db/
│   │   └── database.js         ← SQLite init, schema, migrations
│   │
│   ├── utils/
│   │   └── billPdf.js          ← Bill PDF generation (html2canvas → jsPDF)
│   │
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── ToastContext.jsx
│   │
│   ├── hooks/
│   │   └── usePullToRefresh.jsx
│   │
│   ├── App.jsx                 ← Routes + providers
│   ├── main.jsx                ← App entry point (DB init, StatusBar)
│   ├── index.css               ← Global styles + CSS variables
│   └── utils.js                ← Shared utility functions
│
├── public/
│   ├── icon.png                ← Master app icon (512×512 source)
│   ├── icon.svg                ← SVG version
│   ├── favicon.svg
│   └── privacy-policy.html     ← Hosted privacy policy (for Play Store)
│
├── android-assets/             ← Pre-generated Android icon files
│   ├── launcher/               ← ic_launcher.png all densities
│   ├── adaptive/               ← ic_launcher_foreground/background
│   ├── notification/           ← ic_stat_notify.png
│   ├── xml/                    ← Adaptive icon XMLs (mipmap-anydpi-v26)
│   └── store/
│       ├── icon-512x512.png    ← Play Store app icon
│       └── feature-graphic-1024x500.png
│
├── android-patch/              ← Files patched into android/ after cap sync
│   ├── apply.js                ← Patch script (npm run android:patch)
│   ├── styles.xml              ← Dark theme / splash screen
│   └── res/                    ← Icons + colors + adaptive XMLs
│
├── scripts/
│   ├── setup-master-key.mjs   ← Run ONCE to set up license signing
│   ├── generate-icons.mjs     ← Regenerate all icon sizes from icon.png
│   ├── generate-feature-graphic.mjs
│   └── setup-signing.sh       ← Create release keystore (Play Store)
│
├── .github/
│   └── workflows/
│       └── build-apk.yml      ← Auto-build APK on every git push
│
├── keygen.html                 ← License key generator (YOUR PRIVATE TOOL)
├── .env                        ← License secrets (NEVER commit to git)
├── capacitor.config.json       ← Capacitor config (appId, appName)
├── vite.config.js
├── package.json
├── DOCUMENTATION.md            ← This file
├── PLAY_STORE_GUIDE.md         ← Play Store publish steps
└── APK_BUILD_GUIDE.md          ← Local APK build steps
```

---

## 4. App Features

### Delivery Page (`/delivery`)
- Select date (← / → navigation, today shortcut)
- Toggle morning ☀️ / evening 🌙 session
- 2-column grid card view with list/grid toggle (persisted in localStorage)
- Each card: avatar, name, area, product+qty, status strip
- Tap card → mark delivered instantly
- Tap delivered card → edit quantity
- ⋮ button → options sheet (skip / partial / extra product / delete)
- Mark all delivered with undo (12 seconds)
- Progress bar showing X/Y delivered
- Fixed footer: total litres + delivered count

### Customers Page (`/customers`)
- 2-column grid cards (matches delivery page style)
- Search by name/mobile/area
- Filter by status (active/paused/stopped) and area
- Sort by name / outstanding / pending first / newest
- Quick deliver toggle per card
- Outstanding balance badge (red)
- WhatsApp reminder button (if mobile + due balance)
- Pull-to-refresh

### Customer Profile (`/customers/:id`)
- Full customer details + edit
- Delivery history
- Payment history
- Bill history
- Extra product subscriptions

### Bills Page (`/bills`)
- Generate monthly bills for all active customers
- Per-customer bill with line items (date, session, qty, rate, amount)
- Previous balance carry-forward
- Payments deducted
- Lock/unlock bills
- Share bill as PDF (WhatsApp/email)
- PDF uses html2canvas → jsPDF (full Marathi/Unicode support)

### Reports Page (`/reports`)
- Tab 0 — Today: delivery ring, 7-day trend bars, session breakdown
- Tab 1 — Monthly: day-by-day bars, payment mode donut, MoM deltas
- Tab 2 — Customers: health tiers (A/B/C), area breakdown
- Tab 3 — Charts: 6-month trends, efficiency line, payment donut
- All charts: pure SVG, no external library (offline-safe)

### Backup Page (`/backup`)
- Export full database as JSON
- Import from JSON backup
- Export customer list as CSV

### Settings Page (`/settings`)
- Dairy name, owner name, mobile
- Default rates, session times
- App theme (dark/light)

---

## 5. Database Schema

Located in `src/db/database.js`. Tables:

```sql
customers          -- id, name, mobile, address, area_id, product_id,
                   -- morning_qty, evening_qty, rate, status, start_date

products           -- id, name, type, unit, default_rate

customer_products  -- extra subscriptions (id, customer_id, product_id, morning_qty, evening_qty, rate)

areas              -- id, name

deliveries         -- id, customer_id, product_id, date, session, qty, status, notes
                   -- status: 'delivered' | 'partial' | 'skip' | 'pending'

payments           -- id, customer_id, amount, date, mode, notes
                   -- mode: 'cash' | 'upi' | 'bank' | 'cheque'

monthly_bills      -- id, customer_id, month, year, total_qty, total_amount,
                   -- prev_balance, payments_made, amount_due, is_locked, generated_date

bill_items         -- id, bill_id, date, session, qty, rate, amount,
                   -- product_id, product_name, unit

rate_history       -- id, product_id, rate, effective_date

settings           -- key, value (key-value store)
```

---

## 6. License Key System

### Overview
The app will NOT open without a valid, non-expired license key. This is your revenue protection mechanism.

### How it works
```
You hold:  MASTER SECRET  (never in APK, never on GitHub)
APK holds: 3 obfuscated parts of master key (XOR-encoded, split)

Key format: DD-{CLIENT}-{EXPIRY}-{SIGNATURE}
Example:    DD-RAVI-20251231-3A8F92BC

SIGNATURE = first 8 chars of HMAC-SHA256(masterKey, "RAVI|20251231")
```

### Security properties
- **Cannot forge keys** without knowing the master secret
- **Cannot bypass expiry** — app re-verifies on every single launch
- **No localStorage trick** — verification runs every time, not once
- **Key is specific to client** — client name is embedded in key
- **Key expires on a set date** — app shows "expired" screen, client must contact you
- **5-day warning** — banner appears 5 days before expiry

### Generating a key (your workflow)

1. Open `keygen.html` in your browser (Chrome/Edge)
2. Enter your **master secret**: `DUDDAIRY-MASTER-2025-XK92P7MN3Q`
3. Enter client name (e.g. `RAVI` or `NASHIK`)
4. Select duration: 7 / 30 / 90 / 180 / 365 days
5. Click **Generate License Key**
6. Send the key to client via WhatsApp

### What the client sees
- **First launch:** enters key → app opens
- **Every launch:** key silently re-verified (client doesn't notice)
- **5 days before expiry:** yellow banner "key expires in X days"
- **After expiry:** red screen "key expired on DD/MM/YYYY — contact developer"

### Master secret (KEEP SAFE)
```
DUDDAIRY-MASTER-2025-XK92P7MN3Q
```
⚠️ Write this in a notebook. If you lose it, you must rebuild the APK with a new master secret — old client keys will stop working.

---

## 7. Building the APK

### Requirements (your machine)
- Node.js 20+
- Android Studio
- Java JDK 17+
- `ANDROID_HOME` environment variable set

### First-time setup
```bash
npx cap add android
npm run android:sync    # builds web + syncs + patches icons/theme
```

### Build debug APK
```bash
npm run android:sync    # always run this first
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

### Build release APK (for Play Store)
```bash
# First time: create keystore
bash scripts/setup-signing.sh

# Then build
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### After any code change
```bash
npm run android:sync    # this runs: npm run build + npx cap sync android + npm run android:patch
cd android && ./gradlew assembleDebug
```

---

## 8. GitHub Actions — Auto Build

Every push to `master` branch automatically:
1. Installs Node 20 + Android SDK
2. Runs `npm run build` (with license secrets from GitHub Secrets)
3. Runs `npx cap add android` + `npx cap sync android`
4. Runs `npm run android:patch` (copies icons, theme, app name)
5. Runs `./gradlew assembleDebug`
6. Uploads APK to **GitHub Releases** (downloadable link)

**To download the APK:**
1. Go to `github.com/sk1297/dud-dairy-offline`
2. Click **Releases** (right side)
3. Download `dud-dairy-debug.apk`
4. Send to client via WhatsApp / Google Drive

**GitHub Secrets (already set):**
| Secret | Purpose |
|--------|---------|
| `VITE_LK_P1` | Part 1 of obfuscated master key |
| `VITE_LK_P2` | Part 2 of obfuscated master key |
| `VITE_LK_P3` | Part 3 of obfuscated master key |
| `VITE_LK_LEN` | Master key length (for reconstruction) |
| `VITE_LK_VH` | Verification hash |

---

## 9. Google Play Store

See full guide in `PLAY_STORE_GUIDE.md`. Summary:

### Store listing assets (ready)
| Asset | File |
|-------|------|
| App icon 512×512 | `android-assets/store/icon-512x512.png` |
| Feature graphic 1024×500 | `android-assets/store/feature-graphic-1024x500.png` |
| Privacy policy | `public/privacy-policy.html` (host on GitHub Pages) |

### App details for Play Console
```
App name:          Dud Dairy — दूध डेअरी
Short description: दूध डेअरीसाठी डिलिव्हरी, बिल व पेमेंट व्यवस्थापन अॅप
Category:          Business
Content rating:    Everyone
```

### Screenshots needed (take from phone)
1. Delivery page — grid view
2. Customers page — grid cards
3. Bills page — monthly bill
4. Reports page — charts

---

## 10. Icons & Assets

### Regenerate icons (if you change `public/icon.png`)
```bash
node scripts/generate-icons.mjs
node scripts/generate-feature-graphic.mjs
```

### Icon sizes generated
| Folder | Size | Use |
|--------|------|-----|
| `mipmap-mdpi` | 48×48 | Standard launcher |
| `mipmap-hdpi` | 72×72 | Standard launcher |
| `mipmap-xhdpi` | 96×96 | Standard launcher |
| `mipmap-xxhdpi` | 144×144 | Standard launcher |
| `mipmap-xxxhdpi` | 192×192 | Standard launcher |
| `mipmap-anydpi-v26` | adaptive XML | Android 8+ adaptive icon |
| `store/icon-512x512.png` | 512×512 | Play Store listing |

### Icon design rules
- Logo sits in center **72% of canvas** — never touches edges
- Background color: **#065f46** (app green)
- Safe zone: center 66% is always visible on all phone shapes (circle/squircle/square)

---

## 11. Daily Operations — Owner Guide

### Giving app to a new client
1. Download latest APK from GitHub Releases
2. Generate a license key using `keygen.html` (30 days recommended for trial)
3. Send APK via WhatsApp
4. Send license key via WhatsApp separately
5. Client installs → enters key → starts using

### Renewing a client key
1. Open `keygen.html`
2. Enter master secret
3. Enter same client name (e.g. `RAVI`)
4. Select new duration (30/90/365 days)
5. Send new key via WhatsApp before old one expires
6. Client enters new key → app continues working

### Revoking access
- Simply don't give them a renewal key when current one expires
- App automatically locks on expiry date

### Checking if a key is valid
- Open `keygen.html` → the history shows all keys you generated this session
- Keys are not stored anywhere — if you lose a key, generate a new one for the client

---

## 12. Giving App to a New Client

**Complete checklist:**

```
□ Download APK from github.com/sk1297/dud-dairy-offline → Releases
□ Open keygen.html in browser
□ Enter master secret: DUDDAIRY-MASTER-2025-XK92P7MN3Q
□ Enter client name (short, e.g.: RAVI / SHARMA / NASHIK)
□ Select duration (trial: 7 days, paid: 30/90/180/365 days)
□ Click Generate → copy the key
□ Send APK via WhatsApp to client
□ Send license key via WhatsApp to client
□ Client: Settings → Unknown Sources → Install APK → Enter key → Done ✓
```

**WhatsApp message template:**
```
🥛 *Dud Dairy App*

APK install केल्यानंतर हा key टाका:
*[KEY HERE]*

Key valid आहे [X] दिवसांसाठी ([EXPIRY DATE] पर्यंत).
Key संपण्यापूर्वी renewal साठी संपर्क करा.
```

---

## 13. Renewing a Client Key

When a client's key is about to expire or has expired:

1. Open `keygen.html`
2. Master secret → client name → duration → Generate
3. Send new key via WhatsApp:

```
🔑 *Dud Dairy — Key Renewal*

नवीन लायसन्स की:
*[NEW KEY]*

अॅप उघडा → "नवीन की टाका" → key टाका → Done ✓
Valid: [X] दिवस ([EXPIRY DATE] पर्यंत)
```

---

## 14. Troubleshooting

### App shows "invalid key" even though key is correct
- Check the key is typed/pasted correctly — all uppercase, no extra spaces
- Key format must be: `DD-NAME-YYYYMMDD-XXXXXXXX`
- Make sure the APK and the key were generated with the same master secret

### App shows "key expired"
- Generate a new key with `keygen.html` and send to client
- Use same client name as before (or any name — it doesn't have to match)

### GitHub build fails
1. Go to `github.com/sk1297/dud-dairy-offline → Actions`
2. Click the failed run → check error logs
3. Common fixes:
   - `Gradle build failed` → usually a dependency issue — check logs
   - `Secrets missing` → verify all 5 `VITE_LK_*` secrets exist in GitHub Settings

### Build works but app doesn't open / crashes
```bash
# Re-sync everything
npm run android:sync
cd android && ./gradlew clean && ./gradlew assembleDebug
```

### Icon still shows old design after rebuild
- Icons are copied by `android-patch/apply.js` during `npm run android:patch`
- If android folder is fresh (`npx cap add android`), icons are applied automatically
- Manual fix: run `npm run android:patch` after `npx cap sync android`

### PDF not generating
- PDFs use html2canvas which requires the element to be visible in DOM
- On Android WebView, ensure `allowMixedContent: true` in `capacitor.config.json` (already set)

### Database not loading
- Check `src/db/database.js` for schema version — increment `DB_VERSION` if schema changed
- Old installations will auto-migrate if migration SQL is added

---

## 15. Important Files Reference

| File | What it does | Edit when |
|------|-------------|-----------|
| `src/components/LicenseGate.jsx` | License key UI + verification | Never (system is complete) |
| `src/db/database.js` | DB schema + migrations | Adding new tables/columns |
| `capacitor.config.json` | Android app config | Changing appId or appName |
| `android-patch/apply.js` | Copies icons/theme into android/ | Adding new patch files |
| `keygen.html` | Your key generator tool | Never (keep private) |
| `.env` | License secrets | After running setup-master-key.mjs |
| `.github/workflows/build-apk.yml` | CI/CD pipeline | Adding build steps |
| `scripts/generate-icons.mjs` | Icon generator | After changing public/icon.png |
| `PLAY_STORE_GUIDE.md` | Play Store steps | Reference only |
| `public/privacy-policy.html` | Privacy policy page | Updating contact info |

---

## 16. Secrets & Passwords — Master List

> ⚠️ **Print this page and keep it in a safe place. Do not store digitally without encryption.**

### License System
```
Master Secret:    DUDDAIRY-MASTER-2025-XK92P7MN3Q
VITE_LK_P1:      ACAgACAgICByAQ==
VITE_LK_P2:      BSYwATNEQElteQ==
VITE_LK_P3:      aS0vfVM5RTQRfzg=
VITE_LK_LEN:     31
VITE_LK_VH:      cc3251cc3b83ea6b
```

### App Identifiers
```
App ID:           com.duddairy.app
App Name:         Dud Dairy
GitHub Repo:      github.com/sk1297/dud-dairy-offline
GitHub Account:   sk1297
Contact Email:    swapnilks1297@gmail.com
```

### Android Release Signing (fill after creating keystore)
```
Keystore File:    dud-dairy-release.jks
Key Alias:        dud-dairy
Store Password:   [fill when created]
Key Password:     [fill when created]
```

### Google Play Console
```
Account Email:    [fill when registered]
App Package:      com.duddairy.app
```

---

*This document covers everything needed to develop, build, distribute, and maintain the Dud Dairy application. Keep it updated whenever major changes are made.*

# Dud Dairy — APK Build Guide

## Prerequisites
- Node.js 18+
- Android Studio installed (for SDK & build tools)
- Java JDK 17+
- `ANDROID_HOME` environment variable set

---

## First-time Setup

### 1. Add Android platform
```bash
cd dud-dairy-offline
npx cap add android
```

### 2. Place app icons
Copy your icon into all mipmap folders inside `android/app/src/main/res/`:

| Folder | Size |
|---|---|
| `mipmap-mdpi` | 48×48 px |
| `mipmap-hdpi` | 72×72 px |
| `mipmap-xhdpi` | 96×96 px |
| `mipmap-xxhdpi` | 144×144 px |
| `mipmap-xxxhdpi` | 192×192 px |

Filename: `ic_launcher.png` (and `ic_launcher_round.png` for round icons)

> **Tip:** Use Android Studio → `File > New > Image Asset` to auto-generate all sizes from `public/icon.svg`.

### 3. Set app name in `android/app/src/main/res/values/strings.xml`
```xml
<string name="app_name">Dud Dairy</string>
```

---

## Building the APK

### Step 1 — Generate a license key
Open `keygen.html` in a browser → click **Generate New License Key**.

### Step 2 — Update `.env`
Paste the `VITE_APP_KEY_HASH=...` line into the `.env` file in the project root.

### Step 3 — Build web assets
```bash
npm run build
```

### Step 4 — Sync to Android
```bash
npx cap sync android
```

### Step 5 — Build debug APK
```bash
cd android
./gradlew assembleDebug
```
APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Step 6 — Copy APK to output folder
```bash
mkdir -p ../apk-output
cp app/build/outputs/apk/debug/app-debug.apk ../apk-output/dud-dairy-debug.apk
cd ..
```

---

## Sharing with the client

1. Send `apk-output/dud-dairy-debug.apk` via WhatsApp / Google Drive
2. Send the **License Key** (green text from keygen.html) separately
3. Client installs APK → opens app → enters key → activated ✓

---

## Production / Release APK

```bash
cd android
./gradlew assembleRelease
```

For signed release builds, configure `android/app/build.gradle` with your keystore details.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ANDROID_HOME not set` | Add `export ANDROID_HOME=~/Android/Sdk` to `~/.bashrc` |
| `Gradle build failed` | Run `cd android && ./gradlew clean` then retry |
| License key not working | Make sure `.env` was updated **before** `npm run build` |
| App installs but crashes | Check `npx cap sync android` was run after `npm run build` |

---

## Dev key (for testing)

```
Key:  DEV-ONLY-DO-NOT-SHARE
Hash: cfd4037c13a7942d584fae63eb59f31b9a9ccbbfdfc449cd0458d2ef0bd4dad1
```

This key is already baked into the default `.env` — use it for debug/testing only.

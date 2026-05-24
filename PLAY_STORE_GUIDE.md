# Dud Dairy — Google Play Store Publish Guide

## Prerequisites
- Android Studio installed
- Java JDK 17+
- `ANDROID_HOME` environment variable set
- Google Play Console account ($25 one-time fee)

---

## Step 1 — Set Up Android Project (first time only)

```bash
npx cap add android
npx cap sync android
```

---

## Step 2 — Copy App Icons into Android Project

All generated icons are in `android-assets/`. Copy them:

### Launcher icons (all densities)
```
android-assets/launcher/mipmap-mdpi/     → android/app/src/main/res/mipmap-mdpi/
android-assets/launcher/mipmap-hdpi/     → android/app/src/main/res/mipmap-hdpi/
android-assets/launcher/mipmap-xhdpi/    → android/app/src/main/res/mipmap-xhdpi/
android-assets/launcher/mipmap-xxhdpi/   → android/app/src/main/res/mipmap-xxhdpi/
android-assets/launcher/mipmap-xxxhdpi/  → android/app/src/main/res/mipmap-xxxhdpi/
```
Copy both `ic_launcher.png` and `ic_launcher_round.png` from each folder.

### Adaptive icon layers (Android 8+)
```
android-assets/adaptive/mipmap-*/ic_launcher_foreground.png  → same res/ folders
android-assets/adaptive/mipmap-*/ic_launcher_background.png  → same res/ folders
```

### Adaptive icon XML (Android 8+ shape support)
```
android-assets/xml/ic_launcher.xml       → android/app/src/main/res/mipmap-anydpi-v26/
android-assets/xml/ic_launcher_round.xml → android/app/src/main/res/mipmap-anydpi-v26/
```
Create the `mipmap-anydpi-v26/` folder if it doesn't exist.

---

## Step 3 — Update strings.xml

Edit `android/app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">Dud Dairy</string>
    <string name="title_activity_main">Dud Dairy</string>
    <string name="package_name">com.duddairy.app</string>
    <string name="custom_url_scheme">com.duddairy.app</string>
</resources>
```

---

## Step 4 — Create Release Keystore (ONE TIME — keep forever)

```bash
bash scripts/setup-signing.sh
```

**CRITICAL:** Back up `dud-dairy-release.jks` in a safe place (Google Drive, USB drive).
If you lose it, you can NEVER update the app on Play Store.

---

## Step 5 — Configure Signing in build.gradle

Edit `android/app/build.gradle` — add `signingConfigs` and update `buildTypes`:

```gradle
android {
    // ... existing config ...

    signingConfigs {
        release {
            storeFile     file("../../dud-dairy-release.jks")   // path to keystore
            storePassword "YOUR_STORE_PASSWORD"
            keyAlias      "dud-dairy"
            keyPassword   "YOUR_KEY_PASSWORD"
        }
    }

    buildTypes {
        release {
            signingConfig    signingConfigs.release
            minifyEnabled    false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

> **Tip:** Store passwords in environment variables instead of hardcoding:
> ```gradle
> storePassword System.getenv("KEYSTORE_PASSWORD") ?: ""
> keyPassword   System.getenv("KEY_PASSWORD") ?: ""
> ```

---

## Step 6 — Update Version

Edit `android/app/build.gradle`:
```gradle
defaultConfig {
    versionCode 1      // increment by 1 for EVERY upload to Play Store
    versionName "1.0"  // user-visible version
}
```

---

## Step 7 — Build Web Assets + Sync

```bash
npm run build
npx cap sync android
```

---

## Step 8 — Build Release AAB (Play Store requires AAB, not APK)

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

> To also build a signed APK for direct sharing:
> ```bash
> ./gradlew assembleRelease
> # Output: android/app/build/outputs/apk/release/app-release.apk
> ```

---

## Step 9 — Play Console Store Listing

Go to [play.google.com/console](https://play.google.com/console)

### App Details
| Field | Value |
|-------|-------|
| App name | Dud Dairy — दूध डेअरी |
| Short description | दूध डेअरीसाठी डिलिव्हरी, बिल व पेमेंट व्यवस्थापन अॅप |
| Category | Business |
| Tags | dairy, milk, delivery, billing, offline |

### Full Description (copy-paste)
```
Dud Dairy हे दूध डेअरी व्यावसायिकांसाठी एक संपूर्ण व्यवस्थापन अॅप आहे.

✅ मुख्य वैशिष्ट्ये:
• दैनिक दूध डिलिव्हरी नोंदणी (सकाळ + संध्याकाळ)
• ग्राहक व्यवस्थापन — नाव, पत्ता, मोबाइल, दर
• मासिक बिल तयार करणे व PDF शेअर करणे
• पेमेंट नोंदी व थकबाकी ट्रॅकिंग
• विस्तृत अहवाल — डिलिव्हरी, उत्पन्न, ग्राहक विश्लेषण
• बॅकअप व डेटा एक्सपोर्ट

📱 100% Offline — इंटरनेटशिवाय काम करते
🔒 डेटा फक्त आपल्या फोनवर — कोणाशीही शेअर होत नाही
🆓 पूर्णपणे मोफत — कोणत्याही जाहिराती नाहीत

Dud Dairy is a complete management app for milk dairy businesses.
Track daily deliveries, generate monthly bills, record payments,
and view detailed reports — all without internet.
```

### Graphics to Upload
| Asset | File | Where |
|-------|------|-------|
| App icon | `android-assets/store/icon-512x512.png` | Store listing → App icon |
| Feature graphic | `android-assets/store/feature-graphic-1024x500.png` | Store listing → Feature graphic |
| Screenshots | Take from phone/emulator | Store listing → Phone screenshots |

### Screenshots needed (minimum 2, recommended 4-8)
Take screenshots of:
1. Home / Dashboard screen
2. Delivery page (grid view with customers)
3. Bill PDF preview
4. Reports / Analytics screen

### Privacy Policy URL
Host `public/privacy-policy.html` on any free service:
- **GitHub Pages** (recommended): push to repo → enable Pages → use URL
- **Netlify**: drag & drop the `public/` folder
- URL format: `https://YOUR_USERNAME.github.io/dud-dairy-offline/privacy-policy.html`

---

## Step 10 — Content Rating

In Play Console → Policy → App content:
- Answer questionnaire honestly
- Category: **Business**
- No violence, no adult content, no user-generated content
- Expected rating: **Everyone**

---

## Step 11 — Upload & Publish

1. Play Console → Production → Create new release
2. Upload `app-release.aab`
3. Add release notes (Marathi + English):
   ```
   पहिली आवृत्ती — दूध डेअरी व्यवस्थापन अॅप
   First release — Dud Dairy management app
   ```
4. Review → Submit for review
5. Google review takes 1–3 days for first submission

---

## Version Update Workflow (future updates)

```bash
# 1. Make code changes
# 2. Increment versionCode in android/app/build.gradle  (+1 each time)
# 3. Build
npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
# 4. Upload new AAB to Play Console → Production → New release
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Keystore not found` | Check path in build.gradle — use absolute path or relative from android/app/ |
| `Build failed — duplicate class` | `cd android && ./gradlew clean` then rebuild |
| `App rejected — permissions` | Declare permission usage in Play Console app content section |
| `Icon not showing` | Verify mipmap-anydpi-v26 XML files are in place |
| `White/blank splash` | Add `@color/ic_launcher_background` to colors.xml |

---

## Files Summary

```
android-assets/
├── launcher/          ← Standard ic_launcher.png for all densities
│   ├── mipmap-mdpi/
│   ├── mipmap-hdpi/
│   ├── mipmap-xhdpi/
│   ├── mipmap-xxhdpi/
│   └── mipmap-xxxhdpi/
├── adaptive/          ← ic_launcher_foreground + ic_launcher_background
│   └── mipmap-*/
├── notification/      ← ic_stat_notify.png (white silhouette)
│   └── mipmap-*/
├── xml/               ← adaptive-icon XML files (for mipmap-anydpi-v26/)
│   ├── ic_launcher.xml
│   └── ic_launcher_round.xml
└── store/
    ├── icon-512x512.png           ← Play Store app icon
    └── feature-graphic-1024x500.png  ← Play Store feature graphic

scripts/
├── generate-icons.mjs         ← Re-run if you change icon.png
├── generate-feature-graphic.mjs
└── setup-signing.sh           ← Run ONCE to create keystore
```

#!/bin/bash
# setup-signing.sh — Create release keystore for Play Store signed builds
# Run this ONCE and keep the .jks file + passwords SAFE FOREVER
# If you lose the keystore you CANNOT update your app on Play Store

set -e

KEYSTORE_FILE="dud-dairy-release.jks"
KEY_ALIAS="dud-dairy"
VALIDITY_DAYS=10000   # ~27 years

echo "======================================================"
echo "  Dud Dairy — Release Keystore Generator"
echo "======================================================"
echo ""
echo "This creates your permanent app signing key."
echo "IMPORTANT: Back up the generated .jks file and remember the passwords!"
echo ""

# Check keytool
if ! command -v keytool &> /dev/null; then
  echo "ERROR: keytool not found. Install Java JDK 17+ first."
  exit 1
fi

if [ -f "$KEYSTORE_FILE" ]; then
  echo "WARNING: $KEYSTORE_FILE already exists. Delete it first if you want a new key."
  exit 1
fi

keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity $VALIDITY_DAYS

echo ""
echo "======================================================"
echo "  ✅  Keystore created: $KEYSTORE_FILE"
echo "======================================================"
echo ""
echo "Next: Add signing config to android/app/build.gradle"
echo "See PLAY_STORE_GUIDE.md for exact steps."

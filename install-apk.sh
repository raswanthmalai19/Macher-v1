#!/bin/bash

# 🛡️ MACHER APK Installation Script
# Installs the real mode APK on your Android phone via ADB

set -e

APK_PATH="/Users/raswanthmalaisamy/Downloads/AIDEA/android/app/build/outputs/apk/debug/app-debug.apk"
APP_PACKAGE="com.macher.android"

echo "🛡️  MACHER Real Mode Installation"
echo "=================================="
echo ""

# Check if APK exists
if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK not found at: $APK_PATH"
    echo "Please build first: cd /Users/raswanthmalaisamy/Downloads/AIDEA/android && ./gradlew assembleDebug"
    exit 1
fi

# Check if adb is available
if ! command -v adb &> /dev/null; then
    echo "❌ adb not found. Install Android SDK platform tools:"
    echo "   https://developer.android.com/studio/command-line/adb"
    exit 1
fi

echo "✅ APK found: $(ls -lh $APK_PATH | awk '{print $5}')"
echo ""

# Check for connected devices
echo "Checking for connected Android devices..."
DEVICES=$(adb devices | grep -v "^List" | grep -v "^$" | wc -l)

if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No Android devices connected!"
    echo ""
    echo "Please:"
    echo "  1. Connect your Android phone via USB"
    echo "  2. Enable Developer Mode (Settings > About > tap Build number 7x)"
    echo "  3. Enable USB Debugging (Settings > Developer options > USB Debugging)"
    echo "  4. Answer 'Allow USB Debugging' on your phone"
    echo "  5. Run this script again"
    exit 1
fi

echo "✅ Device(s) found:"
adb devices -l | grep -v "List" | grep -v "^$" | sed 's/^/   /'
echo ""

# Uninstall old version if exists
echo "🔄 Checking for existing installation..."
if adb shell pm list packages | grep -q "$APP_PACKAGE"; then
    echo "  Found old version. Uninstalling..."
    adb uninstall "$APP_PACKAGE" || true
fi

echo ""
echo "📱 Installing MACHER on your device..."
adb install -r "$APK_PATH"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation successful!"
    echo ""
    echo "🚀 Next steps:"
    echo "  1. Look for 'MACHER' app on your phone (shield icon)"
    echo "  2. Tap to launch"
    echo "  3. Grant all requested permissions"
    echo "  4. Follow REAL_MODE_TESTING_GUIDE.md for complete testing"
    echo ""
    echo "📊 Monitor real-time logs:"
    echo "   adb logcat -s MACHER"
    echo ""
else
    echo ""
    echo "❌ Installation failed"
    exit 1
fi

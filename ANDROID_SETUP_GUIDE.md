# Android Development Setup Guide for Mac

## Prerequisites

Your Mac (M1/M2/M3 or Intel) can build and test Android apps. Here's how:

---

## Part 1: Install Android Studio (30 minutes)

### 1. Download Android Studio

```bash
# Open your browser and go to:
# https://developer.android.com/studio

# Download "Android Studio for Mac" (Apple Silicon or Intel)
# File will be: android-studio-{version}-mac_arm.dmg (for M1/M2/M3)
# or: android-studio-{version}-mac.dmg (for Intel)
```

### 2. Install Android Studio

```bash
# 1. Open the downloaded .dmg file
# 2. Drag "Android Studio" to Applications folder
# 3. Open Android Studio from Applications
# 4. Follow the setup wizard:
#    - Choose "Standard" installation
#    - Accept licenses
#    - Let it download SDK components (this takes 10-15 minutes)
```

### 3. Configure Android SDK

Android Studio will automatically install:
- Android SDK Platform 34 (Android 14)
- Android SDK Build-Tools
- Android Emulator
- Android SDK Platform-Tools (adb, fastboot)

**SDK Location**: `/Users/YOUR_USERNAME/Library/Android/sdk`

---

## Part 2: Open VocalShield Project (5 minutes)

### 1. Open the Android Project

```bash
# In Android Studio:
# File → Open → Navigate to your project
# Select: /path/to/MACHER/android/
# Click "Open"

# Android Studio will:
# - Sync Gradle (5-10 minutes first time)
# - Download dependencies
# - Index the project
```

### 2. Wait for Gradle Sync

You'll see progress at the bottom:
```
Gradle sync in progress...
Downloading dependencies...
Building project...
```

**This is normal and takes 5-10 minutes the first time.**

---

## Part 3: Set Up Testing Options

You have 3 options to test your app:

### Option A: Android Emulator (Easiest, No Phone Needed)

**Pros**: No physical device needed, fast setup  
**Cons**: Can't test real phone calls, slower than real device

```bash
# In Android Studio:
# Tools → Device Manager → Create Device

# Choose:
# - Phone: Pixel 6 or Pixel 7
# - System Image: API 34 (Android 14) - Download if needed
# - Click "Finish"

# Start the emulator:
# Click the "Play" button next to your virtual device
```

**Note**: Emulator can't make real phone calls, so you can only test the UI and basic functionality.

### Option B: Physical Android Phone (Best for Real Testing)

**Pros**: Real device, can test actual phone calls  
**Cons**: Requires USB cable and phone setup

#### Enable Developer Mode on Your Phone:

```bash
# On your Android phone:
# 1. Go to Settings → About Phone
# 2. Tap "Build Number" 7 times (you'll see "You are now a developer!")
# 3. Go back to Settings → System → Developer Options
# 4. Enable "USB Debugging"
# 5. Connect phone to Mac via USB cable
# 6. On phone, tap "Allow" when prompted for USB debugging
```

#### Verify Connection:

```bash
# In Terminal on Mac:
cd ~/Library/Android/sdk/platform-tools
./adb devices

# You should see:
# List of devices attached
# ABC123XYZ    device
```

### Option C: Wireless Debugging (No Cable Needed)

**Pros**: No cable needed after initial setup  
**Cons**: Requires Android 11+ and same WiFi network

```bash
# On your Android phone (Android 11+):
# 1. Settings → Developer Options → Wireless Debugging → ON
# 2. Tap "Pair device with pairing code"
# 3. Note the IP address and pairing code

# On Mac Terminal:
cd ~/Library/Android/sdk/platform-tools
./adb pair <IP_ADDRESS>:<PORT>
# Enter the pairing code when prompted

./adb connect <IP_ADDRESS>:<PORT>

# Verify:
./adb devices
# Should show your device
```

---

## Part 4: Build the APK (10 minutes)

### Method 1: Build from Android Studio (Recommended)

```bash
# In Android Studio:
# 1. Build → Build Bundle(s) / APK(s) → Build APK(s)
# 2. Wait for build to complete (5-10 minutes first time)
# 3. Click "locate" in the notification to find the APK

# APK location:
# /path/to/MACHER/android/app/build/outputs/apk/debug/app-debug.apk
```

### Method 2: Build from Command Line

```bash
# Navigate to android directory:
cd /path/to/MACHER/android

# Build debug APK:
./gradlew assembleDebug

# APK will be at:
# app/build/outputs/apk/debug/app-debug.apk
```

### Method 3: Build Release APK (For Distribution)

```bash
# First, create a keystore (one-time setup):
keytool -genkey -v -keystore vocalshield-release.keystore \
  -alias vocalshield -keyalg RSA -keysize 2048 -validity 10000

# You'll be prompted for:
# - Keystore password (remember this!)
# - Your name, organization, etc.

# Build release APK:
cd /path/to/MACHER/android
./gradlew assembleRelease

# Sign the APK:
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore vocalshield-release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  vocalshield

# Verify signature:
jarsigner -verify -verbose -certs \
  app/build/outputs/apk/release/app-release-unsigned.apk
```

---

## Part 5: Install and Test the APK

### Install on Emulator

```bash
# Start the emulator in Android Studio
# Then drag and drop the APK file onto the emulator window
# OR use adb:

cd ~/Library/Android/sdk/platform-tools
./adb install /path/to/MACHER/android/app/build/outputs/apk/debug/app-debug.apk

# If already installed:
./adb install -r /path/to/MACHER/android/app/build/outputs/apk/debug/app-debug.apk
```

### Install on Physical Device

```bash
# Make sure device is connected:
./adb devices

# Install APK:
./adb install /path/to/MACHER/android/app/build/outputs/apk/debug/app-debug.apk

# If already installed (reinstall):
./adb install -r /path/to/MACHER/android/app/build/outputs/apk/debug/app-debug.apk
```

### Launch the App

```bash
# On device/emulator, find "VocalShield" app and tap to open

# OR launch from command line:
./adb shell am start -n com.vocalshield/.MainActivity
```

---

## Part 6: Enable Accessibility Service (Critical!)

Your app needs Accessibility Service permission to capture call audio.

### On Device/Emulator:

```bash
# 1. Open VocalShield app
# 2. App will prompt for Accessibility permission
# 3. Tap "Enable" → Opens Settings
# 4. Find "VocalShield" in the list
# 5. Toggle ON
# 6. Tap "Allow" on the warning dialog
# 7. Go back to the app
```

### Verify Accessibility Service:

```bash
# Check if service is running:
./adb shell dumpsys accessibility | grep VocalShield

# You should see:
# Service[label=VocalShield Audio Capture,...]
```

---

## Part 7: Test the App

### Test 1: Basic UI Test (Emulator or Device)

```bash
# 1. Open VocalShield app
# 2. Grant Accessibility permission
# 3. Toggle "Monitoring Enabled" ON
# 4. Check that UI shows:
#    - Green indicator (Safe)
#    - "Monitoring Active" status
#    - Connection status
```

### Test 2: Settings Test

```bash
# 1. Tap Settings icon
# 2. Toggle various settings:
#    - Haptic Feedback
#    - Notifications
#    - Transcription Display
# 3. Verify settings persist after app restart
```

### Test 3: Call History Test

```bash
# 1. Tap Call History icon
# 2. Should show empty list (no calls yet)
# 3. Tap "Clear History" (should do nothing)
```

### Test 4: Real Call Test (Physical Device Only)

**WARNING**: This is the critical test that may not work!

```bash
# 1. Make sure VocalShield is running
# 2. Make sure Monitoring is ON
# 3. Call your phone from another phone
# 4. Answer the call
# 5. Speak into the phone
# 6. Check if VocalShield:
#    - Captures audio (check logs)
#    - Sends to AWS (check CloudWatch)
#    - Shows transcription (if enabled)
#    - Updates threat level
```

### Check Logs During Call:

```bash
# In another terminal, watch logs:
./adb logcat | grep VocalShield

# Look for:
# - "Audio capture started"
# - "WebSocket connected"
# - "Audio chunk sent"
# - "Transcription received"
# - "Fraud analysis result"
```

---

## Part 8: Debugging Common Issues

### Issue 1: Gradle Sync Failed

```bash
# Error: "Gradle sync failed"
# Solution:
# 1. File → Invalidate Caches → Invalidate and Restart
# 2. Wait for Android Studio to restart
# 3. Let Gradle sync again
```

### Issue 2: SDK Not Found

```bash
# Error: "SDK location not found"
# Solution:
# 1. Create local.properties file:
cd /path/to/MACHER/android
echo "sdk.dir=/Users/$(whoami)/Library/Android/sdk" > local.properties

# 2. Sync Gradle again
```

### Issue 3: Build Failed - Missing Dependencies

```bash
# Error: "Could not resolve dependency"
# Solution:
# 1. Check internet connection
# 2. In Android Studio: File → Sync Project with Gradle Files
# 3. If still fails, try:
./gradlew clean
./gradlew build --refresh-dependencies
```

### Issue 4: APK Install Failed

```bash
# Error: "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
# Solution: Uninstall old version first
./adb uninstall com.vocalshield
./adb install app-debug.apk

# Error: "INSTALL_FAILED_INSUFFICIENT_STORAGE"
# Solution: Free up space on device
./adb shell pm clear com.android.vending  # Clear Play Store cache
```

### Issue 5: Accessibility Service Not Working

```bash
# Problem: Can't capture audio during calls
# This is the BIGGEST RISK - many devices block this

# Check if service is enabled:
./adb shell settings get secure enabled_accessibility_services

# Should include: com.vocalshield/.AudioCaptureService

# If not working:
# 1. Try different device (Pixel phones work best)
# 2. Check Android version (need 8.0+)
# 3. Check manufacturer restrictions (Samsung, Xiaomi often block)
```

### Issue 6: WebSocket Connection Failed

```bash
# Problem: Can't connect to AWS
# Check logs:
./adb logcat | grep WebSocket

# Common causes:
# 1. No internet connection
# 2. Wrong WebSocket URL
# 3. AWS API Gateway not deployed
# 4. Authentication token missing/invalid

# Test WebSocket URL manually:
# Use a WebSocket testing tool to verify the endpoint works
```

---

## Part 9: Performance Testing

### Check Battery Drain:

```bash
# Before test:
./adb shell dumpsys battery

# Run app for 30 minutes with monitoring ON
# After test:
./adb shell dumpsys battery

# Compare battery level - should not drain >10% in 30 min
```

### Check Memory Usage:

```bash
# While app is running:
./adb shell dumpsys meminfo com.vocalshield

# Look for:
# - Total PSS: Should be <100 MB
# - Native Heap: Should be <50 MB
```

### Check CPU Usage:

```bash
# While app is running:
./adb shell top | grep vocalshield

# CPU usage should be <5% when idle
# CPU usage should be <20% during active call
```

---

## Part 10: Export APK for Testing on Other Devices

### Share APK via ADB:

```bash
# Pull APK from device:
./adb pull /data/app/com.vocalshield-*/base.apk vocalshield.apk

# Or use the built APK:
cp android/app/build/outputs/apk/debug/app-debug.apk ~/Desktop/VocalShield.apk
```

### Share APK via Cloud:

```bash
# Upload to Google Drive, Dropbox, or email
# Others can download and install via:
# 1. Enable "Install from Unknown Sources" in Settings
# 2. Download APK
# 3. Tap to install
```

---

## Quick Reference Commands

```bash
# Build APK
cd /path/to/MACHER/android
./gradlew assembleDebug

# Install APK
./adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
./adb shell am start -n com.vocalshield/.MainActivity

# View logs
./adb logcat | grep VocalShield

# Uninstall app
./adb uninstall com.vocalshield

# Check connected devices
./adb devices

# Restart adb
./adb kill-server
./adb start-server
```

---

## Next Steps After Building APK

1. ✅ Build APK successfully
2. ✅ Install on device/emulator
3. ✅ Grant Accessibility permission
4. ✅ Test basic UI functionality
5. ⚠️ Test audio capture during real call (HIGH RISK)
6. ⚠️ Test WebSocket connection to AWS
7. ⚠️ Test end-to-end fraud detection
8. 🎯 If all works → Create demo video
9. 🎯 If audio fails → Pivot to alternative approach

---

## Troubleshooting Resources

- **Android Studio Issues**: https://developer.android.com/studio/troubleshoot
- **ADB Commands**: https://developer.android.com/studio/command-line/adb
- **Accessibility Service**: https://developer.android.com/guide/topics/ui/accessibility/service
- **VocalShield Logs**: Check CloudWatch Logs in AWS Console

---

**Good luck! The moment of truth is when you test audio capture during a real call. That's where we'll know if this approach works or if we need to pivot.**

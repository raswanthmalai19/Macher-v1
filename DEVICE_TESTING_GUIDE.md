# MACHER - Device Testing Guide

**Date**: March 1, 2026  
**Version**: 1.0.0  
**Target**: Android 8.0+ (API 26+)

---

## Prerequisites

### Hardware Requirements
- Android device (phone or tablet)
- Android 8.0 (Oreo) or higher
- Microphone access
- Internet connection (WiFi or cellular)

### Software Requirements
- Android Studio installed on Mac
- ADB (Android Debug Bridge) configured
- USB cable for device connection
- MACHER APK built successfully

---

## Step 1: Enable Developer Mode on Android Device

### On Your Android Device:
1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times
3. You'll see "You are now a developer!"
4. Go back to **Settings** → **System** → **Developer Options**
5. Enable **USB Debugging**
6. Enable **Install via USB** (if available)

---

## Step 2: Connect Device to Mac

### Connect via USB:
```bash
# Connect your Android device to Mac via USB cable
# On device, tap "Allow USB debugging" when prompted

# Verify connection
adb devices

# Expected output:
# List of devices attached
# ABC123XYZ    device
```

### Troubleshooting Connection:
```bash
# If device not showing
adb kill-server
adb start-server
adb devices

# If "unauthorized" appears
# Unplug device, revoke USB debugging authorizations on device, reconnect
```

---

## Step 3: Install MACHER APK

### Option A: Install via ADB
```bash
cd android
./gradlew assembleDebug

# Install APK
adb install app/build/outputs/apk/debug/app-debug.apk

# If already installed, use -r to reinstall
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Option B: Install via Android Studio
1. Open Android Studio
2. Open the `android` folder
3. Click **Run** → **Run 'app'**
4. Select your connected device
5. Wait for installation

### Verify Installation:
```bash
# Check if app is installed
adb shell pm list packages | grep macher

# Expected output:
# package:com.macher.android
```

---

## Step 4: Grant Required Permissions

### Launch App and Grant Permissions:

1. **Open MACHER** on your device
2. Complete onboarding flow
3. Select role (Protected or Guardian)

### Grant Permissions Manually:
Go to **Settings** → **Apps** → **MACHER** → **Permissions**

**Required Permissions:**
- ✅ **Microphone** - For audio capture
- ✅ **Phone** - For call state detection
- ✅ **SMS** - For Family Loop alerts
- ✅ **Notifications** - For threat alerts

**Special Permissions:**
- ✅ **Display over other apps** - For scam warning overlay
  - Settings → Apps → Special app access → Display over other apps → MACHER → Allow

---

## Step 5: Configure AWS Backend (Real Mode)

### Update Configuration:
Edit `android/app/src/main/java/com/macher/android/util/Config.kt`:

```kotlin
object Config {
    // Replace with your AWS WebSocket URL
    const val WEBSOCKET_URL = "wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production"
    
    // Replace with your REST API URL
    const val REST_API_URL = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production"
    
    // Set to false for real AWS backend testing
    const val DEMO_MODE = false
    
    // Keep other settings as-is
}
```

### Rebuild and Reinstall:
```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Step 6: Testing Scenarios

### Test 1: Demo Mode (No AWS Required)

**Purpose**: Verify UI and intervention system

**Steps:**
1. Ensure `DEMO_MODE = true` in Config.kt
2. Launch app
3. Select **Protected** role
4. Tap **START MONITORING**
5. Observe:
   - Connection status changes to "Connected"
   - Transcription appears after 2 seconds
   - Threat level changes from SAFE → CAUTION → DANGER
   - Haptic feedback triggers (phone vibrates)
   - Screen overlay appears with warning

**Expected Results:**
- ✅ Smooth animations
- ✅ Traffic light indicator changes color
- ✅ Transcription updates in real-time
- ✅ Haptic feedback at CAUTION level
- ✅ Screen overlay at DANGER level
- ✅ All UI elements visible and responsive

---

### Test 2: Real Mode with AWS Backend

**Purpose**: Verify end-to-end AWS integration

**Prerequisites:**
- AWS infrastructure deployed
- WebSocket URL configured
- `DEMO_MODE = false`

**Steps:**
1. Launch app
2. Select **Protected** role
3. Tap **START MONITORING**
4. Speak into microphone: "Hello, this is a test"
5. Observe:
   - WebSocket connection established
   - Audio streaming indicator active
   - Transcription appears
   - Threat analysis results

**Expected Results:**
- ✅ WebSocket connects within 2 seconds
- ✅ Audio level indicator shows activity
- ✅ Transcription appears within 1 second
- ✅ Threat level updates based on content
- ✅ No crashes or errors

---

### Test 3: Guardian Mode Features

**Purpose**: Verify Guardian dashboard functionality

**Steps:**
1. Launch app
2. Select **Guardian** role
3. Navigate through all screens:
   - Dashboard
   - Trusted Contacts
   - Alert History
   - Settings

**Test Actions:**
- Add a trusted contact
- View alert history
- Adjust sensitivity slider
- Toggle feature switches
- Navigate back and forth

**Expected Results:**
- ✅ All screens load without errors
- ✅ Navigation works smoothly
- ✅ Data persists after app restart
- ✅ UI is responsive and beautiful

---

### Test 4: Family Loop Alerting

**Purpose**: Verify notification and SMS system

**Prerequisites:**
- SMS permission granted
- Notification permission granted
- Guardian phone number configured

**Steps:**
1. Trigger high threat in Protected mode
2. Check notifications
3. Check SMS (if configured)

**Expected Results:**
- ✅ Local notification appears
- ✅ Notification has correct threat info
- ✅ SMS sent to guardian (if configured)
- ✅ Message content is clear and actionable

---

### Test 5: Progressive Intervention System

**Purpose**: Verify all 3 intervention levels

**Test Level 1 (Haptic):**
- Trigger CAUTION threat
- Feel phone vibrate (3 sharp buzzes)

**Test Level 2 (Overlay):**
- Trigger DANGER threat (confidence > 70%)
- See full-screen red warning overlay
- Tap "I'm Safe" to dismiss
- Tap "Hang Up" to disconnect

**Test Level 3 (Auto Disconnect):**
- Enable in Guardian settings
- Trigger DANGER threat (confidence > 85%)
- Call should disconnect automatically

**Expected Results:**
- ✅ Level 1: Vibration pattern correct
- ✅ Level 2: Overlay appears and dismisses
- ✅ Level 3: Call disconnects (if enabled)

---

## Step 7: Performance Testing

### Latency Measurement

**Monitor Logs:**
```bash
# View real-time logs
adb logcat | grep MACHER

# Filter for performance metrics
adb logcat | grep "MACHER.*latency"
```

**Key Metrics:**
- Audio capture latency: <150ms
- WebSocket round-trip: <200ms
- Transcription latency: <1000ms
- Threat detection: <2000ms
- Total end-to-end: <500ms (target)

### Battery Usage

**Test Duration:** 30 minutes of active monitoring

**Monitor Battery:**
```bash
# Check battery stats
adb shell dumpsys battery

# Monitor power usage
adb shell dumpsys batterystats | grep macher
```

**Target:** <5% battery drain per hour

---

## Step 8: Error Scenarios

### Test Network Interruption
1. Start monitoring
2. Enable airplane mode
3. Observe reconnection behavior
4. Disable airplane mode
5. Verify automatic reconnection

**Expected:**
- ✅ Connection state shows "ERROR"
- ✅ Automatic reconnection attempts
- ✅ Successful reconnection within 30 seconds

### Test Permission Denial
1. Revoke microphone permission
2. Try to start monitoring
3. Observe error handling

**Expected:**
- ✅ Clear error message
- ✅ Prompt to grant permission
- ✅ No app crash

### Test Low Memory
1. Open many apps
2. Start MACHER monitoring
3. Switch between apps

**Expected:**
- ✅ App remains responsive
- ✅ Monitoring continues in background
- ✅ No data loss

---

## Step 9: Debugging

### View Logs in Real-Time:
```bash
# All MACHER logs
adb logcat | grep MACHER

# Specific components
adb logcat | grep "WebSocketClient"
adb logcat | grep "AudioCaptureService"
adb logcat | grep "MonitoringManager"
adb logcat | grep "InterventionEngine"
```

### Save Logs to File:
```bash
# Capture logs during testing
adb logcat > macher_test_logs.txt

# Filter and save
adb logcat | grep MACHER > macher_filtered.txt
```

### Check Crash Reports:
```bash
# View crash logs
adb logcat | grep "AndroidRuntime"

# Check for exceptions
adb logcat | grep "Exception"
```

---

## Step 10: Screen Recording for Demo

### Record Device Screen:
```bash
# Start recording (max 3 minutes)
adb shell screenrecord /sdcard/macher_demo.mp4

# Stop recording (Ctrl+C)

# Pull video to Mac
adb pull /sdcard/macher_demo.mp4 ~/Desktop/

# Delete from device
adb shell rm /sdcard/macher_demo.mp4
```

### Recording Tips:
- Clean up device home screen
- Close unnecessary apps
- Enable "Show taps" in Developer Options
- Disable notifications from other apps
- Use landscape orientation for better viewing
- Prepare script before recording

---

## Common Issues & Solutions

### Issue: App Crashes on Launch
**Solution:**
```bash
# Clear app data
adb shell pm clear com.macher.android

# Reinstall
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Issue: WebSocket Won't Connect
**Solution:**
- Check AWS URL in Config.kt
- Verify internet connection
- Check AWS infrastructure is deployed
- Review logs for connection errors

### Issue: No Audio Capture
**Solution:**
- Verify microphone permission granted
- Check AudioRecord initialization in logs
- Test with another audio recording app
- Restart device

### Issue: Overlay Not Showing
**Solution:**
- Grant "Display over other apps" permission
- Check overlay service is running
- Review InterventionEngine logs

### Issue: SMS Not Sending
**Solution:**
- Verify SMS permission granted
- Check phone number format
- Test SMS with another app
- Review FamilyLoopService logs

---

## Test Checklist

### Pre-Testing
- [ ] Device connected via ADB
- [ ] Developer mode enabled
- [ ] USB debugging enabled
- [ ] APK built successfully
- [ ] AWS infrastructure deployed (for real mode)

### Functional Testing
- [ ] Onboarding flow works
- [ ] Role selection works
- [ ] Protected mode monitoring works
- [ ] Guardian dashboard loads
- [ ] Trusted contacts CRUD works
- [ ] Alert history displays
- [ ] Settings persist

### Integration Testing
- [ ] WebSocket connects
- [ ] Audio streams to AWS
- [ ] Transcription displays
- [ ] Threat detection works
- [ ] Interventions trigger
- [ ] Family Loop alerts work

### Performance Testing
- [ ] Latency <500ms
- [ ] Battery drain <5%/hour
- [ ] No memory leaks
- [ ] Smooth animations
- [ ] Responsive UI

### Error Handling
- [ ] Network interruption handled
- [ ] Permission denial handled
- [ ] Low memory handled
- [ ] Invalid input handled
- [ ] AWS errors handled

---

## Success Criteria

### Must Pass
- ✅ App launches without crashes
- ✅ All permissions can be granted
- ✅ Demo mode works end-to-end
- ✅ UI is responsive and beautiful
- ✅ Navigation works smoothly

### Should Pass
- ✅ Real mode connects to AWS
- ✅ Audio capture works
- ✅ Transcription appears
- ✅ Threat detection works
- ✅ Interventions trigger correctly

### Nice to Have
- ✅ Latency under 500ms
- ✅ Battery drain under 5%/hour
- ✅ No memory leaks
- ✅ Smooth 60fps animations

---

## Next Steps After Testing

1. **Document Issues** - Create list of bugs found
2. **Fix Critical Bugs** - Address any crashes or major issues
3. **Optimize Performance** - Improve latency if needed
4. **Create Demo Video** - Record polished demo
5. **Update Documentation** - Add testing results
6. **Prepare Submission** - Package for competition

---

**Testing Status**: Ready to Begin  
**Estimated Time**: 2-4 hours  
**Priority**: High (Required for competition)


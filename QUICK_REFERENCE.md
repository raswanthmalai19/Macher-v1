# 🛡️ MACHER Quick Reference - Real Mode Testing

## ⚡ FASTEST WAY TO TEST (3 Steps)

### Step 1: Install APK
```bash
# On your Mac terminal:
chmod +x /Users/raswanthmalaisamy/Downloads/AIDEA/install-apk.sh
/Users/raswanthmalaisamy/Downloads/AIDEA/install-apk.sh
```

**What the script does**:
✅ Checks for connected Android device  
✅ Uninstalls old version (if exists)  
✅ Installs MACHER APK  
✅ Shows success message  

---

### Step 2: Launch on Phone
1. Look for **MACHER** app icon (blue shield) on your phone
2. Tap to open
3. Grant permissions when prompted
4. You should see: **"🛡️ Protection active. Monitoring incoming calls..."**

---

### Step 3: Test Complete Flow
1. **Tap "START MONITORING"** button (top)
   - Shield turns green
   - Status: Armed mode ✅

2. **Have friend call you**
   - App auto-detects call ✅
   - Transcription shows live text ✅
   - Threat level displayed ✅

3. **Friend says scam content** (test text below)
   - Real-time analysis runs ✅
   - Threat rises to DANGER ✅
   - Call auto-hangs up ✅
   - Guardian SMS received ✅

---

## 📞 Test Call Scripts

### Script A: Danger (Will Auto-Disconnect)
```
"This is urgent from the IRS Tax Department. We've detected fraud 
on your account. Immediate legal action will be taken if you don't 
verify your information right now. What is your social security number?"
```
**Expected**: Auto-disconnect, red alert, SMS sent ✅

---

### Script B: Caution (Will Show Warning)
```
"Hi, this is your bank calling to verify some transactions. 
Can you confirm your PIN and mother's maiden name to proceed?"
```
**Expected**: Yellow overlay appears, no disconnect ✅

---

### Script C: Safe (Normal Call)
```
"Hey, how are you doing? I'm calling from the office. 
Did you get my email about the meeting tomorrow?"
```
**Expected**: Green, no alerts, normal call ✅

---

## 🔍 Real-Time Monitoring

### Watch Live Logs (While Testing)
```bash
# Terminal command (keep running):
adb logcat -s "MACHER" -v brief

# Key events to watch for:
✅ "Call offhook — starting real monitoring"
✅ "Connected to WebSocket"
✅ "Transcription: [live text appears]"
✅ "Threat level: DANGER"
✅ "Level 3: Autonomous disconnect"
✅ "Guardian alert sent"
```

---

## 🎯 Testing Checklist

### Before Test:
- [ ] Phone connected to internet (WiFi or 4G)
- [ ] Phone unlocked and screen on
- [ ] MACHER app installed and open
- [ ] "START MONITORING" button tapped (green armed mode)
- [ ] Terminal running `adb logcat` (optional but helpful)

### During Danger Test:
- [ ] Call received and answered ✅
- [ ] Audio waveform shows levels ✅
- [ ] Transcription updates in real-time ✅
- [ ] Threat indicator changes ✅
- [ ] Call auto-disconnects after scam detected ✅
- [ ] Red overlay appears briefly ✅
- [ ] Haptic feedback felt (3 pulses) ✅

### After Test:
- [ ] Check phone for SMS from guardian
- [ ] Check logs for all success messages
- [ ] Tap "STOP MONITORING" to disable
- [ ] App returns to standby mode ✅

---

## 🚀 Expected First Test Results

| Component | Expected | Time |
|-----------|----------|------|
| Call Detection | Auto (OFFHOOK) | <1s |
| WebSocket Connect | Connected (green) | 1-2s |
| Audio Streaming | Waveform appears | 0.5s |
| Transcription | Text appears | 1-3s (lag) |
| Scam Pattern Detection | Rising threat | 3-5s |
| HIGH Risk + Conf ≥0.8 | Auto-disconnect | 2-4s |
| Guardian SMS | Received | 5-10s |
| **Total Response Time** | **~10-20s** | ✅ |

---

## 🐛 Quick Fixes

| Problem | Solution |
|---------|----------|
| "Device not found" | `adb devices -l` then restart ADB: `adb killed-server` |
| "Permission denied" | Grant via Settings > Apps > MACHER > Permissions |
| "Can't connect to AWS" | Check WiFi, verify backend is running |
| "Call not detected" | Ensure "START MONITORING" tapped (armed mode) |
| "No auto-disconnect" | Check ANSWER_PHONE_CALLS permission |
| "SMS not received" | Set guardian phone in Settings, grant SMS perm |

---

## 📊 File Locations

| File | Path | Purpose |
|------|------|---------|
| **APK** | `/Downloads/AIDEA/android/app/build/outputs/apk/debug/app-debug.apk` | Install on phone |
| **Install Script** | `/Downloads/AIDEA/install-apk.sh` | Automate installation |
| **Testing Guide** | `/Downloads/AIDEA/REAL_MODE_TESTING_GUIDE.md` | Detailed test cases |
| **This File** | `/Downloads/AIDEA/QUICK_REFERENCE.md` | Quick start |
| **Config** | `/android/app/src/main/java/com/macher/android/util/Config.kt` | AWS URLs (verified ✅) |

---

## 🎬 Command Reference

```bash
# Install automatically:
/Users/raswanthmalaisamy/Downloads/AIDEA/install-apk.sh

# Manual install:
adb install -r /Users/raswanthmalaisamy/Downloads/AIDEA/android/app/build/outputs/apk/debug/app-debug.apk

# Watch logs:
adb logcat -s "MACHER"

# Uninstall:
adb uninstall com.macher.android

# List installed apps:
adb shell pm list packages | grep macher

# Clear app data:
adb shell pm clear com.macher.android
```

---

## ℹ️ Important Config (Already Set)

✅ **DEMO_MODE** = `false` (Real mode enabled)  
✅ **WEBSOCKET_URL** = `wss://mg1nazug3m.execute-api.us-east-1.amazonaws.com/dev` (AWS live)  
✅ **REST_API_URL** = `https://mg1nazug3m.execute-api.us-east-1.amazonaws.com/dev` (AWS live)  
✅ **AUTO_DISCONNECT** = `true` (Default enabled)  
✅ **AUDIO_CONFIG** = 16kHz PCM mono (AWS-ready)  

---

## 🏁 Success Indicators

You'll know it's working when:
1. ✅ App starts without errors
2. ✅ Shield shows "Active" with green color
3. ✅ Phone calls auto-detected (no manual action needed)
4. ✅ Transcription shows live text real-time
5. ✅ Threat levels change as you speak
6. ✅ Danger calls auto-disconnect within 10-20 seconds
7. ✅ Guardian phone receives SMS alerts
8. ✅ App smoothly returns to armed mode after call
9. ✅ Multiple calls in sequence work properly

---

## ❓ Still Have Questions?

See the full guide: `REAL_MODE_TESTING_GUIDE.md`

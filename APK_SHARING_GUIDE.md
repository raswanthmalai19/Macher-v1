# MACHER APK - Sharing & Installation Guide

**APK Location**: `android/app/build/outputs/apk/debug/app-debug.apk`  
**APK Size**: 21 MB  
**Last Built**: March 1, 2026

---

## 📍 APK Location

The APK file is located at:
```
/Users/raswanthmalaisamy/Downloads/AIDEA/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📱 Method 1: Share via WhatsApp (Recommended)

### Step 1: Locate the APK on Your Mac
```bash
# Open Finder to the APK location
open android/app/build/outputs/apk/debug/
```

Or navigate manually:
1. Open **Finder**
2. Go to **Downloads** → **AIDEA** → **android** → **app** → **build** → **outputs** → **apk** → **debug**
3. You'll see **app-debug.apk** (21 MB)

### Step 2: Share via WhatsApp Web
1. Open **WhatsApp Web** in your browser (web.whatsapp.com)
2. Scan QR code with your phone
3. Open a chat (can be your own chat or send to someone)
4. Click the **paperclip icon** (attach)
5. Select **Document**
6. Navigate to the APK location and select **app-debug.apk**
7. Click **Send**

### Step 3: Download on Android Phone
1. Open WhatsApp on your Android phone
2. Find the message with the APK
3. Tap on **app-debug.apk** to download
4. Wait for download to complete
5. You'll see "Download complete" notification

---

## 📱 Method 2: Share via Google Drive

### Step 1: Upload to Google Drive
1. Go to **drive.google.com**
2. Click **New** → **File upload**
3. Select **app-debug.apk** from the location above
4. Wait for upload to complete

### Step 2: Share the Link
1. Right-click on the uploaded APK
2. Click **Get link**
3. Change to **Anyone with the link**
4. Click **Copy link**
5. Share this link via WhatsApp, SMS, or email

### Step 3: Download on Android Phone
1. Open the Google Drive link on your phone
2. Tap **Download**
3. Wait for download to complete

---

## 📱 Method 3: Direct Transfer via USB

### Step 1: Connect Phone to Mac
1. Connect your Android phone via USB cable
2. On phone, select **File Transfer** mode
3. On Mac, open **Android File Transfer** app
   - If not installed, download from: android.com/filetransfer

### Step 2: Copy APK to Phone
1. In Android File Transfer, navigate to **Downloads** folder
2. Drag and drop **app-debug.apk** from Mac to phone
3. Wait for transfer to complete

### Step 3: Install from Phone
1. Open **Files** app on your phone
2. Go to **Downloads** folder
3. Tap on **app-debug.apk**
4. Follow installation steps below

---

## 📱 Method 4: Email the APK

### Send via Email
1. Open your email client
2. Compose new email
3. Attach **app-debug.apk**
4. Send to yourself or recipient
5. Open email on Android phone
6. Download the attachment

**Note**: Some email providers may block APK files. If blocked, use Method 1 or 2.

---

## 🔧 Installing the APK on Android

### Step 1: Enable Unknown Sources
Before installing, you need to allow installation from unknown sources:

**Android 8.0 and above:**
1. Go to **Settings**
2. Tap **Apps & notifications** (or **Apps**)
3. Tap **Special app access** (or **Advanced**)
4. Tap **Install unknown apps**
5. Select the app you'll use to install (e.g., **Chrome**, **Files**, **WhatsApp**)
6. Toggle **Allow from this source** ON

**Android 7.1 and below:**
1. Go to **Settings**
2. Tap **Security**
3. Toggle **Unknown sources** ON
4. Tap **OK** to confirm

### Step 2: Install the APK
1. Open the downloaded **app-debug.apk** file
   - From **Downloads** folder in Files app
   - Or tap the download notification
2. Tap **Install**
3. Wait for installation to complete
4. Tap **Open** to launch MACHER

### Step 3: Grant Permissions
When you first open the app, grant these permissions:
- ✅ **Microphone** - For audio capture
- ✅ **Phone** - For call detection
- ✅ **Notifications** - For alerts
- ✅ **SMS** (optional) - For Family Loop alerts

**Special Permissions** (grant later when needed):
- **Display over other apps** - For scam warning overlay
  - Settings → Apps → MACHER → Display over other apps → Allow

---

## ⚠️ Important Notes

### Security Warning
When installing, you may see:
- "This type of file can harm your device"
- "Install blocked"
- "Unknown source"

**This is normal for APKs not from Google Play Store.**

To proceed:
1. Tap **Settings** or **More details**
2. Enable installation from that source
3. Go back and install again

### File Size
- APK size: **21 MB**
- Make sure you have enough storage space
- WhatsApp may compress the file, but it will work fine

### WhatsApp Limitations
- WhatsApp allows files up to **100 MB**
- Our APK is 21 MB, so it's well within the limit
- The file will be sent as a document, not compressed

### Installation Issues
If installation fails:
1. **Check storage space** - Need at least 50 MB free
2. **Enable unknown sources** - Follow steps above
3. **Restart phone** - Sometimes helps
4. **Re-download APK** - File may be corrupted
5. **Try different method** - Use USB transfer instead

---

## 🎯 Quick Commands (For Mac Terminal)

### Copy APK to Desktop
```bash
cp android/app/build/outputs/apk/debug/app-debug.apk ~/Desktop/MACHER.apk
```

### Open APK Location in Finder
```bash
open android/app/build/outputs/apk/debug/
```

### Check APK Size
```bash
ls -lh android/app/build/outputs/apk/debug/app-debug.apk
```

### Rename APK (Optional)
```bash
cp android/app/build/outputs/apk/debug/app-debug.apk ~/Desktop/MACHER-v1.0.0.apk
```

---

## 📋 Sharing Checklist

### Before Sharing
- [x] APK built successfully
- [x] APK size is reasonable (21 MB)
- [x] APK location confirmed
- [ ] Tested on at least one device
- [ ] Prepared installation instructions

### Sharing Options
- [ ] WhatsApp (easiest)
- [ ] Google Drive (reliable)
- [ ] USB Transfer (fastest)
- [ ] Email (may be blocked)
- [ ] Cloud storage (Dropbox, OneDrive)

### After Sharing
- [ ] Recipient downloaded successfully
- [ ] Installation completed
- [ ] App launches without errors
- [ ] Permissions granted
- [ ] Basic functionality tested

---

## 🚀 Recommended Method

**For most users, WhatsApp is the best option:**

1. ✅ **Easy** - Just attach and send
2. ✅ **Fast** - Direct transfer
3. ✅ **Reliable** - No compression issues
4. ✅ **Convenient** - Already installed on most phones
5. ✅ **No size limit issues** - 21 MB is well under 100 MB limit

**Steps:**
1. Open WhatsApp Web
2. Attach the APK file
3. Send to recipient
4. They download and install
5. Done! 🎉

---

## 🔍 Troubleshooting

### "App not installed" Error
**Cause**: Conflicting package or insufficient space  
**Solution**:
1. Uninstall any previous version
2. Clear cache: Settings → Storage → Clear cache
3. Restart phone
4. Try installing again

### "Parse error" Message
**Cause**: Corrupted APK file  
**Solution**:
1. Re-download the APK
2. Try a different sharing method
3. Rebuild the APK if needed

### "Installation blocked" Warning
**Cause**: Unknown sources not enabled  
**Solution**:
1. Go to Settings → Security
2. Enable "Unknown sources"
3. Try installing again

### WhatsApp Won't Send APK
**Cause**: File type restrictions (rare)  
**Solution**:
1. Rename file to .zip: `app-debug.apk.zip`
2. Send via WhatsApp
3. Rename back to .apk on phone
4. Install

### Can't Find Downloaded APK
**Location**: Usually in one of these folders:
- `/storage/emulated/0/Download/`
- `/storage/emulated/0/WhatsApp/Media/WhatsApp Documents/`
- Use **Files** app → **Downloads** to find it

---

## 📞 Support

If you encounter any issues:

1. **Check this guide** - Most issues are covered above
2. **Restart phone** - Solves many problems
3. **Try different method** - If WhatsApp fails, try USB
4. **Check storage** - Need at least 50 MB free
5. **Update Android** - Some features need Android 8.0+

---

## ✅ Success Indicators

You'll know it worked when:
- ✅ APK downloads completely (21 MB)
- ✅ Installation completes without errors
- ✅ MACHER icon appears in app drawer
- ✅ App launches and shows onboarding
- ✅ You can navigate through screens

---

**APK Location**: `android/app/build/outputs/apk/debug/app-debug.apk`  
**Size**: 21 MB  
**Ready to Share**: ✅ YES

**Recommended**: Share via WhatsApp for easiest installation! 📱


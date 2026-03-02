# Git Auto-Sync Setup Guide

## ✅ Current Status

Your AIDEA project is now configured with **automatic daily git commits and pushes**.

### What's Been Set Up

1. **✅ Comprehensive .gitignore** (`/Users/raswanthmalaisamy/Downloads/AIDEA/.gitignore`)
   - Excludes all Gradle build files (`android/.gradle/`, `android/app/build/`)
   - Excludes Android artifacts (`.apk`, `.aab`, `.so`, etc.)
   - Excludes Node modules and dependencies
   - Excludes IDE files (`.idea/`, `.vscode/`)
   - Excludes environment variables (`.env`, `.env.local`)
   - Keeps essential docs (README.md, QUICK_START.md)

2. **✅ Auto-Sync Script** (`/Users/raswanthmalaisamy/Downloads/AIDEA/auto-commit-push.sh`)
   - Detects changed files (respects `.gitignore`)
   - Stages all changes automatically
   - Creates timestamped commits
   - Pushes to GitHub `main` branch
   - Logs activity to `auto-sync.log`

3. **✅ Daily Automation** (macOS LaunchAgent)
   - **Registered:** `com.vocalshield.aidea.autosync`
   - **Schedule:** Daily at 11:00 PM (23:00)
   - **Plist Location:** `~/.config/LaunchAgents/com.vocalshield.aidea.autosync.plist`
   - **Logs:** `auto-sync.log` and `auto-sync-error.log`

---

## 🚀 Usage

### Run Auto-Sync Manually (Any Time)
```bash
cd /Users/raswanthmalaisamy/Downloads/AIDEA
./auto-commit-push.sh
```

### View Auto-Sync Logs
```bash
# View all auto-sync activity
tail -f /Users/raswanthmalaisamy/Downloads/AIDEA/auto-sync.log

# View errors (if any)
cat /Users/raswanthmalaisamy/Downloads/AIDEA/auto-sync-error.log
```

### Check Scheduled Job Status
```bash
# List all macOS scheduled services
launchctl list | grep vocalshield

# Manually trigger the job (for testing)
launchctl start com.vocalshield.aidea.autosync
```

---

## 🔧 Modify Schedule

### Change Time to 6:00 PM (18:00)
Edit the plist file:
```bash
nano ~/.config/LaunchAgents/com.vocalshield.aidea.autosync.plist
```

Find:
```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>0</integer>
</dict>
```

Change to:
```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>18</integer>
    <key>Minute</key>
    <integer>0</integer>
</dict>
```

Then reload:
```bash
launchctl unload ~/.config/LaunchAgents/com.vocalshield.aidea.autosync.plist
launchctl load ~/.config/LaunchAgents/com.vocalshield.aidea.autosync.plist
```

### Run Multiple Times Daily
To sync at 9 AM, 5 PM, and 11 PM, replace `StartCalendarInterval` dict with an array:

```xml
<key>StartCalendarInterval</key>
<array>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <dict>
        <key>Hour</key>
        <integer>17</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <dict>
        <key>Hour</key>
        <integer>23</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</array>
```

Then reload the service.

---

## 📋 What Gets Backed Up

### ✅ COMMITTED to GitHub
- All Android source code (`.kt` files)
- All UI designs and components
- Configuration files (`build.gradle.kts`, `settings.gradle.kts`)
- Project documentation
- Python helper scripts
- jest.config.js files

### ❌ IGNORED (Not Uploaded)
- `android/.gradle/` — Gradle cache (regenerates locally)
- `android/app/build/` — Compiled APKs and build artifacts
- `.apk` files — Large binary, rebuild locally
- `node_modules/` — Dependencies reinstall via `npm install`
- `.env` files — Secrets stay local (never commit!)
- `.idea/`, `.vscode/` — IDE settings (personal preference)
- `*.class`, `*.dex`, `*.jar` — Build outputs

---

## 🛡️ Safety Features

1. **Respects .gitignore** — Large files and secrets never accidental committed
2. **Git Status Check** — Skips commit if no changes detected
3. **Error Handling** — Exits gracefully if anything fails
4. **Logging** — All activity recorded in `auto-sync.log` with timestamps
5. **No Force Push** — Regular `git push`, never dangerous `push -f`

---

## ⚙️ Git Credentials

The auto-sync script uses your configured Git credentials. Make sure:

```bash
# Check if credentials are cached
git config --list | grep credential

# Cache credentials for 1 hour (optional)
git config --global credential.helper cache
git config --global credential.helper 'cache --timeout=3600'

# Or use SSH key (recommended for automation)
ssh -T git@github.com  # Test SSH connectivity
```

---

## 📊 Current Performance

**Example Auto-Sync Run (March 2, 2026, 11:58 PM):**
```
Staged Files: 2
Commit Hash: 1b63146
Push Status: Success ✅
Time Elapsed: ~3 seconds
```

---

## 🆘 Troubleshooting

### Job Not Running at Scheduled Time
1. Verify LaunchAgent is loaded:
   ```bash
   launchctl list | grep vocalshield
   ```
   Should show: `-       0       com.vocalshield.aidea.autosync`

2. Check if macOS is sleeping — LaunchAgents only run while system is awake
   - For background sync while asleep, use `StartInterval` (seconds) instead

3. Check logs:
   ```bash
   cat /Users/raswanthmalaisamy/Downloads/AIDEA/auto-sync-error.log
   ```

### Authentication Errors
```bash
# Test Git SSH/HTTPS
git remote -v  # Check which method is configured

# If HTTPS: verify credentials are cached
git ls-remote origin

# If SSH: verify key is in ssh-agent
ssh -T git@github.com
```

### Push Failed
1. Check network:
   ```bash
   ping github.com
   ```

2. Verify branch tracking:
   ```bash
   git branch -vvv
   ```

3. Pull latest before pushing:
   ```bash
   git pull origin main
   git push origin main
   ```

---

## 📝 Script Location

- **Executable:** `/Users/raswanthmalaisamy/Downloads/AIDEA/auto-commit-push.sh`
- **LaunchAgent:** `~/.config/LaunchAgents/com.vocalshield.aidea.autosync.plist`
- **Logs:** `~/Downloads/AIDEA/auto-sync.log`

---

## 🔄 Manual Testing

Run a manual sync anytime to verify everything works:

```bash
cd /Users/raswanthmalaisamy/Downloads/AIDEA
./auto-commit-push.sh
```

Watch the output — you'll see exactly what's being committed and pushed.

---

## ✨ Summary

Your project is now **fully automated** for daily backups to GitHub. Every day at 11 PM (or whenever you configure), all code changes will be automatically committed with a timestamp and pushed to your repository.

No more worrying about lost work! 🎉

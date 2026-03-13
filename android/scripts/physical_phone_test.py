import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ADB = "/Users/raswanthmalaisamy/Library/Android/sdk/platform-tools/adb"
PKG = "com.macher.android"
OUT = Path("/tmp/macher_phone_full")
OUT.mkdir(parents=True, exist_ok=True)


def run(cmd: str, timeout: int = 30):
    return subprocess.run(cmd, shell=True, text=True, capture_output=True, timeout=timeout)


def adb(cmd: str, timeout: int = 30):
    return run(f"{ADB} {cmd}", timeout=timeout)


def screenshot(tag: str):
    p = OUT / f"{int(time.time())}_{tag}.png"
    res = run(f"{ADB} exec-out screencap -p > {p}", timeout=30)
    return p.as_posix() if res.returncode == 0 else None


def dump_ui(local: Path):
    adb("shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1", timeout=40)
    run(f"{ADB} pull /sdcard/window_dump.xml {local} >/dev/null 2>&1", timeout=40)


def parse_ui(local: Path):
    return ET.parse(local).getroot()


def collect_nodes(root):
    return list(root.iter("node"))


def has_text(root, needle: str):
    n = needle.lower()
    for node in root.iter("node"):
        t = (node.attrib.get("text") or "").lower()
        d = (node.attrib.get("content-desc") or "").lower()
        if n in t or n in d:
            return True
    return False


def has_exact_text(root, needle: str):
    n = needle.strip().lower()
    for node in root.iter("node"):
        t = (node.attrib.get("text") or "").strip().lower()
        d = (node.attrib.get("content-desc") or "").strip().lower()
        if t == n or d == n:
            return True
    return False


def find_node_bounds(root, text_variants):
    for node in root.iter("node"):
        t = (node.attrib.get("text") or "").strip()
        d = (node.attrib.get("content-desc") or "").strip()
        for needle in text_variants:
            if t == needle or d == needle:
                return node.attrib.get("bounds")
    return None


def center(bounds: str):
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap_text(text_variants, sleep_s=1.5):
    xml = OUT / "ui.xml"
    dump_ui(xml)
    root = parse_ui(xml)
    b = find_node_bounds(root, text_variants)
    if not b:
        return False
    c = center(b)
    if not c:
        return False
    adb(f"shell input tap {c[0]} {c[1]}")
    time.sleep(sleep_s)
    return True


def find_edit_text_centers(root):
    centers = []
    for node in collect_nodes(root):
        if (node.attrib.get("class") or "") == "android.widget.EditText":
            c = center(node.attrib.get("bounds"))
            if c:
                centers.append(c)
    return centers


def input_into_field(point, value):
    adb(f"shell input tap {point[0]} {point[1]}")
    time.sleep(0.4)
    safe = value.replace(" ", "%s")
    adb(f"shell input text {safe}")
    time.sleep(0.4)


def setup_to_home(max_steps=20):
    """Drive onboarding/permissions/profile setup until Monitor home is visible."""
    for _ in range(max_steps):
        root = evaluate_screen()

        if has_exact_text(root, "START MONITORING") or has_exact_text(root, "STOP MONITORING"):
            return True

        # Runtime permission dialogs
        if tap_text([
            "While using the app",
            "Allow",
            "Allow only while using the app",
            "Continue",
            "OK",
            "Got it",
        ], sleep_s=1.2):
            continue

        # Onboarding pages
        if has_text(root, "Skip"):
            if tap_text(["Skip"], sleep_s=1.0):
                continue

        if tap_text(["Get Started", "Continue", "Next"], sleep_s=1.2):
            continue

        # Role selection
        if has_text(root, "I need protection") or has_text(root, "Who will"):
            tap_text(["I need protection", "Protected"], sleep_s=1.0)
            tap_text(["Continue as", "Continue", "Get Started"], sleep_s=1.0)
            continue

        # Profile setup
        if has_text(root, "Almost there") or find_edit_text_centers(root):
            fields = find_edit_text_centers(root)
            if len(fields) >= 1:
                input_into_field(fields[0], "TestUser")
            if len(fields) >= 2:
                input_into_field(fields[1], "9999999999")
            tap_text(["Get Started", "Continue", "Done", "Finish"], sleep_s=1.4)
            continue

        # Fallback nudge
        adb("shell input swipe 900 1200 150 1200 250")
        time.sleep(1.0)

    return False


def swipe_up(times=1):
    for _ in range(times):
        adb("shell input swipe 540 1900 540 600 300")
        time.sleep(1)


def launch_app():
    adb(f"shell am force-stop {PKG}")
    time.sleep(1)
    adb(f"shell am start -n {PKG}/.ui.MainActivity")
    time.sleep(4)


def get_focus():
    r = adb("shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -2")
    return (r.stdout or "") + (r.stderr or "")


def evaluate_screen():
    xml = OUT / "ui.xml"
    dump_ui(xml)
    return parse_ui(xml)


results = []


def record(name, ok, details=""):
    results.append({"feature": name, "pass": ok, "details": details})
    print(("PASS" if ok else "FAIL") + f" | {name} | {details}")


# Start
launch_app()
home_ready = setup_to_home()
root = evaluate_screen()
screenshot("home")
home_ok = home_ready and (has_exact_text(root, "START MONITORING") or has_exact_text(root, "STOP MONITORING"))
record("launch_home", home_ok, "App opened to main/home")

# Monitoring
started = tap_text(["START MONITORING", "Start Monitoring"])
root = evaluate_screen()
screenshot("after_start")
monitor_started = has_text(root, "STOP MONITORING") or has_text(root, "Stop Monitoring")
record("monitor_start", started and monitor_started, "Start toggles to stop")

stopped = tap_text(["STOP MONITORING", "Stop Monitoring"]) if monitor_started else False
root = evaluate_screen()
screenshot("after_stop")
monitor_stopped = has_text(root, "START MONITORING") or has_text(root, "Start Monitoring")
record("monitor_stop", stopped and monitor_stopped, "Stop toggles back to start")

# Settings
opened_settings = tap_text(["Settings"])
root = evaluate_screen()
screenshot("settings")
settings_ok = any(
    has_text(root, x) for x in ["Enable Monitoring", "Auto-Start", "Screen Overlay", "Alerts", "Privacy"]
)
record("settings_screen", opened_settings and settings_ok, "Settings options visible")

# Profile
opened_profile = tap_text(["Profile"])
root = evaluate_screen()
screenshot("profile")
profile_ok = any(has_text(root, x) for x in ["YOUR ROLE", "IDENTITY", "Dark Mode", "Switch to Guardian"])
record("profile_screen", opened_profile and profile_ok, "Profile sections visible")

# Guardian dialog
if not has_text(root, "Switch to Guardian"):
    swipe_up(1)
opened_dialog = tap_text(["Switch to Guardian", "Switch Role?"])
root = evaluate_screen()
screenshot("guardian_dialog")
dialog_ok = has_text(root, "Switch Role") or (
    has_text(root, "Protected") and has_text(root, "Guardian")
)
record("guardian_switch_dialog", opened_dialog and dialog_ok, "Role switch confirmation shown")
if has_text(root, "Cancel"):
    tap_text(["Cancel"])

# History
tap_text(["History"])
root = evaluate_screen()
screenshot("history")
history_ok = has_text(root, "History") or has_text(root, "No calls") or has_text(root, "call")
record("history_screen", history_ok, "History reachable and rendered")

# Offline mode
adb("shell cmd connectivity airplane-mode enable", timeout=20)
time.sleep(2)
root = evaluate_screen()
screenshot("airplane_on")
offline_ok = has_text(root, "Offline") or has_text(root, "No internet")
record("offline_mode", offline_ok, "Offline indication shown in airplane mode")
adb("shell cmd connectivity airplane-mode disable", timeout=20)

# Lifecycle
adb("shell input keyevent KEYCODE_HOME")
time.sleep(1)
adb(f"shell am start -n {PKG}/.ui.MainActivity")
time.sleep(2)
root = evaluate_screen()
screenshot("lifecycle_restore")
life_ok = has_text(root, "MACHER") or has_text(root, "Monitor") or has_text(root, "START MONITORING")
life_ok = has_exact_text(root, "START MONITORING") or has_exact_text(root, "STOP MONITORING") or life_ok
record("lifecycle_restore", life_ok, "App restores from background")

report = {
    "focus": get_focus(),
    "summary": {
        "passed": sum(1 for r in results if r["pass"]),
        "total": len(results),
    },
    "results": results,
    "screenshots_dir": OUT.as_posix(),
}

out_file = OUT / "report.json"
out_file.write_text(json.dumps(report, indent=2))
print("\nREPORT:", out_file)
print(json.dumps(report["summary"], indent=2))

#!/bin/bash

# VocalShield - Build Both Demo and Real Mode APKs
# This script builds two APKs: one for demo mode, one for real mode

set -e  # Exit on error

echo "🚀 VocalShield - Building Both Modes"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create output directory
mkdir -p builds

# ============================================
# BUILD 1: DEMO MODE
# ============================================
echo -e "${BLUE}📦 Building DEMO MODE APK...${NC}"
echo ""

# Set DEMO_MODE = true
sed -i.bak 's/const val DEMO_MODE = false/const val DEMO_MODE = true/' android/app/src/main/java/com/vocalshield/android/util/Config.kt

# Build demo APK
cd android
./gradlew clean assembleDebug
cd ..

# Copy demo APK
cp android/app/build/outputs/apk/debug/app-debug.apk builds/vocalshield-demo.apk

# Get file size
DEMO_SIZE=$(du -h builds/vocalshield-demo.apk | cut -f1)

echo -e "${GREEN}✅ Demo Mode APK built successfully!${NC}"
echo -e "   Location: builds/vocalshield-demo.apk"
echo -e "   Size: $DEMO_SIZE"
echo ""

# ============================================
# BUILD 2: REAL MODE
# ============================================
echo -e "${BLUE}📦 Building REAL MODE APK...${NC}"
echo ""

# Set DEMO_MODE = false
sed -i.bak 's/const val DEMO_MODE = true/const val DEMO_MODE = false/' android/app/src/main/java/com/vocalshield/android/util/Config.kt

# Build real APK
cd android
./gradlew clean assembleDebug
cd ..

# Copy real APK
cp android/app/build/outputs/apk/debug/app-debug.apk builds/vocalshield-real.apk

# Get file size
REAL_SIZE=$(du -h builds/vocalshield-real.apk | cut -f1)

echo -e "${GREEN}✅ Real Mode APK built successfully!${NC}"
echo -e "   Location: builds/vocalshield-real.apk"
echo -e "   Size: $REAL_SIZE"
echo ""

# Restore original Config.kt (keep as false for production)
mv android/app/src/main/java/com/vocalshield/android/util/Config.kt.bak android/app/src/main/java/com/vocalshield/android/util/Config.kt

# ============================================
# SUMMARY
# ============================================
echo -e "${GREEN}🎉 BUILD COMPLETE!${NC}"
echo "===================================="
echo ""
echo "Two APKs have been built:"
echo ""
echo -e "${YELLOW}1. DEMO MODE${NC} (for hackathon/testing)"
echo "   File: builds/vocalshield-demo.apk"
echo "   Size: $DEMO_SIZE"
echo "   Features:"
echo "   - Works without AWS"
echo "   - 6 preloaded scam scenarios"
echo "   - Perfect for demos"
echo "   - No network required"
echo ""
echo -e "${YELLOW}2. REAL MODE${NC} (for production)"
echo "   File: builds/vocalshield-real.apk"
echo "   Size: $REAL_SIZE"
echo "   Features:"
echo "   - Connects to AWS backend"
echo "   - Real audio capture"
echo "   - Live transcription"
echo "   - Production-ready"
echo ""
echo -e "${BLUE}📱 Installation:${NC}"
echo "   adb install builds/vocalshield-demo.apk   # For demo"
echo "   adb install builds/vocalshield-real.apk   # For production"
echo ""
echo -e "${BLUE}📤 Sharing:${NC}"
echo "   Send via WhatsApp, USB, or email"
echo ""

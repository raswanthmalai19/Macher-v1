#!/bin/bash
################################################################################
# Auto-Commit & Push Script for VocalShield AIDEA Project
# 
# This script:
# 1. Checks git status for changes
# 2. Stages all modified/new files respecting .gitignore
# 3. Creates a timestamped commit
# 4. Pushes to remote (main branch)
# 5. Logs activity to auto-sync.log
#
# Usage: ./auto-commit-push.sh
# Or add to crontab for daily runs
################################################################################

set -euo pipefail

PROJECT_ROOT="/Users/raswanthmalaisamy/Downloads/AIDEA"
LOG_FILE="$PROJECT_ROOT/auto-sync.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BRANCH="main"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_message() {
    local msg="[$TIMESTAMP] $1"
    echo -e "${msg}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

error_exit() {
    log_message "${RED}ERROR: $1${NC}"
    exit 1
}

cd "$PROJECT_ROOT" || error_exit "Cannot cd to $PROJECT_ROOT"

# Check if we're in a git repo
if [ ! -d .git ]; then
    error_exit "Not a git repository"
fi

log_message "${GREEN}=== Auto-Commit & Push Started ===${NC}"

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    log_message "${YELLOW}WARNING: Currently on branch '$CURRENT_BRANCH', expected '$BRANCH'${NC}"
fi

# Get git status
STATUS_OUTPUT=$(git status --porcelain)

if [ -z "$STATUS_OUTPUT" ]; then
    log_message "${YELLOW}No changes detected, skipping commit${NC}"
    exit 0
fi

log_message "📝 Changes detected:"
echo "$STATUS_OUTPUT" | head -20 >> "$LOG_FILE"

# Stage all changes (respects .gitignore)
log_message "📦 Staging changes..."
git add -A

# Get staged files count
STAGED_COUNT=$(git diff --cached --name-only | wc -l)
log_message "✅ Staged $STAGED_COUNT files"

# Create commit with timestamp
COMMIT_MESSAGE="chore(auto): auto-sync changes at $TIMESTAMP"
log_message "💾 Creating commit..."
git commit -m "$COMMIT_MESSAGE" || {
    log_message "${YELLOW}Nothing to commit${NC}"
    exit 0
}

# Get commit hash
COMMIT_HASH=$(git rev-parse --short HEAD)
log_message "✅ Commit created: $COMMIT_HASH"

# Push to remote
log_message "🚀 Pushing to remote ($BRANCH)..."
if git push origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"; then
    log_message "${GREEN}✅ Push successful!${NC}"
else
    error_exit "Push failed - check network and credentials"
fi

log_message "${GREEN}=== Auto-Commit & Push Completed ===${NC}"
log_message "Repository is now in sync with remote\n"

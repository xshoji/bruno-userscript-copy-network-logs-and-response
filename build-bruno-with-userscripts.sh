#!/bin/bash
set -euo pipefail

#=============================================================================
# Bruno v3.1.4 + Userscript feature build script
#=============================================================================

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRUNO_REPO="https://github.com/usebruno/bruno.git"
BRUNO_TAG="v3.1.4"
PATCH_FILE="$SCRIPT_DIR/bruno-userscript-feature.patch"
BUILD_DIR="$SCRIPT_DIR/bruno-userscript-build"
USERSCRIPTS_APP_SUPPORT_DIR="$HOME/Library/Application Support/bruno/userscripts"

# Userscripts to install (add paths here)
USERSCRIPT_FILES=(
  "$SCRIPT_DIR/src.js"
)

# --- Functions ---
log() { echo "==> $*"; }
err() { echo "ERROR: $*" >&2; exit 1; }

# --- Pre-flight checks ---
[ -f "$PATCH_FILE" ] || err "Patch file not found: $PATCH_FILE"
for f in "${USERSCRIPT_FILES[@]}"; do
  [ -f "$f" ] || err "Userscript not found: $f"
done
command -v git >/dev/null || err "git is not installed"
command -v node >/dev/null || err "node is not installed"
command -v npm >/dev/null || err "npm is not installed"

# --- Step 1: Clone ---
log "Cloning bruno into $BUILD_DIR ..."
rm -rf "$BUILD_DIR"
git clone --depth 1 --branch "$BRUNO_TAG" "$BRUNO_REPO" "$BUILD_DIR"

cd "$BUILD_DIR"

# --- Step 2: Checkout tag (already on the tag via --branch, but confirm) ---
log "Confirming tag $BRUNO_TAG ..."
git describe --tags --exact-match 2>/dev/null || git log --oneline -1

# --- Step 3: Apply patch ---
log "Applying userscript feature patch ..."
git apply "$PATCH_FILE"
log "Patch applied successfully."

# --- Step 4: Create userscripts directory for production ---
log "Creating userscripts directory at: $USERSCRIPTS_APP_SUPPORT_DIR"
mkdir -p "$USERSCRIPTS_APP_SUPPORT_DIR"

# --- Step 5: Copy userscripts ---
for f in "${USERSCRIPT_FILES[@]}"; do
  fname=$(basename "$f")
  log "Installing userscript: $fname"
  cp "$f" "$USERSCRIPTS_APP_SUPPORT_DIR/$fname"
done
log "Userscripts installed to: $USERSCRIPTS_APP_SUPPORT_DIR"
ls -la "$USERSCRIPTS_APP_SUPPORT_DIR"

# --- Step 6: Build ---
log "Running setup (install deps + build internal packages) ..."
npm run setup

log "Building web app ..."
npm run build:web

log "Building Electron app ..."
npm run build:electron

log ""
log "Build complete!"
log "Output is in: $BUILD_DIR/packages/bruno-electron/out/"
log "Userscripts are in: $USERSCRIPTS_APP_SUPPORT_DIR"

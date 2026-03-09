#!/bin/bash

# Get target triple from rustc
TARGET_TRIPLE=$(rustc -vV | grep host | cut -d ' ' -f 2)

echo "Building arRPC sidecar for $TARGET_TRIPLE..."

# Binary name for Tauri sidecar
BINARY_NAME="arrpc-$TARGET_TRIPLE"
OUT_DIR="src-tauri/binaries"

# Handle Windows extension
if [[ "$TARGET_TRIPLE" == *"windows"* ]]; then
    BINARY_FILE="$OUT_DIR/$BINARY_NAME.exe"
else
    BINARY_FILE="$OUT_DIR/$BINARY_NAME"
fi

if [ -f "$BINARY_FILE" ]; then
    echo "Sidecar already exists at $BINARY_FILE, skipping build."
    exit 0
fi

mkdir -p "$OUT_DIR"

# Determine pkg target
# PKG targets follow the format node{version}-{platform}-{arch}
UNAME_S=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$UNAME_S" in
    linux*)   PLATFORM="linux" ;;
    darwin*)  PLATFORM="macos" ;;
    msys*|mingw*|cygwin*) PLATFORM="win" ;;
    *)        PLATFORM="linux" ;;
esac

if [ "$ARCH" = "x86_64" ]; then
    ARCH="x64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH="arm64"
fi

PKG_TARGET="node18-$PLATFORM-$ARCH"

# Ensure submodule dependencies are installed
echo "Installing dependencies for arRPC submodule..."
(cd server/arrpc && npm install)

# Build with pkg
# We target node18 to match arRPC requirements
./node_modules/.bin/pkg server/arrpc/package.json \
  --targets "$PKG_TARGET" \
  --output "$BINARY_FILE"

echo "Done! Sidecar built at $OUT_DIR/$BINARY_NAME"

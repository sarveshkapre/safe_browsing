#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$ROOT_DIR/manifest.json','utf8'));process.stdout.write(m.version);")"
ZIP_NAME="safe-browsing-extension-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

cd "$ROOT_DIR"
zip -r "$ZIP_PATH" \
  manifest.json \
  background.js \
  popup.html popup.js \
  options.html options.js \
  rules_standard.json rules_strict.json \
  strict_sources.txt \
  scripts/update_strict_rules.js \
  README.md CONTRIBUTING.md \
  -x "*.git*" "dist/*"

echo "Created $ZIP_PATH"

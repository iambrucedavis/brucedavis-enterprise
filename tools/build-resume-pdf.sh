#!/usr/bin/env bash
# Regenerate bruce-davis-resume.pdf from bruce-davis-resume.html.
# Uses headless Chrome — no extra dependencies. Run after editing the resume.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/bruce-davis-resume.html"
OUT="$ROOT/bruce-davis-resume.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "error: Google Chrome not found at $CHROME" >&2
  exit 1
fi
if [ ! -f "$SRC" ]; then
  echo "error: resume source not found at $SRC" >&2
  exit 1
fi

PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

# --virtual-time-budget lets the Google Fonts webfonts load before the snapshot.
# Chrome's startup/updater chatter is noise — discard it; success is verified below.
"$CHROME" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \
  --disable-component-update \
  --user-data-dir="$PROFILE" \
  --virtual-time-budget=6000 \
  --print-to-pdf="$OUT" \
  "file://$SRC" >/dev/null 2>&1

if [ ! -s "$OUT" ]; then
  echo "error: Chrome did not produce a PDF at $OUT" >&2
  exit 1
fi

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"

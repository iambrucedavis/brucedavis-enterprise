#!/usr/bin/env bash
# Regenerate a resume PDF from its HTML source via headless Chrome.
# Pass the slug as $1:
#   ./tools/build-resume-pdf.sh bruce-davis-resume
#   ./tools/build-resume-pdf.sh bruce-davis-resume-ats
# Defaults to "bruce-davis-resume" for backwards compatibility.
set -euo pipefail

SLUG="${1:-bruce-davis-resume}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/$SLUG.html"
OUT="$ROOT/$SLUG.pdf"
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

rm -f "$OUT"

# --virtual-time-budget lets the Google Fonts webfonts load before the snapshot.
# Chrome's startup/updater chatter is noise — discard it; success is verified below.
"$CHROME" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \
  --disable-component-update \
  --no-first-run \
  --user-data-dir="$PROFILE" \
  --virtual-time-budget=6000 \
  --print-to-pdf="$OUT" \
  "file://$SRC" >/dev/null 2>&1 &
CHROME_PID=$!

# Headless Chrome often does not exit after writing the PDF. Wait for the file
# to appear and stop growing, then stop Chrome so callers (e.g. the git hook)
# are not left hanging.
last_size=-1
deadline=$((SECONDS + 30))
while [ "$SECONDS" -lt "$deadline" ]; do
  if [ -s "$OUT" ]; then
    size=$(wc -c < "$OUT")
    [ "$size" = "$last_size" ] && break
    last_size=$size
  fi
  sleep 1
done
kill "$CHROME_PID" 2>/dev/null || true
wait "$CHROME_PID" 2>/dev/null || true

if [ ! -s "$OUT" ]; then
  echo "error: Chrome did not produce a PDF at $OUT" >&2
  exit 1
fi

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"

#!/usr/bin/env bash
# Install OpenKey Chrome/Firefox native messaging host on macOS.
# Usage: ./scripts/install_native_host_macos.sh <chrome-extension-id>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_ID="${1:-}"
if [[ -z "$EXT_ID" ]]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo "Copy the ID from the OpenKey extension popup / Options page."
  exit 1
fi

HOST_DIR="${HOME}/Library/Application Support/OpenKey"
mkdir -p "$HOST_DIR"
cp "$ROOT/native-host/openkey_native_host.py" "$HOST_DIR/openkey_native_host.py"

cat > "$HOST_DIR/openkey_native_host" <<'EOF'
#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for PY in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if command -v "$PY" >/dev/null 2>&1 || [ -x "$PY" ]; then
    exec "$PY" "$SCRIPT_DIR/openkey_native_host.py"
  fi
done
echo "python3 not found" >&2
exit 1
EOF
chmod +x "$HOST_DIR/openkey_native_host" "$HOST_DIR/openkey_native_host.py"

HOST_PATH="$HOST_DIR/openkey_native_host"
# JSON-escape path
HOST_JSON=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$HOST_PATH")
EXT_JSON=$(python3 -c 'import json,sys; print(json.dumps("chrome-extension://%s/" % sys.argv[1]))' "$EXT_ID")

MANIFEST=$(cat <<EOF
{
  "name": "com.openselfhosting.openkey",
  "description": "OpenKey native messaging host",
  "path": ${HOST_JSON},
  "type": "stdio",
  "allowed_origins": [
    ${EXT_JSON}
  ],
  "allowed_extensions": [
    "openkey@openselfhosting.local"
  ]
}
EOF
)

echo "$EXT_ID" > "$HOST_DIR/chrome_extension_id.txt"
echo "$MANIFEST" > "$HOST_DIR/com.openselfhosting.openkey.json"

SUPPORT="${HOME}/Library/Application Support"
DIRS=(
  "$SUPPORT/Google/Chrome/NativeMessagingHosts"
  "$SUPPORT/Google/Chrome Beta/NativeMessagingHosts"
  "$SUPPORT/Chromium/NativeMessagingHosts"
  "$SUPPORT/Microsoft Edge/NativeMessagingHosts"
  "$SUPPORT/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$SUPPORT/Mozilla/NativeMessagingHosts"
)

for d in "${DIRS[@]}"; do
  mkdir -p "$d"
  echo "$MANIFEST" > "$d/com.openselfhosting.openkey.json"
  echo "Wrote $d/com.openselfhosting.openkey.json"
done

echo
echo "Installed. Keep OpenKey unlocked, then in the extension tap Use desktop app."
echo "Host script: $HOST_PATH"

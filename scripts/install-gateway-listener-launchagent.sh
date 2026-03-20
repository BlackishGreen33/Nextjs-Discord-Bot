#!/bin/zsh

set -euo pipefail

LABEL="com.blackishgreen.nextjs-discord-bot.gateway-listener"
REPO_ROOT="${0:A:h:h}"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
STDOUT_PATH="${HOME}/Library/Logs/${LABEL}.stdout.log"
STDERR_PATH="${HOME}/Library/Logs/${LABEL}.stderr.log"
FNM_BIN="$(command -v fnm || true)"

if [[ -z "${FNM_BIN}" ]]; then
  echo "fnm is required to locate the pinned Node.js toolchain." >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${REPO_ROOT}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>eval "$("${FNM_BIN}" env --shell zsh)" &amp;&amp; cd "${REPO_ROOT}" &amp;&amp; set -a &amp;&amp; source .env.local &amp;&amp; set +a &amp;&amp; pnpm gateway:listen</string>
    </array>
    <key>StandardOutPath</key>
    <string>${STDOUT_PATH}</string>
    <key>StandardErrorPath</key>
    <string>${STDERR_PATH}</string>
  </dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "Installed ${LABEL}"
echo "plist: ${PLIST_PATH}"
echo "stdout: ${STDOUT_PATH}"
echo "stderr: ${STDERR_PATH}"

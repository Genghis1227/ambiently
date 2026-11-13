#!/usr/bin/env bash
# ==============================================================================
# Ambiently — Raspberry Pi Kiosk & All-in-One Self-Hosted Installer
# Compatible with Raspberry Pi OS (Bookworm / Bullseye — Wayland labwc, wayfire, & X11)
# Supports Raspberry Pi 5, Raspberry Pi 4, Raspberry Pi 3B+, and Pi Zero 2 W (64-bit recommended)
#
# Usage examples:
#   Interactive wizard:
#     bash scripts/pi-kiosk-setup.sh
#
#   Kiosk display pointing to Cloud or Home NAS Docker server:
#     bash scripts/pi-kiosk-setup.sh --mode kiosk --url https://dashboard.trinhism.com
#     bash scripts/pi-kiosk-setup.sh --mode kiosk --url http://192.168.1.50:8080
#
#   All-in-One Standalone Pi (runs Docker server locally + launches HDMI Kiosk):
#     bash scripts/pi-kiosk-setup.sh --mode standalone --port 8080
#
#   Optional portrait / wall-mount rotation (0, 90, 180, 270):
#     bash scripts/pi-kiosk-setup.sh --mode standalone --rotate 90
#
#   Remove kiosk autostart:
#     bash scripts/pi-kiosk-setup.sh --uninstall
# ==============================================================================

set -euo pipefail

MODE=""
TARGET_URL=""
PORT="8080"
ROTATE="0"
UNINSTALL="false"
REPO_URL="https://github.com/Genghis1227/ambiently.git"
INSTALL_DIR="${HOME}/ambiently"

print_banner() {
  echo ""
  echo "============================================================"
  echo "  Ambiently — Raspberry Pi Edition Setup"
  echo "  Smart Display • Family Calendar • Chores • Meal Planner"
  echo "============================================================"
  echo ""
}

usage() {
  cat <<EOF
Usage: bash scripts/pi-kiosk-setup.sh [options]

Options:
  --mode <kiosk|standalone>  'kiosk' connects to an existing URL; 'standalone' runs Ambiently in Docker on this Pi + opens Kiosk
  --url <https://...>        Dashboard URL for 'kiosk' mode (default: https://dashboard.trinhism.com)
  --port <number>            Local HTTP port for 'standalone' Docker server (default: 8080)
  --rotate <0|90|180|270>    Optional display rotation for portrait wall monitors (default: 0)
  --uninstall                Remove Ambiently kiosk autostart entries
  -h, --help                 Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --url)
      TARGET_URL="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-8080}"
      shift 2
      ;;
    --rotate)
      ROTATE="${2:-0}"
      shift 2
      ;;
    --uninstall)
      UNINSTALL="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "${EUID}" -eq 0 ]]; then
  echo "Please run this script as your normal desktop user (e.g. 'pi'), NOT with sudo."
  echo "The script will prompt for sudo only when installing system packages."
  exit 1
fi

LAUNCHER_SCRIPT="${HOME}/.local/bin/ambiently-kiosk-launch.sh"
DESKTOP_ENTRY="${HOME}/.config/autostart/ambiently-kiosk.desktop"
LABWC_AUTOSTART="${HOME}/.config/labwc/autostart"

if [[ "${UNINSTALL}" == "true" ]]; then
  echo "Removing Ambiently Kiosk autostart configuration..."
  rm -f "${LAUNCHER_SCRIPT}" "${DESKTOP_ENTRY}"
  if [[ -f "${LABWC_AUTOSTART}" ]]; then
    sed -i '/ambiently-kiosk-launch\.sh/d' "${LABWC_AUTOSTART}" || true
  fi
  echo "✅ Ambiently Kiosk autostart removed. (Any running Docker container in ${INSTALL_DIR} was left untouched.)"
  exit 0
fi

print_banner

# Interactive prompts if --mode was not passed
if [[ -z "${MODE}" ]]; then
  echo "How would you like to run Ambiently on this Raspberry Pi?"
  echo "  1) Kiosk Display Only (connects to https://dashboard.trinhism.com or another home server)"
  echo "  2) All-in-One Standalone Server + Kiosk (runs Ambiently locally in Docker on this Pi + displays on HDMI)"
  read -r -p "Select [1/2] (default: 1): " choice
  case "${choice:-1}" in
    2) MODE="standalone" ;;
    *) MODE="kiosk" ;;
  esac
fi

if [[ "${MODE}" == "kiosk" ]]; then
  if [[ -z "${TARGET_URL}" ]]; then
    read -r -p "Enter Ambiently URL [https://dashboard.trinhism.com]: " input_url
    TARGET_URL="${input_url:-https://dashboard.trinhism.com}"
  fi
elif [[ "${MODE}" == "standalone" ]]; then
  TARGET_URL="http://localhost:${PORT}"
else
  echo "Invalid --mode '${MODE}'. Expected 'kiosk' or 'standalone'."
  exit 1
fi

if [[ ! "${ROTATE}" =~ ^(0|90|180|270)$ ]]; then
  echo "Invalid --rotate '${ROTATE}'. Expected 0, 90, 180, or 270."
  exit 1
fi

echo ""
echo "-> Selected Mode : ${MODE}"
echo "-> Display URL   : ${TARGET_URL}"
echo "-> Rotation      : ${ROTATE} degrees"
echo ""

# 1. Install Chromium & Kiosk Display Utilities
echo "📦 Installing Chromium browser and display utilities..."
sudo apt-get update -qq
if apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG="chromium"
else
  CHROMIUM_PKG="chromium-browser"
fi

sudo apt-get install -y "${CHROMIUM_PKG}" unclutter x11-xserver-utils wlr-randr curl git

# 2. Standalone Mode: Install Docker & Build/Start Ambiently Container
if [[ "${MODE}" == "standalone" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "🐳 Installing Docker Engine for ARM64 / Raspberry Pi..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "${USER}" || true
  fi

  sudo systemctl enable docker
  sudo systemctl start docker

  # Determine repository directory (use current repo if executed inside a clone, otherwise ~/ambiently)
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  CANDIDATE_REPO="$(cd "${SCRIPT_DIR}/.." && pwd)"
  if [[ -f "${CANDIDATE_REPO}/compose.yaml" && -f "${CANDIDATE_REPO}/Dockerfile" ]]; then
    INSTALL_DIR="${CANDIDATE_REPO}"
  elif [[ -d "${INSTALL_DIR}/.git" ]]; then
    echo "🔄 Updating existing Ambiently repository in ${INSTALL_DIR}..."
    git -C "${INSTALL_DIR}" pull --ff-only
  else
    echo "📥 Cloning Ambiently into ${INSTALL_DIR}..."
    git clone "${REPO_URL}" "${INSTALL_DIR}"
  fi

  echo "🐳 Starting Ambiently container on port ${PORT}..."
  (
    cd "${INSTALL_DIR}"
    if AMBIENTLY_PORT="${PORT}" sudo docker compose pull; then
      AMBIENTLY_PORT="${PORT}" sudo docker compose up -d
    else
      echo "ℹ️  Pre-built GHCR image unavailable; building locally from source..."
      AMBIENTLY_PORT="${PORT}" sudo docker compose up -d --build
    fi
  )
fi

# 3. Create Kiosk Launch Script (~/.local/bin/ambiently-kiosk-launch.sh)
mkdir -p "${HOME}/.local/bin"

cat > "${LAUNCHER_SCRIPT}" <<EOF
#!/usr/bin/env bash
# Auto-generated by Ambiently pi-kiosk-setup.sh

TARGET_URL="${TARGET_URL}"
MODE="${MODE}"
PORT="${PORT}"
ROTATE="${ROTATE}"

# Wait briefly for desktop compositor (labwc / wayfire / X11) to settle
sleep 3

# Apply optional screen rotation on Wayland (wlr-randr) or X11 (xrandr)
if [[ "\${ROTATE}" != "0" ]]; then
  if [[ -n "\${WAYLAND_DISPLAY:-}" ]] && command -v wlr-randr >/dev/null 2>&1; then
    PRIMARY_OUT="\$(wlr-randr | awk '/^[^ ]/ {print \$1; exit}')"
    if [[ -n "\${PRIMARY_OUT}" ]]; then
      wlr-randr --output "\${PRIMARY_OUT}" --transform "\${ROTATE}" || true
    fi
  elif [[ -n "\${DISPLAY:-}" ]] && command -v xrandr >/dev/null 2>&1; then
    XR_ROT="normal"
    [[ "\${ROTATE}" == "90" ]] && XR_ROT="right"
    [[ "\${ROTATE}" == "180" ]] && XR_ROT="inverted"
    [[ "\${ROTATE}" == "270" ]] && XR_ROT="left"
    PRIMARY_OUT="\$(xrandr | awk '/ connected/ {print \$1; exit}')"
    if [[ -n "\${PRIMARY_OUT}" ]]; then
      xrandr --output "\${PRIMARY_OUT}" --rotate "\${XR_ROT}" || true
    fi
  fi
fi

# Disable OS screen blanking so Ambiently's Scheduled Night Mode & OLED Clock control sleep/wake
if [[ -n "\${DISPLAY:-}" ]] && command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset s noblank || true
  xset -dpms || true
  unclutter -idle 3 -root &
fi

# If running in standalone Docker mode, wait up to 45s for local Ambiently server healthcheck
if [[ "\${MODE}" == "standalone" ]]; then
  for _ in {1..45}; do
    if curl -fsS "http://127.0.0.1:\${PORT}/api/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

# Clear Chromium unclean-shutdown flags so power loss never triggers "Restore pages?" prompts
CHROMIUM_CFG_DIR="\${HOME}/.config/chromium"
if [[ -f "\${CHROMIUM_CFG_DIR}/Default/Preferences" ]]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/g' "\${CHROMIUM_CFG_DIR}/Default/Preferences" || true
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/g' "\${CHROMIUM_CFG_DIR}/Default/Preferences" || true
fi
if [[ -f "\${CHROMIUM_CFG_DIR}/Local State" ]]; then
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/g' "\${CHROMIUM_CFG_DIR}/Local State" || true
fi

if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium-browser"
else
  CHROMIUM_BIN="chromium"
fi

exec "\${CHROMIUM_BIN}" \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --disable-restore-session-state \\
  --disable-pinch \\
  --overscroll-history-navigation=0 \\
  --autoplay-policy=no-user-gesture-required \\
  --check-for-update-interval=31536000 \\
  --ozone-platform-hint=auto \\
  --enable-features=OverlayScrollbar \\
  "\${TARGET_URL}"
EOF

chmod +x "${LAUNCHER_SCRIPT}"

# 4. Register Autostart for XDG Desktop (Wayfire / LXDE / GNOME) AND Raspberry Pi OS Bookworm labwc
mkdir -p "${HOME}/.config/autostart"
cat > "${DESKTOP_ENTRY}" <<EOF
[Desktop Entry]
Type=Application
Name=Ambiently Smart Display Kiosk
Comment=Launches Ambiently in fullscreen Chromium kiosk mode
Exec=${LAUNCHER_SCRIPT}
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

# Also register in labwc autostart if labwc is active on Raspberry Pi OS Bookworm
if command -v labwc >/dev/null 2>&1 || [[ -d "${HOME}/.config/labwc" ]]; then
  mkdir -p "${HOME}/.config/labwc"
  touch "${LABWC_AUTOSTART}"
  if ! grep -q "ambiently-kiosk-launch.sh" "${LABWC_AUTOSTART}"; then
    echo "${LAUNCHER_SCRIPT} &" >> "${LABWC_AUTOSTART}"
  fi
  # Avoid launching twice if XDG autostart is also read; labwc ignores ~/.config/autostart unless xdg-autostart is enabled
fi

# Disable Raspberry Pi screen blanking via raspi-config if available
if command -v raspi-config >/dev/null 2>&1; then
  sudo raspi-config nonint do_blanking 1 >/dev/null 2>&1 || true
fi

echo ""
echo "============================================================"
echo "✅ Ambiently Raspberry Pi Setup Complete!"
echo "------------------------------------------------------------"
echo "  Mode         : ${MODE}"
echo "  Target URL   : ${TARGET_URL}"
echo "  Launcher     : ${LAUNCHER_SCRIPT}"
if [[ "${MODE}" == "standalone" ]]; then
  echo "  Server Path  : ${INSTALL_DIR}"
  echo "  LAN Access   : http://$(hostname -I | awk '{print $1}'):${PORT}"
fi
echo ""
echo "Reboot your Raspberry Pi ('sudo reboot') to launch straight into Ambiently Kiosk!"
echo "To exit fullscreen on the Pi with a keyboard attached, press Alt+F4."
echo "============================================================"

# Docker & Raspberry Pi Installation Guide

Ambiently runs natively on **Raspberry Pi** (`linux/arm64`) as well as home servers (**Synology NAS, TrueNAS, Unraid, Proxmox, Portainer, Ubuntu/Debian, macOS, and Windows Docker Desktop**).

---

## Table of Contents

1. [Part 1: Raspberry Pi Kiosk & All-in-One Installation](#part-1-raspberry-pi-kiosk--all-in-one-installation)
   * [1.1 Hardware Recommendations](#11-hardware-recommendations)
   * [1.2 Step 1 — Flash Raspberry Pi OS (64-bit Desktop)](#12-step-1--flash-raspberry-pi-os-64-bit-desktop)
   * [1.3 Step 2 — Choose Your Deployment Mode](#13-step-2--choose-your-deployment-mode)
   * [1.4 Step 3 — Run the Automated Installer (`pi-kiosk-setup.sh`)](#14-step-3--run-the-automated-installer-pi-kiosk-setupsh)
   * [1.5 CLI Flags, Portrait Screen Rotation & Keyboard Shortcuts](#15-cli-flags-portrait-screen-rotation--keyboard-shortcuts)
   * [1.6 Updating or Uninstalling on Raspberry Pi](#16-updating-or-uninstalling-on-raspberry-pi)
2. [Part 2: Docker & Home Server Self-Hosting](#part-2-docker--home-server-self-hosting)
   * [2.1 Quick Start with Docker Compose](#21-quick-start-with-docker-compose)
   * [2.2 Portainer / Synology Container Manager / Unraid Setup](#22-portainer--synology-container-manager--unraid-setup)
   * [2.3 Running with Bare Node.js (Without Docker)](#23-running-with-bare-nodejs-without-docker)
   * [2.4 Environment Variables Reference (`.env`)](#24-environment-variables-reference-env)
   * [2.5 Reverse Proxy & HTTPS Setup (Caddy / Nginx / Cloudflare Tunnel)](#25-reverse-proxy--https-setup-caddy--nginx--cloudflare-tunnel)
   * [2.6 Troubleshooting & FAQ](#26-troubleshooting--faq)

---

## Part 1: Raspberry Pi Kiosk & All-in-One Installation

### 1.1 Hardware Recommendations

| Component | Recommended | Notes |
| :--- | :--- | :--- |
| **Raspberry Pi** | **Raspberry Pi 5** (2GB/4GB/8GB) or **Raspberry Pi 4** (2GB+ RAM) | For **Pi 3B+** or **Pi Zero 2 W** (512MB–1GB RAM), use **Kiosk Display Mode (`--mode kiosk`)** pointing to `dashboard.trinhism.com` or another home server. |
| **Storage** | 16GB–32GB **A2-rated microSD** (or NVMe HAT on Pi 5) | Application-class (`A2`) cards handle Chromium caching and Docker builds much faster. |
| **Power Supply** | Official Raspberry Pi USB-C PSU (`27W` for Pi 5, `15W` for Pi 4) | Prevents low-voltage throttling while driving USB touchscreens. |
| **Display** | 1080p, 1440p, or 4K HDMI wall monitor or USB/HDMI IPS touchscreen | Supports landscape (`0°`/`180°`) and portrait (`90°`/`270°`) wall orientations. |

---

### 1.2 Step 1 — Flash Raspberry Pi OS (64-bit Desktop)

1. Download and open **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)** on your computer.
2. Select your **Raspberry Pi Device** (e.g., *Raspberry Pi 5* or *Raspberry Pi 4*).
3. Under **Operating System**, choose:
   * **Raspberry Pi OS (64-bit)** *(the standard version **with Desktop** — do NOT pick "Lite", since Chromium requires a desktop compositor)*.
4. Select your microSD card, click **Next**, and click **Edit Settings** (*OS Customisation*):
   * **General Tab:**
     * **Set hostname:** `ambiently` *(reachable on home Wi-Fi at `ambiently.local`)*
     * **Set username and password:** e.g., username `pi` and a strong password
     * **Configure wireless LAN:** Enter your home Wi-Fi SSID, password, and country code
     * **Set locale settings:** Choose your local timezone (e.g., `America/Chicago`) and keyboard layout
   * **Services Tab:**
     * Check **Enable SSH** (Use password authentication or public-key) so you can manage the wall display remotely from your laptop.
5. Flash the card, insert it into your Raspberry Pi, connect HDMI + USB touch (if using a touchscreen), and power it on.
6. Ensure **Desktop Auto-Login** is enabled (default on Raspberry Pi OS Desktop; or verify via `sudo raspi-config` -> **1 System Options** -> **S5 Boot / Auto Login** -> **B4 Desktop Autologin**).

---

### 1.3 Step 2 — Choose Your Deployment Mode

`scripts/pi-kiosk-setup.sh` supports **two modes**:

* **Mode 1: Kiosk Display Mode (`--mode kiosk`)**
  * Boots the Pi straight into fullscreen Chromium pointing to **`https://dashboard.trinhism.com`** (or your own home NAS Docker server such as `http://192.168.1.50:8080`).
  * Ideal when you already use Cloud Sync or run Docker on a central home server, or on lower-RAM boards (`1GB` RAM).
* **Mode 2: All-in-One Standalone Mode (`--mode standalone`)**
  * Automatically installs **Docker Engine (`arm64`)**, builds and starts the Ambiently server container locally on the Pi (`127.0.0.1:8080`, `restart: unless-stopped`), waits for `/api/health` on boot, and opens fullscreen Chromium to **`http://localhost:8080`**.
  * Other phones, tablets, and laptops on your home Wi-Fi can also access the Pi's server at `http://ambiently.local:8080` (or `http://<pi-ip>:8080`).
  * Calendar, RSS, Reader, and Recipe scraping run directly from your home internet connection with zero cloud dependency.

---

### 1.4 Step 3 — Run the Automated Installer (`pi-kiosk-setup.sh`)

SSH into your Raspberry Pi (`ssh pi@ambiently.local`) or open a **Terminal** on the Pi desktop as your normal desktop user (**do not run the script itself with `sudo`**—it will prompt for `sudo` only when installing packages):

```bash
# 1. Clone Ambiently
git clone https://github.com/Genghis1227/ambiently.git ~/ambiently
cd ~/ambiently

# 2. Launch the interactive setup wizard
bash scripts/pi-kiosk-setup.sh
```

Or run non-interactively with flags:

```bash
# Option A: All-in-One Standalone Pi (runs local Docker server + HDMI Kiosk)
bash scripts/pi-kiosk-setup.sh --mode standalone --port 8080

# Option B: Kiosk Display pointing to hosted Ambiently
bash scripts/pi-kiosk-setup.sh --mode kiosk --url https://dashboard.trinhism.com

# Option C: Kiosk Display pointing to a Synology / Unraid NAS on your LAN
bash scripts/pi-kiosk-setup.sh --mode kiosk --url http://192.168.1.50:8080

# Option D: Portrait wall-mounted monitor (rotated 90 degrees)
bash scripts/pi-kiosk-setup.sh --mode standalone --rotate 90
```

Once finished, reboot the Pi to launch straight into Ambiently:

```bash
sudo reboot
```

#### What the Installer Configures Under the Hood
* **Wayland & X11 Support:** Configures autostart for Raspberry Pi OS Bookworm's **Wayland (`labwc` and `wayfire`)** as well as **X11 (`LXDE-pi` / XDG `~/.config/autostart`)**.
* **Power-Cut Recovery:** Automatically resets Chromium's `exited_cleanly` and `exit_type` flags before every boot so power outages never display the yellow *"Chromium didn't shut down correctly — Restore pages?"* banner.
* **Touchscreen Lockout Protection:** Launches Chromium with `--kiosk --disable-pinch --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required` so family members tapping chores or recipes cannot accidentally pinch-zoom or swipe-back out of the dashboard.
* **Burn-In Safe Night Mode:** Disables OS screen blanking (`raspi-config nonint do_blanking 1` / `xset -dpms`) so Ambiently's own **Scheduled Night Mode & Pixel-Shifting OLED Clock** manages night dimming and morning wake-up cleanly.

---

### 1.5 CLI Flags, Portrait Screen Rotation & Keyboard Shortcuts

| Flag | Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `--mode` | `kiosk` \| `standalone` | *(Interactive prompt)* | `kiosk` connects to a URL; `standalone` installs Docker, starts the local server, and launches Kiosk. |
| `--url` | Any `http://` or `https://` URL | `https://dashboard.trinhism.com` | Target dashboard URL when `--mode kiosk` is selected. |
| `--port` | `1024`–`65535` | `8080` | Local HTTP port for the Docker container in `--mode standalone`. |
| `--rotate` | `0` \| `90` \| `180` \| `270` | `0` | Rotates the display output on boot via `wlr-randr` (Wayland) or `xrandr` (X11). |
| `--uninstall` | *(None)* | — | Removes the kiosk launcher and autostart hooks cleanly. |

**Useful Keyboard Shortcuts (when a USB/Bluetooth keyboard is attached):**
* **`Alt + F4`**: Close the fullscreen Chromium kiosk window and return to the Raspberry Pi desktop.
* **`\` (Backslash)**: Toggle hiding/showing the Ambiently Navigation Dock.
* **`1` – `9`, `0`**: Switch directly to Canvas `1` through `10`.

---

### 1.6 Updating or Uninstalling on Raspberry Pi

**Update Standalone Raspberry Pi Server:**
```bash
cd ~/ambiently
git pull
sudo docker compose up -d --build
```

**Disable Kiosk Autostart:**
```bash
cd ~/ambiently
bash scripts/pi-kiosk-setup.sh --uninstall
```

---

## Part 2: Docker & Home Server Self-Hosting

The Ambiently Docker image (`Dockerfile`) compiles both the React 19 PWA (`dist/`) and all 7 serverless proxy routes (`functions/api/*` + `server/index.ts` -> `dist-server/index.mjs`) into a minimal, zero-dependency, non-root **`node:22-alpine`** image (`~55 MB`) supporting both **`linux/amd64`** and **`linux/arm64`**.

### 2.1 Quick Start with Docker Compose

**Prerequisites:** Docker Engine `24+` and Docker Compose `v2+` (or Docker Desktop on Windows/macOS).

```bash
# 1. Clone the repository
git clone https://github.com/Genghis1227/ambiently.git
cd ambiently

# 2. (Optional) Copy .env.example to .env to customize port, timezone, or Supabase credentials
cp .env.example .env

# 3. Build and start in detached mode
docker compose up -d --build

# 4. Verify container health
curl http://localhost:8080/api/health
```

Open **`http://localhost:8080`** (or `http://<server-ip>:8080` from any tablet, smart display, or phone on your network).

**Updating your Docker deployment:**
```bash
cd ambiently
git pull
docker compose up -d --build
```

---

### 2.2 Portainer / Synology Container Manager / Unraid Setup

1. SSH into your NAS (or use your NAS Git/File Manager) to clone `https://github.com/Genghis1227/ambiently.git` into a folder such as `/volume1/docker/ambiently` (Synology) or `/mnt/user/appdata/ambiently` (Unraid).
2. In **Synology Container Manager** (*Project -> Create*), **Portainer** (*Stacks -> Add stack -> Git Repository*), or **Unraid Compose Manager**, point to [`compose.yaml`](compose.yaml):

```yaml
services:
  ambiently:
    build:
      context: .
      dockerfile: Dockerfile
    image: ambiently:latest
    container_name: ambiently
    restart: unless-stopped
    ports:
      - "${AMBIENTLY_PORT:-8080}:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      - TZ=${TZ:-America/Chicago}
      - SUPABASE_URL=${SUPABASE_URL:-}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-}
      - AMBIENTLY_ALLOW_PRIVATE_FEEDS=${AMBIENTLY_ALLOW_PRIVATE_FEEDS:-false}
    security_opt:
      - no-new-privileges:true
```

3. Deploy the stack and access Ambiently at `http://<nas-ip>:8080`.

---

### 2.3 Running with Bare Node.js (Without Docker)

Because `npm run build:server` bundles the HTTP server and all API handlers into `dist-server/index.mjs`, you can also run Ambiently directly with Node.js `20+` (e.g., via `systemd` or `pm2`):

```bash
git clone https://github.com/Genghis1227/ambiently.git
cd ambiently
npm ci
npm run build
npm run build:server

# Start production server on port 8080
PORT=8080 npm start
```

---

### 2.4 Environment Variables Reference (`.env`)

All runtime variables in Docker take effect immediately on `docker compose up -d` **without rebuilding the image**:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `AMBIENTLY_PORT` | `8080` | Host port mapped to container port `8080` in `compose.yaml`. |
| `PORT` | `8080` | Internal port `server/index.ts` listens on. |
| `HOST` | `0.0.0.0` | Bind address inside the container / host. |
| `TZ` | `America/Chicago` | Container timezone for logs and server-side date fallbacks. |
| `SUPABASE_URL` | *(empty)* | Optional runtime Supabase project URL injected dynamically via `/config.js` for multi-device Realtime cloud sync. |
| `SUPABASE_ANON_KEY` | *(empty)* | Optional runtime Supabase publishable `anon` key (never use `service_role`). |
| `AMBIENTLY_ALLOW_PRIVATE_FEEDS` | `false` | Set to `true` **only on trusted home networks** to allow `http://`, RFC1918 LAN (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`), Tailscale (`100.64.0.0/10`), and `.local`/`.lan` calendar & RSS URLs (e.g., Nextcloud, Radicale, FreshRSS, Home Assistant). Loopback (`127.0.0.1` / `localhost`) and cloud metadata (`169.254.169.254`) remain blocked at all times. |

---

### 2.5 Reverse Proxy & HTTPS Setup (Caddy / Nginx / Cloudflare Tunnel)

Modern browser APIs like **Screen Wake Lock** (`navigator.wakeLock`), **Service Workers (offline PWA install)**, and **File System Access API** require a **Secure Context** (`https://` or `http://localhost`).

* When running in **All-in-One Standalone Mode** on a Raspberry Pi (`http://localhost:8080`), Chromium automatically treats `localhost` as a Secure Context—so PWA offline caching and Screen Wake Lock work out of the box!
* When accessing a central home NAS Docker server from remote wall tablets (`192.168.1.x`), putting **Caddy**, **Nginx Proxy Manager**, **Tailscale Serve**, or **Cloudflare Tunnel** in front of port `8080` enables full HTTPS:

**Example `Caddyfile`:**
```caddyfile
dashboard.yourdomain.com {
    reverse_proxy ambiently:8080
}
```

---

### 2.6 Troubleshooting & FAQ

* **Why did my Google Calendar stop showing `HTTP 429` errors after switching to Docker?**
  * Public serverless platforms share egress IP addresses across thousands of tenants, which Google occasionally throttles. Self-hosting in Docker fetches `.ics` feeds directly from your residential ISP IP (combined with Ambiently's 15-minute SHA-256 server cache and `ETag` `304` revalidation).
* **How do I connect a local Nextcloud, Radicale, or Home Assistant `.ics` calendar on my LAN?**
  * Set `AMBIENTLY_ALLOW_PRIVATE_FEEDS=true` in `.env` (or `compose.yaml`) and run `docker compose up -d`.
* **My Raspberry Pi screen still turns black after 10 minutes on Wayland.**
  * Verify `raspi-config` screen blanking is disabled (`sudo raspi-config` -> **2 Display Options** -> **D4 Screen Blanking** -> **No**) and reboot.
* **How do I check server logs in Docker?**
  * Run `docker compose logs -f ambiently`.

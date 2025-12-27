#!/usr/bin/env bash
set -euo pipefail

# Install location (local, no apt)
MONGO_DIR="${MONGO_DIR:-./mongodb}"
DATA_DIR="${DATA_DIR:-$MONGO_DIR/data/db}"
LOG_FILE="${LOG_FILE:-$MONGO_DIR/mongodb.log}"
PID_FILE="${PID_FILE:-$MONGO_DIR/mongod.pid}"
MONGO_BIN="$MONGO_DIR/bin/mongod"

# MongoDB official "direct download links" page (contains exact fastdl URLs)
RELEASES_URL="https://www.mongodb.com/try/download/community-edition/releases"

say() { echo "[$(date +'%H:%M:%S')] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"
}

detect_arch() {
  local m
  m="$(uname -m)"
  case "$m" in
    x86_64|amd64) echo "x86_64" ;;
    aarch64|arm64) echo "aarch64" ;;
    *) die "Unsupported CPU arch: $m (need x86_64/amd64 or aarch64/arm64)" ;;
  esac
}

detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "linux"
  else
    die "Unsupported OS type: $OSTYPE"
  fi
}

detect_ubuntu_series() {
  # Returns ubuntu2404/ubuntu2204/ubuntu2004/ubuntu1804/ubuntu1604 best-match.
  # Newer Ubuntu versions map to latest supported (currently 24.04).
  local ver major minor
  if command -v lsb_release >/dev/null 2>&1; then
    ver="$(lsb_release -rs)"
  elif [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    ver="${VERSION_ID:-}"
  else
    die "Cannot detect Ubuntu version (no lsb_release and no /etc/os-release)"
  fi

  major="${ver%%.*}"
  minor="${ver#*.}"
  minor="${minor%%.*}"

  # sanity
  [[ "$major" =~ ^[0-9]+$ ]] || die "Bad Ubuntu VERSION_ID: $ver"

  # Map: >=24 -> ubuntu2404, >=22 -> ubuntu2204, >=20 -> ubuntu2004, >=18 -> ubuntu1804, else ubuntu1604
  if (( major > 24 )) || (( major == 24 && minor >= 4 )); then
    echo "ubuntu2404"
  elif (( major > 22 )) || (( major == 22 && minor >= 4 )); then
    echo "ubuntu2204"
  elif (( major > 20 )) || (( major == 20 && minor >= 4 )); then
    echo "ubuntu2004"
  elif (( major > 18 )) || (( major == 18 && minor >= 4 )); then
    echo "ubuntu1804"
  else
    echo "ubuntu1604"
  fi
}

fetch_releases_page() {
  # Use a browser-ish UA because some environments get odd responses otherwise.
  curl -fsSL -A "Mozilla/5.0 (X11; Linux) start_mongo.sh" "$RELEASES_URL"
}

# Extract the FIRST matching fastdl archive URL for a given platform+arch.
# This ensures we always choose a real artifact (no guessing => no 403).
pick_linux_ubuntu_url() {
  local page="$1"
  local arch="$2"        # x86_64 or aarch64
  local ubuntu="$3"      # ubuntu2404/2204/2004/1804/1604

  # Example on the page:
  # "Archive: mongodb-linux-x86_64-ubuntu2404-8.2.3.tgz"
  # We match the first occurrence for that ubuntu+arch (which is the newest version that supports it).
  local re url
  re="https://fastdl\.mongodb\.org/linux/mongodb-linux-${arch}-${ubuntu}-[0-9]+\.[0-9]+\.[0-9]+\.tgz"

  url="$(printf '%s' "$page" | grep -Eo "$re" | head -n 1 || true)"
  [[ -n "$url" ]] || die "No MongoDB tarball found on releases page for ${ubuntu} (${arch}). MongoDB may not support this Ubuntu anymore."
  printf '%s' "$url"
}

pick_macos_url() {
  local page="$1"
  local arch="$2"  # x86_64 or aarch64

  # On the page macOS uses:
  # - mongodb-macos-x86_64-8.2.3.tgz
  # - mongodb-macos-arm64-8.2.3.tgz
  local mac_arch re url
  if [[ "$arch" == "aarch64" ]]; then
    mac_arch="arm64"
  else
    mac_arch="x86_64"
  fi

  re="https://fastdl\.mongodb\.org/osx/mongodb-macos-${mac_arch}-[0-9]+\.[0-9]+\.[0-9]+\.tgz"
  url="$(printf '%s' "$page" | grep -Eo "$re" | head -n 1 || true)"
  [[ -n "$url" ]] || die "No MongoDB macOS tarball found on releases page for ${mac_arch}."
  printf '%s' "$url"
}

download_and_extract() {
  local url="$1"
  local tmp="mongodb.tgz"

  say "Downloading: $url"

  # Fail early if URL doesn't exist (MongoDB often returns 403 for missing artifacts).
  if ! curl -fsSI -A "Mozilla/5.0 (X11; Linux) start_mongo.sh" "$url" >/dev/null; then
    die "Tarball URL is not accessible (missing artifact or blocked): $url"
  fi

  curl -fL --retry 3 --retry-delay 1 -A "Mozilla/5.0 (X11; Linux) start_mongo.sh" -o "$tmp" "$url"

  mkdir -p "$MONGO_DIR"
  tar -zxf "$tmp" -C "$MONGO_DIR" --strip-components=1
  rm -f "$tmp"
}

ensure_mongo_installed() {
  if [[ -x "$MONGO_BIN" ]]; then
    say "MongoDB already present at $MONGO_BIN"
    return 0
  fi

  say "MongoDB not found at $MONGO_BIN"
  say "Fetching official MongoDB releases page: $RELEASES_URL"
  local page os arch url ubuntu
  os="$(detect_os)"
  arch="$(detect_arch)"
  page="$(fetch_releases_page)" || die "Failed to fetch releases page: $RELEASES_URL"

  if [[ "$os" == "macos" ]]; then
    url="$(pick_macos_url "$page" "$arch")"
  else
    # If it's Ubuntu, pick the best-matching ubuntu series.
    if [[ -r /etc/os-release ]]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      if [[ "${ID:-}" != "ubuntu" ]]; then
        die "This script currently auto-handles Ubuntu on Linux (ID=$ID). If you need Debian/RHEL too, tell me and I’ll extend it."
      fi
    else
      die "Cannot read /etc/os-release to confirm Linux distro."
    fi

    ubuntu="$(detect_ubuntu_series)"
    url="$(pick_linux_ubuntu_url "$page" "$arch" "$ubuntu")"
  fi

  say "Selected tarball: $url"
  download_and_extract "$url"

  [[ -x "$MONGO_BIN" ]] || die "Extraction finished but mongod not found at $MONGO_BIN"
  say "MongoDB installed into $MONGO_DIR"
}

start_mongo() {
  mkdir -p "$DATA_DIR"

  # If already running, don't start another.
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    say "MongoDB already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  say "Starting MongoDB..."
  "$MONGO_BIN" \
    --dbpath "$DATA_DIR" \
    --logpath "$LOG_FILE" \
    --pidfilepath "$PID_FILE" \
    --bind_ip 127.0.0.1 \
    --port 27017

  # Quick health check: process exists
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    say "MongoDB started successfully! (pid $(cat "$PID_FILE"))"
    say "Log: $LOG_FILE"
  else
    die "MongoDB failed to start. Check log: $LOG_FILE"
  fi
}

main() {
  need curl
  need tar
  ensure_mongo_installed
  start_mongo
}

main "$@"

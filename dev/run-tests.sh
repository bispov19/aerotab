#!/usr/bin/env bash
# Runs AeroTab in a throwaway, headless GNOME Shell and drives it with the
# test harness. Nothing touches your real session: settings (dconf),
# extensions, runtime dir, D-Bus session and Wayland socket are all private.
#
#   dev/run-tests.sh [output-dir]          # 1, 2, 5 and 15 windows
#   MULTI=1 dev/run-tests.sh [output-dir]  # two monitors
#   PREFS=1 dev/run-tests.sh [output-dir]  # screenshots of the preferences window
#
# Results: <output-dir>/results.json, screenshots *.png, shell.log
set -euo pipefail

DEV="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DEV")"
OUT="${1:-$(mktemp -d)}"
SANDBOX="$(mktemp -d)"
cleanup() {
    fusermount3 -u "$SANDBOX/runtime/doc" 2>/dev/null || fusermount -u "$SANDBOX/runtime/doc" 2>/dev/null || true
    rm -rf "$SANDBOX" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$OUT" "$SANDBOX"/{config,cache,runtime,data/gnome-shell/extensions}
chmod 700 "$SANDBOX/runtime"
glib-compile-schemas "$ROOT/schemas"
ln -s "$ROOT" "$SANDBOX/data/gnome-shell/extensions/aerotab@bispov19"
cp -r "$DEV/harness" "$SANDBOX/data/gnome-shell/extensions/aerotab-harness@dev"

MONITORS=(--virtual-monitor 1920x1080)
[[ "${MULTI:-0}" == 1 ]] && MONITORS+=(--virtual-monitor 1600x900)

env -i HOME="$HOME" USER="$USER" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    XDG_CONFIG_HOME="$SANDBOX/config" XDG_CACHE_HOME="$SANDBOX/cache" \
    XDG_DATA_HOME="$SANDBOX/data" XDG_RUNTIME_DIR="$SANDBOX/runtime" \
    XDG_DATA_DIRS=/usr/local/share:/usr/share \
    AEROTAB_TEST_OUT="$OUT" AEROTAB_DEV_DIR="$DEV" AEROTAB_WAYLAND=aerotab-test \
    AEROTAB_MULTI_MONITOR="${MULTI:-0}" AEROTAB_PREFS="${PREFS:-0}" AEROTAB_TEST_COUNTS="${COUNTS:-1,2,5,15}" \
    timeout 600 dbus-run-session -- bash -c '
        gsettings set org.gnome.shell enabled-extensions "[\"aerotab@bispov19\", \"aerotab-harness@dev\"]"
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
        exec gnome-shell --headless --wayland --wayland-display=aerotab-test \
            --force-animations "$@"' _ "${MONITORS[@]}" >"$OUT/shell.log" 2>&1 || true

grep -E 'AEROTAB-TEST|JS ERROR|aerotab|AeroTab' "$OUT/shell.log" | grep -v 'GLib-GIO-DEBUG' || true
echo "Output: $OUT"

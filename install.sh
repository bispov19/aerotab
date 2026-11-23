#!/usr/bin/env bash
# Builds the AeroTab zip (only the files the extension needs, no dev/)
# and installs it for the current user.
#
#   ./install.sh          # pack + install
#   ./install.sh --pack   # only create aerotab@bispov19.shell-extension.zip
set -euo pipefail
cd "$(dirname "$0")"

glib-compile-schemas schemas/
gnome-extensions pack --force \
    --extra-source=lib \
    --extra-source=prefs \
    --out-dir=. .

[[ "${1:-}" == --pack ]] && { echo "Created aerotab@bispov19.shell-extension.zip"; exit 0; }

gnome-extensions install --force aerotab@bispov19.shell-extension.zip
echo "Installed to ~/.local/share/gnome-shell/extensions/aerotab@bispov19"
echo "Wayland: log out and back in once, then: gnome-extensions enable aerotab@bispov19"

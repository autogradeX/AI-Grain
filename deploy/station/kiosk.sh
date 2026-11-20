#!/bin/sh
# Turns the station computer into a one-screen grain tester: at power-on it
# opens AI-Grain's Simple mode full-screen, prints slips without a dialog and
# keeps the screen on. Run once as the user who signs in at the station
# (not root), on a desktop such as Ubuntu or Raspberry Pi OS:
#   sh deploy/station/kiosk.sh [address]       # default http://localhost:3000
# Undo: rm ~/.config/autostart/ai-grain-kiosk.desktop
set -eu
address="${1:-http://localhost:3000}"
browser=""
for b in chromium chromium-browser google-chrome; do
  if command -v "$b" >/dev/null 2>&1; then browser="$b"; break; fi
done
if [ -z "$browser" ]; then
  echo "Install Chromium first: sudo apt install -y chromium (or chromium-browser)" >&2
  exit 1
fi

# The browser keeps its own profile so the sign-in, the cameras and the
# balance/moisture meter chosen once are remembered.
profile="$HOME/.config/ai-grain-kiosk"
mkdir -p "$profile" "$HOME/.config/autostart"

cat > "$HOME/.config/autostart/ai-grain-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=AI-Grain station
Comment=Opens Simple mode full-screen
Exec=sh -c 'xset s off -dpms 2>/dev/null; until curl -sf $address/api/health >/dev/null; do sleep 3; done; exec $browser --kiosk --kiosk-printing --noerrdialogs --disable-session-crashed-bubble --disable-infobars --check-for-update-interval=31536000 --user-data-dir=$profile $address/simple'
X-GNOME-Autostart-enabled=true
DESKTOP

echo "Done. At the next sign-in the station opens $address/simple full-screen."
echo "First time only: sign in, then on the screen allow the cameras, and choose the"
echo "balance and moisture meter once in the full app (Settings), as an admin."
echo "Leave kiosk mode with Alt+F4; it opens again at the next sign-in."

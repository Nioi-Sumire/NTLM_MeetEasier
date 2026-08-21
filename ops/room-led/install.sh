#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root." >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MODE=${1:-install}
ROOM_LED_USER=${ROOM_LED_USER:-${SUDO_USER:-}}
GPIO_GREEN=${GPIO_GREEN:-17}
GPIO_RED=${GPIO_RED:-25}
INSTALL_DIR=/opt/room-led
SERVICE_FILE=/etc/systemd/system/room-led.service
BACKUP_DIR=/var/backups/room-led
STAMP=$(date +%Y%m%d-%H%M%S)

case "$MODE" in
  install|--check) ;;
  *)
    echo "Usage: $0 [--check]" >&2
    exit 1
    ;;
esac

if [ -z "$ROOM_LED_USER" ] || [ "$ROOM_LED_USER" = "root" ]; then
  echo "Set ROOM_LED_USER to the unprivileged account that runs MeetEasier." >&2
  echo "When invoked through sudo, the calling user is selected automatically." >&2
  exit 1
fi

case "$GPIO_GREEN" in
  ''|*[!0-9]*)
    echo "GPIO_GREEN must be a line number." >&2
    exit 1
    ;;
esac

case "$GPIO_RED" in
  ''|*[!0-9]*)
    echo "GPIO_RED must be a line number." >&2
    exit 1
    ;;
esac

if [ "$GPIO_GREEN" = "$GPIO_RED" ]; then
  echo "GPIO_GREEN and GPIO_RED must use different lines." >&2
  exit 1
fi

id "$ROOM_LED_USER" >/dev/null 2>&1 || {
  echo "User $ROOM_LED_USER does not exist." >&2
  exit 1
}
ROOM_LED_GROUP=$(id -gn "$ROOM_LED_USER")

getent group gpio >/dev/null 2>&1 || {
  echo "Group gpio does not exist." >&2
  exit 1
}

for command in /usr/bin/node /usr/bin/gpiodetect /usr/bin/gpioinfo /usr/bin/gpioset /usr/bin/systemd-analyze; do
  [ -x "$command" ] || {
    echo "Required executable is missing: $command" >&2
    exit 1
  }
done

/usr/bin/node --check "$SCRIPT_DIR/led-daemon.js"

GPIOD_VERSION=$(/usr/bin/gpioset --version 2>&1)
case "$GPIOD_VERSION" in
  *"(libgpiod) v1."*) GPIOD_MAJOR=1 ;;
  *"(libgpiod) v2."*) GPIOD_MAJOR=2 ;;
  *)
    echo "Unsupported or unrecognized gpioset version:" >&2
    echo "$GPIOD_VERSION" >&2
    exit 1
    ;;
esac

TEMP_DIR=$(mktemp -d)
RENDERED_SERVICE="$TEMP_DIR/room-led.service"

cleanup() {
  rm -f -- "$RENDERED_SERVICE"
  rmdir -- "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

sed \
  -e "s/@ROOM_LED_USER@/$ROOM_LED_USER/g" \
  -e "s/@ROOM_LED_GROUP@/$ROOM_LED_GROUP/g" \
  -e "s/@GPIO_GREEN@/$GPIO_GREEN/g" \
  -e "s/@GPIO_RED@/$GPIO_RED/g" \
  "$SCRIPT_DIR/room-led.service.in" >"$RENDERED_SERVICE"

/usr/bin/systemd-analyze verify "$RENDERED_SERVICE"

if [ "$MODE" = "--check" ]; then
  echo "Preflight passed for user $ROOM_LED_USER, libgpiod $GPIOD_MAJOR.x and GPIO lines $GPIO_GREEN/$GPIO_RED."
  exit 0
fi

install -d -m 0700 "$BACKUP_DIR"
if [ -f "$INSTALL_DIR/led-daemon.js" ]; then
  cp -p "$INSTALL_DIR/led-daemon.js" "$BACKUP_DIR/led-daemon.js.$STAMP"
fi
if [ -f "$SERVICE_FILE" ]; then
  cp -p "$SERVICE_FILE" "$BACKUP_DIR/room-led.service.$STAMP"
fi

install -d -o root -g root -m 0755 "$INSTALL_DIR"
install -o root -g root -m 0755 "$SCRIPT_DIR/led-daemon.js" "$INSTALL_DIR/led-daemon.js"

install -o root -g root -m 0644 "$RENDERED_SERVICE" "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable room-led.service
systemctl restart room-led.service

echo "Installed room-led.service for $ROOM_LED_USER."
echo "Backups, when applicable, are in $BACKUP_DIR."

if sudo -n -l -U "$ROOM_LED_USER" 2>/dev/null | grep -q '/usr/bin/gpioset'; then
  echo "WARNING: $ROOM_LED_USER still has a sudoers rule for gpioset."
  echo "Verify the direct GPIO service first, then remove that obsolete rule manually."
fi

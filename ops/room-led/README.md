# Room LED daemon

The daemon reads the atomic state file written by MeetEasier and drives the
green and red room LEDs through libgpiod.

## Runtime assumptions

- Raspberry Pi 5 with an RP1 GPIO chip labelled `pinctrl-rp1`
- Node.js at `/usr/bin/node`
- libgpiod 1.x or 2.x tools at `/usr/bin/gpiodetect`, `/usr/bin/gpioinfo` and
  `/usr/bin/gpioset`
- a `gpio` group with read/write access to the GPIO character devices
- MeetEasier writes `/run/room-led/state.json`

The systemd unit assigns the service account the supplementary `gpio` group.
The daemon therefore invokes `gpioset` directly and does not require `sudo`.
With libgpiod 1.x it uses the existing one-shot mode. With libgpiod 2.x it
keeps a child `gpioset` process alive because the line values are guaranteed
only while that process owns the lines. A state change terminates that child
cleanly and replaces it with one holding the new values.

## Validated configurations

- Debian 12 with libgpiod 1.6 on the productive Raspberry Pi 5 displays
- Debian 13 with libgpiod 2.2 on the Room 6 test and replacement device

The libgpiod 2 configuration passed reboot and open-busy-open LED transitions
on 20 August 2026. On libgpiod 2.x, the persistent line owner is visible with:

```sh
pgrep -af '[g]pioset'
```

Both configured lines must also be reported as outputs owned by `gpioset`.

## Installation

From the repository root:

```sh
sudo ./ops/room-led/install.sh --check
sudo ./ops/room-led/install.sh
```

When invoked through `sudo`, the installer uses the calling account as the
unprivileged service user. Set `ROOM_LED_USER` explicitly when running from a
root session or when a different account should own the service. Optional GPIO
overrides are `GPIO_GREEN` and `GPIO_RED`. Existing daemon and unit files are
backed up below `/var/backups/room-led` before replacement. `--check` validates
the daemon, supported libgpiod major version, required system tools and
rendered systemd unit without changing the running installation.

After installation, inspect the resolved chip and the first state transition:

```sh
systemctl status room-led.service --no-pager
journalctl -u room-led.service --since "2 minutes ago" --no-pager
```

The journal output is JSON. `daemon_started` records the dynamically resolved
chip and detected libgpiod major version. A failed `gpioset` call records its
exit code, signal, stdout and stderr; the desired state is retried after
`GPIO_RETRY_INTERVAL_MS`. On libgpiod 2.x an unexpected exit of the persistent
`gpioset` child is fatal so systemd restarts the complete service.

## Removing the obsolete sudo rule

The old installation granted the display account passwordless access to the
entire `/usr/bin/gpioset` and `/usr/bin/gpioget` commands. The installer does
not delete an unknown sudoers file automatically. After the new service has
passed its GPIO and reboot tests, locate the rule with:

```sh
sudo grep -Rnl '/usr/bin/gpioset' /etc/sudoers /etc/sudoers.d
```

Inspect the returned file first. If it contains only the obsolete room-LED
rule, move it out of `/etc/sudoers.d` into the protected backup directory:

```sh
stamp=$(date +%Y%m%d-%H%M%S)
sudo install -d -o root -g root -m 0700 /var/backups/room-led
sudo mv /etc/sudoers.d/gpiod-gpioset \
  "/var/backups/room-led/gpiod-gpioset.disabled-$stamp"
sudo chmod 0600 \
  "/var/backups/room-led/gpiod-gpioset.disabled-$stamp"
sudo visudo -cf /etc/sudoers
```

Adjust the source filename if discovery returned a different dedicated file.
Never move a shared sudoers file without separating and validating its other
rules. Restart the LED service and confirm `gpio_state_applied`, both LED
states and the absence of new `sudo` entries in the journal. Keep the backup
until the rollout has been accepted.

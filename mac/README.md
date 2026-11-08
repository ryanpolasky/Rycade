# Rycade Mac mini

Turns the Intel Mac mini into the cab: local offline frontend, kiosk at login, power slider, Cloudflare-only SSH/VNC, and an outbound firewall that keeps it off the internet.

## First run

Log in as `rycade` with a monitor, keyboard and mouse attached. Open `mac/setup.sh` on GitHub, click **Raw**, copy that URL, then:

```sh
/bin/bash -c "$(curl -fsSL '<raw url>')"
```

It asks for: sudo, a GitHub browser login (to clone this repo), the `rycade` login password (auto-login), a VNC password, and the `rycade` tunnel token from Zero Trust > Networks > Tunnels. Expect a few macOS permission popups (Input Monitoring for `rycade-power`, Screen Sharing). Reboot when it finishes.

After that it's installed as `rycade`:

| command | does |
| --- | --- |
| `rycade` | re-run the whole setup (idempotent) |
| `rycade doctor` | health check |
| `rycade update` | pull through GitHub-only mode, then `refresh` with the new script |
| `rycade refresh` | reinstall `rycade-net`, rebuild `rycade-power` if its source changed, restart what changed, reload the kiosk |
| `rycade --dry-run` | print what would change |

## Network

`rycade-net` runs pf with a default-deny outbound policy, re-enforced every 30s by `com.rycade.net`.

| mode | allowed out |
| --- | --- |
| `close` (default) | DHCP, DNS, NTP, Cloudflare tunnel edge on 7844 |
| `open [30m]` | the above + GitHub (hosts resolved when opened) |
| `full [30m]` | everything |

Open modes always expire. LAN SSH/VNC (22/5900) is allowed in.

## Remote access

- Browser SSH: https://rycade-ssh.ryanpolasky.com, browser VNC: https://rycade-vnc.ryanpolasky.com (Access: ryanpolasky@hotmail.com only)
- sshd trusts the Access short-lived cert CA; the `ryanpolasky` principal logs in as `rycade`. Passwords are off.
- From a PC: `cloudflared access ssh-config --hostname rycade-ssh.ryanpolasky.com --short-lived-cert >> ~/.ssh/config`, then `ssh rycade@rycade-ssh.ryanpolasky.com`

## Cab mode

The kiosk opens `http://127.0.0.1:8787/?cab=1` (Caddy). `cab.js` then decodes and pins all art and loads every demo clip into memory as a blob, uses the vendored fonts, turns off the phone remote, and listens for `rycade-power` events.

`rycade-power` watches the Pico's Rycade Cabinet keyboard. Power-off (F18) mutes and sleeps the display, and the Mac stays awake. Power-on (F17) or any pad button wakes it and plays the boot scene. Volume keys are native, so macOS handles them. Off survives restarts: it's saved as `~/Rycade/off`, so the weekly restart or a power cut boots straight back to dark and silent until you press on.

Put ROMs in `~/Rycade/roms/{arcade,genesis,snes,nes}`; optional `~/Rycade/roms/overrides.json` maps a ROM filename to an EmulatorJS core. LIVE (F19) or Escape exits an in-page game back to the menu.

#!/bin/bash
# Rycade cab setup for the Mac mini. Safe to re-run.
# usage: setup.sh [all|doctor|update|refresh|display] [--dry-run]
set -euo pipefail

CAB_USER=rycade
SSH_PRINCIPAL=ryanpolasky
SSH_HOST=rycade-ssh.ryanpolasky.com
VNC_HOST=rycade-vnc.ryanpolasky.com
SSH_CA="ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBKUJbMl5uQJ/tGwnbUPJAR8Vv6usyg5zE/8T+PtAsIKkj5eNS6kNIjNTC4wxXS5WdOPYwMoDkc9EIsRS2b/fe3o= open-ssh-ca@cloudflareaccess.org"
REPO=ryanpolasky/Rycade
HOME_DIR=$HOME/Rycade
APP=$HOME_DIR/app
BIN=$HOME_DIR/bin
SIGN=$HOME_DIR/sign
PORT=8787
SCORES_HOST=arcade.ryanpolasky.com
CAB_MODE=1280x960
RESTART="U 04:00:00"
CORES="genesis_plus_gx snes9x mesen fbneo mame mgba"
AGENTS=$HOME/Library/LaunchAgents

ACTION=all
DRY=0
for arg in "$@"; do
  case $arg in
    --dry-run) DRY=1 ;;
    all|doctor|update|refresh|display) ACTION=$arg ;;
    *) echo "usage: setup.sh [all|doctor|update|refresh|display] [--dry-run]"; exit 2 ;;
  esac
done

bold=$'\e[1m'; green=$'\e[32m'; red=$'\e[31m'; yellow=$'\e[33m'; off=$'\e[0m'
step() { printf '\n%s==> %s%s\n' "$bold" "$*" "$off"; }
note() { printf '%s  ! %s%s\n' "$yellow" "$*" "$off"; }
ok() { printf '%s  ✓ %s%s\n' "$green" "$*" "$off"; }
run() { if (( DRY )); then echo "  [dry] $*"; else "$@"; fi; }
srun() { run sudo "$@"; }
pause() { (( DRY )) && return 0; printf '%s  → %s%s\n' "$bold" "$*" "$off"; read -r -p "    press return when done " _ </dev/tty; }
dw() { srun defaults write "$@"; }
uw() { run defaults write "$@"; }
listening() { nc -z -G 1 127.0.0.1 "$1" >/dev/null 2>&1; }

plist() {
  local label=$1 file=$2; shift 2
  local args="" a
  for a in "$@"; do args+="    <string>$a</string>"$'\n'; done
  cat <<P > "$file.tmp"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
$args  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${LOG_DIR:-$HOME_DIR/logs}/$label.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR:-$HOME_DIR/logs}/$label.log</string>
</dict>
</plist>
P
}

agent() {
  local label=$1; shift
  local file=$AGENTS/$label.plist
  mkdir -p "$AGENTS"
  plist "$label" "$file" "$@"
  if cmp -s "$file.tmp" "$file"; then rm "$file.tmp"; ok "$label unchanged"; return; fi
  if (( DRY )); then rm "$file.tmp"; echo "  [dry] load $label"; return; fi
  mv "$file.tmp" "$file"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$file"
  ok "$label loaded"
}

daemon() {
  local label=$1 interval=$2; shift 2
  local file=/Library/LaunchDaemons/$label.plist tmp
  tmp=$(mktemp)
  LOG_DIR=/var/log plist "$label" "$tmp" "$@"
  if [[ -n $interval ]]; then
    sed -i '' "s|<key>KeepAlive</key><true/>|<key>StartInterval</key><integer>$interval</integer>|" "$tmp.tmp"
  fi
  if sudo cmp -s "$tmp.tmp" "$file"; then rm -f "$tmp" "$tmp.tmp"; ok "$label unchanged"; return; fi
  if (( DRY )); then rm -f "$tmp" "$tmp.tmp"; echo "  [dry] load $label"; return; fi
  sudo install -m 644 -o root -g wheel "$tmp.tmp" "$file"
  rm -f "$tmp" "$tmp.tmp"
  sudo launchctl bootout "system/$label" 2>/dev/null || true
  sudo launchctl bootstrap system "$file"
  ok "$label loaded"
}

preflight() {
  [[ $(uname) == Darwin ]] || { echo "this is for the Mac mini"; exit 1; }
  [[ $EUID -ne 0 ]] || { echo "run as $CAB_USER, not root"; exit 1; }
  [[ $(id -un) == "$CAB_USER" ]] || note "logged in as $(id -un), expected $CAB_USER"
  sudo -v
  while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done 2>/dev/null &
  [[ ${1:-} == offline ]] && return
  if command -v rycade-net >/dev/null && [[ $(sudo rycade-net status | head -1) == closed* ]]; then
    note "opening the firewall for setup, closes again at the end"
    srun rycade-net full 60m >/dev/null
    trap 'sudo rycade-net close >/dev/null 2>&1 || true' EXIT
  fi
}

base() {
  step "Base: Xcode tools, Homebrew, packages, hostname"
  if ! xcode-select -p >/dev/null 2>&1; then
    run xcode-select --install || true
    pause "finish the Command Line Tools installer"
  fi
  ok "command line tools"
  if ! command -v brew >/dev/null; then
    for b in /usr/local/bin/brew /opt/homebrew/bin/brew; do [[ -x $b ]] && eval "$($b shellenv)"; done
  fi
  if ! command -v brew >/dev/null; then
    run env NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for b in /usr/local/bin/brew /opt/homebrew/bin/brew; do [[ -x $b ]] && eval "$($b shellenv)"; done
  fi
  export HOMEBREW_NO_ANALYTICS=1 HOMEBREW_NO_AUTO_UPDATE=1
  run brew analytics off
  local f
  for f in cloudflared caddy displayplacer gh; do
    brew list --formula "$f" >/dev/null 2>&1 || run brew install "$f"
  done
  brew list --cask google-chrome >/dev/null 2>&1 || run brew install --cask google-chrome
  srun xattr -dr com.apple.quarantine "/Applications/Google Chrome.app" 2>/dev/null || true
  ok "brew packages"
  for k in ComputerName HostName LocalHostName; do
    [[ $(scutil --get $k 2>/dev/null) == rycade ]] || srun scutil --set $k rycade
  done
  ok "hostname rycade"
  mkdir -p "$BIN" "$HOME_DIR"/{logs,bios,saves,states,cores} "$HOME_DIR"/roms/{arcade,genesis,snes,nes,gba}
}

repo() {
  step "Rycade frontend (local copy)"
  if [[ ! -d $APP/.git ]]; then
    gh auth status >/dev/null 2>&1 || run gh auth login --hostname github.com --git-protocol https --web
    run gh auth setup-git
    run gh repo clone "$REPO" "$APP"
    git_creds
  else
    git_creds
    run git -C "$APP" pull --ff-only
  fi
  ok "$APP"
}

git_creds() {
  [[ -d $APP/.git ]] || return 0
  run git -C "$APP" config credential.helper store
  [[ -s $HOME/.git-credentials ]] && return
  local token
  token=$(gh auth token 2>/dev/null) || return 0
  (( DRY )) && return
  (umask 077; printf 'https://%s:%s@github.com\n' "${REPO%%/*}" "$token" > "$HOME/.git-credentials")
}

no_auto_updates() {
  local k
  srun softwareupdate --schedule off >/dev/null 2>&1 || true
  for k in AutomaticCheckEnabled AutomaticDownload AutomaticallyInstallMacOSUpdates CriticalUpdateInstall ConfigDataInstall; do
    dw /Library/Preferences/com.apple.SoftwareUpdate "$k" -bool false
  done
  dw /Library/Preferences/com.apple.commerce AutoUpdate -bool false
}

never_down() {
  step "Never down: power, restarts, updates, login"
  local k v
  for kv in sleep=0 displaysleep=0 disksleep=0 powernap=0 autorestart=1 womp=1 standby=0 autopoweroff=0 tcpkeepalive=1; do
    k=${kv%=*}; v=${kv#*=}
    srun pmset -a "$k" "$v" 2>/dev/null || true
  done
  # shellcheck disable=SC2086
  srun pmset repeat restart $RESTART
  ok "no sleep, restart after power loss, weekly restart ($RESTART)"
  no_auto_updates
  dw "/Library/Application Support/CrashReporter/DiagnosticMessagesHistory.plist" AutoSubmit -bool false
  dw "/Library/Application Support/CrashReporter/DiagnosticMessagesHistory.plist" ThirdPartyDataSubmit -bool false
  srun tmutil disable 2>/dev/null || true
  ok "auto updates, analytics, Time Machine off"

  if fdesetup status | grep -q "On"; then
    note "FileVault is on, which blocks auto-login after a power cut. Turning it off (enter the login password)."
    srun fdesetup disable || note "FileVault disable failed, do it in System Settings > Privacy & Security"
  fi
  ok "FileVault off (decrypting in the background is fine)"
  if [[ $(sudo defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null) != "$CAB_USER" ]]; then
    local pw
    read -r -s -p "  login password for $CAB_USER (for auto-login): " pw </dev/tty; echo
    dscl . -authonly "$CAB_USER" "$pw" || { note "wrong password, skipping auto-login"; return; }
    srun sysadminctl -autologin set -userName "$CAB_USER" -password "$pw" 2>/dev/null || true
    if [[ $(sudo defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null) != "$CAB_USER" ]]; then
      (( DRY )) || printf '%s' "$pw" | perl -e '
        my @k = (0x7D,0x89,0x52,0x23,0xD2,0xBC,0xDD,0xEA,0xA3,0xB9,0x1F); local $/; my @p = unpack("C*", <STDIN>);
        push @p, 0; push @p, 0 while @p % 12; print pack("C*", map { $p[$_] ^ $k[$_ % 11] } 0..$#p);' | sudo tee /etc/kcpassword >/dev/null
      srun chmod 600 /etc/kcpassword
      dw /Library/Preferences/com.apple.loginwindow autoLoginUser "$CAB_USER"
    fi
  fi
  ok "auto-login as $CAB_USER"
}

remote() {
  step "Remote access: SSH + VNC through the rycade tunnel"
  if ! listening 22; then
    srun systemsetup -setremotelogin on >/dev/null 2>&1 || srun launchctl enable system/com.openssh.sshd
    srun launchctl bootstrap system /System/Library/LaunchDaemons/ssh.plist 2>/dev/null || true
    sleep 2
    listening 22 || pause "System Settings > General > Sharing: turn on Remote Login"
  fi
  dscl . -read "/Users/$CAB_USER" RecordName | grep -qw "$SSH_PRINCIPAL" || srun dscl . -append "/Users/$CAB_USER" RecordName "$SSH_PRINCIPAL"
  local tmp; tmp=$(mktemp)
  cat > "$tmp" <<S
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers $CAB_USER $SSH_PRINCIPAL
TrustedUserCAKeys /etc/ssh/rycade_cloudflare_ca.pub
AuthorizedPrincipalsFile /etc/ssh/rycade_principals/principals
S
  if (( ! DRY )); then
    echo "$SSH_CA" | sudo tee /etc/ssh/rycade_cloudflare_ca.pub >/dev/null
    sudo mkdir -p /etc/ssh/rycade_principals
    printf '%s\n' "$SSH_PRINCIPAL" "$CAB_USER" | sudo tee /etc/ssh/rycade_principals/principals >/dev/null
    if ! sudo cmp -s "$tmp" /etc/ssh/sshd_config.d/100-rycade.conf; then
      sudo install -m 644 "$tmp" /etc/ssh/sshd_config.d/100-rycade.conf
      if sudo /usr/sbin/sshd -t; then sudo launchctl kickstart -k system/com.openssh.sshd 2>/dev/null || true
      else sudo rm /etc/ssh/sshd_config.d/100-rycade.conf; note "sshd config failed its test, reverted"; fi
    fi
  fi
  rm -f "$tmp"
  ok "sshd: key/cert only, Cloudflare certs for $SSH_PRINCIPAL@ log in as $CAB_USER"

  if ! listening 5900; then
    srun launchctl enable system/com.apple.screensharing
    srun launchctl bootstrap system /System/Library/LaunchDaemons/com.apple.screensharing.plist 2>/dev/null || true
    sleep 2
  fi
  if [[ ! -s /Library/Preferences/com.apple.VNCSettings.txt ]]; then
    local vnc
    read -r -s -p "  VNC password (max 8 chars, for browser VNC): " vnc </dev/tty; echo
    (( DRY )) || printf '%s' "${vnc:0:8}" | perl -e 'my @k = unpack "C*", pack "H*", "1734516E8BA8C5E2FF1C39567390ADCA"; local $/; my @p = unpack "C*", <STDIN>;
      printf "%02X", $_ ^ (shift(@p) // 0) for @k; print "\n"' | sudo tee /Library/Preferences/com.apple.VNCSettings.txt >/dev/null
    srun chmod 600 /Library/Preferences/com.apple.VNCSettings.txt
    dw /Library/Preferences/com.apple.RemoteManagement VNCLegacyConnectionsEnabled -bool true
    srun launchctl kickstart -k system/com.apple.screensharing 2>/dev/null || true
    pause "System Settings > General > Sharing > Screen Sharing (i): make sure 'VNC viewers may control screen with password' is on with that password"
  fi
  if listening 5900; then ok "Screen Sharing on :5900"; else note "Screen Sharing isn't listening yet"; fi

  srun /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on >/dev/null
  srun /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on >/dev/null
  ok "app firewall + stealth mode"

  if ! sudo test -s /etc/cloudflared/rycade.token; then
    local token
    echo "  tunnel token: Cloudflare dash > Zero Trust > Networks > Tunnels > rycade > Configure; copy the long string after 'install' in the install command"
    read -r -s -p "  paste token: " token </dev/tty; echo
    if (( ! DRY )); then
      sudo mkdir -p /etc/cloudflared
      printf '%s' "$token" | sudo tee /etc/cloudflared/rycade.token >/dev/null
      sudo chmod 600 /etc/cloudflared/rycade.token
    fi
  fi
  daemon com.rycade.cloudflared "" "$(command -v cloudflared)" tunnel --no-autoupdate --metrics 127.0.0.1:20241 run --token-file /etc/cloudflared/rycade.token
}

quiet_notifications() {
  local f i=0 id flags
  f=$(mktemp)
  defaults export com.apple.ncprefs "$f" 2>/dev/null || { rm -f "$f"; return; }
  while id=$(plutil -extract "apps.$i.bundle-id" raw "$f" 2>/dev/null); do
    if [[ $id == com.apple.BTMNotificationAgent || $id == _SYSTEM_CENTER_:com.apple.SoftwareUpdateNotification ]]; then
      flags=$(plutil -extract "apps.$i.flags" raw "$f")
      if (( flags & 1 << 25 )); then
        run plutil -replace "apps.$i.flags" -integer $(( flags & ~(1 << 25) )) "$f"
        run defaults import com.apple.ncprefs "$f"
      fi
    fi
    i=$((i + 1))
  done
  rm -f "$f"
  run killall usernoted NotificationCenter 2>/dev/null || true
}

polish() {
  step "Cab polish"
  srun nvram StartupMute=%01
  run defaults -currentHost write com.apple.screensaver idleTime -int 0
  for c in tl tr bl br; do uw com.apple.dock "wvous-$c-corner" -int 1; uw com.apple.dock "wvous-$c-modifier" -int 0; done
  uw com.apple.dock autohide -bool true
  uw com.apple.dock autohide-delay -float 1000
  uw com.apple.dock launchanim -bool false
  uw com.apple.dock show-recents -bool false
  uw NSGlobalDomain _HIHideMenuBar -bool true
  uw com.apple.loginwindow TALLogoutSavesState -bool false
  uw com.apple.CrashReporter DialogType none
  uw com.apple.assistant.support "Assistant Enabled" -bool false
  uw com.apple.Siri StatusMenuVisible -bool false
  uw com.apple.NetworkBrowser DisableAirDrop -bool true
  run defaults -currentHost write com.apple.coreservices.useractivityd ActivityAdvertisingAllowed -bool false
  run defaults -currentHost write com.apple.coreservices.useractivityd ActivityReceivingAllowed -bool false
  uw com.google.Keystone.Agent checkInterval -int 0
  dw /Library/Preferences/com.apple.Bluetooth BluetoothAutoSeekKeyboard -bool false
  dw /Library/Preferences/com.apple.Bluetooth BluetoothAutoSeekPointingDevice -bool false
  srun mdutil -a -i off >/dev/null 2>&1 || true
  run killall Dock 2>/dev/null || true
  quiet_notifications
  ok "no chime, screensaver, hot corners, Siri, Handoff, AirDrop, Spotlight indexing, keyboard-setup popup, login-item and update alerts"
}

display() {
  local id
  id=$(displayplacer list 2>/dev/null | awk '/^Persistent screen id:/ {print $4; exit}')
  if [[ -n $id ]] && displayplacer list | grep -q "res:$CAB_MODE"; then
    run displayplacer "id:$id res:$CAB_MODE scaling:off origin:(0,0) degree:0"
    ok "display $CAB_MODE"
  else
    note "no $CAB_MODE mode on this display (fine on a desk monitor, the kiosk applies it on the cab)"
  fi
}

sign_identity() {
  local kc=$SIGN/rycade-sign.keychain-db
  local tmp pass hash
  run mkdir -p "$SIGN" || return 1
  run chmod 700 "$SIGN" || return 1
  if [[ -s $kc && -s $SIGN/id ]]; then
    SIGN_HASH=$(cat "$SIGN/id") || return 1
    printf '%s\n' "$SIGN_HASH"
    return 0
  fi
  if (( DRY )); then
    note "would create the cab signing identity in $kc"
    run security create-keychain -p "" "$kc"
    run security unlock-keychain -p "" "$kc"
    run security set-keychain-settings "$kc"
    run openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -config "$SIGN/<temporary>/openssl.cnf" -keyout "$SIGN/<temporary>/k.pem" -out "$SIGN/<temporary>/c.pem"
    run openssl pkcs12 -export -inkey "$SIGN/<temporary>/k.pem" -in "$SIGN/<temporary>/c.pem" -out "$SIGN/<temporary>/id.p12" -passout 'pass:<temporary>'
    run security import "$SIGN/<temporary>/id.p12" -k "$kc" -P '<temporary>' -T /usr/bin/codesign
    run security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$kc"
    run rm -f "$SIGN/<temporary>/k.pem" "$SIGN/<temporary>/c.pem" "$SIGN/<temporary>/id.p12"
    SIGN_HASH=DRY-RUN
    printf '%s\n' "$SIGN_HASH"
    return 0
  fi
  tmp=$(mktemp -d) || return 1
  cat > "$tmp/openssl.cnf" <<'CONF'
[req]
prompt = no
distinguished_name = subject
x509_extensions = extensions
[subject]
CN = Rycade Cab Code Signing
[extensions]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CONF
  pass=$(openssl rand -hex 24) || { rm -rf "$tmp"; return 1; }
  if [[ -e $kc ]]; then
    run security delete-keychain "$kc" || run rm -f "$kc" || { rm -rf "$tmp"; return 1; }
  fi
  if ! run security create-keychain -p "" "$kc" ||
      ! run security unlock-keychain -p "" "$kc" ||
      ! run security set-keychain-settings "$kc" ||
      ! run openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -config "$tmp/openssl.cnf" -keyout "$tmp/k.pem" -out "$tmp/c.pem" ||
      ! run openssl pkcs12 -export -inkey "$tmp/k.pem" -in "$tmp/c.pem" -out "$tmp/id.p12" -passout "pass:$pass"; then
    rm -rf "$tmp"
    return 1
  fi
  hash=$(openssl x509 -in "$tmp/c.pem" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':') || { rm -rf "$tmp"; return 1; }
  if ! run security import "$tmp/id.p12" -k "$kc" -P "$pass" -T /usr/bin/codesign ||
      ! run security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$kc"; then
    rm -rf "$tmp"
    return 1
  fi
  printf '%s\n' "$hash" > "$SIGN/id" || { rm -rf "$tmp"; return 1; }
  run chmod 600 "$SIGN/id" || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp" || return 1
  SIGN_HASH=$hash
  printf '%s\n' "$SIGN_HASH"
}

sign_power() {
  local kc=$SIGN/rycade-sign.keychain-db
  local hash=${SIGN_HASH:-}
  local keychains keychain rc=0
  local -a old_keychains=() new_keychains=()
  if [[ -z $hash ]]; then hash=$(cat "$SIGN/id") || return 1; fi
  run security unlock-keychain -p "" "$kc" || return $?
  keychains=$(security list-keychains -d user) || return $?
  while IFS= read -r keychain; do
    old_keychains[${#old_keychains[@]}]=$keychain
  done < <(printf '%s\n' "$keychains" | sed -n 's/^[[:space:]]*"\(.*\)"[[:space:]]*$/\1/p')
  new_keychains=("${old_keychains[@]}" "$kc")
  run security list-keychains -d user -s "${new_keychains[@]}" || return $?
  run codesign --force -s "$hash" -i com.rycade.power "$BIN/rycade-power" || rc=$?
  if ! run security list-keychains -d user -s "${old_keychains[@]}"; then
    note "couldn't restore the user keychain search list"
  fi
  return "$rc"
}

power_signed() {
  local hash
  [[ -x $BIN/rycade-power && -s $SIGN/id ]] || return 1
  hash=$(cat "$SIGN/id") || return 1
  [[ -n $hash ]] || return 1
  codesign -d -r- "$BIN/rycade-power" 2>&1 | grep -Fqi "certificate leaf = H\"$hash\""
}

runtime() {
  step "Rycade runtime: local server, kiosk, power slider"
  local restart=()
  local key=$HOME_DIR/score.key
  if [[ ! -s $key ]]; then
    local sk
    read -r -s -p "  high score upload key (Worker secret SCORE_KEY, blank to skip): " sk </dev/tty; echo
    (( DRY )) || { umask 077; printf '%s' "$sk" > "$key"; }
  fi
  (umask 077; : > "$HOME_DIR/Caddyfile.tmp")
  cat > "$HOME_DIR/Caddyfile.tmp" <<C
{
	admin off
	auto_https off
	persist_config off
}
:$PORT {
	bind 127.0.0.1
	root * $APP/public
	@media path /art/* /videos/* /boot/* /vendor/fonts/*
	header @media Cache-Control "public, max-age=31536000, immutable"
	@fresh not path /art/* /videos/* /boot/* /vendor/fonts/*
	header @fresh Cache-Control "no-cache"
	header -Server
	handle_path /roms/* {
		root * $HOME_DIR/roms
		file_server browse
	}
	reverse_proxy /power/* 127.0.0.1:8788 {
		flush_interval -1
	}
	@scores {
		method POST
		path /api/scores
	}
	handle @scores {
		reverse_proxy https://$SCORES_HOST {
			header_up -*
			header_up Host $SCORES_HOST
			header_up Content-Type application/json
			header_up User-Agent rycade
			header_up Authorization "Bearer $(cat "$key" 2>/dev/null)"
		}
	}
	file_server
}
C
  if cmp -s "$HOME_DIR/Caddyfile.tmp" "$HOME_DIR/Caddyfile"; then rm "$HOME_DIR/Caddyfile.tmp"
  else mv "$HOME_DIR/Caddyfile.tmp" "$HOME_DIR/Caddyfile"; restart+=(com.rycade.server); fi
  agent com.rycade.server "$(command -v caddy)" run --config "$HOME_DIR/Caddyfile" --adapter caddyfile

  cat > "$BIN/rycade-kiosk.tmp" <<K
#!/bin/bash
for _ in \$(seq 60); do nc -z 127.0.0.1 $PORT && break; sleep 1; done
id=\$(displayplacer list 2>/dev/null | awk '/^Persistent screen id:/ {print \$4; exit}')
displayplacer list 2>/dev/null | grep -q "res:$CAB_MODE" && displayplacer "id:\$id res:$CAB_MODE scaling:off origin:(0,0) degree:0"
osascript -l JavaScript -e 'ObjC.import("CoreGraphics"); var b = \$.CGDisplayBounds(\$.CGMainDisplayID()); \$.CGWarpMouseCursorPosition({x: b.size.width - 1, y: b.size.height - 1})' >/dev/null 2>&1
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  --user-data-dir="$HOME_DIR/chrome" --kiosk --no-first-run --no-default-browser-check \\
  --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble --hide-crash-restore-bubble \\
  --disable-background-networking --disable-component-update --disable-sync --disable-domain-reliability --disable-breakpad \\
  --no-pings --metrics-recording-only --disable-client-side-phishing-detection --password-store=basic --use-mock-keychain \\
  --disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication \\
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \\
  --disable-pinch --overscroll-history-navigation=0 \\
  "http://127.0.0.1:$PORT/?cab=1"
K
  if cmp -s "$BIN/rycade-kiosk.tmp" "$BIN/rycade-kiosk"; then rm "$BIN/rycade-kiosk.tmp"
  else chmod +x "$BIN/rycade-kiosk.tmp"; mv "$BIN/rycade-kiosk.tmp" "$BIN/rycade-kiosk"; fi
  agent com.rycade.kiosk "$BIN/rycade-kiosk"

  local src=$APP/mac/rycade-power.swift stamp=$BIN/.rycade-power.sha
  local was_signed=0 rebuilt=0
  [[ -x $BIN/rycade-power ]] && power_signed && was_signed=1
  if [[ ! -x $BIN/rycade-power ]] || [[ $(shasum "$src" | cut -d' ' -f1) != $(cat "$stamp" 2>/dev/null) ]]; then
    if run swiftc -O -o "$BIN/rycade-power" "$src"; then
      shasum "$src" | cut -d' ' -f1 > "$stamp"
      restart+=(com.rycade.power)
      rebuilt=1
    else note "rycade-power failed to compile, power slider won't sleep/wake"; fi
  fi
  if [[ -x $BIN/rycade-power ]] && { (( rebuilt )) || ! power_signed; }; then
    if sign_identity && sign_power; then
      (( rebuilt )) || restart+=(com.rycade.power)
      if (( ! was_signed && ! DRY )); then
        note "rycade-power is now signed with the cab cert: re-add it once in Input Monitoring (− then +), later updates keep the permission"
      fi
    else
      note "couldn't sign rycade-power, Input Monitoring will need re-adding after each rebuild"
    fi
  fi
  [[ -x $BIN/rycade-power ]] && agent com.rycade.power "$BIN/rycade-power"
  local label
  for label in ${restart[@]+"${restart[@]}"}; do run launchctl kickstart -k "gui/$(id -u)/$label"; done
}

cores() {
  step "libretro cores ($(uname -m))"
  local core zip
  for core in $CORES; do
    [[ -f $HOME_DIR/cores/${core}_libretro.dylib ]] && continue
    zip=$(mktemp)
    if run curl -fsSL -o "$zip" "https://buildbot.libretro.com/nightly/apple/osx/$(uname -m)/latest/${core}_libretro.dylib.zip"; then
      run unzip -qo "$zip" -d "$HOME_DIR/cores"
    else note "couldn't fetch $core"; fi
    rm -f "$zip"
  done
  ok "cores in $HOME_DIR/cores"
}

network() {
  step "Network lockdown (rycade-net)"
  cmp -s "$APP/mac/rycade-net" /usr/local/bin/rycade-net || srun install -m 755 "$APP/mac/rycade-net" /usr/local/bin/rycade-net
  srun ln -sf "$APP/mac/setup.sh" /usr/local/bin/rycade
  daemon com.rycade.net 30 /usr/local/bin/rycade-net enforce
  trap - EXIT
  srun rycade-net close >/dev/null
  ok "closed: only the tunnel, DNS and NTP get out"
}

check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else printf '%s  ✗ %s%s\n' "$red" "$1" "$off"; FAILS=$((FAILS + 1)); fi; }

# shellcheck disable=SC2016
doctor() {
  step "Doctor"
  FAILS=0
  check "user is $CAB_USER" '[[ $(id -un) == '"$CAB_USER"' ]]'
  check "FileVault off" '! fdesetup status | grep -q "FileVault is On"'
  check "auto-login" '[[ $(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser) == '"$CAB_USER"' ]]'
  check "never sleeps" 'pmset -g | grep -E "^ sleep +0"'
  check "restarts after power loss" 'pmset -g | grep -E "autorestart +1"'
  check "weekly restart scheduled" 'pmset -g sched | grep -i restart'
  check "sshd listening" 'nc -z -G 1 127.0.0.1 22'
  check "sshd config valid" 'sudo /usr/sbin/sshd -t'
  check "password SSH off" 'sudo /usr/sbin/sshd -T | grep -x "passwordauthentication no"'
  check "Screen Sharing listening" 'nc -z -G 1 127.0.0.1 5900'
  check "tunnel connected" 'curl -fs --max-time 3 http://127.0.0.1:20241/ready'
  check "local server serving" 'curl -fs --max-time 3 -o /dev/null http://127.0.0.1:'"$PORT"'/'
  check "kiosk running" 'launchctl print gui/$(id -u)/com.rycade.kiosk | grep -q "state = running"'
  check "power helper running" 'launchctl print gui/$(id -u)/com.rycade.power | grep -q "state = running"'
  check "power helper signed with cab cert" 'power_signed'
  check "pf enabled" 'sudo pfctl -s info | grep -q "Status: Enabled"'
  check "score key set" '[[ -s '"$HOME_DIR"'/score.key ]]'
  check "score host allowed" 'sudo pfctl -t scores -T show | grep -q .'
  if [[ $(sudo rycade-net status 2>/dev/null | head -1) == closed* ]]; then
    check "internet blocked" '! curl -fs --max-time 4 -o /dev/null https://example.com'
    check "GitHub blocked" '! curl -fs --max-time 4 -o /dev/null https://github.com'
  else note "rycade-net is open: $(sudo rycade-net status | head -1)"; fi
  check "cores present" 'ls '"$HOME_DIR"'/cores/*.dylib'
  echo
  (( FAILS )) && printf '%s%d check(s) failed%s\n' "$red" "$FAILS" "$off" || printf '%sall good%s\n' "$green" "$off"
}

update() {
  step "Update frontend from GitHub"
  srun rycade-net open 10m >/dev/null
  git_creds
  run git -C "$APP" pull --ff-only
  srun rycade-net close >/dev/null
  ok "pulled"
  (( DRY )) && { refresh; return; }
  exec "$APP/mac/setup.sh" refresh
}

refresh() {
  step "Reinstall rycade-net, rebuild helpers, reload kiosk"
  cmp -s "$APP/mac/rycade-net" /usr/local/bin/rycade-net || srun install -m 755 "$APP/mac/rycade-net" /usr/local/bin/rycade-net
  srun ln -sf "$APP/mac/setup.sh" /usr/local/bin/rycade
  git_creds
  daemon com.rycade.net 30 /usr/local/bin/rycade-net enforce
  srun rycade-net enforce >/dev/null
  command -v caddy >/dev/null || for b in /usr/local/bin/brew /opt/homebrew/bin/brew; do [[ -x $b ]] && eval "$($b shellenv)"; done
  runtime
  no_auto_updates
  quiet_notifications
  run launchctl kickstart -k "gui/$(id -u)/com.rycade.kiosk"
  ok "updated and reloaded"
}

summary() {
  cat <<T

${bold}Remote access${off}
  browser SSH:  https://$SSH_HOST  (log in as ryanpolasky@hotmail.com)
  browser VNC:  https://$VNC_HOST  (VNC password from setup)
  from ur PC:   cloudflared access ssh-config --hostname $SSH_HOST --short-lived-cert >> ~/.ssh/config
                then: ssh $CAB_USER@$SSH_HOST
  push ROMs:    rsync -av roms/ $CAB_USER@$SSH_HOST:Rycade/roms/

${bold}On the cab${off}
  rycade doctor      health check
  rycade update      pull the frontend over GitHub-only, then reload
  rycade-net open    GitHub only, 30m      rycade-net full 30m   everything
  rycade-net close   back to tunnel-only

${yellow}Reboot once so auto-login and the kiosk start clean.${off}
T
}

case $ACTION in
  doctor) doctor ;;
  update) preflight offline; update ;;
  refresh) preflight offline; refresh ;;
  display) display ;;
  all)
    preflight
    base; repo; never_down; remote; polish; display; runtime; cores; network
    doctor; summary ;;
esac

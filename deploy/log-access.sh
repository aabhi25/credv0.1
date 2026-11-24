#!/usr/bin/env bash
# Lets one SSH key run three fixed commands on this server and nothing else: "logs" (the app's and web
# server's logs), "status" and "diagnose" (scripts/diagnose-equifax.ts). It gets no shell, no .env and no
# database. Run as root.
#   sudo bash deploy/log-access.sh add "ssh-ed25519 AAAA... name" 203.0.113.5 "Organization name"
#   sudo bash deploy/log-access.sh remove
set -euo pipefail

NAME=credcap-logs
BIN=/usr/local/sbin
SUDOERS=/etc/sudoers.d/credcap-logs

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }

remove() {
  rm -f "$SUDOERS" "$BIN/credcap-remote" "$BIN/credcap-logs" "$BIN/credcap-diagnose"
  if id "$NAME" >/dev/null 2>&1; then
    pkill -KILL -u "$NAME" || true
    userdel --remove "$NAME" 2>/dev/null || userdel "$NAME"
  fi
}

add() {
  local key="$1" from="$2" org="$3"
  [[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [A-Za-z0-9@._-]+)?$ ]] || { echo "That isn't an ssh-ed25519 public key."; exit 1; }
  [[ "$from" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "Give the IPv4 address the key may connect from."; exit 1; }
  [[ "$org" =~ ^[A-Za-z0-9][A-Za-z0-9\ ._-]*$ ]] || { echo "Give the organization name."; exit 1; }

  remove
  useradd --create-home --shell /bin/sh "$NAME"

  cat > "$BIN/credcap-logs" <<'EOF'
#!/bin/sh
exec journalctl -u credcap -u caddy -u credcap-backup --since "3 days ago" --no-pager -n 1000
EOF
  cat > "$BIN/credcap-diagnose" <<EOF
#!/bin/sh
cd /opt/credcap && exec env HOME=/home/credcap npx tsx --env-file=.env scripts/diagnose-equifax.ts "$org"
EOF
  cat > "$BIN/credcap-remote" <<'EOF'
#!/bin/sh
case "$SSH_ORIGINAL_COMMAND" in
  logs) exec sudo -n /usr/local/sbin/credcap-logs ;;
  diagnose) exec sudo -n -u credcap /usr/local/sbin/credcap-diagnose ;;
  status) exec systemctl is-active credcap caddy credcap-backup.timer ;;
  *) echo "Allowed: logs, status, diagnose"; exit 1 ;;
esac
EOF
  chmod 755 "$BIN/credcap-logs" "$BIN/credcap-diagnose" "$BIN/credcap-remote"

  # "" means: only without arguments.
  cat > "$SUDOERS.new" <<EOF
$NAME ALL=(root) NOPASSWD: $BIN/credcap-logs ""
$NAME ALL=(credcap) NOPASSWD: $BIN/credcap-diagnose ""
EOF
  chmod 440 "$SUDOERS.new"
  visudo -cqf "$SUDOERS.new" || { rm -f "$SUDOERS.new"; remove; echo "Could not set up the permissions."; exit 1; }
  mv "$SUDOERS.new" "$SUDOERS"

  # root owns the key file, so the account can't loosen its own restrictions.
  install -d -m 755 -o root -g root "/home/$NAME/.ssh"
  printf 'restrict,from="%s",command="%s/credcap-remote" %s\n' "$from" "$BIN" "$key" > "/home/$NAME/.ssh/authorized_keys"
  chown root:root "/home/$NAME/.ssh/authorized_keys"
  chmod 644 "/home/$NAME/.ssh/authorized_keys"

  echo "Done. This key can run logs, status and diagnose from $from."
  echo "Server fingerprint: $(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}')"
  echo "To take the access away: sudo bash /opt/credcap/deploy/log-access.sh remove"
}

case "${1:-}" in
  add) [ $# -eq 4 ] || { echo "Usage: add \"<public key>\" <your IP> \"<organization>\""; exit 1; }; add "$2" "$3" "$4" ;;
  remove) remove; echo "Access removed." ;;
  *) echo "Use add or remove."; exit 1 ;;
esac

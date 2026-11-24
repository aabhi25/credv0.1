#!/usr/bin/env bash
# First-time setup of CredCap AI on a fresh Ubuntu 24.04 server. Run as root. See deploy/README.md.
#   sudo DOMAIN=app.example.com bash deploy/setup.sh
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=app.example.com}"
[[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "DOMAIN must be a plain host name."; exit 1; }
[ -e /opt/credcap/.env ] && { echo "Already set up. Use deploy/update.sh to update."; exit 1; }

# This is for a server of its own: refuse if another web server is already in charge.
if ss -tlnH '( sport = :80 or sport = :443 or sport = :3000 )' | grep -q .; then
  echo "Port 80, 443 or 3000 is already in use. Use a new server."; exit 1
fi

SRC="$(cd "$(dirname "$0")/.." && pwd)"
[ "$SRC" = /opt/credcap ] || { echo "Clone the repository to /opt/credcap first."; exit 1; }
cd /opt/credcap

read -rp "Superadmin sign-in ID: " SUPERADMIN_EMAIL
read -rsp "Superadmin password (at least 12 characters): " SUPERADMIN_PASSWORD; echo
[ "${#SUPERADMIN_PASSWORD}" -ge 12 ] || { echo "Too short."; exit 1; }
[ -n "$SUPERADMIN_EMAIL" ] || { echo "Sign-in ID is required."; exit 1; }

echo "== Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl git gnupg openssl sqlite3 caddy
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource.gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update -q
apt-get install -y -q nodejs

# The build needs more memory than the app does.
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "== App user and data folders"
id credcap >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin credcap
install -d -o credcap -g credcap -m 700 /var/lib/credcap /var/backups/credcap
chown -R credcap:credcap /opt/credcap

# Written to a temporary file first, so a failed run doesn't look finished.
umask 077
cat > /opt/credcap/.env.new <<ENV
DATABASE_URL="file:/var/lib/credcap/credcap.db"
SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
CREDENTIALS_KEY="$(openssl rand -base64 32)"
APP_URL="https://$DOMAIN"
ENV
umask 022
chown credcap:credcap /opt/credcap/.env.new
mv /opt/credcap/.env.new /opt/credcap/.env
trap 'echo "Setup failed. Once fixed, remove /opt/credcap/.env and run it again."' ERR

echo "== Build"
run() { runuser -u credcap -- env HOME=/home/credcap "$@"; }
run npm ci --no-audit --no-fund
run npx prisma generate
run npx prisma db push --skip-generate
# The password is only used here; it isn't kept in .env.
export SUPERADMIN_EMAIL SUPERADMIN_PASSWORD
run npm run db:seed
unset SUPERADMIN_PASSWORD
run npm run build

echo "== Services"
install -m 644 deploy/credcap.service /etc/systemd/system/credcap.service
install -m 644 deploy/credcap-backup.service /etc/systemd/system/credcap-backup.service
install -m 644 deploy/credcap-backup.timer /etc/systemd/system/credcap-backup.timer
sed "s/__DOMAIN__/$DOMAIN/" deploy/Caddyfile > /etc/caddy/Caddyfile
# On a root domain (example.com), also send www visitors to it.
if [[ "$DOMAIN" != *.*.* ]]; then
  printf '\nwww.%s {\n\tredir https://%s{uri} permanent\n}\n' "$DOMAIN" "$DOMAIN" >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable --now credcap credcap-backup.timer
systemctl enable caddy
systemctl restart caddy

trap - ERR
echo "Done. Open https://$DOMAIN/admin/login"
echo "Keep a safe copy of CREDENTIALS_KEY from /opt/credcap/.env."

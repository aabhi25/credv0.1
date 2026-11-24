#!/usr/bin/env bash
# Pulls the latest code, backs up the database and restarts the app. Run as root.
set -euo pipefail

run() { runuser -u credcap -- env HOME=/home/credcap "$@"; }

# In a function so bash has read all of it before git replaces this file.
main() {
  [ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
  cd /opt/credcap
  [ -f /root/.ssh/credcap ] && export GIT_SSH_COMMAND="ssh -i /root/.ssh/credcap"
  git -c safe.directory=/opt/credcap pull --ff-only
  chown -R credcap:credcap /opt/credcap

  systemctl start credcap-backup.service
  run npm ci --no-audit --no-fund
  run npx prisma generate
  # Stops, rather than dropping anything, if a change would lose data.
  run npx prisma db push --skip-generate
  run npm run build
  systemctl restart credcap
  sleep 3
  curl -fsS -o /dev/null http://127.0.0.1:3000/admin/login
  echo "Updated to $(run git log --oneline -1)"
}

main
exit

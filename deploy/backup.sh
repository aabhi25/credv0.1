#!/usr/bin/env bash
# Copies the database safely while the app runs, and keeps 14 days of copies.
set -euo pipefail
umask 077
out="/var/backups/credcap/credcap-$(date +%Y%m%d-%H%M%S).db"
sqlite3 /var/lib/credcap/credcap.db ".backup '$out'"
[ "$(sqlite3 "$out" 'PRAGMA integrity_check;')" = ok ]
gzip "$out"
find /var/backups/credcap -name 'credcap-*.db.gz' -mtime +14 -delete

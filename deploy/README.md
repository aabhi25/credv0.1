# Hosting on AWS Lightsail

For a **new** Ubuntu 24.04 server (2 GB, Mumbai). Don't run it on a server that hosts another app.

1. Create the server with a public IPv4 address and attach a static IP.
2. Firewall: 80 and 443 open to everyone, 22 to your own IP (plus Lightsail's browser SSH). Keep 3000 closed.
3. Add a DNS **A record** for the domain pointing to the static IP. Remove any AAAA record.
   For a root domain, `www` should also point to it; the setup redirects it.
4. If the repository is private: run `sudo ssh-keygen -t ed25519 -f /root/.ssh/credcap -N ""` on the server, add
   `/root/.ssh/credcap.pub` as a read-only deploy key in GitHub, and use this clone command in step 5 instead:
   `sudo GIT_SSH_COMMAND="ssh -i /root/.ssh/credcap" git clone -b feat/initial-app git@github.com:aabhi25/credv0.1.git /opt/credcap`
5. On the server:

```text
sudo git clone -b feat/initial-app https://github.com/aabhi25/credv0.1.git /opt/credcap
cd /opt/credcap
sudo DOMAIN=app.example.com bash deploy/setup.sh
```

The script asks for the superadmin ID and password, generates new keys, starts with an empty database and sets up
HTTPS. Keep a safe copy of `CREDENTIALS_KEY` from `/opt/credcap/.env`: saved bureau credentials can't be read without it.

| Task | Command |
| --- | --- |
| Update | `sudo bash /opt/credcap/deploy/update.sh` |
| Status | `systemctl status credcap caddy` |
| Logs | `sudo journalctl -u credcap -n 100` |
| Back up now | `sudo systemctl start credcap-backup` |
| Diagnose Equifax sandbox/UAT blocks | `cd /opt/credcap && sudo -u credcap env HOME=/home/credcap npx tsx --env-file=.env scripts/diagnose-equifax.ts "Organization name"` |

Backups are daily at 02:30 server time, kept 14 days in `/var/backups/credcap`. They stay on the same server, so also
turn on Lightsail automatic snapshots.

## Read-only log access

`deploy/log-access.sh` lets one SSH key, from one IP address, run only `logs`, `status` and `diagnose`. It gets no shell,
`.env` or database. Remove it with `sudo bash /opt/credcap/deploy/log-access.sh remove`.

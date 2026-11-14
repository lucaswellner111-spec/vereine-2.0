# systemd-Vorlagen (Betrieb)

Installation auf dem Server (als root, bewusst manuell):

```bash
install -d -m 700 /etc/vereine /var/backups/vereine
install -m 600 /opt/vereine/infra/ops/ops.env.example /etc/vereine/ops.env   # danach anpassen
cp /opt/vereine/infra/ops/systemd/vereine-backup*.service /opt/vereine/infra/ops/systemd/vereine-backup*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vereine-backup.timer vereine-backup-check.timer
systemctl list-timers 'vereine-*'
```

Ohne systemd (Cron, als root):

```
17 3 * * *  /opt/vereine/infra/ops/backup.sh        >> /var/log/vereine-backup.log 2>&1
0  8 * * *  /opt/vereine/infra/ops/check-backup.sh  >> /var/log/vereine-backup.log 2>&1
```

Die Restore-Uebung (braucht den privaten Schluessel, deshalb nie automatisch) steht in docs/BETRIEB.md.

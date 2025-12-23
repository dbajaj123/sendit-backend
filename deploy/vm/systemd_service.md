# systemd vs PM2

This project uses PM2 for process management and startup. If you prefer systemd directly, create a service unit like below and enable it.

Example systemd unit (`/etc/systemd/system/senditbox.service`):

```
[Unit]
Description=SenditBox Backend
After=network.target

[Service]
Type=simple
User=senditbox
WorkingDirectory=/opt/senditbox-backend
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
Environment=NODE_ENV=production PORT=8080

[Install]
WantedBy=multi-user.target
```

After creating the unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now senditbox.service
sudo journalctl -u senditbox.service -f
```

PM2 note:
- To persist PM2-managed processes across reboots run `pm2 startup` and `pm2 save` as shown in the setup script.

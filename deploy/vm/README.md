# Deploy SenditBox backend to a VM (Ubuntu / Compute Engine)

This document explains how to deploy the SenditBox backend to a Linux VM (Ubuntu 22.04 recommended) without Docker. It provides an automated `setup.sh` script and nginx config for reverse proxy + TLS with certbot.

Overview
- VM OS: Ubuntu 22.04 LTS (or Debian 12)
- Node.js: 18.x (LTS)
- Process manager: PM2 (recommended)
- Reverse proxy + TLS: nginx + certbot
- Database: Use MongoDB Atlas (recommended) or install MongoDB on another VM

High-level steps
1. Create a VM on Google Compute Engine (Ubuntu 22.04 LTS).
2. SSH to the VM and run the provided `setup.sh` script (review & edit before running).
3. Configure DNS to point your domain to the VM's external IP.
4. Obtain TLS via certbot (the script includes instructions).
5. Start and manage the app with PM2.

Files in this folder
- `setup.sh` — automated setup script (install Node, PM2, nginx, clone repo, install deps, start PM2)
- `nginx_senditbox.conf` — nginx site config (reverse proxy to the app)
- `systemd_service.md` — optional notes on running with systemd instead of PM2 startup

Important notes
- The script clones from your repository. If your repo is private, either install git credentials/SSH keys on the VM or copy code by SCP.
- The app uses environment variables in `.env`. `setup.sh` copies `.env.example` to `.env` but you MUST edit `.env` with production secrets (especially `MONGODB_URI`, `JWT_SECRET`).
- For production MongoDB, use Atlas or a dedicated Mongo instance (do NOT use VM-local Mongo for critical production unless you know how to manage backups/replication).

Security considerations
- Use a secure `JWT_SECRET` (random 64+ chars).
- Use HTTPS and enable firewall rules to restrict SSH to trusted IPs.
- Regularly update packages and set up monitoring/alerts.

Next: run the `setup.sh` script on the VM (see instructions in this README).
#!/usr/bin/env bash
# SenditBox VM setup script (Ubuntu 22.04)
# Review before running. Run as a non-root user with sudo.

set -euo pipefail

# --------- Configuration (edit before running) ----------
REPO_URL="https://github.com/your-org/your-repo.git"    # <-- change to your repo
BRANCH="main"
APP_DIR="/opt/senditbox-backend"
NODE_VERSION=18
APP_USER="senditbox"
PORT=8080
# --------------------------------------------------------

# Must be run with sudo
if [[ $(id -u) -ne 0 ]]; then
  echo "Please run as root or with sudo"
  exit 2
fi

apt update
apt install -y git curl build-essential nginx ufw

# Create app user
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash $APP_USER
fi

# Install Node.js (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs

# Install PM2
npm install -g pm2

# Create app directory and fetch code
if [[ ! -d "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
  chown $APP_USER:$APP_USER "$APP_DIR"
  sudo -u $APP_USER git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "App directory exists, pulling latest"
  cd "$APP_DIR"
  sudo -u $APP_USER git fetch --all
  sudo -u $APP_USER git reset --hard origin/$BRANCH
fi

cd "$APP_DIR"

# Copy env example if missing
if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit .env with production values now"
fi

# Install dependencies
npm ci --only=production || npm install --production

# Prepare uploads dir
mkdir -p uploads/voice
chown -R $APP_USER:$APP_USER uploads

# Start app using PM2
pm2 stop senditbox-backend || true
pm2 start src/server.js --name senditbox-backend --env production
pm2 save
pm2 startup systemd -u $APP_USER --hp /home/$APP_USER || true

# Configure UFW (allow HTTP, HTTPS, SSH)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Nginx site
NGINX_CONF="/etc/nginx/sites-available/senditbox"
cat > "$NGINX_CONF" <<'NGINX_EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /opt/senditbox-backend/uploads/;
    }
}
NGINX_EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/senditbox
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

cat <<EOF

Setup complete (basic). Next steps:
- Edit $APP_DIR/.env and set MONGODB_URI, JWT_SECRET, CORS_ORIGIN, and other secrets.
- If using a domain, point DNS to this VM IP and run certbot to obtain TLS certs:
  sudo apt install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
- After editing .env, restart app: pm2 restart senditbox-backend

Notes:
- If your MongoDB is Atlas, ensure IP whitelist includes this VM or use SRV connection string.
- If your repo is private, set up deploy SSH key and configure git to use it for cloning.

EOF

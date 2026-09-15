# EYEKART — PRODUCTION DEPLOYMENT CHECKLIST
**DevOps, Security Hardening & Production Infrastructure Runbook**  
**Entity:** EyeKart Healthcare Limited (Nairobi, Kenya)  
**Target Architecture:** Linux Ubuntu 24.04 LTS, Nginx, PostgreSQL 18, Node.js Fastify, PM2  
**Audience:** Lead DevOps Engineer, Senior Backend Engineer & Security Architect  
**Classification:** Authoritative Commercial Release Document  

---

## 1. System Architecture Overview

```
                        INTERNET (Clients in Kenya & Worldwide)
                                          │
                                          ▼ [HTTPS / 443]
                       ┌─────────────────────────────────────┐
                       │      Cloudflare / Edge DNS          │
                       │   (DDoS Protection, WAF, SSL Edge)  │
                       └──────────────────┬──────────────────┘
                                          │
                                          ▼ [Origin HTTPS / 443]
                       ┌─────────────────────────────────────┐
                       │     Nginx 1.26+ Reverse Proxy       │
                       │  - Static Asset Delivery (Brotli)   │
                       │  - Let's Encrypt TLS 1.3 / HSTS     │
                       │  - Rate Limiting & Security Headers │
                       └──────────┬──────────────────┬───────┘
                                  │                  │
               [Proxy Pass 3001]  │                  │  [Static Files / 3000]
                                  ▼                  ▼
             ┌───────────────────────────────┐  ┌─────────────────────────┐
             │ Node.js Fastify Cluster (PM2) │  │  HTML / CSS / JS / VTO  │
             │ - 4 Worker Instances          │  │  - 23 Frozen Panels     │
             │ - Authoritative Pricing API   │  │  - Three.js WebGL & VTO │
             │ - M-PESA Daraja Provider      │  │  - Client State Machine │
             │ - Clinical Optometrist Queue  │  └─────────────────────────┘
             │ - 10-Stage Fulfillment Engine │
             └───────────────┬───────────────┘
                             │
            [Unix Socket / 127.0.0.1:5432]
                             ▼
             ┌───────────────────────────────┐
             │   PostgreSQL 18 Database      │
             │  - 25 Relational Tables       │
             │  - SCRAM-SHA-256 Auth         │
             │  - Row-Level Locking          │
             │  - Nightly Encrypted Backups  │
             └───────────────────────────────┘
```

---

## 2. Phase 1: Server Provisioning & Base OS Hardening
*Target Environment: Ubuntu 24.04 LTS (Noble Numbat)*

### 1.1 Hardware Sizing Requirements
- [ ] **CPU:** 4 vCPU (Compute Optimized)
- [ ] **RAM:** 8 GB DDR5 ECC
- [ ] **Storage:** 160 GB NVMe SSD (Encrypted at rest)
- [ ] **Network:** Static Public IPv4 Address, 1 Gbps port, low-latency East Africa routing (e.g., Safaricom Cloud, Liquid Intelligent Technologies, or AWS Africa Cape Town `af-south-1`).

### 1.2 OS & User Hardening
- [ ] Update and upgrade system packages:
  ```bash
  sudo apt-get update && sudo apt-get -y upgrade
  ```
- [ ] Create dedicated, non-root system user for EyeKart services:
  ```bash
  sudo adduser --disabled-password --gecos "" eyekart
  sudo usermod -aG sudo eyekart
  ```
- [ ] Hardened SSH daemon (`/etc/ssh/sshd_config`):
  - `PermitRootLogin no`
  - `PasswordAuthentication no`
  - `PubkeyAuthentication yes`
  - `Port 22` (or custom management port)
- [ ] Configure Uncomplicated Firewall (UFW):
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  ```
  *(Verify PostgreSQL 5432 and Node.js 3001 are strictly inaccessible from the public internet).*
- [ ] Configure `fail2ban` for automated brute-force IP banning:
  ```bash
  sudo apt-get install -y fail2ban
  sudo systemctl enable --now fail2ban
  ```

---

## 3. Phase 2: PostgreSQL 18 Production Configuration & Migration

### 2.1 Engine Installation & Security
- [ ] Install PostgreSQL 18:
  ```bash
  sudo apt-get install -y postgresql-18 postgresql-client-18
  ```
- [ ] Configure authentication in `/etc/postgresql/18/main/pg_hba.conf`:
  - Enforce `scram-sha-256` for all local and TCP connections.
  - Disable trust authentication entirely.
- [ ] Configure connection parameters in `postgresql.conf`:
  - `max_connections = 100`
  - `shared_buffers = 2GB`
  - `effective_cache_size = 6GB`
  - `work_mem = 32MB`
  - `maintenance_work_mem = 512MB`
  - `timezone = 'Africa/Nairobi'`

### 2.2 Database Initialization & Schema Deployment
- [ ] Create production database and user:
  ```sql
  CREATE USER eyekart_prod WITH ENCRYPTED PASSWORD 'SUPER_SECURE_STRONG_PASSWORD_HERE';
  CREATE DATABASE eyekart_production OWNER eyekart_prod;
  ```
- [ ] Deploy schema:
  ```bash
  psql -U eyekart_prod -d eyekart_production -f server/src/db/schema.js
  ```
- [ ] Execute production seed script:
  ```bash
  NODE_ENV=production node server/src/db/seed.js
  ```
- [ ] Verify 25 tables, 13 products, 35 variants, and 252 appointment slots exist.

### 2.3 Automated Backup & Disaster Recovery
- [ ] Setup automated daily encrypted backup script at `/usr/local/bin/eyekart_db_backup.sh`:
  ```bash
  #!/bin/bash
  BACKUP_DIR="/var/backups/eyekart"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  mkdir -p $BACKUP_DIR
  pg_dump -U eyekart_prod -d eyekart_production -Fc | gzip > $BACKUP_DIR/eyekart_$TIMESTAMP.dump.gz
  find $BACKUP_DIR -type f -mtime +14 -name "*.dump.gz" -delete
  ```
- [ ] Add cron entry for 02:00 EAT nightly backup:
  ```bash
  0 2 * * * /usr/local/bin/eyekart_db_backup.sh
  ```

---

## 4. Phase 3: Node.js Runtime & Application Daemon Setup

### 3.1 Node.js 22 LTS Runtime Installation
- [ ] Install Node.js via official NodeSource repository:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- [ ] Install PM2 process manager globally:
  ```bash
  sudo npm install -g pm2
  ```

### 3.2 Production Environment Variables (`.env`)
- [ ] Create `/home/eyekart/app/.env` with strict `600` file permissions:
  ```ini
  # EyeKart Production Environment Configuration
  NODE_ENV=production
  PORT=3001
  HOST=127.0.0.1
  APP_SECRET=CRITICAL_64_CHAR_HEX_ENTROPY_KEY_HERE
  SESSION_SECRET=CRITICAL_SESSION_SIGNING_KEY_HERE

  # Database Authority (Local Unix Socket / Loopback)
  DB_HOST=127.0.0.1
  DB_PORT=5432
  DB_NAME=eyekart_production
  DB_USER=eyekart_prod
  DB_PASS=SUPER_SECURE_STRONG_PASSWORD_HERE
  DB_SSL=false
  DB_POOL_MAX=20

  # Safaricom M-PESA Daraja 2.0 (LIVE)
  MPESA_ENVIRONMENT=LIVE
  MPESA_SHORTCODE=89XXXX
  MPESA_CONSUMER_KEY=live_daraja_key
  MPESA_CONSUMER_SECRET=live_daraja_secret
  MPESA_PASSKEY=live_daraja_passkey
  MPESA_CALLBACK_URL=https://api.eyekart.ke/api/webhooks/mpesa

  # KRA eTIMS Fiscalization
  KRA_ENVIRONMENT=LIVE
  KRA_PIN=P051XXXXXXX
  KRA_VSCU_URL=http://127.0.0.1:8080/vscu

  # Document Storage Provider
  STORAGE_PROVIDER=LOCAL
  STORAGE_LOCAL_DIR=/var/data/eyekart/documents
  ```

### 3.3 PM2 Ecosystem Configuration (`ecosystem.config.js`)
- [ ] Configure cluster mode across CPU cores:
  ```javascript
  module.exports = {
    apps: [{
      name: 'eyekart-api',
      script: 'server/src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/eyekart/api_error.log',
      out_file: '/var/log/eyekart/api_access.log',
      merge_logs: true
    }]
  };
  ```
- [ ] Launch and configure systemd startup:
  ```bash
  pm2 start ecosystem.config.js
  pm2 save
  sudo pm2 startup systemd -u eyekart --hp /home/eyekart
  ```

---

## 5. Phase 4: Nginx Web Server, SSL & Caching Configuration

### 5.1 TLS Certificate Setup
- [ ] Obtain official Let's Encrypt certificates:
  ```bash
  sudo certbot certonly --nginx -d eyekart.ke -d www.eyekart.ke -d api.eyekart.ke
  ```

### 5.2 Nginx Hardened Configuration (`/etc/nginx/sites-available/eyekart`)
- [ ] Deploy site configuration:
  ```nginx
  # 1. Redirect HTTP to HTTPS
  server {
      listen 80;
      listen [::]:80;
      server_name eyekart.ke www.eyekart.ke api.eyekart.ke;
      return 301 https://$host$request_uri;
  }

  # 2. Main E-Commerce Frontend (eyekart.ke)
  server {
      listen 443 ssl http2;
      listen [::]:443 ssl http2;
      server_name eyekart.ke www.eyekart.ke;

      ssl_certificate /etc/letsencrypt/live/eyekart.ke/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/eyekart.ke/privkey.pem;
      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers HIGH:!aNULL:!MD5;

      # Security Headers
      add_header X-Frame-Options "SAMEORIGIN" always;
      add_header X-Content-Type-Options "nosniff" always;
      add_header X-XSS-Protection "1; mode=block" always;
      add_header Referrer-Policy "strict-origin-when-cross-origin" always;
      add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

      root /home/eyekart/app;
      index index.html;

      # Gzip & Brotli Compression
      gzip on;
      gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

      # Static Assets Caching (1 Year)
      location /assets/ {
          expires 1y;
          add_header Cache-Control "public, immutable";
          try_files $uri =404;
      }

      # HTML Single Page Fallback
      location / {
          try_files $uri $uri/ /index.html;
      }
  }

  # 3. Fastify Backend API (api.eyekart.ke)
  server {
      listen 443 ssl http2;
      listen [::]:443 ssl http2;
      server_name api.eyekart.ke;

      ssl_certificate /etc/letsencrypt/live/eyekart.ke/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/eyekart.ke/privkey.pem;

      client_max_body_size 15M; # Supports prescription document uploads

      location / {
          proxy_pass http://127.0.0.1:3001;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_read_timeout 30s;
      }
  }
  ```
- [ ] Test configuration and reload Nginx:
  ```bash
  sudo nginx -t && sudo systemctl reload nginx
  ```

---

## 6. Phase 5: Verification & Pre-Launch Smoke Test

- [ ] **Health Endpoint Verification:**
  ```bash
  curl -I https://api.eyekart.ke/api/health
  # Expected: HTTP/2 200 OK, {"status":"ok","database":{"connected":true}}
  ```
- [ ] **Stitch Hash Consistency Check on Server:**
  ```bash
  node scratch/verify_stitch_freeze.js
  # Expected: 23/23 PANELS MATCH (0 mismatches, 0.0% drift)
  ```
- [ ] **Catalog & Pricing Verification:**
  ```bash
  curl https://api.eyekart.ke/api/products | jq '.count'
  # Expected: 13
  ```
- [ ] **M-PESA Webhook SSL Connectivity:**
  ```bash
  curl -X POST https://api.eyekart.ke/api/webhooks/mpesa
  # Expected: Valid response (not connection refused or SSL error)
  ```

---

## 7. Rollback & Disaster Recovery Protocol

In the event of an unanticipated production failure:
1. **Application Rollback:**
   ```bash
   cd /home/eyekart/app
   git checkout tags/v1.0.0-rc1
   pm2 reload ecosystem.config.js
   ```
2. **Database Rollback:**
   ```bash
   gunzip -c /var/backups/eyekart/eyekart_PRE_DEPLOY.dump.gz | pg_restore -U eyekart_prod -d eyekart_production --clean
   ```
3. **Recovery Target:** Maximum RTO < 15 minutes; RPO < 1 hour.

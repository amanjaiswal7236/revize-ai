# Deployment Guide - Sitemap Analyzer

This guide will help you deploy the Sitemap Analyzer on a VM using PM2.

## Prerequisites

- Ubuntu/Debian Linux VM (or similar)
- Node.js 18+ installed
- MongoDB installed and running
- Root or sudo access

## Step 1: Initial VM Setup

### 1.1 Update System
```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 1.2 Install Node.js (if not installed)
```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should show v20.x.x
npm -v
```

### 1.3 Install MongoDB (if not installed)
```bash
# Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Update and install
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify MongoDB is running
sudo systemctl status mongod
```

### 1.4 Install Chromium (Required for Puppeteer)
```bash
sudo apt-get install -y \
    chromium-browser \
    chromium-chromedriver \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils
```

## Step 2: Deploy Application

### 2.1 Clone/Upload Project
```bash
# If using git
git clone <your-repo-url> sitemap-analyzer
cd sitemap-analyzer

# Or upload files via SCP/SFTP
```

### 2.2 Configure Environment Variables
```bash
# Copy example env file
cp .env.example .env

# Edit environment variables
nano .env
```

**Required variables:**
- `DATABASE_URL` - MongoDB connection string
- `SESSION_SECRET` - Random secret (generate with `openssl rand -base64 32`)
- `PORT` - Server port (default: 5000)
- `NODE_ENV=production`

**Optional variables:**
- `OPENAI_API_KEY` - For AI insights feature
- `OPENAI_MODEL` - OpenAI model to use

### 2.3 Run Deployment Script
```bash
# Make script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will:
- Check prerequisites
- Install dependencies
- Build the project
- Start/restart PM2 process

## Step 3: Configure PM2 Startup

### 3.1 Setup PM2 to Start on Boot
```bash
# Generate startup script
pm2 startup

# Follow the instructions it outputs (usually something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-username --hp /home/your-username

# Save current PM2 process list
pm2 save
```

## Step 4: Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5000/tcp  # Your app port

# Enable firewall
sudo ufw enable
```

## Step 5: (Optional) Setup Nginx Reverse Proxy

### 5.1 Install Nginx
```bash
sudo apt-get install -y nginx
```

### 5.2 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/sitemap-analyzer
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_set_header Connection "upgrade";
    }
}
```

### 5.3 Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/sitemap-analyzer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 6: (Optional) Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Certbot will automatically configure Nginx for HTTPS
```

## Maintenance Commands

### View Logs
```bash
# Real-time logs
pm2 logs sitemap-analyzer

# Last 100 lines
pm2 logs sitemap-analyzer --lines 100

# Error logs only
pm2 logs sitemap-analyzer --err
```

### Restart Application
```bash
pm2 restart sitemap-analyzer
```

### Stop Application
```bash
pm2 stop sitemap-analyzer
```

### Update Application
```bash
# Pull latest changes
git pull

# Install new dependencies
npm ci

# Rebuild
npm run build

# Restart PM2
pm2 restart sitemap-analyzer
```

### Monitor Resources
```bash
pm2 monit
```

### Check Status
```bash
pm2 status
pm2 info sitemap-analyzer
```

## Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs sitemap-analyzer --err

# Check if port is in use
sudo netstat -tlnp | grep 5000

# Check MongoDB connection
mongo --eval "db.adminCommand('ping')"
```

### Puppeteer/Chromium issues
```bash
# Check Chromium installation
which chromium-browser

# Update ecosystem.config.js with correct path:
# PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser'
```

### Memory issues
```bash
# Check memory usage
pm2 monit

# Increase max memory restart in ecosystem.config.js
# max_memory_restart: '2G'
```

### Database connection errors
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo journalctl -u mongod -f

# Test connection string
mongo "your-connection-string"
```

## Security Checklist

- [ ] Changed `SESSION_SECRET` to a strong random value
- [ ] Using strong MongoDB credentials
- [ ] Firewall configured (UFW)
- [ ] SSL/HTTPS enabled (Let's Encrypt)
- [ ] `.env` file not committed to git
- [ ] Regular system updates
- [ ] PM2 running as non-root user
- [ ] MongoDB authentication enabled (production)

## Backup

### Backup MongoDB
```bash
# Create backup
mongodump --uri="your-connection-string" --out=/path/to/backup

# Restore backup
mongorestore --uri="your-connection-string" /path/to/backup
```

## Performance Tuning

### Increase Node.js Memory (if needed)
Edit `ecosystem.config.js`:
```javascript
node_args: '--max-old-space-size=2048'
```

### Adjust PM2 Instances
For multi-core systems, you can run multiple instances:
```javascript
instances: 2,  // or 'max' for all CPUs
exec_mode: 'cluster'
```

## Support

For issues or questions:
1. Check PM2 logs: `pm2 logs sitemap-analyzer`
2. Check system logs: `journalctl -xe`
3. Verify environment variables: `pm2 env sitemap-analyzer`


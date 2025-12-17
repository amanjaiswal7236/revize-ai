# Quick Start - PM2 Deployment

## Quick Deployment Steps

### 1. On your VM, run these commands:

```bash
# Install Node.js 20 (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install Chromium (for Puppeteer)
sudo apt-get install -y chromium-browser

# Install MongoDB (if not installed)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 2. Upload your project to the VM

```bash
# Using SCP (from your local machine)
scp -r Sitemap-Analyzer user@your-vm-ip:/home/user/

# Or use git
git clone <your-repo> sitemap-analyzer
cd sitemap-analyzer
```

### 3. Configure and Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment (it will create .env if missing)
./deploy.sh
```

### 4. Edit .env file (if created)

```bash
nano .env
```

**Required settings:**
- `DATABASE_URL` - Your MongoDB connection string
- `SESSION_SECRET` - Generate with: `openssl rand -base64 32`
- `PORT=5000`

### 5. Restart after editing .env

```bash
pm2 restart sitemap-analyzer
```

### 6. Setup PM2 to start on boot

```bash
pm2 startup
# Follow the instructions it outputs
pm2 save
```

### 7. Open firewall (if needed)

```bash
sudo ufw allow 5000/tcp
```

## That's it! 🎉

Your app should now be running at `http://your-vm-ip:5000`

## Useful Commands

```bash
# View logs
pm2 logs sitemap-analyzer

# Restart app
pm2 restart sitemap-analyzer

# Stop app
pm2 stop sitemap-analyzer

# Check status
pm2 status

# Monitor resources
pm2 monit
```

## Troubleshooting

**App won't start?**
```bash
pm2 logs sitemap-analyzer --err
```

**Port already in use?**
```bash
# Change PORT in .env or kill the process using port 5000
sudo lsof -i :5000
```

**MongoDB connection error?**
```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Start MongoDB if stopped
sudo systemctl start mongod
```

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)


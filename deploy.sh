#!/bin/bash
set -e

echo "🚀 Starting Sitemap Analyzer Deployment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from template...${NC}"
    if [ -f env.template ]; then
        cp env.template .env
        echo -e "${GREEN}✓ Created .env file. Please edit it with your values!${NC}"
        echo "   Run: nano .env"
        exit 1
    elif [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env file. Please edit it with your values!${NC}"
        echo "   Run: nano .env"
        exit 1
    else
        echo "❌ env.template not found. Please create .env manually."
        exit 1
    fi
fi

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi
echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    # Use sudo for global installation (required on most systems)
    sudo npm install -g pm2 || {
        echo -e "${YELLOW}⚠️  Failed to install PM2 with sudo${NC}"
        echo "   Trying without sudo (if npm prefix is in home directory)..."
        npm install -g pm2 || {
            echo -e "${YELLOW}⚠️  Could not install PM2${NC}"
            echo "   Please install manually: sudo npm install -g pm2"
            exit 1
        }
    }
    echo -e "${GREEN}✓ PM2 installed${NC}"
else
    echo -e "${GREEN}✓ PM2 already installed${NC}"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build the project
echo "🔨 Building the project..."
npm run build
echo -e "${GREEN}✓ Build complete${NC}"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs
mkdir -p dist/public
mkdir -p server/public

# Check if server/public needs to be linked or copied
if [ -d "dist/public" ] && [ ! -L "server/public" ] && [ ! -d "server/public" ]; then
    echo "🔗 Linking dist/public to server/public..."
    ln -s ../dist/public server/public || cp -r dist/public server/public
    echo -e "${GREEN}✓ Public directory linked${NC}"
fi

# Check if PM2 is already running the app
if pm2 list | grep -q "sitemap-analyzer"; then
    echo "🔄 Restarting existing PM2 process..."
    pm2 restart ecosystem.config.js
else
    echo "▶️  Starting PM2 process..."
    pm2 start ecosystem.config.js
fi

# Save PM2 configuration
pm2 save

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "📝 Useful commands:"
echo "   pm2 logs sitemap-analyzer    - View logs"
echo "   pm2 restart sitemap-analyzer - Restart app"
echo "   pm2 stop sitemap-analyzer   - Stop app"
echo "   pm2 monit                    - Monitor resources"
echo ""
echo "🔧 Setup PM2 to start on boot:"
echo "   pm2 startup"
echo "   # Follow the instructions it outputs"
echo ""


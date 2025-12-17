module.exports = {
  apps: [{
    name: 'sitemap-analyzer',
    script: './dist/index.cjs',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '2G',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'dist', '.git'],
    // Puppeteer needs these environment variables
    env_production: {
      NODE_ENV: 'production',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'false',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser' // Adjust if needed
    }
  }]
};


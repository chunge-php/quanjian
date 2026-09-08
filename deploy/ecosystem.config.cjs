// pm2 配置：pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'quanjian',
      script: 'server.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production', PORT: 3010, HOSTNAME: '0.0.0.0' },
      env_file: '.env',
      max_memory_restart: '600M',
      autorestart: true,
    },
  ],
}

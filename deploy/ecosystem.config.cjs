// pm2 配置（没有 systemd 的机器用；install.sh --pm2 会自动用它）：pm2 start ecosystem.config.cjs && pm2 save
// 环境变量从同目录 .env 读（install.sh 把 shared/.env 软链进每个版本目录；pm2 自己不认 env_file，这里手动解析）
const fs = require('fs')
const path = require('path')
const env = { NODE_ENV: 'production', PORT: '3010', HOSTNAME: '0.0.0.0' }
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {
  // 没有 .env 就用上面的默认值（只能看内置样例）
}
module.exports = {
  apps: [
    {
      name: 'quanjian',
      script: 'server.js',
      cwd: __dirname,
      env,
      max_memory_restart: '600M',
      autorestart: true,
      time: true,
    },
  ],
}

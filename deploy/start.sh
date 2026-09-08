#!/usr/bin/env bash
# 手动前台启动（不用 systemd / pm2 时）：cd <安装目录>/current && bash start.sh
# 环境变量从同目录 .env 读（install.sh 把 shared/.env 软链到这里）；PORT 默认 3010
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
export PORT="${PORT:-3010}" HOSTNAME="${HOSTNAME:-0.0.0.0}" NODE_ENV=production
exec node server.js

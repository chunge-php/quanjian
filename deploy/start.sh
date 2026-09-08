#!/usr/bin/env bash
# 服务器上启动（前台）：PORT 默认 3010；环境变量从同目录 .env 读取
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
export PORT="${PORT:-3010}" HOSTNAME="${HOSTNAME:-0.0.0.0}" NODE_ENV=production
exec node server.js

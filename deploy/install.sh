#!/usr/bin/env bash
# 圈见 · 服务器一键安装/升级：在解压后的目录里执行  bash install.sh
# 做的事：检查 Node 20 → 生成 .env（首次会让你粘服务端 AK）→ 装 pm2 → 启动或重启 → 健康检查
set -euo pipefail
cd "$(dirname "$0")"
APP=quanjian
PORT="${PORT:-3010}"

echo "==> 检查 Node"
command -v node >/dev/null || { echo "未安装 Node，请先装 Node 20（宝塔: 软件商店 → Node.js 版本管理器）"; exit 1; }
NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node 版本过低: $(node -v)，需要 20.x"; exit 1; }
echo "    Node $(node -v)"

echo "==> 运行配置 .env"
if [ ! -f .env ]; then
  cp .env.example .env
  read -r -p "    粘贴百度地图【服务端】AK 后回车: " AK
  [ -n "$AK" ] && sed -i "s/^BAIDU_SERVER_AK=.*/BAIDU_SERVER_AK=$AK/" .env
  echo "    已生成 .env（以后升级不会覆盖）"
else
  echo "    已存在，沿用"
fi
grep -q '^BAIDU_SERVER_AK=your_server_ak_here' .env && echo "    ⚠ .env 里的 BAIDU_SERVER_AK 还是占位符，实时分析不可用（样例仍可看）"

echo "==> pm2"
command -v pm2 >/dev/null || npm i -g pm2 >/dev/null
if pm2 describe "$APP" >/dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs --update-env >/dev/null && echo "    已重启 $APP"
else
  pm2 start ecosystem.config.cjs >/dev/null && echo "    已启动 $APP"
fi
pm2 save >/dev/null 2>&1 || true

echo "==> 健康检查"
for i in $(seq 1 20); do
  if OUT=$(curl -s --max-time 2 "http://127.0.0.1:$PORT/api/health"); then
    echo "    $OUT"
    echo
    echo "完成。下一步：宝塔 → 网站 → 反向代理到 http://127.0.0.1:$PORT，并在配置里加："
    echo "    proxy_buffering off;  proxy_read_timeout 600s;  proxy_http_version 1.1;"
    echo "再申请 SSL；百度控制台给浏览器端 AK 加 Referer 白名单 *.你的域名/*"
    exit 0
  fi
  sleep 1
done
echo "    启动后 20 秒内未响应，看日志: pm2 logs $APP --lines 50"
exit 1

#!/usr/bin/env bash
# 圈见 · 服务器一键安装/升级：在解压后的目录里执行  bash install.sh
# 做的事：检查 Node → 生成 .env（首次会让你粘服务端 AK）→ 装 pm2 → 启动或重启 → 宝塔反向代理（可选）→ 健康检查
# 免交互：DOMAIN=quanjian.example.com bash install.sh
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

echo "==> 域名与反向代理（宝塔）"
DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ] && [ -t 0 ]; then
  read -r -p "    站点域名（已在宝塔建好站点的话填，回车跳过）: " DOMAIN
fi
if [ -n "$DOMAIN" ]; then
  VHOST="/www/server/panel/vhost/nginx/$DOMAIN.conf"
  if [ -f "$VHOST" ]; then
    if grep -q "proxy_pass http://127.0.0.1:$PORT" "$VHOST"; then
      echo "    $VHOST 已有反向代理，跳过"
    else
      cp "$VHOST" "$VHOST.bak.$(date +%s)"
      # 在 server{} 里最后一个 } 之前插入代理块（宝塔的 location / 若存在会被本块覆盖匹配顺序，故先移除它）
      python3 - "$VHOST" "$PORT" <<'PY'
import re,sys
f,port=sys.argv[1],sys.argv[2]
s=open(f,encoding='utf-8').read()
s=re.sub(r"\n\s*location\s*/\s*\{[^{}]*\}", "", s, count=1)
block=f"""
    # quanjian 反向代理（install.sh 写入）
    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 600s;
    }}
"""
i=s.rstrip().rfind("}")
s=s[:i]+block+s[i:]
open(f,"w",encoding="utf-8").write(s)
PY
      if nginx -t >/dev/null 2>&1; then
        (nginx -s reload 2>/dev/null || /etc/init.d/nginx reload >/dev/null 2>&1) && echo "    已写入反向代理并重载 nginx：http://$DOMAIN → 127.0.0.1:$PORT"
      else
        cp "$(ls -t "$VHOST".bak.* | head -1)" "$VHOST"
        echo "    ⚠ nginx 配置校验失败，已还原；请在宝塔面板手动加反向代理"
      fi
    fi
    echo "    SSL：宝塔 → 网站 → $DOMAIN → SSL → Let's Encrypt 申请并开强制 HTTPS"
  else
    echo "    未找到 $VHOST"
    echo "    请先在宝塔 → 网站 → 添加站点 $DOMAIN（纯静态即可），再重跑 bash install.sh"
  fi
else
  echo "    跳过。稍后手动：宝塔反向代理到 http://127.0.0.1:$PORT，并加 proxy_buffering off; proxy_read_timeout 600s; proxy_http_version 1.1;"
fi

echo "==> 健康检查"
for i in $(seq 1 20); do
  if OUT=$(curl -s --max-time 2 "http://127.0.0.1:$PORT/api/health"); then
    echo "    $OUT"
    echo
    [ -n "$DOMAIN" ] && echo "完成。百度控制台 → 浏览器端 AK → Referer 白名单加 *.${DOMAIN#*.}/*（或 $DOMAIN/*）" || echo "完成。"
    exit 0
  fi
  sleep 1
done
echo "    启动后 20 秒内未响应，看日志: pm2 logs $APP --lines 50"
exit 1

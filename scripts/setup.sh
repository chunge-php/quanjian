#!/usr/bin/env bash
# 圈见 · 本地开发环境一键初始化
# 用法：bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

need_node_major=20
if ! command -v node >/dev/null 2>&1; then
  echo "[x] 未找到 node，请安装 Node.js ${need_node_major}（推荐 nvm: nvm install ${need_node_major}）" >&2
  exit 1
fi
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt "$need_node_major" ]; then
  echo "[x] Node 版本过低：$(node -v)，需要 >= ${need_node_major}" >&2
  exit 1
fi
echo "[ok] node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[..] 未找到 pnpm，尝试通过 corepack 启用"
  corepack enable && corepack prepare pnpm@9.12.0 --activate
fi
echo "[ok] pnpm $(pnpm -v)"

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "[ok] 已生成 .env.local，请填入百度地图 AK（BAIDU_SERVER_AK / NEXT_PUBLIC_BAIDU_BROWSER_AK）"
else
  echo "[ok] .env.local 已存在，跳过"
fi

pnpm install --frozen-lockfile
mkdir -p data/cache
echo
echo "完成。启动开发服务：pnpm dev   →   http://localhost:3010"

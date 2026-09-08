#!/usr/bin/env bash
# 圈见 · 一键打包（Linux/macOS）：pack.sh <版本号>  →  dist/quanjian-<版本号>.zip
# 产物是 Next.js standalone 运行包：服务器上只需 Node 20，不用 pnpm、不用重新构建。
set -euo pipefail
VER="${1:-}"
[ -z "$VER" ] && { echo "用法: ./pack.sh <版本号>   例: ./pack.sh 0.1.0"; exit 1; }
cd "$(dirname "$0")"
[ -f .env.local ] || { echo "缺 .env.local（构建需要 NEXT_PUBLIC_BAIDU_BROWSER_AK）"; exit 1; }
grep -q '^NEXT_PUBLIC_BAIDU_BROWSER_AK=' .env.local || { echo ".env.local 里没有 NEXT_PUBLIC_BAIDU_BROWSER_AK"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
echo "==> 安装依赖 & 构建"
pnpm install --frozen-lockfile
pnpm build
echo "==> 组装 standalone"
rm -rf dist/pkg && mkdir -p dist/pkg
cp -r .next/standalone/. dist/pkg/
mkdir -p dist/pkg/.next && cp -r .next/static dist/pkg/.next/static
cp -r public dist/pkg/public
mkdir -p dist/pkg/data && cp -r data/samples dist/pkg/data/samples
cp .env.example dist/pkg/.env.example
cp deploy/start.sh deploy/install.sh deploy/ecosystem.config.cjs deploy/服务器部署.md dist/pkg/
chmod +x dist/pkg/start.sh dist/pkg/install.sh
( cd dist/pkg && zip -qr "../quanjian-$VER.zip" . )
rm -rf dist/pkg
echo "==> 完成: dist/quanjian-$VER.zip ($(du -h "dist/quanjian-$VER.zip" | cut -f1))"

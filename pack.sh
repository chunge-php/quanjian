#!/usr/bin/env bash
# 圈见 · 一键打包（Linux/macOS）：pack.sh <版本号>  →  dist/quanjian-<版本号>.zip
# 产物是 Next.js standalone 运行包：服务器上只需 Node 20，不用 pnpm、不用重新构建。
set -euo pipefail
cd "$(dirname "$0")"
# 版本号：给了就用并写回 package.json；不给就把 package.json 的补丁号 +1
VER="${1:-}"
if [ -z "$VER" ]; then
  VER=$(node -e "const v=require('./package.json').version.split('.').map(Number);v[2]++;console.log(v.join('.'))")
  echo "==> 自动递增版本: $VER（构建成功后写回 package.json）"
fi
write_version() { node -e "const f='package.json';const p=require('./'+f);p.version='$VER';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"; }
[ -f .env.local ] || { echo "缺 .env.local（构建需要 NEXT_PUBLIC_BAIDU_BROWSER_AK）"; exit 1; }
grep -q '^NEXT_PUBLIC_BAIDU_BROWSER_AK=' .env.local || { echo ".env.local 里没有 NEXT_PUBLIC_BAIDU_BROWSER_AK"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
echo "==> 安装依赖 & 构建"
pnpm install --frozen-lockfile
[ -f node_modules/next/dist/bin/next ] || { echo "==> node_modules 不完整，强制重装"; pnpm install --force; }
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
write_version
echo "==> 完成: dist/quanjian-$VER.zip ($(du -h "dist/quanjian-$VER.zip" | cut -f1))"

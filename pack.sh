#!/usr/bin/env bash
# 圈见 · 一键打包（Linux/macOS）：./pack.sh [版本号]  →  dist/quanjian-<版本>.zip + dist/install.sh
# 两个文件一起传到服务器同目录，bash install.sh 自动识别全新安装/更新（见 docs/deploy.md）
# 产物是 Next.js standalone 运行包：服务器上只需 Node ≥18，不用 pnpm、不用重新构建。
set -euo pipefail
cd "$(dirname "$0")"
# 版本号：给了就用并写回 package.json；不给就把 package.json 的补丁号 +1（构建成功后才写回，失败不占号）
VER="${1:-}"
if [ -z "$VER" ]; then
  VER=$(node -e "const v=require('./package.json').version.split('.').map(Number);v[2]++;console.log(v.join('.'))")
  echo "==> 自动递增版本: $VER（构建成功后写回 package.json）"
fi
[[ "$VER" =~ ^[0-9]+(\.[0-9]+){1,3}([-.][0-9A-Za-z]+)?$ ]] || { echo "版本号格式不对：$VER（例 1.0.2）"; exit 1; }
write_version() { node -e "const f='package.json';const p=require('./'+f);p.version='$VER';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"; }
NAME="quanjian-$VER"; OUT="dist"; STAGE="$OUT/$NAME"
for t in node pnpm zip; do command -v "$t" >/dev/null || { echo "缺 $t"; exit 1; }; done
[ -f .env.local ] || { echo "缺 .env.local（构建需要 NEXT_PUBLIC_BAIDU_BROWSER_AK）"; exit 1; }
grep -q '^NEXT_PUBLIC_BAIDU_BROWSER_AK=' .env.local || { echo ".env.local 里没有 NEXT_PUBLIC_BAIDU_BROWSER_AK"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" NEXT_TELEMETRY_DISABLED=1

echo "==> 安装依赖 & 构建"
pnpm install --frozen-lockfile
# node_modules 被清过/残缺时 pnpm 会误报 "Already up to date"，核对关键文件不在就强制重装
[ -f node_modules/next/dist/bin/next ] || { echo "==> node_modules 不完整，强制重装"; pnpm install --force; }
rm -rf .next/standalone   # 残留的旧产物不能混进新包
pnpm build
[ -f .next/standalone/server.js ] || { echo "构建没产出 .next/standalone/server.js（next.config 的 output: 'standalone' 丢了？）"; exit 1; }

echo "==> 组装 $NAME"
rm -rf "$STAGE" && mkdir -p "$STAGE/.next"
cp -a .next/standalone/. "$STAGE/"
cp -a .next/static "$STAGE/.next/static"
cp -a public "$STAGE/public"
rm -rf "$STAGE/data"; mkdir -p "$STAGE/data"; cp -a data/samples "$STAGE/data/samples"   # 只带样例；磁盘缓存由 install.sh 软链到 shared/
rm -f "$STAGE/.env" "$STAGE/.env.local"                                                    # 运行配置由 install.sh 在服务器上生成，包里绝不带 AK
cp .env.example "$STAGE/.env.example"
cp deploy/start.sh deploy/ecosystem.config.cjs "$STAGE/"; sed -i 's/\r$//' "$STAGE/start.sh"; chmod +x "$STAGE/start.sh"
node deploy/flatten-node-modules.cjs "$STAGE"                                              # pnpm 软链布局压平，否则服务器上 next 找不到 styled-jsx
printf '%s\n' "$VER" > "$STAGE/VERSION"

echo "==> 压缩"
rm -f "$OUT/$NAME.zip"; (cd "$OUT" && zip -qr "$NAME.zip" "$NAME"); rm -rf "$STAGE"
cp deploy/install.sh "$OUT/install.sh"; sed -i 's/\r$//' "$OUT/install.sh"; chmod +x "$OUT/install.sh"
write_version
echo
echo "✓ $OUT/$NAME.zip  ($(du -h "$OUT/$NAME.zip" | cut -f1))"
echo "✓ $OUT/install.sh"
echo "上传这两个文件到服务器同一目录，然后：bash install.sh   （首次会问百度服务端 AK 和域名；以后同样命令=更新）"

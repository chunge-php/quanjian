#!/usr/bin/env bash
# 圈见 · Docker 一键演示
# 用法：bash scripts/demo.sh        （构建并后台启动）
#       bash scripts/demo.sh down   （停止并删除容器）
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "down" ]; then
  docker compose down
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[x] 未找到 docker，请先安装 Docker Desktop / Docker Engine" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[!] 已生成 .env（内容为占位符）。未填写 AK 时将使用内置样例数据（ALLOW_SAMPLE_FALLBACK=true）。"
fi

mkdir -p data/cache
docker compose up --build -d

cat <<MSG

================ 圈见 · 演示环境已启动 ================
访问地址：  http://localhost:3010
健康检查：  http://localhost:3010/api/health
查看日志：  docker compose logs -f quanjian
停止服务：  bash scripts/demo.sh down

样例说明：
  1. 在首页搜索框输入地址（如「重庆市璧山区璧泉街道」）或直接在地图上点选中心点；
  2. 点击「开始体检」，右侧进度条会实时显示 采样 → 算路 → 等时圈 → POI → 评分 → 盲区；
  3. 报告页展示 5/10/15 分钟等时圈、各类设施最近步行时间、盲区网格与规划建议。
  未配置 AK 时会自动回退到 data/samples/ 中的样例（页面顶部有黄色提示）。
=======================================================
MSG

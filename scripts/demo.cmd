@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0\.."

if /i "%~1"=="down" (
  docker compose down
  exit /b 0
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [x] 未找到 docker，请先安装 Docker Desktop
  exit /b 1
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo [!] 已生成 .env（占位符）。未填写 AK 时将使用内置样例数据。
)
if not exist "data\cache" mkdir "data\cache"

docker compose up --build -d
if errorlevel 1 exit /b 1

echo.
echo ================ 圈见 · 演示环境已启动 ================
echo 访问地址：  http://localhost:3010
echo 健康检查：  http://localhost:3010/api/health
echo 查看日志：  docker compose logs -f quanjian
echo 停止服务：  scripts\demo.cmd down
echo.
echo 样例说明：
echo   1. 首页输入地址（如「重庆市璧山区璧泉街道」）或在地图上点选中心点；
echo   2. 点击「开始体检」，进度条实时显示 采样 - 算路 - 等时圈 - POI - 评分 - 盲区；
echo   3. 报告页展示 5/10/15 分钟等时圈、各类设施最近步行时间、盲区网格与规划建议。
echo =======================================================
endlocal

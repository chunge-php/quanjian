@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo [x] 未找到 node，请安装 Node.js 20：https://nodejs.org/
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [ok] node %NODE_VER%

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [..] 未找到 pnpm，尝试通过 corepack 启用
  call corepack enable
  call corepack prepare pnpm@9.12.0 --activate
)
for /f "delims=" %%v in ('pnpm -v') do set PNPM_VER=%%v
echo [ok] pnpm %PNPM_VER%

if not exist ".env.local" (
  copy /y ".env.example" ".env.local" >nul
  echo [ok] 已生成 .env.local，请填入百度地图 AK
) else (
  echo [ok] .env.local 已存在，跳过
)

call pnpm install --frozen-lockfile
if not exist "data\cache" mkdir "data\cache"
echo.
echo 完成。启动开发服务：pnpm dev  -^>  http://localhost:3010
endlocal

@echo off
chcp 65001 >nul
REM 圈见 · 一键打包（Windows）：pack <版本号>  →  dist\quanjian-<版本号>.zip
setlocal EnableDelayedExpansion
cd /d "%~dp0"
REM 版本号：给了就用并写回 package.json；不给就把 package.json 的补丁号 +1
set VER=%~1
if "%VER%"=="" (
  for /f "usebackq delims=" %%v in (`node -e "const v=require('./package.json').version.split('.').map(Number);v[2]++;console.log(v.join('.'))"`) do set VER=%%v
  echo ==^> 自动递增版本: !VER!（构建成功后写回 package.json）
)
if not exist .env.local ( echo 缺 .env.local（构建需要 NEXT_PUBLIC_BAIDU_BROWSER_AK） & exit /b 1 )
findstr /b "NEXT_PUBLIC_BAIDU_BROWSER_AK=" .env.local >nul || ( echo .env.local 里没有 NEXT_PUBLIC_BAIDU_BROWSER_AK & exit /b 1 )
echo ==^> 安装依赖 ^& 构建
call pnpm install --frozen-lockfile || exit /b 1
call pnpm build || exit /b 1
echo ==^> 组装 standalone
if exist dist\pkg rmdir /s /q dist\pkg
mkdir dist\pkg
xcopy /e /i /q /y .next\standalone dist\pkg >nul
mkdir dist\pkg\.next\static
xcopy /e /i /q /y .next\static dist\pkg\.next\static >nul
xcopy /e /i /q /y public dist\pkg\public >nul
mkdir dist\pkg\data\samples
xcopy /e /i /q /y data\samples dist\pkg\data\samples >nul
copy /y .env.example dist\pkg\.env.example >nul
copy /y deploy\start.sh dist\pkg\start.sh >nul
copy /y deploy\install.sh dist\pkg\install.sh >nul
copy /y deploy\ecosystem.config.cjs dist\pkg\ecosystem.config.cjs >nul
copy /y deploy\服务器部署.md dist\pkg\服务器部署.md >nul
if exist dist\quanjian-%VER%.zip del /q dist\quanjian-%VER%.zip
REM 优先用 7-Zip（几秒），没有再退回 PowerShell Compress-Archive（几分钟）
set SEVENZIP=
if exist "%ProgramFiles%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles%\7-Zip\7z.exe"
if exist "%ProgramFiles(x86)%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles(x86)%\7-Zip\7z.exe"
where 7z >nul 2>nul && set "SEVENZIP=7z"
if defined SEVENZIP (
  "%SEVENZIP%" a -tzip -mx=5 -r "dist\quanjian-%VER%.zip" ".\dist\pkg\*" >nul
) else (
  powershell -NoProfile -Command "Compress-Archive -Path 'dist\pkg\*' -DestinationPath 'dist\quanjian-%VER%.zip' -Force"
)
rmdir /s /q dist\pkg
node -e "const f='package.json';const p=require('./'+f);p.version='%VER%';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
echo ==^> 完成: dist\quanjian-%VER%.zip
endlocal

@echo off
chcp 65001 >nul
REM 圈见 · 一键打包（Windows）：pack <版本号>  →  dist\quanjian-<版本号>.zip
setlocal
set VER=%~1
if "%VER%"=="" ( echo 用法: pack ^<版本号^>   例: pack 0.1.0 & exit /b 1 )
cd /d "%~dp0"
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
copy /y deploy\ecosystem.config.cjs dist\pkg\ecosystem.config.cjs >nul
copy /y deploy\服务器部署.md dist\pkg\服务器部署.md >nul
if exist dist\quanjian-%VER%.zip del /q dist\quanjian-%VER%.zip
powershell -NoProfile -Command "Compress-Archive -Path 'dist\pkg\*' -DestinationPath 'dist\quanjian-%VER%.zip' -Force"
rmdir /s /q dist\pkg
echo ==^> 完成: dist\quanjian-%VER%.zip
endlocal

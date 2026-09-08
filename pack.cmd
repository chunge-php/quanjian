@echo off
chcp 65001 >nul
REM 圈见 · 一键打包（Windows）：pack [版本号]  →  dist\quanjian-<版本>.zip + dist\install.sh
REM 两个文件一起传到服务器同目录，bash install.sh 自动识别全新安装/更新（见 docs\deploy.md）
REM 产物是 Next.js standalone 运行包：服务器上只需 Node ≥18，不用 pnpm、不用重新构建。
setlocal EnableDelayedExpansion
cd /d "%~dp0"
REM 版本号：给了就用并写回 package.json；不给就把 package.json 的补丁号 +1（构建成功后才写回，失败不占号）
set VER=%~1
if "%VER%"=="" (
  for /f "usebackq delims=" %%v in (`node -e "const v=require('./package.json').version.split('.').map(Number);v[2]++;console.log(v.join('.'))"`) do set VER=%%v
  echo ==^> 自动递增版本: !VER!（构建成功后写回 package.json）
)
set NAME=quanjian-!VER!
set STAGE=dist\!NAME!
if not exist .env.local ( echo 缺 .env.local（构建需要 NEXT_PUBLIC_BAIDU_BROWSER_AK） & exit /b 1 )
findstr /b "NEXT_PUBLIC_BAIDU_BROWSER_AK=" .env.local >nul || ( echo .env.local 里没有 NEXT_PUBLIC_BAIDU_BROWSER_AK & exit /b 1 )
if "%NODE_OPTIONS%"=="" set NODE_OPTIONS=--max-old-space-size=4096
set NEXT_TELEMETRY_DISABLED=1

echo ==^> 安装依赖 ^& 构建
call pnpm install --frozen-lockfile || exit /b 1
REM node_modules 被清过/残缺时 pnpm 会误报 "Already up to date"，核对关键文件不在就强制重装
if not exist node_modules\next\dist\bin\next (
  echo ==^> node_modules 不完整，强制重装
  call pnpm install --force || exit /b 1
)
REM ⚠ 不能用 rmdir /s：standalone 里有 pnpm 的 junction 指向项目 node_modules，rmdir 会钻进去把真依赖删光
if exist .next\standalone node -e "require('fs').rmSync('.next/standalone',{recursive:true,force:true})"
call pnpm build || exit /b 1
if not exist .next\standalone\server.js ( echo 构建没产出 .next\standalone\server.js（next.config 的 output: 'standalone' 丢了？） & exit /b 1 )

echo ==^> 组装 !NAME!
if not exist dist mkdir dist
if exist "!STAGE!" node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "!STAGE!"
mkdir "!STAGE!"
xcopy /e /i /q /y .next\standalone "!STAGE!" >nul
mkdir "!STAGE!\.next\static"
xcopy /e /i /q /y .next\static "!STAGE!\.next\static" >nul
xcopy /e /i /q /y public "!STAGE!\public" >nul
REM 只带样例；磁盘缓存由 install.sh 软链到 shared/
if exist "!STAGE!\data" node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "!STAGE!\data"
mkdir "!STAGE!\data\samples"
xcopy /e /i /q /y data\samples "!STAGE!\data\samples" >nul
REM 运行配置由 install.sh 在服务器上生成，包里绝不带 AK
if exist "!STAGE!\.env" del /q "!STAGE!\.env"
if exist "!STAGE!\.env.local" del /q "!STAGE!\.env.local"
copy /y .env.example "!STAGE!\.env.example" >nul
copy /y deploy\ecosystem.config.cjs "!STAGE!\ecosystem.config.cjs" >nul
REM start.sh 给 Linux 用，强制 LF
powershell -NoProfile -Command "[IO.File]::WriteAllText('%CD%\!STAGE!\start.sh', ([IO.File]::ReadAllText('%CD%\deploy\start.sh') -replace ([char]13+[char]10), [char]10), (New-Object Text.UTF8Encoding $false))" || exit /b 1
REM pnpm 软链布局压平，否则服务器上 next 找不到 styled-jsx
node deploy\flatten-node-modules.cjs "!STAGE!" || exit /b 1
<nul set /p ="!VER!" > "!STAGE!\VERSION"

echo ==^> 压缩
if exist "dist\!NAME!.zip" del /q "dist\!NAME!.zip"
REM 优先用 7-Zip（几秒）；没有就用 .NET ZipFile（zip 内路径强制用 /，PowerShell 自带的 Compress-Archive 会写成 \ 到 Linux 解不对）
set SEVENZIP=
if exist "%ProgramFiles%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles%\7-Zip\7z.exe"
if exist "%ProgramFiles(x86)%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles(x86)%\7-Zip\7z.exe"
where 7z >nul 2>nul && set "SEVENZIP=7z"
if defined SEVENZIP (
  "!SEVENZIP!" a -tzip -mx=5 "dist\!NAME!.zip" ".\!STAGE!" >nul || exit /b 1
) else (
  powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open('%CD%\dist\!NAME!.zip','Create'); $b='%CD%\dist\'; Get-ChildItem -Recurse -File '%CD%\!STAGE!' | ForEach-Object { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, $_.FullName, $_.FullName.Substring($b.Length).Replace('\','/'), 'Optimal') | Out-Null }; $z.Dispose()" || exit /b 1
)
node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "!STAGE!"
REM install.sh 放 zip 旁边（不进包），强制 LF
powershell -NoProfile -Command "[IO.File]::WriteAllText('%CD%\dist\install.sh', ([IO.File]::ReadAllText('%CD%\deploy\install.sh') -replace ([char]13+[char]10), [char]10), (New-Object Text.UTF8Encoding $false))" || exit /b 1
node -e "const f='package.json';const p=require('./'+f);p.version='!VER!';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
echo.
echo ==^> 完成: dist\!NAME!.zip + dist\install.sh
echo 上传这两个文件到服务器同一目录，然后：bash install.sh   （首次会问百度服务端 AK 和域名；以后同样命令=更新）
endlocal

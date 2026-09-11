@echo off
setlocal
cd /d "%~dp0"
set PORT=8080

echo.
echo  AnotherCesiumSkybox — 本地静态服务
echo  ----------------------------------
echo  目录: %CD%
echo  地址: http://localhost:%PORT%/
echo  按 Ctrl+C 结束
echo.

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" "http://localhost:%PORT%/"
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :eof
)

where npx >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" "http://localhost:%PORT%/"
  npx --yes serve -l %PORT% .
  goto :eof
)

echo [错误] 未找到 Python 或 npx。请安装 Python 3，或用任意静态服务器托管本目录。
pause
exit /b 1

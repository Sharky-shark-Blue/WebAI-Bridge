@echo off
chcp 65001 >nul
title Gemini Proxy Bridge
cls

echo.
echo  ============================================================
echo.
echo        GGGGG   EEEEE  M   M  III  N   N  III
echo       G        E      MM MM   I   NN  N   I
echo       G  GGG   EEEE   M M M   I   N N N   I
echo       G    G   E      M   M   I   N  NN   I
echo        GGGG    EEEEE  M   M  III  N   N  III
echo.
echo              P R O X Y    B R I D G E
echo.
echo  ============================================================
echo.
echo              Local Gemini Proxy Server
echo              Powered by Node.js
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please run install.bat first.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [ERROR] node_modules not found. Please run install.bat first.
    pause
    exit /b 1
)

if not exist "server.js" (
    echo [ERROR] server.js not found. Please run this script in the correct folder.
    pause
    exit /b 1
)

if "%PORT%"=="" set PORT=3000

echo [INFO] Checking port %PORT%...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo [INFO] Killing process on port %PORT%, PID=%%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [OK] Port %PORT% is ready.
echo [OK] Environment check passed.
echo.
echo  ------------------------------------------------------------
echo    Server URL :  http://localhost:%PORT%
echo    WebSocket  :  ws://localhost:%PORT%
echo    Stop       :  Ctrl + C
echo    api调用输入   http://localhost:3000    选择openai接口  即可
echo  ------------------------------------------------------------
echo.

start "" "http://localhost:%PORT%"

node server.js

echo.
echo [INFO] Server stopped.
pause
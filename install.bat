@echo off
setlocal
chcp 65001 >nul
title Gemini Proxy Bridge - 安装

cls
echo.
echo  ====================================================
echo              GEMINI PROXY BRIDGE 安装程序
echo  ====================================================
echo.
echo 当前目录:
echo %cd%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js
    echo 请先安装 Node.js 18 或以上版本
    echo https://nodejs.org/zh-cn/download/
    goto END
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [正常] 检测到 Node.js %NODE_VER%
echo.

node -e "const v=parseInt(process.versions.node); if(v<18){process.exit(1)}"
if errorlevel 1 (
    echo [错误] Node.js 版本过低，需要 18 或以上版本
    goto END
)

echo [信息] 正在安装依赖...
echo.

call npm install
if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败
    echo 请检查网络后重新运行 install.bat
    goto END
)

echo.
echo  ====================================================
echo                    安装完成
echo  ====================================================
echo.
echo 请继续执行:
echo.
echo 1. 双击 start.bat 启动服务器
echo.
echo 2. 浏览器打开 chrome://extensions/  (添加浏览器插件)
echo.
echo 3. 打开开发者模式，然后加载 extension 文件夹  （管理扩展 - 打开开发人员模式 - 加载解解压缩的扩展 -选择本项目内的extension）
echo.
echo 4. 打开 gemini.google.com 并登录
echo.
echo 5. 打开 http://localhost:3000
echo.

:END
echo.
echo 按任意键退出...
pause >nul
endlocal
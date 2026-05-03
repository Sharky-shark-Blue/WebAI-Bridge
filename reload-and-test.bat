@echo off
chcp 65001 >nul
echo ========================================
echo 应用 ChatGPT 修复（服务器已运行）
echo ========================================
echo.
echo 步骤 1: 重新加载扩展
echo ----------------------------------------
echo 1. 打开 chrome://extensions/
echo 2. 找到 "Multi-Backend Proxy Bridge"
echo 3. 点击刷新图标 🔄
echo 4. 刷新 ChatGPT 页面
echo.
pause
echo.
echo 步骤 2: 测试 ChatGPT
echo ----------------------------------------
echo 在 ChatGPT 页面发送: 你好
echo.
echo 期望结果：
echo - ChatGPT 收到系统提示词 + 你好
echo - 返回完整回复（不截断）
echo.
echo 步骤 3: 检查日志
echo ----------------------------------------
echo 浏览器控制台（F12）应显示：
echo   [GPB] ChatGPT: Found content using selector "..."
echo   [GPB] ChatGPT: Response preview: "..."
echo   [GPB] ChatGPT: Found NEW response in DOM, length: XX chars
echo.
echo 服务器日志应显示：
echo   [buildPrompt] chatgpt 多段格式，总长度: XXX 字符
echo.
pause

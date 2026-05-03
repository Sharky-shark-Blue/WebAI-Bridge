@echo off
echo ========================================
echo 重启服务器并测试 ChatGPT 修复
echo ========================================
echo.
echo 步骤 1: 停止旧服务器
echo 请按 Ctrl+C 停止当前运行的服务器
echo.
pause

echo.
echo 步骤 2: 启动新服务器
start cmd /k "npm start"
timeout /t 3 /nobreak >/dev/null

echo.
echo 步骤 3: 重新加载扩展
echo 1. 打开 chrome://extensions/
echo 2. 找到 "Multi-Backend Proxy Bridge"
echo 3. 点击刷新图标
echo 4. 刷新 ChatGPT 页面
echo.
pause

echo.
echo 步骤 4: 测试 ChatGPT
echo 发送测试请求...
echo.

curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"chatgpt\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"

echo.
echo.
echo ========================================
echo 检查结果：
echo ========================================
echo 1. 服务器日志应显示: [buildPrompt] ChatGPT 简洁格式
echo 2. 浏览器控制台应显示: [GPB] ChatGPT: Found content using selector
echo 3. 响应应该是完整的，不是截断的
echo.
pause

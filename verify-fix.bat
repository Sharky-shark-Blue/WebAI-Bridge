@echo off
chcp 65001 >nul
echo ========================================
echo 验证 ChatGPT 修复
echo ========================================
echo.

echo [1/3] 检查服务器状态...
curl -s http://localhost:3000/api/status >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 服务器未运行！请先运行 start.bat
    pause
    exit /b 1
)
echo ✓ 服务器运行中

echo.
echo [2/3] 发送测试消息到 ChatGPT...
echo 消息内容: "你好"
echo.

curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"chatgpt\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}" ^
  2>nul

echo.
echo.
echo [3/3] 检查日志输出
echo ========================================
echo 服务器日志应该显示：
echo   [buildPrompt] ChatGPT 简洁格式，净化后: X 字符
echo   （注意：应该只有 "你好" 2个字符，不是一大串）
echo.
echo 浏览器控制台（F12）应该显示：
echo   [GPB] ChatGPT: Found content using selector "..."
echo   [GPB] ChatGPT: Response preview: "..."
echo   （注意：响应应该是完整的，不是只有几个字）
echo ========================================
echo.
echo 如果看到以上日志，说明修复成功！
echo 如果还有问题，请复制服务器日志和浏览器控制台日志。
echo.
pause

@echo off
chcp 65001 >nul
echo ========================================
echo 测试 ChatGPT 和 Gemini 使用相同逻辑
echo ========================================
echo.

echo 测试消息: "你好"
echo 期望: ChatGPT 收到【系统指令】+【用户消息】格式
echo.

curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"chatgpt\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"

echo.
echo.
echo ========================================
echo 检查服务器日志：
echo 应该看到: [buildPrompt] chatgpt 多段格式，总长度: XXX 字符
echo （注意：不再是"简洁格式"，而是"多段格式"）
echo ========================================
echo.
pause

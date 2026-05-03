@echo off
chcp 65001 >nul
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║          最终修复：过滤 Claude Code + 跳过占位符          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 【修复内容】
echo ✓ sanitizeMessage() 检测并删除 Claude Code 系统指令
echo ✓ DOM 捕获跳过 "正在思考" 等占位符
echo ✓ 等待内容稳定后才返回
echo.
echo ════════════════════════════════════════════════════════════
echo 立即操作：
echo ════════════════════════════════════════════════════════════
echo.
echo 1. 打开 chrome://extensions/
echo 2. 找到扩展，点击刷新 🔄
echo 3. 刷新 ChatGPT 页面（F5）
echo 4. 按 F12 打开控制台
echo 5. 发送消息: "你好"
echo.
echo ════════════════════════════════════════════════════════════
echo 期望结果：
echo ════════════════════════════════════════════════════════════
echo.
echo 服务器日志：
echo   [Sanitize] 检测到 Claude Code 系统指令，长度: XXXXX 字符
echo   [Sanitize] 删除整个 Claude Code 系统上下文
echo   [buildPrompt] chatgpt 多段格式，总长度: XX 字符
echo   （注意：应该只有几十字符，不是几万字符）
echo.
echo 浏览器控制台：
echo   [GPB] ChatGPT: Skipping placeholder: "正在思考"
echo   [GPB] ChatGPT: Content growing... XX chars
echo   [GPB] ChatGPT: Content stable for 3 checks
echo   [GPB] ChatGPT: Response complete, final length: XX chars
echo.
echo ════════════════════════════════════════════════════════════
pause

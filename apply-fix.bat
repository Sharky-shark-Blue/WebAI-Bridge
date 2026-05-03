@echo off
chcp 65001 >nul
cls
echo ╔════════════════════════════════════════════════════════════╗
echo ║          应用 ChatGPT 完整响应捕获修复                     ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 【修复内容】
echo ✓ 使用 TreeWalker 递归提取所有文本节点
echo ✓ 等待内容稳定（3次检查确认完成）
echo ✓ 过滤按钮和控制元素
echo ✓ 详细日志输出
echo.
echo ════════════════════════════════════════════════════════════
echo 步骤 1: 重新加载扩展
echo ════════════════════════════════════════════════════════════
echo.
echo 1. 打开新标签页，输入: chrome://extensions/
echo 2. 找到 "Multi-Backend Proxy Bridge" 扩展
echo 3. 点击刷新图标 🔄
echo.
pause
echo.
echo ════════════════════════════════════════════════════════════
echo 步骤 2: 刷新 ChatGPT 页面
echo ════════════════════════════════════════════════════════════
echo.
echo 1. 切换到 ChatGPT 标签页
echo 2. 按 F5 刷新页面
echo 3. 按 F12 打开开发者工具（查看控制台）
echo.
pause
echo.
echo ════════════════════════════════════════════════════════════
echo 步骤 3: 测试发送消息
echo ════════════════════════════════════════════════════════════
echo.
echo 在 ChatGPT 输入框发送: 你好
echo.
echo 【期望看到的日志】
echo 浏览器控制台:
echo   [GPB] ChatGPT: Content growing... XX chars
echo   [GPB] ChatGPT: Content stable for 1 checks
echo   [GPB] ChatGPT: Content stable for 2 checks
echo   [GPB] ChatGPT: Content stable for 3 checks
echo   [GPB] ChatGPT: Response complete, final length: XX chars
echo   [GPB] ChatGPT: Response preview: "..."
echo.
echo 【期望结果】
echo ✓ ChatGPT 收到完整提示词（系统指令 + 用户消息）
echo ✓ 返回完整响应（不截断）
echo.
echo ════════════════════════════════════════════════════════════
pause

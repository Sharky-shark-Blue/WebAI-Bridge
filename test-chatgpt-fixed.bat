@echo off
echo Testing ChatGPT with fixed sanitization and DOM capture...
echo.

curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"chatgpt\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}]}"

echo.
echo.
echo Check server logs for [buildPrompt] and [GPB] ChatGPT messages
pause

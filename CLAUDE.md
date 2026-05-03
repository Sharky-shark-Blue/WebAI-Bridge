# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebAI Bridge converts Gemini/ChatGPT web interfaces into local OpenAI-compatible APIs without requiring API keys. It bridges external clients (Claude Code, Cursor, etc.) to AI platforms through a Chrome extension.

## Common Commands

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode with auto-reload
npm run dev

# Test against live AI platforms (requires server running)
# - final-test.bat: Full integration test
# - reload-and-test.bat: Reload extension before test
# - restart-and-test.bat: Restart server before test
```

## Architecture

```
External Client (Claude Code / Cursor)
    ↓ POST /v1/chat/completions
Local Server (server.js: Express + WebSocket)
    ↓ Message sanitization + routing
Chrome Extension (extension/: adapters + content scripts)
    ↓ DOM automation + response capture
AI Platforms (gemini.google.com / chatgpt.com)
```

**Core Components:**

- **server.js** - Express HTTP server with WebSocket bridge, handles `/v1/chat/completions` OpenAI-compatible endpoint, performs Claude Code metadata sanitization
- **server/parsers/** - Backend-specific response parsers (registry.js routes to gemini.js or chatgpt.js)
- **extension/** - Chrome extension with platform adapters (adapters/gemini.js, adapters/chatgpt.js) and content scripts for DOM automation
- **public/** - Built-in web UI for chat interface and admin panel

## Key Implementation Details

### Message Sanitization (server.js:55-160)

The server strips Claude Code system prompts and metadata from incoming messages to prevent input overflow. Key patterns removed:
- Claude Code markers (`x-anthropic-billing-header`, session summaries, etc.)
- XML tags like `<thinking>`, `<task-notification>`, `<tool-use-id>`
- Chinese markers: `【系统指令】`, `【对话历史】`, `【用户消息】`

### WebSocket Protocol

Extension connects to `ws://localhost:3000`. Messages use JSON format with `type` field:
- `chat`: Send message to AI
- `response`: Streamed response back
- `status`: Connection health

### Chrome Extension Structure

- **content-page.js**: MAIN world script - handles UI interaction, message input/output
- **content-isolated.js**: ISOLATED world script - captures responses
- **adapters/**: Platform-specific automation (gemini.js, chatgpt.js)
- **background.js**: Service worker for popup UI and state management

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `MAX_MESSAGE_CHARS` | 20000 | Max single message length |
| `MAX_QUEUE_LENGTH` | 3 | Queue capacity limit |

## API Usage

```bash
# OpenAI-compatible format
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini", "messages": [{"role": "user", "content": "Hello"}]}'

# Model selection: "gemini" or "chatgpt"
```

## Extension Installation

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/` directory
4. Open AI platform (gemini.google.com or chatgpt.com) in Chrome
5. Extension auto-connects when page is active
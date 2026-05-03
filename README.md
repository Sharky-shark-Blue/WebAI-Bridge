# WebAI Bridge

> 将 Gemini、ChatGPT 等 AI 网页版转换为本地 API，无需 API Key，兼容 OpenAI 格式

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

---

## ✨ 特性

- 🚀 **零成本** - 无需 API Key，使用现有的网页版账号
- 🔌 **OpenAI 兼容** - 支持标准 `/v1/chat/completions` 接口
- 🎯 **多后端** - 支持 Gemini、ChatGPT，自动检测平台
- 🛡️ **智能净化** - 自动过滤 Claude Code 的元数据标签
- ⚡ **实时响应** - WebSocket 直连，低延迟
- 🎨 **Web UI** - 内置聊天界面和管理面板

---

## 📦 快速开始

### 1. 安装依赖

```bash
# Windows
.\install.bat

# macOS/Linux
npm install
```

### 2. 启动服务器

```bash
# Windows
.\start.bat

# macOS/Linux
npm start
```

服务器将在 `http://localhost:3000` 启动

### 3. 安装浏览器扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `extension/` 目录

### 4. 打开 AI 平台

在 Chrome 中打开以下任一平台并登录：
- **Gemini**: https://gemini.google.com
- **ChatGPT**: https://chatgpt.com

扩展会自动检测当前平台并建立连接。

---

## 🔧 使用方法

### 在 Claude Code 中使用

```bash
# 设置环境变量
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=any-string
```

### 在 Cursor 中使用

设置 → Models → Custom Models:
- Base URL: `http://localhost:3000/v1`
- API Key: `any-string`
- Model: `gemini` 或 `chatgpt`

### 直接调用 API

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**支持的模型：**
- `gemini` - 使用 Gemini 后端
- `chatgpt` - 使用 ChatGPT 后端

---

## 🏗️ 架构

```
外部客户端 (Claude Code / Cursor)
    ↓ POST /v1/chat/completions
本地服务器 (Express + WebSocket)
    ↓ 消息净化 + 路由
Chrome 扩展 (适配器模式)
    ↓ DOM 自动化 + 响应捕获
AI 平台 (Gemini / ChatGPT)
```

**核心组件：**
- **服务器** (`server.js`) - Express API + WebSocket 桥接
- **解析器** (`server/parsers/`) - 多后端响应解析
- **扩展** (`extension/`) - 平台适配器 + DOM 自动化
- **Web UI** (`public/`) - 聊天界面 + 管理面板

---

## ⚙️ 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务器端口 |
| `MAX_MESSAGE_CHARS` | `20000` | 单条消息最大字符数 |
| `MAX_QUEUE_LENGTH` | `3` | 队列容量上限 |

### 扩展设置

点击 Chrome 工具栏中的扩展图标：
- **服务器地址** - WebSocket 连接地址（默认 `ws://localhost:3000`）
- **随机延迟** - 发送前的延迟范围（模拟人工操作）

---

## 🐛 常见问题

<details>
<summary><b>状态显示「插件未连接」</b></summary>

1. 确认扩展已安装并启用（`chrome://extensions/`）
2. 确认已打开 AI 平台标签页（Gemini 或 ChatGPT）
3. 刷新 AI 平台页面（F5）
4. 检查浏览器控制台（F12）是否有错误
</details>

<details>
<summary><b>发送消息后无响应</b></summary>

1. 确认 AI 平台标签页处于对话状态（非登录页）
2. 确认使用的 `model` 参数与打开的标签页匹配
3. 检查是否有未关闭的弹窗或错误提示
4. 查看服务器日志是否有错误信息
</details>

<details>
<summary><b>ChatGPT 返回旧消息</b></summary>

这个问题已在最新版本修复。请：
1. 在 `chrome://extensions/` 中刷新扩展
2. 刷新 ChatGPT 页面（F5）
3. 重新发送消息
</details>

<details>
<summary><b>如何切换后端</b></summary>

扩展会自动检测当前标签页：
- 打开 `gemini.google.com` → 使用 Gemini
- 打开 `chatgpt.com` → 使用 ChatGPT

可以同时打开两个标签页，通过 API 的 `model` 参数选择后端。
</details>

---

## 📝 API 文档

### OpenAI 兼容接口

```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "gemini",
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "stream": false
}
```

### 其他接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 检查连接状态 |
| `POST` | `/api/send` | 直接发送消息 |
| `POST` | `/api/new-chat` | 开启新对话 |
| `GET` | `/api/history` | 获取会话历史 |
| `GET/POST` | `/api/system-prompt` | 系统提示词管理 |
| `POST` | `/api/queue` | 推入转发队列 |
| `GET` | `/api/queue/result/:qid` | 轮询队列结果 |

---

## 🔒 安全说明

- 本项目仅在本地运行，不会上传任何数据
- 所有通信都在本地完成（浏览器 ↔ 本地服务器）
- 不存储任何敏感信息（API Key、对话记录等）
- 建议仅在可信网络环境下使用

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---
本项目开发过程中使用了 **Claude**（Anthropic）提供的 AI 辅助编程支持。
**Made with ❤️ by the community**

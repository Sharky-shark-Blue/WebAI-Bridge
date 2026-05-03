/**
 * server.js
 * Express + WebSocket 本地服务器。
 *
 * 架构：UI → server.js ←WebSocket→ extension/content.js → Gemini页面
 *
 * 接口：
 *   GET  /           聊天 UI
 *   POST /api/chat   { message } → { text }
 *   GET  /api/status 返回插件连接状态
 *   POST /api/new-chat 通知插件开新对话
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { parseResponse } from './server/parsers/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json({ limit: '50mb' }));

// ─── CORS：允许所有来源（本地 app / Cherry Studio / Open WebUI 等）────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// 路径兜底：常见 base URL 误配自动修正
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/chat/v1/')) req.url = req.url.replace('/api/chat', '');
  else if (req.url.startsWith('/v1/v1/')) req.url = req.url.replace('/v1/v1/', '/v1/');
  next();
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// ─── 消息清洗：剥掉 Claude Code 等客户端的 context 包裹 ──────
// Claude Code 会把 session summary / skills / rules 全塞进 user 消息，
// 这些 context 对 Gemini 无用且会把输入框撑爆。
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS ?? 20000);

function sanitizeMessage(raw) {
  let s = String(raw ?? '');
  const original = s;

  console.log(`[Sanitize] 原始消息长度: ${s.length} 字符`);

  // CRITICAL: 检测并删除 Claude Code 系统指令
  // 特征：包含 Claude Code 特有的标记
  const claudeCodeMarkers = [
    'x-anthropic-billing-header:',
    'You are a Claude agent',
    'You are Claude Code',
    '# System\n - All text you output',
    '# Doing tasks\n - The user will primarily',
    'IMPORTANT: Assist with authorized security testing',
    'Use the Agent tool with specialized agents',
    '# auto memory\n\nYou have a persistent',
    'C:\\Users\\Administrator\\.claude\\projects',
    'SessionStart hook additional context'
  ];

  const hasClaudeCode = claudeCodeMarkers.some(marker => s.includes(marker));

  if (hasClaudeCode) {
    console.log(`[Sanitize] 检测到 Claude Code 系统指令，长度: ${s.length} 字符`);
    console.log(`[Sanitize] 删除整个 Claude Code 系统上下文`);
    return '';
  }

  // 删除第一个中文标记之前的所有内容
  const firstMarkerMatch = s.match(/(【系统指令】|【对话历史】|【用户消息】)/);
  if (firstMarkerMatch) {
    const markerIndex = firstMarkerMatch.index;
    if (markerIndex > 0) {
      console.log(`[Sanitize] 删除前 ${markerIndex} 字符的前缀内容`);
      s = s.substring(markerIndex);
    }
  }

  // 剥离【系统指令】和【对话历史】等大段系统上下文
  s = s.replace(/【系统指令】[\s\S]*?(?=【用户消息】|$)/gi, '');
  s = s.replace(/【对话历史】[\s\S]*?(?=【用户消息】|$)/gi, '');

  // 提取【用户消息】后的实际内容
  const userMsgMatch = s.match(/【用户消息】\s*([\s\S]+)/);
  if (userMsgMatch) {
    s = userMsgMatch[1].trim();
    console.log(`[Sanitize] 提取到【用户消息】: "${s}"`);
  }

  // 剥离 Claude Code 的扩展思考内容
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  s = s.replace(/<thinking_mode>.*?<\/thinking_mode>/gi, '');
  s = s.replace(/<thinking_instruction>[\s\S]*?<\/thinking_instruction>/gi, '');
  s = s.replace(/<max_thinking_length>.*?<\/max_thinking_length>/gi, '');

  // 剥离任务通知和元数据
  s = s.replace(/<task-notification>[\s\S]*?<\/task-notification>/gi, '');
  s = s.replace(/<task-id>.*?<\/task-id>/gi, '');
  s = s.replace(/<tool-use-id>.*?<\/tool-use-id>/gi, '');
  s = s.replace(/<output-file>.*?<\/output-file>/gi, '');
  s = s.replace(/<status>.*?<\/status>/gi, '');
  s = s.replace(/<summary>.*?<\/summary>/gi, '');

  // 剥离工具调用语法
  s = s.replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/gi, '');
  s = s.replace(/<invoke[\s\S]*?<\/antml:invoke>/gi, '');
  s = s.replace(/<parameter[\s\S]*?<\/antml:parameter>/gi, '');

  // 剥离常见 XML 标签
  const stripTags = [
    'system-reminder',
    'local-command-caveat',
    'local-command-stdout',
    'local-command-stderr',
    'command-name',
    'command-message',
    'command-args',
    'command-result',
    'execution-log',
    'additional_metadata',
    'user_actions',
    'ide_metadata',
  ];
  for (const tag of stripTags) {
    const re = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
    s = s.replace(re, '');
  }

  // 剥离自闭合标签
  s = s.replace(/<[a-z_-]+\s*\/>/gi, '');

  // 折叠多余空行
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  // 硬截断
  if (s.length > MAX_MESSAGE_CHARS) {
    const head = s.slice(0, Math.floor(MAX_MESSAGE_CHARS * 0.7));
    const tail = s.slice(-Math.floor(MAX_MESSAGE_CHARS * 0.3));
    s = `${head}\n\n…[中间省略 ${s.length - MAX_MESSAGE_CHARS} 字符]…\n\n${tail}`;
  }

  console.log(`[Sanitize] 最终结果 (${original.length} → ${s.length} 字符): "${s}"`);

  return s;
}

// ─── 队列配置 ────────────────────────────────────────────────
const MAX_QUEUE_LENGTH = Number(process.env.MAX_QUEUE_LENGTH ?? 3);
const DEDUP_WINDOW_MS = 30_000;  // 30s 内相同消息去重

// ─── 系统提示词（UI 配置，应用于所有外部转发请求）─────────────
const SYSTEM_PROMPT_FILE = path.join(__dirname, 'system-prompt.txt');
let systemPrompt = '';
try {
  systemPrompt = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf8').trim();
  console.log(`[system-prompt] 从文件加载，长度 ${systemPrompt.length}`);
} catch { /* 文件不存在，忽略 */ }

function applySystemPrompt(message) {
  if (!systemPrompt.trim()) return message;
  return `【系统提示】\n${systemPrompt.trim()}\n\n【用户消息】\n${message}`;
}

// ─── 对话历史（内存，最多 200 条）────────────────────────────
const history = [];  // { id, ts, user, assistant, error }
function addHistory(entry) {
  history.push(entry);
  if (history.length > 200) history.shift();
}

// ─── 转发队列（外部 API → UI 代为发送）───────────────────────
// 外部调用 /api/queue 推入消息；UI 调用 /api/queue/next 取出并通过自己的输入框发送
// UI 发送完毕后调用 /api/queue/done 把结果写回，外部轮询 /api/queue/result/:qid
const forwardQueue = [];   // { qid, message, ts }
const queueResults = new Map();  // qid → { text?, error?, ts }
const recentMessages = new Map();// message → { qid, ts }   跨"队列/处理中/已完成"共享去重
const inFlight = new Map();      // qid → { message, ts } 已被 UI 取走但尚未完成

// 定期清理过期记录
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, v] of recentMessages) if (v.ts < cutoff) recentMessages.delete(k);
  for (const [k, v] of queueResults) if (v.ts && v.ts < cutoff) queueResults.delete(k);
  for (const [k, v] of inFlight) if (v.ts < cutoff - 120_000) inFlight.delete(k);
}, 30_000);

// 入队：去重 + 上限保护；返回 { qid, reason? }
function enqueueMessage(message) {
  const now = Date.now();
  // 1) 队列中已有相同消息 → 复用
  const inQueue = forwardQueue.find((i) => i.message === message);
  if (inQueue) {
    console.log(`[queue] dedup 命中（队列中） qid=${inQueue.qid}`);
    return { qid: inQueue.qid, dedup: true };
  }
  // 2) 正在被 UI 处理 → 复用 qid，调用方会轮询到同一个 result
  for (const [qid, entry] of inFlight) {
    if (entry.message === message) {
      console.log(`[queue] dedup 命中（处理中） qid=${qid}`);
      return { qid, dedup: true };
    }
  }
  // 3) 最近（30s 内）已完成过同样的消息 → 直接复用已缓存的 qid/result
  const recent = recentMessages.get(message);
  if (recent && now - recent.ts < DEDUP_WINDOW_MS) {
    console.log(`[queue] dedup 命中（最近完成） qid=${recent.qid}`);
    return { qid: recent.qid, dedup: true };
  }
  if (forwardQueue.length >= MAX_QUEUE_LENGTH) {
    return { qid: null, reason: `队列已满（${MAX_QUEUE_LENGTH} 条），请稍后重试或打开 UI 自动转发` };
  }
  const qid = randomUUID();
  forwardQueue.push({ qid, message, ts: now });
  recentMessages.set(message, { qid, ts: now });
  return { qid };
}

// 清空队列并通知所有 pending：用于 WS 断开时快速失败
function drainQueue(reason) {
  if (!forwardQueue.length && !queueResults.size) return;
  console.log(`[queue] 清空队列（${forwardQueue.length} 在队）原因：${reason}`);
  for (const item of forwardQueue) {
    queueResults.set(item.qid, { text: null, error: reason, ts: Date.now() });
  }
  forwardQueue.length = 0;
}

app.post('/api/queue', (req, res) => {
  const message = sanitizeMessage(String(req.body?.message ?? '').trim());
  if (!message) return res.status(400).json({ error: 'message 不能为空' });
  const enq = enqueueMessage(message);
  if (!enq.qid) return res.status(429).json({ error: enq.reason });
  res.json({ qid: enq.qid, dedup: enq.dedup ?? false });
});

app.get('/api/queue/next', (_req, res) => {
  const item = forwardQueue.shift() ?? null;
  if (item) inFlight.set(item.qid, { message: item.message, ts: Date.now() });
  res.json({ item });
});

app.post('/api/queue/done', (req, res) => {
  const { qid, text, error } = req.body ?? {};
  if (!qid) return res.status(400).json({ error: 'qid 必填' });
  queueResults.set(qid, { text: text ?? null, error: error ?? null, ts: Date.now() });
  inFlight.delete(qid);
  addHistory({ id: qid, ts: Date.now(), user: req.body?.message ?? '', assistant: text ?? null, error: error ?? null });
  res.json({ ok: true });
});

app.get('/api/queue/result/:qid', (req, res) => {
  const result = queueResults.get(req.params.qid);
  if (!result) return res.json({ status: 'pending' });
  // 不立即删除，让重复的轮询器 / 去重客户端都能读到；setInterval 会 60s 后清理
  res.json({ status: 'done', ...result });
});

app.get('/api/queue/length', (_req, res) => {
  res.json({ length: forwardQueue.length });
});

// ─── 系统提示词：GET / POST ─────────────────────────────────
app.get('/api/system-prompt', (_req, res) => {
  res.json({ prompt: systemPrompt });
});
app.post('/api/system-prompt', (req, res) => {
  systemPrompt = String(req.body?.prompt ?? '').slice(0, 4000);
  try {
    fs.writeFileSync(SYSTEM_PROMPT_FILE, systemPrompt, 'utf8');
  } catch (e) {
    console.error('[system-prompt] 写文件失败:', e.message);
  }
  console.log(`[system-prompt] 已更新并持久化，长度 ${systemPrompt.length}`);
  res.json({ ok: true, length: systemPrompt.length });
});

// ─── 插件 WebSocket 连接 ─────────────────────────────────────
let extensionWs = null;
const pending = new Map(); // id -> { resolve, reject, timer }
let newChatResolver = null; // 等待 new-chat 后页面重新 hello

wss.on('connection', (ws) => {
  console.log('[WS] 浏览器插件已连接');
  // 同一时刻只保留最新连接
  extensionWs = ws;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'hello') {
      console.log('[WS] 握手成功，插件就绪 ✓');
      // new-chat 导致页面重载后重连，通知等待方
      if (newChatResolver) {
        const cb = newChatResolver;
        newChatResolver = null;
        cb();
      }
      return;
    }

    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);

    if (msg.type === 'error') {
      entry.reject(new Error(msg.error ?? '插件返回未知错误'));
    } else if (msg.type === 'raw') {
      const backend = msg.backend || 'gemini';
      const text = parseResponse(msg.raw, backend);
      entry.resolve(text ?? '');
    }
  });

  ws.on('close', () => {
    console.log('[WS] 浏览器插件已断开');
    if (extensionWs === ws) extensionWs = null;
    // 拒绝所有等待中的请求
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('浏览器插件已断开连接'));
    }
    pending.clear();
    // 排空队列，避免客户端重试堆积
    drainQueue('浏览器插件已断开连接');
  });

  ws.on('error', () => {});
});

// 核心：发送消息，等待 Gemini 回复
// skipNewChat 默认 true（续写对话）；传 false 则先开新对话
async function doAsk(message, skipNewChat = true) {
  if (!extensionWs) throw Object.assign(new Error('浏览器插件未连接'), { status: 503 });

  // 1. 开新对话（清空 Gemini 上下文）
  if (!skipNewChat) {
    await new Promise((resolve) => {
      // 等待页面 reload 后重新 hello；最多等 8s，超时也继续
      const fallback = setTimeout(resolve, 8_000);
      newChatResolver = () => { clearTimeout(fallback); resolve(); };
      extensionWs.send(JSON.stringify({ type: 'new-chat' }));
    });
    // 额外缓冲，让 DOM 稳定
    await new Promise((r) => setTimeout(r, 800));
  }

  // 2. 发送消息，等待回复
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error('等待插件响应超时（120s）'), { status: 504 }));
    }, 120_000);
    pending.set(id, { resolve, reject, timer });
    extensionWs.send(JSON.stringify({ type: 'send', id, text: message }));
  });
}

// ─── POST /api/chat ─────────────────────────────────────────
// 双路模式：插件已连接 → 直接走 WS（无需 UI）；插件断开 → 降级走队列（需 UI + 自动转发）
app.post('/api/chat', async (req, res) => {
  const rawMessage = String(req.body?.message ?? '').trim();
  if (!rawMessage) return res.status(400).json({ error: '参数 message 不能为空' });
  const cleaned = sanitizeMessage(rawMessage);
  if (cleaned.length !== rawMessage.length) {
    console.log(`[/api/chat] 消息已清洗 ${rawMessage.length} → ${cleaned.length} 字符`);
  }
  const message = applySystemPrompt(cleaned);

  // ── 快路径：插件已连接，直接走 WebSocket ──
  if (extensionWs) {
    console.log('[/api/chat] 直接走 WebSocket 路径');
    const entry = { id: randomUUID(), ts: Date.now(), user: message, assistant: null, error: null };
    addHistory(entry);
    try {
      const text = await doAsk(message);
      entry.assistant = text;
      return res.json({ text });
    } catch (err) {
      entry.error = err.message;
      return res.status(err.status ?? 500).json({ error: err.message });
    }
  }

  // ── 降级路径：插件未连接，走队列（需 UI + 自动转发）──
  console.log('[/api/chat] 插件未连接，降级走队列');
  const enq = enqueueMessage(message);
  if (!enq.qid) return res.status(429).json({ error: enq.reason });
  const qid = enq.qid;
  console.log(`[/api/chat] 推入队列 qid=${qid}${enq.dedup ? ' (dedup)' : ''}`);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (res.closed || res.destroyed) return;
    const result = queueResults.get(qid);
    if (result) {
      if (result.error) { res.end(JSON.stringify({ error: result.error })); return; }
      res.end(JSON.stringify({ text: result.text }));
      return;
    }
  }
  const idx = forwardQueue.findIndex((i) => i.qid === qid);
  if (idx !== -1) forwardQueue.splice(idx, 1);
  res.end(JSON.stringify({ error: 'UI 转发超时（120s），请确保 UI 页面已打开且自动转发已启用' }));
});

// ─── POST /api/send  (UI 直接发送，绕开队列，走 WS 路径）────
app.post('/api/send', async (req, res) => {
  const rawMessage = String(req.body?.message ?? '').trim();
  if (!rawMessage) return res.status(400).json({ error: 'message 不能为空' });
  const message = sanitizeMessage(rawMessage);
  if (!extensionWs) return res.status(503).json({ error: '浏览器插件未连接' });

  const entry = { id: randomUUID(), ts: Date.now(), user: message, assistant: null, error: null };
  addHistory(entry);
  try {
    const text = await doAsk(message);
    entry.assistant = text;
    res.json({ id: entry.id, text });
  } catch (err) {
    entry.error = err.message;
    console.error('[/api/send]', err.message);
    res.status(err.status ?? 500).json({ id: entry.id, error: err.message });
  }
});

// ─── GET /api/history ───────────────────────────────────────
app.get('/api/history', (_req, res) => {
  res.json({ history });
});

// ─── GET /api/status ────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  if (extensionWs) {
    res.json({ status: 'ready' });
  } else {
    res.json({ status: 'no_extension' });
  }
});

// ─── POST /api/new-chat ─────────────────────────────────────
app.post('/api/new-chat', (req, res) => {
  if (!extensionWs) return res.status(503).json({ error: '插件未连接' });
  extensionWs.send(JSON.stringify({ type: 'new-chat' }));
  res.json({ ok: true });
});

// ─── POST /api/history/clear ────────────────────────────────
app.post('/api/history/clear', (_req, res) => {
  history.length = 0;
  res.json({ ok: true });
});

// ─── GET /v1/models  (让 app 能发现可用模型)─────────────────
app.get('/v1/models', (_req, res) => {
  const now = Math.floor(Date.now() / 1000);
  res.json({
    object: 'list',
    data: [
      { id: 'gemini', object: 'model', created: now, owned_by: 'google' },
      { id: 'gemini-pro', object: 'model', created: now, owned_by: 'google' },
      { id: 'gemini-2.5-pro', object: 'model', created: now, owned_by: 'google' },
    ],
  });
});

// ─── 工具：从 messages 数组提取纯文本内容 ───────────────────
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('\n');
  }
  return '';
}

// ─── 工具：把 messages 数组拼成带上下文的完整提示 ────────────
// system → 覆盖/补充持久化的系统提示词
// user/assistant 交替轮次 → 拼成对话格式
// ChatGPT 和 Gemini 使用相同逻辑
function buildPrompt(messages, backend = 'gemini') {
  // 1. 提取 system 消息（取最后一条，多数 app 只发一条）
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const inlineSystem = systemMsgs.map((m) => sanitizeMessage(extractText(m.content))).join('\n').trim();

  // 合并：先用 inline system，再叠加持久化的系统提示词
  const effectiveSystem = [
    inlineSystem,
    systemPrompt.trim(),
  ].filter(Boolean).join('\n\n');

  // 2. 对话轮次（去掉 system）
  const turns = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  // 只有一条 user 消息且没有 system → 直接发，不加冗余包裹
  if (turns.length === 1 && turns[0].role === 'user' && !effectiveSystem) {
    const sanitized = sanitizeMessage(extractText(turns[0].content));
    console.log(`[buildPrompt] ${backend} 单条用户消息，原始长度: ${extractText(turns[0].content).length}, 净化后: ${sanitized.length}`);
    return sanitized;
  }

  // 3. 拼成文本（带系统提示词和对话历史）
  const parts = [];
  if (effectiveSystem) {
    parts.push(`【系统指令】\n${effectiveSystem}`);
  }
  if (turns.length > 1) {
    // 多轮：拼出历史，最后一条是本次问题
    const history = turns.slice(0, -1);
    if (history.length) {
      const histText = history.map((m) => {
        const label = m.role === 'user' ? '用户' : 'AI';
        return `${label}：${sanitizeMessage(extractText(m.content).trim())}`;
      }).join('\n');
      parts.push(`【对话历史】\n${histText}`);
    }
  }
  const lastUser = [...turns].reverse().find((m) => m.role === 'user');
  const userText = sanitizeMessage(extractText(lastUser?.content ?? ''));
  parts.push(`【用户消息】\n${userText}`);

  const result = parts.join('\n\n');
  console.log(`[buildPrompt] ${backend} 多段格式，总长度: ${result.length} 字符`);
  return result;
}

// ─── POST /v1/chat/completions  (OpenAI 兼容) ──────────────
// 请求格式与 OpenAI Chat API 完全一致，可直接对接任何兼容客户端
app.post('/v1/chat/completions', async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: { message: 'messages 不能为空', type: 'invalid_request_error' } });
  }
  const hasUser = messages.some((m) => m.role === 'user');
  if (!hasUser) {
    return res.status(400).json({ error: { message: '找不到 user 消息', type: 'invalid_request_error' } });
  }

  const model = req.body?.model || 'gemini';
  const backend = model.toLowerCase().includes('chatgpt') ? 'chatgpt' : 'gemini';
  const message = buildPrompt(messages, backend);
  if (!message.trim()) {
    return res.status(400).json({ error: { message: 'user 消息内容为空', type: 'invalid_request_error' } });
  }
  console.log(`[/v1/chat/completions] 构建提示 ${message.length} 字符 (backend: ${backend})`);
  const wantStream = req.body?.stream === true;
  const createdSec = Math.floor(Date.now() / 1000);

  // ── 快路径：插件已连接，直接走 WebSocket ──
  if (extensionWs) {
    console.log(`[/v1/chat/completions] 直接走 WebSocket 路径 stream=${wantStream}`);
    const entry = { id: randomUUID(), ts: Date.now(), user: message, assistant: null, error: null };
    addHistory(entry);
    try {
      const text = await doAsk(message);
      entry.assistant = text;
      const rid = `chatcmpl-${entry.id}`;
      if (wantStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const chunkSize = 40;
        for (let i = 0; i < text.length; i += chunkSize) {
          res.write(`data: ${JSON.stringify({
            id: rid, object: 'chat.completion.chunk', created: createdSec, model,
            choices: [{ index: 0, delta: { content: text.slice(i, i + chunkSize) }, finish_reason: null }],
          })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({
          id: rid, object: 'chat.completion.chunk', created: createdSec, model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json({
          id: rid, object: 'chat.completion', created: createdSec, model,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: Math.ceil(message.length / 4),
            completion_tokens: Math.ceil(text.length / 4),
            total_tokens: Math.ceil((message.length + text.length) / 4),
          },
        });
      }
      return;
    } catch (err) {
      entry.error = err.message;
      return res.status(err.status ?? 500).json({ error: { message: err.message, type: 'server_error' } });
    }
  }

  // ── 降级路径：插件未连接，走队列（需 UI + 自动转发）──
  console.log('[/v1/chat/completions] 插件未连接，降级走队列');
  const enq = enqueueMessage(message);
  if (!enq.qid) {
    return res.status(429).json({ error: { message: enq.reason, type: 'rate_limit_error' } });
  }
  const qid = enq.qid;
  console.log(`[/v1/chat/completions] 推入队列 qid=${qid}${enq.dedup ? ' (dedup)' : ''} stream=${wantStream}`);

  if (wantStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Accel-Buffering', 'no');
  }
  res.flushHeaders();

  let tick = 0;
  const deadline = Date.now() + 300_000; // 5 分钟超时
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    tick++;
    // 客户端断连则弃等
    if (res.closed || res.destroyed) {
      const idx = forwardQueue.findIndex((i) => i.qid === qid);
      if (idx !== -1) forwardQueue.splice(idx, 1);
      return;
    }
    // streaming 每 15s 发一次 SSE keepalive，重置客户端 receiveTimeout 计时器
    if (wantStream && tick % 30 === 0) res.write(': ping\n\n');

    const result = queueResults.get(qid);
    if (!result) continue;

    const errBody = result.error
      ? JSON.stringify({ error: { message: result.error, type: 'server_error' } })
      : null;

    if (errBody) {
      if (wantStream) { res.write(`data: ${errBody}\n\n`); res.end(); }
      else res.end(errBody);
      return;
    }

    const text = result.text ?? '';
    if (wantStream) {
      // 伪流式：分块挂流（Gemini 只能一次性得到完整结果）
      const chunkSize = 40;
      for (let i = 0; i < text.length; i += chunkSize) {
        res.write(`data: ${JSON.stringify({
          id: `chatcmpl-${qid}`, object: 'chat.completion.chunk', created: createdSec, model,
          choices: [{ index: 0, delta: { content: text.slice(i, i + chunkSize) }, finish_reason: null }],
        })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-${qid}`, object: 'chat.completion.chunk', created: createdSec, model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.end(JSON.stringify({
        id: `chatcmpl-${qid}`, object: 'chat.completion', created: createdSec, model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: Math.ceil(message.length / 4),
          completion_tokens: Math.ceil(text.length / 4),
          total_tokens: Math.ceil((message.length + text.length) / 4),
        },
      }));
    }
    return;
  }

  // 超时
  const sidx = forwardQueue.findIndex((i) => i.qid === qid);
  if (sidx !== -1) forwardQueue.splice(sidx, 1);
  const errMsg = 'UI 转发超时（5 分钟），请确保 UI 已打开且自动转发已启用';
  const timeoutBody = JSON.stringify({ error: { message: errMsg, type: 'server_error' } });
  if (wantStream) { res.write(`data: ${timeoutBody}\n\n`); res.end(); }
  else res.end(timeoutBody);
});

// ─── 启动 ───────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  WebAI Bridge  →  http://localhost:${PORT}`);
  console.log(`  WebSocket     →  ws://localhost:${PORT}`);
  console.log(`  等待浏览器插件连接…`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

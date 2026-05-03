/**
 * content-isolated.js — Isolated world
 * 直接在此处持有 WebSocket，彻底绕开 Service Worker 生命周期限制。
 * Content script 只要标签页存在就不会被 Chrome 终止。
 */

'use strict';

const DEFAULT_SERVER = 'ws://localhost:3000';

let ws             = null;
let wsUrl          = DEFAULT_SERVER;
let wsStatus       = 'disconnected';
let reconnectTimer = null;

// ── 把延迟配置转发给 MAIN world ──────────────────────────
function pushDelayToMain(delayMin, delayMax) {
  document.dispatchEvent(new CustomEvent('gpb-update-delay', {
    detail: JSON.stringify({ delayMin, delayMax }),
  }));
}

// ── 初始化：从 storage 读取配置后连接 ──────────────────────
chrome.storage.sync.get(
  { serverUrl: DEFAULT_SERVER, delayMin: 500, delayMax: 1500 },
  (data) => {
    wsUrl = data.serverUrl || DEFAULT_SERVER;
    pushDelayToMain(data.delayMin, data.delayMax);
    connect();
  }
);

// 监听 popup 的延迟更新，转发给 MAIN world
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'update-delay') {
    pushDelayToMain(msg.delayMin, msg.delayMax);
  }
});

// ── WebSocket 连接 ────────────────────────────────────────────
function connect() {
  clearTimeout(reconnectTimer);
  const connectUrl = wsUrl;

  const oldWs = ws;
  ws = null;
  wsStatus = 'connecting';
  if (oldWs) { try { oldWs.close(); } catch (_) {} }

  const thisWs = new WebSocket(connectUrl);
  ws = thisWs;

  thisWs.onopen = () => {
    if (ws !== thisWs) return;
    wsStatus = 'connected';
    ws.send(JSON.stringify({ type: 'hello', client: 'extension' }));
    console.log('[GPB] WS connected to', connectUrl);
  };

  thisWs.onclose = () => {
    if (ws !== thisWs) return;
    wsStatus = 'disconnected';
    ws = null;
    console.log('[GPB] WS closed, retry in 3s');
    reconnectTimer = setTimeout(connect, 3000);
  };

  thisWs.onerror = () => {
    if (ws !== thisWs) return;
    wsStatus = 'disconnected';
  };

  thisWs.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (_) { return; }
    if (msg.type === 'pong') return;
    if (msg.type === 'send') {
      document.dispatchEvent(new CustomEvent('gpb-do-send', {
        detail: JSON.stringify({ id: msg.id, text: msg.text })
      }));
    } else if (msg.type === 'new-chat') {
      document.dispatchEvent(new CustomEvent('gpb-new-chat'));
    }
  };
}

// ── MAIN world → WS：转发拦截到的响应 ───────────────────────
document.addEventListener('gpb-stream-raw', (event) => {
  let detail;
  try { detail = JSON.parse(event.detail || '{}'); } catch (_) { return; }
  const { id, raw, backend } = detail;
  if (!id || !raw) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'raw', id, raw, backend }));
  }
});

document.addEventListener('gpb-error', (event) => {
  let detail;
  try { detail = JSON.parse(event.detail || '{}'); } catch (_) { return; }
  const { id, error } = detail;
  if (!id) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', id, error: error || 'unknown' }));
  }
});

// ── 处理来自 background / popup 的查询 ─────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'get-ws-status') {
    sendResponse({ status: wsStatus, url: wsUrl });
    return false;
  }
  if (msg.type === 'reconnect') {
    wsUrl = msg.url;
    connect();
    sendResponse({ ok: true });
    return false;
  }
});

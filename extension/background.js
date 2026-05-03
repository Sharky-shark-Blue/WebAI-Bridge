/**
 * background.js — MV3 Service Worker（极简路由）
 *
 * WebSocket 现在由 content-isolated.js（isolated world）直接持有，
 * SW 只负责一件事：将 popup 的查询转发给支持的平台标签页中的 content script。
 */

const DEFAULT_SERVER = 'ws://localhost:3000';

// 支持的平台 URL 模式
const SUPPORTED_PLATFORMS = [
  'https://gemini.google.com/*',
  'https://chatgpt.com/*',
  'https://chat.openai.com/*'
];

// ── 保持 SW 唤醒的 onConnect（content 脚本可选接）──────────
chrome.runtime.onConnect.addListener((_port) => {
  // 有连接进来即可延迟 SW 终止，no-op 即可
});

// ── 消息路由 ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // popup 查状态 → 转发给任意支持平台 tab 的 content-isolated.js
  if (msg.type === 'get-status') {
    chrome.tabs.query({ url: SUPPORTED_PLATFORMS }, (tabs) => {
      if (!tabs.length) {
        sendResponse({ status: 'no_platform_tab', url: DEFAULT_SERVER });
        return;
      }
      // 尝试第一个标签页
      chrome.tabs.sendMessage(tabs[0].id, { type: 'get-ws-status' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
          sendResponse({ status: 'disconnected', url: DEFAULT_SERVER });
          return;
        }
        sendResponse(resp);
      });
    });
    return true; // 异步 sendResponse
  }

  // popup 保存新 URL → 写 storage + 通知所有支持平台的 tab 重连
  if (msg.type === 'reconnect') {
    const newUrl = msg.url || DEFAULT_SERVER;
    chrome.storage.sync.set({ serverUrl: newUrl }, () => {
      chrome.tabs.query({ url: SUPPORTED_PLATFORMS }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'reconnect', url: newUrl })
            .catch(() => {});
        });
      });
      sendResponse({ ok: true });
    });
    return true;
  }
});




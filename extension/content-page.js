/**
 * content-page.js  —  MAIN world (Bundled version without ES6 modules)
 * Multi-backend adapter-aware content script.
 * Supports Gemini, ChatGPT, and future platforms through adapter pattern.
 */

(function () {
  'use strict';

  if (window.__gpbPageInstalled) return;
  window.__gpbPageInstalled = true;

  // ═══════════════════════════════════════════════════════════════
  // Shared Utilities (from shared-utils.js)
  // ═══════════════════════════════════════════════════════════════

  // Concurrency Lock
  let sendLock = false;
  const sendQueue = [];

  function acquireLock(id, text) {
    return new Promise((resolve, reject) => {
      if (!sendLock) {
        sendLock = true;
        resolve();
      } else {
        console.log(`[GPB] id=${id} 排队等待锁，当前队列长度=${sendQueue.length}`);
        sendQueue.push({ id, text, resolve, reject });
      }
    });
  }

  function releaseLock() {
    if (sendQueue.length > 0) {
      const next = sendQueue.shift();
      console.log(`[GPB] 释放锁，下一个任务 id=${next.id}`);
      next.resolve();
    } else {
      sendLock = false;
    }
  }

  // Random Delay
  let delayMin = 500;
  let delayMax = 1500;

  function setDelayRange(min, max) {
    delayMin = Math.max(0, min);
    delayMax = Math.max(delayMin, max);
  }

  function randomDelay() {
    const mn = Math.max(0, delayMin);
    const mx = Math.max(mn, delayMax);
    if (mx === 0) return Promise.resolve();
    const ms = mn + Math.random() * (mx - mn);
    return new Promise(r => setTimeout(r, ms));
  }

  // Quill Helper
  function findQuill(el) {
    let node = el;
    for (let i = 0; i < 6; i++) {
      if (node && node.__quill && typeof node.__quill.setText === 'function') {
        return node.__quill;
      }
      node = node?.parentElement;
    }
    return null;
  }

  // Sleep Utility
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════════
  // Gemini Adapter (from adapters/gemini.js)
  // ═══════════════════════════════════════════════════════════════

  const geminiAdapter = {
    name: 'gemini',
    displayName: 'Gemini',

    canHandle(url) {
      return url.toLowerCase().includes('gemini.google.com');
    },

    getResponseUrl(url) {
      const urlLower = url.toLowerCase();
      return urlLower.includes('bardfrontendservice') && urlLower.includes('streamgenerate');
    },

    domConfig: {
      editorSelectors: [
        'div.ql-editor[role="textbox"][aria-label="为 Gemini 输入提示"]',
        'div.ql-editor[role="textbox"][aria-label*="Gemini"]',
        "div.ql-editor.textarea.new-input-ui[contenteditable='true']",
        "div.ql-editor[contenteditable='true'][role='textbox']",
        "div.ql-editor[contenteditable='true']",
      ],

      sendButtonSelectors: [
        'button.send-button[aria-label="发送"]',
        'button.send-button[aria-label="Send message"]',
        'button.send-button[aria-label*="Send"]',
        'button.send-button.submit',
        '.send-button-container button.send-button',
        'button.send-button',
        'button[aria-label="发送"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="send" i]',
        'button[data-test-id="send-button"]',
        'button[jsname][aria-label*="Send" i]',
      ],

      newChatSelectors: [
        'a[href="/app"]',
        'a[href*="/new"]',
        'button[aria-label*="新建对话"]',
        'button[aria-label*="New chat"]',
      ],

      async injectText(text, el) {
        el.focus();
        let injected = false;

        function fireInputEvents() {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Level 0: Quill API (优先使用，最稳定)
        try {
          const quill = findQuill(el);
          if (quill && typeof quill.setText === 'function') {
            quill.setText('', 'user'); // 先清空
            await sleep(50);
            quill.setText(text, 'user');
            quill.setSelection(text.length, 0, 'user');
            fireInputEvents();
            await sleep(200);
            if (el.textContent.trim()) {
              console.log('[Gemini] ✓ Level-0: Quill.setText 成功');
              injected = true;
            }
          }
        } catch (err) {
          console.warn('[Gemini] Level-0 failed:', err.message);
        }

        // Level 1: innerHTML (简单直接，避免 execCommand)
        if (!injected) {
          try {
            el.focus();
            const escaped = text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '</p><p>');
            el.innerHTML = `<p>${escaped}</p>`;

            // 尝试更新 Quill
            try {
              const quill = findQuill(el);
              if (quill && typeof quill.update === 'function') {
                quill.update('user');
              }
            } catch (_) {}

            fireInputEvents();
            await sleep(250);
            if (el.textContent.trim()) {
              console.log('[Gemini] ✓ Level-1: innerHTML 成功');
              injected = true;
            }
          } catch (err) {
            console.warn('[Gemini] Level-1 failed:', err.message);
          }
        }

        // Level 2: ClipboardEvent (备用方案)
        if (!injected) {
          try {
            el.focus();
            // 不使用 selectAll/delete，直接清空
            el.textContent = '';
            await sleep(50);

            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            el.dispatchEvent(new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            }));
            fireInputEvents();
            await sleep(250);
            if (el.textContent.trim()) {
              console.log('[Gemini] ✓ Level-2: ClipboardEvent 成功');
              injected = true;
            }
          } catch (err) {
            console.warn('[Gemini] Level-2 failed:', err.message);
          }
        }

        // Level 3: 最后的 fallback
        if (!injected) {
          try {
            el.focus();
            el.textContent = text;
            fireInputEvents();
            await sleep(200);
            console.log('[Gemini] Level-3: textContent fallback');
          } catch (err) {
            console.warn('[Gemini] Level-3 failed:', err.message);
          }
        }

        return el.textContent.trim().length > 0;
      },

      async clickSend(button) {
        await randomDelay();
        button.click();
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // ChatGPT Adapter (from adapters/chatgpt.js)
  // ═══════════════════════════════════════════════════════════════

  const chatgptAdapter = {
    name: 'chatgpt',
    displayName: 'ChatGPT',

    canHandle(url) {
      const urlLower = url.toLowerCase();
      return urlLower.includes('chatgpt.com') || urlLower.includes('chat.openai.com');
    },

    getResponseUrl(url) {
      const urlLower = url.toLowerCase();
      return /(chatgpt\.com|chat\.openai\.com)\/backend-api\/(?:f\/)?conversation\b/.test(urlLower);
    },

    domConfig: {
      editorSelectors: [
        '#prompt-textarea',
        'div#prompt-textarea[contenteditable="true"]',
        'div[contenteditable="true"][id="prompt-textarea"]',
      ],

      sendButtonSelectors: [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]',
        'button[aria-label="发送"]',
        'button[aria-label="Send message"]',
      ],

      newChatSelectors: [
        'a[href*="/new"]',
        'button[aria-label*="New chat"]',
        'button[aria-label*="新建对话"]',
      ],

      async injectText(text, el) {
        el.focus();

        // Clear existing content first
        el.textContent = '';
        await sleep(50);

        // Set new content
        el.textContent = text;

        // Trigger proper InputEvent for React
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        });
        el.dispatchEvent(inputEvent);

        // Additional events to ensure React picks up the change
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));

        await sleep(300);
        return el.textContent.trim().length > 0;
      },

      async clickSend(button) {
        await randomDelay();
        button.click();
      },

      // ChatGPT-specific: Extract response from DOM instead of API
      async captureResponse(initialMessageCount) {
        console.log(`[GPB] ChatGPT: Waiting for NEW response (initial count: ${initialMessageCount})...`);

        // Wait for the response to appear in DOM (max 120s)
        const startTime = Date.now();
        const timeout = 120000;

        // ChatGPT message selectors (container)
        const messageSelectors = [
          'div[data-message-author-role="assistant"]',
          'div.agent-turn',
          'article[data-testid*="conversation-turn"]',
          '[class*="group"][class*="agent"]'
        ];

        // Placeholder texts to ignore (thinking indicators)
        const placeholders = ['正在思考', 'Thinking', 'thinking', '...', '思考中'];

        let lastSeenLength = 0;
        let stableCount = 0;

        // Wait for a NEW message to appear (count increases)
        while (Date.now() - startTime < timeout) {
          let currentMessages = null;
          let usedSelector = '';

          for (const selector of messageSelectors) {
            const messages = document.querySelectorAll(selector);
            if (messages.length > 0) {
              currentMessages = messages;
              usedSelector = selector;
              break;
            }
          }

          if (currentMessages && currentMessages.length > initialMessageCount) {
            // New message appeared! Get the last one
            const lastMessage = currentMessages[currentMessages.length - 1];

            // Extract ALL text content from the message (including nested elements)
            let textContent = '';

            // Try multiple extraction methods
            const methods = [
              () => {
                // Method 1: Find all text nodes recursively
                const walker = document.createTreeWalker(
                  lastMessage,
                  NodeFilter.SHOW_TEXT,
                  {
                    acceptNode: (node) => {
                      // Skip script/style tags
                      const parent = node.parentElement;
                      if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                        return NodeFilter.FILTER_REJECT;
                      }
                      // Skip buttons and controls
                      if (parent && (parent.tagName === 'BUTTON' || parent.hasAttribute('role') && parent.getAttribute('role') === 'button')) {
                        return NodeFilter.FILTER_REJECT;
                      }
                      return NodeFilter.FILTER_ACCEPT;
                    }
                  }
                );
                const texts = [];
                let node;
                while (node = walker.nextNode()) {
                  const text = node.textContent.trim();
                  if (text) texts.push(text);
                }
                return texts.join(' ');
              },
              () => lastMessage.innerText,
              () => lastMessage.textContent
            ];

            for (const method of methods) {
              try {
                const result = method();
                if (result && result.trim().length > textContent.length) {
                  textContent = result.trim();
                }
              } catch (e) {
                console.log(`[GPB] ChatGPT: Extraction method failed: ${e.message}`);
              }
            }

            // Skip if content is just a placeholder
            const isPlaceholder = placeholders.some(p => textContent === p || textContent.startsWith(p));
            if (isPlaceholder) {
              console.log(`[GPB] ChatGPT: Skipping placeholder: "${textContent}"`);
              await sleep(500);
              continue;
            }

            if (textContent.length > 0) {
              console.log(`[GPB] ChatGPT: Found content, length: ${textContent.length} chars (selector: ${usedSelector})`);

              // Check if content is stable (not growing anymore)
              if (textContent.length === lastSeenLength) {
                stableCount++;
                console.log(`[GPB] ChatGPT: Content stable for ${stableCount} checks`);

                // Wait for 3 consecutive stable checks (1.5 seconds)
                if (stableCount >= 3) {
                  console.log(`[GPB] ChatGPT: Response complete, final length: ${textContent.length} chars`);
                  console.log(`[GPB] ChatGPT: Response preview: "${textContent.substring(0, 100)}..."`);

                  // Format as SSE-like response for parser compatibility
                  const formattedResponse = `data: ${JSON.stringify({
                    choices: [{
                      message: {
                        role: 'assistant',
                        content: textContent
                      }
                    }]
                  })}\n\ndata: [DONE]\n\n`;

                  return formattedResponse;
                }
              } else {
                // Content is still growing
                lastSeenLength = textContent.length;
                stableCount = 0;
                console.log(`[GPB] ChatGPT: Content growing... ${textContent.length} chars`);
              }
            }
          }

          // Wait 500ms before checking again
          await sleep(500);
        }

        throw new Error('ChatGPT response timeout (120s) - no NEW message appeared');
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Adapter Registry (from adapters/registry.js)
  // ═══════════════════════════════════════════════════════════════

  const adapters = [geminiAdapter, chatgptAdapter];

  function detectAdapter(url) {
    return adapters.find(a => a.canHandle(url)) || null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Main Content Script Logic
  // ═══════════════════════════════════════════════════════════════

  const EV_DO_SEND = 'gpb-do-send';
  const EV_NEW_CHAT = 'gpb-new-chat';
  const EV_STREAM = 'gpb-stream-raw';
  const EV_ERROR = 'gpb-error';

  let currentAdapter = null;
  let pendingResolve = null;

  // Detect platform on page load
  function detectPlatform() {
    currentAdapter = detectAdapter(window.location.href);
    if (!currentAdapter) {
      console.log('[GPB] No adapter for this page');
      return;
    }
    console.log(`[GPB] Detected platform: ${currentAdapter.displayName}`);
  }

  // Update delay settings from isolated world
  document.addEventListener('gpb-update-delay', (e) => {
    try {
      const d = JSON.parse(e.detail ?? '{}');
      if (Number.isFinite(d.delayMin) && Number.isFinite(d.delayMax)) {
        setDelayRange(d.delayMin, d.delayMax);
      }
    } catch {}
  });

  // Response accumulator for ChatGPT (handles multiple API calls)
  let responseAccumulator = [];
  let accumulatorTimer = null;

  // Unified fetch interceptor
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const resp = await _origFetch(...args);

    if (!currentAdapter) return resp;

    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? String(args[0] ?? ''));

    if (currentAdapter.getResponseUrl(url)) {
      console.log(`[GPB] ✓ Intercepted ${currentAdapter.displayName} response URL`);
      const clone = resp.clone();
      clone.text().then((text) => {
        console.log(`[GPB] Response text length: ${text.length} chars`);
        if (pendingResolve) {
          // Accumulate responses (ChatGPT makes multiple API calls)
          responseAccumulator.push(text);
          console.log(`[GPB] Accumulated response #${responseAccumulator.length}`);

          // Clear existing timer
          if (accumulatorTimer) {
            clearTimeout(accumulatorTimer);
          }

          // Wait 2 seconds for more responses, then resolve with the best one
          accumulatorTimer = setTimeout(() => {
            console.log(`[GPB] Processing ${responseAccumulator.length} accumulated responses`);

            // Find the response with actual content (not just conduit_token)
            let bestResponse = null;
            let maxLength = 0;

            for (const resp of responseAccumulator) {
              // Skip conduit_token responses (they contain "conduit_token" but no message content)
              if (resp.includes('conduit_token') && !resp.includes('"message"')) {
                console.log(`[GPB] Skipping conduit_token response (${resp.length} chars)`);
                continue;
              }

              // Prefer longer responses (likely contain actual message)
              if (resp.length > maxLength) {
                maxLength = resp.length;
                bestResponse = resp;
              }
            }

            // Fallback to longest response if no message found
            if (!bestResponse && responseAccumulator.length > 0) {
              bestResponse = responseAccumulator.reduce((a, b) => a.length > b.length ? a : b);
              console.log(`[GPB] No message response found, using longest (${bestResponse.length} chars)`);
            }

            if (bestResponse) {
              console.log(`[GPB] ✓ Calling pendingResolve with best response (${bestResponse.length} chars)`);
              const cb = pendingResolve;
              pendingResolve = null;
              responseAccumulator = [];
              cb(bestResponse);
            } else {
              console.error(`[GPB] ✗ No valid response found in accumulator`);
            }
          }, 2000);
        } else {
          console.warn(`[GPB] ⚠ No pendingResolve callback set!`);
        }
      }).catch((err) => {
        console.error(`[GPB] ✗ Failed to read response text:`, err);
      });
    }

    return resp;
  };

  // XHR interceptor fallback
  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (currentAdapter && typeof url === 'string' && currentAdapter.getResponseUrl(url)) {
      console.log(`[GPB] ✓ XHR intercepted ${currentAdapter.displayName} response URL`);
      this.__gpbStream = true;
    }
    return _xhrOpen.apply(this, arguments);
  };

  const _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__gpbStream) {
      const xhr = this;
      xhr.addEventListener('loadend', function () {
        console.log(`[GPB] XHR loadend, status: ${xhr.status}, responseText length: ${xhr.responseText?.length || 0}`);
        if (pendingResolve) {
          console.log(`[GPB] ✓ Calling pendingResolve with XHR response`);
          const cb = pendingResolve;
          pendingResolve = null;
          cb(xhr.responseText);
        } else {
          console.warn(`[GPB] ⚠ No pendingResolve callback set for XHR!`);
        }
      }, { once: true });
    }
    return _xhrSend.apply(this, arguments);
  };

  // Wait for element helper
  async function waitForEl(sels, ms = 20000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      await sleep(350);
    }
    throw new Error(`Element not found: ${sels[0]}`);
  }

  // DOM automation flow
  async function domAutomationFlow(adapter, text) {
    const el = await waitForEl(adapter.domConfig.editorSelectors);

    // Inject text
    const injected = await adapter.domConfig.injectText(text, el);
    if (!injected) {
      throw new Error('Text injection failed');
    }

    // Wait for send button to be enabled
    let button = null;
    for (let i = 0; i < 75; i++) {
      for (const s of adapter.domConfig.sendButtonSelectors) {
        const btn = document.querySelector(s);
        if (btn && !btn.disabled && !btn.hasAttribute('disabled')) {
          button = btn;
          break;
        }
      }
      if (button) break;

      // Re-trigger input events every 2 seconds
      if (i > 0 && i % 10 === 0) {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }

      await sleep(200);
    }

    if (!button) {
      throw new Error('Send button not enabled (15s timeout)');
    }

    // Set up response capture before clicking
    const responsePromise = new Promise((resolve, reject) => {
      console.log(`[GPB] Setting up response capture for ${adapter.displayName}`);
      const timer = setTimeout(() => {
        console.error(`[GPB] ✗ Response timeout (120s) for ${adapter.displayName}`);
        pendingResolve = null;
        reject(new Error('Response timeout (120s)'));
      }, 120000);

      pendingResolve = (raw) => {
        console.log(`[GPB] ✓ Response received, length: ${raw?.length || 0} chars`);
        clearTimeout(timer);
        resolve(raw);
      };
    });

    // For ChatGPT: Count existing messages before sending
    let initialMessageCount = 0;
    if (adapter.domConfig.captureResponse) {
      const messageSelectors = [
        'div[data-message-author-role="assistant"]',
        'div.agent-turn',
        'article[data-testid*="conversation-turn"]'
      ];
      for (const selector of messageSelectors) {
        const messages = document.querySelectorAll(selector);
        if (messages.length > 0) {
          initialMessageCount = messages.length;
          console.log(`[GPB] Current message count: ${initialMessageCount}`);
          break;
        }
      }
    }

    // Click send button
    console.log(`[GPB] Clicking send button for ${adapter.displayName}`);
    await adapter.domConfig.clickSend(button);

    // Wait for response
    console.log(`[GPB] Waiting for response from ${adapter.displayName}...`);

    // ChatGPT uses DOM-based capture, others use API interception
    if (adapter.domConfig.captureResponse) {
      console.log(`[GPB] Using DOM-based response capture for ${adapter.displayName}`);

      // Clear accumulator timer to prevent race condition
      if (accumulatorTimer) {
        clearTimeout(accumulatorTimer);
        accumulatorTimer = null;
        console.log(`[GPB] Cleared accumulator timer for DOM capture`);
      }

      const domResponse = await adapter.domConfig.captureResponse(initialMessageCount);
      pendingResolve = null; // Clear the API interceptor callback
      responseAccumulator = []; // Clear accumulator array
      return domResponse;
    } else {
      // Use API interception (for Gemini)
      return await responsePromise;
    }
  }

  // Send message handler
  document.addEventListener(EV_DO_SEND, async (e) => {
    const { id, text } = JSON.parse(e.detail ?? '{}');

    if (!currentAdapter) {
      document.dispatchEvent(new CustomEvent(EV_ERROR, {
        detail: JSON.stringify({ id, error: 'No adapter for current page' })
      }));
      return;
    }

    await acquireLock(id, text);
    console.log(`[GPB] id=${id} acquired lock, platform=${currentAdapter.displayName}`);

    try {
      let rawResponse;

      if (currentAdapter.domConfig) {
        rawResponse = await domAutomationFlow(currentAdapter, text);
      } else {
        throw new Error('Adapter has no domConfig');
      }

      document.dispatchEvent(new CustomEvent(EV_STREAM, {
        detail: JSON.stringify({
          id,
          raw: rawResponse,
          backend: currentAdapter.name
        })
      }));
    } catch (err) {
      document.dispatchEvent(new CustomEvent(EV_ERROR, {
        detail: JSON.stringify({ id, error: err.message })
      }));
    } finally {
      releaseLock();
      console.log(`[GPB] id=${id} released lock`);
    }
  });

  // New chat handler
  document.addEventListener(EV_NEW_CHAT, () => {
    if (!currentAdapter || !currentAdapter.domConfig) return;

    for (const s of currentAdapter.domConfig.newChatSelectors) {
      const el = document.querySelector(s);
      if (el) {
        el.click();
        return;
      }
    }

    // Fallback: navigate to base URL
    if (currentAdapter.name === 'gemini') {
      window.location.href = 'https://gemini.google.com/app';
    } else if (currentAdapter.name === 'chatgpt') {
      window.location.href = 'https://chatgpt.com/';
    }
  });

  detectPlatform();
})();

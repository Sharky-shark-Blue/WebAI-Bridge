/**
 * gemini.js
 * Gemini adapter for DOM automation and response interception.
 */

import { randomDelay, findQuill, sleep } from './shared-utils.js';

const EDITOR_SEL = [
  'div.ql-editor[role="textbox"][aria-label="为 Gemini 输入提示"]',
  'div.ql-editor[role="textbox"][aria-label*="Gemini"]',
  "div.ql-editor.textarea.new-input-ui[contenteditable='true']",
  "div.ql-editor[contenteditable='true'][role='textbox']",
  "div.ql-editor[contenteditable='true']",
];

const SEND_SEL = [
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
];

const NEW_CHAT_SEL = [
  'a[href="/app"]',
  'a[href*="/new"]',
  'button[aria-label*="新建对话"]',
  'button[aria-label*="New chat"]',
];

export default {
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
    editorSelectors: EDITOR_SEL,
    sendButtonSelectors: SEND_SEL,
    newChatSelectors: NEW_CHAT_SEL,

    async injectText(text, el) {
      el.focus();
      let injected = false;

      function placeCaretInside() {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      function fireInputEvents() {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', keyCode: 65 }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'a', keyCode: 65 }));
      }

      // Level 0: execCommand insertText
      try {
        el.focus();
        placeCaretInside();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        fireInputEvents();
        await sleep(250);
        if (el.textContent.trim()) {
          console.log('[Gemini] ✓ Level-0: execCommand insertText 成功');
          injected = true;
        }
      } catch (err) {
        console.warn('[Gemini] Level-0 failed:', err.message);
      }

      // Level 1: ClipboardEvent paste
      if (!injected) {
        try {
          el.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          dt.setData('text/html', `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`);
          el.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }));
          fireInputEvents();
          await sleep(300);
          if (el.textContent.trim()) {
            console.log('[Gemini] ✓ Level-1: ClipboardEvent 成功');
            injected = true;
          }
        } catch (err) {
          console.warn('[Gemini] Level-1 failed:', err.message);
        }
      }

      // Level 2: Quill API
      if (!injected) {
        try {
          const quill = findQuill(el);
          if (quill) {
            quill.setText(text, 'user');
            quill.setSelection(text.length, 0, 'user');
            fireInputEvents();
            await sleep(250);
            if (el.textContent.trim()) {
              console.log('[Gemini] ✓ Level-2: Quill.setText 成功');
              injected = true;
            }
          }
        } catch (err) {
          console.warn('[Gemini] Level-2 failed:', err.message);
        }
      }

      // Level 3: innerHTML fallback
      if (!injected) {
        const escaped = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '</p><p>');
        el.innerHTML = `<p>${escaped}</p>`;
        try {
          const quill = findQuill(el);
          if (quill && typeof quill.update === 'function') quill.update('user');
        } catch (_) {}
        fireInputEvents();
        await sleep(300);
        console.log('[Gemini] Level-3: innerHTML fallback');
      }

      return el.textContent.trim().length > 0;
    },

    async clickSend(button) {
      await randomDelay();
      button.click();
    }
  }
};

/**
 * chatgpt.js
 * ChatGPT adapter for DOM automation and response interception.
 */

import { randomDelay, sleep } from './shared-utils.js';

const EDITOR_SEL = [
  '#prompt-textarea',
  'div#prompt-textarea[contenteditable="true"]',
  'div[contenteditable="true"][id="prompt-textarea"]',
];

const SEND_SEL = [
  'button[data-testid="send-button"]',
  'button[aria-label*="Send"]',
  'button[aria-label="发送"]',
  'button[aria-label="Send message"]',
];

const NEW_CHAT_SEL = [
  'a[href*="/new"]',
  'button[aria-label*="New chat"]',
  'button[aria-label*="新建对话"]',
];

export default {
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
    editorSelectors: EDITOR_SEL,
    sendButtonSelectors: SEND_SEL,
    newChatSelectors: NEW_CHAT_SEL,

    async injectText(text, el) {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(200);
      return el.textContent.trim().length > 0;
    },

    async clickSend(button) {
      await randomDelay();
      button.click();
    },

    // ChatGPT-specific: Extract response from DOM instead of API
    async captureResponse() {
      console.log('[GPB] ChatGPT: Waiting for response in DOM...');

      // Wait for the response to appear in DOM (max 120s)
      const startTime = Date.now();
      const timeout = 120000;

      // Find the last assistant message in the conversation
      while (Date.now() - startTime < timeout) {
        // ChatGPT message selectors
        const messageSelectors = [
          'div[data-message-author-role="assistant"]',
          'div.agent-turn',
          'article[data-testid*="conversation-turn"]'
        ];

        let lastMessage = null;
        for (const selector of messageSelectors) {
          const messages = document.querySelectorAll(selector);
          if (messages.length > 0) {
            lastMessage = messages[messages.length - 1];
            break;
          }
        }

        if (lastMessage) {
          // Check if message is complete (no "thinking" indicator)
          const isThinking = lastMessage.querySelector('[class*="thinking"]') ||
                            lastMessage.querySelector('[class*="loading"]') ||
                            lastMessage.textContent.includes('...');

          if (!isThinking) {
            // Extract text content
            const textContent = lastMessage.textContent || lastMessage.innerText || '';

            if (textContent.trim().length > 0) {
              console.log(`[GPB] ChatGPT: Found response in DOM, length: ${textContent.length} chars`);

              // Format as SSE-like response for parser compatibility
              const formattedResponse = `data: ${JSON.stringify({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: textContent.trim()
                  }
                }]
              })}\n\ndata: [DONE]\n\n`;

              return formattedResponse;
            }
          }
        }

        // Wait 500ms before checking again
        await sleep(500);
      }

      throw new Error('ChatGPT response timeout (120s) - no message found in DOM');
    }
  }
};

/**
 * registry.js
 * Parser registry for routing responses to appropriate parser based on backend type.
 */

import { parseGeminiResponse } from './gemini.js';
import { parseChatGptResponse } from './chatgpt.js';

/**
 * Parse response based on backend type.
 *
 * @param {string} responseText  原始响应体
 * @param {string} backend       后端类型: 'gemini' | 'chatgpt'
 * @returns {string|null}        提取到的纯文本，失败返回 null
 */
export function parseResponse(responseText, backend = 'gemini') {
  switch (backend) {
    case 'gemini':
      return parseGeminiResponse(responseText);
    case 'chatgpt':
      return parseChatGptResponse(responseText);
    default:
      console.warn(`[parser] Unknown backend: ${backend}, defaulting to gemini`);
      return parseGeminiResponse(responseText);
  }
}

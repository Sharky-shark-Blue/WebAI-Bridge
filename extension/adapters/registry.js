/**
 * registry.js
 * Adapter registry for platform detection and routing.
 */

import geminiAdapter from './gemini.js';
import chatgptAdapter from './chatgpt.js';

const adapters = [geminiAdapter, chatgptAdapter];

export function detectAdapter(url) {
  return adapters.find(a => a.canHandle(url)) || null;
}

export function getAllAdapters() {
  return adapters;
}

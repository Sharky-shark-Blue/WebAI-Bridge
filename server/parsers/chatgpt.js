export function parseChatGptResponse(responseText) {
  const text = String(responseText ?? '');
  if (!text) {
    console.log('[ChatGPT Parser] Empty response text');
    return null;
  }

  console.log(`[ChatGPT Parser] Parsing response, length: ${text.length} chars`);

  const lines = text.split('\n');
  const parts = [];
  let fullText = '';
  let matched = false;

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;

    const data = line.slice(6).trim();
    if (data === '[DONE]') break;
    if (!data) continue;

    try {
      const json = JSON.parse(data);

      // Primary format: message.content.parts (ChatGPT web format)
      const message = json?.message || json?.output?.message || json?.v?.message || json?.data?.message;
      if (message?.author?.role === 'assistant') {
        const contentParts = message?.content?.parts;
        if (Array.isArray(contentParts)) {
          // Merge all text parts
          const textContent = contentParts
            .filter(part => typeof part === 'string')
            .join('');
          if (textContent) {
            parts[0] = textContent;
            fullText = textContent;
            matched = true;
            console.log(`[ChatGPT Parser] ✓ Found content in message.content.parts: ${textContent.substring(0, 50)}...`);
          }
        }
      }

      // Handle patch operations for incremental updates
      if (json?.v?.message?.content?.parts) {
        const patchParts = json.v.message.content.parts;
        if (Array.isArray(patchParts)) {
          patchParts.forEach((part, index) => {
            if (typeof part === 'string') {
              parts[index] = part;
              matched = true;
            }
          });
        }
      }

      // Fallback: OpenAI API format (for compatibility)
      const delta = json?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        matched = true;
        continue;
      }

      const messageContent = json?.choices?.[0]?.message?.content;
      if (messageContent) {
        fullText = messageContent;
        matched = true;
        console.log(`[ChatGPT Parser] ✓ Found content in choices[0].message.content: ${messageContent.substring(0, 50)}...`);
      }
    } catch (err) {
      // Ignore malformed JSON chunks
      continue;
    }
  }

  // Prefer structured parts over accumulated fullText
  const structuredText = parts.filter(p => typeof p === 'string').join('');
  const result = structuredText || fullText;

  if (result) {
    console.log(`[ChatGPT Parser] ✓ Successfully parsed, result length: ${result.length} chars`);
  } else {
    console.warn(`[ChatGPT Parser] ⚠ No content found in response`);
    console.warn(`[ChatGPT Parser] First 500 chars of raw response:`, text.substring(0, 500));
  }

  return result || null;
}

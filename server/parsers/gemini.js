function stripAntiHijackPrefix(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  return normalized.startsWith(")]}'") ? normalized.slice(4) : normalized;
}

/**
 * 计算从 startIndex 开始，恰好占用 utf16Units 个 UTF-16 单元所需的字符数。
 * 处理 BMP 外字符（代理对，占 2 个 UTF-16 单元）。
 */
function getCharCountForUtf16Units(source, startIndex, utf16Units) {
  let count = 0;
  let units = 0;

  while (units < utf16Units && startIndex + count < source.length) {
    const codePoint = source.codePointAt(startIndex + count);
    if (codePoint == null) break;
    const unitSize = codePoint > 0xffff ? 2 : 1;
    if (units + unitSize > utf16Units) break;
    units += unitSize;
    count += codePoint > 0xffff ? 2 : 1;
  }

  return { count, units };
}

/**
 * 解析 Gemini 分帧格式：
 *   <N>\n<JSON 数据（N 个 UTF-16 单元，含头部的 \n）>
 */
function parseFramedEntries(responseText) {
  const content = stripAntiHijackPrefix(responseText).replace(/^\s+/, '');
  const entries = [];
  let offset = 0;

  while (offset < content.length) {
    // 跳过空白
    while (offset < content.length && /\s/.test(content[offset])) offset += 1;
    if (offset >= content.length) break;

    const match = /^(\d+)\n/.exec(content.slice(offset));
    if (!match) break;

    const frameUnits = Number(match[1] || 0);
    if (!Number.isFinite(frameUnits) || frameUnits <= 0) break;

    // frameStart 指向 \n 字符，length 包含该 \n
    const frameStart = offset + match[1].length;
    const frameSize = getCharCountForUtf16Units(content, frameStart, frameUnits);
    if (frameSize.units < frameUnits) break;

    const frameEnd = frameStart + frameSize.count;
    const chunk = content.slice(frameStart, frameEnd).trim();
    offset = frameEnd;

    if (!chunk) continue;

    try {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) {
        entries.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        entries.push(parsed);
      }
    } catch {
      // 忽略格式损坏的帧
    }
  }

  return entries;
}

function readStringParts(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => readStringParts(item));
  }

  const parts = [];
  for (const key of ['text', 'content', 'message', 'value']) {
    if (typeof value[key] === 'string') parts.push(value[key]);
  }
  for (const key of ['parts', 'content', 'items', 'children', 'message']) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      parts.push(...readStringParts(candidate));
    } else if (candidate && typeof candidate === 'object') {
      parts.push(...readStringParts(candidate));
    }
  }
  return parts;
}

/**
 * 从 Gemini candidate 数组中提取文本。
 * 路径：candidate[1][0]（字符串）或 readStringParts(candidate[1])
 */
function readGeminiCandidateText(candidate) {
  if (!Array.isArray(candidate)) return '';

  const primaryNode = candidate[1];
  if (Array.isArray(primaryNode) && typeof primaryNode[0] === 'string') {
    return primaryNode[0];
  }
  if (typeof primaryNode === 'string') return primaryNode;

  return readStringParts(primaryNode).join('');
}

/**
 * 从单条 wrb.fr 条目中提取 payload 文本。
 * 路径：entry[2] → JSON.parse → payload[4][0] → readGeminiCandidateText
 */
function extractPayloadEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 3) return null;
  if (typeof entry[2] !== 'string') return null;

  try {
    const payload = JSON.parse(entry[2]);
    const firstCandidate = payload?.[4]?.[0];
    if (!Array.isArray(firstCandidate)) return null;

    const text = readGeminiCandidateText(firstCandidate);
    if (!text) return null;

    return { text };
  } catch {
    return null;
  }
}

/**
 * 主入口：从 streamgenerate 的完整响应体中提取最终文本。
 * 策略：取所有候选中最长的文本（与 Chat-Plus 逻辑一致）。
 *
 * @param {string} responseText  原始响应体
 * @returns {string|null}        提取到的纯文本，失败返回 null
 */
export function parseGeminiResponse(responseText) {
  const text = String(responseText ?? '');
  if (!text) return null;

  const entries = parseFramedEntries(text);
  if (!entries.length) return null;

  let best = '';
  for (const entry of entries) {
    const payload = extractPayloadEntry(entry);
    if (!payload?.text) continue;
    if (payload.text.length > best.length) best = payload.text;
  }

  return best || null;
}

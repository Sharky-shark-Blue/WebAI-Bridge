/**
 * shared-utils.js
 * Common utilities shared across all adapters.
 */

// ── Concurrency Lock ──────────────────────────────────────────
let sendLock = false;
const sendQueue = [];

export function acquireLock(id, text) {
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

export function releaseLock() {
  if (sendQueue.length > 0) {
    const next = sendQueue.shift();
    console.log(`[GPB] 释放锁，下一个任务 id=${next.id}`);
    next.resolve();
  } else {
    sendLock = false;
  }
}

// ── Random Delay ──────────────────────────────────────────────
let delayMin = 500;
let delayMax = 1500;

export function setDelayRange(min, max) {
  delayMin = Math.max(0, min);
  delayMax = Math.max(delayMin, max);
}

export function randomDelay() {
  const mn = Math.max(0, delayMin);
  const mx = Math.max(mn, delayMax);
  if (mx === 0) return Promise.resolve();
  const ms = mn + Math.random() * (mx - mn);
  return new Promise(r => setTimeout(r, ms));
}

// ── Quill Helper ──────────────────────────────────────────────
export function findQuill(el) {
  let node = el;
  for (let i = 0; i < 6; i++) {
    if (node && node.__quill && typeof node.__quill.setText === 'function') {
      return node.__quill;
    }
    node = node?.parentElement;
  }
  return null;
}

// ── Sleep Utility ─────────────────────────────────────────────
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

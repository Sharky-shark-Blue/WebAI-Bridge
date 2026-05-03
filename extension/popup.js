const $ = id => document.getElementById(id);

let savedUrl = 'ws://localhost:3000';

function setDot(id, state) {
  const el = $(id);
  el.className = 'dot' + (state === 'ok' ? ' ok' : state === 'checking' ? ' checking' : '');
}
function setVal(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = 'diag-val ' + (cls || '');
}
function showHint(msg) {
  const b = $('hint-box');
  if (msg) { b.textContent = msg; b.classList.add('show'); }
  else     { b.classList.remove('show'); }
}
function showToast(msg, color) {
  const t = $('toast');
  t.style.color = color || '#4caf50';
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

function checkSW() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'get-status' }, resp => {
      if (chrome.runtime.lastError || !resp) resolve(null);
      else resolve(resp);
    });
  });
}

async function checkServer(wsUrl) {
  const httpUrl = wsUrl.replace(/^ws(s?):\/\//, 'http$1://');
  try {
    const r = await fetch(httpUrl + '/api/status', {
      signal: AbortSignal.timeout(3000)
    });
    return await r.json();
  } catch {
    return null;
  }
}

async function runDiag() {
  setDot('dot-sw', 'checking');  setVal('val-sw',  '检测中…');
  setDot('dot-srv', 'checking'); setVal('val-srv', '检测中…');
  setDot('dot-ws', 'checking');  setVal('val-ws',  '检测中…');
  setDot('dot-platform', 'checking'); setVal('val-platform', '检测中…');
  showHint('');

  const swResp = await checkSW();

  if (!swResp) {
    setDot('dot-sw', 'err'); setVal('val-sw', '未响应', 'err');
    setDot('dot-srv', 'err'); setVal('val-srv', '–');
    setDot('dot-ws',  'err'); setVal('val-ws',  '–');
    showHint('⚠ 后台脚本未响应。请到 chrome://extensions 重新载入扩展，或刷新 Gemini 标签页。');
    return;
  }

  setDot('dot-sw', 'ok'); setVal('val-sw', '运行中', 'ok');
  if (swResp.url) { savedUrl = swResp.url; $('server-url').value = swResp.url; }

  // 未打开支持的平台标签页
  if (swResp.status === 'no_platform_tab') {
    setDot('dot-ws', 'err'); setVal('val-ws', '–');
    showHint('💡 请先在浏览器中打开 gemini.google.com 或 chatgpt.com 标签页，扩展需要运行在该页面上。');
    const srvData = await checkServer(savedUrl);
    setDot('dot-srv', srvData ? 'ok' : 'err');
    setVal('val-srv', srvData ? '运行中' : '无法连接', srvData ? 'ok' : 'err');
    return;
  }

  const srvData = await checkServer(savedUrl);
  if (!srvData) {
    setDot('dot-srv', 'err'); setVal('val-srv', '无法连接', 'err');
    setDot('dot-ws',  'err'); setVal('val-ws',  '–');
    showHint('⚠ 本地服务器未启动。请在项目目录执行：node server.js');
    return;
  }
  setDot('dot-srv', 'ok'); setVal('val-srv', '运行中', 'ok');

  const wsConnected = swResp.status === 'connected';
  setDot('dot-ws', wsConnected ? 'ok' : 'err');
  setVal('val-ws', wsConnected ? '已连接 ✓' : '未连接', wsConnected ? 'ok' : 'err');
  if (!wsConnected) {
    showHint('💡 服务器正常但 WS 未连接。点击「重连」按钮或等待自动重连。');
  }

  // Detect platform from active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) {
      setDot('dot-platform', 'err');
      setVal('val-platform', '未知', 'err');
      return;
    }
    const url = tabs[0].url || '';

    let platform = '未知';
    if (url.includes('gemini.google.com')) {
      platform = 'Gemini';
      setDot('dot-platform', 'ok');
      setVal('val-platform', platform, 'ok');
    } else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      platform = 'ChatGPT';
      setDot('dot-platform', 'ok');
      setVal('val-platform', platform, 'ok');
    } else {
      setDot('dot-platform', 'err');
      setVal('val-platform', platform, 'err');
    }
  });
}

// 初始化
chrome.storage.sync.get({ serverUrl: 'ws://localhost:3000', delayMin: 500, delayMax: 1500 }, data => {
  savedUrl = data.serverUrl;
  $('server-url').value = savedUrl;
  $('delay-min').value = data.delayMin;
  $('delay-max').value = data.delayMax;
  updateDelayPreview(data.delayMin, data.delayMax);
  runDiag();
});

function updateDelayPreview(min, max) {
  const mn = Math.max(0, parseInt(min) || 0);
  const mx = Math.max(mn, parseInt(max) || 0);
  const el = $('delay-preview');
  if (mn === 0 && mx === 0) {
    el.textContent = '延迟已关闭';
    el.style.color = '#888';
  } else {
    el.textContent = `每次发送前随机延迟 ${mn}–${mx} ms`;
    el.style.color = '';
  }
}

$('delay-min').addEventListener('input', () => {
  updateDelayPreview($('delay-min').value, $('delay-max').value);
});
$('delay-max').addEventListener('input', () => {
  updateDelayPreview($('delay-min').value, $('delay-max').value);
});

setInterval(runDiag, 3000);

$('btn-save').addEventListener('click', () => {
  const url = $('server-url').value.trim();
  if (!url) { showToast('请输入服务器地址', '#e94560'); return; }
  const delayMin = Math.max(0, parseInt($('delay-min').value) || 0);
  const delayMax = Math.max(delayMin, parseInt($('delay-max').value) || 0);
  savedUrl = url;
  chrome.storage.sync.set({ serverUrl: url, delayMin, delayMax });
  // 通知 content script 更新延迟设置
  const supportedPlatforms = [
    'https://gemini.google.com/*',
    'https://chatgpt.com/*',
    'https://chat.openai.com/*'
  ];
  chrome.tabs.query({ url: supportedPlatforms }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'update-delay', delayMin, delayMax }).catch(() => {});
    });
  });
  chrome.runtime.sendMessage({ type: 'reconnect', url }, () => {
    if (chrome.runtime.lastError) {
      showToast('后台未响应，请重载扩展', '#e94560');
    } else {
      showToast('已保存，正在连接…');
      setTimeout(runDiag, 1500);
    }
  });
});

$('btn-reconnect').addEventListener('click', () => {
  const url = $('server-url').value.trim() || savedUrl;
  chrome.runtime.sendMessage({ type: 'reconnect', url }, () => {
    if (chrome.runtime.lastError) {
      showToast('后台未响应，请重载扩展', '#e94560');
    } else {
      showToast('正在重连…');
      setTimeout(runDiag, 1500);
    }
  });
});

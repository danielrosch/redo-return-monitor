'use strict';

const http  = require('http');
const https = require('https');

const CONFIG = {
  storeId:   '68264bc68ee493594377c3f0',
  apiSecret: 'P-t3FaBZ57b9KZw4xvajuzdvMARZv-qxM_lE2fm9UZ0',
  fetchSec:   45,
  refreshSec: 30,
};

const API_HOST = 'api.getredo.com';
let cache = { count: null, open: null, delivered: null, ts: null, error: null };
let isFetching = false; // prevent concurrent fetches

function fetchCountForStatus(status) {
  return new Promise((resolve, reject) => {
    let total = 0;

    function fetchPage(cursor) {
      let reqPath = `/v2.2/stores/${CONFIG.storeId}/returns?status=${encodeURIComponent(status)}`;
      if (cursor) reqPath += `&page-continue=${encodeURIComponent(cursor)}`;

      const options = {
        hostname: API_HOST,
        path:     reqPath,
        method:   'GET',
        headers:  {
          'Authorization': `Bearer ${CONFIG.apiSecret}`,
          'Accept':        'application/json',
          'X-Page-Size':   '500',
        },
      };

      const req = https.request(options, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
          if (apiRes.statusCode !== 200) {
            return reject(new Error(`HTTP ${apiRes.statusCode}: ${body.slice(0, 200)}`));
          }
          try {
            const data    = JSON.parse(body);
            const records = data.returns || [];
            total += records.length;
            const nextCursor = apiRes.headers['x-page-next'] || null;
            console.log(`  [${status}] ${records.length} records | total: ${total} | more: ${nextCursor ? 'yes' : 'no'}`);
            if (nextCursor) {
              fetchPage(nextCursor);
            } else {
              resolve(total);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    }
    fetchPage(null);
  });
}

async function refreshCache() {
  if (isFetching) {
    console.log('  [skipped] previous fetch still running');
    return;
  }
  isFetching = true;
  console.log(`\n[${new Date().toLocaleTimeString()}] Fetching from Redo API...`);
  try {
    // "delivered" = package physically at warehouse, not yet processed
    // "open" = customer initiated but package not yet received — not actionable by warehouse
    const deliveredCount = await fetchCountForStatus('delivered');
    cache = { count: deliveredCount, open: 0, delivered: deliveredCount, ts: new Date().toISOString(), error: null };
    console.log(`  DONE: delivered (at warehouse, needs processing): ${deliveredCount}`);
  } catch (err) {
    cache.error = err.message;
    console.error(`  ERROR: ${err.message}`);
  } finally {
    isFetching = false;
  }
}

refreshCache();
setInterval(refreshCache, CONFIG.fetchSec * 1000);

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Redo Returns Monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:               #06080f;
    --blue:             #00c8ff;
    --blue-dim:         #0a5c75;
    --blue-glow:        rgba(0,200,255,0.15);
    --blue-glow-strong: rgba(0,200,255,0.35);
    --amber:            #ffb800;
    --red:              #ff3b3b;
    --text:             #b0e8f5;
    --text-dim:         #2a5060;
    --border:           #0d2535;
    --scanline:         rgba(0,0,0,0.18);
    --font-mono:        'Share Tech Mono', monospace;
    --font-display:     'Orbitron', sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font-mono); overflow: hidden; user-select: none; }
  body::before { content:''; position:fixed; inset:0; background:repeating-linear-gradient(to bottom,transparent 0px,transparent 3px,var(--scanline) 3px,var(--scanline) 4px); pointer-events:none; z-index:9999; }
  body::after  { content:''; position:fixed; inset:0; background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,0.7) 100%); pointer-events:none; z-index:9998; }

  .corner { position:fixed; width:24px; height:24px; }
  .corner-tl { top:12px;    left:12px;  border-top:1px solid var(--blue-dim);    border-left:1px solid var(--blue-dim); }
  .corner-tr { top:12px;    right:12px; border-top:1px solid var(--blue-dim);    border-right:1px solid var(--blue-dim); }
  .corner-bl { bottom:12px; left:12px;  border-bottom:1px solid var(--blue-dim); border-left:1px solid var(--blue-dim); }
  .corner-br { bottom:12px; right:12px; border-bottom:1px solid var(--blue-dim); border-right:1px solid var(--blue-dim); }

  .screen { height:100vh; display:grid; grid-template-rows:auto 1fr auto; padding:28px 40px 0; }

  .header { display:flex; align-items:flex-start; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:16px; }
  .sys-label   { font-family:var(--font-display); font-size:11px; letter-spacing:0.3em; color:var(--text-dim); text-transform:uppercase; margin-bottom:6px; }
  .main-title  { font-family:var(--font-display); font-size:clamp(18px,2.5vw,28px); font-weight:700; letter-spacing:0.15em; color:var(--blue); text-shadow:0 0 20px var(--blue-glow-strong),0 0 40px var(--blue-glow); text-transform:uppercase; }
  .clock       { font-family:var(--font-display); font-size:clamp(14px,2vw,22px); font-weight:700; color:var(--amber); text-shadow:0 0 16px rgba(255,184,0,0.4); letter-spacing:0.1em; text-align:right; }
  .date-label  { font-size:11px; color:var(--text-dim); letter-spacing:0.2em; text-align:right; margin-top:4px; }

  .main { display:flex; flex-direction:column; align-items:center; justify-content:center; }

  .filter-pills { display:flex; gap:10px; margin-bottom:clamp(16px,3vh,40px); }
  .tag-pill { font-size:11px; letter-spacing:0.25em; padding:4px 14px; border:1px solid var(--blue); color:var(--blue); background:rgba(0,200,255,0.07); box-shadow:0 0 8px var(--blue-glow); text-transform:uppercase; }

  .count-wrapper { position:relative; display:flex; flex-direction:column; align-items:center; }
  .count-label-above { font-family:var(--font-display); font-size:clamp(10px,1.3vw,14px); letter-spacing:0.5em; color:var(--text-dim); text-transform:uppercase; margin-bottom:4px; }

  .count {
    font-family:var(--font-display); font-size:clamp(140px,28vw,320px); font-weight:900;
    line-height:0.85; color:var(--blue);
    text-shadow:0 0 30px var(--blue-glow-strong),0 0 60px var(--blue-glow),0 0 120px rgba(0,200,255,0.08);
    letter-spacing:-0.02em; transition:all 0.4s ease; min-width:3ch; text-align:center; position:relative;
  }
  .count::after { content:''; position:absolute; inset:-20px; border-radius:50%; background:radial-gradient(ellipse,var(--blue-glow) 0%,transparent 70%); animation:pulse 3s ease-in-out infinite; pointer-events:none; }
  @keyframes pulse { 0%,100%{opacity:0.4;transform:scale(0.95)} 50%{opacity:1;transform:scale(1.05)} }
  .count.loading     { opacity:0.3; }
  .count.error-state { color:var(--red) !important; text-shadow:0 0 30px rgba(255,59,59,0.4) !important; }
  .count.updated     { animation:flash 0.4s ease; }
  @keyframes flash { 0%{opacity:0.4;transform:scale(0.97)} 60%{opacity:1;transform:scale(1.01)} 100%{opacity:1;transform:scale(1)} }

  .count-label-below { font-family:var(--font-display); font-size:clamp(14px,2.2vw,26px); font-weight:700; letter-spacing:0.35em; color:var(--text); text-transform:uppercase; margin-top:12px; opacity:0.85; }

  .sub-counts { display:flex; gap:40px; margin-top:20px; font-size:12px; letter-spacing:0.2em; color:var(--text-dim); text-transform:uppercase; }
  .sub-counts span { color:var(--blue); font-size:16px; font-family:var(--font-display); font-weight:700; margin-left:8px; }

  .error-msg { font-size:clamp(12px,1.5vw,16px); color:var(--red); letter-spacing:0.1em; text-align:center; margin-top:16px; max-width:500px; }
  .error-msg.hidden { display:none; }

  .footer { border-top:1px solid var(--border); padding:14px 0 20px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; font-size:11px; letter-spacing:0.2em; color:var(--text-dim); text-transform:uppercase; }
  .footer-left  { display:flex; align-items:center; gap:14px; }
  .footer-center { text-align:center; }
  .footer-right { display:flex; align-items:center; justify-content:flex-end; gap:14px; }

  .status-dot { width:8px; height:8px; border-radius:50%; background:var(--blue); box-shadow:0 0 8px var(--blue); flex-shrink:0; }
  .status-dot.error   { background:var(--red);   box-shadow:0 0 8px var(--red); }
  .status-dot.loading { background:var(--amber); box-shadow:0 0 8px var(--amber); animation:blink 0.8s step-end infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .refresh-bar { height:3px; background:var(--border); width:120px; position:relative; overflow:hidden; }
  .refresh-bar-fill { position:absolute; left:0; top:0; bottom:0; background:var(--blue); box-shadow:0 0 6px var(--blue); width:0%; }
</style>
</head>
<body>
<div class="corner corner-tl"></div>
<div class="corner corner-tr"></div>
<div class="corner corner-bl"></div>
<div class="corner corner-br"></div>

<div class="screen">
  <div class="header">
    <div>
      <div class="sys-label">Redo · Warehouse Returns Display</div>
      <div class="main-title">Returns Monitor</div>
    </div>
    <div>
      <div class="clock" id="clock">--:--:--</div>
      <div class="date-label" id="date-label">---</div>
    </div>
  </div>

  <div class="main">
    <div class="filter-pills">
      <div class="tag-pill">DELIVERED TO WAREHOUSE</div>
      <div class="tag-pill">AWAITING PROCESSING</div>
    </div>
    <div class="count-wrapper">
      <div class="count-label-above">TOTAL COUNT</div>
      <div class="count loading" id="count-display">—</div>
      <div class="count-label-below">Returns to Process</div>
    </div>
    <div class="error-msg hidden" id="error-msg"></div>
  </div>

  <div class="footer">
    <div class="footer-left">
      <div class="status-dot loading" id="status-dot"></div>
      <span id="status-text">INITIALIZING...</span>
    </div>
    <div class="footer-center">AUTO-REFRESH ACTIVE</div>
    <div class="footer-right">
      <span id="last-updated">LAST UPDATED: —</span>
      <div class="refresh-bar"><div class="refresh-bar-fill" id="refresh-bar"></div></div>
    </div>
  </div>
</div>

<script>
const REFRESH_INTERVAL = 30;
let refreshTimer = null;
let currentCount = null;

window.addEventListener('DOMContentLoaded', () => {
  startClock();
  startMonitor();
});

function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('date-label').textContent = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }).toUpperCase();
  }
  tick();
  setInterval(tick, 1000);
}

async function fetchAndDisplay() {
  setStatus('loading', 'FETCHING DATA...');
  try {
    const res = await fetch('/count');
    if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const count = data.count;
    const changed = currentCount !== null && count !== currentCount;
    currentCount = count;

    const el = document.getElementById('count-display');
    el.textContent = count;
    el.className = 'count' + (changed ? ' updated' : '');
    if (changed) void el.offsetWidth;

document.getElementById('error-msg').classList.add('hidden');
    document.getElementById('last-updated').textContent = 'LAST UPDATED: ' + new Date().toLocaleTimeString('en-US', { hour12: false });
    setStatus('ok', 'LIVE \\u00b7 CONNECTED');

  } catch(err) {
    document.getElementById('count-display').className = 'count error-state';
    document.getElementById('count-display').textContent = 'ERR';
    const msg = document.getElementById('error-msg');
    msg.classList.remove('hidden');
    msg.textContent = '\\u26a0 ' + err.message;
    setStatus('error', 'CONNECTION ERROR');
  }
}

function startMonitor() {
  if (refreshTimer) clearInterval(refreshTimer);
  fetchAndDisplay();
  startProgressBar();
  refreshTimer = setInterval(() => { fetchAndDisplay(); startProgressBar(); }, REFRESH_INTERVAL * 1000);
}

function startProgressBar() {
  const bar = document.getElementById('refresh-bar');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  setTimeout(() => {
    bar.style.transition = 'width ' + REFRESH_INTERVAL + 's linear';
    bar.style.width = '100%';
  }, 100);
}

function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  dot.className = 'status-dot';
  if (state === 'loading') dot.classList.add('loading');
  if (state === 'error')   dot.classList.add('error');
  document.getElementById('status-text').textContent = text;
}
</script>
</body>
</html>
`;

const PORT = process.env.PORT || 3031;

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }

  if (pathname === '/count') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    if (cache.error) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: cache.error }));
    }
    if (cache.count === null) {
      res.writeHead(503);
      return res.end(JSON.stringify({ error: 'Cache warming up, please refresh in a moment...' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({
      count:      cache.count,
      open:       cache.open,
      delivered:  cache.delivered,
      refreshSec: CONFIG.refreshSec,
      ts:         cache.ts,
    }));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Redo Returns Monitor running on port ${PORT}`);
});

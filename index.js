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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
            // Filter: created within last 30 days AND not complete
            const filtered = records.filter(r =>
              new Date(r.createdAt) >= thirtyDaysAgo &&
              r.completeWithNoAction === false
            );
            total += filtered.length;
            const nextCursor = apiRes.headers['x-page-next'] || null;
            console.log(`  [${status}] ${records.length} records (${filtered.length} match filter) | total: ${total} | more: ${nextCursor ? 'yes' : 'no'}`);
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
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;height:100%;background:#0d0d1a;overflow:hidden;font-family:'Inter',sans-serif;}
.board{width:100vw;height:100vh;background:radial-gradient(ellipse at 50% 40%,#1a1a3e 0%,#0d0d1a 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;}
.scanlines{position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 2px,rgba(0,0,0,0.1) 2px,rgba(0,0,0,0.1) 4px);pointer-events:none;z-index:2;}
.vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.6) 100%);pointer-events:none;z-index:2;}
.bar{position:absolute;left:0;right:0;height:8px;overflow:hidden;}
.bar.top{top:0;}.bar.bottom{bottom:0;}
.bar-fill{height:100%;width:300%;background:linear-gradient(90deg,#e94560 0%,#f5a623 16%,#fff 25%,#f5a623 33%,#e94560 50%,#f5a623 66%,#fff 75%,#f5a623 83%,#e94560 100%);animation:barslide 2s linear infinite;}
.bar.bottom .bar-fill{animation-direction:reverse;}
.side{position:absolute;top:0;bottom:0;width:4px;overflow:hidden;}
.side.left{left:0;}.side.right{right:0;}
.side-fill{width:100%;height:300%;background:linear-gradient(180deg,#e94560 0%,#f5a623 16%,#fff 25%,#f5a623 33%,#e94560 50%,#f5a623 66%,#fff 75%,#f5a623 83%,#e94560 100%);animation:vertslide 2s linear infinite;}
.side.right .side-fill{animation-direction:reverse;}
.corner{position:absolute;width:60px;height:60px;animation:cornerblink 2.5s ease-in-out infinite;}
.corner.tl{top:20px;left:20px;border-top:3px solid #f5a623;border-left:3px solid #f5a623;}
.corner.tr{top:20px;right:20px;border-top:3px solid #f5a623;border-right:3px solid #f5a623;animation-delay:0.6s;}
.corner.bl{bottom:20px;left:20px;border-bottom:3px solid #f5a623;border-left:3px solid #f5a623;animation-delay:1.2s;}
.corner.br{bottom:20px;right:20px;border-bottom:3px solid #f5a623;border-right:3px solid #f5a623;animation-delay:1.8s;}
.ticker-wrap{position:absolute;top:12px;left:0;right:0;overflow:hidden;height:24px;z-index:4;}
.ticker{display:flex;gap:48px;white-space:nowrap;animation:tickermove 18s linear infinite;}
.ticker span{font-size:12px;font-weight:700;letter-spacing:0.25em;color:rgba(255,255,255,0.28);text-transform:uppercase;}
.ticker span.hl{color:#f5a623;}
.content{position:relative;z-index:5;display:flex;flex-direction:column;align-items:center;text-align:center;}
.brand{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,4vw,56px);letter-spacing:0.3em;color:#f5a623;text-transform:uppercase;margin-bottom:4px;}
.subtitle{font-size:clamp(11px,1.2vw,16px);font-weight:700;letter-spacing:0.4em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin-bottom:24px;}
.score-row{display:flex;align-items:center;gap:24px;}
.accent-line{width:5px;height:clamp(60px,8vh,100px);background:linear-gradient(180deg,transparent,#e94560,transparent);animation:accentpulse 1.5s ease-in-out infinite;}
.accent-line.right{animation-delay:0.75s;}
.score{font-family:'Bebas Neue',sans-serif;font-size:clamp(160px,32vw,380px);line-height:0.85;color:#fff;letter-spacing:-0.02em;animation:scoreglow 2.5s ease-in-out infinite 1.5s;}
.label{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,3.5vw,48px);letter-spacing:0.35em;color:rgba(255,255,255,0.55);text-transform:uppercase;margin-top:10px;}
.status-bar{position:absolute;bottom:20px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:14px;z-index:5;}
.live-dot{width:9px;height:9px;border-radius:50%;background:#e94560;animation:livepulse 1.2s ease-in-out infinite;}
.status-text{font-size:clamp(10px,1vw,13px);font-weight:700;letter-spacing:0.22em;color:rgba(255,255,255,0.25);text-transform:uppercase;}
.status-sep{color:rgba(255,255,255,0.1);}
.progress-track{position:absolute;bottom:10px;left:80px;right:80px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;z-index:5;}
.progress-fill{height:100%;background:linear-gradient(90deg,#e94560,#f5a623);border-radius:2px;width:0%;animation:progressgo 30s linear infinite;}
.error-msg{font-size:clamp(14px,1.5vw,20px);color:#e94560;letter-spacing:0.1em;text-align:center;margin-top:20px;max-width:600px;}
.error-msg.hidden{display:none;}
@keyframes barslide{0%{transform:translateX(0)}100%{transform:translateX(-33.33%)}}
@keyframes vertslide{0%{transform:translateY(0)}100%{transform:translateY(-33.33%)}}
@keyframes cornerblink{0%,100%{opacity:1}50%{opacity:0.2}}
@keyframes scoreglow{0%,100%{text-shadow:0 0 40px rgba(233,69,96,0.2)}50%{text-shadow:0 0 100px rgba(233,69,96,0.7),0 0 60px rgba(245,166,35,0.4)}}
@keyframes accentpulse{0%,100%{opacity:0.3;transform:scaleY(0.6)}50%{opacity:1;transform:scaleY(1)}}
@keyframes livepulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:0.5}}
@keyframes tickermove{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes progressgo{0%{width:0%}100%{width:100%}}
</style>
</head>
<body>
<div class="board">
  <div class="scanlines"></div>
  <div class="vignette"></div>
  <div class="bar top"><div class="bar-fill"></div></div>
  <div class="bar bottom"><div class="bar-fill"></div></div>
  <div class="side left"><div class="side-fill"></div></div>
  <div class="side right"><div class="side-fill"></div></div>
  <div class="corner tl"></div>
  <div class="corner tr"></div>
  <div class="corner bl"></div>
  <div class="corner br"></div>
  <canvas id="pcanvas" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;"></canvas>
  <div class="ticker-wrap"><div class="ticker" id="ticker"></div></div>
  <div class="content">
    <div class="brand">Jungmaven</div>
    <div class="subtitle">Warehouse Returns Display</div>
    <div class="score-row">
      <div class="accent-line"></div>
      <div class="score" id="count-display">—</div>
      <div class="accent-line right"></div>
    </div>
    <div class="label">Returns to Process</div>
    <div class="error-msg hidden" id="error-msg"></div>
  </div>
  <div class="status-bar">
    <div class="live-dot" id="status-dot"></div>
    <div class="status-text" id="status-text">INITIALIZING...</div>
    <div class="status-sep">|</div>
    <div class="status-text" id="clock">--:--:--</div>
    <div class="status-sep">|</div>
    <div class="status-text" id="last-updated">LAST UPDATED: —</div>
  </div>
  <div class="progress-track"><div class="progress-fill" id="refresh-bar"></div></div>
</div>
<script>
const REFRESH_INTERVAL = 30;
let refreshTimer = null;
let currentCount = null;

window.addEventListener('DOMContentLoaded', () => {
  startClock();
  setupParticles();
  setupTicker();
  startMonitor();
});

function startClock() {
  function tick() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-US', {hour12:false});
  }
  tick();
  setInterval(tick, 1000);
}

function setupTicker() {
  const tk = document.getElementById('ticker');
  const msgs = ['Returns to Process','\u25C6','Jungmaven Warehouse','\u25C6','Live Display Board','\u25C6','Returns to Process','\u25C6','Jungmaven Warehouse','\u25C6','Live Display Board','\u25C6'];
  msgs.forEach(m => {
    const s = document.createElement('span');
    if (m === '\u25C6') s.className = 'hl';
    s.textContent = m;
    tk.appendChild(s);
  });
}

function setupParticles() {
  const canvas = document.getElementById('pcanvas');
  const ctx = canvas.getContext('2d');
  let W, H;
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  const cols = ['#e94560','#f5a623','#ffffff'];
  const particles = [];
  for (let i = 0; i < 25; i++) {
    particles.push({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-0.5)*0.8, vy: (Math.random()-0.5)*0.5,
      r: Math.random()*4+2,
      color: cols[Math.floor(Math.random()*cols.length)],
      alpha: Math.random()*0.3+0.5
    });
  }
  let last = 0;
  function draw(ts) {
    requestAnimationFrame(draw);
    if (ts - last < 50) return;
    last = ts;
    ctx.clearRect(0,0,W,H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = W+10;
      if (p.x > W+10) p.x = -10;
      if (p.y < -10) p.y = H+10;
      if (p.y > H+10) p.y = -10;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(draw);
}

async function fetchAndDisplay() {
  try {
    const res = await fetch('/count');
    if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const count = data.count;
    const changed = currentCount !== null && count !== currentCount;
    const el = document.getElementById('count-display');
    if (currentCount === null) {
      animateCountUp(count);
    } else {
      el.textContent = count;
      if (changed) { el.style.animation='none'; void el.offsetWidth; el.style.animation='scoreglow 2.5s ease-in-out infinite'; }
    }
    currentCount = count;
    document.getElementById('error-msg').classList.add('hidden');
    document.getElementById('last-updated').textContent = 'UPDATED: ' + new Date().toLocaleTimeString('en-US',{hour12:false});
    setStatus('ok', 'LIVE');
  } catch(err) {
    document.getElementById('count-display').textContent = 'ERR';
    const msg = document.getElementById('error-msg');
    msg.classList.remove('hidden');
    msg.textContent = '\u26a0 ' + err.message;
    setStatus('error', 'CONNECTION ERROR');
  }
}

function animateCountUp(target) {
  const el = document.getElementById('count-display');
  const t0 = Date.now();
  const dur = 2000;
  function step() {
    const p = Math.min((Date.now()-t0)/dur, 1);
    const ease = 1-Math.pow(1-p, 4);
    el.textContent = Math.round(ease * target);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
  dot.style.background = state === 'error' ? '#ff3b3b' : '#e94560';
  document.getElementById('status-text').textContent = text;
}
</script>
</body>
</html>`;

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

/* 按脚本逐帧截图，用来生成 README 顶部的演示 GIF
   用法: node record.js <url> <outDir> [width] [height] [scale]
   输出: <outDir>/f001.png ...，配合 tools/make-gif.py 合成
*/
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const URL_ = process.argv[2];
const OUTDIR = process.argv[3] || 'frames';
const W = parseInt(process.argv[4] || '390', 10);
const H = parseInt(process.argv[5] || '844', 10);
const SCALE = parseInt(process.argv[6] || '2', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 动作脚本：每步一个表达式 + 停顿，null 表示只截一帧 */
const FRAMES = [
  { tag: 'idle',     js: null, wait: 900 },
  { tag: 'task1',    js: `document.querySelectorAll('#todoList li')[0].click()`, wait: 700 },
  { tag: 'task2',    js: `document.querySelectorAll('#todoList li')[0].click()`, wait: 700 },
  { tag: 'open',     js: `document.querySelector('#incomeBtn').click()`, wait: 550 },
  { tag: 'typing',   js: `(function(){var i=document.querySelector('#incomeAmt');i.value='2000';i.dispatchEvent(new Event('input',{bubbles:true}));})()`, wait: 550 },
  { tag: 'confirmed',js: `document.querySelector('#incomeOk').click()`, wait: 1100 },
  { tag: 'review',   js: `document.querySelector('[data-view="review"]').click()`, wait: 1900 },
  { tag: 'year',     js: `document.querySelector('[data-view="year"]').click()`, wait: 800 },
  { tag: 'back',     js: `document.querySelector('[data-view="today"]').click()`, wait: 900 },
];

async function waitPort() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('debug port not ready');
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method).forEach((fn) => fn(msg.params));
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  return {
    ready,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    on(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    close() { try { ws.close(); } catch (e) {} }
  };
}

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const profile = path.join(os.tmpdir(), 'edge-cdp-record');
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitPort();
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    const target = await r.json();
    const c = client(target.webSocketDebuggerUrl);
    await c.ready;

    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: SCALE, mobile: true
    });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const loaded = new Promise((res) => c.on('Page.loadEventFired', res));
    await c.send('Page.navigate', { url: URL_ });
    await Promise.race([loaded, sleep(8000)]);
    await sleep(1200);

    let n = 0;
    for (const f of FRAMES) {
      if (f.js) {
        const out = await c.send('Runtime.evaluate', {
          expression: f.js, awaitPromise: true, returnByValue: true
        });
        if (out.exceptionDetails) {
          console.log(`ERR @${f.tag}: ${out.exceptionDetails.text || JSON.stringify(out.exceptionDetails)}`);
        }
      }
      await sleep(f.wait);
      const shot = await c.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      n++;
      const name = path.join(OUTDIR, `f${String(n).padStart(3, '0')}.png`);
      fs.writeFileSync(name, Buffer.from(shot.data, 'base64'));
      console.log('ok', name, f.tag);
    }

    // 顺带报告关键数值，便于确认动作真的生效
    const chk = await c.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        goal: document.querySelector('#goalPct') ? document.querySelector('#goalPct').textContent : '?',
        lv: document.querySelector('#lvNum') ? document.querySelector('#lvNum').textContent : '?',
        hp: document.querySelector('#hpTxt') ? document.querySelector('#hpTxt').textContent : '?',
        exp: document.querySelector('#expTxt') ? document.querySelector('#expTxt').textContent : '?',
        left: document.querySelectorAll('#todoList li').length
      })`,
      returnByValue: true
    });
    console.log('STATE:', chk.result.value);

    c.close();
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch (e) {}
    await sleep(300);
    process.exit();
  }
})();

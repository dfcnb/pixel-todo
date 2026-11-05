/* 用 DevTools 协议截图 + 执行脚本
   用法: node shot.js <url> <out.png> [width] [height] [jsToEval]
*/
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const URL_ = process.argv[2];
const OUT = process.argv[3] || 'shot.png';
const W = parseInt(process.argv[4] || '390', 10);
const H = parseInt(process.argv[5] || '844', 10);
const EVAL = process.argv[6] || '';
const WAIT = parseInt(process.argv[7] || '500', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort() {
  for (let i = 0; i < 60; i++) {
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
  const profile = path.join(os.tmpdir(), 'edge-cdp-shot');
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
      width: W, height: H, deviceScaleFactor: 2, mobile: true
    });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const loaded = new Promise((res) => c.on('Page.loadEventFired', res));
    await c.send('Page.navigate', { url: URL_ });
    await Promise.race([loaded, sleep(6000)]);
    await sleep(WAIT);

    if (EVAL) {
      const out = await c.send('Runtime.evaluate', {
        expression: EVAL, awaitPromise: true, returnByValue: true
      });
      if (out && out.result) {
        console.log('EVAL:', JSON.stringify(out.result.value));
        if (out.exceptionDetails) console.log('ERR:', JSON.stringify(out.exceptionDetails.text));
      }
      await sleep(400);
    }

    const shot = await c.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('ok', OUT);

    // 顺便打印页面尺寸
    const dim = await c.send('Runtime.evaluate', {
      expression: 'innerWidth+"x"+innerHeight+" scrollW="+document.documentElement.scrollWidth+" bodyW="+document.body.scrollWidth',
      returnByValue: true
    });
    console.log('DIM:', dim.result.value);

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

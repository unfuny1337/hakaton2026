'use strict';
/* Tiny Chrome DevTools Protocol driver (no dependencies): launches a locally installed
   Chromium-based browser (Edge or Chrome) headless and talks to one page over WebSocket.
   Requires Node 22+ (global WebSocket and fetch). Set BROWSER_PATH to override detection. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].filter(Boolean);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chromium-based browser found. Set BROWSER_PATH.');
  return found;
}

async function launch() {
  const exe = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-cdp-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    '--disable-background-networking', '--disable-component-update', '--mute-audio', '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 100 && !version; i += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (_) { await delay(100); }
  }
  if (!version) { proc.kill(); throw new Error('Browser did not expose the DevTools endpoint.'); }
  return {
    exe, port, version: version.Browser,
    async newPage() {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      return Page.connect(target.webSocketDebuggerUrl, port, target.id);
    },
    async close() {
      try { proc.kill(); } catch (_) { /* ignore */ }
      await delay(300);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* profile may stay locked briefly */ }
    }
  };
}

class Page {
  static connect(wsUrl, port, id) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => resolve(new Page(ws, port, id));
      ws.onerror = (e) => reject(new Error(`WebSocket error: ${e.message || e.type}`));
    });
  }

  constructor(ws, port, id) {
    this.ws = ws;
    this.port = port;
    this.id = id;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.errors = [];
    this.consoleMessages = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`));
        else resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).slice().forEach((fn) => fn(msg.params));
      }
    };
    this.on('Runtime.exceptionThrown', (p) => this.errors.push(`exception: ${p.exceptionDetails.exception
      ? p.exceptionDetails.exception.description : p.exceptionDetails.text}`));
    this.on('Runtime.consoleAPICalled', (p) => {
      const text = p.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ');
      this.consoleMessages.push(`${p.type}: ${text}`);
      if (p.type === 'error' || p.type === 'warning' || p.type === 'assert') this.errors.push(`console.${p.type}: ${text}`);
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), timeout);
      const fn = (params) => {
        clearTimeout(timer);
        const list = this.listeners.get(method);
        list.splice(list.indexOf(fn), 1);
        resolve(params);
      };
      this.on(method, fn);
    });
  }

  async init({ width = 1280, height = 900, mobile = false, reducedMotion = true, blockFonts = false, initScript = '' } = {}) {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
    if (blockFonts) await this.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    await this.viewport(width, height, mobile);
    await this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
    if (initScript) await this.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
  }

  viewport(width, height = 900, mobile = false) {
    return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async goto(url) {
    const loaded = this.once('Page.loadEventFired', 20000);
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async reload() {
    const loaded = this.once('Page.loadEventFired', 20000);
    await this.send('Page.reload', { ignoreCache: true });
    await loaded;
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.exceptionDetails) {
      throw new Error(`eval failed: ${res.exceptionDetails.exception ? res.exceptionDetails.exception.description : res.exceptionDetails.text}\n${expression}`);
    }
    return res.result.value;
  }

  async waitFor(expression, { timeout = 15000, interval = 50, message = expression } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(`!!(${expression})`)) return true;
      await delay(interval);
    }
    throw new Error(`Timeout: ${message}`);
  }

  /** Real mouse click at the centre of the first element matching the selector (true hit-testing). */
  async click(selector) {
    const box = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) throw new Error(`click: no element ${selector}`);
    await this.mouse(box.x, box.y);
    return box;
  }

  async mouse(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async key(key, { shift = false } = {}) {
    const codes = { Tab: 9, Enter: 13, Escape: 27, ArrowRight: 39, ArrowLeft: 37, ' ': 32 };
    const base = { key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: codes[key] || 0, modifiers: shift ? 8 : 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    if (key === 'Enter' || key === ' ') await this.send('Input.dispatchKeyEvent', { type: 'char', ...base, text: key === 'Enter' ? '\r' : ' ' });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async screenshot(file, { fullPage = false } = {}) {
    let clip;
    if (fullPage) {
      const size = await this.eval('({ w: document.documentElement.scrollWidth, h: Math.min(document.documentElement.scrollHeight, 6000) })');
      clip = { x: 0, y: 0, width: size.w, height: size.h, scale: 1 };
    }
    const res = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  }

  async close() {
    try { await fetch(`http://127.0.0.1:${this.port}/json/close/${this.id}`); } catch (_) { /* ignore */ }
    try { this.ws.close(); } catch (_) { /* ignore */ }
  }
}

module.exports = { launch, delay };

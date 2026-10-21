// Captures product screenshots from a running Throughline stack.
// Usage: node scripts/capture-screenshots.mjs
// Env: BASE (default http://localhost:5174), EMAIL, PASSWORD
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chromePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const debugPort = Number(process.env.DEBUG_PORT ?? 9223);
const base = process.env.BASE ?? 'http://localhost:5174';
const email = process.env.EMAIL ?? 'alex@example.com';
const password = process.env.PASSWORD ?? 'Preview-Password!2026';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'screenshots');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await fs.mkdir(outDir, { recursive: true });
await fs.rm('/tmp/throughline-chrome-profile', { recursive: true, force: true });

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    '--user-data-dir=/tmp/throughline-chrome-profile',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--window-size=1440,960',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDebugger() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error('Chrome debugger did not start');
}

await waitForDebugger();
const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
  method: 'PUT',
}).then((response) => response.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluation failed');
  return result.result.value;
}

async function navigate(path) {
  await send('Page.navigate', { url: `${base}${path}` });
  await sleep(1800);
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await fs.writeFile(`${outDir}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`captured ${name}`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await navigate('/login');
  await shot('login');

  await evaluate(`(() => {
    const set = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('input');
    set(inputs[0], ${JSON.stringify(email)});
    set(inputs[1], ${JSON.stringify(password)});
    document.querySelector('form').requestSubmit();
    return true;
  })()`);
  await sleep(2500);

  const teams = await evaluate(`fetch('/api/teams').then((r) => r.json())`);
  const teamId = teams.teams[0].id;
  await navigate('/teams');
  await shot('teams');
  await navigate(`/teams/${teamId}`);
  await shot('team');

  const projects = await evaluate(`fetch('/api/projects').then((r) => r.json())`);
  const projectId = projects.projects[0].id;

  await navigate(`/projects/${projectId}/dashboard`);
  await shot('dashboard');
  await navigate(`/projects/${projectId}/items`);
  await shot('items');
  await navigate(`/projects/${projectId}/graph`);
  await shot('graph');
  await evaluate(`(() => {
    const input = document.querySelector('.page-toolbar input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'export');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const select = document.querySelectorAll('.page-toolbar select')[1];
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'POST');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(500);
  await shot('graph-search');
  await evaluate(`(() => {
    const clear = [...document.querySelectorAll('.items-summary-line button')]
      .find((b) => /Clear filters/i.test(b.textContent));
    if (clear) clear.click();
    return true;
  })()`);
  await sleep(500);
  await evaluate(`(() => {
    document.querySelectorAll('.mapping-card')[0].click();
    return true;
  })()`);
  await sleep(600);
  await shot('graph-detail');
  await evaluate(`(() => {
    const close = document.querySelector('[role=dialog] button[title]');
    if (close) close.click();
    return true;
  })()`);
  await sleep(400);
  await evaluate(`(() => {
    const add = [...document.querySelectorAll('.page-toolbar button')]
      .find((b) => /Add mapping/i.test(b.textContent));
    if (add) add.click();
    return true;
  })()`);
  await sleep(600);
  await evaluate(`(() => {
    const set = (el, value) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const dialog = document.querySelector('[role=dialog]');
    set(dialog.querySelector('#mapping-title'), 'Checkout');
    set(dialog.querySelector('#mapping-page'), '/checkout');
    set(dialog.querySelector('#mapping-url'), 'https://app.example.com/checkout');
    const inputs = dialog.querySelectorAll('.endpoint-editor-row input');
    set(inputs[0], '/api/checkout');
    set(inputs[1], 'Place an order');
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Add endpoint')
      .click();
    return true;
  })()`);
  await sleep(400);
  await evaluate(`(() => {
    const set = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const dialog = document.querySelector('[role=dialog]');
    const rows = dialog.querySelectorAll('.endpoint-editor-row');
    const inputs = rows[1].querySelectorAll('input');
    set(inputs[0], '/api/checkout/confirm');
    set(inputs[1], 'Confirm payment');
    const select = rows[1].querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'POST');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    dialog.querySelector('#mapping-service') && set(dialog.querySelector('#mapping-service'), 'checkout-api');
    return true;
  })()`);
  await sleep(400);
  await shot('graph-form');
  await evaluate(`(() => {
    const close = document.querySelector('[role=dialog] button[title]');
    if (close) close.click();
    return true;
  })()`);
  await sleep(400);
  await navigate(`/projects/${projectId}/verification`);
  await shot('verification');
  await evaluate(`(() => {
    const card = document.querySelectorAll('.verification-step')[7];
    const button = [...card.querySelectorAll('button')].find((b) => /Set scope/i.test(b.textContent));
    button.click();
    return true;
  })()`);
  await sleep(500);
  await shot('verification-scope');
  await evaluate(`(() => {
    const close = document.querySelector('[role=dialog] button[title]');
    if (close) close.click();
    return true;
  })()`);
  await sleep(400);
  await navigate(`/projects/${projectId}/assets`);
  await shot('assets');
  await navigate(`/projects/${projectId}/risks`);
  await shot('risks');
  await navigate(`/projects/${projectId}/settings`);
  await shot('settings');
  await navigate(`/projects/${projectId}/report`);
  await shot('report');
} finally {
  ws.close();
  chrome.kill('SIGTERM');
}

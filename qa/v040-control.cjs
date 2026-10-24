/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const runtime = require('./runtime.cjs');
const root = path.resolve(__dirname, '..'), extension = path.join(root, 'extension');
const files = ['control.js', 'store.js', 'background.js'];
const source = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(extension, name), 'utf8')]));
const key = 'miorning-text-float:v4:control', messageType = 'MIORNING_TEXT_FLOAT_CONTROL_V1';
const clone = value => JSON.parse(JSON.stringify(value));
const records = {}, events = {}, registered = new Map(), injected = [], opened = [];
const changes = [];
let failure = null, messageHandler;
const listen = name => ({addListener(listener) { events[name] = listener; }});
const tabs = [{id: 1, url: 'https://old.example', windowId: 1}, {id: 2, url: 'https://fresh.example', windowId: 1}];
const chrome = {
  runtime: {id: 'isolated-control-test', lastError: null, onInstalled: listen('installed'), onStartup: listen('startup'), onMessage: {addListener(listener) { messageHandler = listener; }}, getURL: name => `chrome-extension://isolated-control-test/${name}`, openOptionsPage(callback) { opened.push('options'); callback(); }},
  action: {onClicked: listen('clicked')},
  storage: {local: {
    get(keys, callback) { setImmediate(() => { const list = keys == null ? Object.keys(records) : Array.isArray(keys) ? keys : [keys]; callback(Object.fromEntries(list.filter(name => Object.hasOwn(records, name)).map(name => [name, clone(records[name])]))); }); },
    set(values, callback) { setImmediate(() => { if (failure) { chrome.runtime.lastError = {message: failure}; failure = null; callback(); chrome.runtime.lastError = null; return; } const event = {}; for (const [name, value] of Object.entries(values)) { event[name] = {newValue: clone(value), ...(records[name] ? {oldValue: clone(records[name])} : {})}; records[name] = clone(value); } changes.push(event); callback(); }); },
    remove(keys, callback) { keys.forEach(name => delete records[name]); callback(); }
  }},
  scripting: {
    getRegisteredContentScripts(_options, callback) { callback([...registered.values()]); },
    unregisterContentScripts({ids}, callback) { ids.forEach(id => registered.delete(id)); callback(); },
    executeScript(args, callback) { injected.push(args); callback([{result: args.files ? null : args.target.tabId === 1}]); }
  },
  tabs: {
    query(query, callback) { callback(typeof query.url === 'string' ? tabs.filter(tab => tab.url.startsWith('chrome-extension:')) : tabs); },
    create(options, callback) { opened.push(options); callback(options); },
    update(id, options, callback) { opened.push({id, ...options}); callback(options); }
  },
  windows: {update(id, options, callback) { callback({id, ...options}); }}
};
function worker() {
  const context = vm.createContext({chrome, crypto, console, URL, Uint8Array, TextEncoder});
  context.importScripts = (...names) => names.forEach(name => vm.runInContext(source[name], context));
  vm.runInContext(source['background.js'], context);
  return context;
}
let workerContext = worker();
const perform = (op, payload = {}) => workerContext.MiorningTextFloatControlBackend.perform(op, payload).then(clone);
const store = (op, payload = {}) => workerContext.MiorningTextFloatStoreBackend.perform(op, payload).then(clone);
const shortcut = {code: 'KeyU', alt: true, ctrl: false, shift: true, meta: false};
const tests = [];
async function test(name, task) {
  const start = Date.now();
  try { await task(); tests.push({name, status: 'passed', milliseconds: Date.now() - start}); console.log('PASS ' + name); }
  catch (error) { tests.push({name, status: 'failed', error: runtime.sanitize(error.stack || error.message)}); throw error; }
}
const send = (type, op, payload, sender = {id: chrome.runtime.id}) => new Promise(resolve => { messageHandler({type, op, payload}, sender, resolve); });

async function unit() {
  await test('manifest defaults to every ordinary HTTP and HTTPS page, without duplicate command shortcuts', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']);
    assert.deepEqual(manifest.content_scripts[0].matches, manifest.host_permissions);
    assert.equal(manifest.commands, undefined); assert.equal(manifest.optional_host_permissions, undefined);
    assert.deepEqual(manifest.content_scripts[0].js, ['control.js', 'store.js', 'shell.js', 'references.js', 'menus.js', 'dock.js', 'content.js']);
    for (const file of manifest.content_scripts[0].js) assert.ok(fs.existsSync(path.join(extension, file)));
  });
  await test('fresh control state is enabled with Alt+K and no read-induced storage write', async () => {
    const state = await perform('getState');
    assert.equal(state.enabled, true); assert.equal(state.shortcut.code, 'KeyK'); assert.equal(state.shortcut.alt, true);
    assert.deepEqual(state.dock, {edge: 'right', ratio: .5}); assert.equal(records[key], undefined);
  });
  await test('concurrent global state, custom shortcut, and dock writes merge without lost settings', async () => {
    await Promise.all([perform('setEnabled', {enabled: false}), perform('saveShortcut', {shortcut}), perform('saveDock', {dock: {edge: 'left', ratio: .3}})]);
    const state = await perform('getState'); assert.equal(state.enabled, false); assert.deepEqual(state.shortcut, shortcut); assert.deepEqual(state.dock, {edge: 'left', ratio: .3}); assert.equal(state.revision, 3);
  });
  await test('concurrent toggles serialize and preserve parity', async () => {
    await Promise.all(Array.from({length: 31}, () => perform('toggle')));
    const state = await perform('getState'); assert.equal(state.enabled, true); assert.equal(state.revision, 34);
  });
  await test('plain keys, malformed shortcuts, and common reserved browser combinations are rejected', async () => {
    const before = clone(records[key]);
    for (const value of [{...shortcut, alt: false, shift: false}, {...shortcut, code: 'Escape'}, {...shortcut, alt: 'true'}, {...shortcut, code: 'KeyW', ctrl: true, alt: false}, {...shortcut, code: 'F4'}]) await assert.rejects(perform('saveShortcut', {shortcut: value}));
    await assert.rejects(perform('setEnabled', {enabled: 'false'}));
    await assert.rejects(perform('saveDock', {dock: {edge: 'middle', ratio: 1}}));
    assert.deepEqual(records[key], before);
  });
  await test('failed persistence rejects without publishing a changed state and the queue recovers', async () => {
    const before = clone(records[key]), count = changes.length;
    failure = 'simulated control write failure';
    await assert.rejects(perform('toggle'), /simulated/);
    assert.deepEqual(records[key], before); assert.equal(changes.length, count);
    await perform('toggle'); assert.equal((await perform('getState')).enabled, false);
  });
  await test('service worker restart preserves paused state shortcut and dock position', async () => {
    const before = await perform('getState'); workerContext = worker(); assert.deepEqual(await perform('getState'), before);
  });
  await test('control messages reject another extension and accept our own content-script sender', async () => {
    assert.equal((await send(messageType, 'toggle', {}, {id: 'other-extension'})).ok, false);
    const response = await send(messageType, 'getState', {}, {id: chrome.runtime.id, url: 'https://fresh.example'});
    assert.equal(response.ok, true); assert.equal(response.value.enabled, false);
  });
  await test('upgrade unregisters only old site scripts while preserving histories and original preferences', async () => {
    registered.set('mtf-site-old', {id: 'mtf-site-old'}); registered.set('unrelated-script', {id: 'unrelated-script'});
    records['miorning-text-float:v2:sites'] = [{origin: 'https://old.example', enabled: false}];
    await store('saveSettings', {settings: {width: 800, fontSize: 64, theme: 'dark'}});
    const field = JSON.stringify(['https://old.example', '/', 'test']);
    await store('load', {key: field, initialSnapshot: {kind: 'text', value: 'preserve saved text'}});
    const before = clone(records);
    await events.installed({reason: 'update'});
    assert.equal(registered.has('mtf-site-old'), false); assert.equal(registered.has('unrelated-script'), true); assert.deepEqual(records, before);
    const files = injected.filter(item => item.files); assert.equal(files.length, 1); assert.equal(files[0].target.tabId, 2);
  });
  await test('toolbar opens settings and known deep links are bounded to options page', async () => {
    await events.clicked(); assert.equal(opened.at(-1), 'options');
    await send('MIORNING_TEXT_FLOAT_OPEN_OPTIONS', '', {section: 'cache'}); assert.equal(opened.at(-1).url, 'chrome-extension://isolated-control-test/options.html#cache');
    await send('MIORNING_TEXT_FLOAT_OPEN_OPTIONS', '', {section: 'https://outside.example'}); assert.equal(opened.at(-1), 'options');
  });
  await test('removed keepText preference is ignored while sizes and themes survive normal setting saves', async () => {
    records['miorning-text-float:v2:settings'].keepText = true;
    const before = await store('getSettings'); assert.equal(Object.hasOwn(before, 'keepText'), false); assert.equal(before.fontSize, 64);
    await store('saveSettings', {settings: {theme: 'light', keepText: true}});
    assert.equal(Object.hasOwn(records['miorning-text-float:v2:settings'], 'keepText'), false); assert.equal(records['miorning-text-float:v2:settings'].width, 800);
  });
  await test('cache accounting includes global preferences and selective clear preserves controls', async () => {
    const state = clone(records[key]), usage = await store('cacheUsage');
    assert.ok(usage.preferencesBytes >= Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(state)));
    await store('clearCache', {origins: ['https://old.example']}); assert.deepEqual(records[key], state); assert.equal((await store('cacheUsage')).sites.length, 0);
  });
  const client = vm.createContext({document: {}, chrome: {runtime: {id: 'isolated', sendMessage() { throw new Error('Extension context invalidated'); }}}, console});
  vm.runInContext(source['control.js'], client);
  const api = client.MiorningTextFloatControl;
  await test('shortcut matching requires exact modifiers and ignores IME repeat and AltGraph', async () => {
    const event = {code: 'KeyU', altKey: true, shiftKey: true};
    assert.equal(api.matchesShortcut(event, shortcut), true);
    for (const patch of [{ctrlKey: true}, {shiftKey: false}, {repeat: true}, {isComposing: true}, {keyCode: 229}, {getModifierState: () => true}]) assert.equal(api.matchesShortcut({...event, ...patch}, shortcut), false);
    assert.equal(api.formatShortcut(shortcut), 'Alt + Shift + U');
    assert.deepEqual(clone(api.shortcutFromEvent(event)), shortcut);
  });
  await test('invalidated extension control rejects and never falls back to webpage storage', async () => {
    await assert.rejects(api.getState(), /invalidated/);
    await assert.rejects(api.toggle(), /invalidated/);
  });
}

async function browserTests() {
  const {chromium} = require('playwright');
  const temporary = runtime.temporaryDirectory('temporary-v040-control-');
  let context;
  try {
    context = await chromium.launchPersistentContext(temporary, {headless: true, ...runtime.browserOptions(chromium, true), args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]});
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const base = worker.url().replace(/\/[^/]*$/, '');
    const fixture = '<!doctype html><html><head><title>Control isolated fixture</title></head><body style="padding:50px"><label>Prompt<textarea id="prompt" style="width:320px;height:100px">Original prompt</textarea></label></body></html>';
    await context.route(/^https?:\/\//, route => route.fulfill({contentType: 'text/html; charset=utf-8', body: fixture}));
    const page = await context.newPage(), other = await context.newPage();
    await page.goto('https://global-a.example/editor'); await other.goto('http://global-b.example/editor');
    const tabs = await worker.evaluate(() => chrome.tabs.query({url: ['http://*/*', 'https://*/*']}));
    const firstId = tabs.find(tab => tab.url === 'https://global-a.example/editor').id;
    const otherId = tabs.find(tab => tab.url === 'http://global-b.example/editor').id;
    const inTab = (tabId, action, payload = null) => worker.evaluate(async ({tabId, action, payload}) => (await chrome.scripting.executeScript({target: {tabId}, func: async (action, payload) => {
      const control = globalThis.MiorningTextFloatControl;
      if (action === 'listen') { globalThis.qaControlEvents = []; control.subscribe(state => globalThis.qaControlEvents.push(state)); return await control.getState(); }
      if (action === 'events') return globalThis.qaControlEvents;
      if (action === 'databases') return {idb: await indexedDB.databases(), local: Object.keys(localStorage)};
      if (action === 'editor') return globalThis.MiorningTextFloat?.getState();
      return await control[action](payload);
    }, args: [action, payload]}))[0].result, {tabId, action, payload});
    async function waitState(tabId, enabled) {
      for (let i = 0; i < 100; i++) { if ((await inTab(tabId, 'editor'))?.enabled === enabled) return; await new Promise(resolve => setTimeout(resolve, 30)); }
      assert.fail('content enabled state did not synchronize');
    }
    await test('real production MV3 injects into two previously unknown HTTP and HTTPS sites', async () => {
      await page.locator('.miorning-text-float-dock').waitFor({state: 'attached'});
      await other.locator('.miorning-text-float-dock').waitFor({state: 'attached'});
      assert.equal((await inTab(firstId, 'listen')).enabled, true); assert.equal((await inTab(otherId, 'listen')).enabled, true);
      await page.locator('#prompt').click(); await page.locator('.miorning-text-float-shell').waitFor();
    });
    const options = await context.newPage(); await options.goto(base + '/options.html');
    await test('dock settings links reuse the real options tab and select shortcut or cache section', async () => {
      await inTab(firstId, 'openOptions', 'cache');
      await options.waitForURL(base + '/options.html#cache');
      await inTab(firstId, 'openOptions', 'shortcut');
      await options.waitForURL(base + '/options.html#shortcut');
      const matching = (await worker.evaluate(() => chrome.tabs.query({}))).filter(tab => tab.url?.startsWith(base + '/options.html'));
      assert.equal(matching.length, 1);
    });
    await test('settings pauses every current tab and restores live original input', async () => {
      await options.locator('#global-toggle[aria-checked=true]').click();
      await waitState(firstId, false); await waitState(otherId, false);
      await page.locator('.miorning-text-float-shell').waitFor({state: 'detached'});
      assert.equal(await page.locator('#prompt').inputValue(), 'Original prompt');
      assert.equal((await inTab(firstId, 'events')).at(-1).enabled, false); assert.equal((await inTab(otherId, 'events')).at(-1).enabled, false);
      await other.locator('#prompt').click(); assert.equal(await other.locator('.miorning-text-float-shell').count(), 0);
    });
    await test('new tabs and reloads inherit a globally paused state without losing the dock', async () => {
      const fresh = await context.newPage(); await fresh.goto('https://global-c.example/editor');
      await fresh.locator('.miorning-text-float-dock').waitFor({state: 'attached'}); await fresh.locator('#prompt').click();
      assert.equal(await fresh.locator('.miorning-text-float-shell').count(), 0);
      await page.reload(); await page.locator('.miorning-text-float-dock').waitFor({state: 'attached'}); await page.locator('#prompt').click();
      assert.equal(await page.locator('.miorning-text-float-shell').count(), 0); await fresh.close();
    });
    await test('Alt+K resumes globally, a recorded custom shortcut replaces it in every tab', async () => {
      await page.keyboard.press('Alt+k'); await waitState(firstId, true); await waitState(otherId, true);
      await options.locator('#shortcut-record').click(); await options.locator('#shortcut-input').press('Alt+Shift+u');
      await options.waitForFunction(() => document.querySelector('#shortcut-feedback').textContent.includes('已保存'));
      assert.equal(await options.locator('#shortcut-input').inputValue(), 'Alt + Shift + U');
      await other.locator('body').click({position: {x: 10, y: 10}}); await other.keyboard.press('Alt+k');
      assert.equal((await inTab(otherId, 'getState')).enabled, true);
      await other.keyboard.press('Alt+Shift+u'); await waitState(firstId, false); await waitState(otherId, false);
      await other.keyboard.press('Alt+Shift+u'); await waitState(firstId, true); await waitState(otherId, true);
    });
    await test('shortcut recorder cancels with Escape and refuses unmodified or reserved keys', async () => {
      await options.locator('#shortcut-record').click(); await options.locator('#shortcut-input').press('x');
      assert.match(await options.locator('#shortcut-feedback').innerText(), /至少搭配/);
      await options.locator('#shortcut-input').press('Escape');
      assert.equal(await options.locator('#shortcut-input').inputValue(), 'Alt + Shift + U');
      await options.locator('#shortcut-reset').click();
      await options.waitForFunction(() => document.querySelector('#shortcut-input').value === 'Alt + K');
      await options.reload(); assert.equal(await options.locator('#shortcut-input').inputValue(), 'Alt + K');
    });
    await test('real selective cache clear requires second confirmation and keeps controls and other origins', async () => {
      await worker.evaluate(async () => {
        const store = MiorningTextFloatStoreBackend;
        for (const origin of ['https://cache-a.example', 'https://cache-b.example']) await store.perform('load', {key: JSON.stringify([origin, '/', 'input']), initialSnapshot: {kind: 'text', value: 'isolated cache fixture'}});
      });
      await options.locator('#cache-refresh').click();
      await options.locator('.cache-site input[value="https://cache-a.example"]').check();
      await options.locator('#cache-clear').click(); assert.equal(await options.locator('#cache-confirm').evaluate(el => el.open), true);
      await options.locator('#cache-cancel').click();
      assert.equal(await options.locator('.cache-site input[value="https://cache-a.example"]').count(), 1);
      await options.locator('#cache-clear').click(); await options.locator('#cache-confirm-clear').click();
      await options.waitForFunction(() => document.querySelector('#cache-feedback').textContent.includes('已清空'));
      assert.equal(await options.locator('.cache-site input[value="https://cache-a.example"]').count(), 0);
      assert.equal(await options.locator('.cache-site input[value="https://cache-b.example"]').count(), 1);
      assert.equal((await inTab(firstId, 'getState')).enabled, true);
    });
    await test('production extension creates no prompt or control fallback in webpage storage', async () => {
      const data = await inTab(firstId, 'databases');
      assert.equal(data.idb.some(item => item.name?.includes('miorning')), false);
      assert.equal(data.local.some(item => item.includes('miorning')), false);
      await options.screenshot({path: path.join(runtime.artifacts, 'v040-settings.png'), fullPage: true});
    });
  } finally { await context?.close(); runtime.removeTemporary(temporary); }
}

(async () => {
  await unit();
  if (!process.argv.includes('--unit-only')) await browserTests();
  const report = {suite: 'v040-control', status: 'passed', passed: tests.length, tests, scope: 'isolated worker and production manifest in disposable browser profile; no real user cache touched', sourceHashes: Object.fromEntries(['control.js', 'background.js', 'store.js', 'options.html', 'options.js', 'manifest.json'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(extension, name))).digest('hex')]))};
  fs.writeFileSync(path.join(runtime.artifacts, 'v040-control-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({suite: report.suite, passed: report.passed, status: report.status}, null, 2));
})().catch(error => { fs.writeFileSync(path.join(runtime.artifacts, 'v040-control-report.json'), JSON.stringify({suite: 'v040-control', status: 'failed', tests, error: runtime.sanitize(error.stack || error.message)}, null, 2)); console.error(runtime.sanitize(error.stack || error.message)); process.exitCode = 1; });

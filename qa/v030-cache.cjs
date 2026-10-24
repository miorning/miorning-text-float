/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const runtime = require('./runtime.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'extension/store.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const records = Object.create(null), prefix = 'miorning-text-float:v2:';
let failure, passed = 0;
const testResults = [];
const chrome = {runtime: {lastError: null}, storage: {local: {
  get(keys, callback) { setImmediate(() => { const list = keys == null ? Object.keys(records) : Array.isArray(keys) ? keys : [keys]; callback(Object.fromEntries(list.filter(key => Object.hasOwn(records, key)).map(key => [key, clone(records[key])]))); }); },
  set(values, callback) { setImmediate(() => { Object.assign(records, clone(values)); callback(); }); },
  remove(keys, callback) { setImmediate(() => { if (failure) { chrome.runtime.lastError = {message: failure}; failure = null; callback(); chrome.runtime.lastError = null; } else { keys.forEach(key => delete records[key]); callback(); } }); }
}}};
const context = vm.createContext({chrome, crypto, console, URL, TextEncoder, Uint8Array});
vm.runInContext(source, context);
const perform = (op, payload = {}, scope) => context.MiorningTextFloatStoreBackend.perform(op, payload, scope).then(clone);
const field = (origin, node) => JSON.stringify([origin, '/canvas?private-project=do-not-show', node, '', 'TEXTAREA|private-prompt']);
const a = field('https://a.example', 'one'), b = field('https://b.example', 'two');
const snap = value => ({kind: 'text', value});
async function test(name, task) { await task(); passed++; testResults.push({name, status: 'passed'}); }

(async () => {
  let aDoc, bDoc, aDraft;
  await test('read-only epoch is origin-scoped and fences delayed initial loads across clear', async () => {
    const key = field('https://epoch.example', 'delayed');
    const epoch = await perform('getEpoch', {key}, 'https://epoch.example');
    assert.equal(epoch, 0); assert.equal((await perform('cacheUsage')).sites.length, 0);
    await assert.rejects(perform('getEpoch', {key}, 'https://other.example'), /当前网站/);
    await perform('clearCache', {origins: ['https://epoch.example']});
    assert.equal(await perform('getEpoch', {key}), 1);
    await assert.rejects(perform('load', {key, initialSnapshot: snap('must not return'), epoch}), /缓存已清空/);
    assert.equal((await perform('cacheUsage')).sites.length, 0);
  });
  await test('cache usage is exact JSON data bytes and never exposes prompt or route', async () => {
    await perform('saveSettings', {settings: {fontSize: 64, keepText: true, theme: 'light'}});
    records[`${prefix}sites`] = [{origin: 'https://b.example', enabled: true}];
    records['unrelated-cache'] = 'must stay';
    aDoc = await perform('load', {key: a, initialSnapshot: snap('甲的提示词')});
    bDoc = await perform('load', {key: b, initialSnapshot: snap('乙的提示词')});
    aDoc = await perform('createDraft', {key: a, input: {snapshot: snap('甲的草稿'), parentId: aDoc.versions[0].id, ownerToken: 'a', epoch: aDoc.epoch}});
    aDraft = aDoc.versions.at(-1);
    const usage = await perform('cacheUsage');
    assert.equal(usage.sites.length, 2); assert.equal(usage.sites[0].drafts, 1);
    const key = `${prefix}history:${encodeURIComponent(a)}`;
    assert.equal(usage.sites[0].bytes, Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(records[key])));
    assert.doesNotMatch(JSON.stringify(usage), /private-project|private-prompt|提示词|草稿/);
    assert.equal(usage.totalBytes, usage.historyBytes + usage.preferencesBytes);
  });
  await test('content requests are limited to the same origin', async () => {
    const usage = await perform('cacheUsage', {}, 'https://a.example');
    assert.deepEqual(usage.sites.map(site => site.origin), ['https://a.example']);
    assert.equal(usage.preferencesBytes, 0);
    await assert.rejects(perform('load', {key: b, initialSnapshot: snap('')}, 'https://a.example'), /当前网站/);
    await assert.rejects(perform('clearCache', {origins: ['https://b.example']}, 'https://a.example'), /当前网站/);
  });
  await test('selected clear preserves other origins preferences site permission records and foreign data', async () => {
    const before = await perform('getSettings');
    const result = await perform('clearCache', {origins: ['https://a.example']});
    assert.equal(result.removedDocuments, 1);
    assert.deepEqual((await perform('cacheUsage')).sites.map(site => site.origin), ['https://b.example']);
    assert.deepEqual(await perform('getSettings'), before);
    assert.equal(records[`${prefix}sites`][0].enabled, true);
    assert.equal(records['unrelated-cache'], 'must stay');
    assert.deepEqual(await perform('load', {key: b, initialSnapshot: snap('')}), bDoc);
  });
  await test('in-flight and stale sessions cannot recreate cleared histories', async () => {
    await assert.rejects(perform('updateDraft', {key: a, input: {id: aDraft.id, snapshot: snap('revive'), ownerToken: 'a', epoch: aDoc.epoch}}), /缓存已清空/);
    await assert.rejects(perform('createDraft', {key: a, input: {snapshot: snap('revive'), ownerToken: 'a', parentId: null}}), /缓存已清空/);
    await assert.rejects(perform('load', {key: a, initialSnapshot: snap('revive'), epoch: aDoc.epoch}), /缓存已清空/);
    assert.equal((await perform('cacheUsage')).sites.length, 1);
    const reopened = await perform('load', {key: a, initialSnapshot: snap('')});
    assert.equal(reopened.epoch, 1); assert.equal(reopened.nextNumber, 1);
    const fresh = await perform('createDraft', {key: a, input: {snapshot: snap('fresh'), ownerToken: 'fresh', epoch: reopened.epoch}});
    assert.equal(fresh.versions[0].number, 1);
    const pendingClear = perform('clearCache', {origins: ['https://a.example']});
    const pendingWrite = perform('createDraft', {key: a, input: {snapshot: snap('queued revive'), ownerToken: 'old', epoch: reopened.epoch}});
    await pendingClear; await assert.rejects(pendingWrite, /缓存已清空/);
  });
  await test('failed deletion rejects, fences old writers, and safely retries', async () => {
    failure = 'remove failed';
    await assert.rejects(perform('clearCache', {origins: ['https://b.example']}), /remove failed/);
    assert.equal((await perform('cacheUsage')).sites.length, 1);
    await assert.rejects(perform('createDraft', {key: b, input: {snapshot: snap('late'), ownerToken: 'old', epoch: bDoc.epoch}}), /缓存已清空/);
    await perform('clearCache', {origins: ['https://b.example']});
    assert.equal((await perform('cacheUsage')).sites.length, 0);
  });
  await test('legacy data is grouped privately and invalid requests never clear data', async () => {
    records[`${prefix}history:%invalid`] = {opaque: 'private legacy value'};
    const usage = await perform('cacheUsage');
    assert.equal(usage.sites[0].origin, 'legacy-unclassified');
    assert.doesNotMatch(JSON.stringify(usage), /private legacy|%invalid/);
    for (const origins of [[], ['https://user:secret@example.com'], ['https://a.example/path'], ['*']]) await assert.rejects(perform('clearCache', {origins}));
    assert.equal((await perform('cacheUsage')).sites.length, 1);
    await perform('clearCache', {origins: ['legacy-unclassified']});
    assert.equal((await perform('cacheUsage')).sites.length, 0);
  });
  await test('font size supports 64 and themes persist without unbounded values', async () => {
    await perform('saveSettings', {settings: {fontSize: 80, theme: 'dark'}});
    assert.equal((await perform('getSettings')).fontSize, 64);
    assert.equal((await perform('getSettings')).theme, 'dark');
    await assert.rejects(perform('saveSettings', {settings: {theme: 'invalid'}}), /主题/);
  });

  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1);
    if (name === 'blank') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><body>Isolated cache test</body></html>'); return; }
    const target = path.resolve(root, 'extension', name);
    if (!target.startsWith(path.join(root, 'extension') + path.sep) || !fs.existsSync(target)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(fs.readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, ...runtime.browserOptions(chromium)});
    const session = await browser.newContext();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await session.newPage(), other = await session.newPage();
    for (const target of [page, other]) { await target.goto(origin + '/blank'); await target.addScriptTag({content: source}); }
    await test('IndexedDB starts blank version one and broadcasts selective clear across pages', async () => {
      await other.evaluate(() => { window.clearEvents = []; MiorningTextFloatStore.onCacheCleared(event => clearEvents.push(event)); });
      await page.evaluate(async ({a, b}) => {
        const store = MiorningTextFloatStore;
        window.previewEpoch = await store.getEpoch(a);
        window.cacheA = await store.load(a, {kind: 'rich', value: '<p><br></p>'});
        window.cacheB = await store.load(b, {kind: 'text', value: 'keep me'});
        window.cacheA = await store.createDraft(a, {snapshot: {kind: 'text', value: 'first'}, ownerToken: 'preview', epoch: cacheA.epoch});
        await store.saveSettings({fontSize: 64, theme: 'light', keepText: true});
      }, {a, b});
      assert.equal(await page.evaluate(() => cacheA.versions[0].number), 1);
      assert.equal(await page.evaluate(() => previewEpoch), 0);
      await page.evaluate(a => MiorningTextFloatStore.clearCache(['https://a.example']), a);
      await other.waitForFunction(() => clearEvents.length === 1);
      const state = await page.evaluate(async ({a, b}) => {
        let stale = '';
        try { await MiorningTextFloatStore.updateDraft(a, {id: cacheA.versions[0].id, ownerToken: 'preview', snapshot: {kind: 'text', value: 'revive'}, epoch: cacheA.epoch}); } catch (error) { stale = error.message; }
        let staleLoad = '';
        try { await MiorningTextFloatStore.load(a, {kind: 'text', value: 'old initial'}, previewEpoch); } catch (error) { staleLoad = error.message; }
        return {stale, staleLoad, epoch: await MiorningTextFloatStore.getEpoch(a), usage: await MiorningTextFloatStore.cacheUsage(), settings: await MiorningTextFloatStore.getSettings(), b: await MiorningTextFloatStore.load(b, {kind: 'text', value: ''})};
      }, {a, b});
      assert.match(state.stale, /缓存已清空/); assert.match(state.staleLoad, /缓存已清空/); assert.equal(state.epoch, 1); assert.deepEqual(state.usage.sites.map(site => site.origin), ['https://b.example']);
      assert.equal(state.settings.theme, 'light'); assert.equal(state.b.versions[0].snapshot.value, 'keep me');
    });
    await test('settings requires a second explicit confirmation and cancellation preserves data', async () => {
      await page.goto(origin + '/options.html');
      await page.waitForFunction(() => document.querySelector('.cache-site input'));
      await page.evaluate(async () => MiorningTextFloatStore.load(JSON.stringify(['https://c.example', '/', 'third']), {kind: 'text', value: 'not selected'}));
      await page.locator('#cache-refresh').click();
      await page.waitForFunction(() => document.querySelectorAll('.cache-site input').length === 2);
      await page.locator('.cache-site input[value="https://b.example"]').check();
      await page.locator('#cache-clear').click();
      assert.equal(await page.locator('#cache-confirm').evaluate(dialog => dialog.open), true);
      assert.equal(await page.evaluate(async () => (await MiorningTextFloatStore.cacheUsage()).sites.length), 2);
      await page.locator('#cache-cancel').click();
      assert.equal(await page.evaluate(async () => (await MiorningTextFloatStore.cacheUsage()).sites.length), 2);
      await page.locator('#cache-clear').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(async () => (await MiorningTextFloatStore.cacheUsage()).sites.length), 2);
      await page.locator('#cache-clear').click();
      await page.locator('#cache-confirm-clear').click();
      await page.waitForFunction(() => !document.querySelector('#cache-confirm').open && document.querySelector('#cache-feedback').textContent.includes('已清空'));
      assert.deepEqual(await page.evaluate(async () => (await MiorningTextFloatStore.cacheUsage()).sites.map(site => site.origin)), ['https://c.example']);
      assert.equal(await page.evaluate(async () => (await MiorningTextFloatStore.getSettings()).fontSize), 64);
      assert.equal(await page.locator('#cache-clear').isDisabled(), true);
      await page.screenshot({path: path.join(runtime.artifacts, 'v030-cache-settings.png'), fullPage: true});
    });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  const report = {suite: 'v030-cache', passed, status: 'passed', tests: testResults, scope: 'isolated worker, IndexedDB, and settings confirmation; no real user cache touched'};
  fs.writeFileSync(path.join(runtime.artifacts, 'v030-cache-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({suite: report.suite, passed, status: report.status, scope: report.scope}, null, 2));
})().catch(error => {
  fs.writeFileSync(path.join(runtime.artifacts, 'v030-cache-report.json'), JSON.stringify({suite: 'v030-cache', passed, status: 'failed', tests: testResults, error: runtime.sanitize(error.stack || error.message)}, null, 2) + '\n');
  console.error(runtime.sanitize(error.stack || error.message)); process.exitCode = 1;
});

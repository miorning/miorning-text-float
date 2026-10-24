/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sources = Object.fromEntries(['store.js', 'background.js'].map(file => [file, fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8')]));
const storage = {};
const registered = new Map();
const granted = new Set();
const events = {};
let messageHandler, failure;
const clone = value => JSON.parse(JSON.stringify(value));
const event = name => ({addListener(fn) { events[name] = fn; }});
function reply(method, callback, result, mutation = () => {}) {
  setImmediate(() => {
    if (failure === method) {
      chrome.runtime.lastError = {message: `${method} simulated failure`};
      failure = null;
      callback();
      chrome.runtime.lastError = null;
    } else { mutation(); callback(result); }
  });
}
const chrome = {
  runtime: {id: 'extension-test', lastError: null, onMessage: {addListener(fn) { messageHandler = fn; }}, onInstalled: event('installed'), onStartup: event('startup'), openOptionsPage: callback => reply('openOptionsPage', callback)},
  action: {onClicked: event('clicked')},
  storage: {local: {
    get(key, callback) { reply('get', callback, Object.hasOwn(storage, key) ? {[key]: clone(storage[key])} : {}); },
    set(values, callback) { reply('set', callback, undefined, () => Object.assign(storage, clone(values))); }
  }},
  permissions: {
    contains({origins}, callback) { reply('contains', callback, origins.every(origin => granted.has(origin))); },
    remove({origins}, callback) { reply('remove', callback, true, () => origins.forEach(origin => granted.delete(origin))); },
    onAdded: event('added'), onRemoved: event('removed')
  },
  scripting: {
    getRegisteredContentScripts(options, callback) { reply('getRegisteredContentScripts', callback, [...registered.values()].map(clone)); },
    registerContentScripts(scripts, callback) { reply('registerContentScripts', callback, undefined, () => scripts.forEach(script => registered.set(script.id, clone(script)))); },
    updateContentScripts(scripts, callback) { reply('updateContentScripts', callback, undefined, () => scripts.forEach(script => registered.set(script.id, clone(script)))); },
    unregisterContentScripts({ids}, callback) { reply('unregisterContentScripts', callback, undefined, () => ids.forEach(id => registered.delete(id))); }
  }
};
const context = vm.createContext({chrome, crypto, URL, console, Uint8Array});
context.importScripts = name => vm.runInContext(sources[name], context);
vm.runInContext(sources['background.js'], context);
const send = (op, payload = {}) => new Promise((resolve, reject) => {
  const async = messageHandler({type: 'MIORNING_TEXT_FLOAT_SITES_V1', op, payload}, {id: chrome.runtime.id}, result => {
    if (result.ok) resolve(clone(result.value)); else reject(new Error(result.error));
  });
  assert.equal(async, true);
});
let passed = 0;
async function test(name, fn) { await fn(); passed++; }

(async () => {
  await test('empty state preserves built in LibTV defaults', async () => {
    const state = await send('list');
    assert.equal(state.sites.length, 0);
    assert.deepEqual(state.defaults, ['https://www.liblib.tv', 'https://liblib.tv']);
    await assert.rejects(send('add', {origin: 'https://www.liblib.tv/canvas'}), /默认支持/);
  });
  await test('ungranted origin is never saved or injected', async () => {
    await assert.rejects(send('add', {origin: 'https://canvas.example/page'}), /尚未授权/);
    assert.equal(registered.size, 0);
    assert.equal((await send('list')).sites.length, 0);
  });
  await test('specific authorized URL normalizes origin and registers four files', async () => {
    granted.add('https://canvas.example/*');
    const state = await send('add', {origin: 'https://canvas.example/path?query=test#node'});
    assert.equal(state.sites[0].origin, 'https://canvas.example');
    assert.equal(state.sites[0].registered, true);
    const script = [...registered.values()][0];
    assert.deepEqual(script.matches, ['https://canvas.example/*']);
    assert.deepEqual(script.js, ['store.js', 'shell.js', 'references.js', 'content.js']);
    assert.equal(script.persistAcrossSessions, true);
    assert.equal(script.allFrames, false);
  });
  await test('same origin deduplicates despite different paths', async () => {
    const state = await send('add', {origin: 'https://canvas.example/other'});
    assert.equal(state.sites.length, 1);
    assert.equal(registered.size, 1);
  });
  await test('wildcards credentials and unsupported URL schemes are rejected', async () => {
    for (const origin of ['https://*.example.com', 'https://*/*', 'https://user:password@example.com', 'ftp://example.com', 'file:///tmp/test.html', 'chrome://extensions']) {
      await assert.rejects(send('add', {origin}), /支持|格式/);
    }
    assert.equal((await send('list')).sites.length, 1);
  });
  await test('disable unregisters but keeps permission and saved site', async () => {
    const state = await send('setEnabled', {origin: 'https://canvas.example', enabled: false});
    assert.equal(state.sites[0].enabled, false);
    assert.equal(state.sites[0].registered, false);
    assert.equal(state.sites[0].granted, true);
    assert.equal(registered.size, 0);
  });
  await test('enable registers again', async () => {
    const state = await send('setEnabled', {origin: 'https://canvas.example', enabled: true});
    assert.equal(state.sites[0].registered, true);
  });
  await test('revoked permission removes registered script and reports state', async () => {
    granted.clear();
    await events.removed();
    const state = await send('list');
    assert.equal(state.sites[0].granted, false);
    assert.equal(state.sites[0].registered, false);
    assert.equal(registered.size, 0);
    await assert.rejects(send('setEnabled', {origin: 'https://canvas.example', enabled: true}), /撤销/);
  });
  await test('registration failure never marks a new site saved', async () => {
    granted.add('https://another.example/*');
    failure = 'registerContentScripts';
    await assert.rejects(send('add', {origin: 'https://another.example'}), /simulated failure/);
    assert.equal((await send('list')).sites.length, 1);
    assert.equal(registered.size, 0);
  });
  await test('storage failure rolls back successful registration', async () => {
    failure = 'set';
    await assert.rejects(send('add', {origin: 'https://another.example'}), /simulated failure/);
    assert.equal((await send('list')).sites.length, 1);
    assert.equal(registered.size, 0);
  });
  await test('startup synchronizes saved enabled and granted sites', async () => {
    granted.add('https://canvas.example/*');
    await events.startup();
    assert.equal(registered.size, 1);
  });
  await test('remove unregisters and revokes only that origin', async () => {
    const state = await send('remove', {origin: 'https://canvas.example'});
    assert.equal(state.sites.length, 0);
    assert.equal(registered.size, 0);
    assert.equal(granted.has('https://canvas.example/*'), false);
    assert.equal(granted.has('https://another.example/*'), true);
  });
  await test('revocation failure reports partial completion accurately', async () => {
    await send('add', {origin: 'https://another.example'});
    failure = 'remove';
    const state = await send('remove', {origin: 'https://another.example'});
    assert.equal(state.sites.length, 0);
    assert.equal(registered.size, 0);
    assert.match(state.warning, /网站已移除.*未能自动收回/);
    assert.equal(granted.has('https://another.example/*'), true);
  });
  await test('concurrent additions serialize without losing either website', async () => {
    granted.add('http://localhost:3196/*');
    const results = await Promise.all([send('add', {origin: 'https://another.example'}), send('add', {origin: 'http://localhost:3196/test'})]);
    assert.equal(results.at(-1).sites.length, 2);
    assert.equal(registered.size, 2);
  });
  console.log(JSON.stringify({suite: 'sites-unit', passed, status: 'passed'}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../extension/store.js'), 'utf8');
const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const storage = Object.create(null);
let failure = null, messageListener, injections = [];
const chrome = {
  runtime: {id: 'miorning-test-extension', lastError: null, onMessage: {addListener(fn) { messageListener = fn; }}},
  action: {onClicked: {addListener() {}}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}},
  scripting: {executeScript: async args => { injections.push(args); return [{result: null}]; }},
  storage: {local: {
    get(key, callback) { const keys = key == null ? Object.keys(storage) : Array.isArray(key) ? key : [key]; setImmediate(() => callback(Object.fromEntries(keys.filter(key => own(storage, key)).map(key => [key, clone(storage[key])])))); },
    set(values, callback) { setImmediate(() => {
      if (failure) { chrome.runtime.lastError = {message: failure}; failure = null; callback(); chrome.runtime.lastError = null; }
      else { for (const [key, value] of Object.entries(values)) storage[key] = clone(value); callback(); }
    }); }
  }}
};
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function worker() {
  const context = vm.createContext({chrome, crypto, console, Uint8Array, URL, TextEncoder});
  context.importScripts = (...names) => { for (const name of names) vm.runInContext(name === 'store.js' ? source : fs.readFileSync(path.join(__dirname, '../extension', name), 'utf8'), context); };
  vm.runInContext(background, context);
  return context.MiorningTextFloatStoreBackend;
}
let backend = worker();
const key = 'https://liblib.tv/project/123|node:one|prompt:main';
const key2 = 'https://liblib.tv/project/123|node:two|prompt:main';
const snap = value => ({kind: 'text', value});
const perform = (op, payload) => backend.perform(op, payload).then(clone);
let passed = 0;
async function test(name, fn) { await fn(); passed++; }

(async () => {
  let first, draft;
  await test('blank editors start with draft version one without an empty saved version', async () => {
    for (const [key, initialSnapshot] of [['empty-text', snap('')], ['empty-rich', {kind: 'rich', value: '<p><br></p>'}], ['whitespace', {kind: 'rich', value: '<div>&nbsp;\u200b</div>'}]]) {
      let doc = await perform('load', {key, initialSnapshot});
      assert.deepEqual(doc.versions, []); assert.equal(doc.nextNumber, 1);
      doc = await perform('createDraft', {key, input: {snapshot: snap('第一份内容'), ownerToken: 'first', parentId: null}});
      assert.equal(doc.versions[0].number, 1); assert.equal(doc.nextNumber, 2);
    }
  });
  await test('first load captures version one exactly once', async () => {
    first = await perform('load', {key, initialSnapshot: snap('原始内容')});
    assert.equal(first.versions[0].number, 1);
    assert.equal(first.versions[0].status, 'saved');
    const again = await perform('load', {key, initialSnapshot: snap('不可覆盖')});
    assert.deepEqual(again, first);
  });
  await test('draft has owner and stable sequence; commit removes owner', async () => {
    let doc = await perform('createDraft', {key, input: {snapshot: snap('编辑版'), parentId: first.versions[0].id, ownerToken: 'session-a'}});
    draft = doc.versions.at(-1);
    assert.equal(draft.number, 2);
    doc = await perform('updateDraft', {key, input: {id: draft.id, ownerToken: 'session-a', snapshot: snap('确认版'), commit: true}});
    assert.equal(doc.versions.at(-1).status, 'saved');
    assert.equal(doc.versions.at(-1).ownerToken, undefined);
    assert.deepEqual(doc.versions[0], first.versions[0]);
  });
  await test('saved versions are immutable', async () => {
    await assert.rejects(perform('updateDraft', {key, input: {id: draft.id, ownerToken: 'session-a', snapshot: snap('改写'), commit: false}}), /不可改写/);
  });
  await test('another session cannot change a draft', async () => {
    const doc = await perform('createDraft', {key, input: {snapshot: snap('草稿'), parentId: first.versions[0].id, ownerToken: 'session-a'}});
    draft = doc.versions.at(-1);
    await assert.rejects(perform('updateDraft', {key, input: {id: draft.id, ownerToken: 'session-b', snapshot: snap('抢改')}}), /另一个编辑会话/);
  });
  await test('worker restart retains history and settings', async () => {
    await perform('saveSettings', {settings: {width: 840, height: 500, left: 20, top: 30, fontSize: 20}});
    backend = worker();
    const doc = await perform('load', {key, initialSnapshot: snap('刷新后')});
    assert.equal(doc.versions.length, 3);
    assert.equal(doc.versions[2].snapshot.value, '草稿');
    assert.deepEqual(await perform('getSettings', {}), {width: 840, height: 500, left: 20, top: 30, fontSize: 20});
  });
  await test('independent fields do not share history', async () => {
    const doc = await perform('load', {key: key2, initialSnapshot: snap('另一个输入框')});
    assert.equal(doc.versions.length, 1);
    assert.equal(doc.versions[0].snapshot.value, '另一个输入框');
  });
  await test('parallel draft creation does not lose updates or duplicate numbers', async () => {
    const docs = await Promise.all(Array.from({length: 40}, (_, index) => perform('createDraft', {key, input: {snapshot: snap(`并发 ${index}`), parentId: first.versions[0].id, ownerToken: `session-${index}`}})));
    const doc = docs.at(-1);
    assert.equal(doc.versions.length, 43);
    assert.equal(new Set(doc.versions.map(item => item.number)).size, 43);
    assert.equal(doc.nextNumber, 44);
  });
  await test('deleting a version never renumbers or reuses numbers', async () => {
    const before = await perform('load', {key, initialSnapshot: snap('')});
    let doc = await perform('remove', {key, id: before.versions[1].id});
    assert.equal(doc.versions[1].number, 3);
    assert.equal(doc.nextNumber, 44);
    doc = await perform('createDraft', {key, input: {snapshot: snap('继续'), parentId: first.versions[0].id, ownerToken: 'new'}});
    assert.equal(doc.versions.at(-1).number, 44);
  });
  await test('quota failures reject and preserve the previous document', async () => {
    const before = await perform('load', {key, initialSnapshot: snap('')});
    failure = 'QUOTA_BYTES exceeded';
    await assert.rejects(perform('updateDraft', {key, input: {id: draft.id, ownerToken: 'session-a', snapshot: snap('写入失败'), commit: true}}), /QUOTA_BYTES/);
    assert.deepEqual(await perform('load', {key, initialSnapshot: snap('')}), before);
  });
  await test('a failed operation does not poison the serial queue', async () => {
    await perform('saveSettings', {settings: {fontSize: 23}});
    const settings = await perform('getSettings', {});
    assert.equal(settings.fontSize, 23);
    assert.equal(Object.hasOwn(settings, 'keepText'), false);
    assert.equal(settings.width, 840);
  });
  await test('parallel settings patches merge', async () => {
    await Promise.all([perform('saveSettings', {settings: {width: 900}}), perform('saveSettings', {settings: {height: 700}})]);
    const settings = await perform('getSettings', {});
    assert.equal(settings.width, 900);
    assert.equal(settings.height, 700);
  });
  await test('deleting all versions retains the next number across load', async () => {
    let doc = await perform('load', {key: key2, initialSnapshot: snap('')});
    doc = await perform('remove', {key: key2, id: doc.versions[0].id});
    assert.equal(doc.versions.length, 0);
    doc = await perform('load', {key: key2, initialSnapshot: snap('不会再次造v1')});
    assert.equal(doc.versions.length, 0);
    doc = await perform('createDraft', {key: key2, input: {snapshot: snap('重建'), parentId: null, ownerToken: 'new'}});
    assert.equal(doc.versions[0].number, 2);
  });
  await test('records support rich snapshots without losing reference markup', async () => {
    const value = '<p>参考 <span data-reference-id="image-1">@测试1</span></p>';
    const doc = await perform('load', {key: 'rich', initialSnapshot: {kind: 'rich', value}});
    assert.equal(doc.versions[0].snapshot.value, value);
  });
  await test('1100 additional versions have no application count cap', async () => {
    let doc;
    for (let index = 0; index < 1100; index++) doc = await perform('createDraft', {key: key2, input: {snapshot: snap(`长历史 ${index}`), parentId: null, ownerToken: 'long'}});
    assert.equal(doc.versions.length, 1101);
    assert.equal(doc.versions.at(-1).number, 1102);
    assert.equal(doc.nextNumber, 1103);
  });
  await test('corrupt existing records are never overwritten', async () => {
    const address = `miorning-text-float:v2:history:${encodeURIComponent('broken')}`;
    storage[address] = {unexpected: 'preserve me'};
    await assert.rejects(perform('load', {key: 'broken', initialSnapshot: snap('new')}), /无法读取/);
    assert.deepEqual(storage[address], {unexpected: 'preserve me'});
  });
  await test('message handler rejects unrelated extension senders', async () => {
    let response;
    const keepAlive = messageListener({type: 'MIORNING_TEXT_FLOAT_STORE_V2', op: 'getSettings', payload: {}}, {id: 'different-extension'}, value => { response = value; });
    assert.equal(keepAlive, false);
    assert.equal(response.ok, false);
  });
  await test('message handler waits for confirmed persistence', async () => {
    const response = await new Promise(resolve => {
      const keepAlive = messageListener({type: 'MIORNING_TEXT_FLOAT_STORE_V2', op: 'getSettings', payload: {}}, {id: chrome.runtime.id}, resolve);
      assert.equal(keepAlive, true);
    });
    assert.equal(response.ok, true);
    assert.equal(response.value.width, 900);
  });
  await test('content API rejects invalidated extension instead of switching stores', async () => {
    const context = vm.createContext({document: {}, chrome: {runtime: {id: 'extension', sendMessage() { throw new Error('Extension context invalidated.'); }}}, console});
    vm.runInContext(source, context);
    await assert.rejects(context.MiorningTextFloatStore.getSettings(), /invalidated/);
  });
  await test('invalid settings and missing parent fail without a write', async () => {
    await assert.rejects(perform('saveSettings', {settings: {width: -10}}), /无效/);
    await assert.rejects(perform('createDraft', {key, input: {snapshot: snap('orphan'), parentId: 'missing-parent', ownerToken: 'test'}}), /原版本已被删除/);
  });
  console.log(JSON.stringify({suite: 'store-unit', passed, status: 'passed', versionsRetained: 1101}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

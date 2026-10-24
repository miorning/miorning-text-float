/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {chromium} = require('playwright');
const runtime = require('./runtime.cjs');
const extension = path.resolve(__dirname, '../extension');
const scripts = ['control.js', 'store.js', 'shell.js', 'references.js', 'menus.js', 'dock.js'];
const tests = [], pageErrors = [];
let browser, context, page;
const fixture = '<!doctype html><html><head><meta charset="utf-8"><title>Isolated lifecycle fixture</title></head><body><textarea id="prompt" style="width:320px;height:100px"></textarea><textarea id="second"></textarea></body></html>';
async function start(beforeContent) {
  await context?.close(); context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: fixture}));
  page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('https://lifecycle.example/editor');
  for (const file of scripts) await page.addScriptTag({path: path.join(extension, file)});
  if (beforeContent) await page.evaluate(beforeContent);
  await page.addScriptTag({path: path.join(extension, 'content.js')});
}
async function open() { await page.evaluate(() => MiorningTextFloat.open(document.querySelector('#prompt'))); await page.locator('.miorning-text-float-shell').waitFor(); }
async function test(name, task) {
  try { await task(); tests.push({name, status: 'passed'}); console.log('PASS ' + name); }
  catch (error) { tests.push({name, status: 'failed', error: runtime.sanitize(error.stack || error.message)}); throw error; }
}
(async () => {
  browser = await chromium.launch({headless: true, ...runtime.browserOptions(chromium)});
  await test('destroy during delayed initial load cannot create an orphan editor or cache after completion', async () => {
    await start(() => {
      const original = MiorningTextFloatStore;
      const gate = new Promise(resolve => window.releaseLoad = resolve);
      window.MiorningTextFloatStore = {...original, async getEpoch(key) { window.loadStarted = true; await gate; return original.getEpoch(key); }};
    });
    await page.evaluate(() => { window.openTask = MiorningTextFloat.open(document.querySelector('#prompt')); });
    await page.waitForFunction(() => window.loadStarted);
    assert.equal(await page.evaluate(() => MiorningTextFloat.destroy()), true);
    await page.evaluate(async () => { releaseLoad(); await openTask; });
    assert.equal(await page.locator('.miorning-text-float-shell').count(), 0);
    assert.equal(await page.locator('.miorning-text-float-dock').count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.MiorningTextFloat)), false);
    assert.equal(await page.evaluate(async () => (await MiorningTextFloatStore.cacheUsage()).sites.length), 0);
    await page.locator('#prompt').click(); assert.equal(await page.locator('.miorning-text-float-shell').count(), 0);
  });
  await test('destroy before delayed controls initialization prevents late dock and queued editor creation', async () => {
    await start(() => {
      const original = MiorningTextFloatControl;
      const gate = new Promise(resolve => window.releaseControls = resolve);
      window.MiorningTextFloatControl = {...original, async getState() { window.controlsStarted = true; await gate; return original.getState(); }};
    });
    await page.waitForFunction(() => window.controlsStarted);
    await page.evaluate(() => { window.openTask = MiorningTextFloat.open(document.querySelector('#prompt')); });
    assert.equal(await page.evaluate(() => MiorningTextFloat.destroy()), true);
    await page.evaluate(async () => { releaseControls(); await openTask; });
    assert.equal(await page.locator('.miorning-text-float-shell').count(), 0);
    assert.equal(await page.locator('.miorning-text-float-dock').count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.MiorningTextFloat)), false);
  });
  await test('composition start cancels a pending autosave and whenIdle never saves an unconfirmed IME value', async () => {
    await start(() => {
      const original = MiorningTextFloatStore; window.draftWrites = [];
      window.MiorningTextFloatStore = {...original, async createDraft(key, input) { window.draftWrites.push(input.snapshot.value); return original.createDraft(key, input); }};
    });
    await open();
    await page.evaluate(() => {
      const editor = document.querySelector('#prompt');
      editor.value = '已完成'; editor.dispatchEvent(new InputEvent('input', {bubbles: true, data: '已完成', inputType: 'insertText'}));
      editor.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
      // Reproduce the gap before the first composition input: a timer from the
      // preceding input must be cancelled immediately at compositionstart.
      editor.value = '已完成候选';
    });
    await page.evaluate(() => MiorningTextFloat.whenIdle());
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => draftWrites), []);
    await page.evaluate(() => {
      const editor = document.querySelector('#prompt'); editor.value = '已完成输入';
      editor.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '输入'}));
      editor.dispatchEvent(new InputEvent('input', {bubbles: true, data: '输入', inputType: 'insertText'}));
    });
    await page.evaluate(() => MiorningTextFloat.whenIdle());
    assert.deepEqual(await page.evaluate(() => draftWrites), ['已完成输入']);
    assert.equal(await page.evaluate(() => MiorningTextFloat.getState().versions[0].number), 1);
  });
  await test('global pause waits for IME completion and preserves the final composed text as a saved version', async () => {
    await start(); await open();
    const key = await page.evaluate(() => MiorningTextFloat.getState().historyKey);
    await page.evaluate(async () => {
      const editor = document.querySelector('#prompt');
      editor.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
      editor.value = '正在输入'; editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertCompositionText', data: '正在输入', isComposing: true}));
      await MiorningTextFloatControl.setEnabled(false);
    });
    await page.waitForTimeout(250);
    const paused = await page.evaluate(() => MiorningTextFloat.getState());
    assert.equal(paused.enabled, false); assert.equal(paused.open, true);
    await page.evaluate(() => {
      const editor = document.querySelector('#prompt'); editor.value = '最终输入结果';
      editor.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '最终输入结果'}));
      editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: '最终输入结果'}));
    });
    await page.locator('.miorning-text-float-shell').waitFor({state: 'detached'});
    await page.evaluate(() => MiorningTextFloat.whenIdle());
    assert.equal(await page.locator('#prompt').inputValue(), '最终输入结果');
    const doc = await page.evaluate(key => MiorningTextFloatStore.load(key, {kind: 'text', value: ''}), key);
    assert.equal(doc.versions.at(-1).status, 'saved'); assert.equal(doc.versions.at(-1).snapshot.value, '最终输入结果');
    await page.locator('#second').click(); assert.equal(await page.locator('.miorning-text-float-shell').count(), 0);
    await page.evaluate(() => MiorningTextFloatControl.setEnabled(true)); await open();
    assert.equal(await page.locator('#prompt').inputValue(), '最终输入结果');
  });
  await test('global pause waits for an in-flight native reference transaction before closing and saving', async () => {
    await start(() => {
      const original = MiorningTextFloatReferences; window.referenceBusy = false;
      window.MiorningTextFloatReferences = {...original, create(options) { const manager = original.create(options); return {refresh: manager.refresh, handleKey: manager.handleKey, destroy: manager.destroy, get busy() { return window.referenceBusy || manager.busy; }}; }};
    });
    await open(); const key = await page.evaluate(() => MiorningTextFloat.getState().historyKey);
    await page.evaluate(async () => {
      window.referenceBusy = true; const editor = document.querySelector('#prompt');
      editor.value = '插入之前'; editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: '插入之前'}));
      await MiorningTextFloatControl.setEnabled(false);
    });
    await page.waitForTimeout(250); assert.equal(await page.locator('.miorning-text-float-shell').count(), 1);
    await page.evaluate(() => {
      const editor = document.querySelector('#prompt'); editor.value = '插入完成 @测试图';
      editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertReplacementText', data: null}));
      window.referenceBusy = false;
    });
    await page.locator('.miorning-text-float-shell').waitFor({state: 'detached'});
    const doc = await page.evaluate(key => MiorningTextFloatStore.load(key, {kind: 'text', value: ''}), key);
    assert.equal(doc.versions.at(-1).status, 'saved'); assert.equal(doc.versions.at(-1).snapshot.value, '插入完成 @测试图');
  });
  await test('failed shutdown preserves the editor and resets the shutdown guard for retry', async () => {
    await start(() => {
      const original = MiorningTextFloatStore; window.rejectWrites = true;
      window.MiorningTextFloatStore = {...original, async createDraft(key, input) { if (window.rejectWrites) throw new Error('isolated write failure'); return original.createDraft(key, input); }};
    });
    await open(); await page.locator('#prompt').fill('不能丢失的修改');
    assert.equal(await page.evaluate(() => MiorningTextFloat.destroy()), false);
    assert.equal(await page.locator('.miorning-text-float-shell').count(), 1);
    assert.equal(await page.locator('#prompt').inputValue(), '不能丢失的修改');
    assert.equal(await page.evaluate(() => Boolean(window.MiorningTextFloat)), true);
    await page.evaluate(() => { window.rejectWrites = false; });
    assert.equal(await page.evaluate(() => MiorningTextFloat.close()), true);
    await page.evaluate(() => MiorningTextFloat.open(document.querySelector('#second')));
    assert.equal(await page.locator('.miorning-text-float-shell').count(), 1);
    assert.equal(await page.evaluate(() => MiorningTextFloat.destroy()), true);
    assert.equal(await page.locator('.miorning-text-float-shell').count(), 0);
  });
  assert.deepEqual(pageErrors, []);
})().catch(error => { console.error(runtime.sanitize(error.stack || error.message)); process.exitCode = 1; }).finally(async () => {
  await context?.close(); await browser?.close();
  const report = {suite: 'v040-lifecycle', status: process.exitCode ? 'failed' : 'passed', passed: tests.filter(test => test.status === 'passed').length, tests, pageErrors, scope: 'isolated browser lifecycle races, synthetic IME events and controlled reference-busy state; not native OS IME automation', sourceHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(extension, 'content.js'))).digest('hex')};
  fs.writeFileSync(path.join(runtime.artifacts, 'v040-lifecycle-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({suite: report.suite, status: report.status, passed: report.passed}, null, 2));
});

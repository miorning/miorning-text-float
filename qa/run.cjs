'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { artifacts, browserOptions, browserLabel, sanitize, writeReport, temporaryDirectory, removeTemporary } = require('./runtime.cjs');

const qa = __dirname, extension = path.resolve(qa, '../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
const contentScripts = [...new Set(manifest.content_scripts.flatMap(entry => entry.js || []))];
const launchOptions = browserOptions(chromium);
const extensionLaunchOptions = browserOptions(chromium, true);
const report = { startedAt: new Date().toISOString(), mode: 'isolated headless Chromium, local fixture only; actual extension source injected', browser: browserLabel(launchOptions), tests: [], sourceHashes: {}, limitations: ['Real operating-system IME candidate interaction is not automated.', 'Fixture contenteditable is not a substitute for live LibTV React integration.'] };
for (const name of [...contentScripts, 'background.js', 'manifest.json', 'options.js', 'options.html', 'options.css']) report.sourceHashes[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(extension, name))).digest('hex');
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/fixture.html')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(path.join(qa, 'fixture.html'))); }
  else if (/^\/icons\/(?:icon-)?\d+\.png$/.test(req.url || '') && fs.existsSync(path.join(extension, req.url))) { res.setHeader('Content-Type','image/png'); res.end(fs.readFileSync(path.join(extension, req.url))); }
  else { res.statusCode = 404; res.end('local fixture only'); }
});
let browser, context, page, base;
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle() { await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); if (globalThis.MiorningTextFloat?.whenIdle) await MiorningTextFloat.whenIdle(); }); }
async function inject() {
  // Resolve packaged images against the local server without pretending the page
  // is an extension context; runtime.id deliberately remains absent.
  await page.evaluate(() => {globalThis.chrome ||= {}; chrome.runtime ||= {}; chrome.runtime.getURL = resource => location.origin + '/' + resource;});
  for (const name of contentScripts) await page.addScriptTag({ path: path.join(extension, name) });
  await page.evaluate(() => MiorningTextFloat.whenIdle());
}
async function reset({ width = 1280, height = 900, reducedMotion = 'no-preference', libtv = false } = {}) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion });
  await page.goto(base + '/fixture.html' + (libtv ? '?libtv=1' : ''));
  await page.evaluate(async () => {
    localStorage.clear();
    for (const {name} of await indexedDB.databases()) await new Promise((resolve,reject) => { const req=indexedDB.deleteDatabase(name);req.onsuccess=resolve;req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Fixture database blocked: '+name)); });
  });
  await page.reload();
  await inject();
}
const state = () => page.evaluate(() => globalThis.MiorningTextFloat.getState());
async function waitOpen() { await page.waitForFunction(() => globalThis.MiorningTextFloat?.getState().open); await settle(); }
async function waitClosed() { await page.waitForFunction(() => globalThis.MiorningTextFloat && !MiorningTextFloat.getState().open); await settle(); }
async function open(selector = '#fixture-textarea') { await page.locator(selector).click(); await waitOpen(); assert.equal((await state()).open, true); }
async function close() { await page.keyboard.press('Escape'); await waitClosed(); assert.equal((await state()).open, false); }
async function test(name, fn) {
  const start = Date.now();
  try { const details = await fn(); report.tests.push({ name, status: 'passed', milliseconds: Date.now() - start, ...(details ? { details } : {}) }); console.log('PASS ' + name); }
  catch (error) { report.tests.push({ name, status: 'failed', milliseconds: Date.now() - start, error: sanitize(error.stack) }); console.log('FAIL ' + name + ': ' + error.message); try { await page.screenshot({ path: path.join(artifacts, 'failure-' + report.tests.length + '.png') }); } catch {} }
}
async function drag(locator, dx, dy) {
  const box = await locator.boundingBox(); assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up(); await settle();
}
async function cleanup() { try { await context?.close(); await browser?.close(); } finally { server.close(); } }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...launchOptions, headless: true });
  report.browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));

  await test('click opens original textarea; confirmation closes and restores style', async () => {
    await reset();
    await page.evaluate(() => { globalThis.savedEditor = document.querySelector('#fixture-textarea'); globalThis.savedStyle = savedEditor.getAttribute('style'); });
    await open();
    assert.equal(await page.evaluate(() => savedEditor === document.querySelector('#fixture-textarea') && savedEditor.matches(':popover-open')), true);
    assert.equal(await page.locator('.miorning-text-float-shell').count(), 1);
    const accessibility = await page.locator('body').ariaSnapshot();
    assert.ok(accessibility.includes('喵咛文本窗'), 'Floating dialog is present in body accessibility tree');
    assert.ok(!accessibility.includes('保留原文字'), 'Removed keep-text control must not remain in accessibility tree');
    assert.ok(accessibility.includes('确认'), 'Confirmation control is present in body accessibility tree');
    await page.locator('.confirm').click(); await waitClosed();
    assert.equal((await state()).open, false);
    const restored = await page.evaluate(() => ({ style: savedEditor.getAttribute('style'), original: savedStyle, popover: savedEditor.getAttribute('popover'), focused: document.activeElement === savedEditor, focus: document.activeElement?.outerHTML.slice(0,200) }));
    assert.equal((restored.style || '') === (restored.original || '') && restored.popover === null && restored.focused, true, JSON.stringify(restored));
  });
  await test('two Enter newlines and Esc commit survive refresh', async () => {
    await reset(); await open(); await page.keyboard.press('Control+A'); await page.keyboard.insertText('第一行');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.insertText('最后一行 🌿');
    assert.equal(await page.locator('#fixture-textarea').inputValue(), '第一行\n\n最后一行 🌿');
    await close(); await page.reload();
    assert.equal(await page.locator('#fixture-textarea').inputValue(), '第一行\n\n最后一行 🌿');
    assert.equal(await page.evaluate(() => fixtureState().counts.generation), 0);
  });
  await test('Ctrl+Enter no longer confirms the floating editor', async () => {
    await reset(); await open(); await page.keyboard.press('Control+A'); await page.keyboard.insertText('仍在编辑');
    await page.keyboard.press('Control+Enter'); await settle();
    assert.equal((await state()).open, true);
    assert.equal(await page.locator('#fixture-textarea').inputValue(), '仍在编辑');
    await close(); await page.reload();
    assert.equal(await page.locator('#fixture-textarea').inputValue(), '仍在编辑');
    assert.equal(await page.evaluate(() => fixtureState().counts.generation), 0);
  });
  await test('font controls clamp 14–64 and preserve native textarea caret', async () => {
    await reset(); await open();
    await page.evaluate(() => { const el = document.querySelector('#fixture-textarea'); el.setSelectionRange(4, 4); }); await settle();
    await page.getByRole('button', { name: '增大字体' }).click();
    assert.equal((await state()).fontSize, 19);
    assert.equal(await page.locator('#fixture-textarea').evaluate(el => getComputedStyle(el).fontSize), '19px');
    assert.equal(await page.locator('#fixture-textarea').evaluate(el => el.selectionStart), 4);
    const font = page.getByRole('spinbutton', { name: '字体大小' });
    await font.fill('100'); await font.press('Enter'); assert.equal((await state()).fontSize, 64);
    await font.fill('2'); await font.press('Enter'); assert.equal((await state()).fontSize, 14);
  });
  await test('removed keep-text control is absent and theme control retains editor selection', async () => {
    await reset(); await open('#fixture-rich');
    assert.equal(await page.getByRole('checkbox', { name: '保留原文字' }).count(), 0);
    await page.evaluate(() => { const el = document.querySelector('#fixture-rich'); const range = document.createRange(); range.setStart(el.firstChild,3); range.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(range); });
    await page.getByRole('button', { name: '夜间模式', exact: true }).click();
    const preserved = await page.evaluate(() => ({ focused: document.activeElement.id, offset: getSelection().anchorOffset }));
    assert.equal(preserved.focused, 'fixture-rich'); assert.equal(preserved.offset, 3);
  });
  await test('title drag and keyboard movement retain bounds', async () => {
    await reset(); await open(); const before = (await state()).rect;
    await drag(page.locator('.drag'), 83, 51); const after = (await state()).rect;
    assert.equal(after.left, before.left + 83); assert.equal(after.top, before.top + 51);
    await page.locator('.drag').focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowUp'); await settle();
    const keyboard = (await state()).rect; assert.equal(keyboard.left, after.left - 8); assert.equal(keyboard.top, after.top - 1);
    await drag(page.locator('.drag'), -2000, -2000); const bounded = (await state()).rect;
    assert.equal(bounded.left, 8); assert.equal(bounded.top, 8);
  });
  await test('all eight resize handles independently move correct edges', async () => {
    const results = [];
    for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      await reset(); await open(); const before = (await state()).rect;
      const dx = direction.includes('w') ? -20 : direction.includes('e') ? 20 : 0;
      const dy = direction.includes('n') ? -20 : direction.includes('s') ? 20 : 0;
      await drag(page.locator('.handle.' + direction), dx, dy); const after = (await state()).rect;
      assert.equal(after.width, before.width + (dx ? 20 : 0), direction + ' width');
      assert.equal(after.height, before.height + (dy ? 20 : 0), direction + ' height');
      assert.equal(after.left, before.left + (direction.includes('w') ? -20 : 0));
      assert.equal(after.top, before.top + (direction.includes('n') ? -20 : 0));
      results.push({ direction, width: after.width, height: after.height });
    }
    return results;
  });
  await test('resize keyboard and minimum geometry', async () => {
    await reset(); await open(); const before = (await state()).rect;
    await page.locator('.handle.se').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown'); await settle();
    const next = (await state()).rect; assert.equal(next.width, before.width + 8); assert.equal(next.height, before.height + 1);
    await drag(page.locator('.handle.se'), -1000, -1000); const small = (await state()).rect;
    assert.equal(small.width, 360); assert.equal(small.height, 240);
  });
  await test('contenteditable native Enter produces two visible line breaks', async () => {
    await reset(); await open('#fixture-rich'); await page.keyboard.press('Control+A'); await page.keyboard.insertText('首行');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.insertText('尾行');
    assert.equal(await page.locator('#fixture-rich').innerText(), '首行\n\n尾行'); await close();
    await page.reload(); assert.equal(await page.locator('#fixture-rich').innerText(), '首行\n\n尾行');
  });
  await test('existing portal @ menu opens above editor and inserts native reference token', async () => {
    await reset(); await page.evaluate(() => { globalThis.savedRich = document.querySelector('#fixture-rich'); }); await open('#fixture-rich');
    await page.keyboard.press('Control+End'); await page.keyboard.insertText(' @'); await settle();
    await page.waitForFunction(() => document.querySelector('.fixture-mentions').matches(':popover-open'));
    const button = page.locator('.fixture-mentions button').nth(1);
    await button.click(); await settle();
    await page.locator('#fixture-rich [data-reference-id="green-plant"]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-reference-id="green-plant"]').count(), 1);
    assert.equal(await page.evaluate(() => savedRich === document.querySelector('#fixture-rich')), true);
    assert.equal(await page.evaluate(() => fixtureState().counts.reference), 1);
    assert.equal(await page.locator('.fixture-mentions').evaluate(el => el.hidden && !el.matches(':popover-open') && !el.hasAttribute('popover')), true);
    await close(); await page.reload(); await page.locator('#fixture-rich [data-reference-id="green-plant"]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-reference-id="green-plant"]').count(), 1);
  });
  await test('text entered after reference supports native undo without deleting token', async () => {
    await reset(); await open('#fixture-rich'); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' @'); await settle();
    await page.locator('.fixture-mentions button').first().click(); await settle();
    await page.keyboard.insertText('后续文字UNDO');
    assert.ok((await page.locator('#fixture-rich').innerText()).includes('后续文字UNDO'));
    await page.keyboard.press('Control+z');
    assert.ok(!(await page.locator('#fixture-rich').innerText()).includes('后续文字UNDO'));
    await page.locator('#fixture-rich [data-reference-id]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-reference-id]').count(), 1);
  });
  await test('Escape confirms editor even while native reference menu is open', async () => {
    await reset(); await open('#fixture-rich'); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' @'); await settle();
    const before = await page.locator('#fixture-rich').innerText();
    await page.keyboard.press('Escape'); await waitClosed(); assert.equal((await state()).open, false);
    assert.equal(await page.locator('#fixture-rich [data-reference-id]').count(), 0);
    assert.equal(await page.locator('.fixture-mentions').evaluate(el => !el.matches(':popover-open')), true);
    await page.reload(); assert.equal(await page.locator('#fixture-rich').innerText(), before);
  });
  await test('DOM replacement cleans floating styles and supports new editor', async () => {
    await reset(); await open('#fixture-rich'); await page.evaluate(() => document.querySelector('#replace').click()); await settle();
    assert.equal((await state()).open, false); assert.equal(await page.locator('.miorning-text-float-shell').count(), 0);
    assert.equal(await page.locator('#fixture-rich').evaluate(el => !el.hasAttribute('popover') && !el.hasAttribute('data-miorning-floating-editor')), true);
    await open('#fixture-rich'); await close();
  });
  await test('transformed clipped ancestor does not shrink or clip floating editor', async () => {
    await reset(); await open('#fixture-transformed'); const geometry = (await state()).rect.editor;
    const actual = await page.locator('#fixture-transformed').boundingBox();
    for (const [field, key] of [['x', 'left'], ['y', 'top'], ['width', 'width'], ['height', 'height']]) assert.ok(Math.abs(actual[field] - geometry[key]) < 1, field + ': ' + actual[field] + ' vs ' + geometry[key]);
    await page.screenshot({ path: path.join(artifacts, 'floating-wide.png') });
  });
  await test('narrow viewport and reduced motion retain reachable controls', async () => {
    await reset({ width: 390, height: 700, reducedMotion: 'reduce' }); await open(); const s = await state();
    assert.ok(s.rect.left >= 0 && s.rect.left + s.rect.width <= 390); assert.ok(s.rect.top >= 0 && s.rect.top + s.rect.height <= 700);
    const confirm = await page.locator('.confirm').boundingBox(); assert.ok(confirm.x >= 0 && confirm.x + confirm.width <= 390);
    assert.equal(await page.locator('.window').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.screenshot({ path: path.join(artifacts, 'floating-narrow.png') }); await page.locator('.confirm').click(); await waitClosed(); assert.equal((await state()).open, false);
  });
  await test('viewport shrink clamps window and retains usable editor', async () => {
    await reset(); await open(); await page.setViewportSize({ width: 500, height: 380 }); await settle(); const s = await state();
    assert.ok(s.rect.left + s.rect.width <= 500); assert.ok(s.rect.top + s.rect.height <= 380); assert.ok(s.rect.editor.height > 100);
  });
  await test('composition guard does not close or prevent candidate confirmation', async () => {
    await reset(); await open();
    const during = await page.locator('#fixture-textarea').evaluate(el => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      const candidate = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }); el.dispatchEvent(candidate);
      const confirm = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true }); el.dispatchEvent(confirm);
      return { candidatePrevented: candidate.defaultPrevented, confirmPrevented: confirm.defaultPrevented, open: MiorningTextFloat.getState().open };
    });
    assert.equal(during.candidatePrevented, false); assert.equal(during.confirmPrevented, false); assert.equal(during.open, true);
    await page.locator('#fixture-textarea').evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))); await close();
    return 'Synthetic composition guard only; actual OS IME remains unverified.';
  });
  await test('toggle pauses and resumes feature without duplicate shell', async () => {
    await reset(); await open(); await page.evaluate(() => MiorningTextFloat.toggle()); await settle(); assert.equal((await state()).open, false);
    await page.locator('#fixture-textarea').click(); assert.equal((await state()).open, false);
    await page.evaluate(() => MiorningTextFloat.toggle()); await open(); assert.equal(await page.locator('.miorning-text-float-shell').count(), 1);
  });
  const firstName = '参考图 1 · 窗边光线';
  async function typeName(value = firstName) { await page.keyboard.press('Control+A'); await page.keyboard.insertText(value); await settle(); }
  const suggestionOpen = () => page.locator('.miorning-reference-suggestion').evaluate(el => el.matches(':popover-open'));
  const plainTextOutsideTokens = () => page.locator('#fixture-rich').evaluate(el => { const copy = el.cloneNode(true); copy.querySelectorAll('[contenteditable="false"]').forEach(token=>token.remove()); return copy.textContent.trim(); });
  await test('complete reference name shows gray suggestion without inserting a token', async () => {
    await reset(); await open('#fixture-rich'); await typeName();
    assert.equal(await suggestionOpen(),true); assert.equal(await plainTextOutsideTokens(),firstName);
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
    assert.equal(await page.evaluate(()=>CSS.highlights.has('miorning-reference-preview')),true);
    const accessibility=await page.locator('body').ariaSnapshot();
    assert.ok(accessibility.includes('@ '+firstName),'Name suggestion is present in body accessibility tree');
    await page.screenshot({path:path.join(artifacts,'name-suggestion.png')});
  });
  await test('Tab replaces complete name with native token by default', async () => {
    await reset(); await open('#fixture-rich'); await typeName(); await page.keyboard.press('Tab'); await settle();
    await page.locator('#fixture-rich [data-mention-node-id="window-light"]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-mention-node-id="window-light"]').count(),1);
    assert.equal(await plainTextOutsideTokens(),''); assert.equal(await suggestionOpen(),false);
    assert.equal(await page.evaluate(()=>fixtureState().counts.reference),1);
  });
  await test('legacy keep-text preference cannot revive removed behavior; Tab replaces name', async () => {
    await reset(); await page.evaluate(() => MiorningTextFloatStore.saveSettings({keepText: true}));
    await open('#fixture-rich'); await typeName(); await settle();
    assert.equal(await suggestionOpen(),true); await page.keyboard.press('Tab'); await settle();
    assert.equal(await plainTextOutsideTokens(),'');
    await page.locator('#fixture-rich [data-mention-node-id="window-light"]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-mention-node-id="window-light"]').count(),1);
    await page.screenshot({path:path.join(artifacts,'name-replaced-reference.png')});
  });
  await test('Shift+Tab keeps text without accepting name suggestion', async () => {
    await reset(); await open('#fixture-rich'); await typeName(); await page.keyboard.press('Shift+Tab'); await settle();
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0); assert.equal(await plainTextOutsideTokens(),firstName);
  });
  await test('Escape confirms typed name without accepting gray reference suggestion', async () => {
    await reset(); await open('#fixture-rich'); await typeName(); await page.keyboard.press('Escape'); await waitClosed();
    assert.equal(await page.locator('.miorning-reference-suggestion').count(),0); assert.equal((await state()).open,false);
    assert.equal(await plainTextOutsideTokens(),firstName); assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
    await page.reload(); assert.equal(await plainTextOutsideTokens(),firstName);
  });
  await test('continued typing hides name suggestion without changing text', async () => {
    await reset(); await open('#fixture-rich'); await typeName(); await page.keyboard.insertText('继续描述'); await settle();
    assert.equal(await suggestionOpen(),false); assert.equal(await plainTextOutsideTokens(),firstName+'继续描述');
  });
  await test('duplicate connected reference names do not auto-select a candidate', async () => {
    await reset();
    await page.evaluate(()=>{const item=document.querySelector('.refs [data-reference-name]').cloneNode(true);item.dataset.referenceId='ambiguous-copy';document.querySelector('.refs').append(item);});
    await open('#fixture-rich'); await typeName(); assert.equal(await suggestionOpen(),false); await page.keyboard.press('Tab'); await settle();
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0); assert.equal(await plainTextOutsideTokens(),firstName);
  });
  await test('composition state suppresses name candidate and Tab acceptance', async () => {
    await reset(); await open('#fixture-rich');
    await page.locator('#fixture-rich').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''})));
    await typeName(); assert.equal(await suggestionOpen(),false); await page.keyboard.press('Tab'); await settle();
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
    await page.locator('#fixture-rich').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'})));
    return 'Synthetic composition-state guard; actual operating-system candidate UI unverified.';
  });
  await test('unmatched text leaves native Tab focus navigation intact', async () => {
    await reset(); await open('#fixture-rich'); await typeName('这是没有匹配名称的普通文字'); await page.keyboard.press('Tab'); await settle();
    assert.notEqual(await page.evaluate(()=>document.activeElement.id),'fixture-rich');
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
  });
  await test('native reference button no-op preserves original name and never calls undo', async () => {
    await reset(); await open('#fixture-rich'); await typeName();
    await page.evaluate(()=>{
      document.querySelector('.refs [data-insert-reference]').addEventListener('click',event=>event.stopImmediatePropagation());
      const command=document.execCommand.bind(document);globalThis.undoCount=0;document.execCommand=(name,...args)=>{if(name==='undo')undoCount++;return command(name,...args);};
    });
    await page.keyboard.press('Tab'); await settle(); assert.equal(await plainTextOutsideTokens(),firstName);
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0); assert.equal(await page.evaluate(()=>undoCount),0);
  });
  await test('failed name deletion retains original text plus reference without undoing user work', async () => {
    await reset(); await open('#fixture-rich'); await typeName();
    await page.evaluate(()=>{const command=document.execCommand.bind(document);globalThis.undoCount=0;document.execCommand=(name,...args)=>{if(name==='delete')return false;if(name==='undo')undoCount++;return command(name,...args);};});
    await page.keyboard.press('Tab'); await settle(); assert.equal(await plainTextOutsideTokens(),firstName);
    await page.locator('#fixture-rich [data-mention-node-id]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),1); assert.equal(await page.evaluate(()=>undoCount),0);
  });
  await test('pending acceptance cannot undo a different focused field', async () => {
    await reset(); await open('#fixture-rich'); await typeName();
    await page.evaluate(()=>{
      document.querySelector('.refs [data-insert-reference]').addEventListener('click',event=>event.stopImmediatePropagation());
      document.querySelector('#fixture-rich').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
      const other=document.querySelector('#fixture-textarea');other.focus();other.setSelectionRange(other.value.length,other.value.length);document.execCommand('insertText',false,'外部输入安全');
    });
    await settle(); assert.ok((await page.locator('#fixture-textarea').inputValue()).endsWith('外部输入安全')); assert.equal(await plainTextOutsideTokens(),firstName);
  });
  await test('closing during pending acceptance waits safely and later Escape preserves text', async () => {
    await reset(); await open('#fixture-rich'); await typeName();
    const closed = await page.evaluate(async()=>{
      document.querySelector('.refs [data-insert-reference]').addEventListener('click',event=>event.stopImmediatePropagation());
      document.querySelector('#fixture-rich').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
      const result=await MiorningTextFloat.close();
      const other=document.querySelector('#fixture-textarea');other.focus();other.setSelectionRange(other.value.length,other.value.length);document.execCommand('insertText',false,'关闭后安全');
      return result;
    });
    assert.equal(closed,false);assert.equal((await state()).open,true,'Pending native reference must not be saved halfway through insertion');
    await settle();
    assert.equal(await plainTextOutsideTokens(),firstName); assert.ok((await page.locator('#fixture-textarea').inputValue()).endsWith('关闭后安全'));
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
    await page.locator('#fixture-rich').focus();await close();
    assert.equal((await state()).open,false);assert.equal(await page.locator('.miorning-reference-suggestion').count(),0);
    assert.equal(await plainTextOutsideTokens(),firstName);
  });
  await test('native gray mention suggestion is hidden only inside floating editor', async () => {
    await reset({libtv:true}); await open('#fixture-rich'); await typeName();
    assert.equal(await page.locator('#fixture-rich [data-mention-suggest]').count(),1);
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
    assert.equal(await page.locator('#fixture-rich [data-mention-suggest]').evaluate(el=>getComputedStyle(el).display),'none');
    assert.equal(await suggestionOpen(),true);
    assert.ok(!(await page.evaluate(()=>fixtureState().rich)).includes('data-mention-suggest'));
    await close();
    assert.notEqual(await page.locator('#fixture-rich [data-mention-suggest]').evaluate(el=>getComputedStyle(el).display),'none');
  });
  await test('Tab accepts true reference without counting native gray suggestion as token', async () => {
    await reset({libtv:true}); await open('#fixture-rich'); await typeName();
    await page.keyboard.press('Tab'); await settle();
    await page.locator('#fixture-rich [data-mention-node-id="window-light"]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-mention-node-id="window-light"]').count(),1);
    assert.equal(await plainTextOutsideTokens(),'');
    assert.ok(!(await page.evaluate(()=>fixtureState().rich)).includes('data-mention-suggest'));
  });
  await test('complete name split across adjacent text nodes and inline spans still matches', async () => {
    for(const inline of [false,true]) {
      await reset(); await open('#fixture-rich');
      await page.locator('#fixture-rich').evaluate((el,{name,inline})=>{
        const first=document.createTextNode(name.slice(0,6)),last=document.createTextNode(name.slice(6));
        const wrapper=document.createElement('span');wrapper.append(first);el.replaceChildren(inline?wrapper:first,last);
        const r=document.createRange();r.setStart(last,last.textContent.length);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
      },{name:firstName,inline});
      await settle();assert.equal(await suggestionOpen(),true);await page.keyboard.press('Tab');await settle();
      await page.locator('#fixture-rich [data-mention-node-id]').waitFor({state:'attached'}); assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),1);assert.equal(await plainTextOutsideTokens(),'');
    }
  });
  await test('name matching stops at newline and existing noneditable token boundaries', async () => {
    for(const token of [false,true]) {
      await reset(); await open('#fixture-rich');
      await page.locator('#fixture-rich').evaluate((el,{name,token})=>{
        const boundary=document.createElement(token?'span':'br');if(token){boundary.contentEditable='false';boundary.textContent='已有引用';}
        const first=document.createTextNode(name.slice(0,6)),last=document.createTextNode(name.slice(6));el.replaceChildren(first,boundary,last);
        const r=document.createRange();r.setStart(last,last.textContent.length);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
      },{name:firstName,token});
      await settle();assert.equal(await suggestionOpen(),false);
    }
  });

  await require('./v020.cjs')({page,context,base,qa:artifacts,extension,assert,reset,open,close,state,settle,inject,drag,test,waitOpen,waitClosed});

  report.pageErrors = errors;
  report.tests.push({ name: 'no browser runtime page errors', status: errors.length ? 'failed' : 'passed', details: errors });

  // Smoke-test actual MV3 loading in a disposable profile; never attach to user browsers.
  const testExtension = extension;
  let extensionContext, extensionLoaded = false;
  const extensionProfile = temporaryDirectory('temporary-extension-profile-');
  try {
    extensionContext = await chromium.launchPersistentContext(extensionProfile, { ...extensionLaunchOptions, headless: true, args: [`--disable-extensions-except=${testExtension}`, `--load-extension=${testExtension}`] });
    const extensionPage = await extensionContext.newPage();
    await extensionPage.route('**/*', route => route.request().url().startsWith('chrome-extension://') ? route.continue() : route.request().url().startsWith('https://www.liblib.tv/') ? route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(qa,'fixture.html'),'utf8')}) : route.abort());
    await extensionPage.goto('https://www.liblib.tv/miorning-local-fixture?libtv=1');
    await extensionPage.locator('.miorning-text-float-dock').waitFor({ state: 'visible' });
    await extensionPage.locator('#fixture-textarea').click();
    await extensionPage.locator('.miorning-text-float-shell').waitFor({ state: 'visible', timeout: 8000 });
    extensionLoaded = true;
    await extensionPage.keyboard.press('Control+A'); await extensionPage.keyboard.insertText('真实 MV3 注入验证'); await extensionPage.keyboard.press('Enter'); await extensionPage.keyboard.insertText('第二行'); await extensionPage.keyboard.press('Escape');
    await extensionPage.locator('.miorning-text-float-shell').waitFor({state:'detached'});
    assert.equal(await extensionPage.locator('.miorning-text-float-shell').count(), 0);
    assert.equal(await extensionPage.locator('#fixture-textarea').inputValue(), '真实 MV3 注入验证\n第二行');
    await extensionPage.locator('#fixture-rich').click();
    assert.equal(await extensionPage.locator('#fixture-rich').evaluate(el => el.parentElement.matches(':popover-open')),true);
    await extensionPage.keyboard.press('Control+End'); await extensionPage.keyboard.insertText(' @');
    await extensionPage.waitForFunction(()=>document.querySelector('[data-reference-main-panel="true"]').matches(':popover-open'));
    await extensionPage.locator('[data-reference-connected-group="true"] button').first().click();
    assert.equal(await extensionPage.locator('#fixture-rich [data-mention-node-id]').count(),1);
    const nativeStyle = await extensionPage.locator('#fixture-rich .mention-badge').evaluate(el=>({color:getComputedStyle(el).color,border:getComputedStyle(el).borderTopColor}));
    assert.equal(nativeStyle.color,'rgb(40, 51, 47)');
    await extensionPage.screenshot({ path: path.join(artifacts, 'mv3-native-reference.png') });
    await extensionPage.keyboard.press('Escape');
    await extensionPage.locator('.miorning-text-float-shell').waitFor({state:'detached'});
    assert.equal(await extensionPage.locator('.miorning-text-float-shell').count(),0);
    await extensionPage.screenshot({ path: path.join(artifacts, 'mv3-fixture.png') });
    const persistence = await require('./v020-mv3.cjs')({context:extensionContext,page:extensionPage,qa,assert});
    report.extensionSmoke = { status: 'passed', browser: browserLabel(extensionLaunchOptions) + ' headless disposable profile', manifest: 'unmodified production manifest', network:'All external requests blocked; simulated LibTV-origin document fulfilled exclusively from local fixture.', sourceScripts: 'byte-identical to extension source', checks:['MV3 content script auto injection','textarea Enter/Esc','LibTV aria-placeholder parent popover branch','no-role native menu selector','native mention insertion','native mention text contrast', ...persistence],serviceWorkers: extensionContext.serviceWorkers().map(worker => worker.url()) };
  } catch (error) { report.extensionSmoke = { status: extensionLoaded ? 'failed' : 'unverified', reason: sanitize(error.message) }; }
  finally {
    await extensionContext?.close();
    try { removeTemporary(extensionProfile); } catch(error) { report.profileCleanup = sanitize(error.message); }
  }

  report.siteControlCoverage = 'All-site pause/resume and cross-tab shortcut persistence are covered by qa/v040-control.cjs; the old optional-site model is retired.';
  report.sourceDrift = Object.entries(report.sourceHashes).filter(([name, expected]) => crypto.createHash('sha256').update(fs.readFileSync(path.join(extension, name))).digest('hex') !== expected).map(([name]) => name);
  report.completedAt = new Date().toISOString();
  report.summary = { passed: report.tests.filter(x => x.status === 'passed').length, failed: report.tests.filter(x => x.status === 'failed').length + (report.extensionSmoke?.status !== 'passed' ? 1 : 0) + (report.profileCleanup ? 1 : 0) + (report.sourceDrift.length ? 1 : 0) };
  writeReport(report);
  console.log(JSON.stringify({ summary: report.summary, extensionSmoke: report.extensionSmoke }));
  await cleanup();
  process.exitCode = report.summary.failed ? 1 : 0;
})().catch(async error => { report.fatal = sanitize(error.stack); writeReport(report); console.error(sanitize(error.stack)); await cleanup(); process.exitCode = 1; });

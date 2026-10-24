/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { artifacts, browserOptions, sanitize } = require('./runtime.cjs');

// Can run on its own or be called by another browser harness. This isolates the
// shell controls so changed shortcut/storage behavior cannot hide UI regressions.
module.exports = async function shellTests({ page, test, output = artifacts }) {
  async function setup(settings = {}, viewport = { width: 1280, height: 900 }, reducedMotion = 'no-preference', rich = false) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion });
    await page.goto('about:blank');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e2e7e2}textarea{border:0;resize:none;box-sizing:border-box}</style>' + (rich ? '<div id="native-editor" contenteditable="true">原文中的选区需要保留</div>' : '<textarea id="native-editor">原文中的选区需要保留</textarea>'));
    await page.addScriptTag({ path: path.join(__dirname, '../extension/shell.js') });
    await page.evaluate(settings => {
      const editor = document.querySelector('#native-editor');
      globalThis.events = { fonts: [], themes: [], closes: 0, settings: [] };
      const paintEditor = rect => {
        Object.assign(editor.style, { position: 'fixed', margin: '0', inset: 'auto', left: rect.editor.left + 'px', top: rect.editor.top + 'px', width: rect.editor.width + 'px', height: rect.editor.height + 'px', fontSize: (globalThis.shell?.fontSize || settings.fontSize || 18) + 'px' });
      };
      globalThis.shell = MiorningTextFloatShell.create({ settings, onRect: paintEditor, onFont: value => { events.fonts.push(value); paintEditor(shell.rect); }, onTheme: theme => events.themes.push(theme), onFocus: () => editor.focus({ preventScroll: true }), onSettings: value => events.settings.push(value), onClose: () => events.closes++ });
      editor.setAttribute('popover', 'manual'); editor.showPopover(); paintEditor(shell.rect);
      editor.focus();
      if (editor.isContentEditable) {
        const range = document.createRange(); range.setStart(editor.firstChild, 2); range.setEnd(editor.firstChild, 5);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      } else editor.setSelectionRange(2, 5);
    }, settings);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const get = selector => page.locator(selector);
  const selection = () => page.locator('#native-editor').evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd, active: document.activeElement === element }));
  const bubbleBox = () => get('.drag-bubble').evaluate(element => {
    const rect = element.getBoundingClientRect(), computed = getComputedStyle(element);
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, placement: element.dataset.placement, pointerEvents: computed.pointerEvents, visible: computed.visibility, transition: computed.transitionDuration };
  });
  async function beginDrag(dx, dy) {
    const box = await get('.drag').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
  await test('v0.3 font number opens visible slider above native editor; 64 remains editable', async () => {
    await setup();
    const number = page.getByRole('spinbutton', { name: '字体大小' });
    await number.click();
    assert.equal(await get('.font-popover').isVisible(), true);
    assert.equal(await number.getAttribute('aria-expanded'), 'true');
    await number.fill('64'); await number.press('Enter');
    assert.equal(await page.evaluate(() => shell.fontSize), 64);
    assert.equal(await get('#native-editor').evaluate(element => getComputedStyle(element).fontSize), '64px');
    assert.equal(await page.getByRole('button', { name: '增大字体' }).isDisabled(), true);
    assert.deepEqual(await selection(), { start: 2, end: 5, active: true });
  });
  await test('v0.3 real slider drag updates font continuously; closing restores native selection', async () => {
    await setup(); await page.getByRole('spinbutton', { name: '字体大小' }).click();
    const slider = page.getByRole('slider', { name: '滑动调整字号' });
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + 8, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
    assert.ok(await page.evaluate(() => events.fonts.length >= 5), 'Dragging must send intermediate font values');
    assert.equal(await page.evaluate(() => shell.fontSize), 64);
    await page.getByRole('button', { name: '关闭字号滑块' }).click();
    assert.deepEqual(await selection(), { start: 2, end: 5, active: true });
  });
  await test('v0.3 slider supports keyboard; Escape dismisses only the slider', async () => {
    await setup(); const number = page.getByRole('spinbutton', { name: '字体大小' });
    await number.focus(); await number.press('Alt+ArrowDown');
    const slider = page.getByRole('slider', { name: '滑动调整字号' });
    await slider.press('End'); assert.equal(await page.evaluate(() => shell.fontSize), 64);
    await slider.press('Home'); assert.equal(await page.evaluate(() => shell.fontSize), 14);
    await slider.press('Escape');
    assert.equal(await get('.font-popover').isVisible(), false);
    assert.equal(await page.evaluate(() => events.closes), 0);
    assert.equal(await get('.shortcut').textContent(), 'Esc');
  });
  await test('v0.3 rich-text native range survives slider movement and resumes typing in the same place', async () => {
    await setup({}, { width: 1280, height: 900 }, 'no-preference', true);
    await page.getByRole('spinbutton', { name: '字体大小' }).click();
    const slider = page.getByRole('slider', { name: '滑动调整字号' });
    await slider.focus(); await slider.press('End'); await slider.press('Enter');
    assert.equal(await page.evaluate(() => getSelection().toString()), '中的选');
    await page.keyboard.insertText('新的');
    assert.equal(await get('#native-editor').textContent(), '原文新的区需要保留');
  });
  await test('v0.3 theme toggle updates all shell surfaces, callback and saved preference', async () => {
    await setup(); const before = await get('.window').evaluate(element => getComputedStyle(element).backgroundColor);
    await page.getByRole('button', { name: '夜间模式', exact: true }).click();
    assert.equal(await page.evaluate(() => shell.theme), 'dark');
    assert.equal(await page.getByRole('button', { name: '夜间模式', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => events.themes), ['dark']);
    assert.equal(await page.evaluate(() => events.settings.at(-1).theme), 'dark');
    assert.notEqual(await get('.window').evaluate(element => getComputedStyle(element).backgroundColor), before);
    await page.getByRole('spinbutton', { name: '字体大小' }).click();
    assert.equal(await get('.font-popover').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(32, 38, 40)');
    await setup({ theme: 'dark', fontSize: 64 });
    assert.equal(await page.evaluate(() => shell.theme), 'dark');
    assert.equal(await page.evaluate(() => shell.fontSize), 64);
  });
  await test('v0.3 pointer drag reveals exact dialogue above brand without intercepting clicks', async () => {
    await setup({ left: 240, top: 210 }); await beginDrag(45, 20);
    const box = await bubbleBox();
    assert.equal(box.visible, 'visible'); assert.equal(box.placement, 'above'); assert.equal(box.pointerEvents, 'none');
    const lines = await get('.drag-bubble span').allTextContents();
    assert.deepEqual(lines, ['老师不会想给我充电吧？？？我不是那种人！！！', '你真充了的话当我前面没说啊老师。']);
    assert.ok(box.left >= 8 && box.top >= 8 && box.right <= 1272 && box.bottom <= 892);
    await page.screenshot({ path: path.join(output, 'v030-shell-dialogue.png') });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('.miorning-text-float-shell').shadowRoot.querySelector('.drag-bubble').hasAttribute('data-visible'), { timeout: 3500 });
  });
  await test('v0.3 dialogue remains visible below top edge on narrow viewport with reduced motion', async () => {
    await setup({ left: 8, top: 8, width: 360, height: 420, theme: 'dark' }, { width: 390, height: 600 }, 'reduce');
    await beginDrag(0, 0); const box = await bubbleBox();
    assert.equal(box.placement, 'below'); assert.equal(box.visible, 'visible'); assert.equal(box.transition, '0s');
    assert.ok(box.left >= 8 && box.top >= 8 && box.right <= 382 && box.bottom <= 592);
    await page.screenshot({ path: path.join(output, 'v030-shell-dark-narrow.png') }); await page.mouse.up();
    await page.getByRole('spinbutton', { name: '字体大小' }).click();
    assert.equal((await bubbleBox()).visible, 'hidden');
    const slider = await get('.font-popover').boundingBox();
    assert.ok(slider.x >= 8 && slider.x + slider.width <= 382 && slider.y >= 8 && slider.y + slider.height <= 592);
  });
  await test('v0.3 typing hides dialogue immediately and destroy clears transient overlays', async () => {
    await setup(); await beginDrag(10, 10); await page.mouse.up();
    await get('#native-editor').focus(); await page.keyboard.insertText('继续编辑');
    assert.equal((await bubbleBox()).visible, 'hidden');
    await page.getByRole('spinbutton', { name: '字体大小' }).click();
    assert.equal(await page.evaluate(() => shell.closeTransient()), true);
    assert.equal(await page.evaluate(() => shell.closeTransient()), false);
    await page.getByRole('spinbutton', { name: '字体大小' }).click(); await page.evaluate(() => shell.destroy());
    assert.equal(await get('.miorning-text-float-shell').count(), 0);
  });
};

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ ...browserOptions(chromium), headless: true });
    const page = await browser.newPage();
    const results = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await module.exports({ page, test: async (name, run) => {
        try { await run(); results.push({ name, status: 'passed' }); console.log('PASS ' + name); }
        catch (error) { results.push({ name, status: 'failed', error: sanitize(error.stack) }); console.log('FAIL ' + name + ': ' + error.message); }
      } });
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(artifacts, 'v030-shell-report.json'), JSON.stringify({ tests: results, errors }, null, 2) + '\n');
    if (results.some(result => result.status === 'failed') || errors.length) process.exitCode = 1;
  })().catch(error => { console.error(sanitize(error.stack)); process.exitCode = 1; });
}

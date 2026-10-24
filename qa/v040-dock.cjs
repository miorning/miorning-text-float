/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { artifacts, browserOptions, sanitize } = require('./runtime.cjs');

module.exports = async function dockTests({ page, test, output = artifacts }) {
  const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../extension/icons/128.png')).toString('base64');
  const host = () => page.locator('.miorning-text-float-dock');
  const launch = () => page.locator('.launcher');
  const menu = () => page.getByRole('menu', { name: '喵咛文本窗设置' });
  const geometry = locator => locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
  });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function setup(state = {}, viewport = { width: 1000, height: 720 }, reducedMotion = 'no-preference', rejectToggle = false) {
    await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion }); await page.goto('about:blank');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e7ece7;font:16px sans-serif}button{padding:70px!important;background:red!important;font-size:70px!important}div{font-size:90px!important}#page-button{position:fixed;left:120px;top:140px;padding:15px!important;font-size:16px!important;background:white!important}</style><button id="page-button">网页按钮</button><input id="page-input" style="position:fixed;left:120px;top:260px">');
    await page.addScriptTag({ path: path.join(__dirname, '../extension/dock.js') });
    await page.evaluate(({ state, logo, rejectToggle }) => {
      globalThis.events = { toggles: [], positions: [], shortcut: 0, cache: 0, settings: 0, pageClicks: 0 };
      document.querySelector('#page-button').addEventListener('click', () => events.pageClicks++);
      globalThis.dock = MiorningTextFloatDock.create({ state, logoUrl: logo,
        onToggle: async enabled => { events.toggles.push(enabled); if (rejectToggle) throw new Error('保存失败，请重试'); return { enabled }; },
        onShortcut: () => events.shortcut++, onCache: () => events.cache++, onSettings: () => events.settings++,
        onPosition: position => events.positions.push(position)
      });
    }, { state, logo, rejectToggle }); await settle();
  }
  async function dragTo(x, y) {
    const box = await geometry(launch());
    await page.mouse.move(box.x + 22, box.y + 22); await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 }); await page.mouse.up(); await settle();
  }
  await test('v0.4 dock isolates styles and crops supplied transparent cat to a 42px check plaque', async () => {
    await setup(); const box = await geometry(host());
    assert.deepEqual(box, { x: 956, y: 338, width: 44, height: 44, right: 1000, bottom: 382 });
    assert.equal((await geometry(page.locator('.art'))).width, 42);
    assert.equal((await geometry(page.locator('.art'))).height, 27.5);
    assert.equal(await launch().evaluate(element => getComputedStyle(element).padding), '0px');
    assert.equal(await page.locator('.art img').evaluate(element => element.complete && element.naturalWidth > 0), true);
    assert.equal(await host().evaluate(element => element.matches(':popover-open')), true);
    await page.locator('#page-button').click(); assert.equal(await page.evaluate(() => events.pageClicks), 1);
  });
  await test('v0.4 hover reveals full upright cat; leaving collapses to legible red check without face', async () => {
    await setup();
    const crop = () => page.locator('.art').evaluate(element => {
      const image = element.querySelector('img'), box = element.getBoundingClientRect(), imageBox = image.getBoundingClientRect();
      const scale = image.naturalWidth / imageBox.width;
      const region = {x: (box.left-imageBox.left)*scale, y: (box.top-imageBox.top)*scale, width: box.width*scale, height: box.height*scale};
      const canvas = document.createElement('canvas'); canvas.width = Math.round(region.width); canvas.height = Math.round(region.height);
      const ctx = canvas.getContext('2d'); ctx.drawImage(image,region.x,region.y,region.width,region.height,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data; let red=0, opaque=0;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]>200)opaque++;if(pixels[i+3]>200&&pixels[i]>160&&pixels[i+1]<80&&pixels[i+2]<80)red++;}
      return {region,red,opaque,overflow:getComputedStyle(element).overflow,transform:getComputedStyle(image).transform};
    });
    const collapsed = await crop(); assert.deepEqual(collapsed.region,{x:22,y:62,width:84,height:55});
    assert.equal(collapsed.overflow,'hidden'); assert.ok(collapsed.red>250,'Red check remains clearly present'); assert.ok(collapsed.opaque>3000);
    await page.screenshot({path:path.join(output,'v040-dock-plaque.png')});
    await launch().hover(); await settle();
    assert.equal(await host().getAttribute('data-expanded'),'true');
    const expanded=await crop(); assert.deepEqual(expanded.region,{x:3,y:8,width:121,height:109});
    assert.equal(expanded.transform,'matrix(1, 0, 0, 1, -1.5, -4)','Artwork stays upright and unmirrored');
    assert.equal((await geometry(page.locator('.art'))).right,1000,'Opaque artwork bounds are flush against the right edge');
    await page.screenshot({path:path.join(output,'v040-dock-full-cat.png')});
    await page.mouse.move(400,400); await settle(); assert.equal(await host().getAttribute('data-expanded'),'false');
    assert.deepEqual((await crop()).region,collapsed.region);
  });
  await test('v0.4 cat click exposes shortcut, cache and full settings without triggering page controls', async () => {
    await setup(); await launch().click(); assert.equal(await menu().isVisible(), true);
    await page.mouse.move(400,400);assert.equal(await host().getAttribute('data-expanded'),'true','Open menu pins full cat even after pointer leaves');
    assert.match(await menu().textContent(), /Alt\+K/);
    await page.getByRole('menuitem', { name: '快捷键设置' }).click(); assert.equal(await page.evaluate(() => events.shortcut), 1);
    assert.equal(await menu().isVisible(), false);
    await launch().click(); await page.getByRole('menuitem', { name: '查看 / 清空缓存' }).click(); assert.equal(await page.evaluate(() => events.cache), 1);
    await launch().click(); await page.getByRole('menuitem', { name: '全部设置' }).click(); assert.equal(await page.evaluate(() => events.settings), 1);
    assert.equal(await page.evaluate(() => events.pageClicks), 0);
  });
  await test('v0.4 touch opens pinned full cat without requiring a hover gesture', async () => {
    await setup();
    await launch().dispatchEvent('pointerenter',{pointerId:3,pointerType:'touch',isPrimary:true});
    assert.equal(await host().getAttribute('data-expanded'),'false');
    await launch().dispatchEvent('click',{detail:1,bubbles:true});
    assert.equal(await menu().isVisible(),true);assert.equal(await host().getAttribute('data-expanded'),'true');
    await page.locator('#page-button').click();
    assert.equal(await menu().isVisible(),false);assert.equal(await host().getAttribute('data-expanded'),'false');
  });
  await test('v0.4 pause/resume invokes global toggle and paused icon stays visible at lower opacity', async () => {
    await setup(); const opacity = () => page.locator('.art').evaluate(element => Number(getComputedStyle(element).opacity));
    assert.equal(await opacity(), 1);
    await launch().click(); await page.getByRole('menuitem', { name: '暂停所有网页' }).click();
    await page.waitForFunction(() => document.querySelector('.miorning-text-float-dock').dataset.enabled === 'false');
    await page.waitForTimeout(150); assert.equal(await opacity(), .35); assert.equal(await launch().isVisible(), true);
    assert.deepEqual(await page.evaluate(() => events.toggles), [false]);
    await launch().click(); await page.getByRole('menuitem', { name: '开启所有网页' }).click();
    await page.waitForFunction(() => document.querySelector('.miorning-text-float-dock').dataset.enabled === 'true');
    assert.deepEqual(await page.evaluate(() => events.toggles), [false, true]);
  });
  await test('v0.4 rejected state save preserves enabled status and gives readable feedback', async () => {
    await setup({}, { width: 1000, height: 720 }, 'no-preference', true);
    await launch().click(); await page.getByRole('menuitem', { name: '暂停所有网页' }).click();
    await page.waitForFunction(() => !document.querySelector('.miorning-text-float-dock').shadowRoot.querySelector('.status').hidden);
    assert.equal(await host().getAttribute('data-enabled'), 'true');
    assert.equal(await page.getByRole('status').textContent(), '保存失败，请重试');
    assert.equal(await page.getByRole('menuitem', { name: '暂停所有网页' }).isEnabled(), true);
  });
  await test('v0.4 late toggle response cannot overwrite a newer cross-tab state broadcast', async () => {
    await setup();
    await page.evaluate(() => {
      const logoUrl=dock.element.shadowRoot.querySelector('img').src; dock.destroy();
      globalThis.dock=MiorningTextFloatDock.create({state:{enabled:true,revision:0},logoUrl,onToggle:()=>new Promise(resolve=>{globalThis.resolveToggle=resolve;})});
    });
    await launch().click();await page.getByRole('menuitem',{name:'暂停所有网页'}).click();
    await page.evaluate(() => {
      dock.update({enabled:true,revision:2});
      dock.update({theme:'dark'});
      resolveToggle({enabled:false,revision:1});
    });await settle();
    assert.equal(await host().getAttribute('data-enabled'),'true');assert.equal(await host().getAttribute('data-theme'),'dark');
    await launch().click();assert.equal(await page.getByRole('menuitem',{name:'暂停所有网页'}).count(),1);
    assert.equal(await page.getByRole('menuitem',{name:'开启所有网页'}).count(),0);
  });
  await test('v0.4 pointer drag snaps independently to all four edges and does not open settings', async () => {
    await setup();
    const cases = [['left', 4, 320], ['top', 410, 5], ['right', 996, 410], ['bottom', 530, 716]];
    for (const [edge, x, y] of cases) {
      await dragTo(x, y); assert.equal(await host().getAttribute('data-edge'), edge); assert.equal(await menu().isVisible(), false);
      const box = await geometry(host()), art = await geometry(page.locator('.art'));
      if (edge === 'left') assert.equal(box.x, 0);
      if (edge === 'right') assert.equal(box.right, 1000);
      if (edge === 'top') assert.equal(box.y, 0);
      if (edge === 'bottom') assert.equal(box.bottom, 720);
      if (edge === 'left') assert.equal(art.x,0);
      if (edge === 'right') assert.equal(art.right,1000);
      if (edge === 'top') assert.equal(art.y,0);
      if (edge === 'bottom') assert.equal(art.bottom,720);
    }
    const positions = await page.evaluate(() => events.positions);
    assert.equal(positions.length, 4); assert.deepEqual(positions.map(position => position.edge), ['left', 'top', 'right', 'bottom']);
    assert.ok(positions.every(position => position.ratio >= 0 && position.ratio <= 1));
  });
  await test('v0.4 saved edge and ratio restore, resize preserves ratio and partial updates preserve position', async () => {
    await setup({ dock: { edge: 'bottom', ratio: .25 }, shortcut: { code: 'KeyL', alt: true, shift: true } });
    assert.equal((await geometry(host())).x, 239);
    await page.setViewportSize({ width: 600, height: 420 }); await settle();
    let box = await geometry(host()); assert.equal(box.x, 139); assert.equal(box.bottom, 420);
    await page.evaluate(() => dock.update({ enabled: false }));
    box = await geometry(host()); assert.equal(box.x, 139); assert.equal(box.bottom, 420);
    await launch().click(); assert.match(await menu().textContent(), /Alt\+Shift\+L/);
  });
  await test('v0.4 keyboard moves and switches edges, then opens and navigates accessible menu', async () => {
    await setup(); await launch().focus(); await page.keyboard.press('Alt+ArrowLeft'); assert.equal(await host().getAttribute('data-edge'), 'left');
    await page.keyboard.press('Home'); assert.equal((await geometry(host())).y, 0);
    await page.keyboard.press('ArrowDown'); assert.ok((await geometry(host())).y > 0);
    await page.keyboard.press('Alt+ArrowDown'); assert.equal(await host().getAttribute('data-edge'), 'bottom');
    await page.keyboard.press('End'); assert.equal((await geometry(host())).right, 1000);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.querySelector('.miorning-text-float-dock').shadowRoot.activeElement.dataset.action), 'shortcut');
    await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.querySelector('.miorning-text-float-dock').shadowRoot.activeElement.dataset.action), 'cache');
    await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.querySelector('.miorning-text-float-dock').shadowRoot.activeElement.dataset.action), 'toggle');
    await page.keyboard.press('Escape'); assert.equal(await menu().isVisible(), false);
    assert.equal(await page.evaluate(() => document.querySelector('.miorning-text-float-dock').shadowRoot.activeElement.className), 'launcher');
  });
  await test('v0.4 all edge menus remain inside narrow viewport and theme follows shared preference', async () => {
    await setup({ theme: 'dark' }, { width: 280, height: 320 });
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      await page.evaluate(edge => dock.update({ dock: { edge, ratio: 1 } }), edge); await page.evaluate(() => dock.openMenu());
      const box = await geometry(menu()); assert.ok(box.x >= 7.5 && box.y >= 7.5 && box.right <= 272.5 && box.bottom <= 312.5, JSON.stringify(box));
      await page.evaluate(() => dock.closeMenu());
    }
    assert.equal(await host().getAttribute('data-theme'), 'dark');
    await page.evaluate(() => dock.openMenu());
    assert.equal(await menu().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(36, 38, 40)');
    await page.screenshot({ path: path.join(output, 'v040-dock-dark-narrow.png') });
  });
  await test('v0.4 reduced-motion removes hover scaling and transition; icon remains readable paused', async () => {
    await setup({ enabled: false }, { width: 1000, height: 720 }, 'reduce'); await launch().hover();
    const styles = await page.locator('.art').evaluate(element => { const css = getComputedStyle(element); return { transition: css.transitionDuration, transform: css.transform, opacity: css.opacity }; });
    assert.deepEqual(styles, { transition: '0s', transform: 'none', opacity: '0.35' });
    assert.equal(await host().getAttribute('data-expanded'),'true');
    await launch().click(); await page.screenshot({ path: path.join(output, 'v040-dock-light.png') });
  });
  await test('v0.4 native top-layer menus stay above idle dock; explicit settings opening can restack', async () => {
    await setup();
    await page.evaluate(() => {
      const popup = document.createElement('div'); popup.id = 'native-reference-popup'; popup.setAttribute('popover', 'manual');
      popup.style.cssText = 'position:fixed;inset:auto;margin:0;padding:0;border:0;left:940px;top:320px;width:60px;height:80px;background:white';
      document.body.append(popup); popup.showPopover();
    });
    assert.equal(await page.evaluate(() => document.elementFromPoint(978, 360).id), 'native-reference-popup');
    await page.evaluate(() => dock.update({ enabled: false }));
    assert.equal(await page.evaluate(() => document.elementFromPoint(978, 360).id), 'native-reference-popup');
    await page.evaluate(() => dock.openMenu());
    assert.equal(await page.evaluate(() => document.elementFromPoint(978, 360).className), 'miorning-text-float-dock');
  });
  await test('v0.4 outside click and keyboard focus dismiss settings without stealing page interaction', async () => {
    await setup(); await launch().click(); await page.locator('#page-button').click();
    assert.equal(await menu().isVisible(), false); assert.equal(await page.evaluate(() => events.pageClicks), 1);
    await launch().click(); await page.locator('#page-input').focus();
    assert.equal(await menu().isVisible(), false); assert.equal(await page.evaluate(() => document.activeElement.id), 'page-input');
  });
  await test('v0.4 cancellation restores edge and destroy removes listeners, timers and top-layer UI', async () => {
    await setup();
    await launch().dispatchEvent('pointerdown', { pointerId: 5, isPrimary: true, button: 0, clientX: 978, clientY: 360 });
    await launch().dispatchEvent('pointermove', { pointerId: 5, isPrimary: true, clientX: 100, clientY: 400 }); await settle();
    await launch().dispatchEvent('pointercancel', { pointerId: 5, isPrimary: true }); await settle();
    assert.equal(await host().getAttribute('data-edge'), 'right'); assert.equal((await geometry(host())).right, 1000);
    assert.equal(await page.evaluate(() => events.positions.length), 0);
    await page.evaluate(() => { dock.openMenu(); dock.destroy(); dock.update({ enabled: false }); dock.openMenu(); dock.destroy(); });
    assert.equal(await host().count(), 0);
    await page.setViewportSize({ width: 600, height: 400 }); await page.locator('#page-button').click(); await settle();
    assert.equal(await page.evaluate(() => events.pageClicks), 1); assert.equal(await page.locator('[popover]:popover-open').count(), 0);
  });
};

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ ...browserOptions(chromium), headless: true });
    const page = await browser.newPage(); const results = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try { await module.exports({ page, test: async (name, run) => {
      try { await run(); results.push({ name, status: 'passed' }); console.log('PASS ' + name); }
      catch (error) { results.push({ name, status: 'failed', error: sanitize(error.stack) }); console.log('FAIL ' + name + ': ' + error.message); }
    } }); } finally { await browser.close(); }
    fs.writeFileSync(path.join(artifacts, 'v040-dock-report.json'), JSON.stringify({ tests: results, errors }, null, 2) + '\n');
    if (results.some(result => result.status === 'failed') || errors.length) process.exitCode = 1;
  })().catch(error => { console.error(sanitize(error.stack)); process.exitCode = 1; });
}

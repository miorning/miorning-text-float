'use strict';
const path = require('node:path');
const { artifacts } = require('./runtime.cjs');

module.exports = async ({context,page,qa,assert}) => {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const all=()=>worker.evaluate(()=>chrome.storage.local.get(null));
  const history=async()=>Object.entries(await all()).filter(([k])=>k.includes(':history:'));
  async function savedText(text) {
    for(let i=0;i<100;i++) {const found=(await history()).some(([,doc])=>doc.versions.some(v=>v.status==='saved'&&v.snapshot.value===text));if(found)return;await new Promise(resolve=>setTimeout(resolve,30));}
    assert.fail('MV3 chrome.storage.local never confirmed '+text);
  }
  async function open(selector='#fixture-textarea') {await page.locator('.miorning-text-float-dock').waitFor({state:'visible'});await page.locator(selector).click();await page.locator('.version-tab').first().waitFor({state:'visible'});}
  async function close() {await page.keyboard.press('Escape');await page.locator('.miorning-text-float-shell').waitFor({state:'detached'});}
  await savedText('真实 MV3 注入验证\n第二行');
  assert.equal((await page.evaluate(()=>indexedDB.databases())).some(db=>db.name==='miorning-text-float-v2'),false,'Extension must not persist in the website IDB fallback');
  await page.reload();await open();
  assert.equal(await page.locator('#fixture-textarea').inputValue(),'真实 MV3 注入验证\n第二行');
  assert.ok(await page.locator('.version-tab').count()>=2);
  await page.getByRole('spinbutton',{name:'字体大小'}).fill('23');await page.getByRole('spinbutton',{name:'字体大小'}).press('Enter');
  await page.getByRole('button',{name:'夜间模式',exact:true}).click();
  const handle=await page.locator('.handle.se').boundingBox();await page.mouse.move(handle.x+7,handle.y+7);await page.mouse.down();await page.mouse.move(handle.x+80,handle.y+40,{steps:5});await page.mouse.up();
  const expected=await page.locator('.window').boundingBox();await page.locator('#fixture-textarea').focus();await close();
  await page.reload();await open();
  assert.equal(await page.getByRole('spinbutton',{name:'字体大小'}).inputValue(),'23');assert.equal(await page.getByRole('button',{name:'夜间模式',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('checkbox',{name:'保留原文字'}).count(),0);
  const actual=await page.locator('.window').boundingBox();assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
  const savedOptions=(await all())['miorning-text-float:v2:settings'];assert.equal(savedOptions.fontSize,23);assert.equal(savedOptions.theme,'dark');
  assert.ok(await page.locator('.logo').evaluate(el=>el.complete&&el.naturalWidth===48),'Packaged extension logo loads');
  await worker.evaluate(()=>{globalThis.qaRealSet=chrome.storage.local.set;chrome.storage.local.set=function(){throw new Error('QA simulated chrome.storage.local failure');};});
  await page.getByRole('spinbutton',{name:'字体大小'}).fill('25');await page.getByRole('spinbutton',{name:'字体大小'}).press('Enter');
  await page.locator('#fixture-textarea').focus();await page.keyboard.press('Control+A');await page.keyboard.insertText('MV3 存储失败仍保留的最后输入');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>/未保存|失败|failure/.test(document.querySelector('.miorning-text-float-shell')?.shadowRoot?.querySelector('.status')?.textContent || ''));
  assert.equal(await page.locator('.miorning-text-float-shell').count(),1);assert.equal(await page.locator('#fixture-textarea').inputValue(),'MV3 存储失败仍保留的最后输入');
  assert.equal((await page.evaluate(()=>indexedDB.databases())).some(db=>db.name==='miorning-text-float-v2'),false,'Failure must not silently fall back to site storage');
  await page.screenshot({path:path.join(artifacts,'v020-mv3-storage-failure.png')});
  await worker.evaluate(()=>{chrome.storage.local.set=qaRealSet;delete globalThis.qaRealSet;});await close();await savedText('MV3 存储失败仍保留的最后输入');
  assert.equal((await all())['miorning-text-float:v2:settings'].fontSize,25);
  await page.reload();await open();assert.ok(await page.locator('.version-tab').count()>=3);await page.screenshot({path:path.join(artifacts,'v020-mv3.png')});await close();
  const checks=['real chrome.storage.local version persistence across reload','real MV3 settings persistence across reload','extension assets load','storage failure leaves editor open and preserves text','storage retry commits latest text','no website IndexedDB fallback in extension context'];
  const options=await context.newPage();
  const extensionOrigin=worker.url().replace(/\/[^/]*$/,'');
  await options.route('**/*',route=>route.request().url().startsWith(extensionOrigin)?route.continue():route.abort());
  await options.goto(extensionOrigin+'/options.html');
  await options.waitForFunction(()=>!document.querySelector('#global-toggle').disabled);
  assert.equal(await options.locator('#global-toggle').getAttribute('aria-checked'),'true');
  assert.equal(await options.locator('#shortcut-input').inputValue(),'Alt + K');
  assert.equal(await options.locator('#site-url,#add-site').count(),0,'Retired site allowlist UI is removed');
  assert.equal(await page.locator('.miorning-text-float-dock .art img').evaluate(el=>el.complete&&el.naturalWidth===128),true,'Dock uses supplied packaged cat image');
  await options.locator('#global-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.miorning-text-float-dock').dataset.enabled==='false');
  await page.locator('#fixture-textarea').click();assert.equal(await page.locator('.miorning-text-float-shell').count(),0);
  assert.ok((await history()).length>0,'Pausing retains saved history');
  await options.locator('#global-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.miorning-text-float-dock').dataset.enabled==='true');
  await open();await close();
  await options.locator('#shortcut-record').click();await options.locator('#shortcut-input').press('Alt+Shift+L');
  await options.waitForFunction(()=>document.querySelector('#shortcut-input').value==='Alt + Shift + L');
  const shortcut=(await all())['miorning-text-float:v4:control'].shortcut;
  assert.deepEqual(shortcut,{code:'KeyL',alt:true,ctrl:false,shift:true,meta:false});
  await options.locator('#shortcut-record').click();await options.locator('#shortcut-input').press('Escape');
  assert.equal(await options.locator('#shortcut-input').inputValue(),'Alt + Shift + L');
  await options.locator('#shortcut-reset').click();await options.waitForFunction(()=>document.querySelector('#shortcut-input').value==='Alt + K');
  await options.locator('#cache-refresh').click();await options.locator('.cache-site input[value="https://www.liblib.tv"]').check();
  const beforeCache=await history();await options.locator('#cache-clear').click();
  assert.equal(await options.locator('#cache-confirm').evaluate(dialog=>dialog.open),true);
  assert.deepEqual(await history(),beforeCache,'Second confirmation has not deleted data');
  await options.locator('#cache-cancel').click();assert.deepEqual(await history(),beforeCache,'Cancel preserves history');
  await options.screenshot({path:path.join(artifacts,'v040-global-settings.png'),fullPage:true});
  checks.push('production options global toggle updates existing tab while retaining histories','shortcut recording, cancel and reset persist in real extension storage','cache selection requires second confirmation and cancel preserves data','packaged cat dock loads while paused; old site allowlist and keep-text control removed');
  await options.close();
  return checks;
};

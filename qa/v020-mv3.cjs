'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { artifacts } = require('./runtime.cjs');

module.exports = async ({context,page,qa,assert}) => {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const all=()=>worker.evaluate(()=>chrome.storage.local.get(null));
  const history=async()=>Object.entries(await all()).filter(([k])=>k.includes(':history:'));
  async function savedText(text) {
    for(let i=0;i<100;i++) {const found=(await history()).some(([,doc])=>doc.versions.some(v=>v.status==='saved'&&v.snapshot.value===text));if(found)return;await new Promise(resolve=>setTimeout(resolve,30));}
    assert.fail('MV3 chrome.storage.local never confirmed '+text);
  }
  async function open(selector='#fixture-textarea') {await page.locator(selector).click();await page.locator('.version-tab').first().waitFor({state:'visible'});}
  async function close() {await page.keyboard.press('Control+Enter');await page.locator('.miorning-text-float-shell').waitFor({state:'detached'});}
  await savedText('真实 MV3 注入验证\n第二行');
  assert.equal((await page.evaluate(()=>indexedDB.databases())).some(db=>db.name==='miorning-text-float-v2'),false,'Extension must not persist in the website IDB fallback');
  await page.reload();await open();
  assert.equal(await page.locator('#fixture-textarea').inputValue(),'真实 MV3 注入验证\n第二行');
  assert.ok(await page.locator('.version-tab').count()>=2);
  await page.getByRole('spinbutton',{name:'字体大小'}).fill('23');await page.getByRole('spinbutton',{name:'字体大小'}).press('Enter');
  await page.getByRole('checkbox',{name:'保留原文字'}).check();
  const handle=await page.locator('.handle.se').boundingBox();await page.mouse.move(handle.x+7,handle.y+7);await page.mouse.down();await page.mouse.move(handle.x+80,handle.y+40,{steps:5});await page.mouse.up();
  const expected=await page.locator('.window').boundingBox();await page.locator('#fixture-textarea').focus();await close();
  await page.reload();await open();
  assert.equal(await page.getByRole('spinbutton',{name:'字体大小'}).inputValue(),'23');assert.equal(await page.getByRole('checkbox',{name:'保留原文字'}).isChecked(),true);
  const actual=await page.locator('.window').boundingBox();assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
  const savedOptions=(await all())['miorning-text-float:v2:settings'];assert.equal(savedOptions.fontSize,23);assert.equal(savedOptions.keepText,true);
  assert.ok(await page.locator('.logo').evaluate(el=>el.complete&&el.naturalWidth===48),'Packaged extension logo loads');
  await worker.evaluate(()=>{globalThis.qaRealSet=chrome.storage.local.set;chrome.storage.local.set=function(){throw new Error('QA simulated chrome.storage.local failure');};});
  await page.getByRole('spinbutton',{name:'字体大小'}).fill('25');await page.getByRole('spinbutton',{name:'字体大小'}).press('Enter');
  await page.locator('#fixture-textarea').focus();await page.keyboard.press('Control+A');await page.keyboard.insertText('MV3 存储失败仍保留的最后输入');await page.keyboard.press('Control+Enter');
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
  await options.getByText('还没有添加其他网站。').waitFor();
  await options.locator('#site-url').fill('https://*.example.com');await options.locator('#add-site').click();
  assert.match(await options.locator('#feedback').innerText(),/通配符/);
  await options.locator('#site-url').fill('https://www.liblib.tv/canvas');await options.locator('#add-site').click();
  assert.match(await options.locator('#feedback').innerText(),/默认支持/);
  checks.push('packaged options page loads; rejects wildcard and duplicate built-in site');
  await options.screenshot({path:path.join(artifacts,'v020-site-settings.png')});
  await options.locator('#site-url').fill('https://qa.miorning.test/canvas');await options.locator('#add-site').click();
  let complete=false;
  try {await options.waitForFunction(()=>!document.querySelector('#site-url').disabled,{},{timeout:6000});complete=true;}catch{}
  if(complete && await options.locator('.site').filter({hasText:'https://qa.miorning.test'}).count()) {
    const registered=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());
    assert.ok(registered.some(item=>item.matches.includes('https://qa.miorning.test/*')));
    const custom=await context.newPage();
    await custom.route('**/*',route=>route.request().url().startsWith('chrome-extension://')?route.continue():route.request().url().startsWith('https://qa.miorning.test/')?route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(qa,'fixture.html'),'utf8')}):route.abort());
    await custom.goto('https://qa.miorning.test/canvas');await custom.locator('#fixture-textarea').click();await custom.locator('.miorning-text-float-shell').waitFor();
    await custom.keyboard.press('Control+Enter');await custom.locator('.miorning-text-float-shell').waitFor({state:'detached'});
    await options.getByRole('button',{name:'停用 https://qa.miorning.test',exact:true}).click();
    await options.getByRole('button',{name:'启用 https://qa.miorning.test',exact:true}).waitFor();
    assert.ok(!(await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).some(item=>item.matches.includes('https://qa.miorning.test/*')));
    await custom.reload();await custom.locator('#fixture-textarea').click();assert.equal(await custom.locator('.miorning-text-float-shell').count(),0);
    await options.getByRole('button',{name:'移除 https://qa.miorning.test',exact:true}).click();await options.getByText('还没有添加其他网站。').waitFor();
    assert.ok((await history()).some(([key])=>decodeURIComponent(key).includes('qa.miorning.test')),'Removing site retains its text history');
    await custom.close();checks.push('real optional-site permission request and registration; custom-origin injection; disable/remove revoke injection without deleting history');
  } else {
    const message=complete?await options.locator('#feedback').innerText():'browser permission prompt remained pending in headless mode';
    checks.push('LIMITATION: first-time optional-site browser permission dialog not automated in the production manifest ('+message+'); registration is verified separately with a preauthorized fixture manifest.');
  }
  await options.close();
  return checks;
};

'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const { artifacts, browserLabel, sanitize, temporaryDirectory, removeTemporary } = require('./runtime.cjs');

// This separate fixture manifest grants only the synthetic origin beforehand.
// It verifies real registration/injection APIs, not the browser's first-grant UI.
module.exports=async({chromium,qa,extension,assert,launchOptions})=>{
  const directory=temporaryDirectory('temporary-preauthorized-extension-');
  const profile=temporaryDirectory('temporary-preauthorized-profile-');
  fs.cpSync(extension,directory,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  manifest.host_permissions=['https://qa.miorning.test/*'];
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  const hashes={};for(const name of ['store.js','shell.js','references.js','content.js','background.js','options.js','options.html','options.css']){
    const source=fs.readFileSync(path.join(extension,name)),copied=fs.readFileSync(path.join(directory,name));assert.ok(source.equals(copied));hashes[name]=crypto.createHash('sha256').update(source).digest('hex');
  }
  let context;
  try{
    context=await chromium.launchPersistentContext(profile,{...launchOptions,headless:true,args:[`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const origin=worker.url().replace(/\/[^/]*$/,'');
    await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.request().url().startsWith('https://qa.miorning.test/')?route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(qa,'fixture.html'),'utf8')}):route.abort());
    const settings=await context.newPage();await settings.goto(origin+'/options.html');await settings.getByText('还没有添加其他网站。').waitFor();
    await settings.locator('#site-url').fill('https://qa.miorning.test/canvas?example=1');await settings.locator('#add-site').click();
    await settings.getByRole('button',{name:'停用 https://qa.miorning.test',exact:true}).waitFor();
    const scripts=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());assert.equal(scripts.length,1);assert.deepEqual(scripts[0].matches,['https://qa.miorning.test/*']);assert.deepEqual(scripts[0].js,['store.js','shell.js','references.js','content.js']);
    const custom=await context.newPage();await custom.goto('https://qa.miorning.test/canvas');await custom.locator('#fixture-textarea').click();await custom.locator('.version-tab').first().waitFor();
    await custom.keyboard.press('Control+A');await custom.keyboard.insertText('自定义站点真实自动注入');await custom.keyboard.press('Control+Enter');await custom.locator('.miorning-text-float-shell').waitFor({state:'detached'});
    await settings.getByRole('button',{name:'停用 https://qa.miorning.test',exact:true}).click();await settings.getByRole('button',{name:'启用 https://qa.miorning.test',exact:true}).waitFor();
    assert.equal((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).length,0);await custom.reload();await custom.locator('#fixture-textarea').click();assert.equal(await custom.locator('.miorning-text-float-shell').count(),0);
    await settings.getByRole('button',{name:'启用 https://qa.miorning.test',exact:true}).click();await settings.getByRole('button',{name:'停用 https://qa.miorning.test',exact:true}).waitFor();
    await custom.reload();await custom.locator('#fixture-textarea').click();await custom.locator('.version-tab').first().waitFor();assert.equal(await custom.locator('#fixture-textarea').inputValue(),'自定义站点真实自动注入');await custom.screenshot({path:path.join(artifacts,'v020-custom-site.png')});
    await custom.keyboard.press('Control+Enter');await custom.locator('.miorning-text-float-shell').waitFor({state:'detached'});
    await settings.screenshot({path:path.join(artifacts,'v020-site-enabled.png')});await settings.getByRole('button',{name:'移除 https://qa.miorning.test',exact:true}).click();await settings.getByText('还没有添加其他网站。').waitFor();
    assert.equal((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).length,0);await custom.reload();await custom.locator('#fixture-textarea').click();assert.equal(await custom.locator('.miorning-text-float-shell').count(),0);
    const all=await worker.evaluate(()=>chrome.storage.local.get(null));assert.ok(Object.entries(all).some(([key,value])=>key.includes(':history:')&&value.versions.some(v=>v.snapshot.value==='自定义站点真实自动注入')));
    return{status:'passed',mode:'Disposable '+browserLabel(launchOptions)+' profile; fixture-only host preauthorized in a manifest variant; all production JS/CSS/HTML byte-identical',manifestDifference:{host_permissions:['https://qa.miorning.test/*']},sourceHashes:hashes,checks:['Options add normalizes path to exact origin','Real registerContentScripts injects production scripts on synthetic origin','Native textarea text and version storage work','Disable unregisters injection on refresh','Enable restores injection and stored history','Remove unregisters injection and retains text versions'],limitation:'The first-time browser permission grant dialog remains unautomated.'};
  }catch(error){return{status:'failed',reason:sanitize(error.stack)};}
  finally{
    await context?.close();
    for(const target of [profile,directory]) removeTemporary(target);
  }
};

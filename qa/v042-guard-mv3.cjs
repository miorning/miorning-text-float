/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
// The companion Guard is loaded from its separately licensed checkout. Its code
// and package are never copied into this GPL repository or this extension.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const runtime=require('./runtime.cjs');
const extension=path.resolve(__dirname,'../extension');
const defaultBase=path.resolve(__dirname,'../../../MIORNING-GitHub-release');
const guard=process.env.MIORNING_GUARD_EXTENSION || path.join(defaultBase,'repo');
const original=process.env.MIORNING_TEXT_FLOAT_BASELINE || path.resolve(__dirname,'../dist/MiorningTextFloat-v0.4.1/extension');
const fixtureUrl='https://compat-guard.example/editor';
const manifest=dir=>JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const productFiles=['manifest.json',...manifest(extension).content_scripts[0].js];
const sourceHashes=Object.fromEntries(productFiles.map(name=>[name,sha(path.join(extension,name))]));
const tests=[];
const fixture='<!doctype html><html><head><title>Isolated compatibility fixture</title></head><body style="padding:30px"><div><textarea id="prompt" style="width:300px;height:120px">alpha</textarea></div><div><div contenteditable="true" id="rich" style="width:300px;height:100px;white-space:pre-wrap">rich</div></div><textarea id="other" style="position:absolute;left:1000px;top:600px;width:200px">outside</textarea><button id="generate">生成视频</button><script>window.generated=0;document.querySelector("#generate").onclick=()=>window.generated++;</script></body></html>';
async function test(name,fn){try{await fn();tests.push({name,status:'passed'});console.log('PASS '+name);}catch(error){tests.push({name,status:'failed',error:runtime.sanitize(error.stack||error.message)});throw error;}}
async function suite(textDirectory,reverse){
 const baseline=manifest(textDirectory).version==='0.4.1';
 const order=reverse?[textDirectory,guard]:[guard,textDirectory];
 const label=(baseline?'Text Float v0.4.1 baseline':'New Text Float')+' + unchanged Guard v1.8.0 / '+(reverse?'Text Float first':'Guard first');
 const profile=runtime.temporaryDirectory('temporary-v042-guard-');let context;
 try{
  context=await chromium.launchPersistentContext(profile,{headless:true,...runtime.browserOptions(chromium,true),args:['--disable-extensions-except='+order.join(','),'--load-extension='+order.join(',')]});
  let gw,tw,names=[];
  for(let i=0;i<300&&(!gw||!tw);i++){
   for(const worker of context.serviceWorkers()){
    const found=await worker.evaluate(()=>chrome.runtime.getManifest()).catch(()=>null);
    if(!found)continue;names.push(found.name+'@'+found.version);
    if(found.name==='MIORNING 喵咛')gw=worker;
    if(found.name.includes('文本窗'))tw=worker;
   }
   if(!gw||!tw)await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(gw&&tw,'Both production manifests loaded: '+[...new Set(names)].join(', '));
  await gw.evaluate(()=>chrome.storage.local.set({mpg_state_v1_7_0:{enabled:true,guardSites:['https://compat-guard.example'],autoBackupEnabled:false,trashTalk:{systemEnabled:false}}}));
  await context.route(/^https?:\/\//,route=>route.fulfill({contentType:'text/html;charset=utf-8',body:fixture}));
  const page=await context.newPage(),errors=[];let initialHistoryKey;
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixtureUrl);
  await page.locator('.miorning-text-float-dock').waitFor({state:'attached'});
  await page.locator('#mpg-floating-dock').waitFor({state:'attached'});
  const tabs=await tw.evaluate(()=>chrome.tabs.query({url:'https://compat-guard.example/*'})),tabId=tabs[0].id;
  const action=(name,value=null)=>tw.evaluate(async({tabId,name,value})=>(await chrome.scripting.executeScript({target:{tabId},func:async(name,value)=>{
   if(name==='compatChecks'){
    const result=[],outer=document.createElement('div');outer.id='compat-fixture-boundary';document.body.append(outer);
    const check=(ok,name)=>{if(!ok)throw new Error(name);result.push(name);};
    let session;
    try{
     outer.innerHTML='<textarea></textarea>';let editor=outer.firstElementChild;session=MiorningTextFloatCompat.acquire(editor);
     check(session.protected&&editor.id.startsWith('mpg-'),'idless editor gets bounded marker');session.release();check(!editor.hasAttribute('id'),'release restores absent id exactly');
     outer.innerHTML='<textarea id=""></textarea>';editor=outer.firstElementChild;session=MiorningTextFloatCompat.acquire(editor);session.release();check(editor.getAttribute('id')==='','empty id attribute survives release');
     outer.innerHTML='<div><textarea id="site-editor"></textarea></div>';editor=outer.querySelector('textarea');let parent=editor.parentElement;session=MiorningTextFloatCompat.acquire(editor);
     check(session.protected&&editor.id==='site-editor'&&parent.id.startsWith('mpg-'),'dedicated parent protects existing editor id');
     const other=document.createElement('input');parent.append(other);await new Promise(resolve=>setTimeout(resolve,0));check(!session.protected&&!parent.hasAttribute('id')&&session.reason==='scope-changed','new sibling input removes scope exemption');
     other.remove();await new Promise(resolve=>setTimeout(resolve,0));check(session.protected&&parent.id.startsWith('mpg-'),'removing temporary sibling restores dedicated scope');
     const menu=document.createElement('div');menu.innerHTML='<button>图片引用</button>';parent.append(menu);await new Promise(resolve=>setTimeout(resolve,0));check(!session.protected&&!parent.hasAttribute('id'),'native reference action temporarily suspends scope');menu.remove();await new Promise(resolve=>setTimeout(resolve,0));check(session.protected&&parent.id.startsWith('mpg-'),'closing native reference menu restores scope');session.release();
     outer.innerHTML='<div><textarea id="site-editor"></textarea></div>';editor=outer.querySelector('textarea');parent=editor.parentElement;session=MiorningTextFloatCompat.acquire(editor);parent.id='site-new-id';await new Promise(resolve=>setTimeout(resolve,0));session.release();check(parent.id==='site-new-id'&&!session.protected,'site replacement id is never overwritten');
     outer.innerHTML='<div id="site-parent"><textarea id="site-editor"></textarea></div>';editor=outer.querySelector('textarea');session=MiorningTextFloatCompat.acquire(editor);check(!session.protected&&session.reason==='no-dedicated-idless-host'&&editor.id==='site-editor'&&editor.parentElement.id==='site-parent','existing ancestor IDs are not overwritten');session.release();
     for(const sibling of ['<input>','<button>生成</button>','<a href="#">action</a>']){outer.innerHTML='<div><textarea id="site-editor"></textarea>'+sibling+'</div>';editor=outer.querySelector('textarea');session=MiorningTextFloatCompat.acquire(editor);check(!session.protected&&!editor.parentElement.hasAttribute('id'),'shared sibling remains protected '+sibling);session.release();}
     outer.innerHTML='<div><textarea id="site-editor"></textarea></div>';editor=outer.querySelector('textarea');parent=editor.parentElement;const verifiedMenu=document.createElement('div');verifiedMenu.innerHTML='<button>引用图片</button>';let owned=false;
     session=MiorningTextFloatCompat.acquire(editor,{ownsReferenceNode:node=>owned&&verifiedMenu.contains(node)});parent.append(verifiedMenu);await new Promise(resolve=>setTimeout(resolve,0));check(!session.protected,'unverified native action still suspends protection');
     owned=true;verifiedMenu.setAttribute('data-miorning-native-reference-menu','');await new Promise(resolve=>setTimeout(resolve,0));check(session.protected,'verified menu marker callback restores protection while menu open');
     verifiedMenu.hidden=true;owned=false;verifiedMenu.removeAttribute('data-miorning-native-reference-menu');await new Promise(resolve=>setTimeout(resolve,0));check(session.protected,'previously verified hidden actions stay inactive');
     verifiedMenu.hidden=false;await new Promise(resolve=>setTimeout(resolve,0));check(!session.protected,'reshown unverified actions revoke exemption');
     owned=true;verifiedMenu.setAttribute('data-miorning-native-reference-menu','');await new Promise(resolve=>setTimeout(resolve,0));check(session.protected,'reverified actions restore exemption');
     verifiedMenu.append(document.createElement('input'));await new Promise(resolve=>setTimeout(resolve,0));check(!session.protected,'menu ownership cannot authorize another editable input');session.release();
     check(!document.body.id&&!document.documentElement.id,'document-wide ancestors never exempted');
    }finally{session?.release();outer.remove();}return result;
   }
   if(name==='open'){await MiorningTextFloat.open(document.querySelector(value));await MiorningTextFloat.whenIdle();}
   if(name==='close')await MiorningTextFloat.close();
   if(name==='enabled'){await MiorningTextFloatControl.setEnabled(value);await new Promise(r=>setTimeout(r,100));await MiorningTextFloat.whenIdle();}
   return MiorningTextFloat.getState();
  },args:[name,value]}))[0].result,{tabId,name,value});
  await test(label+' loads both original production manifests and enables Guard for fixture',async()=>{
   assert.equal(await gw.evaluate(()=>chrome.runtime.getManifest().version),'1.8.0');
   assert.equal((await gw.evaluate(()=>chrome.storage.local.get('mpg_state_v1_7_0'))).mpg_state_v1_7_0.enabled,true);
   const opened=await action('open','#prompt');assert.equal(opened.open,true);initialHistoryKey=opened.historyKey;
  });
  await test(label+(baseline?' reproduces lost Enter without any generation':' textarea Enter and Shift+Enter insert newlines without Guard modal'),async()=>{
   await page.locator('#prompt').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.waitForTimeout(150);
   if(baseline){assert.equal(await page.locator('#prompt').inputValue(),'alpha');assert.equal(await page.locator('#mpg-modal-root').count(),1);await page.keyboard.press('Escape');}
   else{
    assert.equal(await page.locator('#prompt').inputValue(),'alpha\n');assert.equal(await page.locator('#mpg-modal-root').count(),0);
    await page.keyboard.press('Shift+Enter');await page.keyboard.type('beta');assert.equal(await page.locator('#prompt').inputValue(),'alpha\n\nbeta');
    await page.keyboard.press('Control+Enter');assert.equal(await page.locator('#prompt').inputValue(),'alpha\n\nbeta');assert.equal(await page.locator('#mpg-modal-root').count(),0);
   }
   assert.equal(await page.evaluate(()=>window.generated),0);
  });
  if(!baseline){
   await test(label+' native reference menu closes and Enter exemption resumes',async()=>{
    await page.locator('#prompt').evaluate(editor=>{const menu=document.createElement('div');menu.dataset.qaGuardMenu='';menu.setAttribute('role','listbox');menu.innerHTML='<button>图片参考</button>';editor.parentElement.append(menu);});
    await page.waitForFunction(()=>!document.querySelector('#prompt').parentElement.id);
    await page.locator('[data-qa-guard-menu]').evaluate(el=>el.remove());
    await page.waitForFunction(()=>document.querySelector('#prompt').parentElement.id.startsWith('mpg-'));
    await page.locator('#prompt').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#prompt').inputValue(),'alpha\n\nbeta\n');assert.equal(await page.locator('#mpg-modal-root').count(),0);assert.equal(await page.evaluate(()=>generated),0);
   });
   await test(label+' Enter while the verified native reference menu is open keeps newline behavior',async()=>{
    await page.locator('#prompt').focus();await page.keyboard.type('@');const before=await page.locator('#prompt').inputValue();
    await page.locator('#prompt').evaluate(editor=>{const menu=document.createElement('div');menu.id='guard-native-reference-menu';menu.setAttribute('role','listbox');menu.style.cssText='position:fixed;left:350px;top:200px;width:200px;height:40px;background:white';menu.innerHTML='<button type="button" data-reference-name="参考图">参考图</button>';editor.setAttribute('aria-controls',menu.id);editor.parentElement.append(menu);});
    await page.locator('#guard-native-reference-menu[data-miorning-native-reference-menu]').waitFor({state:'attached'});
    await page.waitForFunction(()=>document.querySelector('#prompt').parentElement.id.startsWith('mpg-'));
    await page.locator('#prompt').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#prompt').inputValue(),before+'\n');assert.equal(await page.locator('#mpg-modal-root').count(),0);
    await page.locator('#guard-native-reference-menu').evaluate(el=>el.hidden=true);
    await page.waitForFunction(()=>!document.querySelector('#guard-native-reference-menu').hasAttribute('data-miorning-native-reference-menu'));
    await page.waitForFunction(()=>document.querySelector('#prompt').parentElement.id.startsWith('mpg-'));
    await page.keyboard.press('Enter');assert.equal(await page.locator('#prompt').inputValue(),before+'\n\n');assert.equal(await page.locator('#mpg-modal-root').count(),0);
    await page.locator('#guard-native-reference-menu').evaluate(el=>el.remove());await page.locator('#prompt').evaluate(el=>el.removeAttribute('aria-controls'));
    await page.keyboard.press('Enter');assert.equal(await page.locator('#prompt').inputValue(),before+'\n\n\n');assert.equal(await page.locator('#mpg-modal-root').count(),0);assert.equal(await page.evaluate(()=>generated),0);
   });
  }
  await action('close');
  if(!baseline){
   await test(label+' closing and page reload preserve the original field history identity',async()=>{
    assert.equal(await page.locator('#prompt').getAttribute('id'),'prompt');assert.equal(await page.locator('#prompt').evaluate(el=>el.parentElement.hasAttribute('id')),false);
    await page.reload();await page.locator('.miorning-text-float-dock').waitFor({state:'attached'});await page.locator('#mpg-floating-dock').waitFor({state:'attached'});
    const reopened=await action('open','#prompt');assert.equal(reopened.historyKey,initialHistoryKey);assert.ok(reopened.versions.length>=1);await action('close');
   });
   await test(label+' rich original editor retains multiline editing and closes on Escape',async()=>{
    await action('open','#rich');await page.locator('#rich').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('next');await page.keyboard.press('Shift+Enter');await page.keyboard.type('third');
    assert.match(await page.locator('#rich').innerText(),/rich\nnext\nthird/);assert.equal(await page.locator('#mpg-modal-root').count(),0);
    await page.keyboard.press('Escape');await page.locator('.miorning-text-float-shell').waitFor({state:'detached'});
    assert.equal(await page.locator('#rich').getAttribute('data-miorning-floating-editor'),null);
   });
  }
  await test(label+' ordinary editor still opens Guard and Escape dismisses only its confirmation',async()=>{
   await action('enabled',false);
   await page.locator('#other').focus();await page.keyboard.press('Enter');await page.locator('#mpg-modal-root').waitFor({state:'attached'});
   assert.equal(await page.locator('#other').inputValue(),'outside');assert.equal(await page.evaluate(()=>window.generated),0);
   await page.keyboard.press('Escape');await page.locator('#mpg-modal-root').waitFor({state:'detached'});
  });
  if(!baseline){
   await test(label+' bounded compatibility marker preserves site IDs, shared fields and new siblings',async()=>{
    const checks=await action('compatChecks');assert.equal(checks.length,20);
   });
   await test(label+' stale marker without an open floating window does not bypass Guard',async()=>{
    await page.locator('#other').evaluate(el=>el.setAttribute('data-miorning-floating-editor',''));
    await page.locator('#other').focus();await page.keyboard.press('Enter');await page.locator('#mpg-modal-root').waitFor({state:'attached'});
    await page.keyboard.press('Escape');await page.locator('#other').evaluate(el=>el.removeAttribute('data-miorning-floating-editor'));
   });
   await test(label+' preexisting Guard confirmation is not stolen or auto-confirmed by Text Float',async()=>{
    await page.locator('#other').focus();await page.keyboard.press('Enter');await page.locator('#mpg-modal-root').waitFor({state:'attached'});
    await action('enabled',true);assert.equal((await action('open','#prompt')).open,false);assert.equal(await page.locator('#mpg-modal-root').count(),1);assert.equal(await page.evaluate(()=>generated),0);
    await page.keyboard.press('Escape');await page.locator('#mpg-modal-root').waitFor({state:'detached'});
   });
  }
  assert.equal(await page.evaluate(()=>window.generated),0);assert.deepEqual(errors,[]);
 }finally{await context?.close();runtime.removeTemporary(profile);}
}
(async()=>{
 assert.equal(manifest(guard).version,'1.8.0');assert.equal(manifest(original).version,'0.4.1');
 const pairs=process.argv.includes('--baseline-only')?[[original,false],[original,true]]:[[original,false],[original,true],[extension,false],[extension,true]];
 for(const pair of pairs)await suite(...pair);
 const sourceDrift=productFiles.filter(name=>sourceHashes[name]!==sha(path.join(extension,name)));assert.deepEqual(sourceDrift,[],'Product source changed during paired-extension checks');
 const report={suite:'v042-guard-mv3',status:'passed',passed:tests.length,tests,guardVersion:'1.8.0',baselineVersion:'0.4.1',textFloatVersion:manifest(extension).version,sourceHashes,sourceDrift,companionHashes:{guard:sha(path.join(guard,'content.js')),guardManifest:sha(path.join(guard,'manifest.json'))},scope:'Both separately installed production-manifest extensions in both load orders, disposable Chromium profiles and intercepted fixture URL. Guard v1.8.0 remains unmodified. No real accounts, generations or user storage accessed. Separate custom Guard license retained; source not bundled in Text Float.'};
 report.baselineOnly=process.argv.includes('--baseline-only');
 fs.writeFileSync(path.join(runtime.artifacts,report.baselineOnly?'v042-guard-baseline-report.json':'v042-guard-mv3-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:tests.length,status:'passed',baselineOnly:report.baselineOnly}));
})().catch(error=>{const report={suite:'v042-guard-mv3',status:'failed',tests,error:runtime.sanitize(error.stack||error.message)};fs.writeFileSync(path.join(runtime.artifacts,'v042-guard-mv3-report.json'),JSON.stringify(report,null,2)+'\n');console.error(report.error);process.exitCode=1;});


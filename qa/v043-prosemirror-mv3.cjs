/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
// Load the separately licensed, unchanged Guard from its own checkout. Nothing
// from that extension is bundled here. All website requests use local fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const esbuild=require('esbuild');
const runtime=require('./runtime.cjs');
const extension=path.resolve(__dirname,'../extension');
const guard=process.env.MIORNING_GUARD_EXTENSION||path.resolve(__dirname,'../../../MIORNING-GitHub-release/repo');
const hosts=['jimeng.jianying.com','xyq.jianying.com'];
const manifest=directory=>JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=directory=>['manifest.json',...new Set(manifest(directory).content_scripts.flatMap(entry=>entry.js||[])),manifest(directory).background.service_worker];
const fingerprints=directory=>Object.fromEntries(files(directory).map(name=>[name,sha(path.join(directory,name))]));
const productHashes=fingerprints(extension),guardHashes=fingerprints(guard);
const packages=['prosemirror-model','prosemirror-state','prosemirror-view','prosemirror-history','prosemirror-keymap','prosemirror-commands'];
const versions=Object.fromEntries(packages.map(name=>{let directory=path.dirname(require.resolve(name));while(!fs.existsSync(path.join(directory,'package.json')))directory=path.dirname(directory);return [name,JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')).version];}));
const report={suite:'v043-prosemirror-mv3',scope:'Both unchanged production-manifest extensions in both load orders, real pinned ProseMirror paragraph/text/reference model, and locally intercepted official-host URLs. No authenticated platform acceptance or real generation. Guard source and user storage remain untouched.',textFloatVersion:manifest(extension).version,guardVersion:manifest(guard).version,packages:versions,tests:[],pageErrors:[],productHashes,guardHashes};
const fixtureSource=`
import {Schema} from 'prosemirror-model';
import {EditorState,TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {history,undo,redo} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {chainCommands,newlineInCode,createParagraphNear,liftEmptyBlock,splitBlock} from 'prosemirror-commands';
const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{content:'inline*',group:'block',parseDOM:[{tag:'p'}],toDOM(){return ['p',0]}},text:{group:'inline'},reference:{inline:true,group:'inline',atom:true,attrs:{id:{}},parseDOM:[{tag:'span[data-reference-id]',getAttrs:node=>({id:node.getAttribute('data-reference-id')})}],toDOM(node){return ['span',{'data-reference-id':node.attrs.id,contenteditable:'false'},'@参考图']}}}});
window.generated=0;window.referenceClicks=0;window.nativeKeys=[];
const nativeBreak=chainCommands(newlineInCode,createParagraphNear,liftEmptyBlock,splitBlock);
const generate=()=>{window.generated++;return true};
const plugins=[history(),keymap({'Shift-Enter':nativeBreak,'Enter':generate,'Mod-Enter':generate,'Mod-z':undo,'Mod-y':redo})];
const doc=schema.nodes.doc.create(null,[schema.nodes.paragraph.create(null,[schema.text('甲乙'),schema.nodes.reference.create({id:'fixture-image-1'})])]);
const view=new EditorView(document.querySelector('.mount'),{state:EditorState.create({schema,doc,plugins}),dispatchTransaction(tr){view.updateState(view.state.apply(tr));},nodeViews:{reference(node){const dom=document.createElement('span');dom.contentEditable='false';dom.dataset.referenceId=node.attrs.id;dom.textContent='@参考图';dom.onclick=()=>referenceClicks++;return {dom};}}});
window.view=view;view.dom.id='editor';view.dom.setAttribute('aria-label','隔离测试提示词');window.originalReference=view.dom.querySelector('[data-reference-id]');
view.dom.addEventListener('keydown',event=>window.nativeKeys.push({key:event.key,shift:event.shiftKey,ctrl:event.ctrlKey,meta:event.metaKey,alt:event.altKey,bubbles:event.bubbles,trusted:event.isTrusted}));
document.querySelector('#generate').onclick=generate;
window.pick=(from,to=from)=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,to)));view.focus();};
window.read=()=>({model:view.state.doc.textBetween(0,view.state.doc.content.size,'\\n',node=>node.type.name==='reference'?'@参考图':''),json:view.state.doc.toJSON(),html:view.dom.innerHTML,generated:window.generated,referenceClicks:window.referenceClicks,referenceSame:view.dom.querySelector('[data-reference-id]')===window.originalReference,nativeKeys:window.nativeKeys,paragraphTops:[...view.dom.querySelectorAll('p')].map(node=>node.getBoundingClientRect().top)});
window.rebuild=()=>{document.querySelector('#outside').focus();const json=view.state.doc.toJSON();view.updateState(EditorState.create({schema,doc:schema.nodeFromJSON(json),plugins}));};
window.ready=true;
`;
const html='<!doctype html><html><head><meta charset="utf-8"><title>Local ProseMirror extension fixture</title><style>body{padding:40px;font-family:sans-serif}p{margin:0;min-height:30px}.ProseMirror{white-space:pre-wrap;font:20px/30px sans-serif;width:500px;min-height:180px;border:1px solid #888;padding:10px}[data-reference-id]{background:#eef6ff;color:#245382}#outside{position:fixed;left:20px;bottom:20px}</style></head><body><section id="fixture"><div class="mount"></div></section><button id="outside">离开输入框</button><button id="generate">生成视频</button><script src="/__qa_fixture.js"></script></body></html>';
let bundle,page;
async function test(name,fn){try{const evidence=await fn();report.tests.push({name,status:'passed',...(evidence?{evidence}:{})});console.log('PASS '+name);}catch(error){report.tests.push({name,status:'failed',error:runtime.sanitize(error.stack||error.message),evidence:await page?.evaluate(()=>window.read?.()).catch(()=>null)});throw error;}}
async function settle(){await page.waitForTimeout(180);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function pair(reverse){
 const order=reverse?[extension,guard]:[guard,extension],label=reverse?'Text Float first':'Guard first';
 const profile=runtime.temporaryDirectory('temporary-v043-pm-');let context;
 try{
  context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1200,height:850},...runtime.browserOptions(chromium,true),args:['--disable-extensions-except='+order.join(','),'--load-extension='+order.join(',')]});
  let gw,tw;
  for(let n=0;n<300&&(!gw||!tw);n++){
   for(const worker of context.serviceWorkers()){
    const value=await worker.evaluate(()=>chrome.runtime.getManifest()).catch(()=>null);
    if(value?.name==='MIORNING 喵咛')gw=worker;
    if(value?.name.includes('文本窗'))tw=worker;
   }
   if(!gw||!tw)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(gw&&tw,'Both actual production manifests must load');
  assert.equal(await gw.evaluate(()=>chrome.runtime.getManifest().version),'1.8.0');
  assert.equal(await tw.evaluate(()=>chrome.runtime.getManifest().version),manifest(extension).version);
  await gw.evaluate(origins=>chrome.storage.local.set({mpg_state_v1_7_0:{enabled:true,guardSites:origins,autoBackupEnabled:false,trashTalk:{systemEnabled:false}}}),hosts.map(host=>'https://'+host));
  await context.route(/^https?:\/\//,route=>{const url=new URL(route.request().url());if(hosts.includes(url.hostname)&&url.pathname==='/__qa_fixture.js')return route.fulfill({contentType:'text/javascript;charset=utf-8',body:bundle});if(hosts.includes(url.hostname)&&url.pathname==='/canvas/local-prosemirror-compatibility')return route.fulfill({contentType:'text/html;charset=utf-8',body:html});return route.fulfill({status:204,body:''});});
  for(const host of hosts){
   page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({host,label,error:error.message}));
   await page.goto('https://'+host+'/canvas/local-prosemirror-compatibility');await page.waitForFunction(()=>window.ready);
   await page.locator('.miorning-text-float-dock').waitFor({state:'attached'});await page.locator('#mpg-floating-dock').waitFor({state:'attached'});
   const tabs=await tw.evaluate(host=>chrome.tabs.query({url:'https://'+host+'/*'}),host),tabId=tabs[0].id;
   const state=()=>tw.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:async()=>{await MiorningTextFloat.whenIdle();return MiorningTextFloat.getState();}}))[0].result,tabId);
   const saved=key=>tw.evaluate(async key=>(await chrome.storage.local.get(key))[key],'miorning-text-float:v2:history:'+encodeURIComponent(key));
   let historyKey;
   await test(label+' / '+host+' UI click opens actual floating editor with bounded Guard exemption',async()=>{
    await page.locator('#editor').click({position:{x:15,y:15}});await page.locator('.miorning-text-float-shell').waitFor({state:'attached'});const result=await state();assert.equal(result.open,true);historyKey=result.historyKey;
    assert.equal(await page.locator('#editor').evaluate(node=>node.parentElement.id.startsWith('mpg-')),true);assert.equal(await page.locator('#mpg-modal-root').count(),0);return {historyKey,version:result.version};
   });
   await test(label+' / '+host+' physical Enter and Shift+Enter create model paragraphs and retain image reference',async()=>{
    await page.evaluate(()=>pick(2));await page.keyboard.press('Enter');await settle();let result=await page.evaluate(()=>read());assert.equal(result.model,'甲\n乙@参考图');assert.equal(result.generated,0);assert.equal(result.json.content[1].content[1].attrs.id,'fixture-image-1');
    // ProseMirror may recreate a NodeView when moving it to a new paragraph;
    // retain its model ID and native behavior, not a stale DOM object identity.
    await page.keyboard.press('Shift+Enter');await settle();result=await page.evaluate(()=>read());assert.equal(result.model,'甲\n\n乙@参考图');assert.equal(result.json.content.length,3);assert.equal(result.json.content[2].content[1].attrs.id,'fixture-image-1');assert.ok(result.paragraphTops[2]-result.paragraphTops[0]>=60,'Visible paragraph lines');assert.equal(result.generated,0);assert.equal(await page.locator('#mpg-modal-root').count(),0);
    assert.equal(result.nativeKeys.filter(event=>event.key==='Enter').length,2);assert.ok(result.nativeKeys.every(event=>event.key!=='Enter'||(event.shift&&!event.ctrl&&!event.meta&&!event.alt&&!event.bubbles&&!event.trusted)),'Only bounded native Shift+Enter relays reach the editor');return result;
   });
   await test(label+' / '+host+' modified Enter cannot invoke local generation command',async()=>{
    await page.keyboard.press('Control+Enter');await page.keyboard.press('Meta+Enter');await page.keyboard.press('Alt+Enter');await settle();const result=await page.evaluate(()=>read());assert.equal(result.model,'甲\n\n乙@参考图');assert.equal(result.generated,0);assert.equal(await page.locator('#mpg-modal-root').count(),0);return result;
   });
   await test(label+' / '+host+' native reference click remains attached and blur then Escape persists rich version',async()=>{
    await page.locator('#editor [data-reference-id]').click();assert.equal(await page.evaluate(()=>referenceClicks),1);
    await page.evaluate(()=>document.querySelector('#outside').focus());await page.keyboard.press('Escape');await page.locator('.miorning-text-float-shell').waitFor({state:'detached'});await state();
    const doc=await saved(historyKey),latest=doc.versions.at(-1);assert.equal(latest.status,'saved');assert.equal(latest.snapshot.kind,'rich');assert.equal((latest.snapshot.value.match(/<p>/g)||[]).length,3);assert.match(latest.snapshot.value,/data-reference-id="fixture-image-1"/);assert.equal(await page.evaluate(()=>generated),0);return {savedVersions:doc.versions.length,snapshot:latest.snapshot};
   });
   await test(label+' / '+host+' model re-render and UI reopen keep newline and history identity',async()=>{
    await page.evaluate(()=>rebuild());await settle();assert.equal((await page.evaluate(()=>read())).model,'甲\n\n乙@参考图');await page.locator('#editor').click({position:{x:15,y:15}});await page.locator('.miorning-text-float-shell').waitFor({state:'attached'});const current=await state();assert.equal(current.historyKey,historyKey);assert.equal(current.open,true);assert.ok(current.versions.length>=2);assert.equal((await page.evaluate(()=>read())).json.content[2].content[1].attrs.id,'fixture-image-1');
    await page.keyboard.press('Escape');await page.locator('.miorning-text-float-shell').waitFor({state:'detached'});await state();assert.equal(await page.locator('#editor').getAttribute('id'),'editor');assert.equal(await page.locator('#editor').evaluate(node=>node.parentElement.hasAttribute('id')),false);assert.equal(await page.evaluate(()=>generated),0);return await page.evaluate(()=>read());
   });
   await test(label+' / '+host+' original field after closing still invokes unchanged Guard and never generates',async()=>{
    await page.locator('#editor').focus();await page.keyboard.press('Enter');await page.locator('#mpg-modal-root').waitFor({state:'attached'});assert.equal(await page.evaluate(()=>generated),0);assert.equal(await page.locator('.miorning-text-float-shell').count(),0);await page.keyboard.press('Escape');await page.locator('#mpg-modal-root').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>generated),0);return {guardModalObserved:true,generated:0};
   });
   await page.close();page=null;
  }
 }finally{await context?.close();runtime.removeTemporary(profile);}
}
(async()=>{
 assert.equal(report.guardVersion,'1.8.0');assert.equal(report.textFloatVersion,manifest(extension).version);
 bundle=(await esbuild.build({stdin:{contents:fixtureSource,resolveDir:path.resolve(__dirname,'..'),sourcefile:'local-prosemirror-mv3.js'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
 await pair(false);await pair(true);
})().catch(error=>{report.fatal=runtime.sanitize(error.stack||error.message);process.exitCode=1;}).finally(()=>{
 report.productSourceDrift=JSON.stringify(productHashes)!==JSON.stringify(fingerprints(extension));report.guardSourceDrift=JSON.stringify(guardHashes)!==JSON.stringify(fingerprints(guard));report.passed=report.tests.filter(test=>test.status==='passed').length;report.failed=report.tests.filter(test=>test.status==='failed').length;report.status=report.fatal||report.failed||report.pageErrors.length||report.productSourceDrift||report.guardSourceDrift?'failed':'passed';if(report.status==='failed')process.exitCode=1;
 fs.writeFileSync(path.join(runtime.artifacts,'v043-prosemirror-mv3-report.json'),JSON.stringify(runtime.sanitize(report),null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,productSourceDrift:report.productSourceDrift,guardSourceDrift:report.guardSourceDrift,fatal:report.fatal}));
});

/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const esbuild=require('esbuild');
const runtime=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension');
const currentFile=path.join(extension,'editing.js'),currentSource=fs.readFileSync(currentFile,'utf8');
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
// Legacy comparisons require a real, separately supplied 0.4.3 package. A fresh
// source checkout still runs all mandatory current-version cases without it.
const baselineDirectory=process.env.MIORNING_TEXT_FLOAT_V043_BASELINE||path.join(root,'dist/MiorningTextFloat-v0.4.3');
const baselineFile=path.join(baselineDirectory,'extension/editing.js');
const baselineAvailable=fs.existsSync(baselineFile);
const baselineSource=baselineAvailable?fs.readFileSync(baselineFile,'utf8'):null;
const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
const report={suite:'v044-confirmed-hosts',version:manifest.version,scope:'Real pinned ProseMirror models on locally intercepted exact-host URLs; canvas and chat keymap variants. Not authenticated live-site acceptance.',baseline:{available:baselineAvailable,path:baselineAvailable?baselineDirectory:null,sha256:baselineSource?hash(baselineSource):null,note:baselineAvailable?'Real separately supplied version 0.4.3 source':'Legacy comparison skipped only; mandatory current-version matrix still runs. Set MIORNING_TEXT_FLOAT_V043_BASELINE to an unpacked 0.4.3 package folder.'},editingHash:hash(currentSource),tests:[],pageErrors:[]};
const fixtureSource=`
import {Schema} from 'prosemirror-model';
import {EditorState,TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {keymap} from 'prosemirror-keymap';
import {history,undo} from 'prosemirror-history';
import {chainCommands,newlineInCode,createParagraphNear,liftEmptyBlock,splitBlock} from 'prosemirror-commands';
window.makeFixture=(kind)=>{
 const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'inline*',parseDOM:[{tag:'p'}],toDOM(){return ['p',0]}},text:{group:'inline'},reference:{inline:true,group:'inline',atom:true,attrs:{id:{}},parseDOM:[{tag:'span[data-reference-id]',getAttrs:node=>({id:node.dataset.referenceId})}],toDOM(node){return ['span',{'data-reference-id':node.attrs.id,contenteditable:'false'},'@参考图']}}}});
 window.generated=0;window.referenceClicks=0;window.relayed=[];window.statuses=[];
 const nativeBreak=chainCommands(newlineInCode,createParagraphNear,liftEmptyBlock,splitBlock),generate=()=>{generated++;return true;};
 const plugins=[history(),keymap({'Enter':kind==='chat'?generate:nativeBreak,'Shift-Enter':nativeBreak,'Mod-Enter':generate,'Mod-z':undo})];
 const initial=schema.nodes.doc.create(null,[schema.nodes.paragraph.create(null,[schema.text('甲乙'),schema.nodes.reference.create({id:'image-preserved'})])]);
 const view=new EditorView(document.querySelector('.mount'),{state:EditorState.create({schema,doc:initial,plugins}),dispatchTransaction(transaction){view.updateState(view.state.apply(transaction));},nodeViews:{reference(node){const dom=document.createElement('span');dom.contentEditable='false';dom.dataset.referenceId=node.attrs.id;dom.textContent='@参考图';dom.onclick=()=>referenceClicks++;return {dom};}}});
 window.view=view;view.dom.id='editor';view.dom.setAttribute('aria-label',kind==='chat'?'Agent聊天输入':'画布提示词');
 const helper=MiorningTextFloatEditing.create({editor:view.dom,onStatus:message=>statuses.push(message)});window.helper=helper;
 window.addEventListener('keydown',event=>{if(event.key==='Enter'&&view.dom.contains(event.target))helper.insertLineBreak(event);},{capture:true});
 view.dom.addEventListener('keydown',event=>{if(event.key==='Enter')relayed.push({shift:event.shiftKey,ctrl:event.ctrlKey,meta:event.metaKey,alt:event.altKey,bubbles:event.bubbles,trusted:event.isTrusted});});
 window.pick=()=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,2)));view.focus();};
 window.rebuild=()=>{document.querySelector('#outside').focus();view.updateState(EditorState.create({schema,doc:schema.nodeFromJSON(view.state.doc.toJSON()),plugins}));};
 window.read=()=>{const chars={};for(const char of ['甲','乙']){const walker=document.createTreeWalker(view.dom,NodeFilter.SHOW_TEXT);for(let node;node=walker.nextNode();){const offset=node.data.indexOf(char);if(offset<0)continue;const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+1);const r=range.getBoundingClientRect();chars[char]={x:r.x,y:r.y};break;}}return {model:view.state.doc.textBetween(0,view.state.doc.content.size,'\\n',node=>node.type.name==='reference'?'@参考图':''),json:view.state.doc.toJSON(),chars,generated,relayed,statuses,referenceClicks,html:view.dom.innerHTML};};pick();
};`;
let browser,page,bundle;
async function settle(){await page.waitForTimeout(100);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function start(host,kind,source=currentSource){await page?.close();page=await browser.newPage({viewport:{width:1000,height:750}});page.on('pageerror',error=>report.pageErrors.push(error.message));await page.route('**/*',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>p{margin:0;min-height:30px}.ProseMirror{white-space:pre-wrap;font:20px/30px sans-serif;width:500px;min-height:200px;border:1px solid #888}</style><div class="mount"></div><button id="outside">离开输入框</button>'}));await page.goto('https://'+host+(kind==='chat'?'/home?tab=agent':'/canvas/isolated-test'));await page.addScriptTag({content:bundle});await page.addScriptTag({content:source});await page.evaluate(kind=>makeFixture(kind),kind);}
async function finish(){await settle();await page.evaluate(()=>rebuild());await settle();return page.evaluate(()=>read());}
async function test(name,task){try{const evidence=await task();report.tests.push({name,status:'passed',evidence});console.log('PASS '+name);}catch(error){report.tests.push({name,status:'failed',error:runtime.sanitize(error.stack),evidence:await page?.evaluate(()=>window.read?.()).catch(()=>null)});console.error('FAIL '+name+': '+error.message);}}
(async()=>{
 if(baselineAvailable){const baselineManifest=JSON.parse(fs.readFileSync(path.join(baselineDirectory,'extension/manifest.json'),'utf8'));assert.equal(baselineManifest.version,'0.4.3','Legacy source must actually be version 0.4.3');}
 bundle=(await esbuild.build({stdin:{contents:fixtureSource,resolveDir:root,sourcefile:'v044-hosts-fixture.js'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
 browser=await chromium.launch({headless:true,...runtime.browserOptions(chromium)});
 if(baselineAvailable)for(const host of ['www.xiaoyunque.com','xiaoyunque.com'])for(const kind of ['canvas','chat'])for(const key of ['Enter','Shift+Enter'])await test('0.4.3 baseline / '+host+' / '+kind+' / '+key+' reproduces persisted space',async()=>{await start(host,kind,baselineSource);await page.keyboard.press(key);const result=await finish();assert.equal(result.model,'甲 乙@参考图');assert.equal(result.chars['甲'].y,result.chars['乙'].y);assert.equal(result.generated,0);assert.equal(result.relayed.length,0);return result;});
 for(const host of ['www.xiaoyunque.com','xiaoyunque.com','xyq.jianying.com','jimeng.jianying.com'])for(const kind of ['canvas','chat'])for(const key of ['Enter','Shift+Enter'])await test('current / '+host+' / '+kind+' / '+key+' persists native paragraph without submission',async()=>{await start(host,kind);await page.keyboard.press(key);const result=await finish();assert.equal(result.model,'甲\n乙@参考图');assert.ok(result.chars['乙'].y-result.chars['甲'].y>=25);assert.equal(result.generated,0);assert.equal(result.json.content[1].content[1].attrs.id,'image-preserved');assert.equal(result.relayed.length,1);assert.deepEqual(result.relayed[0],{shift:true,ctrl:false,meta:false,alt:false,bubbles:false,trusted:false});await page.locator('[data-reference-id]').click();assert.equal(await page.evaluate(()=>referenceClicks),1);return result;});
 for(const host of ['www.xiaoyunque.com.evil.invalid','notxiaoyunque.com'])await test('unconfirmed lookalike '+host+' never receives the site-specific keyboard relay',async()=>{await start(host,'chat');await page.keyboard.press('Enter');const result=await finish();assert.equal(result.relayed.length,0);assert.equal(result.generated,0);assert.equal(result.model,'甲 乙@参考图');return result;});
})().catch(error=>{report.fatal=runtime.sanitize(error.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();report.passed=report.tests.filter(test=>test.status==='passed').length;report.failed=report.tests.filter(test=>test.status==='failed').length;report.sourceDrift=report.editingHash!==hash(fs.readFileSync(currentFile,'utf8'));report.baselineSourceDrift=baselineAvailable&&report.baseline.sha256!==hash(fs.readFileSync(baselineFile,'utf8'));report.status=report.failed||report.fatal||report.pageErrors.length||report.sourceDrift||report.baselineSourceDrift?'failed':'passed';if(report.status==='failed')process.exitCode=1;fs.writeFileSync(path.join(runtime.artifacts,'v044-hosts-report.json'),JSON.stringify(runtime.sanitize(report),null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,baselineAvailable:report.baseline.available,pageErrors:report.pageErrors,sourceDrift:report.sourceDrift,baselineSourceDrift:report.baselineSourceDrift,fatal:report.fatal}));});

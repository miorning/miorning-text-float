/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {artifacts,browserOptions,sanitize} = require('./runtime.cjs');
const {chromium} = require('playwright');

// Focused real-browser editing tests. Structured-model fixtures validate the
// beforeinput contract; they are not claimed to be signed-in platform tests.
async function run() {
  const browser = await chromium.launch({...browserOptions(chromium),headless:true});
  const page = await browser.newPage();
  const tests = [], errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  const test = async (name,fn) => {try {await fn();tests.push({name,status:'passed'});console.log('PASS '+name);} catch(error) {tests.push({name,status:'failed',error:error.message});console.error('FAIL '+name+' '+error.message);}};
  async function start({html='甲乙',textarea=false,model=false,legacy=false,upstream=false,plaintext=false}={}) {
    await page.goto('about:blank');
    await page.setContent('<!doctype html><meta charset="utf-8"><style>#editor{white-space:pre-wrap;font:20px/1.5 sans-serif;min-height:200px;width:500px}p{margin:0}</style>'+(textarea?'<textarea id="editor">'+html+'</textarea>':'<div id="editor" contenteditable="'+(plaintext?'plaintext-only':'true')+'">'+html+'</div>'));
    await page.addScriptTag({path:path.join(__dirname,'../extension/editing.js')});
    await page.evaluate(({model,legacy,upstream})=>{
      const editor = document.querySelector('#editor');
      window.changed=0;window.before=0;window.inputs=0;window.submits=0;window.model='甲乙';window.composing=false;window.lastRanges=[];
      editor.addEventListener('input',()=>inputs++);
      // Simulates a framework whose durable model accepts newline intent and
      // normalizes unrecognized native DOM changes back to its own state.
      if(model) {
        editor.addEventListener('beforeinput',event=>{
          if(event.inputType!=='insertLineBreak') return;
          before++;lastRanges=event.getTargetRanges().map(r=>[r.startOffset,r.endOffset]);event.preventDefault();
          const [range]=event.getTargetRanges();
          const next=window.model.slice(0,range.startOffset)+'\n'+window.model.slice(range.endOffset);
          queueMicrotask(()=>{window.model=next;editor.textContent=next;const r=document.createRange();r.setStart(editor.firstChild,range.startOffset+1);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});
        });
        editor.addEventListener('input',()=>{editor.textContent=window.model;});
      }
      if(upstream)document.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();},{capture:true});
      const editing = MiorningTextFloatEditing.create({editor,isComposing:()=>composing,onChange:()=>changed++});
      window.editing=editing;
      document.addEventListener('keydown',event=>{
        if(event.key!=='Enter'||!editor.contains(event.target))return;
        if(!legacy){editing.insertLineBreak(event);return;}
        event.stopImmediatePropagation();
        if(editor instanceof HTMLTextAreaElement)return;
        event.preventDefault();const value=editor.style.getPropertyValue('white-space'),priority=editor.style.getPropertyPriority('white-space');editor.style.setProperty('white-space','normal','important');
        try{document.execCommand('insertLineBreak');}finally{editor.style.setProperty('white-space',value,priority);}
      },{capture:true});
      editor.addEventListener('keydown',event=>{if(event.key==='Enter')submits++;});
      editor.focus();
      window.caret=(start,end=start,node=editor.firstChild)=>{if(editor instanceof HTMLTextAreaElement){editor.setSelectionRange(start,end);return;}const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);getSelection().removeAllRanges();getSelection().addRange(range);};
      caret(1);
    },{model,legacy,upstream});
  }
  const value=()=>page.locator('#editor').evaluate(el=>({html:el.innerHTML,text:el instanceof HTMLTextAreaElement?el.value:el.innerText,model:window.model,changed,inputs,before,submits,lastRanges}));
  try {
    await test('old implementation reproduces textarea Enter lost after earlier preventDefault',async()=>{await start({textarea:true,legacy:true,upstream:true});await page.keyboard.press('Enter');assert.equal((await value()).text,'甲乙');});
    await test('textarea Enter inserts one newline despite earlier preventDefault',async()=>{await start({textarea:true,upstream:true});await page.keyboard.press('Enter');assert.equal((await value()).text,'甲\n乙');assert.equal((await value()).submits,0);});
    await test('textarea Shift+Enter replaces selection and leaves caret on next line',async()=>{await start({textarea:true,html:'甲中间乙'});await page.evaluate(()=>caret(1,3));await page.keyboard.press('Shift+Enter');assert.equal((await value()).text,'甲\n乙');await page.keyboard.insertText('新');assert.equal((await value()).text,'甲\n新乙');});
    await test('textarea native undo reverses newline',async()=>{await start({textarea:true});await page.keyboard.press('Enter');await page.keyboard.press('Control+z');assert.equal((await value()).text,'甲乙');});
    await test('Ctrl and Meta Enter cannot generate or add accidental text',async()=>{await start({textarea:true});await page.keyboard.press('Control+Enter');await page.keyboard.press('Meta+Enter');const result=await value();assert.equal(result.text,'甲乙');assert.equal(result.submits,0);assert.equal(result.changed,0);});
    await test('old implementation reproduces rejected newline in transaction-backed fixture',async()=>{await start({model:true,legacy:true});await page.keyboard.press('Enter');assert.equal((await value()).text,'甲乙');assert.equal((await value()).before,0);});
    await test('beforeinput supplies real caret range and updates durable model without duplicate DOM insertion',async()=>{await start({model:true});await page.keyboard.press('Enter');const result=await value();assert.equal(result.text,'甲\n乙');assert.equal(result.model,'甲\n乙');assert.deepEqual(result.lastRanges,[[1,1]]);assert.equal(result.before,1);assert.equal(result.inputs,0);assert.equal(result.changed,1);});
    await test('structured model consecutive Shift+Enter retains empty line',async()=>{await start({model:true});await page.keyboard.press('Shift+Enter');await page.keyboard.press('Shift+Enter');assert.equal((await value()).model,'甲\n\n乙');});
    await test('plain rich editor Enter inserts structural break and remains newline after style restoration',async()=>{await start();await page.keyboard.press('Enter');await page.locator('#editor').evaluate(el=>el.style.setProperty('white-space','normal','important'));assert.equal((await value()).text,'甲\n乙');assert.match((await value()).html,/<br>/);});
    await test('rich empty trailing lines are exactly one line per Enter',async()=>{await start();await page.evaluate(()=>caret(2));await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.insertText('尾');assert.equal((await value()).text,'甲乙\n\n尾');});
    await test('rich selection replacement preserves surrounding text',async()=>{await start({html:'甲中间乙'});await page.evaluate(()=>caret(1,3));await page.keyboard.press('Shift+Enter');await page.keyboard.insertText('新');assert.equal((await value()).text,'甲\n新乙');});
    await test('nested whitespace overrides restored with structural break',async()=>{await start({html:'<span style="white-space:pre-wrap!important">甲乙</span>'});await page.evaluate(()=>caret(1,1,document.querySelector('#editor span').firstChild));await page.keyboard.press('Enter');const result=await value();assert.match(result.html,/<br>/);assert.equal(result.text,'甲\n乙');assert.equal(await page.locator('#editor span').evaluate(el=>el.style.getPropertyPriority('white-space')),'important');});
    await test('native mention token identity and click handler survive insertion',async()=>{await start({html:'<span>甲乙</span><span id="mention" contenteditable="false" data-mention-id="native">@参考图</span>'});await page.evaluate(()=>{window.mention=document.querySelector('#mention');window.mentionClicks=0;mention.onclick=()=>mentionClicks++;caret(1,1,document.querySelector('#editor span').firstChild);});await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.querySelector('#mention')===mention),true);await page.locator('#mention').click();assert.equal(await page.evaluate(()=>mentionClicks),1);});
    await test('rich native undo reverses only the insertion',async()=>{await start();await page.keyboard.press('Enter');await page.keyboard.press('Control+z');assert.equal((await value()).text,'甲乙');});
    await test('plaintext-only retains literal newline without rich markup',async()=>{await start({plaintext:true});await page.keyboard.press('Enter');assert.equal((await value()).text,'甲\n乙');assert.equal((await value()).html,'甲\n乙');});
    await test('IME candidate Enter is left untouched and does not notify a change',async()=>{await start({textarea:true});const result=await page.evaluate(()=>{composing=true;const editor=document.querySelector('#editor');const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:true});editor.dispatchEvent(event);return {prevented:event.defaultPrevented,text:editor.value,changed};});assert.deepEqual(result,{prevented:false,text:'甲乙',changed:0});});
    await test('destroyed helper performs no insert',async()=>{await start({textarea:true});const result=await page.evaluate(()=>{editing.destroy();const e=document.querySelector('#editor');const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});e.dispatchEvent(event);return {text:e.value,prevented:event.defaultPrevented};});assert.deepEqual(result,{text:'甲乙',prevented:false});});
    await test('textarea fallback delivers input to native controlled value setter',async()=>{await start({textarea:true});await page.evaluate(()=>{document.execCommand=()=>false;});await page.keyboard.press('Enter');const result=await value();assert.equal(result.text,'甲\n乙');assert.equal(result.inputs,1);});
    await test('maxlength is honored by fallback without losing text',async()=>{await start({textarea:true});await page.locator('#editor').evaluate(el=>el.maxLength=2);await page.keyboard.press('Enter');assert.equal((await value()).text,'甲乙');});
  } finally {
    const report={version:JSON.parse(fs.readFileSync(path.join(__dirname,'../extension/manifest.json'),'utf8')).version,scope:'Native Chromium editing and structured beforeinput contract fixtures; no authenticated platform acceptance claimed',tests,pageErrors:errors};
    fs.writeFileSync(path.join(artifacts,'v042-editing-report.json'),JSON.stringify(sanitize(report),null,2)+'\n');
    await browser.close();
    if(tests.some(test=>test.status!=='passed')||errors.length)process.exitCode=1;
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});

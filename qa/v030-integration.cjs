'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {artifacts,browserOptions,sanitize}=require('./runtime.cjs');
const extension=path.resolve(__dirname,'../extension');
const report={version:JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8')).version,mode:'Isolated Chromium; synthetic platform origins and local DOM fixtures only',tests:[],pageErrors:[]};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>文本窗集成测试</title><style>body{padding:60px;background:#dce4dd}textarea,[contenteditable]{display:block;width:360px;min-height:90px;margin:20px;padding:10px;border:1px solid #888}.mention-list,.suggestion-popup{background:white;border:1px solid #555;padding:12px}.mention-list button{width:260px;height:48px}img{width:28px;height:28px}</style><textarea id="prompt" aria-label="提示词"></textarea><div id="rich" contenteditable="true" aria-placeholder="图片提示词"></div><div role="menu" id="other-menu"><button>普通设置</button></div><script>window.generated=0;document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')window.generated++});</script></html>`;
let browser,context,page;
async function start(origin='https://app.pixmax.cn'){
  await context?.close();context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto(origin+'/canvas/test');
  for(const name of ['control.js','store.js','shell.js','references.js','menus.js','dock.js','content.js'])await page.addScriptTag({path:path.join(extension,name)});
}
async function idle(){await page.evaluate(async()=>{await MiorningTextFloat.whenIdle();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function open(selector='#prompt'){await page.evaluate(()=>MiorningTextFloat.whenIdle());await page.locator(selector).click();await page.waitForFunction(()=>MiorningTextFloat.getState().open);await idle();}
async function closed(){await page.waitForFunction(()=>!MiorningTextFloat.getState().open);await idle();}
async function test(name,fn){try{await fn();report.tests.push({name,status:'passed'});console.log('PASS '+name);}catch(e){report.tests.push({name,status:'failed',error:sanitize(e.stack)});console.log('FAIL '+name+': '+e.message);await page.screenshot({path:path.join(artifacts,'v030-integration-failure-'+report.tests.length+'.png')});}}
(async()=>{
  browser=await chromium.launch({...browserOptions(chromium),headless:true});
  await test('empty first edit is saved version 1; later edits fork version 2',async()=>{
    await start();await open();
    assert.equal((await page.evaluate(()=>MiorningTextFloat.getState())).versions.length,0);
    await page.keyboard.insertText('第一版');await idle();
    assert.equal((await page.evaluate(()=>MiorningTextFloat.getState())).versions[0].number,1);
    const key=await page.evaluate(()=>MiorningTextFloat.getState().historyKey);
    await page.keyboard.press('Escape');await closed();
    const first=await page.evaluate(key=>MiorningTextFloatStore.load(key,{kind:'text',value:''}),key);
    assert.equal(first.versions[0].status,'saved');assert.equal(first.versions[0].snapshot.value,'第一版');
    await open();await page.keyboard.press('End');await page.keyboard.insertText('新改');await page.keyboard.press('Escape');await closed();
    const next=await page.evaluate(key=>MiorningTextFloatStore.load(key,{kind:'text',value:''}),key);
    assert.deepEqual(next.versions.map(v=>v.number),[1,2]);assert.equal(next.versions[0].snapshot.value,'第一版');
  });
  await test('Enter and former Ctrl+Enter cannot trigger the platform generation shortcut',async()=>{
    await start();await open();await page.keyboard.insertText('第一行');await page.keyboard.press('Enter');await page.keyboard.insertText('第二行');await page.keyboard.press('Control+Enter');
    assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().open),true);assert.equal(await page.evaluate(()=>window.generated),0);
    assert.equal(await page.locator('#prompt').inputValue(),'第一行\n第二行');await page.keyboard.press('Escape');await closed();
  });
  await test('IME Escape is ignored; normal Escape confirms',async()=>{
    await start();await open();await page.evaluate(()=>{const e=document.querySelector('#prompt');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true}));});
    assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().open),true);
    await page.evaluate(()=>document.querySelector('#prompt').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
    await page.keyboard.press('Escape');await closed();
  });
  await test('removed name-retention control stays absent even with a legacy enabled preference',async()=>{
    await start();await page.evaluate(()=>MiorningTextFloatStore.saveSettings({fontSize:18,keepText:true}));await open();
    assert.equal(await page.getByRole('checkbox',{name:'保留原文字'}).count(),0);
    assert.equal('keepText' in await page.evaluate(()=>MiorningTextFloatStore.getSettings()),false);
  });
  await test('Alt+K saves current text, pauses opening, and resumes through the same shortcut',async()=>{
    await start();await open();await page.keyboard.insertText('全局暂停时保留这句话');
    const key=await page.evaluate(()=>MiorningTextFloat.getState().historyKey);
    await page.keyboard.press('Alt+k');await closed();
    assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().enabled),false);
    assert.equal(await page.locator('#prompt').inputValue(),'全局暂停时保留这句话');
    const history=await page.evaluate(key=>MiorningTextFloatStore.load(key,{kind:'text',value:''}),key);assert.equal(history.versions.at(-1).snapshot.value,'全局暂停时保留这句话');
    await page.locator('#prompt').click();await idle();assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().open),false);
    await page.keyboard.press('Alt+k');await page.waitForFunction(()=>MiorningTextFloat.getState().enabled);await open();
    assert.equal(await page.locator('#prompt').inputValue(),'全局暂停时保留这句话');
  });
  await test('global shortcut ignores ongoing IME composition',async()=>{
    await start();await open();
    await page.evaluate(()=>document.querySelector('#prompt').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));
    await page.keyboard.press('Alt+k');await idle();assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().enabled),true);
    await page.evaluate(()=>document.querySelector('#prompt').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
    await page.keyboard.press('Escape');await closed();
  });
  await test('role-free portal suggestion is above the floating editor and clickable',async()=>{
    await start();await open('#rich');await page.keyboard.insertText('@');
    await page.evaluate(()=>{const m=document.createElement('div');m.id='native';m.className='mention-list';m.style.cssText='position:absolute;left:120px;top:160px;z-index:1';m.innerHTML='<button><img alt="参考图" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">测试1</button>';m.querySelector('button').onmousedown=e=>e.preventDefault();m.querySelector('button').onclick=()=>{window.picked=true;m.remove();};document.body.append(m);});
    await page.waitForFunction(()=>document.querySelector('#native').matches(':popover-open'));await idle();
    const hit=await page.locator('#native button').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});assert.equal(hit,true);
    await page.locator('#native button').click();assert.equal(await page.evaluate(()=>window.picked),true);
    assert.equal(await page.locator('#other-menu').getAttribute('popover'),null);
  });
  await test('existing hidden menu exposed by style change is promoted; Escape saves once',async()=>{
    await start();await page.evaluate(()=>{const m=document.createElement('div');m.id='native';m.className='suggestion-popup';m.style.display='none';m.innerHTML='<button><img alt="参考图" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">测试1</button>';document.body.append(m);});await open('#rich');await page.keyboard.insertText('@');
    await page.evaluate(()=>document.querySelector('#native').style.display='block');await page.waitForFunction(()=>document.querySelector('#native').matches(':popover-open'));await page.keyboard.press('Escape');await closed();
    assert.equal(await page.locator('#native').getAttribute('popover'),null);assert.equal(await page.locator('#rich').innerText(),'@');
  });
  await test('unlabelled image popup is promoted only during an @ query; canvas cards stay untouched',async()=>{
    await start();await open('#rich');
    await page.evaluate(()=>{window.addImageBox=id=>{const m=document.createElement('div');m.id=id;m.style.cssText='position:fixed;left:180px;top:200px;width:280px;height:64px;background:white';m.innerHTML='<button><img alt="参考图" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">测试1</button>';document.body.append(m);return m;};addImageBox('ordinary');});await idle();
    assert.equal(await page.locator('#ordinary').getAttribute('popover'),null);
    await page.keyboard.insertText('@');
    await page.evaluate(()=>{const card=addImageBox('canvas-card');card.className='svelte-flow__node';const m=addImageBox('unknown-reference');m.querySelector('button').onclick=()=>window.unknownPicked=true;});
    await page.waitForFunction(()=>document.querySelector('#unknown-reference').matches(':popover-open'));
    assert.equal(await page.locator('#canvas-card').getAttribute('popover'),null);assert.equal(await page.locator('#ordinary').getAttribute('popover'),null);
    await page.locator('#unknown-reference button').click();assert.equal(await page.evaluate(()=>window.unknownPicked),true);
    await page.keyboard.press('Escape');await closed();
    assert.equal(await page.locator('#unknown-reference').getAttribute('data-miorning-native-reference-menu'),null);
    assert.equal(await page.locator('#unknown-reference').getAttribute('popover'),null);
  });
  await test('pre-existing unrelated image listbox is never moved by opening or typing @',async()=>{
    await start();await page.evaluate(()=>{const m=document.createElement('div');m.id='asset-library';m.setAttribute('role','listbox');m.style.cssText='position:absolute;left:20px;top:700px';m.innerHTML='<button><img alt="素材" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">素材库</button>';document.body.append(m);});
    const original=await page.locator('#asset-library').getAttribute('style');await open('#rich');await idle();
    assert.equal(await page.locator('#asset-library').getAttribute('popover'),null);await page.keyboard.insertText('@');
    await page.evaluate(()=>document.querySelector('#asset-library').classList.add('updated'));await idle();
    assert.equal(await page.locator('#asset-library').getAttribute('popover'),null);assert.equal(await page.locator('#asset-library').getAttribute('style'),original);
  });
  await test('LibTV rebuilt canvas title and save toolbar stay in place while native @ selection works',async()=>{
    await start('https://www.liblib.tv');
    await page.evaluate(()=>{
      const editor=document.querySelector('#rich'),holder=document.createElement('div');
      holder.id='libtv-prompt-holder';holder.className='relative';holder.style.cssText='position:relative;overflow:hidden';
      editor.before(holder);holder.append(editor);
      const toolbar=document.createElement('div');toolbar.id='canvas-toolbar';
      toolbar.style.cssText='position:fixed;left:0;top:0;width:100%;height:48px;background:#fff;border-bottom:1px solid #ccc;z-index:10';
      const content=document.createElement('div');content.id='canvas-toolbar-content';
      content.style.cssText='position:absolute;left:24px;top:4px;width:540px;height:40px;display:flex;align-items:center;gap:12px';
      content.innerHTML='<div style="width:220px;height:32px;display:flex;align-items:center">测试浮窗·不生产</div><div class="save-text" style="width:100px;height:32px;display:flex;align-items:center">已保存</div><button type="button">分享</button><button type="button">更多</button>';
      toolbar.append(content);document.body.prepend(toolbar);
      window.remountCanvasToolbar=message=>{
        const old=document.querySelector('#canvas-toolbar-content'),next=old.cloneNode(true);
        next.querySelector('.save-text').textContent=message;old.replaceWith(next);
      };
      window.nativePicked=0;
      editor.addEventListener('input',()=>{
        if(editor.textContent!=='@'||document.querySelector('#native-image-reference'))return;
        // Ordinary framework rerender: identical toolbar geometry, fresh DOM
        // identity, and no nav/status/live-region semantics to rely on.
        remountCanvasToolbar('正在保存…');
        const panel=document.createElement('div');panel.id='native-image-reference';
        panel.setAttribute('data-reference-main-panel','true');
        panel.style.cssText='position:absolute;left:10px;top:80px;width:288px;background:white;border:1px solid #333;padding:8px';
        for(const [id,name] of [['image-one','参考图一'],['image-two','参考图二']]){
          const row=document.createElement('button');row.type='button';row.dataset.nativeImage=id;
          row.style.cssText='display:flex;align-items:center;gap:8px;width:100%;height:44px';
          row.innerHTML='<img alt="" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E"><span></span>';
          row.querySelector('span').textContent=name;
          row.onmousedown=event=>event.preventDefault();
          row.onclick=()=>{
            window.nativePicked++;
            const token=document.createElement('span');token.contentEditable='false';token.dataset.referenceId=id;token.textContent='@'+name;
            editor.replaceChildren(token,document.createTextNode(' '));
            const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
            const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
            panel.remove();remountCanvasToolbar('已保存');
            editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:name}));
          };
          panel.append(row);
        }
        holder.append(panel);
      });
    });
    const toolbarSnapshot=()=>page.evaluate(()=>['canvas-toolbar','canvas-toolbar-content'].map(id=>{
      const el=document.getElementById(id),rect=el.getBoundingClientRect();
      return {id,style:el.getAttribute('style'),popover:el.getAttribute('popover'),marker:el.getAttribute('data-miorning-native-reference-menu'),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
    }));
    const original=await toolbarSnapshot();
    // A user may drag the floating editor near the canvas header. Keep the
    // toolbar within the generic menu discovery area so this guards detection,
    // rather than passing merely because the toolbar is far away.
    await page.evaluate(()=>MiorningTextFloatStore.saveSettings({top:70}));
    await open('#rich');assert.deepEqual(await toolbarSnapshot(),original,'Opening editor must leave canvas title and toolbar untouched');
    await page.evaluate(()=>{window.beforeReferencePopovers=[...document.querySelectorAll(':popover-open')];});
    await page.keyboard.insertText('@');
    await page.waitForFunction(()=>document.querySelector('#native-image-reference')?.matches(':popover-open'));await idle();
    assert.deepEqual(await toolbarSnapshot(),original,'Rebuilt canvas title and status toolbar must not become a floating strip');
    assert.equal(await page.locator('#canvas-toolbar-content').getAttribute('role'),null);
    assert.equal(await page.locator('#canvas-toolbar [popover],#canvas-toolbar [data-miorning-native-reference-menu]').count(),0);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll(':popover-open')].filter(el=>!beforeReferencePopovers.includes(el)&&el.id!=='native-image-reference').map(el=>el.id||el.className)),[],'Only the real native reference list may join the top layer');
    const item=page.locator('#native-image-reference [data-native-image="image-two"]');
    assert.equal(await item.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true);
    await item.click();await idle();
    assert.equal(await page.evaluate(()=>nativePicked),1);
    assert.equal(await page.locator('#rich [data-reference-id="image-two"]').count(),1);
    assert.deepEqual(await toolbarSnapshot(),original,'Post-selection status rerender must remain in its original canvas position');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll(':popover-open')].filter(el=>!beforeReferencePopovers.includes(el)).map(el=>el.id||el.className)),[],'Selecting a native item must leave no extra popup strip');
    await page.locator('#rich').focus();await page.keyboard.press('Escape');await closed();
    assert.deepEqual(await toolbarSnapshot(),original,'Closing editor must preserve original toolbar styles and position');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll(':popover-open')].filter(el=>!el.classList.contains('miorning-text-float-dock')).map(el=>el.id||el.className)),[]);
    assert.equal(await page.locator('#rich [data-reference-id="image-two"]').count(),1);
    assert.equal(await page.evaluate(()=>window.generated),0);
  });
  await test('already-open controlled native popover moves above the editor without replacing its element',async()=>{
    await start();await page.evaluate(()=>{const m=document.createElement('div');m.id='early-reference';m.setAttribute('role','listbox');m.setAttribute('popover','auto');m.style.cssText='background:white;padding:16px';m.innerHTML='<button><img alt="参考图" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">测试1</button>';m.querySelector('button').onclick=()=>window.earlyPicked=true;document.body.append(m);m.showPopover();document.querySelector('#rich').setAttribute('aria-controls',m.id);window.originalReference=m;});
    await page.evaluate(()=>MiorningTextFloat.open(document.querySelector('#rich')));await idle();
    const hit=await page.locator('#early-reference button').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});assert.equal(hit,true);
    await page.locator('#early-reference button').click();assert.equal(await page.evaluate(()=>window.earlyPicked&&document.querySelector('#early-reference')===window.originalReference),true);
    await page.keyboard.press('Escape');await closed();assert.equal(await page.locator('#early-reference').getAttribute('popover'),'auto');assert.equal(await page.locator('#early-reference').evaluate(el=>el.matches(':popover-open')),true);
  });
  await test('unlabelled popup inside the active Svelte canvas node is supported',async()=>{
    await start();await page.evaluate(()=>{const node=document.createElement('section');node.className='svelte-flow__node';node.dataset.id='test-node';document.querySelector('#rich').before(node);node.append(document.querySelector('#rich'));});await open('#rich');await page.keyboard.insertText('@');
    await page.evaluate(()=>{const m=document.createElement('div');m.id='embedded-reference';m.style.cssText='position:absolute;left:120px;top:150px;width:280px;height:64px;background:white';m.innerHTML='<button><img alt="参考图" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E">测试1</button>';document.querySelector('.svelte-flow__node').append(m);});
    await page.waitForFunction(()=>document.querySelector('#embedded-reference').matches(':popover-open'));assert.equal(await page.locator('.svelte-flow__node').getAttribute('popover'),null);
  });
  await test('theme colors and 64px font apply to the actual editor and persist',async()=>{
    await start();await open();await page.getByRole('button',{name:'夜间模式',exact:true}).click();await idle();
    const first=await page.locator('#prompt').evaluate(el=>({scheme:getComputedStyle(el).colorScheme,color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));assert.equal(first.scheme,'dark');assert.notEqual(first.color,first.background);
    const number=page.getByRole('spinbutton',{name:'字体大小',exact:true});await number.fill('64');await number.press('Enter');await idle();
    assert.equal(await page.locator('#prompt').evaluate(el=>getComputedStyle(el).fontSize),'64px');
    await page.locator('#prompt').focus();await page.keyboard.press('Escape');
    if(await page.evaluate(()=>MiorningTextFloat.getState().open))await page.keyboard.press('Escape');await closed();await open();
    assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().theme),'dark');assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().fontSize),64);
    await page.screenshot({path:path.join(artifacts,'v030-integrated-dark.png')});
  });
  await test('font slider Escape closes only transient controls, next Escape confirms',async()=>{
    await start();await open();await page.getByRole('spinbutton',{name:'字体大小',exact:true}).click();await page.getByRole('slider',{name:'滑动调整字号'}).focus();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>MiorningTextFloat.getState().open),true);assert.equal(await page.locator('.font-popover').isVisible(),false);await page.keyboard.press('Escape');await closed();
  });
  await test('clearing this site closes an active editor without resurrecting queued drafts or altering website text',async()=>{
    await start();await open();await page.keyboard.insertText('保留网页原文');
    await page.evaluate(async()=>{await MiorningTextFloatStore.clearCache([location.origin]);});await closed();
    assert.equal(await page.locator('#prompt').inputValue(),'保留网页原文');
    const usage=await page.evaluate(()=>MiorningTextFloatStore.cacheUsage());
    assert.equal(usage.sites.some(site=>site.origin==='https://app.pixmax.cn'),false);
  });
  for(const origin of ['https://www.liblib.tv','https://www.updream.ai','https://jimeng.jianying.com','https://app.pixmax.cn','https://console.pixmax.ai'])await test('generic editor and native rich text preserved on '+new URL(origin).hostname,async()=>{
    await start(origin);await open('#rich');await page.keyboard.insertText('第一行');await page.keyboard.press('Enter');await page.keyboard.insertText('第二行');await page.keyboard.press('Escape');await closed();assert.equal(await page.locator('#rich').innerText(),'第一行\n第二行');
  });
  assert.equal(report.pageErrors.length,0,JSON.stringify(report.pageErrors));
})().catch(e=>{report.fatal=sanitize(e.stack);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();report.passed=report.tests.filter(t=>t.status==='passed').length;report.failed=report.tests.filter(t=>t.status==='failed').length;fs.writeFileSync(path.join(artifacts,'v030-integration-report.json'),JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;console.log(JSON.stringify({passed:report.passed,failed:report.failed,fatal:report.fatal,pageErrors:report.pageErrors}));});

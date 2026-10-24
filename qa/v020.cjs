'use strict';
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function v020(h) {
  const { page, context, base, qa, extension, assert, reset, open, close, state, settle, inject, drag, test } = h;
  async function records() {
    await settle();
    return page.evaluate(async () => new Promise((resolve,reject) => {
      const request=indexedDB.open('miorning-text-float-v2',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{ const db=request.result,tx=db.transaction('records','readonly'),store=tx.objectStore('records'),items=[];
        const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){items.push({key:c.key,value:c.value});c.continue();}};
        tx.oncomplete=()=>{db.close();resolve(items);};tx.onerror=()=>reject(tx.error);
      };
    }));
  }
  const histories = async () => (await records()).filter(r => r.key.includes(':history:'));
  const onlyHistory = async () => {const all=await histories();assert.equal(all.length,1);return all[0].value;};
  const tab = id => page.locator('.version-tab[data-version-id="'+id+'"]');
  async function choose(version) {await tab(version.id).click();await settle();}
  async function replace(text) {await page.keyboard.press('Control+A');await page.keyboard.insertText(text);await settle();}
  async function reload() {await page.reload();await inject();}

  await test('v0.2 first open immediately preserves original as version 1', async () => {
    await reset();const original=await page.locator('#fixture-textarea').inputValue();await open();
    const doc=await onlyHistory();assert.equal(doc.versions.length,1);assert.equal(doc.versions[0].number,1);
    assert.equal(doc.versions[0].status,'saved');assert.equal(doc.versions[0].snapshot.value,original);
    assert.ok((await tab(doc.versions[0].id).innerText()).includes('1'));
    await close();await open();assert.equal((await onlyHistory()).versions.length,1,'Opening and confirming unchanged text must not create duplicates');
  });
  await test('v0.2 confirmed version 2 persists across reload and preserves version 1', async () => {
    await reset();await open();const original=(await onlyHistory()).versions[0];await replace('版本二，确认保存。');
    const draft=await onlyHistory();assert.equal(draft.versions.length,2);assert.equal(draft.versions[1].status,'draft');
    await close();await reload();await open();const doc=await onlyHistory();
    assert.equal(doc.versions.length,2);assert.deepEqual(doc.versions[0],original);
    assert.equal(doc.versions[1].number,2);assert.equal(doc.versions[1].status,'saved');
    assert.equal(doc.versions[1].snapshot.value,'版本二，确认保存。');assert.equal(await page.locator('#fixture-textarea').inputValue(),'版本二，确认保存。');
  });
  await test('v0.2 typing and deleting from old version fork without modifying saved versions', async () => {
    await reset();await open();await replace('第二版');await close();await open();
    const prior=await onlyHistory();await choose(prior.versions[0]);assert.equal((await onlyHistory()).versions.length,2,'Browsing versions creates no version');
    await page.keyboard.press('Control+End');await page.keyboard.insertText('从第一版分叉');await settle();
    let doc=await onlyHistory();assert.equal(doc.versions[2].number,3);assert.equal(doc.versions[2].parentId,prior.versions[0].id);
    await close();await open();doc=await onlyHistory();assert.deepEqual(doc.versions.slice(0,2),prior.versions);
    await choose(doc.versions[1]);await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');await settle();
    doc=await onlyHistory();assert.equal(doc.versions[3].number,4);assert.equal(doc.versions[3].snapshot.value,'');
    assert.deepEqual(doc.versions.slice(0,2),prior.versions);await page.screenshot({path:path.join(qa,'v020-history.png')});await close();
  });
  await test('v0.2 delete version keeps remaining numbers and allocates next number', async () => {
    await reset();await open();await replace('版本二');await close();await open();let doc=await onlyHistory();
    await choose(doc.versions[0]);await page.getByRole('button',{name:'删除当前版本',exact:true}).click();await settle();
    doc=await onlyHistory();assert.deepEqual(doc.versions.map(v=>v.number),[2]);assert.equal(doc.nextNumber,3);
    await page.locator('#fixture-textarea').focus();await replace('版本三');await close();await open();doc=await onlyHistory();
    assert.deepEqual(doc.versions.map(v=>v.number),[2,3]);assert.equal(doc.versions[1].snapshot.value,'版本三');
  });
  await test('v0.2 more than 1000 versions retained and range selects first/middle/last', async () => {
    await reset();await open();await close();const all=await histories();
    await page.evaluate(async record => new Promise((resolve,reject)=>{
      const now=Date.now(),value={versions:Array.from({length:1005},(_,i)=>({id:'qa-version-'+(i+1),number:i+1,parentId:null,status:'saved',snapshot:{kind:'text',value:'长历史内容 '+(i+1)},createdAt:now,updatedAt:now})),nextNumber:1006};
      const request=indexedDB.open('miorning-text-float-v2',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,record.key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
    }),all[0]);
    await page.locator('#fixture-textarea').evaluate(el=>{el.value='长历史内容 1005';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));});
    await reload();await open();assert.equal((await onlyHistory()).versions.length,1005);
    const slider=page.getByRole('slider',{name:'拖动选择文本版本'});
    const bounds=await slider.evaluate(el=>({min:Number(el.min),max:Number(el.max)}));assert.ok(bounds.max-bounds.min>=1004);
    for(const position of [0,502,1004]) {
      await slider.evaluate((el,pos)=>{el.value=String(Number(el.min)+pos);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},position);await settle();
      assert.equal(await page.locator('#fixture-textarea').inputValue(),'长历史内容 '+(position+1));
    }
    const scroll=await page.locator('.version-tab').last().evaluate(el=>({visible:el.getBoundingClientRect().left>=el.parentElement.getBoundingClientRect().left,number:el.textContent}));
    assert.ok(scroll.visible,'Last selected version scrolls into view');
    await page.screenshot({path:path.join(qa,'v020-many-versions.png')});
    await page.locator('#fixture-textarea').focus();await replace('第一千零六版');await close();
    const saved=await onlyHistory();assert.equal(saved.versions.length,1006);assert.equal(saved.versions.at(-1).number,1006);
  });
  await test('v0.2 histories isolate separate fields and project routes', async () => {
    await reset();await open();await replace('字段一的版本二');await close();await open('#fixture-transformed');
    await replace('字段二的版本二');await close();let all=await histories();assert.equal(all.length,2);
    assert.ok(all.some(r=>r.value.versions.at(-1).snapshot.value==='字段一的版本二'));assert.ok(all.some(r=>r.value.versions.at(-1).snapshot.value==='字段二的版本二'));
    await page.goto(base+'/fixture.html?projectId=isolated-project-two');await inject();await open();
    all=await histories();assert.equal(all.length,3);assert.equal(all.filter(r=>r.value.versions.length===1).length,1);
  });
  await test('v0.2 window dimensions font and keep-text option persist across refresh', async () => {
    await reset();await open();await drag(page.locator('.handle.se'),105,65);
    await page.getByRole('spinbutton',{name:'字体大小'}).fill('24');await page.getByRole('spinbutton',{name:'字体大小'}).press('Enter');
    await page.getByRole('checkbox',{name:'保留原文字'}).check();await settle();const before=await state();await close();await reload();await open();const after=await state();
    assert.equal(after.rect.width,before.rect.width);assert.equal(after.rect.height,before.rect.height);assert.equal(after.fontSize,24);
    assert.equal(await page.getByRole('checkbox',{name:'保留原文字'}).isChecked(),true);
    await page.screenshot({path:path.join(qa,'v020-wide.png')});
  });
  await test('v0.2 immediate input plus Ctrl+Enter commits latest text without draft race', async () => {
    await reset();await open();
    await page.locator('#fixture-textarea').evaluate(el=>{el.value='最后一个字也保存：终';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'终'}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));});
    await h.waitClosed();const doc=await onlyHistory();assert.equal(doc.versions.length,2);assert.equal(doc.versions[1].snapshot.value,'最后一个字也保存：终');assert.equal(doc.versions[1].status,'saved');
  });
  await test('v0.2 failed persistence keeps edited text and window open until retry succeeds', async () => {
    await reset();await open();await page.evaluate(()=>{globalThis.qaOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('QA simulated disk full','QuotaExceededError');};});
    await page.getByRole('spinbutton',{name:'字体大小'}).fill('22');await page.getByRole('spinbutton',{name:'字体大小'}).press('Enter');
    await replace('不可丢失的修改');await page.keyboard.press('Control+Enter');await settle();assert.equal((await state()).open,true);assert.equal(await page.locator('#fixture-textarea').inputValue(),'不可丢失的修改');
    assert.match(await page.locator('.status').innerText(),/失败|未保存|重试|空间|full/i);
    await page.evaluate(()=>{IDBObjectStore.prototype.put=qaOriginalPut;delete globalThis.qaOriginalPut;});await close();
    assert.equal((await onlyHistory()).versions.at(-1).snapshot.value,'不可丢失的修改');
    assert.equal((await records()).find(record=>record.key.endsWith(':settings')).value.fontSize,22);
  });
  await test('v0.2 rich reference snapshots preserve identity but remove executable attributes', async () => {
    await reset();await page.locator('#fixture-rich').evaluate(el=>{
      el.innerHTML='旧文本 <span contenteditable="false" class="reference" data-mention-node-id="window-light" data-mention-media-type="image" data-reference-id="window-light" onmouseover="window.qaUnsafe=true"><img src="javascript:window.qaUnsafe=true" onerror="window.qaUnsafe=true"><span data-mention-label="true">@参考图</span></span><script>window.qaUnsafe=true</script><iframe hidden src="javascript:window.qaUnsafe=true"></iframe>';
    });await open('#fixture-rich');let doc=await onlyHistory();const first=doc.versions[0];
    assert.ok(first.snapshot.value.includes('data-mention-node-id="window-light"'));assert.ok(!/onmouseover|onerror|javascript:|<script|<iframe/i.test(first.snapshot.value));
    await replace('富文本第二版');await close();await reload();await open('#fixture-rich');doc=await onlyHistory();await choose(doc.versions[0]);
    const token=page.locator('#fixture-rich [data-mention-node-id="window-light"]');assert.equal(await token.count(),1);assert.equal(await token.getAttribute('contenteditable'),'false');
    assert.equal(await page.locator('#fixture-rich script,#fixture-rich iframe,#fixture-rich [onmouseover],#fixture-rich [onerror]').count(),0);
    await close();assert.equal((await onlyHistory()).versions.length,2,'Restoring a saved version alone must not fork');
  });
  await test('v0.2 branding link icon warm-red confirmation and narrow accessibility', async () => {
    await reset({width:390,height:700,reducedMotion:'reduce'});await open();
    const link=page.getByRole('link',{name:/喵咛文本窗/});assert.equal(await link.getAttribute('href'),'https://space.bilibili.com/353186187');
    const image=page.locator('.miorning-text-float-shell img').first();await image.waitFor();assert.ok(await image.evaluate(el=>el.complete&&el.naturalWidth>0));
    const button=page.locator('.confirm');const colour=await button.evaluate(el=>getComputedStyle(el).backgroundColor);const [r,g,b]=colour.match(/\d+/g).map(Number);assert.ok(r>g*1.2&&r>b*1.2,colour);
    for(const locator of [link,button,page.getByRole('checkbox',{name:'保留原文字'}),page.getByRole('slider',{name:'拖动选择文本版本'})]) {const box=await locator.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390,JSON.stringify(box));}
    assert.ok((await state()).rect.editor.height>=80);await page.screenshot({path:path.join(qa,'v020-narrow.png')});
    const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));assert.equal(manifest.version,'0.2.0');
    for(const size of [16,32,48,128]) assert.ok(fs.existsSync(path.join(extension,manifest.icons[size])),'Manifest icon '+size+' exists');
  });
  await test('v0.2 name suggestion remains gray and Tab preserves original when selected', async () => {
    await reset();await open('#fixture-rich');await page.getByRole('checkbox',{name:'保留原文字'}).check();await replace('参考图 1 · 窗边光线');
    assert.equal(await page.locator('.miorning-reference-suggestion').evaluate(el=>el.matches(':popover-open')),true);
    await page.screenshot({path:path.join(qa,'v020-name.png')});await page.keyboard.press('Tab');await settle();
    assert.equal(await page.locator('#fixture-rich [data-mention-node-id="window-light"]').count(),1);
    assert.ok((await page.locator('#fixture-rich').innerText()).startsWith('参考图 1 · 窗边光线'));
    await close();const doc=await onlyHistory();assert.equal(doc.versions.at(-1).status,'saved');assert.ok(doc.versions.at(-1).snapshot.value.includes('data-mention-node-id'));
  });
  await test('v0.2 Enter and Tab cannot mutate rich text while confirmation is saving', async () => {
    await reset();await page.evaluate(async()=>{
      await MiorningTextFloat.destroy();const store=MiorningTextFloatStore;
      globalThis.qaBlockSave=true;
      globalThis.MiorningTextFloatStore=Object.freeze({...store,updateDraft:async(...args)=>{if(qaBlockSave)await new Promise(resolve=>{globalThis.qaReleaseSave=resolve;});return store.updateDraft(...args);}});
    });await page.addScriptTag({path:path.join(extension,'content.js')});await open('#fixture-rich');
    await page.keyboard.press('Control+A');await page.keyboard.insertText('参考图 1 · 窗边光线');
    await page.waitForFunction(()=>document.querySelector('.miorning-reference-suggestion')?.matches(':popover-open'));
    await page.keyboard.press('Control+Enter');await page.waitForFunction(()=>MiorningTextFloat.getState().busy && typeof qaReleaseSave==='function');
    const before=await page.locator('#fixture-rich').innerHTML();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
    assert.equal(await page.locator('#fixture-rich').innerHTML(),before);assert.equal(await page.locator('#fixture-rich [data-mention-node-id]').count(),0);
    await page.evaluate(()=>{globalThis.qaBlockSave=false;qaReleaseSave();});await h.waitClosed();
    const doc=await onlyHistory();assert.equal(doc.versions.at(-1).status,'saved');assert.equal(doc.versions.at(-1).snapshot.value,'参考图 1 · 窗边光线');
  });
  await test('v0.2 anonymous equal-label fields retain distinct histories after DOM reordering', async () => {
    await reset();await page.evaluate(()=>{const wrap=document.createElement('section');wrap.id='qa-anonymous-fields';for(const name of ['A','B']){const el=document.createElement('textarea');el.dataset.qaName=name;el.setAttribute('aria-label','匿名文本');el.value='匿名原文'+name;wrap.append(el);}document.body.prepend(wrap);});
    await open('[data-qa-name="B"]');await replace('B独立第二版');await close();
    await page.evaluate(()=>{const a=document.querySelector('[data-qa-name="A"]'),b=document.querySelector('[data-qa-name="B"]');a.before(b);});
    await open('[data-qa-name="A"]');assert.equal(await page.locator('[data-qa-name="A"]').inputValue(),'匿名原文A');
    const aKey=(await state()).historyKey;await close();await open('[data-qa-name="B"]');const bKey=(await state()).historyKey;assert.notEqual(aKey,bKey);
    const all=await histories();assert.equal(all.length,2);const a=all.find(r=>r.key.endsWith(encodeURIComponent(aKey))).value,b=all.find(r=>r.key.endsWith(encodeURIComponent(bKey))).value;
    assert.deepEqual(a.versions.map(v=>v.snapshot.value),['匿名原文A']);assert.deepEqual(b.versions.map(v=>v.snapshot.value),['匿名原文B','B独立第二版']);await close();
  });
  await test('v0.2 Escape draft reopened and confirmed becomes saved without altering earlier draft', async () => {
    await reset();await open();await replace('退出保留的草稿');await page.keyboard.press('Escape');await h.waitClosed();
    const original=await onlyHistory();assert.equal(original.versions.at(-1).status,'draft');const draft=original.versions.at(-1);
    await open();await close();const doc=await onlyHistory();assert.deepEqual(doc.versions.find(v=>v.id===draft.id),draft);
    const saved=doc.versions.find(v=>v.status==='saved'&&v.snapshot.value==='退出保留的草稿');assert.ok(saved);assert.notEqual(saved.id,draft.id);
  });
};

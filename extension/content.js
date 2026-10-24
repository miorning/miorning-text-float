/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloat) return;
  const lifetime = new AbortController();
  let enabled = true, active = null, opening = false, openTask = Promise.resolve();
  const store = globalThis.MiorningTextFloatStore;
  const pending = new Set();
  const anonymousFields = new WeakMap();
  const track = promise => { pending.add(promise); promise.finally(()=>pending.delete(promise)).catch(()=>{}); return promise; };
  const isLibTV = /(^|\.)liblib\.tv$/.test(location.hostname);
  const menuSelector = '[role="listbox"],[role="menu"],.fixture-mentions,[data-reference-main-panel="true"]';
  const selector = isLibTV
    ? 'textarea,[contenteditable="true"][aria-placeholder]'
    : 'textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';
  const listen = (el, name, fn, options = {}) => el.addEventListener(name, fn, {...options, signal: lifetime.signal});
  const set = (el, styles) => Object.entries(styles).forEach(([key, value]) => el.style.setProperty(key, value, 'important'));
  const remember = el => ({el, style: el.getAttribute('style'), popover: el.getAttribute('popover')});
  const equal = (a,b) => a?.kind === b?.kind && a?.value === b?.value;
  // Only document markup needed by the native editor is retained. In particular,
  // a grey name suggestion is UI, not a saved image reference.
  function safeHTML(value) {
    const template = document.createElement('template'); template.innerHTML = value;
    const allowed = new Set(['DIV','P','BR','SPAN','IMG','B','STRONG','I','EM','U','S','UL','OL','LI','BLOCKQUOTE']);
    const discard = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','LINK','META','INPUT','BUTTON','TEXTAREA','SELECT']);
    const clean = node => {
      for (const el of [...node.children]) {
        if (discard.has(el.tagName) || el.hasAttribute('data-mention-suggest')) {el.remove();continue;}
        clean(el);
        if (!allowed.has(el.tagName)) {el.replaceWith(...el.childNodes);continue;}
        const token = el.matches('[data-mention-node-id],[data-reference-id]');
        for (const attr of [...el.attributes]) {
          const name = attr.name;
          const data = /^(data-mention-(node-id|media-type|type|index|label)|data-reference-id|data-draggable-mention)$/.test(name);
          const common = ['title','dir'].includes(name) || (name === 'class' && (token || el.closest('[data-mention-node-id],[data-reference-id]')));
          const editable = name === 'contenteditable' && token && attr.value === 'false';
          const image = el.tagName === 'IMG' && ['src','alt','width','height'].includes(name);
          if (!(data || common || editable || image)) el.removeAttribute(name);
        }
        if (el.tagName === 'IMG') {
          const source = el.getAttribute('src') || '';
          if (!/^(https?:\/\/|data:image\/(png|jpeg|webp|gif|svg\+xml);)/i.test(source)) el.removeAttribute('src');
        }
      }
    };
    clean(template.content); return template.innerHTML;
  }
  const snapshot = editor => editor instanceof HTMLTextAreaElement
    ? {kind:'text',value:editor.value} : {kind:'rich',value:safeHTML(editor.innerHTML)};
  function fieldKey(editor) {
    const url = new URL(location.href);
    const project = url.searchParams.get('projectId') || url.searchParams.get('project') || '';
    const space = url.searchParams.get('spaceId') || '';
    const node = editor.closest('[data-nodeid],.react-flow__node[data-id],[data-node-id]');
    const nodeId = node?.getAttribute('data-nodeid') || node?.getAttribute('data-id') || node?.getAttribute('data-node-id') || '';
    const ancestor = editor.parentElement?.closest('[id]');
    const scope = node || ancestor || document.body;
    const role = [editor.tagName,editor.id,editor.getAttribute('name'),editor.getAttribute('aria-label'),editor.getAttribute('aria-placeholder'),editor.getAttribute('placeholder')].map(x=>x||'').join('|');
    const peers = [...scope.querySelectorAll(selector)].filter(el=>[el.tagName,el.id,el.getAttribute('name'),el.getAttribute('aria-label'),el.getAttribute('aria-placeholder'),el.getAttribute('placeholder')].map(x=>x||'').join('|')===role);
    // DOM order is not an identity: anonymous or duplicate fields keep a stable
    // page-session key rather than accidentally inheriting a neighbour's history.
    const stable = peers.length === 1 && (nodeId || editor.id || editor.getAttribute('name') || ancestor?.id || editor.getAttribute('aria-label') || editor.getAttribute('aria-placeholder') || editor.getAttribute('placeholder'));
    if (!stable && !anonymousFields.has(editor)) anonymousFields.set(editor,crypto.randomUUID());
    const credential = /token|secret|password|authorization|credential|oauth|session|signature|^(code|key|api.?key)$/i;
    const strip = query => {const values=new URLSearchParams(query);for(const key of [...values.keys()])if(credential.test(key))values.delete(key);return values.toString();};
    const query=strip(url.search);
    const fragment=url.hash.slice(1), split=fragment.indexOf('?');
    const hash=split>=0 ? `${fragment.slice(0,split)}?${strip(fragment.slice(split+1))}` : fragment.includes('=') ? strip(fragment) : fragment;
    const route = project ? `${url.pathname}?projectId=${project}&spaceId=${space}` : `${url.pathname}${query?'?'+query:''}${hash?'#'+hash:''}`;
    return JSON.stringify([url.origin,route,nodeId,stable ? (ancestor?.id || '') : anonymousFields.get(editor),role]);
  }
  function renderHistory(a) {
    if (!a.shell || a.dead) return;
    a.shell.setVersions({versions:a.doc?.versions || [],selectedId:a.selectedId,
      draftNumber:a.selectedId === '__new__' ? a.doc?.nextNumber : null,dirty:a.dirty,busy:a.busy});
  }
  function reportError(a,error) {
    a.error = error;
    if (!a.dead) a.shell?.setStatus(`未保存，请重试：${error?.message || '本机存储不可用'}`);
  }
  function queue(a,job) {
    const task = a.queue.catch(()=>{}).then(job);
    a.queue = task;
    track(task).catch(error=>reportError(a,error));
    return task;
  }
  function flushDraft(a,commit = false) {
    clearTimeout(a.saveTimer); a.saveTimer = 0;
    const value = snapshot(a.editor);
    return queue(a,async()=>{
      if (!a.doc) {
        a.doc=await store.load(a.key,a.initial);
        a.baseId=a.doc.versions.find(v=>equal(v.snapshot,a.initial))?.id || null;
      }
      const current = a.doc.versions.find(v=>v.id===a.draftId);
      // A draft from an earlier window/session remains immutable. Confirming it
      // creates a new saved version instead of silently leaving everything draft.
      if (commit && !current && a.doc.versions.find(v=>v.id===a.baseId)?.status==='draft') a.dirty=true;
      if (a.dirty || (commit && current)) {
        if (!current) {
          const before = new Set(a.doc.versions.map(v=>v.id));
          a.doc = await store.createDraft(a.key,{snapshot:value,parentId:a.baseId,ownerToken:a.ownerToken});
          a.draftId = a.doc.versions.find(v=>!before.has(v.id) && v.ownerToken===a.ownerToken)?.id;
          if (!a.draftId) throw new Error('未能确认新版本，请重试');
        }
        a.doc = await store.updateDraft(a.key,{id:a.draftId,ownerToken:a.ownerToken,snapshot:value,commit});
        a.selectedId = a.draftId;
        if (equal(value,snapshot(a.editor))) a.dirty = false;
        if (commit) {a.baseId=a.draftId;a.draftId=null;}
        a.error = null;
        renderHistory(a);
        if (!a.dirty) a.shell?.setStatus(commit ? '版本已保存' : '草稿已保存 · 确认后完成此版');
      }
      return a.doc;
    });
  }
  function changed(a) {
    if (a.restoring || a.dead) return;
    if (!a.draftId && a.selectedId !== '__new__') {a.baseId=a.selectedId;a.selectedId='__new__';}
    a.dirty = true;
    renderHistory(a);
    clearTimeout(a.saveTimer);
    if (!a.composing) a.saveTimer=setTimeout(()=>{flushDraft(a).catch(()=>{});},180);
  }
  function writeSnapshot(a,value) {
    a.restoring = true;
    try {
      a.editor.focus({preventScroll:true});
      if (a.editor instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
        setter.call(a.editor,value.value); a.editor.setSelectionRange(value.value.length,value.value.length);
        a.editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:null}));
      } else {
        const range=document.createRange();range.selectNodeContents(a.editor);
        const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
        const html=safeHTML(value.value);
        const ok=document.execCommand('insertHTML',false,html || '<br>');
        if (!ok) {a.editor.innerHTML=html;a.editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:null}));}
      }
      a.selection=saveSelection(a.editor);a.references?.refresh();
    } finally {a.restoring=false;}
  }
  async function selectVersion(a,id) {
    if (active!==a || a.busy || a.composing || id===a.selectedId) return;
    a.busy=true;renderHistory(a);
    try {
      await flushDraft(a);
      const version=a.doc.versions.find(v=>v.id===id);if (!version) return;
      a.selectedId=id;a.baseId=id;a.draftId=null;a.dirty=false;
      writeSnapshot(a,version.snapshot);
      a.shell.setStatus(`查看版本 ${version.number} · 修改将新建版本`);
    } catch(error) {reportError(a,error);}
    finally {a.busy=false;renderHistory(a);}
  }
  async function deleteVersion(a,id) {
    if (active!==a || a.busy || a.composing || !id || id==='__new__') return;
    a.busy=true;renderHistory(a);
    try {
      await flushDraft(a);
      const index=a.doc.versions.findIndex(v=>v.id===id);
      a.doc=await store.remove(a.key,id);
      if (a.selectedId===id) {
        const next=a.doc.versions[Math.min(index,a.doc.versions.length-1)];
        a.selectedId=next?.id || '__new__';a.baseId=next?.id || null;a.draftId=null;a.dirty=false;
        if (next) writeSnapshot(a,next.snapshot);
      }
      a.shell.setStatus('已删除此版本 · 其他版本保留');
    } catch(error) {reportError(a,error);}
    finally {a.busy=false;renderHistory(a);}
  }
  function persistSettings(a,settings) {
    a.settings=settings;
    const task = a.settingsTask.catch(()=>{}).then(()=>store.saveSettings(settings));
    a.settingsTask=task;track(task).catch(error=>reportError(a,error));
  }
  async function whenIdle() {
    await openTask;
    if (active?.saveTimer) await flushDraft(active).catch(()=>{});
    while(pending.size) await Promise.allSettled([...pending]);
  }
  function restore(record) {
    if (record.el.matches(':popover-open')) record.el.hidePopover();
    for (const name of ['style', 'popover']) {
      const value = record[name];
      if (value == null) record.el.removeAttribute(name); else record.el.setAttribute(name, value);
    }
  }
  function saveSelection(el) {
    if (el instanceof HTMLTextAreaElement) return {start: el.selectionStart, end: el.selectionEnd};
    const s = getSelection();
    return s.rangeCount && el.contains(s.anchorNode) && el.contains(s.focusNode) ? s.getRangeAt(0).cloneRange() : null;
  }
  function focusEditor() {
    const a = active; if (!a || !a.editor.isConnected) return;
    a.editor.focus({preventScroll: true});
    if (!a.selection) return;
    try {
      if (a.editor instanceof HTMLTextAreaElement) a.editor.setSelectionRange(a.selection.start, a.selection.end);
      else { const s = getSelection(); s.removeAllRanges(); s.addRange(a.selection); }
    } catch (_) { /* Site may have rebuilt the selection after inserting a native mention. */ }
  }
  function dispose(a) {
    if (a.dead) return;
    a.dead=true;
    if (active===a) active = null;
    clearTimeout(a.saveTimer);
    a.references?.destroy();
    a.observer.disconnect(); a.watch.disconnect();
    cancelAnimationFrame(a.menuFrame);
    a.menus.forEach(restore);
    restore(a.original);
    if (a.holderRecord) restore(a.holderRecord);
    a.editor.removeAttribute('data-miorning-floating-editor');
    a.shell.destroy();
    // Blurring the actual editor commits the platform's normal pending input.
    a.editor.blur();
    if (a.editor.isConnected) a.editor.focus({preventScroll: true});
  }
  async function close(commit = true) {
    const a=active;if (!a) return true;
    if (a.composing || a.busy) return false;
    a.busy=true;renderHistory(a);
    try {
      await flushDraft(a,commit);
      await a.settingsTask.catch(()=>{});
      if (a.settings) {a.settingsTask=queue(a,()=>store.saveSettings(a.settings));await a.settingsTask;}
      dispose(a);return true;
    } catch(error) {reportError(a,error);return false;}
    finally {a.busy=false;renderHistory(a);}
  }
  function arrange(rect) {
    const a = active; if (!a) return;
    const r = rect.editor;
    set(a.holder, {position:'fixed', inset:'auto', left:`${r.left}px`, top:`${r.top}px`, width:`${r.width}px`, height:`${r.height}px`, margin:'0', padding:'0', border:'0', 'max-width':'none', 'max-height':'none', 'min-width':'0', 'min-height':'0', overflow:'visible', background:'#faf8f2', transform:'none', zoom:'1', 'box-sizing':'border-box', 'z-index':'2147483647'});
    set(a.editor, {position: a.holder === a.editor ? 'fixed' : 'relative', width:`${r.width}px`, height:`${r.height}px`, 'min-height':'0', 'max-height':'none', 'min-width':'0', 'max-width':'none', margin:'0', padding:'4px 8px', border:'0', 'border-radius':'0', background:'#faf8f2', color:'#28332f', 'caret-color':'#116d53', '--canvas-controls-text':'#28332f', '--canvas-controls-border':'#bbc9bf', 'font-size':`${a.shell.fontSize}px`, 'line-height':'1.8', 'font-family':'"Segoe UI", "Microsoft YaHei", sans-serif', overflow:'auto', 'overflow-wrap':'anywhere', 'white-space':'pre-wrap', resize:'none', outline:'none', 'box-sizing':'border-box', 'text-align':'start', 'color-scheme':'light', transform:'none'});
    placeMenus();
    a.references?.refresh();
  }
  function placeMenus() {
    const a = active; if (!a) return;
    for (const [el] of a.menus) {
      if (!el.isConnected) continue;
      const r = a.shell.rect.editor;
      const selection = getSelection();
      let anchor = {left:r.left, bottom:r.top + 34};
      if (selection.rangeCount && a.editor.contains(selection.anchorNode)) {
        const b = selection.getRangeAt(0).getBoundingClientRect(); if (b.height) anchor = b;
      }
      const width = Math.min(320, innerWidth - 24);
      const height = Math.min(400, innerHeight - 24);
      const top = anchor.bottom + height + 8 > innerHeight ? Math.max(8, anchor.bottom - height - 30) : anchor.bottom + 6;
      set(el, {position:'fixed', inset:'auto', left:`${Math.max(8,Math.min(anchor.left,innerWidth-width-8))}px`,top:`${top}px`,width:`${width}px`, 'max-height':`${height}px`,margin:'0',overflow:'auto',transform:'none', 'z-index':'2147483647'});
    }
  }
  function scanMenus() {
    const a = active; if (!a) return;
    for (const [el, record] of a.menus) {
      if (!el.isConnected || el.hidden || getComputedStyle(el).display === 'none') {
        restore(record);
        a.menus.delete(el);
      }
    }
    // Only native suggestion lists near the active field. Never synthesize mention tokens.
    const scope = a.editor.parentElement?.parentElement;
    const candidates = new Set(scope?.querySelectorAll(menuSelector) || []);
    for (const node of a.added) {
      if (!(node instanceof Element)) continue;
      for (const el of [node,...node.querySelectorAll(menuSelector)]) {
        if (el.matches(menuSelector)) candidates.add(el);
      }
    }
    a.added.clear();
    for (const el of candidates) {
      if (el === a.editor || el.contains(a.editor) || el.closest('.miorning-text-float-shell') || a.holder.contains(el)) continue;
      if (!el.getClientRects().length || getComputedStyle(el).display === 'none' || el.hidden || a.menus.has(el)) continue;
      a.menus.set(el, remember(el));
      el.setAttribute('popover','manual');
      el.showPopover();
    }
    placeMenus();
  }
  function open(editor) {
    if (opening) return openTask;
    openTask=openNow(editor);return openTask;
  }
  async function openNow(editor) {
    if (!enabled || active?.editor === editor || !editor.isConnected || editor.disabled || editor.readOnly) return;
    if (active?.composing) return;
    if (typeof editor.showPopover !== 'function' || editor.hasAttribute('popover')) return;
    opening = true;
    if (active && !await close()) {opening=false;return;}
    const selection = saveSelection(editor);
    // LibTV's prompt editor has a dedicated relative parent. Its native @ menu
    // remains in that parent, preserving event ancestry and reference identity.
    const parent = editor.parentElement;
    const holder = isLibTV && editor.hasAttribute('aria-placeholder') && parent?.classList.contains('relative') && parent.querySelectorAll('[contenteditable=true]').length === 1 ? parent : editor;
    const a = {editor, holder, original:remember(editor), holderRecord:holder === editor ? null : remember(holder), selection, composing:false, menus:new Map(), added:new Set(), menuFrame:0, url:location.href,
      key:fieldKey(editor),ownerToken:crypto.randomUUID(),queue:Promise.resolve(),settingsTask:Promise.resolve(),doc:null,selectedId:'__new__',draftId:null,baseId:null,dirty:false,busy:false,dead:false};
    const initial=snapshot(editor);a.initial=initial;
    let settings={};
    try {
      const results=await Promise.allSettled([store.getSettings(),store.load(a.key,initial)]);
      if (results[0].status==='fulfilled') settings=results[0].value;
      else a.error=results[0].reason;
      if (results[1].status==='rejected') throw results[1].reason;
      a.doc=results[1].value;
      let matching=[...a.doc.versions].reverse().find(v=>equal(v.snapshot,initial));
      if (!matching && a.doc.versions.length) {
        a.doc=await store.createDraft(a.key,{snapshot:initial,parentId:null,ownerToken:a.ownerToken});
        matching=a.doc.versions.find(v=>v.ownerToken===a.ownerToken);
        a.doc=await store.updateDraft(a.key,{id:matching.id,ownerToken:a.ownerToken,snapshot:initial,commit:true});
      }
      a.baseId=matching?.id || null;
    } catch(error) {a.error=error;}
    if (!editor.isConnected || location.href!==a.url) {opening=false;return;}
    active = a;
    a.shell = globalThis.MiorningTextFloatShell.create({settings,
      logoUrl:globalThis.chrome?.runtime?.getURL ? undefined : document.querySelector('meta[name="miorning-logo"]')?.content,
      onRect:arrange,onFont:()=>arrange(a.shell.rect),onClose:()=>{track(close()).catch(()=>{});},onFocus:focusEditor,onKeepText:()=>a.references?.refresh(),
      onSettings:value=>persistSettings(a,value),onSelectVersion:id=>track(selectVersion(a,id)),onDeleteVersion:id=>track(deleteVersion(a,id)),
      onSettingsPage:()=>{
        if (globalThis.chrome?.runtime?.id) {
          track(chrome.runtime.sendMessage({type:'MIORNING_TEXT_FLOAT_OPEN_OPTIONS'}).then(result=>{if (!result?.ok) throw new Error(result?.error || '设置页未能打开');})).catch(error=>reportError(a,error));
        } else a.shell.setStatus('网站设置在安装插件后可用：扩展图标右键 → 选项');
      }
    });
    renderHistory(a);
    if (a.error) reportError(a,a.error);
    editor.setAttribute('data-miorning-floating-editor','');
    holder.setAttribute('popover','manual');
    arrange(a.shell.rect);
    holder.showPopover();
    a.observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') a.added.add(record.target);
        for (const node of record.addedNodes) a.added.add(node);
      }
      if (!a.menuFrame) a.menuFrame = requestAnimationFrame(()=>{a.menuFrame=0;scanMenus();});
    });
    a.observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','aria-hidden','aria-expanded']});
    a.watch = new MutationObserver(()=>{
      if (!editor.isConnected || location.href !== a.url) {a.composing=false;flushDraft(a).catch(()=>{});dispose(a);}
    });
    a.watch.observe(document.body,{childList:true,subtree:true});
    a.references = globalThis.MiorningTextFloatReferences?.create({editor,getKeepText:()=>a.shell.keepText,isComposing:()=>a.composing || a.busy,onStatus:text=>a.shell.setStatus(text)});
    editor.focus({preventScroll:true}); focusEditor();
    if (!equal(initial,snapshot(editor))) changed(a);
    opening = false;
  }
  listen(document,'click',event=>{
    if (event.composedPath().some(el=>el?.classList?.contains('miorning-text-float-shell'))) return;
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && target.getClientRects().length) open(target);
  });
  listen(document,'selectionchange',()=>{
    if (!active) return;
    const selection = saveSelection(active.editor); if(selection) active.selection=selection;
    placeMenus();
  });
  listen(document,'compositionstart',event=>{if(active?.editor.contains(event.target)) active.composing=true;}, {capture:true});
  listen(document,'compositionend',event=>{if(active?.editor.contains(event.target)) {active.composing=false;changed(active);}}, {capture:true});
  listen(document,'beforeinput',event=>{if(active?.busy && active.editor.contains(event.target) && !active.restoring) {event.preventDefault();event.stopImmediatePropagation();}}, {capture:true});
  listen(document,'keydown',event=>{
    const a = active;
    if (!a || !a.editor.contains(event.target)) return;
    if (a.busy) {event.preventDefault();event.stopImmediatePropagation();return;}
    if (a.references?.handleKey(event)) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();event.stopImmediatePropagation();
      if (!event.isComposing && !a.composing && event.keyCode !== 229) track(close()).catch(()=>{});
      return;
    }
    if (event.key === 'Enter' && !event.isComposing && !a.composing && event.keyCode !== 229) {
      event.stopImmediatePropagation();
      // Chromium's default contenteditable paragraph insertion can turn two Enters
      // into three line breaks under pre-wrap. A native editing command inserts one
      // line break and keeps the browser's input/undo pipeline and mention nodes.
      if (!(a.editor instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        document.execCommand('insertLineBreak');
      }
    }
    if (event.key === 'Escape' && !event.isComposing && !a.composing) {
      // Let the native mention list dismiss first; Escape otherwise keeps the draft.
      const menuOpen = [...a.menus.keys(),...a.holder.querySelectorAll(menuSelector)]
        .some(el=>el.isConnected && !el.hidden && el.getClientRects().length && getComputedStyle(el).display!=='none');
      if (!menuOpen) {event.preventDefault();event.stopImmediatePropagation();track(close(false)).catch(()=>{});}
    }
  },{capture:true});
  listen(document,'input',event=>{
    if(active?.editor.contains(event.target)) {
      active.shell.setStatus('正在编辑原文本 · @ 使用原图片引用');
      changed(active);
      scanMenus();
    }
  });
  for(const event of ['popstate','hashchange','pagehide']) listen(window,event,()=>{const a=active;if(a){a.composing=false;flushDraft(a).catch(()=>{});dispose(a);}});
  globalThis.MiorningTextFloat = Object.freeze({
    version:'0.2.0', open, close, whenIdle,
    async toggle(){enabled=!enabled;if(!enabled){if(active)active.composing=false;if(!await close())enabled=true;}return enabled;},
    async destroy(){if(active)active.composing=false;if(!await close())return false;lifetime.abort();delete globalThis.MiorningTextFloat;return true;},
    getState(){return {enabled,open:!!active,version:'0.2.0',fontSize:active?.shell.fontSize,rect:active?.shell.rect,busy:active?.busy || opening,
      historyKey:active?.key,selectedId:active?.selectedId,draftId:active?.draftId,versions:active?.doc?.versions.map(({snapshot,ownerToken,...version})=>version)};}
  });
})();

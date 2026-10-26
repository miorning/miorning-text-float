/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloat) return;
  const lifetime = new AbortController();
  const control = globalThis.MiorningTextFloatControl;
  let enabled = !control, active = null, opening = false, openingContext = null, openTask = Promise.resolve();
  const store = globalThis.MiorningTextFloatStore;
  const pending = new Set();
  const anonymousFields = new WeakMap();
  let dock=null, controlState=null, controlRevision=0, pauseTimer=0, destroyed=false, destroying=false, preferredTheme='light';
  let controlsReady=Promise.resolve(), unsubscribeControl=()=>{};
  const track = promise => { pending.add(promise); promise.finally(()=>pending.delete(promise)).catch(()=>{}); return promise; };
  const isLibTV = /(^|\.)liblib\.tv$/.test(location.hostname);
  const selector = isLibTV
    ? 'textarea,[contenteditable="true"][aria-placeholder]'
    : 'textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';
  const listen = (el, name, fn, options = {}) => el.addEventListener(name, fn, {...options, signal: lifetime.signal});
  const set = (el, styles) => Object.entries(styles).forEach(([key, value]) => el.style.setProperty(key, value, 'important'));
  const remember = el => ({el, style: el.getAttribute('style'), popover: el.getAttribute('popover')});
  const equal = (a,b) => a?.kind === b?.kind && a?.value === b?.value;
  function openSettings(section='') {
    if (control) return track(control.openOptions(section)).catch(error=>{
      active?.shell.setStatus(error.message || '设置页未能打开');throw error;
    });
    active?.shell.setStatus('安装插件后可打开设置页');
    return Promise.resolve();
  }
  async function pauseActive() {
    clearTimeout(pauseTimer);
    if (enabled || destroyed || !active) return;
    const a=active;
    // Finish an ongoing IME/native reference operation before restoring the
    // site's actual field. The global state already blocks every new opening.
    if (a.composing || a.busy || a.references?.busy) {
      pauseTimer=setTimeout(pauseActive,120);return;
    }
    const saved=await close();
    if (!saved && !enabled && active===a) dispose(a);
  }
  function applyControlState(value) {
    if (destroyed) return;
    if (controlState && value.revision < controlState.revision) return;
    controlState=value;enabled=value.enabled!==false;
    dock?.update({...value,theme:preferredTheme});
    if (enabled) clearTimeout(pauseTimer);else track(pauseActive());
  }
  async function initializeControls() {
    if (!control) return;
    unsubscribeControl=control.subscribe(value=>{controlRevision++;applyControlState(value);});
    const revision=controlRevision;
    const [stateResult,settingsResult]=await Promise.allSettled([control.getState(),store.getSettings()]);
    if (destroyed) return;
    if (settingsResult.status==='fulfilled') preferredTheme=settingsResult.value.theme || 'light';
    if (stateResult.status==='fulfilled' && revision===controlRevision) applyControlState(stateResult.value);
    if (!controlState) controlState={enabled:false,shortcut:{code:'KeyK',alt:true,ctrl:false,shift:false,meta:false},dock:{edge:'right',ratio:.5}};
    dock=globalThis.MiorningTextFloatDock?.create({
      state:{...controlState,theme:preferredTheme},
      logoUrl:globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL('icons/128.png') : (document.querySelector('meta[name="miorning-dock-logo"]') || document.querySelector('meta[name="miorning-logo"]'))?.content,
      onToggle:async value=>{const next=await control.setEnabled(value);applyControlState(next);return next;},
      onShortcut:()=>openSettings('shortcut'),onCache:()=>openSettings('cache'),onSettings:()=>openSettings(),
      onPosition:position=>control.saveDock(position)
    });
  }
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
        const tokenSelector = '[data-mention-node-id],[data-reference-id],[data-type="mention"],[data-mention-id],[data-slate-void="true"],[contenteditable="false"]';
        const token = el.matches(tokenSelector);
        for (const attr of [...el.attributes]) {
          const name = attr.name;
          const data = /^(data-mention-(node-id|media-type|type|index|label|id)|data-reference-id|data-draggable-mention|data-(id|type|label|name|node-id|node-uuid|element-id|slate-void))$/.test(name);
          const common = ['title','dir'].includes(name) || (name === 'class' && (token || el.closest(tokenSelector)));
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
    const node = editor.closest('[data-nodeid],.react-flow__node[data-id],.svelte-flow__node[data-id],.vue-flow__node[data-id],[data-node-id]');
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
    const task = a.queue.catch(()=>{}).then(()=>a.cleared ? a.doc : job());
    a.queue = task;
    track(task).catch(error=>reportError(a,error));
    return task;
  }
  function flushDraft(a,commit = false) {
    clearTimeout(a.saveTimer); a.saveTimer = 0;
    const value = snapshot(a.editor);
    return queue(a,async()=>{
      if (!a.doc) {
        if (a.epoch == null) a.epoch=await store.getEpoch(a.key);
        if (a.cleared) return null;
        a.doc=await store.load(a.key,a.initial,a.epoch);
        a.epoch=a.doc.epoch;
        a.baseId=a.doc.versions.find(v=>equal(v.snapshot,a.initial))?.id || null;
      }
      const current = a.doc.versions.find(v=>v.id===a.draftId);
      // A draft from an earlier window/session remains immutable. Confirming it
      // creates a new saved version instead of silently leaving everything draft.
      if (commit && !current && a.doc.versions.find(v=>v.id===a.baseId)?.status==='draft') a.dirty=true;
      if (a.dirty || (commit && current)) {
        if (!current) {
          const before = new Set(a.doc.versions.map(v=>v.id));
          a.doc = await store.createDraft(a.key,{snapshot:value,parentId:a.baseId,ownerToken:a.ownerToken,epoch:a.doc.epoch});
          a.draftId = a.doc.versions.find(v=>!before.has(v.id) && v.ownerToken===a.ownerToken)?.id;
          if (!a.draftId) throw new Error('未能确认新版本，请重试');
        }
        a.doc = await store.updateDraft(a.key,{id:a.draftId,ownerToken:a.ownerToken,snapshot:value,commit,epoch:a.doc.epoch});
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
    if (active!==a || a.busy || a.references?.busy || a.composing || id===a.selectedId) return;
    a.busy=true;renderHistory(a);
    try {
      await flushDraft(a);
      if (a.cleared || a.dead || active!==a) return;
      const version=a.doc.versions.find(v=>v.id===id);if (!version) return;
      a.selectedId=id;a.baseId=id;a.draftId=null;a.dirty=false;
      writeSnapshot(a,version.snapshot);
      a.shell.setStatus(`查看版本 ${version.number} · 修改将新建版本`);
    } catch(error) {reportError(a,error);}
    finally {a.busy=false;renderHistory(a);}
  }
  async function deleteVersion(a,id) {
    if (active!==a || a.busy || a.references?.busy || a.composing || !id || id==='__new__') return;
    a.busy=true;renderHistory(a);
    try {
      await flushDraft(a);
      if (a.cleared || a.dead || active!==a) return;
      const index=a.doc.versions.findIndex(v=>v.id===id);
      a.doc=await store.remove(a.key,id,a.doc.epoch);
      if (a.cleared || a.dead || active!==a) return;
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
    await controlsReady;
    await openTask;
    while (active?.references?.busy) await new Promise(resolve=>setTimeout(resolve,20));
    while (active?.closeRequested && !active.composing) await new Promise(resolve=>setTimeout(resolve,20));
    if (active?.saveTimer && !active.composing) await flushDraft(active).catch(()=>{});
    while(pending.size) await Promise.allSettled([...pending]);
  }
  function restore(record) {
    if (record.el.matches(':popover-open')) record.el.hidePopover();
    for (const name of ['style','popover']) {
      if (record[name] == null) record.el.removeAttribute(name);
      else record.el.setAttribute(name,record[name]);
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
    clearTimeout(a.saveTimer);clearTimeout(a.closeTimer);
    a.editing?.destroy();a.compat?.release();
    a.references?.destroy();
    a.menuManager?.destroy(); a.watch?.disconnect();
    restore(a.original);
    if (a.holderRecord) restore(a.holderRecord);
    a.editor.removeAttribute('data-miorning-floating-editor');
    a.editor.removeAttribute('data-miorning-theme');
    a.shell.destroy();
    // Blurring the actual editor commits the platform's normal pending input.
    a.editor.blur();
    if (a.editor.isConnected && !a.outsideClose) a.editor.focus({preventScroll: true});
  }
  // A user's confirmation is retained while IME, a reference insertion, or a
  // version transaction finishes. Storage failures require an explicit retry.
  function requestClose(a=active,{outside=false}={}) {
    if (!a || a.dead || active!==a) return;
    a.closeRequested=true;a.outsideClose=outside || a.outsideClose;
    clearTimeout(a.closeTimer);
    const attempt=()=>{
      if (a.dead || active!==a || !a.closeRequested) return;
      if (a.composing || a.busy || a.references?.busy) {
        a.closeTimer=setTimeout(attempt,60);return;
      }
      a.closeRequested=false;
      track(close()).catch(error=>reportError(a,error));
    };
    // Allow the final input event following compositionend to reach the model.
    a.closeTimer=setTimeout(attempt,0);
  }
  async function close(commit = true) {
    const a=active;if (!a) return true;
    if (a.composing || a.busy) return false;
    if (a.references?.busy) {a.shell.setStatus('图片引用正在插入，请稍后确认');return false;}
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
    const dark = a.shell.theme === 'dark';
    const paper = dark ? '#17201d' : '#faf8f2', ink = dark ? '#e8eee9' : '#28332f';
    set(a.holder, {position:'fixed', inset:'auto', left:`${r.left}px`, top:`${r.top}px`, width:`${r.width}px`, height:`${r.height}px`, margin:'0', padding:'0', border:'0', 'max-width':'none', 'max-height':'none', 'min-width':'0', 'min-height':'0', overflow:'visible', background:'#faf8f2', transform:'none', zoom:'1', 'box-sizing':'border-box', 'z-index':'2147483647'});
    set(a.editor, {position: a.holder === a.editor ? 'fixed' : 'relative', width:`${r.width}px`, height:`${r.height}px`, 'min-height':'0', 'max-height':'none', 'min-width':'0', 'max-width':'none', margin:'0', padding:'4px 8px', border:'0', 'border-radius':'0', background:'#faf8f2', color:'#28332f', 'caret-color':'#116d53', '--canvas-controls-text':'#28332f', '--canvas-controls-border':'#bbc9bf', 'font-size':`${a.shell.fontSize}px`, 'line-height':'1.8', 'font-family':'"Segoe UI", "Microsoft YaHei", sans-serif', overflow:'auto', 'overflow-wrap':'anywhere', 'white-space':'pre-wrap', resize:'none', outline:'none', 'box-sizing':'border-box', 'text-align':'start', 'color-scheme':'light', transform:'none'});
    set(a.holder,{background:paper});
    set(a.editor,{background:paper,color:ink,'caret-color':dark?'#a4d0b9':'#116d53','--canvas-controls-text':ink,'--canvas-controls-border':dark?'#58695f':'#bbc9bf','color-scheme':dark?'dark':'light','overscroll-behavior':'contain'});
    a.editor.setAttribute('data-miorning-theme',dark?'dark':'light');
    a.menuManager?.place();
    a.references?.refresh();
  }
  function open(editor) {
    if (opening) return openTask;
    openTask=openTask.catch(()=>{}).then(()=>controlsReady).then(()=>openNow(editor));return openTask;
  }
  async function openNow(editor) {
    if (destroyed || destroying || !enabled || active?.editor === editor || !editor.isConnected || editor.disabled || editor.readOnly) return;
    // An already-open Prompt Guard confirmation remains the user's decision.
    // Never replay Enter or automatically confirm another extension's dialog.
    if (globalThis.MiorningTextFloatCompat?.hasGuardDialog?.()) return;
    if (active?.composing) return;
    if (typeof editor.showPopover !== 'function' || editor.hasAttribute('popover')) return;
    opening = true;
    if (active && !await close()) {opening=false;return;}
    dock?.closeMenu();
    const selection = saveSelection(editor);
    // LibTV's prompt editor has a dedicated relative parent. Its native @ menu
    // remains in that parent, preserving event ancestry and reference identity.
    const parent = editor.parentElement;
    const holder = isLibTV && editor.hasAttribute('aria-placeholder') && parent?.classList.contains('relative') && parent.querySelectorAll('[contenteditable=true]').length === 1 ? parent : editor;
    const a = {editor, holder, original:remember(editor), holderRecord:holder === editor ? null : remember(holder), selection, composing:false, url:location.href,
      key:fieldKey(editor),ownerToken:crypto.randomUUID(),queue:Promise.resolve(),settingsTask:Promise.resolve(),doc:null,selectedId:'__new__',draftId:null,baseId:null,dirty:false,busy:false,dead:false,cleared:false};
    openingContext = a;
    const initial=snapshot(editor);a.initial=initial;
    let settings={};
    try {
      // Capture an epoch before loading. A delayed initial load must not recreate
      // history after another window has explicitly cleared this site's cache.
      const results=await Promise.allSettled([store.getSettings(),store.getEpoch(a.key)]);
      if (results[0].status==='fulfilled') settings=results[0].value;
      else a.error=results[0].reason;
      if (results[1].status==='rejected') throw results[1].reason;
      a.epoch=results[1].value;
      if (a.cleared) {opening=false;openingContext=null;return;}
      a.doc=await store.load(a.key,initial,a.epoch);
      a.epoch=a.doc.epoch;
      let matching=[...a.doc.versions].reverse().find(v=>equal(v.snapshot,initial));
      if (!matching && a.doc.versions.length) {
        a.doc=await store.createDraft(a.key,{snapshot:initial,parentId:null,ownerToken:a.ownerToken,epoch:a.doc.epoch});
        matching=a.doc.versions.find(v=>v.ownerToken===a.ownerToken);
        a.doc=await store.updateDraft(a.key,{id:matching.id,ownerToken:a.ownerToken,snapshot:initial,commit:true,epoch:a.doc.epoch});
      }
      a.baseId=matching?.id || null;
      a.selectedId=matching?.id || '__new__';
    } catch(error) {a.error=error;}
    if (destroyed || destroying || !enabled || !editor.isConnected || location.href!==a.url || a.cleared) {opening=false;openingContext=null;return;}
    active = a;
    a.shell = globalThis.MiorningTextFloatShell.create({settings,
      logoUrl:globalThis.chrome?.runtime?.getURL ? undefined : document.querySelector('meta[name="miorning-logo"]')?.content,
      onRect:arrange,onFont:()=>arrange(a.shell.rect),onTheme:theme=>{preferredTheme=theme;dock?.update({theme});arrange(a.shell.rect);},onClose:()=>requestClose(a),onFocus:focusEditor,
      onSettings:value=>persistSettings(a,value),onSelectVersion:id=>track(selectVersion(a,id)),onDeleteVersion:id=>track(deleteVersion(a,id)),
      onSettingsPage:()=>{openSettings().catch(()=>{});}
    });
    renderHistory(a);
    if (a.error) reportError(a,a.error);
    editor.setAttribute('data-miorning-floating-editor','');
    a.compat=globalThis.MiorningTextFloatCompat?.acquire(editor,{ownsReferenceNode:node=>a.menuManager?.owns(node)});
    if (globalThis.MiorningTextFloatCompat?.hasGuard() && !a.compat?.protected) {
      a.shell.setStatus('此输入框无法隔离回车保护；可复制换行文字粘贴，Esc 仍可保存');
    }
    a.editing=globalThis.MiorningTextFloatEditing.create({editor,isComposing:()=>a.composing || a.busy,onChange:()=>changed(a),onStatus:text=>a.shell.setStatus(text)});
    holder.setAttribute('popover','manual');
    arrange(a.shell.rect);
    holder.showPopover();
    a.menuManager = globalThis.MiorningTextFloatMenus?.create({editor,holder,getEditorRect:()=>a.shell.rect.editor,onStatus:text=>a.shell.setStatus(text)});
    a.watch = new MutationObserver(()=>{
      if (!editor.isConnected || location.href !== a.url) {a.composing=false;flushDraft(a).catch(()=>{});dispose(a);}
    });
    a.watch.observe(document.body,{childList:true,subtree:true});
    a.references = globalThis.MiorningTextFloatReferences?.create({editor,getTheme:()=>a.shell.theme,isComposing:()=>a.composing || a.busy,onStatus:text=>a.shell.setStatus(text)});
    a.menuManager?.refresh();
    editor.focus({preventScroll:true}); focusEditor();
    if (!equal(initial,snapshot(editor))) changed(a);
    opening = false; openingContext = null;
  }
  function ownsEvent(a,event) {
    return event.composedPath().some(el=>el===a.editor || el===a.holder || el===a.shell.element ||
      el?.classList?.contains('miorning-text-float-dock') || el?.hasAttribute?.('data-mention-suggest') ||
      (el instanceof Element && a.menuManager?.owns(el)));
  }
  listen(window,'pointerdown',event=>{
    const a=active;
    if (a && !ownsEvent(a,event)) requestClose(a,{outside:true});
  },{capture:true});
  listen(window,'wheel',event=>{
    const a=active;
    if (!a || event.ctrlKey || event.metaKey || !ownsEvent(a,event)) return;
    // Canvas libraries often capture wheel on document. Route the gesture to
    // its actual scroll area before those listeners; also contain boundary scroll.
    const path=event.composedPath();
    let dx=event.deltaX,dy=event.deltaY;
    if (event.shiftKey && !dx) {dx=dy;dy=0;}
    for (const el of path) {
      if (!(el instanceof Element)) continue;
      const style=getComputedStyle(el);
      const x=/auto|scroll/.test(style.overflowX) && el.scrollWidth>el.clientWidth;
      const y=/auto|scroll/.test(style.overflowY) && el.scrollHeight>el.clientHeight;
      if ((dx && x) || (dy && y)) {
        const unit=event.deltaMode===1 ? (parseFloat(style.lineHeight)||20) : event.deltaMode===2 ? el.clientHeight : 1;
        if (x) el.scrollLeft+=dx*unit;
        if (y) el.scrollTop+=dy*unit;
        break;
      }
      if (el===a.editor || el===a.holder || el===a.shell.element || el.hasAttribute('data-miorning-native-reference-menu') || el.classList.contains('miorning-text-float-dock')) break;
    }
    event.preventDefault();event.stopImmediatePropagation();
  },{capture:true,passive:false});
  listen(document,'click',event=>{
    if (event.composedPath().some(el=>el?.classList?.contains('miorning-text-float-shell') || el?.classList?.contains('miorning-text-float-dock'))) return;
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && target.getClientRects().length) open(target);
  });
  listen(document,'selectionchange',()=>{
    if (!active) return;
    const selection = saveSelection(active.editor); if(selection) active.selection=selection;
    active.menuManager?.place();
  });
  listen(document,'compositionstart',event=>{if(active?.editor.contains(event.target)) {active.composing=true;clearTimeout(active.saveTimer);active.saveTimer=0;}}, {capture:true});
  listen(document,'compositionend',event=>{if(active?.editor.contains(event.target)) {active.composing=false;changed(active);}}, {capture:true});
  listen(document,'beforeinput',event=>{if(active?.busy && active.editor.contains(event.target) && !active.restoring) {event.preventDefault();event.stopImmediatePropagation();}}, {capture:true});
  listen(window,'keydown',event=>{
    const inDock=event.composedPath().some(el=>el?.classList?.contains('miorning-text-float-dock'));
    if (inDock) return;
    if (!active?.composing && controlState && control?.matchesShortcut(event,controlState.shortcut)) {
      event.preventDefault();event.stopImmediatePropagation();
      track(control.toggle().then(applyControlState)).catch(error=>active?.shell.setStatus(error.message || '全局开关未能保存'));
      return;
    }
    const a = active;
    if (!a) return;
    if (event.key === 'Escape') {
      if (event.isComposing || a.composing || event.keyCode === 229) return;
      event.preventDefault();event.stopImmediatePropagation();
      if (!a.shell.closeTransient?.()) requestClose(a);
      return;
    }
    if (!a.editor.contains(event.target)) return;
    if (a.busy || (a.references?.busy && event.key==='Enter')) {event.preventDefault();event.stopImmediatePropagation();return;}
    if (a.references?.handleKey(event)) return;
    a.editing?.insertLineBreak(event);
  },{capture:true});
  listen(document,'input',event=>{
    if(active?.editor.contains(event.target)) {
      active.shell.setStatus('正在编辑原文本 · @ 使用原图片引用');
      changed(active);
      active.menuManager?.refresh();
    }
  });
  for(const event of ['popstate','hashchange','pagehide']) listen(window,event,()=>{const a=active;if(a){a.composing=false;flushDraft(a).catch(()=>{});dispose(a);}});
  const unsubscribeCache = store.onCacheCleared?.(({origins})=>{
    for (const a of new Set([active,openingContext].filter(Boolean))) {
      if (!origins.includes(store.originFromKey(a.key))) continue;
      a.cleared=true;clearTimeout(a.saveTimer);a.saveTimer=0;
      // Never write the in-memory draft back after an explicit cache clear.
      // The website's visible text is left in place for the user to keep editing.
      if (active===a) dispose(a);
    }
  });
  globalThis.MiorningTextFloat = Object.freeze({
    version:'0.4.4', open, close, whenIdle,
    async toggle(){if(control){applyControlState(await control.toggle());return enabled;}enabled=!enabled;if(!enabled){if(active)active.composing=false;if(!await close())enabled=true;}return enabled;},
    async destroy(){destroying=true;if(active)active.composing=false;if(!await close()){destroying=false;return false;}destroyed=true;if(openingContext)openingContext.cleared=true;clearTimeout(pauseTimer);unsubscribeControl();dock?.destroy();unsubscribeCache?.();lifetime.abort();delete globalThis.MiorningTextFloat;return true;},
    getState(){return {enabled,open:!!active,version:'0.4.4',fontSize:active?.shell.fontSize,theme:active?.shell.theme,rect:active?.shell.rect,busy:active?.busy || active?.references?.busy || opening,
      historyKey:active?.key,selectedId:active?.selectedId,draftId:active?.draftId,versions:active?.doc?.versions.map(({snapshot,ownerToken,...version})=>version)};}
  });
  controlsReady=initializeControls().catch(error=>console.warn('喵咛文本窗：全局设置未能读取',error.message));
})();

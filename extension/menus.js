/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatMenus) return;
  const marker = 'data-miorning-native-reference-menu';
  const ownUI = '.miorning-text-float-shell,.miorning-reference-suggestion,.miorning-text-float-dock,[data-miorning-dock]';
  const canvasNode = '.react-flow__node,.svelte-flow__node,.vue-flow__node,[data-nodeid],[data-node-id]';
  const semantic = '[role="listbox"],[role="menu"],[data-reference-main-panel],.fixture-mentions,[class*="mention" i][class*="menu" i],[class*="mention" i][class*="list" i],[class*="suggestion" i],[class*="suggest-list" i],[data-tippy-root],[data-radix-popper-content-wrapper]';
  // Use inset longhands only: writing a shorthand and its longhands together
  // would make our own style changes look like new host positioning updates.
  const positionProperties = ['position','left','top','right','bottom','width','max-width','min-width','max-height','margin','overflow','transform','translate','z-index'];
  const text = el => (el.textContent || '').trim().replace(/\s+/g, ' ');
  const isOpen = el => el.matches(':popover-open');
  function boundedElements(root,selector,limit) {
    const found = [], walker = document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
    let node,visited = 0;
    while ((node = walker.nextNode()) && visited++ < limit * 5 && found.length < limit) if (node.matches(selector)) found.push(node);
    return found;
  }
  function visible(el) {
    if (!el?.isConnected || el.hidden || el.getAttribute('aria-hidden') === 'true' || !el.getClientRects().length) return false;
    // A promoted popup must still follow its host's visibility. Top-layer
    // geometry alone cannot tell us whether a native ancestor was hidden.
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function create({editor,holder = editor,getEditorRect = () => editor.getBoundingClientRect(),onStatus = () => {},preexistingMenus}) {
    const life = new AbortController(), managed = new Map(), changes = new Set(), dismissed = new WeakSet();
    // Remember DOM identity without reading every node's layout. A pre-existing
    // page title cannot become a popup merely because its saved-state text or
    // class changed while the user typed @, including on very large canvases.
    const present = new WeakSet([document.body,...document.body.querySelectorAll('*')]);
    const exposed = new WeakSet(), establishedContent = new WeakSet(), previousVisibility = new WeakMap();
    const baseline = new WeakSet(preexistingMenus || [...document.querySelectorAll(semantic)].filter(visible));
    for (const el of boundedElements(document.body,'div,ul,ol,section',1500)) if (['absolute','fixed'].includes(getComputedStyle(el).position)) {
      const shown = !!visible(el);previousVisibility.set(el,shown);if (shown && text(el)) {baseline.add(el);establishedContent.add(el);}
    }
    const originRect = editor.getBoundingClientRect();
    const scope = editor.closest(canvasNode) || (editor.parentElement === document.body ? null : editor.parentElement);
    let dead = false, frame = 0, queryUntil = 0, composing = false, selfChanging = 0, checkedAt = 0, editorChanged = false;
    const listen = (el,event,fn,options = {}) => el.addEventListener(event,fn,{...options,signal:life.signal});
    const readStyle = (el,key) => ({value:el.style.getPropertyValue(key),priority:el.style.getPropertyPriority(key)});
    const same = (a,b) => a.value === b.value && a.priority === b.priority;
    const writeStyle = (el,key,value) => el.style.setProperty(key,value,'important');
    function query() {
      let before = '';
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) before = editor.value.slice(0,editor.selectionStart);
      else {
        const selection = getSelection();
        if (selection?.rangeCount && editor.contains(selection.focusNode)) {
          const range = selection.getRangeAt(0).cloneRange();
          range.selectNodeContents(editor);range.setEnd(selection.focusNode,selection.focusOffset);before = range.toString();
        }
        // Controlled editors may replace text nodes before restoring selection.
        // A trailing literal @ is enough to bridge that one-frame gap, while
        // arbitrary old mention text must not activate unknown popup discovery.
        if (!before && document.activeElement === editor && /@$/.test(editor.textContent || '')) before = '@';
      }
      return /@[^\n@]{0,80}$/.test(before);
    }
    const inQuery = () => !composing && Date.now() < queryUntil;
    function controlled(el) {
      if (!el.id) return false;
      return [editor,editor.closest('[aria-controls],[aria-owns]')].filter(Boolean).some(owner => `${owner.getAttribute('aria-controls') || ''} ${owner.getAttribute('aria-owns') || ''}`.split(/\s+/).includes(el.id));
    }
    function excluded(el) {
      return !(el instanceof Element) || el === editor || el === holder || el.contains(editor) || el.closest(ownUI) || el === document.body || el === document.documentElement || el.matches(canvasNode) || !!el.closest('nav,header,footer,[role="navigation"],[role="banner"],[role="alert"],[role="status"],[role="tooltip"],[aria-live],[class*="toast" i],[class*="notification" i]');
    }
    function pageChrome(el) {
      // Portals inside a compact horizontal page toolbar are not result lists.
      // Check its real ancestors, not any project-title text or platform name.
      for (let node = el,depth = 0;node && node !== document.body && depth < 5;node = node.parentElement,depth++) {
        if (node === holder || node.contains(editor)) break;
        if (node.matches('[role="toolbar"],[class*="toolbar" i],[class*="page-header" i],[class*="canvas-header" i]')) return true;
        const style = getComputedStyle(node), r = node.getBoundingClientRect();
        if (['fixed','absolute'].includes(style.position) && r.top <= 48 && r.bottom > 0 && r.height > 0 && r.height <= 112 && r.width >= innerWidth * .7) return true;
      }
      return false;
    }
    function compact(el) {
      const r = el.getBoundingClientRect();
      return r.width >= 64 && r.width <= Math.min(720,innerWidth) && r.height >= 20 && r.height <= Math.min(720,innerHeight) && text(el).length <= 2400;
    }
    function nearby(el) {
      if (scope?.contains(el)) return true;
      const r = el.getBoundingClientRect(), a = getEditorRect(), b = originRect;
      return [a,b].some(p => r.right >= p.left - 180 && r.left <= p.right + 180 && r.bottom >= p.top - 240 && r.top <= p.bottom + 300);
    }
    function referenceSemantics(el) {
      return el.matches('[data-reference-main-panel],.fixture-mentions,[class*="mention" i],[class*="suggest" i]') || !!el.querySelector('[data-reference-id],[data-reference-name],[data-mention-node-id],[data-mention-id]');
    }
    function rowShape(el) {
      if (!text(el) || el.querySelector('textarea,[contenteditable="true"],[contenteditable="plaintext-only"],input:not([type="search"])')) return false;
      // Native lists can use div rows, CSS thumbnails or no thumbnail at all.
      // The trigger, compact popup geometry and row structure must agree.
      let rows = [...el.children].filter(child => visible(child) && text(child));
      // Unwrap a list container, but never reinterpret several toolbar controls
      // inside one horizontal row as a single selectable result.
      for (let depth = 0;rows.length === 1 && depth < 3;depth++) {
        const row = rows[0], children = [...row.children].filter(child => visible(child) && text(child));
        if (row.matches('button,[role="option"],[role="menuitem"]') || row.querySelector('img') || children.length < 2) break;
        rows = children;
      }
      rows = rows.filter(child => text(child).length <= 180);
      if (!rows.length || rows.length > 50) return false;
      if (el.querySelector('h1,h2,h3,[role="heading"]') || rows.some(row => row.querySelectorAll('button,[role="button"],input,a[href]').length > 1)) return false;
      const thumbnail = row => !!row.querySelector('img') || [row,...boundedElements(row,'*',24)].some(node => getComputedStyle(node).backgroundImage !== 'none');
      const thumbnailGrid = rows.length > 1 && rows.every(row => thumbnail(row) && (row.matches('button,[role="option"],[role="menuitem"],[tabindex]') || getComputedStyle(row).cursor === 'pointer'));
      if (rows.length > 1) {
        const rects = rows.map(row => row.getBoundingClientRect());
        // Real unknown results must form a vertical list. Equal-height buttons
        // across a project/status toolbar are not evidence of a native picker.
        if (!thumbnailGrid && rects.some((r,index) => index && (r.top < rects[index - 1].bottom - 3 || Math.min(r.right,rects[index - 1].right) <= Math.max(r.left,rects[index - 1].left)))) return false;
      }
      const image = !!el.querySelector('img,[data-reference-id],[data-reference-name],[data-mention-id]') || rows.some(row => [row,...boundedElements(row,'*',24)].some(node => getComputedStyle(node).backgroundImage !== 'none'));
      const interactive = rows.some(row => row.matches('button,[role="option"],[role="menuitem"],[tabindex]') || getComputedStyle(row).cursor === 'pointer');
      const uniform = rows.length > 1 && rows.every(row => row.tagName === rows[0].tagName && row.getBoundingClientRect().height >= 18 && row.getBoundingClientRect().height <= 120);
      const surface = getComputedStyle(el);
      const single = rows.length === 1 && rows[0].matches('div,li') && rows[0].getBoundingClientRect().height >= 18 && rows[0].getBoundingClientRect().height <= 120 && (surface.boxShadow !== 'none' || parseFloat(surface.borderTopWidth) > 0 || surface.zIndex !== 'auto');
      // Single div results sometimes keep the default cursor. Require a popup
      // surface; live regions, notifications and unrelated existing panels are
      // excluded before this structural check.
      return image || interactive || uniform || single;
    }
    function associated(el,known = false) {
      if (excluded(el) || !visible(el) || dismissed.has(el)) return false;
      if (controlled(el)) return true;
      const nativeNode = el.closest(canvasNode);
      if (nativeNode && !nativeNode.contains(editor)) return false;
      const related = !!scope?.contains(el);
      if (known && referenceSemantics(el) && related) return true;
      // LibTV's explicit reference panel may be portalled out of its node and
      // opened by framework state before a DOM input/selection update arrives.
      if (known && el.matches('[data-reference-main-panel="true"]') && nearby(el) && rowShape(el)) return true;
      // A known native popup can first mount as a full-width block before the
      // platform positions it. Compact geometry is evidence for unlabelled
      // popups, not a requirement for a newly exposed explicit suggestion list.
      if (known && referenceSemantics(el) && inQuery() && !baseline.has(el) && nearby(el) && text(el).length <= 2400 && rowShape(el)) return true;
      if (!inQuery() || !compact(el) || !nearby(el)) return false;
      if (baseline.has(el) && !exposed.has(el)) return false;
      if (!known && (el.matches('button,a[href],input,[role="button"]') || pageChrome(el) || present.has(el) && !exposed.has(el))) return false;
      if (!known && !['absolute','fixed'].includes(getComputedStyle(el).position) && !el.hasAttribute('popover')) return false;
      return referenceSemantics(el) || rowShape(el);
    }
    function captureHostChanges(record) {
      for (const key of positionProperties) {
        const current = readStyle(record.el,key), applied = record.applied.get(key);
        if (applied && !same(current,applied)) record.original.set(key,current);
      }
    }
    function restore(record,closing = false) {
      const {el} = record;
      captureHostChanges(record);
      selfChanging++;
      try {
        // Leave an originally-open native popover open on normal disposal; never
        // reopen a popup that the host has since dismissed or made invisible.
        if (record.createdPopover && isOpen(el)) el.hidePopover();
        if (record.createdPopover) {
          if (record.popover == null) el.removeAttribute('popover');else el.setAttribute('popover',record.popover);
        }
        for (const key of positionProperties) {
          const applied = record.applied.get(key);
          if (!applied || !same(readStyle(el,key),applied)) continue;
          const original = record.original.get(key);
          if (original?.value) el.style.setProperty(key,original.value,original.priority);else el.style.removeProperty(key);
        }
        if (!record.hadStyle && !el.getAttribute('style')) el.removeAttribute('style');
        if (!record.hadMarker) el.removeAttribute(marker);
      } finally {selfChanging--;}
      managed.delete(el);
      if (!closing) dismissed.add(el);
    }
    function placeOne(record) {
      const el = record.el;
      if (!visible(el) || !isOpen(el)) {restore(record);return;}
      captureHostChanges(record);
      const r = getEditorRect(), selection = getSelection();
      let anchor = {left:r.left + 8,top:r.top + 8,bottom:r.top + 34};
      if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();if (rect.height) anchor = rect;
      }
      const width = Math.min(Math.max(160,record.width || 300),640,innerWidth - 16);
      const below = innerHeight - anchor.bottom - 14, above = anchor.top - 14;
      const height = Math.max(48,Math.min(480,innerHeight - 16,Math.max(below,above)));
      const naturalHeight = Math.min(el.scrollHeight || record.height || 180,height);
      const top = below >= naturalHeight ? anchor.bottom + 6 : Math.max(8,anchor.top - naturalHeight - 6);
      const values = {position:'fixed',left:`${Math.max(8,Math.min(anchor.left,innerWidth - width - 8))}px`,top:`${top}px`,right:'auto',bottom:'auto',width:`${width}px`,'max-width':`${innerWidth - 16}px`,'min-width':'0','max-height':`${height}px`,margin:'0',overflow:'auto',transform:'none',translate:'none','z-index':'2147483647'};
      selfChanging++;
      try {
        for (const [key,value] of Object.entries(values)) {
          if (!same(readStyle(el,key),{value,priority:'important'})) writeStyle(el,key,value);
          record.applied.set(key,readStyle(el,key));
        }
        record.appliedText = el.getAttribute('style');
      } finally {selfChanging--;}
    }
    function promote(el) {
      if (managed.has(el) || excluded(el)) return;
      const rect = el.getBoundingClientRect();
      const record = {el,original:new Map(positionProperties.map(key => [key,readStyle(el,key)])),applied:new Map(),hadStyle:el.hasAttribute('style'),popover:el.getAttribute('popover'),wasOpen:isOpen(el),hadMarker:el.hasAttribute(marker),width:rect.width,height:rect.height};
      managed.set(el,record);
      selfChanging++;
      try {
        el.setAttribute(marker,'');
        // Z-index cannot cross the browser top layer. Lift the *actual* native
        // list, preserving its event handlers, framework ancestry and tokens.
        if (record.wasOpen) {
          el.hidePopover();
          if (!el.isConnected || el.hidden || el.getAttribute('aria-hidden') === 'true') {restore(record);return;}
        } else {record.createdPopover = true;el.setAttribute('popover','manual');}
        el.showPopover();
      } catch {restore(record);return;}
      finally {selfChanging--;}
      placeOne(record);
    }
    function candidateAncestors(node,candidates) {
      const element = node instanceof Element ? node : node?.parentElement;
      for (let el = element,depth = 0;el && el !== document.body && depth < 6;el = el.parentElement,depth++) {
        if (excluded(el)) break;
        const known = el.matches(semantic);
        if (associated(el,known)) candidates.add(el);
      }
      if (element && !excluded(element)) {
        for (const el of [...element.querySelectorAll(semantic)].slice(0,80)) if (associated(el,true)) candidates.add(el);
        // An added portal may contain the unlabelled absolute popup below it.
        if (inQuery()) for (const el of boundedElements(element,'div,ul,ol,section',100)) if (associated(el,el.matches(semantic))) candidates.add(el);
      }
    }
    function scan() {
      frame = 0;if (dead) return;
      if (editorChanged) {editorChanged = false;if (query()) queryUntil = Date.now() + 10000;}
      for (const record of [...managed.values()]) if (!visible(record.el) || !isOpen(record.el)) restore(record);
      const candidates = new Set();
      for (const el of [...document.querySelectorAll(semantic)].slice(0,200)) if (associated(el,true)) candidates.add(el);
      for (const id of `${editor.getAttribute('aria-controls') || ''} ${editor.getAttribute('aria-owns') || ''}`.split(/\s+/)) {
        const el = id && document.getElementById(id);if (el && associated(el,true)) candidates.add(el);
      }
      for (const node of changes) candidateAncestors(node,candidates);
      changes.clear();
      // Changes are the primary route. One bounded query-time scan also finds
      // already-mounted portals whose CSS animation or text-node update opened
      // them before the observer was installed.
      if (inQuery() && Date.now() - checkedAt > 250) {
        checkedAt = Date.now();
        const roots = [...document.body.children].filter(el => !excluded(el));
        if (scope) roots.unshift(scope);
        let budget = 700;
        for (const root of roots) {
          if (budget <= 0) break;
          const nodes = [root,...boundedElements(root,'div,ul,ol,section',Math.min(179,budget - 1))];budget -= nodes.length;
          for (const el of nodes) if (associated(el,el.matches(semantic))) candidates.add(el);
        }
      }
      for (const el of candidates) {
        if ([...managed.keys()].some(parent => parent === el || parent.contains(el) || el.contains(parent))) continue;
        if ([...candidates].some(parent => parent !== el && parent.contains(el))) continue;
        promote(el);
      }
      place();
    }
    function refresh() {if (!dead && !frame) frame = requestAnimationFrame(scan);}
    function place() {if (!dead) for (const record of [...managed.values()]) placeOne(record);}
    function signal() {
      queryUntil = query() ? Date.now() + 10000 : 0;
      if (queryUntil) changes.add(scope || editor.parentElement);
      refresh();
    }
    function markExposed(el) {
      for (const node of [el,...boundedElements(el,'div,ul,ol,section',100)]) exposed.add(node);
    }
    function observeExposure(mutation,target) {
      if (!inQuery() || !present.has(target)) return;
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        const added = new Set(mutation.addedNodes);
        const previousText = [...mutation.removedNodes,...target.childNodes].filter(node => !added.has(node)).map(node => node.textContent || '').join('').trim();
        // Existing empty portals often receive their rows with innerHTML or
        // append rather than a text-node mutation. Rebuilt title/status bars
        // already had text, so replacing their children is not new exposure.
        if (!previousText && text(target)) for (let node = target,depth = 0;node && node !== document.body && depth < 5;node = node.parentElement,depth++) {
          if (excluded(node) || establishedContent.has(node) || baseline.has(node) || text(node) !== text(target)) break;exposed.add(node);
        }
      }
      if (mutation.type === 'characterData' && !(mutation.oldValue || '').trim()) {
        // A previously empty portal can receive its first text row without any
        // added element. An existing title's extra status span does not qualify.
        const value = (mutation.target.data || '').trim();
        if (value) for (let node = target,depth = 0;node && node !== document.body && depth < 5;node = node.parentElement,depth++) {
          if (establishedContent.has(node) || baseline.has(node) || text(node) !== value) break;exposed.add(node);
        }
      }
      if (mutation.type !== 'attributes') return;
      const shown = !!visible(target), previous = previousVisibility.get(target);
      previousVisibility.set(target,shown);
      if (!shown) return;
      let wasHidden = previous === false || mutation.attributeName === 'hidden' && mutation.oldValue != null || mutation.attributeName === 'aria-hidden' && mutation.oldValue === 'true';
      if (mutation.attributeName === 'style' && mutation.oldValue) {
        const old = document.createElement('i').style;old.cssText = mutation.oldValue;
        wasHidden ||= old.display === 'none' || old.visibility === 'hidden';
      }
      if (mutation.attributeName === 'class') wasHidden ||= /(?:^|\s)(?:hidden|invisible)(?:\s|$)/.test(mutation.oldValue || '') && !/(?:^|\s)(?:hidden|invisible)(?:\s|$)/.test(target.className || '');
      if (wasHidden) markExposed(target);
    }
    const observer = new MutationObserver(records => {
      if (dead) return;
      let baselineBudget = 128;
      // Frameworks may clear then refill a title in separate mutation records
      // (or separate deliveries). Retain the old nonempty-content evidence so
      // that its replacement cannot impersonate an originally empty portal.
      for (const mutation of records) {
        const oldText = mutation.type === 'characterData' ? mutation.oldValue : mutation.type === 'childList' ? [...mutation.removedNodes].map(node => node.textContent || '').join('') : '';
        if (!oldText?.trim()) continue;
        let node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!node || node.closest(ownUI)) continue;
        for (let depth = 0;node && node !== document.body && depth < 5;node = node.parentElement,depth++) {
          if (node === editor || node.contains(editor)) break;establishedContent.add(node);
        }
      }
      for (const mutation of records) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!target || target.closest(ownUI)) continue;
        if (target === editor || editor.contains(target)) {
          if (mutation.type !== 'attributes' || ['aria-controls','aria-owns'].includes(mutation.attributeName)) {editorChanged = true;refresh();}
          continue;
        }
        observeExposure(mutation,target);
        if (target === holder && mutation.type === 'attributes' && mutation.attributeName === 'style') continue;
        if (!inQuery()) for (const node of mutation.addedNodes) {
          if (baselineBudget <= 0) break;
          if (!(node instanceof Element)) continue;
          for (const el of [node,...boundedElements(node,'div,ul,ol,section',Math.min(99,baselineBudget - 1))]) {
            baselineBudget--;if (visible(el) && text(el)) baseline.add(el);
          }
        }
        const record = managed.get(target);
        if (mutation.type === 'attributes' && mutation.attributeName === 'style' && record?.appliedText === target.getAttribute('style')) continue;
        if (mutation.type === 'attributes' && mutation.attributeName === marker) continue;
        const managedAncestor = [...managed.keys()].some(menu => target.contains(menu));
        if (!record && !managedAncestor && !inQuery() && !target.matches(semantic) && !target.closest(semantic)) {
          // LibTV can mount its known panel from a native @ button without a
          // keyboard/input event. The mutation target is then its plain parent.
          for (const node of mutation.addedNodes) {
            if (changes.size >= 128) break;
            if (node instanceof Element && (node.matches(semantic) || node.querySelector(semantic))) changes.add(node);
          }
          continue;
        }
        if (visible(target)) dismissed.delete(target);
        if (changes.size < 128) changes.add(target);
        for (const node of mutation.addedNodes) {if (changes.size >= 128) break;changes.add(node);}
      }
      if (changes.size) refresh();
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,characterDataOldValue:true,attributes:true,attributeOldValue:true,attributeFilter:['hidden','class','aria-hidden','aria-expanded','aria-controls','aria-owns','style','popover']});
    listen(editor,'keydown',event => {if (event.key === '@' && !event.isComposing) {queryUntil = Date.now() + 10000;refresh();}},{capture:true});
    const nativeAtAction = event => {
      const target = event.target instanceof Element ? event.target.closest('button,[role="button"]') : null;
      if (!target || target.closest(ownUI) || !scope?.contains(target)) return;
      const label = (target.getAttribute('aria-label') || target.getAttribute('title') || text(target)).trim();
      if (/^(?:@|引用|参考图|引用图片|添加引用|mention|reference image)$/i.test(label)) {queryUntil = Date.now() + 10000;changes.add(scope);refresh();}
    };
    listen(document,'pointerdown',nativeAtAction,{capture:true});listen(document,'click',nativeAtAction,{capture:true});
    listen(editor,'input',signal);listen(editor,'keyup',signal);
    listen(editor,'compositionstart',() => {composing = true;queryUntil = 0;});
    listen(editor,'compositionend',() => {composing = false;signal();});
    listen(document,'toggle',event => {
      if (selfChanging || !(event.target instanceof Element)) return;
      if (event.newState === 'closed' && managed.has(event.target)) {restore(managed.get(event.target));return;}
      if (event.newState === 'open' && event.target !== holder && !event.target.closest(ownUI)) {dismissed.delete(event.target);changes.add(event.target);refresh();}
    },{capture:true});
    listen(window,'resize',refresh);listen(editor,'scroll',place,{passive:true});
    signal();
    return {refresh,place,owns:target => target instanceof Node && [...managed.keys()].some(el => el === target || el.contains(target)),destroy(){if (dead) return;dead = true;life.abort();observer.disconnect();cancelAnimationFrame(frame);for (const record of [...managed.values()]) restore(record,true);changes.clear();}};
  }
  globalThis.MiorningTextFloatMenus = Object.freeze({create});
})();

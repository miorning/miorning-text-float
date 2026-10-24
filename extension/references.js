/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatReferences) return;
  const menuSelector = '[data-miorning-native-reference-menu],[role="listbox"],[role="menu"],.fixture-mentions,[data-reference-main-panel="true"],[class*="mention" i][class*="menu" i],[class*="mention" i][class*="list" i],[class*="suggestion" i],[class*="suggest-list" i],[data-tippy-root],[data-radix-popper-content-wrapper]';
  const tokenSelector = '[data-mention-node-id],[data-reference-id],[data-type="mention"],[data-mention-id],[contenteditable="false"],[data-slate-void="true"]';
  const skipSelector = '[data-mention-suggest],[data-suggest-element-id],[data-miorning-reference-preview]';
  const visible = el => !!el?.isConnected && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const normalize = name => String(name || '').replace(/^@\s*/, '').trim();
  const imageSource = src => {try {const u = new URL(src, location.href);u.searchParams.delete('x-oss-process');return u.href;} catch {return src || '';}};
  const identity = el => el.getAttribute('data-mention-node-id') || el.getAttribute('data-reference-id') || el.getAttribute('data-mention-id') || el.getAttribute('data-node-id') || el.getAttribute('data-element-id') || el.getAttribute('data-id') || '';
  function nameOf(el) {
    const named = el.querySelector('[data-reference-name],[data-node-name],[data-mention-label],[data-name],input:not([type="hidden"]),[class*="title" i],[class*="name" i],[title]');
    return normalize(el.getAttribute('data-reference-name') || el.getAttribute('data-node-name') || el.getAttribute('data-name') || el.getAttribute('data-label') || el.getAttribute('title') || named?.getAttribute('data-reference-name') || named?.getAttribute('data-node-name') || named?.getAttribute('data-name') || named?.getAttribute('title') || named?.value || named?.textContent || el.querySelector('img')?.alt || el.textContent);
  }
  function isNativeMenu(el, editor) {
    if (!(el instanceof Element) || !visible(el) || el === editor || el.contains(editor) || el.closest('.miorning-text-float-shell,.miorning-reference-suggestion')) return false;
    const controlled = (editor.getAttribute('aria-controls') || editor.getAttribute('aria-owns') || '').split(/\s+/).includes(el.id);
    const semantic = el.matches('[data-miorning-native-reference-menu],[data-reference-main-panel],.fixture-mentions,[class*="mention" i],[class*="suggest" i]') || !!el.querySelector('[data-reference-id],[data-mention-node-id],[data-reference-name]');
    return controlled || semantic || (el.matches('[role="listbox"],[role="menu"],[data-tippy-root],[data-radix-popper-content-wrapper]') && !!el.querySelector('img'));
  }
  function menuRows(menu) {
    const entries = [...menu.querySelectorAll('[role="option"],[role="menuitem"],button,[data-reference-name],[data-mention-id],[class*="mention-item" i],[class*="suggestion-item" i]')];
    const verified = menu.hasAttribute('data-miorning-native-reference-menu');
    if (verified) {
      // The menu coordinator verified the real @ trigger and popup association.
      // Several editors render text-only div rows or CSS background thumbnails.
      const groups = [menu,...menu.querySelectorAll('ul,ol,[role="listbox"]')];
      for (const group of groups) for (const row of group.children) {
        if (row.matches('div,li,button,[role="option"],[role="menuitem"]') && nameOf(row).length <= 160) entries.push(row);
      }
    }
    // Some canvas menus expose clickable div rows without ARIA roles. A row is
    // considered only when it contains one thumbnail and a short visible name.
    for (const img of menu.querySelectorAll('img')) {
      let row = img.parentElement;
      for (let i = 0; row && row !== menu && i < 4; i++, row = row.parentElement) {
        if (row.querySelectorAll('img').length !== 1) break;
        const name = nameOf(row);
        if (name && name.length <= 160 && !/^图片$|^image$|^预览$/i.test(name)) {entries.push(row);break;}
      }
    }
    const unique = [];
    for (const row of entries) {
      if (!visible(row) || !verified && !row.querySelector('img') && !row.matches('[data-reference-name],[data-mention-id]')) continue;
      const name = nameOf(row); if (!name || name.length > 160) continue;
      const same = unique.find(ref => ref.button.contains(row) || row.contains(ref.button));
      if (same) continue;
      unique.push({id:identity(row),name,image:row.querySelector('img')?.src,button:row,menu});
    }
    return unique;
  }
  function directCatalog(editor) {
    const refs = [...document.querySelectorAll('[data-reference-id][data-reference-name]')].flatMap(el => {
      const button = el.querySelector('[data-insert-reference]');
      return button && !editor.contains(button) ? [{id:identity(el),name:normalize(el.dataset.referenceName),button,image:el.querySelector('img')?.src}] : [];
    });
    // LibTV's connected thumbnails expose an explicit @ action. This structural
    // adapter also works on compatible canvases without a hostname restriction.
    let panel = editor.parentElement;
    while (panel && panel !== document.body && !panel.querySelector('button[aria-label="@"]')) panel = panel.parentElement;
    if (panel && panel !== document.body) {
      const nodes = [...document.querySelectorAll('.react-flow__node-image[data-id]')].map(node => ({id:node.dataset.id,name:normalize(node.querySelector('.node-floating-ui span[title]')?.getAttribute('title')),sources:[...node.querySelectorAll('[data-node-transition-media] img')].map(img => imageSource(img.src))}));
      for (const button of panel.querySelectorAll('button[aria-label="@"]')) {
        const image = button.parentElement.querySelector('img')?.src;
        const matches = nodes.filter(node => node.name && node.sources.includes(imageSource(image)));
        if (image && matches.length === 1) refs.push({...matches[0],image,button});
      }
    }
    return refs;
  }
  function nodeCatalog(editor) {
    return [...document.querySelectorAll('.react-flow__node,.vue-flow__node,.svelte-flow__node,[data-node-id],[data-nodeid],[data-element-id]')].flatMap(node => {
      if (node.contains(editor) || node.closest('.miorning-text-float-shell') || !node.querySelector('img')) return [];
      const name = nameOf(node), image = node.querySelector('img')?.src;
      return name && name.length <= 160 ? [{id:identity(node) || node.getAttribute('data-nodeid'),name,image,lookup:true}] : [];
    });
  }
  function create({editor,isComposing = () => false,getTheme = () => 'light',onStatus = () => {}}) {
    const life = new AbortController(), learned = new Map();
    const isText = editor instanceof HTMLTextAreaElement;
    let candidate = null, frame = 0, dead = false, busy = false, transaction = null;
    const ghost = document.createElement('div');
    ghost.className = 'miorning-reference-suggestion';ghost.setAttribute('popover','manual');ghost.setAttribute('role','status');ghost.setAttribute('aria-live','polite');
    ghost.style.cssText = 'position:fixed;inset:auto;margin:0;border:1px solid #c5cdc9;border-radius:7px;padding:5px 9px;background:#eef0ed;color:#737d77;font:13px/20px "Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 3px 12px #152a1a18;pointer-events:none;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;z-index:2147483647;';
    const root = ghost.attachShadow({mode:'open'});
    root.innerHTML = '<style>:host::backdrop{background:transparent}img{width:20px;height:20px;border-radius:4px;object-fit:cover;vertical-align:middle;margin-right:6px;filter:grayscale(1);opacity:.55}kbd{font:11px sans-serif;border:1px solid currentColor;border-radius:3px;padding:1px 4px;margin-left:8px}.mode{margin-left:6px;font-size:11px}</style><img alt=""><span class="name"></span><kbd>Tab</kbd><span class="mode"></span>';
    const style = document.createElement('style');
    style.textContent = '::highlight(miorning-reference-preview){color:#87928c;background-color:#e9eee8;} [data-miorning-floating-editor] [data-mention-suggest]{display:none!important;}';
    document.body.append(style,ghost);
    const listen = (el,event,fn,options = {}) => el.addEventListener(event,fn,{...options,signal:life.signal});
    const hide = () => {candidate=null;if(ghost.matches(':popover-open'))ghost.hidePopover();globalThis.CSS?.highlights?.delete('miorning-reference-preview');};
    function isToken(el) {
      return el.matches(tokenSelector) && !el.matches(skipSelector) && !el.closest(skipSelector) && !/suggest|preview/i.test(el.getAttribute('data-type') || '') && (identity(el) || /mention|reference/i.test(el.className || '') || el.matches('[data-type="mention"],[data-slate-void="true"]') || /^@/.test(el.textContent?.trim() || '') || !!el.querySelector('img'));
    }
    function model() {
      if (isText) return {text:editor.value,pieces:[],tokens:[]};
      let text = '';const pieces = [],tokens = [];
      const visit = node => {
        if (node.nodeType === Node.TEXT_NODE) {pieces.push({node,start:text.length,end:text.length+node.length});text+=node.data;return;}
        if (!(node instanceof Element) || node.matches(skipSelector)) return;
        if (isToken(node)) {tokens.push({node,start:text.length,key:identity(node) || `${normalize(node.textContent)}|${imageSource(node.querySelector('img')?.src)}`,name:normalize(node.getAttribute('data-label') || node.getAttribute('data-name') || node.textContent)});text+='\uFFFC';return;}
        if (node.tagName === 'BR') {text+='\n';return;}
        if (node !== editor && /^(DIV|P|LI|PRE|BLOCKQUOTE)$/.test(node.tagName) && text && !text.endsWith('\n')) text+='\n';
        for (const child of node.childNodes) visit(child);
      };
      visit(editor);return {text,pieces,tokens};
    }
    function rangeAt(value,start,end) {
      const left = value.pieces.find(part => part.end > start && part.start <= start);
      const right = [...value.pieces].reverse().find(part => part.start < end && part.end >= end);
      if (!left || !right) return null;
      const range = document.createRange();range.setStart(left.node,start-left.start);range.setEnd(right.node,end-right.start);return range;
    }
    function caretOffset(value) {
      if (isText) return editor.selectionStart === editor.selectionEnd ? editor.selectionStart : null;
      const selection = getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return null;
      const found = value.pieces.find(part => part.node === selection.anchorNode);
      if (found) return found.start + selection.anchorOffset;
      // Native editors frequently leave the caret on the containing paragraph.
      const range = selection.getRangeAt(0);
      const preceding = value.pieces.filter(part => {try{return range.comparePoint(part.node,part.node.length) <= 0;}catch{return false;}}).at(-1);
      return preceding?.end ?? (editor.textContent ? null : 0);
    }
    function nativeMenus() {return [...document.querySelectorAll(menuSelector)].filter(el => isNativeMenu(el,editor));}
    function learn() {
      for (const menu of nativeMenus()) for (const ref of menuRows(menu)) learned.set(ref.id || `${ref.name}|${imageSource(ref.image)}`,{id:ref.id,name:ref.name,image:ref.image,lookup:true});
    }
    function catalog() {
      learn();const refs = [], seen = new Set();
      for (const ref of [...directCatalog(editor),...nodeCatalog(editor),...learned.values()]) {
        if (!ref.name) continue;
        const key = ref.id ? `${ref.id}|${ref.name}` : `${ref.name}|${imageSource(ref.image)}`;
        if (seen.has(key)) continue;seen.add(key);refs.push(ref);
      }
      return refs;
    }
    function refresh() {
      frame=0;if(dead||busy)return;
      if(isComposing()||!editor.isConnected||(!isText&&!editor.isContentEditable)){hide();return;}
      const value=model(), offset=caretOffset(value);
      if(offset==null || document.activeElement !== editor){hide();return;}
      const prefix=value.text.slice(0,offset), matches=catalog().filter(ref=>prefix.endsWith(ref.name)&&prefix[prefix.length-ref.name.length-1]!=='@'&&!ref.name.includes('\n'));
      matches.sort((a,b)=>b.name.length-a.name.length);
      if(!matches.length){hide();return;}
      const ref=matches[0];
      if(matches.filter(item=>item.name===ref.name).length>1){hide();onStatus('存在同名参考图，请用 @ 列表选择');return;}
      const start=offset-ref.name.length, range=isText?null:rangeAt(value,start,offset);
      if(!isText&&!range){hide();return;}
      candidate={ref,start,end:offset,prefix:value.text.slice(0,start),suffix:value.text.slice(offset),text:value.text,range};
      root.querySelector('.name').textContent='@ '+ref.name;
      const img=root.querySelector('img');img.hidden=!ref.image;if(ref.image&&img.src!==ref.image)img.src=ref.image;
      root.querySelector('.mode').textContent='替换名称';
      const dark=getTheme()==='dark';ghost.style.background=dark?'#26322d':'#eef0ed';ghost.style.color=dark?'#bac6bf':'#737d77';ghost.style.borderColor=dark?'#536359':'#c5cdc9';
      if(range&&globalThis.CSS?.highlights&&globalThis.Highlight)CSS.highlights.set('miorning-reference-preview',new Highlight(range));
      const r=range?.getBoundingClientRect(),box=editor.getBoundingClientRect();
      ghost.style.left=Math.max(8,Math.min(r?.right||box.left+8,innerWidth-300))+'px';
      ghost.style.top=Math.max(8,Math.min((r?.bottom||box.top+28)+5,innerHeight-44))+'px';
      if(!ghost.matches(':popover-open'))ghost.showPopover();
      onStatus('灰色为待确认引用 · Tab 确认');
    }
    const schedule=()=>{if(!frame&&!dead)frame=requestAnimationFrame(refresh);};
    function setSelection(start,end,value=model()) {
      editor.focus({preventScroll:true});
      if(isText){editor.setSelectionRange(start,end);return true;}
      const range=rangeAt(value,start,end);
      if(!range&&start===end) {
        const part=value.pieces.find(part=>part.end===start)||value.pieces.find(part=>part.start===start);
        if(part){const r=document.createRange();r.setStart(part.node,start-part.start);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return true;}
        if(!value.text){const r=document.createRange();r.selectNodeContents(editor);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);return true;}
      }
      if(!range)return false;
      const s=getSelection();s.removeAllRanges();s.addRange(range);return true;
    }
    function edit(start,end,text,value=model()) {
      if(!setSelection(start,end,value))return false;
      // Native editing commands preserve input/undo and framework listeners.
      return document.execCommand(text?'insertText':'delete',false,text);
    }
    function newTokens(before,after) {
      const counts=new Map();for(const token of before.tokens)counts.set(token.key,(counts.get(token.key)||0)+1);
      return after.tokens.filter(token=>{const count=counts.get(token.key)||0;if(count){counts.set(token.key,count-1);return false;}return true;});
    }
    function restoreCaret(value,position) {
      if(isText){editor.setSelectionRange(Math.min(position,editor.value.length),Math.min(position,editor.value.length));return;}
      if(setSelection(position,position,value))return;
      const token=value.tokens.find(item=>item.start+1===position);
      if(token){const r=document.createRange();r.setStartAfter(token.node);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);}
    }
    async function accept() {
      if(!candidate||busy||isComposing())return;
      const current=candidate,before=model();
      if(before.text!==current.text)return hide();
      busy=true;hide();
      const tx={cancelled:false,trigger:false,clicked:false,item:null};transaction=tx;
      let expectedTriggerText='';
      const cancelled=()=>dead||tx.cancelled||!editor.isConnected||isComposing();
      const cleanupTrigger=()=>{
        if(!tx.trigger||cancelled())return;
        const now=model();
        if(now.text===expectedTriggerText&&document.activeElement===editor)edit(current.end,current.end+1,'',now);
      };
      try {
        let direct=directCatalog(editor).filter(ref=>ref.name===current.ref.name&&(ref.id===current.ref.id||imageSource(ref.image)===imageSource(current.ref.image)));
        if(direct.length===1&&direct[0].button.isConnected) {
          if(!setSelection(current.end,current.end,before))return;
          tx.clicked=true;tx.item=direct[0].button;tx.item.click();
        } else {
          // The name alone cannot prove a canvas edge. Resolve through its real
          // @ picker and proceed only with one exact, available image row.
          const alreadyOpen=new Set(nativeMenus());
          if(!edit(current.end,current.end,'@',before))return;
          tx.trigger=true;expectedTriggerText=current.text.slice(0,current.end)+'@'+current.text.slice(current.end);
          for(let i=0;i<30&&!cancelled();i++) {
            const now=model();if(now.text!==expectedTriggerText){tx.cancelled=true;break;}
            const rows=nativeMenus().filter(menu=>!alreadyOpen.has(menu)||(editor.getAttribute('aria-controls')||'').split(/\s+/).includes(menu.id)).flatMap(menuRows).filter(ref=>ref.name===current.ref.name);
            const unique=rows.filter((ref,index)=>!rows.slice(0,index).some(previous=>previous.button===ref.button||previous.button.contains(ref.button)||ref.button.contains(previous.button)));
            if(unique.length>1){onStatus('存在同名参考图，请用 @ 列表选择');break;}
            if(unique.length===1){tx.clicked=true;tx.item=unique[0].button;tx.item.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tx.item.click();break;}
            await new Promise(resolve=>setTimeout(resolve,32));
          }
        }
        let inserted=null,after=model();
        for(let i=0;tx.clicked&&!cancelled()&&i<30;i++) {
          after=model();
          if(isText) {
            // Plain editors have no token nodes; only the native item's actual
            // replacement (not our temporary @) counts as an accepted mention.
            const expected=current.prefix+current.ref.name+'@'+current.ref.name;
            if(after.text.startsWith(expected)&&after.text.endsWith(current.suffix)&&after.text!==expectedTriggerText)inserted={start:current.end,length:after.text.length-current.text.length};
          } else {
            inserted=newTokens(before,after).find(token=>(token.key===current.ref.id||token.name===current.ref.name||token.name.endsWith(current.ref.name))&&token.start>=current.start&&token.start<=current.end+2);
          }
          if(inserted)break;
          await new Promise(resolve=>setTimeout(resolve,32));
        }
        if(cancelled())return;
        if(!inserted){cleanupTrigger();onStatus('未能确认此图片引用，原文字已保留；请用 @ 列表选择');return;}
        const nameStillPresent=after.text.slice(current.start,current.end)===current.ref.name&&after.text.slice(0,current.start)===current.prefix;
        // Native item clicks may retain focus on that button, or leave it on body
        // when the picker unmounts. Only reclaim that known click's focus; never
        // focus away from an unrelated field that the user selected meanwhile.
        const focused=document.activeElement;
        const safeFocus=focused===editor||focused===tx.item||tx.item?.contains(focused)||focused===document.body&&!tx.item?.isConnected;
        if(nameStillPresent&&inserted.start>=current.end&&safeFocus) {
          const caret=caretOffset(after), removed=edit(current.start,current.end,'',after);
          const final=model();
          if(removed&&final.text.length===after.text.length-current.ref.name.length){restoreCaret(final,Math.max(current.start,(caret??inserted.start+1)-current.ref.name.length));onStatus('已用图片引用替换名称');}
          else onStatus('已插入图片引用；当前编辑器未接受删除原文字');
        } else onStatus(nameStillPresent?'已插入图片引用；焦点已变化，原文字已保留':'已用图片引用替换名称');
      } catch {cleanupTrigger();onStatus('引用未完成，原文字已保留；请用 @ 列表选择');}
      finally {busy=false;transaction=null;}
    }
    function handleKey(event) {
      if(event.isComposing||isComposing()||event.keyCode===229)return false;
      if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey) {
        if(busy){event.preventDefault();event.stopImmediatePropagation();return true;}
        refresh();if(candidate){event.preventDefault();event.stopImmediatePropagation();void accept();return true;}
      }
      return false;
    }
    // A genuine user edit cancels pending resolution. It must never be deleted
    // by delayed work that was started for an earlier caret position.
    listen(editor,'beforeinput',event=>{if(transaction&&event.isTrusted&&event.inputType!=='deleteContentBackward'&&event.inputType!=='insertText')transaction.cancelled=true;});
    listen(editor,'keydown',event=>{if(transaction&&event.isTrusted&&event.key!=='Tab')transaction.cancelled=true;},{capture:true});
    listen(document,'pointerdown',event=>{if(transaction&&event.isTrusted&&!nativeMenus().some(menu=>menu.contains(event.target)))transaction.cancelled=true;},{capture:true});
    for(const name of ['input','compositionend','keyup','click','scroll'])listen(editor,name,schedule);
    listen(editor,'compositionstart',()=>{if(transaction)transaction.cancelled=true;hide();});
    listen(document,'selectionchange',schedule);listen(window,'resize',schedule);
    return {refresh:schedule,handleKey,get busy(){return busy;},destroy(){dead=true;if(transaction)transaction.cancelled=true;life.abort();cancelAnimationFrame(frame);hide();ghost.remove();style.remove();}};
  }
  globalThis.MiorningTextFloatReferences=Object.freeze({create,menuSelector,isNativeMenu});
})();

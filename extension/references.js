(() => {
  'use strict';
  if (globalThis.MiorningTextFloatReferences) return;
  const baseImage = src => {
    try {const u = new URL(src, location.href); u.searchParams.delete('x-oss-process'); return u.href;} catch {return src;}
  };
  function catalog(editor) {
    // A generic opt-in adapter used by the local fixture and future integrations.
    const fixtures = [...document.querySelectorAll('[data-reference-id][data-reference-name]')].map(el=>({
      id:el.dataset.referenceId,name:el.dataset.referenceName,button:el.querySelector('[data-insert-reference]'),image:el.querySelector('img')?.src
    })).filter(x=>x.name && x.button && !editor.contains(x.button));
    if (fixtures.length) return fixtures;
    if (!/(^|\.)liblib\.tv$/.test(location.hostname)) return [];
    let panel = editor.parentElement;
    while(panel && panel !== document.body && !panel.querySelector('button[aria-label="@"]')) panel=panel.parentElement;
    if (!panel || panel === document.body) return [];
    const nodes = [...document.querySelectorAll('.react-flow__node-image[data-id]')].map(node=>({
      id:node.dataset.id,name:node.querySelector('.node-floating-ui span[title]')?.getAttribute('title'),
      sources:[...node.querySelectorAll('[data-node-transition-media] img')].map(img=>baseImage(img.src))
    }));
    return [...panel.querySelectorAll('button[aria-label="@"]')].flatMap(button=>{
      const image = button.parentElement.querySelector('img')?.src;
      if (!image) return [];
      // A duplicated image URL is ambiguous. Never guess which node to reference.
      const matches = nodes.filter(node=>node.name && node.sources.includes(baseImage(image)));
      return matches.length === 1 ? [{...matches[0],image,button}] : [];
    });
  }
  function create({editor,getKeepText = ()=>false,isComposing = ()=>false,onStatus = ()=>{}}) {
    const life = new AbortController();
    let candidate=null, frame=0, acceptFrame=0, dead=false, busy=false, dismissed='';
    const ghost=document.createElement('div');
    ghost.className='miorning-reference-suggestion';
    ghost.setAttribute('popover','manual');
    ghost.setAttribute('role','status');
    ghost.setAttribute('aria-live','polite');
    ghost.style.cssText='position:fixed;inset:auto;margin:0;border:1px solid #c5cdc9;border-radius:7px;padding:5px 9px;background:#eef0ed;color:#737d77;font:13px/20px "Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 3px 12px #152a1a18;pointer-events:none;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;z-index:2147483647;';
    const root=ghost.attachShadow({mode:'open'});
    root.innerHTML='<style>:host::backdrop{background:transparent}img{width:20px;height:20px;border-radius:4px;object-fit:cover;vertical-align:middle;margin-right:6px;filter:grayscale(1);opacity:.55}kbd{font:11px sans-serif;border:1px solid #bbc4be;border-radius:3px;padding:1px 4px;margin-left:8px;color:#536258}.mode{margin-left:6px;font-size:11px}</style><img alt=""><span class="name"></span><kbd>Tab</kbd><span class="mode"></span>';
    const style=document.createElement('style');
    style.textContent='::highlight(miorning-reference-preview){color:#87928c;background-color:#e9eee8;} [data-miorning-floating-editor] [data-mention-suggest]{display:none!important;}';
    document.body.append(style,ghost);
    const listen=(el,event,fn,options={})=>el.addEventListener(event,fn,{...options,signal:life.signal});
    const hide=()=>{
      candidate=null;
      if(ghost.matches(':popover-open'))ghost.hidePopover();
      globalThis.CSS?.highlights?.delete('miorning-reference-preview');
    };
    const blockTags=new Set(['BR','DIV','P','LI','UL','OL','BLOCKQUOTE','PRE','H1','H2','H3','H4','H5','H6','TABLE','TR','TD']);
    const boundary=node=>node.nodeType===Node.ELEMENT_NODE && (node.getAttribute('contenteditable')==='false'||blockTags.has(node.tagName));
    function previousText(node) {
      let cursor=node;
      while(cursor && cursor!==editor) {
        if(cursor.previousSibling) {
          cursor=cursor.previousSibling;
          while(cursor) {
            if(boundary(cursor))return null;
            if(cursor.nodeType===Node.TEXT_NODE)return cursor;
            if(cursor.lastChild)cursor=cursor.lastChild;else break;
          }
        } else {
          cursor=cursor.parentNode;
          if(cursor===editor||!cursor||boundary(cursor))return null;
        }
      }
      return null;
    }
    function textBeforeCaret(caret,maxLength) {
      const parts=[];let node=caret.startContainer,offset=caret.startOffset,total=0;
      while(node && total<maxLength) {
        const source=node.textContent.slice(0,offset),lineStart=source.lastIndexOf('\n')+1;
        const start=Math.max(lineStart,offset-(maxLength-total));
        const text=source.slice(start);
        parts.unshift({node,start,text});total+=text.length;
        if(lineStart>0||total>=maxLength)break;
        node=previousText(node);offset=node?.textContent.length||0;
      }
      return {prefix:parts.map(part=>part.text).join(''),parts};
    }
    function refresh() {
      frame=0;
      if(dead||busy)return;
      if(isComposing()||!editor.isConnected||!editor.isContentEditable){hide();return;}
      const s=getSelection();
      if(!s?.rangeCount||!s.isCollapsed||!editor.contains(s.anchorNode)){hide();return;}
      const caret=s.getRangeAt(0);
      if(caret.startContainer.nodeType !== Node.TEXT_NODE || caret.startContainer.parentElement.closest('[contenteditable="false"]')){hide();return;}
      const refs=catalog(editor);
      if(!refs.length){hide();return;}
      const {prefix,parts}=textBeforeCaret(caret,Math.max(...refs.map(ref=>ref.name.length))+1);
      const matches=refs.filter(ref=>prefix.endsWith(ref.name) && prefix[prefix.length-ref.name.length-1] !== '@');
      matches.sort((a,b)=>b.name.length-a.name.length);
      if(!matches.length){dismissed='';hide();return;}
      const ref=matches[0], duplicates=matches.filter(x=>x.name===ref.name);
      if(duplicates.length>1){hide();onStatus('存在同名参考图，请用 @ 列表选择');return;}
      if(dismissed===prefix){hide();return;}
      const range=caret.cloneRange();let remaining=prefix.length-ref.name.length;
      for(const part of parts){if(remaining<part.text.length){range.setStart(part.node,part.start+remaining);break;}remaining-=part.text.length;}
      candidate={ref,range,prefix};
      root.querySelector('.name').textContent='@ '+ref.name;
      const img=root.querySelector('img');img.hidden=!ref.image;if(ref.image && img.src !== ref.image)img.src=ref.image;
      root.querySelector('.mode').textContent=getKeepText()?'保留原文字':'替换名称';
      if(globalThis.CSS?.highlights && globalThis.Highlight)CSS.highlights.set('miorning-reference-preview',new Highlight(range));
      const r=range.getBoundingClientRect(), box=editor.getBoundingClientRect();
      ghost.style.left=Math.max(8,Math.min(r.right||box.left+8,innerWidth-300))+'px';
      ghost.style.top=Math.max(8,Math.min((r.bottom||box.top+28)+5,innerHeight-44))+'px';
      if(!ghost.matches(':popover-open'))ghost.showPopover();
      onStatus('灰色为待确认引用 · Tab 确认 · Esc 忽略');
    }
    const schedule=()=>{if(!frame&&!dead)frame=requestAnimationFrame(refresh);};
    function accept() {
      if(!candidate||busy||isComposing())return false;
      const current=candidate;
      const ref=catalog(editor).find(x=>x.id===current.ref.id && x.name===current.ref.name && x.button.isConnected);
      if(!ref||current.range.toString()!==ref.name){hide();return false;}
      busy=true;
      const s=getSelection(), end=current.range.cloneRange();end.collapse(false);
      const matchingTokens=()=>[...editor.querySelectorAll('[data-mention-node-id],[data-reference-id]')]
        .filter(token=>(token.dataset.mentionNodeId||token.dataset.referenceId)===ref.id);
      const beforeCount=matchingTokens().length;
      const keepText=getKeepText();
      hide();editor.focus({preventScroll:true});
      s.removeAllRanges();s.addRange(end);
      // Insert through the platform first. Failure must never remove the user's
      // name or call global undo, which could target an unrelated input field.
      const insertedToken=()=>matchingTokens().length>beforeCount;
      const finish=()=>{
        acceptFrame=0;
        if(dead||!editor.isConnected){busy=false;return;}
        const inserted=insertedToken();
        if(!inserted) {
          onStatus('引用未完成，原文字已保留；请用 @ 列表选择');
        } else if(!keepText && document.activeElement===editor && !isComposing() &&
            editor.contains(current.range.startContainer) && editor.contains(current.range.endContainer) && current.range.toString()===ref.name) {
          const caret=s.rangeCount && editor.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
          s.removeAllRanges();s.addRange(current.range);
          const deleted=document.execCommand('delete',false);
          if(caret && editor.contains(caret.startContainer)){s.removeAllRanges();s.addRange(caret);}
          onStatus(deleted && current.range.toString()===''?'已用图片引用替换名称':'已插入图片引用 · 原文字已保留');
        } else onStatus('已插入图片引用 · 保留原文字');
        busy=false;
      };
      try {ref.button.click();} catch (_) {busy=false;onStatus('引用未完成，原文字已保留；请用 @ 列表选择');return true;}
      if(insertedToken())finish();
      else acceptFrame=requestAnimationFrame(finish);
      return true;
    }
    function handleKey(event) {
      if(event.isComposing||isComposing()||event.keyCode===229)return false;
      if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey) {
        refresh();
        if(candidate){event.preventDefault();event.stopImmediatePropagation();return accept();}
      }
      if(event.key==='Escape' && candidate){event.preventDefault();event.stopImmediatePropagation();dismissed=candidate.prefix;hide();return true;}
      return false;
    }
    for(const name of ['input','compositionend','keyup','click','scroll'])listen(editor,name,schedule);
    listen(editor,'compositionstart',hide);
    listen(document,'selectionchange',schedule);
    listen(window,'resize',schedule);
    return {refresh:schedule,handleKey,destroy(){dead=true;life.abort();cancelAnimationFrame(frame);cancelAnimationFrame(acceptFrame);hide();ghost.remove();style.remove();}};
  }
  globalThis.MiorningTextFloatReferences=Object.freeze({create});
})();

/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatEditing) return;

  function create({editor, isComposing = () => false, onChange = () => {}, onStatus = () => {}}) {
    const doc = editor.ownerDocument, win = doc.defaultView;
    const textarea = editor instanceof win.HTMLTextAreaElement;
    const nativeKeys = new WeakSet();
    const paragraphSite = new Set([
      'jimeng.jianying.com', 'xyq.jianying.com',
      'xiaoyunque.com', 'www.xiaoyunque.com'
    ]).has(doc.location?.hostname || '');
    let dead = false;
    const notify = () => queueMicrotask(() => {if (!dead && editor.isConnected) onChange();});
    const selectionRange = () => {
      const selection = win.getSelection();
      if (!selection?.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return null;
      return selection.getRangeAt(0);
    };
    function beforeInput(range) {
      const ranges = range && win.StaticRange ? [new win.StaticRange({startContainer:range.startContainer,startOffset:range.startOffset,endContainer:range.endContainer,endOffset:range.endOffset})] : [];
      // Model-backed editors handle the editing intent themselves. execCommand
      // alone does not consistently deliver beforeinput to their transaction layer.
      const event = new win.InputEvent('beforeinput', {bubbles:true,cancelable:true,composed:true,inputType:'insertLineBreak',data:null,targetRanges:ranges});
      return editor.dispatchEvent(event);
    }
    function textBreak() {
      const old = editor.value, start = editor.selectionStart, end = editor.selectionEnd;
      if (editor.maxLength >= 0 && old.length - (end - start) + 1 > editor.maxLength) {
        onStatus('文字已达到网站的长度限制');return;
      }
      if (!beforeInput(null)) {notify();return;}
      // This still inserts when an earlier listener prevented the key's default
      // action, and retains the browser undo stack on Chromium.
      let inserted = false;
      try {inserted = doc.execCommand('insertText', false, '\n');} catch (_) {}
      if (!inserted && editor.value === old) {
        const next = old.slice(0,start) + '\n' + old.slice(end);
        Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype,'value').set.call(editor,next);
        editor.setSelectionRange(start + 1,start + 1);
        editor.dispatchEvent(new win.InputEvent('input',{bubbles:true,composed:true,inputType:'insertLineBreak',data:null}));
      }
      notify();
    }
    function richBreak() {
      const range = selectionRange();
      if (!range) return;
      if (!beforeInput(range)) {notify();return;}
      if (!editor.isConnected || !selectionRange()) return;
      const plaintext = editor.getAttribute('contenteditable') === 'plaintext-only';
      const saved = new Map();
      if (!plaintext) {
        // A nested span can set pre-wrap independently of the editing host.
        // Normalize only the caret's ancestors for the native operation so it
        // creates a structural BR that survives restoration of the site's CSS.
        for (const node of [range.startContainer,range.endContainer]) {
          for (let el = node.nodeType === 1 ? node : node.parentElement; el && editor.contains(el); el = el.parentElement) {
            if (saved.has(el)) continue;
            saved.set(el,{value:el.style.getPropertyValue('white-space'),priority:el.style.getPropertyPriority('white-space')});
            el.style.setProperty('white-space','normal','important');
            if (el === editor) break;
          }
        }
      }
      try {
        if (!doc.execCommand('insertLineBreak')) onStatus('此网站未接受换行，请重试');
      } catch (_) {onStatus('此网站未接受换行，请重试');}
      finally {
        for (const [el,style] of saved) {
          if (style.value) el.style.setProperty('white-space',style.value,style.priority);
          else el.style.removeProperty('white-space');
        }
      }
      notify();
    }
    function nativeParagraphBreak() {
      // These platforms' paragraph/text schema has no hard-break node. A BR
      // inserted via execCommand is parsed back as a space. Their Shift+Enter
      // keymap dispatches the correct paragraph transaction, retaining history,
      // selection and native references. Never replay plain Enter: it may submit.
      const before = editor.innerHTML;
      const key = new win.KeyboardEvent('keydown', {key:'Enter',code:'Enter',keyCode:13,which:13,
        shiftKey:true,ctrlKey:false,altKey:false,metaKey:false,bubbles:false,cancelable:true,composed:false});
      nativeKeys.add(key);
      try {editor.dispatchEvent(key);}
      finally {nativeKeys.delete(key);}
      // A cancelled key alone does not prove the editor accepted a paragraph.
      // The verified native commands update the model and DOM synchronously.
      if (editor.innerHTML !== before) notify();
      else onStatus('网站未接收换行，请刷新网页后重试');
    }
    function insertLineBreak(event) {
      // The replay must reach the site's keymap once, without recursively
      // becoming another Text Float key. Other physical keys still use us.
      if (event && nativeKeys.has(event)) return false;
      if (dead || !editor.isConnected || editor.disabled || editor.readOnly || isComposing() || event?.isComposing || event?.keyCode === 229 || (event && event.key !== 'Enter')) return false;
      if (event && !editor.contains(event.target)) return false;
      event?.preventDefault();event?.stopImmediatePropagation();
      // Esc is the only confirmation shortcut in this editor. Do not forward
      // the platform's common Ctrl/Meta+Enter generation shortcut.
      if (event?.ctrlKey || event?.metaKey || event?.altKey) return true;
      if (textarea) textBreak();
      else if (paragraphSite && editor.classList.contains('ProseMirror')) nativeParagraphBreak();
      else richBreak();
      return true;
    }
    return Object.freeze({insertLineBreak,destroy(){dead=true;}});
  }
  globalThis.MiorningTextFloatEditing = Object.freeze({create});
})();

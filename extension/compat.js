/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatCompat) return;
  const fieldSelector='textarea,input,select,[contenteditable="true"],[contenteditable="plaintext-only"],[role="textbox"]';
  const actionSelector='button,a[href],summary,[role="button"],[role="link"],[onclick]';
  const editableSelector='textarea,[contenteditable="true"],[contenteditable="plaintext-only"]';
  const boundaryTags=new Set(['HTML','BODY','FORM','MAIN','NAV','HEADER','FOOTER','ASIDE']);
  function hasGuard() { return Boolean(document.getElementById('mpg-floating-dock')); }
  function hasOpenGuardModal() {
    const modal=document.getElementById('mpg-modal-root');
    if (!modal?.isConnected) return false;
    const style=getComputedStyle(modal),rect=modal.getBoundingClientRect();
    return rect.width>0 && rect.height>0 && style.display!=='none' && style.visibility!=='hidden';
  }
  function dedicated(host,editor,ownsReferenceNode) {
    if (!host?.isConnected || !editor.isConnected || !host.contains(editor)) return false;
    if (host===editor) return true;
    if (boundaryTags.has(host.tagName) || host.matches(fieldSelector+','+actionSelector)) return false;
    // A shared form/canvas/control bar must never inherit an Enter exemption.
    if ([...host.querySelectorAll(fieldSelector)].some(node=>node!==editor && !editor.contains(node))) return false;
    return ![...host.querySelectorAll(actionSelector)].some(node=>{
      if (node===editor || editor.contains(node)) return false;
      try { return !ownsReferenceNode?.(node); } catch (_) { return true; }
    });
  }
  function findHost(editor,ownsReferenceNode) {
    if (!editor.id) return editor;
    let host=editor.parentElement;
    for (let depth=0;host && depth<6;depth++,host=host.parentElement) {
      if (boundaryTags.has(host.tagName)) break;
      if (!dedicated(host,editor,ownsReferenceNode)) break;
      if (!host.id) return host;
    }
    return null;
  }
  function acquire(editor,options={}) {
    const previousReferenceActions=new WeakSet();
    const ownsReferenceNode=node=>{
      if (typeof options.ownsReferenceNode==='function' && options.ownsReferenceNode(node)) {
        previousReferenceActions.add(node);return true;
      }
      if (!previousReferenceActions.has(node)) return false;
      // Some frameworks hide their native list in place. Previously verified
      // action rows cannot intercept input while hidden/inert. Showing them
      // again requires current menu-manager ownership, just like a fresh list.
      if (node.closest('[hidden],[inert]')) return true;
      const style=getComputedStyle(node);
      return !node.getClientRects().length || style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse';
    };
    let protectedScope=false,reason='',host=null,id='',originalId=null,observer=null,released=false;
    const result={
      get protected(){return protectedScope;},
      get reason(){return reason;},
      release(){
        if (released) return;
        released=true;observer?.disconnect();protectedScope=false;
        if (host?.id===id) {
          if (originalId===null) host.removeAttribute('id'); else host.setAttribute('id',originalId);
        }
      }
    };
    if (!(editor instanceof Element) || !editor.matches(editableSelector) || !editor.isConnected) {reason='invalid-editor';return result;}
    if (hasOpenGuardModal()) {reason='guard-modal-open';return result;}
    host=findHost(editor,ownsReferenceNode);
    if (!host) {reason='no-dedicated-idless-host';return result;}
    originalId=host.getAttribute('id');
    do {id='mpg-miorning-text-float-editor-'+(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));} while(document.getElementById(id));
    // Prompt Guard v1.8 already exempts its mpg- UI namespace. Reuse that
    // existing convention only on a reversible, single-editor scope. Neither
    // extension state nor site-assigned IDs are changed; the field stays put.
    host.id=id;protectedScope=true;
    observer=new MutationObserver(()=>{
      if (released) return;
      if (protectedScope && host.id!==id) {reason='site-replaced-marker';result.release();return;}
      if (!protectedScope && host.getAttribute('id')!==originalId) {reason='site-replaced-marker';result.release();return;}
      if (!dedicated(host,editor,ownsReferenceNode)) {
        reason='scope-changed';
        if (protectedScope) {
          protectedScope=false;
          if (originalId===null) host.removeAttribute('id'); else host.setAttribute('id',originalId);
        }
        // A native @ menu can temporarily add action rows next to the field.
        // Keep observing the same narrow scope; restore its exemption only once
        // those rows/other fields are gone and the original scope is dedicated.
        return;
      }
      if (!protectedScope) {host.id=id;protectedScope=true;reason='';}
    });
    observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['id','contenteditable','role','type','href','onclick','data-miorning-native-reference-menu','hidden','inert','aria-hidden','style','class']});
    // Detect removal of this specific scope without watching the whole canvas.
    if (host.parentElement) observer.observe(host.parentElement,{childList:true});
    return result;
  }
  globalThis.MiorningTextFloatCompat=Object.freeze({acquire,hasGuard,hasGuardDialog:hasOpenGuardModal,hasOpenGuardModal});
})();


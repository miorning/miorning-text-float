/* Copyright (C) 2026 MIORNING. SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  const EDGES = ['left', 'right', 'top', 'bottom'];
  const TARGET = 44;
  // The supplied 128px artwork is unchanged. Full bounds trim its transparent
  // margin; the smaller crop reveals the check plaque without the cat's head.
  const ART = { size: 64, full: { x: 1.5, y: 4, width: 60.5, height: 54.5 }, plaque: { x: 11, y: 31, width: 42, height: 27.5 } };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const CSS = `
:host{all:initial;display:block;position:fixed;inset:auto;margin:0;padding:0;border:0;width:44px;height:44px;overflow:visible;background:transparent;pointer-events:none;z-index:2147483645;color-scheme:light;font:13px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;--paper:#fffdf9;--ink:#2c2928;--muted:#77716e;--line:#e7dfd8;--soft:#f4eeea;--accent:#c7544b}
:host::backdrop{display:none;pointer-events:none}
:host([data-theme=dark]){color-scheme:dark;--paper:#242628;--ink:#f5efea;--muted:#b8b0aa;--line:#454747;--soft:#323536;--accent:#f2998d}
*,*::before,*::after{box-sizing:border-box}
button{font:inherit;color:inherit}
.launcher{position:absolute;inset:0;display:block;width:100%;height:100%;padding:0;border:0;border-radius:6px;background:transparent;pointer-events:auto;touch-action:none;user-select:none;cursor:grab;outline-offset:-2px}
.launcher:active{cursor:grabbing}.launcher:focus-visible{outline:2px solid var(--accent)}
.art{position:absolute;display:block;width:42px;height:27.5px;left:1px;top:8.25px;overflow:hidden;transition:opacity 130ms ease;pointer-events:none}
.art img{position:absolute;display:block;left:0;top:0;width:64px;height:64px;max-width:none;object-fit:contain;transform:translate(-11px,-31px);pointer-events:none;user-select:none}
:host([data-edge=left]) .art{left:0}:host([data-edge=right]) .art{left:auto;right:0}
:host([data-edge=top]) .art{top:0}:host([data-edge=bottom]) .art{top:auto;bottom:0}
:host([data-expanded=true]) .art{inset:0;width:60.5px;height:54.5px}
:host([data-expanded=true]) .art img{transform:translate(-1.5px,-4px)}
.fallback{display:grid;place-items:center;width:42px;height:27.5px;color:var(--ink);font-size:23px}
.fallback[hidden],img[hidden]{display:none}
:host([data-enabled=false]) .art{opacity:.35}
:host([data-dragging=true]) .art{transition:none}
.menu{position:fixed;inset:auto;margin:0;padding:7px;width:232px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--line);border-radius:13px;background:var(--paper);color:var(--ink);box-shadow:0 12px 40px #1813172b;pointer-events:auto}
.menu[hidden]{display:none!important}
.heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 3px 4px;padding:5px 5px 9px;border-bottom:1px solid var(--line);font-size:12px;font-weight:650}
.heading small{font-size:10px;font-weight:400;color:var(--muted)}
.item{display:flex;align-items:center;gap:9px;min-height:37px;width:100%;padding:8px;border:0;border-radius:7px;background:transparent;text-align:left;cursor:pointer;font-size:12px;line-height:1.3}
.item:hover,.item:focus-visible{background:var(--soft)}.item:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.item:disabled{opacity:.6;cursor:wait}.item svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.item small{margin-left:auto;max-width:100px;overflow:hidden;text-overflow:ellipsis;font-size:10px;color:var(--muted);white-space:nowrap}
.toggle{border-top:1px solid var(--line);border-radius:0 0 7px 7px;margin-top:4px;padding-top:10px;color:var(--accent)}
.foot{margin:6px 8px 3px;color:var(--muted);font-size:10px;line-height:1.4}
.status{position:fixed;inset:auto;margin:0;width:240px;max-width:calc(100vw - 16px);padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);font:12px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px #18131722;pointer-events:none;overflow-wrap:anywhere}
.status[hidden]{display:none!important}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.art{transition:none!important}}
`;
  const paths = {
    shortcut: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 13h1m4 0h1m4 0h1M8 16h8"/>',
    cache: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    resume: '<path d="m8 5 11 7-11 7Z"/>'
  };
  const svg = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  function shortcutLabel(shortcut = {}) {
    const keys = [];
    if (shortcut.ctrl) keys.push('Ctrl');
    if (shortcut.alt) keys.push('Alt');
    if (shortcut.shift) keys.push('Shift');
    if (shortcut.meta) keys.push('Meta');
    keys.push(String(shortcut.code || 'KeyK').replace(/^Key|^Digit/, '').replace(/^Arrow/, ''));
    return keys.join('+');
  }
  function create({ state: initialState = {}, logoUrl, onToggle, onShortcut, onCache, onSettings, onPosition } = {}) {
    const doc = document, view = doc.defaultView, abort = new AbortController();
    const listen = (target, name, callback, options = {}) => target?.addEventListener(name, callback, { ...options, signal: abort.signal });
    const make = (tag, className, text) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const host = make('div', 'miorning-text-float-dock');
    host.setAttribute('data-miorning-ui', 'dock');
    // These host properties also protect against broad page rules such as div{position:relative!important}.
    const hostStyle = { all: 'initial', display: 'block', position: 'fixed', inset: 'auto', margin: '0', padding: '0', border: '0', width: TARGET + 'px', height: TARGET + 'px', overflow: 'visible', background: 'transparent', 'pointer-events': 'none', 'z-index': '2147483645' };
    for (const [key, value] of Object.entries(hostStyle)) host.style.setProperty(key, value, 'important');
    const root = host.attachShadow({ mode: 'open' }), style = make('style'); style.textContent = CSS;
    const launcher = make('button', 'launcher'); launcher.type = 'button';
    launcher.setAttribute('aria-haspopup', 'menu'); launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'miorning-dock-menu'); launcher.setAttribute('aria-describedby', 'miorning-dock-help');
    const help = make('span', 'sr', '点击打开设置。拖动可吸附四周。方向键移动，Alt 加方向键切换边缘。'); help.id = 'miorning-dock-help';
    const art = make('span', 'art'), picture = make('img'), fallback = make('span', 'fallback', '喵');
    picture.alt = ''; picture.draggable = false; fallback.hidden = true; fallback.setAttribute('aria-hidden', 'true');
    if (logoUrl) picture.src = logoUrl; else { picture.hidden = true; fallback.hidden = false; }
    listen(picture, 'error', () => { picture.hidden = true; fallback.hidden = false; });
    art.append(picture, fallback); launcher.append(art);
    const menu = make('div', 'menu'); menu.id = 'miorning-dock-menu'; menu.hidden = true;
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '喵咛文本窗设置');
    const heading = make('div', 'heading', '喵咛文本窗'), stateLabel = make('small'); heading.append(stateLabel); menu.append(heading);
    const foot = make('p', 'foot', '暂停 / 开启会同步到所有网页。');
    const status = make('div', 'status'); status.hidden = true; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    root.append(style, launcher, help, menu, status); (doc.body || doc.documentElement).append(host);
    let state = { enabled: true, shortcut: { code: 'KeyK', alt: true }, dock: { edge: 'right', ratio: .5 }, theme: 'light' };
    let opened = false, hovered = false, keyboardFocused = false, destroyed = false, pending = false, gesture = null, suppressedUntil = 0, revision = 0, controlRevision = -1, statusTimer = 0, frame = 0;
    const buttons = new Map();
    function promote() {
      try {
        if (!host.hasAttribute('popover')) host.setAttribute('popover', 'manual');
        if (host.matches(':popover-open')) host.hidePopover();
        host.showPopover();
      } catch (_) { /* Older browsers retain the fixed, small hit area. */ }
    }
    function viewport() {
      const vv = view.visualViewport;
      return { width: Math.max(1, vv?.width || view.innerWidth), height: Math.max(1, vv?.height || view.innerHeight), x: vv?.offsetLeft || 0, y: vv?.offsetTop || 0 };
    }
    function dimensions() {
      const expanded = opened || hovered || keyboardFocused || Boolean(gesture?.moved);
      return { expanded, width: expanded ? ART.full.width : TARGET, height: expanded ? ART.full.height : TARGET };
    }
    function dockPoint() {
      const v = viewport(), size = dimensions(), edge = state.dock.edge, ratio = state.dock.ratio;
      return { x: v.x + (edge === 'left' ? 0 : edge === 'right' ? Math.max(0, v.width - size.width) : ratio * Math.max(0, v.width - size.width)), y: v.y + (edge === 'top' ? 0 : edge === 'bottom' ? Math.max(0, v.height - size.height) : ratio * Math.max(0, v.height - size.height)) };
    }
    function place(node, width, height, gap = 8) {
      const v = viewport(), box = host.getBoundingClientRect();
      const edge = state.dock.edge, side = edge === 'left' || edge === 'right';
      let x = side ? (edge === 'left' ? box.right + gap : box.left - width - gap) : box.left + (box.width - width) / 2;
      let y = side ? box.top + (box.height - height) / 2 : (edge === 'top' ? box.bottom + gap : box.top - height - gap);
      x = clamp(x, v.x + 8, Math.max(v.x + 8, v.x + v.width - width - 8));
      y = clamp(y, v.y + 8, Math.max(v.y + 8, v.y + v.height - height - 8));
      node.style.left = x + 'px'; node.style.top = y + 'px';
    }
    function layout() {
      frame = 0;
      if (destroyed) return;
      const point = gesture?.moved ? gesture.point : dockPoint(), v = viewport(), size = dimensions();
      host.dataset.expanded = String(size.expanded);
      host.style.setProperty('width', size.width + 'px', 'important'); host.style.setProperty('height', size.height + 'px', 'important');
      host.style.setProperty('left', point.x + 'px', 'important'); host.style.setProperty('top', point.y + 'px', 'important');
      host.dataset.edge = state.dock.edge;
      if (opened) {
        menu.style.width = Math.max(1, Math.min(232, v.width - 16)) + 'px';
        menu.style.maxHeight = Math.max(1, v.height - 16) + 'px';
        place(menu, menu.getBoundingClientRect().width, menu.getBoundingClientRect().height);
      }
      if (!status.hidden) {
        status.style.width = Math.max(1, Math.min(240, v.width - 16)) + 'px';
        place(status, status.getBoundingClientRect().width, status.getBoundingClientRect().height);
      }
    }
    function scheduleLayout() { if (!frame && !destroyed) frame = view.requestAnimationFrame(layout); }
    function notify(message) {
      if (destroyed) return;
      status.textContent = message; status.hidden = false; view.clearTimeout(statusTimer); layout();
      statusTimer = view.setTimeout(() => { status.hidden = true; }, 4200);
    }
    async function invoke(callback, ...args) {
      try { return await callback?.(...args); }
      catch (error) { notify(error?.message || '操作未完成，请稍后重试。'); throw error; }
    }
    function closeMenu(restoreFocus = false) {
      if (destroyed) return;
      opened = false; menu.hidden = true; launcher.setAttribute('aria-expanded', 'false');
      if (restoreFocus) launcher.focus({ preventScroll: true });
      layout();
    }
    function openMenu(focusFirst = false) {
      if (destroyed) return;
      promote(); opened = true; menu.hidden = false; status.hidden = true; launcher.setAttribute('aria-expanded', 'true'); layout();
      if (focusFirst) buttons.values().next().value?.focus({ preventScroll: true });
    }
    function action(name, icon, label, callback) {
      const button = make('button', 'item' + (name === 'toggle' ? ' toggle' : '')); button.type = 'button';
      button.dataset.action = name; button.setAttribute('role', 'menuitem');
      button.innerHTML = svg(icon); button.append(make('span', '', label));
      listen(button, 'click', event => { event.stopPropagation(); callback(); });
      buttons.set(name, button); menu.append(button); return button;
    }
    const shortcut = action('shortcut', 'shortcut', '快捷键设置', () => { closeMenu(); void invoke(onShortcut).catch(() => {}); });
    const shortcutHint = make('small'); shortcut.append(shortcutHint);
    action('cache', 'cache', '查看 / 清空缓存', () => { closeMenu(); void invoke(onCache).catch(() => {}); });
    if (onSettings) action('settings', 'settings', '全部设置', () => { closeMenu(); void invoke(onSettings).catch(() => {}); });
    const toggle = action('toggle', 'pause', '暂停所有网页', async () => {
      if (pending) return;
      const nextEnabled = !state.enabled, startingRevision = revision;
      pending = true; toggle.disabled = true;
      try {
        const result = await invoke(onToggle, nextEnabled);
        if (destroyed) return;
        if (result && typeof result.enabled === 'boolean') update(result);
        else if (startingRevision === revision) update({ enabled: nextEnabled });
        closeMenu();
      } catch (_) { /* Keep current state on failure; notify contains the reason. */ }
      finally { pending = false; if (!destroyed) toggle.disabled = false; }
    });
    menu.append(foot);
    function update(next = {}) {
      if (destroyed) return;
      // A command reply may arrive after a newer cross-tab storage broadcast.
      // Ignore only stale control snapshots; theme-only local updates still apply.
      if (Number.isSafeInteger(next.revision)) {
        if (next.revision < controlRevision) return;
        controlRevision = next.revision;
      }
      revision++;
      if (typeof next.enabled === 'boolean') state.enabled = next.enabled;
      if (next.shortcut && typeof next.shortcut === 'object') state.shortcut = { ...next.shortcut };
      if (next.theme === 'light' || next.theme === 'dark') state.theme = next.theme;
      if (next.dock && !gesture) state.dock = { edge: EDGES.includes(next.dock.edge) ? next.dock.edge : state.dock.edge, ratio: Number.isFinite(next.dock.ratio) ? clamp(next.dock.ratio, 0, 1) : state.dock.ratio };
      host.dataset.enabled = String(state.enabled); host.dataset.theme = state.theme;
      stateLabel.textContent = state.enabled ? '所有网页 · 开启' : '所有网页 · 暂停';
      launcher.title = state.enabled ? '喵咛文本窗 · 点击设置，拖动贴边' : '喵咛文本窗已暂停 · 点击菜单恢复所有网页';
      launcher.setAttribute('aria-label', state.enabled ? '打开喵咛文本窗设置' : '喵咛文本窗已暂停，打开设置恢复');
      shortcutHint.textContent = shortcutLabel(state.shortcut); shortcutHint.title = shortcutHint.textContent;
      toggle.innerHTML = svg(state.enabled ? 'pause' : 'resume'); toggle.append(make('span', '', state.enabled ? '暂停所有网页' : '开启所有网页'));
      layout();
    }
    function persistPosition() { void invoke(onPosition, { ...state.dock }).catch(() => {}); }
    function nearestEdge(point, size = dimensions()) {
      const v = viewport(), x = point.x - v.x + size.width / 2, y = point.y - v.y + size.height / 2;
      const distances = { left: x, right: v.width - x, top: y, bottom: v.height - y };
      const edge = EDGES.reduce((best, current) => distances[current] < distances[best] ? current : best, state.dock.edge);
      return { edge, ratio: clamp((edge === 'left' || edge === 'right') ? (point.y - v.y) / Math.max(1, v.height - size.height) : (point.x - v.x) / Math.max(1, v.width - size.width), 0, 1) };
    }
    listen(launcher, 'pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true; layout(); } });
    listen(launcher, 'pointerleave', () => { hovered = false; layout(); });
    listen(launcher, 'focus', () => { keyboardFocused = launcher.matches(':focus-visible'); layout(); });
    listen(launcher, 'blur', () => { keyboardFocused = false; layout(); });
    listen(launcher, 'pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;
      const box = host.getBoundingClientRect();
      gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top, moved: false, point: { x: box.left, y: box.top } };
      try { launcher.setPointerCapture(event.pointerId); } catch (_) {}
    });
    listen(launcher, 'pointermove', event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
      event.preventDefault(); closeMenu(); gesture.moved = true; host.dataset.dragging = 'true';
      const v = viewport(), size = dimensions(); gesture.point = { x: clamp(event.clientX - gesture.offsetX, v.x, v.x + Math.max(0, v.width - size.width)), y: clamp(event.clientY - gesture.offsetY, v.y, v.y + Math.max(0, v.height - size.height)) };
      scheduleLayout();
    });
    function endGesture(event, cancelled = false) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const previous = gesture, size = dimensions(); gesture = null; delete host.dataset.dragging;
      if (previous.moved) {
        suppressedUntil = performance.now() + 450;
        if (!cancelled) { state.dock = nearestEdge(previous.point, size); persistPosition(); }
      }
      try { if (launcher.hasPointerCapture(previous.id)) launcher.releasePointerCapture(previous.id); } catch (_) {}
      layout();
    }
    listen(launcher, 'pointerup', event => endGesture(event));
    listen(launcher, 'pointercancel', event => endGesture(event, true));
    listen(launcher, 'lostpointercapture', event => endGesture(event, true));
    listen(launcher, 'click', event => {
      event.preventDefault(); event.stopPropagation();
      if (performance.now() < suppressedUntil && event.detail > 0) return;
      if (opened) closeMenu(); else openMenu(event.detail === 0);
    });
    listen(launcher, 'keydown', event => {
      if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); closeMenu(true); return; }
      const edgeMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' };
      if (!edgeMap[event.key] && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault(); event.stopPropagation();
      if (event.altKey && edgeMap[event.key]) state.dock.edge = edgeMap[event.key];
      else if (event.key === 'Home' || event.key === 'End') state.dock.ratio = event.key === 'Home' ? 0 : 1;
      else state.dock.ratio = clamp(state.dock.ratio + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -.04 : .04), 0, 1);
      layout(); persistPosition();
    });
    listen(menu, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); return; }
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const choices = [...buttons.values()].filter(button => !button.disabled), index = choices.indexOf(root.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + choices.length) % choices.length;
      choices[next]?.focus({ preventScroll: true });
    });
    listen(doc, 'pointerdown', event => { if (opened && !event.composedPath().includes(host)) closeMenu(); }, { capture: true });
    listen(doc, 'focusin', event => { if (opened && !event.composedPath().includes(host)) closeMenu(); }, { capture: true });
    listen(view, 'resize', scheduleLayout, { passive: true });
    listen(view.visualViewport, 'resize', scheduleLayout, { passive: true });
    listen(view.visualViewport, 'scroll', scheduleLayout, { passive: true });
    update(initialState); promote(); layout();
    return {
      element: host, update, openMenu, closeMenu,
      destroy() {
        if (destroyed) return;
        destroyed = true; abort.abort(); view.cancelAnimationFrame(frame); view.clearTimeout(statusTimer); gesture = null;
        try { if (host.matches(':popover-open')) host.hidePopover(); } catch (_) {}
        host.remove();
      }
    };
  }
  globalThis.MiorningTextFloatDock = Object.freeze({ create });
})();

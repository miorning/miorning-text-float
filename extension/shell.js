(() => {
  'use strict';
  if (globalThis.MiorningTextFloatShell) return;

  const HEADER = 114, FOOTER = 32, PADDING = 16, GAP = 8;
  const STYLE = `
    :host{all:initial;color-scheme:light;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}
    .window{position:relative;display:flex;flex-direction:column;width:100%;height:100%;border:1px solid #373e40;border-radius:12px;background:#faf8f2;color:#252e30;box-shadow:0 16px 52px #091c2438;overflow:visible}
    .top{display:flex;align-items:center;flex:0 0 53px;height:53px;gap:12px;padding:0 14px;border-radius:11px 11px 0 0;background:#262e30;color:#f4f4f0;user-select:none}
    .brand{display:flex;align-items:center;gap:8px;flex-shrink:0;color:inherit;text-decoration:none;border-radius:4px}.logo{display:block;width:32px;height:32px;object-fit:contain;border-radius:6px}.logo[hidden]{display:none}.title{font-size:15px;font-weight:650;white-space:nowrap;letter-spacing:.2px}
    .drag{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;min-width:16px;height:100%;cursor:grab;touch-action:none;border-radius:5px}
    .drag[data-dragging]{cursor:grabbing}.hint{font-size:11px;color:#bdc8c7;white-space:nowrap}.grip{font-size:16px;color:#9aa9a6;letter-spacing:1px}
    .font{display:flex;align-items:center;gap:5px;font-size:11px;color:#c2cfcc;white-space:nowrap}
    .font input{width:48px;height:28px;padding:3px 2px 3px 5px;border:1px solid #5e6b6b;border-radius:5px;background:#394345;color:#fff;font-size:12px;text-align:center;appearance:textfield}
    .font input::-webkit-inner-spin-button{appearance:none}.step{width:26px;height:28px;border:1px solid #53615f;border-radius:5px;background:transparent;color:#f4f4f0;font-size:16px;padding:0}
    .step:disabled{opacity:.35;cursor:default}
    .keep{display:flex;align-items:center;gap:5px;white-space:nowrap;color:#d4dfda;font-size:11px;cursor:pointer}.keep input{width:13px;height:13px;margin:0;accent-color:#9ddbc6;cursor:pointer}
    .confirm{display:flex;align-items:center;justify-content:center;gap:9px;height:32px;min-width:52px;padding:0 11px;border:0;border-radius:6px;background:#d76c5b;color:#281611;font-size:12px;font-weight:700;white-space:nowrap}
    .confirm-label{min-width:36px;text-align:center}
    .settings-page{height:30px;flex-shrink:0;padding:0 5px;border:0;border-radius:4px;color:#d4dfda;background:transparent;font-size:11px;white-space:nowrap}
    .shortcut{font-weight:500;font-size:10px;opacity:.85}
    .versions{flex:0 0 60px;height:60px;padding:5px 14px 3px;border-bottom:1px solid #dedfd5;background:#efeee7;user-select:none}
    .version-top{display:flex;align-items:center;gap:8px;height:33px}.version-scroll{flex:1;min-width:0;height:33px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:#9faaa2 #e5e7dd;overscroll-behavior:contain}
    .version-track{position:relative;height:26px;min-width:100%}.version-tab{position:absolute;top:0;height:25px;width:130px;padding:0 8px;border:1px solid transparent;border-radius:5px;background:transparent;color:#59655f;font-size:11px;line-height:23px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
    .version-tab[aria-selected=true]{background:#fffdf7;border-color:#bbc7bd;color:#273f33;font-weight:650}.version-tab[data-draft]{border-style:dashed}.version-tab[data-draft][aria-selected=true]{border-color:#a9b9ae}
    .delete-version{flex-shrink:0;height:25px;padding:0 6px;border:0;background:transparent;color:#725d55;font-size:11px;border-radius:4px}
    .version-navigation{display:flex;align-items:center;gap:8px;height:18px}.version-range{display:block;flex:1;min-width:0;margin:0;height:16px;accent-color:#627f6b;cursor:ew-resize}.version-count{flex-shrink:0;min-width:70px;text-align:right;font-size:10px;color:#65716b;font-variant-numeric:tabular-nums}
    .version-edge{height:18px;width:21px;padding:0;border:0;border-radius:3px;color:#586b5f;background:transparent;font-size:12px}
    .body{position:relative;flex:1;min-height:0;padding:16px;cursor:text}.footer{flex:0 0 31px;height:31px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 16px;border-top:1px solid #e5e5dc;color:#64716b;font-size:11px;user-select:none;overflow:hidden;border-radius:0 0 11px 11px}
    .status{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.instructions{white-space:nowrap;color:#7c8580}
    button:focus-visible,input:focus-visible,a:focus-visible,.drag:focus-visible{outline:2px solid #72ceb1;outline-offset:2px}.version-tab:focus-visible{outline-offset:-2px}
    .handle{position:absolute;z-index:2;border:0;background:transparent;padding:0;touch-action:none;border-radius:3px}
    .handle:focus-visible{outline:2px solid #13856a;outline-offset:-2px;background:#9ddbc655}
    .n,.s{height:8px;left:14px;right:14px;cursor:ns-resize}.n{top:-4px}.s{bottom:-4px}
    .e,.w{width:8px;top:14px;bottom:14px;cursor:ew-resize}.e{right:-4px}.w{left:-4px}
    .ne,.nw,.se,.sw{width:14px;height:14px}.ne{top:-5px;right:-5px;cursor:nesw-resize}.nw{top:-5px;left:-5px;cursor:nwse-resize}.se{bottom:-5px;right:-5px;cursor:nwse-resize}.sw{bottom:-5px;left:-5px;cursor:nesw-resize}
    .se:after{content:"";position:absolute;width:6px;height:6px;right:5px;bottom:5px;border-right:1px solid #849b91;border-bottom:1px solid #849b91}
    @container (max-width:710px){.hint,.shortcut{display:none}.top{gap:8px}.font input{width:36px}.step{width:23px}}
    @container (max-width:590px){.top{display:grid;grid-template-columns:auto 1fr auto auto;grid-template-rows:40px 36px;flex-basis:86px;height:86px;gap:0 10px;padding:4px 12px 6px}.brand{grid-column:1;grid-row:1}.drag{grid-column:2;grid-row:1}.settings-page{grid-column:3;grid-row:1}.confirm{grid-column:4;grid-row:1}.font{grid-column:1 / 3;grid-row:2}.keep{grid-column:3 / 5;grid-row:2;justify-self:end}.instructions{display:none}.title{font-size:14px}.logo{height:29px;width:29px}.versions{padding-inline:12px}}
    @media(hover:hover) and (pointer:fine){.brand:hover .title{text-decoration:underline;text-underline-offset:3px}.step:hover:not(:disabled),.settings-page:hover{background:#46514f}.confirm:hover:not(:disabled){background:#e48471}.version-tab:hover:not(:disabled){background:#e2e6dc}.delete-version:hover:not(:disabled){background:#ecdcd3;color:#853e30}.version-edge:hover:not(:disabled){background:#dbe2d8}}
    button:active:not(:disabled){filter:brightness(.94)}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `;

  function create({ onRect, onFont, onClose, onFocus, onKeepText, onSettings, onSettingsPage, onSelectVersion, onDeleteVersion, settings = {}, logoUrl } = {}) {
    const lifetime = new AbortController();
    const host = document.createElement('div');
    host.className = 'miorning-text-float-shell';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', '喵咛文本窗');
    host.setAttribute('aria-modal', 'false');
    host.style.cssText = 'position:fixed!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;z-index:2147483646!important;container-type:inline-size!important;box-sizing:border-box!important;';
    const canPopover = typeof host.showPopover === 'function';
    if (canPopover) host.setAttribute('popover', 'manual');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><section class="window"><header class="top"><a class="brand" href="https://space.bilibili.com/353186187" target="_blank" rel="noopener noreferrer" title="打开 MIORNING 的 B站主页"><img class="logo" alt="" width="32" height="32"><span class="title">喵咛文本窗</span></a><div class="drag" tabindex="0" role="button" aria-label="移动文本窗，使用方向键，Shift 加方向键微调"><span class="grip" aria-hidden="true">⠿</span><span class="hint">拖动</span></div><div class="font"><span>字号</span><button class="step minus" type="button" aria-label="减小字体">−</button><input aria-label="字体大小" type="number" min="14" max="32" step="1" value="18"><button class="step plus" type="button" aria-label="增大字体">+</button></div><label class="keep"><input type="checkbox" aria-label="保留原文字">保留原文字</label><button class="settings-page" type="button" aria-label="设置支持的网站" title="设置支持的网站">设置</button><button class="confirm" type="button"><span class="confirm-label">确认</span><span class="shortcut">Ctrl + Enter</span></button></header><div class="versions" aria-label="文本版本"><div class="version-top"><div class="version-scroll"><div class="version-track" role="tablist" aria-label="已保存的文本版本"></div></div><button class="delete-version" type="button" aria-label="删除当前版本" disabled>删除此版</button></div><div class="version-navigation"><button class="version-edge first-version" type="button" aria-label="选择最早版本" title="最早版本" disabled>Ⅰ‹</button><input class="version-range" type="range" min="0" max="0" step="1" value="0" aria-label="拖动选择文本版本" disabled><button class="version-edge last-version" type="button" aria-label="选择最新版本" title="最新版本" disabled>›Ⅰ</button><span class="version-count">暂无版本</span></div></div><div class="body" aria-hidden="true"></div><footer class="footer"><span class="status" role="status" aria-live="polite">直接编辑原文本</span><span class="instructions">Enter 换行 · 拖动边框调整大小</span></footer></section>`;
    const $ = selector => root.querySelector(selector);
    const dragHandle = $('.drag'), fontInput = $('.font input');
    const resolvedLogo = logoUrl || globalThis.chrome?.runtime?.getURL?.('icons/48.png');
    if (resolvedLogo) $('.logo').src = resolvedLogo;
    else $('.logo').hidden = true;
    const directions = { n: '上', ne: '右上', e: '右', se: '右下', s: '下', sw: '左下', w: '左', nw: '左上' };
    for (const [direction, title] of Object.entries(directions)) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = `handle ${direction}`;
      handle.dataset.direction = direction;
      handle.setAttribute('aria-label', `调整${title}边框，使用方向键，Shift 加方向键微调`);
      $('.window').append(handle);
    }

    let dead = false, frame = 0, gesture = null, fontSize = 18, busy = false;
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
    const bounds = () => {
      const v = viewport();
      const gapX = Math.min(GAP, v.width / 8), gapY = Math.min(GAP, v.height / 8);
      return { left: gapX, top: gapY, right: v.width - gapX, bottom: v.height - gapY,
        minWidth: Math.min(360, v.width - gapX * 2), minHeight: Math.min(240, v.height - gapY * 2) };
    };
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const v = viewport();
    const numberOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const preferences = { width: Math.max(360, numberOr(settings.width, 760)), height: Math.max(240, numberOr(settings.height, 520)), fontSize: clamp(Math.round(numberOr(settings.fontSize, 18)), 14, 32), keepText: settings.keepText === true };
    preferences.left = numberOr(settings.left, Math.max(GAP, (v.width - preferences.width) / 2));
    preferences.top = numberOr(settings.top, Math.max(GAP, (v.height - preferences.height) / 2));
    let rect = { left: preferences.left, top: preferences.top, width: preferences.width, height: preferences.height };
    fontSize = preferences.fontSize;
    fontInput.value = String(fontSize);
    $('.minus').disabled = fontSize === 14;
    $('.plus').disabled = fontSize === 32;
    $('.keep input').checked = preferences.keepText;
    function remember(patch) { Object.assign(preferences, patch); onSettings?.({ ...preferences }); }
    function constrain(value) {
      const b = bounds();
      const width = clamp(value.width, b.minWidth, b.right - b.left);
      const height = clamp(value.height, b.minHeight, b.bottom - b.top);
      return { left: clamp(value.left, b.left, b.right - width), top: clamp(value.top, b.top, b.bottom - height), width, height };
    }
    const report = () => {
      const body = $('.body').getBoundingClientRect();
      return { ...rect, editor: body.width > 0 ? {
        left: body.left + PADDING, top: body.top + PADDING,
        width: Math.max(1, body.width - PADDING * 2), height: Math.max(1, body.height - PADDING * 2)
      } : { left: rect.left + PADDING, top: rect.top + HEADER + PADDING,
        width: Math.max(1, rect.width - PADDING * 2), height: Math.max(1, rect.height - HEADER - FOOTER - PADDING * 2) } };
    };
    function render(notify = true) {
      frame = 0;
      if (dead) return;
      for (const key of ['left', 'top', 'width', 'height']) host.style.setProperty(key, `${rect[key]}px`, 'important');
      if (notify) onRect?.(report());
    }
    const schedule = () => { if (!frame && !dead) frame = requestAnimationFrame(() => render()); };
    function resizeFrom(start, direction, dx, dy) {
      const b = bounds();
      let left = start.left, right = start.left + start.width, top = start.top, bottom = start.top + start.height;
      if (direction.includes('w')) left = clamp(start.left + dx, b.left, right - b.minWidth);
      if (direction.includes('e')) right = clamp(start.left + start.width + dx, left + b.minWidth, b.right);
      if (direction.includes('n')) top = clamp(start.top + dy, b.top, bottom - b.minHeight);
      if (direction.includes('s')) bottom = clamp(start.top + start.height + dy, top + b.minHeight, b.bottom);
      return { left, top, width: right - left, height: bottom - top };
    }
    const listen = (element, event, handler, extra = {}) => element.addEventListener(event, handler, { ...extra, signal: lifetime.signal });
    function begin(event, direction) {
      if (event.button !== 0 || gesture) return;
      event.preventDefault();
      event.stopPropagation();
      gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: { ...rect }, direction, target: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (!direction) dragHandle.setAttribute('data-dragging', '');
    }
    function finish(event) {
      if (!gesture || (event.pointerId != null && event.pointerId !== gesture.pointerId)) return;
      const previous = gesture;
      gesture = null;
      dragHandle.removeAttribute('data-dragging');
      if (previous.target.hasPointerCapture?.(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId);
      if (Object.keys(rect).some(key => rect[key] !== previous.rect[key])) {
        remember(previous.direction ? { ...rect } : { left: rect.left, top: rect.top });
      }
      schedule();
    }
    function move(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      rect = gesture.direction ? resizeFrom(gesture.rect, gesture.direction, dx, dy) : constrain({ ...gesture.rect, left: gesture.rect.left + dx, top: gesture.rect.top + dy });
      schedule();
    }
    function keyboard(event, direction) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const step = event.shiftKey ? 1 : 8;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      rect = direction ? resizeFrom(rect, direction, dx, dy) : constrain({ ...rect, left: rect.left + dx, top: rect.top + dy });
      remember(direction ? { ...rect } : { left: rect.left, top: rect.top });
      schedule();
    }
    for (const handle of [dragHandle, ...root.querySelectorAll('.handle')]) {
      const direction = handle.dataset.direction || '';
      listen(handle, 'pointerdown', event => begin(event, direction));
      listen(handle, 'pointermove', move);
      listen(handle, 'pointerup', finish);
      listen(handle, 'pointercancel', finish);
      listen(handle, 'lostpointercapture', finish);
      listen(handle, 'keydown', event => keyboard(event, direction));
    }
    function changeFont(value) {
      const numeric = Number(value);
      fontSize = clamp(Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 18, 14, 32);
      fontInput.value = String(fontSize);
      $('.minus').disabled = fontSize === 14;
      $('.plus').disabled = fontSize === 32;
      remember({ fontSize });
      onFont?.(fontSize);
      onFocus?.();
    }
    listen($('.minus'), 'click', () => changeFont(fontSize - 1));
    listen($('.plus'), 'click', () => changeFont(fontSize + 1));
    // Keep the native editor selection when using the quick +/- buttons.
    for (const button of root.querySelectorAll('.step')) listen(button, 'pointerdown', event => event.preventDefault());
    listen(fontInput, 'change', () => changeFont(fontInput.value));
    listen(fontInput, 'keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); changeFont(fontInput.value); }
    });
    listen($('.confirm'), 'click', () => { if (!busy) onClose?.(); });
    listen($('.settings-page'), 'click', () => onSettingsPage?.());
    // Preserve the native editor's focus/selection when toggling with a pointer.
    listen($('.keep'), 'pointerdown', event => event.preventDefault());
    listen($('.keep input'), 'change', event => { remember({ keepText: event.target.checked }); onKeepText?.(event.target.checked); });
    listen($('.body'), 'pointerdown', event => { event.preventDefault(); onFocus?.(); });
    listen(window, 'resize', () => { if (gesture) finish({}); rect = constrain({ left: preferences.left, top: preferences.top, width: preferences.width, height: preferences.height }); schedule(); renderVersionTabs(); });
    listen(window, 'blur', () => { if (gesture) finish({}); });
    // Block canvas gestures originating on the shell, without affecting native editor events.
    for (const event of ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel']) listen(host, event, e => e.stopPropagation());

    // Keep every version selectable while mounting only the nearby buttons. The
    // full-width track provides a real horizontal scrollbar even with thousands.
    const VERSION_WIDTH = 138, VERSION_WINDOW = 30;
    const versionTrack = $('.version-track'), versionScroll = $('.version-scroll'), versionRange = $('.version-range');
    let versionItems = [], selectedId = null, selectedIndex = 0, versionFrame = 0;
    function versionLabel(item) {
      return `版本 ${item.number}${item.id === '__new__' || item.status === 'draft' ? ' · 编辑中' : ''}`;
    }
    function showVersionPosition(index) {
      const item = versionItems[index];
      $('.version-count').textContent = item ? `${index + 1} / ${versionItems.length} 版` : '暂无版本';
      versionRange.setAttribute('aria-valuetext', item ? versionLabel(item) : '暂无版本');
      versionRange.title = item ? versionLabel(item) : '暂无版本';
    }
    function syncVersionControls() {
      versionRange.max = String(Math.max(0, versionItems.length - 1));
      versionRange.value = String(selectedIndex);
      versionRange.disabled = busy || versionItems.length < 2;
      $('.first-version').disabled = busy || !versionItems.length || selectedIndex === 0;
      $('.last-version').disabled = busy || !versionItems.length || selectedIndex === versionItems.length - 1;
      const current = versionItems[selectedIndex];
      $('.delete-version').disabled = busy || !current || current.id === '__new__';
      $('.delete-version').title = current && current.id !== '__new__' ? `删除版本 ${current.number}` : '确认保存后可删除此版本';
      showVersionPosition(selectedIndex);
    }
    function renderVersionTabs() {
      versionFrame = 0;
      if (dead) return;
      versionTrack.style.width = `${versionItems.length * VERSION_WIDTH}px`;
      const firstVisible = Math.floor(versionScroll.scrollLeft / VERSION_WIDTH);
      const start = Math.max(0, firstVisible - 3);
      const end = Math.min(versionItems.length, start + VERSION_WINDOW);
      const wanted = new Set();
      for (let i = start; i < end; i++) {
        const item = versionItems[i], id = String(item.id);
        wanted.add(id);
        let button = Array.from(versionTrack.children).find(node => node.dataset.versionId === id);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'version-tab';
          button.dataset.versionId = id;
          button.setAttribute('role', 'tab');
          versionTrack.append(button);
        }
        button.style.left = `${i * VERSION_WIDTH}px`;
        button.textContent = versionLabel(item);
        button.title = `${versionLabel(item)}${item.parentId ? ' · 基于旧版编辑' : ''}${item.id !== '__new__' && item.status !== 'draft' ? ' · 修改会新建版本，原版保持不变' : ''}`;
        button.dataset.index = String(i);
        button.setAttribute('aria-selected', String(id === String(selectedId)));
        button.setAttribute('aria-posinset', String(i + 1));
        button.setAttribute('aria-setsize', String(versionItems.length));
        button.tabIndex = id === String(selectedId) ? 0 : -1;
        button.toggleAttribute('data-draft', item.id === '__new__' || item.status === 'draft');
        button.disabled = busy;
      }
      for (const button of Array.from(versionTrack.children)) if (!wanted.has(button.dataset.versionId)) button.remove();
    }
    function revealVersion(index) {
      const left = index * VERSION_WIDTH, right = left + VERSION_WIDTH;
      if (left < versionScroll.scrollLeft) versionScroll.scrollLeft = left;
      else if (right > versionScroll.scrollLeft + versionScroll.clientWidth) versionScroll.scrollLeft = Math.max(0, right - versionScroll.clientWidth);
      renderVersionTabs();
    }
    function selectVersion(index, keyboardFocus = false) {
      if (busy || !versionItems.length) return;
      const next = clamp(Math.round(index), 0, versionItems.length - 1), item = versionItems[next];
      if (!item) return;
      revealVersion(next);
      if (keyboardFocus) versionTrack.querySelector(`[data-index="${next}"]`)?.focus({ preventScroll: true });
      if (String(item.id) !== String(selectedId)) onSelectVersion?.(item.id);
      else syncVersionControls();
    }
    function setBusy(value) {
      if (dead) return;
      busy = Boolean(value);
      host.setAttribute('aria-busy', String(busy));
      $('.confirm').disabled = busy;
      $('.confirm-label').textContent = busy ? '保存中' : '确认';
      syncVersionControls();
      renderVersionTabs();
    }
    function setVersions({ versions = [], selectedId: nextId, draftNumber, dirty = false, busy: nextBusy } = {}) {
      if (dead) return;
      const priorId = selectedId;
      versionItems = versions.slice();
      if (Number.isFinite(draftNumber) && !versionItems.some(item => item.id === '__new__' || item.number === draftNumber)) {
        versionItems.push({ id: '__new__', number: draftNumber, status: 'draft', dirty });
      }
      selectedId = nextId ?? versionItems.at(-1)?.id ?? null;
      selectedIndex = Math.max(0, versionItems.findIndex(item => String(item.id) === String(selectedId)));
      if (versionItems.length && !versionItems.some(item => String(item.id) === String(selectedId))) selectedId = versionItems[selectedIndex].id;
      if (nextBusy !== undefined) setBusy(nextBusy);
      else { syncVersionControls(); renderVersionTabs(); }
      if (String(priorId) !== String(selectedId)) revealVersion(selectedIndex);
    }
    listen(versionScroll, 'scroll', () => { if (!versionFrame && !dead) versionFrame = requestAnimationFrame(renderVersionTabs); }, { passive: true });
    listen(versionTrack, 'click', event => {
      const target = event.target.closest('.version-tab');
      if (target) selectVersion(Number(target.dataset.index));
    });
    listen(versionTrack, 'keydown', event => {
      const target = event.target.closest('.version-tab');
      if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const current = Number(target.dataset.index);
      selectVersion(event.key === 'Home' ? 0 : event.key === 'End' ? versionItems.length - 1 : current + (event.key === 'ArrowLeft' ? -1 : 1), true);
    });
    listen(versionRange, 'input', () => showVersionPosition(Number(versionRange.value)));
    listen(versionRange, 'change', () => selectVersion(Number(versionRange.value)));
    listen(versionRange, 'keydown', event => event.stopPropagation());
    listen($('.first-version'), 'click', () => selectVersion(0));
    listen($('.last-version'), 'click', () => selectVersion(versionItems.length - 1));
    listen($('.delete-version'), 'click', () => {
      const current = versionItems[selectedIndex];
      if (!busy && current && current.id !== '__new__') onDeleteVersion?.(current.id);
    });

    rect = constrain(rect);
    render(false);
    document.body.append(host);
    if (canPopover) host.showPopover();
    queueMicrotask(() => { if (!dead) onRect?.(report()); });
    return {
      element: host,
      get rect() { return report(); },
      get fontSize() { return fontSize; },
      get keepText() { return $('.keep input').checked; },
      get settings() { return { ...preferences }; },
      setVersions,
      setBusy,
      setStatus(message) { if (!dead) $('.status').textContent = String(message ?? ''); },
      destroy() {
        if (dead) return;
        dead = true;
        if (gesture) finish({});
        lifetime.abort();
        if (frame) cancelAnimationFrame(frame);
        if (versionFrame) cancelAnimationFrame(versionFrame);
        if (canPopover && host.matches(':popover-open')) host.hidePopover();
        host.remove();
      }
    };
  }
  globalThis.MiorningTextFloatShell = Object.freeze({ create });
})();

(() => {
  'use strict';
  if (globalThis.MiorningTextFloatShell) return;

  const HEADER = 114, FOOTER = 32, PADDING = 16, GAP = 8;
  const STYLE = `
    :host{all:initial;color-scheme:light;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;--paper:#faf8f2;--ink:#252e30;--line:#dedfd5;--muted:#64716b;--version-bg:#efeee7;--tab-bg:#fffdf7;--tab-ink:#273f33;--tab-line:#bbc7bd;--hover-bg:#e2e6dc;--bubble-bg:#fffdf3;--bubble-ink:#303536;--bubble-note:#765346}
    :host([data-theme=dark]){color-scheme:dark;--paper:#202628;--ink:#e5eae3;--line:#495450;--muted:#b1beb4;--version-bg:#293230;--tab-bg:#3b4a43;--tab-ink:#e2f4e7;--tab-line:#8ca697;--hover-bg:#3b4a43;--bubble-bg:#363b35;--bubble-ink:#f4f0df;--bubble-note:#edb7a3}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}
    .window{position:relative;display:flex;flex-direction:column;width:100%;height:100%;border:1px solid #373e40;border-radius:12px;background:var(--paper);color:var(--ink);box-shadow:0 16px 52px #091c2438;overflow:visible}
    .top{display:flex;align-items:center;flex:0 0 53px;height:53px;gap:12px;padding:0 14px;border-radius:11px 11px 0 0;background:#262e30;color:#f4f4f0;user-select:none}
    .brand{display:flex;align-items:center;gap:8px;flex-shrink:0;color:inherit;text-decoration:none;border-radius:4px}.logo{display:block;width:32px;height:32px;object-fit:contain;border-radius:6px}.logo[hidden]{display:none}.title{font-size:15px;font-weight:650;white-space:nowrap;letter-spacing:.2px}
    .drag{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;min-width:16px;height:100%;cursor:grab;touch-action:none;border-radius:5px}
    .drag[data-dragging]{cursor:grabbing}.hint{font-size:11px;color:#bdc8c7;white-space:nowrap}.grip{font-size:16px;color:#9aa9a6;letter-spacing:1px}
    .font{display:flex;align-items:center;gap:5px;font-size:11px;color:#c2cfcc;white-space:nowrap}
    .font-number{width:48px;height:28px;padding:3px 2px 3px 5px;border:1px solid #5e6b6b;border-radius:5px;background:#394345;color:#fff;font-size:12px;text-align:center;appearance:textfield}
    .font-number::-webkit-inner-spin-button{appearance:none}.step{width:26px;height:28px;border:1px solid #53615f;border-radius:5px;background:transparent;color:#f4f4f0;font-size:16px;padding:0}
    .font-popover{position:fixed;inset:auto;margin:0;padding:10px 12px;border:1px solid #68766f;border-radius:8px;background:var(--paper);color:var(--ink);box-shadow:0 5px 16px #091c2426;width:244px;max-width:calc(100vw - 16px);font-size:12px;z-index:4}
    .font-popover[hidden]{display:none}.font-popover::backdrop{background:transparent;pointer-events:none}.font-popover-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
    .font-popover-close{width:24px;height:24px;padding:0;border:0;border-radius:4px;color:var(--muted);background:transparent;font-size:19px;line-height:20px}.font-range{display:block;width:100%;height:20px;margin:0;accent-color:#627f6b;cursor:ew-resize}
    .theme-toggle{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;padding:0;border:1px solid #53615f;border-radius:5px;background:transparent;color:#f4f4f0}.theme-toggle svg{display:block;width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.theme-toggle .moon{display:none}:host([data-theme=dark]) .theme-toggle .sun{display:none}:host([data-theme=dark]) .theme-toggle .moon{display:block}
    .drag-bubble{position:absolute;z-index:3;max-width:calc(100vw - 16px);width:max-content;padding:10px 14px;border:2px solid #2d3335;border-radius:15px 18px 15px 5px;background:var(--bubble-bg);color:var(--bubble-ink);box-shadow:3px 4px 0 #d76c5b;font-size:12px;font-weight:650;line-height:1.6;pointer-events:none;user-select:none;opacity:0;visibility:hidden;transition:opacity 120ms ease-out}
    .drag-bubble[data-visible]{opacity:1;visibility:visible}.drag-bubble:after{content:"";position:absolute;left:27px;bottom:-8px;width:12px;height:12px;background:var(--bubble-bg);border-right:2px solid #2d3335;border-bottom:2px solid #2d3335;transform:rotate(45deg)}
    .drag-bubble[data-placement=below]:after{top:-8px;bottom:auto;transform:rotate(225deg)}.drag-bubble span{display:block}.drag-bubble span+span{font-weight:500;color:var(--bubble-note)}
    .step:disabled{opacity:.35;cursor:default}
    .confirm{display:flex;align-items:center;justify-content:center;gap:9px;height:32px;min-width:52px;padding:0 11px;border:0;border-radius:6px;background:#d76c5b;color:#281611;font-size:12px;font-weight:700;white-space:nowrap}
    .confirm-label{min-width:36px;text-align:center}
    .settings-page{height:30px;flex-shrink:0;padding:0 5px;border:0;border-radius:4px;color:#d4dfda;background:transparent;font-size:11px;white-space:nowrap}
    .shortcut{font-weight:500;font-size:10px;opacity:.85}
    .versions{flex:0 0 60px;height:60px;padding:5px 14px 3px;border-bottom:1px solid var(--line);background:var(--version-bg);user-select:none}
    .version-top{display:flex;align-items:center;gap:8px;height:33px}.version-scroll{flex:1;min-width:0;height:33px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:#9faaa2 #e5e7dd;overscroll-behavior:contain}
    .version-track{position:relative;height:26px;min-width:100%}.version-tab{position:absolute;top:0;height:25px;width:130px;padding:0 8px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--muted);font-size:11px;line-height:23px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
    .version-tab[aria-selected=true]{background:var(--tab-bg);border-color:var(--tab-line);color:var(--tab-ink);font-weight:650}.version-tab[data-draft]{border-style:dashed}.version-tab[data-draft][aria-selected=true]{border-color:#a9b9ae}
    .delete-version{flex-shrink:0;height:25px;padding:0 6px;border:0;background:transparent;color:var(--muted);font-size:11px;border-radius:4px}
    .version-navigation{display:flex;align-items:center;gap:8px;height:18px}.version-range{display:block;flex:1;min-width:0;margin:0;height:16px;accent-color:#627f6b;cursor:ew-resize}.version-count{flex-shrink:0;min-width:70px;text-align:right;font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
    .version-edge{height:18px;width:21px;padding:0;border:0;border-radius:3px;color:var(--muted);background:transparent;font-size:12px}
    .body{position:relative;flex:1;min-height:0;padding:16px;cursor:text}.footer{flex:0 0 31px;height:31px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 16px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;user-select:none;overflow:hidden;border-radius:0 0 11px 11px}
    .status{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.instructions{white-space:nowrap;color:var(--muted)}
    button:focus-visible,input:focus-visible,a:focus-visible,.drag:focus-visible{outline:2px solid #72ceb1;outline-offset:2px}.version-tab:focus-visible{outline-offset:-2px}
    .handle{position:absolute;z-index:2;border:0;background:transparent;padding:0;touch-action:none;border-radius:3px}
    .handle:focus-visible{outline:2px solid #13856a;outline-offset:-2px;background:#9ddbc655}
    .n,.s{height:8px;left:14px;right:14px;cursor:ns-resize}.n{top:-4px}.s{bottom:-4px}
    .e,.w{width:8px;top:14px;bottom:14px;cursor:ew-resize}.e{right:-4px}.w{left:-4px}
    .ne,.nw,.se,.sw{width:14px;height:14px}.ne{top:-5px;right:-5px;cursor:nesw-resize}.nw{top:-5px;left:-5px;cursor:nwse-resize}.se{bottom:-5px;right:-5px;cursor:nwse-resize}.sw{bottom:-5px;left:-5px;cursor:nesw-resize}
    .se:after{content:"";position:absolute;width:6px;height:6px;right:5px;bottom:5px;border-right:1px solid #849b91;border-bottom:1px solid #849b91}
    @container (max-width:710px){.hint,.shortcut{display:none}.top{gap:8px}.font-number{width:36px}.step{width:23px}}
    @container (max-width:590px){.top{display:grid;grid-template-columns:auto 1fr auto auto;grid-template-rows:40px 36px;flex-basis:86px;height:86px;gap:0 10px;padding:4px 12px 6px}.brand{grid-column:1;grid-row:1}.drag{grid-column:2;grid-row:1}.settings-page{grid-column:3;grid-row:1}.confirm{grid-column:4;grid-row:1}.font{grid-column:1 / 5;grid-row:2}.instructions{display:none}.title{font-size:14px}.logo{height:29px;width:29px}.versions{padding-inline:12px}}
    @media(hover:hover) and (pointer:fine){.brand:hover .title{text-decoration:underline;text-underline-offset:3px}.step:hover:not(:disabled),.settings-page:hover,.theme-toggle:hover{background:#46514f}.confirm:hover:not(:disabled){background:#e48471}.version-tab:hover:not(:disabled),.font-popover-close:hover,.delete-version:hover:not(:disabled),.version-edge:hover:not(:disabled){background:var(--hover-bg)}}
    button:active:not(:disabled){filter:brightness(.94)}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `;

  function create({ onRect, onFont, onTheme, onClose, onFocus, onSettings, onSettingsPage, onSelectVersion, onDeleteVersion, settings = {}, logoUrl } = {}) {
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
    root.innerHTML = `<style>${STYLE}</style><section class="window"><header class="top"><a class="brand" href="https://space.bilibili.com/353186187" target="_blank" rel="noopener noreferrer" title="打开 MIORNING 的 B站主页"><img class="logo" alt="" width="32" height="32"><span class="title">喵咛文本窗</span></a><div class="drag" tabindex="0" role="button" aria-label="移动文本窗，使用方向键，Shift 加方向键微调"><span class="grip" aria-hidden="true">⠿</span><span class="hint">拖动</span></div><div class="font"><span>字号</span><button class="step minus" type="button" aria-label="减小字体">−</button><input class="font-number" aria-label="字体大小" aria-controls="miorning-font-popover" aria-expanded="false" title="点击数字展开字号滑块，也可直接输入" type="number" min="14" max="64" step="1" value="18"><button class="step plus" type="button" aria-label="增大字体">+</button><button class="theme-toggle" type="button" aria-label="夜间模式" aria-pressed="false" title="切换到夜间模式"><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"></path></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.1A8.3 8.3 0 0 1 8.9 4a8.5 8.5 0 1 0 11.1 11.1Z"></path></svg></button></div><button class="settings-page" type="button" aria-label="插件设置" title="插件设置">设置</button><button class="confirm" type="button"><span class="confirm-label">确认</span><span class="shortcut">Esc</span></button></header><div class="versions" aria-label="文本版本"><div class="version-top"><div class="version-scroll"><div class="version-track" role="tablist" aria-label="已保存的文本版本"></div></div><button class="delete-version" type="button" aria-label="删除当前版本" disabled>删除此版</button></div><div class="version-navigation"><button class="version-edge first-version" type="button" aria-label="选择最早版本" title="最早版本" disabled>Ⅰ‹</button><input class="version-range" type="range" min="0" max="0" step="1" value="0" aria-label="拖动选择文本版本" disabled><button class="version-edge last-version" type="button" aria-label="选择最新版本" title="最新版本" disabled>›Ⅰ</button><span class="version-count">暂无版本</span></div></div><div class="body" aria-hidden="true"></div><div class="drag-bubble" aria-hidden="true"><span>老师不会想给我充电吧？？？我不是那种人！！！</span><span>你真充了的话当我前面没说啊老师。</span></div><div class="font-popover" id="miorning-font-popover" hidden><div class="font-popover-head"><label for="miorning-font-range">字号 <output class="font-value">18</output> · 14–64</label><button class="font-popover-close" type="button" aria-label="关闭字号滑块">×</button></div><input id="miorning-font-range" class="font-range" type="range" min="14" max="64" step="1" value="18" aria-label="滑动调整字号"></div><footer class="footer"><span class="status" role="status" aria-live="polite">直接编辑原文本</span><span class="instructions">Enter 换行 · 拖动边框调整大小</span></footer></section>`;
    const $ = selector => root.querySelector(selector);
    const dragHandle = $('.drag'), fontInput = $('.font-number'), fontPanel = $('.font-popover'), fontRange = $('.font-range'), bubble = $('.drag-bubble');
    if (canPopover) fontPanel.setAttribute('popover', 'manual');
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

    let dead = false, frame = 0, gesture = null, fontSize = 18, busy = false, bubbleTimer = 0;
    let fontOpen = false, editorSelection = null;
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
    const preferences = { width: Math.max(360, numberOr(settings.width, 760)), height: Math.max(240, numberOr(settings.height, 520)), fontSize: clamp(Math.round(numberOr(settings.fontSize, 18)), 14, 64), theme: settings.theme === 'dark' ? 'dark' : 'light' };
    preferences.left = numberOr(settings.left, Math.max(GAP, (v.width - preferences.width) / 2));
    preferences.top = numberOr(settings.top, Math.max(GAP, (v.height - preferences.height) / 2));
    let rect = { left: preferences.left, top: preferences.top, width: preferences.width, height: preferences.height };
    fontSize = preferences.fontSize;
    fontInput.value = fontRange.value = String(fontSize);
    $('.font-value').textContent = String(fontSize);
    $('.minus').disabled = fontSize === 14;
    $('.plus').disabled = fontSize === 64;
    function paintTheme() {
      host.dataset.theme = preferences.theme;
      const dark = preferences.theme === 'dark';
      $('.theme-toggle').setAttribute('aria-pressed', String(dark));
      $('.theme-toggle').title = dark ? '切换到日间模式' : '切换到夜间模式';
    }
    paintTheme();
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
      if (fontOpen) placeFontPanel();
      if (bubble.hasAttribute('data-visible')) placeBubble();
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
    function placeBubble() {
      const brand = $('.brand').getBoundingClientRect(), top = $('.top').getBoundingClientRect();
      const width = bubble.offsetWidth, height = bubble.offsetHeight;
      const above = rect.top - height - 12 >= GAP;
      bubble.dataset.placement = above ? 'above' : 'below';
      bubble.style.left = `${clamp(brand.left, GAP, Math.max(GAP, innerWidth - width - GAP)) - rect.left}px`;
      bubble.style.top = `${clamp(above ? rect.top - height - 12 : top.bottom + 10, GAP, Math.max(GAP, innerHeight - height - GAP)) - rect.top}px`;
    }
    function hideBubble() { clearTimeout(bubbleTimer); bubbleTimer = 0; bubble.removeAttribute('data-visible'); }
    function showBubble() {
      clearTimeout(bubbleTimer);
      bubble.setAttribute('data-visible', '');
      placeBubble();
    }
    function leaveBubble() { clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, 2200); }
    function captureEditorSelection() {
      const element = document.activeElement;
      if (!element || element === host || host.contains(element)) return;
      try {
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          if (typeof element.selectionStart === 'number') editorSelection = { element, start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection };
        } else {
          const selection = getSelection();
          if (selection?.rangeCount && element.contains(selection.anchorNode)) editorSelection = { element, range: selection.getRangeAt(0).cloneRange() };
        }
      } catch (_) { /* A platform can replace its editor during a focus change. */ }
    }
    function restoreEditorSelection() {
      onFocus?.();
      if (!editorSelection?.element.isConnected) return;
      try {
        const saved = editorSelection;
        saved.element.focus({ preventScroll: true });
        if ('start' in saved) saved.element.setSelectionRange(saved.start, saved.end, saved.direction);
        else if (saved.range.startContainer.isConnected && saved.range.endContainer.isConnected) {
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(saved.range);
        }
      } catch (_) { /* Preserve the platform's current selection if it rebuilt the editor. */ }
    }
    function placeFontPanel() {
      const anchor = fontInput.getBoundingClientRect(), height = fontPanel.offsetHeight, width = fontPanel.offsetWidth;
      const left = clamp(anchor.left + anchor.width / 2 - width / 2, GAP, Math.max(GAP, innerWidth - width - GAP));
      const top = anchor.top - height - 9 >= GAP ? anchor.top - height - 9 : Math.min(innerHeight - height - GAP, anchor.bottom + 9);
      fontPanel.style.left = `${left - (canPopover ? 0 : rect.left)}px`;
      fontPanel.style.top = `${Math.max(GAP, top) - (canPopover ? 0 : rect.top)}px`;
    }
    function openFontPanel(focusRange = false) {
      hideBubble();
      fontOpen = true; fontPanel.hidden = false;
      fontInput.setAttribute('aria-expanded', 'true');
      if (canPopover && !fontPanel.matches(':popover-open')) fontPanel.showPopover();
      if (!canPopover) fontPanel.style.position = 'absolute';
      placeFontPanel();
      if (focusRange) fontRange.focus({ preventScroll: true });
    }
    function closeFontPanel(restore = false) {
      if (!fontOpen) return;
      fontOpen = false;
      if (canPopover && fontPanel.matches(':popover-open')) fontPanel.hidePopover();
      fontPanel.hidden = true; fontInput.setAttribute('aria-expanded', 'false');
      if (restore) restoreEditorSelection();
    }
    function begin(event, direction) {
      if (event.button !== 0 || gesture) return;
      event.preventDefault();
      event.stopPropagation();
      gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: { ...rect }, direction, target: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
      closeFontPanel();
      if (!direction) { dragHandle.setAttribute('data-dragging', ''); showBubble(); }
    }
    function finish(event) {
      if (!gesture || (event.pointerId != null && event.pointerId !== gesture.pointerId)) return;
      const previous = gesture;
      gesture = null;
      dragHandle.removeAttribute('data-dragging');
      if (!previous.direction) leaveBubble();
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
      if (!direction) { showBubble(); leaveBubble(); }
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
    function changeFont(value, restore = true) {
      const numeric = Number(value);
      fontSize = clamp(Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 18, 14, 64);
      fontInput.value = fontRange.value = String(fontSize);
      $('.font-value').textContent = String(fontSize);
      $('.minus').disabled = fontSize === 14;
      $('.plus').disabled = fontSize === 64;
      remember({ fontSize });
      onFont?.(fontSize);
      if (restore) restoreEditorSelection();
    }
    listen($('.minus'), 'click', () => changeFont(fontSize - 1));
    listen($('.plus'), 'click', () => changeFont(fontSize + 1));
    // Capture the native caret before any font control can take focus.
    listen($('.font'), 'pointerdown', captureEditorSelection, { capture: true });
    listen($('.font'), 'focusin', () => { if (!editorSelection) captureEditorSelection(); });
    for (const button of root.querySelectorAll('.step')) listen(button, 'pointerdown', event => event.preventDefault());
    listen(fontInput, 'click', () => openFontPanel());
    listen(fontInput, 'change', () => changeFont(fontInput.value, false));
    listen(fontInput, 'keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); changeFont(fontInput.value); closeFontPanel(); }
      if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); openFontPanel(true); }
    });
    listen(fontRange, 'input', () => changeFont(fontRange.value, false));
    listen(fontRange, 'keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); closeFontPanel(true); }
    });
    listen($('.font-popover-close'), 'click', () => closeFontPanel(true));
    listen($('.theme-toggle'), 'pointerdown', event => event.preventDefault());
    listen($('.theme-toggle'), 'click', () => {
      remember({ theme: preferences.theme === 'dark' ? 'light' : 'dark' });
      paintTheme(); onTheme?.(preferences.theme); restoreEditorSelection();
    });
    // Dismiss only this control on the first Escape; the next Escape confirms
    // the editor. Capture handles it before page-level shortcut listeners.
    listen(document, 'keydown', event => {
      if (fontOpen && event.key === 'Escape' && !event.isComposing) {
        event.preventDefault(); event.stopImmediatePropagation(); closeFontPanel(true);
      }
    }, { capture: true });
    listen(document, 'pointerdown', event => {
      const path = event.composedPath();
      if (fontOpen && !path.includes(fontPanel) && !path.includes($('.font'))) closeFontPanel();
      if (!path.includes(dragHandle)) hideBubble();
    }, { capture: true });
    listen(document, 'input', hideBubble, { capture: true });
    listen($('.confirm'), 'click', () => { if (!busy) onClose?.(); });
    listen($('.settings-page'), 'click', () => onSettingsPage?.());
    // Preserve the native editor's focus/selection when toggling with a pointer.
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
      get theme() { return preferences.theme; },
      get settings() { return { ...preferences }; },
      closeTransient() { if (!fontOpen) return false; closeFontPanel(true); return true; },
      setVersions,
      setBusy,
      setStatus(message) { if (!dead) $('.status').textContent = String(message ?? ''); },
      destroy() {
        if (dead) return;
        dead = true;
        if (gesture) finish({});
        hideBubble();
        closeFontPanel();
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

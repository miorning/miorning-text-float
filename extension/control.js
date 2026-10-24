/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatControl || globalThis.MiorningTextFloatControlBackend) return;
  const KEY = 'miorning-text-float:v4:control';
  const MESSAGE = 'MIORNING_TEXT_FLOAT_CONTROL_V1';
  const DEFAULT = {enabled: true, shortcut: {code: 'KeyK', alt: true, ctrl: false, shift: false, meta: false}, dock: {edge: 'right', ratio: .5}, revision: 0};
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };

  function normalizeShortcut(value) {
    if (!value || typeof value !== 'object' || !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(value.code || '')) fail('请使用字母、数字或 F1–F12，并搭配 Alt、Ctrl 或 ⌘。');
    const clean = {code: value.code};
    for (const name of ['alt', 'ctrl', 'shift', 'meta']) {
      if (typeof value[name] !== 'boolean') fail('快捷键格式无效。');
      clean[name] = value[name];
    }
    if (!clean.alt && !clean.ctrl && !clean.meta) fail('请至少搭配 Alt、Ctrl 或 ⌘，避免影响普通打字。');
    // Browser/OS shortcuts may never reach a page. Avoid common reserved actions.
    const primary = clean.ctrl || clean.meta;
    if ((clean.alt && clean.code === 'F4') ||
        (primary && !clean.alt && ['KeyW', 'KeyT', 'KeyN', 'KeyR', 'KeyL', 'KeyQ', 'KeyP', 'KeyS', 'KeyO', 'KeyF', 'KeyH', 'KeyJ', 'KeyD'].includes(clean.code)) ||
        (primary && clean.shift && ['KeyI', 'KeyJ', 'KeyC', 'KeyB', 'KeyN'].includes(clean.code)) ||
        (primary && !clean.alt && ['KeyC', 'KeyV', 'KeyX', 'KeyA', 'KeyZ'].includes(clean.code))) fail('这个组合通常被浏览器或系统占用，请换一个快捷键。');
    return clean;
  }
  function normalizeDock(value) {
    if (!value || !['left', 'right', 'top', 'bottom'].includes(value.edge) || !Number.isFinite(value.ratio)) fail('图标位置无效。');
    return {edge: value.edge, ratio: Math.min(1, Math.max(0, value.ratio))};
  }
  function normalize(value) {
    if (value === undefined || value === null) return clone(DEFAULT);
    if (typeof value !== 'object' || typeof value.enabled !== 'boolean') fail('全局设置无法读取，原始设置已保留。');
    return {enabled: value.enabled, shortcut: normalizeShortcut(value.shortcut), dock: normalizeDock(value.dock), revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0};
  }
  function reduce(current, op, payload = {}) {
    const state = normalize(current);
    if (op === 'getState') return state;
    if (op === 'setEnabled') {
      if (typeof payload.enabled !== 'boolean') fail('启用状态无效。');
      state.enabled = payload.enabled;
    } else if (op === 'toggle') state.enabled = !state.enabled;
    else if (op === 'saveShortcut') state.shortcut = normalizeShortcut(payload.shortcut);
    else if (op === 'saveDock') state.dock = normalizeDock(payload.dock);
    else fail('未知全局设置操作。');
    state.revision++;
    if (!Number.isSafeInteger(state.revision)) fail('设置版本超出设备可表示范围。');
    return state;
  }
  function chromeCall(method, argument) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local[method](argument, result => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || '全局设置保存失败。'));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }
  if (typeof document === 'undefined' && globalThis.chrome?.storage?.local) {
    let queue = Promise.resolve();
    globalThis.MiorningTextFloatControlBackend = Object.freeze({
      messageType: MESSAGE, key: KEY,
      perform(op, payload) {
        const task = queue.then(async () => {
          const values = await chromeCall('get', KEY);
          const state = reduce(values[KEY], op, payload);
          if (op !== 'getState') await chromeCall('set', {[KEY]: state});
          return clone(state);
        });
        queue = task.catch(() => {});
        return task;
      }
    });
    return;
  }

  const extension = Boolean(globalThis.chrome?.runtime?.id);
  const listeners = new Set();
  let revision = -1, localQueue = Promise.resolve();
  function notify(value) {
    const state = normalize(value);
    if (state.revision <= revision) return;
    revision = state.revision;
    for (const listener of listeners) { try { listener(clone(state)); } catch (error) { console.warn('喵咛文本窗：设置监听失败', error); } }
  }
  function send(type, op, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({type, op, payload}, response => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || '扩展已更新，请刷新网页。'));
          else if (!response?.ok) reject(new Error(response?.error || '全局设置保存失败，请重试。'));
          else resolve(response.value);
        });
      } catch (error) { reject(error); }
    });
  }
  async function request(op, payload = {}) {
    if (extension) {
      const state = normalize(await send(MESSAGE, op, payload));
      if (op !== 'getState') notify(state);
      return state;
    }
    // Only local previews use origin-local preferences. Extension errors never
    // fall back to website storage; this module stores no prompt text.
    const mutate = async () => {
      let existing;
      try { const raw = localStorage.getItem(KEY); existing = raw == null ? undefined : JSON.parse(raw); }
      catch { fail('本地预览设置无法读取。'); }
      const state = reduce(existing, op, payload);
      if (op !== 'getState') { localStorage.setItem(KEY, JSON.stringify(state)); notify(state); }
      return state;
    };
    const task = localQueue.then(() => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, mutate) : mutate());
    localQueue = task.catch(() => {});
    return task;
  }
  if (extension) chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]?.newValue) {
      try { notify(changes[KEY].newValue); } catch (error) { console.warn('喵咛文本窗：全局设置更新失败', error.message); }
    }
  });
  else globalThis.addEventListener?.('storage', event => {
    if (event.key === KEY && event.newValue) { try { notify(JSON.parse(event.newValue)); } catch { /* Invalid preview state is reported on the next read. */ } }
  });

  function shortcutFromEvent(event) {
    if (event.isComposing || event.keyCode === 229 || event.repeat) fail('请等待输入法结束，再按一次组合键。');
    return normalizeShortcut({code: event.code, alt: Boolean(event.altKey), ctrl: Boolean(event.ctrlKey), shift: Boolean(event.shiftKey), meta: Boolean(event.metaKey)});
  }
  function matchesShortcut(event, value) {
    if (event.isComposing || event.keyCode === 229 || event.repeat || event.getModifierState?.('AltGraph')) return false;
    try {
      const shortcut = normalizeShortcut(value);
      return event.code === shortcut.code && Boolean(event.altKey) === shortcut.alt && Boolean(event.ctrlKey) === shortcut.ctrl && Boolean(event.shiftKey) === shortcut.shift && Boolean(event.metaKey) === shortcut.meta;
    } catch { return false; }
  }
  function formatShortcut(value) {
    const shortcut = normalizeShortcut(value);
    return [shortcut.ctrl && 'Ctrl', shortcut.alt && 'Alt', shortcut.shift && 'Shift', shortcut.meta && '⌘', shortcut.code.replace(/^Key|^Digit/, '')].filter(Boolean).join(' + ');
  }
  globalThis.MiorningTextFloatControl = Object.freeze({
    getState: () => request('getState'),
    setEnabled: enabled => request('setEnabled', {enabled}),
    toggle: () => request('toggle'),
    saveShortcut: shortcut => request('saveShortcut', {shortcut}),
    saveDock: dock => request('saveDock', {dock}),
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    matchesShortcut, shortcutFromEvent, formatShortcut,
    openOptions(section = '') {
      const target = ['shortcut', 'cache'].includes(section) ? section : '';
      if (extension) return send('MIORNING_TEXT_FLOAT_OPEN_OPTIONS', '', {section: target});
      const options = document.querySelector?.('meta[name="miorning-options"]')?.content || 'options.html';
      return Promise.resolve(globalThis.open?.(`${options}${target ? `#${target}` : ''}`, '_blank', 'noopener'));
    }
  });
})();

/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  const feedback = document.getElementById('feedback');
  const cacheList = document.getElementById('cache-list');
  const cacheFeedback = document.getElementById('cache-feedback');
  const cacheDialog = document.getElementById('cache-confirm');
  const cacheClear = document.getElementById('cache-clear');
  const shortcutInput = document.getElementById('shortcut-input');
  const shortcutFeedback = document.getElementById('shortcut-feedback');
  const recordButton = document.getElementById('shortcut-record');
  const store = globalThis.MiorningTextFloatStore;
  const control = globalThis.MiorningTextFloatControl;
  let clearSelection = [], cacheSites = [], state = null;
  let busy = false, recording = false;
  const defaultShortcut = {code: 'KeyK', alt: true, ctrl: false, shift: false, meta: false};

  function say(message, error = false, target = feedback) {
    target.textContent = message;
    target.classList.toggle('error', error);
    target.setAttribute('role', error ? 'alert' : 'status');
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
    document.getElementById('global-toggle').disabled = value || !state;
    cacheList.querySelectorAll('input').forEach(checkbox => { checkbox.disabled = value; });
    updateCacheActions();
  }
  function render(next) {
    if (state && next.revision < state.revision) return;
    state = next;
    const toggle = document.getElementById('global-toggle');
    toggle.setAttribute('aria-checked', String(state.enabled));
    toggle.disabled = busy;
    document.getElementById('global-label').textContent = state.enabled ? '已开启' : '已暂停';
    document.getElementById('global-status').textContent = state.enabled ? '点击网页文本框，即可打开喵咛文本窗。' : '所有网页已暂停；小喵图标与恢复快捷键仍可用。';
    if (!recording) shortcutInput.value = control.formatShortcut(state.shortcut);
  }
  function stopRecording(message = '') {
    recording = false; recordButton.textContent = '录入快捷键';
    recordButton.setAttribute('aria-pressed', 'false');
    shortcutInput.classList.remove('recording');
    shortcutInput.value = state ? control.formatShortcut(state.shortcut) : 'Alt + K';
    if (message) say(message, false, shortcutFeedback);
  }
  async function runControl(task, success = '', target = feedback) {
    if (busy) return;
    setBusy(true);
    try { render(await task()); if (success) say(success, false, target); }
    catch (error) { say(error.message || '设置未保存，请重试。', true, target); }
    finally { setBusy(false); }
  }
  document.getElementById('global-toggle').addEventListener('click', () => runControl(() => control.toggle(), '全局状态已同步。'));
  recordButton.addEventListener('click', () => {
    if (busy) return;
    if (recording) { stopRecording('已取消，原快捷键保持不变。'); return; }
    recording = true; recordButton.textContent = '取消录入'; recordButton.setAttribute('aria-pressed', 'true');
    shortcutInput.value = '请按下组合键…'; shortcutInput.classList.add('recording'); shortcutInput.focus();
    say('现在按下新快捷键；Esc 取消。', false, shortcutFeedback);
  });
  shortcutInput.addEventListener('keydown', event => {
    if (!recording) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') { stopRecording('已取消，原快捷键保持不变。'); recordButton.focus(); return; }
    if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
    let shortcut;
    try { shortcut = control.shortcutFromEvent(event); }
    catch (error) { say(error.message, true, shortcutFeedback); return; }
    stopRecording();
    runControl(() => control.saveShortcut(shortcut), `已保存 ${control.formatShortcut(shortcut)}，所有网页同步生效。`, shortcutFeedback);
  });
  shortcutInput.addEventListener('blur', event => { if (recording && event.relatedTarget !== recordButton) stopRecording('已取消，原快捷键保持不变。'); });
  document.getElementById('shortcut-reset').addEventListener('click', () => { stopRecording(); runControl(() => control.saveShortcut(defaultShortcut), '已恢复 Alt + K。', shortcutFeedback); });
  document.addEventListener('keydown', event => {
    if (recording || busy || cacheDialog.open || !state || !control.matchesShortcut(event, state.shortcut)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    runControl(() => control.toggle(), '全局状态已同步。');
  });
  window.addEventListener('blur', () => { if (recording) stopRecording('已取消，原快捷键保持不变。'); });
  control.subscribe(render);

  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${(value / 1024 / 1024).toFixed(2)} MiB`;
  }
  const siteLabel = origin => origin === 'legacy-unclassified' ? '旧版未分类文本记录' : origin === 'local-preview' ? '本地预览页' : origin;
  const selectedOrigins = () => [...cacheList.querySelectorAll('input:checked')].map(input => input.value);
  function updateCacheActions() {
    cacheClear.disabled = busy || !selectedOrigins().length;
    document.getElementById('cache-select-all').disabled = busy || !cacheSites.length;
  }
  function cacheSay(message, error = false) {
    say(message, error, cacheFeedback);
    document.getElementById('cache-confirm-feedback').textContent = cacheDialog.open && error ? message : '';
  }
  async function refreshCache() {
    const selected = new Set(selectedOrigins());
    const usage = await store.cacheUsage();
    cacheSites = usage.sites;
    document.getElementById('cache-summary').textContent = `版本与草稿：${formatBytes(usage.historyBytes)} · ${cacheSites.length} 个网站；偏好与管理数据：${formatBytes(usage.preferencesBytes)}`;
    cacheList.replaceChildren();
    if (!cacheSites.length) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '还没有文本版本缓存。'; cacheList.append(empty);
    }
    for (const site of cacheSites) {
      const row = document.createElement('label'); row.className = 'cache-site';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = site.origin; checkbox.checked = selected.has(site.origin); checkbox.disabled = busy;
      checkbox.setAttribute('aria-label', `选择 ${siteLabel(site.origin)} 的缓存`);
      checkbox.addEventListener('change', updateCacheActions);
      const info = document.createElement('span');
      const name = document.createElement('strong'); name.textContent = siteLabel(site.origin);
      const detail = document.createElement('small'); detail.textContent = `${site.documents} 个文本框 · ${site.versions} 个版本（含 ${site.drafts} 个草稿）`;
      info.append(name, detail);
      const size = document.createElement('span'); size.className = 'cache-size'; size.textContent = formatBytes(site.bytes);
      row.append(checkbox, info, size); cacheList.append(row);
    }
    updateCacheActions();
  }
  async function runCache(task) {
    if (busy) return;
    setBusy(true);
    try { await task(); }
    catch (error) { cacheSay(error.message || '缓存操作失败，请重试。', true); }
    finally { setBusy(false); }
  }
  document.getElementById('cache-refresh').addEventListener('click', () => runCache(async () => { await refreshCache(); cacheSay('已刷新本地文本缓存大小。'); }));
  document.getElementById('cache-select-all').addEventListener('click', () => {
    const boxes = [...cacheList.querySelectorAll('input')], select = boxes.some(box => !box.checked);
    boxes.forEach(box => { box.checked = select; }); updateCacheActions();
  });
  cacheClear.addEventListener('click', () => {
    if (busy || !selectedOrigins().length) return;
    clearSelection = selectedOrigins();
    document.getElementById('cache-confirm-feedback').textContent = '';
    const sites = document.getElementById('cache-confirm-sites'); sites.replaceChildren();
    for (const origin of clearSelection) { const item = document.createElement('li'); item.textContent = siteLabel(origin); sites.append(item); }
    cacheDialog.showModal(); document.getElementById('cache-cancel').focus();
  });
  document.getElementById('cache-cancel').addEventListener('click', () => cacheDialog.close());
  cacheDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  document.getElementById('cache-confirm-clear').addEventListener('click', () => runCache(async () => {
    if (!cacheDialog.open || !clearSelection.length) return;
    const result = await store.clearCache([...clearSelection]);
    cacheDialog.close(); clearSelection = [];
    await refreshCache(); cacheSay(`已清空 ${result.origins.length} 个网站的文本缓存，移除 ${result.removedDocuments} 份文本框记录。`);
  }));
  function revealSection() {
    const id = location.hash.slice(1);
    if (['shortcut', 'cache'].includes(id)) document.getElementById(id).scrollIntoView({block: 'start'});
  }
  window.addEventListener('hashchange', revealSection);
  window.addEventListener('focus', () => { if (!busy) control.getState().then(render).catch(error => say(error.message, true)); });
  runControl(() => control.getState()).then(() => runCache(refreshCache)).then(revealSection);
})();

/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  const MESSAGE = 'MIORNING_TEXT_FLOAT_SITES_V1';
  const form = document.getElementById('site-form');
  const input = document.getElementById('site-url');
  const list = document.getElementById('site-list');
  const feedback = document.getElementById('feedback');
  let busy = false;

  function say(message, error = false) {
    feedback.textContent = message;
    feedback.classList.toggle('error', error);
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
    input.disabled = value;
  }

  function originFromInput(value) {
    if (!value.trim() || value.includes('*')) throw new Error('请输入具体网站地址，不支持通配符。');
    let url;
    try { url = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`); }
    catch { throw new Error('网址格式无效，请输入完整的 http 或 https 地址。'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('只支持不含账号密码的 http 或 https 网站地址。');
    if (['https://www.liblib.tv', 'https://liblib.tv'].includes(url.origin)) throw new Error('LibTV 已默认支持，无需重复添加。');
    return url.origin;
  }

  function send(op, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({type: MESSAGE, op, payload}, response => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!response?.ok) reject(new Error(response?.error || '设置未保存，请重试。'));
          else resolve(response.value);
        });
      } catch (error) { reject(error); }
    });
  }

  // Call directly from the click/submit handler, before any asynchronous work,
  // so the browser receives the actual user's authorization gesture.
  function requestPermission(origin) {
    return new Promise((resolve, reject) => {
      try {
        chrome.permissions.request({origins: [`${origin}/*`]}, granted => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!granted) reject(new Error('未获得网站访问权限，网站未启用。你可以稍后重试。'));
          else resolve();
        });
      } catch (error) { reject(error); }
    });
  }

  function render(state) {
    list.replaceChildren();
    if (!state.sites.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '还没有添加其他网站。';
      list.append(empty);
    }
    for (const site of state.sites) {
      const row = document.createElement('div'); row.className = 'site';
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = site.origin;
      const status = document.createElement('p');
      status.textContent = !site.granted ? '访问权限已撤销 · 需重新授权' : !site.enabled ? '已停用' : site.registered ? '已启用 · 刷新网页生效' : '未成功启用 · 点击重新授权重试';
      info.append(name, status);
      const actions = document.createElement('div'); actions.className = 'site-actions';
      const toggle = document.createElement('button'); toggle.type = 'button';
      toggle.textContent = !site.granted || (site.enabled && !site.registered) ? '重新授权' : site.enabled ? '停用' : '启用';
      toggle.setAttribute('aria-label', `${toggle.textContent} ${site.origin}`);
      toggle.addEventListener('click', () => {
        if (busy) return;
        const enable = !site.enabled || !site.granted || !site.registered;
        const permission = enable ? requestPermission(site.origin) : Promise.resolve();
        run(async () => {
          await permission;
          return send('setEnabled', {origin: site.origin, enabled: enable});
        }, `${site.origin} 已${enable ? '启用' : '停用'}。请刷新目标网页。`);
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '移除';
      remove.setAttribute('aria-label', `移除 ${site.origin}`);
      remove.addEventListener('click', () => run(() => send('remove', {origin: site.origin}), '网站已移除，文本版本仍保留。请刷新目标网页。'));
      actions.append(toggle, remove); row.append(info, actions); list.append(row);
    }
  }

  async function run(task, success = '') {
    if (busy) return;
    setBusy(true);
    try {
      const state = await task();
      render(state);
      if (state.warning) say(state.warning, true);
      else if (success) say(success);
    } catch (error) {
      say(error.message || '网站设置操作失败，请重试。', true);
      try { render(await send('list')); } catch { /* Preserve the original failure. */ }
    } finally { setBusy(false); }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    let origin;
    try { origin = originFromInput(input.value); }
    catch (error) { say(error.message, true); input.focus(); return; }
    const permission = requestPermission(origin);
    run(async () => {
      await permission;
      const state = await send('add', {origin});
      input.value = '';
      return state;
    }, `${origin} 已添加。刷新目标网页后，点击文本框即可使用。`);
  });
  document.getElementById('refresh').addEventListener('click', () => run(() => send('list'), '已刷新网站状态。'));
  window.addEventListener('focus', () => { if (!busy) run(() => send('list')); });
  chrome.permissions.onRemoved.addListener(() => { if (!busy) run(() => send('list')); });
  chrome.permissions.onAdded.addListener(() => { if (!busy) run(() => send('list')); });
  run(() => send('list'));
})();

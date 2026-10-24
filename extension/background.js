/* SPDX-License-Identifier: GPL-3.0-or-later */
importScripts('store.js');

const SITE_MESSAGE = 'MIORNING_TEXT_FLOAT_SITES_V1';
const SITE_KEY = 'miorning-text-float:v2:sites';
const SCRIPT_PREFIX = 'mtf-site-';
const SCRIPT_FILES = ['store.js', 'shell.js', 'references.js', 'content.js'];
const DEFAULT_ORIGINS = ['https://www.liblib.tv', 'https://liblib.tv'];
let siteQueue = Promise.resolve();

function chromeAsync(target, method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      target[method](...args, result => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || `${method} 失败。`));
        else resolve(result);
      });
    } catch (error) { reject(error); }
  });
}

function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('*')) throw new Error('请输入具体网站地址，不支持通配符。');
  let url;
  try { url = new URL(value.trim().includes('://') ? value.trim() : `https://${value.trim()}`); }
  catch { throw new Error('网址格式无效，请输入完整的 http 或 https 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('只支持不含账号密码的 http 或 https 网站地址。');
  return url.origin;
}

function scriptId(origin) {
  return SCRIPT_PREFIX + Array.from(origin, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

async function readSites() {
  const result = await chromeAsync(chrome.storage.local, 'get', SITE_KEY);
  const sites = result[SITE_KEY] ?? [];
  if (!Array.isArray(sites) || sites.some(site => !site || normalizeOrigin(site.origin) !== site.origin || typeof site.enabled !== 'boolean')) {
    throw new Error('网站设置无法读取；原始设置已保留。');
  }
  return sites;
}

async function sitePermission(origin) {
  return chromeAsync(chrome.permissions, 'contains', {origins: [`${origin}/*`]});
}

async function syncSites(sites) {
  const current = await chromeAsync(chrome.scripting, 'getRegisteredContentScripts', {});
  const desired = [];
  for (const site of sites) {
    if (site.enabled && !DEFAULT_ORIGINS.includes(site.origin) && await sitePermission(site.origin)) {
      desired.push({id: scriptId(site.origin), matches: [`${site.origin}/*`], js: SCRIPT_FILES, runAt: 'document_idle', persistAcrossSessions: true, allFrames: false});
    }
  }
  const desiredIds = new Set(desired.map(script => script.id));
  const obsolete = current.filter(script => script.id.startsWith(SCRIPT_PREFIX) && !desiredIds.has(script.id)).map(script => script.id);
  if (obsolete.length) await chromeAsync(chrome.scripting, 'unregisterContentScripts', {ids: obsolete});
  const existingIds = new Set(current.map(script => script.id));
  const toRegister = desired.filter(script => !existingIds.has(script.id));
  if (toRegister.length) await chromeAsync(chrome.scripting, 'registerContentScripts', toRegister);
  const toUpdate = desired.filter(script => existingIds.has(script.id));
  if (toUpdate.length) await chromeAsync(chrome.scripting, 'updateContentScripts', toUpdate);
}

async function siteState(sites, warning = '') {
  const registered = await chromeAsync(chrome.scripting, 'getRegisteredContentScripts', {});
  const ids = new Set(registered.map(script => script.id));
  const entries = [];
  for (const site of sites) entries.push({...site, granted: await sitePermission(site.origin), registered: ids.has(scriptId(site.origin))});
  return {sites: entries, defaults: DEFAULT_ORIGINS, warning};
}

function enqueueSites(task) {
  const result = siteQueue.then(task);
  siteQueue = result.catch(() => {});
  return result;
}

function performSiteOperation(op, payload = {}) {
  return enqueueSites(async () => {
    const before = await readSites();
    if (op === 'list') {
      await syncSites(before);
      return siteState(before);
    }
    if (!['add', 'setEnabled', 'remove'].includes(op)) throw new Error('未知网站设置操作。');
    const origin = normalizeOrigin(payload.origin);
    if (DEFAULT_ORIGINS.includes(origin)) throw new Error('LibTV 已默认支持，无需重复添加。');
    const next = before.map(site => ({...site}));
    const index = next.findIndex(site => site.origin === origin);
    if (op === 'add') {
      if (!await sitePermission(origin)) throw new Error('浏览器尚未授权该网站，请点击添加并允许访问。');
      if (index === -1) next.push({origin, enabled: true, createdAt: Date.now()});
      else next[index].enabled = true;
    } else {
      if (index === -1) throw new Error('该网站已被移除，请刷新设置。');
      if (op === 'remove') next.splice(index, 1);
      else {
        if (typeof payload.enabled !== 'boolean') throw new Error('网站启用设置无效。');
        if (payload.enabled && !await sitePermission(origin)) throw new Error('网站访问权限已撤销，请重新授权。');
        next[index].enabled = payload.enabled;
      }
    }
    try {
      await syncSites(next);
      await chromeAsync(chrome.storage.local, 'set', {[SITE_KEY]: next});
    } catch (error) {
      try { await syncSites(before); }
      catch (rollback) { throw new Error(`${error.message} 恢复网站启用状态也失败：${rollback.message}。请重试。`); }
      throw error;
    }
    let warning = '';
    if (op === 'remove') {
      try {
        const removed = await chromeAsync(chrome.permissions, 'remove', {origins: [`${origin}/*`]});
        if (!removed && await sitePermission(origin)) warning = '网站已移除；浏览器仍保留访问权限，可在浏览器扩展设置中收回。';
      } catch (error) { warning = `网站已移除；访问权限未能自动收回：${error.message}`; }
    }
    return siteState(next, warning);
  });
}

function syncStoredSites() {
  return enqueueSites(async () => syncSites(await readSites())).catch(error => console.warn('喵咛文本窗：网站设置同步失败', error.message));
}

chrome.runtime.onInstalled?.addListener(syncStoredSites);
chrome.runtime.onStartup?.addListener(syncStoredSites);
chrome.permissions?.onAdded?.addListener(syncStoredSites);
chrome.permissions?.onRemoved?.addListener(syncStoredSites);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const known = [globalThis.MiorningTextFloatStoreBackend.messageType, SITE_MESSAGE, 'MIORNING_TEXT_FLOAT_OPEN_OPTIONS'];
  if (!known.includes(message?.type)) return false;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ok: false, error: '无法验证扩展存储请求来源。'});
    return false;
  }
  const action = message.type === SITE_MESSAGE
    ? performSiteOperation(message.op, message.payload)
    : message.type === 'MIORNING_TEXT_FLOAT_OPEN_OPTIONS'
      ? chromeAsync(chrome.runtime, 'openOptionsPage')
      : globalThis.MiorningTextFloatStoreBackend.perform(message.op, message.payload);
  action.then(
    value => sendResponse({ok: true, value}),
    error => sendResponse({ok: false, error: error?.message || '版本保存失败。'})
  );
  return true;
});

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:/.test(tab.url || '')) return;
  try {
    const result = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => {
      if (globalThis.MiorningTextFloat) return globalThis.MiorningTextFloat.toggle();
      return null;
    }});
    if (result[0]?.result == null) {
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['store.js', 'shell.js', 'references.js', 'content.js']});
    }
    await chrome.action.setBadgeText({tabId: tab.id, text: result[0]?.result === false ? 'OFF' : 'ON'});
    await chrome.action.setBadgeBackgroundColor({tabId: tab.id, color: '#286f5d'});
  } catch (error) {
    await chrome.action.setBadgeText({tabId: tab.id, text: '!'});
    console.warn('喵咛文本窗：当前页面无法启用', error.message);
  }
});

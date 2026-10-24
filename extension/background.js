/* SPDX-License-Identifier: GPL-3.0-or-later */
importScripts('store.js', 'control.js');

const SCRIPT_FILES = ['control.js', 'store.js', 'shell.js', 'references.js', 'menus.js', 'dock.js', 'content.js'];
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
async function cleanupLegacyScripts() {
  const current = await chromeAsync(chrome.scripting, 'getRegisteredContentScripts', {});
  const ids = current.filter(script => script.id.startsWith('mtf-site-')).map(script => script.id);
  if (ids.length) await chromeAsync(chrome.scripting, 'unregisterContentScripts', {ids});
}
async function initialize(details) {
  await cleanupLegacyScripts();
  if (!details || !['install', 'update'].includes(details.reason)) return;
  const tabs = await chromeAsync(chrome.tabs, 'query', {url: ['http://*/*', 'https://*/*']});
  // New pages receive static scripts; old extension contexts need a refresh.
  // Never mix a new control module with an already-loaded older editor.
  await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id)).map(async tab => {
    const result = await chromeAsync(chrome.scripting, 'executeScript', {target: {tabId: tab.id}, func: () => Boolean(globalThis.MiorningTextFloat)});
    if (!result[0]?.result) await chromeAsync(chrome.scripting, 'executeScript', {target: {tabId: tab.id}, files: SCRIPT_FILES});
  }));
}
const initializeSafely = details => initialize(details).catch(error => console.warn('喵咛文本窗：初始化失败', error.message));
chrome.runtime.onInstalled?.addListener(initializeSafely);
chrome.runtime.onStartup?.addListener(() => initializeSafely());

async function openOptions(section = '') {
  if (!['shortcut', 'cache'].includes(section)) return chromeAsync(chrome.runtime, 'openOptionsPage');
  const base = chrome.runtime.getURL('options.html');
  const tabs = await chromeAsync(chrome.tabs, 'query', {url: `${base}*`});
  const existing = tabs.find(tab => Number.isInteger(tab.id));
  if (existing) {
    await chromeAsync(chrome.tabs, 'update', existing.id, {url: `${base}#${section}`, active: true});
    if (Number.isInteger(existing.windowId)) await chromeAsync(chrome.windows, 'update', existing.windowId, {focused: true});
  } else await chromeAsync(chrome.tabs, 'create', {url: `${base}#${section}`});
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const store = globalThis.MiorningTextFloatStoreBackend, control = globalThis.MiorningTextFloatControlBackend;
  if (![store.messageType, control.messageType, 'MIORNING_TEXT_FLOAT_OPEN_OPTIONS'].includes(message?.type)) return false;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ok: false, error: '无法验证扩展请求来源。'});
    return false;
  }
  const action = message.type === control.messageType
    ? control.perform(message.op, message.payload)
    : message.type === 'MIORNING_TEXT_FLOAT_OPEN_OPTIONS'
      ? openOptions(message.payload?.section)
      : store.perform(message.op, message.payload, (() => {
        try { const url = new URL(sender.url || sender.tab?.url); return ['http:', 'https:'].includes(url.protocol) ? url.origin : null; }
        catch { return null; }
      })());
  action.then(value => sendResponse({ok: true, value}), error => sendResponse({ok: false, error: error?.message || '设置保存失败。'}));
  return true;
});
// This entry remains accessible on pages where the browser forbids the dock.
chrome.action.onClicked.addListener(() => openOptions().catch(error => console.warn('喵咛文本窗：无法打开设置', error.message)));

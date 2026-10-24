/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatStore) return;

  const MESSAGE = 'MIORNING_TEXT_FLOAT_STORE_V2';
  const PREFIX = 'miorning-text-float:v2:';
  const SETTINGS_KEY = `${PREFIX}settings`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const fail = message => { throw new Error(message); };

  function snapshot(value) {
    if (!value || !['text', 'rich'].includes(value.kind) || typeof value.value !== 'string') {
      fail('文本版本格式无效，未保存。');
    }
    return {kind: value.kind, value: value.value};
  }

  function historyKey(key) {
    if (typeof key !== 'string' || !key.trim()) fail('缺少文本框的版本标识，未保存。');
    return `${PREFIX}history:${encodeURIComponent(key)}`;
  }

  function settingsPatch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('窗口设置格式无效。');
    const clean = {};
    for (const key of ['width', 'height', 'left', 'top', 'fontSize']) {
      if (!own(value, key)) continue;
      if (!Number.isFinite(value[key]) || (['width', 'height', 'fontSize'].includes(key) && value[key] <= 0)) {
        fail(`窗口设置 ${key} 无效。`);
      }
      clean[key] = value[key];
    }
    if (own(value, 'keepText')) {
      if (typeof value.keepText !== 'boolean') fail('保留原文字设置无效。');
      clean.keepText = value.keepText;
    }
    return clean;
  }

  function validateDocument(value) {
    if (!value || !Array.isArray(value.versions) || !Number.isSafeInteger(value.nextNumber) || value.nextNumber < 2) {
      fail('版本记录无法读取；已保留原始数据，请勿清除扩展存储。');
    }
    const ids = new Set(), numbers = new Set();
    for (const version of value.versions) {
      if (!version || typeof version.id !== 'string' || !version.id || ids.has(version.id) ||
          !Number.isSafeInteger(version.number) || version.number < 1 || version.number >= value.nextNumber ||
          numbers.has(version.number) || !['saved', 'draft'].includes(version.status) ||
          (version.status === 'draft' && (typeof version.ownerToken !== 'string' || !version.ownerToken)) ||
          !(version.parentId === null || typeof version.parentId === 'string') ||
          !Number.isFinite(version.createdAt) || !Number.isFinite(version.updatedAt)) {
        fail('版本记录损坏；已保留原始数据，请勿清除扩展存储。');
      }
      snapshot(version.snapshot);
      ids.add(version.id);
      numbers.add(version.number);
    }
    return clone(value);
  }

  function owner(value) {
    if (typeof value !== 'string' || !value) fail('缺少当前编辑会话标识，未保存。');
    return value;
  }

  function id() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Reducers never modify persisted input. All writes go through a serial worker
  // queue (extension) or one IndexedDB read/write transaction (local preview).
  function operation(op, payload) {
    if (!payload || typeof payload !== 'object') fail('存储请求格式无效。');
    if (op === 'getSettings') return {key: SETTINGS_KEY, reduce: current => ({value: current ? settingsPatch(current) : {}, write: false})};
    if (op === 'saveSettings') {
      const patch = settingsPatch(payload.settings);
      return {key: SETTINGS_KEY, reduce: current => ({value: {...(current ? settingsPatch(current) : {}), ...patch}, write: true})};
    }
    if (!['load', 'createDraft', 'updateDraft', 'remove'].includes(op)) fail('未知存储操作。');
    const key = historyKey(payload.key);
    const initial = op === 'load' ? snapshot(payload.initialSnapshot) : null;
    const input = op === 'createDraft' || op === 'updateDraft' ? payload.input : null;
    if (input) {
      snapshot(input.snapshot);
      owner(input.ownerToken);
    } else if (op === 'createDraft' || op === 'updateDraft') fail('缺少草稿内容，未保存。');
    return {key, reduce(current) {
      if (current === undefined) {
        if (op !== 'load') fail('请先读取文本框的版本记录。');
        const now = Date.now();
        return {value: {versions: [{id: id(), number: 1, parentId: null, status: 'saved', snapshot: initial, createdAt: now, updatedAt: now}], nextNumber: 2}, write: true};
      }
      const doc = validateDocument(current);
      if (op === 'load') return {value: doc, write: false};
      if (op === 'createDraft') {
        if (input.parentId != null && !doc.versions.some(version => version.id === input.parentId)) fail('原版本已被删除，请重新选择版本。');
        if (!Number.isSafeInteger(doc.nextNumber + 1)) fail('版本编号超出设备可表示的范围，未保存。');
        const now = Date.now();
        doc.versions.push({id: id(), number: doc.nextNumber++, parentId: input.parentId ?? null, status: 'draft', snapshot: snapshot(input.snapshot), createdAt: now, updatedAt: now, ownerToken: input.ownerToken});
      } else if (op === 'updateDraft') {
        const version = doc.versions.find(item => item.id === input.id);
        if (!version) fail('该版本已被删除，未保存当前修改。');
        if (version.status !== 'draft') fail('已保存的版本不可改写，请创建新版本。');
        if (version.ownerToken !== input.ownerToken) fail('该草稿属于另一个编辑会话，请创建新版本。');
        if (own(input, 'commit') && typeof input.commit !== 'boolean') fail('确认保存标记无效。');
        version.snapshot = snapshot(input.snapshot);
        version.updatedAt = Date.now();
        if (input.commit) {
          version.status = 'saved';
          delete version.ownerToken;
        }
      } else {
        const index = doc.versions.findIndex(version => version.id === payload.id);
        if (index === -1) fail('该版本已被删除，请刷新版本列表。');
        doc.versions.splice(index, 1);
      }
      return {value: doc, write: true};
    }};
  }

  function chromeCall(method, argument) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local[method](argument, result => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || '扩展存储操作失败。'));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }

  // Defined only in the service worker. Content scripts cannot bypass the queue.
  if (typeof document === 'undefined' && globalThis.chrome?.storage?.local) {
    let queue = Promise.resolve();
    globalThis.MiorningTextFloatStoreBackend = Object.freeze({
      messageType: MESSAGE,
      perform(op, payload) {
        const task = queue.then(async () => {
          const request = operation(op, payload);
          const stored = await chromeCall('get', request.key);
          const result = request.reduce(stored[request.key]);
          if (result.write) await chromeCall('set', {[request.key]: result.value});
          return clone(result.value);
        });
        queue = task.catch(() => {});
        return task;
      }
    });
    return;
  }

  let databasePromise;
  function database() {
    if (!globalThis.indexedDB) return Promise.reject(new Error('当前浏览器不支持本地版本存储。'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open('miorning-text-float-v2', 1); }
      catch (error) { reject(error); return; }
      let blocked = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records');
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('无法打开本地版本存储。'));
      request.onblocked = () => { blocked = true; reject(new Error('本地存储被其他页面占用，请关闭旧预览页后重试。')); };
    }).catch(error => { databasePromise = undefined; throw error; });
    return databasePromise;
  }

  async function localRequest(op, payload) {
    const request = operation(op, payload);
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx, result, failure;
      try {
        tx = db.transaction('records', 'readwrite');
        const records = tx.objectStore('records');
        const read = records.get(request.key);
        read.onsuccess = () => {
          try {
            result = request.reduce(read.result);
            if (result.write) records.put(result.value, request.key);
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(clone(result.value));
        tx.onabort = () => reject(failure || tx.error || new Error('本地存储写入失败，版本未保存。'));
        tx.onerror = () => { failure ||= tx.error; };
      } catch (error) { reject(error); }
    });
  }

  // Decide once: an invalidated extension must report failure, never silently
  // switch to the website's separate preview database.
  const extensionContext = Boolean(globalThis.chrome?.runtime?.id);
  function request(op, payload = {}) {
    if (!extensionContext) return localRequest(op, payload);
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({type: MESSAGE, op, payload}, response => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || '扩展连接失败，请刷新页面。'));
          else if (!response?.ok) reject(new Error(response?.error || '扩展未确认保存，请刷新页面后重试。'));
          else resolve(response.value);
        });
      } catch (error) { reject(error); }
    });
  }

  globalThis.MiorningTextFloatStore = Object.freeze({
    getSettings: () => request('getSettings'),
    saveSettings: settings => request('saveSettings', {settings}),
    load: (key, initialSnapshot) => request('load', {key, initialSnapshot}),
    createDraft: (key, input) => request('createDraft', {key, input}),
    updateDraft: (key, input) => request('updateDraft', {key, input}),
    remove: (key, id) => request('remove', {key, id})
  });
})();

/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  if (globalThis.MiorningTextFloatStore) return;

  const MESSAGE = 'MIORNING_TEXT_FLOAT_STORE_V2';
  const PREFIX = 'miorning-text-float:v2:';
  const SETTINGS_KEY = `${PREFIX}settings`;
  const HISTORY_PREFIX = `${PREFIX}history:`;
  const EPOCH_PREFIX = `${PREFIX}epoch:`;
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
    return `${HISTORY_PREFIX}${encodeURIComponent(key)}`;
  }

  function originFromKey(key) {
    let candidate;
    try { const parts = JSON.parse(key); if (Array.isArray(parts)) candidate = parts[0]; } catch { candidate = key.split('|')[0]; }
    if (candidate === 'null') return 'local-preview';
    try {
      const url = new URL(candidate);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.origin;
    } catch { /* Old anonymous keys are grouped without exposing their contents. */ }
    return 'legacy-unclassified';
  }
  const epochKey = origin => `${EPOCH_PREFIX}${encodeURIComponent(origin)}`;
  const epochValue = value => value === undefined ? 0 : Number.isSafeInteger(value) && value >= 0 ? value : fail('缓存状态无法读取，原始数据已保留。');
  const cleared = () => fail('此网站缓存已清空，请关闭并重新打开文本窗后继续。');
  function hasContent(value) {
    if (value.kind === 'text') return Boolean(value.value.trim());
    if (/<(?:img|video|audio)\b|data-(?:mention|reference)/i.test(value.value)) return true;
    return Boolean(value.value.replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ').replace(/[\s\u200b\ufeff]/g, ''));
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
    if (own(clean, 'fontSize')) clean.fontSize = Math.max(14, Math.min(64, clean.fontSize));
    if (own(value, 'theme')) {
      if (!['light', 'dark'].includes(value.theme)) fail('主题设置无效。');
      clean.theme = value.theme;
    }
    return clean;
  }

  function validateDocument(value) {
    if (!value || !Array.isArray(value.versions) || !Number.isSafeInteger(value.nextNumber) || value.nextNumber < 1) {
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
    if (op === 'getEpoch') {
      historyKey(payload.key);
      return {key: epochKey(originFromKey(payload.key)), reduce: current => ({value: epochValue(current), write: false})};
    }
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
        return {value: hasContent(initial)
          ? {versions: [{id: id(), number: 1, parentId: null, status: 'saved', snapshot: initial, createdAt: now, updatedAt: now}], nextNumber: 2}
          : {versions: [], nextNumber: 1}, write: true};
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

  const byteLength = value => new TextEncoder().encode(value).byteLength;
  const dataBytes = (key, value) => byteLength(key) + byteLength(JSON.stringify(value));
  function cacheUsage(records, scope) {
    const groups = new Map();
    let preferencesBytes = 0;
    for (const [key, value] of Object.entries(records)) {
      if (key === 'miorning-text-float:v4:control') { if (!scope) preferencesBytes += dataBytes(key, value); continue; }
      if (!key.startsWith(PREFIX)) continue;
      if (!key.startsWith(HISTORY_PREFIX)) { if (!scope) preferencesBytes += dataBytes(key, value); continue; }
      let origin;
      try { origin = originFromKey(decodeURIComponent(key.slice(HISTORY_PREFIX.length))); }
      catch { origin = 'legacy-unclassified'; }
      if (scope && origin !== scope) continue;
      if (!groups.has(origin)) groups.set(origin, {origin, bytes: 0, documents: 0, versions: 0, drafts: 0});
      const row = groups.get(origin);
      row.bytes += dataBytes(key, value); row.documents++;
      if (Array.isArray(value?.versions)) {
        row.versions += value.versions.length;
        row.drafts += value.versions.filter(version => version?.status === 'draft').length;
      }
    }
    const sites = [...groups.values()].sort((a, b) => a.origin.localeCompare(b.origin));
    const historyBytes = sites.reduce((sum, site) => sum + site.bytes, 0);
    return {sites, historyBytes, preferencesBytes, totalBytes: historyBytes + preferencesBytes, measurement: 'utf8-json-key-and-value'};
  }
  function clearPlan(records, payload, scope) {
    if (!payload || !Array.isArray(payload.origins) || !payload.origins.length || payload.origins.length > 10000) fail('请先勾选要清空缓存的网站。');
    const origins = [...new Set(payload.origins)];
    for (const origin of origins) {
      if (typeof origin !== 'string' || !(['local-preview', 'legacy-unclassified'].includes(origin) || originFromKey(origin) === origin)) fail('清理网站格式无效。');
      if (scope && scope !== origin) fail('只能访问当前网站的缓存。');
    }
    const remove = Object.keys(records).filter(key => {
      if (!key.startsWith(HISTORY_PREFIX)) return false;
      try { return origins.includes(originFromKey(decodeURIComponent(key.slice(HISTORY_PREFIX.length)))); }
      catch { return origins.includes('legacy-unclassified'); }
    });
    const epochs = Object.fromEntries(origins.map(origin => {
      const next = epochValue(records[epochKey(origin)]) + 1;
      if (!Number.isSafeInteger(next)) fail('缓存状态超出设备可表示的范围。');
      return [epochKey(origin), next];
    }));
    return {origins, remove, epochs};
  }
  function validateScope(op, payload, scope) {
    if (scope && ['getEpoch', 'load', 'createDraft', 'updateDraft', 'remove'].includes(op) && originFromKey(payload?.key || '') !== scope) fail('只能访问当前网站的版本记录。');
  }
  function withEpoch(op, payload, currentEpoch, result) {
    if (['load', 'createDraft', 'updateDraft', 'remove'].includes(op)) return {...result, epoch: currentEpoch};
    return result;
  }
  function checkEpoch(op, payload, currentEpoch) {
    const expected = op === 'remove' || op === 'load' ? payload.epoch : payload.input?.epoch;
    if (op === 'load' && expected === undefined) return;
    if ((expected ?? 0) !== currentEpoch) cleared();
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
      perform(op, payload = {}, scope = null) {
        const task = queue.then(async () => {
          validateScope(op, payload, scope);
          if (op === 'cacheUsage' || op === 'clearCache') {
            const records = await chromeCall('get', null);
            if (op === 'cacheUsage') return cacheUsage(records, scope);
            const plan = clearPlan(records, payload, scope);
            // Fence stale writers before deleting. A failed deletion is reported
            // as failure; retrying is safe and never restores deleted records.
            await chromeCall('set', plan.epochs);
            if (plan.remove.length) await chromeCall('remove', plan.remove);
            return {origins: plan.origins, removedDocuments: plan.remove.length};
          }
          const request = operation(op, payload);
          const history = request.key.startsWith(HISTORY_PREFIX);
          const marker = history ? epochKey(originFromKey(payload.key)) : null;
          const stored = await chromeCall('get', history ? [request.key, marker] : request.key);
          const epoch = history ? epochValue(stored[marker]) : null;
          if (history) checkEpoch(op, payload, epoch);
          const result = request.reduce(stored[request.key]);
          if (result.write) await chromeCall('set', {[request.key]: result.value});
          return clone(withEpoch(op, payload, epoch, result.value));
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
    const cacheOperation = op === 'cacheUsage' || op === 'clearCache';
    const request = cacheOperation ? null : operation(op, payload);
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx, result, failure;
      try {
        tx = db.transaction('records', 'readwrite');
        const records = tx.objectStore('records');
        const abort = error => { failure = error; tx.abort(); };
        if (cacheOperation) {
          const values = Object.create(null), cursor = records.openCursor();
          cursor.onsuccess = () => {
            try {
              const row = cursor.result;
              if (row) { values[row.key] = row.value; row.continue(); return; }
              if (op === 'cacheUsage') { result = cacheUsage(values); return; }
              const plan = clearPlan(values, payload);
              for (const [key, epoch] of Object.entries(plan.epochs)) records.put(epoch, key);
              for (const key of plan.remove) records.delete(key);
              result = {origins: plan.origins, removedDocuments: plan.remove.length};
            } catch (error) { abort(error); }
          };
        } else {
          const read = records.get(request.key);
          read.onsuccess = () => {
            const finish = epoch => {
              try {
                if (epoch !== null) checkEpoch(op, payload, epoch);
                const change = request.reduce(read.result);
                if (change.write) records.put(change.value, request.key);
                result = withEpoch(op, payload, epoch, change.value);
              } catch (error) { abort(error); }
            };
            if (!request.key.startsWith(HISTORY_PREFIX)) { finish(null); return; }
            const marker = records.get(epochKey(originFromKey(payload.key)));
            marker.onsuccess = () => { try { finish(epochValue(marker.result)); } catch (error) { abort(error); } };
          };
        }
        tx.oncomplete = () => {
          if (op === 'clearCache') {
            notifyCleared({origins: result.origins});
            channel?.postMessage({origins: result.origins});
          }
          resolve(clone(result));
        };
        tx.onabort = () => reject(failure || tx.error || new Error('本地存储写入失败，版本未保存。'));
        tx.onerror = () => { failure ||= tx.error; };
      } catch (error) { reject(error); }
    });
  }

  // Decide once: an invalidated extension must report failure, never silently
  // switch to the website's separate preview database.
  const extensionContext = Boolean(globalThis.chrome?.runtime?.id);
  const clearListeners = new Set();
  function notifyCleared(value) {
    if (!value || !Array.isArray(value.origins)) return;
    for (const listener of clearListeners) { try { listener(value); } catch (error) { console.warn('喵咛文本窗：缓存状态通知失败', error); } }
  }
  let channel;
  if (extensionContext) {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      const origins = Object.entries(changes).filter(([key, change]) => key.startsWith(EPOCH_PREFIX) && change.oldValue !== change.newValue).map(([key]) => decodeURIComponent(key.slice(EPOCH_PREFIX.length)));
      if (origins.length) notifyCleared({origins});
    });
  } else if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('miorning-text-float-cache-v3');
    channel.onmessage = event => notifyCleared(event.data);
  }
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
    getEpoch: key => request('getEpoch', {key}),
    saveSettings: settings => request('saveSettings', {settings}),
    load: (key, initialSnapshot, epoch) => request('load', {key, initialSnapshot, ...(epoch === undefined ? {} : {epoch})}),
    createDraft: (key, input) => request('createDraft', {key, input}),
    updateDraft: (key, input) => request('updateDraft', {key, input}),
    remove: (key, id, epoch) => request('remove', {key, id, epoch}),
    cacheUsage: () => request('cacheUsage'),
    clearCache: origins => request('clearCache', {origins}),
    originFromKey,
    onCacheCleared(listener) { clearListeners.add(listener); return () => clearListeners.delete(listener); }
  });
})();

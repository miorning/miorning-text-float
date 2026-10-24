/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, packageJson.version, 'Package and manifest versions must match');
assert.deepEqual(manifest.content_scripts[0].js, ['control.js', 'store.js', 'shell.js', 'references.js', 'menus.js', 'dock.js', 'content.js']);
assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
const assets = new Set([manifest.background.service_worker, manifest.options_ui.page, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]);
for (const item of manifest.content_scripts) for (const file of [...(item.js || []), ...(item.css || [])]) assets.add(file);
for (const group of manifest.web_accessible_resources || []) for (const file of group.resources) assets.add(file);
const html = fs.readFileSync(path.join(extension, manifest.options_ui.page), 'utf8');
for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) if (!/^(?:https?:|#|data:)/.test(match[1])) assets.add(match[1]);
for (const asset of assets) {
  const target = path.resolve(extension, asset);
  assert.ok(target.startsWith(extension + path.sep), 'Asset must stay inside extension: ' + asset);
  assert.ok(fs.existsSync(target) && fs.statSync(target).isFile(), 'Missing manifest or options asset: ' + asset);
}
let count = 0;
function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !['artifacts', 'node_modules'].includes(entry.name)) checkDirectory(path.join(directory, entry.name));
    else if (entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path.join(directory, entry.name)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      count++;
    }
  }
}
for (const directory of ['extension', 'qa', 'scripts']) checkDirectory(path.join(root, directory));
console.log(JSON.stringify({ status: 'passed', syntaxFiles: count, assets: assets.size, contentScriptLoadOrder: manifest.content_scripts[0].js }, null, 2));

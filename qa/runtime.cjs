/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

function installedBrowsers() {
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:/Program Files';
    const programFiles86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA;
    return [
      path.join(programFiles86, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
      ...(localAppData ? [path.join(localAppData, 'Google/Chrome/Application/chrome.exe')] : [])
    ];
  }
  if (process.platform === 'darwin') return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

function browserOptions(chromium, extension = false) {
  const variable = extension ? 'TEXT_FLOAT_EXTENSION_BROWSER' : 'TEXT_FLOAT_BROWSER';
  const explicit = process.env[variable];
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(variable + ' does not point to an existing browser executable');
    return { executablePath: explicit };
  }
  const bundled = chromium.executablePath();
  // Playwright Chromium supports extension flags. Recent branded Chrome builds
  // may not; Edge is preferred among installed browsers for MV3 testing.
  if (fs.existsSync(bundled)) return { executablePath: bundled };
  const installed = installedBrowsers().find(candidate => fs.existsSync(candidate));
  if (installed) return { executablePath: installed };
  throw new Error('No Chromium browser found. Run npx playwright install chromium or set ' + variable + '.');
}

function browserLabel(options) { return path.basename(options.executablePath || 'playwright-chromium'); }
function sanitizeText(value) {
  let result = String(value);
  const replacements = [[root, '<workspace>'], [os.tmpdir(), '<temp>'], [os.homedir(), '<home>']];
  for (const variable of ['TEXT_FLOAT_BROWSER', 'TEXT_FLOAT_EXTENSION_BROWSER']) if (process.env[variable]) replacements.push([process.env[variable], '<browser>']);
  for (const directory of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) replacements.push([directory, '<dependencies>']);
  for (const [directory, replacement] of replacements) {
    for (const variant of new Set([directory, directory.replaceAll('\\', '/'), directory.replaceAll('/', '\\')])) result = result.split(variant).join(replacement);
  }
  // Dependencies may be supplied through NODE_PATH rather than node_modules.
  return result.replace(/[A-Za-z]:[\\/][^\n\r"<>]*?(?=:\d+(?::\d+)?\)?(?:\s|$))/g, '<external-source>');
}
function sanitize(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]));
  return value;
}
function writeReport(report) { fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(sanitize(report), null, 2) + '\n'); }
function temporaryDirectory(prefix) { return fs.mkdtempSync(path.join(artifacts, prefix)); }
function removeTemporary(directory) {
  const target = path.resolve(directory);
  const expected = path.resolve(artifacts) + path.sep;
  if (!target.startsWith(expected) || !path.basename(target).startsWith('temporary-')) throw new Error('Unsafe QA cleanup path');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}
module.exports = { artifacts, browserOptions, browserLabel, sanitize, writeReport, temporaryDirectory, removeTemporary };

# 源码与构建 / Source and build

运行时代码位于 `extension/`，使用原生 Web API 与 Manifest V3，无打包器、压缩混淆或第三方运行时依赖。

Runtime code lives in `extension/` and uses native Web APIs and Manifest V3. It has no bundler, minification, or third-party runtime dependencies.

## 环境 / Requirements

- Node.js 22+ 与 npm / Node.js 22+ and npm.
- PowerShell，用于打包 / PowerShell for packaging.
- Chromium / Chrome / Edge，用于浏览器测试 / Chromium, Chrome, or Edge for browser tests.
- Playwright 为单独安装的开发依赖，不随扩展运行 / Playwright is a separately installed development dependency, not part of the extension runtime.

## 命令 / Commands

```sh
npm ci
npm run check
npm test
npm run test:browser
npm run package
```

`npm test` 执行存储与网站设置检查；`npm run test:browser` 使用隔离浏览器配置和本地模拟页。打包结果位于 `dist/`。

`npm test` runs storage and website-setting checks. `npm run test:browser` uses an isolated browser profile and local fixtures. Packages are written to `dist/`.

如使用 Playwright 管理的浏览器，可先运行 `npx playwright install chromium`。测试不使用日常浏览器的登录配置。

For a Playwright-managed browser, run `npx playwright install chromium` first. Tests do not use your everyday signed-in browser profile.

## 目录 / Layout

| 路径 / Path | 内容 / Contents |
| --- | --- |
| `extension/` | 可直接加载的扩展 / Loadable extension |
| `qa/` | 自动化检查和模拟页 / Automated checks and fixtures |
| `docs/` | 隐私、验证范围和展示图片 / Privacy, validation, and images |
| `scripts/package.ps1` | 本地打包脚本 / Local packaging script |
| `LICENSE` | GPL v3 全文；代码适用 v3 或更新版本 / GPL v3 text; code is v3 or later |

提交问题时请附浏览器版本、网站域名和复现步骤；不要附私密提示词、登录凭证或浏览器配置。 / When reporting a problem, include browser version, website domain, and steps to reproduce; omit private prompts, credentials, and browser profiles.

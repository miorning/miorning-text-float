# 源码与构建 / Source and build

v0.4.4。运行时代码位于 `extension/`，使用原生 Web API 与 Manifest V3，无打包器、压缩混淆或第三方运行时依赖。

v0.4.4. Runtime code in `extension/` uses native Web APIs and Manifest V3, with no bundler, minification, or third-party runtime dependencies.

## 环境 / Requirements

Node.js 22+、npm、PowerShell，以及 Chromium / Chrome / Edge。Playwright 仅为开发依赖，不随扩展运行。

Node.js 22+, npm, PowerShell, and Chromium / Chrome / Edge. Playwright is a development dependency, not part of the extension runtime.

## 命令 / Commands

```sh
npm ci
npm run check
npm test
npm run test:shell
npm run test:references
npm run test:cache
npm run test:control
npm run test:dock
npm run test:menus
npm run test:lifecycle
npm run test:integration
npm run test:editing
npm run test:prosemirror
npm run test:interactions
npm run test:browser
npm run package:extension
npm run test:package
```

`npm test` 执行存储与全局控制单元检查；专项脚本检查窗口、图片引用、缓存清理、全局开关、吸边图标和原生菜单层级。浏览器测试使用隔离配置与本地模拟页，不使用日常账号，也不生成媒体。当前验证范围见 [VALIDATION.md](docs/VALIDATION.md)。

`npm test` checks storage and global-control units; focused scripts test the window, references, cache management, global controls, edge dock, and native menu layering. Browser tests use isolated profiles and local fixtures, without everyday accounts or media generation. See [VALIDATION.md](docs/VALIDATION.md) for current coverage.

如需 Playwright 管理的浏览器，先运行 `npx playwright install chromium`。也可通过 `TEXT_FLOAT_BROWSER` 与 `TEXT_FLOAT_EXTENSION_BROWSER` 指定浏览器可执行文件。

Run `npx playwright install chromium` for a Playwright-managed browser, or set `TEXT_FLOAT_BROWSER` and `TEXT_FLOAT_EXTENSION_BROWSER` to browser executables.

## 打包 / Packaging

`npm run package` 在 `dist/` 生成 `MiorningTextFloat-v0.4.4.zip` 与校验文件；存在 `covers/` 时另外打包封面。此命令只写本地文件，不上传 GitHub。

`npm run package` creates `dist/MiorningTextFloat-v0.4.4.zip` and checksums, plus a cover archive when `covers/` exists. It only writes local files; it does not publish to GitHub.

仅打包插件可使用 `npm run package:extension`。`npm run test:package` 检查打包后的独立预览、Logo、日夜切换、字号和确认保存。 / Use `npm run package:extension` for the extension alone. `npm run test:package` checks the bundled preview, logo, theme, font control, and confirmation.

| 路径 / Path | 内容 / Contents |
| --- | --- |
| `extension/` | 可直接加载的扩展 / Loadable extension |
| `qa/` | 自动化检查和模拟页 / Checks and fixtures |
| `docs/` | 隐私、验证范围和图片 / Privacy, validation, and images |
| `scripts/package.ps1` | 本地打包 / Local packaging |
| `LICENSE` | GPL v3 全文；代码适用 v3 或更新版本 / GPL v3 text; code is v3 or later |

提交问题请附浏览器版本、网站域名和复现步骤；勿附私密提示词、凭证或浏览器配置。 / Report browser version, website domain, and reproduction steps; omit private prompts, credentials, and browser profiles.

## 双扩展兼容检查 / Paired-extension check

`npm run test:compat` 需要另行提供原版保险栓 v1.8.0 和文本窗 v0.4.1 基线，分别通过 `MIORNING_GUARD_EXTENSION`、`MIORNING_TEXT_FLOAT_BASELINE` 指向含 manifest.json 的目录。保险栓源码不包含在本 GPL 安装包中，也不需要用户升级保险栓。

`npm run test:compat` requires separately obtained Prompt Guard v1.8.0 and Text Float v0.4.1 baseline directories, supplied through `MIORNING_GUARD_EXTENSION` and `MIORNING_TEXT_FLOAT_BASELINE`. Guard source is not bundled under this license and no Guard update is required.

`npm run test:prosemirror` 使用固定版本的官方 ProseMirror 开发依赖，核对编辑器模型、可见行位置、撤销和引用。`npm run test:prosemirror-mv3` 另外需要原版保险栓目录（环境变量同上），在隔离配置中验证真实双扩展。网站诊断下载不包含在安装包中。

`npm run test:prosemirror` uses pinned official ProseMirror development dependencies to check durable model text, visual line positions, undo and references. `npm run test:prosemirror-mv3` additionally requires the separate original Guard directory to test both real extensions. Downloaded website research assets are not distributed.

## 域名回归 / Host regression

`npm run test:hosts` 验证小云雀的 www、根域名、旧域名及即梦。`npm run test:hosts-mv3` 使用原版保险栓进行双扩展检查，仍通过 `MIORNING_GUARD_EXTENSION` 指定其目录。

`npm run test:hosts` verifies Xiaoyunque’s www, apex, legacy host and Jimeng. `npm run test:hosts-mv3` tests both production extensions, using `MIORNING_GUARD_EXTENSION` for the unchanged Guard directory.

旧版对照通过 `MIORNING_TEXT_FLOAT_V043_BASELINE` 指向解压后的 v0.4.3 包根目录。没有旧包时会明确跳过 8 项旧版问题复现，18 项当前版本检查仍全部执行。

Set `MIORNING_TEXT_FLOAT_V043_BASELINE` to an unpacked v0.4.3 package root for the baseline comparison. Without it, the 8 legacy reproduction cases are explicitly skipped; all 18 current-version checks remain mandatory.

# 素材与依赖 / Assets and dependencies

## 运行时 / Runtime

扩展仅使用浏览器原生 Web API 与 Manifest V3，没有随包分发的第三方 JavaScript 库。 / The extension uses native Web APIs and Manifest V3; it bundles no third-party JavaScript libraries.

## 开发工具 / Development tools

- [Playwright](https://github.com/microsoft/playwright)：Apache-2.0，单独安装用于测试，不包含在扩展运行时。 / Apache-2.0; installed separately for testing, not included in the extension runtime.
- [Node.js](https://nodejs.org/)：单独安装的开发工具，包含自身许可证与第三方声明，不随本项目分发。 / A separately installed development tool with its own license and third-party notices; not redistributed here.
- [ProseMirror](https://github.com/ProseMirror) 与 [esbuild](https://github.com/evanw/esbuild)：MIT，单独安装用于真实编辑器回归，不包含在插件运行时。 / MIT; separate development dependencies for model-based editor tests, not bundled in the extension runtime.
- Chrome / Edge / Chromium 测试浏览器不随项目分发。 / Test browsers are not redistributed with this project.

## 品牌与图片 / Branding and images

- 黑猫 Logo 由项目作者提供；图标文件为该原图的尺寸适配版本。 / The project author supplied the black-cat logo; icon files are size-adjusted versions of it.
- 封面由 AI 辅助生成，用于展示插件概念，非软件界面的逐像素截图。 / Covers were generated with AI assistance to illustrate the plugin concept, not to reproduce the UI pixel for pixel.
- `docs/images/screenshot.png` 来自本地测试页中的实际插件界面；参考素材为测试用示例。 / `docs/images/screenshot.png` shows the actual extension on a local fixture with sample references.
- 项目与 LibTV、Bilibili、Google、Microsoft 无隶属或背书关系。名称用于说明兼容性或链接去向。 / This project is not affiliated with or endorsed by LibTV, Bilibili, Google, or Microsoft. Names identify compatibility or link destinations.

软件许可证见 [LICENSE](LICENSE)。品牌使用不自动获得作者背书或商标授权。 / See [LICENSE](LICENSE) for the software license. Brand use does not automatically grant endorsement or trademark rights.

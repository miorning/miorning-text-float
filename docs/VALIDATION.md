# v0.4.1 验证 / Validation

本轮针对输入 `@` 后出现常驻标题横条的问题。测试使用隔离浏览器、模拟 LibTV 页面结构及生产版扩展文件，没有生成图片或视频，也没有操作日常账号数据。

This patch targets persistent title strips triggered by `@`. Checks use isolated browsers, simulated LibTV structures, and production extension files. No media generation or everyday account data is involved.

## 修复证据 / Regression evidence

修改前复现了三种误判：已存在的节点标题、新出现的横向标题操作栏，以及较大页面中原有标题的文字更新。它们都被错误添加为置顶弹窗。

Before the fix, three cases reproduced unwanted promotion: an existing node title, a newly mounted horizontal title/action bar, and a title update late in a large document.

修复按结构与显示时机判断原生引用列表，不按“测试浮窗·不生产”文字屏蔽。相同名称的真实图片选项仍需可见并可选。

Detection uses native list structure and exposure timing, not a text blacklist. A real image option with that same name must remain visible and selectable.

## 本轮检查 / Current checks

| 检查 / Check | 结果 / Result |
| --- | --- |
| 原生菜单与标题栏 / Native menus and titles | 37 passed, 0 errors |
| 完整编辑流程 / Editor integration | 21 passed, 0 errors |
| 主回归 / Main regression | 53 passed, 0 errors |
| 生产版扩展 / Production MV3 | Passed; source hashes unchanged |
| 语法与资源 / Syntax and assets | 26 scripts, 15 assets passed |
| 安装包预览 / Packaged preview | 6 checks passed, 0 errors |

[修复后截图 / Fixed layout](images/v041-title-menu-fixed.png)

[本轮验证记录 / Current report](validation-v041.json) · [上版完整记录 / Prior full report](validation-v040.json) · [源码与构建 / Build](../SOURCE.md)

## 实站边界 / Live-site limits

本轮尝试打开已知 LibTV 测试画布，但浏览器读取超时，未完成用户登录态下的实际菜单验收。模拟结构与真实扩展检查不能保证所有平台最新页面都已适配。

Reading the known LibTV test canvas timed out, so the signed-in live menu was not verified in this iteration. Fixture and extension checks do not establish compatibility with every current platform page.

更新后请重新加载扩展并刷新 LibTV 页面；旧脚本已修改的页面元素需要刷新才能恢复。无需卸载或清空历史。

Reload the extension and refresh LibTV after updating to restore elements affected by the old script. Uninstalling or clearing history is unnecessary.

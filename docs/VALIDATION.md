# v0.4.4 验证 / Validation

本轮修复小云雀实际域名 `www.xiaoyunque.com` 与 `xiaoyunque.com` 遗漏适配的问题，覆盖画布及 Agent 聊天框。即梦的换行路径保持不变，提示词保险栓 v1.8.0 无需更新。

This patch enables the verified newline path on Xiaoyunque’s actual www and apex hosts for canvas and Agent chat inputs. Jimeng retains its working path; Prompt Guard v1.8.0 requires no update.

## 根因与修复 / Cause and fix

v0.4.3 只匹配即梦及小云雀旧域名 `xyq.jianying.com`。新域名因此仍使用通用 BR 插入方式，网站段落模型将其解析为空格。使用真实 v0.4.3 安装包，已在两个新域名、两种输入框、两种按键组合中复现此问题。

v0.4.3 recognized Jimeng and the legacy Xiaoyunque host only. The new hosts fell back to BR insertion, which their paragraph model parsed as a space. The actual v0.4.3 package reproduces this across both new hosts, both input modes, and Enter / Shift+Enter.

公开前端确认新旧域名使用相同编辑器资源。v0.4.4 将新域名加入精确匹配，沿用网站原生 Shift+Enter 段落命令。普通 Enter 与提交组合不会转发；没有更改网页权限或保险栓，也没有添加页面主环境桥接。

The public frontend serves the same editor assets on the new and legacy hosts. v0.4.4 adds exact host matches and invokes the existing native Shift+Enter paragraph command. Plain Enter and submit combinations are not forwarded. Permissions and Guard remain unchanged; no page-main-world bridge is added.

公开来源：[小云雀首页](https://www.xiaoyunque.com/home)、[官方编辑器资源](https://lf3-lv-buz.vlabstatic.com/obj/image-lvweb-buz/ies/pippit/platform_xyq/static/js/async/91662.f484a35490.js)。资源哈希与模块位置见[来源记录](v044-source-findings.json)。第三方网站源码不随包分发。

## 当前检查 / Current checks

| 检查 / Check | 结果 / Result |
| --- | --- |
| 旧安装包复现、四域名模型与显示、相似域名排除 / Baseline, host models and geometry | 26 passed, 0 errors |
| 真实双扩展、两种加载顺序、画布和聊天 / Paired production extensions | 72 passed, 0 errors |
| 主回归 / Main regression | 53 passed, 0 errors |
| 生产 MV3 安装与存储 / Production MV3 | Passed, no source drift |
| 语法与资源 / Syntax and resources | 35 scripts, 17 assets |
| 安装包预览 / Packaged preview | 6 passed, 0 errors |

[完整记录 / Full report](validation-v044.json) · [v0.4.3 历史记录 / Prior report](validation-v043.json) · [复现与构建 / Build](../SOURCE.md)

检查包括持久化模型、可见字符行坐标、确认保存、重新打开、图片引用与原生点击、Esc 关闭和保险栓在普通输入框中继续生效。生成计数及页面错误均为零。

Checks cover durable model text, visible glyph rows, confirmation, reopening, image references and native clicks, Esc closure, and Guard protection in the original field. Generation counts and page errors are zero.

## 实站边界 / Live-site limits

本轮核对了真实公开前端源码，并使用固定版本的官方 ProseMirror 库和真实生产扩展验证。浏览器检查运行于隔离配置下的本地测试页，不等同于用户登录态画布及聊天框验收。原生操作系统输入法候选交互未自动化。

Public frontend source was inspected and tested with pinned official ProseMirror libraries and production extension manifests. Browser checks use local fixtures in disposable profiles, not signed-in platform canvases or chats. Native OS IME candidate interaction was not automated.

**更新 / Update:** 覆盖原安装目录中的文本窗文件，重新加载扩展，再刷新小云雀网页。无需更新保险栓，无需卸载或清空历史。

Replace the existing Text Float files, reload the extension, and refresh Xiaoyunque. No Guard update, uninstall, or history reset is required.

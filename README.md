# 喵咛文本窗 · Miorning Text Float

把网页小文本框展开成可拖动、可缩放的编辑窗口，保留文本版本与原生图片引用。

A floating editor for web text fields, with local version history and LibTV image references.

界面目前为中文，文档提供中英双语。 / UI is currently Chinese; documentation is bilingual.

[English](README.en.md) · [下载 v0.2.0](https://github.com/miorning/miorning-text-float/releases/tag/v0.2.0) · [B站](https://space.bilibili.com/353186187)

![喵咛文本窗封面；AI 生成的营销示意，并非实际界面](docs/images/cover.png)

## 功能

- 点击输入框展开；拖动移动，四边与四角调整宽高，字号可调。
- 记住窗口位置、尺寸、字号和“保留原文字”选项。
- 自动保存初始内容与编辑草稿；修改旧版本会另建版本，原版保留。支持删除、横向滚动和滑块选版。
- LibTV 沿用原生 `@` 引用；输入完整参考图名显示灰色提示，按 `Tab` 才插入引用。默认替换原文字，可改为保留。
- 设置中自行添加网站；其他网站使用通用输入框适配，专有图片引用需要另行适配。

![本地测试页中的实际编辑窗口](docs/images/screenshot.png)

## 安装

1. 下载 Release 中的 `MiorningTextFloat-v0.2.0.zip` 并解压。
2. Chrome / Edge 扩展管理页开启“开发者模式”。
3. 选择“加载已解压的扩展程序”，加载包内的 **extension** 文件夹。
4. 刷新 LibTV，点击提示词输入框。其他网站：**设置 → 添加网站 → 授权 → 刷新网页**。

更新时替换原安装目录中的文件，再重新加载扩展并刷新网页。卸载扩展会清除本机历史，请勿通过卸载来更新重要记录。

## 操作与版本

`Enter` 换行 · `Ctrl + Enter` 确认并关闭（macOS 也可 `Cmd + Enter`）· `Alt + Shift + E` 开启 / 暂停。

首次打开保存版本 1，编辑建立新版本；草稿自动保存，确认后正式保存。查看旧版本会同步到原输入框，再编辑时创建新版本。没有人为数量上限，实际受设备存储限制。

历史仅保存在当前浏览器本机，按网站和可识别输入框隔离；匿名动态输入框不保证刷新后续接历史。确认输入不会触发图片或视频生成。

## 兼容与数据

Chrome / Edge 120+，LibTV 默认启用。浏览器内部页、闭合 Shadow DOM、跨域 iframe、纯画布输入及部分复杂编辑器不保证兼容。

无遥测、文本上传或生成 API；原网站仍可按自身逻辑保存编辑内容。详见 [隐私说明](docs/PRIVACY.md) 与 [测试范围](docs/VALIDATION.md)。

50 项浏览器检查、19 项存储检查、14 项网站设置检查通过；已登录 LibTV 的完整安装联合测试、真实系统中文输入法和首次网站授权弹窗仍需手动验证。

## 开源

代码采用 [GPL-3.0-or-later](LICENSE)。分发修改后的衍生版本须遵守 GPL，并向接收者提供对应源码；私人使用或修改不要求公开发布，输入文本不受此要求约束。

[开发与构建](SOURCE.md) · [更新说明](RELEASE-NOTES.md) · [素材与依赖](THIRD_PARTY_NOTICES.md) · [声明](NOTICE.md)

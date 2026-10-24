# 测试范围 / Validation scope

v0.2.0 的验证区分本地自动化测试与已登录网站的联合实测。 / Validation for v0.2.0 distinguishes local automated tests from full integration on a signed-in website.

| 检查 / Check | 结果 / Result |
| --- | --- |
| 浏览器功能 / Browser behavior | 50 通过 / passed |
| 存储逻辑 / Storage logic | 19 通过 / passed |
| 网站设置 / Website settings | 14 通过 / passed |

[浏览器检查完整报告 / Full browser check report](validation-report.json)

## 已覆盖 / Covered

- 拖动、八方向缩放、字号、键盘确认、设置恢复。 / Dragging, eight resize directions, text size, keyboard confirmation, and restored settings.
- 初始版本、草稿、旧版分叉、删除与单调编号、大量版本导航。 / Initial versions, drafts, forks from older versions, deletion with monotonic numbering, and large-history navigation.
- 原生引用保留、灰色提示和 `Tab` 接受、保留文字选项。 / Reference preservation, gray suggestions, `Tab` acceptance, and optional name retention.
- 隔离测试配置中实际加载 MV3 扩展、存储恢复及失败重试。 / Actual MV3 extension loading, storage recovery, and failure retry in an isolated test profile.
- 预授权配置中的网站添加、动态注册、刷新注入、停用、重新启用与移除。 / Website addition, dynamic registration, injection after refresh, disable, re-enable, and removal in a pre-authorized profile.

浏览器自动化使用本地模拟页，并拦截外部请求；不读取日常浏览器的账号或配置。 / Browser automation uses local fixtures and blocks external requests; it does not read everyday browser accounts or profiles.

## 尚未完整验证 / Not fully verified

- 完整插件安装到已登录 LibTV 后的联合流程。 / The complete installed extension workflow on signed-in LibTV.
- 真实操作系统中文输入法的候选窗口；合成 composition 事件不能替代它。 / Real OS Chinese IME candidate windows; synthetic composition events are not a substitute.
- 首次添加网站时浏览器展示的权限弹窗；预授权测试不覆盖此步骤。 / Browser permission dialogs on first-time site addition; pre-authorized tests do not cover that step.
- 每个自定义网站的复杂编辑器和专有图片引用。 / Every custom website’s complex editor and proprietary image-reference system.

此前曾在获准的新建 LibTV 测试画布检查原生输入框、引用菜单、引用标识及节点身份；这不等同于完整扩展的已登录联合测试。没有生成视频。

Earlier checks on an authorized new LibTV test canvas inspected the native field, reference menu, reference identifiers, and node identity. This is not equivalent to full signed-in extension integration. No video was generated.

复现命令见 [SOURCE.md](../SOURCE.md)。截图来自本地测试页；封面是 AI 生成的营销示意。 / See [SOURCE.md](../SOURCE.md) for reproduction commands. Screenshots come from local fixtures; cover art is AI-generated promotional illustration.

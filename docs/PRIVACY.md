# 隐私与权限 / Privacy and permissions

- 本插件默认在普通 HTTP / HTTPS 网页运行，点击文本区域才展开编辑；浏览器仍控制实际的网站访问权限。 / The extension runs on ordinary HTTP / HTTPS pages and expands clicked editable fields; browser site-access controls still apply.
- 文本版本、草稿、窗口偏好、图标位置、快捷键及全局开关保存在本机扩展存储。没有分析统计、提示词上传或生成 API。 / Versions, drafts, preferences, dock position, shortcuts, and the global switch stay in local extension storage. No analytics, prompt-upload service, or generation API.
- 直接编辑原输入框，原网站可能按自己的机制保存输入。本插件不代替网站的隐私政策。 / The original field is edited directly; the website may save edits through its own mechanisms.
- 本地 preview.html 使用本地浏览器存储用于演示；正式扩展存储失败时不会改用网站存储。 / The standalone preview uses browser-local storage. The installed extension never falls back to website storage on failure.
- 暂停会关闭文本窗并停止新窗口自动展开，保留文字及历史，猫咪图标继续提供恢复入口。 / Pausing closes the floating editor and prevents new openings while preserving text and history; the cat remains available to resume.
- 清空缓存只删除二次确认中所选网站的本插件文本版本与草稿。全局开关、快捷键、窗口及图标偏好保留；网站作品、登录信息和网站本身缓存不会清理。 / Confirmed cache clearing deletes only selected sites' extension versions and drafts, preserving preferences and website data.
- 缓存大小是记录键名与内容的 UTF-8 JSON 字节数，不等于磁盘占用。 / Cache size measures serialized UTF-8 JSON data, not physical disk use.

## 权限 / Permissions

`storage` / `unlimitedStorage`：保存本机历史与设置，无人工版本数量上限，仍受设备容量限制。 / Store local versions and preferences, limited by device capacity.

`scripting` 与 HTTP / HTTPS 网站访问：在普通网页放置编辑窗及吸边图标，升级时清理旧站点注册并加载新脚本。 / Inject the editor and dock, and migrate old site registrations.

`activeTab`：用户主动通过浏览器工具栏访问时可提供当前页扩展能力。 / Support user-initiated toolbar access.

不读取浏览器历史、Cookie、密码或凭证。受保护页面不注入；嵌入式特殊编辑器可能不兼容。 / No browser-history, cookie, password, or credential APIs. Protected pages are excluded; special embedded editors may remain incompatible.

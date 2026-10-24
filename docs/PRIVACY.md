# 隐私与权限 / Privacy and permissions

## 保存什么 / Stored data

插件在当前浏览器配置的本机扩展存储中保存文本版本、草稿、窗口设置与网站列表。不跨设备同步。历史包含文本及已有引用的标识和显示信息，不上传或复制参考图片文件。

The extension stores text versions, drafts, window settings, and website lists locally in the current browser profile. It does not sync across devices. History includes text plus existing reference identifiers and display information, without uploading or copying reference image files.

本地体验页使用单独的 IndexedDB，与已安装扩展的数据分开。 / The local preview uses separate IndexedDB storage, independent from the installed extension.

## 网络与原网页 / Network and the original website

没有遥测、文本上传、Cookie 读取或生成 API。编辑直接作用于原输入框，会触发原网站自身的事件和保存行为；该网站仍受其隐私政策约束。

There is no telemetry, text-upload service, cookie access, or generation API. Editing acts on the original field and triggers the website’s own events and saving behavior; the website remains governed by its own privacy policy.

点击作者链接会打开 B站；已有参考图片的显示遵循原网页与浏览器的正常网络行为。 / The creator link opens Bilibili. Displaying existing reference images follows the page’s and browser’s normal network behavior.

## 权限 / Permissions

| 权限 / Permission | 用途 / Purpose |
| --- | --- |
| `storage`, `unlimitedStorage` | 本机历史、设置和网站列表；无人工版本数量上限 / Local history, settings, and sites; no artificial version-count limit |
| `activeTab`, `scripting` | 当前页启用与获准网站的脚本加载 / Current-page activation and injection on approved sites |
| LibTV 网站访问 / LibTV site access | 默认文本窗适配 / Default editor integration |
| 可选 HTTP / HTTPS 网站访问 / Optional HTTP / HTTPS access | 仅在添加具体网站时申请相应权限 / Requested for a specific website when you add it |

可选域权限的声明允许申请其他网站，不表示首次安装就已取得所有网站的访问权限。 / Declaring optional host permissions allows later requests; it does not grant access to every website on installation.

## 删除与保留 / Deletion and retention

可以逐个删除文本版本。移除网站会撤销该站访问并保留其版本；卸载扩展或清除扩展存储会删除本机记录。删除原画布参考节点后，恢复历史不会重建节点或连线。

You can delete individual text versions. Removing a site revokes its access while retaining its history. Uninstalling the extension or clearing its storage deletes local records. Restoring history cannot recreate deleted canvas nodes or connections.

设备存储有限；保存失败时插件会提示，确认流程保持窗口打开以便重试。 / Device storage is finite. Save failures are reported, and confirmation keeps the window open for retry.

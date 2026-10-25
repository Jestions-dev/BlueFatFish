# 隐私政策 / Privacy Policy

**Blue Fat Fish 新标签页**（以下简称"本扩展"）

最后更新：2026-10-25

## 中文

本扩展**不收集、不上传、不共享任何用户数据**。

### 数据存在哪里

所有数据都只存在你本机的浏览器里：

| 内容 | 位置 |
| --- | --- |
| 标签、壁纸设置、布局、开关 | `chrome.storage.local` |
| 壁纸文件、自定义图标、抓到的站点图标 | 本扩展自己的 IndexedDB |

没有账号、没有服务器、没有统计埋点、没有广告。

### 网络请求

本扩展只在你使用相关功能时，直接向你指定的网站发起请求：

- **自动抓取站点图标**：当你添加一个标签时，会访问该网站首页和它的图标地址（`/favicon.ico` 等），把图标保存到本地缓存。请求直接发往该网站，不经过任何第三方。
- **你设置的壁纸**：如果你把壁纸设成网址、B 站或 YouTube 视频、或某个网页，扩展会加载那个地址。
- **图标地址**：如果你手动填了图标 URL，或标签本身引用了外部图片，会加载该图片。

除此之外没有任何网络请求。

### 权限用途

| 权限 | 用途 |
| --- | --- |
| `storage` / `unlimitedStorage` | 保存你的标签、壁纸和设置 |
| `http://*/*`、`https://*/*` | 读取网站图标；加载你指定的壁纸地址 |
| `chrome_url_overrides.newtab` | 用本页面替换新标签页 |

### 联系

有问题请开 issue：https://github.com/Jestions-dev/BlueFatFish/issues

---

## English

This extension collects **no user data**. It has no server, no account system, no analytics, and no ads.

All configuration lives in `chrome.storage.local`, and all binary assets (wallpapers, custom icons, fetched favicons) live in the extension's own IndexedDB — both are local to your browser profile.

The only network requests are ones you trigger directly:

- fetching a site's favicon when you add a bookmark (request goes straight to that site),
- loading a wallpaper or icon URL that you provided.

Contact: https://github.com/Jestions-dev/BlueFatFish/issues

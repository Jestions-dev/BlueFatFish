# Blue Fat Fish 新标签页

<p align="center">
  <img src="docs/stickers/heart.gif" width="56" alt="">
  <img src="docs/stickers/sing.gif" width="56" alt="">
  <img src="docs/stickers/knock.gif" width="56" alt="">
  <img src="docs/stickers/wave.gif" width="112" alt="Blue Fat Fish">
  <img src="docs/stickers/magic.gif" width="56" alt="">
  <img src="docs/stickers/dance.gif" width="56" alt="">
  <img src="docs/stickers/melon.gif" width="56" alt="">
</p>

蓝色大肥鱼（DeepSeek 那只）的浏览器起始页：蓝底 + 一堆会弹跳、能被捏的鱼。

纯本地：不上传任何数据，断网也能开。

## 特点

- **玩具箱背景**：蓝底 + 随机 5~12 条大肥鱼。无重力、完全弹性、有空气阻尼所以会慢慢停下；撞墙按入射角反弹；可以拖起来甩，拖动时会把别的鱼撞飞（传冲量）；每次刷新随机挑**一条**能被捏——短按松手会「叽」一声（小黄鸭音效）并冒泡，按住不放就是拖。
- **自定义壁纸**：本地图片 / GIF / 动图 / 视频，或者直链、任意网页、B 站 / YouTube 视频页（自动转嵌入播放器）。
- **自定义标签**：自动抓站点图标（页面 `<link rel=icon>` → `/favicon.ico` → 主域名兜底，缓存到本地）；抓不到就用文字图标，最多 8 个字、字号自适应；也可以上传自己的图当图标。
- 时钟 / 日期可关；压暗、模糊滑杆。
- 数据全在本机，没有任何网络请求（除了首次抓图标）。

## 安装

**方式一：Edge 加载项商店（推荐）**

[在 Microsoft Edge 加载项商店安装 →](https://microsoftedge.microsoft.com/addons/detail/blue-fat-fish-%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/lelcpophjkpjdpnijiabonajapegkbjm)

装完直接 `Ctrl+T`。商店会负责更新，不用手动换包。

**方式二：下载 zip 解压加载**（想改代码、或商店装不上时用）

1. 从 [Releases](https://github.com/Jestions-dev/BlueFatFish/releases) 下载 `BlueFatFish-x.y.z.zip`
2. 解压到一个不会随手删掉的位置
3. 打开 `edge://extensions/`（Chrome 是 `chrome://extensions/`）
4. 打开 **开发人员模式**
5. 点 **加载解压缩的扩展**，选中解压出来的文件夹
6. `Ctrl+T` 新开标签页

**方式三：装 crx**

1. 同样先打开 **开发人员模式**
2. 把 `.crx` 拖进扩展页面，确认安装

> Edge / Chrome 对非商店来源的 crx 有拦截，装不上就用方式二，效果一样。

商店版、crx、解压加载三者的扩展 ID 各不相同，**配置互不相通**（一边的标签不会自动出现在另一边）。


## 使用

右下角齿轮打开设置。

- **壁纸**：选文件 / 贴链接 / 点「玩具箱背景」
- **标签**：设置里增删改，用 ↑↓ 调顺序；图标三种模式（自动 / 文字 / 上传）
- **显示**：时钟、日期；「自定义壁纸上也放鱼」（默认关，打开后数量自动少 2 条）、鱼数量滑杆（0 = 自动，按屏宽算）

## 数据存哪

| 内容 | 位置 |
| --- | --- |
| 配置（壁纸、标签、开关） | `chrome.storage.local` 的 `config` |
| 壁纸文件、上传的图标、抓到的站点图标 | IndexedDB `bluefatfish` |

## 给未来的 DSH 插件留的接口

扩展里有个 service worker（`background.js`），监听 `chrome.runtime.onMessageExternal`，只接受来自 `http://localhost/*` 和 `http://127.0.0.1/*` 的页面。

```js
chrome.runtime.sendMessage('fgknaliolciojhmchpbiiojmdfakjepe', { type: 'ping' }, (res) => console.log(res));
// { ok: true, protocol: 'bff/1', name: 'Blue Fat Fish', version: '0.4.2' }
```

| type | 参数 | 说明 |
| --- | --- | --- |
| `ping` | — | 探活 |
| `emotions` | — | 占位，保留 |
| `open` | `url`, `active?` | 新开标签页 |
| `navigate` | `url` | 当前标签页跳转 |
| `newtab` | — | 打开新标签页 |
| `react` | `text?`, `ms?` | 随机挑一条鱼说话 + 弹一下 |

回复统一是 `{ ok, protocol: 'bff/1', ... }`，出错是 `{ ok: false, error }`。

## 目录

```
manifest.json        MV3 清单
background.js        对外消息桥
newtab.html          页面
assets/app.js        主逻辑 + 设置面板
assets/store.js      存储 + 抓图标
assets/wallpaper.js  壁纸引擎
assets/toys.js       玩具箱物理
assets/style.css     样式
assets/toys/         表情包（157 个 WebP + index.json）
assets/sfx/          小黄鸭音效
icons/               扩展图标
```

## 已知限制

- **网页当壁纸**：不少站点发 `X-Frame-Options`，嵌不进去只能白屏；B 站 / YouTube 走官方播放器 iframe 没问题。
- **自动抓图标**首次需要联网，抓完就缓存。
- 少数表情包原本带底色（彩底、黑底），抠不掉。

## 素材

- 表情包：外部作者绘制，作者声明免费可商用，感谢。
- 小黄鸭音效：来自 `dsh-whale-widget`（MIT）。
- 扩展图标：由「打招呼」表情裁切生成。

## 许可

代码采用 MIT（见 [LICENSE](LICENSE)）。表情包版权归原作者，音效来自 `dsh-whale-widget`（MIT）。

<p align="center">
  <img src="docs/stickers/pat.gif" width="96" alt="">
  <img src="docs/stickers/like.gif" width="96" alt="">
</p>

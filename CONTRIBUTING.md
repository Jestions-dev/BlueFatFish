# 参与开发

欢迎提 Issue 和 PR。这个项目刻意保持**简单**：没有构建步骤、没有依赖、没有打包器。

## 本地跑起来

不需要 `npm install`，直接把仓库目录当扩展加载：

1. 打开 `edge://extensions/`（Chrome 是 `chrome://extensions/`）
2. 打开 **开发人员模式**
3. **加载解压缩的扩展** → 选这个仓库根目录
4. `Ctrl+T` 看效果

改完代码后回扩展页点一下**重新加载**（改了 `manifest.json` 或 `_locales/` 的话，要**完全退出浏览器**再开，语言资源包是加载时建的）。

## 代码结构

```
manifest.json     扩展清单
newtab.html       新标签页骨架
_locales/         语言包（en 是默认，zh_CN 是中文）
assets/app.js     主逻辑 + 设置面板
assets/store.js   存储、IndexedDB、抓图标
assets/wallpaper.js  壁纸引擎
assets/toys.js    鱼群物理
assets/i18n.js    文案查表
assets/locales.js 由 _locales/*/messages.json 生成，不要手改
assets/style.css  样式
assets/toys/      表情包（WebP + index.json）
```

## 改动的几条约定

- **不加依赖**。需要什么就写几行原生 JS，别引框架。
- **不改 `_locales/` 之外的地方写死中文**。界面文案一律走 `t('key')`，两份语言包要同时加。
- 改完 `_locales/*/messages.json` 之后，`assets/locales.js` 要重新生成一次（它给“手动切换语言”用），否则设置里切语言时新文案不生效。
- **别动 `assets/toys/`** 里的素材处理逻辑，除非你在改抠图算法——那批 WebP 是离线生成好的。

## 提交 PR

1. 一个 PR 只做一件事，标题写清楚改了什么
2. 说明**为什么**改，而不只是改了什么
3. 涉及界面的改动附一张截图（亮色/暗色都行，一张就够）
4. 保持现有风格：中文注释只写在逻辑不明显的地方

## Issue

用模板填。最有用的是这三样：**浏览器版本**、**是怎么装上的**（商店 / zip / crx）、**复现步骤**。缺这三样的 issue 很难跟。

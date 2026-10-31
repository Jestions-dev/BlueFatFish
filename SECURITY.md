# 安全策略

## 报告问题

**请不要在 Issue 里公开安全问题。** 用 GitHub 的私密报告通道：

👉 https://github.com/Jestions-dev/BlueFatFish/security/advisories/new

（仓库 **Security** 标签页里的 “Report a vulnerability”。）

报告里写清楚这些会更快定位：

- 受影响的版本（设置面板底部能看到；或 `edge://extensions` 里的版本号）
- 怎么装上的（Edge 商店 / zip 解压加载 / crx）
- 复现步骤，以及你预期的行为
- 如果涉及权限、跨域读取或本地存储，请说明具体是哪一处

## 处理方式

个人项目，尽力在 **7 天内**给首次回复。确认后会在修复版本发布时公开致谢（除非你希望匿名）。

## 范围

这个扩展是纯本地的：没有后端、没有账号、没有遥测。以下几类属于关注范围：

- 通过 `externally_connectable`（只对 `localhost` / `127.0.0.1` 开放）越权触发的行为
- 图标抓取过程中对响应内容处理不当（例如把非图片内容当图片解析）
- 本地存储（`chrome.storage.local` / IndexedDB）被其它页面读取
- 依赖的 iframe 嵌入（B 站 / YouTube）带来的点击劫持类问题

不属于范围：表情包素材本身的版权问题（见 [README](README.md#素材)）、商店审核政策、以及需要先物理接触设备才能利用的问题。

## 支持版本

只对**最新发布版本**提供修复。老版本请先升级再报告。

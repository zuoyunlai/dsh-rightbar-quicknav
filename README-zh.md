# dsh-rightbar-quicknav

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c78ff)](https://github.com/deepseek-ai/deepseek-harness)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**DeepSeek Harness（DSH）右侧栏快捷导航 —— 一条竖排图标轨，一步跳到任意右侧栏标签。**

> [English](README.md) · 简体中文 · [日本語](README-ja.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

## 它解决什么问题

DSH 把每个右侧栏功能（文件、Git、任务、终端、浏览器、图像工作台、记忆系统……）都收在一条标签条里，要用得先展开右栏、再找标签。本插件在**「打开右侧边栏」图标正下方**常驻一条竖排图标轨：

- **收起态只露 3 格** —— 平时几乎不占注意力；
- **鼠标悬停**，向下展开全部可用标签；
- **悬停某个图标**，左侧浮出该标签标题；
- **点击图标**，右侧栏直接开在那个标签上 —— 一步到位，而不是三步。

列表不是写死的：它读取宿主自己的标签注册表（`sidebarRightTabs.guide()`），所以任何插件注册的标签都会自动出现在轨道里。

## 安装

### 通过插件管理器（推荐）

`插件 → 添加`，指向本包（npm 包或本地目录）。bundle patch 会把客户端半边接进 Web / Desktop profile。

### 手动

```bash
cd ~/.dsh/profiles/<你的 profile>
pnpm add dsh-rightbar-quicknav
```

然后**完全重启 DSH** —— 客户端模块在启动时组装，刷新页面不够。

## 环境要求

- DSH `>= 0.2.1-rc.1`（需要 `sidebarRightTabs` / `sidebarRight` 客户端服务）
- React 由宿主提供 —— 本插件**零运行时依赖**、**无构建步骤**

## 交互细节

| | |
|---|---|
| 位置 | 视口右缘留 `10px`；宿主「打开右侧边栏」按钮下方 `50px` |
| 收起态 | 3 格图标 |
| 展开 | 悬停（指针离开后 200ms 收起） |
| 标题气泡 | 单行自适应宽度；左侧放不下时自动翻到另一侧 |
| 跳转 | `sidebarRight.openTab(kind)` |
| 何时隐藏 | 右栏已展开，或当前没有会话在屏 |

## 设计边界

- 只挂 additive 的 `shell.overlay` 插槽，**不覆盖、不替换**任何官方 UI。
- 视觉**全部走内联 React 样式**：宿主没有 `styles` 服务，写类样式会静默失效。
- 几何定位**事件驱动**（`MutationObserver` + `ResizeObserver`），稳态零轮询、零强制布局。
- 锚点就是宿主自己的按钮，用稳定属性 `data-sidebar-right-expand` 定位，回退按 `aria-label` 匹配；两者都匹配不上时退回默认位置并打一行警告，而不是消失或乱锚。
- 键盘可用：轨道是 `toolbar`，带 roving tabindex 与方向键，`Esc` 关闭气泡，焦点轮廓只在键盘聚焦时出现。
- 尊重 `prefers-reduced-motion`；渲染期异常由 ErrorBoundary 兜底，不会让整条 slot 白屏。
- 界面文案中英双语，并在宿主提供 locale 服务时注册到 `rightbarQuicknav` 命名空间。

## 审计记录

本插件经过一轮全量审计与后续修订，全部在仓库里：

- [`AUDIT-2026-11-06.md`](AUDIT-2026-11-06.md) —— 全量审计：评分、问题清单、整改路线
- [`AUDIT-a11y.md`](AUDIT-a11y.md) —— 交互与可访问性复核
- [`AUDIT-perf.md`](AUDIT-perf.md) —— 性能与资源复核
- [`AUDIT-2026-11-06-REMEDIATION.md`](AUDIT-2026-11-06-REMEDIATION.md) —— 逐条核实与修订处置台账

## 开发

```bash
node --check client.js     # 语法检查
node --test tests/         # 渲染冒烟测试（零依赖）
```

渲染冒烟测试会加载真实的 `client.js`，用最小 React 桩驱动插件自己的 `apply() → slots.inject → slots.register` 路径，断言渲染与 effect 都不抛错。它存在的原因很直接：曾经 effect 里一个未定义标识符，就让整条轨道静默消失了。

## 发版

**只从 CI 发布，不从开发者本机发布。**

1. 同时改 `package.json` 的 `version` 与 `client.js` 里的 `VERSION` 常量 —— 两者必须一致
2. 在 [`CHANGELOG.md`](CHANGELOG.md) 加一节 `## [x.y.z]`
3. 提交到 `main`
4. `git tag vX.Y.Z && git push origin vX.Y.Z`

推送 tag 会触发 [`.github/workflows/publish.yml`](.github/workflows/publish.yml)：

- 断言 tag == `package.json` 版本 == `client.js` 的 `VERSION`（`scripts/verify-version.mjs`）
- 跑语法检查与测试
- 用 **npm Trusted Publishing（OIDC）** 发布并生成来源证明 —— 不需要 `NPM_TOKEN`，也不会弹 2FA
- **等 npm 真的提供该版本**：`npm publish` 在 npm 处理队列期间同样会返回成功，
  少了这道等待就会出现「workflow 绿了、npm 上查不到」的假成功
- 打包 tgz，并从 CHANGELOG 对应小节生成 GitHub Release

本包**故意关闭了本机 `npm publish`**：发布权限要求 2FA 且禁止 bypass-2FA token，本机发布只会落进 npm 的队列。

如果本机 `github.com:443` 连不上，用 `node scripts/push-via-api.mjs` 走 Git Data API 推送（tree 哈希相同，提交 SHA 不同）。

## 许可

MIT

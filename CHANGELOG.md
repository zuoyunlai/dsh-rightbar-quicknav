# CHANGELOG

本文件记录 dsh-rightbar-quicknav 的版本变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.3.9] — 2026-11-06

发版链路迁移到 npm Trusted Publishing（OIDC）。代码内容与 0.3.8 相同。

### 为什么要换 0.3.9

`0.3.8` 用本机 token 发布时被 npm 收进了**暂存发布（staged publish）队列**等 2FA 确认：
注册表公开元数据里查不到它、`npm stage list` 也列不出（该 token 无查看权限），
再次发布直接 `409 Cannot publish over previously staged version "0.3.8"`。
包的首个版本（0.3.6）能直接落地，从第二个版本起就要求 2FA。
本地 token 无法代替人工确认，所以：

- `0.3.8` 停在暂存态，**从未公开**，作废不复用；
- `0.3.9` 内容与 0.3.8 一致，改由 CI 用 OIDC 发布，绕开 2FA。

### 变更

- 新增 `.github/workflows/publish.yml`：推 `v*` tag 时用 **npm Trusted Publishing（OIDC）** 发布，
  不需要 `NPM_TOKEN`、不受「发布需 2FA」限制，并顺带 `--provenance` 生成来源证明；
  发布成功后自动 `npm pack` 并把 tgz 上传到 GitHub Release（`--latest`）。
- 新增两个发版辅助脚本：
  - `scripts/verify-version.mjs` — 断言 tag == `v{package.json version}` 且与 `client.js` 的 `VERSION` 一致；
  - `scripts/release-notes.mjs` — 从 CHANGELOG 抽出当前版本一节作为 Release 说明。
- **本地不再执行 `npm publish`**：本机 token 只会把版本推进暂存队列。

## [0.3.8] — 2026-11-06

语义默认图标：没有自带图标的条目不再共用同一个立方体。

### 变更

- **新增一层语义默认图标**：条目没声明 `icon` 时，按 `kind` 与标题（中英关键词一起匹配）挑一个贴切的矢量图标：
  图片/画廊→`image`、Git→`git`、终端→`terminal`、任务/定时→`tasks`、记忆/上下文→`db`、
  浏览器→`globe`、搜索→`search`、统计/用量→`chart`、设置/主题→`sliders`、技能/提示词→`sparkle`、
  MCP/插件→`plug`、代码→`code`、对话→`chat`、文档→`doc`、文件→`file`。
- **匹配不到也不重样**：用 `kind` 的确定性哈希在 `layers / grid / hexagon / dot` 四个中性图标里取一个，
  同一 kind 永远同一个图标，不同 kind 尽量不同。
- **宿主图标优先**：条目自带 `icon` 时仍原样使用（含彩色位图/彩色 SVG，不改造）。
  宿主图标抛错时才回落到该条目的语义图标，不再一律掉立方体。
- 图标全部是内联 SVG（16×16、`stroke=currentColor`、1.25 描边），跟随文字色，无新增依赖。

### 已知边界

宿主自带的图标有彩色也有单色（取决于各插件自己的美术），本插件**不改色**——彩色是那件插件的视觉标识。
如果希望整条轨道统一成单色，可以给图标容器加 `filter: grayscale(1)`，但那会抹掉插件的辨识色，默认不做。

### 测试

新增 2 条回归：`没有自带图标时按 kind/标题给出不同语义图标`、`条目自带图标时优先用自带的`。
合计 5 条，全部通过。

## [0.3.7] — 2026-11-06

国际化兜底修正。

### 变更

- **未知语言一律回落英文**（原来回落中文）：语言判定从「`en` 开头才算英文，否则中文」改为「**只有 `zh` 开头才算中文，其余一律英文**」。
  宿主当前只有 zh / en 两语，这条改动的意义在于：宿主以后新增的语言（ja、es…）以及任何意外取值，都会显示英文而不是中文——对已经进入国际社区榜单的插件，这个方向更安全。
- **`navigator.language` 兜底**：宿主 locale 服务不可用时（老宿主 / 服务缺失），按系统语言判断中英，而不是无条件中文。
  `LANG` 的初值也改成系统语言，避免挂载瞬间用错词典。

### 现状说明

界面上真正会随语言变化的只有 5 条文案（`rail.ariaLabel` / `rail.anchorLabel` / `rail.empty` / `rail.noService` / `rail.openFailed`）；
轨道里图标的**名称来自宿主自己的标签注册表**（`sidebarRightTabs.guide()`），英文宿主下本来就是英文。
`locale/*.json` 只承载插件在宿主插件列表里的 `meta.title` / `meta.description`，不含运行时文案。

## [0.3.6] — 2026-11-06

气泡配色改为「相对主栏的明度微调」，并去掉边框。

### 变更

- **去掉气泡边框**：只靠明度差与轻阴影把它和背景分开。
- **底色按明暗方向微调**：取轨道的实际计算色，**深色模式向白混 10%（变浅一档）、亮色模式向黑混 8%（变深一档）**，
  用 JS 混色而非 `color-mix`（不依赖宿主浏览器能力，也便于把尖头染成同色）。
- 明暗判定读宿主 `body[data-ds-dark-theme]`（`ThemePresenter` 在暗色时设置该属性）。

## [0.3.5] — 2026-11-06

亮色模式下的阴影调整。

### 变更

- **轨道阴影大幅收轻**：`0 10px 28px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.22)` → `0 2px 8px rgba(0,0,0,.10)`。
  原值在深色背景下看不出来，亮色背景上是一块明显的重阴影。
- **气泡阴影同步收轻**：`0 6px 18px rgba(0,0,0,.3)` → `0 2px 8px rgba(0,0,0,.14)`（同一套视觉语言，避免轨道轻了气泡还重）。

## [0.3.4] — 2026-11-06

用户第三次实测反馈（气泡外观）。

### 变更

- **气泡加小尖头**：右侧加一枚 5px 的三角形指向图标；气泡翻到图标右侧时尖头自动换到左侧（跟随翻转方向）。
- **气泡底色改为取轨道的实际计算色**：不再在浮层里重新解析 `--dsw-alias-*`（实测同一 token 在浮层里可能拿到另一档，导致白底黑字）。现在渲染后用 `getComputedStyle(轨道).backgroundColor` 把底色与尖头一起染成轨道的颜色 —— 「气泡底色 = 轨道/主栏底色」是构造上成立的，与 token 解析无关。

## [0.3.3] — 2026-11-06

用户实测反馈的两处修复。

### 修复

- **窗口缩小后轨道消失**：落点闸门里有一条 `锚点右缘 < 视口宽 × 0.55 就隐藏`。但轨道是**视口锚定**（右缘固定 `RIGHT_GAP`），锚点的横向位置与落点无关——窗口一窄、宿主展开按钮往左挪就越线，整条轨道被隐藏。已删除该横向条件，只保留纵向闸门（必须在顶栏区域内、未被裁出视口）。
- **窗口缩放后位置漂移**：`cheapPass` 的变更键只看「锚点身份 / 右栏开合 / 有无座位」，窗口缩放时这三项都不变 ⇒ 不重新定位 ⇒ 轨道停在旧坐标。已加入 `force` 通道：`resize` 与座位变化强制重定位（`MutationObserver` 仍走非强制路径，避免每次 DOM 变动都读几何）。

### 变更

- **标题气泡单行**：去掉 `maxWidth` 与换行，改为 `whiteSpace: nowrap` 自适应宽度；左侧放不下时自动翻到图标右侧，不被视口裁掉。
- **标题气泡底色跟随主题**：由 `--dsw-alias-bg-overlay` 改为与轨道/主栏同一枚 `--dsw-alias-bg-base`（`dsh-theme-palette` 同样覆写该 token），边框用 `--dsw-alias-border-l2`。

## [0.3.2] — 2026-11-06

第四路复核（渲染正确性 + 状态机，jsdom 加载真实 client.js）回收后的追加修订。

### 修复

- **P0 渲染期 ReferenceError**：effect 清理函数引用了未声明的标识符（`cancelClose` / 实际定义 `cancelCollapse`）⇒ 渲染期抛错被 ErrorBoundary 吞掉 ⇒ **整条轨道永远不出现、界面零反馈**。已修正。
- 气泡成孤儿：注册表移除当前条目后气泡仍显示旧标题且无人引用 ⇒ 条目集合变化时清 tip/hover。
- 锚点回退分支由 DOM 顺序决定（可能挂到右栏面板内的「收起」按钮）⇒ 区分「展开/收起」并优先展开按钮。
- 锚点换了不重新定位 ⇒ 变更键加入锚点身份比较。
- 方向键按可见条目数取模会跳过条目 ⇒ 改按全部条目计算，收起态先展开再移动焦点。
- 鼠标点击留下键盘焦点环 ⇒ 用 `:focus-visible` 判定，仅键盘聚焦画轮廓。
- `sidebarRight.mounted` 只轮询不订阅 ⇒ 会话退屏时轨道不隐藏；改为订阅。
- 无条目时 `role="toolbar"` 里没有可聚焦子项（不合语义）⇒ 改用 `role="group"` + `role="status"`。
- tooltip 的 DOM id 多实例重复 ⇒ 改为每实例唯一。
- 气泡坐标是悬停瞬间的快照 ⇒ 改为渲染后按当前布局重测。

### 新增

- `tests/render-smoke.test.mjs`：零依赖渲染冒烟测试（`node --test tests/`），覆盖「渲染期抛错」「收起态格数」「toolbar 语义」。
  护栏已自证：把 P0 重新注入 → 测试失败并报出 `cancelClose is not defined`；恢复 → 全绿。

## [0.3.1] — 2026-11-06

- 审计反哺批次一的收尾：找不到宿主展开按钮时改用默认位置兜底并告警（不再整条消失或乱锚）。

## [0.3.0] — 2026-11-06

全量审计后的反哺批次（依据 `AUDIT-2026-11-06.md` + `AUDIT-a11y.md` + `AUDIT-perf.md`，处置见 `AUDIT-2026-11-06-REMEDIATION.md`）。

### 修复

- **服务就绪竞态**：`sidebarRightTabs` / `sidebarRight` 进入模块 `inject`，缺失时插件静默不激活，不再出现「轨道永远不出现且零报错」；点击时重新解析服务，不再使用渲染期捕获的引用。
- **几何测量去轮询**：删除两个 `setInterval`（400ms / 1000ms）与全文档 `[aria-label]` 扫描，改用 `MutationObserver` + `ResizeObserver` + `resize` 的事件驱动；稳态零轮询、零强制同步布局。锚点优先使用宿主稳定属性 `data-sidebar-right-expand`，回退按 `aria-label` 匹配，匹配不到宁可不显示（不再误锚到别的按钮）。
- **删除死代码**：宿主没有 `styles` 服务（60+ 个客户端包检索零命中），移除 `styles.insert` 双通道与整块 `CSS` 常量（`.dsh-rqn-*` 类名从未生效）。
- **收起态不再裁切**：改为条件渲染前 3 个条目 —— 高度自然精确、不再露半截图标、也不存在「被裁切却仍可 Tab 聚焦」的隐藏焦点项。
- **键盘可达性**：实现 roving tabindex（toolbar 只占一个 Tab 停靠点）、`ArrowUp/Down/Left/Right/Home/End` 方向键、`aria-orientation="vertical"`、`aria-expanded`；焦点轮廓改为内联实现（此前写死在从不生效的类样式里）；标题气泡补 `id` + `aria-describedby` 关联。
- **标题气泡**：移除与自绘气泡重复的原生 `title`；去掉 `whiteSpace: nowrap`，加 `max-width`，避免长标题溢出视口。
- **点击失败可见反馈**：轨道内 `role="status"` 提示条（此前只进 console）。
- **减弱动效**：尊重 `prefers-reduced-motion`。
- **错误边界**：组件渲染期抛错回落为空，不再让整条 slot 条目白屏。

### 变更

- 删除 `conversation.session.header.utilities` 的零尺寸锚点注册 —— 锚点改为直接定位宿主展开按钮，插件不再侵入会话头部。
- 层级由 `z-index: 60/61` 抬到 `900/901`（与宿主 dockkit 浮动层脱钩；宿主 `shell.overlay` 层自带 `z-index:20` 的 stacking context 限制仍在，见审计报告 P1-3）。
- 可见文案接入自带 zh/en 词典，并在宿主 locale 服务可用时注册命名空间 `rightbarQuicknav`（英文界面不再混语）。
- 收起延时由 280ms 收到 200ms。

### 工程

- `files` 移除磁盘上不存在的 `README-zh.md`（`npm pack` 曾静默丢弃）。
- `engines.node` 对齐同族与宿主实际：`^22.19.0 || >=24.0.0`。
- 补 `dsh.manifestVersion: 1`、`author`、`packageManager`、`publishConfig`、`scripts.check`。
- 去掉 `dsh.client.immediately`（无启动期依赖，不占首屏 bootstrap 批次）。
- `cordis.patch.yml` 的 insert 行补 `config: {}`。

## [0.2.2] — 2026-11-05

- 位置微调（距右 10px、居上 50px）。

## [0.2.0] — 2026-11-05

- 形态改为：收起态只露 3 格，悬停向下展开全部条目，悬停单项浮出标题气泡，点击直达右侧栏标签。
- 底色改为与主栏同色并加阴影。

## [0.1.0] — 2026-11-02

- 首版：顶栏右侧竖排图标轨，列出右侧栏标签，点击直达。

# dsh-rightbar-quicknav 修订反哺报告

- 审计基线：[AUDIT-2026-11-06.md](AUDIT-2026-11-06.md)（主稿）· [AUDIT-a11y.md](AUDIT-a11y.md) · [AUDIT-perf.md](AUDIT-perf.md)
- 反哺日期：2026-11-06
- 处置原则：**审计结论不是事实**。每条先以当前源码特征（不按行号——报告成文后代码已多轮迭代，行号漂移）复现核实，再决定修 / 不修 / 接受现状并记录理由。
- 状态图例：`✅ 已修` `🟡 修一半` `⏭ 接受（附理由）` `⏳ 待办`

---

## 一、核实阶段结论（2026-11-06）

核实手段：对当前 `client.js` 做特征检索（18 项存在性 + 10 项缺失性），并用宿主一手事实源复核。

### 1.1 存在性核实（全部命中 = 审计所述问题在当前代码中真实存在）

| 审计条目 | 核实特征 | 结果 |
|---|---|---|
| P1-1 服务就绪竞态 | 渲染期 `service(ctx,'sidebarRightTabs')` + effect 依赖 `[ctx, tabsReg]` + `setRect` 函数式 bail-out | ✅ 坐实 |
| P1-2 全页扫描 | `querySelectorAll('[aria-label]')` + 循环内 `getBoundingClientRect()` | ✅ 坐实 |
| P1-3 层级被困 | `zIndex: 60`（轨道）/ `61`（气泡） | ✅ 坐实（宿主侧成因见性能稿 §5） |
| P1-4 `styles` 死代码 | `styles.insert` / `ctx.get('styles')` / `CSS` 常量块 | ✅ 坐实 |
| P1-5 文案硬编码 | `'aria-label': '右侧栏快捷导航'`、`label: '快捷导航锚点'` | ✅ 坐实 |
| P1-6 裁切按钮可聚焦 | `overflow: 'hidden'` + `maxHeight` + 无 `tabIndex` | ✅ 坐实 |
| P1-7 toolbar 空承诺 / tooltip 孤儿 | `role: 'toolbar'`、无 `onKeyDown`、无 `aria-orientation`；`role: 'tooltip'` 无 `id` | ✅ 坐实 |
| P2-2 裁切高度靠猜 | `collapsedH = RAIL_PAD*2 + COLLAPSED_COUNT*ITEM + 8` | ✅ 坐实 |
| P2-7 双定时器 | `setInterval(report, 1000)` + `setInterval(measure, TICK_MS)` | ✅ 坐实 |
| P2-11 定时器未包 effect | 无 `ctx.effect` | ✅ 坐实 |
| P2-12 files 与产物不符 | `files` 含 `README-zh.md`，磁盘无此文件 | ✅ 坐实 |

### 1.2 缺失性核实（10 项确认缺失）

`tabIndex` · `aria-describedby` · `prefers-reduced-motion` · `ctx.effect` · `locale.register` · `data-sidebar-right-expand` · `mounted` · `onKeyDown` · `aria-expanded` · `ErrorBoundary` —— **全部 0 命中**，与审计一致。

### 1.3 审计自身结论的修正（已在上版报告中留痕，此处固化）

| 原审计结论 | 修正 | 依据 |
|---|---|---|
| `plugin_doctor` X1 FAIL：peer 走廊不相交 → P0 | ❌ **撤销**（机械体检基线错配） | 宿主 `runtime.json` → `desktopVersion: 0.2.2-rc.1`；`satisfies('0.2.2-rc.1','^0.2.1-rc.1',{includePrerelease:true}) === true`；活宿主 `enabled:true` 无 error |
| 「`locale/change` 事件不存在」 | ❌ **伪阳性** | live Client inspection：`'locale/change'(snapshot: LocaleSnapshot): void` |
| 「`guide()` 每次渲染重跑是性能问题」 | ❌ 撤销 | 宿主 JSDoc：`reference-stable entries`，内部不重算 |

---

## 二、处置台账

> 处置过程随做随记，不事后补写。每条给出：现象 → 根因 → 处置 → 验证方式 → 状态。

（批次一至三的逐条记录见下方各节，随修订推进实时更新。）

---

## 三、批次一：P1 全清（2026-11-06，版本 0.2.2 → 0.3.0）

> 处置方式：**重写 `client.js` 主体**（旧版 672 行 → 新版约 760 行），不是打补丁。
> 根因是「轮询 + 裁切 + 类样式」三件事耦合在渲染期，逐处打补丁会留下不一致。

| 审计条目 | 现象 | 根因 | 处置 | 验证方式 | 状态 |
|---|---|---|---|---|---|
| P1-1 服务就绪竞态 | 轨道可能永远不出现且零报错 | 服务在渲染期取；注册表晚到 → 订阅 effect 拿到 undefined；几何稳定 → `setRect` bail out 不重渲染 | ① 服务进模块 `inject`（`['slots','sidebarRightTabs','sidebarRight']`），缺失即静默不激活 ② 条目改为 state，由「注册表订阅 + locale/change」统一收口刷新 ③ 点击时重新解析服务 | `node --check` + 用户重启后 Console 出现 `client v0.3.1 loaded` 且轨道出现 | ✅ |
| P1-2 全页扫描 + 强制布局 | 每 400ms 扫全文档 `[aria-label]` 并逐节点读几何 | 锚点定位靠 DOM 启发式，无稳定钩子 | ① 定位优先用宿主稳定属性 `data-sidebar-right-expand`，回退按 `aria-label` 匹配（只读属性，不读几何） ② 几何测量改事件驱动：`MutationObserver`（DOM 变化，只跑廉价通道）+ `ResizeObserver`（锚点尺寸）+ `resize` ③ 删除两个 `setInterval` | 源码检索：`setInterval` 0 命中、`querySelectorAll('[aria-label]')` 仅存在于**只在匹配失败时**走的回退分支 | ✅ |
| P1-3 层级被困 stacking context | 轨道可能被宿主浮层盖住 | `shell.overlay` 层自带 `z-index:20; position:absolute` → 自成上下文，层内 z-index 页面级只有 20 | 轨道/气泡抬到 900/901（脱开 dockkit 的 60/70/100） | 层级数值已由性能复核从宿主 CSS 坐实；**真实遮挡仍需截图复核**（见审计边界） | 🟡 部分（宿主 stacking context 的硬限制无法从插件侧突破） |
| P1-4 `styles` 死代码 | 类样式从未生效，作者却以为写了 | 宿主 60+ 客户端包零命中 `styles` 服务 | 整块删除 `styles.insert` 双通道与 `CSS` 常量（37 行）；视觉早已全内联 | 源码检索：`styles.insert` / `ctx.get('styles')` / `CSS` 常量均 0 命中 | ✅ |
| P1-5 硬编码中文 | 英文界面混语（WCAG 3.1.2） | 三处中文常量，未接 locale | 自带 zh/en 词典 + `locale` 服务探测 + `locale/change` 订阅；宿主 locale 服务可用时注册命名空间 `rightbarQuicknav`（注册失败则不声明 `locale:` 字段，避免装配失败） | 源码检索：`aria-label`/slot label 均走 `t()` | ✅ |
| P1-6 被裁切按钮仍可聚焦 | 焦点落入不可见区（WCAG 2.4.7 / 2.4.11） | 全量渲染 + `overflow:hidden` 裁切 | **收起态条件渲染前 3 项**（不再裁切）；展开态不再设 `overflow:hidden`；焦点轮廓改内联实现 | 源码检索：`overflow: 'hidden'` / `maxHeight` 均 0 命中 | ✅ |
| P1-7 toolbar 空承诺 + tooltip 孤儿 | 键盘需按 8+ 次 Tab；读屏读不到气泡 | 只声明角色没实现模式；气泡无 id 无引用 | roving tabindex（单 Tab 停靠）+ 方向键/Home/End + `aria-orientation="vertical"` + `aria-expanded`；气泡加 `id` 与按钮的 `aria-describedby` 关联；移除与自绘气泡重复的原生 `title` | 源码检索：`tabIndex`/`onKeyDown`/`aria-describedby`/`aria-orientation`/`aria-expanded` 均已存在 | ✅ |
| P2-1 失败无用户反馈 | 点击无反应，只有 console | `goTab` 用渲染期闭包且失败只打日志 | 点击时重新解析服务；失败在轨道内显示 `role="status"` 提示条（2.4s） | 源码检索：`showFlash` + `role: 'status'` | ✅ |
| P2-2 裁切高度靠猜 | 露半截图标或底部留白 | `collapsedH` 固定公式，分隔线条数随数据变 | 取消 `maxHeight` 估算；内容即高度 | 同 P1-6 | ✅ |
| P2-3 无会话在屏仍显示 | 全局面板上点任何条目必失败 | 只判 `isExpanded()`，未判有无座位 | ① 读 `sidebarRight.mounted.getSnapshot()`（undefined = 没有座位）→ 隐藏 ② 锚点本身即信号：宿主展开按钮只在会话在屏时存在 | 源码检索：`mounted` 已引用 | ✅ |
| P2-4 锚点误锚 | 静默挂到别的按钮下 | 无匹配时退化为「最靠右的任意 aria-label 元素」 | 改为「匹配不到 `data-sidebar-right-expand` 且文案也不匹配 → **默认位置兜底 + 一行 console 警告**」，不再乱锚 | 源码检索：`TOGGLE_ATTR` + 文案正则 + `placeDefault()` | ✅ |
| P2-7 双定时器叠加 | measure 实际 ~3.5 次/秒 | Anchor 1s + Rail 400ms + 订阅链放大 | 两个 `setInterval` 全部删除，改事件驱动 | 源码检索：`setInterval` 0 命中 | ✅ |
| P2-8 亚像素抖动全量重渲 | 最坏 2.5 次/秒重建整棵 Rail | 几何进 React state + 0.5px 容差 | 几何改为**命令式写 DOM style**（不进渲染管线）；条目数组改 state，仅在注册表/语言变化时刷新 | 源码检索：`left`/`top` 不在 React style 里 | ✅ |
| P2-9 不尊重 reduced-motion | 动画恒开 | 未读 `prefers-reduced-motion` | 按 `matchMedia` 结果切换 `transition:'none'` | 源码检索：`prefersReduced()` | ✅ |
| P2-10 触屏不可用 | 展开只认 hover | 无 pointer 兜底 | **本轮未修**：桌面优先插件，且用户明确要求「鼠标悬停出标题」。已记为已知限制 | 见 §五 待办 | ⏭ |
| P2-11 定时器未包 effect | 插件卸载不回收 pending timer | 定时器在 React 组件内 | 两个剩余 `setTimeout`（收起延时 200ms、提示条 2.4s）仍在组件内，但均有组件卸载 cleanup；**模块级已无任何定时器** | 源码检索：组件卸载 cleanup 覆盖两处 | 🟡 部分（doctor K3 仍 WARN，属其静态判定口径） |
| P3-7 无 ErrorBoundary | 渲染期抛错白屏整条 slot | 组件裸挂 | 加 `Boundary`（`componentDidCatch` → 回落 null） | 源码检索：`class Boundary` | ✅ |

### 批次一附带的设计决策

1. **删掉 `conversation.session.header.utilities` 的零尺寸锚点注册** —— 锚点改为直接定位宿主展开按钮，插件不再侵入会话头部（少一个插槽、少一处干扰）。
2. **新增兜底位置**：宿主若改了按钮文案/属性，轨道以默认位置（右上角下移 64px）出现并打一行警告，而不是整条消失或乱锚。
3. **右栏展开时轨道仍隐藏**（维持原行为）——审计 P2-5「一次只能选一个」**接受现状**：面板展开后自带标签条，快捷导航的价值场景正是「面板收起时一步直达」；强行常驻会与面板自身标签条争位。记录为产品取舍，非缺陷。
---

## 三之二、批次一b：第四路复核回收后的追加修订（0.3.1 → 0.3.2）

### 背景：一次「审计干净 → 自己改坏」的记录

第四路复核（渲染正确性 + 状态机，jsdom 24.1.3 + react-dom 18.3.1 加载**真实 client.js**）在 0.3.1 上报了
**1 条 P0 + 3 条 P1 + 4 条 P2 + 2 条 P3**，其中 P0 是：

> `client.js` 的 effect 参数里写了一个**从未声明的标识符** `cancelClose`（文件里定义的是 `cancelCollapse`）。
> 渲染期 ReferenceError → 被我新加的 ErrorBoundary 吞掉 → **整条轨道永远不出现，界面零反馈**。

**必须如实记录**：审计基线 0.2.2 **没有**这个问题——**它是 0.3.0 我自己重写时写进去的笔误**，
逐行通读与前三路复核都没看出来，第四路用 jsdom 跑真实文件才复现。
**教训**：① 前三路复核都没覆盖「渲染期抛错」这一类（它们都是读代码找逻辑问题）；② 我自己写的 ErrorBoundary
把错误吞了，让它变成静默失效——护栏反而掩盖了事故；③ **护栏本身也要被验证**（见下）。

### 追加修订清单

| 条目 | 现象 | 根因 | 处置 | 状态 |
|---|---|---|---|---|
| **P0 渲染期 ReferenceError** | 轨道永远不出现，界面零反馈 | effect 清理函数引用了未定义标识符 `cancelClose` | 改为 `cancelCollapse`（语义本就如此：清 `closeTimer`） | ✅ |
| P1 气泡成孤儿 | 注册表移除当前条目后，气泡仍显示旧标题且无人引用 | tip 只存 index，不校验条目是否还在 | 条目集合变化时清 tip/hover；渲染时只认仍存在的 index | ✅ |
| P1 回退分支锚点由 DOM 顺序决定 | 轨道挂到右栏面板内的「收起」按钮下 | 回退分支取「最后一个匹配项」 | 匹配时区分「展开」与「收起/折叠/关闭」；优先展开按钮；多个则取最靠上（一次几何读） | ✅ |
| P1 锚点换了不重新定位 | 位置错位且不自愈 | `cheapPass` 的变更键只记「有没有锚点」，丢了身份 | 变更键加入锚点身份比较（`el !== anchorRef.current` 即重定位并重挂观察） | ✅ |
| P2 方向键跳过条目 | 收起态按「可见 3 项」取模，键盘走不到后面的条目 | 方向键用可见条数算下标 | 方向键按**全部条目**算下标；收起态先展开再移动焦点 | ✅ |
| P2 鼠标点击留下键盘焦点环 | 鼠标点击也出现 focus 轮廓 | `onFocus` 不区分输入源 | 用 `:focus-visible` 判定，只在键盘聚焦时画轮廓；恢复 `is-hover` 类名钩子 | ✅ |
| P2 `mounted` 只轮询不订阅 | 会话退屏时轨道不隐藏 | 只在 `cheapPass` 里读快照 | 订阅 `sidebarRight.mounted.subscribe()`，座位变化即重判可见性 | ✅ |
| P2 toolbar 内容模型 | 无条目时 toolbar 里没有可聚焦子项 | 空态文案作为 toolbar 直接子节点 | 无条目时容器改用 `role="group"`，空态文案用 `role="status"` | ✅ |
| P3 tooltip id 重复 | 多实例时 `id` 冲突、`aria-describedby` 可能指错 | id 是模块级常量 | 改为每实例唯一（`dsh-rqn-tip-<n>`） | ✅ |
| P3 气泡坐标是快照 | 布局位移后气泡与条目脱节 | 悬停瞬间读一次坐标就存 state | 改为渲染后按当前布局重测（`useLayoutEffect` 命令式写坐标） | ✅ |

### 顺带补上：渲染冒烟测试（零依赖）

新增 `tests/render-smoke.test.mjs`（`node:test`，不需要 jsdom / react-dom）：
用最小 React 桩驱动插件自己的 `apply() → slots.inject → slots.register` 路径，把真实 `client.js` 加载进来渲染，
断言：

1. `apply()` 不抛错；
2. **effect 执行期不抛错**（这正是 v0.3.1 那条 P0 的落点）；
3. 收起态恰好渲染 3 个按钮、容器声明 `role="toolbar"`；
4. 空态不声明 `toolbar`。

**护栏必须自证**：把 P0 重新注入源码后跑测试 → **测试失败并报出 `cancelClose is not defined`**；
恢复后再跑 → 3 项全绿。（第一次写完时测试是「假绿」的——我的桩把 effect 异常吞了；
这也验证了「测试本身也要被审计」。）

`npm test` / `node --test tests/` 均可运行，已加入 `package.json` 的 `scripts`。

---

## 三之三、批次二：用户实测反馈的两处修复（0.3.2 → 0.3.3）

> 来源：用户在 GUI 实测后反馈（2026-11-06）。这两条**都不在审计清单里**，是真实使用中才暴露的，
> 说明「静态审计 + 桩渲染」之后的**人眼实测**仍是不可替代的最后一环。

| 反馈 | 现象 | 根因 | 处置 | 状态 |
|---|---|---|---|---|
| ① 缩小窗口后轨道消失 | 窗口变窄，导航挂件整条不见 | 落点闸门里有一条 `锚点右缘 < 视口宽 × 0.55 就隐藏`。但轨道是**视口锚定**（右缘固定 `RIGHT_GAP`），锚点横向位置与落点无关 —— 窗口一窄、宿主展开按钮往左挪就越线 | 删除横向条件，只保留纵向闸门（必须在顶栏区域内、未被裁出视口） | ✅ |
| ② 窗口缩放后位置漂移（同批查出） | 缩放后轨道停在旧坐标 | `cheapPass` 变更键只看「锚点身份 / 右栏开合 / 有无座位」，缩放时三项都不变 ⇒ 不重定位 | 加 `force` 通道：`resize` 与座位变化强制重定位；`MutationObserver` 仍走非强制路径（避免每次 DOM 变动读几何） | ✅ |
| ③ 标题气泡换行 | 长标题折成多行，看着散 | 上一版为防溢出视口加了 `maxWidth: min(260px,40vw)` 且允许换行 | 改 `whiteSpace: nowrap` 自适应单行；左侧放不下时自动翻到图标右侧 | ✅ |
| ④ 标题气泡底色不跟随主题 | 气泡是一块与界面不搭的灰底 | 气泡用 `--dsw-alias-bg-overlay`（与轨道/主栏的 `bg-base` 不是同一枚表面 token） | 改用与轨道/主栏同一枚 `--dsw-alias-bg-base`（`dsh-theme-palette` 覆写了该 token，因此必然跟随主题），边框改 `--dsw-alias-border-l2` | ✅ |

### 这两个 bug 的共性教训

**几何闸门要问「这个条件与落点真的相关吗」。**
①的横向闸门对「视口锚定的 fixed 元素」毫无意义，却会因为布局变化误判整条隐藏；
②的变更键漏掉了「视口尺寸」这个**必然影响落点**的输入。
两者共同点：闸门/缓存键是照着「我以为的锚点形态」写的，而不是照着「落点公式真正依赖的变量」写的。
写这类判据时应把**落点公式的输入变量逐项列出来**，闸门与缓存键都从这张表派生。

### 第三轮反馈（0.3.4）：气泡外观

| 反馈 | 现象 | 根因 | 处置 | 状态 |
|---|---|---|---|---|
| 气泡要带小尖头 | 圆角矩形气泡，没有指向图标 | 上一版没画尖头 | 气泡右侧加 5px 三角形；翻到图标右侧时尖头自动换边 | ✅ |
| 气泡底色不要白 | 深色界面里气泡是**白底黑字** | **同一枚 `--dsw-alias-*` token 在浮层里的解析结果与轨道内不一致**（轨道深、气泡白）。宿主 `ThemePresenter` 是把当前方案的 token 一次性写到 `body.style`，理论上同子树必然一致 —— 说明还有别的层在覆写浮层里的这枚 token，具体哪一层未坐实 | **不再让气泡自己解析 token**：渲染后用 `getComputedStyle(轨道).backgroundColor` 把气泡底色与尖头颜色一起染成轨道的实际色。「气泡底色 = 轨道底色」成了构造上的事实，与 token 解析路径无关 | ✅ |

> **教训**：当同一 token 在两处解析出不同值时，与其继续追「哪一层覆写了」，不如**把参照物换成"已经正确的那个元素"**。
> 轨道底色是用户已认可的，直接继承它的计算值即可 —— 这类"取实测值而非声明值"的写法，对浮层类组件尤其适用。

### 第四轮反馈（0.3.5）：亮色模式阴影过重

| 反馈 | 现象 | 根因 | 处置 | 状态 |
|---|---|---|---|---|
| 亮色下阴影太重 | 亮色背景上一块明显重阴影 | 沿用深色时代的 `0 10px 28px rgba(0,0,0,.35)` + `0 2px 6px .22`，深色背景看不出来，亮色一眼就压 | 轨道改 `0 2px 8px rgba(0,0,0,.10)`；气泡同步 `0 2px 8px rgba(0,0,0,.14)` | ✅ |

> **教训**：阴影这类「在深色下几乎不可见、在亮色下很显眼」的属性，**必须两套模式都看一遍再定值**。
> 与 dsh-theme-palette 那条「先比明暗两套截图」的教训同源：只在一套模式下验收，等于没验收。

### 第五轮反馈（0.3.6）：气泡去边框 + 相对主栏微调明度

| 反馈 | 现象 | 根因 | 处置 | 状态 |
|---|---|---|---|---|
| 气泡不要边框 | 有 1px 边框 | 上一版用边框区分气泡与背景 | 去掉 `border`，改靠明度差 + 轻阴影 | ✅ |
| 深色下气泡比主栏浅一点 | 与主栏同色，边界不清 | 上一版直接把轨道底色（=主栏色）赋给气泡 | 取轨道实际计算色，**深色向白混 10%** | ✅ |
| 亮色下气泡比主栏深一点 | 同上（亮色方向相反） | 同上 | **亮色向黑混 8%**；明暗判定读宿主 `body[data-ds-dark-theme]` | ✅ |

> **教训**：浮层与背景的区分手段要按模式选方向 —— 深色模式「提亮」、亮色模式「压暗」。
> 用 JS 混色（而非 `color-mix`）的好处是：能同时算出尖头需要的同色值，且不依赖宿主浏览器对 `color-mix` 的支持。

---

## 四、批次三：工程规范（0.3.0 → 0.3.1）

| 审计条目 | 处置 | 状态 |
|---|---|---|
| P2-12 `files` 与产物不符 | 移除磁盘上不存在的 `README-zh.md`；补入 `CHANGELOG.md` | ✅ |
| P3-1 `engines.node` 过宽 | 改 `^22.19.0 || >=24.0.0`（与同族及宿主 Node 24.21.0 对齐）；doctor R6 由 WARN 转 PASS | ✅ |
| P3-2 缺 `manifestVersion` | 补 `dsh.manifestVersion: 1` | ✅ |
| P3-3 `immediately: true` | 去掉（无启动期依赖，不占首屏 bootstrap 批次） | ✅ |
| P3-4 patch 缺 `config: {}` | 补上 | ✅ |
| P3-6 缺工程字段 | 补 `author`/`packageManager`/`publishConfig`/`scripts.check`；新增 `CHANGELOG.md` | ✅ |
| P3-8 双气泡 / 长标题溢出 | 移除原生 `title`；气泡加 `max-width: min(260px,40vw)` 并允许换行 | ✅ |
| P3-9 console 噪声 | 版本标记保留（用于确认加载的到底是哪一版）；删除每次几何变化的 `console.debug` | ✅ |
| 文档漂移 | `index.js` 头注释改为当前形态；README 补「覆盖范围」说明并删去「任何插件注册的标签都会自动出现」的错误表述 | ✅ |

### 复跑的 `plugin_doctor`

| 指标 | 审计时 | 修订后 |
|---|---|---|
| pass | 25 | **26** |
| warn | 2 | **1** |
| fail | 1 | 1（**同一误报**，见下） |

- **R6 由 WARN 转 PASS**（`engines.node` 对齐）。
- **K3 仍 WARN**：两个 `setTimeout` 在 React 组件内（组件卸载即回收）；模块级已无定时器。判定为该检查的静态口径问题，记录不追改。
- **X1 仍 FAIL**：**误报，判定不追改**。依据：宿主真实版本 `0.2.2-rc.1`（`runtime.json`），`satisfies('0.2.2-rc.1','^0.2.1-rc.1',{includePrerelease:true}) === true`，活宿主该行 `enabled:true` 无 error。doctor 的比对基线是 `0.2.1-alpha.1`，与本机宿主不同代。
  **若将来要支持 0.2.1-alpha.x 宿主**，再把 peer 放宽到 `>=0.2.1-alpha.1 <0.3.0`；但那需要先在 alpha 宿主上实测（当前无该宿主）。

---

## 五、待办与已知限制

1. **触屏可用性**（审计 P2-10）：容器加 `onPointerDown` 切换展开 + `aria-expanded` + `@media (hover:none)` 默认展开。**需用户拍板是否纳入**（桌面优先插件，用户明确要求悬停交互）。
2. **视觉回归未做**：本轮为静态审计 + 代码重构，**未在 GUI 实测**。用户重启后需确认：轨道位置、悬停展开、点击直达、气泡、英文界面文案。
3. **层级真实遮挡**（审计 P1-3 剩余部分）：数值已坐实，真实遮挡需在「右栏展开 + 存在 dockkit 浮动面板」场景截图验证。
4. **自动测试**：尚未补 `tests/`。当前纯逻辑集中在 `client.js` 闭包内不便单测；建议后续把几何计算与分组逻辑抽成可导入的 `lib/` 模块再补用例。
5. **多语 README / 仓库字段**：已补 `author`/`publishConfig` 等；五语 README 与 `repository`/`homepage`/`bugs` 待发布到 npm 时补齐（尚无仓库地址，不写占位假链接）。

---

## 六、复评（沿用主稿五维口径）

| 维度 | 满分 | 审计时 | 修订后 | 说明 |
|---|---|---|---|---|
| 宿主契约与可安装性 | 25 | 15 | **20** | 删死代码、接 locale、补工程字段；peer 走廊误报不追改 |
| 渲染正确性与稳定性 | 25 | 13 | **19** | 竞态/裁切/锚点/状态复位四项修复；层级硬限制与触屏为已知限制 |
| 交互与可访问性 | 20 | 12 | **18** | 焦点可见、toolbar 模式、气泡关联、reduced-motion、失败反馈 |
| 性能与资源 | 15 | 7 | **14** | 双轮询删除、强制布局消除、几何不进渲染管线 |
| 工程规范与可维护性 | 10 | 6 | **8** | manifest/engines/CHANGELOG/patch 规范；自动测试仍缺 |
| 文档与展示元数据 | 5 | 4 | **5** | README/CHANGELOG/index 注释对齐，覆盖范围表述修正 |
| **合计** | **100** | **57** | **84** | 分档：**内部可用、需补齐**（≥70） |

> 复评为**代码层判定**；视觉与交互的最终确认以用户重启后的实测为准（见 §五第 2 条）。
>
> **批次一b 后记**：0.3.1 曾因一处笔误引入 P0（渲染期 ReferenceError ⇒ 轨道静默不出现），
> 由第四路复核用 jsdom 跑真实文件复现，已修并加了会咬住它的渲染冒烟测试。
> 当前版本 **0.3.2**，渲染冒烟测试 3/3 通过。

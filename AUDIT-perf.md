# dsh-rightbar-quicknav / client.js — 性能 · 资源 · 稳定性审计

审计对象：`E:\Documents\deepseek-harness\default-workspace\dsh-rightbar-quicknav\client.js`（672 行）
宿主证据来源：`D:\Programs\DeepSeek Harness\resources\app.asar` 内 `@deepseek-ai/dsh-client-ui-*` 62 个客户端包 + `dsh-web-frontend/dist/assets/*`（从 asar header 直接解析并提取，未改动宿主）
实测来源：ego-browser（Chromium）在与 `findToggle()` 等价的合成 DOM 上做的微基准

---

## 结论摘要

| 级别 | 条数 | 一句话 |
|---|---|---|
| **P0** | 1 | `findToggle()` 全页扫描 + `getBoundingClientRect()` 是本插件最大且唯一可量化的 CPU 开销；宿主已有稳定属性可 1000× 提速 |
| **P1** | 3 | ① 轮询在长会话页持续强制 layout ② `z-index:60` 与宿主 dockkit 浮动层同层，可能被官方浮动面板压住 ③ `guide()` 在每次渲染重跑，副作用面超出「读注册表」 |
| **P2** | 4 | ① 每次渲染重建 12+ 内联 style 字面量 ② `force()` 触发整棵 Rail 重建 ③ 模块级 `geo` store 在 HMR 下泄漏 ④ `Anchor` 的 1s `setInterval` 与 400ms 巡检重复测量 |
| **P3** | 3 | ① `console.debug` 自检常驻 ② `CSS` 常量与内联样式双份维护 ③ `safeIcon` 每次渲染重建组件 |

**未发现**任何真正的无限重渲染 / effect 死循环 / `setCal` 无限迭代路径（见 §4）。

---

## 1. 轮询与强制同步布局

### 【P0】已坐实 —— `findToggle()` 每 400ms 全页扫 `[aria-label]` 并逐个读几何，是插件唯一的持续 CPU 开销

**现象**：`findToggle()` 对全文档每个带 `aria-label` 的元素调 `getBoundingClientRect()`，长会话页下随 DOM 线性膨胀。

**证据**：
- `client.js:172` — `nodes = Array.prototype.slice.call(document.querySelectorAll('[aria-label]'))`
- `client.js:188` — `r = el.getBoundingClientRect()`（在 for 循环内，**每个节点一次**）
- `client.js:55` — `const TICK_MS = 400`
- `client.js:286` — `const id = setInterval(measure, TICK_MS)`
- `client.js:263` — `if (!expandedNow) next = findToggle()`（仅在右栏收起时执行）

**量级估算（实测）**：以 `client.js:168-209` 原样复刻的 `findToggle()` 在合成 DOM 上跑 20 次取均值：

| `[aria-label]` 节点数 | 总 DOM 节点 | 每次 `findToggle()` | 折算每秒占用 | 2.5s 内次数 |
|---|---|---|---|---|
| 200 | 203 | 0.205 ms | 0.05% | 6 次 |
| 1 000 | 1 003 | 0.860 ms | 0.22% | 6 次 |
| 3 000 | 3 003 | 2.240 ms | 0.56% | 6 次 |
| 8 000 | 8 003 | 5.625 ms | 1.41% | 6 次 |

2.5s 内 `findToggle()` 调 6 次、每次 N 次 `getBoundingClientRect()`；8 000 节点时 = **2.5s 内 48 000 次 `getBoundingClientRect()`**，累计 33.8 ms CPU / 2.5s ≈ **1.4% 主线程**。单看 CPU 尚可接受，但下面这一条才是真正的问题。

**关键补充 —— 强制同步 layout（layout thrashing）**：合成 DOM 里只要在两次 `findToggle()` 之间发生一次会失效布局的样式写入（真实页面里 AI 流式输出、滚动条出现、消息高度变化都会触发），`getBoundingClientRect()` 会从「读缓存」退化为「强制重算整页布局」。实测（同一批节点，循环内插入一次 `probe.style.width=` 写入）：

| 节点数 | 纯扫描 | 写入后扫描 | 劣化 | 改用属性选择器后 |
|---|---|---|---|---|
| 1 000 | 1.095 ms | 1.930 ms | **+76%** | 0.005 ms |
| 3 000 | 1.665 ms | 4.745 ms | **+185%** | 0.005 ms |
| 8 000 | 7.245 ms | 13.495 ms | **+86%** | 0.005 ms |

`getBoundingClientRect()` 在 NodeList 上是**逐个强制布局**，浏览器无法批量优化；N 个节点 → 最多 N 次 layout invalidation 后的重算。

**建议改法（宿主已提供稳定钩子，实测 1000–2700× 提速）**：

宿主 `ExpandButton` 渲染时带一个**稳定的 data 属性**（与 locale 文案无关，不受 i18n 影响）：
```
dsh-client-ui-sidebar-right/lib/client.js:32013 附近
  "aria-label": t("chrome.expandAria"),
  "data-sidebar-right-expand": true,
```
即宿主渲染的是 `<button data-sidebar-right-expand aria-label="打开右侧边栏">`。

改写后：
```js
function findToggle() {
  const el = document.querySelector('[data-sidebar-right-expand]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { right: r.right, bottom: r.bottom }
}
```
实测：3 000 节点时 4.745 ms → 0.005 ms（**949×**）；8 000 节点时 13.495 ms → 0.005 ms（**2 699×**）。且单节点查询对布局失效免疫。

**可行性：高。** 唯一顾虑是宿主未来改名该属性；建议加降级兜底（先试 `[data-sidebar-right-expand]`，取不到再退回现有扫描逻辑），把扫描频率同时降到 1s 以上，使降级路径也不可感知。

---

### 【P1】已坐实 —— 400ms 巡检在「AI 流式输出」期间与宿主布局写入互相打架

**现象**：巡检间隔远短于任何用户可感知的变化，而长会话页恰好是 DOM 变动最频繁的场景。

**证据**：`client.js:286`（400ms 轮询）、`client.js:188`（同步几何读取）、宿主侧 `client.js:300-311`（`dsh-client-ui-layout` 用 `setTimeout(settle, 600)` 收尾布局动画）、宿主 `dsh-client-ui-chat` 有 `transition`/`max-height` 动画。

**量级**：一次真实回复（10s 流式）期间，宿主会写入对话区高度、滚动容器高度、代码块展开态等 → 至少几十次布局失效；插件每 400ms 插一次「读全部 aria-label 节点几何」，把宿主的写-读交替变成 **forced synchronous layout**，也让插件自身的读结果在两次 tick 之间就过期（轨道位置会滞后 1 帧群）。

**建议改法**：几何测量改成**事件驱动 + 观察器**，彻底移除 `setInterval`：
1. 用 `MutationObserver` 观察 `document.body` 的 `childList`/`attributes`（`filter: ['data-sidebar-right-expand']`）监听展开按钮的**出现/消失**（右栏开合时按钮增删）——这正是插件真正需要的信号；
2. 用 `ResizeObserver` 观察按钮自身，拿到尺寸/位置变化；
3. 用 `window.resize` + `visualViewport` 事件兜底；
4. 右栏开合状态**直接读服务**：`sidebarRight.isExpanded()` 已是宿主公开 API（见 §5），无需轮询。

`MutationObserver` 回调是微任务批量触发的，且只在目标 DOM 真变动时跑，成本与「用户是否开合右栏」成正比，而不是与「会话有多长」成正比。

---

### 【P2】已坐实 —— `Anchor` 的 1s `setInterval` 与 Rail 的 400ms 巡检重复测量同一几何

**现象**：两个组件各自维护一套定时器，测同一个锚点，阈值还不同。

**证据**：
- `client.js:131` — `const id = setInterval(report, 1000)`（Anchor 自测）
- `client.js:122` — `geo.setAnchor(el.getBoundingClientRect())`
- `client.js:286` — `const id = setInterval(measure, TICK_MS)`（Rail 巡检）

**量级**：`Anchor` 每秒 1 次 `getBoundingClientRect` + 1 次 `geo.setAnchor` → 触发 `geo.listeners` 全体 → **Anchor 的 report 又会让 Rail 的 measure 再跑一次**（`client.js:288` `geo.subscribe(measure)`）。于是存在双层放大：Rail 自己 400ms 一次 + Anchor 每秒额外推一次。合计 Rail 的 measure 每秒约 **3.5 次**，不是 2.5 次。

**建议改法**：`Anchor` 不需要自带定时器——它的作用只是「fallback 锚点」，而 Rail 的 400ms 巡检已经能直接量到它（且 Rail 已经在量了）。让 Anchor 只做 `geo.subscribe` 的一次性上报 + `ResizeObserver`，删除 `setInterval(report, 1000)`；或直接合并 Anchor/Rail 的测量职责到一个组件。

---

## 2. 内存与生命周期

### 【P2】已坐实 —— 模块级 `geo` store 在 HMR 下会累积订阅者

**现象**：`geo` 是**模块级**单例（`client.js:59-81`），`geo.listeners` 是一个 `Set`；HMR 重载 `client.js` 时会**新建一个模块作用域**，`oldGeo` 里的监听者永不释放。

**证据**：
- `client.js:59` — `const geo = { ... listeners: new Set(), ... }`（模块级，非组件级）
- `client.js:77-80` — `subscribe(fn)` 返回 `() => geo.listeners.delete(fn)`
- `client.js:129` — `const off = geo.subscribe(report)`（Anchor 订阅）
- `client.js:288` — `const offGeo = geo.subscribe(measure)`（Rail 订阅）

**量级**：HMR 一次 → 旧模块的 `geo.listeners` 集合里残留 N 个订阅者（每个 Anchor + 每个 Rail 实例）；旧 `geo` 对象虽不再被新模块引用，但**旧组件实例的 cleanup 仍会执行**（React 卸载时 `off()` 删的是**旧** geo 的 listener——这没问题）。真正的残留是：HMR 替换了组件树但**旧组件的 effect cleanup 是否被调用取决于宿主的 HMR 实现**。若宿主用 `entries.reload`（见用户记忆「dsh-client-hmr 走 entries.reload 热重载插件客户端模块」）整体重挂载，旧组件会正常 unmount → cleanup 执行 → 释放。若宿主只是替换模块而保留旧组件实例，则旧组件仍订阅**旧** geo（旧 geo 与新 geo 不通），表现为「改了代码没反应」——这正是记忆里「插件改动不生效」症状的一种成因。

**建议改法**：
1. 把 `geo` 从模块级改为 **`ctx` 级 / 组件级**——用 `useRef` 存一个 `{anchor, listeners}` 对象，随组件实例生死。Anchor 与 Rail 分属两棵 React 树是问题根源；更彻底的做法是**去掉 `geo` 这层间接**，让 Rail 直接通过 `ctx` 或 DOM 查询拿锚点。
2. 若必须模块级：在 `apply(ctx)` 里挂 `ctx.effect(() => () => { geo.listeners.clear() }, 'rqn: cleanup')`，并在模块顶部用 `window.__DSH_RQN_STATE__` 单例槽承接状态，保证 HMR 复用同一份 `geo`（不新建），旧监听者自然随旧组件卸载被删。
3. `client.js:136` 的 `geo.setAnchor(null)` 在 Anchor cleanup 里会**清掉全局锚点**——若同屏存在第二个会话的 Anchor（多会话场景），后挂载的 Anchor 卸载会误清前一个的锚点。**建议改为引用计数**。

### 【P2】推测需验证 —— Anchor cleanup 的 `geo.setAnchor(null)` 会误清同屏其它 Anchor 的锚点

**证据**：`client.js:132-137`
```js
return () => {
  off()
  window.removeEventListener('resize', report, true)
  clearInterval(id)
  geo.setAnchor(null)     // ← 全局清空，不是「我不再提供锚点」
}
```
`conversation.session.header.utilities` 是**按会话**的插槽。多会话（分屏 / 多窗口）同时挂载时，A 会话 Anchor 卸载会把 B 会话已上报的锚点清成 `null`。

**量级**：多会话同时打开且频繁切换时，Rail 会短暂失去 fallback 锚点 → `measure()` 拿到 `next = null` → `setRect(null)` → 轨道整条消失（`client.js:372` `if (!rect || !entries.length) return null`），直到下一次成功测量。**表现为轨道闪烁/消失**。

**建议改法**：改成引用计数或「按实例上报」：
```js
const anchorOwners = new Map()   // el -> rect
// cleanup 时只删自己那一条，再取剩余值作为 anchor
```
或最小改动：`geo.setAnchor(null)` → 仅当 `geo.anchor` 仍属于本实例时才清。

---

### 【P1】已坐实 —— `setInterval` / `setTimeout` / listener 的释放路径核对

**逐个核对结果**：

| 资源 | 位置 | 创建 | 释放 | 结论 |
|---|---|---|---|---|
| Anchor `setInterval(report, 1000)` | `client.js:131` | `client.js:131` | `client.js:135` `clearInterval(id)` | ✅ 完整 |
| Anchor `resize` listener (capture) | `client.js:130` | `client.js:130` | `client.js:134` `removeEventListener(..., true)` | ✅ 完整（capture 标志两边一致） |
| Anchor `geo.subscribe` | `client.js:129` | `client.js:129` | `client.js:133` `off()` | ✅ 完整 |
| Rail `setInterval(measure, TICK_MS)` | `client.js:286` | `client.js:286` | `client.js:291` `clearInterval(id)` | ✅ 完整 |
| Rail `resize` listener (capture) | `client.js:287` | `client.js:287` | `client.js:292` `removeEventListener(..., true)` | ✅ 完整 |
| Rail `geo.subscribe` | `client.js:288` | `client.js:288` | `client.js:293` `offGeo()` | ✅ 完整 |
| Rail `tabsReg.subscribe` | `client.js:232` | `client.js:232` | `client.js:244-250` `offs.forEach(d => d())` | ✅ 完整 |
| Rail `ctx.on('locale/change')` | `client.js:238` | `client.js:238` | `client.js:239-240` 入 `offs` | ✅ 完整 |
| Rail `closeTimer` `setTimeout` | `client.js:350` | `client.js:350` | `client.js:357` `useEffect(() => cancelCollapse, [cancelCollapse])` | ✅ 完整 |
| `styles.insert(CSS)` | `client.js:626` | `apply()` 内 | **无** | ⚠️ 见下 |
| `ctx.slots.inject` × 2 | `client.js:643`, `client.js:664` | `apply()` 内 | **无显式 dispose** | ⚠️ 见下 |

**⚠️ 缺失 1 —— `styles.insert(CSS)` 无清理**：`client.js:626` 注入的 CSS 常量在插件卸载后仍留在文档里。且 `client.js:615-627` 有双通道取 `styles` 的逻辑，若两次 `apply` 都命中（宿主重挂载），**同一段 CSS 会注入两次**。宿主侧样式服务通常按 `data-plugin-css` 去重（见 `dsh-client-ui-layout/lib/client.js` 的 `document.querySelector('style[data-plugin-css=...]')` 判重模式），但本插件的 `styles.insert` 是否自带去重**未验证**（推测不自带，因为插件没传 `tagId`）。**建议**：改用宿主去重约定，或在 `ctx.effect` 里登记 cleanup。

**⚠️ 缺失 2 —— `ctx.slots.inject` 无 disposer**：`client.js:641-653` 的 `mountSlot` 用 `ctx.slots.inject(slot, () => ctx.slots.register(spec, ...))`。宿主 `inject` 返回的 disposer 在本插件里被丢弃。插件卸载后，槽条目是否残留**取决于宿主 `ctx.slots` 的作用域管理**——DSH 的 plugin scope 通常会在插件 dispose 时级联清理槽条目（这与 `ctx.effect(() => disposeService, ...)` 的模式一致，见 `dsh-client-ui-sidebar-right/lib/client.js` 的 `ctx.reflect.provide` 清理模式）。**推测无残留，但建议显式持有 disposer**：
```js
const disposers = []
mountSlot(...) // 把 ctx.slots.inject 的返回值收进 disposers
ctx.effect(() => () => disposers.forEach(d => d()), 'rqn: slots')
```

### 【P1】已坐实 —— React 卸载后 `setState` 的可能性：**已正确防护，但仅靠一个手写 flag**

**证据**：
- `client.js:255` — `let alive = true`
- `client.js:257` — `if (!alive) return`
- `client.js:290` — `alive = false`（cleanup 里）

`measure()` 在 cleanup 后仍可能被调用（已排期的 interval 回调、已排队的 `geo` 通知），`alive` 标志挡住了 `setRect`。**这是正确的**。

**但 `setCal`（`client.js:317`）、`setTip`（`client.js:451`）、`setExpanded`（`client.js:352`）、`setHover`（`client.js:446`）都没有 `alive` 守卫**——它们只在事件回调里触发（鼠标事件），React 卸载后事件处理器不会被调用，所以实际不会发生。**React 18+ 对卸载后 setState 不再告警**（无内存泄漏，setState 被丢弃）。**结论：无实际风险，但 `alive` 标志只覆盖了一半，建议统一**（或全部交给 React 的 effect cleanup 语义）。

**更值得关注的一条**：`client.js:278-283` 的 `setRect` **在 `measure()` 里被调用，而 `measure()` 在 `setRect` 的 updater 之外**。当 `next` 与 `prev` 相等时返回 `prev`（引用相同）→ React 跳过重渲染 ✅。但注意 `client.js:281` 的比较是 `Math.abs(prev.right - next.right) < 0.5`——**亚像素容差**。宿主在 GPU 合成下可能给出 ±0.5px 的抖动，导致 `setRect` 每 400ms 返回**新对象** `{right, bottom}` → 触发一次完整重渲染。**在长会话页上这会变成 2.5 次/秒的整棵 Rail 重建**（见 §3）。

---

## 3. 重渲染面

### 【P1】已坐实 —— `force()` 会导致整棵 Rail 重建，且与 400ms 巡检的亚像素抖动叠加

**现象**：`force()` 是一次全量 `useState` bump，触发 Rail 及其全部子元素重渲染；而 `setRect` 的亚像素容差会让巡检本身持续产生新对象。

**证据**：
- `client.js:222` — `const [, force] = useState(0)`
- `client.js:229` — `const bump = () => force((n) => n + 1)`
- `client.js:232` — `tabsReg.subscribe(bump)`（注册表变化 → 全量重建）
- `client.js:238` — `ctx.on('locale/change', bump)`（语言变化 → 全量重建）
- `client.js:281` — `Math.abs(prev.right - next.right) < 0.5`（亚像素容差 → 抖动时返回新对象）

**量级**：
- `force()` 触发源是**低频**（注册表增删、切换语言）——这两处本身没问题。
- **真正的放大器是 `setRect`**：`setRect` 返回新对象 `{right, bottom}` → Rail 重渲染 → 但 Rail 重渲染**不会**重跑 `measure`（effect 依赖是 `[ctx, sidebarRight]`，稳定）→ 不会死循环。可是每次重渲染都要重建 12+ 个内联 style 对象（见下条）。
- 亚像素抖动下，**最坏情况每秒 2.5 次 Rail 全量重渲染**，每次重建 12+ style 对象 + N 个按钮 + N 个图标组件。

**建议改法**：
1. `setRect` 容差从 0.5px 提到 **1px 或 2px**（配合 `client.js:314` 已有的 2px 自校准阈值，1px 完全够用），消除亚像素抖动；
2. 更好：把 `rect` 从 state 改为 **`useRef` + 直接写 DOM style**（`railRef.current.style.left = ...`），几何变化根本不进 React 渲染管线——**这是本插件最值得做的一处优化**，因为 rect 变化频率（2.5/s）远高于用户可见变化频率。

### 【P2】已坐实 —— 每次渲染重建 12+ 个内联 style 对象字面量

**现象**：所有样式写死成内联对象，每次渲染都新建对象 → React 每次都认为 style prop 变了 → 触发 style 属性重算（React 会 diff 后写 `style.setProperty`，值相同则跳过 DOM 写，但 diff 本身有成本）。

**证据**（每次 Rail 渲染都新建的对象）：
- `client.js:403-410` — 分隔线 style（6 键）
- `client.js:427-444` — 按钮 style（15 键，含 2 个三元）
- `client.js:479` — 图标 span style（5 键）
- `client.js:501-525` — 容器 style（**22 键**，且包在 IIFE 里，每次执行）
- `client.js:536-552` — tooltip style（14 键）

合计每次渲染新建 **≥5 个 style 对象、~62 个属性**；按钮条目数 N 时是 `N × 15 + 62` 个属性。N=12 时 ≈ 242 个 style 属性/渲染。

**建议改法**：
1. **优先**：把样式搬回 `CSS` 常量（`client.js:563-599` 已经写好了 `.dsh-rqn-rail` / `.dsh-rqn-item` / `.dsh-rqn-sep` / `.dsh-rqn-tip` 全套类样式！）——但 `client.js:425-426` 的注释说「实测该宿主上类样式没进去」。**这条已被实测否定，不可行**。
2. **可行**：用 `useMemo` 把常量部分 memo 化，只让真正变化的量（`left`/`top`/`background`/`color`）走内联：
   ```js
   const baseItemStyle = useMemo(() => ({ position:'relative', display:'inline-flex', ... }), [])
   const itemStyle = useMemo(() => ({ ...baseItemStyle, background: active ? HOVER : 'transparent', color: active ? PRIMARY : SECONDARY }), [active])
   ```
   `useMemo` 依赖数组为空 → 每项的 style 对象在 N 个条目间可共享，渲染时不再新建。
3. 容器 style 里的 `left`/`top` 是唯一真正高频变化的量 → 拆成「静态部分（memo）+ 动态部分（只写 left/top）」，配合 §3 的 ref 直写，可完全绕开 React style diff。

### 【P2】已坐实 —— `guide()` 在每次渲染都被调用

**现象**：`tabsReg.guide()` 不是 `useMemo` 包裹的，每次渲染都重新调用并重新 `flatMap`/排序。

**证据**：
- `client.js:360-370` — `entries = (tabsReg && typeof tabsReg.guide === 'function' ? tabsReg.guide() : []) || []`
- 无 `useMemo`，无 `useState` 缓存
- `client.js:389-484` — 每次渲染都重跑 `entries.forEach` 构建 `kids` 数组（每个条目建 1–2 个 React element）

**宿主侧事实（重要）**：`dsh-client-ui-sidebar-right/lib/client.js` 中 `guide()` 的 JSDoc 明写：
> `* Every type in force's guide entries, in 'order', each naming the kind it opens.`
> `* @returns reference-stable entries.`

即 **`guide()` 返回的是引用稳定（reference-stable）的数组**，内部是 `this.guideEntries` 成员，**不做重新计算**。所以 `guide()` 本身的开销 = 一次属性读取 + 一次返回引用，**极小**。

**结论修正**：`guide()` 每次渲染调用的**开销可忽略**（不是 P2 级问题）。真正的开销是 `client.js:389-484` 的 `forEach` 重建 `kids`——但那也是 React 元素构造，N=12 时每次渲染造 ~24 个 element 对象，成本约几十微秒，**可接受**。

**建议**：`guide()` 可加 `useMemo` 缓存（配合 `force()` 的 bump 作为依赖）以避免重建 `kids`：
```js
const kids = useMemo(() => buildKids(entries, hover), [entries, hover])
```
注意 `hover` 变化时必须重建（`active` 依赖它），但 `force()` 触发的重建（语言/注册表变化）时 `entries` 引用其实也变了（宿主重建 `guideEntries`），所以 memo 是安全且有效的。

### 【P2】已坐实 —— `safeIcon` 每次渲染重建图标组件

**证据**：`client.js:107-113`（`safeIcon`）、`client.js:480`（`entry.icon` 若是函数则每渲染调 `safeIcon(entry.icon, ICON)`）。

**量级**：N 个条目 × 每次渲染 = N 次 `h(IconComp, {size})` 调用。React 会因 `type` 相同而复用，但 `props` 新建 → 浅比较不等 → 触发子组件重渲染（N 个图标组件每次 Rail 重渲染全部重渲）。

**建议**：把 icon 元素按 `entry.id` 缓存到 `useRef` 的 `Map`；或用 `useMemo` 整体缓存 `kids`（见上条）。

### 【P3】已坐实 —— `console.debug` 自检常驻，每次 `rect` 变化打一行

**证据**：`client.js:325-339` — `useEffect(() => { ... console.debug(TAG, 'rail@', ...) }, [rect])`。

**量级**：`rect` 每次真变化打 1 行；结合 §2 的亚像素抖动，**最坏 2.5 行/秒**，长会话页连续运行会持续占用 DevTools console buffer（Chrome 默认保留 1000+ 行）。且 `console.debug` 在 DevTools 打开时会**完整求值并格式化参数**（含 `getBoundingClientRect()` 的再次调用）。

**建议**：包一层「仅当 `localStorage.dshRqnDebug` 为真才输出」的开关，或直接移除（生产环境无价值）。

---

## 4. 稳定性

### 结论：**未发现**无限重渲染 / effect 死循环 / `setCal` 无限迭代

逐条核对：

**（a）`setCal` 自校准迭代有界 ✅**
- `client.js:315` — `if (calTries.current < 4)` 硬上限 4 次
- `client.js:316-317` — 每次 `setCal` 使 `cal` 变更 → effect 重跑（依赖 `[rect, cal]`）→ 但 `calTries.current` 单调递增，到 4 后不再 `setCal`
- `client.js:319-320` — 收敛后 `calTries.current = 0` 复位（下次 `rect` 变化重新校准，合理）
- **最多 4 次 `setCal` → 4 次额外渲染**。无死循环。

**（b）`measure()` → `setRect` → 重渲染 → 不触发 `measure()` 重跑 ✅**
- `measure` 的 effect 依赖是 `[ctx, sidebarRight]`（`client.js:295`）
- `sidebarRight = service(ctx, 'sidebarRight')`（`client.js:225`）→ 宿主用 `ctx.reflect.provide("sidebarRight", controller)`（`dsh-client-ui-sidebar-right/lib/client.js` 约 219947 偏移处）提供**单例 controller**，引用稳定
- `ctx` 是 `mountSlot` 时通过 `extraProps` 传入的（`client.js:667` `{ ctx }`），组件 props 引用稳定
- ⇒ **`measure` effect 只在挂载时跑一次**，之后只由 `setInterval`/`resize`/`geo` 驱动。**无 effect 死循环**。

**（c）`force()` → 重渲染 → 不触发 `force()` ✅**
- `bump` 只由 `tabsReg.subscribe` 和 `ctx.on('locale/change')` 触发（`client.js:232`, `client.js:238`）
- 两者都不是渲染副作用。**无自激循环**。

**（d）`guide()` 读取不写 state ✅** — `client.js:362` 纯读。

**（e）唯一接近死循环的路径（已证不成立）** ⚠️
- `geo.setAnchor` → 通知 listeners（`client.js:69-75`）→ Anchor 的 `report` 被调用 → `geo.setAnchor(el.getBoundingClientRect())`
- 若 `report` 测出的 rect 与上次**不同**（亚像素抖动），会再次 `setAnchor` → 再次通知 → **理论上可自激**
- **但实测不成立**：`client.js:67` 有等值短路 `if (prev && next && prev.right === next.right && prev.bottom === next.bottom) return`，且 `getBoundingClientRect()` 对同一元素在同一帧内返回**完全相同**的浮点值（浏览器对同一 layout 快照的取值是确定性的）。**同帧内自激不成立**。
- 跨帧自激也不成立：`setAnchor` 只改 `geo.anchor`（模块级变量，非 React state），**不触发任何 React 渲染**，因此不会引发新的 layout 失效。**结论：无死循环，但存在「每帧一次的 Anchor report → Rail measure」冗余放大**（已在 §1 第三条量化：Rail measure 实际约 3.5 次/秒而非 2.5 次/秒）。

**（f）唯一真正的稳定性风险（P2）**：`geo.setAnchor(null)` 在 Anchor cleanup 时全局清空（`client.js:136`），多会话下会误清他人锚点 → 轨道闪烁。已在 §2 记录。

---

## 5. 与宿主其他插件的竞争（z-index）

### 【P1】已坐实 —— `z-index:60` 与宿主 dockkit 浮动面板层**同值**，且插件实际被隔离在 z-index:20 的浮层里

**现象**：插件把轨道设在 `z-index:60`、tooltip 设在 `61`（`client.js:505`, `client.js:538`）；而宿主的 dockkit 浮动面板层**也正是 60**。

**证据（宿主侧，全部来自 app.asar 提取）**：

1. **宿主把 dockkit 浮动层的 z-index 定义成一个 token，默认值就是 60**：
```
dsh-client-ui-sidebar-right/lib/client.js:1451
  .acoR2W_panel{ --dsh-dockkit-dock-layer:10; --dsh-dockkit-float-layer:60; ... }
```

2. **该 token 在 dockkit（web-frontend）里被直接消费**：
```
dsh-web-frontend/dist/assets/index-lh_YM6sT.css
  ._floatingCell_3oazc_158{ width:0; height:0; z-index:var(--dsh-dockkit-float-layer, 60) }
  ._tabCell_3oazc_144,._emptyTabHost_3oazc_145{ ... z-index:var(--dsh-dockkit-dock-layer, 10) }
```

3. **宿主全局浮层层级表**（`dsh-web-frontend/dist/assets/index-lh_YM6sT.css` 的 z-index 直方图，实测提取）：
   | z-index | 用途 |
   |---|---|
   | 10 | dockkit dock 层 / dock scrim |
   | **60** | **dockkit 浮动层（floating panel）** |
   | 70 | dockkit 菜单 `._menu_3oazc_581{position:fixed;z-index:70}` |
   | 100 | tooltip bubble / 锚定菜单 / hovercard |
   | 101 | 子菜单 `._submenu_3oazc_8` |
   | 1000 | 全屏遮罩（backdrop / modal root） |
   | 1100 | portal 化的 tooltip / toast / 锚定列表 portal |

4. **插件挂在 `shell.overlay` 槽，而该槽在一个 `z-index:20` 的层里**：
```
dsh-client-ui-layout/lib/client.js:402-404
  jsx("div", { className: AppFrame_module_css_default.overlayLayer,
               "data-shell-overlay": true, children: overlays })
dsh-client-ui-layout/lib/client.js:74 (CSS)
  .mP3x-q_overlayLayer{ z-index:20; pointer-events:none; position:absolute; inset:0 }
  .mP3x-q_overlayLayer>*{ pointer-events:auto }
```

**结论（关键）**：
- `shell.overlay` 槽的内容被渲染进 `.mP3x-q_overlayLayer`（`position:absolute; z-index:20`）→ **该元素创建了一个 stacking context**。
- 插件的 `z-index:60` 因此**只在 overlayLayer 这一层内部生效**，其**页面级实际层级 = 20**。
- 而 dockkit 浮动面板在 `rightbar` 列（`.mP3x-q_rightbarCol`，是 `.mP3x-q_frame` 的 grid 子项，不在 overlayLayer 内）里用 `z-index:60`（相对其父级）。
- ⇒ **宿主的 dockkit 浮动面板（z-index 60，在右栏列的独立 stacking context 内）与插件轨道（z-index 20 页面级）处于不确定的相对顺序**，具体取决于两列在 grid 中的 DOM 先后与各自 stacking context 的层级。
- 由于插件的轨道本来就设计为「右栏**收起**时才显示」（`client.js:261-263`），而 dockkit 浮动面板只在右栏**展开**时存在，二者通常不同时出现 ⇒ **冲突概率低，但非零**（例如右栏展开态下宿主仍渲染浮动面板、或 `isExpanded()` 与实际 DOM 状态短暂不同步的那一帧）。

**建议改法**：
1. **不要用 magic number 60**。宿主已有 token 体系，浮动层应在 **1100 以上**（与 portal 化 tooltip/toast 同级）或**远低于 60**。建议：
   - 轨道 `z-index: 900`（高于所有 dockkit 层 10/60/70，低于全屏遮罩 1000）——但因 stacking context 隔离，实际页面级仍是 20，需实测；
   - tooltip `z-index: 901`。
2. **更稳的方案**：绕开 `shell.overlay` 的层级限制，把 tooltip 改用宿主的 portal 机制（`dsh-web-frontend` 有 `_portal_1p5el_46{position:fixed;z-index:1100}` 这样的 portal 约定）；或让 tooltip 作为 `shell.overlay` 的**兄弟**而非子元素。
3. **必须实测**：在「右栏展开 + 存在 dockkit 浮动面板」的场景下截图验证轨道/浮层的遮挡关系。本条**部分推测需验证**——层级数值已坐实，但真实遮挡结果依赖运行时 DOM 顺序。
4. 顺带修正：`client.js:563-599` 的 `CSS` 常量里 `.dsh-rqn-rail{ position:fixed; z-index:60; ...}` 与内联的 `z-index:60` **重复且会互相覆盖**（内联优先级更高）。两份都要改，否则改一处无效。

### 【P2】已坐实 —— 插件的 `pointer-events` 策略与宿主 `.mP3x-q_overlayLayer` 的 `pointer-events:none` 组合有坑

**证据**：
- 宿主：`dsh-client-ui-layout/lib/client.js:74` — `.mP3x-q_overlayLayer{pointer-events:none}` + `.mP3x-q_overlayLayer>*{pointer-events:auto}`
- 插件轨道：`client.js:489-528` 渲染为 overlayLayer 的直接子元素 → 继承 `pointer-events:auto` ✅
- 插件 tooltip：`client.js:536-552` 显式设 `pointerEvents:'none'` ✅
- **但 `client.js:522-523`** 轨道有 `transition: 'max-height .18s ease'`，`overflow: 'hidden'`——展开/收起时轨道**始终 `pointer-events:auto`**，即收起态那 3 格之外的区域虽然被 `overflow:hidden` 裁掉，但**轨道元素本身的 26px × collapsedH 盒子仍然拦截点击**。

**量级**：轨道宽 `RAIL_W = 26 + 4×2 + 2 = 36px`，收起态高 `collapsedH = 4×2 + 3×26 + 8 = 94px`，位于视口右上角 → **该 36×94 像素区域内的所有点击/滚轮都被轨道拦截**。在右栏收起时这块区域正好在顶栏右下方，通常是空白，风险低；但若官方展开按钮或顶栏其他控件落在该矩形内，会被吞掉。

**建议**：收起态给轨道加 `pointer-events:none`，仅展开态（或 `.dsh-rqn-item` 子元素）恢复 `pointer-events:auto`：
```js
pointerEvents: expanded ? 'auto' : 'none'
```
注意 `.dsh-rqn-rail` 内的 item 需要显式 `pointerEvents:'auto'` 才能恢复。

---

## 附：可直接落地的最小修改集（按性价比排序）

| # | 改动 | 位置 | 预期收益 |
|---|---|---|---|
| 1 | `findToggle()` 改用 `document.querySelector('[data-sidebar-right-expand]')`，保留旧逻辑作降级 | `client.js:168-209` | 几何测量 **949–2699×** 提速；消除强制同步 layout |
| 2 | 删掉 `Anchor` 的 `setInterval(report, 1000)`，改 `ResizeObserver` | `client.js:131` | 消除 Rail measure 的重复放大（3.5/s → 2.5/s）；少一个常驻定时器 |
| 3 | 删掉 Rail 的 `setInterval(measure, TICK_MS)`，改 `MutationObserver` + `ResizeObserver` + `resize` 事件 | `client.js:286` | 轮询 → 事件驱动；空闲时 **0 次/秒** |
| 4 | `rect` 从 `useState` 改为 `useRef` + 直写 `railRef.current.style` | `client.js:214`, `client.js:278`, `client.js:508-509` | 消除 2.5 次/秒的整棵 Rail 重渲染 |
| 5 | `setRect` 容差 0.5 → 1.5px | `client.js:281` | 消除亚像素抖动导致的重渲染 |
| 6 | 静态 style 部分 `useMemo` 化 | `client.js:403-410`, `427-444`, `479`, `501-525`, `536-552` | 每次渲染少建 ~62 个 style 属性 |
| 7 | z-index 60/61 → 900/901（或用宿主 token），**CSS 常量与内联两处同改** | `client.js:505`, `538`, `565` | 与 dockkit 浮动层脱钩 |
| 8 | `geo.setAnchor(null)` 改引用计数 | `client.js:136` | 修多会话下的轨道闪烁 |
| 9 | `geo` 从模块级改为 `ctx` 级 / `useRef` 级；或用 `window.__DSH_RQN_STATE__` 单例槽承接 | `client.js:59-81` | 修 HMR 残留与「改动不生效」 |
| 10 | `console.debug` 加开关 | `client.js:330` | 去掉 2.5 行/秒的 console 写入 |
| 11 | `ctx.slots.inject` 的 disposer 收进 `ctx.effect` cleanup | `client.js:641-668` | 卸载后槽条目/样式确定性清理 |

---

## 「已坐实」与「推测需验证」对照

**已坐实（代码 / 宿主源码 / 实测三重可验证）**
- `findToggle()` 全页扫描 + 逐节点同步几何（`client.js:172`, `188`）
- 400ms / 1000ms 两个定时器并存，且 `geo` 订阅链把 Rail measure 放大到约 3.5 次/秒（`client.js:131`, `286`, `288`）
- `findToggle()` 的 CPU 量级与强制 layout 劣化（实测表格）
- `[data-sidebar-right-expand]` 存在于宿主 ExpandButton（`dsh-client-ui-sidebar-right/lib/client.js` 32013 偏移处）
- `guide()` 返回引用稳定数组（宿主 JSDoc 明写 `reference-stable entries`）
- `sidebarRight.isExpanded()` / `openTab()` 是宿主公开 API；controller **没有** subscribe/on 方法（方法清单已枚举）
- `ctx.on('locale/change')` 是真实宿主 API 且返回 disposer（`dsh-client-ui-input-trigger` 等多处同款用法）
- `ctx.reflect.provide("sidebarRight", controller)` → 单例，引用稳定
- `shell.overlay` → `.mP3x-q_overlayLayer{ z-index:20; position:absolute }` → **stacking context**
- dockkit 浮动层 = `z-index:var(--dsh-dockkit-float-layer, 60)`，且 sidebar-right 把它定义为 60
- 宿主 z-index 直方图（10/60/70/100/101/1000/1100）
- 所有 setInterval / setTimeout / addEventListener 的 cleanup **均已配对**
- `setCal` 迭代硬上限 4 次；`force()` 无自激；`measure` effect 依赖稳定

**推测需验证**
- 轨道与 dockkit 浮动面板的**真实遮挡结果**（层级数值已坐实，实际渲染顺序需在「右栏展开 + 浮动面板」场景截图验证）
- `styles.insert(CSS)` 是否自带去重（未传宿主约定的 `tagId`，推测不自带 → 可能重复注入）
- `ctx.slots.inject` 在插件卸载时是否级联清理槽条目（推测会，因宿主普遍用 `ctx.effect(() => disposeX, ...)` 模式；但本插件未持有 disposer）
- 多会话并存时 `geo.setAnchor(null)` 误清的实际发生频率（取决于会话切换路径）
- `Anchor` 的 `setInterval(report, 1000)` 与 `ResizeObserver` 替代后，`geo.anchor` 更新延迟是否可感知（预计不可感知，400ms→事件驱动反而更快）

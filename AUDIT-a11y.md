# dsh-rightbar-quicknav / client.js — 交互与可访问性审计（独立复核稿）

- 审计对象：`client.js`（672 行，client v0.2.2）
- 审计基线已验证：profile 内安装副本与审计源 SHA256 一致（`09380C86…084`），行号对运行中的代码成立
- 宿主契约核对：`dsh-client-ui-sidebar-right/lib/client.js`（`isExpanded()` @2246、`openTab()` @2128、`guide()` @4538、guideEntries 构造 @4619-4623、locale 词典 @4637/@4688）
- **边界声明**：浏览器侧访问 GUI 返回 `dsh web authentication required`，**未做运行时 DOM 实测**；结论基于源码静态分析 + 宿主包契约核对。像素级对比度（WCAG 1.4.3/1.4.11）与真实读屏播报（4.1.2/3.1.2）需在可访问 GUI 会话中复核。

---

## 1. 键盘可达性

### 【P1】键盘用户无法触达第 4 个及以后的标签：被裁切的按钮仍可聚焦，焦点落在视口外不可见区
- **证据**：`client.js:521` `overflow:'hidden'`；`client.js:522` `maxHeight: expanded ? '2600px' : collapsedH+'px'`；`client.js:487` `collapsedH`（=94px，仅容 3 格）；全部条目**一次性全量渲染**（`client.js:387-484`），无 `display:none` / `tabIndex=-1` 摘出序列；按钮为原生 `<button>`（`client.js:418`）→ `tabIndex` 恒为 0。
- **判定**：`overflow:hidden` 的裁切**不改变可聚焦性**（HTML 规范：clip 只影响绘制）。Tab 会依次走过 3 个可见按钮后焦点静默进入裁切区，屏幕上无任何焦点指示（`:focus-visible` 轮廓定义在类样式 `client.js:584`，被父容器连同盒裁掉）。
- **判据**：WCAG **2.4.7 Focus Visible (A)**、**2.4.11 Focus Not Obscured (AA)**。
- **建议**：收起态给第 4 项起设 `tabIndex={-1}`（roving tabindex），或彻底改为收起态只渲染 3 个按钮的 DOM。

### 【P1】`role="toolbar"` 是空承诺：缺方向键导航与 roving tabindex
- **证据**：`client.js:494` 声明 `role:'toolbar'`；全文件**无 `onKeyDown`**、**无 `aria-orientation`**（竖排却缺省 horizontal，与实际矛盾）、**无 roving tabindex**。
- **判据**：WCAG **2.1.1 Keyboard (A)** + ARIA APG Toolbar Pattern（单 Tab 停靠 + 方向键内移）。
- **建议**：容器 `tabIndex=0` + `aria-orientation="vertical"` + 每按钮 `tabIndex={-1}` 配合 `activeIndex` 做 roving tabindex，`onKeyDown` 处理 `ArrowUp/ArrowDown/Home/End`。

### 【P2】焦点轮廓写进了类样式，但该宿主上类样式从未生效
- **证据**：`client.js:584` 的 `.dsh-rqn-item:focus-visible{…}` 位于 `CSS` 字符串（`client.js:563-599`）；而 `client.js:425-426` 注释自陈「实测该宿主上类样式没进去」，内联 style（`client.js:427-444`）**无 outline**；注入失败只 `console.warn`（`client.js:627`）即静默放行。
- **后果**：作者那套 2px 品牌色轮廓实际不存在；浏览器默认焦点环是否还在，取决于宿主是否全局清除 outline（未坐实）。
- **建议**：改由 React `onFocus/onBlur` 驱动状态并把 outline 写进内联 style；或在恢复 `styles.insert` 时**实测确认规则确实进页面**。

### 【P3】分隔线 `role="separator"` 未标 `aria-hidden`
- **证据**：`client.js:400-411`。装饰性分隔线不应作为语义节点暴露。**判据**：WCAG **4.1.2**、ARIA 1.2。**建议**加 `'aria-hidden':'true'`。

---

## 2. 命中区与指针

### 【P1 / 范围取决于产品定位】触屏设备上轨道不可用：展开唯一触发器是 hover
- **证据**：展开逻辑 4 处全为鼠标事件（`client.js:496-500` 容器、`445-456` 条目）；**容器上无 `onClick`/`onTouchStart`/`onPointerDown`**；按钮的 `onClick`（`client.js:471-475`）只对可见条目有效，被裁掉的第 4 项起永远点不到。
- **判定**：触屏无悬停能力 ⇒ 轨道永远停在 3 格，除前 3 项外的标签无法经此轨访问。
- **注**：本插件是桌面优先、且用户明确要求「鼠标悬停出标题」，故本条按 **P1（触屏场景不可用）** 记录，是否修由产品定位决定。
- **建议**：容器加 `onPointerDown` 切换展开 + `aria-expanded`；`@media (hover:none)` 下默认展开。

### 【P2】展开过渡期间条目逐帧下移，命中可能错位
- **证据**：`client.js:511-513` flex 列布局 + `maxHeight` 过渡（`client.js:522-523`）。过渡期间条目在容器内逐帧下移，指针若落在「目标条目将来出现的位置」，此刻命中的是别的条目。
- **建议**：过渡期间给容器 `pointer-events:none`，结束后恢复；或改用 `transform` 控制可见性。

---

## 3. 悬停展开的可用性陷阱

### 【P1】指针从收起区移向展开区的路径上存在「空洞」，280ms 延时收起可能中途收走
- **证据**：`client.js:348-356` 延时 280ms；`client.js:522` 收起态容器仅 94px 高；第 4 项起虽在 DOM 内但被 `overflow:hidden`（`client.js:521`）裁掉 —— 指针离开 94px 区域即触发容器 `onMouseLeave` → 计时开始；若跨到目标条目耗时 > 280ms，轨道先收起，用户需重新悬停。
- **建议**：① 展开区改为脱离裁切容器的绝对定位浮层（`position:absolute; top:100%`），路径上无空洞；② 延时提到 400–500ms；③ 第 3 格与第 4 格之间加透明桥接热区。

### 【P2】展开态无 `aria-expanded`，AT 无法感知状态变化
- **证据**：`client.js:490-526` 容器 props 无 `aria-expanded`。**判据**：WCAG **4.1.2**。**建议**加 `aria-expanded={expanded}`，并给展开区 id 供 `aria-controls`。

### 【P2】右栏展开后轨道整体卸载，状态（expanded/hover/tip）未复位
- **证据**：`client.js:261-263` 右栏一展开 → `next=null` → `setRect(null)` → `client.js:372` 轨道卸载；而 `setRect` 只改 `rect`，**不复位 `expanded`/`hover`/`tip`** ⇒ 轨道再次出现时可能带着残留的展开态或气泡。
- **建议**：`rect` 变 null 时一并复位三项状态。

---

## 4. 标题气泡

### 【P1】`role="tooltip"` 既无 `id` 也无 `aria-describedby` 关联 —— 对读屏是孤儿节点
- **证据**：`client.js:531-556` 气泡无 `id`；按钮 props（`client.js:418-476`）无 `aria-describedby`。
- **判定**：ARIA tooltip 模式要求触发元素经 `aria-describedby` 引用 id，否则 AT 永远读不到气泡内容；**WCAG 4.1.2 / 1.3.1**。（内容本身已由 `aria-label` 传达，故缺陷在于声明了一个无法兑现的角色。）
- **建议**：给气泡稳定 id 并在按钮上加 `aria-describedby`；或直接去掉 `role="tooltip"`。

### 【P2】长标题会溢出视口左缘被裁切
- **证据**：`client.js:536` `position:'fixed'` + `client.js:539-541` 锚在按钮左侧 + `client.js:544` `whiteSpace:'nowrap'`。轨道贴近视口右缘，长标题向左延伸会越界。
- **建议**：加 `max-width: min(280px, 40vw)` 并允许换行；或做视口边缘检测翻转方向。

### 【P2】气泡与轨道的边界对比偏弱（浅色主题）
- **证据**：`client.js:548` 气泡底 `--dsw-alias-bg-overlay`；`client.js:517` 轨道底 `--dsw-alias-bg-base`；两者在浅色主题下同属浅色系，边界只靠 `rgba(127,127,127,.26)` 半透明描边（`client.js:549`）。
- **判据**：WCAG **1.4.11 Non-text Contrast (AA)**。**建议**边框改用不透明 token 或加深阴影。

### 【P3】原生 `title` 与自绘气泡重复叠字
- **证据**：`client.js:423` `title` 与 `client.js:424` `aria-label` 同值，且另有自绘气泡；原生 title 浮层通常延迟 0.5–1s 出现且不可 Esc 关闭（WCAG **1.4.13** 的 dismissable/hoverable/persistent 均不满足）。
- **建议**：删 `title`（`aria-label` 已提供名称），并给自绘气泡加 Esc 关闭。

---

## 5. prefers-reduced-motion

### 【P1】完全未实现
- **证据**：全文件 0 命中 `prefers-reduced-motion`；`client.js:523` `transition:'max-height .18s ease'`、`client.js:443` `transition:'background .12s ease, color .12s ease'` 恒开。宿主自身已做正确示范（其 `sidebar-right` 包内含 `@media (prefers-reduced-motion:reduce){transition:none}`）。
- **建议**：内联样式按 `matchMedia('(prefers-reduced-motion: reduce)')` 结果切换 `transition:'none'`。

---

## 6. 文案与语言

### 【P1】`aria-label` 与槽位 label 硬编码简体中文，英文界面下混语
- **证据**：`client.js:495` `'aria-label':'右侧栏快捷导航'`；`client.js:658` slot label `'快捷导航锚点'`；`client.js:665` slot label `'右侧栏快捷导航'`。宿主机制是槽位注册带 `locale: NS` + 词典文件（`sidebar-right/lib/client.js:4964`），**本插件完全没接入**；`locale/zh.json`、`locale/en.json` 里**只有 meta.title/description，无任何界面字符串**。
- **判据**：WCAG **3.1.2 Language of Parts (AA)**。
- **建议**：接入 locale 命名空间，`locale/*.json` 补界面词典键，客户端按当前语言取值。

### 【P2】语言切换后气泡标题可能不更新（依赖 `locale/change` 订阅）
- **证据**：`client.js:237-240` 订阅 `ctx.on('locale/change', bump)`；`client.js:393` 每次渲染重算 `title`。
- **核实结果**：**该订阅有效**——live Client inspection 显示客户端确有该事件（`'locale/change'(snapshot: LocaleSnapshot): void`）。本条降级为「需在 GUI 实测标题是否随语言切换刷新」，不作为缺陷。

---

## 7. 与右侧栏自身的交互冲突

### 【P1】点击后导航入口自我销毁 —— 一次只能选一个标签
- **证据**：`client.js:261-263` 右栏一展开即 `next=null` → `setRect(null)` → `client.js:372` 整条轨道卸载；而 `openTab()` 走 `placeTab`（宿主 `sidebar-right/lib/client.js:2128/2184`）。
- **影响**：这直接抵消「快捷导航」的价值主张 —— 要切第二个标签必须先手动收起右栏。
- **建议**：右栏展开时轨道不卸载（改用 `mounted` 判断替代 `isExpanded`），或改为「激活态高亮 + 常驻快切」。

### 【P1】z-index 与宿主浮层层级相撞
- 详见性能复核稿 §5：`shell.overlay` 层 `z-index:20; position:absolute` **自成 stacking context**，轨道内 `z-index:60` 的页面级实际只有 20，低于宿主 dockkit 浮动层(60)/菜单(70)/tooltip(100)/portal(1100)；**单纯调高轨道 z-index 无效**。

### 【P2】点击失败无任何用户可见反馈
- **证据**：`client.js:374-385` `goTab`：成功不做任何反馈；失败仅 `console.warn`（`client.js:377`）/ `console.error`（`client.js:380`）。
- **判据**：WCAG **3.3.1 Error Identification (A)**、**4.1.3 Status Messages (AA)**。**建议**：失败时在轨道原位给可见提示，并至少保留轨道 2 秒。

### 【P2】`findToggle()` 几何启发式会误锚
- **证据**：`client.js:201-202` 评分 `hinted*1000000 + r.right*100 - r.top`；当无任何 aria-label 含「sidebar/侧栏」时，`hinted` 全 0 ⇒ 退化为「取最靠右最靠上的任意带 aria-label 元素」；有效性闸门（`client.js:272-277`）只检查「在视口内且靠右」，错误锚点照样通过。
- **建议**：`hinted !== 1` 时返回 null（宁可不显示）；并优先用宿主稳定属性（见性能稿的 `data-sidebar-right-expand`）。

### 【P2】`findToggle()` 扫描范围包含隐藏元素
- **证据**：`client.js:172` 不过滤 `visibility`/`opacity:0`。**建议**用 `el.checkVisibility?.()` 过滤。

### 【P3】`ctx.on` 返回句柄形态不确定时的解绑
- **证据**：`client.js:239-240` 仅当 `typeof off === 'function'` 才入清理表。宿主 `ctx.on` 的确切返回契约本次未能坐实，故作风险提示。**建议**兼容 `{dispose()}` 形态。

---

## 8. 汇总

| 定级 | 条数 | 要点 |
|---|---|---|
| **P1** | 7 | 裁切区焦点不可见(2.4.7/2.4.11)；toolbar 缺 roving tabindex(2.1.1)；触屏不可用；悬停跨空洞误收；tooltip 无 id/无 aria-describedby(4.1.2)；硬编码中文(3.1.2)；无 reduced-motion(2.3.3)；跳转后入口自我销毁；z-index 层级相撞 |
| **P2** | 9 | focus-visible 实际未生效；展开期命中错位；无 aria-expanded；状态未复位；长标题溢出；气泡对比弱；title 重复；locale 订阅（已降级为待实测）；点击无反馈；误锚；扫到隐藏元素 |
| **P3** | 3 | separator 缺 aria-hidden；ctx.on 句柄形态；console 噪声 |

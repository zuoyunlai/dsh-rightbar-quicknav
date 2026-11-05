/**
 * dsh-rightbar-quicknav —— Host 半边。
 *
 * 全部行为发生在浏览器端（见 client.js）：
 *   - shell.overlay → 右侧栏竖排快捷导航轨道（帧级浮动层，fixed 定位在
 *     顶栏「打开右侧边栏」图标正下方；收起态只露 3 格，悬停展开全部条目）
 *   - 数据源：sidebarRightTabs.guide()（与官方 guide 页同一注册表）
 *   - 跳转：  sidebarRight.openTab(kind)（自动展开右侧栏并聚焦该标签）
 *
 * Host 侧没有要做的事，也不能在这里读 DOM。
 * 保留这个入口是因为 bundle 的 cordis.patch.yml 需要一行可加载的插件。
 */

/** 与 cordis.patch.yml 的 insert id 保持一致。 */
export const name = 'dsh-rightbar-quicknav'

/** Host 侧无行为。 */
export function apply() {}

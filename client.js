/**
 * dsh-rightbar-quicknav — 右侧栏快捷导航（DSH Web 客户端插件，无构建动态模块）
 *
 * 形态（2026-11-05 用户定稿）：
 *   在顶栏右侧「打开右侧边栏」图标**正下方**，常驻一条竖排图标轨；
 *   收起态只露 3 格，鼠标悬停向下展开全部条目，悬停单项在左侧浮出标题气泡，
 *   点击直达右侧栏对应标签（openTab → 右栏自动展开并切到该标签）。
 *
 * 数据源：sidebarRightTabs.guide()（与官方 guide 页同一注册表，随插件注册自动增减）
 * 跳转：  sidebarRight.openTab(kind)
 *
 * 挂载点（additive，不遮任何官方 UI）：
 *   shell.overlay → 图标轨本体（帧级浮动层，fixed 定位）
 *   —— 2026-11-06 审计反哺：原先在 conversation.session.header.utilities 注册的
 *      零尺寸锚点已删除；锚点改为直接定位宿主的展开按钮本身（findToggleEl）。
 *
 * 2026-11-06 审计反哺要点（逐条对应 AUDIT-2026-11-06.md）：
 *   P1-1 服务就绪竞态 → 服务进 inject，缺失即静默不激活；点击时重新解析服务
 *   P1-2 全页扫描    → 定位改用宿主稳定属性；几何测量事件驱动，稳态零轮询零布局
 *   P1-3 层级被困    → z-index 抬到 900/901（宿主 stacking context 的限制见报告）
 *   P1-4 styles 死码 → 整块删除 styles.insert 双通道与 CSS 常量（宿主无此服务）
 *   P1-5 硬编码中文  → 自带 zh/en 词典 + locale 服务探测 + locale/change 订阅
 *   P1-6 裁切可聚焦  → 收起态条件渲染（不再裁切），焦点只在可见项上
 *   P1-7 toolbar 空承诺 → roving tabindex + 方向键 + aria-orientation/expanded
 *   P2-1 失败无反馈  → 轨道内联提示条（role=status）
 *   P2-2 裁切高度靠猜 → 不再靠 maxHeight 估算（内容即高度）
 *   P2-3 无会话在屏  → 宿主展开按钮本身即「有会话在屏」的信号
 *   P2-4 锚点误锚    → 优先稳定属性，回退按 aria-label 匹配，匹配不到宁可不显示
 *   P2-7/P2-8 轮询与抖动 → 删除两个轮询定时器；几何只写 DOM style，不进 React 渲染管线
 *
 * 约束（官方红线，别改坏）：
 *   - 不 iframe、不往 document.body 追加、不 require 任何 @deepseek-ai/dsh-client-* 包
 *   - 样式只用 --dsw-alias-* 主题 token（每处带 fallback）
 *   - 组件抛错会让整个 slot 条目白屏 → 组件外层套 ErrorBoundary
 *   - 一切资源（订阅、监听器、定时器）在 effect 返回函数里释放
 */
window.__ModuleLoader__.load({
  id: 'dsh-rightbar-quicknav',
  factory(require) {
    'use strict'
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = React

    /* ================= 常量 ================= */

    const TAG = '[dsh-rightbar-quicknav]'
    const VERSION = '0.3.6'

    /** 每格图标按钮边长 / 轨道内边距 / 图标本身。 */
    const ITEM = 26
    const RAIL_PAD = 4
    const ICON = 16
    /** 轨道总宽（左右内边距 + 图标格 + 边框）。 */
    const RAIL_W = ITEM + RAIL_PAD * 2 + 2
    /** 轨道右缘与视口右缘留白 / 轨道顶部与展开按钮底部的间距。 */
    const RIGHT_GAP = 10
    const TOP_GAP = 50
    /** 收起态只露几格；悬停向下展开全部。 */
    const COLLAPSED_COUNT = 3
    /** 标题气泡的 DOM id 前缀（每实例唯一：shell.overlay 是 list 槽，可能有多实例）。 */
    const TIP_ID_PREFIX = 'dsh-rqn-tip-'
    /** locale 命名空间（若宿主 locale 服务可用则注册）。 */
    const NS = 'rightbarQuicknav'
    /** 宿主展开按钮的稳定属性（优先用它定位，避开文案与类名）。 */
    const TOGGLE_ATTR = 'data-sidebar-right-expand'
    /** 收起延时（毫秒）。 */
    const CLOSE_DELAY = 200
    /** 兜底位置：宿主展开按钮找不到时的默认顶部坐标。 */
    const DEFAULT_TOP = 64

    /* ================= 词典（自带 zh/en；locale 服务可用时以其为准） ================= */

    const DICT = {
      zh: {
        'rail.ariaLabel': '右侧栏快捷导航',
        'rail.anchorLabel': '快捷导航锚点',
        'rail.empty': '右侧栏还没有可直达的标签页',
        'rail.noService': '当前宿主没有右侧栏服务，无法直达',
        'rail.openFailed': '打开失败：该标签当前不可用',
      },
      en: {
        'rail.ariaLabel': 'Right sidebar quick nav',
        'rail.anchorLabel': 'Quick nav anchor',
        'rail.empty': 'No right-sidebar tabs to jump to',
        'rail.noService': 'This host has no right-sidebar service',
        'rail.openFailed': 'Could not open that tab',
      },
    }

    /** 当前界面语言（由 locale 服务探测，探测不到按中文）。 */
    let LANG = 'zh'

    /** 轨道实例序号：保证同一 profile 下多个实例的 DOM id 不重复。 */
    let instanceSeq = 0

    /** 取词典条目。 */
    function t(key) {
      const d = DICT[LANG] || DICT.zh
      return d[key] || DICT.en[key] || key
    }

    /* ================= 工具 ================= */

    /** 取服务（惰性解析，读不到当缺失，不崩）。 */
    function serviceOf(ctx, name) {
      if (!ctx) return undefined
      try {
        if (typeof ctx.get === 'function') {
          const v = ctx.get(name)
          if (v !== undefined && v !== null) return v
        }
      } catch (e) {
        /* fallthrough */
      }
      try {
        return ctx[name]
      } catch (e) {
        return undefined
      }
    }

    /** 系统是否要求减弱动效。 */
    function prefersReduced() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      } catch (e) {
        return false
      }
    }

    /** 定位宿主的「打开右侧边栏」按钮元素（只读属性与身份，不读几何）。 */
    function findToggleEl() {
      // ① 宿主稳定属性优先：与语言、类名都无关
      try {
        const el = document.querySelector('[' + TOGGLE_ATTR + ']')
        if (el) return el
      } catch (e) {
        /* ignore */
      }
      // ② 回退：按 aria-label 文案匹配（只读属性，不触发布局）
      let nodes = []
      try {
        nodes = Array.prototype.slice.call(document.querySelectorAll('[aria-label]'))
      } catch (e) {
        return null
      }
      const expand = []
      const collapse = []
      for (const el of nodes) {
        try {
          if (el.closest && el.closest('.dsh-rqn-rail')) continue
        } catch (e) {
          /* ignore */
        }
        let label = ''
        try {
          label = String(el.getAttribute('aria-label') || '')
        } catch (e) {
          label = ''
        }
        if (!/侧边栏|侧栏|sidebar/i.test(label)) continue
        // 「收起 / collapse」的是右栏面板内的按钮，不是我们要的展开按钮
        if (/收起|折叠|关闭|collapse|hide|close/i.test(label)) collapse.push(el)
        else expand.push(el)
      }
      // 优先展开按钮；多个时取最靠上（顶栏那个），需要时读一次几何
      const pick = (list) => {
        if (!list.length) return null
        if (list.length === 1) return list[0]
        let best = null
        let bestTop = Infinity
        for (const el of list) {
          let r = null
          try {
            r = el.getBoundingClientRect()
          } catch (e) {
            continue
          }
          if (!r) continue
          if (r.top < bestTop) {
            bestTop = r.top
            best = el
          }
        }
        return best || list[0]
      }
      return pick(expand) || pick(collapse)
    }

    /* ================= 图标 ================= */

    /** 缺省图标：立方体（对齐官方 guide 的占位）。 */
    function CubeIcon({ size }) {
      const s = size || ICON
      return h(
        'svg',
        {
          width: s,
          height: s,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.25,
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M8 1.8 14 5v6L8 14.2 2 11V5Z' }),
        h('path', { d: 'M2 5l6 3 6-3' }),
        h('path', { d: 'M8 8v6.2' }),
      )
    }

    /** 外部条目图标：抛错时回落立方体。 */
    function safeIcon(IconComp, size) {
      try {
        return h(IconComp, { size })
      } catch (e) {
        return h(CubeIcon, { size })
      }
    }

    /* ================= 错误边界 ================= */

    /**
     * 组件渲染期抛错时回落为空，而不是让整条 slot 条目白屏
     * （同族 dsh-pet 的 PetBoundary 同思路）。
     */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error) {
        try {
          console.error(TAG, '渲染失败，轨道已隐藏：', error)
        } catch (e) {
          /* ignore */
        }
      }
      render() {
        if (this.state.failed) return null
        return this.props.children
      }
    }

    /* ================= 轨道 ================= */

    function Rail(props) {
      const ctx = (props && props.ctx) || null
      const [entries, setEntries] = useState([])
      const [hover, setHover] = useState(null)
      const [expanded, setExpanded] = useState(false)
      const [tip, setTip] = useState(null)
      const [activeIndex, setActiveIndex] = useState(0)
      const [focusIndex, setFocusIndex] = useState(null)
      const [flash, setFlash] = useState(null)
      const [, setLangTick] = useState(0)

      const railRef = useRef(null)
      const tipRef = useRef(null)
      const btnRefs = useRef([])
      const closeTimer = useRef(0)
      const flashTimer = useRef(0)
      /** 每实例唯一的 tooltip id（shell.overlay 是 list 槽，可能挂多个实例）。 */
      const tipIdRef = useRef(null)
      if (tipIdRef.current === null) {
        instanceSeq += 1
        tipIdRef.current = TIP_ID_PREFIX + instanceSeq
      }
      const tipId = tipIdRef.current

      const tabsReg = serviceOf(ctx, 'sidebarRightTabs')
      const sidebarRight = serviceOf(ctx, 'sidebarRight')

      /* ---------- 条目与语言 ---------- */

      /**
       * 条目来自官方注册表；语言变化时重取（title() 是活值，重取即本地化）。
       * 注册表订阅 + locale/change 事件都在这里收口，避免多次重渲染。
       */
      useEffect(() => {
        const detectLang = () => {
          try {
            const loc = serviceOf(ctx, 'locale')
            const snap = loc && typeof loc.getSnapshot === 'function' ? loc.getSnapshot() : null
            const active = snap && snap.active ? String(snap.active) : ''
            const next = active && active.toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
            if (next !== LANG) {
              LANG = next
              setLangTick((n) => n + 1)
            }
          } catch (e) {
            /* keep previous */
          }
        }
        const readEntries = () => {
          try {
            const list = (tabsReg && typeof tabsReg.guide === 'function' ? tabsReg.guide() : []) || []
            setEntries(list.filter((e) => e && e.kind))
          } catch (e) {
            try {
              console.error(TAG, 'guide() 读取失败：', e)
            } catch (e2) {
              /* ignore */
            }
            setEntries([])
          }
          // 条目集合变了 ⇒ 旧的悬停项可能已不存在，气泡不能变成孤儿（审计 P1）
          setTip(null)
          setHover(null)
        }
        detectLang()
        readEntries()
        const offs = []
        try {
          if (tabsReg && typeof tabsReg.subscribe === 'function') {
            offs.push(
              tabsReg.subscribe(() => {
                detectLang()
                readEntries()
              }),
            )
          }
        } catch (e) {
          /* ignore */
        }
        try {
          if (ctx && typeof ctx.on === 'function') {
            const off = ctx.on('locale/change', () => {
              detectLang()
              readEntries()
            })
            if (typeof off === 'function') offs.push(off)
          }
        } catch (e) {
          /* ignore */
        }
        return () => offs.forEach((d) => {
          try {
            d()
          } catch (e) {
            /* ignore */
          }
        })
      }, [ctx, tabsReg])

      /* ---------- 定位宿主展开按钮（事件驱动，稳态零轮询零布局） ---------- */

      const anchorRef = useRef(null)
      const keyRef = useRef('')
      const warnedRef = useRef(false)
      const roRef = useRef(null)
      const moRef = useRef(null)
      const rafRef = useRef(0)

      const hideRail = useCallback(() => {
        const node = railRef.current
        if (node && node.style.display !== 'none') node.style.display = 'none'
      }, [])

      /** 默认位置（宿主按钮找不到时的兜底）：右上角下移一段。 */
      const placeDefault = useCallback(() => {
        const node = railRef.current
        if (!node) return
        try {
          const vw = window.innerWidth || 1200
          node.style.left = Math.max(4, Math.round(vw - RAIL_W - RIGHT_GAP)) + 'px'
          node.style.top = Math.round(DEFAULT_TOP) + 'px'
          node.style.display = 'flex'
        } catch (e) {
          hideRail()
        }
      }, [hideRail])

      const placeRail = useCallback(
        (el) => {
          const node = railRef.current
          if (!node) return
          try {
            const r = el.getBoundingClientRect()
            const vh = window.innerHeight || 800
            // 有效性闸门：**只查纵向**（必须在顶栏区域内、没被裁掉）。
            // 横向不设限 —— 轨道是视口锚定（右缘固定 RIGHT_GAP），锚点的横向位置与落点无关；
            // 早前用「右缘 < 55% 视口宽」做闸门，窗口一缩小按钮往左挪就越线，轨道整条消失（2026-11-06 用户实测）。
            if (r.width < 8 || r.height < 8 || r.top > 96 || r.bottom > vh - 40) {
              hideRail()
              return
            }
            node.style.left = Math.max(4, Math.round((window.innerWidth || 1200) - RAIL_W - RIGHT_GAP)) + 'px'
            node.style.top = Math.round(r.bottom + TOP_GAP) + 'px'
            node.style.display = 'flex'
          } catch (e) {
            hideRail()
          }
        },
        [hideRail],
      )

      /**
       * 廉价通道：只读属性与身份，不触发布局；
       * 只有「锚点身份 / 右栏开合 / 有无座位」三者任一变化时才做一次几何测量。
       * force=true 用于「几何必然变了」的场景（窗口缩放），必须重定位，不能被变更键挡掉。
       */
      const cheapPass = useCallback(
        (force) => {
          const el = findToggleEl()
          let expandedNow = false
          try {
            expandedNow = sidebarRight && typeof sidebarRight.isExpanded === 'function' ? sidebarRight.isExpanded() : false
          } catch (e) {
            expandedNow = false
          }
          let seat = 'unknown'
          try {
            const m = sidebarRight && sidebarRight.mounted
            if (m && typeof m.getSnapshot === 'function') seat = m.getSnapshot() === undefined ? 'none' : 'ok'
          } catch (e) {
            seat = 'unknown'
          }
          const key = (el ? '1' : '0') + '|' + expandedNow + '|' + seat
          // 锚点身份也进判定：换了锚点必须重新定位并重新挂观察（审计 P1）
          const anchorChanged = el !== anchorRef.current
          if (!force && key === keyRef.current && !anchorChanged) return
          keyRef.current = key
        if (expandedNow || seat === 'none') {
          hideRail()
          anchorRef.current = null
          return
        }
        if (!el) {
          // 兜底：宿主若改了按钮文案/属性，轨道仍以默认位置出现（而不是整条消失）
          if (!warnedRef.current) {
            warnedRef.current = true
            try {
              console.warn(TAG, '找不到宿主展开按钮（' + TOGGLE_ATTR + ' 与 aria-label 均未命中），轨道改用默认位置。')
            } catch (e) {
              /* ignore */
            }
          }
          placeDefault()
          anchorRef.current = null
          return
        }
        placeRail(el)
        anchorRef.current = el
        // 锚点换了才重新挂尺寸观察（不轮询）
        if (roRef.current) {
          try {
            roRef.current.disconnect()
          } catch (e) {
            /* ignore */
          }
          try {
            roRef.current.observe(el)
          } catch (e) {
            /* ignore */
          }
        }
      }, [sidebarRight, hideRail, placeRail])

      const schedulePass = useCallback(
        (force) => {
          if (rafRef.current) return
          try {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = 0
              cheapPass(force)
            })
          } catch (e) {
            rafRef.current = 0
            cheapPass(force)
          }
        },
        [cheapPass],
      )

      /* 首次定位必须在绘制前完成，避免左上角闪一帧 */
      useLayoutEffect(() => {
        hideRail()
        cheapPass(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      useEffect(() => {
        let disposed = false

        /* DOM 变化 → 只跑廉价通道（身份没变就不碰布局）。
           注意：MutationObserver 会把 (mutations, observer) 当参数传进来，
           这里必须显式传 force=false，否则每次 DOM 变动都会强制重测几何。 */
        try {
          const mo = new MutationObserver(() => schedulePass(false))
          mo.observe(document.body, { childList: true, subtree: true })
          moRef.current = mo
        } catch (e) {
          moRef.current = null
        }

        /* 锚点尺寸变化 → 重新测量一次（唯一读几何的路径） */
        try {
          if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
              const el = anchorRef.current
              if (el && !disposed) placeRail(el)
            })
            roRef.current = ro
          }
        } catch (e) {
          roRef.current = null
        }

        window.addEventListener('resize', () => schedulePass(true), true)

        return () => {
          disposed = true
          if (rafRef.current) {
            try {
              cancelAnimationFrame(rafRef.current)
            } catch (e) {
              /* ignore */
            }
            rafRef.current = 0
          }
          if (moRef.current) {
            try {
              moRef.current.disconnect()
            } catch (e) {
              /* ignore */
            }
            moRef.current = null
          }
          if (roRef.current) {
            try {
              roRef.current.disconnect()
            } catch (e) {
              /* ignore */
            }
            roRef.current = null
          }
          window.removeEventListener('resize', schedulePass, true)
        }
      }, [schedulePass, placeRail])

      /* 座位变化（会话切换 / 退屏）→ 重新判定可见性：mounted 是可订阅的响应式 store */
      useEffect(() => {
        const m = sidebarRight && sidebarRight.mounted
        if (!m || typeof m.subscribe !== 'function') return undefined
        let off = null
        try {
          off = m.subscribe(() => {
            schedulePass(true)
          })
        } catch (e) {
          off = null
        }
        return () => {
          if (typeof off === 'function') {
            try {
              off()
            } catch (e) {
              /* ignore */
            }
          }
        }
      }, [sidebarRight, cheapPass, schedulePass])

      /* ---------- 交互 ---------- */

      const cancelCollapse = useCallback(() => {
        if (closeTimer.current) {
          clearTimeout(closeTimer.current)
          closeTimer.current = 0
        }
      }, [])

      const scheduleCollapse = useCallback(() => {
        cancelCollapse()
        closeTimer.current = setTimeout(() => {
          closeTimer.current = 0
          setExpanded(false)
          setHover(null)
          setTip(null)
        }, CLOSE_DELAY)
      }, [cancelCollapse])

      useEffect(() => cancelCollapse, [cancelCollapse])
      useEffect(
        () => () => {
          if (flashTimer.current) clearTimeout(flashTimer.current)
        },
        [],
      )

      const showFlash = useCallback((msg) => {
        setFlash(msg)
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => {
          flashTimer.current = 0
          setFlash(null)
        }, 2400)
      }, [])

      const goTab = useCallback(
        (kind) => {
          // 点击时重新解析服务：不在渲染期捕获引用（审计 P2-1）
          const svc = serviceOf(ctx, 'sidebarRight')
          if (!svc || typeof svc.openTab !== 'function') {
            try {
              console.warn(TAG, '当前宿主没有 sidebarRight.openTab，无法直达。')
            } catch (e) {
              /* ignore */
            }
            showFlash(t('rail.noService'))
            return
          }
          try {
            svc.openTab(kind)
          } catch (e) {
            try {
              console.error(TAG, 'openTab("' + kind + '") 失败：', e)
            } catch (e2) {
              /* ignore */
            }
            showFlash(t('rail.openFailed'))
          }
        },
        [ctx, showFlash],
      )

      /* 收起态只渲染前 3 项 → 高度自然精确、无裁切、无隐藏可聚焦项（审计 P1-6 / P2-2） */
      const items = useMemo(() => {
        const list = entries.filter((e) => e && e.kind)
        return expanded ? list : list.slice(0, COLLAPSED_COUNT)
      }, [entries, expanded])

      /* 可见项变少时把活动项夹回范围内，避免 toolbar 失去唯一 Tab 停靠点 */
      const act = items.length ? Math.min(activeIndex, items.length - 1) : 0
      /* 方向键按「全部条目」算下标：收起态先展开再移动，不会跳过被折叠的条目（审计 P2） */
      const totalCount = entries.length
      const actFull = totalCount ? Math.min(activeIndex, totalCount - 1) : 0

      const onKeyDown = useCallback(
        (e) => {
          const n = totalCount
          if (e.key === 'Escape') {
            setTip(null)
            setHover(null)
            return
          }
          if (!n) return
          let next = -1
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (actFull + 1) % n
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (actFull - 1 + n) % n
          else if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = n - 1
          else return
          e.preventDefault()
          setActiveIndex(next)
          setExpanded(true)
          try {
            requestAnimationFrame(() => {
              const el = btnRefs.current[next]
              if (el && el.focus) el.focus()
            })
          } catch (err) {
            /* ignore */
          }
        },
        [totalCount, actFull],
      )

      /* ---------- 渲染 ---------- */

      /**
       * 气泡配色 + 定位：
       *  - 底色**由轨道实际底色按明暗方向微调**（深色模式调浅一档、亮色模式调深一档），
       *    再不用边框，靠这点明度差把它和背景分开（2026-11-06 用户要求）；
       *  - 用 JS 混色而不是 color-mix，避免宿主浏览器差异，也便于把尖头染成同色；
       *  - 坐标每次按当前布局重测（不用悬停瞬间的快照）。
       */
      const tipStyle = useCallback(() => {
        // 解析 rgb()/rgba() 字面量
        const parseRgb = (s) => {
          const m = String(s || '').match(/rgba?\(([^)]+)\)/)
          if (!m) return null
          const p = m[1].split(',').map((v) => parseFloat(v))
          if (p.length < 3 || p.some((v) => !isFinite(v))) return null
          return { r: p[0], g: p[1], b: p[2] }
        }
        const railEl = railRef.current
        if (!railEl) return null
        let base = ''
        try {
          base = getComputedStyle(railEl).backgroundColor
        } catch (e) {
          return null
        }
        const c = parseRgb(base)
        if (!c) return null
        // 深色模式往白偏（变浅），亮色模式往黑偏（变深）
        let dark = false
        try {
          dark = !!(document.body && document.body.hasAttribute('data-ds-dark-theme'))
        } catch (e) {
          dark = false
        }
        const target = dark ? 255 : 0
        const ratio = dark ? 0.1 : 0.08
        const mix = (v) => Math.round(v + (target - v) * ratio)
        return 'rgb(' + mix(c.r) + ',' + mix(c.g) + ',' + mix(c.b) + ')'
      }, [])

      useLayoutEffect(() => {
        const el = tipRef.current
        if (!tip || !el) return
        const btn = btnRefs.current[tip.index]
        if (!btn) return
        try {
          const r = btn.getBoundingClientRect()
          const bg = tipStyle() || ''
          if (bg) {
            el.style.background = bg
            el.style.backgroundColor = bg
          }
          const tail = el.querySelector('[data-rqn-tail]')
          const w = el.offsetWidth || 0
          const leftSpace = r.left - 10
          const flip = w > 0 && leftSpace - w < 8
          el.style.top = r.top + r.height / 2 + 'px'
          if (flip) {
            // 左侧放不下 → 翻到图标右侧，尖头朝左
            el.style.left = r.right + 10 + 'px'
            el.style.transform = 'translate(0, -50%)'
            if (tail) {
              tail.style.right = 'auto'
              tail.style.left = '-5px'
              tail.style.borderRight = '5px solid ' + (bg || 'transparent')
              tail.style.borderLeft = '0'
            }
          } else {
            el.style.left = leftSpace + 'px'
            el.style.transform = 'translate(-100%, -50%)'
            if (tail) {
              tail.style.left = 'auto'
              tail.style.right = '-5px'
              tail.style.borderLeft = '5px solid ' + (bg || 'transparent')
              tail.style.borderRight = '0'
            }
          }
        } catch (e) {
          /* ignore */
        }
      }, [tip, expanded, entries, tipStyle])

      const reduced = prefersReduced()
      const kids = []
      let lastProvider = null

      items.forEach((entry, i) => {
        let title = ''
        try {
          title = typeof entry.title === 'function' ? String(entry.title()) : String(entry.title || entry.kind)
        } catch (e) {
          title = entry.kind
        }
        const provider = entry.providerId || ''
        if (lastProvider !== null && provider !== lastProvider) {
          kids.push(
            h('div', {
              key: 'sep-' + i,
              role: 'separator',
              'aria-hidden': 'true',
              style: {
                width: 18,
                height: 1,
                margin: '2px 0',
                flex: 'none',
                alignSelf: 'center',
                background: 'var(--dsw-alias-border-l1, rgba(127,127,127,.28))',
              },
            }),
          )
        }
        lastProvider = provider
        const active = i === hover
        const focused = i === focusIndex
        const described = tip && tip.index === i ? tipId : undefined

        kids.push(
          h(
            'button',
            {
              key: (provider || '') + '/' + (entry.id || i),
              ref: (el) => {
                btnRefs.current[i] = el
              },
              type: 'button',
              className: 'dsh-rqn-item' + (active ? ' is-hover' : ''),
              'aria-label': title,
              'aria-describedby': described,
              // roving tabindex：toolbar 只占一个 Tab 停靠点
              tabIndex: i === act ? 0 : -1,
              onClick: (e) => {
                e.preventDefault()
                e.stopPropagation()
                goTab(entry.kind)
              },
              onMouseEnter: () => {
                setHover(i)
                setExpanded(true)
                cancelCollapse()
                setTip({ index: i, title: title })
              },
              onMouseLeave: () => {
                setHover((cur) => (cur === i ? null : cur))
                setTip((cur) => (cur && cur.index === i ? null : cur))
              },
              onFocus: (e) => {
                // 只有键盘焦点才画焦点轮廓：鼠标点击不该留下键盘焦点环
                let keyboard = true
                try {
                  keyboard = !e.currentTarget.matches || e.currentTarget.matches(':focus-visible')
                } catch (err) {
                  keyboard = true
                }
                setFocusIndex(keyboard ? i : null)
                setActiveIndex(i)
                setExpanded(true)
                setTip({ index: i, title: title })
              },
              onBlur: () => {
                setFocusIndex((cur) => (cur === i ? null : cur))
                setTip((cur) => (cur && cur.index === i ? null : cur))
              },
              style: {
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: ITEM,
                height: ITEM,
                padding: 0,
                margin: 0,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                background: active
                  ? 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16))'
                  : 'transparent',
                color: active
                  ? 'var(--dsw-alias-label-primary, #f5f6f7)'
                  : 'var(--dsw-alias-label-secondary, #8a8f98)',
                transition: reduced ? 'none' : 'background .12s ease, color .12s ease',
                // 焦点轮廓：类样式在宿主上不生效（宿主无 styles 服务），故内联
                outline: focused ? '2px solid var(--dsw-alias-brand-primary, #4c78ff)' : 'none',
                outlineOffset: focused ? '1px' : '0',
              },
            },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: ICON, height: ICON } },
              entry.icon && typeof entry.icon === 'function' ? safeIcon(entry.icon, ICON) : h(CubeIcon, { size: ICON }),
            ),
          ),
        )
      })

      if (!items.length) {
        kids.push(
          h(
            'div',
            {
              key: 'empty',
              role: 'status',
              style: {
                fontSize: 11.5,
                lineHeight: 1.35,
                color: 'var(--dsw-alias-label-tertiary, #9aa0a6)',
                maxWidth: 160,
                padding: '4px 6px',
                textAlign: 'center',
              },
            },
            t('rail.empty'),
          ),
        )
      }

      const tipEl = tip
        ? h(
            'div',
            {
              id: tipId,
              ref: tipRef,
              role: 'tooltip',
              style: {
                position: 'fixed',
                zIndex: 901,
                top: 0,
                left: 0,
                transform: 'translate(-100%, -50%)',
                padding: '4px 8px',
                borderRadius: 7,
                // 单行不换行，宽度自适应内容（2026-11-06 用户要求）
                whiteSpace: 'nowrap',
                fontSize: 11.5,
                lineHeight: 1.3,
                pointerEvents: 'none',
                // 底色由 effect 按「轨道实际底色 + 明暗方向」混色写入；无边框（2026-11-06 用户要求）
                background: 'inherit',
                border: 'none',
                color: 'var(--dsw-alias-label-primary, #f5f6f7)',
                boxShadow: '0 2px 8px rgba(0,0,0,.14)',
              },
            },
            tip.title,
            // 小尖头：指向图标一侧（贴在气泡右缘，向外指）
            h('span', {
              'data-rqn-tail': '1',
              'aria-hidden': 'true',
              style: {
                position: 'absolute',
                top: '50%',
                right: '-5px',
                width: 0,
                height: 0,
                transform: 'translateY(-50%)',
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderLeft: '5px solid transparent',
              },
            }),
          )
        : null

      const flashEl = flash
        ? h(
            'div',
            {
              role: 'status',
              style: {
                marginTop: 4,
                padding: '4px 6px',
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.3,
                color: 'var(--dsw-alias-state-error-primary, #ef4444)',
                background: 'var(--dsw-alias-state-error-secondary, rgba(239,68,68,.12))',
                maxWidth: 180,
              },
            },
            flash,
          )
        : null

      return h(
        'div',
        {
          ref: railRef,
          className: 'dsh-rqn-rail',
          // 没有条目时不用 toolbar（空工具栏不合语义），改用 group + status 文案
          role: items.length ? 'toolbar' : 'group',
          'aria-orientation': items.length ? 'vertical' : undefined,
          'aria-label': t('rail.ariaLabel'),
          'aria-expanded': items.length ? (expanded ? 'true' : 'false') : undefined,
          onMouseEnter: () => {
            cancelCollapse()
            setExpanded(true)
          },
          onMouseLeave: scheduleCollapse,
          onKeyDown: onKeyDown,
          style: {
            // left / top / display 由 effect 命令式写入：
            // 不放进 React style 里，否则每次重渲染都会被 React 覆盖回初值。
            position: 'fixed',
            zIndex: 900,
            boxSizing: 'border-box',
            width: RAIL_W,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            padding: RAIL_PAD,
            borderRadius: 12,
            // 底色与主栏同色（--dsw-alias-bg-base），阴影只做轻微托起
            // （2026-11-06 用户反馈：亮色模式下原来的 0 10px 28px 太重，只要一点点）
            background: 'var(--dsw-alias-bg-base, #1b1c1f)',
            border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18))',
            boxShadow: '0 2px 8px rgba(0,0,0,.10)',
            fontFamily: 'inherit',
          },
        },
        kids,
        tipEl,
        flashEl,
      )
    }

    /* ================= 插件入口 ================= */

    return {
      // 服务进 inject：缺失时插件静默不激活，而不是运行时才发现（审计 P1-1）
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        try {
          console.info(TAG, 'client v' + VERSION + ' loaded · rail mode')
        } catch (e) {
          /* ignore */
        }

        /* locale 命名空间：宿主 locale 服务可用时注册，让槽位标签可被宿主本地化。
           注册失败则不声明 locale 字段（声明了却没注册会被宿主判为装配失败）。 */
        let localeReady = false
        try {
          const loc = serviceOf(ctx, 'locale')
          if (loc && typeof loc.register === 'function') {
            const off = loc.register(NS, {
              en: {
                'rail.ariaLabel': DICT.en['rail.ariaLabel'],
                'rail.anchorLabel': DICT.en['rail.anchorLabel'],
              },
              zh: {
                'rail.ariaLabel': DICT.zh['rail.ariaLabel'],
                'rail.anchorLabel': DICT.zh['rail.anchorLabel'],
              },
            })
            localeReady = true
            ctx.effect(() => () => {
              if (typeof off === 'function') {
                try {
                  off()
                } catch (e) {
                  /* ignore */
                }
              }
            }, 'dsh-rqn: locale disposer')
          }
        } catch (e) {
          localeReady = false
        }

        const mountSlot = (slot, spec, Component, extraProps) => {
          try {
            ctx.slots.inject(slot, () =>
              ctx.slots.register(spec, (props) =>
                h(Boundary, null, h(Component, Object.assign({}, props, extraProps || {}))),
              ),
            )
          } catch (e) {
            try {
              console.warn(TAG, '这个宿主没有 "' + slot + '" 插槽，快捷导航无法挂载。')
            } catch (e2) {
              /* ignore */
            }
          }
        }

        // 图标轨本体：帧级浮动层，fixed 定位在宿主展开按钮正下方
        const spec = { name: 'shell.overlay', id: 'dsh-rqn-rail', order: 300, label: t('rail.ariaLabel') }
        if (localeReady) spec.locale = NS
        mountSlot('shell.overlay', spec, Rail, { ctx })
      },
    }
  },
})

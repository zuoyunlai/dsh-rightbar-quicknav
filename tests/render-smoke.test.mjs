/**
 * 渲染冒烟测试（零依赖，node:test）。
 *
 * 用途：抓「渲染期抛错 ⇒ 整条轨道静默消失」这一类 P0。
 * 2026-11-06 的 v0.3.1 就是这么翻车的：effect 参数里写了一个不存在的标识符
 * （cancelClose），渲染期 ReferenceError 被 ErrorBoundary 吞掉，界面零反馈。
 * 逐行通读没看出来，是第四路复核用 jsdom 跑真实文件才复现的。
 *
 * 做法：用最小 React 桩驱动组件函数直接渲染（不依赖 jsdom/react-dom），
 * 断言渲染过程不抛错、且产出预期数量的条目按钮。
 *
 * 运行：node --test tests/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientPath = path.join(here, '..', 'client.js')

/* ---------- 最小 React 桩 ---------- */

function makeReactStub() {
  const hookState = []
  let cursor = 0
  let effects = []
  const stub = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) }
    },
    Component: class {
      constructor(props) {
        this.props = props
        this.state = {}
      }
      setState(next) {
        this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
      }
    },
    Fragment: 'Fragment',
    useState(initial) {
      const i = cursor++
      if (!(i in hookState)) hookState[i] = typeof initial === 'function' ? initial() : initial
      const setter = (next) => {
        hookState[i] = typeof next === 'function' ? next(hookState[i]) : next
      }
      return [hookState[i], setter]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in hookState)) hookState[i] = { current: initial }
      return hookState[i]
    },
    useMemo(fn, deps) {
      return fn()
    },
    useCallback(fn) {
      return fn
    },
    useEffect(fn) {
      effects.push(fn)
    },
    useLayoutEffect(fn) {
      effects.push(fn)
    },
  }
  stub.__reset = () => {
    hookState.length = 0
    cursor = 0
    effects = []
  }
  /** 重置 hook 游标但保留 state（模拟同一组件实例的再次渲染）。 */
  stub.__nextRender = () => {
    cursor = 0
    effects = []
  }
  /** 执行本轮收集到的 effect（模拟 React 提交阶段）。
   *  **effect 内的异常必须暴露**：v0.3.1 的 P0 正是在 effect 里引用了未定义标识符
   *  （cancelClose），若这里吞掉异常，测试就成了「永远绿」的假护栏。 */
  stub.__runEffects = () => {
    const list = effects
    effects = []
    for (const fn of list) {
      try {
        fn()
      } catch (e) {
        stub.__errors.push(e)
      }
    }
  }
  stub.__errors = []
  return stub
}

/* ---------- 宿主契约桩 ---------- */

function makeCtx(entries) {
  const registered = []
  const ctx = {
    slots: {
      inject(slot, cb) {
        ctx.slots.__cb = cb
      },
      register(spec, component) {
        registered.push({ slot: spec.name, spec, component })
        return () => {}
      },
    },
    get(name) {
      if (name === 'sidebarRightTabs') {
        return {
          guide: () => entries.map((e, i) => ({ id: e.id || 'e' + i, kind: e.kind, providerId: e.providerId || 'p', title: () => e.title })),
          subscribe: () => () => {},
        }
      }
      if (name === 'sidebarRight') {
        return {
          openTab: () => {},
          isExpanded: () => false,
          mounted: { getSnapshot: () => 'session-1', subscribe: () => () => {} },
        }
      }
      if (name === 'locale') return { getSnapshot: () => ({ active: 'zh' }), register: () => () => {} }
      return undefined
    },
    effect(cb) {
      const dispose = cb()
      if (typeof dispose === 'function') ctx.__disposers.push(dispose)
      return () => {}
    },
    __disposers: [],
    __registered: registered,
  }
  return ctx
}

/* ---------- 加载插件 ---------- */

function loadPlugin(entries) {
  const source = fs.readFileSync(clientPath, 'utf8')
  const React = makeReactStub()
  let captured = null

  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(def) {
          captured = def
        },
      },
      matchMedia: () => ({ matches: false }),
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener() {},
      removeEventListener() {},
    },
    document: {
      body: {},
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
    },
    console: { info() {}, warn() {}, error() {}, debug() {}, log() {} },
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { language: 'zh-CN' },
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox.window

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: clientPath })

  assert.ok(captured, '插件没有调用 window.__ModuleLoader__.load()')
  const mod = captured.factory((name) => {
    if (name === 'react') return React
    throw new Error('未预期的 require: ' + name)
  })
  return { mod, React }
}

/* ---------- 取组件树（含 Boundary 解包） ---------- */

function renderRail(React, rail, props) {
  React.__reset()
  React.__errors.length = 0
  // 槽位注册的是 <Boundary>{<Rail/>}</Boundary>：这里手动解包并真正调用 Rail
  const wrapped = rail.component(props)
  const inner = (wrapped.children || [])[0]
  const tree = inner.type(inner.props)
  // 执行 effect（填充条目 state），再渲染一次，模拟 React 的「加载后重渲染」
  React.__runEffects()
  React.__nextRender()
  const wrapped2 = rail.component(props)
  const inner2 = (wrapped2.children || [])[0]
  const out = inner2.type(inner2.props)
  return { tree: out, errors: React.__errors.slice() }
}

function countNodes(node, pred) {
  let n = 0
  const walk = (x) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) {
      x.forEach(walk)
      return
    }
    if (pred(x)) n += 1
    ;(x.children || []).forEach(walk)
  }
  walk(node)
  return n
}

/* ---------- 用例 ---------- */

test('渲染不抛错（v0.3.1 的 cancelClose 笔误即栽在这里）', () => {
  const { mod } = loadPlugin([{ kind: 'files', title: '文件' }])
  const ctx = makeCtx([{ kind: 'files', title: '文件' }])
  assert.doesNotThrow(() => mod.apply(ctx))
})

test('轨道组件渲染出预期数量的条目按钮', () => {
  const entries = [
    { kind: 'files', title: '文件' },
    { kind: 'git', title: 'Git' },
    { kind: 'ctx', title: '上下文' },
    { kind: 'term', title: '终端' },
    { kind: 'task', title: '任务管理' },
  ]
  const { mod, React } = loadPlugin(entries)
  const ctx = makeCtx(entries)
  mod.apply(ctx)

  assert.ok(ctx.slots.__cb, '插件没有向 slots.inject 注册')
  ctx.slots.__cb()

  const rail = ctx.__registered.find((r) => r.slot === 'shell.overlay')
  assert.ok(rail, '没有注册到 shell.overlay')

  const { tree, errors } = renderRail(React, rail, { ctx })

  assert.deepEqual(
    errors.map((e) => String(e && e.message ? e.message : e)),
    [],
    'effect 执行期不得抛错（v0.3.1 的 P0 正是 effect 里引用了未定义标识符）',
  )

  const buttons = countNodes(tree, (x) => x.type === 'button')
  assert.equal(buttons, 3, `收起态应只渲染 3 格，实际 ${buttons}`)

  const toolbars = countNodes(tree, (x) => x.props && x.props.role === 'toolbar')
  assert.equal(toolbars, 1, '容器应声明 role=toolbar')

  const described = countNodes(tree, (x) => x.props && x.props['aria-describedby'])
  assert.equal(described, 0, '未悬停时不应有 aria-describedby 引用')
})

test('条目为空时不声明 toolbar（空工具栏不合语义）', () => {
  const { mod, React } = loadPlugin([])
  const ctx = makeCtx([])
  mod.apply(ctx)
  ctx.slots.__cb()
  const rail = ctx.__registered.find((r) => r.slot === 'shell.overlay')
  const { tree } = renderRail(React, rail, { ctx })
  const roles = []
  const walk = (x) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(walk)
    if (x.props && x.props.role) roles.push(x.props.role)
    ;(x.children || []).forEach(walk)
  }
  walk(tree)
  assert.ok(!roles.includes('toolbar'), '空态不应声明 toolbar，实际：' + roles.join(','))
})

/* ---------- 语义默认图标（0.3.8） ---------- */

/**
 * 收集每个按钮里「语义图标」的名字。
 * 铁路渲染出的是 <GlyphIcon name=... />（组件元素，不是 svg），
 * 所以按 props.name 取即可；宿主自带图标的条目会命中 __isHostIcon。
 */
function iconNamesPerButton(node) {
  const out = []
  const scan = (x) => {
    const names = []
    let host = false
    const walk = (y) => {
      if (!y || typeof y !== 'object') return
      if (Array.isArray(y)) return y.forEach(walk)
      if (typeof y.type === 'function' && y.type.__isHostIcon) host = true
      if (y.props && typeof y.props.name === 'string') names.push(y.props.name)
      ;(y.children || []).forEach(walk)
    }
    walk(x)
    return { names, host }
  }
  const walkButtons = (x) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(walkButtons)
    if (x.type === 'button') out.push(scan(x))
    ;(x.children || []).forEach(walkButtons)
  }
  walkButtons(node)
  return out
}

test('没有自带图标时，按 kind/标题给出不同语义图标', () => {
  const entries = [
    { kind: 'image-studio', title: '图像工作台' },
    { kind: 'files', title: '文件' },
    { kind: 'git', title: 'Git' },
  ]
  const { mod, React } = loadPlugin(entries)
  const ctx = makeCtx(entries)
  mod.apply(ctx)
  ctx.slots.__cb()
  const rail = ctx.__registered.find((r) => r.slot === 'shell.overlay')
  const { tree, errors } = renderRail(React, rail, { ctx })
  assert.deepEqual(errors, [], '渲染不得抛错')

  const got = iconNamesPerButton(tree)
  assert.equal(got.length, 3, '收起态应有 3 个条目')
  const names = got.map((g) => g.names[0])
  assert.deepEqual(names, ['image', 'file', 'git'], '语义映射不符：' + names.join(','))
  assert.equal(new Set(names).size, 3, '三个条目的图标不应相同')
  assert.ok(
    got.every((g) => g.names.length === 1),
    '每个条目只应有一个图标',
  )
})

test('条目自带图标时优先用自带的，不注入语义图标', () => {
  const hostIcon = () => null
  hostIcon.__isHostIcon = true
  const entries = [
    { kind: 'image-studio', title: '图像工作台', icon: hostIcon },
    { kind: 'files', title: '文件' },
    { kind: 'git', title: 'Git' },
  ]
  const { mod, React } = loadPlugin(entries)
  const ctx = makeCtx(entries)
  // guide() 需要把 icon 透传出来
  const origGet = ctx.get.bind(ctx)
  ctx.get = (name) => {
    if (name !== 'sidebarRightTabs') return origGet(name)
    return {
      guide: () => entries.map((e, i) => ({ id: 'e' + i, kind: e.kind, providerId: 'p', title: () => e.title, icon: e.icon })),
      subscribe: () => () => {},
    }
  }
  mod.apply(ctx)
  ctx.slots.__cb()
  const rail = ctx.__registered.find((r) => r.slot === 'shell.overlay')
  const { tree } = renderRail(React, rail, { ctx })

  const got = iconNamesPerButton(tree)
  assert.equal(got.length, 3)
  assert.ok(got[0].host === true, '第一个条目应使用宿主自带图标')
  assert.equal(got[0].names.length, 0, '自带图标时不应再叠一个语义图标')
  assert.deepEqual(
    got.slice(1).map((g) => g.names[0]),
    ['file', 'git'],
    '其余条目仍用语义图标',
  )
})

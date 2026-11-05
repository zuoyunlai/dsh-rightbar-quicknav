# dsh-rightbar-quicknav

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c78ff)](https://github.com/deepseek-ai/deepseek-harness)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Right-sidebar quick navigation for DeepSeek Harness (DSH) — a vertical icon rail that jumps straight to any right-sidebar tab.**

> English · [简体中文](README-zh.md) · [日本語](README-ja.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

## What it does

DSH puts every right-sidebar feature (Files, Git, Tasks, Terminal, Browser, Image Studio, Memory…) behind a tab strip you have to open first. This plugin adds a **standing icon rail** directly under the *open right sidebar* button:

- **Collapsed, it shows only 3 icons** — almost invisible until you need it.
- **Hover it** and it expands downward to reveal every available tab.
- **Hover an icon** and its title appears in a compact bubble.
- **Click an icon** and the right sidebar opens straight on that tab — one click instead of three.

The list is not hard-coded: it is read from the host's own tab registry (`sidebarRightTabs.guide()`), so any plugin that registers a tab appears in the rail automatically.

## Install

### Through the plugin manager (recommended)

`Plugins → Add` and point it at this package (npm tarball or a local directory). The bundle patch wires the client half into the Web/Desktop profile.

### Manual

```bash
cd ~/.dsh/profiles/<your-profile>
pnpm add dsh-rightbar-quicknav
```

Then **restart DSH completely** — client modules are composed at boot, a page refresh is not enough.

## Requirements

- DSH `>= 0.2.1-rc.1` (needs the `sidebarRightTabs` / `sidebarRight` client services)
- React provided by the host — this plugin has **no runtime dependencies** and **no build step**

## Behaviour details

| | |
|---|---|
| Position | right edge of the viewport, `10px` gap; `50px` below the host's *open right sidebar* button |
| Collapsed | 3 icons |
| Expand | hover (200 ms collapse delay when the pointer leaves) |
| Tooltip | single line, auto-width, flips to the other side when there is no room |
| Jump | `sidebarRight.openTab(kind)` |
| Hidden when | the right sidebar is already open, or no session is on screen |

## Design boundaries

- Mounts **only** into the additive `shell.overlay` slot — never covers or replaces shipped UI.
- All visuals are **inline React styles**: the host exposes no `styles` service, so class-based CSS would silently do nothing.
- Geometry is **event-driven** (`MutationObserver` + `ResizeObserver`), with zero polling and zero forced layout in steady state.
- The anchor is the host's own button, located by the stable attribute `data-sidebar-right-expand`, with an `aria-label` fallback; if neither matches, the rail falls back to a default position and logs one warning instead of disappearing or mis-anchoring.
- Keyboard accessible: the rail is a `toolbar` with roving tabindex and arrow keys, `Esc` closes the tooltip, focus outline is keyboard-only.
- Respects `prefers-reduced-motion`; a render-time exception is caught by an ErrorBoundary instead of blanking the slot.
- UI strings are bilingual (zh / en) and registered under the `rightbarQuicknav` locale namespace when the host provides one.

## Audit

This plugin has been through a full audit and a follow-up remediation round; both are in the repository:

- [`AUDIT-2026-11-06.md`](AUDIT-2026-11-06.md) — full audit: scoring, findings, roadmap
- [`AUDIT-a11y.md`](AUDIT-a11y.md) — interaction & accessibility review
- [`AUDIT-perf.md`](AUDIT-perf.md) — performance & resource review
- [`AUDIT-2026-11-06-REMEDIATION.md`](AUDIT-2026-11-06-REMEDIATION.md) — per-item verification and remediation ledger

## Development

```bash
node --check client.js     # syntax
node --test tests/         # render smoke tests (zero dependencies)
```

The render smoke test loads the real `client.js`, drives the plugin's own `apply() → slots.inject → slots.register` path with a minimal React stub, and asserts that rendering and effects do not throw. It exists because a single undefined identifier in an effect once made the whole rail silently disappear.

## License

MIT

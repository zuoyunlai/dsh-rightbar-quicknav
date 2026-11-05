# dsh-rightbar-quicknav

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c78ff)](https://github.com/deepseek-ai/deepseek-harness)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**DeepSeek Harness（DSH）右サイドバーのクイックナビゲーション — 縦並びのアイコンレールから、任意のタブへワンクリックで移動します。**

> [English](README.md) · [简体中文](README-zh.md) · 日本語 · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

## 何を解決するか

DSH は右サイドバーの各機能（ファイル、Git、タスク、ターミナル、ブラウザ、画像スタジオ、メモリ…）をタブストリップにまとめています。使うには右サイドバーを開き、タブを探す必要がありました。本プラグインは**「右サイドバーを開く」アイコンのすぐ下**に縦並びのアイコンレールを常設します。

- **折りたたみ時は 3 個だけ** — 普段はほとんど目に入りません。
- **ホバー**すると下方向に展開し、利用可能なタブがすべて現れます。
- **アイコンにホバー**すると、左側にタブ名の吹き出しが出ます。
- **アイコンをクリック**すると、右サイドバーがそのタブで開きます — 3 手順が 1 クリックに。

一覧は固定ではなく、ホスト自身のタブレジストリ（`sidebarRightTabs.guide()`）から読み取るため、**タブを登録するプラグインは自動的にレールに現れます**。

## インストール

### プラグインマネージャー経由（推奨）

`プラグイン → 追加` から本パッケージ（npm パッケージまたはローカルディレクトリ）を指定します。バンドルパッチがクライアント側を Web / Desktop プロファイルに組み込みます。

### 手動

```bash
cd ~/.dsh/profiles/<プロファイル名>
pnpm add dsh-rightbar-quicknav
```

その後、**DSH を完全に再起動**してください。クライアントモジュールは起動時に構成されるため、ページの再読み込みでは不十分です。

## 動作要件

- DSH `>= 0.2.1-rc.1`（`sidebarRightTabs` / `sidebarRight` クライアントサービスが必要）
- React はホストが提供 — **実行時依存なし**、**ビルド工程なし**

## 挙動の詳細

| | |
|---|---|
| 位置 | ビューポート右端から `10px`、ホストの「右サイドバーを開く」ボタンの `50px` 下 |
| 折りたたみ | アイコン 3 個 |
| 展開 | ホバー（ポインタが離れて 200ms 後に折りたたみ） |
| 吹き出し | 1 行・幅は内容に追従、左に収まらない場合は反対側へ反転 |
| ジャンプ | `sidebarRight.openTab(kind)` |
| 非表示 | 右サイドバーが既に開いている、またはセッションが表示されていない |

## 設計上の境界

- additive な `shell.overlay` スロットにのみマウントし、既存 UI を覆わず置き換えません。
- 見た目は**すべてインライン React スタイル**。ホストに `styles` サービスが無いため、クラス CSS は無言で無効になります。
- ジオメトリは**イベント駆動**（`MutationObserver` + `ResizeObserver`）。定常状態でのポーリングも強制レイアウトもゼロ。
- アンカーはホスト自身のボタンで、安定属性 `data-sidebar-right-expand` で特定し、`aria-label` にフォールバック。どちらも一致しない場合は既定位置に表示して警告を 1 行出すだけで、消えたり誤位置に付いたりしません。
- キーボード対応：`toolbar` ロール + roving tabindex + 矢印キー、`Esc` で吹き出しを閉じる、フォーカス枠はキーボード時のみ。
- `prefers-reduced-motion` を尊重。描画時の例外は ErrorBoundary が受け止め、スロット全体が白くなることはありません。
- UI 文言は中国語 / 英語の二言語。ホストが locale サービスを提供する場合は `rightbarQuicknav` 名前空間に登録します。

## 監査記録

本プラグインは全量監査とその後の修正を経ており、記録はすべてリポジトリにあります。

- [`AUDIT-2026-11-06.md`](AUDIT-2026-11-06.md) — 全量監査：評価、指摘一覧、改善計画
- [`AUDIT-a11y.md`](AUDIT-a11y.md) — インタラクションとアクセシビリティ
- [`AUDIT-perf.md`](AUDIT-perf.md) — パフォーマンスとリソース
- [`AUDIT-2026-11-06-REMEDIATION.md`](AUDIT-2026-11-06-REMEDIATION.md) — 項目ごとの検証と修正台帳

## 開発

```bash
node --check client.js     # 構文チェック
node --test tests/         # レンダリングのスモークテスト（依存なし）
```

スモークテストは実物の `client.js` を読み込み、最小の React スタブでプラグイン自身の `apply() → slots.inject → slots.register` 経路を通し、レンダリングと effect が例外を投げないことを検証します。effect 内の未定義識別子が 1 つあっただけで、レール全体が無言で消えた出来事があったためです。

## ライセンス

MIT

# 榜单投递台账 / Catalog submissions

记录 `dsh-rightbar-quicknav` 向各 DSH 插件清单的投递过程、格式与状态。
按时间顺序累积，**当次记录、不事后补写**。

插件侧仓库：https://github.com/zuoyunlai/dsh-rightbar-quicknav
当前版本：`0.3.6`（npm `latest`，GitHub Release `v0.3.6`）

---

## 一、投递总表

| 榜单 | 收录方式 | 本次改动 | 状态 |
|---|---|---|---|
| [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（22.6k★） | PR 加 `data/plugins/<owner>__<repo>.yml` | `data/plugins/zuoyunlai__dsh-rightbar-quicknav.yml`（+6） | ⏳ 待提交：该榜要求**被收录仓库创建满 1 天**，本仓库 `2026-11-05T17:45Z` 建仓，`2026-11-07 01:45 +08` 达标；分支已备好，定时任务 `automation_302fe030` 于 `02:10` 提交 |
| [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin)（498★） | 每天自动抓 `dsh-plugin` topic + 逐个复核 | — | ✅ **已自动批准**：`data/approved.json` 里 `"zuoyunlai/dsh-rightbar-quicknav": "2026-11-06"` |
| [beancookie/awesome-dsh-plugin](https://github.com/beancookie/awesome-dsh-plugin)（188★） | PR：`README.md` + `README.en.md`（按 owner/repo 字母序） | 各 +1 行 | ⏳ [#267](https://github.com/beancookie/awesome-dsh-plugin/pull/267) OPEN，等维护者（仓库活跃） |
| [Alex-Yanggg/awesome-DSH-plugin](https://github.com/Alex-Yanggg/awesome-DSH-plugin)（104★） | PR：`catalog/plugins.json` + `README.md` | `README.md` (+2)、`catalog/plugins.json` (+6) | ⏳ [#180](https://github.com/Alex-Yanggg/awesome-DSH-plugin/pull/180) OPEN —— ⚠️ 该仓库最后推送 `2026-08-15`，已停更约 3 个月，被 review 概率低 |
| [kejixiaoliang/awesome-dsh-plugins](https://github.com/kejixiaoliang/awesome-dsh-plugins)（75★） | PR：`plugins/ui-themes.md` + `data/descriptions-en.json` | `ui-themes.md` (+1)、`descriptions-en.json` (+2/-1) | ⏳ [#195](https://github.com/kejixiaoliang/awesome-dsh-plugins/pull/195) OPEN，等维护者（仓库活跃） |
| [billLiao/awesome-dsh-plugin](https://github.com/billLiao/awesome-dsh-plugin)（17★） | **每 8 小时**自动扫 `dsh-plugin` topic 生成分类文件 | PR 被关闭（避免与自动生成冲突） | ✅ **已收录**：维护者确认条目已在 `categories/ui-enhancements.md`，实测文件里能搜到本插件 |
| [dataelement/awesome-dsh-workbench](https://github.com/dataelement/awesome-dsh-workbench)（9★） | PR：`data/workbenches/<owner>__<repo>.yml`，需实拍截图 | `data/workbenches/zuoyunlai__dsh-rightbar-quicknav.yml`（+9） | ⏳ [#73](https://github.com/dataelement/awesome-dsh-workbench/pull/73) OPEN |
| [dshworks/awesome-dsh-plugins](https://github.com/dshworks/awesome-dsh-plugins)（31★） | **无需 PR**：定时 workflow 扫 topic 进 `data/candidates.json`，维护者用 `npm run triage` 收录 | — | ⏭ 不投：其 CONTRIBUTING 明确「Nothing is promoted automatically」，手改 `plugins.json` 会被重生成覆盖；已满足其硬规则（`dsh.bundle` + `engines.dsh` 为字符串 + 真实代码 + topic），等其扫描即可 |

---

## 一之二、结论：topic 比 PR 更有效

三个「已收录/已批准」的榜单（bruc3van、billLiao、以及 dshworks 的待扫）**都是靠仓库上的 `dsh-plugin` topic 被自动发现**，没有走 PR。
反过来说：**新插件建仓后的第一件事应该是打这个 topic**，它比逐个投 PR 覆盖面更广。

PR 仍然必要的是那些**人工维护**的分类榜单：主榜、beancookie、kejixiaoliang、Alex-Yanggg、dataelement。

---

## 二、过程中真实踩到的坑

### 坑 1：JSON 注册表「重新序列化」= 几百行无意义 diff

首版投递脚本对 `catalog/plugins.json` 和 `data/descriptions-en.json` 用了 `JSON.parse → 改 → JSON.stringify(…, 2)`。
两家原文件是**混合排版**（多行条目 + 单行紧凑的 `"description": {"en": …, "zh-CN": …}`）和一空格缩进的扁平映射，重新序列化把整文件格式化了一遍：

- Alex：778 行 → 847 行（69 行纯格式噪音）
- keji：585 行 → 1167 行（**582 行纯格式噪音**，实际只需要 +1）

**改法**：改成**文本级插入** —— 定位数组/对象收尾行，给上一元素补逗号，再把按原风格手写的条目行插进去。改后两家分别只有 `+6` 与 `+2/-1`。

**判据**：改生成物/数据文件前先看原文件排版，**能文本插入就不要重新序列化**；PR 前用 compare API 核对 `additions/deletions`，只接受预期数字。

### 坑 2：GitHub 仓库名不区分大小写 → 分支写进了错误的 fork

Alex-Yanggg 的仓库叫 `awesome-DSH-plugin`，我按「fork 名 = 上游 repo 名」的规则算出了 `zuoyunlai/awesome-DSH-plugin`。
但这个仓库**已经存在**——就是主榜 `awesome-dsh-plugin` 的那个 fork（大小写不敏感，是同一个仓库）。
结果：分支被建进了**主榜 fork**，提交的父节点是 Alex 仓库的 main，compare 直接 404；更糟的是它**覆盖了主榜待用的同名分支** `add-dsh-rightbar-quicknav`。

**处置**：
1. Alex 改用独立命名 fork `awesome-DSH-plugin-alex` 重投，成功开 PR #180；
2. 主榜 fork 的同名分支按「上游 main + 只加那一个 YAML」重建（`_fix.mjs`），重建后用 compare 核对**只有 1 个文件**；
3. 另外两家同名仓库（beancookie、billLiao）从一开始就用了 `awesome-dsh-plugin-beancookie` / `awesome-dsh-plugin-billLiao`，未受影响。

**判据**：fork 前先 `GET /repos/<me>/<name>` 并核对返回的 `parent.full_name`；**判同靠 parent，不靠名字**。同名上游一律给 fork 起不同名字。

### 坑 3：20 MB 级文件在本机链路上根本传不动（dshworks）

本机对 GitHub 的单次 HTTP 传输在 **~8 MB** 处被切断（`curl: schannel: server closed abruptly`、node `fetch` 报
`ResponseContentLengthMismatchError`），而 `api.github.com` 的内容接口**不支持 Range**（`curl: (33) ... does not support byte ranges`），
`--compressed` 也救不了（断在解压后的同一位置）。

结论：`dshworks` 的 `data/plugins.json`（19.7 MB / 3 万条）**既下不下来也传不上去**（上传还要 base64 成 ~26 MB）。
但事后读它的 CONTRIBUTING 发现本来就**不该手改**：该文件由定时 workflow 扫描 topic 自动排队、维护者 `npm run triage` 收录，
"Nothing is promoted automatically"。所以这条**不是失败，是走错了路**——正确做法是保证 topic 与 `engines.dsh` 合规，等它自己扫。

**判据**：动手改「机器生成的大文件」之前，先读该仓库的 CONTRIBUTING 确认**谁写它**；若由 CI/流水线生成，PR 大概率被覆盖。

### 坑 4：自动收录不等于 PR 被合并（billLiao）

`billLiao/awesome-dsh-plugin` 每 8 小时扫 `dsh-plugin` topic 重新生成 `categories/*.md`。我们投的 PR 被维护者**关闭**，
理由：条目已经被自动同步收录，手写 PR 会与生成物冲突。**目标达成，但合并记录为 0** —— 判收录要看**文件里有条目**，不是看 PR 状态。

---

## 三、复现命令

投递脚本（本仓库外的一次性工具，不入库）：`_submit.mjs` / `_fix.mjs`。

```bash
node _submit.mjs --dry            # 全部 dry-run，打印每家将改动的行
node _submit.mjs --apply all      # 真正提交（跳过已标注 skipApply 的）
```

全部走 `api.github.com`（本机 `git push` 到 github.com:443 常连接重置）：
`git/blobs → git/trees(base_tree=上游 tree) → git/commits(parent=上游 main) → git/refs → POST /pulls`。

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
| [Alex-Yanggg/awesome-DSH-plugin](https://github.com/Alex-Yanggg/awesome-DSH-plugin)（104★） | PR：`catalog/plugins.json` + `README.md` | `README.md` (+2)、`catalog/plugins.json` (+6) | ✅ [#180](https://github.com/Alex-Yanggg/awesome-DSH-plugin/pull/180) |
| [beancookie/awesome-dsh-plugin](https://github.com/beancookie/awesome-dsh-plugin)（188★） | PR：`README.md` + `README.en.md`（按 owner/repo 字母序） | 各 +1 行 | ✅ [#267](https://github.com/beancookie/awesome-dsh-plugin/pull/267) |
| [kejixiaoliang/awesome-dsh-plugins](https://github.com/kejixiaoliang/awesome-dsh-plugins)（75★） | PR：`plugins/ui-themes.md` + `data/descriptions-en.json` | `ui-themes.md` (+1)、`descriptions-en.json` (+2/-1) | ✅ [#195](https://github.com/kejixiaoliang/awesome-dsh-plugins/pull/195) |
| [billLiao/awesome-dsh-plugin](https://github.com/billLiao/awesome-dsh-plugin)（17★） | PR：`categories/ui-enhancements.md` | +1 行 | ✅ [#31](https://github.com/billLiao/awesome-dsh-plugin/pull/31) |
| [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin)（498★） | 自荐 `SHOWCASE.md`（中英各一行） | — | ⛔ 不发：该榜硬性要求自荐仓库 **star > 10**，当前 0；但它每天自动抓 `dsh-plugin` topic，本仓库已带 topic，会被自动收录 |
| [dshworks/awesome-dsh-plugins](https://github.com/dshworks/awesome-dsh-plugins)（31★） | PR：`data/plugins.json` | — | ⏭ 不发：注册表是 **19.7 MB / 3 万条**机器生成文件，且有 `candidates/seeds/rejected` 扫描管线，手改条目很可能被下次重生成覆盖；同样靠 topic 自动扫描 |
| [dataelement/awesome-dsh-workbench](https://github.com/dataelement/awesome-dsh-workbench)（9★） | PR：`data/workbenches/<owner>__<repo>.yml` | — | ⏸ 暂缓：要求提供**最终可安装版本的本机实拍截图** HTTPS 地址，目前没有托管在仓库里的截图资产 |

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

---

## 三、复现命令

投递脚本（本仓库外的一次性工具，不入库）：`_submit.mjs` / `_fix.mjs`。

```bash
node _submit.mjs --dry            # 全部 dry-run，打印每家将改动的行
node _submit.mjs --apply all      # 真正提交（跳过已标注 skipApply 的）
```

全部走 `api.github.com`（本机 `git push` 到 github.com:443 常连接重置）：
`git/blobs → git/trees(base_tree=上游 tree) → git/commits(parent=上游 main) → git/refs → POST /pulls`。

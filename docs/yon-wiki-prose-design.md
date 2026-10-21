# 主题页与来源页：让消化成果在面板里可见、可检索

> 这份文档记录的是**为什么这样设计**与**改哪里**，不是接口手册。接口以各模块 JSDoc 为准。
> 起因：2026-10-21 消化 NCC 2312 财务会计产品说明，写进 `wiki/topics/` 14 页、`wiki/sources/` 1 页，
> 面板仍显示「0 实体页」，使用者据此判断「没消化」。

## 一、问题（实测）

| | 实体页 `wiki/entities` | 主题页 `wiki/topics` | 来源页 `wiki/sources` |
|---|---|---|---|
| NCC 库 | 0 | **28**（2312 新写 14 + 2505 原有 14） | **2** |
| BIP 库 | 5374 | 139 | 7636 |

- 面板卡片的主数字是 `index.entities.length`，NCC 库因此长期显示 0。
- 详情页有一行「另有 N 个页面不在索引范围」，但它在卡片之后才出现，主数字先入为主。
- **`wiki_lookup` 与 `wiki_read` 都只读实体页索引**，所以那 28 页在工具层完全不可见——模型查「总账 2312 有什么」会得到「没有」，而人打开文件能看到。这是"查不到"与"没有"长得一样的老问题，只是这次发生在主题页上。

产品说明 PDF 没有实体 URI、物理表与字段，按规范只能写成主题页/来源页。**0 实体是准确的，但它不是库的规模，也不是这次消化的证据。**

## 二、不做什么（先划边界）

1. **不把主题页塞进 `entities` 数组。** 图谱（引用边）、能力分级（可写查询/可定位/仅概念）、缺口统计都建立在"实体页有 URI 与表名"之上；混入主题页会让 `wiki_gaps` 把章节标题当成未被覆盖的实体。
2. **不给主题页编 URI 或表名。** 那是凭空造知识，比看不见更糟。
3. **不改 `wiki_write` 的契约**（实体页必须 URI），也不改 digest 流程（主题页仍用 `wiki_page_write`）。
4. **不把 PDF / 大附件读进索引**，只读页面文本的轻量头部。

## 三、结论：一个索引，两类页面，两套语义

索引文件不变（`wiki/.yon-index.json`，跟着 vault 走），版本升到 **3**，新增一个 `prose` 数组：

```
WikiIndex {
  version: 3
  vault, builtAt
  entities: WikiPage[]      // 原样，语义不变
  prose:    WikiProsePage[] // 新增：topics + sources
}
```

- 实体页继续走原路径：`lookup` 精确匹配 URI/表名/中文名，`read` 带 assessment 与关系图，参与 graph/levels/gaps。
- 主题页/来源页走新路径：只按**页面名、标题、标签、二级标题、摘要**匹配；`read` 返回 `kind` 与正文，**不计算** assessment 与实体关系。

## 四、数据模型

```ts
type WikiPageKind = 'entity' | 'topic' | 'source'

interface WikiProsePage {
  kind: 'topic' | 'source'
  page: string          // 页面名（文件名去 .md），[[链接]] 用它
  file: string          // 库内相对路径，POSIX 分隔
  name: string          // 一级标题，缺省回退 page
  summary?: string      // 首个 blockquote 或首段正文，截 160 字
  tags?: string[]       // frontmatter tags
  version?: string      // platform_version
  status?: string       // verified/unverified/...
  updated?: string      // frontmatter updated
  sources?: string[]    // frontmatter sources，指回 raw/articles
  headings?: string[]   // 二级标题，最多 12 个，用于「按章节找页」
  bytes?: number        // 文件大小，面板列表用
  mtimeMs?: number      // 增量构建用
}
```

**不存正文**：一页 30–60 KB，存进索引会把 4.99 MB 的 BIP 索引推到百 MB 级。正文永远现读文件。

## 五、扫描与解析

- 目录：`wiki/topics`、`wiki/sources`，以及中文初始化留下的 `wiki/模块`、`wiki/来源`（与 `WIKI_ENTITY_DIRS` 同样的别名思路，集中定义成 `WIKI_PROSE_DIRS`）。**只扫直接子文件**，与 `unindexedDirsOf` 的口径一致；嵌套目录报在 `unindexed` 里而不是悄悄漏掉。
- frontmatter 只认八个键：`tags / created / updated / sources / platform_version / project / last_verified / status`。缺字段的页仍然收，`version` 空着——面板上标「无版本」，不拒绝收录。
- 摘要：跳过 frontmatter 与一级标题，取第一个非空段落；它是 `> ...` 就取引用块首行。没有摘要的页只按标题与标签可搜。
- headings：只取 `##`，去掉序号前缀后保留原文，最多 12 个。
- 增量：索引已存在且 `mtimeMs` 与 `bytes` 都没变时复用旧记录；重建（`rebuild`）全量。
- 上限：单库 `prose` 超过 50000 页时停止收录并在答案里说明（防止有人把整个 vault 拷进 topics）。

## 六、检索

### 6.1 `wiki_lookup` 扩展，不新增工具

新工具意味着模型要先知道该用哪个；而「总账 2312」这个问题本来就没有"实体还是主题"的前见。所以扩 `wiki_lookup`：

- 新参数 `kind?: 'entity' | 'topic' | 'source' | 'all'`，默认 `all`。
- 匹配顺序：实体页先（URI 精确 → 表名 → 中文名 → 包含），主题页/来源页后（页面名精确 → 标题 → 标签 → 章节标题 → 摘要包含）。
- 返回的 `WikiHit` 增加 `kind` 与 `path`；主题页不参与 `query-ready/locatable/concept` 分级，标 `readByPath`。
- 输出分两段，标题写死口径：

```
实体页（可据此写 SQL）
  ...
主题页 / 来源页（功能与流程参考，无表名，按路径读）
  wiki/topics/总账-核算与凭证（NCC 2312）.md —— 财务会计 · NCC 2312 · 5 天前
```

- **`sources` 默认降权**：BIP 库 7636 个来源页里大量是 API 响应快照，若与 topics 同权会把主题页挤掉。规则：`kind=all` 时 sources 只在没有 topics 命中且匹配强度为"精确/标题"时返回；`kind=source` 才全量。

### 6.2 `wiki_read` 支持按页名或路径读 prose

- 先按实体页找（原逻辑），未命中再在 `prose` 里按 `page` 找；也接受 `wiki/topics/xxx.md` 形式的相对路径直接读（只允许库内、只允许 `.md`）。
- 返回增加 `kind`；prose 不返回 `assessment` / `relations`，改返回 `headings` 与 `sources`（指回 `raw/articles` 的可复核依据）。
- 未命中时的提示改口径：先说"实体页与主题页都没有"，再列真正未索引的目录。

### 6.3 面板搜索直接查宿主

`GET /yon/api/wiki/prose?vault=<id>&q=<term>&kind=topic|source`，返回轻量列表（page/name/summary/tags/version/updated/file）。搜索在宿主做（索引在内存里），不把 7636 条记录推给前端。

## 七、面板

1. **卡片主数字改成三个**：`5374 实体页 · 139 主题页 · 7636 来源页`。0 实体时就显示 `0 实体页 · 28 主题页 · 2 来源页`，不会再像空库。
2. **详情新增「主题页」页签**（与「概览 / 缺口 / 使用」并列）：
   - 顶部搜索框（走 6.3 接口，防抖 200ms）。
   - 列表列：页名、版本、标签、更新时间、摘要首行。
   - 点击一行打开右侧详情抽屉：frontmatter 键值 + 正文前 200 行（懒加载，走 `wiki_read`）+「打开文件」按钮（用系统默认程序打开 `entry.path`）。
3. **概览的「未索引」区块语义收窄**：topics/sources 被索引后不再列进去，只列其余目录（attachments、canvas 等）。文案从「索引只读实体页目录」改为「索引读实体页与主题/来源页；下列目录未收录」。
4. 列表排序：`updated` 倒序，无 `updated` 的按 `mtimeMs`。

「打开文件」需要一个新的 shell 打开动作（Windows 上 `start` / Electron `shell.openPath`）。若无现成通道，P2 先只给「复制路径」，P3 再接打开。

## 八、改动清单（文件级）

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | 新增 `WikiProsePage`、`WikiPageKind`、`WikiProseListPayload`；`WikiVaultView` 加 `topicPages`/`sourcePages`；`WikiHit` 加 `kind`/`path`；`WikiHealthReport` 的 `unindexed` 语义注释更新 |
| `src/host/wiki-index.ts` | `WIKI_PROSE_DIRS`；`parseProsePage()`；`buildIndex()` 扫描并解析 prose；索引 version 3 + v2 迁移；`unindexedDirsOf()` 排除 prose 目录；导出 `proseOf(index)` |
| `src/host/wiki-service.ts` | `lookup` 合并两类命中并分组、`read` 支持 prose 与路径、`list` 填三个计数、新增 `proseList()` |
| `src/host/wiki-tools.ts` | `wiki_lookup` 工具描述（说明主题页没有表名）与渲染分两段；`wiki_read` 渲染 kind |
| `src/host/routes.ts`（wiki 路由所在文件） | 新增 `GET /yon/api/wiki/prose` |
| `src/client/wiki/WikiManager.tsx` | 卡片三计数；「主题页」页签与搜索；详情抽屉 |
| `src/client/locales.ts` | 新文案（中英各一套），`wiki.pages` 文案改为「实体页数」保留，新增 `wiki.topicPages` / `wiki.sourcePages` |
| `tests/wiki*.spec.ts` | 新增：prose 索引解析、lookup 分组、read by path、unindexed 不再含 topics |

## 九、体积与性能（P2 实施后实测）

| | 实体页 | prose 页 | 索引体积 | 全量重建 |
|---|---|---|---|---|
| BIP | 5374 | 7750（114 主题 + 7636 来源） | **9.2 MB**（原 4.99 MB） | **13.2 s 冷 / 3.8 s 热** |
| NCC | 0 | 30（28 主题 + 2 来源） | 21 KB | 24 ms |

- 增量估算（3–5 MB）偏低：实测每页约 550 B，来源页的摘要与标签比预想占地方。9.2 MB 仍可接受。
- 重建 13 s 来自读 7775 个文件，不是解析本身；**只在 `rebuild` 或索引缺失时发生**，平时读盘约 46 ms。
- 索引升级是"v2 视为无索引"：首次访问会用 13 s 重建一次，之后不再。本次已在开发机上为两库生成 v3 索引写盘，重启后直接读。
- 若日后嫌大，第一刀砍 `headings`（每页最多 12 个，约占 1.5 MB）。

## 十、验收标准

1. NCC 库面板卡片显示 `0 实体页 · 28 主题页 · 2 来源页`，且详情「未索引」不再列 topics/sources。
2. `wiki_lookup("总账")` 在 `kind=all` 下同时返回实体页（若有）与主题页，主题页段落带 `wiki/topics/...md` 路径；`kind=topic` 只返回主题页。
3. `wiki_read("总账-核算与凭证（NCC 2312）")` 返回 `kind=topic` 与正文；`wiki_read("wiki/sources/[NCC 2312] 财务会计产品说明.md")` 同样可读。
4. `wiki_read` 一个不存在的页名，报错里先说是"实体与主题页都没有"，并列出真正未索引的目录（NCC 库此时应为空）。
5. BIP 库重建后：实体页仍是 5374、`wiki_lookup` 原有查询结果不变（回归测试）；索引文件 < 12 MB；重建 < 20 s（实测 13.2 s，原定 10 s 偏紧）。
6. 现有 `tests/wiki*.spec.ts` 全绿，新增用例覆盖 1–4。

## 十一、分期

| 期 | 内容 | 量 |
|---|---|---|
| **P1（先止血，半天）** | 卡片显示 `topics/sources` 数量（直接用 `unindexedDirsOf` 已有的统计，不建索引）；`wiki_read` 支持按「库内相对路径」读任意 `.md` | 改 3 个文件 |
| **P2（正式方案，2–3 天）** | 三~七章全部：索引 v3、lookup 分组、read 按页名、面板主题页页签与搜索、验收 1–6 | 8 个文件 + 测试 |
| **P3（可选）** | 主题页正文全文搜索（当前只搜摘要与标题）；`[[链接]]` 解析，让主题页与实体页互相出现（「这一页提到哪些实体」） | 独立特性 |

P1 解决"看起来是空库"，P2 解决"查不到"。若只想先要最省事的，做 P1 即可。

## 十二、风险与对策

| 风险 | 对策 |
|---|---|
| 模型把主题页当实体，拿它去写 SQL | 返回带 `kind`，主题页段落标题写明"无表名"；`wiki_read` 返回 `kind`；工具描述加一句 |
| BIP 的 7636 个 sources 页（多为 API 快照）稀释检索 | 6.1 的降权规则；单独 `kind=source` 才全量 |
| 索引膨胀 | 不存正文；headings 限 12 个；超 5 万页截断并说明 |
| 两套目录别名漂移 | `WIKI_PROSE_DIRS` 放 `shared/types.ts`，与 `WIKI_ENTITY_DIRS` 同处，面板文案引用同一常量 |
| 增量构建漏「内容改了但 mtime 没变」 | 与现有实体索引同一策略（缺了才建、要新显式重建），文档里写明这个已知边界 |

## 十三、P1 实施记录（2026-10-21）

做了什么（四处源码 + 一处测试）：

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | `WikiVaultView` 增加可选 `topicPages` / `sourcePages` |
| `src/host/wiki-service.ts` | `viewOf()` 用 `unindexedDirsOf()` 直接数两类页面；`read()` 认库内相对路径，新增 `readPageByPath()`（必须在 vault 内、`.md`、≤ 4 MB）；返回 `kind` / `path`；`WikiPageContent` 的 `assessment` / `relations` 改为可选；读空时教路径 |
| `src/host/wiki-tools.ts` | `wiki_read` 描述与参数说明带上路径用法；`ReadValue` / schema 增加 `kind`、`path`；渲染在正文前标注「主题页/来源页，不能据此写 SQL」；`summarizeUnindexed` 补一句怎么读 |
| `src/client/wiki/WikiManager.tsx` | 卡片改三个数：`实体页 · 主题页 · 来源页` |
| `src/client/locales.ts` | 新增 `wiki.topicPagesUnit` / `wiki.sourcePagesUnit`（中英） |
| `tests/wiki-unindexed.spec.ts` | 更新读空文案断言；新增 3 例：按路径读主题页（含 frontmatter 取值、无 assessment/relations）、越界路径拒绝、卡片三数 |

验证：

- `npx vitest run`：**1287 passed / 5 skipped**（90 个文件通过、1 个跳过）。
- 实测两库的直接子文件数（与 `unindexedDirsOf` 同口径）：

| 库 | 实体页 | 主题页 | 来源页 |
|---|---|---|---|
| NCC | 0 | 28 | 2 |
| BIP | 5374 | 114 | 7637 |

- 面板卡片将显示 `0 实体页 · 28 主题页 · 2 来源页` / `5374 实体页 · 114 主题页 · 7637 来源页`。

生效方式：`npx tsc -p tsconfig.lib.json && npx tsdown` 已执行（`lib/host/wiki-service.js`、`lib/client.js` 已更新）；**宿主代码与前端包都要重启 DSH 才会加载**。

留给 P2：`wiki_lookup` 仍只搜实体页；面板还没有主题页列表/搜索；`wiki_read` 按路径读是唯一入口。

## 十四、P2 实施记录（2026-10-21）

按第三章到第七章落地，索引升到版本 3。

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | 新增 `WIKI_PROSE_DIRS`、`WikiProseKind`、`WikiProseView`、`WikiProseListPayload`；`WikiHealthReport` 增加 `topicPages` / `sourcePages`；`WikiSearchHit` 加 `kind` / `path` |
| `src/host/wiki-index.ts` | `WikiIndex` 升 v3，新增 `prose`；`proseDirsOf()`（在实体目录旁找 topics/sources/模块/来源）；`parseProsePage()`（frontmatter 的 tags/sources/platform_version/status/updated、一级标题、首段摘要、`##` 标题最多 12 个）；`buildWikiIndex()` 一并扫 prose；v2 索引视为无索引、自动重建；`unindexedDirsOf()` 不再列 prose 目录 |
| `src/host/wiki-service.ts` | `lookup()` 加 `kind` 参数与 prose 匹配（page/name/tag/heading/contains/summary），实体页排前，`kind=all` 时来源页只认强匹配；`WikiHit` 带 `kind` / `path`；新增 `toProseHit()` / `proseMatchOf()`；`read()` 按页名回退到 prose；新增 `proseList()`；`viewOf()` / `health()` 的三个计数改从索引读 |
| `src/host/wiki-tools.ts` | `wiki_lookup` 描述、`kind` 参数、两段式渲染（实体页 / 主题页·来源页）；零命中时教路径；`describeUnindexed` 文案改口径 |
| `src/host/http.ts` | 新增 `GET /yon/api/wiki/prose`；`/search` 返回 `kind` / `path` |
| `src/client/wiki/api.ts` | `proseList()` |
| `src/client/wiki/WikiManager.tsx` | 第四个页签「主题页」：独立的过滤框、列表（类型标签/版本/路径/摘要）、空态 |
| `src/client/wiki/panel.module.css` | `.topicRow` / `.topicSummary` |
| `src/client/locales.ts` | 页签与空态文案（中英），`unindexedNote` 改口径 |
| `tests/wiki-unindexed.spec.ts` | 重写：索引三类页面、解析字段、unindexed 不再含 prose、kind 过滤、按页名读、proseList、两段式渲染 |
| `tests/wiki-graph.spec.ts` | 索引 fixture 升 v3 |
| `tests/http-wiki-vaults.spec.ts` | `/prose` 路由两例 |
| `tests/wiki-manager.client.spec.tsx`、`preview/fixtures/wiki.ts` | 补 `proseList` |

实测（`buildWikiIndex` 直接调用）：

| 库 | 实体页 | prose | 索引 | 全量重建 |
|---|---|---|---|---|
| BIP | 5374 | 7750（114 主题 + 7636 来源） | 9.2 MB | 13.2 s |
| NCC | 0 | 30（28 主题 + 2 来源） | 21 KB | 24 ms |

- 全量测试：**1291 passed / 5 skipped**。
- 已为两库写盘 v3 索引（`wiki/.yon-index.json`），重启后首次访问读盘约 46 ms，不会卡在 13 s 的重建上。

行为上值得记住的两点：

1. **实体优先**。同名时实体页排在主题页前，`wiki_read` 也先查实体页——一个能答「哪张表」的页面比一段散文更可能是提问者要的。
2. **来源页降权**。BIP 库的 7636 个来源页多是 API 响应快照，`kind=all` 时只认页名/标题/标签的强匹配；要看全部得显式 `kind=source`。主题页不降权，因为一份消化过的手册的章节名就是主题。

留给 P3：主题页正文全文搜索（现在只搜摘要与标题）；`[[链接]]` 解析，让主题页与实体页互相出现。

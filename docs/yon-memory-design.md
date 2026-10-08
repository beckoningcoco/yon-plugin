# Yon 面板 · 项目级记忆入口 — 设计方案

> 目标：给 Yon 面板增加一个**项目级**的长期记忆入口。LLM 可以自己往里写"经验、坑、决定、环境事实"，以后做同一个项目时能**召回**。使用者在面板上能看到、能删。
>
> 状态：**P0 与 P1 的面板已实现**（2026-10-08）。四个工具、提示词第十四组、`project_read` 的被动注入，以及侧栏第十格「记忆」（浏览、按类型与项目筛选、搜正文、读全文、删除）都已落地并通过验证。剩下的：`memory_annotate`（存疑，见 §13.3 第 4 条）、`datasource_query` / meta 查询的计数提示、`memory_sweep`、`memory_promote`（§10）。
>
> **修订**：v3 —— 按实现结果校正（§13 逐条列出与设计稿不一致的地方），补 P0 的实施记录与验证证据。
> v2 —— 按与使用者的六条讨论改定（当前项目由模型推断 / 正文用软上限 / **不引入任何状态字段** / 只做项目级 / 删掉会话开场注入 / 补 Hindsight 实测），并**修正 v1 §2 的两条错误前提**。

---

## 1. 问题

现在有四套可以写的库，但**没有一套的语义是"某个项目的经验/坑"**：

| 现有入口 | 语义 | 能否当"项目的坑"用 |
|---|---|---|
| `wiki_write` | 实体知识页（create 强制 `uri`/`name`/`platformVersion`） | 不能。它记的是**跨项目仍成立**的平台知识，且必须先有对应实体页 |
| `requirement_*` | 一条"要做的事"，annotate 只能挂在某条需求下 | 不能。它记的是**这条需求**的事；跨需求的项目经验无处可挂 |
| `project_update` | 覆盖式键值字段 | 不行。写第二条就盖掉第一条，无历史 |
| `iteration_add` | 插件自身缺陷台账 | 不行。只管"这套工具哪里不好用" |

结果：项目里踩的坑、做的技术决定、摸出来的环境事实，**要么丢掉，要么塞进语义错位的柜子**。

**它要补的缺口是"项目级、跨需求、自动召回"**：需求台账已经能装下"这条需求的一切"，缺的是"三条需求都踩了同一个坑，而第四条需求开工时没人记得"。

## 2. 核查到的现状（设计前提）

以下都是实测，不是推测。**其中 ①② 是 v1 判断错了、本版改正的两条**——它们改变了落地方式，所以写在最前面。

### ① 工具实现就在手边，源码仓库是 link 安装的（v1 判断错，本版改正）

v1 的结论是"`dsh-plugin-yon-panel` 只是外壳，不含任何 wiki/requirement/iteration 工具"。**这只读了 README 的开头。** 实测：

```
C:\Users\99558\.dsh\profiles\yon\package.json
  "dependencies": { "dsh-plugin-yon-panel": "link:E://gitproject//dsh-plugin-yon-panel" }
```

profile 直接链到源码仓库 `E:\gitproject\dsh-plugin-yon-panel`，该仓库里有 `src/`（工具、服务、存储、客户端全在里面）、`tests/`、`docs/` 与 `lib/`（构建产物，**提交进 git**，见 README「为什么 `lib/` 被提交进 git」）。README 本身就是逐模块列到源文件的（例如第 357 行的迭代一行）。`wiki_*` / `requirement_*` / `iteration_*` 全在 `src/host/` 下。

### ② 实现落点是明确的，不需要"先定位"（v1 判断错，本版改正）

v1 说"工具集源码不在手边，实现应在 `app.asar` 内（我的文件工具穿不透）"。**`app.asar` 确实穿不透，但源码不在那里。** 本功能各层的落点，以及它要对齐的既有先例：

| 层 | 落点 | 同构先例 |
|---|---|---|
| 工具 | `src/host/memory-tools.ts` | `iteration-tools.ts`、`requirement-tools.ts` |
| 服务 | `src/host/memory-service.ts` | `iteration-service.ts` |
| 存储 | `src/host/memory-store.ts` | `iteration-store.ts` |
| 面板 | `src/client/memory/` | `src/client/iteration/`、`src/client/requirement/` |
| 系统提示 | `src/host/prompt.ts` 加第十四组 | `docs/yon-requirement-design.md` 十七、提示词第十二组 |
| 测试 | `tests/memory-tools.spec.ts` | `tests/iteration-tools.spec.ts` |
| 设计文档 | `docs/yon-memory-design.md` | `docs/` 下已有 9 份同系列 |

### ③ 插件数据目录的现有形态

`C:\Users\99558\.dsh\yon-panel\`，实测 **13 个文件**（v1 的清单漏了 `class_index_EMPTY.json`，并把 `browser_runs.json` 重复列了一次）：

```
db_config.json  wiki_config.json  home_config.json  browser_config.json  browser_runs.json
knowledge\class_index_TEST.json  knowledge\class_index_EMPTY.json
knowledge\meta_index_2111.json   knowledge\meta_index_2312.json
wiki-usage.jsonl  digest-log.jsonl
requirements\index.json           ← 需求条目索引（另有每条的 user/ generated/ patches/）
iteration.json                    ← 迭代表板
```

**没有任何 memory / notes / experience 类存储。** 形态上 `requirements/`（index.json + 每条目一个目录）是最值得对齐的先例；记忆比需求条目更薄，可以只用"index.json + 每条一个 .md"，不建子目录。

### ④ 知识库是 Obsidian vault，而且 `project` 字段早就留好了

```json
// wiki_config.json
{ "vaults": [
  { "id": "bip", "label": "BIP 知识库", "path": "D:/yon-bip-obsidian/yon-bip-obsidian" },
  { "id": "ncc", "label": "NCC 知识库", "path": "D:/yon-bip-obsidian/yon-ncc-obsidian" }
]}
```

vault 根的 `.wiki-schema.md` 已规定三类页面 `entities/` `topics/` `sources/`，且 frontmatter 里有 `project` 字段——文档原文：「**具体在哪个项目上验证的**，示例值：`天九`、`机械院`」。**"项目"这个维度在设计知识库时就已经存在了。**

### ⑤ 写与拦的裁决规则（本版新增，它决定每个工具拦不拦）

v1 的 §2⑤ 是"读通写不通，所以记忆必须由插件工具写"。**结论对，但推理不成立**：写不通只约束模型在会话里的文件访问，而工具就是插件进程在写，与模型的文件权限无关。真正需要写下来的是**闸门怎么判**，因为它决定记忆的七个工具各自拦不拦。

全部在 `src/host/tools.ts`：

| 函数 | 行 | 作用 |
|---|---|---|
| `isDestructiveWrite(name, args)` | 379–409 | 纯函数，判这一调用**会不会丢东西** |
| `permissionsOf(session)` | 424–443 | 从会话事件日志读 `sandbox/mode` 与 `approval/policy` |
| `dispositionOf(destructive, perms)` | 448+ | 裁决出 `run` / `ask` / `refuse` |
| `tools/pre-execute` 接线 | 800–814 | 按裁决放行、拒绝或走审批 |

三条与本功能直接相关的实测结论：

1. **裁决标准不是"读/写"，也不是"新建/覆盖"，而是"会不会丢东西"**。`project_create` 不拦（注释原话：「Creating a project destroys nothing」）；`requirement_create` 只在明知重名时才拦；`requirement_annotate` / `artifact_write` 恒不拦；`requirement_update` / `requirement_archive` / `project_delete`、以及带 `archived` 或 `remove_fields` 的 `project_update` 才拦。
2. **`approval: never` 时，破坏性写不是被拒，而是直接跑**（第 448–457 行注释：`never` 意味着「没人可批准」，是使用者自己的选择，不是要 fail closed 的事故）；只有 `sandbox: read-only` 才 refuse。
3. **新工具默认不拦**——第 401 行 `if (name !== 'project_update') return false`。所以 `memory_update` 想拦就得**显式加进这个函数**，否则它会被当成无害的。

### ⑥ 会话对象拿得到，但可能缺席

`YonToolExecution` 带 `agent?: YonAgentLike`，`agent` 带 `session`（`seq` + `eventAt`，`tools.ts` 53–61 行）。§6 的"记住本次会话最近的项目"要靠它；注释同时写明 `agent` **在直接派发时缺席**，那时只能降级为不注入。

## 3. 设计原则

1. **召回比写入重要。** 写入只是一个 append；召回才是难点——模型不会主动去搜一个它不知道自己不知道的东西。
2. **不造第二套知识库。** 记忆库必须和 Obsidian 知识库划清边界（见 §7）。
3. **可改，不留状态。** 记忆记的是**"事实是什么"**，需求台账记的是**"他说过什么"**——后者不能改，前者必须能改。所以不引入 `verified` / `outdated` / `superseded` 这类标签：一条不对的记忆，正确做法是改正或删掉，而不是留着一个错结论再给它贴一张免责声明。
4. **每条要短，但不硬拒。** 标题 ≤ 40 字、正文软上限 200 字；超了照写，由 `memory_sweep` 报出来给人看。硬拒绝只会逼模型把一条经验拆成三条，反而制造重复。
5. **内容只有一个写作者。** 正文只由模型经工具写；面板给使用者的只有**查看与删除**。这样"谁写的"没有歧义，也就不需要 `by` 之类的标记。

## 4. 存储设计

### 4.1 位置与形态

对齐 `requirements/` 的既有形态：**索引 + 每条一个 Markdown 文件**。

```
~/.dsh/yon-panel/memory/
├── index.json                     # 索引：面板与召回都读它
├── mem-20261005-141230-a1b2.md    # 一条记忆，人可读
└── mem-20261005-150411-c3d4.md
```

为什么不是单个 `memory.jsonl`：每条一文件才能在编辑器里直接打开；索引则保证面板和召回读起来快（只读 `index.json` 就够了）。

**关于"可 git 版本化"要说实话**：`~/.dsh/yon-panel/` 现在不是 git 仓库，插件也不该替人去 `init`。目录形态**允许**你把它纳入版本控制（自己 `git init` 或用别的方式备份），但在你这么做之前，**被改掉、被删掉的记忆没有历史**——这是原则 3 用"可改"换掉的代价，必须写在明面上，不能假装还有 `outdated` 那层保护。

### 4.2 单条数据结构

Markdown 文件 frontmatter + 正文：

```markdown
---
id: mem-20261005-141230-a1b2
project: d16df4e7-6c76-4bde-8f9b-bd4e2517f6a2      # 项目 id（必填，见 §4.3）
type: pitfall                                       # 见下表
title: 达梦下 XXX 查询必须带时间范围
tags: [达梦, 性能]
source: 实测于 2026-10-05 会话，datasource_query 对 68.11.100.7
created: 2026-10-05
updated: 2026-10-05
---

正文 ≤ 200 字（软上限）：现象、结论、怎么绕。
```

**没有 `status`，也没有 `by`。** 理由见原则 3 与原则 5；v1 曾设计五个状态值与"最后改动者"，两者都在定稿时删除。

`source` 保留，但它的定位要说清：它**不是**可信度标签，而是**"这条要核实就去哪查"**的线索。必填——因为它是记忆里唯一能指向证据的东西。

`type` 取值（决定面板怎么分组、`memory_recall` 怎么排）：

| type | 用于 |
|---|---|
| `pitfall` | 踩过的坑、踩了会疼的写法 |
| `decision` | 为什么这么选（选型、绕开某方案的取舍） |
| `preference` | 这个客户/这个项目的偏好（字段叫法、编码习惯） |
| `env-fact` | 环境事实（版本、补丁、装了哪些模块、连接特征） |
| `lesson` | 可复用的做法（**若跨项目仍成立就该升级进知识库**，见 §7） |

### 4.3 写作者与权限

| 角色 | 能做什么 | 怎么实现 |
|---|---|---|
| 模型 | 新建、改写、追加 | `memory_write` / `memory_update` / `memory_annotate` |
| 使用者（面板） | 查看、删除 | `src/client/memory/`；**不能新增、不能改正文** |

模型**不提供删除工具**（与 `requirement_*` 一致：真删只有面板能做）。但模型可以**改写**——这正是与需求台账不同的地方，也是本设计里唯一"模型能推翻自己旧结论"的入口。

`project` 必填、且必须指向 `project_list` 里登记的项目。这带来一个已知的边界：**开发这套插件本身不属于任何客开项目**（登记的项目目前是水投、天九），所以"插件自身的经验"没有位置可挂——那是 `iteration_*` 与 Hindsight 的地盘（见 §7 末）。

## 5. 工具设计

七个工具，命名与既有的 `requirement_*` / `iteration_*` 风格一致：

| 工具 | 用途 | 拦？ | 依据 | 状态 |
|---|---|---|---|---|
| `memory_write` | 新建一条 | 不拦 | 新建不丢东西（同 `project_create`） | ✅ P0 |
| `memory_update` | **改写**一条的正文/标题/分类 | **拦** | 会盖掉原来那段话，属"会丢东西"，同 `requirement_update` | ✅ P0 |
| `memory_annotate` | 追加一段（带日期） | 不拦 | 纯追加，同 `requirement_annotate` | P1（存疑，见 §13.4） |
| `memory_recall` | 按关键词/项目/类型/tag 检索，**只返回标题与摘要** | 读 | —— | ✅ P0 |
| `memory_read` | 读一条全文 | 读 | —— | ✅ P0 |
| `memory_sweep` | 体检（§9） | 不拦 | 只读 | P2 |
| `memory_promote` | 升级进知识库 vault（§7） | 不拦 | 写的是 vault，不动记忆 | P2 |

**`memory_update` 必须显式加进 `isDestructiveWrite`**（`src/host/tools.ts` 第 379–409 行）：该函数对新工具默认返回 `false`，不改就是"改写不拦"。这与"新建不拦、追加不拦、改写拦"的口径一致；`approval: never` 的会话里它照旧直接跑，所以实际不会啰嗦。

### 签名

```
memory_write(
  project:  string          # 必填，项目 id/名字/code
  title:    string          # ≤ 40 字，召回时注入的就是它
  body:     string          # 软上限 200 字，超了照写并由 sweep 报出
  type:     pitfall|decision|preference|env-fact|lesson = lesson
  tags?:    string[]
  source:   string          # 必填：这条要核实去哪查（空则拒）
) -> { id }

memory_update(id, title?, body?, type?, tags?, source?) -> { changed: [...] }   # 拦

memory_annotate(id, text) -> { id }        # 追加，不改写已有内容
memory_read(id) -> { frontmatter, body }
memory_recall(query?, project?, type?, tag?, limit? = 10)
  -> [{ id, title, type, created, project, snippet }]

memory_sweep(project?) -> { orphans, no_source, too_long, similar, stale }
memory_promote(id, vault) -> { page }
```

`memory_recall` **只返回标题与摘要**，正文靠 `memory_read` 取——注入时不会挤爆上下文。

## 6. 召回机制

两层，按"是否依赖模型自觉"排序。

### 层 1：被动注入

在**已经存在的工具**的返回值尾部自动附上记忆摘要——模型一碰这个项目，记忆就进上下文。落点都是返回值的组装处，不需要新工具：

| 工具 | 注入内容 |
|---|---|
| `project_read` | 该项目最近 5 条：`- [pitfall] 达梦下 XXX 查询必须带时间范围 (mem-…)` |
| `datasource_query` | 一行：`本项目有 3 条 env-fact / pitfall 记忆，memory_recall 可取` |
| `wiki_lookup` / `ncc_meta_find` / `bip_meta_find` | 同上，只给一行计数 |

**关键机制：插件要记住"本次会话最近解析成功的项目"。** `project_read` 自带 `project` 参数，模型推断出项目后自然会调它；但 `datasource_query`、`wiki_lookup`、`ncc_meta_find` 的参数里都没有项目——它们要给出提示，只能靠插件侧记下最近一次 project ref。落点现成：`execution.agent.session`（§2⑥）做键，`agent` 缺席时降级为不注入。

要点：
- **只注入标题 + id，不注入正文**（正文按需 `memory_read`）。5 条标题约 100 字，可忽略。
- 计数提示只读 `index.json`，不遍历文件——不能拖慢原本很快的查询。
- 注入**去重**：同一次会话里反复调 `datasource_query` 只提示一次（用同一个 session 键记已提示过）。
- 该项目一条记忆都没有时，什么都不加。

### 层 2：工具描述 + 系统提示

`memory_recall` 的 description 里写死协议：

> 「**开工前先调**：接触一个项目时，先 `memory_recall(project=…)` 看有没有前人（或你自己）踩过的坑。」

更要紧的是**系统提示**：插件每个会话都会往系统提示里注入一段固定文本（`src/host/prompt.ts` 的 `YON_PROMPT_TEXT`，就是模型现在读到的「能力分十三组」那段）。它才是**唯一每次会话都必然进上下文**的地方。照 `docs/yon-requirement-design.md`「十七、提示词第十二组」的先例，本功能要：

1. 把「能力分十三组」改成**十四组**，加一行 `· memory_* —— 项目级记忆：某个项目踩过的坑…`；
2. 加一段正文（说明"记的是事实、错了就改"与"改动会走审批"）；
3. 末句「只有迭代表板和需求条目这两条要由你写」要跟着改成三条——不改就是一句与正文自相矛盾的话。

**注意**：分组计数**没有测试盯着**（`tests/prompt.spec.ts` 只断言文本片段、`ORDER` 区间与 `SECTION` 名），它靠人看到。但新加的那段正文，按既有做法要在 `prompt.spec.ts` 里补 `toContain` 断言——那是防止两处口径漂移的地方。

### 层 3：会话开场注入 —— **删除**（v1 有，本版删）

v1 设想"会话开始时把该项目 top-3 记忆注入开场上下文"。定稿删掉，理由是前置条件不存在：

- 插件里**没有"当前项目"这个会话属性**。项目是登记记录，一个会话可以谈任意几个项目；
- 定稿确立了"当前项目由模型自己从上下文推断、不确定时问使用者"，而**会话开场时模型还没推断**；
- 所以这一层没有依据可依，不是"依赖 harness"的问题，是根本没有输入。

将来若 DSH 提供会话级的项目绑定，再回来加这一层。

## 7. 边界：记忆库 vs Obsidian 知识库

这是最容易做错的地方。**两套知识混起来，就变成了两个都不完整的知识库。**

判定问句：**「三个月后换一个项目，这条还有用吗？」**

| 答案 | 去处 | 理由 |
|---|---|---|
| 有用 | Obsidian vault（`wiki_write` / `topics/`） | 是平台知识，该被所有项目共用 |
| 没用 | `memory/` | 只在那个项目里成立 |

例子：
- 「NCC 2207 的 `bd_xxx` 表在该版本没有 `yyy` 字段」→ **vault**（换项目仍然对）
- 「水投这边习惯把自定义项叫"合同号2"，别写成"合同编号"」→ **memory**（出了水投无意义）

配套：**`memory_promote(id, vault)`** —— 把一条 `lesson` 从记忆库"升级"进知识库，按 `.wiki-schema.md` 生成页面（带 `project:` 与 `source_type: practice`）。

**promote 之后原记忆不动、也不删**（v1 曾设计把它标成 `superseded`，该状态已随 §3 原则 3 删除）。正文里由 `memory_annotate` 追加一行「已升级为知识库页面 X」，删不删由面板上的人决定。

### 与 Hindsight 的边界（v1 的表述与实测不符）

v1 写"Hindsight 兜通用仓库记忆（按 git 仓库分 bank、不进面板）"。**实测不是这样**：

| 项 | 实测 |
|---|---|
| 配置文件 `C:\Users\99558\.hindsight\coding-agent.json` | **不存在**（`config.exists: false`） |
| API token | **未配置**（`api_token_configured: false`） |
| 任何查询 | **401 Authentication failed: API key required** |
| 知识页数量 | **0** |
| bank 如何划分 | `coding-agent::新建文件夹` —— **按会话工作目录分，不是按 git 仓库** |

两条结论：

1. **当前不存在"两边都写"的风险**——Hindsight 这一边既写不进也读不出。
2. 即便将来配好，它的 bank 按**工作目录**切，而客开项目的记忆需要跨目录（今天在这个目录、明天在客户项目目录），拿它兜反而会碎成一地。

所以本功能与它的分工按这条判定问句：

> **这条经验属于"一个代码仓库"，还是"一个客户/环境"？**
> 前者（这套插件怎么改、为什么这么写）→ Hindsight，随仓库走；
> 后者（水投的达梦坑、天九的口径）→ `memory/`，随面板登记的项目走。
>
> 天然分开的地方：`memory` 的 `project` 必填，而登记的是客开项目；**开发插件本身不属于任何客开项目**，所以"插件自身的经验"没有位置可挂，自然落到 Hindsight 或 `iteration_*`。

## 8. 面板

`dsh-plugin-yon-panel` 的 README 已说明：任何插件都能通过 `yon.panel.item` 席位加按钮，不需要改外壳插件。但本功能是做进同一个仓库的（§2②），所以直接照 `src/client/iteration/`、`src/client/requirement/` 的样子加一个页签即可，不必另起插件。

界面（数据全部来自 `index.json`）：

- 左侧：项目列表（复用 `project_list` 的登记），选中即筛
- 主区：记忆条目，按 `type` 分组或按时间倒序
- 每行：`[type] 标题` + 日期；点击展开正文
- 顶部：关键词搜索、类型筛选
- 行内操作：**删除**（使用者的权限）、**promote**

没有"标记过期 / 标为已验证"这类操作了——状态字段不存在。

## 9. 生命周期与体检

`memory_sweep`（对照 `digest_sweep` 的角色）：

| 检查项 | 说明 |
|---|---|
| 孤儿 | `project` 指向已不存在或已归档的项目 |
| 无出处 | `source` 为空（写入已强制，但手工放进来的文件可能没有） |
| 超长 | `body` 超过软上限 200 字，应拆分 |
| 重复 | 同项目内 title 或结论高度相似 |
| **冲突** | 同项目内两条对同一件事给出**相反**结论——取消了状态标签之后，这是唯一能暴露"库里有两句话打架"的地方，必须报给人看 |
| 久未复核 | `created` 很早且 `updated` 从未变过（只提示，不判定对错） |

**从第一天起就该守的一件事**：`source` 必填。它是取消状态标签之后，记忆与"模型随口一说"之间剩下的唯一分界。

## 10. 分阶段落地

| 阶段 | 内容 | 验收 | 状态 |
|---|---|---|---|
| **P0** | 存储 + `memory_write` / `memory_update` / `memory_recall` / `memory_read` + **`project_read` 注入** + `prompt.ts` 第十四组 | 记一条坑，换个会话 `project_read` 能看见它；改掉它，再看见的是改后的 | ✅ 已完成 |
| **P1** | 面板页签（浏览、筛选、读全文、**删除**）✅ · 计数提示（`datasource_query` / `ncc_meta_find` / `bip_meta_find` / `wiki_lookup`）✅ · `memory_annotate` 决定不做（§13.3 第 4 条） | 面板能浏览、筛选、删掉一条 ✅；四个邻近工具的回答末尾带一行记忆计数 ✅ | 已完成 |
| **P2** | `memory_sweep` + `memory_promote` | 体检能报出孤儿、无出处与冲突 | 待办 |

**P0 就已形成闭环**（写 + 改 + 被动召回），且是全部价值的大头。不要先做面板。

## 11. 风险

| 风险 | 应对 |
|---|---|
| **上下文被吃掉** | 注入只给标题 + id，条数封顶 5；正文按需读 |
| **记忆污染 / 自我强化** | 降级为三条：`source` 必填、面板可见可删、`memory_sweep` 报冲突。**诚实说**：取消状态标签之后，防线比 v1 弱了——换来的是"库里只留当前事实"，这个取舍是有意的 |
| **改动没有历史** | `~/.dsh/yon-panel/` 不是 git 仓库，插件不替人 init。在你把它纳入版本控制之前，被改掉/删掉的记忆不可恢复 |
| **变成第二套知识库** | §7 的判定问句 + `memory_promote` 单向出口 |
| **与 Hindsight 重复** | 实测：它当前不可用（配置缺失、401、0 页），bank 按工作目录分；分工见 §7 |
| **正文被模型改错** | `memory_update` 走拦（`approval: ask` 时给人看 diff，`never` 时照跑）；模型没有删除工具 |
| ~~实现包未定位~~ | **已解决**：源码在 `E:\gitproject\dsh-plugin-yon-panel`（§2①②） |

## 12. 零改动的过渡做法

在 P0 落地前，**唯一"模型能写 + 面板能看 + 带日期 + 追加不改写"**的现成通道是 `requirement_annotate`：在某项目下建一条长期条目（如「项目经验与坑」），把经验追加进去。

代价：语义上挂着"需求"的名字，且无法按 `type` 分组、无法被 `project_read` 注入。但它**能改**（`requirement_update` 走审批）、面板可见——这两点恰好覆盖了本功能最要紧的两件事。P0 落地后按 `memory_write` 迁入。

---

## 13. 实施记录（P0，2026-10-08）

### 13.1 落地的文件

**新增**

| 文件 | 是什么 |
|---|---|
| `src/host/memory-doc.ts` | 文本层：frontmatter 与正文的解析/序列化。纯函数，无文件系统 |
| `src/host/memory-store.ts` | 磁盘层：`index.json` + 每条一个 `<id>.md`，原子写、坏记录跳过、`isSafeId` 门 |
| `src/host/memory-service.ts` | 业务层：id 生成、校验、项目解析、去重、改名解析、读改写队列 |
| `src/host/memory-tools.ts` | 四个工具 |
| `tests/memory-doc.spec.ts`（7）· `memory-service.spec.ts`（15）· `memory-tools.spec.ts`（13）· `memory-injection.spec.ts`（5） | 40 个新用例 |
| `scripts/verify-memory-live.mjs` | 实机验证：跑编译产物，走一遍完整闭环并打印产出的那个文件 |

**改动**

| 文件 | 改了什么 |
|---|---|
| `src/shared/types.ts` | `MemoryType` / `MEMORY_TYPES` / `MEMORY_TYPE_TEXT` / `MemorySummary` / `MemoryView` / `MemoryListRow` / `MemoryListPayload` / `SaveMemoryInput` / `UpdateMemoryInput` / `MemoryCreated` |
| `src/host/tools.ts` | `isDestructiveWrite` 认 `memory_update`；`project_read` 带上记忆（新 `READ_VALUE` schema、`memoryLines`、会话级去重）；`registerYonProjectTools` 多一个可选的记忆参数 |
| `src/host/prompt.ts` | 「能力分十三组」→ 十四组，加 `memory_*` 一行与一段正文，末句边界改成三条 |
| `src/index.ts` | 装配（服务在项目工具之前建）、`ctx.yonMemory`、导出、`Context` 声明 |
| `tests/prompt.spec.ts` · `host-plugin.spec.ts` · `host-tools.spec.ts` | 工具清单加 `MEMORY_TOOL_NAMES`；提示词断言更新；`memory_update` 的闸门用例 |

### 13.2 验证

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 无错（`src` + `tests` + `preview`） |
| `pnpm test` | ✅ 62 个文件 · **945 个用例全过**（其中 40 个是本功能新增的） |
| `pnpm build` | ✅ `lib/host/memory-*.js` 与类型定义均已产出 |
| `pnpm verify` | ✅ artifact ok（host ESM、client factory、externals、样式注入、类型、patch 层） |
| `node scripts/verify-memory-live.mjs` | ✅ 创建 / 读回 / 改写 / 去重 / 注入形状全对；真实记忆库此时为**空且不存在**（`~/.dsh/yon-panel/memory`） |

**一个不能省的操作性事实**：这四个工具在**已经开着的会话里不会出现**——实现完成时在当前会话里试调 `memory_recall`，拿回来的是 `unknown tool`。构建产物已经落地，插件本身不需要重装。但**「重启 DSH」与「只开一个新的会话」哪一个才够，本次没有验证**：README 一直写的是 host 半的工具需要重启，本次的观察与它不冲突，也没有证实它。

### 13.3 实现与设计稿不一致的地方

1. **frontmatter 的时间戳是 ISO，不是 `2026-10-05`。** 设计稿写的短日期无法给同一天的多条排序，而"最近 5 条"正需要它。改成 `created: 2026-10-05T06:12:30.000Z`，与 `requirement-doc.ts` 一致；人读的日期由面板（P1）格式化。
2. **索引里存的是"召回要用的字段全集"，不是目录卡片。** `requirement-store.ts` 的索引只存 id/项目/路径/时间，代价是列表要读每个 `entry.md`；记忆库不能这么付，因为注入路径（`recent`）必须只读索引。于是 record 带上了 title/type/tags/source。代价是同一份事实在文件与索引里各存一份，**规则先定死：文件是真相，索引是缓存**——`memory_read` 与 `list` 都从文件读，索引落后只会少给一条，不会给错一条。重建索引是 P2 体检的事。
3. **加了去重（同项目 + 同标题）。** 设计稿没写。理由与 `iteration-service.ts` 相同：模型在同一会话里重复记同一个坑是最常见的失败模式，而库里二十份同一句话的副本等于没人读的库。匹配是精确且规范化的（trim + 折空白 + 转小写），刻意笨。
4. **`memory_annotate` 先不做，而且要重新想。** 它原定 P1，但"记忆记的是当前事实"这条一旦确立，追加一段"此前记的 X 已不成立"就是错的做法——正确动作是 `memory_update` 直接改掉。设计稿 §5 同时留着 `update` 与 `annotate`，是 v1（记忆不可改）的残留。P1 之前先判它是否还有存在理由。
5. **三个上限定了数**：标题 120 字、正文**硬**上限 4000 字（软上限仍是 200）、tags 最多 12 个每个 40 字。软上限不拒，由 `memory_write` 的返回与 P2 的体检去说。
6. **注入的去重键是会话对象本身**（`WeakMap<session, Set<projectId>>`），且**没有 `agent` 时不注入**——直接派发无从判断这个上下文已经看过什么。设计稿只说"要去重"。
7. **`MEMORY_TYPE_TEXT`（中文名）放在 `shared/types.ts`**，面板与工具报告共用一份。
8. **测试是四个 spec 而不是一个**，注入单列（`memory-injection.spec.ts`）：它同时需要真实的项目服务与记忆服务，且它守的是"带什么 / 凭什么 / 带几次"，与工具本身的行为是两件事。

---

## 14. P1：面板与计数提示（2026-10-08）

侧栏第十格「记忆」，与其余九格同形：`src/client/MemoryItem.tsx`（格子）+ `src/client/memory/{MemoryManager.tsx,api.ts,panel.module.css}`（那一屏）。它能浏览（类型徽标、标题、项目、日期、一行摘要）、按类型与项目筛选、搜正文（关键词走后端——面板手上只有摘要，而记忆的价值在一句话的正文里）、展开读全文（正文、出处、id）、删除（两次点击）。

**它没有新建，也没有编辑。** 这是与其余九格唯一方向性不同的地方：记忆是「某人查出来的事实」，做成一张可以填写的表就等于允许凭印象编一条，而库里每一条都会被注入到下一个会话里当成事实用。所以这一屏的 API 只有 `GET` 与 `DELETE`，两条用例各盯着这半边：

- `tests/http-memory.spec.ts` → *has no route that creates or changes a memory*（`POST` 与 `PATCH` 都是 405）
- `tests/memory-panel.client.spec.tsx` → *asks twice before deleting, and never offers to create*

顺带三处改动，都是这一屏逼出来的：

1. **删除的顺序与写入相反。** `memory-store.ts` / `memory-service.ts` 各加一个删除：写入是「文件先、索引后」，删除是「索引先、文件后」。统一规则是**索引永远不领先于文件**——中断留下的中间态永远是「一条看不见的记忆」（手工能救），而不是「一个读不出正文的标题」（下个会话会拿到一个死引用）。
2. **`http.ts` 的错误映射链补上 `MemoryError`。** 那是一串手写的 `instanceof`，漏一个域的后果是 not-found 以 500 出去——看起来像服务器崩了，而不是「这条不在库里」。`http-memory.spec.ts` 有一条用例专门盯着 404。
3. **面板类名一律带 `mem` 前缀。** `iteration/panel.module.css` 里那条规则（预览页没有 CSS-module hash，同名即同一类）对它自己也成立：这一屏与迭代面板概念上共享一个工具栏、一排筛选胶囊、一个行头，不设前缀就是在赌没有一页会同时渲染两者。

### 计数提示：那一行是给谁的

§6 层1 里 `datasource_query` / `ncc_meta_find` / `bip_meta_find` / `wiki_lookup` 四个工具末尾那一行，落在 `src/host/memory-session.ts` 与四个模块的 `defineTool` 包装器上：

```
本项目记着 3 条记忆（memory_recall 可查，memory_read 读全文）。
```

**「现在在哪个项目上」由 `project_read` 记下。** 项目从来不是会话的属性——它是模型从上下文推断出来的，插件只是记住它推断的结果（§1 的第 1 条口径）。`project_read` 是那个一定会被读的工具（模型改配置前必须读它），所以它是唯一诚实的信号源。

三处实现上的选择：

1. **登记处挂在记忆服务上**（`memory.sessions`），不是作为第五个参数穿过每一次 `register` 调用。四个工具族因此只依赖一个 `MemoryHintLine` 函数，不知道记忆服务长什么样。
2. **提示在包装器里注入，不在工具的 `execute` 里。** 每个模块的 `defineTool(spec, hint?)` 拿到值之后把它并进返回值（多一个 `memoryHint` 字段——四个工具的输出契约都没有 `additionalProperties: false`，所以不必改 schema），render 时再拼成一个段落。这样那四个工具的 `execute` 一行都不用动，也不会各自漂成四种说法。
3. **去重按「会话 × 项目」算**，且**先认领再计数**：索引读不出来时 `count` 永远答 0，若不先认领，同一个答不上来的问题会在每次调用时重问一遍。

### 决定不做的

- **`memory_annotate`**：§13.3 第 4 条说它可能不该存在。在「记忆是当前事实」确立之后，追加一段「此前记的 X 已不成立」是错的做法——正确动作是 `memory_update` 直接改掉。这一版**不做**，等有真实用例再说；`memory-session.spec.ts` 与工具表里都不留它的位置。

---

## 附录：本方案的核查依据

| 结论 | 怎么得出的 |
|---|---|
| 源码在 `E:\gitproject\dsh-plugin-yon-panel`，link 安装 | 读 `C:\Users\99558\.dsh\profiles\yon\package.json`（第 15 行 `link:`） |
| 工具实现都在 `src/host/` | glob `src/**/*.ts`；grep `iteration_add` / `requirement_annotate` 命中 `src/host/*-tools.ts` |
| 拦不拦的裁决规则 | 读 `src/host/tools.ts`：`isDestructiveWrite` 379–409、`permissionsOf` 424–443、`dispositionOf` 448+、闸门 800–814 |
| 新工具默认不拦 | `src/host/tools.ts` 第 401 行 |
| 会话对象可拿到、可能缺席 | `src/host/tools.ts` 53–61 |
| 提示词分组与落点 | `src/host/prompt.ts`：第 48 行 SECTION、第 65 行 ORDER=3433、第 99 行「能力分十三组」；`tests/prompt.spec.ts` 无组数断言 |
| 数据目录无记忆库 | glob `C:\Users\99558\.dsh\yon-panel\**` → 13 个文件 |
| 知识库是 Obsidian 且有 `project` 字段 | 读 `wiki_config.json` 与 `.wiki-schema.md` |
| Hindsight 当前不可用 | `hindsight_diagnose`（配置不存在、token 未配）+ 查询返回 401；`bank_id = coding-agent::新建文件夹` |

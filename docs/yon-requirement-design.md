# 需求条目管理（requirement）：设计记录

2026-10-04 定稿，2026-10-05 补入「代码只留引用」（§二.17、§五、§十二、§十八）——中途考虑过留快照，权衡后不做。本文只写设计与口径，不含实现——代码一行没动。

要解决的事：**客开过程中「这个需求是什么、当时使用者给了什么、模型后来又探索出了什么、改过哪些说法」今天散在会话里，会话一关就没了**。本功能把它变成库里一条可以翻、可以追、可以交接的记录。

与 `project`（第 10 格）的分工，一句话说清：

| | 是什么 | 生命周期 | 谁在写 |
|---|---|---|---|
| `project` | **配置记录**：环境地址、账号、部署路径、版本号（`src/host/prompt.ts:100`：「这是配置记录，不是代码工程」） | 长期不变，是「背景」 | 使用者为主，模型偶尔补 |
| `requirement` | **过程记录**：一个需求条目从提出到完成的全部痕迹 | 随需求开始与结束 | **模型为主**，使用者校对 |

所以新起一个实体、而不是往 `project` 的动态字段里塞——`project` 的子表 `ProjectFieldValue{fieldKey, value, updatedAt}`（`src/shared/types.ts:49-55`）是「一个字段一个当前值」，天生存不了「同一件事的多段演进」。

---

## 一、词汇消歧

**「需求条目」**：一个可独立交付的需求点。有简要名称（如「H1-00 接口对接」）、有正文、有附件、有一段段追加的演进。**不是**任务清单里的一格，也不是里程碑。

**「单据的目录」**：原话里这一处我读作**「单独的目录」**的笔误，落成 `patches/`（放补丁文件）。若原意真是用友语境的「单据」（voucher），那也只是目录名不同，结构不变——见 §十九 待确认第 1 条。

**面板名**：侧栏第 11 格用两字「需求」（与现有的项目／技能／数据源／知识库／素材／Home／迭代／浏览器一致，都是 2 字），面板内标题用「需求条目」。

---

## 二、口径（使用者逐条选定，不再讨论）

| # | 项 | 定稿 |
|---|---|---|
| 1 | 库根 | `~/.dsh/yon-panel/requirements/` |
| 2 | 台账 | JSON **目录卡**：id / 所属项目 / entry.md 路径 / 创建时间。**记录本体只有 entry.md** |
| 3 | 条目文档 | 单个 `entry.md`：frontmatter（名称·状态·日期）+ 正文 + 追加段 |
| 4 | 修订方式 | 严格追加、带日期戳；旧的用 `~~删除线~~` 保留 |
| 5 | 结构化字段的追溯 | frontmatter 原地改（无痕），由**宿主**在正文末尾自动追一行「日期 字段：旧 → 新」 |
| 6 | 模型读到的 | 剥掉删除线段，**全文**给 |
| 7 | 历史视图 | 工具上显式 `history` 开关，默认不给 |
| 8 | 状态取值 | 待开发 · 开发中 · 待验收 · 已完成 · 搁置 · 已废弃 |
| 9 | 目录结构 | `<rq-id>/{entry.md, user/, generated/, patches/}`，**平铺、不按项目分文件夹** |
| 10 | 附件 | 使用者提供的文档**拷进库**（`user/`）；补丁放 `patches/` |
| 11 | 原件保护 | `user/` 模型**只读**，不可写不可删 |
| 12 | 附件读取 | 文本类直读；docx/xlsx/pptx 自解；PDF 走 Python，无 Python 降级为只留档并如实标明；旧 `.doc`/`.xls` 不做 |
| 13 | 新增闸门 | **不打断**；撞名时问 |
| 14 | 改／删闸门 | 打断，审批卡列 before → after；模型**不能硬删**，只能废弃；硬删留面板上的人 |
| 15 | 面板 | 独立第 11 格，`order: 90`，顶部项目选择器 |
| 16 | 提示词 | 能力分组 11 → 12 组，并写明「动手前先查该项目已有条目」 |
| 17 | 代码本体 | **既不拷整工程，也不留快照**：只留**引用**——仓库地址 + 分支/commit（或 Home 路径 + 版本）+ 碰过的文件清单，写成一条标注 |

---

## 三、功能点清单

| 功能 | 谁用 | 入口 | 闸门 |
|---|---|---|---|
| 自动记一条需求条目 | 模型 | `requirement_create` | 不打断；**撞名才问** |
| 追加一段（进展／标注／引用登记） | 模型 | `requirement_annotate` | 不打断 |
| 改名称／改状态 | 模型 | `requirement_update` | 打断，列 before → after |
| 废弃（软删，可恢复） | 模型 | `requirement_archive` | 打断 |
| 列条目（按项目／状态筛） | 模型 + 人 | `requirement_list` / 面板列表 | — |
| 读条目（默认当前有效；可选历史） | 模型 | `requirement_read(history?)` | — |
| 读附件 | 模型 | `requirement_file_read` | — |
| 写自己的产物（方案／补丁） | 模型 | `requirement_artifact_write` | 不打断 |
| 登记代码引用（仓库 + commit + 涉及的文件） | 模型 | `requirement_annotate` | 不打断 |
| 归档使用者提供的原件 | **人**（面板导入） | 面板「归档附件」 | — |
| 硬删条目（含目录） | **人** | 面板（二次确认） | — |
| 翻演进痕迹 | 人 | 面板「追溯」区 | — |
| 手工新建／改字段 | 人 | 面板表单 | — |

「模型能做什么」与「只有人能做什么」的分界在 §十二 的权限矩阵里画成一张表。

---

## 四、一次典型流转

```
使用者：这个需求记一下，叫「HG-01 固定资产卡片接口」，
        附件在 D:\客户资料\卡片接口清单.xlsx
   │
   ├─→ 模型 requirement_create(项目, 「HG-01 固定资产卡片接口」, 正文)
   │      └─ 同项目下无同名 → 直接建库，不打断
   │         · requirements/rq-20261004-3f9a/ 建目录
   │         · entry.md 落 frontmatter + 正文
   │         · index.json 记一条目录卡
   │
   ├─→ 模型 requirement_annotate(条目, 「使用者提供的资料：D:\客户资料\卡片接口清单.xlsx」)
   │      └─ 纯追加，不打断
   │
   ├─→ 模型提醒：原件要入库请用面板「归档附件」
   │      └─ 使用者在面板上导入 → 拷进 user/卡片接口清单.xlsx
   │
   ├─→ 模型探索出方案，requirement_artifact_write(条目, generated, 「方案.md」, …)
   │      └─ 写自己的产物，不打断
   │
   ├─→ 模型要动 NCC 侧那三个文件，先登记一条代码引用：
   │      requirement_annotate(条目, 「代码：E:/NCProject/NCC（svn r1842），
   │        本次涉及 H1Interface.java / HG01Convert.java」)
   │      └─ 引用不带走字节，不打断
   │
   ├─→ 使用者说「口径改了，之前那版作废」
   │      └─ 模型 requirement_annotate(条目, 「~~旧口径：字段 A 必填~~ → 新口径：A 可空」)
   │         ——旧的划掉保留，新的追加
   │
   └─→ 需求做完，模型 requirement_update(条目, 状态=已完成)
          └─ 审批卡：「状态：开发中 → 已完成」→ 批准后落 frontmatter，
             并在正文末尾自动追一行「2026-10-20 状态：开发中 → 已完成」
```

---

## 五、落盘：库根与目录树

库根选 `~/.dsh/yon-panel/`，因为它**已经是这个仓的数据根**，不是新造：

- `~/.dsh/yon-panel/iteration.json` —— 迭代表板台账（`src/host/iteration-store.ts:95`）
- `~/.dsh/yon-panel/knowledge/` —— 类名索引目录（`src/host/home-mirror.ts` 头注释引 `class-index.ts:classIndexDir`）

```
~/.dsh/yon-panel/requirements/
│
├── index.json                         ← 台账（目录卡），唯一入口清单
│
├── rq-20261004-3f9a/                  ← 一个条目一个目录；id 形如 rq-<日期>-<随机>
│   ├── entry.md                       ← 记录本体（唯一真相）
│   ├── user/                          ← 使用者提供的原件（模型只读）
│   │   └── 卡片接口清单.xlsx
│   ├── generated/                     ← 模型产出的方案、资料、插件
│   │   └── 方案.md
│   └── patches/                       ← 补丁文件（可直接落地的产物）
│       └── HG-01.fix.patch
│
└── rq-20260912-77c1/
    └── …
```

**为什么平铺、不按项目分文件夹**：需求条目会换项目（从 A 挪到 B 是常事）。按项目分目录时「挪」等于搬整个目录、所有引用它的路径同时断；平铺时「挪」只是改 `index.json` 里的一行。项目归属**不是**目录结构的一部分（见 §七 的字段归属）。

目录名用 id（`rq-<日期>-<随机>`，抄迭代的 id 形状），**不用名称**：名称会被改（口径 §二.4 允许改名称），目录跟着改名会到处断链。

新建条目时把 `user/`、`generated/`、`patches/` 三个子目录一起建出来（空目录），理由是让使用者一眼看到「东西该放哪」，不用读文档。

**代码不进来**：条目目录里没有代码本体，也没有代码快照——改动涉及的代码只在正文里留一条引用（仓库 + 分支/commit，或 Home 路径 + 版本，+ 碰过的文件清单）。要看当时的代码就按那个 commit 去仓库取；「改了什么」这一半由 `patches/` 承担。理由见 §十八。

---

## 六、一次写入落什么

```
       模型调用
          │
          ▼
   ┌──────────────┐   闸门（§十一）
   │ requirement_*│──────────────┐
   └──────┬───────┘              │ 批准 / 无需批准
          │                      ▼
          │            ┌──────────────────────┐
          │            │  宿主（同一操作内）  │
          │            └───────┬──────────────┘
          │                    │
          │        ┌───────────┴───────────┐
          │        ▼                       ▼
          │  entry.md 追加/改        index.json 记台账
          │  （记录本体）            （目录卡：路径/项目/时间）
          │        │                       │
          └────────┴───────────┬───────────┘
                               ▼
                     两者必须同时成功
                  （entry.md 写成功而台账没写 = 孤儿文件，
                    所以由宿主在一个操作里做，不靠模型两步调用）
```

**同一次改动由宿主双写**，模型没有「只写一半」的机会。

---

## 七、字段归属：每个字段只有一个权威

这是「单一真相」落到字段级的东西——同一件事绝不写两处：

| 字段 | 权威在哪 | 谁改 | 换项目时 |
|---|---|---|---|
| id | `index.json` | 宿主生成 | 不变 |
| 所属项目 | **`index.json`** | 宿主 / 面板 | **改一行，不碰 md** |
| entry.md 路径 | `index.json` | 宿主 | 不变 |
| 创建时间 | `index.json` | 宿主 | 不变 |
| 名称 | **`entry.md` frontmatter** | 模型（走审批）/ 面板 | 不变 |
| 状态 | **`entry.md` frontmatter** | 模型（走审批）/ 面板 | 不变 |
| 日期（最近改动） | `entry.md` frontmatter | 宿主 | 不变 |
| 正文 / 追加段 / 附件清单 | `entry.md` 正文 | 模型（追加）/ 人 | 不变 |

`index.json` **不存名称与状态**——那会变成第二个真相（模型改了 md 忘了改 json，面板就永远显示旧名字）。代价是列表页要读每个 `entry.md` 的 frontmatter；`entry.md` 都小，这个代价买的是「不会显示错」。

---

## 八、entry.md：形状、两种视图、结构化字段的追溯

### 8.1 文件长这样

```markdown
---
name: HG-01 固定资产卡片接口
status: working
created: 2026-09-12T03:11:20.000Z
updated: 2026-10-04T06:02:41.000Z
---

对接 HG-01 固定资产卡片接口，供 NC65 侧的资产卡片集成调用。

## 标注

2026-09-12 使用者提供的资料：`D:\客户资料\卡片接口清单.xlsx`（已在面板归档）。

2026-09-20 ~~字段 A 必填~~ → 使用者 10-04 澄清：字段 A 可空，缺省按机构默认值。

2026-10-04 状态：开发中 → 已完成
```

两处与最初设想不同，都以实现为准：

- **frontmatter 的键与状态值用英文**（`name:`/`status: working`）。这一段由代码写、由代码读，状态值还必须落在 `REQUIREMENT_STATUSES` 里；表面全 ASCII 就没有了半角/全角冒号的歧义。中文名（`待开发`/`开发中`…）只出现在给人看的地方——面板词条，以及宿主追加的追溯行（`REQUIREMENT_STATUS_TEXT`）。与 `ProjectStatus` 存 `active`/`paused`/`done` 而界面显示「进行中」是同一手法。
- **正文不再重复一遍 `# 名称`**。名称已经在前 frontmatter 里，正文再写一个 H1 就是第二个真相（改了 frontmatter 忘了改 H1，文件自己跟自己打架）。

### 8.2 两种视图（一份文件，两个读者）

```
                  entry.md（磁盘上唯一的那份）
                  ┌──────────────────────────────────────┐
                  │ 2026-09-20 ~~字段 A 必填~~ → A 可空  │
                  └───────┬──────────────────────┬───────┘
                          │                      │
              人打开文件 ▼                      ▼ 模型 requirement_read
              ┌──────────────────┐   ┌──────────────────────────────┐
              │ 删除线渲染出来， │   │ 剥掉删除线段，只看到         │
              │ 一眼看出改过什么 │   │ 「2026-09-20 → 字段 A 可空」 │
              └──────────────────┘   └──────────────────────────────┘
```

删除线是**给人看的**；模型拿到的正文里，作废内容整段被剥掉。这样同一份文件既是可追溯的台账、又不会把作废内容喂进上下文——「追溯」与「模型上下文」这对冲突就这么解掉。

要看历史的模型用 `requirement_read(ref, history: true)`，拿到的才是含删除线的原文。

**面板要的是第三份：切好的那一份。** 文档详情页把文件按「## 标注」切成两块画——上面是这件事本身（`prose`），下面是每一次改动（`notes`，一段一行）。这个切分**在宿主做**（`requirement-service.ts` 的 `viewOf`），不在客户端：`## 标注` 这个标题长什么样、空行分段这两条规则只有一处实现（`requirement-doc.ts` 的 `parseEntry`），面板自己从 `raw` 里切就是第二份。所以 `RequirementView` 在 `history: true` 时同时给 `raw`（给人看的原文）、`prose` 与 `notes`（切好的两块），平时三个都不给——它们是**读者**视角的字段，不是工作者视角的。

注意 `body` **不能**拿来当「正文那块」：它是 prose 与 notes 拼起来的那一份（标注标题还在里面），面板按它画会把追溯那几段渲染两遍。批 3 落地时这一条就是这么发现的。

### 8.3 结构化字段怎么追溯

frontmatter 是原地改的，**划不了删除线**——所以「谁什么时候把状态从开发中改成已完成」在文件里会丢掉。补法：**宿主每次改 frontmatter 时，在正文「## 标注」末尾自动追一行**：

```
2026-10-04 状态：开发中 → 已完成
```

- frontmatter = **当前值**（机器读，永远只有一份）
- 标注末段 = **事件明细**（人读，只追加）

两处不重复：一个是状态，一个是事件。且这一步由宿主做，不靠模型自觉——**结构化字段的追溯不该依赖被追溯者**。

---

## 九、台账 index.json

```json
{
  "version": 1,
  "entries": [
    {
      "id": "rq-20261004-3f9a",
      "projectId": "b41c…",
      "file": "rq-20261004-3f9a/entry.md",
      "createdAt": "2026-10-04T10:22:31+08:00"
    }
  ]
}
```

形状抄 `iteration-store.ts` 的手法：读-改-写 + 原子落盘（`iteration-store.ts:41` 导入的就是 `rename`，先写临时文件再 rename）。

台账只回答「有哪些条目、属于谁、在哪、什么时候建的」，**不回答内容**。

---

## 十、去重与撞名

模型自动新增最大的现实风险是**同一个需求被开成三四个条目**。判定按「同项目下、规范化同名的条目是否存在」：

规范化口径：`trim` + 大小写不敏感 + 连续空白折叠成一个空格（中文不受大小写影响，但英文条目名会）。

```
requirement_create(project, name)      ← 工具先带 dedupe: true 去问服务
        │
        ▼
  服务：index.json 里筛出该项目下的条目，逐条读 frontmatter 的 name
        │
        ▼  规范化后有没有同名的？
   ┌────┴────┐
   │         │
  没有       有
   │         │
   ▼         ▼
服务照建   服务**一个字都不写**，返回
（不打断） created:false + 那条已有的摘要
                │
                ▼
        工具把这次调用报成「没建成」，并把两条路摆给模型：
        「已有『HG-01 固定资产卡片接口』（rq-20260912-77c1，建于 2026-09-12）。
          要接着记 → requirement_annotate(rq-20260912-77c1)；
          确认是另一件事 → 带 acknowledgeDuplicate: "rq-20260912-77c1" 再调一次。」
                │
                ▼
        模型去问使用者（就在对话里问）
                │
          ┌─────┴─────┐
       同一件事     另一件事
          │            │
          ▼            ▼
     annotate 追加   再调 requirement_create，
                     这次带 acknowledgeDuplicate: "rq-20260912-77c1"
                          │
                          ▼
                 闸门 isDestructiveWrite('requirement_create',
                 { acknowledgeDuplicate: 'rq-…' }) 返回 true（非空字符串即 true）
                          │
                          ▼
                 审批卡：人在真正落盘前最后确认一次
                          │
                    ┌─────┴─────┐
                  批准         拒绝
                    │           │
                    ▼           ▼
                 另建一条     不建
```

**为什么撞名不能由闸门发现**（这是最初的设计稿写错的一处）：`isDestructiveWrite(name, args)`（`src/host/tools.ts:367-377`）是**同步纯函数**，只看工具名与参数，**读不了文件**——它不可能知道同项目下有没有同名条目。所以「撞名才问」拆成两段：**发现撞名的是工具**（那里有 I/O，服务返回 `created: false` 且不落盘），**闸门能看见的只有参数**。参数里那个 `acknowledgeDuplicate` 就是「模型已经问过使用者、使用者说要另建」的凭据，闸门在这一支上要求审批。

**凭据为什么是 id 而不是 `true`**（批 2 落地时改的一处）：`true` 只证明「模型填了一个字段」。抄一个、凭上一轮的记忆填一个、或者干脆想省事直接填，都能过。改成**被撞上那条的 id** 之后，服务拿它跟「此刻真正冲突的那条」比**相等**，比不中就照旧不写（`requirement-service.ts` 的 `create`）——一个过期的、指错人的凭据自己会失效，闸门只需要看见「非空字符串」。这与 `previewWrite` 对项目要改的那一行做的是同一件事：**断言它就是要改的那一条，而不是只看字段在不在**。

这条链上没有「悄悄多出一条同名条目」的走法：第一次调用命中撞名时什么都没写，而任何带 `acknowledgeDuplicate: true` 的调用都会经过审批卡——一个想省事直接带标志的模型，只是把问题提前推到了人面前，不影响这条结论。

**为什么撞名要问而不是默认追加**：追加与另建是语义上不同的两件事（「同一需求的新进展」还是「同名但不同的需求」），机器判不准，猜错一次就写进了一条不相干的记录。而它只在这一支上问，常规新增仍然不打断。

---

## 十一、闸门：复用现成的「按参数判」

**不需要新机制。** `src/host/tools.ts:367-377` 的 `isDestructiveWrite(name, args)` 收的就是**参数**，不是只看工具名——`project_update` 只在改 `archived` 或删字段时才算破坏性：

```ts
export function isDestructiveWrite(name: string, args: unknown): boolean {
  if (name === 'project_delete') return true
  if (name !== 'project_update') return false
  ...
  if (typeof input.archived === 'boolean') return true
  return removeFields.some(...)
}
```

它还有一条要照抄的保守口径（`:370-372`）：**参数解析不了就按「会丢数据」处理**——「unreadable arguments are the tool's problem to reject, but they are not a reason to treat a call as harmless.」

走向由 `dispositionOf(destructive, permissions)`（`:430-434`）决定：只读会话一律拒；非破坏性直接跑；破坏性在「想要被问」的会话里问、在声明了 `never` 的会话里跑。

### 五个工具的走向

```
工具                          破坏性判定                          走向
──────────────────────────────────────────────────────────────────────────
requirement_create     带非空 acknowledgeDuplicate 才 true      run 或 ask
requirement_annotate   恒 false                                run   ← 纯追加，绝不打断
requirement_update     恒 true                                 ask   ← 审批卡列 before→after
requirement_archive    恒 true                                 ask   ← 软删，可恢复
requirement_artifact_write  恒 false                            run   ← 只动自己的产物目录
（硬删）                无此工具                                 —     ← 只有面板上的人能做
```

`requirement_create` 那一行的判定落地成这样（其余四行照旧）：

```ts
if (name === 'requirement_create') {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return true
  const acknowledged = (args as Record<string, unknown>).acknowledgeDuplicate
  return typeof acknowledged === 'string' && acknowledged.trim() !== ''
}
```

理由见 §十：撞名是**工具读盘**读出来的（服务的 `created: false`），闸门只认参数。参数解析不了按「会丢数据」处理，与 `project_update` 那条保守口径一致。

### 审批卡是读盘算出来的

闸门里那张卡不是照抄参数：`requirement_update` 的卡上写的是 `名称：「旧」→「新」`、`状态：待开发 → 已完成`，`requirement_archive` 的卡上写明「文件不会被删」。

这不是新机制——本仓已有先例：`wiki-write.ts:751` 的钩子就是 `async` 的，为了在审批卡上写出要加什么。所以这条钩子收的是一个**读得到盘**的服务，而不是只有参数。读不出引用（条目不存在、索引坏了）时返回 `undefined` 并放行给 `next()`：参数或状态的问题由工具自己报错，问一张跑不起来的卡是噪声（`previewWrite` 的同一条口径）。

**为什么追加与改字段必须是两个工具**：闸门是按「工具名 + 参数」判的，如果合并成一个 `requirement_write`，那「追加一句」和「改掉状态」就共用一个走向，必然是被迫二选一：要么追加也要审批（重演迭代表板的失败——`docs/yon-iteration-design.md:32`：「加一道审批会把『顺手记一条』变成『要打断使用者一次』，模型于是学会不记——**这正是本功能唯一的失败方式**」），要么改状态也不问。拆成两个工具，两种语义各自拿到对的那条路。

审批卡上的文字沿用 `previewWrite`（`tools.ts:446`）的口径：**能算出改了 3 处就列那 3 处，改动为空就如实说改了 0 处**。

**模型不能硬删**：`requirement_archive` 只把状态置为「已废弃」（对应 `project` 的 `archived` 软删，`src/shared/types.ts:33`：「archived projects stay readable but leave pickers」）。真删（删台账条目 + 删整个目录）只有面板上的人能做，且要二次确认——照抄 `project_delete` 审批卡那句「此操作无法撤销」的直白口径（`tools.ts:483-486`）。

---

## 十二、附件：隔离与权限矩阵

```
                     model（工具）       人（面板）
                   ┌──────────┬──────────┐
   user/           │  只读    │ 读写     │  ← 使用者提供的原件
                   │          │ 归档/删  │
                   ├──────────┼──────────┤
   generated/      │  读写    │ 读写     │  ← 模型产出的方案、资料
                   ├──────────┼──────────┤
   patches/        │  读写    │ 读写     │  ← 补丁文件
                   ├──────────┼──────────┤
   entry.md 正文   │ 只追加   │ 读写     │  ← 模型只能 annotate
                   └──────────┴──────────┘
```

**隔离做在工具层，不做在文件系统层。** 模型工具里**根本没有**写 `user/` 的 API——这比给文件设只读属性可靠（Windows 上 `chmod` 只映射到一个只读位，行为不稳）。这是「使用者提供 vs 模型生成」这条分界唯一靠得住的实现方式：**看目录就知道是谁给的，不需要模型自述 provenance**。

`patches/` 与 `generated/` 都能被模型写，区别只在语义：`patches/` 放**能直接拿去落地的产物**（`.patch` / `.diff` / 替换用的整文件 / 压缩包），`generated/` 放方案、资料、插件这类要人读过才用的东西。

**代码只留引用，不带走字节**：改动涉及的代码写成正文里的一条登记——仓库地址 + 分支/commit（或 Home 路径 + 版本），加本次碰过的文件清单，走 `requirement_annotate`，**不打断**。要看当时的代码就按那个 commit 去仓库取；「改了什么」这一半仍然由 `patches/` 承担。

代价说清楚：**引用是自由文本，不是结构化字段**，所以面板没法按「碰过哪些文件」筛选或跳转，只能人读那行字。要变成结构化的（frontmatter 加一个「代码」字段、面板上可点）也行，只是那会把仓库/分支/commit/文件清单的形状钉死——见 §十九.7。

归档进来的原件保留原文件名；撞名时加 `-2`、`-3` 后缀，**不覆盖**已有原件。

---

## 十三、附件的读取能力

| 格式 | 怎么读 | 现状 |
|---|---|---|
| md / txt / 代码 / json / csv | 直接读 | 零成本 |
| docx / pptx | ZIP + XML，取 `word/document.xml` 等正文，去标签 | **一半现成**：ZIP 定位已有（`class-index.ts:22-43` 读 jar 的 EOCD 与中央目录项签名）；解压 entry + 去标签是新增（zlib 内置） |
| xlsx | 同上，另加 `sharedStrings.xml` 与单元格拼装、多 sheet | 中偏上，比 docx 麻烦在表格结构 |
| pdf | 走 `python`，无 python 则降级 | **一无所有**，见下 |
| 旧 `.doc` / `.xls`（OLE 复合文档） | — | **明确不做** |

### PDF 的探测与降级

```
  读 PDF
     │
     ▼
  解出 python 可执行文件（复用既有手法：datasource-probe.ts:224-226
  的 subprocess.resolveExecutable，命令名用 'python'）
     │
  ┌──┴──────────────┐
  有                没有
  │                 │
  ▼                 ▼
调 python 提取文本   降级：不做提取
  │                 │
  ├─ 成功 → 给文本   → 工具返回里写明「该附件未读入，
  │                   机器上没有 python」
  └─ 失败 → 报错并
     带上 python 自
     己说的话（照抄
     gbk-tool.ts:381
     那条「确认 python
     在 PATH 上」的口径）
```

**本机实测（2026-10-04）**：`python` → Python 3.13.13 可用；`python3` → **不可用**（Windows 上只有前者）。所以探测命令只能是 `python`，与 `datasource-probe.ts:49`、`gbk-tool.ts:60` 已有的 `PYTHON_COMMAND = 'python'` 一致。

「读不到就如实说读不到」这条口径是这个仓的既有做法（浏览器面板里 Firefox 那条路径就是「按文档实现 + 明确标注未验证」，`docs/yon-browser-design.md` §十二）：**降级要写在使用者看得见的地方**，不能静默当成功。

---

## 十四、模型工具清单

批 2 落地的是前七个；后两个（附件清单与读取）跟着批 4 走——它们读的都是 `user/` 里的东西，而**在没有任何东西能写进 `user/` 之前，先给模型两个能读它的工具是空转**（批 2 没有面板，也就没有导入入口）。

| 工具 | 入参要点 | 返回 | 闸门 | 落地 |
|---|---|---|---|---|
| `requirement_list` | `project?`、`status?` | 条目摘要列表（含库路径） | — | 批 2 |
| `requirement_read` | `ref`、`history?` | 剥删除线的正文；`history:true` 给原文 | — | 批 2 |
| `requirement_create` | `project`、`name`、`body?`、`status?`、`acknowledgeDuplicate?`（**id**，见 §十） | 新条目；撞名时**不写**，返回已存在那条 | run / ask（带非空 `acknowledgeDuplicate` 才 ask） | 批 2 |
| `requirement_annotate` | `ref`、`text` | 追加到「## 标注」末段 | run | 批 2 |
| `requirement_update` | `ref`、`name?`、`status?` | 改后的 frontmatter | ask | 批 2 |
| `requirement_archive` | `ref`、`reason?` | 置为已废弃 | ask | 批 2 |
| `requirement_artifact_write` | `ref`、`kind`（`generated`/`patches`）、`name`、`content` | 落盘路径 | run | 批 2 |
| `requirement_file_list` | `ref`、`dir?`（`user`/`generated`/`patches`） | 附件清单（名/大小/时间/可读性） | — | 批 4 |
| `requirement_file_read` | `ref`、`path` | 文本内容，或降级说明 | — | 批 4 |

`ref` 认 id，也容忍名称——名称查找**跨项目**（调用方常常并不知道项目，要求它先说一遍只会把模型逼去编一个 id）。两个项目下有同名条目时不是猜，是报错并把两个 id 都列出来要求改用 id 指定。（初稿写的是「名称在项目内唯一」，实现放宽了：跨项目重名是真实会发生的，这时报错比设一个「项目内唯一」的约束更省事。）

**谁在什么时候读什么**：`requirement_list` 与 `requirement_read` 是**只读**的，不进闸门；`requirement_file_read` 也是只读——但它读的是使用者给的原始资料，返回里要带上「这是使用者提供的材料，不是本插件生成的」。

---

## 十五、HTTP 路由

```
GET    /yon/api/requirements?project=&status=   列表                        ← 批 2
GET    /yon/api/requirements/<id>?history=1     读一条                      ← 批 2
POST   /yon/api/requirements                    新建（人的入口）             ← 批 2
PATCH  /yon/api/requirements/<id>               改字段                      ← 批 2
POST   /yon/api/requirements/<id>/annotations   追加一段                    ← 批 2
POST   /yon/api/requirements/<id>/archive       废弃（body 可空）            ← 批 2
DELETE /yon/api/requirements/<id>               硬删（只在面板里可达）        ← 批 2
GET    /yon/api/requirements/<id>/files?dir=    附件清单                    ← 批 4
POST   /yon/api/requirements/<id>/files?dir=    归档附件（`user/` 的唯一入口） ← 批 4
GET    /yon/api/requirements/<id>/files/<name>?dir=  读附件                 ← 批 4
DELETE /yon/api/requirements/<id>/files/<name>?dir=  删附件                 ← 批 4
```

批 2 只落七条：`files` 那四条是同一件事（把条目目录里的文件列出来／放进去／读出来／删掉），缺了面板那一半就没有调用方。**`user/` 只能从 `POST .../files` 进**——模型侧那条路（`requirement_artifact_write`）的 `kind` 里没有 `user`。

批 4 落地时在这份清单上补了两处、并把一处写实：

- **`DELETE .../files/<name>` 是清单上没有的第四条**。初稿只算了「列／放／读」，但 §十二 的矩阵里**人对三个目录都是读写**，面板上少了这条就删不掉一个放错的文件。删一个附件与删一条条目一样是不可撤销的，所以面板那一侧同样是两步确认。
- **`GET .../files/<name>` 带上 `?dir=`，`POST` 与 `DELETE` 也一样，默认 `user`**。三个目录里完全可能有同名文件（`方案.md` 在 `generated/` 与 `patches/` 各一份），不说清是哪一个就等于猜。
- **上传是原始字节，不是 JSON**：`MAX_BODY_BYTES`（1 MB）是这一份文件里**每一条路由**共同的属性，为一条路由抬高它等于给所有路由抬高。所以 `POST .../files` 有自己的一把尺（`readAttachmentBody`，50 MB；先按 `content-length` 挡一道当捷径，真正的裁决是边读边累加的那个数——头会撒谎）。文件名走 `x-yon-file-name` 头且**URL 编码**：HTTP 头的值在 Node 里是 latin-1，「华科接口文档.docx」原样放进去会变成乱码。客户端那一侧与它成对（`src/client/request.ts` 的 `upload`），两边各自钉住自己那一半（`tests/request.client.spec.ts` ↔ `tests/http-requirements.spec.ts`）。

`POST /requirements` 收的是 `projectId`，不是项目引用：面板手里已经有列表，按 id 选。HTTP 层不收第二种拼法。这也解释了为什么它不带 `dedupe`——人的入口不去重，一个人把同一句话打两遍，理由是他的（§十，规则 3）。

分支派发抄 `handleHomes` 的写法（`src/host/http.ts:324-434`）。**一个要照抄的坑**：`http.ts:981-984` 为 `pick-directory` 写过的注释——派发时先把子资源段（这里的 `files` / `annotations` / `archive`）判掉，再把它当 id 用，否则会出现「先给一个 no Home named pick-directory 的 404」。这里虽然是 `segments[2]` 起才有子资源、撞车概率低一点，规则照抄。

---

## 十六、面板（第 11 格）

两个视图切换（列表 ↔ 详情），不是一个长条。理由是面板本体只有 450px 高的滚动区（实测：对话框 680×556，pane client 450px），把列表、正文、附件、追溯四块竖着堆进去，每块都只剩一条缝。

**列表视图**

```
┌ 需求条目 ────────────────────────────────────────────────┐
│ 项目 [ 现代保险 NC65 集成        ▾ ]  状态 [ 全部 ▾ ]    │
│ 6 条 · 库：~/.dsh/yon-panel/requirements/                │
├──────────────────────────────────────────────────────────┤
│ HG-01 固定资产卡片接口                      开发中       │
│   2026-09-12 建 · 1 个附件 · 2 个补丁                    │
│ ──────────────────────────────────────────────────────── │
│ H1-00 接口对接                              已完成       │
│   2026-08-01 建 · 3 个附件 · 2 个补丁                    │
│ ──────────────────────────────────────────────────────── │
│ …                                                        │
├──────────────────────────────────────────────────────────┤
│                       [ 打开库目录 ]   [ 新建条目 ]      │
└──────────────────────────────────────────────────────────┘
```

**详情视图**

```
┌ ← 返回列表     HG-01 固定资产卡片接口        开发中 ▾    ┐
│ 项目：现代保险 NC65 集成 · 建 2026-09-12 · rq-2026…      │
├──────────────────────────────────────────────────────────┤
│ 正文（当前有效）                                         │
│   对接 HG-01 固定资产卡片接口，供 NC65 侧资产卡片集成…   │
│                                                          │
│ ▾ 追溯（8 段 · 最近 2026-10-04）                          │
│   2026-10-04  状态：开发中 → 已完成                       │
│   2026-09-20  ~~字段 A 必填~~ → 字段 A 可空               │
├──────────────────────────────────────────────────────────┤
│ 附件  [ user/ 1 ]  [ generated/ 5 ]  [ patches/ 2 ]      │
│   · 卡片接口清单.xlsx   1.2 MB   2026-08-03   [读][打开] │
├──────────────────────────────────────────────────────────┤
│      [ 标注 ]   [ 归档附件 ]   [ 改状态 ]   [ 废弃 ]     │
└──────────────────────────────────────────────────────────┘
        ↑ 动作行按共享那条 sticky 规则钉住
          （src/client/panel.module.css:570-616）
```

两条布局结论直接沿用浏览器面板批 4 的成果：动作行**用本表自己的类**做 sticky（浏览器面板的 `.actionsDock`，`src/client/browser/panel.module.css:120-144`），不去放宽共享的 `:last-child` 选择器——因为本面板的详情内容也在动作行之后还有东西，共享那条够不到它。

词条 zh/en 双写，约 80 键（浏览器面板那批是 70 键量级）。

**批 3 落地的样子与上面两份草图的六处出入**（草图画的是六批做完的目标态，下面这几条是批 3 只能做到哪一步，理由见 §二十一 的批 3 记录）：

1. **行第二行只写两个日期**（`建 X · 最近改动 Y`）。草图里的「1 个附件 · 2 个补丁」要等批 4/5 才有那两个数。
2. **底部是「共 N 条 · 库：<path> · [复制库路径]」**，不是「[打开库目录]」——§十九.6 已定为复制路径（库在 `~/.dsh/yon-panel/` 这样的隐藏目录下，本仓也没有「用系统的文件管理器打开一个路径」这条现成的宿主能力）。
3. **「改状态」不做动作行里的按钮**：详情里就是一个六态 `<select>`（正文下面那一行）。三个动作挤在 450px 的动作行里已到上限，再多一个就把它们推到折线以外。
4. **「归档附件」整条是批 4 的**，本轮不在；同理「附件」那一块也不在。
5. **过滤走宿主**（`?project=` / `?status=`），与迭代表板相反：这一屏的「共 N 条」数的是**眼前这一屏**，被筛掉的本来就不该被数进来。
6. **追溯标题按草图**（`▾ 追溯（N 段 · 最近 <日期>）`），折叠只藏那几段，段数与日期留着。

**批 4 落地的样子与上面草图的出入**（第 1、4 条出入到批 4 就结了：行里能显示附件数、附件块与「归档附件」都到位）：

1. **`[读][打开]` 里那个「打开」落成了「复制路径」**：本仓没有「用系统的文件管理器打开一个路径」这条现成的宿主能力（与库根那个按钮同一条结论，§十九.6）。路径进剪贴板，粘到资源管理器或编辑器里一样能开，而且不假装有一个没实现的动作。
2. **一个文件给不给「读」，按扩展名的预测走**（§十三）：预测说读不了的（docx/xlsx/pdf/图表）连按钮都不给，只在行下写一句为什么——点一下再被告知「读不了」，等于拿一次等待换一句本来就看得到的话。预测说能读的，按下去才知道字节是不是真的文本（`.txt` 里装着 zip 就回「扩展名骗了人」），**这道裁决归字节**。
3. **读出来的正文摊在行下面**（自己滚，上限 200px），不是第二个对话框：面板本体只有 450px，嵌套一层模态在这块地方只会更挤；而且读的结果就在那一行旁边，不必让人自己对应回是哪一份文件。
4. **「归档附件」是套着 `<input type="file">` 的 label，不是宿主按钮**：这套按钮原语画的是一个 `<button>`，把 input 嵌进 `<button>` 里是不合法的嵌套，点下去也不一定会开选择器。一律进 `user/`——这个按钮存在的理由就是「归档使用者提供的原件」，而 `generated/` 与 `patches/` 是模型写自己产物的地方。
5. **附件那一块把「撞名加 -2」这句话写在块里**（`requirement.uploadHint`），不塞进已经排满的按钮行。

---

## 十七、提示词第十二组

`src/host/prompt.ts` 原来是「能力分十一组」，批 2 改成十二组，并多一段正文（那段话是模型真正逐字读到的，所以它守的是**工具 schema 守不住的那半**）。

组里那一行：

```
· requirement_* —— 需求条目库：某个项目下「要做的事」一条条记下来，连同使用者给的资料、你生成的方案与补丁。这套结构的主要写作者是模型。
```

正文那一段（与 `iteration_*` 那段并列，改的是同一个问题的另一面——那边说「记录不是改动」，这边说「描述是他的原话，不是你的分析」）：

```
使用者谈起一件要做的事，就把它记成一条需求条目：requirement_create 写下他的原话、目标与约束，不要把你的分析写进描述（那是标注）。同一件事的进展、你查出来的表名字段、他后来补充的要求，都用 requirement_annotate 当场追加，别攒到最后——追加不打断任何人，也不会改写已经写下的东西。改条目的名称或状态、以及把条目废掉，这两件会覆盖已写下的内容，会走审批：状态要跟着他的话说，他没验收就别标「已完成」，他没说不要了就别废弃。条目的正文只放「他要什么」，你探查与推演出来的东西放标注；两边混在一处，读的人分不出哪句是他说的。你要产出方案文档或补丁，写进条目自己的 generated/ 与 patches/；使用者给的资料进 user/，那个目录你不能写——「这是使用者给的」只有在他自己放进去时才成立。真删条目没有工具，只有面板上的人能做。
```

末句的边界那一行也跟着改了：原来是「只有迭代表板那一条要由你写」，现在是「只有迭代表板和需求条目这两条要由你写」——不改就是一句与正文自相矛盾的话。

---

## 十八、明确不做

- **不自动归档使用者提到的一切文件**。看起来省事，实际是把客户机密扩散进第二个位置、大文件进库，而且没有可靠判据知道「这个文件该归到哪条」——靠模型猜一次错，库里就多一份不知道该不该在的东西。
- **pdf 之外不做 OLE 复合文档**（`.doc` / `.xls`）：解析成本高、质量不稳。
- **不做条目的硬删工具**：模型只能废弃。硬删留给人。
- **不给「改已有段落」开绿灯**：正文的既有内容一律靠删除线 + 追加表达，工具层不提供原地改写的入口（frontmatter 除外，它走审批）。
- **不把代码本体拷进库**——不拷整个工程、不拷整个 Home、也不留碰过的那几个文件的快照：代码继续住在 git／SVN 里，库里只留一条**引用**（仓库 + 分支/commit，或 Home 路径 + 版本，+ 碰过的文件清单）。四条理由：① 会造出第二个真相——库里那份和仓库那份不一致时，没人知道该信谁；② 体积不匹配——客开工程动辄几百 MB 到 GB，而库根在使用者主目录；③ 库里没有 git 的增量与 diff，存十次就是十份全量；④ 客开代码常带硬编码凭据，进了库根就多一份明文副本，而库根不在版本控制里、容易被整个拷走。
- **不做多用户／并发写**：这个库是单机、单人（`project` 的存储也是本地 domain，`src/index.ts:205`）。同一次改动由宿主串行双写。
- **不做条目的跨库同步／导出**：等真有第二台机器再说。

---

## 十九、待确认

1. **「单据的目录」**——我读作「单独的目录」（落成 `patches/`）。若原意是用友语境的「单据」，只是目录改名。
2. **`user/` 是否允许模型「新增」**（口径 §二.11 定的是「不可写不可删」，没说能不能追加）。我按**更严的一侧**设计：模型连追加都不行，原件只能由人在面板导入。代价是使用者在会话里给了路径时要切到面板点一下。若嫌麻烦，可以放宽成「模型可追加、不可改删」——但那样「user/ = 使用者提供的」这条分界就从「结构保证」降级成「模型自觉」。
3. **单个附件的归档上限**：建议 50 MB，超限只登记引用（路径 + 大小 + 时间）并在返回里说明。数值可改。
4. **`patches/` 与 `generated/` 的分工**（§十二 的解读）：都能被模型写，区别只在「能不能直接拿去用」。
5. **侧栏标签用「需求」二字**（面板内标题仍是「需求条目」）。
6. **「打开库目录」按钮**：库在 `~/.dsh/yon-panel/` 下，本机直接打开是否方便——不方便的话我把按钮做成「复制路径」。**已定：复制路径**（批 3 落地，`writeClipboard`，见 §十六 的出入第 2 条）。
7. **代码引用要不要固化成结构化字段**：现在它是一条自由文本标注（面板没法按「碰过哪些文件」筛选或跳转）。若要在面板上点着跳转，就得给 frontmatter 加一个「代码」字段，把仓库/分支/commit/文件清单的形状钉死。

---

## 二十、必须实测后才敢写的项

1. **PDF 提取路径**——本机有 `python` 3.13.13，但**具体用哪个提取方式还没跑过**（不存在通用自带库；要么让它读一个最小脚本，要么用已装的三方库）。没实测前，这一条在文档里只能写「按探测实现」，不能写「能读」。
2. **docx / xlsx 真解开一次**：本仓现有的 ZIP 代码只读**中央目录**（列）不解压 entry，解压那一层是新增，必须真跑一份 docx 与一份 xlsx（xlsx 尤其要验多 sheet 与共享字符串）。
3. **在 450px pane 里两个视图切换的手感**：详情里「正文 + 追溯 + 附件 + 动作行」四块会不会又把动作行顶出折叠线——按浏览器面板的教训，这里必须实测而不是估。
4. **`~/.dsh/yon-panel/` 在资源管理器里打开是否顺手**（§十九.6）。
5. **归档一个 50 MB 文件的耗时**，以及库目录变大后在面板里列目录的响应。
6. **浏览器原生 `<input type="file">` 在真宿主里点不点得开**（批 4 加的，见 §十六 批 4 出入第 4 条）。宿主这套按钮原语里**没有文件选择器**这条能力（只有目录选择器），所以这一块是唯一一处「按浏览器的标准做法实现，但没在真宿主里点过」的地方。要把三种情形点一遍：① label 点一下开不开选择器；② 选完之后 `change` 有没有带着那份文件来；③ 藏 input 的那个 `position:absolute + opacity:0` 在宿主的对话框里有没有被别的层盖住（盖住就点不动，但那时看不出原因）。若 ① 不成立，退路是把它换成一个真正可见的 `<input type="file">`，代价是那一行会难看一块。

---

## 二十一、分批（六批，顺序待点头）

按「先跑通闭环，再补附件与二进制」切——理由是最不确定的一块（二进制读取）**不该挡在「能用」前面**：

| 批 | 内容 | 可见性 |
|---|---|---|
| 1 | 地基：库根、目录树、`entry.md` 读写（frontmatter 解析/序列化、删除线剥离）、`index.json` 原子台账、撞名判定、宿主追行 | 不可见 |
| 2 | 模型侧：`requirement_*` **七个**工具 + 闸门接线 + **七条** HTTP 路由 + 提示词第十二组 | 模型能用 |
| 3 | 最小面板：第 11 格、项目选择器、列表 ↔ 详情、追溯区 | **人看得见** |
| 4 | 附件：`user/` 隔离与归档、`generated/`、`patches/`、文本类读取 | 可见 |
| 5 | 二进制读取：docx/xlsx/pptx 自解、PDF 探测与降级 | 可见 |
| 6 | 预览页 + 设计文档收口 + README + 门禁 | — |

每批做完汇报就停，不自动带出下一批。

### 批 1 落地记录（2026-10-05）

三个模块，纯文本层与磁盘层分开，是为了让「文本规则」能被钉死而不碰文件系统：

| 文件 | 行数 | 内容 |
|---|---|---|
| `src/host/requirement-doc.ts` | 271 | frontmatter 解析/序列化、`## 标注` 切分、删除线剥离、宿主追行、`normalizeName` |
| `src/host/requirement-store.ts` | 276 | 库根 `~/.dsh/yon-panel/requirements/`、每条目录 `user/generated/patches`、`index.json` 原子台账、`isSafeId` 路径闸 |
| `src/host/requirement-service.ts` | 413 | 读-改-写队列、`RequirementError`、`list/read/create/annotate/update/archive`、撞名判定、注入时钟 |

配套测试 69 条（`tests/requirement-doc.spec.ts` 26 · `requirement-store.spec.ts` 18 · `requirement-service.spec.ts` 25），全部用 `mkdtemp` 造的临时库根，**没有任何一条会碰操作者真机上的 `~/.dsh/yon-panel/`**。

落地时偏离初稿的四处，都以实现为准：

1. **撞名由工具读盘发现，不由闸门**（§十、§十一已改）。
2. **frontmatter 用英文键与状态值，正文不再重复 `# 名称`**（§8.1 已改）。
3. **`ref` 按名称查找跨项目，重名时报错列出两个 id**（§十四已改）。
4. **`create` 的落盘顺序是「先目录与 md，后台账行」**：中途崩了只留一个看不见的孤儿目录；反过来会留一条列在面板上、点进去什么都没有的坏行。

### 批 2 落地记录（2026-10-05）

| 文件 | 行数 | 内容 |
|---|---|---|
| `src/host/requirement-tools.ts` | 784 | 七个工具、各自的 `presentCall`、闸门钩子（async，读盘算审批卡）、`describeRequirementWrite` |
| `src/host/requirement-service.ts` | 529（+116） | 批 1 的 413 行 + `remove(ref)`（真删，面板专用）、`artifactWrite(ref, kind, name, content)`、`acknowledged` 语义从「有没有填」改成「填的是不是冲突那条」 |
| `src/host/requirement-store.ts` | 329（+53） | `RequirementArtifactKind`、`isSafeArtifactName`、`artifactPath` / `writeArtifact`、`MAX_ARTIFACT_NAME` 改为导出 |
| `src/host/http.ts` | 1461（+96） | `handleRequirements`（七条路由）、派发一条、第 12 个位置参数、错误映射加 `RequirementError`、头注释补一段 |
| `src/host/tools.ts` | 828（+31） | `isDestructiveWrite` 加需求分支；`asRef` / `locate` 改为导出（让第二个用到项目引用的工具族复用同一份措辞） |
| `src/host/prompt.ts` | 165 | 「能力分十二组」+ `requirement_*` 一行 + 一段正文 + 末句边界改口 |
| `src/index.ts` | 444（+35） | 服务装配、`ctx.provide('yonRequirements')`、工具注册、HTTP 第 12 实参、导出块、`declare module` 增补 |

配套测试 **+56 条**（`tests/requirement-tools.spec.ts` 27 · `http-requirements.spec.ts` 21 · `requirement-service.spec.ts` +6 · `prompt.spec.ts` +1 · `host-tools.spec.ts` +1），全部用 `mkdtemp` 造的临时库根。全量 **55 文件 / 824 条通过**（批 1 后是 53 / 768）；`npm run typecheck` 0 错；`npm run build` 之后 `lib/client.js` **453.43 kB 逐字节未变**——批 2 一行都没进客户端；`npm run verify` 通过。

落地时偏离初稿的四处：

1. **工具与路由从九个 / 十条收到七个 / 七条**（§十四、§十五 已改）：剩下两个工具与三条 `files` 路由都是「条目目录里的文件」，而批 2 还没有任何东西能往 `user/` 写，先给模型两个读它的工具就是空转。
2. **`acknowledgeDuplicate` 从 `true` 改成被撞那条的 id**（§十、§十一 已改）。理由是 `true` 只证明填了字段，id 才证明模型说的是哪一条，服务比相等之后过期凭据自己失效。
3. **审批卡改成真读盘**（§十一 新增一节）：本仓早有 async 钩子先例（`wiki-write.ts:751`），所以 `requirement_update` 的卡上写得出 `旧 → 新`，不必只列新值。
4. **`remove` 与 `artifactWrite` 落在服务上，不是落在工具或路由上**：把 `ref` 翻成 id 是服务的活（跨项目重名要报错），谁自己做一遍就是第二份 `resolve`。`remove` 的落盘顺序与 `create` 同一条原则——**先改台账行，再删目录**：中途崩了只留一个看不见的孤儿目录。

### 批 3 落地记录（2026-10-07）

| 文件 | 行数 | 内容 |
|---|---|---|
| `src/client/requirement/RequirementManager.tsx` | 784 | 两个视图（列表 ↔ 详情）、两个选择器、新建表单、正文与追溯两块、标注表单、两步确认的吸底动作行 |
| `src/client/requirement/panel.module.css` | 382 | 只放共享表没有的类名：`.scrollBody` 整高覆盖 + 本屏 22 个类（含本表自己的 `.actionsDock`） |
| `src/client/requirement/api.ts` | 134 | 七个调用（`list`/`read`/`create`/`annotate`/`update`/`archive`/`remove`）+ `STATUS_LABEL_KEYS` / `STATUS_FILTERS`；过滤走查询串 |
| `src/client/RequirementItem.tsx` | 104 | 第 11 格那一行按钮：手势、焦点归还、`pushOverlay` 全部抄旁边八格 |
| `src/client/slots.ts` | 254（+28） | `RequirementItemFace`（七个调用 + 借来的 `listProjects` + `pushOverlay`） |
| `src/client/index.ts` | 258（+26） | 第九格注册（id `requirement`、order 90）、`createRequirementApi()`、导出与类型别名 |
| `src/client/locales.ts` | 1253（+164） | `item.requirement` + 约 70 个 `requirement.*`，zh/en 双写 |
| `src/shared/types.ts` | 1333 | `RequirementView` 在 `body` 之后加 `raw`（1261）、`notes`（1270）、`prose`（1278） |
| `src/host/requirement-service.ts` | 545 | `viewOf` 在 `history` 时多给 `raw` / `prose` / `notes`（`224-231`） |

配套测试 **+16 条**：`tests/requirement-panel.client.spec.tsx` 15 条（新文件）· `tests/browser-plugin.client.spec.ts` +1 条（需求 face 的九个方法，并断言它借到的 `listProjects` **就是**数据源那格借到的同一个函数）· `tests/requirement-service.spec.ts` 那条「两种视图」改写后多了四个断言（条数不变）。全量 **56 文件 / 840 条通过**（批 2 后是 55 / 824）；`npm run typecheck` 0 错；`npm run build` 出 `lib/client.js` **513.11 kB**（批 2 是 453.43 kB，+59.68 kB 全是这一屏）；`npm run verify` 通过。

落地时偏离初稿的四处：

1. **`prose` 与 `notes` 加进 `RequirementView`**，切分留在宿主（§8.2 已补一段）。初稿写的是「面板自己从 `raw` 里切」，落地时发现不行：那会把 `## 标注` 这个标题、以及「空行分段」这两条规则复制到客户端第二份。**这一条是被一个真 bug 逼出来的**——`body` 是 prose 与 notes 拼起来的那一份（标注标题还在里面），面板一开始拿它当「正文那块」画，追溯那几段就渲染了两遍。加的这两个字段与 `raw` 一样只在 `history: true` 时给，所以模型那边一个字段都没多拿到（`requirement-tools.ts:349-359` 只把 `bodyBlock(view)` 与 `view.raw` 写进报告，新字段进不了模型上下文）。
2. **「打开库目录」改成「复制库路径」**（§十九.6 已结，§十六 出入第 2 条）。
3. **行内不显示附件数、不给「归档附件」按钮**（§十六 出入第 1、4 条）：那是批 4 的数与动作，这一批画上去就是永远显示 0。
4. **过滤做成服务端参数**（§十六 出入第 5 条），与迭代表板相反——理由是这一屏的计数行数的是眼前这一屏。

两处按草图的约定没动：追溯标题的 `（N 段 · 最近 <日期>）`、以及动作行**用本表自己的类**吸底而不放宽共享的 `:last-child`。

批 3 **未做实测的两项**（不在本批验收范围内，如实记下）：450px pane 里两个视图切换的手感（§二十.3，预览页是批 6 的）、以及真机点开面板走一遍（本批只做到单测 + typecheck + build + verify；活体验证要装进 DSH 才做得到）。

### 批 4 落地记录（2026-10-07）

| 文件 | 行数 | 内容 |
|---|---|---|
| `src/host/requirement-files.ts` | 200（新） | **纯函数层，不碰文件系统**：`classifyFile`（扩展名 → 可读预测 + 一句为什么）、`attachmentText`（字节 → 裁决，复用 `home-files.ts` 的 `decodeText`）、`freeName`（`-2` 加在扩展名之前）、`sizeOf`、`MAX_ATTACHMENT_BYTES` / `MAX_FILE_READ_BYTES` / `MAX_FILE_READ_CHARS` |
| `src/host/requirement-store.ts` | 445（+116） | 字节层：`statFiles`（换掉 `listFiles`）、`filePath`、`readFileHead`（`open` + `handle.stat()`，让大小与时间描述的是**真被读的那个文件**）、`writeFileBytes`、`removeFile`；`RequirementArtifactKind = Exclude<RequirementDir,'user'>` 是**推导**出来的 |
| `src/host/requirement-service.ts` | 778（+233） | `fileList` / `fileRead` / `importFile` / `removeFile`；`requireFileName` 与 `artifactWrite` 共用；**读不了不是错误**——只有「没有这条条目」「没有这个文件」才抛 |
| `src/host/requirement-tools.ts` | 976（+192） | 第九、第十个工具 `requirement_file_list` / `requirement_file_read`（**都只读**，`WRITE_TOOL_NAMES` 一行没动） |
| `src/host/http.ts` | 1566（+105） | 四条 `files` 路由 + `readAttachmentBody`（独立 50 MB 上限） |
| `src/shared/types.ts` | 1425（+92） | `RequirementFile` / `RequirementFileGroup` / `RequirementFileList` / `RequirementFileRead` / `RequirementFileImport` |
| `src/client/request.ts` | 92（+41） | 拆出 `readAnswer`（两条发送路径共用唯一的失败处理），新增 `upload` |
| `src/client/requirement/api.ts` | 211（+77） | `fileList` / `fileRead` / `importFile` / `removeFile` + `DIR_LABEL_KEYS` |
| `src/client/requirement/RequirementManager.tsx` | 1117（+333） | 附件块（三个文件夹开关 + 文件行：读／复制路径／两步删）+ 动作行里的「归档附件」 |
| `src/client/requirement/panel.module.css` | 584（+202） | 18 个新类名，逐个核过与共享表及其余八格都不重名 |
| `src/client/locales.ts` | 1308（+55） | 23 个 `requirement.*` 键，zh/en 双写 |
| `src/index.ts` | 448（+4） | 导出字节层类型与 `requirement-files.ts` 的纯函数 |

配套测试 **+63 条**，两个新文件：

| 文件 | 条数 | 内容 |
|---|---|---|
| `tests/requirement-files.spec.ts` | 18（新） | 三条纯规则：扩展名的三类拒绝话术各不相同、GBK 字节真按 GBK 读（给的是 GBK 字节本身，不是 utf-8 重编码）、**第一行就超过额度时按字符硬切**（一行 JSON／压缩过的 js／SQL 导出都会走这条路，回「它没有文本」是唯一没用的答案） |
| `tests/request.client.spec.ts` | 3（新） | 上传那条路的**协议**：方法与 URL、`x-yon-file-name` 必须是 URL 编码、body 就是那个 `File`（不能先读成字符串）、不冒充 JSON 类型；以及失败与 JSON 调用同一种报法。宿主那一侧收的就是这个头，两边各自钉住自己那一半 |
| `tests/requirement-panel.client.spec.tsx` | 22（+7） | 三个文件夹带数（空目录也露脸）、切文件夹**不发第二次请求**、预测读不了的没有「读」按钮、读出来命名编码并可收起、复制完整路径、两步删附件、归档进 `user/` 并把改名说出来、附件清单读不出来**不拖垮这一条条目** |
| 其余四个宿主 spec | 150 条中 +35 | `requirement-store` / `requirement-service` / `requirement-tools` / `http-requirements` 的附件用例 |

全量 **58 文件 / 903 条通过**（批 3 后是 56 / 840）；`npm run typecheck` 0 错；`npm run build` 出 `lib/client.js` **539.28 kB**（批 3 是 513.11 kB，+26.17 kB 全是附件那一块）；`npm run verify` 通过（`verify` 的五项断言一条没改——附件进的是**库根** `~/.dsh/yon-panel/requirements/`，与「凭据绝不进发布物」那条红线不搭界）。

落地时偏离初稿的七处：

1. **上传走原始字节 + 一个 URL 编码的文件名头**，不是 base64 塞进 JSON（§十五 已写实）。50 MB 与 1 MB 是两把尺，混用一把就是给所有路由一起抬杆。
2. **多了第四条路由 `DELETE .../files/<name>`**（§十五 已补）：§十二 的矩阵里人对三个目录是读写，面板上没有这条就删不掉放错的文件。
3. **`?dir=` 成为读、写、删三条路由的显式参数**，默认 `user`（§十五 已补）：三个目录里可能有同名文件，不说清是哪一个就是猜。
4. **50 MB 超限只拒绝，没有自动登记一条引用**（§十九.3 的后半条仍未做）。理由：登记引用要写进 `entry.md`，那是**模型的正文**，宿主替模型写一句话等于把「谁说的」搅浑。拒绝时那句里已经说清「超了多少、请你自己登记或压缩」。§十九.3 留待决定。
5. **遮密钥只做在模型侧的工具上，不做在服务返回值上**：面板画的是**使用者自己的文件**，遮住等于让他看不见自己的东西；需要遮的是「文本进入模型上下文」那个边界（与 `ncc_home_read` 同一立场）。所以 `requirement_file_read` 过 `redactSecrets` 并回一句「哪些键已遮」，`fileRead` 原样给。
6. **「打开」退成「复制路径」**（§十六 批 4 出入第 1 条）。
7. **客户端那一份 `sizeText` 与宿主的 `sizeOf` 是两份实现，这是有意的**：`requirement-files.ts` import 了 `node:fs`，从客户端引它会把文件系统拖进浏览器产物。已核过产物：`lib/client.js` 里 `node:fs` / `node:path` 只出现在这一条注释里，没有真的引用。

批 4 **未做实测的一项**（不在本批验收范围内，如实记下）：**真宿主里点开文件选择器**（§二十.6）。本批只做到单测 + typecheck + build + verify；`<input type="file">` 这条路按浏览器的标准做法实现，而本仓的宿主能力里**没有文件选择器**（只有目录选择器），所以它是这一批唯一一处「写得出、但没在真宿主里点过」的东西。另外三项实测也仍然挂着：450px 里四块内容的手感（§二十.3）、真机走一遍（§二十 批 3 那条）、50 MB 归档的耗时（§二十.5）。


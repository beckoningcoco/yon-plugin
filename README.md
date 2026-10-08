# dsh-plugin-yon-panel

DSH（DeepSeek Harness）Web GUI 的 **Yon 按钮面板** 插件，带一个**项目存储**。

| 半边 | 做什么 |
|---|---|
| 浏览器半 | 侧栏底部、设置按钮**上方**一个 `Y` 图标 → 点开是按钮面板，里面十个内建格子：**项目管理**、**技能**、**数据源**、**知识库**、**消化检查**、**Home 管理**、**迭代**、**浏览器**、**需求**、**记忆**；面板里的按钮由任意插件通过 `yon.panel.item` 席位贡献 |
| Host 半 | 「项目」存储（主表 + 动态字段子表），以三种方式对外开放：`ctx.yonProjects` 服务（同进程插件）、`project_*` agent 工具（在对话里说人话改配置）、`/yon/api` HTTP 路由（任何前端） |
| Host 半 | 插件**自带技能**：`skills/*/SKILL.md` 在构建时内联，插件挂载时注册进 DSH 的技能目录，**卸载时自动消失**；开关存在 `yon_skills` 领域里 |
| Host 半 | **需求条目库**：某个项目下「要做的事」一条条记下来，连同使用者给的资料、模型生成的方案与补丁。以 `ctx.yonRequirements` + 9 个 `requirement_*` 工具 + `/yon/api` 三种方式对外开放；每条是 `~/.dsh/yon-panel/requirements/` 下的一个目录 |
| Host 半 | **项目记忆**：某个项目上已经摸出来的坑、环境事实、决定与偏好，给下一个会话用。4 个 `memory_*` 工具；模型可写可改、**不能删**；`project_read` 的返回值里会自动带上这个项目最近的五条。面板（侧栏第 10 格「记忆」）能浏览、按类型与项目筛选、读全文与删除 |

**安装不需要改动 DSH 仓库**：UI 占用 ui-sidebar 已声明的 `sidebar.footer.action` 席位，数据落在 DSH 自带的 storage 子系统上。

## 安装

前提：本机已装 DSH（命令行里有 `dsh`，或从源码 checkout 用 `pnpm dsh`）。

```sh
# 从 git 安装（本仓库已提交构建产物 lib/，无需任何构建授权）
dsh plugin --profile web add github:beckoningcoco/yon-plugin
dsh --profile web

# 或者 npm / tarball
dsh plugin --profile web add dsh-plugin-yon-panel
pnpm pack && dsh plugin --profile web add ./dsh-plugin-yon-panel-0.1.0.tgz

# 卸载
dsh plugin --profile web remove dsh-plugin-yon-panel
```

装完启动，侧栏底部（设置按钮上方）出现 `Y` 图标。

> ⚠️ **不要手动再往 profile 的 `cordis.patch.yml` 里写一遍这个插件行。**
> `dsh plugin add` 已经把包写进 `dsh.profile.bundles`，插件行由那一层提供；profile 的 patch 层再 `insert`
> 一次同一个 `id`，**冷启动会直接失败**：
> `failed to apply loader entry include: duplicate loader entry id: yon-panel`。
> 阴险之处在于：运行中的热重载会按 `id` 去重，所以这个错误在服务器跑着的时候完全看不出来，
> 直到你下一次重启才发现。需要"不重启就挂上"时，请另起一个独立 profile/端口的实例验证，别动生产 profile 的 patch 层。

## 项目存储（Host 半）

### 表设计：主表 + 子表

```
projects        主表：列表与下拉菜单只读它
  key   = projectId (uuid)
  value = { name, code, status, archived, createdAt, updatedAt }

project_fields  子表：动态字段，一行一个
  key   = <projectId>_<编码后的字段名>
  value = { projectId, fieldKey, value, updatedAt }
```

- **加/删字段 = 加/删一行**，主表结构不动，所以永远不需要迁移
- 改不同字段是**各自独立的一次原子写** → 两个功能同时编辑同一个项目的不同字段不会互相覆盖
- 列表/下拉只读主表（`fieldCount` 由一次遍历算出），不会因为动态字段膨胀而变慢

> ⚠️ **记录键必须路径安全**（`^[a-zA-Z0-9_-]+$`）：`per-record` 介质把每条记录存成一个文件，键就是文件名。中文、斜杠、点、空格在字段名里都合法，在键里都非法 —— 所以字段名会按字节编码（`环境信息new` → `_e7_8e_af_e5_a2_83_e4_bf_a1_e6_81_afnew`）。字段名本身存在记录里，**键从不被解码**，因此键只是唯一标识，语义一律从记录读。

### HTTP API

所有路径以 `/yon/api` 开头（前缀路由，同源即可调用）：

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/yon/api/projects?archived=1` | 项目列表（主表；默认不含已归档） |
| `POST` | `/yon/api/projects` | 新建 `{ name, code?, status?, fields? }` |
| `GET` | `/yon/api/projects/<id>` | 详情（含动态字段） |
| `PATCH` | `/yon/api/projects/<id>` | 改名 / 编码 / 状态 / 归档 |
| `DELETE` | `/yon/api/projects/<id>` | 删除项目并级联删除它的字段行 |
| `POST` | `/yon/api/projects/<id>/archive` | 软删除 / 恢复（`{ archived }`，缺省 `true`） |
| `PUT` | `/yon/api/projects/<id>/fields/<字段名>` | 写一个动态字段 `{ value }` |
| `DELETE` | `/yon/api/projects/<id>/fields/<字段名>` | 删一个动态字段 |
| `GET` | `/yon/api/skills` | 技能列表：本插件自带的在前、你自己的在后，另带 `complete`（来源是否全部读到） |
| `GET` | `/yon/api/skills/<技能名>` | 一个技能，含正文 |
| `PATCH` | `/yon/api/skills/<技能名>` | 开关本插件自带的某个技能 `{ enabled }` |

字段名走 URL 段，需要 `encodeURIComponent`（中文/斜杠都没问题）。

> ⚠️ `PATCH /yon/api/skills/<技能名>` **只接受本插件自带的技能名**，其它名字一律 404。这条路由无法用来改动你自己技能目录里的任何东西。

### 同进程引用（给其他插件）

```ts
// 只读（比如做一个「项目下拉菜单」）
export const inject = ['yonProjects']

const projects = ctx.yonProjects.list()          // 主表：快、够下拉用
const detail = ctx.yonProjects.get(id)           // 含动态字段
const stop = ctx.yonProjects.subscribe(() => {   // 变更通知（来自 domain/changed）
  // 重新读 list()/get()
})
```

写入同理：`create` / `update` / `setField` / `removeField` / `remove`。

技能服务同理：

```ts
export const inject = ['yonSkills']

const { skills, complete } = await ctx.yonSkills.list()  // 自带技能在前，自己的在后
await ctx.yonSkills.setEnabled('yon-devkit', false)      // 只对本插件自带的技能有效，其余抛 not-found
const detail = await ctx.yonSkills.read('yon-devkit')    // 含正文
```

### 数据落在哪、用什么介质

默认走 DSH 自带的 `json` 后端 → `$DSH_HOME/storages/yon_projects/{projects,project_fields}/*.json`。

想要 **SQLite 介质**：在 profile 里挂 `@deepseek-ai/dsh-storage-sqlite` 并把本领域路由指过去即可，**插件代码不用改**（介质由部署方选，见 DSH 的 storage 子系统文档）。

不走存储领域的三个域落在 `~/.dsh/yon-panel/` 下 —— 这个目录在**重装插件之后还在**，这是它们放在这里而不是插件目录里的理由：

| 是什么 | 落在哪 | 形态 |
|---|---|---|
| 需求条目 | `requirements/` | `index.json`（目录卡）+ 每条一个目录：`entry.md` + `user/` `generated/` `patches/` |
| 项目记忆 | `memory/` | `index.json` + 每条一个 `<id>.md`（frontmatter + 正文，人和 `git diff` 都能读） |
| 迭代表板 | `iteration.json` | 一个 JSON 文档 |

**记忆库的索引是缓存，文件才是真相。** `memory_read` 与 `memory_recall` 都从 `.md` 读；索引只服务注入路径——`project_read` 不能为了带一行标题去开五个文件。所以手工编辑一个 `.md` 是允许的用法（下一次 `memory_read` 就看到你的改动），索引因此落后只会**少给**一条，不会给错一条；重建索引是 `memory_sweep` 的事（P2）。

### 让 Agent 帮你管配置（模型工具）

Host 半把这份存储同时注册成 **agent 工具**，所以你可以直接在对话里说人话：

> 把「用友 NCC 客开」的环境信息改成 10.0.0.9
> 给「用友 NCC 客开」加一个字段：负责人 = 张三
> 新建一个项目叫「BIP 旗舰版客开」，编码 BIP-1
> 把「旧项目」删掉

注册的工具：

| 工具 | 作用 | 会不会丢东西 |
|---|---|---|
| `project_list` | 列出项目（可按关键词过滤、可含已归档） | 不会 |
| `project_read` | 读一个项目及其全部字段（改之前模型必须先读） | 不会 |
| `project_create` | 新建项目，可带初始字段 | 不会（只新增） |
| `project_update` | 改名 / 改编码 / 改状态 / 写字段 | 不会（结果里会列出改了什么） |
| `project_update`，带 `remove_fields` 或 `archived` | 删字段 / 归档 / 恢复 | **会** |
| `project_delete` | 彻底删除项目及其全部字段 | **会** |

在需要确认的档位下，**破坏性的写入会先停下来等你确认**，而且确认时给你的不是「即将执行 project_update」，而是**改动清单**：

```
修改项目「用友 NCC 客开」：
· 状态：进行中 → 已暂停
· 字段「环境信息」：「10.0.0.1」→「10.0.0.9」
· 删除字段「旧字段」（原值 x）
```

没批准就不会落库 —— 这一步走的是框架自己的审批闸门（`tools/pre-execute` 返回 `{kind:'ask'}`），除了「允许一次」以外的任何回答都按拒绝处理。一次调用确实没有改动时，预览会直说「项目「X」没有任何改动。」

**要不要确认，由会话的权限档决定** —— 插件只声明「这次调用会不会丢东西」，剩下的跟随你用 `/permission` 选的那一档：

| 会话权限档 | 只增改的写入 | 破坏性的写入（删字段 / 归档 / 删项目） |
|---|---|---|
| 仅可查看（`read-only`） | ⛔ 明确拒绝 | ⛔ 明确拒绝 |
| 工作区内修改（`workspace-write`，`approval: ask`） | ✅ 直接写入 | ✋ 先给你确认清单 |
| 完全权限（`danger-full-access`，`approval: never`） | ✅ 直接写入 | ✅ 直接写入 |

判断依据是会话日志里最新的 `sandbox/mode` 与 `approval/policy` 两个事件，也就是 `/permission` 切换的那两个旋钮。取不到时（工具被直接调用、调用没有 agent 上下文）按最保守的一档处理：破坏性写入先问。

想改成「任何写入都要确认」，把 `src/host/tools.ts` 里 `dispositionOf()` 的最后一行改成 `return 'ask'` 即可 —— 确认清单的代码已经在那儿了。

> ℹ️ 只读档下的写入会拿到一条明确的拒绝理由（「当前会话是「仅可查看」权限…」），而不是静默失败。

几个设计取舍：

- **解析自然语言的模型就是你在对话的那个模型**：提示词、模型选择、凭据、重试、会话记录全部由 DSH 的 agent loop 负责，插件只声明「能做什么」和「改之前给人看什么」，因此**不含任何模型客户端**，也不需要在插件里配置 API key。
- **项目可以用名字指代**：`project` 参数接受 id、名称或编码。名字撞车时它不猜，而是把候选列出来让人挑。
- **读工具不设闸门**，否则每次问「我有哪些项目」都得点一次批准。
- **参数校验在工具自己手里**：模型给的参数不合法（比如 `fields` 不是对象、项目名是空白）会被拒绝并回一条它能看懂的错误，而不是写进去半个记录。

> ⚠️ **需要重启 DSH**：工具是 host 半注册的，改完插件必须重启才生效（浏览器半只需要刷新页面）。

### 其余各域的工具

上面那 5 个 `project_*` 只是其中一个域。同一个闸门（判据只有一条：**这次调用会不会丢东西**）、同一份权限档表格，覆盖全部工具族：

| 工具族 | 干什么 | 会写到哪里 |
|---|---|---|
| `requirement_*`（9 个） | 需求条目库：建条目、追加标注、改名称与状态、作废、写方案文档与补丁、读条目内的附件。**创建与追加永不打断**（这是它有价值的前提），改名称、改状态、作废走审批，**没有删除工具**——真删只在面板里 | `~/.dsh/yon-panel/requirements/` |
| `memory_*`（4 个） | 项目记忆：`memory_write` 新建、`memory_update` 改写、`memory_recall` 检索、`memory_read` 读全文。新建不打断，**改写会拦**（它盖掉原来那段话），没有删除工具 | `~/.dsh/yon-panel/memory/` |
| `datasource_*` | 登记的环境数据库连接，以及执行 SQL 取真实数据 | `db_config.json` |
| `ncc_home_*` | 登记本机 NCC/BIP 安装目录（Home），按 id 列文件、按原编码读文件 | `home_config.json` |
| `ncc_meta_*` / `bip_meta_*` | 两条产品线的元数据：实体 / 表名 / 字段 / 枚举。**两条产品线互不相通**，问错一条只会答"没有" | 只读（索引是缓存） |
| `wiki_*` / `wiki_write` | 读实体知识库；写入分三种模式，**不能覆盖已有页** | Obsidian vault 目录 |
| `knowledge_*` / `ncc_class_search` / `doc_parse` / `ncc_gbk_edit` | 随包参考库、类名→jar 索引、Excel/PDF/Word 读取、GBK 源码读写 | 只有 `ncc_gbk_edit` 写，改的是 NCC 源码树 |
| `digest_*` | 素材消化的摸底与验收（只管计划与校验，真正落页的是 `wiki_write`） | `digest-log.jsonl` |
| `iteration_*`（2 个） | 插件自身短板的台账：模型**只能追加**，改状态、调优先级、删除都在面板里由人做 | `iteration.json` |

模型真正逐字读到的那段总纲在 `src/host/prompt.ts`（系统提示里的一节，**组数是写下来的**：新增一组工具就要同步改那段文字与它的测试）。上面这张表是给人看的。

### 插件自带技能

插件在 `skills/<名字>/SKILL.md` 里预制技能。构建时正文被**内联**进 `lib/host/skill-catalog.generated.js`，插件挂载时通过 `ctx.skills.register()` 注册进 DSH 的技能目录：

```
skills/yon-devkit/SKILL.md            ← 你编辑的源文件（普通技能 bundle，带 frontmatter）
        ↓  pnpm build（scripts/build-skills.mjs）
src/host/skill-catalog.generated.ts   ← 生成物，已提交，不要手改
        ↓  tsc
lib/host/skill-catalog.generated.js   ← 随包发布
        ↓  插件挂载时 ctx.skills.register()
当前会话的技能目录                     ← 出现在模型的技能列表和 /技能名 里
```

**为什么内联，而不是安装时写文件**：

- **卸载即消失，零残留**。技能是「随插件生命周期存在」的同进程值，从不落到你的技能目录里，所以不存在「删一半失败留下半个 bundle」这种事。注册返回的是 Cordis 的 effect disposer，插件卸载时自动注销并让技能目录缓存失效。
- **不用解析运行时路径**。运行时读文件，得先相对一个可能被 loader 从任意位置加载的 bundle 定位 `skills/`，而且在没有真实文件系统的部署上直接失败。
- **注册是同步的**，插件一挂载，技能目录就是完整的。

**优先级**（DSH 自己的规则，不是本插件定的，数字小者胜）：

| rank | 位置 | 来源 |
|---|---|---|
| 100 | `<git 根>/.dsh/skills` | project-dsh |
| 200 | `<git 根>/.agents/skills` | project-agents |
| 300 | `customSkillDirs` | custom |
| — | **本插件注册的运行时技能** | runtime |
| 400 | `~/.dsh/skills` | user-dsh |
| 500 | `~/.agents/skills` | user-agents |
| 600 | `$DSH_BUNDLED_SKILL_DIR` | bundled |

也就是说自带技能**压过你装在 `~/.agents/skills` 里的同名技能，但压不过某个项目仓库里 pin 住的版本**。本插件因此刻意只用新名字，不碰你现有的通用技能。

当前只带一个占位技能 `yon-devkit`（用友客开项目的配置入口，正文里划清了与 `ncc-dev` / `yonyou-bip-dev` 的分工）。

**开关**：`YONSKILL` 面板里可以单独停用某个自带技能，状态存在 `yon_skills` 领域（`$DSH_HOME/storages/yon_skills/skill_preferences/*.json`），下次启动按它决定注册哪些。停用只是不注册，不删任何东西。

> ⚠️ **需要重启 DSH**：技能由 host 半注册。改完 `skills/*.md` 要 `pnpm build` 并重启，只刷新页面不会重新注册。

## 按钮面板（浏览器半）

侧栏底部的 `Y` 图标点开是 280px 的小面板。面板内有十个内建格子（悬停显示名字）：

| 格子 | 名字 | 打开什么 |
|---|---|---|
| 文件夹图标 | 项目管理 | 项目列表 + 字段编辑 |
| 文档图标 | **YONSKILL** | 技能面板 |
| 其余八个 | 数据源 / 知识库 / 消化检查 / Home 管理 / 迭代 / 浏览器 / 需求 / 记忆 | 各自的面板 |

> 「浏览器」是**调试浏览器**（起一个带 `--remote-debugging-port` 的 Chrome/Edge/Firefox，交给 Playwright 之类的工具接管），
> 与上文「浏览器半」（插件跑在客户端的那半边）不是一回事。设计说明见 [`docs/yon-browser-design.md`](docs/yon-browser-design.md)。

### 项目管理界面怎么用

点开格子，弹出一个**原生对话框**（DSH 自己的 Modal：遮罩、Esc、右上角关闭、关闭后焦点回到格子），左右两栏：

| 操作 | 怎么做 |
|---|---|
| 新建项目 | 左栏顶部「+ 新建项目」→ 弹出小对话框，填名称（必填）+ 编码（可留空）→「创建」；建好自动选中并滚动到它 |
| 选项目 | 点左栏一行；也能用 ↑/↓ 在列表里走 |
| 找项目 | 项目到 8 个以上时左栏顶部出现搜索框（按名称或编码过滤） |
| 改名 / 改编码 | 点标题或编码文字就地编辑：回车或失焦保存，Esc 放弃 |
| 改状态 | 标题下方的「进行中 / 已暂停 / 已完成」三个胶囊，点一下就切 |
| 看字段值 | 值默认**是一段文字**（不是输入框）：长的整段换行显示，看得全。结构化值（对象、数组，或本身就是 JSON 文本的那种）读成**键值列表**，键一列值一列；嵌套深过一层才退回缩进的 JSON |
| 改字段值 | **点一下值**才变成输入框（整行宽、跟着内容长高）：**失焦即存**（回车等于失焦），Esc 放弃。每行右侧自己显示「保存中…／已保存／未保存，点这里重试」，某一行失败**不会**锁住别的行（失败的那行会把输入框连同原文一起摊开，重试就是「再存这段」） |
| 复制字段值 | 字段行右侧的复制图标：把该字段**存着的那一串**放进剪贴板（编辑中未保存的文本也能复制；键值列表虽然读成列表，复制的仍是原来那串 JSON），按钮自己报「已复制／复制失败」；空值不可复制 |
| 加字段 | 「字段」标题右侧「+ 新增字段」→ 出现一行，填字段名 + 值 →「添加」（回车也行），可连着加 |
| 删字段 | 字段行右侧 `×` → 小对话框确认 |
| 归档 / 恢复 | 右栏「归档」；归档后默认列表里不再出现，勾上「显示已归档」能找回来 |
| 彻底删除 | 右栏「彻底删除」→ **风险确认对话框**：勾选「我了解此操作无法撤销」后才能点「确认删除」（连同它的全部字段行） |
| 关闭 | 右上角 ×、点遮罩、或按 Esc |

层的顺序是有讲究的：**一次 Esc 只关最上面那一层**。打开「新建项目」或风险确认时，Esc 关的是那个对话框，而不是它下面的项目界面；项目界面开着时，Esc 也不会顺手把侧栏小面板一起关掉（面板在这期间暂停响应 Esc 与点外关闭）。

几个产品层面的决定：

- **输入法安全**：所有「回车提交」的位置都做了 composition 保护 —— 中文拼音选词按的回车不会被当成提交（否则会把「环境信」这种半成品写成字段名）。
- **值只有在看起来是结构化 JSON 时才按 JSON 存**（`{...}` / `[...]` / `true` / `false` / `null`），其余一律存文本 —— 否则 `13800138000` 会被当数字、18 位订单号会被静默截断精度。
- **读法与写法是两种样子**：读到的是文字（或键值列表），点开才成为输入框 —— 常驻的单行框把长值的尾巴藏在框里（真实 store 里一格能有 240 字）。编辑永远从**存着的那串原文**开始，「点开又没改」不会产生一次写。
- **能用原生原子就用**：按钮、输入框、对话框、风险确认、胶囊都来自 `@deepseek-ai/dsh-client-ui-primitives`（页面模块表提供的那一份：零体积、与宿主同一实现），颜色一律走主题 token。
- **危险操作按风险分级**：删字段是局部小影响 → 小对话框确认；删项目不可逆 → 勾选式风险确认。
- **组件不取数、不订阅**：`createProjectApi()` 在 `apply` 里建一次，通过条目的 inject face 投影进组件，组件拿到的是一组回调 —— 所以组件测试可以完全脱开 host 跑。

### 技能面板（YONSKILL）怎么用

同样是原生对话框，左右两栏，技能按来源**分成两组**：

| 操作 | 怎么做 |
|---|---|
| 看技能 | 点左栏一行；↑/↓ 也能走；技能到 8 个以上时出现搜索框（按名字或描述过滤） |
| 看用途 | 右栏显示描述、触发时机（有的话）、来源 |
| 看正文 | 右栏底部是技能正文原文（等宽、可滚动） |
| 开关自带技能 | 「插件提供」组里的技能，右栏有「停用 / 启用」按钮；停用的行变暗并标「已停用」 |
| 关闭 | 右上角 ×、点遮罩、或按 Esc |

两组的分工是**强制**的，不只是文案：

- **插件提供**：插件自带（`source = yon-panel`），可以停用 / 启用。
- **其他全局技能**：任何**部署级**注册的技能，面板**只读**。host 侧的 `PATCH /yon/api/skills/<名字>` 只接受本插件自带的技能名，别的名字一律 404 —— 所以就算将来前端写错，也动不了别的技能。

> ℹ️ **为什么看不见 `~/.agents/skills` 里那 15 个技能？** 这不是漏做，是 DSH 的层次设计。`skill` 注册表是 host + per-scope 分层的：**部署级** provider（repository 插件、本插件注册的技能）进 **global 层**，而磁盘发现（`skill-filesystem`）由**每个 agent 预设各自挂载**、进那个预设的层；会话读的是「global + 自己作用域链」的合并结果。面板走 HTTP、背后没有会话，命名不出某个 agent 的作用域，所以只能读 global 层。DSH 自己的 bundle patch 也把「repository plugins 注册进 global 层」写成这个结构的预期用法。
>
> 换句话说：**这个面板管的是「插件给你装了什么」，不是「这个会话现在能用什么」**。后者本来就该按会话问 —— 直接 `/技能名`，或让模型用 `skill` 工具。

给面板加按钮（本插件不用改）：

```ts
ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
  name: 'yon.panel.item',
  id: 'my-feature',
  order: 100,
}, MyButton))
```

## 开发

```sh
pnpm install
pnpm typecheck   # tsc --noEmit（host + client + tests）
pnpm test        # vitest（699 个用例 / 50 个文件）
pnpm build       # 先把 skills/*.md 内联成 TS，再 tsc 出 host 半，最后 tsdown 出浏览器半
pnpm verify      # 产物自检（loader 契约、externals、样式注入、host ESM、patch 层、技能目录）
pnpm pack        # 打包，prepack 会先 build
```

构建是**分工**的，两边原因不同：

| 半边 | 用什么构建 | 为什么 |
|---|---|---|
| Host | `tsc -p tsconfig.lib.json` | Node 直接加载 ESM；相对导入被重写成 `.js`，裸包保持真实 import（由本包依赖解析）。用打包器反而会让 DSH 进程拿到第二份 storage-domain |
| 浏览器 | `tsdown` | 必须产出 loader 的 lazy-CJS factory（`window.__ModuleLoader__.load`），并把 CSS Modules 编译后注入 `<style>` |

- **host 半改动需要重启 DSH 才生效**（client 半能靠 HMR 热更）
- `src/shared/types.ts` 是两半共用的数据契约，前后端不会漂移
- 基线 externals 名单抄自 harness 的 `@deepseek-ai/dsh-client-web/src/platform.ts`；升级 DSH 大版本时对照一次
- **构建是可复现的**：CSS Module 的类名映射按名排序输出，所以提交的 `lib/` 与重新构建的结果逐字节一致（lightningcss 自己给出的导出顺序会变，排序就是为了消掉这个假差异）。这一点可以自己验：跑完 `pnpm build` 之后 `git status` 应该是干净的
- **技能正文由 codegen 内联**：`pnpm build` 会先跑 `scripts/build-skills.mjs`，把 `skills/<名字>/SKILL.md` 的前言与正文写进 `src/host/skill-catalog.generated.ts`（已提交）。`pnpm verify` 用 `--check` 抓漂移 —— 改了 `SKILL.md` 却忘了重新生成，会在这一步失败，而不是悄悄发布旧内容
- **改界面**：预览出图（`preview/render.spec.tsx` + `preview/shots.mjs`）只做校验，**不产出可运行产物**；要让界面真的变，必须 `pnpm build`。面板 UI 的优化结论、陷阱清单与验收步骤见 `docs/yon-panel-ui-design.md`

### 为什么 `lib/` 被提交进 git

`dsh plugin add github:...` 拿到的是**源码而非构建产物**，而 pnpm ≥10 默认拒绝执行依赖的构建脚本。把 `lib/` 一起提交，使用者无需任何构建授权。改完源码记得 `pnpm build` 并提交 `lib/`。

## 已知限制

- **agent 工具依赖部署**：模型那一步由 DSH 的 agent loop 负责，所以所在 profile 需要有 `tools` 服务与可用的模型凭据。缺凭据的环境（例如没配 key 的 `headless` profile）里界面照常可用，但"说人话改配置"这条路径走不通
- **字段名不能改名**：字段名就是这条记录的身份键，改名等于「写新键 + 删旧键」两次写，中途失败会留下两个字段。要改就删掉重建
- **删除没有撤销**：归档可以恢复，删字段/删项目不行。界面里的删除有小对话框 / 风险确认；agent 工具的删除是否确认取决于会话权限档（见上文）——**完全权限档下会直接删掉，不再询问**
- **值只能手输**：没有类型选择器或富编辑，结构化值要自己写 JSON 文本
- **无跨记录事务**：原子性单位是一条记录。`create({ name, fields })` 是「主表 1 写 + 子表 N 写」，中途失败可能留下缺字段的项目（字段缺失可容忍，界面显示为空）
- **领域版本不是迁移器**：改主表 schema 后旧记录会被校验拒绝、导致领域打不开；演进时请升 `version` 并把旧记录缺的字段声明为 optional
- **无二级索引**：按字段筛选/排序只能在应用层做（数据全量在内存；这类需求出现时说明该字段该「转正」成主表列，或改用 SQLite 关系表）
- **自带技能只在装了插件的 profile 里存在**：它们是运行时注册的，所以换个没装插件的 profile、或用别的工具（Claude Code 等）读 `~/.agents/skills`，都看不到它们 —— 这正是「不跟通用技能混在一起」的代价
- **技能名撞车是静默的**：DSH 的规则是运行时技能压过用户在 `~/.agents/skills` 里的同名技能，被压掉的那份不报错、也不出现在技能列表里。本插件因此只用全新名字（当前只有 `yon-devkit`）
- **技能面板只列部署级技能**：`~/.agents/skills` 里的技能由 DSH 的 agent 预设按会话挂载（进 preset 的作用域层），面板没有会话上下文、命名不出该作用域，因此不列出它们。这是 DSH 的分层设计而非缺陷（详见上文「技能面板怎么用」）
- **技能改动要重启**：`skills/*.md` 属于 host 半数据，改完必须 `pnpm build` + 重启 DSH（刷新页面不够）
- **需求条目与项目记忆都没有删除工具**：模型能建、能改、能追加，删不了。真删只在面板里由人做（需求面板已有；记忆面板排 P1）。这是刻意的——一个能自己删记录的模型，很快就不再是「帮你记事的那一方」
- **项目记忆没有「已验证 / 已过期」这类状态**：记忆说的是**当前事实**，不是「某年某月谁说的」。不成立就用 `memory_update` 改正、或让人删掉，库里只留当前成立的结论。所以**别指望从状态上看出哪条可信**——`source`（出处）是唯一线索，也是写入时的必填项
- **记忆的注入一次会话只给一次，每个项目最多五条**：同一段文字在上下文里重复六遍，模型会学着跳过去，那正好毁掉这段文字存在的理由。要看更多用 `memory_recall`，要读全文用 `memory_read`
- **记忆面板只能看与删**：面板上没有「新建」按钮，也没有编辑框，这是有意的——记忆是模型查出来的事实，凭印象填一条会被下一个会话当成事实用。想让库里多一条，在对话里让模型记；想改一条，也让它改（改会走审批）

## 源码地图

十个面板，每个的形状都一样：`src/client/<X>Item.tsx` 一个内建条目、`src/client/<X>/` 一组界面文件、
`src/host/<X>-*.ts` 一组 host 模块。下面按这层结构列 —— 想找某个文件时，`find src/client src/host -type f` 仍是权威。

### 基础层（十个面板共用）

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 入口：打开各领域、发布服务、注册自带技能、挂 `/yon/api` |
| `src/host/tools.ts` | 工具注册表，以及跟随会话权限档的写操作闸门（拒绝 / 直写 / 确认） |
| `src/host/http.ts` | `/yon/api` 全部路由与错误映射（没有 web server 的部署下不挂载） |
| `src/host/prompt.ts` | 注入给模型的工具说明。**组数是写下来的**，新增一组工具要同步改 |
| `src/shared/types.ts` | 前后端共用的数据契约 |
| `src/client/index.ts` | 浏览器半入口：席位注册、面板 store、**十个**内建条目、API 客户端注入面 |
| `src/client/YonPanelRoot.tsx` | 侧栏底部触发按钮、面板外壳、分层后的关闭行为 |
| `src/client/panel-store.ts` | 面板开合状态 + 覆盖层层数（一次 Esc 只关一层） |
| `src/client/panel.module.css` / `panel-item.module.css` | 十个面板共用的对话框样式 / 十个内建格共用的图标格样式 |
| `src/client/request.ts` | 各 API 客户端共用的 `/yon/api` JSON 调用与错误类型 |
| `src/client/slots.ts` / `locales.ts` / `cn.ts` / `item-rows.ts` | 席位与 inject face 类型 / 词典（**zh 与 en 两份**）/ 类名拼接 / 条目行 |
| `scripts/build-skills.mjs` | 把 `skills/*/SKILL.md` 内联成 TS；`--check` 用来抓漂移 |
| `skills/<名字>/SKILL.md` | 插件自带技能的**源文件**（普通技能 bundle，你编辑这个） |

### 十个面板

| 面板 | 界面（`src/client/`） | host 半（`src/host/`） | 职责 |
|---|---|---|---|
| 项目 `project` | `project/{ProjectManager,FieldTable,InlineText,CreateProjectDialog}.tsx`、`useComposing.ts`、`api.ts` | `domain.ts`、`service.ts` | 项目与动态字段：主子表聚合、级联删除、写入校验、按 id/名称/编码定位；`tools.ts` 另有 5 个 `project_*` 工具 |
| 技能 `skill` | `skill/{SkillManager.tsx,api.ts}` | `skill-domain.ts`、`skill-registry.ts`、`skill-catalog.ts`、`skill-catalog.generated.ts` | 自带技能的注册 / 注销 / 开关；`.generated.ts` 是**生成物**（已提交、勿手改） |
| 数据源 `datasource` | `datasource/{DataSourceManager.tsx,api.ts,panel.module.css}` | `datasource-store.ts`、`datasource-service.ts`、`datasource-probe.ts`、`datasource-catalog.ts`、`datasource-tools.ts` | 数据源登记与 SQL 取数：探测交给随包的脚本跑，密码只以 `hasPassword` 进视图 |
| 安装目录 `home` | `home/{HomeManager.tsx,api.ts,panel.module.css}` | `home-store.ts`、`home-probe.ts`、`home-mirror.ts`、`home-service.ts`、`home-tools.ts`、`home-files.ts` | 登记本机 NCC/BIP Home，探测它是什么（不打开 jar）、镜像回技能侧；`home-files.ts` 管包含性检查、编码与凭据打码 |
| 知识库 `wiki` | `wiki/{WikiManager.tsx,api.ts,panel.module.css}` | `wiki-store.ts`、`wiki-index.ts`、`wiki-graph.ts`、`wiki-usage.ts`、`wiki-service.ts`、`wiki-tools.ts`、`wiki-write.ts` | 页与页之间的引用图、被问过什么 / 答不上什么的日志。两条写入路径互不相干：**页**走 `wiki-write.ts`（三种模式，不能覆盖已有页），**登记**（`wiki-service.ts` 的 `saveVault`/`removeVault`，面板的三个动词）只改 `wiki_config.json`，不写页也不在 vault 里删东西 |
| 消化 `digest` | `digest/{DigestManager.tsx,api.ts,panel.module.css}` | `digest-log.ts`、`digest-audit.ts`、`digest-plan.ts`、`digest-sweep.ts`、`digest-config.ts`、`digest-tools.ts` | 判断一份「源素材 → 知识页」消化得够不够：配置阈值与词表、批量按源文档分组验收、每次验收留一条流水 |
| 迭代 `iteration` | `iteration/{IterationManager.tsx,api.ts,panel.module.css}` | `iteration-store.ts`、`iteration-service.ts`、`iteration-tools.ts` | 模型在使用这套插件时记下的短板（能力不足 / 优化建议）与使用者的处理（状态 / 优先级 / 删除）。模型**只能追加**（`iteration_add` / `iteration_list`，没有改与删的工具），改状态、调优先级、删除都在面板里由人做；台账在 `~/.dsh/yon-panel/iteration.json`。设计记录见 `docs/yon-iteration-design.md` |
| 浏览器 `browser` | `browser/{BrowserManager.tsx,api.ts,panel.module.css}` | `browser-scan.ts`、`browser-store.ts`、`browser-system.ts`、`browser-service.ts` | **调试浏览器**：扫一遍本机（Chrome / Edge / Chromium / Firefox）并记住路径，填端口点「启动」起一个带调试端口的浏览器，面板报出连接地址，能停掉**本面板起过**的实例。全仓唯一一处 `node:child_process`（进程必须活过这次调用并活过 DSH 重启），也是唯一会结束进程的面板；登记在 `~/.dsh/yon-panel/browser_config.json`、台账在 `browser_runs.json`，用户数据目录默认在插件根目录的 `.browser-profile/<id>/`。设计记录见 `docs/yon-browser-design.md` |
| 需求 `requirement` | `requirement/{RequirementManager.tsx,api.ts,panel.module.css}` | `requirement-doc.ts`、`requirement-store.ts`、`requirement-files.ts`、`requirement-service.ts`、`requirement-tools.ts` | 某个项目下「要做的事」：名称 / 状态 / 正文 + 一段段追加的标注（删除线即历史，模型读到的是去掉删除线的那份）+ 三个文件夹（`user/` 使用者给的原件、`generated/` 模型的方案、`patches/` 补丁）。**正文只放使用者要什么，模型探查出来的进标注**——这条分界只有提示词那一段守得住。设计记录见 `docs/yon-requirement-design.md` |
| 记忆 `memory` | `memory/{MemoryManager.tsx,api.ts,panel.module.css}` | `memory-doc.ts`、`memory-store.ts`、`memory-service.ts`、`memory-tools.ts` | **项目记忆**：某个项目上已经摸出来的坑、环境事实、决定与偏好，由模型写、下一个会话自动带回来。这一屏与其余九格**相反：只有看与删**，没有新建也没有修改——记忆是「某人查出来的事实」，做成一张表填写就等于允许凭印象编一条，而库里每一条都会被注入到下一个会话里当成事实用。行上给类型徽标、标题、项目与日期，展开读全文（正文、出处、id），删除要两次点击。设计记录见 `docs/yon-memory-design.md` |

### 不属于任何面板的读取层

| 文件 | 职责 |
|---|---|
| `src/host/class-index.ts` / `class-tools.ts` | 类索引：走一遍安装目录、从每个 `.jar` 里读类名，然后按类名查它在哪个 jar |
| `src/host/meta-bmf.ts` / `meta-index.ts` / `meta-service.ts` / `meta-tools.ts` | NCC 元数据：把 `modules/*/METADATA/*.bmf` 压平成可查的索引 |
| `src/host/bip-meta.ts` / `bip-meta-tools.ts` | 旗舰版元数据：解析随包的快照，进程内缓存，不建索引 |
| `src/host/knowledge-tools.ts` | 随包参考文档的检索 |
| `src/host/gbk-tool.ts` | GBK 源码文件的读与改 |

### 项目记忆的落盘层（第十格背后）

| 文件 | 职责 |
|---|---|
| `src/host/memory-doc.ts` | 一条记忆的文本层：frontmatter 与正文的解析 / 序列化。纯函数，无文件系统、无时钟 |
| `src/host/memory-store.ts` | `memory/` 的磁盘层：`index.json` + 每条一个 `<id>.md`。原子写、`isSafeId` 门、坏记录跳过而不是让整份索引读不出来 |
| `src/host/memory-service.ts` | id 生成（`mem-<本地日期>-<本地时分秒>-<随机>`）、字段校验、项目解析、同项目同标题去重、读改写队列、删除 |
| `src/host/memory-tools.ts` | `memory_write` / `memory_update` / `memory_recall` / `memory_read` |
| `src/host/tools.ts`（改动） | `project_read` 的返回值里带上这个项目最近的五条（只给标题与 id，一次会话一次）；`isDestructiveWrite` 认 `memory_update` |
| `scripts/verify-memory-live.mjs` | 实机验证：跑编译产物走一遍完整闭环，并把产出的一份 `.md` 打印出来（形态错了要在这儿看得见） |

**面板不做写**：写入与改写都在上面这四个 host 模块的模型工具里，面板只有 `list` / `read` / `remove` 三个调用（`GET` 与 `DELETE`，没有 `POST` 也没有 `PATCH`）。这条不对称是本功能的设计，不是还没做完——`memory-panel.client.spec.tsx` 与 `http-memory.spec.ts` 各有一条用例盯着它。详见 [`docs/yon-memory-design.md`](docs/yon-memory-design.md)。

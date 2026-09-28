# dsh-plugin-yon-panel

DSH（DeepSeek Harness）Web GUI 的 **Yon 按钮面板** 插件，带一个**项目存储**。

| 半边 | 做什么 |
|---|---|
| 浏览器半 | 侧栏底部、设置按钮**上方**一个 `Y` 图标 → 点开是按钮面板，里面两个内建格子：**项目管理** 与 **YONSKILL**；面板里的按钮由任意插件通过 `yon.panel.item` 席位贡献 |
| Host 半 | 「项目」存储（主表 + 动态字段子表），以三种方式对外开放：`ctx.yonProjects` 服务（同进程插件）、`project_*` agent 工具（在对话里说人话改配置）、`/yon/api` HTTP 路由（任何前端） |
| Host 半 | 插件**自带技能**：`skills/*/SKILL.md` 在构建时内联，插件挂载时注册进 DSH 的技能目录，**卸载时自动消失**；开关存在 `yon_skills` 领域里 |

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

当前只带一个占位技能 `yon-devkit`（用友客开项目的配置入口，正文里划清了与 `yon-ncc-dev` / `yonyou-bip-dev` 的分工）。

**开关**：`YONSKILL` 面板里可以单独停用某个自带技能，状态存在 `yon_skills` 领域（`$DSH_HOME/storages/yon_skills/skill_preferences/*.json`），下次启动按它决定注册哪些。停用只是不注册，不删任何东西。

> ⚠️ **需要重启 DSH**：技能由 host 半注册。改完 `skills/*.md` 要 `pnpm build` 并重启，只刷新页面不会重新注册。

## 按钮面板（浏览器半）

侧栏底部的 `Y` 图标点开是 280px 的小面板。面板内有两个内建格子（悬停显示名字）：

| 格子 | 名字 | 打开什么 |
|---|---|---|
| 文件夹图标 | 项目管理 | 项目列表 + 字段编辑 |
| 文档图标 | **YONSKILL** | 技能面板 |

### 项目管理界面怎么用

点开格子，弹出一个**原生对话框**（DSH 自己的 Modal：遮罩、Esc、右上角关闭、关闭后焦点回到格子），左右两栏：

| 操作 | 怎么做 |
|---|---|
| 新建项目 | 左栏顶部「+ 新建项目」→ 弹出小对话框，填名称（必填）+ 编码（可留空）→「创建」；建好自动选中并滚动到它 |
| 选项目 | 点左栏一行；也能用 ↑/↓ 在列表里走 |
| 找项目 | 项目到 8 个以上时左栏顶部出现搜索框（按名称或编码过滤） |
| 改名 / 改编码 | 点标题或编码文字就地编辑：回车或失焦保存，Esc 放弃 |
| 改状态 | 标题下方的「进行中 / 已暂停 / 已完成」三个胶囊，点一下就切 |
| 改字段值 | 直接在右边输入框里改，**失焦即存**（回车等于失焦）。每行右侧自己显示「保存中…／已保存／未保存，点这里重试」，某一行失败**不会**锁住别的行 |
| 复制字段值 | 字段行右侧的复制图标：把该字段**当前显示的值**放进剪贴板（编辑中未保存的文本也能复制，所见即所复制），按钮自己报「已复制／复制失败」；空值不可复制 |
| 加字段 | 「字段」标题右侧「+ 新增字段」→ 出现一行，填字段名 + 值 →「添加」（回车也行），可连着加 |
| 删字段 | 字段行右侧 `×` → 小对话框确认 |
| 归档 / 恢复 | 右栏「归档」；归档后默认列表里不再出现，勾上「显示已归档」能找回来 |
| 彻底删除 | 右栏「彻底删除」→ **风险确认对话框**：勾选「我了解此操作无法撤销」后才能点「确认删除」（连同它的全部字段行） |
| 关闭 | 右上角 ×、点遮罩、或按 Esc |

层的顺序是有讲究的：**一次 Esc 只关最上面那一层**。打开「新建项目」或风险确认时，Esc 关的是那个对话框，而不是它下面的项目界面；项目界面开着时，Esc 也不会顺手把侧栏小面板一起关掉（面板在这期间暂停响应 Esc 与点外关闭）。

几个产品层面的决定：

- **输入法安全**：所有「回车提交」的位置都做了 composition 保护 —— 中文拼音选词按的回车不会被当成提交（否则会把「环境信」这种半成品写成字段名）。
- **值只有在看起来是结构化 JSON 时才按 JSON 存**（`{...}` / `[...]` / `true` / `false` / `null`），其余一律存文本 —— 否则 `13800138000` 会被当数字、18 位订单号会被静默截断精度。
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
pnpm test        # vitest（116 个用例）
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

## 源码地图

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 入口：打开两个领域、发布 `ctx.yonProjects` / `ctx.yonSkills`、注册自带技能、挂 `/yon/api` |
| `skills/<名字>/SKILL.md` | 插件自带技能的**源文件**（普通技能 bundle，你编辑这个） |
| `scripts/build-skills.mjs` | 把 `skills/*/SKILL.md` 内联成 TS；`--check` 用来抓漂移 |
| `src/host/domain.ts` | 项目领域与两张表的 zod schema、路径安全的记录键编码 |
| `src/host/service.ts` | 项目存储服务：主子表聚合、级联删除、写入校验、变更订阅、按 id/名称/编码定位 |
| `src/host/tools.ts` | 面向 agent 的工具：5 个 `project_*` 工具 + 跟随会话权限档的写操作闸门（拒绝 / 直写 / 确认） |
| `src/host/skill-domain.ts` | `yon_skills` 领域：一个技能一条开关记录 |
| `src/host/skill-registry.ts` | 自带技能的注册 / 注销 / 开关，以及 `ctx.skills` 的本地契约声明 |
| `src/host/skill-catalog.ts` | 自带技能的类型定义，以及「为什么内联」的说明 |
| `src/host/skill-catalog.generated.ts` | **生成物**（已提交、勿手改）：自带技能的名字 / 描述 / 正文 |
| `src/host/http.ts` | `/yon/api` 前缀路由（projects + skills）与错误映射（没有 web server 的部署下不挂载） |
| `src/shared/types.ts` | 前后端共用的数据契约（项目 + 技能） |
| `src/client/index.ts` | 浏览器半入口：席位注册、面板 store、两个内建条目、API 客户端的注入面 |
| `src/client/YonPanelRoot.tsx` | 侧栏底部触发按钮、面板外壳、分层后的关闭行为 |
| `src/client/panel-store.ts` | 面板开合状态 + 覆盖层层数（一次 Esc 只关一层） |
| `src/client/ProjectItem.tsx` | 内建的「项目管理」条目（图标格子 + 打开界面 + 焦点归还） |
| `src/client/SkillItem.tsx` | 内建的「YONSKILL」条目（同上，共用一套图标格样式） |
| `src/client/request.ts` | 两个 API 客户端共用的 `/yon/api` JSON 调用与错误类型 |
| `src/client/project/api.ts` | 项目接口的瘦封装：组件唯一的数据入口 |
| `src/client/skill/api.ts` | 技能接口的瘦封装 |
| `src/client/skill/SkillManager.tsx` | 技能面板：分组列表、正文阅读、只对自带技能开放开关 |
| `src/client/panel.module.css` | 两个面板共用的对话框样式（原 `project/panel.module.css`） |
| `src/client/panel-item.module.css` | 两个内建格子共用的图标格样式（原 `ProjectItem.module.css`） |
| `src/client/project/ProjectManager.tsx` | 项目界面：列表、搜索、属性编辑、危险操作分级 |
| `src/client/project/FieldTable.tsx` | 动态字段表：逐行保存状态、失败重试、删除确认 |
| `src/client/project/InlineText.tsx` | 就地可编辑文本（回车/失焦保存，Esc 放弃） |
| `src/client/project/CreateProjectDialog.tsx` | 新建项目对话框 |
| `src/client/project/useComposing.ts` | 输入法 composition 保护 |
| `src/client/cn.ts` | CSS 模块类名拼接（`noUncheckedIndexedAccess` 下的一次收窄） |
| `src/client/slots.ts` / `locales.ts` | 席位与 inject face 类型 / 词典 |

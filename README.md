# dsh-plugin-yon-panel

DSH（DeepSeek Harness）Web GUI 的 **yon_btn 按钮面板** 插件，带一个**项目存储**。

| 半边 | 做什么 |
|---|---|
| 浏览器半 | 侧栏底部、设置按钮**上方**一个 `Y` 图标 → 点开是按钮面板；面板里的按钮由任意插件通过 `yon.panel.item` 席位贡献 |
| Host 半 | 「项目」存储（主表 + 动态字段子表），同时以 `ctx.yonProjects` 服务（同进程）和 `/yon/api` HTTP 路由（任何前端）对外提供 |

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

字段名走 URL 段，需要 `encodeURIComponent`（中文/斜杠都没问题）。

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

### 数据落在哪、用什么介质

默认走 DSH 自带的 `json` 后端 → `$DSH_HOME/storages/yon_projects/{projects,project_fields}/*.json`。

想要 **SQLite 介质**：在 profile 里挂 `@deepseek-ai/dsh-storage-sqlite` 并把本领域路由指过去即可，**插件代码不用改**（介质由部署方选，见 DSH 的 storage 子系统文档）。

## 按钮面板（浏览器半）

侧栏底部的 `Y` 图标点开是面板；面板内目前有一个内建格子「项目管理面板」（图标 + 悬停显示完整描述）。

### 项目管理面板怎么用

点开格子里的图标，弹出一个浮层（不是挤在 280px 的面板里）：

| 操作 | 怎么做 |
|---|---|
| 新建项目 | 左栏顶部填「名称」（必填）+「编码」，回车或点「新建项目」 |
| 选项目 | 点左栏列表里的一项，右栏显示它的动态字段 |
| 改字段值 | 直接在右边输入框里改，**失焦即存**（回车等于失焦）；值是 JSON 就按 JSON 存，否则按文本存 |
| 加字段 | 右栏底部填「字段名」+「值」→「新增字段」。字段名随便起，中文、带空格、带斜杠都行；后续要加「环境信息new」就这么加 |
| 删字段 | 字段行右侧 `×` |
| 归档 / 恢复 | 右栏「归档」，归档后默认列表里不再出现，勾上「显示已归档」可以找回来 |
| 彻底删除 | 右栏「彻底删除」，**点一次变成「彻底删除?」，再点一次才真删**（连同它的所有字段行） |

浮层支持点外面或按 `Esc` 关闭。左栏每行末尾的「N 个字段」是主表里算出来的**字段个数**，用来扫一眼哪个项目有料。

架构上有一条硬规矩：**组件不取数、不订阅**。`createProjectApi()` 在 `apply` 里建一次，通过条目的 inject face 投影进去，组件拿到的是一组回调 —— 所以组件测试可以完全脱开 host 跑。

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
pnpm test        # vitest（54 个用例）
pnpm build       # tsc 出 host 半（ESM），tsdown 出浏览器半（loader factory）
pnpm verify      # 产物自检：loader 契约、externals、样式注入、host ESM、patch 层
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

### 为什么 `lib/` 被提交进 git

`dsh plugin add github:...` 拿到的是**源码而非构建产物**，而 pnpm ≥10 默认拒绝执行依赖的构建脚本。把 `lib/` 一起提交，使用者无需任何构建授权。改完源码记得 `pnpm build` 并提交 `lib/`。

## 已知限制

- **无焦点管理**：浮层是带标签的对话框，但打开时焦点不进入、关闭时也不回到触发按钮
- **字段值只能手输**：没有类型选择器/富编辑，复杂结构要靠手写 JSON 文本
- **无跨记录事务**：原子性单位是一条记录。`create({ name, fields })` 是「主表 1 写 + 子表 N 写」，中途失败可能留下缺字段的项目（字段缺失可容忍，面板显示为空）
- **领域版本不是迁移器**：改主表 schema 后旧记录会被校验拒绝、导致领域打不开；演进时请升 `version` 并把旧记录缺的字段声明为 optional
- **无二级索引**：按字段筛选/排序只能在应用层做（数据全量在内存；这类需求出现时说明该字段该「转正」成主表列，或改用 SQLite 关系表）

## 源码地图

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 入口：打开领域、发布 `ctx.yonProjects`、挂 `/yon/api` |
| `src/host/domain.ts` | 领域与两张表的 zod schema、路径安全的记录键编码 |
| `src/host/service.ts` | 项目存储服务：主子表聚合、级联删除、写入校验、变更订阅 |
| `src/host/http.ts` | `/yon/api` 前缀路由与错误映射 |
| `src/shared/types.ts` | 前后端共用的数据契约 |
| `src/client/index.ts` | 浏览器半入口：席位注册、面板 store、内建条目、API 客户端的注入面 |
| `src/client/YonPanelRoot.tsx` | 侧栏底部触发按钮、面板外壳、关闭行为 |
| `src/client/ProjectItem.tsx` | 内建的「项目管理面板」条目（图标格子 + 浮层开合） |
| `src/client/project/api.ts` | `/yon/api` 的瘦封装：组件唯一的数据入口 |
| `src/client/project/ProjectManager.tsx` | 项目管理浮层：列表、详情、动态字段的增删改 |
| `src/client/slots.ts` / `panel-store.ts` / `locales.ts` | 席位与 inject face 类型 / 开合状态 / 词典 |

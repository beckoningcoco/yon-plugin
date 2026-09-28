# dsh-plugin-yon-panel

DSH（DeepSeek Harness）Web GUI 的 **yon_btn 按钮面板**插件。

侧栏底部、设置按钮**上方**会多出一个 `Y` 图标：点开是一块按钮面板，面板里的按钮由**任意插件**通过席位贡献，本插件只负责面板本身（外壳、开合状态、格栅布局）。目前自带一个内建条目「项目管理面板」（纯图标，悬停显示完整描述）。

**安装它不需要改动 DSH 仓库**：它只占用 ui-sidebar 已经声明的席位 `sidebar.footer.action`。

## 安装

前提：本机已装 DSH（命令行里有 `dsh`，或从源码 checkout 用 `pnpm dsh`）。

### 方式一：从 git 安装（推荐）

本仓库**已提交构建产物**（`lib/`），所以 git 安装不需要任何构建授权：

```sh
dsh plugin --profile web add github:<你的账号>/dsh-plugin-yon-panel
dsh --profile web
```

### 方式二：npm

```sh
dsh plugin --profile web add dsh-plugin-yon-panel
```

### 方式三：tarball

```sh
pnpm pack                                   # 在本仓库目录执行，prepack 会自动构建
dsh plugin --profile web add ./dsh-plugin-yon-panel-0.1.0.tgz
```

装完启动后，侧栏底部（设置按钮上方）就会出现 `Y` 图标。卸载：

```sh
dsh plugin --profile web remove dsh-plugin-yon-panel
```

## 给面板加一个按钮

任何插件（包括你自己的另一个插件）都可以往面板里加按钮，**不需要改本插件**：

```ts
ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
  name: 'yon.panel.item',
  id: 'my-feature',   // 每个按钮一个全新 id
  order: 100,         // 排序（升序）
}, MyButton))
```

`MyButton` 收到该席位的组合 props：面板的实时 `open` 值（owner props）+ root 作用域席位的框架标准席位。按钮的样子与行为完全由贡献者自己决定（本插件的内建条目就是这么注册的）。

## 开发

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest（jsdom 用例带 per-file pragma）
pnpm build       # tsc 出 lib/types + tsdown 出 lib/index.js 与 lib/client.js
pnpm verify      # 产物自检：loader 契约、externals、样式注入、patch 层
pnpm pack        # 打包，prepack 会先 build
```

- `tsdown.config.ts` 是**自包含**的：它自己产出 DSH 要求的 lazy-CJS factory（`window.__ModuleLoader__.load({ id, factory })`），把基线模块保持为 `require()`，并把 CSS Modules 编译后注入 `<style>`。
- 基线 externals 名单抄自 harness 的 `@deepseek-ai/dsh-client-web/src/platform.ts`；升级 DSH 大版本时对照一次。
- `devDependencies` 里的 `@deepseek-ai/dsh-client-*` 用于类型检查与测试，版本取 npm 上的 rc；构建产物不包含它们。

### 为什么 `lib/` 被提交进 git

`dsh plugin add github:...` 拿到的是**源码而非构建产物**，而 pnpm ≥10 默认拒绝执行依赖的构建脚本。把 `lib/` 一起提交，使用者就无需任何构建授权；`prepack` 则保证 npm/tarball 两条路也带产物。改完源码记得 `pnpm build` 并提交 `lib/`。

## 依赖与兼容

| 项 | 说明 |
|---|---|
| 席位 | `sidebar.footer.action`（ui-sidebar 声明，list 席位，位于设置按钮上方） |
| 运行时 require | `react` / `react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`（均由 DSH 页面提供） |
| 服务 | `slots`、`locale` |
| 自声明席位 | `yon.panel.item`（随本插件走，不依赖上游） |

## 已知限制

- **内建条目点击尚无动作**：`项目管理面板` 格子会渲染并播报自己，但激活没有接任何行为。
- **无焦点管理**：面板是带标签的对话框，但打开时焦点不进入、关闭时也不回到触发按钮，也没有焦点陷阱。
- **状态是进程本地的**：刷新页面或条目重挂都从关闭开始。

## 源码地图

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 半：Loader 行所需的空 `apply` |
| `src/client/index.ts` | 插件主体：席位注册、`yon.panel.item` 声明与内建条目、面板 store |
| `src/client/slots.ts` | SlotMap / LocaleNamespaceMap 合并、按钮 owner share、inject face |
| `src/client/panel-store.ts` | 开合状态（observable source）与手势 |
| `src/client/YonPanelRoot.tsx` | 触发按钮、面板外壳、关闭行为、child slot 渲染点 |
| `src/client/ProjectItem.tsx` | 内建的「项目管理面板」条目 |
| `src/client/locales.ts` | `yonPanel` 词典（中/英） |

# NCC 前端脚手架 · 工程结构与构建

> **什么时候读我**：要搞清楚这个工程"是什么、怎么组织、怎么编译、产物去哪"，或者要在工程里找一个文件却不知道按什么规则找。第一次接触这套源码时先读本篇。

**样本工程**：`E:\NCProject\NCC2005\touziwuye\hotwebs`（NCC2005，客户"投资物业"，53005 个文件）

---

## 一、这是什么工程

`package.json`：

```json
"name": "nc-multipage-demo",
"author": "liyxt@yonyou.com"
```

**不是 SPA，是"多页"节点源码工程**：每个业务节点（页面）编译成**独立入口 + 独立 HTML**，部署到后端 Java web 容器（`hotwebs/nccloud/resources/...`）由容器直接吐页面。

一句话：**源码在 `src/`，产物是"一堆能丢进 NC Cloud 部署目录的静态页面"。**

## 二、根目录职责

| 路径 | 作用 |
| --- | --- |
| `package.json` | `dev`（webpack-dev-server）/ `build`（`node ./config/index.js production`） |
| `config.json` | **工程级开关**：构建入口、后端代理、端口 |
| `config/` | 构建脚本：`index.js`、`buildEntry.js`、`webpack.{common,dev,prod}.config.js` |
| `index.html` | **开发**用模板（devServer 直接用） |
| `template/index.html` | **生产**用模板，多两个注入位 `<%= configcss %>`、`<%= configjs %>` |
| `.babelrc` | env + react + stage-2；`jsx-control-statements`、`import-bee`（tinper-bee 按需） |
| `postcss.config.js` | autoprefixer；`PROJECT_CLIENT=mobile` 时启用 `postcss-px-to-viewport` |
| `ip.txt` | 手写环境备忘（非配置，仅供参考） |
| `run.bat` | `set path=%path%;D:/NC/IDE/NCCloudNew/nodejs/&&npm run dev`（用 NCC 开发工具自带 node） |
| `nccloud/` | 部署侧残留：`WEB-INF/web.xml` + 空的 `resources/api/...md` |
| `src/` | **页面源码，全部内容在这里** |
| `template/` | 生产 HTML 模板 |

> 工程内**没有 `node_modules`、没有 `dist/`** —— 依赖未装、产物未生成。

## 三、入口约定（最重要的一条）

`config/index.js:21`、`config/webpack.dev.config.js:28`：

```
./src/*/*/*/*/index.js
     └领域 └模块 └节点 └list|card|main/index.js
```

即 **`src/{领域}/{模块}/{节点}/{页面类型}/index.js`** 四层定入口。

`{页面类型}` 常见值：`list`、`card`、`main`，工程里还真实存在 `linkcard`、`approvecard`、`linklist`、`advancesearch_list`、`nowvcard`、`bxcard`、`zfcard`、`acccard`、`acclist` 等。

工程内共 **315 个** 四级入口。领域（一级目录）：

| 领域 | 含义 | 领域 | 含义 |
| --- | --- | --- | --- |
| `arap` | 应收应付 | `sscivm` | 共享服务·发票 |
| `cmp` | 资金管理 | `sscrp` | 共享服务·报账（含费用报销） |
| `fct` | 资金结算 | `ssctp` | 共享服务平台 |
| `gl` | 总账 | `tmpub` | 资金公共 |
| `obm` | 银企直联/网银 | `uap` | 平台（rbac/wfm/单据类型） |
| `jytzwy` | **客户自建领域** | `uapbd` | 基础数据 |
| `platform` | 运行时库（react/axios/redux…） | | |

> 注意：NCC 前端主体是**财务 + 资金 + 共享服务**，**没有**采购/销售/库存等供应链模块（那是 NC65 的形态）。

## 四、构建链路

```
config.json ─┐
             ├→ config/index.js ─→ config/buildEntry.js ─→ webpack.prod.config.js ─→ dist/
package.json ┘                                                    ↑
                                                    webpack.common.js（公共）
开发：package.json(dev) ─→ webpack.dev.config.js ──────────────┘
```

### 4.1 `config.json`（工程级开关）

```json
{
    "buildEntryPath": ["./src/cmp/bank/bankcontrast_tzwy/*/index.js"],
    "extendBuildEntryPath": [],
    "proxy": "http://127.0.0.1:8083",
    "buildWithoutHTML": ["uapbd/refer", "uap/refer"],
    "isMA": false,
    "maInfo": { "businessCode": "epa" },
    "directConnectInfo": { "userCode": "yongyou", "appCode": "123456", "code": "develop" },
    "devPort": 3006
}
```

| 字段 | 作用 |
| --- | --- |
| `buildEntryPath` | **只编译指定页面**；缺省才用默认 `./src/*/*/*/*/index.js` 全量 |
| `extendBuildEntryPath` | 二开扩展入口（会被改写成 `NCCExtend/extend_领域/...`，见 `buildEntry.js:70-75`） |
| `proxy` | 开发时 `/nccloud` 转发到后端 |
| `devPort` | devServer 端口，默认 3006 |
| `buildWithoutHTML` | 这些路径只出 JS 不出 HTML（参照页面由主页面内嵌） |
| `isMA`/`maInfo`/`directConnectInfo` | 编译期 `DefinePlugin` 注入 `ISMA`/`MA_INFO`/`LOGIN_INFO`（免登录信息） |

> ⚠️ **`buildEntryPath` 一旦写死，其余页面全部不参与构建**。排查"改了没生效"时先看这里。
> 当前它只指向 `src/cmp/bank/bankcontrast_tzwy/*/index.js`。

### 4.2 `config/index.js`（生产总调度）

跑**三遍 webpack**（第 29-45 行），分别处理：带 hash 的、不带 hash 的、二开（`fse`）的：

```js
let { entries: hashEntries }   = buildEntry({ ..., hash: true  });
let { entries }                = buildEntry({ ..., hash: false });
let { entries: extendEntries } = buildEntry({ ..., fse: true });
// 各自 spawn('node', ['--max_old_space_size=8192', 'webpack.js', '--config', './config/webpack.prod.config.js', ...])
```

- 为什么要三遍：**参照页面必须保持固定文件名**（被别处按固定路径引用），不能带 hash；
- `--max_old_space_size=8192`：8G 堆，侧面说明全量构建很吃内存；
- 参数从 npm 透传：`npm run build -- --env.buildPath=./src/xxx/yyy/*/index.js`。

### 4.3 `config/buildEntry.js`（入口扫描 + HTML 生成）

```
path    = ./src/cmp/bank/bankcontrast_tzwy/list/index.js
chunk   = cmp/bank/bankcontrast_tzwy/list      ← 切掉 ./src/ 与 /index.js
project = cmp                                   ← 一级目录
```

- **PC/移动分流**（第 61-65 行）：路径含 `/mobile_` 归移动端，靠 `--env.client=mobile` 切换；
- **hash 规则**（第 93-128 行）：节点级 `config.json` 的 `hash` 优先级最高；其次含
  `/refer/`、`/ref/`、`/refers/`、`/mobile_refer/` 的**不加 hash**；`fse` 一律不加；
- **HTML 生成**（第 130-206 行）：每 chunk 生成 `{chunk}/index.html`，模板取 `template/index.html`（PC）或 `template/mobileTemplate.html`（移动）；
- **节点级 `config.json`**（第 134-190 行）——二开最常用的定制点：

  | 字段 | 效果 |
  | --- | --- |
  | `template` | 换 HTML 模板 |
  | `output` | 额外再输出一份入口（一个页面两个 URL） |
  | `report` | 注入报表依赖 `lappreportrt/nc-report/{vendor,index}.{js,css}` |
  | `echarts` | 注入 `platform/echarts.js` |
  | `dependjs` / `dependcss` | 注入额外 js/css（带 `?v=时间戳`） |
  | `dependModuleName` | 这些模块进 `externals`，**不打包，运行时从外部取**（配合 `main/router.js` 的 `useJS`） |
  | `prodProxy` | 生产代理，编译期注入 `PROD_PROXY` |

- **public 目录自动拷贝**（第 35-55 行）：`src/{领域}/public` → `dist/{领域}/public`；
  `uapbd` 有两个特例（源码注释写着 `guozhq让弄的`、`wanghxm让弄的`）。

### 4.4 webpack 公共部分的关键：`externals`

`webpack.common.js:16-75` 把一批库**排除出 bundle**，运行时读全局变量：

```
nc-lightapp-front → 全局 nc-lightapp-front     ← 平台框架
react / react-dom / react-redux / react-router / redux / axios → 各自全局变量
nc-report / nc-lightapp-mobile / platform-workbench / platform-report / platform-login / nc-graphic-report
@antv/g6 → G6
```

这就是为什么每个页面 HTML 都要先引一堆 `platform/*.js`：**框架靠外链，不进业务 bundle**。

`resolve.alias`：

```
src         → hotwebs/src/
ssccommon   → src/sscrp/public/common/
base        → src/common/less/base
widgetsless → src/sscrp/public/common/less/widgets
uapbd       → src/uapbd
```

### 4.5 开发 / 生产差异

| 项 | dev（`webpack.dev.config.js`） | prod（`webpack.prod.config.js`） |
| --- | --- | --- |
| `output.path` | `config/dist` | **`hotwebs/dist`** |
| `publicPath` | `/` | **`../../../../`** |
| 代理 | `'/nccloud' → configJSON.proxy` | 无（`prodProxy` 走编译期注入） |
| 模板 | `contentBase = ../src`，`/platform/react.js` 直接可取 | `template/index.html` |
| 构建后 | `OpenBrowserPlugin` 打开 `http://localhost:{port}/nccloud` | — |
| 压缩 | 无 | `TerserPlugin`（`parallel:4`、`sourceMap:true`） |
| sourcemap | `devtool: 'source-map'` | 仅 `mode === 'test'` 时开 |

## 五、产物落点（`publicPath: '../../../../'` 是证据）

产物最终部署为：

```
hotwebs/nccloud/resources/{领域}/{模块}/{节点}/{list|card}/index.html + index.js
```

从该目录往上 4 层正好回到 `hotwebs/nccloud/resources/`，于是 HTML 里的
`../../../../platform/react.js` → `hotwebs/nccloud/resources/platform/react.js` 成立。

**三处独立佐证**：

1. `webpack.prod.config.js:33` `publicPath: '../../../../'`；
2. `src/jytzwy/taxclass/taxclass/main/Utils.js:116` 动态加载参照时写死 `script.src = '../../../../' + url + suffix`；
3. `main/config.json` 的 `dependjs` 路径也是 `../../../../sscrp/...` 形态。

✅ **实测旁证**：同机登记的 NCC2312 Home 中确实存在 `hotwebs/nccloud/resources/platform/`。

## 六、npm scripts

| 命令 | 实际动作 |
| --- | --- |
| `npm run dev` | webpack-dev-server + dev 配置，`--env.mode=development` |
| `npm run dev-m` | 同上，`--env.client=mobile` |
| `npm run build` | `node ./config/index.js production` |
| `npm run test` / `test-m` | 同上，`mode=test`（带 source-map 的生产包） |
| `npm run component` | 指向 `config/webpack.component.config.js` —— **该文件在工程中不存在**，此脚本不可用 |
| `npm run merge` | `node ./config/index.js`（无 mode） |

## 七、读构建脚本时已知的坑

1. **`hash` 传参是字符串**：`buildEntry` 要自己把 `'true'`/`'false'` 转布尔（`buildEntry.js:87-91`），因为 webpack CLI 的 `--env.hash=false` 过来是字符串 `"false"`（真值！）。
2. **dev 与 prod 的 `output.path` 不同**（`config/dist` vs `hotwebs/dist`），别混淆。
3. **`CleanWebpackPlugin` 只清本次要产出的目录**（由 entries 反推），所以**切换 `buildEntryPath` 后旧产物会留在 `dist`**。
4. **`src/platform/*.js` 是运行时库本体**（react.js、axios.js、redux.js、echarts.js、polyfill.js、moment.js）。dev 时靠 `contentBase=src` 直接取用；`webpack.dev.config.js:105-110` 有一段**被注释掉**的拷贝逻辑，正是因为 contentBase 已经覆盖了它。

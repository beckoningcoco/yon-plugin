# NCC 前端脚手架 · 页面开发范式与平台机制

> **什么时候读我**：要写或改一个 NCC 页面，先读本篇确认"用哪套范式、`this.props` 里有什么、事件往哪儿挂"。搞清楚了再去看 `list-page-template.md` / `card-page-template.md` 抄具体代码。

**平台机制权威源**：`../ncc-dev/references/common/frontend-dev.md`（六大高阶组件完整 API）。
本篇只讲**这个脚手架工程里的落地形态**，API 细节去那篇查，不重复。

---

## 一、`createPage` —— 一切的入口

平台文档原话：**`createPage` 是高阶组件包装器，所有页面组件必须用它包装**。

```js
// 标准列表页 src/cmp/bank/bankcontrast_tzwy/list/index.js:530
List = createPage({ mutiLangCode: moduleId })(List);
export default List;

// 代码生成工具产物 src/jytzwy/taxclass/taxclass/main/index.js:949
ApplicationPage = createPage({
    initTemplate: {},
    billinfo: { billtype: 'grid', pagecode: '105801SSFL_taxclass', bodycode: 'taxclass_table' },
    mutiLangCode: '105801SSFL'
})(ApplicationPage);
ReactDOM.render(<ApplicationPage />, document.querySelector("#app"));
```

包装后 `this.props` 上多出来的东西：

| 高阶组件 | props 路径 | 创建方法 | 用途 |
| --- | --- | --- | --- |
| 按钮 | `this.props.button` | `createButtonApp` | 按钮区、行按钮、下拉按钮 |
| 查询区 | `this.props.search` | `NCCreateSearch` | 查询条件 |
| 表单 | `this.props.form` | `createForm` | 卡片表头 |
| 浏览态表格 | `this.props.table` | `createSimpleTable` | 只读列表 |
| 编辑态表格 | `this.props.editTable` | `createEditTable` | 可编辑表格 |
| 卡片表格 | `this.props.cardTable` | `createCardTable` | 主子表 |
| 卡片分页 | `this.props.cardPagination` | `createCardPagination` | 上一张/下一张 |
| 同步/异步树 | `this.props.syncTree` | `createSyncTree` / `createAsyncTree` | 左树右表 |

另外还有：`createUIDom`（拉模板+按钮）、`BillHeadInfo.createBillHeadInfo`（标题区）、`meta`（模板）、
`MutiInit`（多语）、`cardCache`（缓存，从包里 import 而非 props）、`ViewModel`、`transferTable`。

> **心法**：NCC 页面 = React 组件外壳 + 平台高阶组件干活。你在源码里看到的 `this.props.xxx` 都不是组件自己实现的。

## 二、三种页面范式

### 范式 A：标准列表 + 卡片（`list/` + `card/` + `events/`）

```
{节点}/
├── list/  index.js, constants.js, events/{index,initTemplate,buttonClick,searchBtnClick,pageInfoClick,doubleClick,tableButtonClick}.js
└── card/  index.js, constants.js, events/{index,initTemplate,buttonClick,afterEvent,pageInfoClick,tableButtonClick,transferButtonClick}.js
```

逻辑抽到 `events/`，按平台事件名分文件。范例：`src/cmp/bank/bankcontrast_tzwy/`。

### 范式 B：单页应用（`main/`）

```
{节点}/main/index.js     954 行，一个文件装下整个节点
{节点}/main/Utils.js     工具层（loadNCCResource / loadTemplate / loadLang / loadRefer）
```

- 层级仍满足 4 层约定，只是把 `list|card` 换成 `main`；
- 用 `createPage(...)` 包一层后 `ReactDOM.render(<Page/>, '#app')`；
- **`src/jytzwy/taxclass/taxclass/main/index.js` 前 158 行是用友官方中文教学注释**（讲 state 驱动 render、createState、showmode 切换），是理解这套框架最好的教材，值得完整读一遍。

它的文件分区就是目录：

```
// ============= 导入高阶组件区 ==============
// ============= 导入基础组件区 ==============
// ============= 基本变量定义区 ==============   EMPTY_FN / EDITMODE_ADD|EDIT|BROWSE
// ============= 自定义常量区 ================   FIELDS（主键/单据号）、ACTIONS（按钮编码）、URLS（后端地址）
class ApplicationPage extends Component {
    constructor          → this.config（domainName/moduleName/appcode/pagecode 从 URL 参数取）
                         → this.state = this.createState()
                         → Utils.loadNCCResource(...) 加载模板/多语/参照
    initMeta(meta)       → 个性化调整模板（隐藏字段、加操作列、参照过滤）
    initButton(button)   → 个性化调整按钮
    createState()        → 页面模型（head/headBtn/search/table/excelOutput）
    render()             → isPageReady 才渲染；按 showmode 分发
    // ============= 功能性方法区 =============
    setPageStatus / updateBtnStatus / loadTableData / setTableData / loadAddLineDefaultValue
    // =============操作流程方法区=============
    onButtonClick / onAdd / onEdit / onDelete / onRowDelete / onSave / onCancel / onRefresh / onExport
    onSelected / onSelectedAll / onBeforeEvent / onAfterEvent
}
```

### 范式 C：单页路由（`main/` 路由 + `list/` + `card/` + `transfer/`）

标准产品的单页写法，一个节点一个 URL 前缀，多页签在同一页面内切换：

```
{节点}/main/router.js   路由表
{节点}/list/            列表页
{节点}/card/            卡片页
{节点}/transfer/        转单页
```

`main/router.js` 两种跨模块引入：

```js
// ① 编译期打包进来
const card = asyncComponent(() => import(
    /* webpackChunkName:"/arap/receivablebill/recbill/card/card" */
    /* webpackMode: "eager" */ '../card'));

// ② 运行期按 config.json 的 dependjs 加载（引用未参与本次编译的其他模块产物）
useJS.setConfig({ "fct/bill/ar/transfer/index": "../../../../fct/bill/ar/transfer/index.js" });
const FCT2 = useJS(["fct/bill/ar/transfer/index"], (m) => m);

const routes = [
    { path: '/',     component: List, exact: true },
    { path: '/list', component: List },
    { path: '/card', component: card },
    { path: '/F1',   component: F1 },      // 转单页（应付单）
    // ...
];
export default routes;
```

配套的 `main/config.json`：

```json
{ "dependjs": ["../../../../sscrp/rppub/components/image/index.js"],
  "dependModuleName": ["sscrp/rppub/components/image"] }
```

> `dependModuleName` 进 `externals`（不打包），`dependjs` 是运行时的实际路径，两者必须成对。

## 三、`events/` 的组织方式

事件文件导出**普通函数**，靠 `.call(this, ...)` 借用页面组件的 `this`：

```js
// events/main.js
export function bankColumns () {
    let { pages } = this.state;                     // ← 用的是页面组件的 state
    return [{ title: <div fieldid="numberindex">{ this.lang('0084') }</div>, ... }];
}

// list/index.js
import { bankColumns } from './events/main';
<CheckTable columns={bankColumns.call(this)} />
```

**签名规律**（必须记准，写错就取不到值）：

| 事件 | 签名 | 说明 |
| --- | --- | --- |
| `initTemplate` | `(props, callback)` | 内部用 `this.getPagecode()` |
| `buttonClick` | `(props, id)` | 头部按钮 |
| `tableButtonClick` | `(that, props, key, text, record, index)` | **第一个参数是页面实例**（因为要从 render 里传进去） |
| `searchBtnClick` | `(props, searchVal)` | 查询 |
| `pageInfoClick` | `(props, config, pks)` | 翻页 |
| `doubleClick` | `(record, index, e)` | 行双击 |
| `afterEvent` | `(props, moduleId, key, value, changedrows, i, s, g)` | 编辑后 |
| `formBeforeEvent` | `(props, moduleId, key, value)` | 表头编辑前（参照过滤） |
| `bodyBeforeEvent` | `(props, moduleId, key, value, index, record, type)` | 表体编辑前 |

**挂载点**：

```js
// 列表页
search.NCCreateSearch(this.searchId, { clickSearchBtn: searchBtnClick.bind(this), onAfterEvent: ..., showAdvBtn: true })
table.createSimpleTable(this.tableId, { handlePageInfoChange: pageInfoClick, onRowDoubleClick: doubleClick.bind(this), onSelected: ... })

// 卡片页
form.createForm(this.formId, { onAfterEvent: afterEvent.bind(this), onBeforeEvent: formBeforeEvent.bind(this) })
cardTable.createCardTable(this.tableId, {
    tableHead: this.getTableHead.bind(this, buttons),   // 肩部按钮
    onAfterEvent: afterEvent.bind(this),
    onBeforeEvent: bodyBeforeEvent.bind(this),
    modelSave / modelAddRow / modelDelRow,              // 侧拉编辑
    onSelected / onSelectedAll, showCheck: true, showIndex: true
})
button.createButtonApp({ area: 'list_head'|'card_head', buttonLimit: 3,
    onButtonClick: buttonClick.bind(this),
    popContainer: document.querySelector('.header-button-area') })
```

**区域编码**：表头按钮 `list_head` / `card_head`；肩部按钮 `card_body`；行内按钮 `list_inner` / `card_inner`。

## 四、页面加载时序（标准范式）

```
constructor
  └─ componentWillMount
       └─ getMultiLang({ moduleId, domainName, currentLocale, callback })   ← 先多语
            └─ setState({ json }) 
                 └─ initTemplate.call(this, this.props, this.initShow)      ← 再模板
                      └─ props.createUIDom({ pagecode, appcode, reqDataQueryallbtns, reqDataQuerypage }, cb)
                           ├─ data.button.button → getButtonsKey + props.button.setButtons
                           ├─ data.template      → modifierMeta → props.meta.setMeta
                           └─ data.context       → loginContext(data.context)
                      └─ callback = initShow()                                  ← 最后取业务数据
                           └─ 按 URL 参数分场景：缓存 / 查询 / 新增 / 转单 / 联查
```

范式 B 的等价物是 `Utils.loadNCCResource`：

```
loadRefer(referObjs)  → 动态 <script> 加载参照
  → Promise.all([ loadTemplate(createUIDom), loadLang(MultiInit.getMultiLang) ])
  → callback 里 props.meta.setMeta(meta) + props.button.setButtons(buttons)
  → setState({isPageReady:true}) → pageReady() → loadTableData → setTableData → updateBtnStatus
```

## 五、前后端契约：`ajax` 与两种请求体

URL 恒为 `/nccloud/{领域}/{模块}/{Action}.do`。

**列表查询型**：

```js
let queryInfo = props.search.getQueryInfo(searchId);
queryInfo.pageInfo = props.table.getTablePageInfo(tableId);
ajax({ url: '/nccloud/arap/recbill/query.do',
       data: { pageId, queryInfo, tradeType },
       success: (res) => { /* res.data[tableId] = { rows, allpks, pageInfo } */ } });
```

**卡片保存型**：

```js
let cardData = this.props.createMasterChildData(pagecode, formId, tableId);   // ★ 用平台 API，别手拼
ajax({ url: '/nccloud/arap/arappub/save.do',
       data: { cardData, uiState: getUrlParam('status'), extype, flag, ...this.dataInSaga } });
```

> **单表节点也要套「一主多子」结构** —— 源码注释原话：
> "工具生成的代码，所有节点保存参数统一按照一主多子的结构处理。单表的数据也要封装成一主多子的结构。"
> 删除时行数据要带 `status: '3'`（删除态）和 `ts`（乐观锁时间戳）。

**行状态**：`0` 原始 / `1` 修改 / `2` 新增 / `3` 删除。

**`dataInSaga`（NCC2005 特有）**：`{ appcode, pagecode, butncode }` 埋点信息，随每次请求发出，buttonClick 里会写 `this.dataInSaga.butncode = id`。平台文档（NCC2111）里没有这一项。

## 六、多语机制（三种写法并存）

| 写法 | 出处 | 说明 |
| --- | --- | --- |
| `this.lang('0004')` | `bankcontrast_tzwy` 等 | 页面自定义封装：`this.lang = getLangCode.bind(this)` |
| `this.props.MutiInit.getIntl("360704SM").get('360704SM-000017')` | 标准产品 | **主流写法**，实测全工程 2931 处 |
| `props.MultiInit.getMultiLang({moduleId, domainName, callback})` / `getMultiLang({...})` | `jytzwy/Utils.js`、平台文档 | 代码生成工具与官方文档的写法 |

封装实现（`src/cmp/bank/commom/utils.js:21`）：

```js
export function getLangCode (key) {
    let multiLang = this.props.MutiInit.getIntl(this.moduleId);
    return multiLang && multiLang.get(this.moduleId + '-' + key);
}
```

- 多语 key 恒为 **`{模块号}-{6位序号}`**（如 `360704SM-000017`，也有写成双横线 `36300WCR--000002` 的）；
- 语言包文件在 `src/{领域}/public/lang/standard/simpchn/{模块号}.json`，
  但实测 `src/jytzwy/public/lang/standard/simpchn/105801SSFL.json` 内容是**空 `{}`** ——
  前端这份是占位/构建产物，真正多语由后端下发；
- `createPage({ mutiLangCode: moduleId })` 里的 moduleId 决定用哪个语言包；
- ⚠️ 平台 API 真实拼写是 **`MutiInit`**（少一个 l）。两个都存在，别写错。

## 七、`cardCache`（列表↔卡片的数据通道）

```js
import { cardCache } from 'nc-lightapp-front';
let { setDefData, getDefData, addCache, getCacheById, updateCache, deleteCacheById,
      getNextId, getCurrentLastId } = cardCache;

setDefData(searchKey, dataSource, searchVal);          // 缓存查询条件（列表↔卡片往返还原）
addCache(pkname, cardData, formId, dataSource);        // 新增
updateCache(pkname, id, cardData, formId, dataSource); // 修改
getCacheById(id, dataSource);
```

> **列表页与卡片页必须共用同一个 `dataSource`**（如 `fi.arap.recbill.20060RBM`），否则列表返回时还原不出数据。
> 命名规范：`领域名.模块名.节点名.自定义名`。

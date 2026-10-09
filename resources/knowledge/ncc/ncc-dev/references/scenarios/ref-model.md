# NCC 参照模型与参照过滤

> **什么时候读我**：要给参照加过滤条件（"物料只能选本组织的"、"部门跟着财务组织走"）、
> 参照打开后数据不对要排查，或要做自定义参照 / F7 参照。**先读第零节，能省掉一半白干。**
>
> **本文覆盖范围**
>
> - ✅ **前端参照过滤**（`queryCondition` 的四个落点、参数速查表、`refType` 分支、
>   前端与后端 SqlBuilder 的分界）—— 已完成。样本为
>   `src/arap/public/components/pubUtils/arap{Form,Table,ListSearch}RefFilter.js`（标准产品实现，合计 3200+ 行）。
> - ⏳ **后端自定义参照 / F7 参照模型开发**（写 RefModel、注册参照、参照与实体绑定）—— **本文尚未覆盖，待补**。
>   需要这部分时，先按 `ncc-dev` 技能的「源码分析工作流」反编译 `nc.ui.*.ref.*RefModel` 类确认契约，**不要凭记忆写**。
>
> 本文原先位于 `../frontend/refer-filter.md`，为让「参照」场景路由一跳直达而提升为场景文档；
> 前端脚手架全景见 `../frontend/README.md`。

---

## 零、先明确一件事（决定你要不要动后端）

> **前端 `queryCondition` 返回的是「参数」，不是「SQL 条件」。**

```js
item.queryCondition = (p) => {
    return { pk_org: 'xxx', TreeRefActionExt: 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder' };
};
```

这段代码做的是：**打开参照时把 `{pk_org:'xxx'}` 发给参照服务，并告诉它用哪个 Java 类去拼过滤条件**。
真正决定"哪些数据查得出来"的，是 `TreeRefActionExt` / `GridRefActionExt` 指向的后端 SqlBuilder 类。

由此推出客开的两条路：

| 情况 | 做法 |
| --- | --- |
| 目标 SqlBuilder **已支持**某个参数（`pk_org`、`pk_currtype`、`busifuncode`、`VersionStartDate`…） | **只改前端**，把参数传进去即可 |
| 需要 SqlBuilder **不认识的**过滤条件 | **必须写后端 SqlBuilder 类（Java）**，前端只负责把类全名填进 `TreeRefActionExt`/`GridRefActionExt` |

## 一、四个落点

| 落点 | 文件 | 触发时机 | 适合什么 |
| --- | --- | --- | --- |
| **① meta 初始化** | 各页面 `events/initTemplate.js` | 页面加载一次 | 写死的静态条件 |
| **② 表头编辑前** | `arapFormRefFilter.js` `formBeforeEvent` | 每次点开参照 | 依赖表头其它字段 |
| **③ 表体编辑前** | `arapTableRefFilter.js` `bodyBeforeEvent` | 每次点开参照 | 依赖本行 + 表头字段 |
| **④ 查询区** | `arapListSearchRefFilter.js` `modifierSearchMetas` | 查询区渲染时 | 查询区字段之间联动 |

## 二、模板 1：最小可用（meta 初始化里静态过滤）

出处：`src/jytzwy/taxclass/taxclass/main/index.js:316-325`

```js
initMeta = (meta) => {
    // 主组织权限过滤：只加载当前登录人有权限的组织
    meta[this.state.table.area].items.find(item => {
        if (item.attrcode == "pk_org") {
            item.queryCondition = () => {
                return {
                    AppCode: this.config.appcode,
                    TreeRefActionExt: 'nccloud.web.refer.sqlbuilder.PrimaryOrgSQLBuilder'
                };
            }
        }
    });
    return meta;      // ★ 别忘了 return，随后调用方 props.meta.setMeta(meta)
};
```

> ⚠️ 这个落点改完 meta **必须 `props.meta.setMeta(meta)` 才生效**。
> 模板 2（编辑前事件）里改 item 是即时生效的，**不需要 setMeta**。

## 三、模板 2：表头字段过滤 ★ 最常用

挂载：`createForm(this.formId, { onBeforeEvent: formBeforeEvent.bind(this) })`

```js
export function formBeforeEvent(props, moduleId, key, value) {
    let flag = true;                              // ★ 返回 false = 该单元格不可编辑
    let meta = props.meta.getMeta();

    // 公共参数容器：各 case 共用一个 config，按需覆盖字段
    let config = {
        itemKey: key,
        isHead: true,                             // 表头
        DataPowerOperationCode: '',               // 数据权限操作码，'fi' = 财务
        isDataPowerEnable: 'Y',
        pk_org: '', AppCode: '', TreeRefActionExt: '', GridRefActionExt: ''
    };

    meta[moduleId].items.map((item) => {
        // 每个字段都先归零这些开关
        item.isShowUnit = false;                  // 是否显示"业务单元"页签
        item.isShowDisabledData = false;
        if (item.itemtype == 'refer') {
            item.isMultiSelectedEnabled = false;  // 参照不允许多选
            item.unitValueIsNeeded = false;       // true 时只有选了业务单元才发请求
        }

        if (item.attrcode !== key) return item;   // 只处理当前点击的字段

        switch (item.attrcode) {
            // —— 场景 A：部门版本，按财务组织 + 单据日期过滤 ——
            case 'pk_deptid_v':
                item.isShowUnit = true;
                item.unitCondition = () => ({     // 业务单元页签自己的过滤，注意是 pkOrgs（复数）
                    pkOrgs: props.form.getFormItemsValue(this.formId, 'pk_org').value,
                    TreeRefActionExt: 'nccloud.web.arap.ref.before.OrgSqlBuilder'
                });
                item.queryCondition = (p) => {    // p = { refType: 'grid'|'tree'|'gridTree' }
                    config.busifuncode = 'all';   // 部门参照专用
                    config.DataPowerOperationCode = 'fi';
                    config.pk_org = props.form.getFormItemsValue(this.formId, 'pk_org').value;
                    config.VersionStartDate = props.form.getFormItemsValue(this.formId, 'billdate').value;
                    // ★ refType 分支必须写，否则树形参照会失效
                    if (p) {
                        if (p.refType == 'grid' || p.refType == 'gridTree') {
                            config.GridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleDepSqlBuilder';
                        } else if (p.refType == 'tree') {
                            config.TreeRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleDepSqlBuilder';
                        }
                    } else {
                        config.TreeRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleDepSqlBuilder';
                    }
                    config.UsualGridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    config.itemKey = key;
                    return config;
                };
                break;

            // —— 场景 B：财务组织，走平台组织权限 ——
            case 'pk_org':
                item.queryCondition = () => {
                    config.DataPowerOperationCode = 'fi';
                    config.isDataPowerEnable = 'Y';
                    config.AppCode = props.getSearchParam('c');
                    config.TreeRefActionExt = 'nccloud.web.refer.sqlbuilder.PrimaryOrgSQLBuilder';
                    return config;
                };
                break;

            // —— 场景 C：币种 ——
            case 'pk_currtype':
                item.queryCondition = (p) => {
                    if (p && (p.refType == 'grid' || p.refType == 'gridTree')) {
                        config.GridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    } else {
                        config.GridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    }
                    config.UsualGridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    config.itemKey = key;
                    config.pk_org = props.form.getFormItemsValue(this.formId, 'pk_org').value;
                    config.DataPowerOperationCode = 'fi';
                    return config;
                };
                break;
        }
        return item;
    });

    return flag;      // ★ 必须 return，false 时该字段不可编辑
}
```

## 四、模板 3：表体行过滤（依赖本行 + 表头）

挂载：`createCardTable(this.tableId, { onBeforeEvent: bodyBeforeEvent.bind(this) })`

```js
function bodyBeforeEvent(props, moduleId, key, value, index, record, type) {
    // ① 性能白名单：金额/数量类字段不需要过滤，提前返回（标准产品就这么做）
    var noFilterFields = ["money_bal","money_de","money_cr","notax_de","notax_cr","occupationmny",
        "local_money_bal","local_money_de","price","taxprice","postprice","local_price",
        "local_taxprice","taxrate","taxtype","quantity_bal", /* ... */];
    if (contains(noFilterFields, key)) return true;

    // ② 侧拉编辑场景区域编码要换
    if (type == 'model') { moduleId = "bodys_edit"; }

    var flag = true;
    var meta = props.meta.getMeta();
    var billType = props.form.getFormItemsValue(this.formId, 'pk_billtype').value;

    // ③ 表头 + 本行快照（交叉规则 SqlBuilder 要看）
    var formData  = JSON.stringify({ model: props.form.getAllFormValue(this.formId), pageid: this.pageId });
    var tableData = JSON.stringify({ model: { areaType:"table", areacode:null, rows:[record] }, pageid: this.pageId });

    var config = {
        itemKey: '', isHead: false,
        crossRuleConditionsVO: formData,          // 表头内容
        crossRuleTableConditionsVO: tableData,    // 本行内容
        DataPowerOperationCode: '', isDataPowerEnable: 'Y',
        pk_org: '', AppCode: '', TreeRefActionExt: '', GridRefActionExt: ''
    };

    meta[moduleId].items.map((item) => {
        item.isShowUnit = false;
        if (item.itemtype == 'refer') { item.isMultiSelectedEnabled = false; item.unitValueIsNeeded = false; }
        if (item.attrcode !== key) return item;

        switch (item.attrcode) {
            // 依赖表头 + 本行：物料（组织 + 客户 + 单据日期）
            case 'material':
                item.queryCondition = (p) => {
                    if (p && (p.refType == 'grid' || p.refType == 'gridTree')) {
                        config.GridRefActionExt = 'nccloud.web.arap.ref.before.MaterialGridSqlBuilder';
                    } else if (p && p.refType == 'tree') {
                        config.TreeRefActionExt = 'nccloud.web.arap.ref.before.MaterialGridSqlBuilder';
                    } else {
                        config.GridRefActionExt = 'nccloud.web.arap.ref.before.MaterialGridSqlBuilder';
                    }
                    config.UsualGridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    config.itemKey = key;
                    config.DataPowerOperationCode = 'fi';
                    config.pk_org = record.values.pk_org.value;                       // ★ 本行取值
                    config.matcustcode = record.values.matcustcode ? record.values.matcustcode.value : null;
                    config.VersionStartDate = props.form.getFormItemsValue(this.formId, 'billdate').value;  // ★ 表头取值
                    return config;
                };
                break;

            // 依赖本行、并要控制可编辑性：利润中心为空则不可编辑
            case 'checkelement':
                var pk_pcorg = record.values.pk_pcorg ? record.values.pk_pcorg.value : null;
                if (!pk_pcorg) { flag = false; }
                item.queryCondition = (p) => {
                    config.pk_org = pk_pcorg;
                    config.DataPowerOperationCode = 'fi';
                    config.itemKey = key;
                    if (p && p.refType == 'tree') {
                        config.TreeRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    } else {
                        config.GridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    }
                    config.UsualGridRefActionExt = 'nccloud.web.arap.ref.before.CrossRuleSqlBuilder';
                    return config;
                };
                break;

            // 要后端判一次能不能编辑：先同步 ajax 问一次
            case 'freecust':
                var supplier = record.values.supplier ? record.values.supplier.value : null;
                var customer = record.values.customer ? record.values.customer.value : null;
                if (supplier != null || customer != null) {
                    ajax({
                        url: '/nccloud/arap/ref/freecustcontrol.do',
                        async: false,                    // ★ 必须同步，要拿返回值决定后续行为
                        data: { supplier, customer },
                        success: (res) => { if (res.success) flag = res.data; }
                    });
                }
                break;
        }
        return item;
    });

    return flag;
}
```

**表体里改可编辑性不能靠返回值**（返回值只管住当前这一格），平台写法：

```js
props.cardTable.setEditableByIndex(moduleId, index, 'objtype', false);
```

## 五、模板 4：查询区字段联动

挂载（在 `list/events/initTemplate.js` 里）：

```js
modifierSearchMetas(searchId, props, meta, billType, data.context.paramMap?.transtype, that);
props.meta.setMeta(meta, callback);
```

```js
function modifierSearchMetas(searchId, props, meta, billType, transtype, that) {
    meta[searchId].items = meta[searchId].items.map((item) => {
        item.isShowDisabledData = true;
        item.unitValueIsNeeded = false;

        switch (item.attrcode) {
            case 'pk_org':
                item.isShowUnit = false;
                item.queryCondition = () => ({
                    DataPowerOperationCode: 'fi',
                    AppCode: props.getSearchParam('c'),
                    TreeRefActionExt: 'nccloud.web.refer.sqlbuilder.PrimaryOrgSQLBuilder'
                });
                break;

            // 部门跟着查询区的"财务组织"走
            case 'pk_deptid':
                item.isShowUnit = true;
                item.unitCondition = () => ({
                    pkOrgs: getFirstOrgValue((props.search.getSearchValByField(searchId, 'pk_org') || {}).value.firstvalue),
                    TreeRefActionExt: 'nccloud.web.arap.ref.before.OrgSqlBuilder'
                });
                item.queryCondition = () => ({
                    DataPowerOperationCode: 'fi',
                    isDataPowerEnable: 'Y',
                    pk_org: getFirstOrgValue((props.search.getSearchValByField(searchId, 'pk_org') || {}).value.firstvalue)
                });
                break;
        }
        return item;
    });
}
```

> 查询区取值：`props.search.getSearchValByField(searchId, 'pk_org').value.firstvalue`（多一层 `.value` + `firstvalue`）；
> 版本类参照再补 `VersionStartDate: getBusinessInfo().businessDate`。

## 六、模板 5：组织权限过滤（三段式）

```js
config.DataPowerOperationCode = 'fi';                                          // ① 数据权限操作码
config.isDataPowerEnable = 'Y';                                                // ② 启用数据权限
config.TreeRefActionExt = 'nccloud.web.refer.sqlbuilder.PrimaryOrgSQLBuilder';  // ③ 组织权限 SqlBuilder
config.AppCode = props.getSearchParam('c');
```

- 版本类组织（`pk_org_v`、`sett_org_v`）还要补 `config.VersionStartDate`（一般取 `billdate`）；
- 部门/业务员版本：**`pkOrgs`（复数）** 走业务单元页签 `unitCondition`，**`pk_org`（单数）** 走数据过滤。

## 七、`queryCondition` 参数速查

| 参数 | 含义 / 取值 |
| --- | --- |
| `itemKey` | 当前字段编码，一般 `= key` |
| `isHead` | 表头 `true`、表体 `false` |
| `DataPowerOperationCode` | 数据权限操作码，arap 财务单据固定 `'fi'` |
| `isDataPowerEnable` | `'Y'` 启用数据权限 |
| `AppCode` | 小应用编码：`props.getSearchParam('c')` |
| `TreeRefActionExt` / `GridRefActionExt` / `UsualGridRefActionExt` | **后端 SqlBuilder 类全名**（树/表/常用表，按 refType 给） |
| `pk_org` / `pkOrgs` | 组织（单值过滤 / 多值业务单元页签） |
| `VersionStartDate` | **版本类参照必传**，一般取 `billdate` |
| `pk_currtype` | 币种 |
| `busifuncode` | 部门参照专用，`'all'` |
| `parentbilltype` | 上级单据类型 |
| `tradeType` | 交易类型 |
| `crossRuleConditionsVO` / `crossRuleTableConditionsVO` | 表头/表体行快照（JSON 字符串），交叉规则 SqlBuilder 用 |
| `accclass` / `pk_cust` / `pk_psndoc` | 银行账户参照：往来对象类型(1客户/3供应商) / 客商主键 / 业务员 |
| `refnodename` | 参照显示名（换参照时和 `item.refcode` 一起改） |
| `matcustcode` | 物料客户码（应收模块物料参照要传） |

**arap 现成可复用的 SqlBuilder 类**（不用自己写）：

```
nccloud.web.refer.sqlbuilder.PrimaryOrgSQLBuilder          // 平台级：主组织权限
nccloud.web.arap.ref.before.CrossRuleSqlBuilder            // arap：交叉规则（最通用）
nccloud.web.arap.ref.before.CrossRuleDepSqlBuilder         // 部门交叉规则
nccloud.web.arap.ref.before.OrgSqlBuilder                  // 组织
nccloud.web.arap.ref.before.OrgSearchAreaSqlBuilder        // 查询区组织
nccloud.web.arap.ref.before.CostCenterSqlBuilder           // 成本中心
nccloud.web.arap.ref.before.BankaccSubUseSqlBuilder        // 银行账户（使用权）
nccloud.web.arap.ref.before.BankaccPersonSqlBuilder        // 个人银行账户
nccloud.web.arap.ref.before.MaterialGridSqlBuilder         // 物料
nccloud.web.arap.ref.before.TaxcodeIdSqlBuilder            // 税码
nccloud.web.arap.ref.before.BalatypeSqlBuilder             // 结算方式
nccloud.web.arap.ref.before.CashBankSqlBuilder             // 现金账户
nccloud.web.arap.ref.before.ProjectTaskSqlBuilder          // 项目任务
nccloud.web.arap.ref.before.FreeCustSqlBuilder             // 散户
```

## 八、参照过滤常配的附属动作

| 目的 | 写法 |
| --- | --- |
| 整格不可编辑 | 表头 `return false`；表体 `props.cardTable.setEditableByIndex(moduleId, index, key, false)` |
| 隐藏/显示"业务单元"页签 | `item.isShowUnit = false / true` |
| 业务单元页签自己的过滤 | `item.unitCondition = () => ({ pkOrgs, TreeRefActionExt })` |
| 禁掉枚举某个选项 | 遍历 `item.options` 找到 `value` 后 `item.options.splice(index, 1)` |
| 换参照（同字段不同场景用不同参照） | `item.itemType='refer'; item.refcode='uapbd/refer/pub/CustBankAccGridRef/index'; item.refName=...` |
| 关掉多选 | `item.isMultiSelectedEnabled = false` |
| 只有选业务单元才请求 | `item.unitValueIsNeeded = false`（设 false 即不受此限制） |

## 九、客开决策顺序（照这个走不会白干）

```
1. 要过滤哪个字段？它现在用的 SqlBuilder 是哪个？（看 item.queryCondition 里已有的 TreeRefActionExt）
2. 我要加的条件，这个 SqlBuilder 认识吗？
   ├─ 认识（pk_org / pk_currtype / VersionStartDate / busifuncode …）
   │    → 只改前端：在对应落点的 case 里把这个参数传进去，收工
   └─ 不认识
        → 需要后端：参考 CrossRuleSqlBuilder 写一个 SqlBuilder 类，
          前端只负责把类全名填进 TreeRefActionExt / GridRefActionExt，
          并把自己的条件字段一并放进 config 传过去
3. 落点选哪个？
   ├─ 条件固定不变         → initTemplate 里改 meta（记得 setMeta）
   ├─ 依赖表头其它字段     → formBeforeEvent
   ├─ 依赖本行/表头字段    → bodyBeforeEvent
   └─ 查询区字段之间联动   → modifierSearchMetas
4. 别忘了 refType 分支 + return flag
```

> 找后端 SqlBuilder 真实实现需要 NCC 安装目录的 jar：用 `ncc_home_list` 拿到 Home id →
> `knowledge_build_index` 建类索引 → `ncc_class_search` 查 `CrossRuleSqlBuilder`。
> 注意登记的是哪个版本，跨版本代码会有差异。

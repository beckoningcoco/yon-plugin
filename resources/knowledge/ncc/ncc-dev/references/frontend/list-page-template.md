# NCC 前端脚手架 · 列表页模板（可复制）

> **什么时候读我**：要新建或改写一个列表页（`list/`），需要现成的骨架代码照抄。
> 样本：`src/arap/receivablebill/recbill/list/`（应收单列表，标准产品，8 个文件）。

---

## 目录结构

```
list/
├── index.js               页面组件（组装 + 业务方法）
├── constants.js           区域/单据类型/缓存键常量
└── events/
    ├── index.js           统一导出
    ├── initTemplate.js    模板/按钮初始化（createUIDom）
    ├── buttonClick.js     头部按钮分发
    ├── searchBtnClick.js  查询
    ├── pageInfoClick.js   翻页
    ├── doubleClick.js     行双击 → 跳卡片
    └── tableButtonClick.js 行内按钮
```

## 1. `constants.js`

```js
export const searchId = 'query';       // 查询区编码（模板里定义的）
export const tableId  = 'list';        // 表格区编码
export const nodekey  = 'list';        // 模板节点标识（打印/输出用）
export const billType = 'F0';          // 单据类型（F0=应收单 F1=应付单）
export const tradeType= 'D0';          // 默认交易类型
// 缓存键命名规范："领域名.模块名.节点名.自定义名"
export const dataSource = 'fi.arap.recbill.20060RBM';
export const pkname     = 'pk_recbill';        // 单据主键字段名
export const searchKey  = 'pk_recbill_search'; // 查询条件缓存键
```

> 卡片页必须用**同一个 `dataSource` 和 `pkname`**。

## 2. `events/index.js`

```js
import searchBtnClick from "./searchBtnClick";
import pageInfoClick from "./pageInfoClick";
import buttonClick from "./buttonClick";
import doubleClick from "./doubleClick";
import initTemplate from "./initTemplate";
export { searchBtnClick, pageInfoClick, buttonClick, doubleClick, initTemplate };
```

## 3. `events/initTemplate.js` ★ 最关键

```js
export default function (props, callback) {
    const that = this;
    let pagecode = that.getPagecode();
    let appcode = props.getSearchParam('c') ? props.getSearchParam('c') : props.getUrlParam('c');
    let tradetype = getTradeType();          // 优先取缓存里的交易类型

    props.createUIDom(
        {
            pagecode, appcode,
            reqDataQueryallbtns: {           // ★ 把按钮请求并进 createUIDom
                rqUrl: '/arap/arappub/queryallbtns.do',
                rqJson: `{"pagecode":"${pagecode}","appcode":"${appcode}","billtype":"${billType}","tradetype":"${tradetype}"}`,
                rqCode: 'button'
            },
            reqDataQuerypage: {              // ★ 把模板请求并进 createUIDom
                rqUrl: '/arap/arappub/querypage.do',
                rqJson: `{"pagecode":"${pagecode}","appcode":"${appcode}"}`,
                rqCode: 'template'
            }
        },
        function (data) {
            if (!data || !data.template[tableId]) return;

            // ① 按钮
            if (data.button && data.button.button) {
                let button = data.button.button;
                that.Info.pullBillInfoVOAry = data.button.pullbillinfo;
                lineButton = getInnerButtonkey(button);              // 行内按钮
                getButtonsKey(button, that.Info.allButtonsKey);      // 记录全部按钮 key
                props.button.setButtons(button);
                props.button.setPopContent('Delete_Inner', that.state.json['receivablebill-000017']);
                props.button.setUploadConfig("ImportData", excelimportconfig);
            }

            // ② 模板
            if (data.template) {
                let meta = data.template;
                setDefOrgBilldateSrchArea(props, searchId, data);    // 查询区财务组织默认值
                meta = modifierMeta(that, props, meta, lineButton);
                modifierSearchMetas(searchId, props, meta, billType,   // ★ 查询区参照过滤
                    data.context.paramMap ? data.context.paramMap.transtype : null, that);
                props.meta.setMeta(meta, () => {
                    if (data.context.paramMap) {
                        props.search.setSearchValByField(searchId, 'pk_tradetypeid',
                            { display: data.context.paramMap.transtype_name, value: data.context.paramMap.pk_transtype });
                    }
                });
            }

            // ③ 登录上下文
            if (data.context) {
                loginContext(data.context);                          // 交易类型/组织/期间等
                if (getContext(loginContextKeys.transtype) && that.refs.tradetypeBtn) {
                    that.refs.tradetypeBtn.setVisible(false);
                }
            }
            if (callback) callback();
        }
    );
}

function getTradeType() {
    let cacheTradeType = getDefData('sessionTradeType', dataSource);
    return (cacheTradeType != null && cacheTradeType != undefined) ? cacheTradeType : tradeType;
}
```

`modifierMeta` 里两个标准动作：

```js
function modifierMeta(that, props, meta, innerButton) {
    // ① 改某列渲染：单据号变可点链接 → pushTo 到卡片
    meta[tableId].items = meta[tableId].items.map(item => {
        if (item.attrcode == 'billno') {
            item.render = (text, record, index) => (
                <a onClick={() => {
                        // 跳转前缓存查询条件，卡片返回列表时还原
                        let searchVal = props.search.getAllSearchData(searchId);
                        if (searchVal) setDefData(searchKey, dataSource, searchVal);
                        props.pushTo('/card', { status:'browse', id: record.pk_recbill.value,
                                                pagecode: record.pk_tradetype.value });
                    }}>{record.billno.value}</a>
            );
        }
        return item;
    });

    // ② 追加「操作列」，列里放行内按钮
    meta[tableId].items.push({
        label: that.state.json['receivablebill-000020'],   // 操作
        itemtype: 'customer', attrcode: 'opr', fixed: 'right', visible: true,
        width: OperationColumn,
        render: (text, record, index) => {
            let trueBtn = (innerButton || []).filter(k => buttonVisible('browse', record, k));
            return props.button.createOprationButton(trueBtn, {
                area: "list_inner", buttonLimit: 3,
                onButtonClick: (props, key) => tableButtonClick(that, props, key, text, record, index)
            });
        }
    });
    return meta;
}
```

## 4. `events/searchBtnClick.js`

```js
export default function clickSearchBtn(props, searchVal) {
    if (!searchVal) return;
    cacheTools.set(props.getSearchParam('c') + this.searchId, searchVal);
    let queryInfo = props.search.getQueryInfo(this.searchId);
    queryInfo.pageInfo = props.table.getTablePageInfo(this.tableId);
    let data = { pageId: props.getSearchParam('p'), queryInfo,
                 tradeType: getContext(loginContextKeys.transtype) };
    setDefData(searchId, dataSource, data);          // 缓存查询条件，供刷新/翻页复用
    ajax({
        url: '/nccloud/arap/recbill/query.do',
        data,
        success: (res) => {
            if (!res.success) return;
            if (res.data) {
                toast({ color:'success', content: this.state.json['receivablebill-000031']
                        + res.data[this.tableId].allpks.length + this.state.json['receivablebill-000032'] });
                this.props.table.setAllTableData(this.tableId, res.data[this.tableId]);
            } else {
                toast({ color:'warning', content: this.state.json['receivablebill-000033'] });
                this.props.table.setAllTableData(this.tableId, { rows: [] });
            }
            setDefData(this.tableId, dataSource, res.data);   // 列表数据入缓存
            this.onSelected();                                // ★ 查完必须重算按钮态
        }
    });
}
```

## 5. `events/buttonClick.js`（头部按钮分发）

```js
import { headButton } from '../../../../public/components/pubUtils/buttonName';

export default function buttonClick(props, id) {
    this.dataInSaga.butncode = id;                 // 埋点：记录当前按钮
    switch (id) {
        case headButton.Add:
            props.pushTo('/card', { status:'add', pagecode: ... });
            break;
        case headButton.Commit:   commitOpreration(this, this.props, this.tableId, billType, headButton.Commit); break;
        case headButton.Uncommit: /* 批量收回 */ break;
        case headButton.Delete:   promptBox({ color:'warning', title: ..., content: ...,
                                              beSureBtnClick: () => { /* ajax delete.do */ } }); break;
        case headButton.Print:    /* 取勾选行主键 → this.printData.oids → this.onPrint() */ break;
        case headButton.Refresh:  /* 用缓存里的查询条件重查 */ break;
        default:
            let transferInfo = getTransferInfo(this, id);   // ★ 转单按钮统一落 default
            if (transferInfo) { /* queryrelatedapp.do → props.pushTo('/' + src_billtype, {...}) */ }
            break;
    }
}
```

**规则**：
- 按钮名一律用常量 `headButton.*` / `innerButton.*`（`pubUtils/buttonName.js`），不写字面量；
- 批量与单条常分开走（`batchcommit.do` vs `commit.do`）；
- **转单类按钮不逐个 case**，统一在 `default` 里查转单配置。

## 6. `events/tableButtonClick.js`（行内按钮）

```js
const tableButtonClick = (that, props, key, text, record, index) => {
    switch (key) {
        case innerButton.Delete_Inner:
            that.Info.pk_bill = record.pk_recbill.value;
            that.Info.ts = record.ts.value;
            that.Info.index = index;
            that.delConfirm();
            break;
        case innerButton.Edit_inner:   /* 先 edit.do 再 pushTo('/card', {status:'edit'}) */ break;
        case innerButton.Copy_inner:   /* pushTo('/card', {status:'add', type:'copy', id}) */ break;
        case innerButton.Commit_inner: that.Info.tipUrl = '/nccloud/arap/arappub/commit.do';
                                       that.Info.record = record; that.commitAndUncommit(); break;
    }
};
export default tableButtonClick;
```

> **第一个参数是 `that`（页面实例）**，与 `buttonClick(props, id)` 不同 —— 因为它要作为回调从 render 传进去。

## 7. `events/pageInfoClick.js`（翻页）

```js
export default function (props, config, pks) {
    if (!pks || pks.length == 0) return;
    ajax({
        url: '/nccloud/arap/recbill/querygridbypks.do',
        data: { pk_bills: pks, pageId: props.getSearchParam('p') },
        success: (res) => {
            props.table.setAllTableData(tableId, res.data ? res.data[tableId] : { rows: [] });
            this.onSelected();
        }
    });
}
```

> 平台翻页分两段：先由表格向后台要主键（`handlePageInfoChange` 给你 `pks`），再回后台要这几行的数据。
> 所以**每个列表页都要提供「按主键查行」接口**。

## 8. `events/doubleClick.js`

```js
export default function doubleClick(record, index, e) {
    let searchVal = this.props.search.getAllSearchData(searchId);
    if (searchVal) setDefData(searchKey, dataSource, searchVal);   // 缓存查询条件

    if (this.props.getUrlParam("scene") == 'linksce' || this.props.getUrlParam("scene") == 'fip') {
        this.props.pushTo('/card', { status:'browse', id: record.pk_recbill.value,
                                     pagecode:'20060RBM_CARD_LINK', scene:'linksce' });
    } else {
        this.props.pushTo('/card', { status:'browse', id: record.pk_recbill.value,
                                     pagecode: record.pk_tradetype.value });   // ★ 交易类型当 pagecode
    }
}
```

## 9. `index.js` 骨架（去掉业务的最小可跑版）

```js
import React, { Component } from 'react';
import { createPage, ajax, base, toast, getMultiLang, cardCache } from 'nc-lightapp-front';
import { buttonClick, searchBtnClick, pageInfoClick, doubleClick, initTemplate } from './events';
import { searchId, tableId, billType, pkname, dataSource, searchKey, tradeType } from './constants';
const { NCDiv } = base;
let { setDefData, getDefData } = cardCache;

class List extends Component {
    constructor(props) {
        super(props);
        this.moduleId = '2052';                       // 多语模块号
        this.tableId  = tableId;
        this.searchId = searchId;
        this.billType = billType;
        this.pkname   = pkname;
        this.dataInSaga = {                           // NCC2005 特有二开埋点
            appcode: props.getSearchParam('c') || null,
            pagecode: props.getSearchParam('p') || null,
            butncode: null
        };
        this.state = { json: {}, /* 各弹窗 show 开关 */ };
        this.Info = {                                 // ★ 不触发重绘的全局量放 this 上，不放 state
            allButtonsKey: [], pk_bill: null, ts: null, index: null, selectedPKS: [], tipContent: ''
        };
    }

    componentWillMount() {
        const callback = (json) => {
            this.setState({ json }, () => initTemplate.call(this, this.props, this.initShow));
        };
        getMultiLang({ moduleId: ['receivablebill', 'public'], domainName: 'arap',
                       currentLocale: 'simpchn', callback });   // ★ 先多语、再模板
    }

    getPagecode = () => this.props.getUrlParam('scene') ? '20060RBM_LIST_LINK' : '20060RBM_LIST';

    initShow = () => { /* 首屏：优先取缓存；否则按 scene/status/pk_bills 等 URL 参数分场景查 */ };

    onSelected = () => onListButtonControl(this);      // ★ 选中行变化就重算按钮

    // 单条删除/提交这类"带异常二次交互"的公共流程
    commitAndUncommit = () => { /* ajax → exType=='1' 弹框 / workflow 指派 → 成功 toast + 更新行 */ };
    delConfirm       = (extype, flag) => { /* ajax delete.do → 删行 + 删缓存 + onSelected */ };

    render() {
        const { table, search, button, modal } = this.props;
        const { createBillHeadInfo } = this.props.BillHeadInfo;
        return (
            <div className="nc-bill-list">
                <NCDiv areaCode={NCDiv.config.HEADER} className="nc-bill-header-area">
                    <div className="header-title-search-area">
                        {createBillHeadInfo({ title: this.state.json['receivablebill-000051'],
                                              initShowBackBtn: false })}
                    </div>
                    <div className="header-button-area">
                        {button.createButtonApp({ area: 'list_head', buttonLimit: 3,
                            onButtonClick: buttonClick.bind(this),
                            popContainer: document.querySelector('.header-button-area') })}
                    </div>
                </NCDiv>
                <div className="nc-bill-search-area">
                    {search.NCCreateSearch(this.searchId, {
                        clickSearchBtn: searchBtnClick.bind(this),
                        showAdvBtn: true,
                        onAfterEvent: afterEvent.bind(this),
                        renderCompleteEvent: this.renderCompleteEvent
                    })}
                </div>
                <div className="nc-bill-table-area">
                    {table.createSimpleTable(this.tableId, {
                        fieldid: "recbill",
                        dataSource: dataSource,          // ★ 传了它会自动做列表缓存
                        pkname: pkname,
                        handlePageInfoChange: pageInfoClick,
                        showCheck: true, showIndex: true,
                        onRowDoubleClick: doubleClick.bind(this),
                        onSelected: this.onSelected.bind(this),
                        onSelectedAll: this.onSelected.bind(this),
                        componentInitFinished: () => this.onSelected()
                    })}
                </div>
                {/* 弹窗：各业务 Model / BillTrack / PrintOutput / ExcelImport / ApprovalTrans */}
            </div>
        );
    }
}

List = createPage({})(List);
export default List;
```

## 10. 查询区条件还原（`renderCompleteEvent`）

列表↔卡片往返时，查询条件要还原到查询区（注意日期字段是区间）：

```js
renderCompleteEvent = () => {
    let cachesearch = getDefData(searchKey, dataSource);
    if (cachesearch && cachesearch.conditions) {
        for (let item of cachesearch.conditions) {
            if (item.field == 'billdate') {
                this.props.search.setSearchValByField(this.searchId, item.field,
                    { display: item.display, value: [item.value.firstvalue, item.value.secondvalue] });
            } else {
                this.props.search.setSearchValByField(this.searchId, item.field,
                    { display: item.display, value: item.value.firstvalue });
            }
        }
    }
};
```

## 11. 列表页专属工具

| 工具 | 出处 | 用途 |
| --- | --- | --- |
| `onListButtonControl(this)` | `pubUtils/buttonvisible` | 按选中行重算按钮态 |
| `getInnerButtonkey(button)` | 同上 | 从按钮定义里取行内按钮 |
| `buttonVisible(status, record, key)` | 同上 | 单行按钮可见性 |
| `listSocketConnect / listSocketOpr` | `pubUtils/MicroServiceSocket` | 微服务联查挂点 |
| `OperationColumn` | `pubUtils/arapConstant` | 操作列标准宽度 |
| `modifierSearchMetas` | `pubUtils/arapListSearchRefFilter` | 查询区参照过滤（见 `refer-filter.md`） |

## 12. 已知坑

1. **`createSimpleTable` 不传 `dataSource` 就没有列表缓存**，从卡片返回列表会重新查一次；
2. **删行后必须同时 `deleteCacheId`**，否则翻回来还在：
   ```js
   props.table.deleteTableRowsByIndex(tableId, data.successIndexs);
   props.table.deleteCacheId(tableId, data.successPKs);
   ```
3. **`type` 是弹窗判定用的保留名**：`tableButtonClick` 第 7 个参数（表体编辑前事件里的 `type`）为 `'model'` 时区域编码要换成 `bodys_edit`（侧拉编辑场景）。
4. **`pagecode` 常取 `record.pk_tradetype.value`（交易类型）** —— 单据长什么样由交易类型决定。
5. **`createPage({})(List)` 的 `({})` 不能省**，省了就没有 `props.table` 等注入。

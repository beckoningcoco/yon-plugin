# NCC 前端脚手架 · 卡片页模板（可复制）

> **什么时候读我**：要新建或改写一个卡片页（`card/`）、要理解保存/提交/公式校验流程、要排查"保存后数据没回写"。
> 样本：`src/arap/receivablebill/recbill/card/`（`index.js` 1729 行 + `events/` 六个文件）。

---

## 一、常量（与列表页对照）

| 常量 | list | card |
| --- | --- | --- |
| 表头/查询区 | `searchId = 'query'` | `formId = 'head'` |
| 表体/列表区 | `tableId = 'list'` | `tableId = 'bodys'` |
| 节点标识 | `nodekey = 'list'` | `nodekey = 'card'` |
| 转单左区 | — | `leftarea = 'left'` |
| 缓存键 | `dataSource = 'fi.arap.recbill.20060RBM'` | **同一个值** |
| 主键名 | `pkname = 'pk_recbill'` | 同 |
| 联查页 | `searchKey` | `linkPageId = '20060RBM_LIST_LINK'` |

> **区域编码由模板定义，不能自己改**。列表↔卡片能对上数据的前提是共用 `dataSource` + `pkname`。

## 二、`index.js` 方法地图（36 个方法，按职责分组）

| 职责 | 方法 |
| --- | --- |
| 页面码/路由 | `getPagecode`、`getExportPageCode` |
| **首屏加载** | `initShow` |
| 转单 | `getTransferValue`、`synTransferData` |
| 新增 | `initAdd` |
| 状态切换 | `toggleShow`、`onSelected` |
| **保存/删除/提交** | `saveBill`、`delConfirm`、`commitAndUncommit`、`commitInSaveAndCommit`、`pause`、`cancel`、`saveSureBtnClick`、`deleteBillSureBtnClick`、`cancelClick`、`cancelClickInCommit`、`clearExType` |
| 弹窗控制 | `handleTaxInformation`、`handleCombined`、`handleLinkTerm`、`closeApprove`、`onHideUploader`、`modelSaveClick`、`modelDelRow`、`modelAddRow` |
| 打印输出 | `onPrint`、`officalPrintOutput`、`cancelPrintOutput`、`printOutput` |
| 导航 | `backList`、`backTransfer` |
| 交易类型 | `switchTemplate` |
| 工具 | `setFormTsVal`、`getTableHead` |

两个成员变量：

```js
this.Info = {           // 不触发重绘的全局量（放 this 上，不放 state）
    allButtonsKey: [], combinedExaminationData: [], linkTermData: [], tbbLinkSourceData: null,
    selectedPKS: [], tipContent: null, tipUrl: null, exType: null, flag: false,
    pk_bill: null, ts: null, billCard: null, compositedata: null,
    isModelSave: false, saveflag: false
};
this.dataInSaga = { appcode, pagecode, butncode }   // 随每次请求发出的埋点信息
```

`constructor` 里另有三份"提交用数据模板"：`this.printData`、`this.outputData`（打印/输出参数）。

## 三、`initShow`：用 URL 参数决定场景（七分支）

```js
initShow = () => {
    let transfer = this.props.getUrlParam('type') === 'transfer';
    if (transfer && this.props.getUrlParam('status') != 'browse') {
        // ① 转单：从 transferTable 取选中的来源单据 id
        let transferIds = this.props.transferTable.getTransferTableSelectedId(this.headId);
        this.getTransferValue(transferIds);

    } else if (this.props.getUrlParam('scene') == 'fip') {
        // ② 联查来源单据
        linkSourceCard(this.props, linkPageId, 'pk_recbill', this.formId, this.tableId, pkname, dataSource, this);

    } else if (this.props.getUrlParam('scene') == 'linksce'
               && this.props.getUrlParam('flag') == 'ftsLinkArap') {
        // ③ 资金联查应收应付
        cmpLinkArapCard(...);

    } else if (this.props.getUrlParam('type') === 'copy') {
        // ④ 复制：ajax copy.do → setAllFormValue/setTableData → 置编辑态

    } else if (status == 'edit' || status == 'browse') {
        // ⑤ 浏览/修改：ajax cardquery.do（见下）

    } else if (status == 'add' && this.props.getUrlParam('srcbilltype')) {
        // ⑥ 推单新增：数据已在 initTemplate 里拿到（this.data）

    } else if (status == 'add') {
        // ⑦ 新增：initAdd() 向后端要默认值

    } else {
        this.toggleShow();
    }
};
```

**「浏览/修改」分支的标准动作**（照抄就能跑通一次卡片查询）：

```js
ajax({
    url: '/nccloud/arap/recbill/cardquery.do',
    data: { pk_bill: this.props.getUrlParam('id') },
    success: (res) => {
        this.props.beforeUpdatePage();                       // ← 打开批量渲染开关
        res.data.head && this.props.form.setAllFormValue({ [this.formId]: res.data.head[this.formId] });
        res.data.body && this.props.cardTable.setTableData(this.tableId, res.data.body[this.tableId]);
        if (this.props.getUrlParam('status') == 'edit') {
            billEditProperties(this, this.props.getUrlParam('id'), this.billType, this.props.getSearchParam('c'));
            cardFieldsEditable(this);                        // 字段级可编辑性
        }
        if (!this.props.getUrlParam('scene')) {              // 回写交易类型到 URL
            this.props.setUrlParam({ pagecode: res.data.head[this.formId].rows[0].values.pk_tradetype.value });
        }
        let status = this.props.getUrlParam('status');
        this.props.cardTable.setStatus(this.tableId, status);
        this.props.form.setFormStatus(this.formId, status);
        throwSagaErrorAgency.call(this, res);                // ← 后端埋点异常统一抛出
        this.props.updatePage(this.formId, this.tableId);    // ← 关闭批量渲染开关
        updateCache(pkname, this.props.getUrlParam('id'), res.data, this.formId, dataSource);
        this.toggleShow('', res);                            // ← 重算按钮态
    },
    error: (res) => {
        this.props.form.EmptyAllFormValue(this.formId);
        this.props.cardTable.setTableData(this.tableId, { rows: [] });
        this.props.setUrlParam({ status: 'browse', id: null });
        deleteCacheById(pkname, this.props.getUrlParam('id'), dataSource);
        this.props.cardTable.setStatus(this.tableId, 'browse');
        this.props.form.setFormStatus(this.formId, 'browse');
        this.toggleShow();
        toast({ color: 'danger', content: res.message });
    }
});
```

另有 `componentWillMount` 里的离开保护：

```js
window.onbeforeunload = () => {
    let status = this.props.getUrlParam('status');
    if (status == 'edit' || status == 'add') return '';       // 编辑态离开时浏览器弹确认
};
```

## 四、`render` 骨架（两条互斥分支）

```js
render() {
    const { cardTable, form, cardPagination, modal, button, transferTable } = this.props;
    const { createBillHeadInfo } = this.props.BillHeadInfo;
    const { createCardTable } = cardTable;
    const { createCardPagination } = cardPagination;   // ★ 卡片页特有：上一张/下一张
    const { createForm } = form;

    if (this.props.getUrlParam('type') == 'transfer') {
        // A. 转单页：左侧来源单据列表 + 右侧表单/表体
        return (
            <div id="transferCard" className="nc-bill-transferList">
                <NCAffix offsetTop={0}>
                    <NCDiv areaCode={NCDiv.config.HEADER} className="nc-bill-header-area">
                        <div className="header-title-search-area">
                            {createBillHeadInfo({ title: ..., backBtnClick: () => this.backTransfer() })}
                        </div>
                        <div className="header-button-area">
                            {cardSocketConnect.call(this, 'card_head', dataSource)}   // 微服务联查挂点
                            {cardSocketErrorFlag.call(this, 'card_head')}
                            {button.createButtonApp({ area: 'card_head', buttonLimit: 3,
                                onButtonClick: transferButtonClick.bind(this),
                                popContainer: document.querySelector('.header-button-area') })}
                        </div>
                    </NCDiv>
                </NCAffix>
                <div className="nc-bill-transferList-content">
                    {transferTable.createTransferList({
                        headcode: this.formId, bodycode: this.tableId, transferListId: this.leftarea,
                        onTransferItemSelected: (record, status, index) => { /* 切换来源单据 → 刷新右侧 */ }
                    })}
                    <div className="transferList-content-right nc-bill-card">
                        <div className="nc-bill-form-area">{createForm(this.formId, {...})}</div>
                        <div className="nc-bill-table-area">{createCardTable(this.tableId, {...})}</div>
                    </div>
                </div>
            </div>
        );
    } else {
        // B. 常规卡片：上（标题+按钮+分页+表单） 下（表体）
        return (
            <div className="nc-bill-card">
                <div className="nc-bill-top-area">
                    <NCAffix offsetTop={0}>
                        <NCDiv areaCode={NCDiv.config.HEADER} className="nc-bill-header-area">
                            <div className="header-title-search-area">
                                {createBillHeadInfo({ title: ..., backBtnClick: () => this.backList() })}
                            </div>
                            <div className="header-button-area">
                                {cardSocketConnect.call(this, 'card_head', dataSource)}
                                {/* 交易类型按钮：默认场景才显示 */}
                                {!this.props.getUrlParam('scene') && !getContext(loginContextKeys.transtype) ? (
                                    <div className="trade-type">
                                        {TradeTypeButton({ ref: 'tradetypeBtn', billtype: 'F0',
                                            dataSource: dataSource, switchTemplate: this.switchTemplate.bind(this) })}
                                    </div>
                                ) : null}
                                {button.createButtonApp({ area: 'card_head', buttonLimit: 3,
                                    onButtonClick: buttonClick.bind(this),
                                    popContainer: document.querySelector('.header-button-area') })}
                            </div>
                            {/* 卡片分页：默认场景或联查场景才显示 */}
                            {(!scene || scene == 'linksce' || scene == 'fip') ? (
                                <div className="header-cardPagination-area" style={{ float: 'right' }}>
                                    {createCardPagination({ handlePageInfoChange: pageInfoClick.bind(this),
                                                            dataSource: dataSource })}
                                </div>
                            ) : null}
                        </NCDiv>
                    </NCAffix>
                    <div className="nc-bill-form-area">
                        {createForm(this.formId, {
                            fieldid: "receivablebill",
                            onAfterEvent: afterEvent.bind(this),
                            onBeforeEvent: formBeforeEvent.bind(this)     // 参照过滤入口
                        })}
                    </div>
                </div>
                <div className="nc-bill-bottom-area">
                    <div className="nc-bill-table-area">
                        {createCardTable(this.tableId, {
                            fieldid: "receivablebill",
                            tableHead: this.getTableHead.bind(this, buttons),  // ★ 肩部按钮
                            modelSave: this.modelSaveClick.bind(this),         // 侧拉编辑保存
                            onAfterEvent: afterEvent.bind(this),
                            onBeforeEvent: bodyBeforeEvent.bind(this),         // 表体参照过滤
                            modelAddRow: this.modelAddRow.bind(this),
                            modelDelRow: this.modelDelRow.bind(this),
                            onSelected: this.onSelected.bind(this),
                            onSelectedAll: this.onSelected.bind(this),
                            showCheck: true, showIndex: true, adaptionHeight: true
                        })}
                    </div>
                </div>
                {/* 弹窗 + 三个 createModal + ApprovalTrans */}
            </div>
        );
    }
}
```

**三个平台弹窗注册**（都靠 `this.Info.tipContent` 喂内容）：

```js
{createModal('saveCheck', {
    title: this.state.json['receivablebill-000046'],   // 异常提示信息
    content: this.Info.tipContent,
    closeModalEve: () => { this.Info.flag = true; this.Info.exType = null; },
    beSureBtnClick: this.saveSureBtnClick.bind(this)
})}
{createModal('deleteCheck',    { ..., beSureBtnClick: this.deleteBillSureBtnClick.bind(this) })}
{createModal('commitAndUncommit', { ..., beSureBtnClick: this.commitAndUncommit.bind(this),
                                         cancelBtnClick: this.cancelClick.bind(this) })}

{this.state.compositedisplay ? (
    <ApprovalTrans title={...} data={this.Info.compositedata} display={this.state.compositedisplay}
                   getResult={this.commitInSaveAndCommit.bind(this)} cancel={this.cancelClickInCommit.bind(this)} />
) : null}
```

**肩部按钮**：

```js
getTableHead = (buttons) => (
    <span>
        {this.props.button.createButtonApp({
            area: 'card_body', buttonLimit: 3,
            onButtonClick: buttonClick.bind(this),
            popContainer: document.querySelector('.header-button-area')
        })}
    </span>
);
```

> 卡片页 render 里有几处**重复的 JSX 属性**（`hideAdd`、`adaptionHeight` 各出现两次），是标准产品自带的冗余，抄模板时删掉。

## 五、性能开关：`beforeUpdatePage` / `updatePage`

**成对使用**，把"批量设值"包在中间，避免每个字段都触发一次重绘：

```js
this.props.beforeUpdatePage();                     // 暂停渲染
this.props.form.setAllFormValue({...});
this.props.cardTable.setTableData(...);
this.props.form.setFormStatus(this.formId, 'edit');
this.props.cardTable.setStatus(this.tableId, 'edit');
this.props.updatePage(this.formId, this.tableId);  // 一次性重绘
```

另有上下文开关：改财务组织后 `this.props.resMetaAfterPkorgEdit()` 让模板按新组织重置。

## 六、`saveBill` 全解（卡片页最重要的流程）

```js
saveBill = (url, extype, flag, modelIndex) => {
    // ① 校验（暂存跳过）
    if (url != '/nccloud/arap/arappub/tempsave.do') {
        let checkCardData = this.props.createMasterChildData(this.getPagecode(), this.formId, this.tableId);
        delBlankLine(this, this.tableId, this.billType, checkCardData, modelIndex);   // 删空白行
        if (!this.props.form.isCheckNow(this.formId)) return;                 // 表头必输校验
        if (!this.props.cardTable.checkTableRequired(this.tableId)) return;   // 表体必输校验
    }
    // ② 组装提交数据
    let cardData    = this.props.createMasterChildData(this.getPagecode(), this.formId, this.tableId);
    let newCardData = dealCardData(this, cardData);        // 去掉空值，减少压缩时间
    let datas = Object.assign({ cardData: newCardData,
                                uiState: this.props.getUrlParam('status'),
                                extype, flag }, this.dataInSaga);
    // ③ 请求
    let callback = () => {
        ajax({ url, data: datas, success: (res) => {
            if (res.data.exType == '1') { /* 业务异常：填 Info → modal.show('saveCheck') 或走指派 */ }
            else if (res.data.exType == '2') { /* 另一类异常，同上 */ }
            else if (res.data.exType == '3') { /* 普通异常：捕获 message，保存结果仍回写 */ }
            else if (res.data.assignInfo && /approveflow|workflow/.test(res.data.assignInfo.workflow)) {
                this.Info.compositedata = res.data.assignInfo;
                this.Info.tipUrl = '/nccloud/arap/arappub/saveandcommit.do';
                this.setState({ compositedisplay: true });     // 弹「指派」框
                return;
            }
            // ④ 正常保存：回写 + 转浏览态 + 写缓存 + 改 URL
            if (res.data) {
                this.props.beforeUpdatePage();
                res.data.head && this.props.form.setAllFormValue({ [this.formId]: res.data.head[this.formId] });
                res.data.body && this.props.cardTable.updateDataByRowId(this.tableId, res.data.body[this.tableId]);
                this.props.cardTable.setStatus(this.tableId, 'browse');
                this.props.form.setFormStatus(this.formId, 'browse');
                this.props.updatePage(this.formId, this.tableId);
                let newCardData = this.props.createMasterChildData(this.getPagecode(), this.formId, this.tableId);
                if (this.props.getUrlParam('status') == 'add') addCache(pk_recbill, newCardData, this.formId, dataSource);
                else                                            updateCache(pkname, pk_recbill, newCardData, this.formId, dataSource);
                this.props.setUrlParam({ status: 'browse', id: pk_recbill, pagecode: pk_tradetype });
                toast({ color: 'success', content: this.state.json['receivablebill-000026'] });   // 保存成功
            }
        }});
    };
    // ⑤ 关键：保存前先跑平台公式校验
    this.props.validateToSave(datas.cardData, callback, { table1: 'cardTable' }, 'card');
};
```

**必须记住的三件事**：

1. 保存参数是 `{ cardData, uiState, extype, flag, ...dataInSaga }`，
   其中 `cardData = props.createMasterChildData(pagecode, formId, tableId)` —— **不要自己拼 head/body**；
2. 后端用 `exType` 表达"需要二次交互"：`1`/`2` 弹框确认后再发一次，配合
   `Info.tipUrl`（`save.do` → `saveandcommit.do`）、`Info.pk_bill`、`Info.exType`、`Info.flag`；
3. **`validateToSave` 是平台公式引擎入口，必须包在最外层**，否则单据模板里配的校验公式不生效。
   列表页对应写法：`this.props.validateToSave(data.billCard.bodys, save, { [tableid]: 'table' }, 'grid')`。

## 七、`afterEvent`：前端不自己算，交给后端公式 ★ 核心机制

### 7.1 签名

```js
export default function afterEvent(props, moduleId, key, value, changedrows, i, s, g)
// moduleId    触发区域：formId（表头）或 tableId（表体）
// key         变更字段编码
// value       新值（参照类字段含 {refpk, dispname}）
// changedrows 新旧值集合
// i           表体行号
```

开头两个固定动作：

```js
if (changedrows instanceof Array) {
    if (changedrows[0].newvalue.value == changedrows[0].oldvalue.value) return;   // 值没变直接返回
}
let index = moduleId == this.formId ? 0 : (moduleId == this.tableId ? i : 0);
```

### 7.2 表头：`createHeadAfterEventData` / `createFormAfterEventData`

```js
if (moduleId == formId) {
    switch (key) {
        case 'pk_org_v':  /* 组织变更要清空重来 —— promptBox 确认后 initAdd(true) */ break;
        case 'customer':
            data = {
                pageId: pagecode,
                formEvent: props.createFormAfterEventData(pagecode, this.formId, this.tableId, key, value),
                colValues: getColvalues(this.props, this.tableId,
                            ['pk_org_v','pk_org','payaccount','pk_currtype','customer','buysellflag',
                             'objtype','direction','pk_billtype', ...].concat(moneyAndRateFields)),
                rowids: getRowIds(this.props, this.tableId),
                uiState: this.props.getUrlParam('status')
            };
            headFieldAfterRequest.call(this, data, key, changedrows);
            break;
        default:
            data = { pageId: pagecode,
                     event: props.createHeadAfterEventData(pagecode, this.formId, this.tableId, moduleId, key, value),
                     uiState: this.props.getUrlParam('status') };
            headFieldAfterRequest.call(this, data, key, changedrows);
            break;
    }
}
```

统一收口函数（**"公式引擎"的调用点**）：

```js
export function headFieldAfterRequest(requestData, key, changedrows) {
    ajax({
        url: '/nccloud/arap/recbill/cardHeadAfterEdit.do',
        data: requestData,
        async: false,                                   // ★ 必须同步：后面的渲染依赖返回值
        success: (res) => {
            headAfterEventRenderData(this, res);        // 把后端算出的值渲染回页面
            formulamsgHint(this, res);                  // 编辑公式的提示信息
            if (key == 'pk_org_v') { this.props.resMetaAfterPkorgEdit(); this.state.buttonfalg = true; }
            if (this.props.getUrlParam('type') == 'transfer') this.synTransferData();
        },
        error: (res) => errorDeal(this, res, changedrows, key)   // 出错要回滚单元格值
    });
}
```

### 7.3 表体：`cardBodyAfterEdit.do`

```js
if (moduleId == tableId) {
    let colValues = getColvalues(this.props, this.tableId, GROUP_KEYS_LIST);   // 合并算税需要的整列值
    ajax({
        url: '/nccloud/arap/recbill/cardBodyAfterEdit.do',
        data: {
            rowindex: 0, editindex: index, pageId: pagecode, changedrows,
            tableId: this.tableId,
            body: props.cardTable.getDataByIndex(this.tableId, index),
            formEvent: props.createFormAfterEventData(pagecode, this.formId, this.tableId, key, value),
            uiState: this.props.getUrlParam('status'),
            colValues
        },
        async: false,
        success: (res) => {
            bodyAfterEventRenderData(this, res);                              // 渲染
            if (i == 0 && key == 'pk_currtype') currentTypeAfterFormEvents(this.formId, props, 'pk_currtype');
            if (this.props.getUrlParam('type') == 'transfer') this.synTransferData();
            formulamsgHint(this, res);
        },
        error: (res) => {
            if (res.message.substring(0,16) == 'convertException') {
                promptBox({ /* 折算误差：让用户选确定/取消，再带 isCalculateConvert 重发 */ });
            } else {
                this.props.cardTable.setValByKeyAndRowId(this.tableId, i, key, changedrows);  // 回滚
                toast({ color: 'danger', content: res.message });
            }
        }
    });
    autoAddline.call(this, moduleId, pagecode, key, i);       // 末行编辑后自动增行
}
```

### 7.4 心智模型

```
用户改一个字段
   → 前端只负责"收集上下文"（本行数据 + 整列值 + 表头值 + uiState）
   → POST 到后端的 xxxAfterEdit.do
   → 后端跑「单据模板公式」，算出所有该联动的字段
   → 前端拿到结果统一渲染（renderData）+ 显示公式提示
```

**结论：二开时不要在前端手写联动计算** —— 把公式配在单据模板里，这套代码会自动执行。
只有当模板公式表达不了时，才在这个 `switch(key)` 里加分支。

## 八、可用工具（arap 公共件）

| 工具 | 出处 | 用途 |
| --- | --- | --- |
| `bodyBeforeEvent` / `formBeforeEvent` | `pubUtils/arapFormRefFilter`、`arapTableRefFilter` | 表头/表体参照过滤（见 `refer-filter.md`） |
| `dealCardData` | `pubUtils/dealCardData` | 保存前清空值 |
| `billEditProperties` / `cardFieldsEditable` | `pubUtils/billFieldEditableUtil` | 字段级可编辑性 |
| `delBlankLine` / `calculateHeadMoney` | `pubUtils/billPubUtil` | 删空行 / 表头金额计算 |
| `updatePandC` | `pubUtils/updatePandC` | 价税处理 |
| `throwSagaErrorAgency` | `pubUtils/MicroServiceSocket` | 后端埋点异常统一抛出 |
| `getColvalues` / `getRowIds` | `pubUtils/billPubUtil` | 编辑后事件取整列值/行 id |
| `TradeTypeButton` | `components/tradetype` | 交易类型下拉，切换后 `switchTemplate` 重拉按钮 |
| `ApprovalTrans` | `high` | 指派信息弹框 |

# NCC 应付单卡片前端实战参考

> 数据来源：协合运维NCC2111项目实际前端源码分析
> 核心模块：arap/payablebill（应付管理）
> 最后更新：2026-05-07

---

## 1. 应付单前端目录结构

```
src/arap/payablebill/payablebill/
├── main/                    # 入口
│   ├── index.js             # RenderRouter 启动
│   ├── router.js            # 路由配置（List/Card/Transfer/联查等）
│   └── config.json          # 依赖模块声明（dependjs/dependModuleName）
├── list/                    # 列表页
│   ├── index.js
│   ├── constants.js
│   └── events/              # buttonClick, searchBtnClick, initTemplate, doubleClick 等
├── card/                    # 卡片页（核心，最复杂）
│   ├── index.js             # Card 主组件（~2250行）
│   ├── constants.js         # 常量定义
│   └── events/
│       ├── buttonClick.js   # 头部+肩部按钮事件分发
│       ├── afterEvent.js    # 表单/表体编辑后事件
│       ├── initTemplate.js  # 模板初始化（createUIDom）
│       ├── pageInfoClick.js # 翻页事件
│       ├── tableButtonClick.js # 表体行内按钮事件
│       ├── transferButtonClick.js # 转单事件
│       └── index.js         # 统一导出
└── transfer/                # 转单页
    ├── index.js
    ├── constants.js
    └── btnClick/, init/
```

### 1.1 辅助组件目录

```
src/arap/payablebill/
├── stockInDetailModal/      # 入库明细弹框组件（EAM集成）
│   └── card/
│       ├── index.js         # StockInDetailModal 组件
│       └── events/
│           ├── initTemplate.js  # 弹框模板初始化
│           └── afterEvent.js
└── payablebillinvoice/      # 个人票夹组件
    └── card/
        ├── index.js         # InvoiceWallet 组件
        ├── requestApi.js    # 发票接口
        └── events/
            └── invoiceShow.js  # 发票查看 ModalWrapper
```

---

## 2. 核心常量定义（constants.js）

```javascript
export const formId = 'head';          // 表头区域ID
export const tableId = 'bodys';        // 表体区域ID
export const billType = 'F1';          // 单据类型（F1=应付单）
export const tradeType = 'D1';         // 默认交易类型
export const leftarea = 'left';        // 转单左侧区域
export const nodekey = "card";         // 模板节点标识
export const dataSource = 'fi.arap.payablebill.20080PBM';  // 缓存Key
export const pkname = 'pk_payablebill'; // 主键字段名
export const linkPageId = '20080PBM_LIST_LINK'; // 联查列表页ID
```

### 2.1 EAM集成自定义字段

| 字段编码 | 字段名称 | 适用单据 | 说明 |
|----------|----------|----------|------|
| `def77` | EAM关联标识 | 应付单 | 是/否，标识该行是否关联EAM入库明细 |
| `def78` | EAM入库明细关联主键 | 应付单 | 存储EAM入库明细节点的主表主键 |
| `def77` | EAM关联标识 | 付款单 | 同上 |
| `def78` | EAM入库明细关联主键 | 付款单 | 同上 |
| `defitem79` | EAM关联标识 | 报销单 | 同上 |
| `Defitem80` | EAM入库明细关联主键 | 报销单 | 同上 |

---

## 3. Card 主组件架构

### 3.1 初始化流程

```
constructor → componentWillMount → getMultiLang → initTemplate → initShow
    ↓
initShow 根据 URL 参数走不同分支：
  - type=transfer → getTransferValue (转单)
  - scene=fip → linkSourceCard (联查)
  - status=edit/browse → ajax querycard (查询单据)
  - status=add → initAdd (新增默认值)
  - type=copy → ajax copy (复制)
```

### 3.2 props.use 注册（constructor 中）

```javascript
props.use.form(formId);           // 注册表头表单
props.use.cardTable(tableId);     // 注册表体卡片表格
```

### 3.3 关键 state 结构

```javascript
this.state = {
    isCombinedExaminationModelShow: false,  // 联查处理情况
    isLinkTermModelShow: false,             // 联查收付款协议
    isTbbLinkshow: false,                   // 联查执行预算
    showBillTrack: false,                   // 单据追溯
    showUploader: false,                    // 附件管理
    showApproveDetail: false,               // 审批详情
    compositedisplay: false,                // 指派信息弹框
    showInvoiceWallet: false,               // 个人票夹
    checkInvoceIsHidden: true,              // 右侧发票查验
    json: {},                               // 多语言资源
    modalCfg: {                             // 发票查看弹框配置
        width, data, pk_bills, show,
        showCloseButton, title, content,
        onAfterSureEvent, onAfterCloseEvent
    },
    stockModalCfg: {                        // 入库明细弹框配置
        show, showCloseButton, title, content,
        onAfterSureEvent, onCancel
    },
    table: {                                // 弹框表格选中状态
        selectedRow, selectedIndex
    }
};
```

### 3.4 Info 全局变量（不触发渲染）

```javascript
this.Info = {
    allButtonsKey: [],       // 所有表体头部按钮
    linkTermData: [],        // 联查收付款协议数据
    combinedExaminationData: [], // 联查处理情况数据
    tbbLinkSourceData: null, // 联查预算数据
    billCode: '',            // 发票号
    selectedPKS: [],         // 导出数据主键
    pullBillInfoVOAry: [],   // 拉单使用
    tipContent: null,        // 异常提示内容
    tipUrl: null,            // 异常提示URL
    exType: null,            // 异常类型
    flag: false,             // 异常交互参数
    pk_bill: null,           // 异常交互主键
    ts: null,                // 时间戳
    billCard: null,          // 保存后返回的单据
    compositedata: null,     // 指派信息数据
    isModelSave: false,      // 是否整单保存
    saveflag: false,         // 保存提交标识
};
```

---

## 4. 按钮事件分发机制

### 4.1 按钮区域划分

| 区域 | area编码 | 位置 | 事件处理函数 |
|------|----------|------|-------------|
| 头部按钮 | `card_head` | 卡片顶部按钮区 | `buttonClick.bind(this)` |
| 肩部按钮 | `card_body` | 表体上方 | `buttonClick.bind(this)` |
| 行内按钮 | `card_inner` | 表体每行操作列 | `tableButtonClick` |

### 4.2 按钮注册与渲染

```javascript
// 头部按钮
{this.props.button.createButtonApp({
    area: 'card_head',
    buttonLimit: 3,  // 最多显示3个，其余放入"更多"
    onButtonClick: buttonClick.bind(this),
    popContainer: document.querySelector('.header-button-area')
})}

// 肩部按钮（getTableHead方法）
getTableHead = () => {
    return (
        <span>
            {this.props.button.createButtonApp({
                area: 'card_body',
                buttonLimit: 3,
                onButtonClick: buttonClick.bind(this),
                popContainer: document.querySelector('.header-button-area')
            })}
        </span>
    );
};

// 行内按钮（initTemplate 中添加操作列）
meta[tableId].items.push({
    itemtype: 'customer',
    attrcode: 'opr',
    render: (text, record, index) => {
        let trueBtn = cardBodyAndInnerButtonVisible(this, ...);
        return props.button.createOprationButton(trueBtn, {
            area: "card_inner",
            buttonLimit: 3,
            onButtonClick: (props, key) => tableButtonClick(this, props, key, text, record, index)
        });
    }
});
```

### 4.3 buttonClick 事件分发模式

```javascript
export default function (props, id) {
    switch (id) {
        case headButton.Save:      // 保存
            this.saveBill('/nccloud/arap/arappub/save.do');
            break;
        case headButton.Commit:    // 提交
            this.Info.tipUrl = '/nccloud/arap/arappub/commit.do';
            this.commitAndUncommit();
            break;
        case headButton.Add:       // 新增
            this.initAdd();
            break;
        case bodyButton.AddLine:   // 增行
            // 调用addline接口
            break;
        case bodyButton.Wallet:    // 票夹
            this.setState({ showInvoiceWallet: true });
            break;
        case "StockInDetail":      // 入库明细（自定义按钮）
            this.stockInDetail();
            break;
        case "ViewStockInDetail":  // 查看入库明细
            // 待实现
            break;
        default:
            // 转单逻辑
            break;
    }
}
```

---

## 5. 数据操作核心 API 用法

### 5.1 表头表单

```javascript
// 获取表头字段值
let pk_org = this.props.form.getFormItemsValue(formId, 'pk_org').value;
let pk_org_display = this.props.form.getFormItemsValue(formId, 'pk_org_v').display;

// 设置表头字段值
this.props.form.setFormItemsValue(formId, { ts: { value: ts } });

// 设置表单状态
this.props.form.setFormStatus(formId, 'edit');     // 编辑态
this.props.form.setFormStatus(formId, 'browse');   // 浏览态

// 设置字段禁用
this.props.form.setFormItemsDisabled(formId, { pk_org_v: true });

// 设置整个表单值（后端返回数据）
this.props.form.setAllFormValue({ [formId]: res.data.head[formId] });

// 清空表单
this.props.form.EmptyAllFormValue(formId);
```

### 5.2 表体卡片表格

```javascript
// 获取所有行
let allRows = this.props.cardTable.getAllRows(tableId);

// 获取勾选行
let checkedRows = this.props.cardTable.getCheckedRows(tableId);

// 获取行数
let rowNum = this.props.cardTable.getNumberOfRows(tableId);

// 设置表格数据（后端返回）
this.props.cardTable.setTableData(tableId, res.data.body[tableId]);

// 增行
this.props.cardTable.addRow(tableId, index, rowData);

// 按索引更新行数据
this.props.cardTable.updateDataByIndexs(tableId, [{ index, data }]);

// 按 rowId 更新
this.props.cardTable.updateDataByRowId(tableId, bodyData);

// 设置表格状态
this.props.cardTable.setStatus(tableId, 'edit');
this.props.cardTable.setStatus(tableId, 'browse');

// 设置指定单元格值
this.props.cardTable.setValByKeyAndIndex(tableId, index, 'def16', { value: pk });

// 获取可见行
let visibleRows = this.props.cardTable.getVisibleRows(tableId);

// 获取指定行数据
let rowData = this.props.cardTable.getRowsByIndexs(tableId, 0);
```

### 5.3 构建提交数据

```javascript
// 创建主子表数据（用于提交）
let cardData = this.props.createMasterChildData(pagecode, formId, tableId);

// 数据结构：
// {
//   head: { [formId]: { rows: [{ values: {...}, status: 0/1/2/3 }] } },
//   body: { [tableId]: { rows: [{ values: {...}, status: 0/1/2/3 }] } }
// }
// status: 0=原始 1=修改 2=新增 3=删除
```

### 5.4 行状态说明

| status值 | 含义 | 说明 |
|----------|------|------|
| 0 | 原始 | 未修改的行 |
| 1 | 修改 | 已修改的行 |
| 2 | 新增 | 新增的行 |
| 3 | 删除 | 已删除的行 |

```javascript
// 过滤已删除行
let list = allRows.filter(e => e.status != '3');
```

---

## 6. NCModal 弹框开发模式

### 6.1 模式一：props.modal（简单确认框）

```javascript
// 在 render 中注册
{createModal('saveCheck', {
    title: '异常提示',
    content: this.Info.tipContent,
    beSureBtnClick: this.saveSureBtnClick.bind(this),
    closeModalEve: () => { this.Info.flag = true; this.Info.exType = null; }
})}

// 显示
this.props.modal.show('saveCheck');
```

### 6.2 模式二：NCModal 组件（复杂弹框）

```javascript
const { NCModal } = base;
const { Header, Title, Body, Footer } = NCModal;

// state 中控制显示
this.state = { showInvoiceWallet: false };

// render 中
<NCModal size="xlg" show={this.state.showInvoiceWallet}
    onHide={this.closeWallet}
>
    <NCModal.Header closeButton="true">
        <NCModal.Title>{'个人票夹'}</NCModal.Title>
    </NCModal.Header>
    <NCModal.Body>
        <InvoiceWallet ... />
    </NCModal.Body>
</NCModal>
```

### 6.3 模式三：自定义 ModalWrapper（动态配置）

```javascript
// state 配置
modalCfg: {
    width: '1035',
    data: [],
    pk_bills: '',
    show: false,
    showCloseButton: true,
    title: this.modalTitle,        // 函数返回 JSX
    content: this.modalContent,     // 函数返回 JSX
    onAfterSureEvent: this.onAfterSure,
    onAfterCloseEvent: this.onAfterClose
}

// render
{ this.state.modalCfg.show ? <ModalWrapper {...this.state.modalCfg}/> : "" }
```

### 6.4 入库明细弹框（StockInDetailModal）

```javascript
// 独立组件，通过 createPage 包装
class StockInDetailModal extends Component {
    componentWillMount() {
        let callback = () => { initTemplate.call(this, this.props) };
        getMultiLang({ moduleId: ['payablebill', 'public'], domainName: 'arap',
                       currentLocale: 'simpchn', callback });
    }
    onClose = () => { let { onCancel = ()=>{} } = this.props; onCancel(); }
    onSure = () => { let { onSure = ()=>{} } = this.props; onSure(); }
    render() {
        let modalCfg = { show, size:"xlg", draggable, onHide: this.onClose, ...others };
        return (
            <NCModal {...modalCfg}>
                <Header closeButton={showCloseButton}>
                    <Title>入库明细</Title>
                </Header>
                <Body>
                    {NCCreateSearch("inventorydetailVOQuery", {})}      // 查询区
                    {createCardTable("inventoryitemVOSub", {            // 表格区
                        showCheck: true, showIndex: true
                    })}
                </Body>
                <Footer>
                    <NCButton colors={'primary'} onClick={this.onSure}>{'确定'}</NCButton>
                    <NCButton onClick={this.onClose}>{'取消'}</NCButton>
                </Footer>
            </NCModal>
        );
    }
}
StockInDetailModal = createPage({})(StockInDetailModal);

// 在 Card 中使用
<StockInDetailModal {...stockModalCfg}></StockInDetailModal>

// 打开弹框
stockInDetail = () => {
    this.state.stockModalCfg.show = true;
    this.setState(this.state);
}
```

---

## 7. 模板初始化（initTemplate）

### 7.1 createUIDom 标准模式

```javascript
export default function (props, callback) {
    let pagecode = this.getPagecode();
    let appcode = props.getSearchParam('c');

    props.createUIDom(
        {
            pagecode: pagecode,
            appcode: appcode,
            // 按钮请求（合并到 createUIDom）
            reqDataQueryallbtns: {
                rqUrl: '/arap/arappub/queryallbtns.do',
                rqJson: `{"pagecode":"${pagecode}","appcode":"${appcode}","billtype":"${billType}","tradetype":"${tradetype}"}`,
                rqCode: 'button'
            },
            // 模板请求（合并到 createUIDom）
            reqDataQuerypage: {
                rqUrl: '/arap/arappub/querypage.do',
                rqJson: `{"pagecode":"${pagecode}","appcode":"${appcode}"}`,
                rqCode: 'template'
            }
        },
        function (data) {
            if (data) {
                // 设置模板
                if (data.template) {
                    let meta = modifierMeta(this, props, data.template);
                    props.meta.setMeta(meta);
                }
                // 设置按钮
                if (data.button && data.button.button) {
                    getButtonsKey(button, this.Info.allButtonsKey);
                    this.Info.pullBillInfoVOAry = data.button.pullbillinfo;
                    props.button.setButtons(button);
                }
                // 初始化上下文
                if (data.context) {
                    loginContext(data.context);
                }
                if (callback) callback();
            }
        }
    );
}
```

### 7.2 modifierMeta 模板修改

```javascript
function modifierMeta(that, props, meta) {
    let status = props.getUrlParam('status');
    meta[formId].status = status;
    meta[tableId].status = status;

    // 添加操作列
    meta[tableId].items.push({
        label: '操作',
        itemtype: 'customer',
        attrcode: 'opr',
        width: OperationColumn,
        visible: true,
        fixed: 'right',
        render: (text, record, index) => {
            let trueBtn = cardBodyAndInnerButtonVisible(that, ...);
            return props.button.createOprationButton(trueBtn, {
                area: "card_inner",
                buttonLimit: 3,
                onButtonClick: (props, key) => tableButtonClick(that, props, key, text, record, index)
            });
        }
    });
    return meta;
}
```

---

## 8. 后端接口清单

| URL | 说明 | 请求参数 |
|-----|------|----------|
| `/nccloud/arap/arappub/save.do` | 保存 | cardData, uiState, extype, flag |
| `/nccloud/arap/arappub/commit.do` | 提交 | pk_bill, ts, pageId, billType |
| `/nccloud/arap/arappub/uncommit.do` | 收回 | pk_bill, ts, pageId, billType |
| `/nccloud/arap/arappub/delete.do` | 删除 | pk_bill, ts, billType, extype, flag |
| `/nccloud/arap/arappub/edit.do` | 修改 | pk_bill, billType, sence |
| `/nccloud/arap/arappub/tempsave.do` | 暂存 | cardData, uiState |
| `/nccloud/arap/arappub/saveandcommit.do` | 保存提交 | cardData + commit参数 |
| `/nccloud/arap/arappub/transfer.do` | 转单 | data, pageId, destTradetype, srcBilltype |
| `/nccloud/arap/arappub/copy.do` | 复制 | pk_bill, pageId, billType, type, tradeType |
| `/nccloud/arap/payablebill/querycard.do` | 查询卡片 | pk_bill |
| `/nccloud/arap/payablebill/defvalue.do` | 新增默认值 | isClearPKorg, appcode, pageId, tradeType |
| `/nccloud/arap/payablebillpub/addline.do` | 增行 | createMasterChildData |
| `/nccloud/arap/arappub/queryallbtns.do` | 查询所有按钮 | pagecode, appcode, billtype, tradetype |
| `/nccloud/arap/arappub/querypage.do` | 查询模板 | pagecode, appcode |
| `/nccloud/arap/arappub/cardRefresh.do` | 卡片刷新 | pk_bill, pageId, billType |
| `/nccloud/arap/arappub/print.do` | 打印 | billtype, appcode, nodekey, funcode, oids |
| `/nccloud/arap/arappub/pause.do` | 挂起 | pk_items, pk_bill, ts, pageId, billType |
| `/nccloud/arap/arappub/cancelpause.do` | 取消挂起 | pk_items, pk_bill, ts, pageId, billType |
| `/nccloud/arap/arappub/redback.do` | 红冲 | pk_bill, ts, pageId, billType, tradeType |
| `/nccloud/arap/arappub/prepay.do` | 预收付 | pk_items, pk_bill, ts, pageId, billType |
| `/nccloud/arap/arappub/linkdeal.do` | 联查处理情况 | pk_bill, billType |
| `/nccloud/arap/arappub/linkterm.do` | 联查收付款协议 | pk_bill, billType, pk_items, moduleId |
| `/nccloud/arap/arappub/linktbb.do` | 联查计划预算 | pk_bill, billType |
| `/nccloud/arap/arappub/linkconfer.do` | 联查协同单据 | pk_bill, billType |

---

## 9. 个人票夹集成模式（参考实现）

> 个人票夹与入库明细弹框的交互模式高度相似，可作为入库明细的参考。

### 9.1 票夹弹框打开

```javascript
// 按钮事件
case bodyButton.Wallet:
    let rowlist = this.props.cardTable.getCheckedRows('bodys');
    if (rowlist && rowlist.length > 0) {
        this.setState({ showInvoiceWallet: true });
    } else {
        toast({ content: '请选择数据行', color: 'warning' });
    }
    break;
```

### 9.2 票夹回调模式（全局函数桥接）

```javascript
// 构造函数中注册全局回调
window.pageInvoiceToBxClick = (pjdata) => {
    // 1. 遍历发票数据，汇总金额
    pjdata.invoiceList.forEach(item => { ... });

    // 2. 通过 afterEvent 回写金额到表体行
    afterEvent.call(this, props, tablecode, 'local_money_cr',
        indexrow.values.local_money_cr, args, index);

    // 3. 设置关联主键
    props.cardTable.setValByKeyAndIndex(tablecode, index, 'def16', { value: pk_erminvoice_b });
};
```

### 9.3 数据回写模式

```javascript
// 方式1：直接设置字段值
props.cardTable.setValByKeyAndIndex(tableId, index, 'def16', { value: pk });

// 方式2：通过 afterEvent 触发联动
afterEvent.call(this, props, tablecode, 'local_money_cr',
    indexrow.values.local_money_cr, args, index);

// 方式3：批量更新行数据
props.cardTable.updateDataByIndexs(tableId, [{
    index: allRowsNumber - 1,
    data: { status: 2, values: res.data.body[tableId].rows[0].values }
}]);
```

---

## 10. 缓存机制（cardCache）

```javascript
import { cardCache } from 'nc-lightapp-front';
let { setDefData, getDefData, addCache, getNextId, deleteCacheById,
      getCacheById, updateCache, getCurrentLastId } = cardCache;

// 设置缓存
setDefData('scene', dataSource, scene);
setDefData('sessionTradeType', dataSource, tradetype);

// 获取缓存
let tradetype = getDefData('sessionTradeType', dataSource);

// 新增缓存
addCache(pkname, newCardData, formId, dataSource);

// 更新缓存
updateCache(pkname, id, newCardData, formId, dataSource);

// 删除缓存
deleteCacheById(pkname, id, dataSource);

// 获取下一个ID
let nextId = getNextId(id, dataSource);

// 获取当前最后一个ID
let lastId = getCurrentLastId(dataSource);
```

---

## 11. 交易类型切换（switchTemplate）

```javascript
// 交易类型按钮组件
TradeTypeButton({
    ref: 'tradetypeBtn',
    billtype: 'F1',              // 应付单类型
    dataSource: dataSource,       // 缓存key
    switchTemplate: this.switchTemplate.bind(this)
})

// 切换模板
switchTemplate = () => {
    ajax({
        url: '/nccloud/arap/arappub/queryallbtns.do',
        data: { appcode, pagecode, tradetype, billtype },
        success: (res) => {
            let button = data.button;
            getButtonsKey(button, this.Info.allButtonsKey);
            this.props.button.setButtons(button);
        }
    });
};
```

---

## 12. 联查模式（穿透查询）

### 12.1 联查处理情况

```javascript
// 打开模态框
handleCombined = () => {
    this.setState({ isCombinedExaminationModelShow: true }, () => {
        this.child.modalOpen();
    });
};

// 子组件 ref 回调
onRender = (ref) => { this.child = ref; };
```

### 12.2 联查收付款协议

```javascript
// 先请求数据，再打开模态框
ajax({
    url: '/nccloud/arap/arappub/linkterm.do',
    data: { pk_bill, billType, pk_items, moduleId },
    success: (res) => {
        this.Info.selectedPKS = seletedPks;
        this.Info.linkTermData = res.data;
        this.handleLinkTerm();
    }
});
```

---

## 13. promptBox 确认框

```javascript
import { promptBox } from 'nc-lightapp-front';

promptBox({
    color: 'warning',
    title: '删除',
    content: '确定要删除吗？',
    noFooter: false,
    noCancelBtn: false,
    beSureBtnName: '确定',
    cancelBtnName: '取消',
    beSureBtnClick: this.delConfirm
});
```

---

## 14. 多语言（getMultiLang）

```javascript
import { getMultiLang } from 'nc-lightapp-front';

let callback = (json) => {
    this.setState({ json: json }, () => {
        initTemplate.call(this, this.props, this.initShow);
    });
};
getMultiLang({
    moduleId: ['payablebill', 'public'],  // 模块ID数组
    domainName: 'arap',                    // 领域名
    currentLocale: 'simpchn',              // 简体中文
    callback
});

// 使用多语言
this.state.json['payablebill-000013']  // 删除成功
this.state.json['payablebill-000014']  // 保存成功
```

---

## 15. 页面导航与URL参数

```javascript
// 获取URL参数
let status = this.props.getUrlParam('status');  // edit/browse/add
let id = this.props.getUrlParam('id');
let scene = this.props.getUrlParam('scene');    // linksce/approve/fip/bz/zycl
let type = this.props.getUrlParam('type');      // transfer/copy/redBack
let pagecode = this.props.getSearchParam('c');  // appcode
let pk = this.props.getSearchParam('p');        // pagecode

// 设置URL参数
this.props.setUrlParam({ status: 'browse', id: pk_payablebill });

// 删除URL参数
this.props.delUrlParam('type');

// 页面跳转
this.props.pushTo('/list', { pagecode: '20080PBM_LIST' });
this.props.pushTo('/card', { status: 'add', id: null, pagecode: tradetype });

// 打开其他节点
this.props.openTo(data.url, data.condition);
```

---

## 16. 关键经验总结

### 16.1 弹框组件开发要点

1. **独立组件需用 `createPage({})` 包装**才能使用 props.form/cardTable/search 等高阶API
2. **弹框模板需独立初始化**（StockInDetailModal 有自己的 pagecode: `20H80301_inventorydetailVO`）
3. **弹框显示/隐藏通过 props 传入的 show 控制**，关闭通过回调通知父组件
4. **弹框内的查询区和表格区**使用独立的 areaCode（`inventorydetailVOQuery`/`inventoryitemVOSub`）

### 16.2 数据回写父组件模式

- **简单值设置**：`props.cardTable.setValByKeyAndIndex(tableId, index, key, { value })`
- **触发联动**：`afterEvent.call(this, props, tablecode, key, value, args, index)`
- **批量行更新**：`props.cardTable.updateDataByIndexs(tableId, [{index, data}])`
- **全局函数桥接**：`window.pageInvoiceToBxClick = (data) => { ... }`（个人票夹模式）

### 16.3 容易踩的坑

1. **`this.props.form.getFormItemsValue` 返回的是对象** `{value, display, scale}`，需要 `.value` 取值
2. **行数据中 values 的字段也是对象**：`row.values.pk_payableitem.value`
3. **`createMasterChildData` 构建的数据结构**中 head/body 的 key 是 areaCode
4. **`updateDataByRowId` 和 `updateDataByIndexs` 是不同的更新方式**，前者按 rowId 匹配，后者按索引
5. **URL 参数和 Search 参数不同**：`getUrlParam` 用于 hash 路由参数，`getSearchParam` 用于查询字符串
6. **`props.beforeUpdatePage()` 和 `props.updatePage()`** 是渲染性能优化开关，成对使用

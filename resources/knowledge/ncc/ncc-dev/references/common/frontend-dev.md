# NCC 前端开发知识参考

> 数据来源：NCC 高级版官方文档 1.20.1~1.20.4
> 适用场景：NCC 前端开发、低代码前端定制、组件使用
> 核心框架：React + nc-lightapp-front
> 最后更新：2026-04-27

---

## 1. ES6 与 React 基础（1.20.1）

### 1.1 React 核心概念

| 概念 | 说明 |
|------|------|
| **state** | 组件内部状态对象，组件自己控制，可受 props 影响。改变 state 触发重新渲染 |
| **props** | 组件间交互传递信息的对象。父组件→子组件传数据，子组件→父组件通过回调方法反馈 |
| **受控组件** | value 绑定 state，onChange 事件更新 state，state 变化驱动 DOM 更新。如 `NCFormControl` 的 value 绑定 `this.state.inputVal` |
| **JSX** | React 的语法扩展，在 JS 中写类 HTML 结构。NCC 开发中所有模板都是 JSX 写法 |
| **生命周期** | React 组件有完整生命周期（类似 Spring/Servlet），关键阶段：constructor → componentWillMount → render → componentDidMount → componentWillUnmount |

### 1.2 受控组件模式（NCC 中最常用）

```javascript
// NCFormControl 受控组件示例
import { base, createPage } from 'nc-lightapp-front';
const { NCFormControl } = base;

class Test extends Component {
    constructor(props) {
        super(props);
        this.state = { inputVal: '' };
    }
    onChange = (value) => {
        this.setState({ inputVal: value });  // state 更新 → 组件重新渲染
    }
    render() {
        return (
            <NCFormControl
                value={this.state.inputVal}   // 绑定 state
                onChange={this.onChange}       // 更新 state
            />
        );
    }
}
Test = createPage({})(Test);
```

### 1.3 组件间通信模式

```
父组件                                  子组件
  │                                      │
  ├──→ props（数据传递） ─────────────────→│
  │                                      │
  │←── 回调方法（子→父反馈） ───────────────┤
```

> 典型场景：父组件让 ModalWrapper 弹出时传 `show`；父组件期待弹窗反馈时传回调方法，弹窗通过回调通知父组件。

### 1.4 前端包核心引入

```javascript
import React, { Component } from 'react';
import { base, createPage } from 'nc-lightapp-front';
// base: 基础组件（NCFormControl、NCButton、NCModal 等）
// createPage: 高阶组件包装器，所有页面组件必须用它包装
```

---

## 2. 平台常用基础组件（1.20.2）

> 83 页文档，7 大基础组件

### 2.1 组件总览

| 组件 | 引入方式 | 用途 |
|------|----------|------|
| `NCFormControl` | `const { NCFormControl } = base;` | 输入框（文本框） |
| `NCCheckbox` | `const { NCCheckbox } = base;` | 复选框 |
| `NCSelect` | `const { NCSelect } = base;` | 下拉选择框 |
| `NCTooltip` | `const { NCTooltip } = base;` | 提示气泡 |
| `NCModal` | `const { NCModal } = base;` | 模态弹窗 |
| `NCTabs / NCTabPane` | `const { NCTabs, NCTabPane } = base;` | 选项卡 |
| `NCTable` | `const { NCTable } = base;` | 基础表格 |
| `NCTree` | `const { NCTree } = base;` | 基础树组件 |

### 2.2 NCFormControl（输入框）

```javascript
<NCFormControl
    value={this.state.inputVal}
    onChange={(value) => this.setState({ inputVal: value })}
    onFocus={(e) => console.log(e.target.value)}  // 注意：onFocus 参数是事件对象
    onBlur={(e) => console.log(e.target.value)}     // 注意：onBlur 参数也是事件对象
/>
```

### 2.3 NCSelect（下拉选择）

```javascript
const { NCSelect } = base;
const { NCOption } = NCSelect;

<NCSelect
    value={this.state.selectedVal}
    onChange={(value) => this.setState({ selectedVal: value })}
>
    <NCOption value="1">选项1</NCOption>
    <NCOption value="2">选项2</NCOption>
</NCSelect>
```

### 2.4 NCModal（模态弹窗）

```javascript
const { NCModal } = base;
const { NCModalHeader, NCModalBody, NCModalFooter } = NCModal;

<NCModal
    show={this.state.showModal}
    onHide={() => this.setState({ showModal: false })}
>
    <NCModalHeader closeButton>标题</NCModalHeader>
    <NCModalBody>内容</NCModalBody>
    <NCModalFooter>底部</NCModalFooter>
</NCModal>
```

> 弹窗中的数据通过 state 维护，关闭弹窗时数据仍在 state 中，父组件可直接获取。

### 2.5 NCTable（基础表格）

```javascript
const { NCTable } = base;
const columns = [
    { title: '列1', dataIndex: 'col1', render: (text, record, index) => <span>{text}</span> },
    { title: '列2', dataIndex: 'col2' }
];
const data = [
    { col1: '值1', col2: '值2', key: '1' }
];

<NCTable columns={columns} data={data} />
```

> 模板中使用 `itemtype` 字段区分不同渲染类型，`render` 函数可自定义单元格渲染。

### 2.6 NCTree（基础树）

```javascript
const { NCTree } = base;

<NCTree
    data={this.state.treeData}
    onSelect={this.onTreeSelect}
    onExpand={this.onTreeExpand}
/>
```

> 高阶组件树（`createSyncTree`/`createAsyncTree`）是更常用的方式，见第3章。

---

## 3. 平台常用高阶组件（1.20.3）

> 80 页文档，6 大高阶组件体系。高阶组件通过 `createPage` 包装后从 `this.props` 中获取 API。

### 3.1 高阶组件总览

| 高阶组件 | props 路径 | 创建方法 | 用途 |
|----------|-----------|----------|------|
| 按钮 | `this.props.button` | `createButtonApp` | 按钮/按钮组/下拉按钮 |
| 表单 | `this.props.form` | `createForm` | 表单（卡片表单） |
| 浏览态表格 | `this.props.table` | `createSimpleTable` | 不可编辑表格（浏览态） |
| 编辑态表格 | `this.props.editTable` | `createEditTable` | 可编辑表格 |
| 卡片表格 | `this.props.cardTable` | `createCardTable` | 卡片式表格（主子表） |
| 同步树 | `this.props.syncTree` | `createSyncTree` | 一次性加载的树 |
| 异步树 | `this.props.syncTree` | `createAsyncTree` | 按需加载的树 |

### 3.2 页面资源请求（所有高阶组件的前置步骤）

```javascript
this.props.createUIDom({
    pagecode: '页面编码',
    appcode: '应用编码'
}, (data) => {
    let { template, button, context } = data;
    // 将按钮数据注册给底层
    this.props.button.setButtons(button, () => {
        // 其他初始化逻辑
    });
});
```

### 3.3 高阶按钮 API

| API | 说明 |
|-----|------|
| `createButtonApp({ area, buttonLimit, onButtonClick })` | 创建按钮区域，area 为按钮区域编码，onButtonClick 为点击回调 |
| `setButtons(button, callback)` | 注册按钮数据（在 createUIDom 回调中调用） |
| `setButtonDisabled({ area, buttonKey, disabled })` | 控制按钮禁用 |
| `setButtonVisible({ area, buttonKey, visible })` | 控制按钮可见性 |
| `getButtons()` | 获取按钮数据 |
| `createOprationButton({ area, onButtonClick })` | 创建操作列按钮 |

**按钮类型配置**（在应用注册页面配置）：
- 普通按钮、按钮组（父按钮类型=按钮组，子按钮的父编码=父按钮编码）
- 下拉按钮（外层标识类型=下拉按钮）、分割下拉按钮
- 更多按钮（多个分组合并）

### 3.4 标题区组件

```javascript
import { createBillHeadInfo } from 'nc-lightapp-front';
// 在 render 中
{createBillHeadInfo(
    { title: '单据标题' },
    { backBtn: true,  // 显示返回按钮
      onBackBtnClick: () => { /* 返回逻辑 */ } }
)}
```

### 3.5 高阶查询区 API

| API | 说明 |
|-----|------|
| `this.props.search.getAllSearchData(areaCode)` | 获取查询区所有数据 |
| `this.props.search.getQueryInfo(areaCode, showError)` | 获取查询条件 |
| `this.props.search.setSearchValByField(areaCode, field, val)` | 设置指定字段查询值 |
| `this.props.search.setSearchValue(areaCode, obj)` | 批量设置查询值 |
| `this.props.search.getSearchValByField(areaCode, field)` | 获取指定字段查询值 |
| `this.props.search.setDisabledByField(areaCode, field, disabled)` | 设置字段禁用 |
| `this.props.search.openAdvSearch(areaCode, isOpen)` | 打开/关闭高级查询 |
| `this.props.search.clearSearchArea(areaCode)` | 清空查询区 |
| `this.props.search.setRequiredByField(areaCode, field, required)` | 设置字段必填 |
| `this.props.search.setTemlateByField(areaCode, field, obj)` | 设置字段模板属性 |

### 3.6 高阶表单 API（this.props.form）

#### 核心方法

| API | 说明 |
|-----|------|
| `createForm(areaCode, config)` | 创建表单 |
| `setFormStatus(areaCode, status)` | 设置表单状态（'browse'/'edit'/'add'） |
| `getFormStatus(areaCode)` | 获取表单状态 |
| `setAllFormValue(areaCode, data)` | 设置表单所有值 |
| `getAllFormValue(areaCode)` | 获取表单所有值 |
| `setFormItemsValue(areaCode, items, callback)` | 设置指定字段值 |
| `getFormItemsValue(areaCode, keys)` | 获取指定字段值 |
| `setFormItemsDisabled(areaCode, items, callback)` | 设置字段禁用 |
| `getFormItemsDisabled(areaCode, keys)` | 获取字段禁用状态 |
| `setFormItemsRequired(areaCode, items, callback)` | 设置字段必填 |
| `getFormItemsRequired(areaCode, keys)` | 获取字段必填状态 |
| `setFormItemsVisible(areaCode, items, callback)` | 设置字段可见性 |
| `getFormItemsVisible(areaCode, keys)` | 获取字段可见性 |
| `setItemsVisible(areaCode, items, callback)` | 设置项目可见（简写） |
| `setFormItemAutoFocus(areaCode, field)` | 设置字段自动聚焦 |
| `setFormItemFocus(areaCode, field)` | 设置字段聚焦 |
| `closeArea(areaCode)` | 关闭表单区域 |
| `openArea(areaCode)` | 打开表单区域 |
| `resetItemWidth(areaCode, field, width)` | 重置字段宽度 |
| `setFormPopConfirmSwitchTips(areaCode, tips)` | 设置切换确认提示 |

#### 表单状态流转

```
浏览态(browse) ←→ 编辑态(edit)
                   ↕
               新增态(add)
```

### 3.7 高阶浏览态表格 API（this.props.table）

| API | 说明 |
|-----|------|
| `createSimpleTable(areaCode, config)` | 创建浏览态表格 |
| `setAllTableData(areaCode, data)` | 设置表格全部数据 |
| `getAllTableData(areaCode)` | 获取表格全部数据 |
| `getTablePageInfo(areaCode)` | 获取分页信息 |
| `getCheckedRows(areaCode)` | 获取勾选行 |
| `selectAllRows(areaCode, checked)` | 全选/取消全选 |
| `selectTableRows(areaCode, index, checked)` | 选中/取消指定行 |
| `setTableRender(areaCode, columnIndex, renderFn)` | 自定义列渲染 |
| `setCellClass(areaCode, config)` | 设置单元格样式 |
| `getClickRowIndex(areaCode)` | 获取点击行索引 |
| `updateTableData(areaCode, data)` | 更新表格数据 |
| `getSortParam(areaCode)` | 获取排序参数 |
| `getPks(areaCode)` | 获取主键列表 |
| `openMaxTable(areaCode)` | 表格最大化 |
| `openListView(areaCode)` | 打开列表视图 |
| `setQueryCondition(areaCode, condition)` | 设置查询条件 |
| `setFiltrateTableData(areaCode, data)` | 过滤表格数据 |
| `getVisibleRows(areaCode)` | 获取可见行 |

### 3.8 高阶编辑态表格 API（this.props.editTable）

| API | 说明 |
|-----|------|
| `createEditTable(areaCode, config)` | 创建编辑态表格 |
| `getStatus(areaCode)` | 获取表格状态 |
| `setStatus(areaCode, status)` | 设置表格状态（'browse'/'edit'） |
| `getAllRows(areaCode, flag)` | 获取所有行数据 |
| `getAllData(areaCode)` | 获取所有数据 |
| `addRow(areaCode, index, isAutoAddRow, data)` | 新增行 |
| `addRowCallback(areaCode, index, data, callback)` | 新增行（带回调） |
| `deleteTableRowsByIndex(areaCode, index)` | 按索引删除行 |
| `deleteTableRowsByRowId(areaCode, rowId)` | 按 rowId 删除行 |
| `getChangedRows(areaCode)` | 获取变更行 |
| `getChangedRowsOldValue(areaCode)` | 获取变更行旧值 |
| `getNumberOfRows(areaCode)` | 获取行数 |
| `setTableData(areaCode, data)` | 设置表格数据 |
| `setValByKeyAndIndex(areaCode, index, key, val)` | 按索引+key设置值 |
| `setValByKeyAndRowId(areaCode, rowId, key, val)` | 按 rowId+key 设置值 |
| `getValByKeyAndIndex(areaCode, index, key)` | 按索引+key获取值 |
| `getValByKeyAndRowId(areaCode, rowId, key)` | 按 rowId+key 获取值 |
| `setEditableRowKeyByIndex(areaCode, index, key, editable)` | 按索引设置行可编辑 |
| `setEditableRowKeyByRowId(areaCode, rowId, key, editable)` | 按 rowId 设置行可编辑 |
| `setEditableByIndex(areaCode, index, editable)` | 按索引设置行可编辑 |
| `setEditableByKey(areaCode, rowId, key, editable)` | 按 key 设置可编辑 |
| `setCheckboxDisabled(areaCode, config)` | 设置复选框禁用 |
| `selectRowsByIndex(areaCode, index, checked)` | 按索引选中行 |
| `openModel(areaCode, config)` | 打开模态框（子表编辑） |
| `closeModel(areaCode)` | 关闭模态框 |
| `checkRequired(areaCode)` | 校验必填项 |
| `checkTableRequired(areaCode)` | 校验表格必填 |
| `cancelEdit(areaCode)` | 取消编辑 |
| `setColScale(areaCode, key, scale)` | 设置列精度 |
| `setColValue(areaCode, key, val)` | 设置列值 |
| `getColValue(areaCode, key)` | 获取列值 |
| `setColsValue(areaCode, data)` | 批量设置列值 |
| `setColEditableByKey(areaCode, key, editable)` | 设置列可编辑 |
| `setColVisibleByKey(areaCode, key, visible)` | 设置列可见性 |
| `setRowStatus(areaCode, rowId, status)` | 设置行状态 |
| `getRowStatus(areaCode, rowId)` | 获取行状态 |
| `getAllRowsRemoveKeys(areaCode, keys)` | 获取所有行（排除指定 key） |
| `getCacheData(areaCode)` | 获取缓存数据 |
| `getCacheDataById(areaCode, id)` | 按 ID 获取缓存数据 |
| `resetTableData(areaCode, data)` | 重置表格数据 |
| `setRowEditByIndex(areaCode, index, editable)` | 按索引设置行编辑状态 |
| `setGrandTableData(areaCode, data)` | 设置孙表数据 |
| `getAllGrandData(areaCode)` | 获取孙表数据 |

### 3.9 高阶卡片表格 API（this.props.cardTable）

| API | 说明 |
|-----|------|
| `createCardTable(areaCode, config)` | 创建卡片表格 |

> 卡片表格常用于主子表开发，API 与 editTable 类似。

### 3.10 高阶同步树 API（this.props.syncTree）

| API | 说明 |
|-----|------|
| `createSyncTree(config)` | 创建同步树（一次性加载全部节点） |
| `setSyncTreeData(id, data, expandFirstNode)` | 设置树数据 |
| `getSyncTreeValue(id)` | 获取树数据 |
| `getSelectNode(id)` | 获取选中节点 |
| `selectTreeNode(id, pk)` | 选中指定节点 |
| `openNodeByPk(id, pk)` | 展开指定节点 |
| `closeNodeByPk(id, pk)` | 折叠指定节点 |
| `addNodeSuccess(id, data)` | 新增节点成功后调用 |
| `addBrotherNode(id, nodeData)` | 新增兄弟节点 |
| `setNodeDisable(id, pk, disable)` | 设置节点禁用 |
| `setNodeSelected(id, pk, selected)` | 设置节点选中 |
| `setNodeChecked(id, pk, checked)` | 设置节点勾选 |
| `cancelSelectedNode(id)` | 取消选中节点 |
| `setTreeEdit(id, editable)` | 设置树可编辑 |
| `setLeafNodeEdit(id, status)` | 设置叶子节点可编辑 |
| `setIconVisible(id, visible)` | 设置图标可见 |
| `setTreeItemIcons(id, icons)` | 设置节点操作图标 |
| `getTreeData(id)` | 获取树原始数据 |
| `getItem(id, pk)` | 获取指定节点 |
| `getCheckedKeys(id)` | 获取勾选的 key 列表 |
| `getHoverNodeKey(id)` | 获取悬停节点 key |
| `getMoveNodeKey(id)` | 获取移动节点 key |
| `updateTreeData(id, data)` | 更新树数据 |
| `clearSearchValue(id)` | 清空搜索值 |
| `getSyncTreeSearchVal(id)` | 获取搜索值 |
| `createTreeData(data)` | 构建树数据结构 |

### 3.11 高阶异步树 API

| API | 说明 |
|-----|------|
| `createAsyncTree(config)` | 创建异步树（按需加载子节点） |
| `getAsyncTreeValue(id)` | 获取异步树数据 |
| `getSelectNodeAsync(id)` | 获取选中节点 |
| `openNodeByPkAsync(id, pk)` | 展开节点 |
| `closeNodeByPkAsync(id, pk)` | 折叠节点 |
| `addBrotherNodeAsync(id, nodeData)` | 新增兄弟节点 |
| `setNodeSelectedAsync(id, pk, selected)` | 设置选中 |
| `cancelSelectedNodeAsync(id)` | 取消选中 |
| `setNodeCheckedAsync(id, pk, checked)` | 设置勾选 |
| `setAsyncNodeDisable(id, pk, disable)` | 设置禁用 |
| `addTreeData(id, data)` | 添加树数据 |

---

## 4. 小应用与小部件开发（1.20.4）

### 4.1 概念

| 类型 | 说明 |
|------|------|
| **小应用** | 桌面快捷方式，点击打开应用节点 |
| **小部件** | 桌面数据展示组件，无需打开节点即可查看数据，支持定时刷新 |

### 4.2 小部件开发步骤

**步骤1：应用注册**
- 在应用注册节点，应用类型选择「小部件」
- 填写小部件的前端 JS 路径

**步骤2：编写前端 JS**

```javascript
import React, { Component } from 'react';
import { ajax, pageTo, viewModel } from 'nc-lightapp-front';

class MessageCenterSummary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            json: {},
            inlt: null,
            unreadCounts: { approve: 0, todo: 0, prealert: 0, notice: 0 },
            refreshing: false,
        };
    }
    componentDidMount() {
        this.initData();  // 加载初始数据
    }
    refreshSummary = e => {
        if (this.state.refreshing) return;
        this.setState({ refreshing: true });
        this.initData(e);
    }
    initData = (e) => {
        ajax({
            url: '/nccloud/xxx/xxx.do',
            data: {},
            method: 'POST',
            loading: false,
            success: (res) => {
                this.setState({ unreadCounts: res.data });
                setTimeout(() => this.setState({ refreshing: false }), 1000);
            }
        });
    }
    openLink(msgType) {
        pageTo.openTo('/uap/xxx/main/index.html?msgType=' + msgType, {
            appcode: '10160501',
            pagecode: '10160501APPROVE'
        });
    }
    render() { /* 渲染逻辑 */ }
}

// ⚠️ 小部件必须用 export default，不能用 ReactDOM.render
export default MessageCenterSummary;
```

**步骤3：添加 config.json**
在小部件 `index.js` 同级目录添加 `config.json`：
```json
{
    "template": "./template/index.html",
    "hash": false
}
```
> 不加此文件，打包后的 JS 带 hash 值会导致路径找不到。

**步骤4：打包部署**
将小部件放到 `home\hotwebs\nccloud\resources\` 下对应模块目录。

**步骤5：注册菜单**
与普通应用一样注册菜单，否则分配权限时看不到。

**步骤6：分配权限并验证**

### 4.3 小部件自动刷新

**方式1：装饰器写法（class 组件）**
```javascript
import { widgetAutoRefresh } from 'nc-lightapp-front';

@widgetAutoRefresh('10160511', _this => {
    _this.initData();  // 自动刷新逻辑
})
class WidgetDemo extends Component { ... }
```

**方式2：函数写法**
```javascript
WidgetDemo = widgetAutoRefresh('10160511', function(_this) {
    _this.initData();
})(WidgetDemo);
```

**⚠️ 重要：如果用了 createPage，widgetAutoRefresh 必须写在 createPage 之前！**
```javascript
// 正确顺序
WidgetDemo = widgetAutoRefresh('10160511', callback)(WidgetDemo);
WidgetDemo = createPage({})(WidgetDemo);
export default WidgetDemo;
```

**刷新间隔配置**：在应用注册的参数注册中添加 `refresh_time` 参数，值为刷新间隔秒数。

**公共组件中的写法**：第一个参数可传 function，必须返回 appcode：
```javascript
@widgetAutoRefresh(
    _this => _this.props.appcode,  // 返回 appcode
    _this => _this.initData()
)
```

---

## 5. 快速参考

### 5.1 组件引入速查

```javascript
// 基础组件
import { base, createPage } from 'nc-lightapp-front';
const { NCFormControl, NCCheckbox, NCSelect, NCButton, NCModal, NCTabs, NCTable, NCTree } = base;

// 高阶组件（通过 createPage 包装后从 props 获取）
this.props.button          // 按钮
this.props.form            // 表单
this.props.search          // 查询区
this.props.table           // 浏览态表格
this.props.editTable       // 编辑态表格
this.props.cardTable       // 卡片表格
this.props.syncTree        // 同步/异步树
this.props.createUIDom     // 页面资源请求
this.props.BillHeadInfo    // 标题区
```

### 5.2 页面开发基本模板

```javascript
import React, { Component } from 'react';
import { base, createPage } from 'nc-lightapp-front';

class MyPage extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }
    componentDidMount() {
        // 请求页面资源
        this.props.createUIDom({
            pagecode: '页面编码',
            appcode: '应用编码'
        }, (data) => {
            let { template, button, context } = data;
            this.props.button.setButtons(button);
            // 初始化表单/表格等
        });
    }
    render() {
        let { button, form, table } = this.props;
        return (
            <div>
                {/* 标题区 */}
                {/* 查询区 */}
                {/* 按钮区 */}
                {/* 表单/表格区 */}
            </div>
        );
    }
}

MyPage = createPage({})(MyPage);
export default MyPage;
```

---

## 6. 按钮触发弹窗开发模式（实战总结）

> 来源：payablebill/stockInDetailModal 实战分析
> 适用场景：在卡片页面（Card）通过按钮打开一个独立的 NCModal 弹窗，弹窗内含查询区+表格区，支持查询、勾选、确认回传
> 最后更新：2026-05-07

### 6.1 整体架构

```
父组件 Card (createPage 包装)
├── state.xxxModalCfg: { show, onSure, onCancel, ... }  ← 弹窗配置对象
├── buttonClick.js → case "按钮key" → this.openXxxModal()  ← 触发入口
├── closeXxxModal() → xxxModalCfg.show=false              ← 关闭方法
└── <XxxModal {...xxxModalCfg} />                        ← 渲染弹窗

独立弹窗组件 XxxModal (createPage({}) 包装)
├── componentWillMount → getMultiLang → initTemplate      ← 加载模板
├── NCModal (size="xlg", draggable)                        ← 弹窗容器
│   ├── Header → 弹窗标题
│   ├── Body
│   │   ├── NCCreateSearch("查询区模板ID")                 ← 查询区
│   │   └── createCardTable("表格模板ID", {showCheck,showIndex}) ← 表格区
│   └── Footer → 确定 + 取消按钮
├── onSure → props.onSure()  ← 回传父组件
└── onClose → props.onCancel() ← 关闭回调
```

### 6.2 完整代码模板

#### 6.2.1 弹窗组件 `XxxModal/card/index.js`

```javascript
import React, { Component } from 'react';
import { base, createPage, getMultiLang } from 'nc-lightapp-front';
import { initTemplate, afterEvent } from './events';

const { NCButton, NCModal } = base;
const { Header, Title, Body, Footer } = NCModal;

class XxxModal extends Component {
    constructor(props) {
        super(props);
        this.state = {
            defFooter: {
                sure: {
                    render: () => <NCButton colors="primary" onClick={this.onSure}>确定</NCButton>
                },
                cancel: {
                    render: () => <NCButton onClick={this.onClose}>取消</NCButton>
                }
            }
        };
    }

    componentWillMount() {
        let callback = () => { initTemplate.call(this, this.props) };
        getMultiLang({
            moduleId: ['payablebill', 'public'],  // 按实际模块调整
            domainName: 'arap',                    // 按实际域调整
            currentLocale: 'simpchn',
            callback
        });
    }

    onClose = () => {
        let { onCancel = () => {} } = this.props;
        onCancel();
    }

    onSure = () => {
        let { onSure = () => {} } = this.props;
        onSure();
    }

    render() {
        let { defFooter } = this.state;
        let {
            showCloseButton = true,
            showFooter = true,
            dragable = true,
            customFooter,
            show,
            ...others
        } = this.props;

        let modalCfg = {
            show,
            size: "xlg",        // 超大弹窗，可选 lg/md/sm/xlg
            draggable: dragable,
            onHide: this.onClose,
            ...others
        };

        let { search, cardTable } = this.props;
        let { NCCreateSearch } = search;
        let { createCardTable } = cardTable;

        return (
            <NCModal {...modalCfg}>
                <Header closeButton={showCloseButton}>
                    <Title>弹窗标题</Title>
                </Header>
                <Body>
                    <div className="content-wrap">
                        {NCCreateSearch("查询区模板ID", {})}
                    </div>
                    <div className="nc-bill-table-area">
                        {createCardTable("表格模板ID", {
                            showCheck: true,    // 显示勾选框（多选用）
                            showIndex: true     // 显示序号列
                        })}
                    </div>
                </Body>
                {showFooter && (customFooter
                    ? <Footer>{typeof customFooter === 'function' ? customFooter() : customFooter}</Footer>
                    : <Footer>
                        {defFooter.sure.render()}
                        {defFooter.cancel.render()}
                      </Footer>
                )}
            </NCModal>
        );
    }
}

XxxModal = createPage({})(XxxModal);   // 必须用 createPage 包装！
export default XxxModal;
```

#### 6.2.2 模板初始化 `XxxModal/card/events/initTemplate.js`

```javascript
export default function (props) {
    props.createUIDom({
        pagecode: "页面编码",     // 如 "20H80301_inventorydetailVO"
        appcode: "小应用编码",     // 如 "20H80301"
    }, (dataui) => {
        let metas = dataui.template;
        props.meta.addMeta(metas);   // 注册元数据模板（查询区+表格区模板）
    });
}
```

#### 6.2.3 编辑后事件 `XxxModal/card/events/afterEvent.js`

```javascript
export default function (props, id, key, value, data, index) {
    // 按需处理表格字段编辑后事件
}
```

#### 6.2.4 事件导出 `XxxModal/card/events/index.js`

```javascript
import initTemplate from './initTemplate';
import afterEvent from './afterEvent';
export { initTemplate, afterEvent };
```

### 6.3 父组件（Card）集成

#### 6.3.1 import 弹窗组件

```javascript
import XxxModal from '../../xxxModal/card/index.js';
```

#### 6.3.2 state 中添加弹窗配置

```javascript
// 在 Card 的 constructor 中
this.state = {
    // ... 其他 state
    xxxModalCfg: {
        show: false,
        showCloseButton: true,
        onSure: this.onXxxModalSure,       // 确定回调
        onCancel: this.closeXxxModal       // 取消/关闭回调
    }
};
```

#### 6.3.3 按钮事件分发

```javascript
// buttonClick.js
case "XxxButton":        // 按钮key，在应用注册中配置
    this.openXxxModal();  // 打开弹窗
    break;
```

#### 6.3.4 打开/关闭/确定方法

```javascript
// 打开弹窗
openXxxModal = () => {
    this.state.xxxModalCfg.show = true;
    this.setState(this.state);
}

// 关闭弹窗
closeXxxModal = () => {
    this.state.xxxModalCfg.show = false;
    this.setState(this.state);
}

// 确定回调：取出选中行数据并回写
onXxxModalSure = () => {
    // 从弹窗的 cardTable 获取选中行
    // 注意：弹窗组件需要通过 ref 或回调将选中数据传回
    // 回写父组件的 form/cardTable
    this.closeXxxModal();
}
```

#### 6.3.5 render 中渲染弹窗

```jsx
{/* 在 Card 的 render 方法中 */}
<XxxModal {...this.state.xxxModalCfg}></XxxModal>
```

### 6.4 关键知识点

| 项目 | 说明 |
|------|------|
| **createPage 包装** | 弹窗组件必须 `createPage({})` 包装，才能获得 `search/cardTable/meta` 等高阶 API |
| **独立 pagecode** | 弹窗有自己独立的 pagecode/appcode，模板在应用注册中单独配置 |
| **多语言** | `getMultiLang` 在 `componentWillMount` 中调用，domainName/moduleId 按模块设置 |
| **NCModal 尺寸** | `size` 可选 `sm/md/lg/xlg`，弹窗通常用 `xlg`（超大） |
| **表格勾选** | `createCardTable` 设置 `showCheck:true` 后，可通过 `cardTable.getCheckedRows(areaId)` 获取选中行 |
| **查询区** | `NCCreateSearch(查询区模板ID)` 自动渲染查询表单，模板由 createUIDom 加载 |
| **props 传递** | 弹窗组件通过 props 接收 show/onSure/onCancel，由父组件 state 驱动 |
| **状态驱动** | 弹窗显示/隐藏完全由父组件 state.xxxModalCfg.show 控制 |
| **数据回传** | 确定按钮触发 props.onSure()，选中行数据需要在 onSure 回调中取回并写入父组件 |

### 6.5 NCModal 两种用法对比

| 特性 | `props.modal`（简单确认框） | `NCModal` 组件（复杂弹窗） |
|------|---------------------------|--------------------------|
| **API** | `this.props.modal.createModal(id, config)` | `<NCModal show={...}>...</NCModal>` |
| **适用场景** | 简单确认/提示框，内容为文字 | 复杂内容：查询+表格+自定义操作 |
| **内容** | config.content 传字符串或DOM | Body 中自由组合组件 |
| **模板加载** | 不需要 | 需要 createUIDom 加载独立模板 |
| **createPage** | 父组件已有即可 | 弹窗组件自身也需要 createPage 包装 |
| **典型例子** | 保存校验提示、删除确认 | 入库明细选择、发票查看、票夹 |

### 6.6 目录结构规范

```
src/arap/模块名/
├── 主单据/
│   └── card/
│       ├── index.js           ← 父组件，import 弹窗并渲染
│       ├── constants.js       ← 常量定义
│       └── events/
│           └── buttonClick.js ← 按钮事件分发，触发弹窗
└── 弹窗名/
    └── card/
        ├── index.js           ← 弹窗组件（createPage包装）
        └── events/
            ├── index.js       ← 事件导出
            ├── initTemplate.js ← 模板初始化（createUIDom）
            └── afterEvent.js  ← 编辑后事件
```

### 6.7 实战踩坑记录

1. **import 路径**：弹窗组件路径需从父组件相对路径引入，注意层级
2. **createPage 必须包裹**：弹窗组件自身也要 `createPage({})` 包装，否则 `search/cardTable` 等高阶 API 不可用
3. **多语言 moduleId**：弹窗组件的 getMultiLang moduleId 需包含父模块的 moduleId（如 'payablebill'），否则弹窗内多语言key找不到
4. **state 直接修改**：NCC 实战中常见 `this.state.xxxModalCfg.show = true` 再 `this.setState(this.state)` 的写法，虽然 React 不推荐直接修改 state，但 NCC 代码库中普遍使用
5. **Footer 自定义**：`customFooter` 支持 function 和 DOM 两种类型，判断 `typeof customFooter === 'function'`
6. **NCModal 子组件**：`const { Header, Title, Body, Footer } = NCModal` 解构获取，不是独立 import
7. **查询区模板ID**：NCCreateSearch 的第一个参数是查询区模板ID（如 "inventorydetailVOQuery"），不是 pagecode

### 5.3 参考资源

- NCC 开发社区：https://nccdev.yonyou.com
- React 中文文档：https://react.docschina.org
- React 生命周期：https://www.cnblogs.com/soyxiaobi/p/9559117.html
- MDN JavaScript 基础：https://developer.mozilla.org/en-US/docs/Learn/Getting_started_with_the_web/JavaScript_basics

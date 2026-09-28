# MDF API 速查手册

## 必知陷阱（Top 6，不查文档也必须记住）

| 陷阱 | 错误 | 正确 |
|------|------|------|
| afterValueChange 参数 | `data.newValue` | `data.value` / `data.oldValue` |
| 参照过滤格式 | `commonVOs` / `itemName` | `simpleVOs` + `isExtend: true` + `field` |
| 多语字段赋值 | `setValue('文本')` | `setValue({ zh_CN: '文本' })` |
| 必填属性 | `bRequired` | `setState('bIsNull', false)` — bIsNull=false 才是必填 |
| 枚举字段值 | `data.value === '1'` | `data.value && data.value.value === '1'` — ListModel value 是 `{value, text}` 对象 |
| 子表获取 | `viewModel.get('实体名')` | `viewModel.getGridModel('childrenField')` — 传数据字段名不是实体名 |

## 必知原则（设计决策）

| 原则 | 判断依据 | 决策路径 |
|------|---------|---------|
| **按钮拦截层级选择** | 按钮是否绑定了 `cAction`（如 save/delete/deleterow） | 有 action → `viewModel.on('before{Action}')`；无 action → `model.on('beforeclick')` |
| **对象属性防御性访问** | 回调参数中嵌套对象（如 `data.condition.simpleVOs`） | 先 `if (!data.condition) data.condition = {}` 再访问 |
| **biz action 事件大小写** | action 名全小写，事件名仅首字母大写 | `deleterow` → `beforeDeleterow`；`addrow` → `beforeAddrow` |

## 易混淆事件对照（Model 层 vs Biz 层）

| 操作 | Model 层事件（gridModel） | Biz 层事件（viewModel） | 选择建议 |
|------|------|------|---------|
| 删行 | `gridModel.on('beforeDeleteRows', fn(rows, rowIndexes))` | `viewModel.on('beforeDeleterow', fn)` | 异步确认用 Biz 层（支持 `cb.promise()`） |
| 增行 | `gridModel.on('beforeInsertRow', fn(data))` | `viewModel.on('beforeAddrow', fn)` | 阻止 UI 按钮增行用 Biz 层；阻止所有代码增行用 Model 层 |

---

## 1. 字段操作

| # | 意图 | 一行式 API |
|---|------|-----------|
| 1.1 | 隐藏/显示字段 | `viewModel.get(field).setVisible(false/true)` |
| 1.2 | 设置只读 | `viewModel.get(field).setReadOnly(true)` |
| 1.2.1 | 设置禁用 | `viewModel.get(field).setDisabled(true)` |
| 1.3 | 设置字段值 | `viewModel.get(field).setValue(val)` |
| 1.4 | 获取字段值 | `viewModel.get(field).getValue()` |
| 1.5 | 设置必填 | `viewModel.get(field).setState('bIsNull', false)` |
| 1.6 | 字段值变更联动 | `viewModel.get(field).on('afterValueChange', fn(data))` |
| 1.7 | 多语字段赋值 | `viewModel.get(field).setValue({ zh_CN: '文本' })` |
| 1.8 | 字段值拦截校验 | `viewModel.get(field).on('beforeValueChange', fn)` → `return false` 阻止 |

---

## 2. 参照操作

| # | 意图 | 一行式 API |
|---|------|-----------|
| 2.1 | 参照过滤（单条件） | `model.on('beforeBrowse', fn)` → `this.setFilter({ isExtend: true, simpleVOs: [{field,op,value1}] })` |
| 2.2 | 参照过滤（多条件） | 同 2.1，simpleVOs 数组多个元素 |
| 2.3 | 参照联动 | A 的 `afterValueChange` 清空 B → B 的 `beforeBrowse` 用 A 值过滤 |
| 2.4 | 按钮弹出参照 | `new cb.models.ReferModel({cRefType,multiple,domainKey})` → `browse(true)` |
| 2.5 | 参照携带字段 | `model.setReturnFields({ targetField: 'sourceField' })` |
| 2.6 | 子表参照过滤 | `gridModel.on('beforeBrowse', fn(args))` → `args.context.getRow()` |
| 2.7 | 参照切换单选/多选 | `model.setMultiple(true/false)` |

---

## 3. 表格（子表）操作

> 获取 gridModel: `viewModel.getGridModel('childrenField')`

| # | 意图 | 一行式 API |
|---|------|-----------|
| 3.1 | 单元格值变更计算 | `gridModel.on('afterCellValueChange', fn(data))` |
| 3.2 | 增行/删行 | `gridModel.appendRow(obj)` / `insertRow(idx,obj)` / `deleteRows([idx])` |
| 3.3 | 隐藏子表列 | `gridModel.setColumnState(col, 'bHidden', true)` |
| 3.4 | 设置单元格值 | `gridModel.setCellValue(rowIdx, field, val)` |
| 3.5 | 获取选中行 | `gridModel.getSelectedRows()` / `getSelectedRowIndexes()` |
| 3.6 | 行级只读 | `gridModel.setCellState(rowIdx, field, 'bCanModify', false)` |
| 3.7 | 行按钮显示隐藏 | `gridModel.setActionsState(states)` |
| 3.8 | 替换表格数据 | `gridModel.setDataSource(rows)` |
| 3.9 | 阻止增行 | `gridModel.on('beforeInsertRow', fn)` → `return false` |
| 3.10 | 增行设置默认值 | `beforeInsertRow` → `data.row.fieldName.value = val` |
| 3.11 | 列格式化 | `gridModel.setColumnState(col, 'formatter', fn)` |
| 3.12 | 批量更新行 | `gridModel.updateRows(rowIndexes, rowDatas)` |
| 3.13 | 批量设置单元格值 | `gridModel.setCellValues(cellValuesMap)` |
| 3.14 | 获取子表所有行数据 | `gridModel.getData()` — 返回数组 |
| 3.15 | 获取子表所有行 | `gridModel.getRows()` — 返回行对象数组 |
| 3.16 | 获取编辑行模型 | `gridModel.getEditRowModel()` — 用于子表字段操作 |
| 3.17 | 增行后事件 | `gridModel.on('afterInsertRow', fn)` / `gridModel.on('afterInsertRows', fn)` |
| 3.18 | 删行后事件 | `gridModel.on('afterDeleteRows', fn)` |
| 3.19 | 参照增行前/后 | `gridModel.on('beforeInsertRowsFromRefer', fn)` / `gridModel.on('afterInsertRowsFromRefer', fn)` |
| 3.20 | 行动按钮状态前 | `gridModel.on('beforeSetActionsState', fn)` — 设置按钮状态前拦截 |
| 3.21 | 单元格联合查询 | `gridModel.on('cellJointQuery', fn)` — 单元格联动查询 |

---

## 4. 查询区操作

> 列表页：先 `viewModel.on('afterInitCommonViewModel', fn)` → `viewModel.getFilterViewModel()`

| # | 意图 | 一行式 API |
|---|------|-----------|
| 4.1 | 追加查询条件 | `filterVM.on('beforeSearch', fn(args))` → `args.simpleVOs.push({field,op,value1})` |
| 4.2 | 查询条件联动 | `getFromModel().on('afterValueChange', fn)` → `getFromModel().setFilter(...)` |
| 4.3 | 隐藏查询条件 | `filterVM.execute('updateViewMeta', {code: field, visible: false})` |
| 4.4 | 设置查询条件必填 | `filterVM.execute('updateViewMeta', {code: field, mustInput: true})` |

---

## 5. 按钮与生命周期

| # | 意图 | 一行式 API |
|---|------|-----------|
| 5.1 | 保存前校验 | `viewModel.on('beforeSave', fn)` → `return false` 同步 / `return new cb.promise()` 异步 |
| 5.2 | 自定义按钮动作 | `model.on('click', fn)` / `viewModel.biz.do('save', viewModel)` |
| 5.3 | afterLoadData | `viewModel.on('afterLoadData', fn(data))` |
| 5.4 | afterLoadMeta | `viewModel.on('afterLoadMeta', fn(data))` |
| 5.5 | 页面模式判断 | `modeChange` 回调参数直接为 `'add'`/`'edit'`/`'browse'` |
| 5.6 | 按模式控制按钮 | `viewModel.get(btn).setVisible(mode==='browse')` |
| 5.7 | 覆盖按钮行为 | `model.on('beforeclick', fn)` + `return false` |
| 5.8 | 列表页新增传参 | `beforeAdd` → `data.params.carryParams.xxx = val` |
| 5.9 | 保存后刷新 | `viewModel.on('afterSave', fn)` → `viewModel.biz.do('refresh', viewModel)` |
| 5.10 | 页面跳转（联查） | `cb.loader.runCommandLine('bill', {billtype,billno,params}, viewModel)` |
| 5.11 | 数值范围设置 | `model.setState('min', 0)` / `model.setState('max', 999)` |
| 5.12 | 业务动作执行 | `viewModel.biz.do('abandon', viewModel)` |
| 5.13 | 返回上一页 | `viewModel.communication({ type: 'return' })` |
| 5.14 | 关闭确认 | `cb.communication({ action: 'isCloseAction', activeKey, data: true, noConfirm: true })` |
| 5.15 | 进入编辑模式 | `viewModel.on('afterEdit', fn)` |
| 5.16 | 下推前/后事件 | `viewModel.on('beforeBatchpush', fn)` / `viewModel.on('afterBatchpush', fn)` |
| 5.17 | 页面挂载完成 | `viewModel.on('afterMount', fn)` |
| 5.18 | Grid 数据源设置后 | `gridModel.on('afterSetDataSource', fn(data))` |
| 5.19 | 单元格校验后 | `viewModel.on('afterCellCheck', fn(data))` |
| 5.20 | 打印前事件 | `viewModel.on('beforePrintnow', fn)` / `viewModel.on('beforePrintpreview', fn)` |
| 5.21 | 批量确认 | `viewModel.on('batchConfirm', fn)` |
| 5.22 | 制证前/后 | `viewModel.on('beforeVoucherdo', fn)` / `viewModel.on('afterVoucherdo', fn)` |
| 5.23 | 工作流事件 | `viewModel.on('beforeSetWorkflow', fn)` / `viewModel.on('beforeWorkflow', fn)` |
| 5.24 | 推单后 | `viewModel.on('afterPush', fn)` |
| 5.25 | 打开导出工作台 | `viewModel.on('beforeOpenexportworkbench', fn)` |
| 5.26 | 打开导入工作台 | `viewModel.on('beforeOpenimportworkbench', fn)` |

---

## 6. 工具 API

| # | 意图 | 一行式 API |
|---|------|-----------|
| 6.1 | HTTP 请求 | `viewModel.setProxy({name:{url,method}})` → `proxy.name(params, cb)` |
| 6.2 | 提示/确认弹窗 | `cb.utils.alert(msg, 'error')` / `cb.utils.confirm(msg, fn)` |
| 6.3 | 打开弹窗页面 | `viewModel.communication({type:'modal', payload:{key,data}})` |
| 6.3.1 | 打开自定义弹窗 | `payload:{key:'RedFlushModel', data:{vm,invoiceId,callback}}` |
| 6.3.2 | 打开 UI 模板内区域弹窗 | `payload:{mode:'inner', groupCode:'invoice_modal', viewModel}` |
| 6.4 | 获取上下文 | `cb.context.getUserId/getUserName/getTenantId/getOrgId()` |
| 6.5 | 获取主站点 URL | `cb.utils.getMainOriginUrl()` |
| 6.6 | 终端类型判断 | `cb.rest.terminalType == '3'` — 3=移动端 |
| 6.7 | 移动端判断 | `viewModel.getParams().terminalType == '3' \|\| cb.rest.terminalType == '3'` |
| 6.8 | 判断是否为空 | `cb.utils.isEmpty(value)` — 兼容 null/undefined/空字符串 |
| 6.9 | 浮点计算 | `cb.utils.FloatCalc.divide(a, b)` — 避免 JavaScript 浮点精度问题 |
| 6.10 | 国际化模板 | `cb.lang.templateByUuid('UID:xxx', 'defaultMsg')` |

---

## 7. 树形操作

| # | 意图 | 一行式 API |
|---|------|-----------|
| 7.1 | 树节点操作 | `treeModel.getSelectedKeys/select/addNode/deleteNode/updateNode` |
| 7.2 | 树展开控制 | `treeModel.onExpandAll()` / `expandLayer(n)` |

---

## 8. 列表页特有操作（ListModel）

| # | 意图 | 一行式 API |
|---|------|-----------|
| 8.1 | 设置复选框显隐 | `listModel.setShowCheckbox(true/false)` |
| 8.2 | 获取列表整单数据 | `viewModel.getData()` |
| 8.3 | 获取 URL 参数 | `viewModel.getParams().query.xxx` |
| 8.4 | 获取父 VM 缓存 | `viewModel.getCache('parentViewModel')` |
| 8.5 | 设置 Filter 属性 | `filterViewModel.setProperty('billData', data)` |

---

## 禁用 API（扩展脚本禁止使用）

| 禁用 API | 正确替代 |
|---------|---------|
| `cb.rest.DynamicProxy.create()` | `viewmodel.setProxy({...})` |
| `cb.rest.ajax()` | `viewmodel.setProxy({...})` |
| `cb.rest.invokeFunction()` | 公有云默认用 invokeFunction，外部 API 用 setProxy |
| `cb.ajax()` | `viewmodel.setProxy({...})` |
| `cb.http.post/get()` | `viewmodel.setProxy({...})` |
| `cb.context.getYhtAccessToken()` | 框架内部统一处理 |
| `cb.utils.getToken()` | 框架内部统一处理 |
| `for...in` 遍历对象 | `Object.keys(obj).forEach()` |
| 循环内调用 `insertRow/deleteRow/updateRow` | 批量方法 `insertRows/updateRows/deleteRows` |
| ES2023+ 方法（`findLast`/`toReversed` 等） | `[...arr].reverse().find()` 等兼容写法 |

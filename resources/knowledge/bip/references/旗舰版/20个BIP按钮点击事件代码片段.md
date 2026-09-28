---
name: 20个BIP按钮点击事件代码片段
description: >
  用友 BIP 客开技能。当用户需要编写按钮点击事件页面脚本，包括基础点击绑定、新增/编辑/保存按钮、增行/删行/复制行按钮、批量操作按钮、模态框确认按钮、推送按钮、防重复点击、撤回确认等场景时，参考该文档内容。
---

# 20个BIP按钮点击事件代码片段

## 基础按钮绑定

### 1. 基础按钮点击（带存在性检查）

```javascript
viewModel.get('buttonCode') && viewModel.get('buttonCode').on('click', function (data) {
    console.log('按钮被点击', data);
});
```

### 2. 新增按钮 — 打开新增页面

```javascript
viewModel.get('btnAdd') && viewModel.get('btnAdd').on('click', function (data) {
    let request = {
        billtype: 'Voucher', billno: 'targetBillNo',
        params: { mode: 'add', readOnly: false }
    };
    cb.loader.runCommandLine('bill', request, viewModel);
});
```

### 3. 编辑按钮 — 根据业务类型控制字段

```javascript
viewModel.get('btnEdit') && viewModel.get('btnEdit').on('click', function (data) {
    const code = viewModel.get('code').getValue();
    const inputtype = viewModel.get('inputtype').getValue();
    if (inputtype == 2) {
        viewModel.get('purorg_name').setDisabled(true);
        viewModel.get('purdate').setDisabled(true);
    }
});
```

## 保存类按钮

### 4. 保存并新增

```javascript
viewModel.get('btnSaveAndAdd').on('click', function (data) {
    viewModel.execute('save').then(() => { viewModel.execute('add'); });
});
```

### 5. 批量保存（带校验）

```javascript
viewModel.get('btnBatchSave').on('click', function (data) {
    var rows = gridModel.getRows();
    var canRefresh = true;
    rows.forEach(data => {
        if (data.docCode == null || data.docName == null) { canRefresh = false; }
    });
    if (canRefresh) { viewModel.execute('refresh'); }
    else { cb.utils.alert('请填写完整数据', 'error'); }
});
```

### 6. 提交按钮（beforeclick 前置校验）

```javascript
viewModel.get('btnBatchSubmit').on('beforeclick', function (data) {
    let cancommit = true;
    const rowData = viewModel.getGridModel('detailList').getRows();
    rowData.forEach((one, ii) => {
        if (!one.requiredField) { cancommit = false; }
    });
    if (!cancommit) { cb.utils.alert('请完善必填字段', 'error'); return false; }
});
```

## 行操作按钮

### 7. 增行

```javascript
viewModel.get('btnAddRow').on('click', function (data) {
    viewModel.get('subTable').getRowModel(data.index).get('subTableList').appendRow();
});
```

### 8. 复制行

```javascript
viewModel.get('btnCopyRow').on('click', function (data) {
    const gridModel = viewModel.getGridModel();
    const selectedRows = gridModel.getSelectedRows();
    selectedRows.forEach(row => {
        delete row.id; row._status = 'Insert'; gridModel.appendRow(row);
    });
});
```

### 9. 删行（带确认）

```javascript
viewModel.get('btnDeleteRow').on('click', function (data) {
    var gridModel = viewModel.get('subTableList');
    var selectedRowIndexes = gridModel.getSelectedRowIndexes();
    if (selectedRowIndexes.length === 0) {
        cb.utils.alert('请选择要删除的数据', 'warn'); return false;
    }
    cb.utils.confirm('确定删除选中的数据吗？', function () {
        gridModel.deleteRows(selectedRowIndexes);
    });
});
```

## 批量操作按钮

### 10. 批量确认（调后端）

```javascript
viewModel.get('btnBatchConfirm').on('click', function (data) {
    const selectedRows = viewModel.getGridModel().getSelectedRows();
    if (selectedRows.length === 0) {
        cb.utils.alert('请选择至少一条数据', 'error'); return false;
    }
    cb.rest.invokeFunction('module.batchConfirmAPI', { rows: selectedRows }, function (err, res) {
        if (err) { cb.utils.alert('操作失败：' + err.message, 'error'); return; }
        cb.utils.alert('确认成功', 'success');
        viewModel.execute('refresh');
    });
});
```

### 11. 批量取消确认

```javascript
viewModel.get('btnCancelConfirm').on('click', function (data) {
    const selectedRows = viewModel.getGridModel().getSelectedRows();
    if (selectedRows.length === 0) { cb.utils.alert('未选中数据', 'warn'); return false; }
    var ids = selectedRows.map(row => row.id);
    let proxy = cb.rest.DynamicProxy.create({
        ensure: { url: '/api/batchCancel', method: 'POST', options: { domainKey: 'yourDomainKey' } }
    });
    proxy.ensure(ids, function (error, result) {
        if (error) { cb.utils.alert(error.message || error, 'error'); }
        else { cb.utils.alert(result, 'success'); viewModel.execute('refresh'); }
    });
});
```

## 模态框操作按钮

### 12. 确定按钮（回写父页面并关闭）

```javascript
viewModel.get('btnConfirm').on('click', function (data) {
    let selectedRows = viewModel.getGridModel().getSelectedRows();
    if (selectedRows.length === 0) { cb.utils.alert('请选择数据'); return false; }
    var parentViewModel = viewModel.getCache('parentViewModel');
    var gridModel = parentViewModel.getGridModel();
    selectedRows.forEach((row) => { row.is_kit = '2'; gridModel.appendRow(row); });
    viewModel.communication({ type: 'modal', payload: { data: false } });
});
```

### 13. 增行并打开选择模态框

```javascript
viewModel.get('btnAddRowWithModal').on('click', function (params) {
    let data = {
        billtype: 'VoucherList', billno: 'selectorBillNo',
        params: { mode: 'browse', parentId: viewModel.get('id').getValue() }
    };
    cb.loader.runCommandLine('bill', data, viewModel);
});
```

## 业务操作按钮

### 14. 推送到外部系统（带重复推送校验）

```javascript
viewModel.get('btnPushToFinance').on('click', function (data) {
    let selectedRows = viewModel.getGridModel().getSelectedRows();
    let flag = false;
    for (const row of selectedRows) {
        if (row.syncStatus == '1') { flag = true; break; }
    }
    if (flag) { cb.utils.alert('单据已推送请勿重复推送！', 'error'); return; }
    let proxy = viewModel.setProxy({
        ensure: { url: '/api/pushToFinance', method: 'POST' }
    });
    proxy.ensure(selectedRows, function (err, res) {
        if (err) { cb.utils.alert('推送失败：' + err.message, 'error'); }
        else { cb.utils.alert('推送成功', 'success'); viewModel.execute('refresh'); }
    });
});
```

## 防重复点击

### 15. 禁用按钮防止重复点击

```javascript
viewModel.get('btnSubmit').on('click', function () {
    const button = viewModel.get('btnSubmit');
    button.setDisabled(true);
    fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) })
    .then(response => response.json())
    .then(result => { /* 处理结果 */ })
    .catch(error => { cb.utils.alert('网络错误', 'error'); })
    .finally(() => { button.setDisabled(false); });
});
```

## 撤回按钮

### 16. 撤回（带确认）

```javascript
viewModel.get('btnWithdraw').on('click', function (args) {
    cb.utils.confirm('确定撤回当前审批？', () => { submitWithdraw(); return true; }, () => { return false; });
});
```

## 关键 API

| API | 说明 |
|-----|------|
| `viewModel.get('btn').on('click', fn)` | 按钮点击事件 |
| `viewModel.get('btn').on('beforeclick', fn)` | 按钮点击前事件（返回 false 阻止） |
| `button.setDisabled(true/false)` | 启用/禁用按钮 |
| `gridModel.appendRow(row)` | 增行 |
| `gridModel.deleteRows(indexes)` | 删行 |
| `viewModel.execute('save')` | 程序化触发保存 |
| `viewModel.execute('add')` | 程序化触发新增 |
| `viewModel.execute('refresh')` | 刷新页面 |

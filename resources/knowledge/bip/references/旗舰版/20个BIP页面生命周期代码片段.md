---
name: 20个BIP页面生命周期代码片段
description: >
  用友 BIP 客开技能。当用户需要了解页面生命周期事件执行顺序和编写相关脚本，包括 customInit/afterInit/afterMount 初始化、afterLoadData 数据加载、modeChange 模式切换、afterStateRule/afterRule 状态规则、beforeSave/afterSave 保存、beforeSearch/afterSearch 查询、afterAudit 审批等事件的代码示例时，参考该文档内容。
---

# 20个BIP页面生命周期代码片段

## 生命周期执行顺序

```
customInit → afterInit → afterInitCommonViewModel → afterMount → beforeLoadData → afterLoadData → modeChange → afterStateRule/afterRule → (保存时) beforeSave → afterSave → afterAudit/afterUnaudit
```

## 初始化事件

### 1. customInit — 页面自定义初始化（最早触发）

```javascript
viewModel.on('customInit', function(data) {
    // 全局变量初始化、权限获取、事件绑定注册
});
```

### 2. afterInit — 模型初始化完成后

```javascript
viewModel.on('afterInit', function (data) {
    let currentState = viewModel.getParams().mode;  // add/edit/browse
    let alldata = viewModel.getAllData();
});
```

### 3. afterInitCommonViewModel — 通用视图模型初始化后

```javascript
viewModel.on('afterInitCommonViewModel', () => {
    const FilterViewModel = viewModel.getFilterViewModel();
    FilterViewModel.on('afterFilterPanelRender', () => {
        FilterViewModel.setState('showMore', true);
        FilterViewModel.setState('fixed', true);
    });
});
```

### 4. afterMount — DOM 挂载完成（操作查询区）

```javascript
viewModel.on('afterMount', function () {
    const filtervm = viewModel.getCache('FilterViewModel');
    filtervm.on('afterInit', function () {
        filtervm.get('orgId_name').getFromModel().setValue(orgId);
    });
});
```

## 数据加载事件

### 5. afterLoadData — 数据加载完成后（最常用）

```javascript
viewModel.on('afterLoadData', function (data) {
    const mode = viewModel.getParams().mode;
    const verifystate = viewModel.get('verifystate').getValue();
    if (verifystate == '0') {
        viewModel.get('btnEdit').setVisible(true);
        viewModel.get('btnDelete').setVisible(true);
    } else if (verifystate == '1' || verifystate == '2') {
        viewModel.get('btnWorkflow').setVisible(true);
        viewModel.get('btnEdit').setVisible(false);
    }
});
```

### 6. beforeLoadData — 数据加载前

```javascript
viewModel.on('beforeLoadData', function (params) {
    // 可修改加载参数，return false 阻止加载
});
```

### 7. afterSetDataSource — 表格数据源设置后

```javascript
gridModel.on('afterSetDataSource', function (data) {
    data.map((item, index) => { item.xxx = '自定义值'; });
});
```

## 页面状态事件

### 8. modeChange — 页面模式切换（新增/编辑/浏览）

```javascript
viewModel.on('modeChange', function (mode) {
    if (mode.toLocaleLowerCase() == 'add') {
        viewModel.get('inputType').setValue('1');
        viewModel.get('inputType').setDisabled(true);
    } else if (mode.toLocaleLowerCase() == 'edit') {
        viewModel.get('code').setDisabled(true);
    } else if (mode.toLocaleLowerCase() == 'browse') {
        viewModel.get('btnEdit').setVisible(false);
    }
});
```

### 9. afterStateRule — 状态规则执行后

```javascript
viewModel.on('afterStateRule', function(data) {
    viewModel.get("btnSelectAll").setVisible(false);
    viewModel.get("btnAdd").setVisible(false);
});
```

### 10. afterRule — 业务规则执行后

```javascript
viewModel.on("afterRule", function(data) {
    let verifystateVal = viewModel.get("verifystate").getValue();
    if (verifystateVal == "1") { viewModel.get("btnEdit").setVisible(false); }
});
```

## 保存事件

### 11. beforeSave — 保存前校验（返回 false 阻止）

```javascript
viewModel.on('beforeSave', function (args) {
    var creditStartDate = viewModel.get('creditStartDate').getValue();
    var creditEndDate = viewModel.get('creditEndDate').getValue();
    if (creditStartDate > creditEndDate) {
        cb.utils.alert('【担保结束时间】应大于等于【担保开始时间】', 'error');
        return false;
    }
    let dataJson = JSON.parse(args.data.data);
    dataJson.customField = '自定义值';
    args.data.data = JSON.stringify(dataJson);
});
```

### 12. afterSave — 保存成功后

```javascript
viewModel.on('afterSave', function (data) {
    viewModel.execute('refresh');
});
```

### 13. beforeSubmit — 提交前

```javascript
viewModel.on('beforeSubmit', function (args) {
    var result = validateData();
    if (!result) { cb.utils.alert('提交前校验失败', 'error'); return false; }
});
```

## 审批事件

### 14. afterAudit — 审批通过后

```javascript
viewModel.on('afterAudit', function (data) {
    if (data.res && data.res.status == 1) {
        cb.rest.invokeFunction('PU.backFunction.afterAudit', { id: data.res.id }, function (err, res) {
            if (err) { cb.utils.alert('接口调用异常：' + err.message, 'error'); return; }
            cb.utils.alert('操作成功', 'success');
            viewModel.execute('refresh');
        });
    }
});
```

### 15. afterUnaudit — 取消审批后

```javascript
viewModel.on('afterUnaudit', function (data) {
    viewModel.execute('refresh');
});
```

## 查询事件

### 16. beforeSearch — 列表页查询前（最常用）

```javascript
viewModel.on('beforeSearch', function (args) {
    args.isExtend = true;
    args.simpleVOs = [
        { field: "enable", op: "eq", value1: "1" },
        { field: "org_id", op: "in", value1: findedOrg.orgdept }
    ];
});
```

### 17. beforeSetDataSource — 表格数据源设置前

```javascript
gridModel.on('beforeSetDataSource', function (data) {
    data.map((item, index) => { item.rowNo = index + 1; });
});
```

## 工具方法

### 18. 获取页面模式公共方法

```javascript
function isAdd() { return viewModel.getParams().mode == 'add'; }
function isEdit() { return viewModel.getParams().mode == 'edit'; }
function isBrowse() { return viewModel.getParams().mode === 'browse'; }

viewModel.on('afterLoadData', function (data) {
    if (isAdd()) {
        viewModel.get('code').setValue('自动生成');
    } else if (isEdit()) {
        viewModel.get('code').setDisabled(true);
    } else if (isBrowse()) {
        viewModel.get('btnEdit').setVisible(false);
    }
});
```

## 关键 API

| API | 触发时机 | 常见用途 |
|-----|----------|----------|
| `customInit` | 页面最早 | 注册事件监听器、获取权限 |
| `afterMount` | DOM渲染完成 | 操作查询区、设置默认值 |
| `afterLoadData` | 数据加载完成 | 根据数据状态控制界面 |
| `modeChange` | 模式切换 | 区分新增/编辑/浏览 |
| `afterStateRule` | 状态规则执行后 | 覆盖或补充状态规则 |
| `beforeSave` | 保存前 | 校验、修改保存数据（返回false阻止） |
| `afterSave` | 保存后 | 刷新、跳转、后续业务 |
| `beforeSearch` | 查询前 | 动态添加查询条件 |
| `afterAudit` | 审批通过 | 审批后业务处理 |

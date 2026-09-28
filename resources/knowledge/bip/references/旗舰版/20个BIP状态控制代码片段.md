---
name: 20个BIP状态控制代码片段
description: >
  用友 BIP 客开技能。当用户需要编写状态控制相关页面脚本，包括页面级字段禁用/显隐（modeChange）、表格行级按钮显隐（setActionsState）、单元格级编辑控制（setRowState）、状态样式（setColumnState formatter）、按钮防重复点击、MobX 响应式状态规则等场景时，参考该文档内容。
---

# 20个BIP状态控制代码片段

## 页面级状态控制

### 1. modeChange 模式变化时控制字段

```javascript
viewModel.on('modeChange', function(mode) {
    if (mode == 'add' || mode == 'edit') {
        viewModel.get('totalBudget').setDisabled(true);
        viewModel.get('cardStatus').setDisabled(true);
        if (mode == 'edit') {
            viewModel.get('budget').setDisabled(true);
        }
    }
});
```

### 2. afterStateRule 状态规则后控制按钮

```javascript
viewModel.on('afterStateRule', function(event) {
    var verifystate = viewModel.get("verifystate").getValue();
    viewModel.get('btnEdit').setVisible(false);
    viewModel.get('btnWorkflow').setVisible(false);
});
```

### 3. 审批流程页面按钮显隐

```javascript
viewModel.on('afterStateRule', function(data) {
    viewModel.get("approveflow").setVisible(true);
    viewModel.get("btnSaveAndAdd").setVisible(false);
    viewModel.get("btnSave").setVisible(false);
    viewModel.get("btnEdit").setVisible(false);
    viewModel.get("btnSubmit").setVisible(false);
});
```

## 字段级状态控制

### 4. 字段有值时自动禁用

```javascript
let regPlace = viewModel.get('regPlace').getValue();
let legalName = viewModel.get('legalName').getValue();
if(regPlace) viewModel.get('regPlace').setDisabled(true);
if(legalName) viewModel.get('legalName').setDisabled(true);
```

### 5. 字段联动显隐

```javascript
let flag = viewModel.get('ecoStuationFlag').getValue();
if('1' == flag) {
    viewModel.get("targetCoNameM").setVisible(true);
    viewModel.get("targetCoName_coName").setVisible(false);
} else {
    viewModel.get("targetCoNameM").setVisible(false);
    viewModel.get("targetCoName_coName").setVisible(true);
}
```

### 6. 根据数据存在性控制显隐

```javascript
viewModel.on('afterLoadData', function (data) {
    var currentPosition = viewModel.get('currentPosition').getValue();
    if (currentPosition) {
        viewModel.get('currentPosition').setVisible(true);
        viewModel.get('position').setVisible(false);
    } else {
        viewModel.get('currentPosition').setVisible(false);
        viewModel.get('position').setVisible(true);
    }
});
```

## 表格行级状态控制

### 7. 根据启用状态控制停用/启用按钮

```javascript
let gridModel = viewModel.getGridModel();
const rows = gridModel.getRows();
const actions = gridModel.getCache('actions');
const actionsStates = [];
rows.forEach(data => {
    const actionState = {};
    if (data.enable == 0 || data.enable == 2) {
        actionState["btnStop"] = { visible: false };
        actionState["btnUnstop"] = { visible: true };
    } else {
        actionState["btnStop"] = { visible: true };
        actionState["btnUnstop"] = { visible: false };
    }
    if(data.PresetEnum == "1") {
        actionState["btnDelete"] = { visible: false };
    } else {
        actionState["btnDelete"] = { visible: true };
    }
    actionsStates.push(actionState);
});
gridModel.setActionsState(actionsStates);
```

### 8. 根据项目状态控制行按钮（afterSetDataSource）

```javascript
gridModel.on('afterSetDataSource', function(data) {
    let rows = gridModel.getRows();
    const actions = gridModel.getCache('actions');
    const actionsStates = [];
    rows.forEach(row => {
        let projectStatus = row.projectStatus;
        const actionState = {};
        actions.forEach(action => {
            if (action.cItemName == "button8966ed") {
                actionState[action.cItemName] = { visible: ('0' != projectStatus) };
            } else if (action.cItemName == "btnEdit") {
                actionState[action.cItemName] = { visible: ('0' == projectStatus) };
            }
        });
        actionsStates.push(actionState);
    });
    gridModel.setActionsState(actionsStates);
});
```

### 9. 根据 isLast 设置行只读

```javascript
gridModel.on('afterSetDataSource', () => {
    const rowData = gridModel.getRows();
    rowData.forEach((item, i) => {
        if (item.isLast == false) { gridModel.setRowState(i, 'readOnly', true); }
    });
});
```

## 表格状态

### 10. 设置显示行号

```javascript
viewModel.on('afterMount', function() {
    let gridModel = viewModel.getGridModel();
    gridModel.setState('showRowNo', true);
});
```

## 按钮防重复点击

### 11. 点击时禁用，完成后恢复

```javascript
viewModel.get('button27uf').on('click', function () {
    const button = viewModel.get('button27uf');
    button.setDisabled(true);
    fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData) })
    .then((response) => response.json())
    .then((result) => {
        if (result.code === 200) { cb.utils.alert('提交成功', 'success'); }
        else { cb.utils.alert('提交失败', 'error'); }
    })
    .catch((error) => { cb.utils.alert('网络错误', 'error'); })
    .finally(() => { button.setDisabled(false); });
});
```

## 状态样式控制

### 12. 根据状态设置单元格背景色

```javascript
let enumData = [
    { color: 'rgba(255, 166, 0, 0.25)', value: 0 },   // 待确认-橙色
    { color: 'rgba(88, 140, 233, 0.25)', value: 1 },   // 进行中-蓝色
    { color: 'rgba(24, 182, 129, 0.25)', value: 2 },   // 已确认-绿色
];
gridModel.on('afterSetDataSource', (allData) => {
    gridModel.setColumnState('project_status', 'formatter', (rowInfo, rowData) => {
        let bgColor = enumData.find((v) => v.value == rowData?.project_status?.value)?.color;
        if (bgColor == null) return;
        return {
            override: true,
            html: `<div style='background-color: ${bgColor}; padding: 0 8px; border-radius: 4px;'>${rowData.project_status.text}<div>`,
            text: rowData.project_status.text,
        };
    });
});
```

## 高级状态控制

### 13. beforeSetActionsState 手动设置行按钮

```javascript
viewModel.get("processplan_plan").on("beforeSetActionsState", function(args) {
    args.map((cur) => { cur.button31tj.visible = true; cur.button43zc.visible = true; });
});
```

## 关键 API

| API | 说明 |
|-----|------|
| `field.setVisible(true/false)` | 字段显隐 |
| `field.setDisabled(true/false)` | 字段禁用 |
| `field.setState('bCanModify', bool)` | 字段可编辑 |
| `gridModel.setActionsState(states)` | 行按钮状态数组 |
| `gridModel.setRowState(index, 'readOnly', bool)` | 行只读 |
| `gridModel.setColumnState(field, 'formatter', fn)` | 列格式化 |
| `gridModel.setState('showRowNo', bool)` | 显示行号 |

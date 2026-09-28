
# BizAction 业务动作

## 目录结构

```
patterns/biz-action/
├── SKILL.md           # 本文件
├── 卡片Action.md      # 单据卡片
└── 列表Action.md     # 列表页面
```

## 卡片 Action

### 新增/编辑

```javascript
var biz = viewModel.biz;
var action = biz.action;

// 新增
action.add(billNo, viewModel, params, beforeAct, afterAct);

// 编辑
action.edit(billNo, viewModel, params, beforeAct, afterAct);
```

### 保存/暂存

```javascript
// 保存
action.save(billNo, viewModel, params, beforeAct, afterAct);

// 暂存
action.tmpSave(billNo, viewModel, params, beforeAct, afterAct);
```

### 作废/弃审

```javascript
// 作废
action.abandon(billNo, viewModel, params, beforeAct, afterAct);

// 弃审
action.unApprove(billNo, viewModel, params, beforeAct, afterAct);
```

### 流程操作

```javascript
// 提交
action.commit(billNo, viewModel, params, beforeAct, afterAct);

// 审批
action.approve(billNo, viewModel, params, beforeAct, afterAct);

// 驳回
action.reject(billNo, viewModel, params, beforeAct, afterAct);
```

### 打印输出

```javascript
// 打印
action.print(billNo, viewModel, params, beforeAct, afterAct);

// 输出
action.output(billNo, viewModel, params, beforeAct, afterAct);
```

### 联查

```javascript
// 联查上游
action.linkQueryUp(billNo, viewModel, params, beforeAct, afterAct);

// 联查下游
action.linkQueryDown(billNo, viewModel, params, beforeAct, afterAct);
```

### 导入

```javascript
// 导入
action.import(billNo, viewModel, params, beforeAct, afterAct);

// 导入模板下载
action.importTemplate(billNo, viewModel, params, beforeAct, afterAct);
```

## 列表 Action

### 打开与查询

```javascript
var biz = viewModel.biz;
var action = biz.action;

// 打开单据
action.open(billNo, viewModel, params, beforeAct, afterAct);

// 查询
action.query(billNo, viewModel, params, beforeAct, afterAct);

// 刷新
action.refresh(billNo, viewModel, params, beforeAct, afterAct);
```

### 批量操作

```javascript
// 批量提交
action.batchSubmit(billNo, viewModel, params, beforeAct, afterAct);

// 批量审核
action.batchAudit(billNo, viewModel, params, beforeAct, afterAct);

// 批量弃审
action.batchUnAudit(billNo, viewModel, params, beforeAct, afterAct);

// 批量作废
action.batchAbandon(billNo, viewModel, params, beforeAct, afterAct);
```

### 打印输出

```javascript
// 打印
action.print(billNo, viewModel, params, beforeAct, afterAct);

// 输出
action.output(billNo, viewModel, params, beforeAct, afterAct);

// 打印预览
action.printPreview(billNo, viewModel, params, beforeAct, afterAct);
```

### 联查

```javascript
// 联查
action.linkQuery(billNo, viewModel, params, beforeAct, afterAct);

// 联查上游
action.linkQueryUp(billNo, viewModel, params, beforeAct, afterAct);

// 联查下游
action.linkQueryDown(billNo, viewModel, params, beforeAct, afterAct);
```

## 事件扩展

### 卡片事件

```javascript
viewModel.on('beforeSave', function(data) {
  // 保存前校验
  return true;
});

viewModel.on('afterSave', function(data) {
  cb.utils.alert('保存成功', 'success');
});

viewModel.on('beforeAdd', function(data) { return true; });
viewModel.on('afterAdd', function(data) { });
viewModel.on('beforeEdit', function(data) { return true; });
viewModel.on('afterEdit', function(data) { });
```

### 列表事件

```javascript
viewModel.on('beforeQuery', function(data) {
  // 可修改查询条件
  return true;
});

viewModel.on('afterQuery', function(data) { });

viewModel.on('beforeBatchAudit', function(data) {
  var gridModel = viewModel.getGridModel();
  var selectedRows = gridModel.getSelectedRows();
  if (!selectedRows || selectedRows.length === 0) {
    cb.utils.alert('请选择要审核的数据', 'warning');
    return false;
  }
  return true;
});

viewModel.on('afterBatchAudit', function(data) {
  cb.utils.alert('批量审核完成', 'success');
  viewModel.execute('refresh');
});
```

## 典型场景

### 保存前校验

```javascript
viewModel.on('afterLoadMeta', function() {
  viewModel.on('beforeSave', function() {
    var gridModel = viewModel.get('gridDetails');
    var rows = gridModel.getRows();

    if (!rows || rows.length === 0) {
      cb.utils.alert('明细行不能为空', 'warning');
      return false;
    }

    for (var i = 0; i < rows.length; i++) {
      var amount = gridModel.getCellValue(i, 'amount');
      if (amount < 0) {
        cb.utils.alert('第' + (i+1) + '行金额不能为负数', 'warning');
        return false;
      }
    }

    return true;
  });
});
```

### 批量审核校验

```javascript
viewModel.on('afterLoadMeta', function() {
  viewModel.on('beforeBatchAudit', function() {
    var gridModel = viewModel.getGridModel();
    var selectedRows = gridModel.getSelectedRows();

    for (var i = 0; i < selectedRows.length; i++) {
      if (selectedRows[i].billstatus !== 'SUBMITTED') {
        cb.utils.alert('只能审核已提交的单据', 'warning');
        return false;
      }
    }

    return true;
  });

  viewModel.on('afterBatchAudit', function() {
    cb.utils.alert('审核成功', 'success');
    viewModel.execute('refresh');
  });
});
```


# 业务动作事件

## 标准动作事件

```javascript
// 保存
viewModel.on('beforeSave', function() {
  // 返回 false 阻止保存
  return validate();
});

viewModel.on('afterSave', function(data) {
  // 保存后处理
});

// 提交
viewModel.on('beforeSubmit', function(args) {
  var btnName = args.params?.cItemName;
  if (btnName === 'btnapprovalsub') {
    if (!canApprove()) return false;
  }
  return true;
});

viewModel.on('afterSubmit', function(data) {
  // 提交后处理
});

// 删除
viewModel.on('beforeDelete', function() {
  cb.utils.confirm('确定要删除吗？', function() {
    // 确认后执行
  });
  return false; // 阻止默认删除
});

viewModel.on('afterDelete', function(data) {
  // 删除后刷新
  viewModel.execute('refresh');
});

// 审批
viewModel.on('beforeAudit', function() {
  return validateForAudit();
});

viewModel.on('afterAudit', function(data) {
  // 审批后处理
});

// 弃审
viewModel.on('beforeAbandon', function() {
  return canAbandon();
});

viewModel.on('afterAbandon', function(data) {
  // 弃审后处理
});
```

## 下推/联查事件

```javascript
viewModel.on('beforePush', function(data) {
  // data.sourceBillType - 源单据类型
  // data.targetBillType - 目标单据类型
  return true;
});

viewModel.on('afterPush', function(data) {
  // data.targetBillId - 目标单据ID
});

viewModel.on('beforeLinkquery', function(data) {
  return true;
});

viewModel.on('afterLinkquery', function(data) {
  // data.results - 联查结果
});
```

## 批量操作事件

```javascript
viewModel.on('beforeBatchdo', function(data) {
  return true;
});

viewModel.on('beforeBatchdelete', function(data) {
  var selectedRows = data.selectedRows;
  if (selectedRows.length > 100) {
    cb.utils.alert('批量删除不能超过100条', 'warning');
    return false;
  }
  return true;
});

viewModel.on('beforeBatchAudit', function(data) {
  return true;
});
```

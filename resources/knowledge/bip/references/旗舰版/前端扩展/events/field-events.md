
# 字段事件

## 值变更事件

```javascript
viewModel.on('afterLoadMeta', function() {
  var field = viewModel.get('fieldName');
  if (!field) return;

  field.on('beforeValueChange', function(data) {
    // data.value - 新值
    // data.oldValue - 旧值
    // 返回 false 阻止变更
    if (data.value === 'BLOCKED') {
      cb.utils.alert('该状态不允许修改', 'warning');
      return false;
    }
    return true;
  });

  field.on('afterValueChange', function(data) {
    // data.value - 新值
    // data.oldValue - 旧值
    console.log('字段值变更:', data.oldValue, '->', data.value);
  });
});
```

## 参照浏览事件

```javascript
viewModel.on('afterLoadMeta', function() {
  var refer = viewModel.get('supplierRefer');
  if (!refer) return;

  refer.on('beforeBrowse', function() {
    // 设置过滤条件
    var orgId = viewModel.get('orgId').getValue();
    this.setFilter({
      isExtend: true,
      simpleVOs: [
        { field: 'orgId', op: 'eq', value1: orgId }
      ]
    });
  });

  refer.on('afterBrowse', function(data) {
    // data.selectedRows - 选中的行数据
    console.log('选择了:', data.selectedRows);
  });
});
```

## 枚举字段事件

```javascript
var statusField = viewModel.get('status');

statusField.on('afterValueChange', function(data) {
  // 枚举值判断
  var newStatus = data.value;
  var oldStatus = data.oldValue;

  if (newStatus && newStatus.value === 'APPROVED') {
    // 已审核状态处理
    viewModel.get('approveDate').setValue(new Date());
    viewModel.get('approveUser').setValue(currentUserId);
  }
});
```

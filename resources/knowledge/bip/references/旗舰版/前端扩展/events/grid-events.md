
# 表格事件

## 单元格事件

```javascript
var gridModel = viewModel.getGridModel('childrenField');
if (!gridModel) return;

gridModel.on('beforeCellValueChange', function(data) {
  // data.rowIndex - 行索引
  // data.cellName - 单元格名称
  // data.value - 新值
  // 返回 false 阻止变更
  if (data.cellName === 'amount' && data.value < 0) {
    cb.utils.alert('金额不能为负数', 'warning');
    return false;
  }
  return true;
});

gridModel.on('afterCellValueChange', function(data) {
  // data.rowIndex - 行索引
  // data.cellName - 单元格名称
  // data.value - 新值
  // data.oldValue - 旧值
  // data.isInsert - 是否新行

  // 联动计算
  if (data.cellName === 'qty' || data.cellName === 'price') {
    var qty = gridModel.getCellValue(data.rowIndex, 'qty') || 0;
    var price = gridModel.getCellValue(data.rowIndex, 'price') || 0;
    gridModel.setCellValues([
      { rowIndex: data.rowIndex, cellName: 'amount', value: qty * price }
    ]);
  }
});
```

## 行操作事件

```javascript
gridModel.on('beforeInsertRow', function(data) {
  // data.index - 插入位置
  // data.row - 行数据
  return true;
});

gridModel.on('afterInsertRow', function(data) {
  // data.index - 插入位置
  // data.row - 行数据
  // data.isCopy - 是否复制行

  // 初始化默认值
  gridModel.setCellValues([
    { rowIndex: data.index, cellName: 'rowno', value: data.index + 1 }
  ]);
});

gridModel.on('beforeDeleteRows', function(data) {
  // data.rows - 要删除的行数据
  var selectedRows = gridModel.getSelectedRows();
  if (selectedRows.length > 10) {
    cb.utils.alert('单次删除不能超过10行', 'warning');
    return false;
  }
  return true;
});

gridModel.on('afterDeleteRows', function(data) {
  // 删除后重新编号
  var rows = gridModel.getRows();
  rows.forEach(function(row, i) {
    gridModel.setCellValues([
      { rowIndex: i, cellName: 'rowno', value: i + 1 }
    ]);
  });
});
```

## 选择事件

```javascript
gridModel.on('beforeSelect', function(data) {
  // data.row - 要选中的行
  // data.rowIndex - 行索引
  // 返回 false 阻止选中
  if (data.row.status === 'CLOSED') {
    cb.utils.alert('已关闭行不能选择', 'warning');
    return false;
  }
  return true;
});

gridModel.on('afterSelect', function(data) {
  var selectedRows = gridModel.getSelectedRows();
  console.log('选中行数:', selectedRows.length);
});

gridModel.on('afterSetFocusedRowIndex', function(index) {
  console.log('焦点行:', index);
});
```

## 数据源事件

```javascript
gridModel.on('afterSetDataSource', function(data) {
  // data.data - 新数据
  // 计算汇总
  var rows = gridModel.getRows();
  var totalAmount = 0;
  rows.forEach(function(row) {
    totalAmount += (row.amount || 0);
  });

  // 汇总到表头
  viewModel.get('totalAmount').setValue(totalAmount);
});
```

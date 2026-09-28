
# GridModel 子表操作

## 完整决策流程

```
用户需求（涉及子表）
       ↓
查询元数据 (iuap-c-metadata-info) ⚠️ 必须
       ↓
确认 childrenField（数据字段名）
       ↓
根据需求选择操作：
├─ 行操作 → insertRow / deleteRow / updateRow
├─ 单元格操作 → getCellValue / setCellValue
├─ 事件监听 → afterCellValueChange / beforeInsertRow
└─ 参照过滤 → getEditRowModel + beforeBrowse
```

## 获取 GridModel

**⚠️ 必须传 childrenField（数据字段名），不是实体名**

```javascript
// ❌ 错误：传实体名
var gridModel = viewModel.getGridModel('OrderDetail');

// ✅ 正确：传数据字段名
var gridModel = viewModel.getGridModel('orderDetails');
```

---

## 1. 行数据操作

### API 列表

| API | 说明 |
|-----|------|
| `insertRow(index, rowData)` | 在索引处插入行 |
| `insertRows(index, rows)` | 批量插入行（推荐） |
| `appendRow(obj)` | 追加一行 |
| `deleteRow(rowData)` | 删除单行 |
| `deleteRows(indexes)` | 批量删除行（推荐） |
| `deleteAllRows()` | 删除所有行 |
| `updateRow(index, rowData)` | 更新索引处的行 |
| `updateRows(indexes, rows)` | 批量更新行（高性能） |
| `getRow(index)` | 获取索引处的行 |
| `getRows()` | 获取所有行 |
| `getData()` | 获取所有数据（数组） |
| `getDataSource()` | 获取数据源 |
| `setDataSource(data)` | 设置数据源 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 插入单行
    var result = gridModel.insertRow(0, {
      name: 'New Item',
      price: 100,
      _status: cb.models.DataStates.Insert
    });
    // result = { index: 0, row: {...} }

    // 获取行
    var row = gridModel.getRow(0);

    // 更新行
    gridModel.updateRow(0, { price: 200 });

    // 批量更新行（推荐用于多行更新）
    gridModel.updateRows([0, 1], [
      { price: 200, _status: cb.models.DataStates.Update },
      { price: 300, _status: cb.models.DataStates.Update }
    ]);

    // 批量插入（推荐）
    var rows = data.map(function(item) {
      return { ...item, _status: cb.models.DataStates.Insert };
    });
    gridModel.insertRows(0, rows);

    // 批量删除（推荐）
    gridModel.deleteRows([0, 1, 2]);

    // 删除所有行
    gridModel.deleteAllRows();
  }
});
```

**⚠️ 禁止在循环中调用 insertRow/deleteRow/updateRow**

```javascript
// ❌ 错误：性能问题
data.forEach(function(item, i) {
  gridModel.insertRow(i, item);
});

// ✅ 正确：批量方法
var rows = data.map(function(item) {
  return { ...item, _status: cb.models.DataStates.Insert };
});
gridModel.insertRows(0, rows);
```

---

## 2. 行模型操作（重要）

### API 列表

| API | 说明 |
|-----|------|
| `getEditRowModel()` | 获取当前编辑行的 ContainerModel |
| `getRowModel(index)` | 获取指定索引的行模型 |
| `rowModel.get('fieldName')` | 在行模型中访问字段 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 单元格值变更时获取编辑行模型
    gridModel.on('afterCellValueChange', function(data) {
      var editRowModel = gridModel.getEditRowModel();
      if (editRowModel) {
        // 设置字段值
        editRowModel.get('subQty').setValue(data.value * 2);

        // 设置字段只读
        editRowModel.get('price').setReadOnly(true);

        // 设置字段禁用
        editRowModel.get('qty').setDisabled(false);
      }
    });

    // 增行后设置默认值
    gridModel.on('afterInsertRow', function(args) {
      var rowModel = gridModel.getRowModel(args.index);
      if (rowModel) {
        rowModel.get('lineNo').setValue(args.index + 1);
        rowModel.get('qty').setValue(1);
      }
    });
  }
});
```

---

## 3. 单元格操作

### API 列表

| API | 说明 |
|-----|------|
| `getCellValue(rowIndex, cellName)` | 读取单元格值 |
| `getCellState(rowIndex, cellName, prop)` | 读取单元格状态 |
| `setCellStates(cellStates)` | 批量设置单元格状态 |
| `setCellValues(cellValues)` | 批量设置单元格值（推荐） |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 读取单元格
    var qty = gridModel.getCellValue(0, 'qty');
    var price = gridModel.getCellValue(0, 'price');

    // 计算金额
    var amount = parseFloat(qty || 0) * parseFloat(price || 0);

    // 批量设置单元格（推荐）
    gridModel.setCellValues([
      { rowIndex: 0, cellName: 'amount', value: amount },
      { rowIndex: 0, cellName: 'remark', value: '自动计算' }
    ]);

    // 单元格值变更监听
    gridModel.on('afterCellValueChange', function(data) {
      var rowIndex = data.rowIndex;
      var cellName = data.cellName;
      var value = data.value;

      if (cellName === 'qty' || cellName === 'price') {
        var qty = gridModel.getCellValue(rowIndex, 'qty') || 0;
        var price = gridModel.getCellValue(rowIndex, 'price') || 0;
        var amount = parseFloat(qty) * parseFloat(price);
        gridModel.setCellValue(rowIndex, 'amount', amount);
      }
    });
  }
});
```

---

## 4. 行选择操作

### API 列表

| API | 说明 |
|-----|------|
| `getSelectedRows()` | 获取选中行 |
| `getSelectedRowIndexes()` | 获取选中行索引 |
| `getRowsByIndexes(indexes)` | 按索引获取行 |
| `selectRow(index)` | 选中特定行 |
| `select(indexes)` | 按索引选中多行 |
| `unselectRow(index)` | 取消选中特定行 |
| `selectAll()` | 全选 |
| `unselectAll()` | 全不选 |
| `setFocusedRowIndex(index)` | 设置焦点行索引 |
| `getFocusedRowIndex()` | 获取焦点行索引 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 数据加载后选中前3行
    self.on('afterLoadData', function() {
      gridModel.unselectAll();
      gridModel.select([0, 1, 2]);
    });

    // 获取选中行并处理
    var selectedRows = gridModel.getSelectedRows();
    Object.keys(selectedRows).forEach(function(idx) {
      console.log(selectedRows[idx].productName);
    });

    // 点击行时获取数据
    gridModel.on('beforeclick', function(args) {
      var index = args.index;
      var selectRows = gridModel.getRowsByIndexes([index]);
      var rowData = selectRows[0];
    });
  }
});
```

---

## 5. 列操作

### API 列表

| API | 说明 |
|-----|------|
| `getColumns()` | 获取列 |
| `setColumns(columns)` | 设置列 |
| `getColumn(name)` | 按名称获取列 |
| `setColumnStates(columnStates)` | 设置列状态 |
| `setColumnState(col, prop, value)` | 设置单个列状态 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 列初始化后修改
    gridModel.on('afterSetColumns', function(columns) {
      columns.forEach(function(col) {
        if (col.cItemName === 'price') {
          col.cStyle = 'color: red;';
        }
      });
    });

    // 隐藏列
    gridModel.setColumnState('remark', 'bHidden', true);

    // 列格式化
    gridModel.setColumnState('amount', 'formatter', function(value) {
      return '¥' + value.toFixed(2);
    });
  }
});
```

---

## 6. GridModel 事件

### 事件列表

| 事件 | 参数 | 说明 | 可阻断 |
|------|------|------|--------|
| `afterSetColumns` | columns | 列初始化完成 | ❌ |
| `beforeSelect` | row | 选择行前 | ✅ |
| `afterSelect` | row | 选择行后 | ❌ |
| `beforeUnselect` | row | 取消选择前 | ✅ |
| `afterUnselect` | row | 取消选择后 | ❌ |
| `beforeRowInsert` | {index, row} | 插入行前 | ✅ |
| `afterRowInsert` | {index, row, isCopy} | 插入行后 | ❌ |
| `beforeRowDelete` | row | 删除行前 | ✅ |
| `afterRowDelete` | row | 删除行后 | ❌ |
| `beforeCellValueChange` | {rowIndex, cellName, value} | 单元格值变更前 | ✅ |
| `afterCellValueChange` | {rowIndex, cellName, value, isInsert} | 单元格值变更后 | ❌ |
| `beforeBrowse` | {rowIndex, cellName, context} | 单元格参照浏览前 | ✅ |
| `beforeSetActionsState` | args | 设置行按钮状态前 | ✅ |
| `afterSetActionsState` | data | 设置行按钮状态后 | ❌ |
| `rowColChange` | {value: {columnKey, rowIndex}} | 点击单元格 | ❌ |
| `cellJointQuery` | args | 单元格联查事件 | ❌ |
| `beforeInsertRowsFromRefer` | {rows, index} | 从参照增行前 | ✅ |
| `afterInsertRowsFromRefer` | {rows, index} | 从参照增行后 | ❌ |
| `afterSetDataSource` | args | 设置数据源后 | ❌ |
| `beforeSelectAll` | data | 全选前 | ✅ |
| `afterSelectAll` | data | 全选后 | ❌ |
| `beforeUnselectAll` | data | 取消全选前 | ✅ |
| `afterUnselectAll` | data | 取消全选后 | ❌ |
| `beforeInsertRows` | {index, rows} | 批量插入行前 | ✅ |
| `afterInsertRows` | {index, rows} | 批量插入行后 | ❌ |
| `beforeDeleteRows` | rows, rowIndexes | 批量删除行前 | ✅ |
| `afterDeleteRows` | rows | 批量删除行后 | ❌ |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 阻止增行
    gridModel.on('beforeInsertRow', function() {
      var rows = gridModel.getRows();
      if (Object.keys(rows).length >= 10) {
        cb.utils.alert('最多只能添加10行', 'warning');
        return false;
      }
      return true;
    });

    // 增行设置默认值
    gridModel.on('beforeInsertRow', function(data) {
      data.row = data.row || {};
      data.row.lineNo = { value: gridModel.getRowsCount() + 1 };
      data.row.qty = { value: 1 };
    });

    // 单元格变更计算
    gridModel.on('afterCellValueChange', function(data) {
      var rowIndex = data.rowIndex;
      var cellName = data.cellName;
      var value = data.value;

      if (cellName === 'qty' || cellName === 'price') {
        var qty = parseFloat(gridModel.getCellValue(rowIndex, 'qty') || 0);
        var price = parseFloat(gridModel.getCellValue(rowIndex, 'price') || 0);
        var amount = qty * price;
        gridModel.setCellValue(rowIndex, 'amount', amount);
      }
    });

    // 阻止删行
    gridModel.on('beforeDeleteRows', function(rows, rowIndexes) {
      if (rowIndexes.length > 0) {
        var confirmed = cb.utils.confirm('确定要删除选中的行吗？');
        return confirmed;
      }
      return true;
    });

    // 行按钮状态控制
    gridModel.on('beforeSetActionsState', function(args) {
      var rowIndex = args.index;
      var rowData = gridModel.getRow(rowIndex);
      if (rowData.status === 'APPROVED') {
        args.states = { delete: false, edit: false };
      }
    });
  }
});
```

---

## 7. UI 状态控制

### API 列表

| API | 说明 |
|-----|------|
| `setReadOnly(boolean)` | 只读 |
| `setDisabled(boolean)` | 禁用 |
| `setVisible(boolean)` | 显隐 |
| `setShowCheckbox(boolean)` | 复选框显隐 |
| `setActionsState(actionsState)` | 行级操作按钮状态 |
| `setState('showRowNo', false)` | 隐藏行号 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 子表只读
    gridModel.setReadOnly(true);

    // 子表禁用
    gridModel.setDisabled(true);

    // 子表隐藏
    gridModel.setVisible(false);

    // 设置复选框
    gridModel.setShowCheckbox(true);

    // 隐藏行号
    gridModel.setState('showRowNo', false);

    // 行级按钮状态
    gridModel.on('beforeSetActionsState', function(args) {
      var rowData = gridModel.getRow(args.index);
      if (rowData._status === 'Delete') {
        args.states = { delete: false };
      }
    });
  }
});
```

---

## 8. 行号控制

### API 列表

| API | 说明 |
|-----|------|
| `lineNoGenerateType(1)` | 1=按步长自动排序 |
| `lineNoField('priorityNo')` | 行号字段名 |
| `autoGenerateLineNo()` | 自动生成行号 |
| `autoGenerateLineNoWithoutState(true)` | 不区分状态生成行号 |
| `lineNoStep(step)` | 设置步长 |
| `getRowsCount()` | 获取行数 |

### 代码模板

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 自动生成行号
    gridModel.autoGenerateLineNo();

    // 设置步长
    gridModel.lineNoStep(1);

    // 自定义行号字段
    gridModel.lineNoField('lineNo');

    // 隐藏行号
    gridModel.setState('showRowNo', false);
  }
});
```

---

## 9. 子表参照过滤

详见：[refer-model.md](refer-model.md)

```javascript
cb.define({
  init: function() {
    var self = this;
    var gridModel = self.getGridModel('orderDetails');

    // 子表单元格参照过滤
    gridModel.on('afterCellValueChange', function(data) {
      if (data.cellName === 'material') {
        var editRowModel = gridModel.getEditRowModel(data.rowIndex);
        if (editRowModel) {
          var batchRefer = editRowModel.get('batchNO');
          if (batchRefer) {
            batchRefer.on('beforeBrowse', function() {
              this.setFilter({
                isExtend: true,
                simpleVOs: [
                  { field: 'materialId', op: 'eq', value1: data.value }
                ]
              });
            });
          }
        }
      }
    });
  }
});
```

---

## 禁止事项

| 禁止 | 正确 |
|-----|------|
| 循环中 insertRow | `insertRows()` 批量 |
| 循环中 deleteRow | `deleteRows()` 批量 |
| 循环中 updateRow | `updateRows()` 批量 |
| `gridModel.setCellValue()` | `setCellValues()` 批量 |
| 传实体名 | 传数据字段名 childrenField |
| `data.newValue` | `data.value` |


# DataState 行状态管理

## 目录结构

```
models/data-state/
├── SKILL.md           # 本文件
└── 行状态管理.md      # 完整指南
```

## 数据状态常量

```javascript
cb.models.DataStates = {
  Insert: 'Insert',       // 新增行
  Update: 'Update',      // 修改行
  Delete: 'Delete',      // 删除行
  Unchanged: 'Unchanged' // 无变更
};
```

## 行状态标记规则

### 新增行

```javascript
// ✅ insertRow 时标记 Insert
gridModel.insertRow(0, {
  productName: '产品A',
  qty: 10,
  _status: cb.models.DataStates.Insert
});
```

### 修改行

```javascript
// ✅ updateRow 前标记 Update
var row = gridModel.getRow(index);
if (row._status !== cb.models.DataStates.Insert) {
  row._status = cb.models.DataStates.Update;
}
Object.assign(row, newData);
gridModel.updateRow(index, row);
```

### 删除行

```javascript
// ✅ 区分新增和已有
var row = gridModel.getRow(index);
if (row._status === cb.models.DataStates.Insert) {
  gridModel.deleteRow(index); // 新行直接删除
} else {
  row._status = cb.models.DataStates.Delete;
  gridModel.updateRow(index, row); // 已有行标记删除
}
```

## 批量操作状态管理

```javascript
// 批量插入
var rows = data.map(function(item) {
  return {
    ...item,
    _status: cb.models.DataStates.Insert
  };
});
gridModel.insertRows(0, rows);

// 批量更新
var updates = rows.map(function(row, i) {
  return {
    rowIndex: i,
    data: row,
    status: row._status !== cb.models.DataStates.Insert
      ? cb.models.DataStates.Update
      : cb.models.DataStates.Insert
  };
});
gridModel.updateRows(updates);
```

## 脏数据管理

```javascript
// 获取脏数据（只有变化的数据）
var dirtyData = model.getDirtyData();

// 获取所有数据
var allData = model.getAllData();

// 获取真实数据（未保存的修改）
var realData = model.getRealData();

// 设置脏标记
model.setDirty(true);
```

## ContainerModel 数据操作

```javascript
// 获取所有数据
var allData = containerModel.getAllData();

// 获取真实数据
var realData = containerModel.getRealData();

// 获取脏数据
var dirty = containerModel.getDirtyData(true);

// 设置数据
containerModel.setData(data, false);

// 获取数据
var data = containerModel.getData();
```

## 内部属性

GridModel 使用内部属性：

| 属性 | 默认值 | 说明 |
|------|--------|------|
| `id` | `_id` | 行唯一标识符 |
| `selected` | `_selected` | 选择状态 |
| `status` | `_status` | 数据状态 |

## 禁止事项

| 禁止 | 正确 |
|-----|------|
| 新行缺少 `_status` | 必须标记 `_status: DataStates.Insert` |
| 直接修改 dataSource | 使用 insertRow/updateRow |
| 不区分新增和已有删除 | 新增直接删，已有标记 Delete |

## 典型场景

### 保存前校验状态

```javascript
viewModel.on('beforeSave', function() {
  var gridModel = viewModel.getGridModel('details');
  var rows = gridModel.getRows();

  rows.forEach(function(row, i) {
    if (row._status === cb.models.DataStates.Unchanged) return;

    if (row._status === cb.models.DataStates.Delete) return;

    if (row._status === cb.models.DataStates.Insert || row._status === cb.models.DataStates.Update) {
      if (!row.productName) {
        cb.utils.alert('第' + (i+1) + '行产品名称不能为空', 'error');
        return false;
      }
    }
  });

  return true;
});
```

### 加载数据重置状态

```javascript
function loadData(dataArray) {
  gridModel.setDataSource(dataArray.map(function(item) {
    return {
      ...item,
      _status: cb.models.DataStates.Unchanged
    };
  }));
}
```

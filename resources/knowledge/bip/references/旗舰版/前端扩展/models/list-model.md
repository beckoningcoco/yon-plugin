
# ListModel 列表页操作

## 目录结构

```
models/list-model/
├── SKILL.md           # 本文件
├── 选中操作.md        # getSelectedRows
├── 查询操作.md        # query/refresh
└── 批量处理.md        # 批量选择
```

## 获取列表模型

```javascript
var listModel = viewModel.get('listModel');
// 或
var listModel = viewModel.getListModel();
```

## 选中操作

```javascript
// 获取选中行
var selectedRows = listModel.getSelectedRows();

// 获取选中行索引
var indexes = listModel.getSelectedRowIndexes();

// 按条件选中
listModel.selectRow(0);
listModel.select([0, 1, 2]);

// 全选/取消全选
listModel.selectAll();
listModel.unselectAll();

// 设置选中键
listModel.setSelectedKeys(['key1', 'key2']);
```

## 查询操作

```javascript
// 触发查询
listModel.query({ mask: true });

// 刷新
listModel.qrefresh();

// 带条件查询
listModel.query({
  condition: {
    simpleVOs: [
      { field: 'status', op: 'eq', value1: 'APPROVED' }
    ]
  }
});
```

## 事件监听

```javascript
listModel.on('afterSelect', function(data) {
  var rows = listModel.getSelectedRows();
  console.log('选中行数:', rows.length);
});

listModel.on('beforeSelect', function(data) {
  // 返回 false 阻止选中
  if (data.row.status === 'CLOSED') {
    return false;
  }
});

listModel.on('beforeSearch', function(data) {
  // 修改查询条件
  var params = data.params;
  params.simpleVOs = params.simpleVOs || [];
  params.simpleVOs.push({
    field: 'orgId',
    op: 'eq',
    value1: currentOrgId
  });
});
```

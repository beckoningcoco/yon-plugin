
# TreeModel 树组件操作

## 目录结构

```
models/tree-model/
├── SKILL.md           # 本文件
└── 树组件操作.md      # 完整指南
```

## 组件类型

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| SearchTree | 搜索树 | 左侧分类导航、地区筛选 |
| TreeTable | 树表格 | 层级数据展示和操作 |
| TreeRefer | 树参照 | 参照弹窗选择 |

## 获取 TreeModel

```javascript
// 获取树模型
var treeModel = viewModel.getTreeModel();

// 获取所有树模型
var treeModels = viewModel.getTreeModels();

// 获取指定树模型
var treeModel = viewModel.get('treeName');
```

## 搜索树 (SearchTree)

### 节点操作

```javascript
// 展开指定节点
treeModel.setState('expandedKeys', ['node1', 'node2']);

// 展开所有节点
treeModel.onExpandAll();

// 展开指定层级
treeModel.expandLayer(2);  // 展开前2层
treeModel.expandLayer(0, true); // 展开所有层
```

### 节点可选控制

```javascript
// 节点数据配置
{
  name: '节点1',
  selectable: false  // 不可选
}

// 或
{
  name: '节点1',
  disabled: true  // 禁用，显示灰色
}
```

### 操作按钮控制

```javascript
// 设置节点级按钮状态
treeModel.setActionsState({
  btnAdd: {
    node1: false,  // 隐藏
    node2: true     // 显示
  }
});
```

### 显示配置

```javascript
// 显示图标
treeModel.setState('showIcon', true);

// 树数据配置图标
{
  name: '节点1',
  icon: 'zuidahua'
}

// 右侧图标
{
  name: '节点1',
  rightIcon: 'zuidahua'
}

// 显示全选
{
  cStyle: '{"showSelectAll":true}'
}

// 配置标题
{
  cStyle: '{"searchTreeTitle":"行政区划","searchTreeTitleTips":"帮助提示"}'
}
```

### 节点标签

```javascript
// 节点显示标签
{
  name: '节点1',
  tagName: '类别',
  tagBackColor: 'red'
}
```

### 节点提示

```javascript
{
  name: '节点1',
  tips: {
    content: '提示内容',
    trigger: 'hover'  // 或 'click'
  }
}
```

### 搜索配置

```javascript
// 搜索字段和占位符
{
  cStyle: '{"filters":["code","name"],"placeholder":"编码/名称"}'
}

// 节点名称格式（支持多字段组合）
{
  cStyle: '{"titleField":"<%code%> <%name%>"}'
}

// "全部"节点
{
  cStyle: '{"showAllNode":true,"allNodeText":"所有项目"}'
}
```

## 树表格 (TreeTable)

### 展开控制

```javascript
// 展开指定层级
treeModel.expandLayer(2);

// 默认展开所有行
viewModel.on('afterMount', function() {
  treeModel.setState('expandAllRow', true);
});
```

### 复选框

```javascript
viewModel.on('init', function() {
  treeModel.setState('multiple', true);
  treeModel.setState('showCheckBox', true);
});

// 父子关联选择
{
  cStyle: '{"childrenIsIncluded":true}'
}
```

### 拖拽排序

```javascript
// 1. 配置cStyle
{
  cStyle: '{"rowDraggable":true,"orderField":"orderNum"}'
}

// 2. 脚本控制
treeModel.setRowDraggable(true);
treeModel.setRowDraggable(false);
```

### 大文本显示

```javascript
// 列配置
{
  cStyle: '{"type":"textarea","maxRows":10,"textareaShowMore":true}'
}

// 启用新渲染
treeModel.setState('newRender', true);
```

### 按钮显示隐藏

```javascript
treeModel.on('afterSetDataSource', function() {
  var rows = treeModel.getNodesByKeys();
  var actions = treeModel.getCache('actions');
  var actionsStates = [];

  rows.forEach(function(data, index) {
    actions.forEach(function(action) {
      if (action.cItemName === 'btnAdd') {
        actionsStates.push({
          key: data.id,
          itemName: 'btnAdd',
          name: 'visible',
          value: data.isEnd
        });
      }
    });
  });

  treeModel.setActionsState(actionsStates);
});
```

### 行样式

```javascript
// 设置行className
treeModel.setRowState(index, 'className', 'bg-red');
```

### 数据操作

```javascript
// 平铺数据（自动转层级）
var flatData = [
  { id: '1', parent: null },
  { id: '1-1', parent: '1' }
];
treeModel.setData(flatData);

// 层级数据
var treeData = [
  { id: '1', children: [{ id: '1-1' }] }
];
treeModel.setDataSource(treeData);

// 获取数据
var dataSource = treeModel.get('dataSource');
var rows = treeModel.get('rows');
var node = treeModel.getNode('nodeKey');
```

### 懒加载

```javascript
// 1. 配置cStyle
{
  cStyle: '{"lazy":true}'
}

// 2. 监听展开事件加载子节点
treeModel.on('expandNode', function(data) {
  var nodeKey = data.nodeKey;
  // 调用接口加载子节点
  loadChildren(nodeKey).then(function(children) {
    var node = treeModel.getNode(nodeKey);
    node.children = children;
    treeModel.setDataSource(updatedData);
  });
});
```

### 标题筛选

```javascript
// 获取筛选项
treeModel.on('beforeSetColFilterDataSourceMap', function(args) {
  var rows = treeModel.get('rows');
  rows.forEach(function(row) {
    var value = row.get('status');
    var text = row.get('status_name');
    // 添加筛选项
  });
});

// 实现筛选
treeModel.on('beforeFilter', function(args) {
  var filteredRows = args.rows.filter(function(row) {
    return row.get('status') === args.filterParams.status;
  });
  treeModel.setRows(filteredRows);
  return false;
});
```

### 数据状态维护

```javascript
// 新增数据时维护状态
var keyDataState = treeModel.get('keyDataState');
keyDataState['xxx'] = cb.models.DataStates.Insert;
```

## 树模型事件

| 事件 | 说明 |
|------|------|
| `afterSetDataSource` | 数据源设置后 |
| `expandNode` | 节点展开时（懒加载） |
| `beforeSelect` | 选择节点前 |
| `afterSelect` | 选择节点后 |
| `beforeExpand` | 展开节点前 |
| `afterExpand` | 展开节点后 |

## 常用场景

### 左侧分类树

```javascript
var treeModel = viewModel.getTreeModel();

treeModel.on('afterSelect', function(data) {
  var selectedNode = data.node;
  var nodeKey = selectedNode.key;

  // 刷新主列表
  var gridModel = viewModel.getGridModel('list');
  gridModel.query({ categoryId: nodeKey });
});
```

### 树表格批量操作

```javascript
treeModel.on('afterSelect', function() {
  var selectedRows = treeModel.getSelectedRows();
  console.log('选中:', selectedRows.length, '条');
});

// 全选
treeModel.selectAll();
treeModel.unselectAll();
```


# TagModel 标签参照

## 概述

`TagModel` 是多选标签/多值参照的底层模型，ReferModel 基于此封装。

## 与 ReferModel 的关系

| 模型 | 说明 | 使用场景 |
|------|------|---------|
| ReferModel | 封装好的参照UI组件 | 常规单选/多选参照 |
| TagModel | 底层多选能力 | 需要更灵活的自定义控制 |

## 获取模型

```javascript
var tagModel = viewModel.get('tagName');
```

## 值操作

```javascript
// 获取值
var values = tagModel.getValue();
// 返回: [{ id, code, name }, ...]

// 设置值
tagModel.setValue([{ id: '1', code: '001', name: 'A' }]);

// 添加值
tagModel.addValue({ id: '2', code: '002', name: 'B' });

// 删除值
tagModel.removeValue('1');

// 清空
tagModel.clear();
```

## 节点操作

```javascript
// 获取选中节点
var nodes = tagModel.getSelectedNodes();

// 获取节点数据
var nodeData = tagModel.getNodeById('xxx');

// 设置过滤
tagModel.setFilter({
  isExtend: true,
  simpleVOs: [{ field: 'orgId', op: 'eq', value1: orgId }]
});
```

## 事件

```javascript
// 值变更
tagModel.on('beforeValueChange', function(data) {
  // data.value - 新值
  // data.oldValue - 旧值
  return true;
});

tagModel.on('afterValueChange', function(data) {
  var values = data.value;
  console.log('选中的标签:', values);
});

// 节点选择
tagModel.on('beforeSelect', function(data) { });
tagModel.on('afterSelect', function(data) { });
```

## 典型场景

### 多选标签处理

```javascript
viewModel.on('afterLoadMeta', function() {
  var tagModel = viewModel.get('tags');

  if (tagModel) {
    tagModel.on('afterValueChange', function(data) {
      var values = data.value;
      console.log('选中的标签:', values);

      if (values && values.length > 0) {
        var ids = values.map(function(v) { return v.id; });
        // 根据选中的标签做联动处理
        doLinkage(ids);
      }
    });
  }
});
```

### 标签过滤

```javascript
tagModel.on('beforeBrowse', function() {
  var orgId = viewModel.get('orgId').getValue();
  this.setFilter({
    isExtend: true,
    simpleVOs: [
      { field: 'orgId', op: 'eq', value1: orgId }
    ]
  });
});
```

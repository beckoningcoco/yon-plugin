
# BaseModel 基类

## 概述

`BaseModel` 是所有模型的抽象基类，提供：
- 统一管理内部数据 `_data`
- 通用 UI 状态控制
- 事件总线能力
- 缓存与脏数据机制

## 模型层级

```
BaseModel（基类）
├── SimpleModel      # 单值字段
├── ListModel       # 下拉列表
├── GridModel       # 表体/列表
├── TreeModel       # 树/树表
├── TagModel        # 多选标签
├── ReferModel      # 参照
└── FilterModel     # 区间过滤
```

## 状态控制

```javascript
// 禁用/只读
model.setState('readOnly', true);
model.setState('disabled', true);

// 显隐
model.setState('visible', false);

// 获取状态
var isReadOnly = model.getState('readOnly');
```

## 数据操作

```javascript
// 获取数据
var data = model.getData();

// 标记脏数据
model.setDirty(true);

// 获取脏数据
var dirtyData = model.getDirtyData();

// 设置校验信息
model.setCheckMsg('错误信息');
```

## 缓存机制

```javascript
// 设置缓存
model.setCache('hasInit', true);
model.setCache('customData', { key: 'value' });

// 获取缓存
var hasInit = model.getCache('hasInit');

// 清除缓存
model.clearCache('hasInit');
model.clearCache(); // 清除所有
```

## 事件总线

```javascript
// 绑定事件
model.on('beforeValueChange', function(data) {
  console.log('变更前', data);
  return true; // 返回false可阻止
});

// 解绑事件
model.un('beforeValueChange', callback);

// 触发事件
model.execute('beforeValueChange', { value: 111 });

// Promise形式执行
model.promiseExecute('beforeBrowse');
```

## 父子关系

```javascript
// 获取父级
var parent = model.getParent();

// 获取根父级
var root = model.getRootParent();

// 获取领域标识
var domainKey = model.getDomainKey();
```

## 典型场景

### 控制字段状态

```javascript
var fieldModel = viewModel.get('fieldName');

// 设为只读
fieldModel.setState('readOnly', true);

// 隐藏字段
fieldModel.setState('visible', false);

// 设置校验提示
fieldModel.setCheckMsg('该字段不允许为空');
```

### 防止重复初始化

```javascript
var model = viewModel.get('fieldName');

if (!model.getCache('hasInit')) {
  // 初始化逻辑
  initCustomLogic();
  model.setCache('hasInit', true);
}
```

### 统一拦截事件

```javascript
function bindFieldEvents(viewModel, field) {
  var model = viewModel.get(field);
  model.on('beforeValueChange', function(data) {
    console.log('字段变更前', field, data);
    return true;
  });
}

bindFieldEvents(viewModel, 'field1');
bindFieldEvents(viewModel, 'field2');
```

## AI使用建议

- 优先使用 BaseModel 通用 API
- UI 状态统一用 `setState / getState`
- 业务缓存统一用 `setCache / getCache`
- 事件绑定统一用 `on / un`

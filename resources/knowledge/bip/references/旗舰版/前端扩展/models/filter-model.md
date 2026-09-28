
# FilterModel 查询区操作

## 目录结构

```
models/filter-model/
├── SKILL.md           # 本文件
├── 查询区操作.md      # 获取/设置
└── 查询方案.md        # 方案切换
```

## 获取查询区模型

```javascript
// ✅ 正确
var filterVM = viewModel.getFilterViewModel();

// ⚠️ 避免（频率高但不是标准写法）
var filterVM = viewModel.getCache('FilterViewModel');
```

## 查询区字段操作

```javascript
var filterVM = viewModel.getFilterViewModel();
if (filterVM) {
  var field = filterVM.get('searchField');
  if (field) {
    field.on('afterValueChange', function(data) {
      // 查询区字段值变化
    });
  }
}
```

## 触发查询

```javascript
// 获取查询按钮并触发点击
var queryBtn = filterVM.get('query');
if (queryBtn) {
  queryBtn.execute('click');
}
```

## 查询条件预处理

```javascript
filterVM.on('beforeSearch', function(data) {
  // 添加默认条件
  var params = data.params || {};
  params.simpleVOs = params.simpleVOs || [];

  // 添加组织条件
  params.simpleVOs.push({
    field: 'orgId',
    op: 'eq',
    value1: currentOrgId
  });

  return params;
});
```

## 禁止事项

| 禁止 | 正确 |
|-----|------|
| `getCache('FilterViewModel')` | `getFilterViewModel()` |

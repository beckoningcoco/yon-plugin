# ReferModel 参照过滤

## 完整决策流程

```
┌─────────────────────────────────────────────────────────────┐
│                    参照过滤决策流程                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户需求 → 参照过滤                                     │
│     ↓                                                       │
│  2. 查询元数据 (iuap-c-metadata-info) ⚠️ 必须              │
│     ↓                                                       │
│  3. 从元数据结构判定：主表 or 子表？                          │
│     ↓                                                       │
│  ├─ 主表参照 → 主表过滤模板                                  │
│  └─ 子表行内参照 → 子表过滤模板                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**⚠️ 重要规则：用户未明确说明主表/子表时，必须查询元数据判定，不能臆想**

## 目录结构

```
models/refer-model/
├── SKILL.md           # 本文件
├── 过滤基础.md        # setFilter
├── 动态过滤.md        # beforeBrowse
├── 静态过滤.md        # updateViewMeta
└── 联查跳转.md        # bJointQuery
```

## 判定规则

### 主表参照
- 元数据中字段在主表实体定义
- 获取方式：`viewModel.get('referField')`

### 子表行内参照
- 元数据中字段在子表实体定义
- 获取方式：`viewModel.getGridModel('childrenField')` → `getEditRowModel().get('referField')`

**⚠️ 必须通过元数据查询来判定，不能根据字段名称猜测**

## 过滤基础

**⚠️ 禁止 return filter，必须用 setFilter**

```javascript
// ❌ 错误：不生效
refer.on('beforeBrowse', function(filter) {
  filter.orgId = '123';
  return filter;
});

// ✅ 正确
refer.on('beforeBrowse', function() {
  this.setFilter({
    isExtend: true,
    simpleVOs: [{ field: 'orgId', op: 'eq', value1: '123' }]
  });
});
```

## 过滤格式

```javascript
// ✅ 新格式（必须）
{
  isExtend: true,
  simpleVOs: [
    { field: 'fieldName', op: 'eq', value1: value },
    { field: 'fieldName', op: 'ne', value1: value },
    { field: 'fieldName', op: 'like', value1: value },
    { field: 'fieldName', op: 'in', value1: ['a', 'b', 'c'] }
  ]
}
```

**⚠️ 旧格式 commonVOs 已废弃，不要使用**

```javascript
// ❌ 旧格式（废弃）
{ commonVOs: [...] }
```

## 主表参照过滤

**元数据判定：字段在主表实体**

```javascript
viewModel.on('afterLoadMeta', function() {
  var refer = viewModel.get('supplierRefer');  // 主表参照
  refer.on('beforeBrowse', function() {
    var orgId = viewModel.get('orgId').getValue();
    this.setFilter({
      isExtend: true,
      simpleVOs: [
        { field: 'orgId', op: 'eq', value1: orgId }
      ]
    });
  });
});
```

## 子表行内参照过滤

**元数据判定：字段在子表实体，需要通过 getEditRowModel 获取**

```javascript
var gridModel = viewModel.getGridModel('orderDetails');
gridModel.on('afterCellValueChange', function(data) {
  if (data.cellName === 'productRefer') {
    var editRowModel = gridModel.getEditRowModel();
    if (editRowModel) {
      var supplierRefer = editRowModel.get('supplierRefer');
      supplierRefer.on('beforeBrowse', function() {
        var productId = editRowModel.get('productId').getValue();
        this.setFilter({
          isExtend: true,
          simpleVOs: [
            { field: 'productId', op: 'eq', value1: productId }
          ]
        });
      });
    }
  }
});
```

## 浏览态联查（bJointQuery）

**字段本身是参照时，浏览态联查优先用原生能力**

```javascript
// 在字段元数据中配置
{
  cItemName: 'supplierCode',
  cModelType: 'ReferModel',
  bJointQuery: true,
  referKeyItemName: 'supplierId',  // 关联的id字段
  jointQueryOpt: {
    billnum: 'supplier',
    type: 'url'
  }
}
```

## 禁止事项

| 禁止 | 正确 |
|-----|------|
| `return filter` | `this.setFilter()` |
| `filter.commonVOs` | `simpleVOs` |
| 参照过滤用自定义组件 | 先用 bJointQuery 原生联查 |
| 不查询元数据就臆想主表/子表 | 必须查询元数据判定 |

# MDF 扩展开发流程

## 概述

MDF（Master Data Framework）扩展开发是 YonBIP 平台前端定制的主要方式。通过编写 `*_VM.Extend.js` 扩展文件，可以在不修改平台源码的情况下实现业务逻辑定制。

## 目录结构

```
# 扩展文件命名规范
common_VM.Extend.js           # 公共扩展（可能被多个页面引用）
ycContract_VM.Extend.js       # 业务扩展（按业务模块命名）
ysPricePlan_filterVM.Extend.js # 查询区扩展

# 存放位置
/src/main/java/.../webapp/   # 前端源码目录
```

## 开发流程

### Step 1: 需求可行性判断

在开始之前，先判断需求是否在扩展脚本能力范围内。

详见：[04-feasibility-check.md](04-feasibility-check.md)

### Step 2: 查询元数据（强制）

**⚠️ 必须先查询元数据确认：**
- 字段是主表还是子表
- 子表的数据字段名（childrenField）
- 特征组和特征编码

详见：BIP 元数据管理页面

### Step 3: 定位扩展文件

1. 确认扩展所在的业务单据（如：销售订单 `ycsaleorder`）
2. 查找或创建对应的 `*_VM.Extend.js` 文件
3. 如有查询区，查找 `*_filterVM.Extend.js`

### Step 4: 确定扩展点

| 需求 | 对应文档 | 关键 API |
|------|---------|---------|
| 加载后初始化 | [lifecycle.md](../events/lifecycle.md) | `afterLoadData` |
| 字段赋值/取值 | [simple-model.md](../models/simple-model.md) | `setValue/getValue` |
| 参照过滤 | [refer-model.md](../models/refer-model.md) | `beforeBrowse` |
| 表格增删改 | [grid-model.md](../models/grid-model.md) | `insertRow/updateRow` |
| 保存前校验 | [biz-actions.md](../events/biz-actions.md) | `beforeSave` |
| HTTP 调用 | [backend-query.md](../patterns/backend-query.md) | `setProxy/ensure` |
| 下拉动态选项 | [list-model.md](../models/list-model.md) | `setDataSource` |
| 页面间传参 | [context.md](../patterns/context.md) | `getParams/setCache` |

### Step 5: 编写扩展代码

```javascript
cb.define({
  init: function() {
    var self = this;

    // 数据加载后
    self.on('afterLoadData', function() {
      // 设置默认值
      self.get('busiType').setValue('SALE');
    });

    // 字段联动
    self.get('customer').on('afterValueChange', function(data) {
      // 加载客户关联的收货地址
    });

    // 保存前校验
    self.on('beforeSave', function() {
      return validate();
    });
  },

  // 自定义方法
  validate: function() {
    var self = this;
    var amount = self.get('amount').getValue();
    return amount > 0;
  }
});
```

### Step 6: 调试与验证

1. **本地调试**：在浏览器控制台查看 `cb` 对象
2. **日志输出**：`cb.utils.alert()` 或 `console.log()`
3. **单元测试**：使用 Jest/Playwright 测试

### Step 7: Lint 检查

提交前确保：
- 无 `cb.rest.DynamicProxy`（需用 `setProxy`）
- Grid 操作使用批量 API（`insertRows` 而非循环 `insertRow`）
- 无 ES2023+ 禁止的特性（`findLast` 等）

详见：[01-lint-rules.md](../rules/01-lint-rules.md)

## 子技能索引

| 技能 | 用途 |
|------|------|
| [simple-model.md](../models/simple-model.md) | 主表字段操作 |
| [grid-model.md](../models/grid-model.md) | 表格操作 |
| [refer-model.md](../models/refer-model.md) | 参照过滤 |
| [lifecycle.md](../events/lifecycle.md) | 生命周期与事件 |
| [biz-actions.md](../events/biz-actions.md) | 业务动作 |
| [backend-query.md](../patterns/backend-query.md) | 后端调用 |

# 技术路线决策指南

## 完整决策流程

```
用户需求
       ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤1: 查询元数据 (iuap-c-metadata-info) ⚠️ 必须          │
│  - 字段位置（主表/子表）                                     │
│  - childrenField（子表标识）                                 │
│  - 特征组和特征编码                                         │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤2: Intent 分类                                        │
│  - FIELD_READ / FIELD_WRITE / FIELD_LINKAGE                │
│  - GRID_READ / GRID_WRITE / GRID_ROW                       │
│  - REFER_FILTER / BACKEND_QUERY                            │
│  - BUTTON_EVENT / VALIDATION / PAGE_COMM                   │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤3: Model 类型决策（基于元数据）                         │
│  - 主表字段 → SimpleModel                                  │
│  - 子表字段 → GridModel                                    │
│  ⚠️ 用户未明确时，必须查询元数据判定，不能臆想                  │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤4: 后端调用决策 (CRITICAL)                              │
│  详见"后端调用决策流程"                                      │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤5: 选择模板并生成代码                                   │
│  - 参考 templates/ 目录                                     │
│  - Lint 规则校验                                            │
└─────────────────────────────────────────────────────────────┘
```

**⚠️ 核心原则：用户未明确说明主表/子表时，必须查询元数据判定，不能臆想**

## 后端调用决策流程 (CRITICAL)

```
┌─────────────────────────────────────────────────────────────┐
│                  后端调用决策流程                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户明确说"Java后端" / "后端接口"                       │
│     → 使用 Java 后端 API（用户提供具体方式）                 │
│                                                             │
│  2. 用户明确说"外部API" / "第三方接口"                      │
│     → 使用 setProxy + 外部 URL                              │
│                                                             │
│  3. 用户明确说"API脚本" / "函数" / "invokeFunction"         │
│     → 使用 setProxy（专用于 API 脚本）                      │
│                                                             │
│  4. 公有云 + 未明确说明 ⚠️ 默认                              │
│     → 使用 invokeFunction 调用 BIP API 脚本                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 决策矩阵

| 场景 | 调用方式 | 何时使用 | 示例 |
|------|---------|---------|------|
| 公有云 + 未指定后端 | `invokeFunction` | **默认选择** | 查询重复编码 |
| 公有云 + 明确"Java后端" | Java API | 用户指定 | 自定义服务 |
| 公有云 + 明确"API脚本" | `setProxy` | 用户指定 | API脚本调用 |
| 外部第三方API | `setProxy` | 外部URL | 第三方集成 |

## Intent → 技术路线矩阵

| Intent | 关键词 | 技术路线 | API |
|--------|--------|---------|-----|
| FIELD_READ | 读取、获取、显示值 | `field.getValue()` | SimpleModel |
| FIELD_WRITE | 设置、赋值、填入值 | `field.setValue()` | SimpleModel |
| FIELD_LINKAGE | 联动、变化、触发 | `afterValueChange` | 字段事件 |
| GRID_READ | 读取子表、单元格值 | `gridModel.getCellValue()` | GridModel |
| GRID_WRITE | 写入子表、单元格赋值 | `gridModel.setCellValues()` | GridModel |
| GRID_ROW | 增行、删行、插入行 | `insertRow/deleteRow` | GridModel |
| REFER_FILTER | 过滤、参照条件 | `beforeBrowse + setFilter` | ReferModel |
| BACKEND_QUERY | 调用API、查询数据 | 见后端决策 | invokeFunction/setProxy |
| BUTTON_EVENT | 按钮点击 | `button.on('click')` | 业务动作 |
| VALIDATION | 校验、保存前校验 | `beforeSave` | 生命周期事件 |
| PAGE_COMM | 弹窗、返回、通信 | `communication()` | ViewModel |

## Model 类型决策（所有字段操作场景必须判定）

**⚠️ 核心原则：所有涉及字段操作的场景，都必须先查询元数据判定主表/子表，不能臆想**

涉及 Model 类型判定的 Intent：
- `FIELD_READ` / `FIELD_WRITE` / `FIELD_LINKAGE`
- `REFER_FILTER`
- `GRID_READ` / `GRID_WRITE` / `GRID_ROW`

### Model 决策矩阵

| Intent | 主表判定（字段在主表实体） | 子表判定（字段在子表实体） |
|--------|--------------------------|--------------------------|
| FIELD_READ | `viewModel.get('f').getValue()` | `gridModel.getCellValue(row, 'f')` |
| FIELD_WRITE | `viewModel.get('f').setValue()` | `gridModel.setCellValue(row, 'f', v)` |
| FIELD_LINKAGE | `viewModel.get('f').on('afterValueChange')` | `gridModel.on('afterCellValueChange')` |
| REFER_FILTER | `viewModel.get('ref').on('beforeBrowse')` | `getEditRowModel().get('ref').on('beforeBrowse')` |
| GRID_READ | - | `gridModel.getRows() / getCellValue()` |
| GRID_WRITE | - | `gridModel.setCellValues() / insertRows()` |
| GRID_ROW | - | `gridModel.insertRows() / deleteRows()` |

### 参照过滤场景

| 参照位置 | 元数据判定 | 获取参照 | 过滤方式 |
|----------|-----------|----------|---------|
| 主表参照 | 字段在主表实体 | `viewModel.get('referField')` | `refer.on('beforeBrowse')` |
| 子表行内参照 | 字段在子表实体 | `getEditRowModel().get('referField')` | 行内过滤模板 |

### 完整决策示例

```
场景：过滤供应商参照
    ↓
用户未明确主表/子表
    ↓
查询元数据 → 供应商字段在主表实体
    ↓
判定：主表参照 → SimpleModel
    ↓
代码：viewModel.get('supplier').on('beforeBrowse')
```

```
场景：过滤子表行内供应商参照
    ↓
用户未明确主表/子表
    ↓
查询元数据 → 供应商字段在子表实体（orderDetails）
    ↓
判定：子表行内参照 → GridModel + getEditRowModel
    ↓
代码：getEditRowModel().get('supplier').on('beforeBrowse')
```

详见：[refer-model.md](../models/refer-model.md)

## 5 个典型场景

### 场景1：参照过滤 - 按组织过滤供应商

**需求**：供应商参照需要按当前登录组织过滤。

```
1. 需求分析
   → Intent: REFER_FILTER（参照过滤）
   → 需要过滤供应商列表

2. 元数据查询 (iuap-c-metadata-info) ⚠️ 必须
   → 供应商字段在主表还是子表？
   → 字段实体定义位置

3. Model 决策（基于元数据）
   → 主表 → SimpleModel + refer.on('beforeBrowse')
   → 子表 → GridModel + getEditRowModel + 行内过滤

4. 代码生成
   → 模板: simple-model-filter.js 或 grid-filter-sync.js
   → 使用 setFilter() 设置过滤条件
   → Lint 校验

生成代码（主表参照）:
```javascript
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadMeta', function() {
      var supplierRefer = self.get('supplier');
      supplierRefer.on('beforeBrowse', function() {
        var orgId = self.get('orgId').getValue();
        this.setFilter({
          isExtend: true,
          simpleVOs: [
            { field: 'orgId', op: 'eq', value1: orgId }
          ]
        });
      });
    });
  }
});
```

### 场景2：保存校验 - 查询重复编码

**需求**：客户档案保存前，需要查询关联编码是否重复。

```
1. 需求分析
   → Intent: VALIDATION（beforeSave）
   → 需要后端查询来检查重复

2. 元数据查询 (iuap-c-metadata-info)
   → 主表还是子表？
   → childrenField（如果是子表）
   → 特征编码

3. 后端调用决策
   → 未明确指定后端
   → 公有云默认 → invokeFunction

4. 事件选择
   → beforeSave 生命周期事件

5. 代码生成
   → 模板: validation.js
   → beforeSave 内调用 invokeFunction
   → Lint 校验

生成代码:
```javascript
cb.define({
  init: function() {
    var self = this;
    self.on('beforeSave', function() {
      var params = {
        customerCode: self.get('customerCode').getValue()
      };
      try {
        cb.rest.invokeFunction(
          'tenantId.package.checkDuplicate',
          params,
          function(err, res) {
            if (err) {
              cb.utils.alert(err.message, 'error');
              return;
            }
            if (res.data && res.data.exists) {
              cb.utils.alert('编码已存在', 'warning');
              return;
            }
            // 继续保存
          }
        );
      } catch (err) {
        cb.utils.alert(err, 'error');
      }
    });
  }
});
```

### 场景3：按钮点击 - 外部API调用

**需求**：按钮点击调用外部第三方API。

```
1. 需求分析
   → Intent: BUTTON_EVENT
   → 外部第三方 API

2. 元数据查询
   → 查询按钮所在位置

3. 后端调用决策
   → 明确"外部API" / "第三方接口"
   → setProxy 方式

4. 事件选择
   → button.on('click')

5. 代码生成
   → 模板: button-event.js
   → setProxy + proxy.ensure()
   → Lint 校验

生成代码:
```javascript
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadMeta', function() {
      self.setProxy({
        queryExternal: {
          url: '/external-api/endpoint',
          method: 'POST',
          options: { mask: true }
        }
      });
    });
    var btn = self.get('btnExternal');
    btn.on('click', function() {
      var proxy = self.getProxy('queryExternal');
      proxy.ensure(
        { param: 'value' },
        function(resp) {
          if (resp.success) {
            cb.utils.alert('调用成功', 'success');
          }
        },
        function(resp) {
          cb.utils.alert('调用失败', 'error');
        }
      );
    });
  }
});
```

### 场景4：字段联动 - 自动填充

**需求**：修改供应商时，自动填充联系人信息。

```
1. 需求分析
   → Intent: FIELD_LINKAGE
   → 供应商字段触发联系人自动填充

2. 元数据查询
   → 主表还是子表？
   → 字段编码: supplier, contact, phone

3. 事件选择
   → 供应商字段的 afterValueChange

4. 代码生成
   → 模板: field-linkage.js
   → invokeFunction 调用后端
   → setValue 填充数据
   → Lint 校验

生成代码:
```javascript
cb.define({
  init: function() {
    var self = this;
    var supplierField = self.get('supplier');
    supplierField.on('afterValueChange', function(data) {
      var supplierId = data.value;
      if (!supplierId) return;
      try {
        cb.rest.invokeFunction(
          'tenantId.package.getSupplierContact',
          { supplierId: supplierId },
          function(err, res) {
            if (err) {
              cb.utils.alert(err.message, 'error');
              return;
            }
            self.get('contact').setValue(res.data.contact);
            self.get('phone').setValue(res.data.phone);
          }
        );
      } catch (err) {
        cb.utils.alert(err, 'error');
      }
    });
  }
});
```

### 场景5：子表批量操作

**需求**：计算所有明细行的金额总和。

```
1. 需求分析
   → Intent: GRID_READ + GRID_WRITE
   → 读取所有行，计算总和，写入主表

2. 元数据查询
   → 确认是子表
   → childrenField: 'orderDetails'
   → 字段编码: amount, totalAmount

3. 事件选择
   → afterLoadData 初始计算
   → afterCellValueChange 实时更新

4. 代码生成
   → 使用 getRows() 批量读取
   → 使用 setCellValues() 批量写入
   → 禁止循环 insertRow/deleteRow
   → Lint 校验

生成代码:
```javascript
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadData', function() {
      calculateTotal();
    });
    function calculateTotal() {
      var gridModel = self.getGridModel('orderDetails');
      var rows = gridModel.getRows();
      var total = 0;
      Object.keys(rows).forEach(function(idx) {
        var amount = rows[idx].amount || 0;
        total += parseFloat(amount);
      });
      self.get('totalAmount').setValue(total);
    }
    var gridModel = self.getGridModel('orderDetails');
    gridModel.on('afterCellValueChange', function(data) {
      if (data.cellName === 'amount') {
        calculateTotal();
      }
    });
  }
});
```

## 模板选择指南

| 场景 | 模板 | 文件路径 |
|------|------|---------|
| 主表参照过滤 | simple-model-filter | `simple-model-filter.js` |
| 子表同步过滤 | grid-filter-sync | `grid-filter-sync.js` |
| 子表异步过滤 | grid-filter-async | `grid-filter-async.js` |
| 行内过滤 | inline-filter | `inline-filter.js` |
| 字段联动 | field-linkage | `field-linkage.js` |
| 表格联动 | grid-linkage | `grid-linkage.js` |
| 保存校验 | validation | `validation.js` |
| 按钮事件 | button-event | `button-event.js` |
| 弹窗通信 | modal | `modal.js` |

## Lint 校验清单

代码生成后，务必检查：

- [ ] 调用 BIP API 脚本使用 invokeFunction（默认）
- [ ] 调用外部 API 使用 setProxy
- [ ] 禁止 `field.set('value', v)` → 必须用 `field.setValue(v)`
- [ ] 禁止循环 `insertRow/deleteRow` → 必须用批量方法
- [ ] 参照过滤使用 `this.setFilter()`，不能用 return filter
- [ ] 枚举字段比较 `.value`
- [ ] 禁止 `cb.context.getYhtAccessToken()`

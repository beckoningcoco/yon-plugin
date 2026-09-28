
# MDF 生命周期与事件

## 快速决策表（必读）

### 业务需求 → 事件选择

**⚠️ 这是最常用的决策入口**

```
┌─────────────────────────────────────────────────────────────────────┐
│                          快速决策入口                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  页面加载时                                                      │
│  ├── 设置默认值 → afterLoadMeta                                    │
│  ├── 数据加载后处理 → afterLoadData                                │
│  └── DOM渲染后 → afterMount（极少使用）                            │
│                                                                     │
│  字段变更时                                                      │
│  ├── 主表字段变更 → afterValueChange                              │
│  └── 子表单元格变更 → afterCellValueChange                        │
│                                                                     │
│  按钮点击时                                                      │
│  ├── 标准动作（保存/提交/删除）→ beforeSave/beforeSubmit           │
│  └── 自定义按钮 → button.on('click')                              │
│                                                                     │
│  模式切换时                                                      │
│  └── 新增/编辑/浏览 → modeChange                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| 业务描述 | 选择事件 | 阻断 | 说明 |
|---------|---------|------|------|
| "打开页面时设置默认值" | `afterLoadMeta` | ❌ | 元数据加载后、UI渲染前 |
| "数据加载后计算总金额" | `afterLoadData` | ❌ | 数据已加载完成 |
| "保存前检查编码是否重复" | `beforeSave` | ✅ | 可阻断保存流程 |
| "保存成功后刷新" | `afterSave` | ❌ | 保存完成后 |
| "提交前检查审批人" | `beforeSubmit` | ✅ | 可阻断提交流程 |
| "新增时自动填充日期" | `modeChange(mode='add')` | ❌ | 模式切换时 |
| "编辑时某些字段只读" | `modeChange(mode='edit')` | ❌ | 模式切换时 |
| "字段变更触发计算" | `afterValueChange` | ❌ | 主表字段变更后 |
| "单元格变更触发计算" | `afterCellValueChange` | ❌ | 子表单元格变更后 |
| "参照打开前过滤" | `beforeBrowse` | ✅ | 参照弹窗前 |
| "按钮点击调用接口" | `button.on('click')` | ❌ | 自定义按钮 |

## 生命周期执行顺序

```
页面加载流程：
┌──────────────────────────────────────────┐
│ 1. afterInit       → ViewModel初始化完成    │
│ 2. afterLoadMeta   → UI元数据加载完成       │
│ 3. afterLoadData  → 业务数据加载完成       │
│ 4. afterMount     → DOM渲染完成           │
└──────────────────────────────────────────┘

数据保存流程：
┌──────────────────────────────────────────┐
│ beforeSave → 平台保存 → afterSave         │
└──────────────────────────────────────────┘

页面模式切换：
┌──────────────────────────────────────────┐
│ modeChange → 触发（add/edit/browse）     │
└──────────────────────────────────────────┘
```

## 各生命周期典型场景

### 1. afterInit - ViewModel初始化完成

**使用场景**：极少使用，一般用 `afterLoadMeta`

```javascript
// 初始化时执行，此时不能获取字段
init: function() {
  var self = this;
  self.on('afterInit', function() {
    console.log('ViewModel初始化完成');
  });
}
```

### 2. afterLoadMeta - 元数据加载完成 ⭐常用

**使用场景**：
- 设置字段默认值
- 设置字段显隐/只读
- 注册参照过滤
- 注册按钮事件
- 设置代理（setProxy）

```javascript
// 场景1：设置默认值
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadMeta', function() {
      // 设置主表字段默认值
      self.get('orderStatus').setValue('DRAFT');
      self.get('orderDate').setValue(new Date());

      // 设置子表默认行
      var gridModel = self.getGridModel('orderDetails');
      gridModel.insertRows(0, [
        { _status: 'Insert', lineNo: 1 }
      ]);
    });
  }
});

// 场景2：设置字段显隐/只读
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadMeta', function() {
      // 浏览态隐藏某些按钮
      var currentMode = self.getParams().mode;
      if (currentMode === 'browse') {
        self.get('btnDelete').setVisible(false);
      }
      // 编辑态设置必填
      self.get('customerCode').setRequired(true);
    });
  }
});

// 场景3：注册参照过滤
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadMeta', function() {
      var supplierRefer = self.get('supplier');
      supplierRefer.on('beforeBrowse', function() {
        var orgId = self.get('orgId').getValue();
        this.setFilter({
          isExtend: true,
          simpleVOs: [{ field: 'orgId', op: 'eq', value1: orgId }]
        });
      });
    });
  }
});

// 场景4：设置代理
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadMeta', function() {
      self.setProxy({
        queryData: {
          url: '/api/query',
          method: 'POST'
        }
      });
    });
  }
});
```

### 3. afterLoadData - 业务数据加载完成 ⭐常用

**使用场景**：
- 数据加载后计算汇总
- 根据数据动态设置状态
- 子表数据处理

```javascript
// 场景1：计算汇总金额
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
  }
});

// 场景2：根据数据状态设置控件
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadData', function() {
      var status = self.get('orderStatus').getValue();
      if (status === 'APPROVED') {
        self.get('btnEdit').setVisible(false);
        self.get('orderAmount').setReadOnly(true);
      }
    });
  }
});

// 场景3：子表数据处理
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadData', function() {
      var gridModel = self.getGridModel('orderDetails');
      var rows = gridModel.getRows();
      Object.keys(rows).forEach(function(idx) {
        // 根据行数据设置单元格样式
        if (rows[idx].amount > 10000) {
          gridModel.setCellValue(idx, 'amount', rows[idx].amount, {
            background: '#ffcccc'
          });
        }
      });
    });
  }
});
```

### 4. beforeSave - 保存前校验 ⭐常用

**使用场景**：
- 字段必填校验
- 业务规则校验
- 子表明细校验
- 异步校验（如查询后端）

```javascript
// 场景1：主表字段校验
cb.define({
  init: function() {
    var self = this;
    self.on('beforeSave', function() {
      var customerName = self.get('customerName').getValue();
      if (!customerName) {
        cb.utils.alert('客户名称不能为空', 'error');
        return false;
      }
      return true;
    });
  }
});

// 场景2：子表明细校验
cb.define({
  init: function() {
    var self = this;
    self.on('beforeSave', function() {
      var gridModel = self.getGridModel('orderDetails');
      var rows = gridModel.getRows();
      if (Object.keys(rows).length === 0) {
        cb.utils.alert('明细行不能为空', 'error');
        return false;
      }
      var hasValidRow = false;
      Object.keys(rows).forEach(function(idx) {
        if (rows[idx].product && rows[idx].amount > 0) {
          hasValidRow = true;
        }
      });
      if (!hasValidRow) {
        cb.utils.alert('至少需要一条有效明细', 'error');
        return false;
      }
      return true;
    });
  }
});

// 场景3：异步校验（查询后端）
cb.define({
  init: function() {
    var self = this;
    self.on('beforeSave', function() {
      return new cb.promise().then(function(resolve) {
        var orderCode = self.get('orderCode').getValue();
        try {
          cb.rest.invokeFunction(
            'tenantId.package.checkDuplicate',
            { orderCode: orderCode },
            function(err, res) {
              if (err) {
                cb.utils.alert(err.message, 'error');
                resolve(false);
                return;
              }
              if (res.data && res.data.exists) {
                cb.utils.alert('订单编号已存在', 'error');
                resolve(false);
                return;
              }
              resolve(true);
            }
          );
        } catch (err) {
          cb.utils.alert(err, 'error');
          resolve(false);
        }
      });
    });
  }
});

// 场景4：区分按钮来源
cb.define({
  init: function() {
    var self = this;
    self.on('beforeSave', function(args) {
      var btnName = args.params?.cItemName;
      if (btnName === 'btnTempSave') {
        // 暂存不做严格校验
        return true;
      }
      // 正式保存做完整校验
      if (!validate()) {
        return false;
      }
      return true;
    });
  }
});
```

### 5. afterSave - 保存后处理

**使用场景**：
- 保存后刷新数据
- 保存后跳转
- 保存后提示

```javascript
cb.define({
  init: function() {
    var self = this;
    self.on('afterSave', function() {
      cb.utils.alert('保存成功', 'success');
      // 刷新当前单据
      self.execute('refresh');
    });
  }
});
```

### 6. beforeSubmit/beforeAudit - 提交/审批前校验

```javascript
// 提交前校验
cb.define({
  init: function() {
    var self = this;
    self.on('beforeSubmit', function() {
      var status = self.get('orderStatus').getValue();
      if (status !== 'APPROVED') {
        cb.utils.alert('单据状态不是已审核，不能提交', 'error');
        return false;
      }
      return true;
    });
  }
});

// 审批前校验
cb.define({
  init: function() {
    var self = this;
    self.on('beforeAudit', function(args) {
      var auditType = args.params?.auditType;
      if (auditType === 'reject') {
        var rejectReason = self.get('rejectReason').getValue();
        if (!rejectReason) {
          cb.utils.alert('驳回时必须填写驳回原因', 'error');
          return false;
        }
      }
      return true;
    });
  }
});
```

### 7. modeChange - 模式切换

**使用场景**：
- 新增/编辑/浏览模式切换时处理
- 控制不同模式下的控件状态

```javascript
cb.define({
  init: function() {
    var self = this;
    self.on('modeChange', function(args) {
      var mode = args; // 'add' | 'edit' | 'browse'
      switch (mode) {
        case 'add':
          // 新增模式：设置默认值
          self.get('orderDate').setValue(new Date());
          self.get('orderStatus').setValue('DRAFT');
          break;
        case 'edit':
          // 编辑模式：放开某些字段
          self.get('remark').setReadOnly(false);
          break;
        case 'browse':
          // 浏览模式：隐藏操作按钮
          self.get('btnSave').setVisible(false);
          break;
      }
    });
  }
});
```

## 禁止嵌套事件注册

```javascript
// ❌ 错误：在事件回调中注册监听器（内存泄漏）
viewModel.on('afterLoadData', function() {
  gridModel.on('afterCellValueChange', handler);
});

// ✅ 正确：在 init 中注册所有监听器
cb.define({
  init: function() {
    var self = this;
    self.on('afterLoadData', this.handleAfterLoadData);
    self.on('beforeSave', this.handleBeforeSave);

    var gridModel = self.getGridModel('orderDetails');
    gridModel.on('afterCellValueChange', this.handleCellChange);
  },
  handleAfterLoadData: function() {
    // ...
  },
  handleBeforeSave: function() {
    // ...
  },
  handleCellChange: function(data) {
    // ...
  }
});
```

## 事件参数说明

```javascript
// beforeSave 参数
self.on('beforeSave', function(args) {
  // args.params.cItemName - 触发保存的按钮编码
  // args.params.billId - 单据ID
});

// beforeSubmit 参数
self.on('beforeSubmit', function(args) {
  // args.params.cItemName - 触发提交按钮编码
  // args.params.billId - 单据ID
});

// beforeAudit 参数
self.on('beforeAudit', function(args) {
  // args.params.auditType - 审批类型（approve/reject）
});

// modeChange 参数
self.on('modeChange', function(args) {
  // args 是字符串：'add' | 'edit' | 'browse'
});
```

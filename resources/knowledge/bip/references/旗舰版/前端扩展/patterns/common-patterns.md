# MDF 扩展通用模式

## 1. 扩展注册基础模板

```javascript
cb.define({
  init: function() {
    var self = this;

    // ===== 主表字段操作 =====
    self.on('afterLoadMeta', function() {
      // 设置默认值
      self.get('fieldCode').setValue('default');
    });

    // ===== 生命周期事件 =====
    self.on('beforeSave', function() {
      return validate();
    });

    // ===== 按钮事件 =====
    self.get('customButton').on('click', function() {
      // 处理逻辑
    });
  }
});
```

## 2. 数据加载后初始化

```javascript
cb.define({
  init: function() {
    var self = this;

    self.on('afterLoadData', function() {
      // 设置默认值
      self.get('fieldCode').setValue('default');

      // 联动清空
      var provinceField = self.get('province');
      provinceField.on('afterValueChange', function(data) {
        self.get('city').setValue('');
      });
    });
  }
});
```

## 3. 保存前校验

```javascript
cb.define({
  init: function() {
    var self = this;

    self.on('beforeSave', function() {
      var amount = self.get('amount').getValue();
      if (!amount || amount <= 0) {
        cb.utils.alert('金额必须大于0', 'error');
        return false;
      }
      return true;
    });
  }
});

// 异步校验
cb.define({
  init: function() {
    var self = this;

    self.on('beforeSave', function() {
      return new cb.promise().then(function(resolve) {
        cb.rest.invokeFunction(
          'tenantId.package.checkDuplicate',
          { code: self.get('code').getValue() },
          function(err, res) {
            if (err || res.data.exists) {
              cb.utils.alert('编码已存在', 'error');
              resolve(false);
            } else {
              resolve(true);
            }
          }
        );
      });
    });
  }
});
```

## 4. 表格批量增删改

```javascript
cb.define({
  init: function() {
    var self = this;

    // 批量插入
    self.on('afterLoadMeta', function() {
      var gridModel = self.getGridModel('orderDetails');
      gridModel.insertRows(0, [
        { _status: 'Insert', lineNo: 1, productCode: 'P001', qty: 10 },
        { _status: 'Insert', lineNo: 2, productCode: 'P002', qty: 20 }
      ]);
    });

    // 批量更新（含状态标记）
    self.on('beforeSave', function() {
      var gridModel = self.getGridModel('orderDetails');
      var rows = gridModel.getRows();
      Object.keys(rows).forEach(function(idx) {
        rows[idx]._status = 'Update';
        rows[idx].qty = rows[idx].qty + 10;
      });
      gridModel.updateRows(
        Object.keys(rows).map(function(idx) { return parseInt(idx); }),
        Object.values(rows)
      );
      return true;
    });
  }
});
```

## 5. 主表参照过滤

```javascript
cb.define({
  init: function() {
    var self = this;

    self.on('afterLoadMeta', function() {
      var supplierRefer = self.get('supplier');
      supplierRefer.on('beforeBrowse', function() {
        var org = self.get('org').getValue();
        if (!org) {
          cb.utils.alert('请先选择组织', 'warning');
          return;
        }
        this.setFilter({
          isExtend: true,
          simpleVOs: [{ field: 'orgId', op: 'eq', value1: org }]
        });
      });
    });
  }
});
```

## 6. 子表行内参照过滤

```javascript
cb.define({
  init: function() {
    var self = this;

    var gridModel = self.getGridModel('orderDetails');
    gridModel.on('afterCellValueChange', function(data) {
      if (data.cellName === 'material') {
        var editRowModel = gridModel.getEditRowModel(data.rowIndex);
        if (editRowModel) {
          var batchNORefer = editRowModel.get('batchNO');
          if (batchNORefer) {
            batchNORefer.on('beforeBrowse', function() {
              this.setFilter({
                isExtend: true,
                simpleVOs: [{ field: 'materialId', op: 'eq', value1: data.value }]
              });
            });
          }
        }
      }
    });
  }
});
```

## 7. HTTP 调用

```javascript
cb.define({
  init: function() {
    var self = this;

    // 配置代理
    self.on('afterLoadMeta', function() {
      self.setProxy({
        queryDetail: { url: '/bm/xxx/queryDetail', method: 'POST' }
      });
    });

    // 调用
    self.on('afterLoadData', function() {
      var params = self.getParams();
      var proxy = self.getProxy('queryDetail');
      proxy.ensure(
        { id: params.id },
        function(result) {
          if (result.success) {
            self.get('field').setValue(result.data);
          }
        },
        function(result) {
          cb.utils.alert('查询失败', 'error');
        }
      );
    });
  }
});
```

## 8. 列表进卡片传参

```javascript
// 列表页
viewModel.execute('commit', { id: rowData.id, billNo: rowData.billNo });

// 卡片页（init中接收）
cb.define({
  init: function() {
    var self = this;

    self.on('afterLoadData', function() {
      var params = self.getParams();
      if (params.query && params.query.id) {
        // 从列表进入，带了id参数
        var fromId = params.query.id;
      }
    });
  }
});
```

## 9. 下拉动态数据源

```javascript
cb.define({
  init: function() {
    var self = this;

    self.on('afterLoadData', function() {
      var listModel = self.get('status');
      listModel.setDataSource([
        { value: '1', label: '待审核' },
        { value: '2', label: '已审核' }
      ]);
    });
  }
});
```

## 10. 拦截提交/弃审

```javascript
cb.define({
  init: function() {
    var self = this;

    // 拦截提交
    self.on('beforeSubmit', function() {
      var status = self.get('billStatus').getValue();
      if (status !== 'APPROVED') {
        cb.utils.alert('仅已审核单据可提交', 'error');
        return false;
      }
      return true;
    });

    // 拦截弃审
    self.on('beforeAbandon', function() {
      var confirmed = cb.utils.confirm('确定要弃审吗？', function(ok) {
        return ok;
      });
      return confirmed;
    });

    // 区分按钮来源
    self.on('beforeSubmit', function(args) {
      var btnName = args.params?.cItemName;
      if (btnName === 'btnapprovalsub') {
        // 审批提交特殊处理
      }
      return true;
    });
  }
});
```

## 11. 模式切换处理

```javascript
cb.define({
  init: function() {
    var self = this;

    self.on('modeChange', function(mode) {
      switch (mode) {
        case 'add':
          self.get('orderDate').setValue(new Date());
          self.get('orderStatus').setValue('DRAFT');
          break;
        case 'edit':
          self.get('remark').setReadOnly(false);
          break;
        case 'browse':
          self.get('btnSave').setVisible(false);
          break;
      }
    });
  }
});
```

## 12. 全局事件

```javascript
// 监听全局事件
cb.events.on('billSaved', function(data) {
  // 跨模块通信
});

// 触发全局事件
cb.events.execute('billSaved', { billId: 'xxx' });
```

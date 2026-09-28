---
name: 金隅集团页面脚本实战模式
description: >
  金隅集团 BIP 旗舰版 前端页面脚本 + 后端函数实战代码。
  覆盖 RootStore 列表页 API、多账簿只读控制、模态框选择回填、保存前数据注入、
  凭证辅助核算项参照配置、批量删除数据合并、DOM 标题修改、异步校验链、
  YonQL 指定数据源查询、ObjectStore.env 获取特定域URL、afterWorkflowBeforeQueryAsync 等。
  以项目实战代码为主线，标注东软项目来源，适合 BIP 前端/后端客开参考。
tags:
  - 金隅集团
  - 东软项目
  - rootStore
  - getVouchData
  - 多账簿
  - 模态框回填
  - _originalChangeData
  - 辅助核算项
  - beforeBatchdelete
  - afterWorkflowBeforeQueryAsync
  - afterBatchaudit
  - ObjectStore.env
  - setRowState
  - 报告账簿
  - 实战代码
keywords:
  - rootStore.getVouchData 列表页获取单据数据
  - rootStore.actions.billReload.doAction 列表页刷新
  - rootStore.getTableStore 列表页表格操作
  - rootStore.utils.message 列表页消息
  - 多账簿同步 只读控制
  - gridModel.setRowState readOnly
  - _originalChangeData 保存前数据注入
  - _originalDeletData 删除前数据注入
  - ACC_ITEM_REF_MAP 辅助核算项参照
  - model.setState treeTypeValue 树参照非末级
  - cb.events 凭证单组件通信
  - ObjectStore.queryByYonQL 指定数据源
  - ObjectStore.env domain 获取特定域URL
  - beforeBatchdelete 主子表数据合并
  - afterWorkflowBeforeQueryAsync 工作流审批前
  - afterBatchaudit 批量审核后
  - appendRow 完整数据对象
  - listeners containerDom 标题修改
  - cb.utils.FloatCalc 浮点计算
  - cb.env.getMainOriginUrl 获取主域URL
  - DynamicProxy async:false 同步调用
  - beforeSaveAndSubmitX 保存并提交
  - beforeSaveAndAdd 保存并新增
version: 1.0
updated: 2026-07-31
project: 金隅集团
---

# 金隅集团页面脚本实战模式

> **来源**：金隅集团 BIP 旗舰版 固定资产/应收应付/总账/费用报销 等多个领域 | **记录日期**：2026-07-31

---

## 文档使用说明

本文档记录**金隅集团**项目中出现的、在现有 Skill 文档中**末覆盖或覆盖不充分**的模式和 API。每条均包含：
- 功能说明（做什么）
- 完整代码示例（带初学者注释）
- 与已有模式的对比（如有）

**已有 Skill 文档已充分覆盖的内容不再重复**，包括：`beforeSave` 基础用法、`afterLoadData`、`afterCellValueChange`、`DynamicProxy.ensureSync`、`runCommandLine` 基础用法、`cb.rest.invokeFunction` 基础用法等。

---

## 一、RootStore 列表页 API（新）

> **现有文档覆盖**：仅简单提及 `rootStore.utils.request`。
> **本文新增**：完整的 rootStore 列表页 API 体系。

### 1.1 rootStore vs viewModel 对照

| API | viewModel（卡片页） | rootStore（列表页） |
|-----|---------------------|---------------------|
| 获取单据数据 | `viewModel.getData()` | `rootStore.getVouchData()` |
| 获取单据ID | `viewModel.get('id').getValue()` | `rootStore.getVouchData().id` |
| 获取特征字段 | 通过 `get('freeChId')` | `rootStore.getVouchData().freeCharacteristic.XXX` |
| 获取表单数据 | `viewModel.formStore.data` | `rootStore.formStore.data` |
| 获取选中行 | `viewModel.getGridModel().getSelectedRows()` | `rootStore.getTableStore().getSelectedRows()` |
| 刷新页面 | `viewModel.execute('refresh')` | `rootStore.actions.billReload.doAction()` |
| 消息提示 | `cb.utils.alert/confirm` | `rootStore.utils.message.success/danger` |
| HTTP 请求 | `cb.rest.DynamicProxy` / `invokeFunction` | `rootStore.utils.request()` |
| 按钮绑定 | `viewModel.get('btn').on('click')` | `rootStore.designerScripts.ButtonXonClick` |

### 1.2 rootStore.designerScripts 按钮事件

```javascript
// ============================================================
// rootStore.designerScripts — 列表页/卡片页的设计器按钮事件
// 按钮命名规则: Button{编码}on{事件类型}
//   - Button1hShonClick  → 按钮编码 "Button1hSh" + onClick
//   - Modal6DDeonOk       → 弹窗编码 "Modal6DDe" + onOk（确认）
//   - Modal6DDeonCancel   → 弹窗编码 "Modal6DDe" + onCancel（取消）
//   - TextArea2d7lonAfterChange → 文本域编码 + onAfterChange
// ============================================================
rootStore.designerScripts = {
  // ---------- 按钮点击（异步 + 防重复点击） ----------
  Button1hShonClick: async function (rootStore, alias, event, rowStore) {
    // alias: 按钮别名（设计器配置的按钮编码）
    // event: 事件对象
    // rowStore: 当前行数据（列表页行按钮时有值）

    if (isOpening) {
      cb.utils.alert('正在处理中，请勿重复点击', 'warning');
      return;
    }

    // 获取单据ID（列表页用 getVouchData()）
    let billId = rootStore.formStore.data.id;
    // 或者 rootStore.getVouchData().id

    if (!billId) {
      cb.utils.alert('未获取到单据ID', 'warning');
      return;
    }

    isOpening = true;
    try {
      await doAction(rootStore, billId, '/api/path', '操作名称');
    } finally {
      isOpening = false;  // 确保异常时也释放锁
    }
  },

  // ---------- 弹窗确认按钮 ----------
  Modal6DDeonOk: async function (rootStore, alias, event, rowStore) {
    // 隐藏弹窗
    rootStore.formStore.setValue('reasonDialogVisible', false);

    let billId = rootStore.formStore.data.id;
    let jsonObj = {
      id: billId,
      reason: rootStore.reasonText, // 从 RootStore 自定义属性取值
    };

    const result = await rootStore.utils.request({
      url: '/fi/receipt/cancel',
      method: 'POST',
      data: jsonObj,
      options: { mask: true, uniform: true },
    });

    if (result && result.code == 200) {
      rootStore.utils.message.success({ content: '成功' });
      rootStore.actions.bNeedRefresh.doAction();  // 刷新页面
    } else {
      rootStore.utils.message.danger({ content: result.message || '失败!' });
    }
  },

  // ---------- 弹窗取消按钮 ----------
  Modal6DDeonCancel: function (rootStore, alias, event, rowStore) {
    rootStore.formStore.setValue('reasonDialogVisible', false);
  },

  // ---------- 文本域值变更 ----------
  TextArea2d7lonAfterChange: function (rootStore, alias, event, rowStore) {
    // event = 当前文本域的值（字符串）
    rootStore.reasonText = event;
  },
};
```

### 1.3 rootStore.utils.request — 列表页 HTTP 请求

```javascript
// ============================================================
// rootStore.utils.request — 列表页的通用 HTTP 请求方法
// 与 cb.rest.DynamicProxy 不同，它返回 Promise，支持 async/await
// ============================================================
async function doReceiptAction(rootStore, billId, url, actionName) {
  try {
    const result = await rootStore.utils.request({
      url: url,             // 请求地址（可带 /c-domain 前缀）
      method: 'POST',       // GET / POST
      data: { id: billId }, // 请求参数
      options: {
        mask: true,         // 显示 loading 遮罩
        uniform: true,      // 统一错误处理格式
      },
    });

    if (result && result.code == 200) {
      rootStore.utils.message.success({ content: '成功' });
    } else {
      rootStore.utils.message.danger({
        content: result.message || actionName + '失败!'
      });
    }
    return result;
  } catch (error) {
    rootStore.utils.message.danger({
      content: error.message || actionName + '失败!'
    });
  }
}
```

### 1.4 rootStore.formStore — 控制弹窗显示/隐藏

```javascript
// ============================================================
// rootStore.formStore.setValue — 控制 UI 组件状态
// 用于弹窗的 visible 属性控制
// ============================================================
function ExtendRootStore() {
  // 初始化弹窗隐藏
  rootStore.formStore.data.reasonDialogVisible = false;
  rootStore.formStore.setValue('reasonDialogVisible', false);

  // 打开弹窗的方法
  rootStore.openReasonDialog = function () {
    rootStore.reasonText = '';  // 清空原因文本
    rootStore.formStore.setValue('reasonDialogVisible', true);
  };

  // 挂载通用请求方法到 rootStore（可在 designerScripts 中调用）
  rootStore.doReceiptAction = async function (rootStore, obj, url, actionName) {
    // ... 同上 request 逻辑 ...
  };
}
```

### 1.5 rootStore.getTableStore() — 列表页表格选中行

```javascript
// ============================================================
// rootStore.getTableStore().getSelectedRows() — 列表页获取勾选行
// 注意：返回的每行数据包裹在 .data 属性中
// ============================================================
rootStore.designerScripts = {
  Button1NGyonClick: async function (rootStore, alias, event, rowStore) {
    let selRows = rootStore.getTableStore().getSelectedRows();
    if (!selRows || selRows.length === 0) {
      cb.utils.alert('请先选择要开具的数据', 'warning');
      return;
    }

    // 过滤：只处理符合条件的行
    var invoiceRows = selRows.filter(function (row) {
      return row.data.receiptState != '已开具';  // 数据在 .data 中
    });

    // 循环处理每一行
    for (var i = 0; i < invoiceRows.length; i++) {
      var billId = invoiceRows[i].data.id;       // id 也在 .data 中
      await rootStore.doReceiptAction(
        rootStore,
        { id: billId },
        '/fi/receipt/open',
        '开立收据'
      );
    }
  },
};
```

---

## 二、保存前/删除前数据注入模式（新）

> **现有文档覆盖**：`beforeSave` 基础校验，但未覆盖向 `data.data` 注入 `_originalChangeData` / `_originalDeletData`。
> **本文新增**：保存/删除前将修改前完整数据注入请求体，供后端触发器使用。

### 2.1 _originalChangeData — 保存前注入修改前数据

```javascript
// ============================================================
// 业务场景：后端触发器（AbstractTrigger）需要在保存后
// 获取"修改前"的数据来做对比处理（如核销/回写状态）。
// 前端在 beforeSave 中通过 viewModel.getData() 获取当前数据，
// 注入到 data.data._originalChangeData 传递给后端。
// ============================================================
viewModel.on('beforeSave', function (data) {
  // 1. 获取当前页面显示的完整数据（修改前的快照）
  var originalChangeData = viewModel.getData();
  console.log('修改前的原始数据：', JSON.stringify(originalChangeData));

  // 2. 将修改前数据注入请求体（后端通过 param.baseBillContext.actionInfo.bodyParamsMap._originalChangeData 获取）
  data.data._originalChangeData = originalChangeData;

  // 3. 解析当前提交数据做业务校验
  var billData = JSON.parse(data.data.data || '{}');
  var promise = new cb.promise();
  checkBusiness(billData, promise);
  return promise;  // 返回 Promise 可异步校验
});

// ============================================================
// 后端触发器如何读取（AbstractTrigger）：
//   var baseBillContext = param.baseBillContext || {};
//   var actionInfo = baseBillContext.actionInfo || {};
//   var bodyParamsMap = actionInfo.bodyParamsMap || {};
//   var originalData = bodyParamsMap._originalChangeData || {};
// ============================================================
```

### 2.2 _originalDeletData — 删除前注入完整数据

```javascript
// ============================================================
// 业务场景：删除单据时，后端触发器需要完整的主子表数据
// 来执行反写操作（如取消核销）。
// 前端在 beforeDelete 中查询后端获取完整数据并注入。
// ============================================================
viewModel.on('beforeDelete', function (data) {
  var deleteData = viewModel.getData();  // 前端当前数据（可能不完整）
  var billId = viewModel.get('id').getValue();
  if (!billId) {
    console.error('单据ID为空，跳过 beforeDelete 逻辑');
    return true;
  }

  // 查询主子表完整数据（前端数据可能缺少子表信息）
  cb.rest.invokeFunction(
    'EAR.backDesignerFunction.ear_queryCollectionBody',
    { ids: [billId] },
    function (err, res) {
      if (err) {
        cb.utils.alert(err.message, 'error');
      } else {
        if (res.defResult && res.defResult.length > 0) {
          deleteData = res.defResult;  // 替换为后端完整数据
        }
      }
    }
  );

  // 将完整数据注入删除参数
  data.data._originalDeletData = deleteData;
  return true;
});
```

### 2.3 beforeBatchdelete — 批量删除主子表数据合并

```javascript
// ============================================================
// 业务场景：批量删除时，需要在删除前查询每条单据的子表数据，
// 并将子表数据合并到前端选中行中。
// 这样后端触发器可以通过统一的数据结构处理。
// ============================================================
viewModel.on('beforeBatchdelete', function (params) {
  var selected = JSON.parse(params.data.data);  // 前端勾选的数据
  var ids = [];
  for (var i = 0; i < selected.length; i++) {
    ids.push(selected[i].id);
  }

  if (ids.length === 0) {
    console.error('未获取到删除单据ID');
    return true;
  }

  // 返回 Promise 异步等待查询完成
  return new Promise(function (resolve, reject) {
    cb.rest.invokeFunction(
      'EAR.backDesignerFunction.ear_queryCollectionBody',
      { ids: ids },
      function (err, res) {
        if (err) {
          console.error('查询失败: ' + err.message);
          resolve(true);  // 查询失败不阻塞删除
        } else {
          var backendData = res.defResult || [];

          // ---------- 关键：建立后端数据的 id 索引 ----------
          var backendMap = {};
          for (var j = 0; j < backendData.length; j++) {
            backendMap[backendData[j].id] = backendData[j];
          }

          // ---------- 将子表数据合并到对应行 ----------
          for (var i = 0; i < selected.length; i++) {
            var rowId = selected[i].id;
            var matched = backendMap[rowId];
            if (matched) {
              // 只挂载子表数据（避免覆盖其他字段）
              selected[i].CollectionArPublicEventList =
                matched.CollectionArPublicEventList;
            }
          }

          // ---------- 写回合并后的数据 ----------
          params.data.data = JSON.stringify(selected);
          params.data._originalDeletData = backendData;
          resolve(true);
        }
      }
    );
  });
});
```

---

## 三、多账簿同步 — 报告账簿只读控制模式（新）

> **现有文档覆盖**：`gridModel.setRowState` 已记录，但未覆盖完整的多账簿业务场景。
> **本文新增**：固定资产多账簿同步的完整实战模式（报告账簿行只读 + 主账簿变更同步）。

### 3.1 业务背景

- 固定资产的**资产减值/变动/拆分/合并**等业务支持多账簿
- **报告账簿**（成本账簿）的行数据由主账簿自动同步，不允许手动编辑
- 需要在前端实时判断当前行是否为报告账簿，并设置只读

### 3.2 核心实现

```javascript
// ============================================================
// 多账簿同步 — 完整模式
// 包含：初始化只读、新增行只读、切换行只读、编辑前拦截
// ============================================================

// ---------- 1. 页面加载时初始化所有行的只读状态 ----------
viewModel.on('afterLoadData', function () {
  initReportBookReadOnly(viewModel);
  initGridModelEvents(viewModel);
});

// ---------- 2. 注册表格事件监听 ----------
function initGridModelEvents(viewmodel) {
  var gridModel = viewModel.get('bodies');
  if (!gridModel) return;

  // 新增行后 → 判断是否为报告账簿
  gridModel.on('afterInsertRow', function (args) {
    handleAfterInsertRow(viewmodel, args);
  });
  gridModel.on('afterAddRow', function (args) {
    handleAfterInsertRow(viewmodel, args);
  });

  // 切换焦点行后 → 判断是否为报告账簿
  gridModel.on('afterSetFocusedRowIndex', function (args) {
    handleAfterSetFocusedRowIndex(viewmodel, args);
  });
  gridModel.on('afterSelectRow', function (args) {
    handleAfterSetFocusedRowIndex(viewmodel, args);
  });

  // 编辑前行 → 报告账簿拦截
  gridModel.on('beforeCellValueChange', function (args) {
    return handleBeforeCellValueChange(viewModel, args);
  });
}

// ---------- 3. 获取账簿信息和判断 ----------
function _getBookId(viewmodel, rowIndex) {
  // 优先用 getCellValue，失败用 getRow 兜底
  var gridModel = viewmodel.get('bodies');
  var bookId = gridModel.getCellValue(rowIndex, 'accbook');
  if (!bookId) {
    var row = gridModel.getRow(rowIndex);
    bookId = row.accbook || row['accbook'] || null;
  }
  return bookId;
}

function _isReportBookByRowIndex(viewmodel, rowIndex) {
  // 通过账簿名称判断（临时方案，后续替换为后端接口）
  var gridModel = viewmodel.get('bodies');
  var bookName = gridModel.getCellValue(rowIndex, 'accbook_name');
  if (!bookName) {
    var row = gridModel.getRow(rowIndex);
    bookName = row.accbook_name || row['accbook_name'] || null;
  }
  return bookName && bookName.indexOf('报告账簿') >= 0;
}

// ---------- 4. 设置行只读 ----------
function _setRowReadOnly(gridModel, rowIndex, readOnly) {
  if (gridModel) {
    gridModel.setRowState(rowIndex, 'readOnly', readOnly);
  }
}

// ---------- 5. 初始化时遍历所有行 ----------
function initReportBookReadOnly(viewmodel) {
  var gridModel = viewmodel.get('bodies');
  if (!gridModel) return;
  var rows = gridModel.getRows();
  if (!rows || rows.length === 0) return;

  for (var i = 0; i < rows.length; i++) {
    var bookId = _getBookId(viewmodel, i);
    if (!bookId) continue;
    if (_isReportBookByRowIndex(viewmodel, i)) {
      _setRowReadOnly(gridModel, i, true);
    }
  }
}

// ---------- 6. 编辑前拦截 ----------
function handleBeforeCellValueChange(viewmodel, args) {
  if (!args) return true;
  var rowIndex = args.rowIndex;
  var bookId = _getBookId(viewmodel, rowIndex);
  if (!bookId) return true;  // 无账簿信息则放行
  if (_isReportBookByRowIndex(viewmodel, rowIndex)) {
    cb.utils.alert('报告账簿行不允许编辑', 'warning');
    return false;  // 返回 false 阻止编辑
  }
  return true;
}
```

---

## 四、模态框选择回填模式（新补充）

> **现有文档覆盖**：`runCommandLine` 和 `modalDataReturn` 已记录。
> **本文新增**：模态框内 beforeValidate 获取选中行 → 调后端查询主子表完整数据 → 追加到当前页面子表的完整链路。

### 4.1 完整链路

```javascript
// ============================================================
// 步骤1: 按钮点击 → 打开模态框列表
// ============================================================
viewModel.get('button123sj') && viewModel.get('button123sj').on('click', function (data) {
  var formData = viewModel.getAllData();
  openModal(formData);
});

// ============================================================
// 步骤2: 构建模态框参数并打开
// carryParams: 传给模态框的初始查询条件
// extraConfig: 模态框样式配置（居中、尺寸等）
// ============================================================
function openModal(formData) {
  var modalParams = {
    billtype: 'VoucherList',       // 固定：打开列表页
    billno: 'targetRefList',       // 目标列表页 billNo
    domainKey: 'c-hawk-yonbip-fic', // 跨域打开
    params: {
      mode: 'browse',
      templateType: 'modal',       // 固定：模态框模式
      carryParams: {               // 传给目标列表页的查询参数
        supplier: formData.supplier || '',
        org: formData.financeOrg || '',
      },
      extraConfig: {
        _innerType: 'center',      // 居中显示
        width: '1500px',
        height: '800px',
      },
    },
  };

  cb.loader.runCommandLine('bill', modalParams, viewModel, function (modalViewModel) {
    // ============================================================
    // 步骤3: 监听模态框的确认事件（beforeValidate）
    // 用户在模态框中勾选数据后触发
    // ============================================================
    modalViewModel.on('beforeValidate', function () {
      // 获取模态框中勾选的行
      const gridModel = modalViewModel.getGridModel();
      const selectedRows = gridModel.getSelectedRows();

      // 清空当前页面的目标子表
      const payTable = viewModel.getGridModel('PayablePaymentBodyList');
      payTable.deleteAllRows();

      // 调用后端查询主子表完整数据并追加
      processSelectedRows(selectedRows);

      // 关闭模态框
      modalViewModel.communication({ type: 'modal', payload: { data: false } });
    });

    return modalViewModel;
  });
}

// ============================================================
// 步骤4: 调后端查询完整单据数据 → 逐行追加到目标子表
// ============================================================
function processSelectedRows(selectedRows) {
  if (!selectedRows || selectedRows.length === 0) return;

  // 提取选中行的 ID
  var selectedIds = selectedRows.map(function (row) {
    return row.id;
  });

  // 调后端函数查询主子表完整数据
  cb.rest.invokeFunction(
    'STB.backDesignerFunction.stb_queryPaymentDetails',
    { ids: selectedIds },
    function (err, res) {
      if (err) {
        console.error('查询失败:', err);
        return;
      }
      if (res && res.defResult && res.defResult.length > 0) {
        res.defResult.forEach(function (mainRecord) {
          var detailRows = mainRecord.bodyItem || [];
          // 逐行追加到目标子表
          detailRows.forEach(function (detailRow) {
            appendRow(detailRow);
          });
        });
      }
    }
  );
}

// ============================================================
// 步骤5: 追加单行数据（使用对象直接 appendRow）
// 优势：比逐字段 setCellValue 更简洁
// ============================================================
function appendRow(detailRow) {
  var gridModel = viewModel.getGridModel('PayablePaymentBodyList');

  // 直接传完整数据对象追加行
  gridModel.appendRow({
    _status: 'Insert',                                  // 标记为新增
    prepaymentAmount: detailRow.oriTaxIncludedAmount,   // 预付款总金额
    writeoffAmount: 0,                                  // 本次核销金额（初始为0）
    unWriteoffAmount: detailRow.oriTaxIncludedAmount - (detailRow.writeoffAmount || 0),
    paymentBodyId_id: detailRow.id,                     // 源单据体ID
    paymentBodyId: detailRow.id,
  });
}
```

---

## 五、凭证单辅助核算项参照配置（新）

> **现有文档覆盖**：未覆盖。
> **本文新增**：凭证单的树形辅助核算项参照批量配置模式。

### 5.1 配置驱动 + 事件通信

```javascript
// ============================================================
// 凭证单辅助核算项参照配置
// 场景：凭证单的所有辅助核算项需要"禁选非末级"，
//       通过 cb.events 跨组件通信实现批量配置
// ============================================================

// ---------- 1. 定义辅助核算项映射表 ----------
// key: 辅助核算项 code（系统内置/自定义）
// refCode: 对应参照档案的 cRefType（用于匹配参照模型）
const ACC_ITEM_REF_MAP = {
  // 系统内置
  supplier:   { name: '供应商',     refCode: 'yssupplier.aa_vendorBasicref' },
  customer:   { name: '客户',       refCode: 'productcenter.baseMerchantRef' },
  material:   { name: '物料',       refCode: 'productcenter.baseProductRef' },
  costcenter: { name: '成本中心',   refCode: 'finbd.bd_costcenterref' },
  dept:       { name: '部门',       refCode: 'ucf-org-center.bd_adminorgsharetreeref' },
  // ... 更多内置项 ...
  // 自定义项（JYZD 系列）
  ucfdef_JYZD003: { name: '物资类别',       refCode: 'ucfbasedoc.JYZD003' },
  ucfdef_JYZD004: { name: '在建工程项目',   refCode: 'ucfbasedoc.JYZD004' },
  // ... 40+ 自定义项 ...
};

// ---------- 2. 提取所有需要控制的 refCode ----------
function getTreeOnlyLeafRefCodes() {
  // 返回所有需要「只允许选非末级」的参照 refCode
  return Object.values(ACC_ITEM_REF_MAP).map(function (item) {
    return item.refCode;
  });
}

// ---------- 3. 通过 cb.events 跨组件通信 ----------
viewModel.on('afterInit', function () {
  // 监听凭证单辅助核算项弹窗的组件初始化事件
  // glVoucherBillDetail_getClient: 系统事件，弹窗获取客户端模型时触发
  cb.events.on('glVoucherBillDetail_getClient', function (clientModel) {
    const targetRefCodes = getTreeOnlyLeafRefCodes();

    // 从所有参照模型中筛选出目标辅助核算项
    const models = clientModel.filter(function (v) {
      return targetRefCodes.includes(v._get_data('cRefType'));
    });

    // 批量设置：只允许选择非末级节点
    models && models.forEach(function (model) {
      // treeTypeValue = '3'  → 只允许选择非末级（叶子节点不可选）
      model.setState('treeTypeValue', '3');
    });
  });

  // 可选：监听其他事件
  // cb.events.on('glVoucherBillDetail_ClientOnSubmit', function (data) {
  //   console.log('辅助核算项弹窗确认', data);
  // });
  // cb.events.on('glVoucherBillDetail_ClientAfterValueChange', function (data) {
  //   console.log('辅助核算项值变更', data);
  // });
});
```

### 5.2 关键 API 说明

| API | 说明 |
|-----|------|
| `cb.events.on('glVoucherBillDetail_getClient', fn)` | 凭证单辅助核算项弹窗的组件初始化事件 |
| `cb.events.execute('glVoucherBillDetail_Client_Update', data)` | 更新辅助核算项的值 |
| `model.setState('treeTypeValue', '3')` | 树形参照只允许选非末级（叶子节点不可选） |
| `model._get_data('cRefType')` | 获取参照模型的 refCode（用于匹配辅助核算项） |

---

## 六、后端函数模式补充（新）

> **现有文档覆盖**：`ObjectStore.postman`、`selectBatchIds`、`updateBatch` 已有记录。
> **本文新增**：`ObjectStore.env('domain.xxx')`、`ObjectStore.queryByYonQL` 指定数据源、项目实战后端函数示例。

### 6.1 ObjectStore.env('domain.xxx') — 获取特定域URL

```javascript
// ============================================================
// ObjectStore.env() 获取环境变量
// - ObjectStore.env().url         → 基础 URL
// - ObjectStore.env().token       → 认证 token
// - ObjectStore.env('domain.xxx') → 获取特定域完整 URL
//   其中 xxx 是 YMC 中配置的域名 key（如 domain.c-hawk-yonbip-fic）
// ============================================================
let header = { 'Content-Type': 'application/json;charset=UTF-8' };

// 方式1：获取特定域的完整 URL
let writeOffUrl = ObjectStore.env('domain.c-hawk-yonbip-fic') + '/fi/payable/writeoffpayment';

// 方式2：获取基础 URL 再拼接
let baseUrl = ObjectStore.env().url;
let apiUrl = baseUrl + '/fi/payment/checkContractAmount';

// 调用
var result = ObjectStore.postman('POST', writeOffUrl, header, requestData);
var resultObj = JSON.parse(result);  // postman 返回字符串，需要 JSON.parse
```

### 6.2 ObjectStore.queryByYonQL — 指定数据源执行 YonQL

```javascript
// ============================================================
// ObjectStore.queryByYonQL(yonql, datasourceName)
// 第2个参数指定数据源名称（数据库连接名），用于跨域查询
// ============================================================
// 示例：查询 FIC 数据库中的未开收据
var receiptNosStr = receiptNos
  .map(function (no) { return "'" + no + "'"; })
  .join(',');

var result = ObjectStore.queryByYonQL(
  'select id, code, receiptState ' +
  'from fic.bbmg.UnissuedReceipt ' +
  'where code in (' + receiptNosStr + ')',
  'c_hawk_yonbip_fic_db'  // 指定 pika 数据源名称
);
```

### 6.3 完整后端函数示例（AbstractTrigger）

```javascript
// ============================================================
// 后端规则/触发器完整模板（金隅集团实战）
// AbstractTrigger: 在单据保存/审核/删除等生命周期中自动触发
// ============================================================
let AbstractTrigger = require('AbstractTrigger');
class MyTrigger extends AbstractTrigger {
  execute(context, param) {
    try {
      // ---------- 1. 获取单据数据 ----------
      var billData = param.billDO || {};    // 当前单据数据
      var billId = billData.id;

      // ---------- 2. 从上下文获取前端注入的数据 ----------
      // 前端注入的 _originalChangeData / _originalDeletData 在这里读取
      var baseBillContext = (param && param.baseBillContext) || {};
      var actionInfo = baseBillContext.actionInfo || {};
      var bodyParamsMap = actionInfo.bodyParamsMap || {};
      var originalData = bodyParamsMap._originalChangeData || {};

      // ---------- 3. 调用内部 Controller ----------
      var header = { 'Content-Type': 'application/json;charset=UTF-8' };
      var apiUrl = ObjectStore.env('domain.c-hawk-yonbip-fic') + '/fi/path';
      var result = ObjectStore.postman('POST', apiUrl, header, requestData);
      var resultObj = JSON.parse(result);

      // ---------- 4. 校验结果 ----------
      if (resultObj.code !== 200) {
        throw new Error(resultObj.message || '操作失败');
      }

      return { success: true };
    } catch (e) {
      console.error('操作失败: ' + e.message);
      throw new Error(e.message);
    }
  }
}
exports({ entryPoint: MyTrigger });
```

---

## 七、特殊生命周期事件（新补充）

> **现有文档覆盖**：基本生命周期已覆盖。
> **本文新增**：项目中实际使用的但文档中较少涉及的三个事件。

### 7.1 beforeSaveAndSubmitX — 保存并提交

```javascript
// ============================================================
// beforeSaveAndSubmitX: 用户点击"保存并提交"按钮时触发
// 与 beforeSave 的区别：额外触发提交流程
// 注意：事件名后缀是 X，不是 Submit
// ============================================================
viewModel.on('beforeSaveAndSubmitX', function (data) {
  var billData = JSON.parse(data.data.data || '{}');
  var promise = new cb.promise();
  checkBusiness(billData, promise);
  return promise;  // 返回 false 或 reject 可阻止提交
});
```

### 7.2 beforeSaveAndAdd — 保存并新增

```javascript
// ============================================================
// beforeSaveAndAdd: 用户点击"保存并新增"按钮时触发
// 可在保存前注入额外数据（如修改前的金额快照用于后端对比）
// ============================================================
viewModel.on('beforeSaveAndAdd', function (data) {
  var billData = JSON.parse(data.data.data || '{}');

  // 可选：记录修改前的核销金额
  var oldWriteoffAmountMap = {};
  var payGrid = viewModel.getGridModel('PayablePaymentBodyList');
  if (payGrid) {
    var rows = payGrid.getRows();
    for (var i = 0; i < rows.length; i++) {
      var rowId = rows[i].id;
      var amt = rows[i].writeoffAmount;
      if (rowId && amt !== undefined && amt !== null && amt !== '') {
        oldWriteoffAmountMap[rowId] = amt;
      }
    }
  }
  // 注入到请求体
  billData._oldWriteoffAmountMap = JSON.stringify(oldWriteoffAmountMap);
  data.data.data = JSON.stringify(billData);
});
```

### 7.3 afterWorkflowBeforeQueryAsync — 工作流审批前查询

```javascript
// ============================================================
// afterWorkflowBeforeQueryAsync: 工作流节点流转前触发
// 场景：审批通过时执行关联操作（如作废收据→下推新单据）
// actionCode 区分：'audit'（审批通过）、'unAudit'（取消审批）
// ============================================================
viewModel.on('afterWorkflowBeforeQueryAsync', function (param) {
  if (param.actionCode !== 'audit') return;  // 只处理审批通过

  // 获取当前行数据
  var uniqueItemIds = getUniqueItemIds(viewModel);
  if (uniqueItemIds.length === 0) return;

  // 执行关联操作
  var result = doCancelAndPush(viewModel, uniqueItemIds);
  afterPushHandle(viewModel, result);
});
```

### 7.4 afterBatchaudit — 批量审核后

```javascript
// ============================================================
// afterBatchaudit: 列表页批量审核完成后触发
// 与 afterAudit（卡片页单条审核）不同，此事件在列表页使用
// ============================================================
viewModel.on('afterBatchaudit', function (param) {
  var uniqueItemIds = getUniqueItemIds(viewModel);
  if (uniqueItemIds.length === 0) return;

  var result = doBatchProcess(viewModel, uniqueItemIds);

  // 批量操作完成后的处理
  var msg = '';
  if (result.errors.length > 0) {
    msg = '以下操作失败：' + JSON.stringify(result.errors);
    setTimeout(function () {
      cb.utils.alert(msg, 'warning');
    }, 1500);  // 延迟提示避免与框架提示冲突
  }
});
```

---

## 八、DOM 操作 — 页面标题动态修改（新）

> **现有文档覆盖**：记录了 `setState('voucherNoReturn', bool)` 等 ViewModel API，未覆盖 DOM 操作。
> **本文新增**：通过 `listeners[0].containerDom` 直接操作页面标题 DOM。

```javascript
// ============================================================
// 动态修改页面标题
// 场景：根据交易类型不同，页面标题需要动态变化
//   - 新增时：从父级获取 transtype → 查交易类型名称 → 拼接标题
//   - 编辑时：直接取 bustypeName 拼接标题
// ============================================================
viewModel.on('afterLoadData', function (data) {
  // ---------- 编辑态：直接取已保存的交易类型名称 ----------
  var thisBustype = viewModel.get('bustype').getValue();
  if (thisBustype) {
    var bustypeName = viewModel.get('bustypeName').getValue();
    // 直接修改 DOM 中的标题
    viewModel.get('listeners')[0]
      .containerDom
      .querySelector('.mdf-toolbarPageTitle')
      .innerHTML = bustypeName + '详情';
    return;
  }

  // ---------- 新增态：从父级获取交易类型参数 ----------
  if (viewModel.getParams().mode === 'add') {
    // 1. 获取父级 ViewModel（可能嵌套两层）
    let parentViewModel = viewModel.getCache('parentViewModel');
    if (parentViewModel.getParams().billNo !== 'paymentList') {
      parentViewModel = parentViewModel.getCache('parentViewModel');
    }

    // 2. 获取父级传来的 transtype 参数
    let transtype = parentViewModel.getParams().query.transtype;

    // 3. 同步调用后端查询交易类型名称
    let result = cb.rest.invokeFunction(
      'STB.backDesignerFunction.stb_queryTranstypeName',
      { bustypeId: transtype },
      function (err, res) {},
      viewModel,
      { async: false }  // 同步调用，先拿到名称再设置标题
    );
    let bustypeName = '';
    if (result && result.result && result.result.data) {
      bustypeName = result.result.data;
    }

    // 4. 修改标题
    viewModel.get('listeners')[0]
      .containerDom
      .querySelector('.mdf-toolbarPageTitle')
      .innerHTML = (bustypeName ? bustypeName : '付款单') + '详情';
  }
});
```

---

## 九、其他有用模式

### 9.1 cb.env.getMainOriginUrl() — 获取主域 URL

```javascript
// ============================================================
// cb.env.getMainOriginUrl() — 获取当前环境主域基础 URL
// 用于 DynamicProxy.create 中拼接完整 API 路径
// 与 ObjectStore.env().url 的后端用法对应
// ============================================================
const baseurl = cb.env.getMainOriginUrl();
const url = baseurl + '/c-hawk-yonbip-fic/fi/collection/checkCustomer';

var proxy = cb.rest.DynamicProxy.create({
  checkCustomer: {
    url: url,
    method: 'POST',
    options: {
      domainKey: 'c-hawk-yonbip-fic',
      diworkCode: viewModel.getParams().diworkCode,
    },
  },
});
```

### 9.2 特征组字段 .get() 链式访问

```javascript
// ============================================================
// 访问特征组（freeChId）的子字段
// viewModel.get('freeChId').get('JYTZ443') → 获取单个特征字段
// 数据中的路径：row.freeChId.JYTZ443 或 row.userDefine.JYTZ016
// ============================================================

// 方式1：ViewModel API（取字段值/设置过滤）
viewModel.get('freeChId').get('JYTZ443').on('beforeBrowse', function (data) {
  this.setFilter({ isExtend: true, simpleVOs: [...] });
});

// 方式2：从行数据中取值（注意可能有多种路径）
// 特征字段可能是：item.userDefine.JYTZ016 或 item.freeChId.JYTZ016
if (item.userDefine && item.userDefine.JYTZ016) {
  // 用户自定义项
}
// 自由特征项
var value = row.freeChId && row.freeChId.JYTZ260;
```

### 9.3 cb.utils.FloatCalc — 浮点数精确计算

```javascript
// ============================================================
// cb.utils.FloatCalc — BIP 内置浮点数精确计算工具
// 避免 JavaScript 浮点数精度问题（0.1 + 0.2 !== 0.3）
// ============================================================

// 乘法（mult）
let ntaxmny = cb.utils.FloatCalc.mult(nsummny, ratio);

// 加法（add）
totalDeduct = cb.utils.FloatCalc.add(totalDeduct, ndeducttaxmny);

// 除法（divide）
ratio = cb.utils.FloatCalc.divide(totalNdeducttaxmny, totalNexpmny);
```

### 9.4 cb.utils.triggerReferBrowse — 程序化触发参照浏览

```javascript
// ============================================================
// cb.utils.triggerReferBrowse(referModel, filterConditions)
// 程序化打开参照弹窗并注入过滤条件
// 场景：新增时根据父级传来的参数自动过滤交易类型
// ============================================================
let transtype = parentViewModel.getParams().query.transtype;

// 触发参照浏览，自动注入过滤条件
cb.utils.triggerReferBrowse(
  viewModel.get('bustypeName'),  // 参照模型
  [{ field: 'id', op: 'eq', value1: transtype }]  // 过滤条件
);
```

### 9.5 getEffeData() — 获取表格有效数据

```javascript
// ============================================================
// gridModel.getEffeData() — 获取 dataSource 中不含删除的数据
// 与 getRows() 的区别：getEffeData 会过滤掉已删除行的数据
// 场景：需要在计算时排除已标记删除的行
// ============================================================
var expinvoicedetails = viewModel.getGridModel('expinvoicedetails').getEffeData();
expinvoicedetails.forEach(function (row) {
  let ndeducttaxmny = parseFloat(row.ndeducttaxmny || 0);
  totalDeduct = cb.utils.FloatCalc.add(totalDeduct, ndeducttaxmny);
});
```

---

## 十、异步校验链模式（新）

> **现有文档覆盖**：单个 `cb.promise` 异步校验。
> **本文新增**：多步异步校验链（嵌套回调），多个校验按顺序执行，任一失败则整体失败。

```javascript
// ============================================================
// 多步异步校验链（Callback Chain）
// 场景：保存前需要依次校验多个条件（供应商 / 余额 / 发票金额 / 核销额度）
// 每个校验都是异步后端调用，前一步成功才执行下一步
// ============================================================
viewModel.on('beforeSave', function (data) {
  var billData = JSON.parse(data.data.data || '{}');
  var promise = new cb.promise();

  // 层层回调，确保所有校验通过才 resolve
  verifySupplier(billData, function (success1) {
    if (!success1) { promise.reject({ message: '供应商校验失败' }); return; }

    verifyBalance(billData, function (success2) {
      if (!success2) { promise.reject({ message: '余额校验失败' }); return; }

      checkInvoiceAmount(billData, function (success3) {
        if (!success3) { promise.reject({ message: '发票金额校验失败' }); return; }

        checkWriteoffBalance(billData, function (success4) {
          if (!success4) { promise.reject({ message: '核销额度校验失败' }); return; }

          // 全部通过
          promise.resolve();
        });
      });
    });
  });

  return promise;  // 返回 Promise → 框架等待 resolve 后再保存
});

// 校验函数模板（每个校验结构相同）
function verifySupplier(param, callback) {
  const diworkCode = viewModel.getParams().diworkCode;
  var proxy = cb.rest.DynamicProxy.create({
    verifySupplier: {
      url: cb.env.getMainOriginUrl() + '/c-hawk-yonbip-fic/fi/payable/checkVendor',
      method: 'POST',
      options: { domainKey: 'c-hawk-yonbip-fic', diworkCode },
    },
  });
  proxy.verifySupplier(param, function (err, result) {
    if (err) { cb.utils.alert(err.message, 'error'); callback(false); }
    else { callback(true); }
  });
}
```

---

## 十一、批量行插入前拦截 — beforeInsertRows（新补充）

> **现有文档覆盖**：`beforeInsertRow`（单行）已在 grid-model.md 记录。
> **本文新增**：`beforeInsertRows`（批量，复数）的实战用法。

```javascript
// ============================================================
// beforeInsertRows: 批量插入行前触发
// data.rows 包含即将插入的所有行数据（数组）
// 可在此修改每行的默认值
// ============================================================
viewModel.get('expensebillbs').on('beforeInsertRows', function (data) {
  var bustypeId = viewModel.get('bustype').getValue();

  // 同步查询当前交易类型的配置
  let result = cb.rest.invokeFunction(
    'RBSM.rule.rbsm_queryTranstypeInfo',
    { bustypeId: bustypeId },
    function (err, res) {},
    viewModel,
    { async: false }
  );

  if ('ERM_007' == result.result.data) {
    // 场景：根据组织查询员工列表
    var org = viewModel.get('cfinaceorg').getValue();
    let res = cb.rest.invokeFunction(
      'RBSM.workflow.rbsm_queryStaffByOrg',
      { org: org },
      function (err, res) {},
      viewModel,
      { async: false }
    );

    // 构建名称→ID 映射（处理重名情况）
    var nameMap = new Map();
    var nameList = res.result.nameList;
    for (var k = 0; k < nameList.length; k++) {
      var item = nameList[k];
      if (nameMap.has(item.name)) {
        nameMap.set(item.name, null);  // 重名 → 置 null（不可自动匹配）
      } else {
        nameMap.set(item.name, item.id);
      }
    }

    // 遍历即将插入的行，自动匹配经办人
    var insertRows = data.rows;  // data.rows = 即将插入的行数组
    insertRows.forEach(function (row) {
      var cleanedName = cleanName(row.vdef5);  // 清洗名称
      if (cleanedName && nameMap.has(cleanedName)) {
        var matchedId = nameMap.get(cleanedName);
        if (matchedId) {
          row.pk_handlepsn = matchedId;        // 设置经办人ID
          row.pk_handlepsn_name = cleanedName; // 设置经办人名称
        }
      }
    });
  }
});

// 辅助函数：去掉名称中的括号部分 "(xxx)" 或 "（xxx）"
function cleanName(str) {
  if (!str) return '';
  return str.replace(/[（(].*?[)）]/g, '').trim();
}
```

---

## 附录A：页签切换 + 网格联动

```javascript
// ============================================================
// 页签切换后刷新特定网格（带缓存判断）
// ============================================================
viewModel.getGridModel('settleBench_b').on('afterCellValueChange', (args) => {
  if (viewModel.getParams().mode === 'browse') {
    let catchKey = viewModel.getCache('own_leaderKey');
    let currentTabKey = viewModel.getCache(catchKey).currentTabKey;
    if (currentTabKey !== 'all') {
      viewModel.execute('afterTabActiveKeyChange', { key: currentTabKey });
    }
  }
});
```

---

## 附录B：按钮点击链路对比

| 页面类型 | 按钮事件 | 获取数据 | 获取勾选行 | 刷新页面 |
|----------|----------|----------|-----------|----------|
| 卡片页 | `viewModel.get('btn').on('click')` | `viewModel.getData()` | `viewModel.getGridModel().getSelectedRows()` | `viewModel.execute('refresh')` |
| 卡片页(desScripts) | `rootStore.designerScripts.ButtonXonClick` | `rootStore.formStore.data` | 不适用 | `rootStore.actions.billReload.doAction()` |
| 列表页 | `rootStore.designerScripts.ButtonXonClick` | `rootStore.getVouchData()` | `rootStore.getTableStore().getSelectedRows()` | `rootStore.actions.bNeedRefresh.doAction()` |

---

## 附录C：发现的问题与修复建议

对金隅页面脚本进行审查后，发现以下问题（不影响执行则标注"可忽略"）：

1. **Bug（行565-568）**：`row` 变量未定义，应为 `rowData`
   ```javascript
   // ❌ 原代码
   if (row.verifyState == 2 && row.bodyItem_freeChId?.JYTZ436 == null) { ... }
   // ✅ 修复
   if (rowData.verifyState == 2 && rowData.bodyItem_freeChId?.JYTZ436 == null) { ... }
   ```

2. **死代码（行1164 等多处）**：`return false;` 在 `return` 语句之后，永远不会执行（可忽略但建议删除）

3. **逻辑反向（行2112）**：`result.code !== 200` 时反而更新行数据，可能是条件写反了，应改为 `result.code == 200`

4. **重复声明（行3846）**：`var currentWriteoffAmount` 连续声明两次（不影响运行，建议删除多余）

5. **未定义变量 `reportBookRowIndex`（行1665-1669）**：在 `_syncChangeFieldToReportBook` 中，`reportBookRowIndex` 虽被注释但实际使用了该变量


# Cache & Params 缓存与页面参数

## 目录结构

```
models/cache-params/
├── SKILL.md           # 本文件
└── 页面参数.md        # 完整指南
```

## 缓存操作

```javascript
// 设置缓存
model.setCache(key: string, value: any): void

// 获取缓存
model.getCache(key: string): any

// 清除缓存
model.clearCache(key?: string): void
```

### 使用示例

```javascript
viewModel.on('afterLoadMeta', function() {
  // 存储扩展配置
  viewModel.setCache('extensionConfig', {
    customValidation: true,
    autoCalculate: false
  });

  // 网格特定缓存
  var gridModel = viewModel.getGridModel('details');
  gridModel.setCache('originalData', []);
});

// 在事件中使用
viewModel.on('beforeSave', function() {
  var config = viewModel.getCache('extensionConfig');
  if (config && config.customValidation) {
    return validateCustom();
  }
  return true;
});
```

### 禁止事项

```javascript
// ❌ 错误：使用全局变量
window.myExtensionData = {};

// ❌ 错误：缓存大数据集
viewModel.setCache('allData', hugeArray);
```

## 页面参数

```javascript
var params = viewModel.getParams();
```

### 常用参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `params.mode` | 页面模式 | `'add' \| 'edit' \| 'browse'` |
| `params.billNo` | 单据编号 | `'SO001'` |
| `params.id` | 单据ID | `'xxx'` |
| `params.domainKey` | 领域键 | `'scmmp'` |
| `params.serviceCode` | 服务代码 | `'so_saleorder'` |
| `params.query` | URL参数 | `{ serviceCode: '...' }` |
| `params.parentParams` | 父页面参数 | `{ id: '...' }` |
| `params.externalData` | 外部数据 | `{ orgIds: [...] }` |

### 模式判断

```javascript
var params = viewModel.getParams();
var isAddMode = params.mode === 'add';
var isEditMode = params.mode === 'edit';
var isBrowseMode = params.mode === 'browse';

viewModel.on('afterLoadData', function() {
  if (isAddMode) {
    initializeForAdd();
  } else if (isEditMode) {
    initializeForEdit();
  }
});
```

## serviceCode 解析

**按优先级获取服务编码**：

```javascript
var p = viewModel.getParams() || {};
var serviceCode =
  viewModel.getServiceCode() ||                                    // 1. 标准API
  (p.query && p.query.serviceCode) ||                            // 2. URL参数
  (p.serviceInfo && p.serviceInfo.serviceCode) ||                 // 3. 容器注入
  'default_service_code';                                         // 4. 兜底常量
```

## ContainerModel 扩展 API

```javascript
// 获取子模型
containerModel.get(propertyName: string): BaseModel

// 获取网格模型
containerModel.getGridModel(propertyName: string): GridModel

// 获取所有网格模型
containerModel.getGridModels(): array

// 获取所有树模型
containerModel.getTreeModels(): array

// 获取选项值
containerModel.getOptionValue(name: string, orgId?: string, domain?: string): any

// 获取领域键
containerModel.getDomainKey(): string

// 获取服务代码
containerModel.getServiceCode(): string

// 获取应用上下文
containerModel.getAppContext(): object
```

## 跨窗口通信

```javascript
// 同窗口通信
viewModel.communication({ type: 'return', data: {...} });

// 跨窗口通信
cb.communication({ type: 'return', data: {...} });

// 新窗口打开
cb.loader.runCommandLine('bill', data, viewModel);

// jDiwork方式
window.jDiwork.openService(serviceCode, params, { data: data });
```

### 返回示例

```javascript
viewModel.on('afterAbandon', function() {
  if (viewModel.getParams().diworkCode) {
    cb.communication({
      action: 'isCloseAction',
      activeKey: viewModel.getDiworkCode(),
      data: true,
      noConfirm: true
    });
    return false;
  }
});
```

### 打开服务示例

```javascript
viewModel.get('btnResult').on('click', function() {
  var wholeId = viewModel.get('id').getValue();
  var data = {
    billtype: 'VoucherList',
    billno: 'mr_whole_report_result_list',
    params: {
      mode: 'query',
      wholeId: wholeId
    }
  };
  var serviceCode = 'mr_whole_report_result_list';

  if (viewModel.getParams().diworkCode == 'mr_planorder_whole_report_list') {
    window.jDiwork.openService(serviceCode, {}, { data: data });
  } else {
    cb.loader.runCommandLine('bill', data, viewModel);
  }
});
```

## 全局上下文

```javascript
// 获取全局选项值
var value = cb.context.getCommonOptionValue('optionCode', viewModel);

// 获取应用上下文
var appContext = cb.rest.getAppContext(domainKey);

// 获取当前组织ID
var orgId = cb.context.getOrgId();

// 获取默认组织
var defaultOrg = cb.context.getDefaultOrg();

// 是否单组织模式
var isSingleOrg = cb.context.isSingleOrg();

// 是否新FI架构
var isNewFi = cb.context.isNewFiArch();
```

## 父子页面传参

### 父页面

```javascript
viewModel.communication({
  type: 'modal',
  payload: {
    url: '/page/supplier-select',
    params: {
      orgId: viewModel.get('orgId').getValue(),
      multiSelect: true
    }
  },
  callback: function(data) {
    if (data) {
      viewModel.get('supplierId').setValue(data.id);
      viewModel.get('supplierName').setValue(data.name);
    }
  }
});
```

### 子页面

```javascript
// 获取父页面传递的参数
var params = viewModel.getParams().parentParams;

// 回传数据
viewModel.communication({
  type: 'return',
  data: {
    id: selectedId,
    name: selectedName
  }
});
```

## 查询条件传递

```javascript
// 从列表页带过来的查询条件
viewModel.on('beforeSearch', function(args) {
  var lastCondition = viewModel.getParams().lastSearchCondition;
  if (lastCondition) {
    var simpleVOs = args.condition?.simpleVOs || [];
    simpleVOs.push.apply(simpleVOs, lastCondition.condition.simpleVOs);
    args.condition.simpleVOs = simpleVOs;
  }
});
```

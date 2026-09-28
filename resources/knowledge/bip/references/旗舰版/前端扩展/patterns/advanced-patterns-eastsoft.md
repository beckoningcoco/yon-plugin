---
name: 页面脚本高级模式（东软实战）
description: >
  用友 BIP 客开。从东软载波项目实战中提取的页面脚本高级模式，
  包括 DynamicProxy.ensureSync 同步调用、cellConfig 动态控件切换、
  dataSourceMode local 本地数据源、新旧数据合并算法、配置驱动批量表格处理、
  跨表格汇总计算、beforeAdd 页面级新增拦截、通用 xhr 封装函数、
  runCommandLine 回调链路、fireEvent 程序化触发、voucherNoReturn 控制跳转等。
  当用户编写复杂页面脚本时参考。
tags:
  - DynamicProxy
  - ensureSync
  - cellConfig
  - 动态控件
  - dataSourceMode
  - 本地数据源
  - 数据合并
  - 配置驱动
  - 跨表格汇总
  - AppContext
  - 东软载波
  - 实战代码
keywords:
  - DynamicProxy.ensureSync 同步调用
  - cellConfig 动态切换控件类型
  - cControlType Select input
  - dataSourceMode local 本地数据源
  - mergeGridData 新旧数据合并
  - gridConfigList 配置化批量处理
  - calcGridInfluence 跨表格汇总
  - cb.rest.AppContext.user 登录用户
  - getDiworkCode 工作流编码
  - Message.create 长时间loading
  - Map 加速行匹配
  - Object.entries 枚举映射遍历
---

# 页面脚本高级模式（东软实战）

> **来源**：东软载波 BIP 旗舰版 变更管理(ECN)页面 | **记录日期**：2026-07-25

---

## 1. DynamicProxy.ensureSync() — 同步 API 调用

### 模式

```js
let proxy = cb.rest.DynamicProxy.create({
  ensure: {
    url: '/your/controller/path',
    method: 'GET',   // 或 'POST'
    options: {
      domainKey: 'c-inv-fl-eastsoft',
      diworkCode: vm.getDiworkCode(),   // 可选，后端识别单据类型
    },
  },
});
const res = proxy.ensureSync();   // 🔑 同步阻塞，直接返回结果
if (res.error) {
  cb.utils.alert(res?.error, 'error');
  return false;
}
// 使用 res.result ...
```

### 对比异步方式

| 方式 | 写法 | 适用场景 |
|------|------|----------|
| `proxy.ensureSync()` | 直接返回值，无回调 | 页面初始化（afterLoadData），必须先拿数据再渲染 |
| `proxy.ensure(params, callback)` | 异步回调 | 用户交互触发（按钮点击），不阻塞 UI |

> ⚠️ 同步调用阻塞 UI 线程，**只适合初始化阶段**。用户交互场景必须用异步方式。

---

## 2. cellConfig — 动态切换单元格控件类型

### 模式

运行时将某单元格从输入框变为下拉选择框（或反之）：

```js
// 切换为下拉选择框
let cellConfig = {
  cItemName: 'isInfluence',              // 列名
  cControlType: 'Select',                // 控件类型：下拉选择
  cEnumString: JSON.stringify(optionsString),  // 枚举显示文本
  enumArray: JSON.stringify(optionsArray),     // 枚举值数组 [{value, text}]
};
gridModel.setCellValue(rowIndex, 'cellConfig', cellConfig);

// 切换为普通输入框
let cellConfig = {
  cItemName: 'isInfluence',
  cControlType: 'input',                 // 控件类型：输入框
};
gridModel.setCellValue(rowIndex, 'cellConfig', cellConfig);
```

### 适用场景

- 同一列的不同行需要不同的编辑方式（有枚举值的用下拉框，无枚举值的用输入框）
- 后端配置决定前端控件的显示形态

### cControlType 常见值

| 值 | 说明 |
|----|------|
| `'Select'` | 下拉选择框（需配合 cEnumString / enumArray） |
| `'input'` | 普通文本输入框 |
| `'checkbox'` | 复选框 |
| `'date'` | 日期选择器 |

---

## 3. dataSourceMode 'local' + setDataSource — 本地数据源

### 模式

当表格数据由前端全量管理（不翻页请求后端）时：

```js
const gridModel = vm.getGridModel('yourGridId');
gridModel.setState('dataSourceMode', 'local');   // 🔑 切换为本地模式
gridModel.setDataSource(dataArray);               // 直接设置数据
```

### dataSourceMode 对照

| 值 | 说明 | 翻页行为 |
|----|------|----------|
| `'local'` | 本地数据源，数据全在前端 | 前端分页 |
| `'remote'` | 远程数据源（默认） | 每次翻页请求后端 |

---

## 4. mergeGridData — 新旧数据合并算法

### 模式

接口返回全量新数据，但需要保留用户在旧数据中已修改的字段（如"是否影响"）：

```js
const mergeGridData = (newArr, gridId, getMatchKey) => {
  if (!Array.isArray(newArr)) return newArr;

  const gridModel = vm.getGridModel(gridId);
  const oldList = gridModel?.getData() || [];

  // 场景1：无旧数据，全部标记为 Insert
  if (oldList.length === 0) {
    return newArr.map((item) => ({
      ...item,
      influence: '1',
      _status: 'Insert',
    }));
  }

  // 场景2：构建 Map(key → 旧行) 实现 O(1) 查找
  const oldMap = new Map();
  oldList.forEach((row) => oldMap.set(getMatchKey(row), row));

  // 遍历新数据，逐行合并
  return newArr.map((newRow) => {
    const key = getMatchKey(newRow);
    const oldRow = oldMap.get(key);
    if (oldRow) {
      return {
        ...newRow,
        id: oldRow.id,                    // 保留旧 id（确保 update 而非 insert）
        influence: oldRow.influence,       // 🔑 保留用户修改的关键字段
        _status: 'Update',
      };
    }
    return { ...newRow, influence: '1', _status: 'Insert' };
  });
};
```

### 设计要点

1. **getMatchKey** — 每张表格自定义匹配规则（不同表的唯一键不同）
   ```js
   // 简单：单字段
   matchKeyFn: (row) => row.code
   // 复合：多字段组合
   matchKeyFn: (row) => `${row.product_code}|${row.org}`
   ```

2. **Map 加速** — O(1) 查找而非嵌套循环 O(n²)

3. **_status 标记** — `'Insert'` 或 `'Update'`，BIP 框架据此决定保存策略

---

## 5. 配置驱动批量表格处理

### 模式

多张子表遵循相同处理流程，用配置数组消除重复代码：

```js
const gridConfigList = [
  { listKey: 'stockDataList',     gridId: 'stockDataList',
    matchKeyFn: (row) => `${row.product_code}|${row.org}` },
  { listKey: 'productionList',    gridId: 'productionList',
    matchKeyFn: (row) => row.code },
  { listKey: 'unfilledOrderList', gridId: 'unfilledOrderList',
    matchKeyFn: (row) => row.code },
];

gridConfigList.forEach((config) => {
  const { listKey, gridId, matchKeyFn } = config;
  handleGridDataSource(dataObj, listKey, gridId, matchKeyFn);
});
```

### 设计优势

- 新增子表只需在数组中加一条配置
- 所有表遵循统一处理逻辑，减少 bug
- 匹配规则与表格 ID 解耦，灵活组合

---

## 6. 枚举映射表 + Object.entries 遍历

### 模式

```js
const CHANGE_CONTENT_MAP = {
  1: 'sendOrderList',
  2: 'unfilledOrderList',
  3: 'productionDataList',
  4: 'stockDataList',
  9: 'transitOrderList',
};

Object.entries(CHANGE_CONTENT_MAP).forEach(([contentKey, gridId]) => {
  // contentKey = '1', gridId = 'sendOrderList'
  // 统一处理逻辑
});
```

### vs if-else

```js
// ❌ 传统写法（难以维护）
if (type == 1) { handle('sendOrderList'); }
else if (type == 2) { handle('unfilledOrderList'); }
// ...

// ✅ 表驱动（清晰、易扩展）
Object.entries(MAP).forEach(([key, val]) => { ... });
```

---

## 7. 跨表格汇总计算

### 模式

从多个子表汇总数据回写到一张汇总表：

```js
const calcGridInfluence = (gridId) => {
  const list = vm.getGridModel(gridId).getData() || [];
  let totalNum = 0;
  let allInfluenceTrue = true;   // 初始化假设全满足
  let allInfluenceFalse = true;  // 遇到反例再置 false

  list.forEach((item) => {
    if (item.influence === '1') {
      // 🔑 不同表数量字段名不同，用 || 链式取值
      totalNum += Number(
        item.currentqty || item.qty || item.unshippedQty || item.quantity
      );
    }
    if (item.influence !== '1') allInfluenceTrue = false;
    if (item.influence !== '0') allInfluenceFalse = false;
  });

  return {
    num: totalNum,
    allInfluenceTrue,    // 全影响
    allInfluenceFalse,   // 全不影响
    isEmpty: list.length === 0,
  };
};
```

---

## 8. cb.rest.AppContext.user — 获取登录用户

```js
let userInfo = cb.rest?.AppContext?.user;
// userInfo.userId   — 用户 ID
// userInfo.userName — 用户名
```

**典型用法**：判断当前用户是否为某行的指定操作人：
```js
if (item?.reviewer_user_id == userInfo?.userId) {
  // 当前用户是评审人，允许编辑
}
```

---

## 9. Message.create 长时间 loading

```js
// 显示（duration 极大值 → 不自动消失）
Message.create({
  content: '加载中...',
  duration: 9999999999,
  position: 'bottom',
  color: 'info',
});

// 操作完成后手动销毁
Message.destroy();
```

---

## 10. 批量绑定多个表格的同一事件

```js
const gridIds = ['grid1', 'grid2', 'grid3', 'grid4'];

const bindGridCellChange = (gridId) => {
  const grid = vm.getGridModel(gridId);
  if (!grid) return;
  grid.on('afterCellValueChange', (data) => {
    if (data?.cellName === 'influence') {
      numOrIsInfluence();  // 统一处理
    }
  });
};

gridIds.forEach(bindGridCellChange);  // 批量绑定
```

---

## 11. beforeAdd — 页面级新增操作拦截

### 模式

拦截页面级"新增"操作，与表格增行（`beforeInsertRow`）和下推（`beforePush`）不同：

```js
viewModel.on('beforeAdd', function (params) {
  // 通过嵌套参数结构识别触发按钮
  if (params.params.params.key === 'btnDerivedPart') {
    // 获取当前焦点行数据
    const gridModel = viewModel.getGridModel();
    const rowData = gridModel.getRow(gridModel.getFocusedRowIndex());

    // 设置 carryParams，新页面通过 vm.getParams().carryParams 读取
    params.params.carryParams = {
      data: [{
        type: 'likeAdd',
        id: rowData.id,
        mainPart: rowData.id,
        fromBtn: 'btnDerivedPart',
      }],
    };
  }
});
```

### 三个"拦截"事件对比

| 事件 | 触发场景 | 参数路径 | 用途 |
|------|----------|----------|------|
| `beforeAdd` | 点击"新增"/"派生物料"等 | `params.params.params.key` | 拦截页面新增，传递初始数据 |
| `beforePush` | 下推生成下游单据 | `params.args.carryParams.custMap.ruleSysId` | 拦截下推，控制数据范围 |
| `beforeInsertRow` | 表格内增行 | `{index, row}` | 设置行默认值 |

---

## 12. 通用 xhr() 封装函数

### 模式

将 DynamicProxy 的创建、配置、调用、错误处理统一封装，避免每次调用都写重复代码：

```js
const xhr = (url, param, method, vm, domainKey, successCall, errorCall, options) => {
  const proxy = cb.rest.DynamicProxy.create({
    ensure: {
      url: url,
      method: method || 'GET',
      options: Object.assign(
        { domainKey, diworkCode: vm.getParams().diworkCode },  // 自动注入 diworkCode
        options || {}
      ),
    },
  });
  proxy.ensure(param, function (err, result) {
    if (err) {
      errorCall ? errorCall(err, vm) : cb.utils.alert(err.message, 'error');
    } else {
      successCall ? successCall(result, vm) : cb.utils.alert('操作成功！', 'success');
    }
  });
};

// 使用示例
xhr('/qd/devpart/getPartInfo', { id: partId }, 'POST', vm, 'c-inv-fl-eastsoft',
  (result) => { /* 处理成功 */ },
  (err) => { /* 处理错误（可选） */ }
);
```

**设计要点**：
- 自动注入 `diworkCode`，调用时不用手动传
- `Object.assign` 合并默认配置和额外配置（`options` 可扩展 `async`、`headers` 等）
- 成功/错误回调均可选，不传则默认 alert

---

## 13. voucherNoReturn — 控制保存后页面跳转

```js
viewModel.setState('voucherNoReturn', false);
// false = 保存后停留在当前页面（不自动返回列表）
// true  = 保存后自动返回上一页/列表页
```

**典型场景**：保存后需要继续操作（如"保存并创建BOM"），不能跳回列表。

---

## 14. fireEvent 程序化触发按钮 + setCache 标记传递

### 模式

自定义按钮复用框架内置按钮的逻辑，通过缓存标记区分触发来源：

```js
// 步骤1：自定义按钮点击 → 设标记 + 触发内置按钮
viewModel.get('btnSaveAndCreatBom').on('click', () => {
  viewModel.setCache('btnSaveAndCreatBom', true);   // 设标记
  viewModel.get('btnSave')?.fireEvent('click');     // 触发保存
});

// 步骤2：afterSave 中读标记，决定后续行为
viewModel.on('afterSave', (param) => {
  if (viewModel.getCache('btnSaveAndCreatBom')) {
    // 执行"保存并创建BOM"的专属后续逻辑
    checkBomExist(viewModel, mainPartCode, param.res);
    viewModel.setCache('btnSaveAndCreatBom', false); // 🔑 清除标记
  }
});
```

**注意**：必须在后续逻辑中清除标记（`setCache('xxx', false)`），否则下次普通保存也会触发。

---

## 15. runCommandLine 回调链路（多步骤页面链）⭐⭐⭐

### 模式

通过 `runCommandLine` 打开新页面时，在 params 中传入 callback，新页面完成后回调：

```js
cb.loader.runCommandLine('bill', {
  billtype: 'Voucher',
  billno: '65b0de9e-...',
  params: {
    mode: 'add',
    bomParam: {
      bomdata: initialData,
      callback: (completedData) => {      // 🔑 新页面完成操作后回调
        openBomEditPage(viewmodel, pvm, {
          mode: 'edit',
          data: { ...completedData },
        });
      },
    },
  },
}, pvm);
```

**典型流程**：物料页 → BOM创建页（callback）→ BOM编辑页，形成多步骤页面链。

---

## 16. Object.getOwnPropertyNames — 动态字段匹配

### 模式

BIP 用户自定义特征字段命名规则为 `userDefineChrstc` + 序号，数量不固定，需动态提取：

```js
let bomViewerOtherInfo = { expiryDate, viewerRemark, effectiveDate };

Object.getOwnPropertyNames(similarPartInfo).forEach((key) => {
  if (key.indexOf('userDefineChrstc') != -1) {
    bomViewerOtherInfo[key] = similarPartInfo[key];
  }
});
```

**为什么用 `Object.getOwnPropertyNames`**：只遍历对象自身属性（不含原型链），比 `for...in` 更安全。

---

## 17. isEmptyStr — 空字符串精确判断

```js
const isEmptyStr = (str) => {
  return str === null || str === undefined || str.trim() === '';
};
```

比 `!str` 精确：`!0` 和 `!false` 也是 `true`，而 `isEmptyStr(0)` 返回 `false`（0 不是空字符串）。

---

## 19. beforeUnsubmit — 撤回提交前拦截 ⭐⭐⭐

### 模式

BIP 生命周期事件，在用户点击"撤回"时触发。配合 `beforeSave` 的手动注入模式使用：

```js
vm.on('beforeUnsubmit', function (args) {
  let newData = JSON.parse(args?.data?.data);
  if (newData) {
    // 注入子表数据（getRows 不含 _status 等内部字段）
    newData.relatedWorkList = gridModel.getRows();
    args.data.data = JSON.stringify(newData);
  }
});
```

---

## 20. beforeSave 手动注入子表数据 ⭐⭐⭐

### 模式

当 BIP 框架自动收集子表数据不完整时，手动将子表数据注入保存请求体：

```js
vm.on('beforeSave', (params) => {
  let newData = JSON.parse(params.data.data);

  // 手动注入子表数据，同时清理框架内部字段
  newData.subTableName = gridModel.getData().map((item) => {
    let newItem = item;
    if (newItem.id) delete newItem._id;  // 清理 _id（框架内部临时标识）
    return newItem;
  });

  params.data.data = JSON.stringify(newData);
});
```

**注意事项**：
- `getData()` 返回含 `_status` 的数据（Insert/Update/Delete 标记）
- `getRows()` 返回纯业务数据（不含内部状态）
- `_id` 是 BIP 框架为行分配的临时 ID，不应提交到后端

---

## 21. upadeWorkReview — 动态评审人联动 ⭐⭐⭐

### 模式

多个主表字段联动触发后端查询，检索对应评审人并回填到子表：

```js
const upadeWorkReview = (vm) => {
  const deptId = vm.get('changeApplicantDept')?.getValue();
  const ecrType = vm.get('ecrType')?.getValue();
  const changeMethod = vm.get('changeMethod')?.getValue();

  if (!deptId || !ecrType || !changeMethod) return;  // 三字段齐全才触发

  const proxy = cb.rest.DynamicProxy.create({...});
  const res = proxy.ensureSync({ deptId, changeMethod, ecrType });

  // 按 changeContent 匹配后端返回的评审人
  gridModel.get('rows').forEach((item) => {
    const match = res.result.find(r => r.changeContent == item.changeContent);
    if (match) {
      item.reviewer = match.reviewer;
      item.reviewDept = match.reviewDept;
      item._status = mode == 'add' ? 'Insert' : 'Update';
    }
  });

  // 🔑 修改 row 对象属性后，重新 setDataSource 触发 UI 刷新
  gridModel.setState('dataSourceMode', 'local');
  gridModel.setDataSource(gridModel.get('rows'));
};

// 三个字段任一变更都触发
vm.get('dept_name').on('afterValueChange', () => upadeWorkReview(vm));
vm.get('type_name').on('afterValueChange', () => upadeWorkReview(vm));
vm.get('method').on('afterValueChange', () => upadeWorkReview(vm));
```

---

## 22. eventList 批量多事件绑定 ⭐⭐

### 模式

用一个事件名数组，循环为多个 GridModel 绑定相同处理函数：

```js
const eventList = ['afterCellValueChange', 'afterDeleteRow', 'afterInsertRow'];

eventList.forEach((event) => {          // 用 forEach 语义更准
  vm.get('grid1')?.on(event, handler);  // 可选链防止空指针
  vm.get('grid2')?.on(event, handler);
});
```

等价于但比逐一手写 `.on().on().on()` 更简洁。

---

## 23. beforeInsertRow 字段名重映射 ⭐

### 模式

增行时将源字段值映射到不同名称的目标字段：

```js
vm.get('grid').on('beforeInsertRow', (params) => {
  // params.row 是即将插入的行对象，修改它即可设置默认值
  params.row.targetFieldName = params.row.sourceFieldName;
});
```

**典型场景**：跨实体字段关联时，参照字段的路径名不同（如 `materialId.fieldName` vs `devpartDefineCharacter__fieldName`）。

---

## 24. Block 2：声明式子表元数据配置 ⭐⭐⭐

### 模式

用对象数组定义子表列的完整元数据，通过 `cb.cache.set` 全局缓存：

```js
const listFields = [];
listFields.push({
  cItemName: 'ecrInfoStockDataList',             // 前端字段名（childrenField）
  cControlType: 'table',                          // 控件类型
  cDataSourceName: 'zskec.zskec.ecrInfoStockData', // 数据库实体 domain.schema.entity
  cCaption: '变更申请-库存信息',                    // 列标题
  bShowIt: true, bHidden: false, bVmExclude: 0,
});
cb.cache.set('dl_ecr_list_key', listFields);      // 全局缓存
```

**元数据属性说明**：

| 属性 | 说明 | 示例 |
|------|------|------|
| `cItemName` | 前端字段名 | `'ecrInfoStockDataList'` |
| `cControlType` | 控件类型 | `'table'`（子表）, `'input'`, `'Select'` |
| `cDataSourceName` | 数据库实体 | `'{domain}.{schema}.{entity}'` |
| `cCaption` | 列标题 | `'变更申请-库存信息'` |
| `bShowIt` | 是否显示 | `true/false` |
| `bHidden` | 是否隐藏 | `true/false` |
| `bVmExclude` | 是否从 ViewModel 排除 | `0/1` |

---

## 关键 API 速查（本节新增）

| API | 说明 | 首次记录 |
|-----|------|----------|
| `proxy.ensureSync()` | DynamicProxy 同步调用，直接返回结果 | ✅ |
| `cb.rest.AppContext.user` | 获取当前登录用户信息 | ✅ |
| `vm.getDiworkCode()` | 获取单据工作流编码 | ✅ |
| `gridModel.setCellValue(i, 'cellConfig', {...})` | 动态设置单元格控件类型 | ✅ |
| `gridModel.setState('dataSourceMode', 'local')` | 设置表格为本地数据源模式 | ✅ |
| `gridModel.setDataSource(array)` | 本地模式下设置表格数据 | ✅ |
| `Message.destroy()` | 手动销毁全局消息提示 | ✅ |
| `viewModel.on('beforeAdd', fn)` | 页面级新增拦截 | ✅ |
| `viewModel.setState('voucherNoReturn', bool)` | 控制保存后是否跳转 | ✅ |
| `viewModel.get('btn').fireEvent('click')` | 程序化触发按钮点击 | ✅ |
| `gridModel.getFocusedRowIndex()` | 获取焦点行索引（非勾选） | ✅ |
| `Object.getOwnPropertyNames(obj)` | 遍历自身属性（动态字段匹配） | ✅ |
| `cb.loader.runCommandLine` + callback | 多步骤页面链回调 | ✅ |
| `vm.on('beforeUnsubmit', fn)` | 撤回提交前拦截 | ✅ |
| `vm.on('beforeSave')` 手动注入子表 | 保存前手动追加子表数据到请求体 | ✅ |
| `gridModel.get('rows')` 直接修改 + setDataSource | 修改行对象后手动刷新数据源 | ✅ |
| `['event1','event2'].forEach` 批量绑定 | 多事件批量绑定多个 GridModel | ✅ |
| `grid.on('beforeInsertRow')` 字段映射 | 增行时重映射源字段到目标字段 | ✅ |
| `cDataSourceName` 声明式元数据 | domain.schema.entity 格式的数据库实体标识 | ✅ |

---

## 25. `(async () => {...})()` — 同步事件中启用 await ⭐⭐⭐

### 模式

BIP 按钮的 `click` 回调是同步的，需要等待框架异步操作时，用自执行 async 函数包裹：

```js
viewModel.get('btn').on('click', function (data) {
  // 外层同步代码...

  (async () => {
    for (let i = 0; i < rows.length; i++) {
      gridModel.setFocusedRowIndex(i);
      // ... 数据处理 ...

      // 🔑 可以使用 await 等待框架异步操作
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (/* 条件满足 */) { clearInterval(check); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 1000); // 超时
      });
    }
  })();

  // ⚠️ 陷阱：这里的代码不会等待上面的 async IIFE 完成！
  // cb.utils.alert('完成') — 会先于 async IIFE 内的操作执行
});
```

**关键陷阱**：async IIFE 外部的代码不等它完成——需把后续操作放在 IIFE 内部或 `.then()` 中。

---

## 26. `viewModel.biz.do('cellCheck', ...)` — 程序化单元格校验/联动 ⭐⭐⭐

### 模式

触发 BIP 框架的完整单元格值变更联动链（参照回填、公式计算、状态校验）：

```js
viewModel.biz.do('cellCheck', viewModel, {
  cellName: 'productCode',          // 触发联动的列
  childrenField: 'orderByProduct',  // 子表数据字段名
  oldValue: '',                     // 旧值
  rowId: row._id,                   // 行框架内部 ID（_id 字段）
  rowIndex: rowIndex,               // 行索引
  value: productCode,               // 新值
});
```

**与 `setCellValue` 的区别**：

| 方式 | 行为 | 适用场景 |
|------|------|----------|
| `setCellValue(idx, f, v, true)` | 设值 + 触发 `afterCellValueChange` | 简单赋值 |
| `biz.do('cellCheck', ...)` | 模拟完整单元格变更流程 | 需要触发参照回填、公式计算等完整联动链 |

---

## 27. `await + Promise` 轮询等待异步更新 ⭐⭐⭐

### 模式

等待 BIP 框架异步完成参照回填后再继续后续操作：

```js
let oldValue = gridModel.getCellValue(rowIndex, 'productCode');

await new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    const newValue = gridModel.getCellValue(rowIndex, 'productCode');
    if (newValue && newValue !== oldValue) {
      clearInterval(checkInterval);
      resolve();  // 值已更新 → 框架回填完成
    }
  }, 200);

  setTimeout(() => {
    clearInterval(checkInterval);
    resolve();  // 超时保护，强制继续
  }, 1000);
});
```

**适用场景**：`setCellValue` 或 `triggerReferBrowse` 后，等待 `_name`/`_code` 等关联字段被框架异步回填。

---

## 28. 特征组 `id = ''` 清空 ⭐

BIP 特征组（自由项/自定义项）复制到新行时需清空 `id`：

```js
newRow.freeCharacteristics = sourceRow.freeCharacteristics;
newRow.freeCharacteristics.id = '';  // 清空 → 框架视为新增记录
```

---

## 关键 API 速查（本节新增）

| API | 说明 | 首次记录 |
|-----|------|----------|
| `proxy.ensureSync()` | DynamicProxy 同步调用，直接返回结果 | ✅ |
| `cb.rest.AppContext.user` | 获取当前登录用户信息 | ✅ |
| `vm.getDiworkCode()` | 获取单据工作流编码 | ✅ |
| `gridModel.setCellValue(i, 'cellConfig', {...})` | 动态设置单元格控件类型 | ✅ |
| `gridModel.setState('dataSourceMode', 'local')` | 设置表格为本地数据源模式 | ✅ |
| `gridModel.setDataSource(array)` | 本地模式下设置表格数据 | ✅ |
| `Message.destroy()` | 手动销毁全局消息提示 | ✅ |
| `viewModel.on('beforeAdd', fn)` | 页面级新增拦截 | ✅ |
| `viewModel.setState('voucherNoReturn', bool)` | 控制保存后是否跳转 | ✅ |
| `viewModel.get('btn').fireEvent('click')` | 程序化触发按钮点击 | ✅ |
| `gridModel.getFocusedRowIndex()` | 获取焦点行索引（非勾选） | ✅ |
| `Object.getOwnPropertyNames(obj)` | 遍历自身属性（动态字段匹配） | ✅ |
| `cb.loader.runCommandLine` + callback | 多步骤页面链回调 | ✅ |
| `vm.on('beforeUnsubmit', fn)` | 撤回提交前拦截 | ✅ |
| `vm.on('beforeSave')` 手动注入子表 | 保存前手动追加子表数据到请求体 | ✅ |
| `gridModel.get('rows')` 直接修改 + setDataSource | 修改行对象后手动刷新数据源 | ✅ |
| `['event1','event2'].forEach` 批量绑定 | 多事件批量绑定多个 GridModel | ✅ |
| `grid.on('beforeInsertRow')` 字段映射 | 增行时重映射源字段到目标字段 | ✅ |
| `cDataSourceName` 声明式元数据 | domain.schema.entity 格式的数据库实体标识 | ✅ |
| `(async () => {...})()` 自执行异步 | 同步事件处理器中启用 await | ✅ |
| `viewModel.biz.do('cellCheck', ...)` | 程序化触发完整单元格变更联动链 | ✅ |
| `await + Promise` 轮询等待 | 等待框架异步参照回填完成 | ✅ |
| 特征组 `id = ''` | 复制特征组对象时清空 id 使其视为新增 | ✅ |

---

## 29. `getParamValue` — 六层回退通用参数取值 ⭐⭐⭐

### 模式

将多层嵌套的参数查找抽象为通用函数，避免到处写重复的深度取值逻辑：

```js
function getParamValue(params, fieldName) {
  if (!params) return '';
  if (params[fieldName]) return getRawValue(params[fieldName]);           // 顶层
  if (params.data?.[fieldName]) return getRawValue(params.data[fieldName]); // data嵌套
  if (params.billData?.[fieldName]) return getRawValue(params.billData[fieldName]);
  if (params.params?.[fieldName]) return getRawValue(params.params[fieldName]);
  if (params.params?.data?.[fieldName]) return getRawValue(params.params.data[fieldName]);
  return '';
}
```

配合 `getModelValue` 安全字段获取 + `getCache` 缓存回退，形成完整的 **七层回退取值链**。

---

## 30. 列表页 fireEvent 刷新（区别于卡片页） ⭐⭐⭐

### 模式

列表页操作完成后，不能用 `viewModel.execute('refresh')`，必须触发查询区搜索按钮：

```js
// ❌ 列表页无效
viewModel.execute('refresh');

// ✅ 列表页正确方式
var filterViewModel = viewModel.getFilterViewModel();
if (filterViewModel && filterViewModel.get('search')) {
  filterViewModel.get('search').fireEvent('click', { bClick: true });
}
```

**卡片页 vs 列表页**：

| 页面类型 | 刷新 API | 行为 |
|----------|----------|------|
| 卡片页 | `viewModel.execute('refresh')` | 重新加载当前单据 |
| 列表页 | `filterViewModel.get('search').fireEvent('click')` | 重新执行查询（保留条件） |

---

## 关键 API 速查（本节新增）

| API | 说明 | 首次记录 |
|-----|------|----------|
| `proxy.ensureSync()` | DynamicProxy 同步调用，直接返回结果 | ✅ |
| ... | ... | ... |
| `(async () => {...})()` 自执行异步 | 同步事件处理器中启用 await | ✅ |
| `viewModel.biz.do('cellCheck', ...)` | 程序化触发完整单元格变更联动链 | ✅ |
| `await + Promise` 轮询等待 | 等待框架异步参照回填完成 | ✅ |
| 特征组 `id = ''` | 复制特征组对象时清空 id 使其视为新增 | ✅ |
| `getParamValue(params, field)` 六层回退 | 通用多层嵌套参数查找函数 | ✅ |
| `filterViewModel.get('search').fireEvent` | 列表页刷新（区别于卡片页 execute refresh） | ✅ |

---

## 31. `afterTabActiveKeyChange` — 页签切换懒加载 ⭐⭐⭐

### 模式

只在用户真正切换到某页签时才加载数据，避免页面初始化时一次性查询所有页签：

```js
viewModel.on('afterTabActiveKeyChange', function (arg) {
  if (arg.key == 'card_maintenance') {     // arg.key = 页签 key（设计器配置）
    var id = viewModel.get('id').getValue();
    if (id != null) { loadTabData(id); }   // 懒加载
  }
});
```

### 设计优势
- 减少首次页面加载时间
- 未访问的页签不产生无效 API 调用

---

## 32. 字段级 `jointQuery` — 区别于 `cellJointQuery` ⭐⭐

| 事件 | 绑定对象 | 触发场景 |
|------|----------|----------|
| `jointQuery` | 页面字段 `vm.get('field').on('jointQuery', fn)` | 点击主表的超链接字段 |
| `cellJointQuery` | 表格模型 `gridModel.on('cellJointQuery', fn)` | 点击子表某列的超链接单元格 |

```js
// 启用字段超链接
vm.get('purchaseOrderId').setState('bJointQuery', true);

// 表格列超链接
vm.get('grid').setColumnState('orderCode', 'bJointQuery', true);
```

---

## 33. `mask: false` — DynamicProxy 静默加载 ⭐

```js
var proxy = cb.rest.DynamicProxy.create({
  ensure: {
    url: url, method: 'POST',
    options: { async: true, mask: false },
    // mask: false → 不显示全屏 loading 遮罩
  },
});
```

**适用场景**：页签内静默加载数据、后台轮询等不需要打断用户操作的场景。

---

## 34. `runCommandLine` 跨域跳转（domainKey） ⭐

```js
cb.loader.runCommandLine('bill', {
  billtype: 'voucher',
  billno: 'st_purchaseorder',
  domainKey: 'upu',   // 目标单据所在域，可与当前页面域不同
  params: { id: orderId, mode: 'browse' },
}, viewModel);
```

---

## 关键 API 速查（本节新增）

| API | 说明 | 首次记录 |
|-----|------|----------|
| ... | ... | ... |
| `getParamValue(params, field)` 六层回退 | 通用多层嵌套参数查找函数 | ✅ |
| `filterViewModel.get('search').fireEvent` | 列表页刷新（区别于卡片页 execute refresh） | ✅ |
| `vm.on('afterTabActiveKeyChange', fn)` | 页签切换事件（懒加载入口） | ✅ |
| `vm.get('field').on('jointQuery', fn)` | 字段级超链接点击（区别于 cellJointQuery） | ✅ |
| `DynamicProxy options.mask: false` | 禁用加载遮罩，静默加载 | ✅ |
| `runCommandLine domainKey 跨域` | 打开不同 service domain 的单据 | ✅ |

---

## 35. `treeModel.__data.dataSource` — TreeModel 内部数据源 ⭐⭐⭐

BIP 树模型的原始层级数据存储在 `__data.dataSource`：

```js
var treeModel = viewmodel.getTreeModel('items');
var dataSource = treeModel.__data && treeModel.__data.dataSource;
// dataSource = [{ id, children: [{ id, children: [...] }] }, ...]
```

**为什么用它**：`get('rows')` 是平铺后的只读数据，`__data.dataSource` 保留原始层级结构且可直接修改。

---

## 36. `treeModel.updateNodes()` — 批量更新节点 ⭐⭐⭐

修改节点属性后触发 UI 刷新（现有 tree-model.md 未收录）：

```js
var updateNodes = [];
// ... 修改节点属性 ...
node.budgetItemDefineCharacter__budgetaccttype = newValue;
updateNodes.push(node);

// 优雅降级：新版用 updateNodes，旧版用 updateNode
if (typeof treeModel.updateNodes === 'function') {
  treeModel.updateNodes(updateNodes);
} else if (typeof treeModel.updateNode === 'function') {
  updateNodes.forEach(node => treeModel.updateNode(node));
}
```

---

## 37. 树节点递归遍历 `walk()` ⭐⭐

```js
var walk = function (nodes) {
  nodes.forEach(function (node) {
    // 处理当前节点...
    if (node.children && node.children.length > 0) {
      walk(node.children);  // 递归处理子节点
    }
  });
};
walk(dataSource);
```

---

## 38. 防重复注册：自定义标记属性 ⭐⭐

```js
if (treeModel.__budgetAcctTypePatchRegistered) return;
treeModel.__budgetAcctTypePatchRegistered = true;
```

比全局变量更安全，随模型生命周期自动清理。

---

## 39. 多格式特征组值提取 ⭐⭐⭐

特征组可能是 JSON 字符串 / 数组 / 扁平对象 / 嵌套对象 4 种格式，需统一处理：

```js
function getFromContainer(container) {
  if (typeof container === 'string') container = JSON.parse(container);  // 格式1
  if (Array.isArray(container)) {
    container.find(c => (c.code||c.defineCode) === 'targetKey');         // 格式2
  }
  if (typeof container === 'object') {
    if (container.targetKey) return container.targetKey;                  // 格式3
    Object.values(container).find(v => v.code === 'targetKey');           // 格式4
  }
}
```

---

## 关键 API 速查（本节新增）

| API | 说明 | 首次记录 |
|-----|------|----------|
| ... | ... | ... |
| `treeModel.__data.dataSource` | 树模型内部层级数据源 | ✅ |
| `treeModel.updateNodes([...])` | 批量更新树节点（触发 UI 刷新） | ✅ |
| `treeModel.updateNode(node)` | 单个更新树节点（旧版兼容） | ✅ |
| `treeModel.__customFlag` 防重复 | 模型对象上挂自定义属性防止重复注册 | ✅ |
| `cache+schemeId` 缓存策略 | 以业务 key 为维度缓存 API 结果 | ✅ |
| 多格式特征组值提取 | JSON字符串/数组/扁平对象/嵌套对象 4格式兼容 | ✅ |

---

## 40. `cb.rest.invokeFunction` 同步跨域调用 ⭐⭐⭐

### 模式

与 `DynamicProxy.ensureSync()` 不同，`invokeFunction` 调用 YMS 注册的 API 函数：

```js
let response = cb.rest.invokeFunction(
  'ST.rule.osminrecordAPI',      // API 函数编码
  requestData,
  function (err, res) {},        // 同步模式下占位回调（必须传）
  viewModel,
  {
    async: false,                // 🔑 同步等待
    domainKey: 'developplatform', // 🔑 跨域
  }
);
// response 直接可用（不需回调），与 ensureSync 一样是同步返回
```

**三种后端调用方式对比**：

| 方式 | 调用对象 | 同步 | 跨域 |
|------|----------|------|------|
| `invokeFunction(id, params, cb)` | YMS API 函数（JS） | 回调 | — |
| `invokeFunction(id, params, cb, vm, {async:false, domainKey})` | YMS API 函数 | ✅ 同步 | ✅ |
| `DynamicProxy.ensureSync()` | Java Controller | ✅ 同步 | options.domainKey |

---

## 41. 直接修改行对象的特征组属性 ⭐

```js
// 前端：直接修改 row 对象的嵌套特征组属性
row.osmInRecordsDefineCharacter.ZLDJ01 = dataMap.ZLDJ01;
row.osmInRecordsDefineCharacter.ZLDJ01_name = dataMap.ZLDJ01_name;

// 配合 setCellValue 触发 UI 联动
gridModel.setCellValue(rowIndex, 'oriTaxUnitPrice', newPrice, true);
```

---

> 📘 **后端新模式**（`AbstractTrigger` 规则链 / YonQL 嵌套穿透 / `postman` 取价 API / `child.set` 回写 / 双索引匹配）已记录在 `references/projects/东软载波-库存管理-页面建模.md`，不在本文档重复。

## 关键 API 速查（本节新增）

| API | 说明 | 首次记录 |
|-----|------|----------|
| ... | ... | ... |
| 多格式特征组值提取 | JSON字符串/数组/扁平对象/嵌套对象 4格式兼容 | ✅ |
| `invokeFunction(id,p,cb,vm,{async:false,domainKey})` | API 函数同步跨域调用 | ✅ |
| `row.featureGroup.field = value` | 前端直接修改行对象特征组属性 | ✅ |

---

## 42. FileReader + Base64 → DynamicProxy 文件上传 ⭐⭐⭐

### 模式

绕过 BIP 框架上传组件，纯原生 JS 实现文件上传：

```js
// 1. 动态创建文件选择器
let fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.onchange = e => {
  fileToBase64(e.target.files[0]).then(base64 => upload(base64));
};
fileInput.click();

// 2. Promise 包装 FileReader
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

// 3. DynamicProxy POST Base64
function upload(base64) {
  var proxy = cb.rest.DynamicProxy.create({...});
  proxy.ensure({ fileBase64: base64, fileName, fid, type }, cb);
}
```

**适用场景**：需根据 type 参数路由不同后端接口，或对上传流程有特殊控制需求。

---

## 43. 树递归收集子节点 + beforeSearch 树驱动过滤 ⭐⭐⭐

```js
// 递归收集所有子孙节点
function collectChildKeys(node, result) {
  if (node.children?.length > 0) {
    node.children.forEach(child => {
      result.push(child.id);
      collectChildKeys(child, result);
    });
  }
}

// 注入 foreignerKey IN 条件
args.params.condition.simpleVOs = [{
  field: 'foreignerKey', op: 'in', value1: allChildKeys,
}];
```

---

## 44. `gridModel.select(indices)` — 程序化批量选中行 ⭐⭐

```js
// 按匹配条件收集行索引
array.forEach((row, index) => {
  if (matchCondition(row)) selectedRows.push(index);
});
gridModel.select(selectedRows);  // 批量选中
```

---

## 45. `parentViewModel.execute('modalDataReturn', data)` — 弹窗自定义事件 ⭐⭐

```js
parentViewModel.execute('modalDataReturn', selectedRows);  // 传复杂数据
viewModel.communication({ type: 'modal', payload: { data: false } });
```

---

## 46. `filterViewModel.getParams().autoLoad` ⭐

```js
filterViewModel.getParams().autoLoad = false;  // 禁自动查询
// ... 设置默认值 ...
filterViewModel.getParams().autoLoad = true;   // 恢复
```

---

## 47. `sheet.insertRule` CSS 注入 ⭐

```js
var style = document.createElement('style');
document.head.appendChild(style);
style.sheet.insertRule('.wui-modal-footer .wui-button#xxx {display:none;}', 0);
```

---

## 关键 API 速查（本节新增）

| API | 说明 |
|-----|------|
| ... | ... |
| `FileReader.readAsDataURL()` + Promise | 原生 JS 文件转 Base64 |
| `input.click()` 程序化触发 | 动态创建 file input 并触发选择 |
| `collectChildKeys + findNodeByKey` | 树节点递归收集 + 查找 |
| `gridModel.select(indices)` | 程序化选中多行 |
| `parentViewModel.execute('modalDataReturn')` | 弹窗自定义事件传数据 |
| `filterViewModel.getParams().autoLoad` | 控制查询区自动加载 |
| `style.sheet.insertRule` | 动态 CSS 注入 |

---

## 48. `afterLoadMeta` — 元数据加载完成 ⭐⭐⭐

```js
viewModel.on('afterLoadMeta', function (data) {
  var billid = viewModel.getParams().billid;  // 此时可读 URL 参数
  setTimeout(hideModalFooter, 100);
});
```

| 事件 | 时机 | 适用 |
|------|------|------|
| `afterLoadMeta` | 早（元数据初始化） | URL参数、DOM、事件注册 |
| `afterLoadData` | 晚（业务数据就绪） | 数据驱动的字段控制 |

---

## 49. `hideModalFooter` DOM 隐藏弹窗按钮 ⭐⭐

```js
// 方案1：CSS class 隐藏整个底部按钮容器
document.querySelector('.yonRowFlex.btn-toolbar-bottom').style.display = 'none';
// 方案2：兜底 — ID 选择器单独隐藏
document.getElementById('{billno}|btnModalConfirm').style.display = 'none';
```

**BIP 弹窗按钮 ID 格式**：`{billno}|btnModal{Action}`

---

## 50. `afterSelect` + `clearCache` + `getText` ⭐

| API | 说明 |
|-----|------|
| `gridModel.on('afterSelect', fn)` | 选中行后联动加载 |
| `viewModel.clearCache()` | 清除全部缓存 |
| `viewModel.get('f').getText()` | 获取字段显示文本 |

---

## 关键 API 速查（本节新增）

| API | 说明 |
|-----|------|
| `viewModel.on('afterLoadMeta', fn)` | 元数据初始化完成（早于 afterLoadData） |
| `getElementById('xxx\|btnModalConfirm')` | BIP 弹窗按钮 DOM 操作 |
| `viewModel.clearCache()` | 清除全部 ViewModel 缓存 |
| `viewModel.get('f').getText()` | 获取字段显示文本 |

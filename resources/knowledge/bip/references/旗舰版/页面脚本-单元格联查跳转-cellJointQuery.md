---
title: 销售合同卡片 — 单元格联查跳转 页面脚本
project: 待确认
version: BIP 旗舰版
date: 2026-07-24
tags:
  - 实战代码
  - 页面脚本
  - cellJointQuery
  - runCommandLine
  - 单元格联查
  - 跨单据跳转
  - grid事件
keywords:
  - cellJointQuery
  - runCommandLine
  - bill
  - 销售合同
  - 项目物料清单
  - 销售预测
  - return false
  - 联查拦截
  - 自定义跳转
---

# 销售合同卡片 — 单元格联查跳转 页面脚本

> **项目**：待确认 | **记录日期**：2026-07-24

---

## 功能概述

在销售合同卡片的子表中，某些单元格默认点击后会打开当前单据的详情页。这个脚本**拦截了单元格点击事件**，根据点击的字段名**跳转到不同的目标单据**：

| 点击的单元格 | 跳转目标 | 目标 domainKey |
|-------------|----------|---------------|
| `salesContractDefineCharacter__prjmateriallistno` / `prjmateriallistid` | 项目物料清单卡片 | `yonbip-pm-projectme` |
| `salesContractDefineCharacter__salesForecastno` / `salesForecastid` | 销售预测卡片 | `requirementsplanning` |

---

## 🆕 新知识记录（Skill 中无此完整模式）

### `cellJointQuery` — 拦截单元格点击并跳转

`cellJointQuery` 是 Grid 子表的**单元格联查事件**，BIP 框架中当用户点击子表的可联查单元格时触发。默认会打开当前行对应的详情页，但可以通过 `return false` 阻止默认行为并**自定义跳转**。

**`args` 参数结构**：
```js
{
  cellName: 'salesContractDefineCharacter__prjmateriallistno',  // 被点击的单元格字段名
  row: { /* 当前行的所有数据 */ },                                // 当前行数据对象
  rowIndex: 0                                                     // 行索引
}
```

**完整模式**：
```js
viewModel.getGridModel().on('cellJointQuery', function (args) {
  // 1. 根据 cellName 判断点击了哪个字段
  if ('字段A' === args.cellName) {
    // 2. 从行数据中取目标单据 ID
    var targetId = args.row['目标字段名'];

    // 3. 打开目标单据（浏览态）
    cb.loader.runCommandLine('bill', {
      billtype: 'voucher',        // voucher=详情页, voucherList=列表
      billno: '目标单据编码',       // UI 模板中的单据编码
      domainKey: '目标服务域',      // 业务对象的 domainKey
      params: {
        id: targetId,
        mode: 'browse',            // browse=浏览, edit=编辑, add=新增
      },
    }, viewModel);
  }

  // 4. 阻止默认行为（不打开当前单据的详情页）
  return false;
});
```

**与文本超链接跳转的区别**：
- [文本字段超链接跳转页面功能.md](../旗舰版/文本字段超链接跳转页面功能.md) 是通过配置让文本字段可点击
- `cellJointQuery` 是拦截 BIP 自带的联查行为，重定向到其他目标
- `cellJointQuery` 不需要改动字段配置，纯前端脚本即可

### `cb.loader.runCommandLine('bill', ...)` — 参数说明

```js
cb.loader.runCommandLine('bill', {
  billtype: 'voucher',      // voucher=详情页 | voucherList=列表页
  billno: '单据编码',         // UI模板中配置的单据编码
  domainKey: '服务域',        // 业务对象所属的 domainKey
  params: {
    id: '目标单据主键',       // browse/edit 态必传
    mode: 'browse',          // browse=浏览 | edit=编辑 | add=新增
  },
}, viewModel);               // 当前页面的 viewModel（用于上下文传递）
```

---

## 脚本代码（注释版）

```js
// ============================================================
// Grid 单元格联查事件
// 拦截子表中可联查单元格的点击，根据字段名跳转到不同的目标单据
// ============================================================
viewModel.getGridModel().on('cellJointQuery', function (args) {

  // ---------- 条件 1：点击了"项目物料清单"相关字段 ----------
  if ('salesContractDefineCharacter__prjmateriallistno' === args.cellName
      || 'salesContractDefineCharacter__prjmateriallistid' === args.cellName) {

    // 从当前行数据中取出目标单据的主键 ID
    var orderId = args.row.salesContractDefineCharacter__prjmateriallistid;

    // 打开项目物料清单卡片（浏览态）
    cb.loader.runCommandLine(
      'bill',  // 固定值：打开单据
      {
        billtype: 'voucher',                         // 详情页模式
        billno: 'rscm_project_materiallist_card',     // 目标单据编码
        domainKey: 'yonbip-pm-projectme',             // 目标单据所在服务域
        params: {
          id: orderId,       // 目标单据主键
          mode: 'browse',    // 以浏览模式打开（不可编辑）
        },
      },
      viewModel  // 传入当前页面的 ViewModel，框架用于上下文传递
    );

  // ---------- 条件 2：点击了"销售预测"相关字段 ----------
  } else if ('salesContractDefineCharacter__salesForecastno' === args.cellName
             || 'salesContractDefineCharacter__salesForecastid' === args.cellName) {

    // 从当前行数据中取出销售预测的主键 ID
    var orderId = args.row.salesContractDefineCharacter__salesForecastid;

    // 打开销售预测卡片（浏览态）
    cb.loader.runCommandLine(
      'bill',
      {
        billtype: 'voucher',
        billno: 'mr_sales_forecast',
        domainKey: 'requirementsplanning',
        params: {
          id: orderId,
          mode: 'browse',
        },
      },
      viewModel
    );
  }

  // ---------- 关键：阻止默认联查行为 ----------
  // 不 return false 的话，BIP 框架会打开当前行对应的默认详情页
  // 返回 false 则只执行我们自定义的跳转
  return false;
});
```

---

## 代码质量评估

| 维度 | 评价 |
|------|------|
| **语法** | ✅ 无语法错误 |
| **逻辑** | ✅ 正确：`cellName` 精确匹配字段名，`else if` 互斥处理 |
| **健壮性** | ✅ 安全：用 `===` 比较，变量在 if 块内部声明 |
| **`return false`** | ✅ 正确：阻止默认联查，确保只跳转自定义目标 |
| **生产就绪** | 🟡 移除 `debugger` 后即可使用 |

> 该脚本无 Bug，结构简洁清晰，是 `cellJointQuery` + `runCommandLine` 组合的标准写法。

---

## 涉及字段

| 字段编码 | 用途 |
|----------|------|
| `salesContractDefineCharacter__prjmateriallistno` | 项目物料清单编号（显示字段，触发联查的入口） |
| `salesContractDefineCharacter__prjmateriallistid` | 项目物料清单 ID（实际取值字段） |
| `salesContractDefineCharacter__salesForecastno` | 销售预测编号（显示字段，触发联查的入口） |
| `salesContractDefineCharacter__salesForecastid` | 销售预测 ID（实际取值字段） |

> 字段命名规则：`salesContractDefineCharacter__xxx` = 销售合同自定义特征子实体的字段

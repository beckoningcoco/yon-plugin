# 红冲开具特有逻辑

## 概述

本文档定义红冲（红字发票）场景的特有逻辑，仅描述与公共逻辑的差异部分。

## 前置条件

1. 发票方向为红票（invDirection = 1）
2. 原蓝票已同步至税务系统且状态正常
3. 已维护原蓝票信息（发票代码、发票号码）

## 特有差异

### 1. 金额处理

所有金额字段必须为负值（negate）：

| 字段 | 处理 | 代码 |
|------|------|------|
| qty | 取负值 | qty.negate() |
| oriMoney | 取负值 | oriMoney.negate() |
| oriTax | 取负值 | oriTax.negate() |
| oriSum | 取负值 | oriSum.negate() |

### 2. 原蓝票信息提取

| 字段 | BIP字段 | 说明 |
|------|---------|------|
| 原蓝票代码 | blueEinvoiceNo | 原蓝票发票代码 |
| 原蓝票号码 | blueEinvoiceHm | 原蓝票发票号码（20位全电） |
| 原发票类型 | originalInvoiceType | 原蓝票发票类型 |

**校验规则**：
- 原蓝票号码（blueEinvoiceHm）必填
- 当号码长度≠20位时，原蓝票代码必填

### 3. 冲红原因

从特征组中提取冲红原因，根据用户提供的映射表转换。

### 4. 特有字段

| 字段 | 数据来源 |
|------|---------|
| oriInvCode | blueEinvoiceNo |
| oriInvNo | blueEinvoiceHm |
| oriFullInvNo | blueEinvoiceHm（20位全电） |
| blueInvChyy | 冲红原因映射 |
| blueInvType | originalInvoiceType |

### 5. 不传递字段

红票场景不传递以下蓝票特有字段：
- 折扣相关字段（lineDiscountMoney、discountType）

## 与蓝票的差异

| 项目 | 蓝票 | 红冲 |
|------|------|------|
| 金额符号 | 正值abs() | 负值negate() |
| 原票信息 | 无需 | 必填 |
| 冲红原因 | 无需 | 必填 |
| 折扣字段 | 传递 | **不传递** |

## 完整流程

```
1. 接收 invoiceId
2. 调用 iuap-c-openapi-integration 查询BIP数据
3. 提取原蓝票信息（校验必填）    ← 红冲特有
4. 字段映射转换（金额negate）  ← 红冲特有
5. 特征字段翻译
6. 冲红原因映射              ← 红冲特有
7. 调用三方接口
8. 响应解析
9. 回写结果（更新原蓝票状态）   ← 红冲特有
```

## 注意事项

- 原蓝票信息必须校验
- 金额必须为负值
- 冲红原因根据用户提供的映射转换
- 红票不传递折扣字段
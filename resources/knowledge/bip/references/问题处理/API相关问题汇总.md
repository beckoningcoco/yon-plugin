---
name: API相关问题汇总
description: >
  用友 BIP 客开技能。当用户提到API时，旗舰版，yonbip，BIP，关于原厂API，标准API，或者可开API相关内容时，参考该文档内容。 
---

## 销售订单保存 — 贸易路径字段 tradeRouteID 无法保存

- **项目**: 毛戈平
- **版本**: BIP V5
- **日期**: 2026-05-27

### 问题描述

调用标准 API `销售订单单个保存` 时，标品参照字段 `tradeRouteID`（贸易路径）无法正常保存：

| 传参方式 | 表现 |
|----------|------|
| 传 `tradeRouteID_code`（编码） | 订单保存成功，但**值未写入数据库** |
| 传 `tradeRouteID`（ID） | 直接报错：`Cannot invoke "java.lang.Boolean.booleanValue()" because the return value of "com.yonyoucloud.uorder.utils.ConvertUtils.getBoolean(Object)" is null` |

### 原因

`tradeRouteID` 参照关联的实体中有一个标品字段 `isEndTrade`（是否末级站点），该字段未被赋值时为空，导致 `ConvertUtils.getBoolean()` 返回 null，触发空指针异常。

### 解决方案

保存时除了传 `tradeRouteID`，还需要将 `isEndTrade` 字段也赋上值，之后 `tradeRouteID` 传 ID 即可正常保存。
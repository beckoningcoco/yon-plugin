# 结算单集成规范

## 概述

> **⚠️ 核心场景**：本文件定义结算单推送与状态回写的具体业务逻辑
> **📌 引用规范**：MVC分层架构、数据持久化方式请参考 _公共规范/

---

## MCP技能调用

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| BIP 查询 | 需要查询 BIP 结算单数据 | getOpenApiCall |
| 档案查询 | 需要查询 BIP 档案数据 | getIBillQueryRepository |

---

## 结算推送流程

### 1. 推送触发

| 触发方式 | 说明 |
|---------|------|
| 审批通过后自动推送 | 结算单审批通过后自动触发推送 |
| 手动推送 | 用户手动点击推送按钮 |
| 定时任务推送 | 定时任务扫描未推送的结算单 |

### 2. 数据校验

| 校验规则 | 说明 |
|---------|------|
| 结算单号必填 | settlement_no 不能为空 |
| 结算金额必须大于0 | amount > 0 |
| 结算类型必填 | settlement_type 不能为空 |

### 3. 数据处理

| 操作类型 | 处理方式 |
|---------|---------|
| 查询结算单 | 调用 getOpenApiCall 查询 BIP 结算单 |
| 转换为三方格式 | 将 BIP 数据转换为第三方系统格式 |
| 推送 | 调用第三方 API 推送 |
| 状态回写 | 根据推送结果更新 BIP 结算单状态 |

---

## 结算推送服务

### 接口定义

| 方法 | 说明 |
|------|------|
| pushSettlement | 推送结算单到第三方系统 |
| querySettlementStatus | 查询结算单推送状态 |
| writeBackStatus | 回写结算单状态到 BIP |

### 数据处理流程

1. 查询 BIP 结算单数据
2. 将 BIP 数据转换为第三方系统格式
3. 调用第三方 API 推送
4. 接收回写状态并更新 BIP 数据

---

## 字段映射

| BIP 字段 | 第三方字段 | 说明 |
|---------|-----------|------|
| settlement_no | settlement_no | 结算单号 |
| settlement_amount | amount | 结算金额 |
| settlement_type | type | 结算类型 |

---

## 字段映射（动态）

> **⚠️ 重要**：以下字段映射为示例，实际根据外部 Excel/需求文档动态生成

| BIP 字段 | 第三方字段 | 数据类型 | 说明 |
|---------|-----------|---------|------|
| settlement_no | settlement_no | String | 结算单号 |
| settlement_amount | amount | BigDecimal | 结算金额 |
| settlement_type | type | String | 结算类型 |
| trade_type | trade_type | String | 交易类型 |
| settle_method | settle_method | String | 结算方式 |
| bank_account | bank_account | String | 银行账户 |
| settlement_date | settlement_date | Date | 结算日期 |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| SET001 | 结算单不存在 | 返回错误，不执行推送 |
| SET002 | 金额不合法 | 返回错误，不执行推送 |
| SET003 | 推送失败 | 记录错误日志，更新推送状态为失败 |

---

## 三方鉴权接口机制

### 鉴权方式

- 从外部配置读取第三方 API 地址和鉴权信息
- 根据配置动态生成鉴权参数

---

## 核心组件清单

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| SettlementIntegrateRequest | 入参 DTO | Model |
| SettlementQueryService | BIP 查询服务接口 | Service |
| SettlementOpenApiQueryService | BIP 查询服务实现 | Service |
| SettlementFieldMapper | 字段映射器 | Service |
| SettlementDetailProcessor | 结算明细处理器 | Service |
| ThirdPartyAuthService | 三方鉴权接口 | Service |
| ThirdPartySettlementService | 三方结算接口 | Service |
| SettlementApiResponse | 响应 DTO | Model |
| ResponseParser | 响应解析器 | Service |
| SettlementResultWriteService | 结果回写服务 | Service |

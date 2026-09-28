# 司库集成托底规范

## 概述

> **⚠️ 托底场景**：当无厂商配置或 fallbackEnabled=true 时使用本规范

---

## 托底实现概述

当无特定厂商配置或系统配置了 `fallbackEnabled=true` 时，使用默认的托底实现进行司库集成。

---

## 银行账户托底

### 托底逻辑

1. 使用默认的 BIP API 进行银行账户同步
2. 不涉及复杂的第三方系统对接
3. 简单的 REST API 调用

### 托底字段映射

| BIP 字段 | 第三方字段 | 说明 |
|---------|-----------|------|
| bankaccount_code | account_code | 银行账户编码 |
| bankaccount_name | account_name | 银行账户名称 |
| bank | bank_name | 开户银行 |
| account | account_number | 账号 |

### 托底 API

```
POST /api/bank/sync
```

---

## 收款单托底

### 托底逻辑

1. 使用默认的 REST API 进行推送
2. 不涉及复杂的鉴权和数据转换
3. 简单的 JSON 格式交互
4. 支持审批签字回调

### 托底字段映射

| BIP 字段 | 第三方字段 | 说明 |
|---------|-----------|------|
| id | id | 单据ID |
| tradetype_code | tradetype_code | 交易类型编码 |
| accentity_code | accentity_code | 主体编码 |
| amount | amount | 收款金额 |
| collection_date | collection_date | 收款日期 |

### 托底 API

#### 推送接口

```
POST /api/fund-collection/push
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 收款单数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| result | string | 推送结果 |
| resultcode | string | 结果码 |

#### 审批签字接口

```
POST /api/fund-collection/approve
```

#### 状态查询接口

```
GET /api/fund-collection/status/{id}
```

#### 校验收款单接口

```
POST /api/fund-collection/check
```

---

## 结算单托底

### 托底逻辑

1. 使用默认的结算表结构
2. 使用简单的 REST API 进行推送
3. 不涉及复杂的鉴权和数据转换

### 托底字段映射

| BIP 字段 | 第三方字段 | 说明 |
|---------|-----------|------|
| settlement_no | settlement_no | 结算单号 |
| settlement_amount | amount | 结算金额 |

### 托底 API

#### 推送接口

```
POST /api/settlement/push
```

#### 状态查询接口

```
GET /api/settlement/status/{settlementNo}
```

---

## 担保费用发票托底

### 托底逻辑

1. 使用默认的 BIP API 进行发票保存
2. 不涉及复杂的事件监听
3. 简单的 REST API 调用
4. 支持根据担保方向生成不同类型发票

### 托底字段映射

| 担保费用字段 | 发票字段 | 说明 |
|-------------|---------|------|
| id | resubmitCheckKey | 担保费用单ID |
| code | extVouchCode | 担保费用单号 |
| accentity | financeOrg | 开票组织 |
| costCurrency | oriCurrency | 币种 |
| natRate | exchangeRate | 汇率 |

### 托底 API

#### 发票保存接口

```
POST /api/invoice/save
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| invoiceType | string | 是 | 发票类型（payable/receivable） |
| data | JSONObject | 是 | 发票数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| data | JSONObject | 返回数据 |
| message | string | 消息 |

---

## 托底配置

```yaml
fallback:
  enabled: true
  api_base_url: "http://localhost:8080/api"
  timeout: 30000
```

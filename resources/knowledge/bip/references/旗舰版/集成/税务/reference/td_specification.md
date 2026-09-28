# 税务综合集成托底规范

## 概述

> **⚠️ 托底场景**：当无厂商配置或 fallbackEnabled=true 时使用本规范

---

## 托底实现

### 托底逻辑

1. 使用默认的 BIP 税务数据表结构
2. 使用简单的 REST API 进行同步
3. 不涉及复杂的鉴权和数据转换

### 托底字段映射

| 业务字段 | BIP 字段 | 说明 |
|---------|---------|------|
| 税务编码 | taxCode | 税务编码 |
| 税务名称 | taxName | 税务名称 |
| 税率 | taxRate | 税率 |
| 单据ID | billId | 单据ID |
| 单据编号 | billCode | 单据编号 |
| 金额 | amount | 金额 |
| 税额 | taxAmount | 税额 |

---

## 托底 API

### 税务档案查询接口

```
GET /api/tax/query?code={taxCode}
```

### 税务档案新增接口

```
POST /api/tax/create
```

### 税务档案更新接口

```
PUT /api/tax/update
```

### 单据推送接口

```
POST /api/tax-voucher/push
```

### 状态回传接口

```
POST /api/tax-voucher/receive
```

---

## 托底配置

```yaml
fallback:
  enabled: true
  api_base_url: "http://localhost:8080/api"
  timeout: 30000
```

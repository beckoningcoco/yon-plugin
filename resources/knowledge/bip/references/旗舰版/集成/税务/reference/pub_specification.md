# 税务综合集成公共规范

## 概述

> **⚠️ 场景限制**：本文件定义税务综合集成的共用逻辑

> **📌 引用规范**：MVC分层架构、数据持久化方式请参考 _公共规范/

---

## MCP技能调用

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| 档案查询 | 需要查询 BIP 税务档案数据 | getIBillQueryRepository |
| BIP单据查询 | 需要查询 BIP 税金/契税/进项发票数据 | getOpenApiCall |
| 数据持久化 | 需要执行 SQL 增删改操作 | IYmsJdbcApi |

---

## 税务综合集成服务

### 接口定义

| 方法 | 说明 | 适用场景 |
|------|------|---------|
| syncTax | 同步税务档案数据到 BIP | 税务档案同步 |
| pushTaxVoucher | 推送税金单据到第三方 | 税金单据推送 |
| pushStampTax | 推送契税数据到第三方 | 契税推送 |
| syncInputInvoice | 同步进项发票数据 | 进项发票同步 |
| receiveStatus | 接收第三方状态回传 | 状态回传 |

---

## 数据处理流程

### 1. 单据推送流程

1. 接收业务单据审批通过事件（或推送请求）
2. 校验是否需要推送
3. 校验是否重复推送
4. 构建推送数据
5. 加密报文（如需要）
6. 调用第三方接口推送
7. 记录推送日志

### 2. 状态回传流程

1. 接收第三方状态回传
2. 解析回传数据
3. 更新单据状态
4. 记录回传日志

---

## 事件订阅（如适用）

- 事件类型：业务单据审批通过
- 推送时机：税金计提、补提单、契税单据等审批通过时
- 接收地址：/rest/event/push

---

## Controller 接口

### 推送接口

```
POST /rest/event/push
```

### 状态回传接口

```
POST /rest/event/receive
```

---

## 加密模块

使用加密模块进行数据安全处理：

- 报文解密
- 参数设置
- 签名验证
- SHA256 加密

---

## 日志记录

记录每次接口调用的请求和响应：

- TaxApiCallLog：接口调用日志
- 单据状态记录表

---

## 字段映射（通用）

| 业务字段 | 说明 | 数据类型 |
|---------|------|---------|
| id | 主键ID | String |
| billId | 单据ID | String |
| billCode | 单据编号 | String |
| billDate | 单据日期 | Date |
| amount | 金额 | BigDecimal |
| taxAmount | 税额 | BigDecimal |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| TAX001 | 数据同步失败 | 返回错误消息，记录日志 |
| TAX002 | 推送失败 | 返回错误消息，记录日志 |
| TAX003 | 状态回传处理失败 | 返回错误消息 |
| TAX004 | 校验不需要推送 | 返回提示信息 |
| TAX005 | 重复推送 | 返回提示信息 |

---

## Service 层实现规范

```java
public String pushData(BusinessDTO dto) {
    // 1. 校验是否需要推送
    if (!checkNeedPush(dto.getBillId())) {
        return "单据不需要推送";
    }

    // 2. 校验是否重复推送
    if (checkDuplicatePush(dto.getBillId())) {
        return "单据已经推送成功，请勿重复推送";
    }

    // 3. 构建推送数据
    String pushData = buildPushData(dto);

    // 4. 加密报文（如需要）
    String encryptedData = encrypt(pushData);

    // 5. 调用第三方接口推送
    String result = callThirdPartyApi(encryptedData);

    // 6. 记录推送日志
    savePushLog(dto, result);

    return result;
}

public void receiveStatus(StatusMsg statusMsg) {
    // 1. 解析回传数据
    // 2. 更新单据状态
    // 3. 记录回传日志
}
```

# 进项发票同步场景规范

## 概述

> **⚠️ 核心场景**：本文件定义进项发票同步的具体业务逻辑

> **📌 引用规范**：MVC分层架构、数据持久化方式请参考 _公共规范/

---

## MCP技能调用

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| BIP 查询 | 需要查询 BIP 进项发票数据 | getOpenApiCall |
| 档案查询 | 需要查询 BIP 档案数据 | getIBillQueryRepository |

---

## 进项发票同步服务

### 接口定义

| 方法 | 说明 |
|------|------|
| sysSKJXFPData | 同步进项发票数据到税务系统 |
| cancelSysSKJXFPData | 取消进项发票同步 |

---

## 数据处理流程

### 1. 进项发票同步流程

1. 接收进项发票数据
2. 根据发票类型构建数据
3. 调用税务系统接口保存发票明细
4. 保存进项企业票夹的票据到台账
5. 处理各类业务发票

### 2. 取消同步流程

1. 接收取消同步请求
2. 调用取消同步接口
3. 更新发票状态

---

## 支持的发票类型

| 发票类型名称 | 发票代码 |
|-------------|---------|
| 增值税专用发票 | 024 |
| 增值税普通发票 | 024 |
| 增值税电子普通发票 | 024 |
| 机动车销售统一发票 | 011 |
| 增值税电子专用发票 | 036 |
| 电子发票（增值税专用发票） | 036 |
| 电子发票（普通发票） | 024 |
| 数电票（增值税专用发票） | 036 |
| 数电票（普通发票） | 024 |

---

## 业务类型处理

### 一般进项发票

处理普通进项发票明细数据

### 建筑服务

处理建筑服务类进项发票

### 货物运输服务

处理货物运输服务类进项发票

### 航空运输电子客票行程单

处理航空运输电子客票行程单

### 铁路电子客票

处理铁路电子客票

### 机动车销售统一发票

处理机动车销售统一发票

---

## 字段映射

### 进项发票主表字段

| BIP 字段 | 说明 | 数据类型 |
|---------|------|---------|
| invoiceCode | 发票代码 | String |
| invoiceNumber | 发票号码 | String |
| invoiceDate | 开票日期 | Date |
| amount | 金额 | BigDecimal |
| taxAmount | 税额 | BigDecimal |
| taxIncludedAmount | 含税金额 | BigDecimal |

---

## 税务系统接口

### 发票保存接口

- 进项企业票夹进项发票保存
- 保存进项企业票夹的票据到台账

### 取消同步接口

- 取消已同步的发票数据

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| IIS001 | 发票同步失败 | 返回错误消息 |
| IIS002 | 发票明细处理失败 | 返回错误消息 |
| IIS003 | 台账保存失败 | 返回错误消息 |
| IIS004 | 取消同步失败 | 返回错误消息 |

---

## Service 层实现规范

```java
public void sysSKJXFPData(Dt_InputInvoice invoiceVO) throws Exception {
    // 1. 组装进项发票数据
    LOGGER.error("进项发票数据组装");

    // 2. 处理一般进项发票子表
    if(!CollectionUtils.isEmpty(invoiceVO.getDt_input_invoice_detailList())) {
        Object bodyjson = buildInvoiceDetailJson(invoiceVO.getDt_input_invoice_detailList());
        String saveonlytobillcenterPostjson = buildInputInvoiceJson(invoiceVO, bodyjson);
        // 调用税务接口保存发票明细
    }

    // 3. 处理建筑服务发票
    if(!CollectionUtils.isEmpty(invoiceVO.getDt_input_invoice_buildList())) {
        // 处理建筑服务发票逻辑
    }

    // 4. 处理货物运输服务发票
    if(!CollectionUtils.isEmpty(invoiceVO.getDt_input_invoice_goodsList())) {
        // 处理货物运输服务发票逻辑
    }

    // 5. 处理航空运输电子客票
    if(!CollectionUtils.isEmpty(invoiceVO.getDt_input_invoice_planeList())) {
        // 处理航空运输电子客票逻辑
    }

    // 6. 处理铁路电子客票
    if(!CollectionUtils.isEmpty(invoiceVO.getDt_input_invoice_trainList())) {
        // 处理铁路电子客票逻辑
    }

    // 7. 处理机动车销售统一发票
    if(!CollectionUtils.isEmpty(invoiceVO.getDt_input_invoice_vehicleList())) {
        // 处理机动车销售统一发票逻辑
    }
}

public void cancelSysSKJXFPData(Dt_InputInvoice invoiceVO) throws Exception {
    // 1. 调用取消同步接口
    // 2. 更新发票状态
}
```

---

## 发票类型转换

使用 InvoiceTypeConverter 工具类进行发票类型转换：

```java
public static String getInvoiceCodeSafely(Object fplx_name, String defaultValue) {
    if (fplx_name == null) return defaultValue;
    String name = fplx_name.toString();
    switch (name) {
        case "增值税专用发票":
        case "增值税普通发票":
        case "增值税电子普通发票":
        case "电子发票（普通发票）":
        case "数电票（普通发票）":
            return "024";
        case "机动车销售统一发票":
            return "011";
        case "增值税电子专用发票":
        case "电子发票（增值税专用发票）":
        case "数电票（增值税专用发票）":
            return "036";
        default:
            return defaultValue;
    }
}
```

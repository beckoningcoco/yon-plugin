---
name: yonbip-c-exp-integration
description: 费控系统单据与发票集成能力。提供费控单据（通用报销单、个人付款单、差旅费报销单、还款单、出差申请单、通用申请单、出差申请变更单和通用申请变更单等）与第三方系统的双向集成能力，包括单据录入、单据推送、结算状态回写；以及费控发票OCR识别和三方发票系统验真服务，支持增值税发票、火车票、机票、数电票等多种类型。适用于需要处理费控单据集成、发票识别验真、费控系统与第三方系统数据打通的场景。
---

# 费控系统集成 Skill (FEKS)

## 功能概述

本 skill 提供费控系统的两大核心能力：

| 能力 | 说明 |
|------|------|
| **单据集成** | 费控单据与第三方系统双向集成 |
| **发票服务** | 发票OCR识别和三方验真 |

---

## 一、单据集成 (exps_integ_skill)

### 1.1 接口说明

| 接口 | 方法 | 描述 |
|------|------|------|
| `/externalpaymentbill/save` | POST | 保存/修改费控单据 |
| `/externalpaymentbill/batchsave` | POST | 批量保存 |
| `/costControl/saveBill` | POST | 推送到第三方 |
| `/costControl/updateBillsStatus` | POST | 结算状态回写 |
| `/costControl/queryBill` | POST | 查询单据状态 |

### 1.2 整体集成流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        三方系统                                      │
│                                                                      │
│  ①单据录入 ───────────────────────────────────────────▶ BIP费控系统    │
│     /save                                                   │
│     状态回写: billStatus="CREATED"                               │
│            │                                                │
│            ▼                                                │
│  ②提交 ───────────────────────────────────────────────▶ 审核中     │
│     状态回写: billStatus="SUBMIT"                                │
│            │                                                │
│            ▼                                                │
│  ③审核通过 ───────────────────────────────────────────▶ 推送三方    │
│     状态回写: billStatus="APPROVED"                             │
│            │                                                │
│            ▼                                                │
│  ④结算完成 ───────────────────────────────────────────▶ 回写状态   │
│     状态回写: payStatus="SUCCESS"                                │
│            │                                                │
│            ▼                                                │
│  ⑤生成凭证 ───────────────────────────────────────────▶ 回调凭证    │
│     状态回写: voucherStatus="SUCCESS"                         │
└────────────────────────────────────────────────────────────────────┘
```

### 1.3 逆流程

```
审批拒绝 → billStatus="REJECTED" → 回调 /costControl/billReject → 用户修改 → 重新提交
结算止付 → payStatus="NOT" → 回调 /costControl/billSettle
```

### 1.4 状态对照（统一编码体系）

> **重要**：本技能统一使用字符串编码表示状态。下表同时列出BIP内部数据库数字编码，供数据转换时参考。

#### 单据状态 billStatus

| 阶段 | 统一编码（回调参数） | BIP内部数字编码 | 说明 |
|------|---------------------|----------------|------|
| 待提交 | `CREATED` | 1 | 单据已创建未提交 |
| 已提交 | `SUBMIT` | - | 单据已提交待审核 |
| 审核中 | `APPROVING` | 0 | 审批进行中 |
| 审核通过 | `APPROVED` | 2 | 审批完成 |
| 审批拒绝 | `REJECTED` | - | 审批不通过 |

#### 结算状态 payStatus

| 阶段 | 统一编码（回调参数） | BIP内部数字编码 | 说明 |
|------|---------------------|----------------|------|
| 结算成功 | `SUCCESS` | 0 | 付款完成 |
| 部分成功 | `PART` | 1 | 部分结算 |
| 结算失败 | `FAIL` | 2 | 付款失败 |
| 结算中止 | `NOT` | 3 | 止付 |

#### 凭证状态 voucherStatus

| 阶段 | 统一编码（回调参数） | 说明 |
|------|---------------------|------|
| 待生成 | `WAIT` | 尚未生成凭证 |
| 生成成功 | `SUCCESS` | 凭证已生成 |
| 生成失败 | `FAIL` | 凭证生成异常 |

### 1.5 单据录入字段

**⚠️ 重要：字段映射从OpenAPI获取**

调用skill技能`iuap-c-openapi-integration`查询BIP保存接口的字段定义，获取完整的字段列表、类型和必填信息。

如果OpenAPI查询不到，则调用skill技能`iuap-c-metadata-info`查询单据元数据作为补充。

**通用报销单保存接口**: `/yonbip/znbz/rbsm/api/bill/expensebill/save`

**请求格式**（OpenAPI标准）:
```json
{
  "data": {
    "resubmitCheckKey": "幂等校验key(UUID)",
    "code": "单据编号",
    "status": 1,
    "bustype": Long,
    "pk_handlepsn": "报销人ID",
    "caccountorg": "会计主体ID",
    "nexpensemny": BigDecimal,
    "nsummny": BigDecimal,
    "dcostdate": "yyyy-MM-dd",
    "expensebillbs": [...],
    "expsettleinfos": [...],
    "expapportions": [...]
  }
}
```

**OpenAPI响应格式**:
```json
{
  "code": "00000",
  "message": "操作成功",
  "data": {
    "id": "单据ID"
  }
}
```

> 成功码为 `"00000"`，非 `"200"`

**子表**: `expensebillbs`(报销明细), `expsettleinfos`(结算信息), `expapportions`(费用分摊)

### 1.6 状态回写接口清单和代码生成方式

**在单据保存、提交、审核使用调用skill技能`iuap-c-server-codegen`的`rule规则`生成**

**在付款\支付完成、生成凭证调用skill技能`iuap-c-server-codegen`的`事件监听`的方式生成**

| 单据动作 | 回调接口 | 参数 | 触发方式 |
|------|------|------|------|
| 单据保存 | `/costControl/billCreated` | bipBillId, billNo, billStatus | rule规则触发 |
| 单据提交 | `/costControl/billSubmit` | bipBillId, billStatus | rule规则触发 |
| 单据审批 | `/costControl/billAudit` | bipBillId, billStatus | rule规则触发 |
| 审批拒绝 | `/costControl/billReject` | bipBillId, billStatus, rejectReason | rule规则触发 |
| 结算完成 | `/costControl/billSettle` | bipBillId, settlementId, payStatus, settleTime | 事件监听触发 |
| 生成凭证 | `/costControl/voucherCreate` | bipBillId, voucherId, voucherStatus | 事件监听触发 |

### 1.7 数据持久化方式

**✅ 使用的方式：**

- **单据保存/修改**：调用skill技能`iuap-c-openapi-integration`，通过OpenAPI调用BIP保存接口
  - 保存接口：`/yonbip/znbz/rbsm/api/bill/expensebill/save`
  - 认证方式：AccessToken（通过appKey/appSecret获取，支持多租户）
  - 幂等校验：请求中携带 `resubmitCheckKey`
  - 响应成功码：`"00000"`
- **查询操作**：skill技能`iuap-c-server-codegen`的IBillQueryRepository - 用于查询 BIP 档案数据
  - 幂等性判断：通过 `IBillQueryRepository.queryMapBySchema` 查询已存在单据
- **更新操作**：skill技能`iuap-c-server-codegen`的IYmsJdbcApi - 用于执行 SQL 更新、插入、删除
- **字段定义获取**：优先调用skill技能`iuap-c-openapi-integration`从OpenAPI获取，补充使用skill技能`iuap-c-metadata-info`

**❌ 不使用的方式：**

- **MyBatis Mapper**：不创建 Mapper 接口和 XML 文件
- **iDoOpenApi**：不使用 `iDoOpenApi.postWithParams`，统一使用OpenAPI标准调用方式

### 1.8 rule规则开发方式

**非常重要** 调用skill技能`iuap-c-server-codegen`进行开发

### 1.9 事件监听开发方式

**非常重要** 调用skill技能`iuap-c-server-codegen`进行开发

---

## 二、发票服务 (invoice-ocr-verify)

### 2.1 核心功能

| 功能 | 接口 | 描述 |
|------|------|------|
| 发票OCR识别 | `/invoice/parse` | 识别发票图片/PDF |
| 发票验真 | `/invoice/invoiceVerfity` | 验证发票真伪 |

### 2.2 支持的发票类型

| 类型 | code | invoiceCode | 说明 |
|------|------|-------------|------|
| 增值税专用发票 | s | 10100 | 增值税类 |
| 增值税电子普通发票 | p | 10102 | 增值税类 |
| 增值税普通发票 | c | 10101 | 增值税类 |
| 增值税电子专用发票 | b | 10106 | 增值税类 |
| 增值税普通发票(卷式) | r | 10103 | 增值税类 |
| 机动车销售统一发票 | j | 10104 | 机动车类 |
| 二手车销售统一发票 | u | 10105 | 二手车类 |
| 数电专票(电子) | bs | 31 | 数电票 |
| 数电普票(电子) | pc | 32 | 数电票 |
| 数电票(航空) | hk | 35 | 数电票 |
| 货物运输发票 | h | 02 | 其他 |
| 车辆通行费 | tx | 10507 | 交通类 |
| 汽车票 | qc | 10505 | 交通类 |
| 火车票 | hc | 10503 | 交通类 |
| 机票行程单 | fj/lj | 10506 | 交通类 |
| 出租车票 | cz | 10500 | 交通类 |
| 定额发票 | de | 10200 | 其他 |
| 通用机打发票 | jd | 10400 | 其他 |

完整发票类型和验真映射详见 [发票类型说明](references/invoice_types.md)

### 2.3 OCR识别流程

```
1. 获取纳税人识别号 (getTaxNum)
2. 构造请求参数 (fileBase64, fileName, taxNum)
3. 调用航信OCR接口 (InterfaceCode=recognizeBill)
4. 根据返回的invoiceLine类型路由到对应工厂类转换
5. 返回识别结果
```

### 2.4 发票验真流程

```
1. 获取BIP发票信息
2. 根据发票类型确定验真方式:
   - 04/10/11/14: 使用校验码后6位
   - 01/03/08/15/85/86: 使用不含税金额
   - 其他: 使用价税合计
3. 调用航信验真接口 (InterfaceCode=invoiceCheck)
4. 查验成功后可选择入池
5. 返回验真结果
```

### 2.5 工厂模式

通过工厂模式支持多种发票类型转换，基类 `AbstractTransInvoiceFactory`：

| 实现类 | Spring Bean名 | 用途 |
|--------|--------------|------|
| VatTransInvoiceFactoryImpl | VatTransTools | 增值税发票转换 |
| TrainInvoiceFactoryImpl | trainTransTools | 火车票转换 |
| AirInvoiceFactoryImpl | airTransTools | 机票行程单转换 |
| TaxiFactoryImpl | taxiTransTools | 出租车票转换 |
| BusTicketFactoryImpl | busTransTools | 汽车票转换 |
| QuotaFactoryImpl | quotaTransTools | 定额发票转换 |
| TollInvoiceFactoryImpl | tollTransTools | 通行费转换 |
| MotorVehicleFactoryImpl | motorVehicleTransTools | 机动车转换 |
| UsedMotorVehicleFactoryImpl | usedMotorTransTools | 二手车转换 |
| MachineInvoiceFactoryImpl | machineTransTools | 通用机打发票转换 |
| GjdpFactoryImpl | gjdpTransTools | 国际发票转换 |

### 2.6 代码位置

- **Service接口**: `com.yonyou.ucf.mdf.invoice.service.InvoiceService`
- **Service实现**: `com.yonyou.ucf.mdf.invoice.service.impl.InvoiceServiceImpl`
- **Controller**: `com.yonyou.ucf.mdf.invoice.controller.InvoiceController`
- **工厂基类**: `com.yonyou.ucf.mdf.invoice.factory.AbstractTransInvoiceFactory`

---

## 三、参考文档

### 单据集成
- [单据录入规范](references/bill_input_spec.md) - 单据录入详细规范
- [字段映射](references/field_mapping.md) - 字段映射说明
- [单据API规范](references/api_spec.md) - 第三方API规范
- [集成流程图](references/integration_flowchart.md) - 整体集成流程（含逆流程、回调清单）

### 发票服务
- [发票服务详细规范](references/invoice_service_spec.md) - OCR/验真完整流程、请求示例、错误处理
- [发票类型说明](references/invoice_types.md) - 发票类型详细说明（OCR + 验真映射）
- [工厂实现示例](references/factory_examples.md) - 工厂实现示例
- [三方API说明](references/third_party_api.md) - 航信OCR/验真API
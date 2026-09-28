---
name: yonbip-c-wms-integration
description: 提供 WMS 集成场景（销售退货、销售发货、其他出入库、调拨订单、出库申请、采购入库、委外入库）与第三方系统集成的通用能力，支持数据查询、字段转换、三方接口调用与响应解析的标准化对接
triggers:
  - 销售退货
  - 销售退货WMS集成
  - 销售退货推送WMS
  - 退货单WMS同步
  - 销售发货
  - 销售发货集成
  - 销售出库WMS
  - 发货单推送WMS
  - 销售发货同步
  - 其他出库WMS集成
  - 其他入库WMS集成
  - OthOutRecord WMS
  - OthInRecord WMS
  - 出入库WMS推送
  - 调拨订单集成
  - 调拨出库
  - 调拨入库
  - 库内调拨
  - 调拨同步
  - 出库申请集成
  - 出库申请推送WMS
  - 领料单WMS
  - 出库申请同步
  - 采购入库
  - 采购入库推送
  - 采购入库同步
  - 委外入库
  - 委外入库推送
  - 委外入库同步
  - WMS集成
  - 三方集成
---

# WMS 三方集成技能

## 业务概述

本技能提供 7 个 WMS 业务场景与第三方系统的通用集成能力。

### 场景路由

根据用户请求的业务域，路由到对应的场景参数：

| 场景 | 触发关键词 | 路由标识 | 特有规范 |
|------|-----------|----------|----------|
| 销售退货 | 销售退货、退货单、WMS | `sale_return` | delivery_spec |
| 销售发货 | 销售发货、发货单、销售出库 | `sale_delivery` | sale_delivery_spec |
| 其他出入库 | 其他出库、其他入库、出入库WMS | `oth_inout` | othout_spec + othin_spec |
| 调拨订单 | 调拨订单、调拨出库、调拨入库、库内调拨 | `transfer_order` | transfer_spec |
| 出库申请 | 出库申请、领料单、PickingRequisition | `picking_req` | 多文件拆分工 |
| 采购入库 | 采购入库 | `pur_in` | 无 |
| 委外入库 | 委外入库 | `subcontract_in` | 无 |

### 数据访问方式

所有场景均使用 skill `yonbip-c-openapi-integration`（BIP REST API）查询 BIP 数据。

### 核心流程

> 所有 7 个场景共享同一步骤

1. **查询 BIP 数据**：从 BIP 系统查询对应业务域数据
2. **字段转换**：将 BIP 字段转换为第三方目标格式
3. **调用三方接口**：推送数据至第三方系统
4. **解析响应并回写状态**：解析响应并回写 BIP 状态

---

## 域参数表

生成代码时根据 `路由标识` 替换以下参数：

| 参数 | sale_return | sale_delivery | oth_inout | transfer_order | picking_req | pur_in | subcontract_in |
|------|--------------|---------------|-----------|-----------------|-------------|--------|-----------------|
| 主表特征组 | `saleReturnDefineCharacter` | `deliveryDefineCharacter` | `othInOutDefineCharacter` | `transferOrderDefineCharacter` | `pickingReqDefineCharacter` | `purInRecordDefineCharacter` | `subcontractInDefineCharacter` |
| 子表特征组 | `saleReturnDetailCharacteristics` | `deliveryDetailDefineCharacter` | 无 | `transferOrderDetailsDefineCharacter` | `pickingReqDetailsDefineCharacter` | `purInRecordsDefineCharacter` | `subcontractInDetailsDefineCharacter` |
| BIP API 路径 | `/scm/salereturn/detail` | `/scm/saledelivery/detail` | `/scm/othinout/detail` | `/scm/transferorder/detail` | `/scm/pickingrequisition/detail` | `/scm/purinrecord/detail` | `/scm/subcontractin/detail` |
| Controller 路由 | `/salereturn` | `/saledelivery` | `/othinout` | `/transferorder` | `/pickingrequisition` | `/purinrecord` | `/subcontractin` |
| Service 命名前缀 | SaleReturn | SaleDelivery | OthInOut | TransferOrder | PickingReq | PurInRecord | SubcontractIn |

### 特有规范文件

部��场景有单独的特有规范文件：

| 场景 | 特有规范文件 | 内容 |
|------|------------|------|
| 销售退货 | [delivery_specification.md](./reference/delivery_specification.md) | 退货单据类型映射、特征组字段 |
| 销售发货 | [sale_delivery_specification.md](./reference/sale_delivery_specification.md) | 发货单字段映射、交易类型 |
| 其他出库 | [othout_specification.md](./reference/othout_specification.md) | 出库单据类型（OUB0601/INB0602） |
| 其他入库 | [othin_specification.md](./reference/othin_specification.md) | 入库单据类型（INB0601/OUB0602） |
| 调拨订单 | [transfer_specification.md](./reference/transfer_specification.md) | 调拨单据类型（OUB0701/INB0701） |
| 出库申请 | 多文件拆分 | query_spec + convert_spec + api_spec + parse_spec |

### 特征字段翻译

> 特征字段翻译能力统一参考 `<skill-base>/reference/char_translation_spec.md`

### 场景识别与策略选择

技能根据用户输入智能识别场景：

```
用户输入分析
    │
    ├── 提供了厂商集成文档（包含接口地址、字段映射等）
    │   └──▶ 通用场景
    │       ├──▶ 读取厂商文档（用户提供的Excel/PDF/Word等）
    │       ├──▶ 读取对应场景的特有规范 + pub_specification.md
    │       └──▶ 直接基于用户文档生成代码，不参考项目中其他厂商实现
    │
    └── 未提供厂商文档
        └──▶ 托底场景
            └──▶ 读取 td_specification.md
```

---

## 检查清单

- [ ] 确认用户请求的业务域，使用对应的域参数
- [ ] 确认业务流程仅为"查询 → 字段转换 → 调用三方 → 解析响应"
- [ ] 三方接口地址、字段映射从外部 Excel/需求动态读取
- [ ] 禁止硬编码任何厂商特定逻辑
- [ ] 托底策略可配置启用/禁用
- [ ] 特征字段动态识别，不预置固定字段
# 整体架构

## 概述

本文件描述销售发票与第三方税务系统集成的整体架构。

## 核心场景

| 场景 | 说明 |
|------|------|
| 蓝票开具 | 正向开具电子发票 |
| 红冲 | 负向冲销（红字发票） |

## 业务流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    完整业务流程                              │
├─────────────────────────────────────────────────────────────────┤
│  1. 接收 invoiceId                                     │
│  2. 调用 iuap-c-openapi-integration 查询BIP数据         │
│  3. 字段映射转换（reference/02_field_mapping.md）     │
│  4. 特征字段翻译（reference/03_character_translation）│
│  5. 三方接口调用                                     │
│  6. 响应解析                                       │
│  7. 结果回写                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 关键字段

### 主表字段

| 字段 | 说明 |
|------|------|
| id | BIP发票ID |
| code | 发票单据编号 |
| invDirection | 单据方向：1-红票 2-蓝票 |
| invoiceType | 发票类型：10-数电专票 11-数电普票 |
| invAgentName | 购方名称 |
| invAgentTaxNo | 购方税号 |
| saleInvoiceDefineCharacter | 销售发票特征组 |
| saleInvoiceDetails | 销售发票明细 |

### 明细字段

| 字段 | 说明 |
|------|------|
| lineno | 行号 |
| productCode | 商品编码 |
| productName | 商品名称 |
| qty | 数量 |
| oriMoney | 原币金额 |
| oriTax | 原币税额 |
| oriSum | 原币价税合计 |
| taxRate | 税率 |

## MVC分层架构

```
┌─────────────────────────────────────┐
│      Controller 层                   │  ← 接收 HTTP 请求
├─────────────────────────────────────┤
│      Service 层                     │  ← 业务逻辑处理 + 事务管理
├─────────────────────────────────────┤
│   Repository / API 层               │  ← 数据访问/外部调用
├─────────────────────────────────────┤
│      Model层                        │  ← VO/DTO/Entity
└─────────────────────────────────────┘
```

## 禁止行为

- ❌ Controller 直接调用 Repository
- ❌ 跨层调用
- ❌ 在 Controller 中编写业务逻辑
- ❌ 使用 MyBatis Mapper

## 引用关系

- 字段映射：reference/02_field_mapping.md
- 特征翻译：reference/03_character_translation.md
- MVC生成：reference/04_mvc_generation.md
- Rule扩展：reference/05_rule_extension.md
- 蓝票特有：reference/06_blue_only.md
- 红冲特有：reference/07_red_only.md
- 托底：reference/08_td_fallback.md
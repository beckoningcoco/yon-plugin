---
name: yonbip-c-srm-integration
description: 提供委外业务（委外订单/委外入库）与第三方SRM系统集成的通用能力。通过 billType 参数区分业务类型：order-委外订单、in-委外入库。支持数据查询、字段转换、三方接口调用与响应解析的标准化对接。
triggers:
  - 委外订单
  - 委外入库
  - 订单推送
  - 入库推送
  - 三方集成
  - SRM集成
---

# 委外SRM三方集成技能

## 业务概述

本技能提供委外业务（委外订单/委外入库）与第三方SRM系统的通用集成能力，通过 billType 参数区分业务类型，支持将 BIP 系统中的委外数据推送至第三方 SRM 系统。

### 数据访问方式

所有场景均使用 skill `yonbip-c-openapi-integration`（BIP REST API）查询 BIP 数据。

### 核心能力

> **⚠️ 业务流程范围**：仅包含以下 4 个步骤

1. **查询 BIP 委外数据**：根据 billType 查询委外订单或委外入库数据
2. **字段转换**：将 BIP 字段转换为第三方目标格式
3. **调用三方接口**：推送数据至第三方 SRM 系统
4. **解析响应并回写**：解析响应并回写状态到 BIP

### billType 参数说明

| 值 | 说明 | BIP API |
|----|------|--------|
| order | 委外订单 | iuap-api-gateway/yonbip/mfg/subcontractorder/detail |
| in | 委外入库 | iuap-api-gateway/yonbip/scm/osminrecord/detail |

---

## 架构分层与文件职责

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              外层 SKILL.md                                      │
│  职责：业务概述 | 流程图 | 场景识别与路由规则 | 核心组件清单 | 检查清单          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    公共能力层 (Pub)                                              │
│  pub_specification.md【委外订单/委外入库共用】                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    托底层 (Fallback)                                            │
│  td_specification.md                                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 完整流程架构

```
┌───────────────────���──────────────────────────────────────────────────────────────────┐
│                                    完整流程                                         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  1.入参处理  │ -> │  2.BIP查询   │ -> │  3.字段映射  │ -> │  4.特征处理 │ │
│  │  InputParse │    │   QueryBIP  │    │ FieldMapping│    │  CharProcess│ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                   │                   │                   │                │
│         v                   v                   v                   v                │
│  billType路由         查询BIP委外         按映射关系转        参照/枚举/自       │
│  参数验证           订单/入库           换目标字段          定义档案翻译          │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  5.三方鉴权  │ -> │  6.三方调用  │ -> │  7.响应解析  │ -> │  8.结果回写 │ │
│  │  AuthThird │    │ InvokeThird │    │ ResponseParse│    │ ResultWrite │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                   │                   │                   │                │
│         v                   v                   v                   v                │
│  获取Token/           调用第三方         解析返回结果         更新BIP委外         │
│  签名加密              接口               状态/数据            单状态            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件清单

### 特征字段翻译

> 特征字段翻译能力统一参考 `<skill-base>/reference/char_translation_spec.md`

### 公共组件（pub_specification.md）

| 组件 | 说明 | MVC层 |
|------|------|-------|
| SubcontractIntegrateRequest | 入参DTO（含billType） | Model |
| SubcontractQueryService | BIP查询服务接口 | Service |
| SubcontractOpenApiQueryService | BIP查询服务实现 | Service |
| SubcontractFieldMapper | 字段映射器（按billType分别实现） | Service |
| CharacterFieldExtractor | 特征字段处理器 | Service |
| ThirdPartyAuthService | 三方鉴权接口 | Service |
| ThirdPartySubcontractService | 三方委外接口（按billType分别实现） | Service |
| ThirdApiResponse | 响应DTO | Model |
| ResponseParser | 响应解析器 | Service |
| SubcontractResultWriteService | 结果回写服务 | Service |

### 组件命名规范

| billType | QueryService | FieldMapper | ThirdPartyService | ResultWriteService |
|----------|--------------|-------------|------------------|-------------------|
| order | SubcontractOrderQueryService | SubcontractOrderFieldMapper | ThirdPartySubcontractOrderService | SubcontractOrderResultWriteService |
| in | SubcontractInQueryService | SubcontractInFieldMapper | ThirdPartySubcontractInService | SubcontractInResultWriteService |

---

## 特征字段说明

> **⚠️ 重要**：委外业务的特征字段遵循 BIP 规范

### 订单特征字段

- 主表特征组：`defineDts`
- 明细特征组：`productDefineDts`

### 入库特征字段

- 主表特征组：`subcontractInDefineCharacter`
- 明细特征组：`subcontractInDetailsDefineCharacter`

> **⚠️ 通用逻辑**：特征字段翻译能力请参考 [char_translation_spec](../_公共规范/char_translation.md)

---

## 检查清单

- [ ] 确认业务流程仅为"查询 -> 字段转换 -> 调用三方 -> 解析响应"
- [ ] billType 参数正确路由到对应的查询服务和字段映射器
- [ ] 三方接口地址、字段映射从外部Excel/需求动态读取
- [ ] 特征字段翻译引用公共基础文档
- [ ] 禁止硬编码任何厂商特定逻辑
- [ ] 托底策略可配置启用/禁用
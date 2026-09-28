---
name: yonbip-c-arap-integration
description: 提供应收应付单据（应收发票、应付发票、收款单、付款单）与第三方系统的双向集成能力。支持单据录入（第三方→BIP）和单据推送（BIP→第三方）两大场景。当需要处理应收应付单据集成时触发此技能。
type: agent
instructions: |
  根据用户需求判断单据类型和操作方向，精准调用 BIP 技能完成集成。

  ### BIP 框架规范
  1. 数据持久化：查询使用 IBillQueryRepository，更新使用 IYmsJdbcApi，不使用 MyBatis
  2. MVC分层：Controller→Service→Repository/API，禁止跨层调用
  3. 接口调用：使用 BIP OpenAPI 进行数据操作
  4. **⚠️ 重要**：BIP应收应付的单据状态变更同步到三方系统走**标准MVC架构**（Controller→Service），**不是事件监听器**。由BIP前端按钮或业务流触发Controller接口，Service内部查询BIP单据详情→字段映射→调用三方回调接口

---

# 技能元信息（始终加载）

## 技能触发条件

### 单据录入场景（第三方 → BIP）

| 关键词 | 触发场景          | 单据类型 | **⚠️重要**：元数据名称 |
|--------|---------------|-------|------------------------|
| 应收发票保存/提交/录入 | 第三方录入应收发票到BIP | 应收发票 | 应收结算清单基本信息 |
| 应付发票保存/提交/录入 | 第三方录入应付发票到BIP | 应付发票 | 应付结算清单基本信息 |
| 收款单保存/提交/录入 | 第三方录入收款单到BIP  | 收款单 | 收款单基本信息 |
| 付款单保存/提交/录入 | 第三方录入付款单到BIP  | 付款单 | 付款单基本信息 |
| 付款单保存/提交/审核/删除 | 付款单状态变化的业务处理  | 付款单 | 付款单基本信息 |

### 单据推送场景（BIP → 第三方）

| 关键词 | 触发场景 | 单据类型 |
|--------|---------|---------|
| 付款单推送/付款单集成 | 推送付款单到第三方财务系统 | 付款单 |
| 付款单状态回写/状态同步 | BIP付款单状态变更后同步到第三方系统（标准MVC架构） | 付款单 |
| 发票推送金蝶/推送金蝶发票 | 推送应收发票到金蝶税务云 | 应收发票 |
| 发票状态检查 | 检查金蝶发票开具状态 | 应收发票 |
| 金蝶发票回调 | 接收金蝶开票结果 | 应收发票 |
| 发票红冲 | 金蝶发票红冲操作 | 应收发票 |

## 场景路由规则

> **⚠️ 重要**：根据用户需求判断单据类型和操作方向，自动路由到对应的规范文件

### 单据录入路由

| 单据类型 | 路由目标 | 触发条件 |
|-------|---------|---------|
| 应收发票 | reference/in_receivable_spec.md | 关键词包含"应收发票" |
| 应付发票 | reference/in_payable_spec.md | 关键词包含"应付发票" |
| 收款单 | reference/in_collection_spec.md | 关键词包含"收款单" |
| 付款单 | reference/in_payment_spec.md | 关键词包含"付款单"且包含"保存/提交/录入" |

### 单据推送路由

| 单据类型 | 路由目标 | 触发条件 |
|---------|---------|---------|
| 付款单推送 | reference/payment_push_spec.md | 关键词包含"付款单推送/付款单集成" |
| 发票推送金蝶 | reference/kd_invoice_push_spec.md | 关键词包含"金蝶/推送金蝶发票/三方发票" |

### 托底路由

| 场景 | 路由目标 | 触发条件 |
|------|---------|---------|
| 托底执行 | reference/td_specification.md | fallbackEnabled=true 或无厂商配置 |

## 引用文件清单

> **📌 分层加载策略**：根据场景按需加载，无需一次性加载所有文件

### 必须引用（始终可用）
| 文件 | 路径 | 用途 |
|------|------|------|
| pub_specification.md | ./reference/pub_specification.md | 财务单据共用逻辑 |

### 按需引用（单据录入场景）
| 文件 | 路径 | 触发条件 |
|------|------|---------|
| in_receivable_spec.md | ./reference/in_receivable_spec.md | 应收发票录入 |
| in_payable_spec.md | ./reference/in_payable_spec.md | 应付发票录入 |
| in_collection_spec.md | ./reference/in_collection_spec.md | 收款单录入 |
| in_payment_spec.md | ./reference/in_payment_spec.md | 付款单录入 |

### 按需引用（单据推送场景）
| 文件 | 路径 | 触发条件 |
|------|------|---------|
| payment_push_spec.md | ./reference/payment_push_spec.md | 付款单推送 |
| kd_invoice_push_spec.md | ./reference/kd_invoice_push_spec.md | 发票推送金蝶 |

### 按需引用（公共规范）
| 文件 | 路径 | 触发条件 |
|------|------|---------|
| char_translation_spec.md | ../_公共规范/char_translation.md | 处理特征字段时 |
| mvc_architecture.md | ../_公共规范/mvc_architecture.md | 需要 MVC 规范时 |
| data_persistence.md | ../_公共规范/data_persistence.md | 需要数据持久化规范时 |

---

# 财务单据集成技能

## 业务概述

本技能提供财务单据与第三方系统的双向集成能力，基于BIP 平台架构实现。

### 核心能力

#### 1. 单据录入（第三方 → BIP）

**应收应付管理**
- **应收发票录入**：接收第三方系统传入的应收发票数据，保存并提交审批，提交、审批通过的单据状态回写给三方系统
- **应付发票录入**：接收第三方系统传入的应付发票数据，保存并提交审批，提交、审批通过的单据状态回写给三方系统
- **收款单录入**：接收第三方系统传入的收款单数据，保存并提交审批，提交、审批通过的单据状态回写给三方系统
- **付款单录入**：接收第三方系统传入的付款单数据，保存并提交审批，提交、审批通过的单据状态回写给三方系统

#### 2. 单据推送

**付款单推送**
- 将 BIP 付款单推送到第三方财务系统
- 接收第三方系统回写的付款状态
- 支持数据转换和字段映射

**发票推送金蝶**
- 将应收发票推送到金蝶税务云系统
- 支持蓝票开具和红票冲销
- 检查发票开具状态
- 接收金蝶系统回传的开票结果

### 3.单据状态回写三方系统（BIP → 第三方）
- **应收发票状态回写**：应收发票提交、审批通过的单据状态回写给三方系统
- **应付发票状态回写**：应付发票提交、审批通过的单据状态回写给三方系统
- **收款单状态回写**：收款单提交、审批通过的单据状态回写给三方系统
- **付款单状态回写**：付款单提交、审批通过的单据状态回写给三方系统

### ❌ 禁止生成的场景

- 单据与业务单据（销售订单、采购订单）的关联处理
- 非财务领域的单据集成
- 跨领域的复杂业务流程

---

## 架构分层与文件职责

| 层级 | 文件 | 职责 | 引用 |
|------|------|------|------|
| 外层 | SKILL.md | 业务概述\|场景识别\|组件清单 | 始终加载 |
| 公共层 | pub_specification.md | 共用逻辑\|接口规范 | 始终加载 |
| 场景层 | in_receivable_spec.md 等 | 具体单据场景实现 | 按需加载 |
| 托底层 | td_specification.md | 托底执行 | 按需加载 |

---

## BIP 框架技术栈

> **📌 引用规范**：以下 BIP 框架规范详细说明请参考 _公共规范/ 目录

### 1. MVC 分层架构

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

**调用链：** `Controller → Service → Repository/API → Database/External System`

**禁止行为：**
- ❌ Controller 直接调用 Repository
- ❌ 跨层调用
- ❌ 在 Controller 中编写业务逻辑
- ❌ 在 Repository 层管理事务

### 2. 数据持久化方式

**✅ 使用的方式：**
- **查询操作**：`IBillQueryRepository` - 用于查询 BIP 档案数据
- **更新操作**：`IYmsJdbcApi` - 用于执行 SQL 更新、插入、删除
- **BIP API 调用**：skill技能`iuap-c-openapi-integration `调用OpenAPI功能  - 用于调用 BIP OpenAPI

**❌ 不使用的方式：**
- **MyBatis Mapper**：不创建 Mapper 接口和 XML 文件

### 3. BIP 接口调用规范

#### 单据录入接口（第三方 → BIP）

| 单据类型 | 保存接口 | 提交接口 | 保存并提交接口 | 查询接口 | 鉴权方式 |
|---------|---------|---------|---------|
| 应收发票 | POST /iuap-api-gateway/yonbip/EFI/receivable/save | POST /iuap-api-gateway/yonbip/EFI/receivable/submit | POST /iuap-api-gateway/yonbip/EFI/receivable/detail | POST /iuap-api-gateway/yonbip/EFI/receivable/saveandsubmit | BIP OpenAPI标准鉴权 |
| 应付发票 | POST /iuap-api-gateway/yonbip/EFI/payable/save | POST /iuap-api-gateway/yonbip/EFI/payable/submit | POST /iuap-api-gateway/yonbip/EFI/payable/detail |POST /iuap-api-gateway/yonbip/EFI/payable/saveandsubmit | BIP OpenAPI标准鉴权 |
| 收款单 | POST /iuap-api-gateway/yonbip/EFI/collection/save | POST /iuap-api-gateway/yonbip/EFI/collection/submit | POST //iuap-api-gatewayyonbip/EFI/collection/detail | POST /iuap-api-gateway/yonbip/EFI/collection/saveandsubmit | BIP OpenAPI标准鉴权 |
| 付款单 | POST /iuap-api-gateway/yonbip/EFI/payment/save | POST /iuap-api-gateway/yonbip/EFI/payment/submit | POST /iuap-api-gateway/yonbip/EFI/payment/detail | POST /iuap-api-gateway/yonbip/EFI/payment/saveandsubmit | BIP OpenAPI标准鉴权 |

#### 单据推送接口（BIP → 第三方）

| 场景 | 说明 |
|------|------|
| 付款单推送 | 查询 BIP 付款单后推送到第三方财务系统 |
| 发票推送金蝶 | 查询 BIP 应收发票后推送到金蝶税务云 |

---

## skill 技能调用规则

| 任务 | 触发条件 | 调用的 skill                                      |
|------|---------|------------------------------------------------|
| BIP 查询 | 需要查询 BIP 单据数据 | iuap-c-openapi-integration                                 |
| 档案参照 | 特征字段类型为 ref |  iuap-c-metadata-info |
| 枚举翻译 | 特征字段类型为 enum | char_translation_spec.md 固定写法                  |

### 详细调用规则

#### 1. BIP 查询必须调用 OpenAPI功能
- **触发条件**：需要查询 BIP 单据数据时
- **强制要求**：禁止手动编写 BIP API 调用代码，必须调用 skill技能`iuap-c-openapi-integration `调用OpenAPI功能 动态生成
- ❌ 错误示例：手动编写 HttpClient/RestTemplate 调用代码
- ✅ 正确示例：调用skill技能`iuap-c-openapi-integration `调用OpenAPI功能 获取动态生成的调用代码

#### 2. 单据保存与提交流程（单据录入场景）
- **触发条件**：第三方系统调用本系统保存单据
- **强制要求** 直接走保存并提交的OpenAPI 接口
- **流程**：接收数据 → 数据转换 → 保存单据 → 提交审批

#### 3. 单据推送流程（单据推送场景）
- **触发条件**：需要将 BIP 单据推送到第三方系统
- **强制要求**：先查询 BIP 单据，再进行字段映射转换，最后调用第三方接口
- **流程**：查询单据 → 字段映射 → 调用三方接口 → 结果回写

#### 4. 档案查询调用 getIBillQueryRepository
- **触发条件**：需要查询 BIP 档案数据时（供应商、客户、银行账户、组织等）
- ✅ 正确示例：调用 skill技能的`iuap-c-metadata-info`的IBillQueryRepository 查询档案

#### 5. Controller 禁止包含业务逻辑
- **触发要求**：Controller 只负责接收请求、参数校验、调用 Service、返回结果

- ✅ 正确示例：Controller 调用 Service 层方法，由 Service 处理业务逻辑

#### 6.查询元数据/业务对象的时候调用iuap-c-metadata-info技能

- **触发要求**：需要查询元数据/业务对象

- ✅ 正确示例：调用 iuap-c-metadata-info查询元数据/业务对象，如果查询出来多个业务对象的时候,请使用AskUserQuestion工具询问我具体的信息,查询的结果如果不正确，需要多次查找

---

## 单据类型与接口映射

### 应收应付单据

| 单据类型 | 单据编码 | 领域 | 服务域 | 说明 |
|---------|---------|------|------|
| 应收发票 | receivable | EAR | yonbip-fi-earapbill | 财务会计-应收管理 |
| 应付发票 | payable | EAP | yonbip-fi-earapbill | 财务会计-应付管理 |
| 收款单 | collection | EAR | yonbip-fi-earapbill | 财务会计-应收管理 |
| 付款单 | payment | EAP | yonbip-fi-earapbill | 财务会计-应付管理 |

---

## 业务流程图

### 单据录入流程（第三方 → BIP）

```
第三方系统 → 接收请求 → 参数校验 → 数据转换 → 调用BIP保存接口（OpenAPI方式） → 调用BIP提交接口 → 记录日志(新建日志表) -> 返回结果
```

### 单据状态变化回调三方流程

> **⚠️ 重要**：BIP单据状态变更同步走**标准MVC架构**（Controller → Service → API），**禁止使用事件监听器（EventListener）模式**。由BIP前端按钮或业务流触发Controller接口，Service处理业务逻辑。

- **触发方式**：BIP前端按钮 / 业务流触发 → 调用状态同步Controller接口
- **流程**：BIP 单据提交、审核通过后，通过标准MVC接口查询BIP单据并推送状态给第三方系统
```
BIP状态变更 → 触发Controller接口(syncStatus) → Service查询BIP单据(OpenAPI方式) → 字段映射转换 → 调用三方回调接口 → 解析响应 → 记录日志(新建日志表) → 结果回写
```

### 单据推送流程（BIP → 第三方）

```
触发推送 → 查询BIP单据（OpenAPI方式） → 解析单据数据 → 字段映射转换 → 调用三方接口 → 解析响应 → 记录日志(新建日志表)  → 结果回写
```



---

## 核心组件清单

### 单据录入组件
ni
| 组件 | 说明 | MVC 层 |
|------|------|--------|
| FinanceInRequest | 入参 DTO | Model |
| BillSaveService | 单据保存服务 | Service |
| BillSubmitService | 单据提交服务 | Service |
| DataConverter | 数据转换器 | Service |
| BIPApiService | BIP API 调用服务 | Service |

### 单据推送组件

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| FinanceOutRequest | 入参 DTO | Model |
| BillQueryService | BIP 查询服务 | Service |
| FieldMapper | 字段映射器 | Service |
| ThirdPartyAuthService | 三方鉴权服务 | Service |
| ThirdPartyApiService | 三方接口调用服务 | Service |
| ResultWriteService | 结果回写服务 | Service |

### 状态同步推送组件（BIP → 三方，标准MVC架构）

> **⚠️ 重要**：状态同步走标准MVC架构（Controller → Service），**禁止使用事件监听器**

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| BillStatusSyncController | 状态同步Controller，接收BIP单据ID和状态 | Controller |
| BillStatusSyncService | 状态同步服务：查询BIP单据→字段映射→调三方接口 | Service |
| BillFieldMapper | BIP字段→三方字段映射 | Service |
| ThirdPartyCallService | 调用三方回调接口（含重试） | Service |
| SyncLogService | 同步日志记录（IYmsJdbcApi） | Service |

---

## 检查清单

### 单据录入检查
- [ ] 入参验证：必填字段校验
- [ ] 数据转换：第三方格式转BIP格式
- [ ] BIP 调用：使用 skill技能`iuap-c-openapi-integration `调用OpenAPI功能  查询单据数据
- [ ] 保存提交：先保存后提交
- [ ] 结果返回：统一响应格式
- [ ] 数据持久化：不使用 MyBatis Mapper
- [ ] 错误处理：错误码统一处理
- [ ] 配置信息：不要使用YML 配置文件,使用@Value 注入到YMS上

### 单据推送检查
- [ ] 单据查询：使用 skill技能`iuap-c-openapi-integration `调用OpenAPI功能  查询 BIP 单据
- [ ] 字段映射：从配置动态解析映射关系
- [ ] 档案查询：使用 skill技能的`iuap-c-metadata-info`的IBillQueryRepository  查询档案
- [ ] 三方调用：HTTP/JSON 方式调用第三方接口
- [ ] 结果回写：使用 IYmsJdbcApi 更新单据状态
- [ ] 异常处理：完整的异常捕获和日志记录
- [ ] 配置信息：不要使用YML 配置文件,使用@Value 注入到YMS上

### 通用检查
- [ ] MVC 分层：Controller→Service→Repository/API
- [ ] 事务管理：Service 层管理事务
- [ ] 日志记录：关键节点记录日志
- [ ] 异常处理：统一异常处理机制
- [ ] 配置信息：不要使用YML 配置文件,使用@Value 注入到YMS上

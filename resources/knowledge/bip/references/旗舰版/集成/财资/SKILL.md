---
name: yonbip-c-treasury-integration
description: 提供司库系统与第三方财务系统集成的综合能力，支持银行账户同步、收款单推送、结算单集成、担保费用发票生成。当需要实现司库相关的集成功能时触发此技能，包括：（1）银行账户同步/冻结/解冻/销户/启停（2）收款单推送NC及审批签字（3）结算单推送与状态回写（4）担保费用单审批完成后自动生成应收/应付发票。
type: agent
allowed-tools:
  - getOpenApiCall
  - getIBillQueryRepository
  - getUltimateMetadataInfo
instructions: |
  根据用户需求判断场景类型，精准路由到对应的规范文件完成司库集成。

  ### BIP 框架规范
  1. 数据持久化：查询使用 IBillQueryRepository，更新使用 IYmsJdbcApi，不使用 MyBatis
  2. MVC分层：Controller→Service→Repository/API，禁止跨层调用
  3. 接口调用：使用 BIP OpenAPI 进行数据操作

---

# 司库集成技能元信息（始终加载）

## 技能触发条件

| 关键词 | 触发场景 |
|--------|---------|
| 银行账户同步 | 银行账户新增同步场景 |
| 银行新增 | 司库新增银行账户同步 |
| 银行冻结 | 银行账户冻结操作 |
| 银行解冻 | 银行账户解冻操作 |
| 银行销户 | 银行账户销户操作 |
| 银行启停 | 银行账户启用/停用状态变更 |
| 收款单推送 | 推送收款单到财务系统 |
| 收款单同步 | 同步收款单数据 |
| 收款单审批 | 收款单审批签字 |
| 收款单校验 | 校验收款单是否存在 |
| 结算推送 | 结算推送场景 |
| 结算集成 | 结算单集成场景 |
| 结算状态回写 | 结算状态回写场景 |
| 担保费用审批 | 担保费用单审批完成事件 |
| 担保费用生成发票 | 担保费用单审批后生成发票 |

## 场景路由规则

> **⚠️ 重要**：根据用户需求判断场景类型，自动路由到对应的规范文件

| 场景 | 路由目标 | 触发条件 |
|------|---------|---------|
| 银行账户同步 | reference/bank_spec.md | 关键词包含"银行"/"账户" |
| 收款单推送 | reference/collection_spec.md | 关键词包含"收款单"/"收款" |
| 结算单集成 | reference/settlement_spec.md | 关键词包含"结算" |
| 担保费用发票 | reference/guarantee_spec.md | 关键词包含"担保费用"/"担保" |
| 托底执行 | reference/td_specification.md | fallbackEnabled=true 或无厂商配置 |

## 引用文件清单

> **📌 分层加载策略**：根据场景按需加载，无需一次性加载所有文件

### 必须引用（始终可用）
| 文件 | 路径 | 用途 |
|------|------|------|
| bank_spec.md | ./reference/bank_spec.md | 银行账户集成规范 |
| collection_spec.md | ./reference/collection_spec.md | 收款单推送规范 |
| settlement_spec.md | ./reference/settlement_spec.md | 结算单集成规范 |
| guarantee_spec.md | ./reference/guarantee_spec.md | 担保费用发票规范 |
| td_specification.md | ./reference/td_specification.md | 托底执行规范 |
| bipzjsktonc字段映射.md | ./reference/bipzjsktonc字段映射.md | BIP与NC字段映射 |

### 按需引用（需要时加载）
| 文件 | 路径 | 触发条件 |
|------|------|---------|
| char_translation_spec.md | ../_公共规范/char_translation.md | 处理特征字段时 |
| mvc_architecture.md | ../_公共规范/mvc_architecture.md | 需要 MVC 规范时 |
| data_persistence.md | ../_公共规范/data_persistence.md | 需要数据持久化规范时 |

---

# 司库三方集成技能

## 业务概述

本技能提供司库系统与第三方财务系统的通用集成能力，基于BIP平台架构实现。

### 核心能力

1. **银行账户集成**
   - 银行账户新增同步到NC65
   - 银行账户冻结/解冻/销户
   - 银行账户启用/停用状态变更

2. **收款单推送集成**
   - 收款单推送到财务系统
   - 自动审批签字
   - 收款单推送状态更新与校验

3. **结算单集成**
   - 结算单推送到第三方财务系统
   - 结算状态回写

4. **担保费用发票生成**
   - 担保费用单审批完成事件监听
   - 根据担保方向自动生成应收/应付发票

### ❌ 禁止生成的场景

- 银行对账功能
- 银行日记账功能
- 付款单处理（非收款单）
- 结算与应收应付的核销处理
- 多方结算的复杂场景
- 其他非司库相关业务

---

## 架构分层与文件职责

| 层级 | 文件 | 职责 | 引用 |
|------|------|------|------|
| 外层 | SKILL.md | 业务概述\|场景识别\|组件清单 | 始终加载 |
| 银行层 | bank_spec.md | 银行账户集成规范 | 始终加载 |
| 收款层 | collection_spec.md | 收款单推送规范 | 始终加载 |
| 结算层 | settlement_spec.md | 结算单集成规范 | 始终加载 |
| 担保层 | guarantee_spec.md | 担保费用发票规范 | 始终加载 |
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

**❌ 不使用的方式：**
- **MyBatis Mapper**：不创建 Mapper 接口和 XML 文件

### 3. BIP 查询 API

**✅ BIP系统查询：**
- 通过 `getOpenApiCall` 动态生成 BIP 查询接口的鉴权及调用代码
- ❌ 错误示例：手动编写 HttpClient/RestTemplate 调用代码
- ✅ 正确示例：调用 getOpenApiCall 获取动态生成的调用代码

---

## MCP 技能调用规则

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| BIP 查询 | 需要查询 BIP 单据数据 | getOpenApiCall |
| 档案查询 | 需要查询 BIP 档案数据 | getIBillQueryRepository |
| 元数据查询 | 需要查询单据字段定义 | getUltimateMetadataInfo |

---

## 核心组件清单

### 银行账户组件
| 组件 | 说明 | MVC 层 |
|------|------|--------|
| BankIntegrateController | 银行账户集成控制器 | Controller |
| BankSyncService | 银行同步服务 | Service |
| BankOpenApiService | 银行OpenAPI服务 | Service |

### 收款单组件
| 组件 | 说明 | MVC 层 |
|------|------|--------|
| CollectionPushController | 收款单推送控制器 | Controller |
| CollectionPushService | 收款单推送服务 | Service |
| CollectionApproveService | 审批签字服务 | Service |

### 结算单组件
| 组件 | 说明 | MVC 层 |
|------|------|--------|
| SettlementIntegrateController | 结算单集成控制器 | Controller |
| SettlementPushService | 结算推送服务 | Service |
| SettlementWriteBackService | 状态回写服务 | Service |

### 担保费用发票组件
| 组件 | 说明 | MVC 层 |
|------|------|--------|
| GuaranteeCostListener | 担保费用事件监听器 | Listener |
| InvoiceGenerateService | 发票生成服务 | Service |

---

## 检查清单

### 通用检查
- [ ] 入参验证：必填字段校验
- [ ] BIP 查询：使用 getOpenApiCall 查询数据
- [ ] 字段映射：从 Excel 动态解析映射关系
- [ ] 数据持久化：使用 IYmsJdbcApi 执行 SQL，未使用 MyBatis Mapper
- [ ] Controller 禁止包含业务逻辑

### 场景检查
- [ ] 银行账户：状态操作类型校验
- [ ] 收款单：组织过滤、交易类型过滤
- [ ] 结算单：结算金额大于0校验
- [ ] 担保费用：担保方向校验

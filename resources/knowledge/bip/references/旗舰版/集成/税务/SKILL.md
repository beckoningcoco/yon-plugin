---
name: yonbip-c-tax-integration
description: 提供税务相关的综合集成能力，包括税务档案同步、税金计提推送、契税/印花税推送、进项发票同步。当用户需要实现税务档案数据与第三方主数据系统的字段映射、税务单据推送、税金计提、补提单推送、契税/印花税推送或进项发票同步时自动触发此技能。
type: agent
allowed-tools:
  - getOpenApiCall
  - getUltimateMetadataInfo
  - getIBillQueryRepository
instructions: |
  根据用户需求判断操作类型，精准调用 BIP 技能完成税务相关集成。

  ### BIP 框架规范
  1. 数据持久化：查询使用 IBillQueryRepository，更新使用 IYmsJdbcApi，不使用 MyBatis
  2. MVC分层：Controller→Service→Repository/API，禁止跨层调用
  3. 事件订阅：通过事件订阅方式接收业务单据审批通过事件

  ### MCP 技能调用决策表
  
  | 场景 | 条件 | MCP 技能 |
  |------|------|----------|
  | 档案查询 | 需要查询 BIP 税务档案数据 | getIBillQueryRepository |
  | BIP单据查询 | 需要查询 BIP 税金/契税/进项发票数据 | getOpenApiCall |
  | 档案参照 | 特征字段类型为 ref | getIBillQueryRepository / getUltimateMetadataInfo |
  | 枚举翻译 | 特征字段类型为 enum | char_translation_spec.md 固定写法 |
  | 数据持久化 | 需要执行 SQL 增删改操作 | IYmsJdbcApi |

---

# 税务综合集成技能

## 技能元信息（始终加载）

| 属性 | 值 |
|------|-----|
| 技能名称 | 税务综合集成 |
| 技能编码 | tax_integ_skill |
| 技能版本 | 1.0.0 |
| 适用系统 | BIP |
| 业务领域 | 财务-税务 |
| 集成方向 | BIP ↔ 三方系统 |

## 技能触发条件

| 关键词 | 触发场景 |
|--------|---------|
| 税务同步 / 税务集成 / 税务推送 | 税务档案同步场景 |
| 税率同步 | 税率同步场景 |
| 税务档案同步 | 税务档案同步场景 |
| 税金计提推送 | 税金计提单审批通过后推送 |
| 补提推送 | 补提单审批通过后推送 |
| 税金单据推送 | 税金相关单据推送 |
| 契税推送 / 契税集成 / 推送契税 | 契税推送场景 |
| 印花税推送 / 印花税集成 | 印花税推送场景 |
| 契税状态回写 / 契税状态同步 | 契税状态回写场景 |
| 进项发票同步 | 同步进项发票到税务系统 |
| 进项发票推送 | 推送进项发票数据 |
| 取消进项发票同步 | 取消已同步的进项发票 |
| 状态回传 / 回调 | 接收第三方状态回传 |

## 场景路由规则

> **⚠️ 重要**：根据用户需求判断操作类型，自动路由到对应的规范文件

| 场景 | 路由目标 | 触发条件 |
|------|---------|---------|
| 税务档案同步 | reference/tax_sync_spec.md | 关键词包含"税务同步"/"税务集成"/"税务推送" |
| 税金单据推送 | reference/tax_voucher_spec.md | 关键词包含"税金计提"/"补提" |
| 契税推送 | reference/stamptax_spec.md | 关键词包含"契税推送"/"印花税" |
| 进项发票同步 | reference/input_invoice_spec.md | 关键词包含"进项发票" |
| 状态回传 | reference/pub_specification.md | 关键词包含"回传"/"回调"/"状态回写" |
| 托底执行 | reference/td_specification.md | fallbackEnabled=true 或无厂商配置 |

---

## 业务概述

本技能提供税务相关的综合集成能力，基于 BIP 平台架构实现。

### 核心能力

1. **税务档案同步**：从第三方系统同步税务档案数据到 BIP 平台，支持增删改查
2. **税率管理**：同步税率信息
3. **税金单据推送**：税金计提、补提单据审批通过后自动推送
4. **契税/印花税推送**：将 BIP 契税计算数据推送到第三方财务系统
5. **进项发票同步**：将进项发票数据同步到税务系统
6. **状态回传**：接收第三方系统的状态回传

### 支持的业务类型

#### 进项发票类型

| 发票类型 | 说明 |
|----------|------|
| 增值税专用发票 | 纸质专用发票 |
| 增值税普通发票 | 纸质普通发票 |
| 增值税电子普通发票 | 电子普通发票 |
| 增值税电子专用发票 | 电子专用发票 |
| 机动车销售统一发票 | 机动车销售发票 |
| 数电票（增值税专用发票） | 数电专用发票 |
| 数电票（普通发票） | 数电普通发票 |

#### 进项发票业务类型

| 业务类型 | 说明 |
|----------|------|
| 一般进项 | 普通进项发票 |
| 建筑服务 | 建筑服务类进项发票 |
| 货物运输 | 货物运输服务类进项发票 |
| 航空客票 | 航空运输电子客票行程单 |
| 铁路客票 | 铁路电子客票 |
| 机动车 | 机动车销售统一发票 |

### ❌ 禁止生成的场景

- 税务档案与发票的关联处理（非进项发票）
- 契税计算逻辑
- 契税科目映射规则
- 契税税目配置
- 其他非税务相关业务

---

## 架构分层与文件职责

| 层级 | 文件 | 职责 | 引用 |
|------|------|------|------|
| **外层** | SKILL.md | 业务概述\|场景识别\|组件清单 | - |
| **场景层** | 各场景_spec.md | 具体业务场景实现 | 引用 pub |
| **公共层** | pub_specification.md | 共用逻辑 | 引用 _公共规范/ |
| **托底层** | td_specification.md | 托底执行 | 独立托底逻辑 |

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
- **查询操作**：`IBillQueryRepository` - 用于查询 BIP 数据
- **更新操作**：`IYmsJdbcApi` - 用于执行 SQL 更新、插入、删除

**❌ 不使用的方式：**
- **MyBatis Mapper**：不创建 Mapper 接口和 XML 文件

### 3. BIP 查询 API

**✅ BIP系统查询：**
- 通过 `getOpenApiCall` 动态生成 BIP 数据查询接口的鉴权及调用代码
- ❌ 错误示例：手动编写 HttpClient/RestTemplate 调用代码
- ✅ 正确示例：调用 getOpenApiCall 获取动态生成的调用代码

---

## MCP 技能调用规则

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| 档案查询 | 需要查询 BIP 税务档案数据 | getIBillQueryRepository |
| BIP单据查询 | 需要查询 BIP 税金/契税/进项发票数据 | getOpenApiCall |
| 档案参照 | 特征字段类型为 ref | getIBillQueryRepository / getUltimateMetadataInfo |
| 枚举翻译 | 特征字段类型为 enum | char_translation_spec.md 固定写法 |
| 数据持久化 | 需要执行 SQL 增删改操作 | IYmsJdbcApi |

---

## 各场景详细流程

### 1. 税务档案同步流程

```
1. 接收同步请求 → 2. 数据校验 → 3. 字段映射转换 → 4. 执行同步 → 5. 返回同步结果
```

**数据校验**：
| 校验字段 | 校验规则 |
|---------|----------|
| tax_code | 税务编码不能为空 |
| tax_rate | 税率必须是有效的数值 |

**数据处理**：
| 操作类型 | 处理方式 |
|---------|---------|
| 新增 | 调用 IYmsJdbcApi.insert() 插入数据 |
| 更新 | 根据 tax_code 查询后调用 IYmsJdbcApi.update() |
| 删除 | 标记为无效，不物理删除 |

### 2. 税金单据推送流程

```
1. 接收审批通过事件 → 2. 校验是否需要推送 → 3. 防止重复推送 → 4. 加密报文 → 5. 调用三方接口 → 6. 记录日志
```

**强制要求**：
- 校验是否需要推送
- 防止重复推送
- 加密报文
- 记录日志

### 3. 契税推送流程

```
1. 查询 BIP 契税数据 → 2. 数据校验 → 3. 处理税目科目 → 4. 字段映射转换 → 5. 调用三方接口 → 6. 状态回写
```

**数据校验**：
| 校验字段 | 校验规则 |
|---------|----------|
| lyid | 不能为空 |
| billNo | 不能为空 |
| 科目 | 不能为空，未匹配到科目则报错 |
| 税目 | 根据税目类型必须匹配到对应的税目，未匹配到则报错 |
| 子目 | 根据配置需要匹配子目，未匹配到则报错 |

### 4. 进项发票同步流程

```
1. 接收同步请求 → 2. 构建发票数据 → 3. 数据转换 → 4. 调用三方接口 → 5. 处理返回结果
```

**支持的处理步骤**：
- 处理一般进项发票明细
- 处理建筑服务发票明细
- 处理货物运输发票明细
- 处理航空运输电子客票
- 处理铁路电子客票
- 处理机动车销售统一发票

**必填字段**：发票代码、发票号码、开票日期、金额等

### 5. 状态回传流程

```
1. 接收回传数据 → 2. 解析回传数据 → 3. 更新单据状态 → 4. 记录日志
```

---

## 引用文件清单

| 文件 | 路径 | 用途 |
|------|------|------|
| pub_specification.md | ./reference/pub_specification.md | 共用逻辑 |
| tax_sync_spec.md | ./reference/tax_sync_spec.md | 税务档案同步场景 |
| tax_voucher_spec.md | ./reference/tax_voucher_spec.md | 税金单据推送场景 |
| stamptax_spec.md | ./reference/stamptax_spec.md | 契税推送场景 |
| input_invoice_spec.md | ./reference/input_invoice_spec.md | 进项发票同步场景 |
| td_specification.md | ./reference/td_specification.md | 托底执行 |

---

## 核心组件清单

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| TaxSyncRequest | 税务档案入参 DTO | Model |
| TaxQueryService | 税务查询服务接口 | Service |
| TaxFieldMapper | 字段映射器 | Service |
| TaxValidator | 税务数据校验器 | Service |
| ThirdPartyTaxService | 三方税务接口 | Service |
| TaxSyncResponse | 响应 DTO | Model |
| TaxVoucherPushService | 税金推送服务 | Service |
| StampTaxIntegrateRequest | 契税入参 DTO | Model |
| StampTaxQueryService | BIP 契税查询服务接口 | Service |
| StampTaxFieldMapper | 契税字段映射器 | Service |
| StampTaxValidator | 契税数据校验器 | Service |
| InputInvoiceSyncService | 进项发票同步服务 | Service |
| ResponseParser | 响应解析器 | Service |
| ResultWriteService | 结果回写服务 | Service |

---

## 检查清单

### 通用检查
- [ ] 入参验证：业务相关必填字段校验
- [ ] BIP 查询：根据数据来源正确使用 getOpenApiCall 或 getIBillQueryRepository
- [ ] 字段映射：从配置动态解析映射关系
- [ ] 数据持久化：使用 IYmsJdbcApi 执行增删改操作
- [ ] 数据持久化：未使用 MyBatis Mapper，直接使用 Repository/API

### 税务档案同步检查
- [ ] 税务编码唯一性校验
- [ ] 税率格式校验
- [ ] 三方接口地址动态读取

### 税金单据推送检查
- [ ] 重复推送校验
- [ ] 报文加密
- [ ] 日志记录

### 契税推送检查
- [ ] lyid 不能为空校验
- [ ] billNo 不能为空校验
- [ ] 科目匹配校验
- [ ] 税目匹配校验

### 进项发票同步检查
- [ ] 发票类型校验
- [ ] 必填字段校验
- [ ] 业务类型适配

### 状态回写检查
- [ ] 状态码解析
- [ ] 错误信息处理
- [ ] BIP 状态更新

---
name: yonbip-c-saleinvoice-integration
description: >-
  销售发票与第三方税务系统（航信/百望/浪潮等）集成技能。支持蓝票开具和红冲场景，自动生成符合BIP开发规范的集成代码。
  当用户需要实现销售发票与第三方税务系统的字段映射、数据转换、接口调用时触发此技能。
  **触发关键词**：蓝票开具、正票开具、发票开具、红冲、红票、负数发票、销售发票集成、发票推送、开票按钮
type: agent
---

# 销售发票集成技能

## 触发条件

| 关键词 | 场景 |
|--------|------|
| 蓝票开具 / 正票开具 / 发票开具 | 蓝票 |
| 红冲 / 红票 / 负数发票 | 红冲 |
| 销售发票集成 / 发票推送 | 通用 |

## ⚠️ 核心约束（必须严格遵守）

### 一、触发方式
- **全部采用按钮触发**，无定时自动开票
- 操作入口：用户在销售发票节点点击「开票」按钮，触发蓝票开具或红冲操作

### 二、⚠️ 必须先查询销售发票数据（强制要求）

**这是一个关键约束，生成的代码必须遵循：**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           数据查询流程                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Controller接收发票ID                                                    │
│       ↓                                                               │
│  ⚠️ 必须先通过BIP OpenAPI查询销售发票详情                               │
│       ↓                                                               │
│  根据发票类型（蓝票/红冲）进行字段映射和转换                            │
│       ↓                                                               │
│  调用航信开票接口                                                       │
│       ↓                                                               │
│  回写发票状态和开票信息                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**❌ 禁止的做法：**
- Controller直接接收完整的SaleInvoicePushDTO
- 在没有查询BIP发票数据的情况下直接调用航信接口

**✅ 正确的做法：**
- Controller只接收发票ID：`pushInvoice(String invoiceId, String pushType)`
- 使用BipOpenApiClient查询发票详情：`bipOpenApiClient.querySaleInvoiceDetail(invoiceId)`
- 再进行后续的字段映射和接口调用

**原因：** 销售发票数据存储在BIP系统中，必须通过官方API获取，不能依赖前端传递的完整数据。

---

### 三、实现方式
| 场景 | 实现方式 |
|------|----------|
| 蓝票开具 | **MVC方式** |
| 红冲操作 | **MVC方式** |
| 调用方式 | 同步调用 |

如需Rule方式，需单独确认。

### 四、异常处理与重试机制
- 强制按照此场景生成，不需要确认；开票/红冲失败后**自动重试3次**
- 重试间隔建议递增（如：1秒、2秒、3秒）
- **重试3次仍失败**：
  - 记录异常日志（包含错误信息）
  - 将发票状态**回写为"开票失败"**

### 五、日志规范
**不记录日志**，按业务需求执行开票/红冲操作。

### 六、字段翻译强制要求（⚠️ 重要）

**本章节定义字段翻译的核心规则，详细实现参照 `reference/03_character_translation.md`**

#### 1. 翻译场景识别（完整矩阵）

从Excel文件读取时，根据"BIP字段类型"列识别翻译场景。**以下关键词不区分大小写，模糊匹配**：

| 字段类型关键词（包含即匹配） | 翻译类型 | 代码生成要求 |
|---------------------------|---------|-------------|
| **员工档案** / **人员** / **员工** / **参照** / **人员档案** | 参照翻译 | **必须通过元数据查询获取 fullName**，然后使用 `IBillQueryRepository.findById()` 查询，获取name字段 |
| **枚举** / **枚举类型** / **枚举档案** | 枚举翻译 | 必须查询 `bd_cust_enum_def` 表，返回枚举名称 |
| **自定义档案** / **自定义档案类型** | 自定义档案翻译 | 必须查询 `bd_cust_doc_def` 表 |
| **布尔** / **boolean** / **是/否** | 布尔转换 | true/Y/是 → 1，否则 → 0 |
| **文本** / **字符** / **字符串** / **日期** | 直接取值 | 无需翻译，直接使用原值 |
| **客户** / **供应商** / **物料** / **商品** / **项目** / **组织** | 参照翻译 | **必须通过元数据查询获取 fullName**，使用 `IBillQueryRepository.findById()` 查询 |

#### 2. 翻译代码生成禁止事项

```
❌ 严格禁止：
   - 生成 // TODO 实现参照翻译
   - 生成 // TODO 调用iuap-c-metadata-info
   - 生成 // TODO 查询枚举档案
   - 生成空方法体或只有方法签名没有实现
   - 使用SQL直接查询BIP发票数据（必须用BIP OpenAPI）
```

#### 3. 翻译代码生成要求

**⚠️ 重要：所有翻译方法必须完整实现，禁止生成空方法体或TODO！**

详细代码模板和实现规范请参考 `reference/03_character_translation.md`

**核心流程（必须执行）：**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    参照翻译代码生成完整流程（强制执行）                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: 注入 IBillQueryRepository                                      │
│  └─→ @Autowired private IBillQueryRepository iBillQueryRepository;     │
│                                                                         │
│  Step 2: 调用 iuap-c-metadata-info 技能获取 fullName                    │
│  └─→ 技能参数：allbillname="人员"（或"客户"、"供应商"等对应档案名称）   │
│  └─→ 返回值：fullName，例如 "org.staff.Staff"                          │
│                                                                         │
│  Step 3: 使用 IBillQueryRepository.findById(fullName, id, 0) 查询     │
│  Step 4: 从 IBillDO 获取 name 字段并返回                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**禁止事项：**
- ❌ 生成 `// TODO 实现参照翻译`
- ❌ 生成空方法体或只有方法签名
- ❌ 跳过 iuap-c-metadata-info 调用

### 七、数据回写规则
开票成功后，**必须回写以下字段**到BIP发票单据：
| 回写字段 | 说明 |
|----------|------|
| 发票代码 | 航信返回的invoiceCode |
| 发票号码 | 航信返回的invoiceNumber |
| 开票日期 | 航信返回的invoiceDate（格式：yyyy-MM-dd） |

### 八、配置管理
- 三方接口配置（航信接口地址、秘钥等）存储在BIP对应的**YMS配置文件**
- 获取方式：**使用@Value注解注入**，禁止生成application.yml/application.properties

### 九、代码分层规范
- 按**厂商/业务/MVC**分层分别存放
- 统一遵循标准代码命名规范
- 蓝票、红冲逻辑按实现方式**独立封装**，结构清晰

---

## 路由规则

### 方式一：统一路由（推荐）
用户不区分蓝票/红冲，统一处理（不需要再次提示用户）

### 方式二：分别路由
| 场景 | 引用文件 |
|------|----------|
| 蓝票 | reference/06_blue_only.md |
| 红冲 | reference/07_red_only.md |

### 方式三：托底路由
当无厂商配置时，使用 reference/08_td_fallback.md

---

## ⚠️ 必需流程：需求映射检测

### Step 1：检测用户是否提供字段映射

| 资料 | 用途 | 未提供时的处理 |
|------|------|--------------|
| 字段映射文档 | BIP字段→三方字段 | 提示用户提供需求文档描述和字段映射表 |
| 特征字段对照表 | 特征编码→翻译类型 | 仅生成基础结构 |
| 三方接口文档 | 接口地址、鉴权 | 生成托底实现 |

### Step 2：实现方式确认

**必须确认用户的实现方式选择**：

```
请选择实现方式：
[1] MVC方式（推荐）- 蓝票+红冲均支持
[2] Rule方式 - 仅蓝票（红冲仍用MVC）

注意：红冲操作只能使用MVC方式实现！
```

---

## ⚠️ Excel、Word、PDF解析规范（必须遵守）

1. **编码处理**：使用UTF-8编码读取Excel、Word、PDF文件，禁止乱码

2. **参照字段识别**：
   - 读取文件时，根据字段名称或表头识别参照字段（如：客户、供应商、商品等）
   - 参照字段在文件中可能存储为ID或显示名称
   - 识别后通过元数据查询获取参照对象元数据
   - 准确识别字段的对照关系

3. **参照翻译流程**：
   - 参考 transCustomer 方法
   ```
   1. 识别参照字段（如 "customer_id" → 客户档案）
   2. 通过元数据查询获取参照对象的 fullName
   3. 使用 IBillQueryRepository 查询参照档案获取 code 和 name
   4. 将 ID 转换为 "code:name" 格式
   ```

4. **枚举翻译流程**：
   - 参考 transCustEnumCodeList 方法
   ```
   1. 识别枚举字段
   2. 根据枚举类型查询 bd_cust_enum_def 表
   3. 将枚举 code 转换为 name
   ```

5. **自定义档案翻译流程**：
   - 参考 transCustDocCodeList 方法
   ```
   1. 识别自定义档案字段
   2. 根据枚举类型查询 bd_cust_doc_def 表
   3. 将 ID 转换为 "code:name" 格式
   ```

---

## Skill调用链

当需要特定能力时，自动调用对应Skill：

| 能力 | 调用Skill | 说明 |
|------|----------|------|
| 查询BIP OpenAPI | iuap-c-openapi-integration | **必须调用** - 获取`销售发票详情`和API调用方式 |
| 查询元数据(回写字段) | iuap-c-metadata-info | 动态获取可更新字段 |
| 生成后端代码 | iuap-c-server-codegen | 生成Service/Controller |

### ⚠️ BIP OpenAPI调用强制要求

**生成BipOpenApiClient代码时，必须调用 `iuap-c-openapi-integration` 技能获取正确的调用方式：**

```
❌ 禁止的行为：
   - 在代码中写 TODO 获取token
   - 手动编写不完整的API调用代码
   - 使用占位符如 "// TODO 实现获取access_token"

✅ 必须执行的操作：
   1. 调用 iuap-c-openapi-integration 技能
   2. 获取完整的Token获取逻辑（HMAC-SHA256签名）
   3. 获取正确的API调用URL格式
   4. 获取正确的响应解析逻辑（code="200"表示成功）
```

**参考文档：**
- `iuap-c-openapi-integration/reference/openapi_integration_spec.md` - BIP标准API调用框架
- `iuap-c-openapi-integration/reference/bip_api_calling_framework.md` - API调用规范

---

## ⚠️ 动态元数据查询（回写字段）

**回写时必须动态获取字段**，步骤：

1. 调用 `iuap-c-metadata-info` 查询"voucher.invoice.SaleInvoice"元数据
2. 获取可更新的字段列表（writable=true）
3. 根据三方返回结果，映射到对应BIP字段
4. 使用 `IYmsJdbcApi` 执行更新

---

## ⚠️ 特征字段翻译规范（重要）

**读取Excel字段映射表时，必须严格区分BIP字段和三方字段**

### 字段来源识别

| Excel列位置 | 含义 | 处理方式 |
|-------------|------|---------|
| 左侧列（BIP来源系统） | BIP系统字段，包括主表和特征组 | 需要翻译 |
| 右侧列（三方目标系统） | 第三方系统字段 | 翻译目标 |

### ⚠️ 特征字段动态识别规范

**特征字段编码是实施人员自定义的，不能硬编码！**

#### 错误识别方式
```
❌ 根据字段编码前缀识别（如udef_DJ01）
   - 实施人员可能用 kpr_001、chart_001、xxx_001 等任何格式，必须从文件中准确获取
```

#### 正确识别方式
```
✅ 根据Excel"字段类型"列识别
   - 示例：字段类型包含"特征-员工档案" → 员工档案特征
   - 示例：字段类型包含"特征-枚举" → 枚举特征
   - 示例：字段类型包含"布尔" → 布尔特征
```

### ⚠️ 特征字段翻译技能调用链（重要）

**当特征字段识别为参照类型{有可能是客户、物料、联系人、线索等}时，必须按以下顺序动态调用技能进行翻译：**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: 通过元数据查询获取 fullName                    │
│         技能参数：allbillname="人员" 或 "员工档案"                    │
│         返回值：fullName，例如 "org.staff.Staff"                     │
│                                                                     │
│ Step 2: 使用 IBillQueryRepository 查询档案信息                       │
│         注入：@Autowired IBillQueryRepository                       │
│         调用：repository.findById(fullName, staffId, 0)              │
│         返回：IBillDO 对象                                           │
│                                                                     │
│ Step 3: 从 IBillDO 获取档案名称                                       │
│         调用：staffDO.getString("name")                             │
│                                                                     │
│ Step 4: 将名称设置到三方请求实体                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 特征字段翻译检查

**当Excel"字段类型"包含"员工档案"时，必须按以下流程处理：**

1. [ ] **动态识别特征类型**：从Excel"字段类型"列识别（而非字段编码）
2. [ ] **获取元数据**：通过元数据查询获取员工档案fullName
3. [ ] **注入 IBillQueryRepository**：使用 `@Autowired` 注入
4. [ ] **执行翻译**：使用 `IBillQueryRepository.findById()` 查询员工信息
5. [ ] **填充结果**：将员工名称（name）而非ID设置到三方实体

## ⚠️ 参照翻译代码生成规范（强制执行）

**生成参照翻译代码时，禁止写TODO，必须生成完整实现！**

```
❌ 禁止的行为：
   - 生成 // TODO 实现参照翻译
   - 生成 // TODO 调用IBillQueryRepository
   - 生成空方法体

✅ 必须生成的代码：
   1. 注入 IBillQueryRepository
   2. 通过元数据查询获取 fullName（作为常量或配置）
   3. 使用 IBillQueryRepository.findById() 查询档案  必须带上：{domain}
   4. 从 IBillDO 获取 name 字段
   5. 返回翻译结果
```

**参照翻译代码模板（必须按此模板生成）：**

- 强制遵守3_character_translation.md 的定义

### 特征类型对照

| Excel"字段类型"列描述 | 翻译方式 | 技能调用 | 注意事项 |
|---------------------|---------|---------|----------|
| **包含"员工档案"** | **参照翻译** | **iuap-c-metadata-info + IBillQueryRepository** | **必须先获取fullName** |
| **包含"枚举"** | 枚举翻译 | 无需 | 查询bd_cust_enum_def表 |
| **包含"自定义档案"** | 自定义档案翻译 | 无需 | 查询bd_cust_doc_def表 |
| **包含"布尔"** | 布尔转换 | 无需 | true/Y/是→1，否则→0 |

---

## 生成模式选择

| 用户需求描述 | 处理方式 |
|-------------|---------|
| 明确提到"MVC"/"Controller" | 使用 **MVC模式** |
| 未明确描述 | **MVC模式** |

### 模式：标准MVC生成（蓝票+红冲）
- **Controller + Service**
- 蓝票、红冲均支持
- **必须实现重试逻辑**（参考reference/04_mvc_generation.md）
- **禁止使用 MyBatis**

---

## 引用文件清单

| 文件 | 用途 |
|------|------|
| reference/01_architecture.md | 整体架构说明 |
| reference/02_field_mapping.md | 字段映射规则 |
| reference/03_character_translation.md | 特征字段翻译 |
| reference/04_mvc_generation.md | MVC生成指南（含重试逻辑） |
| reference/05_rule_extension.md | Rule扩展指南（仅蓝票） |
| reference/06_blue_only.md | 蓝票特有逻辑 |
| reference/07_red_only.md | 红冲特有逻辑 |
| reference/08_td_fallback.md | 托底实现 |

---

## ⚠️ 代码生成路径规范（必须严格遵守）

### 生成根目录

**代码生成位置必须遵循以下规则**：

```
{项目根目录}/
└── dev-{模块名}-service/                                    ← 引擎标识-service
```

### ⚠️ 命名规范

- 自动识别工程目录，将代码放置到 `dev-{模块名}-service` 模块，`com.voucher/{三方厂商}/{模块}` 下合适的路径中
- 模块名从项目pom.xml中获取artifactId，如 `c-scm-kk-yl-service` → `c-scm-kk-yl`

### ⚠️ 禁止行为
- ❌ 禁止生成 `Application` 启动类
- ❌ 禁止在类内部定义内部类（所有DTO必须独立文件）

### 代码生成检查清单

- [ ] 代码生成到 `{引擎}-service/` 模块
- [ ] 路径包含 `com.voucher/{三方系统}/{模块}`
- [ ] 分层目录结构完整（controller/service/entity/api/config）
- [ ] 所有DTO独立成文件（无内部类）

---

## ⚠️ 完整检查清单

### 触发与实现
- [ ] **按钮触发**：无定时自动开票逻辑
- [ ] **蓝票**：支持MVC和Rule两种方式（让用户选择）
- [ ] **红冲**：仅使用MVC方式实现
- [ ] **同步调用**：无异步处理

### ⚠️ 数据查询流程（强制检查）
- [ ] **Controller只接收发票ID**：不接收完整DTO，使用 `@RequestParam String invoiceId`
- [ ] **Service先查询BIP数据**：必须调用 `bipOpenApiClient.querySaleInvoiceDetail(invoiceId)`
- [ ] **禁止跳过查询步骤**：不能直接使用前端传递的数据调用航信接口
- [ ] **BipOpenApiClient已实现**：已生成完整的BIP OpenAPI客户端代码

### 异常处理与重试
- [ ] **重试机制**：失败自动重试3次
- [ ] **失败回写**：重试3次失败后回写"开票失败"状态
- [ ] **异常日志**：记录错误信息和重试次数

### 日志记录
- [ ] **请求参数**：完整记录到日志表
- [ ] **响应结果**：成功/失败均记录
- [ ] **接口耗时**：记录duration_ms字段
- [ ] **重试日志**：记录每次重试信息

### 数据回写
- [ ] **发票代码**：回写到invoiceCode字段
- [ ] **发票号码**：回写到invoiceNumber字段
- [ ] **开票日期**：回写到invoiceDate字段
- [ ] **发票状态**：更新为"已开票"或"开票失败"

### 配置管理
- [ ] 三方接口配置使用@Value注解注入
- [ ] **禁止生成application.yml/application.properties文件**
- [ ] 参数命名使用点分隔层级结构（如：hangxin.api.url）

### 代码规范
- [ ] **代码生成到 `{引擎}-service/` 模块**
- [ ] **路径包含 `com.voucher/{三方系统或模块}/`**
- [ ] 按**厂商/业务/MVC**分层存放
- [ ] 禁止内部类（所有DTO提取为独立类）
- [ ] Controller不包含查询推送状态的方法
- [ ] 只生成单个发票场景（不生成批量）
- [ ] 只生成MVC代码（不生成Application启动类）

### 技术规范
- [ ] **⚠️ Controller只接收发票ID**：禁止接收完整SaleInvoicePushDTO
- [ ] **⚠️ Service先查询BIP数据**：必须调用BipOpenApiClient.querySaleInvoiceDetail()
- [ ] **使用BIP OpenAPI查询数据**（禁止直接查询DB/SQL）
- [ ] **使用BIP OpenAPI查询档案**（禁止使用IBillQueryRepository）
- [ ] 使用IYmsJdbcApi回写数据
- [ ] **已从Excel"字段类型"列动态识别特征字段类型（而非硬编码）**
- [ ] **已从Excel"字段编码"列动态获取特征字段编码（而非硬编码）**
- [ ] **已调用iuap-c-metadata-info获取参照档案fullName**
- [ ] **已生成完整的参照翻译代码（禁止TODO）**

### BIP OpenAPI调用规范
- [ ] **BipOpenApiClient已调用iuap-c-openapi-integration获取完整调用代码**
- [ ] **Token获取方法使用HMAC-SHA256签名算法（禁止TODO）**
- [ ] **API查询销售发票详情：{gatewayUrl}/iuap-api-gateway/yonbip/sd/vouchersaleinvoice/detail**
- [ ] **响应解析逻辑正确：code="200"或code="00000"表示成功**
- [ ] **错误处理完整：区分成功/失败响应并抛出相应异常**

### 参照翻译规范（重要）

字段翻译必须完整实现，拒绝TODO。详细翻译规范参照 `reference/03_character_translation.md`。

### ⚠️ 翻译代码生成检查（强制执行）

**每次生成代码后，必须逐项检查以下内容：**

- [ ] **无TODO检查**：生成的代码中不包含 `// TODO`、`/* TODO */`、`// TODO:`
- [ ] **方法体完整性**：所有翻译方法都有完整实现（非空方法体）
- [ ] **IBillQueryRepository注入**：已使用 `@Autowired` 注入
- [ ] **iuap-c-metadata-info调用记录**：有Skill调用记录证明已调用该技能获取fullName
- [ ] **findById调用正确**：使用 `IBillQueryRepository.findById(fullName, id, 0)` 格式
- [ ] **name字段获取**：从IBillDO正确获取 `getString("name")` 字段
- [ ] **枚举翻译完整**：SQL查询包含正确的表连接（bd_cust_enum_def + bd_cust_enum）
- [ ] **自定义档案翻译完整**：SQL查询包含正确的表连接（bd_cust_doc_def + bd_cust_doc）
- [ ] **参数化查询**：所有SQL使用SQLParameter，禁止字符串拼接
- [ ] **InvocationInfoProxy使用**：枚举/自定义档案翻译使用 `InvocationInfoProxy.getTenantid()`

**如果发现任何一项不满足，必须重新生成代码！**

- [x] 配置参数使用 @Value 注解方式（禁止生成application.yml/application.properties文件）
- [x] 只生成单个发票场景代码（不生成批量处理）
- [x] 只生成MVC代码（不生成Application启动类）
- [x] 禁止生成内部类（应提取为独立类）
- [ ] 代码编译通过（mvn clean package）

---

## ⚠️ BIP平台配置规范

用友BIP使用YMS配置中心进行动态参数配置，**禁止生成application.yml/application.properties配置文件**。

所有配置参数必须使用 `@Value` 注解方式注入，带默认值：

```java
@Value("${hangxin.api.url:http://ip:port/AK8/server/importOrders}")
private String apiUrl;
```

**参数命名规范**：
- 使用点分隔的层级结构：`{模块}.{分组}.{参数名}`
- 示例：`hangxin.api.url`、`bip.openapi.gateway-url`
- 默认值使用实际环境占位符：`http://ip:port`

## ⚠️ BIP基础上下文获取规范

在BIP平台中获取当前登录用户和租户信息，必须使用`InvocationInfoProxy`：

| 上下文信息 | 获取方法 | 返回类型 |
|-----------|---------|---------|
| 租户ID | `InvocationInfoProxy.getTenantid()` | String |
| 用户ID | `InvocationInfoProxy.getUserid()` | String |

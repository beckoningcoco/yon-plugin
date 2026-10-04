---
name: ncc-dev
description: NCC（用友 NC Cloud）开发的总入口。问题里出现 NCC、NC Cloud、NCC2111、NCC2312、NCC2207 时先用本技能，由本技能的场景路由分发。自带跨场景复用的共享素材：各模块 VO 参考（应收应付、总账、库存、采购、销售、基础档案等）、通用 API、事件码、单据类型、编码规范、元数据与 bmf 对应、单据主子表、前端开发，以及 NCC 数据库查询与 SQL 自验证；参照 / 自定义参照 / F7、业务扩展 / 扩展点、编码规则 / 单据编号这几类场景也在本技能。写业务插件 / 事件监听器（IBusinessListener、doAction）请用 ncc-plugin-dev；写后台任务 / 调度任务请用 ncc-background-task；写资产包接口、配置集成规则 pub_interule、接第三方 OpenAPI 请用 ncc-asset-hawk。旗舰版（BIP / YonBIP）是另一条产品线，用 yonyou-bip-dev，表结构、实体名与类名互不相通。
---

# NCC 定制开发总指南

> **本技能引用的文档**都在插件的参考库里，路径形如 `ncc/ncc-dev/references/xxx.md`。
> 用 `knowledge_read` 传该路径读全文，或先用 `knowledge_search` 按关键词搜索；
> **不要**按相对路径去猜文件位置——内联的正文里没有路径可解析。


## 版本定位

本技能服务于 **用友 NCC（NC Cloud）**。

> **版本区分**：用友有两个主要产品线——
> - **旗舰版（BIP / YonBIP）** → 对应技能 `yonyou-bip-dev`（与本技能同级目录）
> - **NCC（NC Cloud）** ← 本技能
>
> 收到问题时务必先判断版本，再使用对应技能及其参考资料。不确定时主动询问用户。

### 问题记录路由

当用户要求将问题/解决方案记录到参考资料时：
- **NCC 问题** → 记录到本技能 `ncc/ncc-dev/references/` 目录（或对应的子技能目录）
- **旗舰版问题** → 记录到 `yon-bip-dev` 的 `ncc/ncc-dev/references/` 目录

## 概述

本 skill 是 NCC 定制开发的**总入口**，负责识别用户需求属于哪个开发场景，然后读取对应的参考资料生成代码。

> **通用素材（事件码、单据类型、编码规范、通用 API）** 所有场景共享，存放在 `ncc/ncc-dev/references/common/` 下。
> **场景素材（各开发模式的示例代码和模式说明）** 存放在 `ncc/ncc-dev/references/scenarios/` 下。

### 子技能

| 子技能 | 用途 | 什么时候去它那里 |
|--------|------|------------------|
| `ncc-plugin-dev` | 业务插件 / 事件监听器（IBusinessListener、doAction） | 要写的是「挂到单据事件上的类」 |
| `ncc-background-task` | 后台任务 / 调度任务 | 要写的是「定时/计划执行的插件」 |
| `ncc-asset-hawk` | 资产包接口、集成规则 pub_interule、三方 OpenAPI 签名、NCC 源码走查与问题记录 | 要对接第三方系统 / 配集成规则 / 查 NCC 源码 |

> 这三条都要回过头来读本技能的 `ncc/ncc-dev/references/common/`（VO 参考、事件码、单据类型、编码规范、通用 API），所以走它们时**本技能也一起加载**。

## 场景路由

根据用户描述自动判断开发场景，读取对应的参考文件：

| 场景 | 触发关键词 | 参考文件 |
|------|-----------|----------|
| **业务插件** | 事件监听、审批后/新增后/修改后、IBusinessListener、doAction、单据转换、自动生成、回写字段、审批后协同、自动生单 | `ncc-plugin-dev` 子技能（其素材是 `ncc/ncc-dev/references/scenarios/plugin-dev.md`）+ `ncc/ncc-dev/references/scenarios/ncc-coding-patterns.md`（未随包提供） |
| **审批后自动协同** | 协同、购销协同、自动生单、IPfExchangeService、ISCMPubSaveCommitService、CloudPFlowContext、用户模拟、跨公司 | `ncc/ncc-dev/references/scenarios/ncc-coding-patterns.md`（未随包提供） §2 + `ncc/ncc-dev/references/scenarios/project-ztxx.md`（未随包提供） §1 |
| **后台任务** | 后台任务、计划任务、定时任务、定时执行、调度、IBackgroundWorkPlugin、executeTask | `ncc-background-task` 子技能 |
| **资产包接口 / 集成规则** | 资产包接口、第三方系统对接、集成规则、pub_interule、pub_intecontrast、OpenAPI 签名、REST Resource、AbstractRestResource、华科客开 | `ncc-asset-hawk` 子技能 |
| **参照** | 参照、下拉参照、自定义参照、参照过滤、F7 | `ncc/ncc-dev/references/scenarios/ref-model.md`（待建） |
| **业务扩展** | 业务扩展、扩展点、扩展注册、处理器 | `ncc/ncc-dev/references/scenarios/biz-extension.md`（待建） |
| **编码规则** | 编码规则、单据编号、自动编号、编码生成 | `ncc/ncc-dev/references/scenarios/coding-rule.md`（待建） |

## 源码分析工作流

> **触发条件**：用户提到任何 Java 类名（如 `nc.xxx.XxxClass`）或要求看某个类的源码时，按以下流程自动执行。

### 版本与路径配置

所有 NCHOME 路径和索引由两个文件管理：

| 文件 | 作用 |
|------|------|
| `ncc_home_path.json` | 多版本 home 路径 + 默认版本 |
| `class_index_<version>.json` | 每个版本独立的类名→jar 索引 |

> **关于 `ncc_home_path.json` 的生成**：该文件记录的是本机 NCC home 路径，每台机器不同，因此被 `.gitignore` 排除，不会入库。仓库中提供了 `ncc_home_path.json.template`（空模板）作为格式参考。**首次运行 `build_index.py` 时会自动创建该文件**，后续再跑其他版本会追加到已有配置中，无需手动编辑。

**`ncc_home_path.json` 结构**：

```json
{
  "default_version": "2111",
  "versions": {
    "2111": {
      "path": "E:/NCProject/NCC/xxx/home",
      "description": "NCC 2111",
      "index_file": "class_index_2111.json",
      "indexed": true
    }
  }
}
```

### 模板配置缺失检查

> **强制规则**：以下文件由用户从 `.template` 复制后填写，仓库只提供模板。**AI 必须在每次对话开始时检查这些文件是否存在，如果缺失则主动提醒用户创建，不要静默跳过。**

| 模板文件 | 目标文件 | 说明 |
|----------|----------|------|
| `ncc_home_path.json.template` | `ncc_home_path.json` | 本机 NCC home 路径和版本 |
| `../path_config.json.template` | `../path_config.json` | 集中路径配置（用户目录、NCC/BIP Home、知识库等），仓库根目录 |

检查时机：收到用户第一条消息后，在查找资料之前执行。如果目标文件不存在：
1. 告知用户缺少哪个配置文件
2. 说明用途
3. 询问是否现在创建（从 template 复制后让用户填写）

### 0. 版本与路径校验（每次操作前自动执行）

```python
import json, os

with open('ncc_home_path.json') as f:
    cfg = json.load(f)

# 用户可指定版本，否则用默认版本
version = cfg['default_version']  # 或用户指定
home_path = cfg['versions'][version]['path']
index_file = cfg['versions'][version]['index_file']

if not os.path.isdir(home_path):
    print(f"⚠️ NCC {version} 的 home 路径不存在: {home_path}")
    print(f"请提供 NCC {version} 版本的 home 全路径")
```

**路径失效时的提示模板**：

> ⚠️ NCC **{version}** 版本的 home 路径已失效。
> 请提供一个 NCC **{version}** 版本的 home 全路径给我，我更新配置后继续。

### 多版本行为

| 场景 | 行为 |
|------|------|
| 用户未指定版本 | 使用 `default_version` 对应的索引和 home |
| 用户指定版本（如"2105的xxx类"） | 切换到对应版本的索引和 home |
| 指定版本未建索引 | 提示用户提供该版本 home 路径 → 运行索引构建 |
| 新增版本 home | 用户提供路径 → 更新 ncc_home_path.json → 构建 class_index_<version>.json |

### 标准流程

1. **版本确定**：默认版本 or 用户指定版本
2. **路径校验**：失效则提示用户提供新路径
3. **查已反编译缓存**：`decompiled/` 目录（跨版本共享，类名唯一）
   ```bash
   find decompiled/ -name "<类名>.java"
   ```
   - **命中**：直接读源码分析，跳过后续步骤
   - **未命中**：进入步骤 4

4. **查索引定位 jar**：
   ```python
   import json
   with open(index_file) as f:       # 如 class_index_2111.json
       data = json.load(f)
   jar_rel = data['index'].get('<类名>', 'NOT FOUND')
   # jar_rel 是相对路径，如 "modules/arap/lib/pubarap_receivablebill.jar"
   ```

5. **反编译**（使用对应版本的 ufjdk，无需用户审批）：
   ```bash
   <home_path>/ufjdk/bin/java -jar cfr-0.152.jar --outputdir decompiled/<模块> <home_path>/<jar_rel> <类名>
   ```
   > ⚠️ CFR 反编译为预授权操作，每次反编译**不需要经过用户同意**，直接执行。

6. **读源码分析**：输出关键代码 + 类作用 + 调用关系

### 代码生成时主动校验 ⭐

> **生成任何 NCC 业务代码时**，代码中出现的每个 NCC 平台类，必须按以下规则校验后再输出。

**0. 版本确认（最先执行）** ⚠️

> **NCC 不同版本（1909/2105/2111/2312）的 API 可能不同。**

- **用户已指定版本**：使用对应版本的索引和 home 来校验代码
- **用户未指定版本**：默认使用 `ncc_home_path.json` 中的 `default_version`，但**在代码输出前提醒用户**：

> ℹ️ 当前校验基于 **NCC {version}** 版本的源码。如果你的项目是其他版本，请告诉我，我会切换到对应版本重新校验。

**校验流程**：

1. 识别代码中所有 NCC 平台类（接口、VO、工具类、抽象类），排除 JDK 标准类和第三方库（fastjson、commons 等）
2. 对每个类**主动查源码**（优先缓存 → 未命中则反编译），验证：
   - **方法签名**：方法名、参数类型/顺序/个数、返回值类型是否完全一致
   - **导入路径**：import 的包路径是否准确
   - **接口契约**：如果是接口实现或抽象类继承，必须实现的方法是否完整覆盖
   - **异常模式**：平台类的异常处理习惯（用 `ExceptionUtils.wrappException()` 还是直接 throw）
   - **空值防护**：平台代码中对 null 的处理模式（直接判空、工具类判空、链式调用前判空）
3. 发现签名不匹配 → **修正后再输出**，不要让用户遇到编译错误

**校验优先级**：

| 代码中出现的类 | 校验强度 | 说明 |
|--------------|---------|------|
| 接口（extends/implements） | **必须校验** | 方法签名错一个字母就编译不过 |
| 工具类静态方法调用 | **必须校验** | 方法名、参数个数必须精确 |
| VO 构造/属性访问 | **建议校验** | getter/setter 名需对齐 |
| 平台常量/枚举 | 按需校验 | 枚举值是否存在 |

**反例**（禁止直接输出未经校验的代码）：
```java
// ❌ 凭记忆写的，方法签名可能错
NCLocator.lookup(IPreAlertPlugin.class);  // 实际是 NCLocator.getInstance().lookup()

// ✅ 校验后修正
NCLocator.getInstance().lookup(IPreAlertPlugin.class);
```

### 索引统计

| 版本 | JDK | 索引文件 | 类数量 | jar 数量 |
|------|-----|---------|--------|---------|
| 2111 | 8 | `class_index_2111.json` (56 MB) | 1,371,043 | 7,941 |
| 2312 | 17 | `class_index_2312.json` (62 MB) | 1,329,808 | 8,637 |

> 运行 `python build_index.py <home_path> <version>` 为新版本构建索引。

> **注意**：同名类可能存在于多个 jar 中，索引保留最后一次命中。如查到的 jar 中代码与预期不符，可用 `grep` 在 JSON 中搜索该类的其他位置。

## 通用参考资料

以下资料**所有场景共享**，根据需要读取：

| 文件 | 内容 | 何时读取 |
|------|------|----------|
| `ncc/ncc-dev/references/common/event-codes.md` | 45 个业务事件码对照表 | 涉及事件监听时 |
| `ncc/ncc-dev/references/common/bill-types.md` | 单据类型代码表（采购/销售/库存/财务等） | 涉及单据操作时 |
| `ncc/ncc-dev/references/common/coding-standard.md` | Java 编码规范（命名/注释/异常处理） | 生成代码时 |
| `ncc/ncc-dev/references/common/common-api.md` | 通用 API 模式（自定义档案、服务定位、持久化查询、系统参数、事件入口、基础数据接口速查等） | 需要调用通用能力时 |
| `ncc/ncc-dev/references/common/so-vo-reference.md` | 销售管理模块 VO 与表名对照表 | 涉及销售订单/发货单/销售发票等 VO 操作时 |
| `ncc/ncc-dev/references/common/pu-vo-reference.md` | 采购管理模块 VO 与表名对照表 | 涉及采购订单/请购单/采购发票等 VO 操作时 |
| `ncc/ncc-dev/references/common/ic-vo-reference.md` | 库存管理模块 VO 与表名对照表 | 涉及出入库/调拨/盘点/转库等 VO 操作时 |
| `ncc/ncc-dev/references/common/pim-vo-reference.md` | 立项管理（pim）模块 VO 与表名对照表 | 涉及项目立项/预算/验收/进度计划等 VO 操作时 |
| `ncc/ncc-dev/references/common/ipm-vo-reference.md` | IPM 基金投资模块 VO 与表名对照表（ipmbd/ipmam/ipmas/ipmdm/ipmexit/ipmfund/ipmip/ipmpb/ipmpe/ipmpg/ipmpl/ipmprm/ipmrisk，含聚合VO） | 涉及基金/投资/产权/风险管理等 VO 操作时 |
| `ncc/ncc-dev/references/common/arap-payablebill-frontend.md` | 应付单卡片前端实战参考（目录结构、按钮分发、NCModal弹框、数据操作API、缓存机制、联查模式、入库明细弹框） | 涉及应付单/付款单/报销单前端客开、入库明细弹框、EAM集成时 |
| `ncc/ncc-dev/references/common/openapi-dev.md` | NCC OpenAPI 开发完整指南（Restlet+JAX-RS，5步：写Java类→写.rest文件→写.md文档→**前台注册**→调用测试） | 涉及 OpenAPI、开放接口、REST API、servlet 开发时 |
| `ncc/ncc-dev/references/common/openapi-fip-txbill-pattern.md` | 资产包 OpenAPI Resources 模式（FIP 外部接口单专用）：`AbstractRestResource` + `transferBill()` + `IFipMessageService.sendMessage()`，仅适用于外部接口单，不适用于付款单等其他单据 | 提到"资产包"开发 OpenAPI / Resources 类 / 外部接口单 OpenAPI 时 |


## NCC 数据库查询规则

1. **PostgreSQL 注意**：NCC 2312 测试环境使用 PolarDB PostgreSQL，表在 `bipuser` schema 下
   - SQL 需加 `bipuser.` 前缀，如 `SELECT * FROM bipuser.fa_card WHERE dr = 0`
2. **不确定列名时**：`SELECT column_name FROM information_schema.columns WHERE table_schema='bipuser' AND table_name='表名'`

**反例**：`SELECT * FROM fa_card` → PostgreSQL 上缺 schema
**正例**：`SELECT pk_card, code, name FROM bipuser.fa_card WHERE dr = 0`

### NCC SQL 自验证规则（AI 自动执行）

> 生成包含 SQL 的代码后，**必须自动验证 SQL 正确性**，无需用户提示。

1. **提取 SQL**：从生成的代码中提取 SQL 语句
2. **改写为安全验证语句**：
   - SELECT → 加 `LIMIT 1`（防止全表扫描）
   - INSERT/UPDATE/DELETE → 改写为 `SELECT 列名 FROM bipuser.表名 WHERE 1=0`（只验证表名+列名存在）
3. **自动执行**：用 `datasource_query` 工具执行，key 形如 `天九(NCC2312)::test`（项目名::环境）
4. ❌ 失败 → 修正后重新生成，不交付半成品

详细规则见 `yonyou-bip-dev` 技能中的 `数据库查询约束.md`。

## 通用编码规则

### 客户化前缀

客户化包路径前缀为 `hk`，组织方式：

```
nc.hk.{层}.{模块}.{业务组件}.{功能}
```

- 层：`bs`（业务组件层）、`bd`（基础数据层）、`ui`（表现层）、`pf`（平台层）
- 模块：`so`（销售）、`pu`（采购）、`ic`（库存）、`ar`（应收）、`ap`（应付）、`pm`（项目管理）等

### 服务接口

NCC 不同端调用接口方式**不同，严禁混用**：

| 端 | 调用方式 |
|------|------|
| **client 端** | `(XxxItf) ServiceLocator.find(XxxItf.class)` |
| **public/private 端** | `(XxxItf) NCLocator.getInstance().lookup(XxxItf.class)` |

```java
// client 端（只能用 ServiceLocator）
ISomeService service = (ISomeService) ServiceLocator.find(ISomeService.class);

// public/private 端（必须用 NCLocator）
ISomeService service = (ISomeService) NCLocator.getInstance().lookup(ISomeService.class);

// 延迟加载模式
private ISomeService someService;
private ISomeService getSomeService() {
    if (someService == null) {
        someService = (ISomeService) ServiceLocator.find(ISomeService.class); // client端
        // someService = (ISomeService) NCLocator.getInstance().lookup(ISomeService.class); // public/private端
    }
    return someService;
}
```

### 异常处理

```java
// ✅ 正确：精确捕获，明确位置
try {
    // 具体业务操作
} catch (Exception e) {
    ExceptionUtils.wrappException(e);
}

// 业务异常中断操作
ExceptionUtils.wrappBusinessException("提示信息");

// ❌ 禁止：大段代码整块 try-catch、finally 中 return、捕获后空处理
```

### 空值防护

每一步操作前都检查 null 和空数组：
```java
if (obj == null) return;
if (!(obj instanceof SomeVO[])) return;
SomeVO[] vos = (SomeVO[]) obj;
if (vos.length == 0) return;
```

### VO 结构

NCC 聚合 VO 采用父子结构：
- `vo.getParentVO()` → 表头 VO（如 `SaleOrderHVO`）
- `vo.getChildrenVO()` 或 `vo.getBVO()` → 表体 VO 数组（如 `SaleOrderBVO[]`）

### 容器和泛型

```java
// ✅ 必须使用泛型
List<String> list = new ArrayList<>();
Map<String, List<DefdocVO>> orgGroupMap = new HashMap<>();

// ❌ 不允许
List list = new ArrayList();
```

## 常用导入速查

```java
// 基础框架
import nc.bs.businessevent.IBusinessEvent;
import nc.bs.businessevent.IBusinessListener;
import nc.bs.framework.common.NCLocator;
import nc.bs.framework.common.ServiceLocator;
import nc.bs.framework.common.InvocationInfoProxy;
import nc.vo.pub.BusinessException;
import nc.vo.pubapp.pattern.exception.ExceptionUtils;
import nc.bs.logging.Logger;

// 单据转换和提交
import nc.itf.uap.pf.IPfExchangeService;
import nc.vo.pubapp.pflow.PfUserObject;
import nccloud.pubitf.scmpub.pub.service.ISCMPubSaveCommitService;
import nccloud.dto.scmpub.script.entity.SCMScriptResultDTO;
import nc.vo.scmpub.res.billtype.POBillType;

// 持久化查询
import nc.md.persist.framework.IMDPersistenceQueryService;
import nc.md.persist.framework.MDPersistenceService;
import nc.vo.pf.pub.util.SQLUtil;

// 自定义档案
import nc.itf.bd.defdoc.IDefdocQryService;
import nc.itf.bd.defdoc.IDefdocService;
import nc.vo.bd.defdoc.DefdocVO;
import nc.vo.bd.accessor.IBDData;
import nc.pubitf.bd.accessor.IGeneralAccessor;
import nc.pubitf.bd.accessor.GeneralAccessorFactory;
import nc.itf.bd.pub.IBDMetaDataIDConst;

// 批量操作
import nc.vo.bd.meta.BatchOperateVO;

// 系统参数
import nc.pubitf.para.SysInitQuery;

// 组织查询
import nc.pubitf.org.IOrgUnitPubService;

// 物料查询
import nc.pubitf.uapbd.IMaterialPubService;

// 客户查询
import nc.pubitf.uapbd.ICustomerPubService;

// 供应商查询
import nc.pubitf.uapbd.ISupplierPubService;

// 会计期间
import nc.pubitf.accperiod.AccountCalendar;

// 工具类
import nccloud.commons.lang.ArrayUtils;
import nc.vo.pp.util.StringUtils;
```

## 输出要求

1. **生成完整的 Java 文件**，包含包声明、导入、类注释
2. **类注释用中文**，说明功能用途
3. **方法注释说明功能**，复杂的算法/逻辑添加行内注释
4. **遵循编码规范**：命名、格式、异常处理
5. 如果需求不明确，先列出需要确认的问题，等用户回答后再生成代码
6. 如果涉及单据类型代码或事件码，主动查阅通用参考资料中的参考表并确认

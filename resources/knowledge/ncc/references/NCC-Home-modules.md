# NCC Home — modules/ 深度分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

---

## 快速导航

| 我想知道... | 跳转 |
|-------------|------|
| 每个模块下有哪些子目录 | [§1 模块目录骨架](#1-模块目录骨架) |
| 某个文件类型（.rest/.bmf/.upm...）的格式和用途 | [§2 文件类型速查表](#2-文件类型速查表) → 跳 §3 |
| 如何注册 OpenAPI | [§3.1 .rest](#31-rest--openapi-路由注册) |
| .bmf 文件有哪些字段属性 | [§3.5 .bmf](#35-bmf--实体表定义) |
| JAR 命名有什么规律 | [§1 子目录说明](#1-模块目录骨架) → `lib/` |
| 不同模块类型的目录存在规律 | [§1 末尾对照表](#1-模块目录骨架) |
| modules 下有哪些模块 | [§4 模块分类](#4-模块分类) |

---

## §1 模块目录骨架

每个 `modules/{模块名}/` 下的标准结构：

```
模块名/
├── META-INF/      ← 模块注册（必有）        → §2 速查 + §3 详解
├── METADATA/      ← 业务元数据（有实体的才有）→ §3.5~3.6
├── classes/       ← 编译后的 .class 文件
├── lib/           ← 服务端 JAR 包
├── client/        ← 客户端资源
└── config/        ← 模块配置（部分模块有）   → §3.7~3.8
```

**各子目录说明**：

| 子目录 | 必有？ | 内容 | 关键点 |
|--------|:--:|------|--------|
| `META-INF/` | ✅ | `.upm`、`.rest`、`.aop`、`module.xml`；子目录 `classes/`、`lib/` | 模块"身份证" |
| `METADATA/` | ❌ | `.bmf`（表定义）、`.bpf`（操作定义） | 只有含业务实体的模块才有 |
| `classes/` | ❌ | `.class` + `.java`，按包路径分 `nc/`、`nccloud/`、`ncc/`、`com/` | 编译产物+源码同行 |
| `lib/` | ✅ | `pub{模块}_{子模块}.jar` + `_src.jar` | 公开层 API JAR |
| `client/` | ✅ | `client/lib/`（多为空） | NCC 转向 Web 前端后废弃 |
| `config/` | ❌ | `xpdl/`、`billcodepredata/`、`mobiletask/`、`tabconfig.xml` | 流程+编码规则+缓存 |

**JAR 两层体系**：

| 位置 | 命名模式 | 用途 |
|------|----------|------|
| `lib/` | `pub{模块}_{子模块}.jar` | 公开 API（暴露给其他模块） |
| `lib/` | `pub{模块}_{子模块}_src.jar` | 源码 |
| `META-INF/lib/` | `{模块}_{子模块}.jar` | 内部实现（模块私有） |
| `META-INF/lib/` | `{模块}_{子模块}_src.jar` | 源码 |

**classes/ 命名空间**：

| 命名空间 | 内容 | 示例 |
|----------|------|------|
| `nc/bs/{模块}/` | 业务服务 + 事件监听器 | `nc/bs/erm/eventlistener/` |
| `nc/itf/{模块}/service/` | 服务接口定义 | `IFABillSaveService.java` |
| `nc/vo/{域}/{单据}/` | 值对象（VO） | `nc/vo/ep/bx/BXBusItemVO.java` |
| `nc/impl/{模块}/` | 接口实现 | `nc/impl/erm/fabill/` |
| `nccloud/openapi/{模块}/` | **OpenAPI REST Resource** | `ERMJKBXBillAddResource.java` |
| `nccloud/pubimpl/{模块}/` | 前端公共实现 | `ExpenseaccountServiceImpl.java` |
| `nccloud/util/{模块}/` | 前端工具类 | `FysqReimRuleUtil.java` |
| `ncc/tool/{模块}/` | NCC 工具类 | `ncc/tool/erm/login/util/SHAUtils.java` |
| `com/yonyou/{模块}/` | 客户化代码 | `com/yonyou/jkbx/ermorder/listener/` |

**各模块类型的目录存在情况**：

| 模块类型 | META-INF | METADATA | classes | lib | client | config |
|----------|:--:|:--:|:--:|:--:|:--:|:--:|
| 业务模块（erm） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 基础数据（uapbd） | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 公共模块（mapub） | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| 平台模块（platform） | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |

---

## §2 文件类型速查表

> 按查询频次排序。

| 文件类型 | 位置 | 一句话作用 | 跳转 |
|----------|------|------------|------|
| `.rest` | META-INF/ | URL → Resource 类映射 | [§3.1](#31-rest--openapi-路由注册) |
| `.upm` | META-INF/ | 接口→实现类绑定 | [§3.3](#33-upm--服务组件注册) |
| `.bmf` | METADATA/ | 实体/表/VO/字段定义 | [§3.5](#35-bmf--实体表定义) |
| `.bpf` | METADATA/ | CRUD 操作→Java 类 | [§3.6](#36-bpf--业务操作定义) |
| `.aop` | META-INF/ | AOP 切面绑定 | [§3.4](#34-aop--aop-切面定义) |
| `module.xml` | META-INF/ | 模块名称声明 | [§3.2](#32-modulexml--模块描述符) |
| `tabconfig.xml` | config/ | 内存表缓存策略 | [§3.7](#37-tabconfigxml--表缓存配置) |
| `billcodepredata.xml` | config/ | 单据编码规则 | [§3.8](#38-billcodepredataxml--单据编码规则) |
| `*.xpdl` | config/xpdl/ | 工作流定义 | — |

---

## §3 文件类型详解

### §3.1 `.rest` — OpenAPI 路由注册

| 项 | 值 |
|----|-----|
| **位置** | `META-INF/` |
| **编码** | `gb2312` |
| **作用** | 将 URL 路由映射到 Java REST Resource 类 |
| **加载方式** | NCC 启动时扫描所有模块的 `.rest` 文件，注册路由表 |

```xml
<?xml version="1.0" encoding="gb2312"?>
<module>
    <rest>
        <resource classname="nccloud.openapi.erm.jkbxbillAdd.resource.ERMJKBXBillAddResource" />
    </rest>
    <rest>
        <resource classname="nccloud.openapi.erm.ermOrder.resource.ERMOrderResource" />
    </rest>
</module>
```

**路径推导规则**：`nccloud/openapi/{模块}/{子路径}/resource/{类名}` → `/nccloud/api/{模块}/{子路径}/{方法}`

> 示例：`nccloud.openapi.erm.jkbxbillAdd.resource.ERMJKBXBillAddResource` → `/nccloud/api/erm/jkbx/add`

---

### §3.2 `module.xml` — 模块描述符

| 项 | 值 |
|----|-----|
| **位置** | `META-INF/` |
| **编码** | `gb2312` |
| **作用** | 声明模块名称及公开/私有服务列表（框架级） |

```xml
<?xml version="1.0" encoding="gb2312"?>
<module name="erm">
    <public></public>
    <private></private>
</module>
```

> 具体的接口注册在 `.upm` 中（见 [§3.3](#33-upm--服务组件注册)），本文件只做模块身份标识。

---

### §3.3 `.upm` — 服务组件注册

| 项 | 值 |
|----|-----|
| **位置** | `META-INF/` |
| **编码** | `gb2312` |
| **作用** | 声明模块向外暴露的服务组件（接口→实现类绑定） |

```xml
<?xml version="1.0" encoding="gb2312"?>
<module name="arap_api">
    <public>
        <component priority="0" singleton="true" remote="true" tx="CMT" supportAlias="true">
            <interface>nc.itf.arap.pub.INewBXBillPublic</interface>
            <implementation>nc.impl.arap.bx.NewBXBillPublicImpl</implementation>
        </component>
    </public>
</module>
```

**component 属性含义**：

| 属性 | 含义 | 常见值 |
|------|------|--------|
| `interface` | 服务接口全限定类名 | ITF 接口 |
| `implementation` | 实现类全限定类名 | IMPL 类 |
| `priority` | 优先级（多个实现时选最高） | `0` |
| `singleton` | 是否单例 | `true` |
| `remote` | 是否允许远程调用 | `true` |
| `tx` | 事务类型 | `CMT`（容器管理事务）、`NOTX`（无事务） |
| `supportAlias` | 是否支持别名查找 | `true` |

---

### §3.4 `.aop` — AOP 切面定义

| 项 | 值 |
|----|-----|
| **位置** | `META-INF/` |
| **作用** | 声明 AOP 切面类及其拦截的目标组件 |

```xml
<module priority="1025">
    <aops>
        <aspect class="com.yonyou.ybz.txmq.aop.TxmqProduceAspect"
                component="com.yonyou.ybz.listener.itf.ITxmqSyncService"/>
    </aops>
</module>
```

| 属性 | 含义 |
|------|------|
| `class` | 切面实现类（拦截逻辑） |
| `component` | 被拦截的目标接口 |
| `priority` | 切面执行优先级（数字越大越先执行） |

---

### §3.5 `.bmf` — 实体/表定义

| 项 | 值 |
|----|-----|
| **位置** | `METADATA/` |
| **编码** | `UTF-8` |
| **格式** | XML（用友 UAP 建模工具生成） |
| **作用** | 定义实体→数据库表的完整映射：表名、VO 类、字段名/类型/约束/默认值 |

**文件结构概览**：

```
<component>                           ← 实体顶层
  <celllist>
    <entity>                          ← 表定义
      <attributelist>
        <attribute ... />             ← 每个字段一个 attribute
      </attributelist>
      <busiitfs/>                     ← 业务接口关联
      <accessor ... />                ← 数据访问策略
    </entity>
    <Reference ... />                 ← 关联其他实体
    <Enumerate>                       ← 枚举定义
      <enumitem ... />
    </Enumerate>
  </celllist>
</component>
```

**关键属性说明**：

**`<component>`（实体顶层）**：

| 属性 | 含义 | 示例 |
|------|------|------|
| `name` | 实体 ID | `ermbilltype` |
| `namespace` | 命名空间 | `erm` |
| `ownModule` | 所属模块 | `erm` |

**`<entity>`（表定义）**：

| 属性 | 含义 | 示例 |
|------|------|------|
| `name` | 实体名 | `ermbilltype` |
| `displayName` | 中文显示名 | `报销单据类型` |
| `tableName` | 数据库表名 | `er_djlx` |
| `fullClassName` | VO 类全限定名 | `nc.vo.er.djlx.DjLXVO` |
| `isPrimary` | 是否主实体 | `true` / `false` |
| `isCreateSQL` | 是否自动生成建表 SQL | `true` |
| `keyAttributeId` | 主键字段 UUID | — |

**`<attribute>`（字段定义）**：

| 属性 | 含义 | 示例值 |
|------|------|--------|
| `name` | Java 属性名（驼峰） | `djlxbm` |
| `fieldName` | 数据库列名 | `djlxbm` |
| `displayName` | 中文显示名 | `单据类型编码` |
| `dbtype` | 数据库类型 | `varchar` / `char` / `int` / `decimal` |
| `typeName` | UAP 类型名 | `String` / `UFBoolean` / `UFDouble` / `Integer` / `UFID` |
| `length` | 字段长度 | `20` |
| `isKey` | 是否主键 | `true` / `false` |
| `isNullable` | 是否可空 | `true` / `false` |
| `defaultValue` | 默认值 | `Y` / `N` |
| `refModelName` | 参照档案名（仅参照类型字段有值） | `币种档案` |

**其他元素**：

| 元素 | 含义 |
|------|------|
| `<Reference>` | 引用外部实体，`mdFilePath` 指向被引用的 `.bmf` |
| `<Enumerate>` | 枚举定义，`<enumitem>` 含 `enumDisplay` + `enumValue` |
| `<accessor>` | 数据访问策略，标准为 `NCVO`（NCBeanStyle） |

---

### §3.6 `.bpf` — 业务操作定义

| 项 | 值 |
|----|-----|
| **位置** | `METADATA/` |
| **作用** | 定义实体上可执行的业务操作（保存/删除/审批等）及对应 Java 类 |

```xml
<busioperation name="saveErmBillHead"      displayName="单据保存"
               fullClassName="nc.voerm.ermbilloperate.saveErmBillHead"/>
<busioperation name="deleteErmBillHead"    displayName="单据删除"
               fullClassName="nc.voerm.ermbilloperate.deleteErmBillHead"/>
<busioperation name="approveErmBillHead"   displayName="单据审批"
               fullClassName="nc.voerm.ermbilloperate.approveErmBillHead"/>
<busioperation name="unapproveErmBillHead" displayName="单据反审批"
               fullClassName="nc.voerm.ermbilloperate.unapproveErmBillHead"/>
<busioperation name="queryErmBillHead"     displayName="单据查询"
               fullClassName="nc.voerm.ermbilloperate.queryErmBillHead"/>
```

| 属性 | 含义 |
|------|------|
| `name` | 操作标识 |
| `displayName` | 中文显示名 |
| `fullClassName` | 操作实现类全限定名 |

> **.bmf vs .bpf**：`.bmf` 定义"数据长什么样"，`.bpf` 定义"数据怎么操作"

---

### §3.7 `tabconfig.xml` — 表缓存配置

| 项 | 值 |
|----|-----|
| **位置** | `config/` |
| **作用** | 配置 NCC 内存中缓存的数据库全量表及刷新策略 |

```xml
<table name="er_reimtype"    strategy="FULL" primaryKey="pk_reimtype"/>
<table name="er_djlx"        strategy="FULL" primaryKey="djlxoid"/>
<table name="er_expensetype" strategy="FULL" primaryKey="pk_expensetype"/>
```

| 属性 | 含义 |
|------|------|
| `name` | 数据库表名 |
| `strategy` | 缓存策略（`FULL` = 全量加载到内存） |
| `primaryKey` | 主键字段 |
| `refreshInterval` | 刷新间隔（秒），默认 30 |
| `lfuMax` | LFU 缓存最大条目数 |

---

### §3.8 `billcodepredata.xml` — 单据编码规则

| 项 | 值 |
|----|-----|
| **位置** | `config/billcodepredata/` |
| **作用** | 定义每种单据类型的编码生成公式 |

```xml
<billcoderulevo>
    <basevo>
        <rulecode>bx</rulecode>
        <rulename>主报销单</rulename>
        <format>yyyyMMdd</format>
    </basevo>
    <elems>
        <elem><elemtype>0</elemtype><elemvalue>264X</elemvalue></elem>  <!-- 固定前缀 -->
        <elem><elemtype>2</elemtype><elemvalue>djrq</elemvalue></elem>   <!-- 日期字段 -->
        <elem><elemtype>3</elemtype></elem>                               <!-- 流水号 -->
    </elems>
</billcoderulevo>
```

→ 实际生成效果：`264X202607010000135745`

**elemtype 枚举**：

| elemtype | 含义 | 需 elemvalue? |
|----------|------|:--:|
| 0 | 固定字符串 | ✅ |
| 2 | 日期（取字段值按 `format` 格式化） | ✅ 字段名 |
| 3 | 自增流水号（长度由 `elemlenth` 控制） | ❌ |

---

## §4 模块分类

约 250 个模块目录，按技术层级分组：

| 分类 | 示例模块 | 数量 |
|------|----------|------|
| 平台层 | `platform`、`baseapp`、`ncpub`、`pubapp`、`iuap`、`uap*` 系列 | ~20 |
| 业务层 | `gl`、`arap`、`fa`、`so`、`pu`、`ic`、`cm`、`erm`、`hr*`、`pm*`、`sc*`、`mm*` | ~200+ |
| 商业智能 | `bq*` 系列、`graphic_report`、`ufo*` | ~15 |
| 共享服务 | `ssc*` 系列 | ~12 |
| 低代码 | `lcdp`、`lcm` | ~2 |
| 其他 | `back_code`、`workbench` 等 | 少量 |

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [OpenAPI 开发文档](../ncc-dev/references/common/openapi-dev.md)
- [NCC 资产包接口开发指南](./NCC资产包接口开发指南.md)

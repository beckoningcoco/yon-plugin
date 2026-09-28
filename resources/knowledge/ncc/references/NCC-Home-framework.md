# NCC Home — framework/ 分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

> ⚠️ **重要纠正**：`framework/` 不是 NCC 框架层 JAR（真正的框架 JAR 在 `lib/`），而是 **sysconfig（系统配置器）GUI 工具**。

---

## 快速导航

| 我想知道... | 跳转 |
|-------------|------|
| framework/ 到底是什么 | [§1 概述](#1-概述) |
| mwconfig 有哪些插件 | [§2 mwconfig 插件清单](#2-mwconfig--sysconfig-插件引擎) |
| 真正的框架 JAR 在哪 | [§3 lib/ 运行时 JAR](#3-附-lib--真正的运行时-jar) |

---

## §1 概述

```
framework/
├── codegen.jar              ← 代码生成器
├── ejbgenerator.jar         ← EJB 生成器
├── sync.jar                 ← 同步工具
└── mwconfig/                ← ⭐ sysconfig GUI 核心
    ├── {插件名}.jar          ← 38 个配置管理插件
    └── resources/            ← GUI 资源（图标、帮助文档、i18n）
```

| 组件 | 职能 |
|------|------|
| `mwconfig/` | NCC 系统配置器的插件引擎，每个 JAR 管理一种配置项 |
| `codegen.jar` | 代码生成工具（生成 VO、Service 骨架代码） |
| `ejbgenerator.jar` | EJB 会话 Bean 代码生成器 |
| `sync.jar` | 模块同步工具（同步配置到集群节点） |

---

## §2 mwconfig/ — sysconfig 插件引擎

### 插件清单（38 个 JAR）

按管理领域分组：

| 分类 | JAR | 管理的配置内容 |
|------|-----|---------------|
| **基础设施** | | |
| | `core.jar` | 核心引擎 |
| | `datasource.jar` | 数据库连接池/数据源 |
| | `dbcache.jar` | 数据库全量表缓存策略 |
| | `dserver.jar` | 数据服务 |
| | `deployment.jar` | 模块部署/卸载 |
| | `cluster.jar` | 集群管理 |
| | `clustermessage.jar` | 集群消息 |
| **平台服务** | | |
| | `systemconfig.jar` | 系统参数（sysconfig 核心） |
| | `services.jar` | 服务注册 |
| | `logger.jar` | 日志配置 |
| | `version.jar` | 版本信息 |
| | `scheduleengine.jar` | 后台调度引擎 |
| **安全** | | |
| | `licence.jar` | License 许可 |
| | `wssecurity.jar` | Web Service 安全 |
| | `ncjca.jar` | JCA 连接器安全 |
| | `securityLog.jar` | 安全日志 |
| **存储/文件** | | |
| | `redisConfig.jar` | Redis 配置 |
| | `discache.jar` | 磁盘缓存 |
| | `ufs.jar` | 文件系统（UFS） |
| | `filesConfig.jar` | 文件存储配置 |
| **搜索/索引** | | |
| | `anteanalyzer.jar` | Ante 分析器 |
| | `anteindexcheck.jar` | Ante 索引检查 |
| | `antemetadatagroup.jar` | Ante 元数据分组 |
| | `anteschedule.jar` | Ante 调度 |
| | `antesource.jar` | Ante 数据源 |
| | `antesourcetype.jar` | Ante 源类型 |
| | `bdsearch.jar` | 基础数据搜索 |
| **业务配置** | | |
| | `datawork.jar` | 数据处理 |
| | `graphic.jar` | 图形报表 |
| | `imconfig.jar` | 国际化配置 |
| | `modjk.jar` | 模块监控 |
| | `crcontroller.jar` | CR 控制器 |
| | `uba.jar` | UBA 配置 |
| | `port.jar` | Portal 配置 |

### resources/ — GUI 资源

```
mwconfig/resources/
├── *.png / *.gif / *.jpg       ← sysconfig 界面图标（~30 个）
├── help/
│   ├── index.html              ← 帮助文档主页
│   └── res/                    ← 帮助文档截图（中英文双份）
├── config/
│   ├── plugintree.xml          ← 插件树（控制 sysconfig 左侧导航树）
│   └── ihs-plugin-cfg.xml      ← IHS 插件配置
└── lang/
    ├── english/                ← 英文国际化（每个插件一个 .properties）
    └── simpchn/                ← 中文国际化（每个插件一个 .properties）
```

> 每个插件 JAR 在 `lang/english/` 和 `lang/simpchn/` 下都有对应的 `{插件名}.properties`，这是 sysconfig 界面的多语言资源。

---

## §3 附：lib/ — 真正的运行时 JAR

`lib/` 才是 NCC 运行时所需的第三方和基础库（~53 个 JAR）：

| 分类 | JAR | 说明 |
|------|-----|------|
| **多数据库驱动** | `ojdbc6.jar` | Oracle |
| | `mysql.jar` | MySQL |
| | `DmJdbcDriver18.jar` | 达梦 DM |
| | `gbase-connector-java-*.jar` | GBase |
| | `sqljdbc4.jar` | SQL Server |
| | `db2java.jar` / `db2jcc.jar` | DB2 |
| | `ifxjdbc.jar` | Informix |
| | `oscarJDBC.jar` | Oscar |
| | `jtds-1.2.jar` | JTDS（Sybase/SQL Server） |
| | `ImpalaJDBC42.jar` | Impala |
| | `gauss.jar` | GaussDB |
| **NCC 基础组件** | `ncc-mscomponent-1.0.jar` | NCC 微服务组件 |
| | `nccloud-msfw-json-1.0.jar` | NCC 云 JSON 序列化 |
| | `nccloud-msfw-redis-1.0.jar` | NCC 云 Redis 适配 |
| | `ncsec.jar` | NCC 安全模块 |
| | `mxfw.jar` / `mxfw_doc.jar` | MX 框架 |
| | `fwserver.jar` / `fwcheck.jar` | 框架服务/校验 |
| | `cnytiruces.jar` | 安全基座 |
| **REST/Web** | `org.restlet-2.4.0.jar` | RESTlet 核心（OpenAPI 基础） |
| | `org.restlet.ext.json-2.4.0.jar` | RESTlet JSON 扩展 |
| | `org.restlet.ext.servlet-2.4.0.jar` | RESTlet Servlet 适配 |
| | `org.reeasy.jaxrs-4.6.0.jar` | JAX-RS 适配 |
| **HTTP 客户端** | `httpclient-4.5.13.jar` | Apache HttpClient |
| | `httpcore-4.4.11.jar` | Apache HttpCore |
| | `httpmime-4.5.13.jar` | HttpClient MIME |
| **缓存** | `ehcache-1.1.jar` | EHCache |
| | `jedis-3.7.0.jar` | Redis 客户端 |
| | `xmemcached-1.4.3.jar` | Memcached 客户端 |
| | `oscache-2.1.jar` | OSCache |
| **OSGi** | `org.osgi.core.jar` | OSGi 核心 |
| | `org.osgi.compendium.jar` | OSGi 扩展 |
| **JSON/XML/PDF** | `org.json.jar` | JSON 解析 |
| | `org.simpleframework.xml.jar` | XML 序列化 |
| | `PDFBox_bin.jar` | PDF 生成 |
| **插件框架** | `jpf.jar` / `jpf-boot.jar` / `jpf-tools.jar` | Java Plugin Framework |
| **脚本/测试** | `bsh-2.0b6.jar` | BeanShell 脚本引擎 |
| | `junit.jar` / `easymock.jar` | 单元测试 |
| | `httpunit.jar` | HTTP 测试 |
| **其他** | `slf4j-api-1.8.0-beta4.jar` | SLF4J 日志门面 |
| | `jcifs-1.2.9.jar` | CIFS/SMB 协议 |
| | `dbDriverTool.jar` | 数据库驱动工具 |
| | `fdsapi.jar` | FDS API |

---

## §4 深度判断

| 维度 | 已覆盖 | 说明 |
|------|:--:|------|
| framework/ 定位纠正 | ✅ | 从"框架 JAR"纠正为"sysconfig 工具" |
| mwconfig 插件清单 | ✅ | 38 个插件按领域分类 |
| GUI 资源结构 | ✅ | 图标、帮助、i18n 两层语言 |
| lib/ 运行时 JAR | ✅ | 53 个 JAR 按用途分类 |
| 插件 .properties 内容 | ❌ | 属于 i18n 文本细节，非结构分析 |
| 帮助文档内容 | ❌ | sysconfig 用户手册，非技术结构 |

**结论：framework 到此为止。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [modules/ 深度分析](./NCC-Home-modules.md)
- [hotwebs/ 分析](./NCC-Home-hotwebs.md)

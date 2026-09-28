# NCC Home — 总导航

> **环境**: 机械院 NCC2111 | **Home 路径**: `E:\NCProject\NCC\jixieyuan\home20260302_newHome\home`
> **分析日期**: 2026-07-04

---

## 快速导航

| 我想知道... | 文档 |
|-------------|------|
| 某个顶层目录是干什么的 | → 本文 [顶层目录速查](#顶层目录速查) |
| modules 的内部结构、文件类型详解 | → [NCC-Home-modules.md](./NCC-Home-modules.md) |
| hotwebs/ 前端结构 | → （待分析） |
| framework/ 框架层 | → （待分析） |
| 常用路径（日志、配置、前端...） | → 本文 [关键路径速查](#关键路径速查) |

---

## 概述

NCC Home 是一个**自包含的 Java EE 运行时目录**（自带 JDK、中间件、全部业务模块、配置），是整个 NCC 系统的运行根目录。

```
HOME/
├── modules/      ← 业务（所有模块、元数据、JAR）          → NCC-Home-modules.md
├── hotwebs/      ← 前端（nccloud Web 应用）              → （待分析）
├── framework/    ← 框架（NCC 基础框架 JAR）               → （待分析）
├── middleware/    ← 中间件（Tomcat）
├── ufjdk/        ← JDK（用友定制版）
├── resources/    ← 系统配置
├── nclogs/       ← 运行日志
├── bin/           ← 启动/停止脚本
└── ...           ← 其他（见下方速查表）
```

---

## 顶层目录速查

> 含所有第一层目录/文件，按职能分组。标注 `?` = 待确认。

| 目录/文件 | 职能 | 分组 |
|-----------|------|------|
| `modules/` | 所有业务模块（元数据 .bmf、配置文件、模块 JAR），含原厂 + 客户化 | ⭐ 核心 |
| `hotwebs/` | 热部署 Web 应用（nccloud 前端） | ⭐ 核心 |
| `framework/` | ⚠️ sysconfig（系统配置器）GUI 工具，非框架 JAR（真正的框架 JAR 在 `lib/`） | 工具 |
| `lib/` | 运行时 JAR（数据库驱动、RESTlet、Redis、HTTP 等 53 个） | 运行时 |
| `middleware/` | 中间件部署适配（WAS/WLS 支持，内嵌 Tomcat 不依赖） | 运行时 |
| `uapadp/` | 空目录（无内容） | — |
| `uapmq/` | Apache ActiveMQ 消息队列（NCC 异步事件总线） | 中间件 |
| `ump/` | UAP 管理平台 V3.0.2（集群管理 + 补丁分发，端口 5763） | 中间件 |
| `ufjdk/` | 用友定制 JDK | 运行时 |
| `driver/` | 数据库驱动 JAR | 运行时 |
| `external/` | 第三方外部库 | 运行时 |
| `langlib/` | 多语言资源库 | 运行时 |
| `resources/` | 系统级配置（sysconfig、数据源配置等） | 配置 |
| `META-INF/` | Java 标准元数据 | 配置 |
| `ejbXMLs/` | EJB 部署描述符 XML | 配置 |
| `pfxx.xml` | 平台配置文件 | 配置 |
| `webapps/` | 传统 Web 应用部署目录 | Web |
| `nclogs/` | NCC 运行日志（业务日志、框架日志） | 日志 |
| `temp/` | 临时文件 | 临时 |
| `logTemp/` | 临时日志 | 临时 |
| `work/` | 应用服务器工作目录（JSP 编译产物等） | 临时 |
| `bin/` | 启动/关闭命令脚本 | 工具 |
| `ant/` / `ant_bak/` | Apache Ant 构建工具 | 工具 |
| `starter.jar` | 启动器 | 工具 |
| `spliter.jar` | 分包工具 | 工具 |
| `arthas-output/` | Arthas（Java 诊断工具）输出 | 工具 |
| `startup.bat` / `startup.sh` | Windows/Linux 启动脚本 | 工具 |
| `stop.bat` / `stop.sh` | Windows/Linux 停止脚本 | 工具 |
| `patchrule/` | 补丁规则 | 补丁 |
| `update/` | 更新/补丁包 | 补丁 |
| `splitfiles/` | 分包文件 | 补丁 |
| `src/` | 源码（反编译或示例） | 补丁 |
| `uapadp/` | UAP 适配器层 | 中间件 |
| `uapmq/` | UAP 消息队列 | 中间件 |
| `ump/` | UAP 管理平台 | 中间件 |
| `cert/` | SSL 证书 | 安全 |
| `print/` | 打印相关 | 工具 |
| `dist/` | 分发/部署包输出 | 构建 |
| `ejb/` | EJB 相关 | 运行时 |
| `ierp/` | ⭐ **运行时配置核心**（prop.xml 启动参数、安全、日志、SSO、多数据库建表脚本） | 配置 |
| `intelliv/` ? | 智能分析？ | 待确认 |
| `arcp/` ? | — | 待确认 |
| `nmc/` ? | — | 待确认 |
| `glexcel/` ? | 全局 Excel 工具？ | 待确认 |
| `pfxx/` ? | 平台配置导出？ | 待确认 |
| `microserver/` ? | 微服务模块？ | 待确认 |
| `ncscript/` ? | NC 脚本引擎？ | 待确认 |

<details><summary>非标准文件（运行残留/备份，点击展开）</summary>

| 目录/文件 | 说明 |
|-----------|------|
| `hotwebs_bak2/` | hotwebs 备份 |
| `temp1112.tar.gz` | 临时归档 |
| `nohup.out` | nohup 输出日志 |
| `exitstop.temp` | 停止标记文件 |
| `cache.idx` | 缓存索引 |
| `akfkl.jsp` | 遗留 JSP 文件 |
| `.DS_Store` | macOS 系统文件 |

</details>

---

## 关键路径速查

| 用途 | 路径（相对于 HOME） |
|------|---------------------|
| 模块注册文件 | `modules/{模块名}/META-INF/` |
| 业务元数据（bmf/bpf） | `modules/{模块名}/METADATA/` |
| .rest 注册 | `modules/{模块名}/META-INF/{名称}.rest` |
| 模块 JAR | `modules/{模块名}/lib/` |
| NCC 前端 | `hotwebs/nccloud/` |
| Web 配置 | `hotwebs/nccloud/WEB-INF/web.xml` |
| 系统配置 | `resources/` |
| 运行日志 | `nclogs/server/` |
| 启动命令 | `bin/sysconfig.bat` |

---

## 子文档索引

| 文档 | 内容 | 状态 |
|------|------|:--:|
| [NCC-Home-modules.md](./NCC-Home-modules.md) | modules/ 目录骨架、文件类型详解（.rest/.upm/.bmf/.bpf 等）、模块分类 | ✅ 已完成 |
| [NCC-Home-hotwebs.md](./NCC-Home-hotwebs.md) | hotwebs/ 前端结构、nccloud 资源对应、OpenAPI 文档路径 | ✅ 已完成 |
| [NCC-Home-framework.md](./NCC-Home-framework.md) | framework/ sysconfig 工具分析（38 插件）+ lib/ 运行时 JAR 清单 | ✅ 已完成 |
| [NCC-Home-resources.md](./NCC-Home-resources.md) | resources/ 系统配置（12 分类、关键配置项） | ✅ 已完成 |
| [NCC-Home-nclogs.md](./NCC-Home-nclogs.md) | nclogs/ 日志结构（~40 组件日志、滚动规则） | ✅ 已完成 |
| [NCC-Home-bin.md](./NCC-Home-bin.md) | bin/ 运维脚本工具箱（12 分类、100+ 命令） | ✅ 已完成 |
| [NCC-Home-ierp.md](./NCC-Home-ierp.md) | ierp/ 运行时配置核心（prop.xml、安全、SSO、多数据库脚本） | ✅ 已完成 |
| [NCC-Home-middleware-uap.md](./NCC-Home-middleware-uap.md) | middleware/ + uapmq/ + ump/（消息队列、集群管理、补丁平台） | ✅ 已完成 |

---

## 相关文档

- [OpenAPI 开发文档](../ncc-dev/references/common/openapi-dev.md)
- [NCC 资产包接口开发指南](./NCC资产包接口开发指南.md)
- [项目定制信息](../ncc-dev/references/common/project-customizations.md)

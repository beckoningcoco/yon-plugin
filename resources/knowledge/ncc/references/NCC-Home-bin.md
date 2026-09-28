# NCC Home — bin/ 分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

---

## §1 概述

`bin/` 是 NCC 的**运维工具箱**，约 100+ 脚本/配置文件。核心由 3 个脚本驱动：`uapSetupCmdLine`（环境初始化）→ `sysConfig`/`startup`/`deploy`（功能入口）。所有命令 .bat（Windows）+ .sh（Linux）成对提供。

---

## §2 环境初始化（一切脚本的基础）

### §2.1 uapSetupCmdLine.bat — 核心环境脚本

**所有其他脚本的第一步操作**，定义全局变量：

```bat
set NC_HOME=%cd%                              ← Home 根目录
set ANT_HOME=%NC_HOME%\ant                     ← Ant 构建工具
set NC_JAVA_HOME=%NC_HOME%\ufjdk               ← 用友定制 JDK
set BIN_HOME=%NC_HOME%\bin                     ← bin 自身
set TOMCAT_HOME=%NC_HOME%                      ← 内嵌 Tomcat
set ANT_OPTS=-Xmx512m -XX:MaxPermSize=512m     ← Ant 堆内存
set LOGLEVEL=ERROR                             ← 编译日志级别
set LAST_SERVER_SELECTION=uas                  ← 默认中间件类型
set IS_USE_MASTER=true                         ← 主节点模式
```

**证书配置**（硬编码在脚本中）：
```
NC_STORE_FILE = bin/cert/ufida.jks
NC_CERT_FILE  = bin/cert/ufida.cer
NC_STORE_PASS = ufidauap
NC_STORE_TYPE = JKS
NC_STORE_ALIAS = ufida
```

**CLASSPATH**：
```
starter.jar; tools.jar; ant-launcher.jar; lib/cnytiruces.jar
```

**Java 版本检查**：要求 JDK >= 1.7

### §2.2 configEnv.bat — 环境变量输出

调用 `uapSetupCmdLine.bat` 后输出最终环境变量：
```
JAVA_HOME = E:\NCProject\NCC\jixieyuan\home20260302_newHome\home\ufjdk
NC_HOME   = E:\NCProject\NCC\jixieyuan\home20260302_newHome\home
```

### §2.3 boot.properties — JPF 启动配置

```properties
org.java.plugin.boot.pluginsRepositories=../framework/mwconfig
org.java.plugin.boot.applicationPlugin=nc.bs.framework.tool.config.core
org.java.plugin.boot.splashImage=splash.jpg
org.java.plugin.boot.integrityCheckMode=light
```

**关键信息**：
- 插件仓库指向 `framework/mwconfig`（证实 sysConfig 的插件来源于 framework）
- 启动画面为 `splash.jpg`
- 应用插件为 `nc.bs.framework.tool.config.core`
- 完整性校验模式为 `light`（轻量）

---

## §3 核心脚本深入

### §3.1 sysConfig.bat — 系统配置器

```
JAVA_HOME = ufjdk
↓
uapSetupCmdLine + wasSetupCmdLine + wlsSetupCmdLine
↓
ant -buildfile buildmisc.xml sysConfig
```

- 启动前检查 `.newInstall` 和 `.needDeployEjb` 标记文件（存在则自动删除）
- 支持传入参数覆盖中间件类型（`%1`）
- 最终通过 Ant 执行 `buildmisc.xml` 的 `sysConfig` target

### §3.2 startup.bat — NCC 服务启动

```
uapSetupCmdLine
↓
java -classpath %NC_CLASSPATH%
     -Dnc.bs.logging.format=text
     -Dnc.server.location=%NC_HOME%
     -Dorg.owasp.esapi.resources=%NC_HOME%/ierp/bin/esapi
     nc.bs.mw.start.NCStarter
```

**主启动类**：`nc.bs.mw.start.NCStarter`
**JVM 参数**：
| 参数 | 值 | 说明 |
|------|-----|------|
| `nc.bs.logging.format` | `text` | 日志格式 |
| `nc.server.location` | `%NC_HOME%` | 服务位置 |
| `org.owasp.esapi.resources` | `%NC_HOME%/ierp/bin/esapi` | ESAPI 安全配置 |

> 可选参数 `%2`：传入时先执行 `nc.bs.sync.SyncConfig` 同步集群配置

### §3.3 deploy.bat — 模块构建部署

```
uapSetupCmdLine
↓
ant -buildfile buildnc.xml
```

- 同样检查 `.newInstall`、`.needDeployEjb` 标记
- 构建目标由 `buildnc.xml` 定义（读取 `builtModules.txt` 模块清单）

---

## §4 构建系统

### §4.1 buildnc.xml — 主构建脚本（Ant）

```xml
<project name="build_nc" default="main" basedir="..">
    <!-- 路径定义 -->
    nc.home         = HOME/
    pub.lib.dir     = HOME/lib/
    ext.lib.dir     = HOME/external/lib/
    fw.dir          = HOME/framework/
    dist.dir        = HOME/dist/
    module.home     = HOME/modules/
    ejb.deploy.xmldir = HOME/ejbXMLs/
    gen.code.dir    = HOME/temp/
    proxy.gen.srcbase = temp/proxy/
    ejb.gen.srcbase   = temp/ejb/
    ncmw.dir        = HOME/middleware/
    stage.dir       = temp/stage/
    platform        = nc6.0
    ejbversion      = 3.0

    <!-- 构建类路径 -->
    run.classpath = external/lib/**/*.jar + lib/**/*.jar + framework/**/*.jar
```

**关键发现**：
- `platform=nc6.0` — 内部代号，NCC 基于 NC6 平台
- EJB 版本 3.0
- 构建输出到 `dist/`，临时产物在 `temp/`

### §4.2 builtModules.txt / fullDeployed.txt

逗号分隔的模块部署清单，约 200 个模块：

```
include.modules=aeam,aedsm,aert,...,erm,...,uapbd,...,workbench,
```

`builtModules.txt` 和 `fullDeployed.txt` 在安装完全量部署后内容相同。增量部署时 `builtModules.txt` 只含变更模块。

---

## §5 模块与 License 注册表

### §5.1 product.property — 产品模块码表（435 行）

NCC 的 License 授权模块注册表，每行格式：`模块码=模块名称`。

**结构**：
```
# 平台层
0002=应用服务器
0003=消息中间件
0004=UAP应用平台
1010=组织管理
1012=权限管理
1014=基础数据管理
1088=应用管理
1090=动态建模平台
012035=OpenAPI
1317=实施工具

# 财务
2006=应收管理
2007=应付管理
2008=应收应付
2012=固定资产
GLPRC=会计平台
2004=收付合同

# 供应链
4006=销售管理
4004=采购管理
4008=库存管理
4020=合同管理

# 资金
3601=资金管理
...

# 人力
6001=组织管理
6007=人员信息管理
6011=人员合同管理
...

# 项目管理
4802=项目管理
...

# 生产制造
5001=工程基础数据
5010=制造公共
...

# RPA 机器人
RPA1903005=银行回单下载机器人
RPA1903008=银行对账机器人
RPA1909030=发票查伪机器人
...

# 银行直连接口
E501=中国工商银行
E502=中国建设银行
E504=中国农业银行
E505=中国银行
E506=交通银行
E507=平安发展银行
E508=上海浦东发展银行
E509=兴业银行
E511=广东发展银行
E515=中信银行
E520=上海银行
...
```

> ⚠️ 该文件中的模块码并非直接对应 `modules/` 目录名，而是 License 授权码。一个 License 码可能对应多个模块目录。

---

## §6 系统身份

### §6.1 systemUUID

```
4ffa2537-b30d-4d0c-8b0c-25ce8d248a5a
```

系统的全局唯一标识，用于 License 绑定、集群节点识别。

### §6.2 证书体系

| 文件 | 路径 | 用途 |
|------|------|------|
| `ufida.jks` | `bin/cert/` | Java KeyStore（密钥库密码：`ufidauap`，别名：`ufida`） |
| `ufida.cer` | `bin/cert/` | X.509 证书 |
| `yonyouserver.cer` | `bin/` | 用友服务器证书 |
| `yonyouserver.jks` | `bin/` | 用友服务器 JKS |

### §6.3 License 文件

| 文件 | 说明 |
|------|------|
| `license*.resp` | License 响应文件（从用友获取） |
| `licnese*` | License 授权文件（解密后的） |
| `hardkey*.req` | 硬件 Key 请求文件 |
| `licRequstBak/` | License 请求历史备份 |

---

## §7 诊断工具配置

`.ini` 文件是纯文本配置模板，每行一条操作指令：

| 文件 | 用途 | 格式 |
|------|------|------|
| `dbtRunSQL.ini` | 批量 SQL 执行 | 每行一条 SQL |
| `dbtCleanDR.ini` | 逻辑删除清理 | SQL 清理语句 |
| `checkSRVConnect.ini` | 服务连通性检查 | 每行一个 URL（`http://127.0.0.1/login.jsp`） |
| `supportDB.ini` | 数据库信息收集 | 数据库连接相关配置 |

---

## §8 分类速查

### 日常运维

| 命令 | 说明 |
|------|------|
| ⭐ `sysConfig.bat/sh` | 系统配置器 GUI（Ant → `buildmisc.xml` sysConfig target） |
| `sysMonitor.bat/sh` | 系统监控 GUI |
| `sysMonitorCmd.bat/sh` | 监控命令行版 |
| ⭐ `startup.bat/sh` | NCC 启动（`java nc.bs.mw.start.NCStarter`） |
| ⭐ `stop.bat/sh` | NCC 停止 |
| `startServer.bat` | 服务启动（完整模式） |
| `stopServer.bat` | 服务停止（完整模式） |

### 模块部署

| 命令 | 说明 |
|------|------|
| ⭐ `deploy.bat/sh` | 模块构建部署（Ant → `buildnc.xml`，读取 `builtModules.txt`） |
| `wasDeploy.bat/sh` | WebSphere 专用部署 |
| `wlsDeploy.bat/sh` | WebLogic 专用部署 |

### 环境诊断

| 命令 | 说明 |
|------|------|
| `checkDBConnect.bat/sh` | 数据库连通性检查 |
| `checkSRVConnect.bat/sh` | 服务连通性检查（URL 列表见 `.ini`） |
| `checkLicence.bat/sh` | License 有效性检查 |
| `checkFileDuplicate.bat/sh` | 重复文件检查 |
| `checkFileName.bat/sh` | 文件名规范检查 |
| `checkModuleName.bat/sh` | 模块名规范检查 |

### 数据库工具

| 命令 | 说明 |
|------|------|
| `dbtRunSQL.bat/sh` | SQL 脚本执行器（SQL 写在 `.ini` 中） |
| `dbtCleanDR.bat/sh` | 逻辑删除数据清理 |

### 信息收集（提工单用）

| 命令 | 说明 |
|------|------|
| `supportNC.bat/sh` | NC 环境信息收集 |
| `supportDB.bat/sh` | 数据库信息收集 |
| `supportIHS.bat/sh` | IHS 信息收集 |
| `supportWAS.bat/sh` | WAS 信息收集 |

### 代码生成

| 命令 | 说明 |
|------|------|
| `genCacheTemplet.bat/sh` | 缓存模板生成 |
| `genClientPack.bat/sh` | 客户端安装包生成 |
| `genLicense3.bat/sh` | License 文件生成 |
| `genLoginJar.bat/sh` | 登录模块 JAR 生成 |
| `genMonitorJar.bat/sh` | 监控模块 JAR 生成 |
| `genConsoleJsp.bat/sh` | 控制台 JSP 生成 |

### 清理工具

| 命令 | 说明 |
|------|------|
| `cleanClassesJAR.bat/sh` | 清理模块 classes 中的 JAR |
| `cleanClassesMETA-INF.bat/sh` | 清理 META-INF 下多余 class |
| `cleanLangFile.bat/sh` | 清理多语言文件 |
| `cleanModuleFile.bat/sh` | 清理模块冗余文件 |
| `cleanProxyFile.bat/sh` | 清理代理文件 |

### 索引维护

| 命令 | 说明 |
|------|------|
| `makeIndex.bat/sh` | 创建/重建索引 |
| `optimizeIndex.bat/sh` | 索引优化 |

### 中间件集成

| 命令/目录 | 说明 |
|-----------|------|
| `configEnv.bat` | 环境变量配置（输出 NC_HOME、JAVA_HOME） |
| `domainCmd.bat/sh` | 域管理命令 |
| `ihsConfigGen.bat/sh` | IHS 配置生成 |
| `wasInstall.bat/sh` | WAS 安装 |
| `wasProfileCmd.bat/sh` | WAS Profile 管理 |
| `wasSetupCmdLine.bat/sh` | WAS 命令行环境初始化 |
| `wlsSetupCmdLine.bat/sh` | WLS 命令行环境初始化 |
| `wasinstall/`、`waslib/`、`wlslib/`、`waspatch/` | 中间件资源文件 |
| `liberty.properties` | WebSphere Liberty 路径配置（占位） |

### 客户端

| 命令/文件 | 说明 |
|-----------|------|
| `clientInstall.bat/sh` | 客户端安装器 |
| `clientStartup.bat/sh` | 客户端启动器 |
| `clientInstall.dat` 等 | 客户端安装/启动配置 |

### 其他

| 文件 | 说明 |
|------|------|
| `fallback.jar` / `jarbat.jar` / `jarsh.jar` | 工具 JAR |
| `root.bat/sh` | Root 权限操作 |
| `scanjs.bat` | JS 文件扫描 |
| `splash.jpg` | sysConfig 启动画面 |
| `configsys.log` | sysConfig 操作日志 |
| `clientlog.log` | 客户端操作日志 |
| `p.dat` / `exevbs.dat` | 遗留配置文件 |
| `loginml.txt` / `loginres.txt` / `modincejb.txt` | 遗留日志输出 |
| `uapssl.conf.vm` | UAP SSL 配置 Velocity 模板 |

---

## §9 脚本调用关系图

```
uapSetupCmdLine.bat          ← 环境变量（所有脚本的第一步）
├── sysConfig.bat            ← Ant → buildmisc.xml sysConfig → framework/mwconfig
├── startup.bat              ← java nc.bs.mw.start.NCStarter
├── deploy.bat               ← Ant → buildnc.xml（读 builtModules.txt）
├── sysMonitor.bat           ← 监控 GUI
├── check*.bat               ← 各诊断脚本
├── gen*.bat                 ← 各代码生成脚本
├── clean*.bat               ← 各清理脚本
└── support*.bat             ← 信息收集脚本
```

---

## §10 深度判断

| 维度 | 判断 |
|------|------|
| 环境初始化机制 | ✅ uapSetupCmdLine 完整分析（变量、证书、CLASSPATH） |
| 启动机制 | ✅ startup.bat → NCStarter 完整链路 |
| 构建机制 | ✅ buildnc.xml → builtModules.txt 完整链路 |
| sysConfig 机制 | ✅ boot.properties → JPF → framework/mwconfig |
| 系统身份 | ✅ UUID、证书、License 全部覆盖 |
| License 模块注册表 | ✅ product.property 435 行结构分析 |
| 诊断 .ini 格式 | ✅ 4 种 .ini 模板格式说明 |

**结论：bin 分析完成，无需继续深入。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [framework/ sysconfig 工具](./NCC-Home-framework.md)（`sysConfig.bat` 启动的目标）
- [modules/ 深度分析](./NCC-Home-modules.md)（`builtModules.txt` 和 `product.property` 引用的模块）

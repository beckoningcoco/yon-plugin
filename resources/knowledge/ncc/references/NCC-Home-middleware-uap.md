# NCC Home — middleware / UAP 平台组件

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

---

## §1 middleware/ — 中间件部署适配层

NCC 内嵌 Tomcat（由 `ierp/bin/prop.xml` 中 `BootStrapTomcatService` 管理），`middleware/` 提供 WAS/WLS 部署支持。

### 结构

```
middleware/
├── mw.jar               ← 中间件管理核心
├── core.jar / comp.jar  ← 核心/组件
├── starter.jar          ← 启动器
├── tcsrc.jar            ← Tomcat 源码
├── fwejb.jar            ← EJB 框架
├── ecj-4.18.jar         ← Eclipse Java 编译器
├── j2ee.jar / javaee.jar ← Java EE API
├── jmx.jar / jdmkrt.jar ← JMX 管理
├── jstl.jar / standard.jar ← JSTL 标准标签库
├── classes/org/         ← 编译类
├── was/                 ← WebSphere 版本配置（2.1 / 3.0 / 3.1）
└── wls/                 ← WebLogic 版本配置（2.1 / 3.0 / 3.1）
```

### 核心发现

- NCC 为主的内嵌 Tomcat 模式，不依赖外部中间件
- `was/` 和 `wls/` 仅用于需要部署到外部 WAS/WLS 的场景
- 版本号 2.1/3.0/3.1 对应 NCC 平台大版本迭代

---

## §2 uapmq/ — UAP 消息队列（Apache ActiveMQ）

完整的 Apache ActiveMQ 5.x 安装，用于 NCC 内部的异步消息通信。

### 结构

```
uapmq/
├── conf/                ← ⭐ ActiveMQ 配置
├── bin/                 ← ActiveMQ 启动/停止脚本
├── lib/                 ← ActiveMQ JAR
├── webapps/             ← Web Console（管理界面）
├── docs/                ← 文档
├── example/             ← 示例
├── LICENSE / NOTICE     ← Apache 2.0
└── WebConsole-README.txt
```

### conf/ 目录

#### credentials.properties — 连接凭证

```properties
activemq.username=system
activemq.password=manager     ← ⚠️ 默认密码
guest.password=password
```

#### UAPmq.xml — 主配置

```xml
<broker brokerName="localhost" dataDirectory="${activemq.data}"
        xmlns="http://activemq.apache.org/schema/core">
```

基于 Spring + ActiveMQ XML Schema 的 Broker 配置。

#### 其他配置文件

| 文件 | 用途 |
|------|------|
| `jetty.xml` | 内嵌 Jetty（Web Console 用） |
| `log4j.properties` | MQ 日志 |
| `logging.properties` | Java Logging |
| `jmx.access` / `jmx.password` | JMX 监控认证 |
| `camel.xml` | Apache Camel 集成路由 |
| `UAPmq-jdbc.xml` | JDBC 持久化存储 |
| `UAPmq-*-network-broker*.xml` | 网络 Broker（静态/动态）集群 |
| `UAPmq-scalability.xml` | 可伸缩性配置 |
| `UAPmq-security.xml` | 安全配置 |
| `UAPmq-stomp.xml` | STOMP 协议支持 |
| `UAPmq-throughput.xml` | 高吞吐量配置 |
| `UAPmq-demo.xml` | 演示配置 |

---

## §3 ump/ — UAP 管理平台（集群 + 补丁管理）

### 结构

```
ump/
├── config/              ← ⭐ 核心配置
│   ├── server.xml       ← 服务端口
│   ├── ServiceRegister.xml ← 25 个 RPC 服务
│   ├── version.xml      ← V3.0.2 / 2021-08-31
│   ├── settings.properties
│   └── ...
├── modules/framework/   ← UMP 框架模块
├── lib/                 ← JAR
├── patchmng/            ← 补丁管理
├── upgrade/             ← 升级
├── images/              ← UI 图标
├── startup.sh / stop.sh ← 启停脚本
├── startup.jar          ← 启动器
└── ump.sh / umpstart    ← 管理脚本
```

### §3.1 server.xml — 服务端口

```xml
<server>
    <master>
        <address></address>     ← Master 节点（空 = 本机）
        <port></port>
    </master>
    <service>
        <Connector port="5763" protocol="iiop" connectionTimeout="20000"/>
        <Host name="localhost" ip=""/>
    </service>
    <checkServer>ServiceDispatcherServlet</checkServer>
    <rmiDataTransport>57631</rmiDataTransport>
    <lang>GBK</lang>
</server>
```

| 参数 | 值 | 说明 |
|------|-----|------|
| Connector port | `5763` | IIOP 协议端口 |
| rmiDataTransport | `57631` | RMI 数据传输端口 |
| protocol | `iiop` | CORBA IIOP（跨语言远程调用） |
| lang | `GBK` | 默认编码 |

### §3.2 settings.properties

```properties
illegalModulename=classes,client,config,lib,METADATA,META-INF
propSource=0
needConflictDetect=Y
multiNetCard=N
```

| 参数 | 说明 |
|------|------|
| `illegalModulename` | 不参与管理的目录名（与 modules 结构一致） |
| `needConflictDetect=Y` | 启用集群冲突检测 |
| `multiNetCard=N` | 非多网卡模式 |

### §3.3 version.xml

```xml
<currentVersion>V3.0.2</currentVersion>
<publishTime>2021-08-31</publishTime>
<clientVersion>V3.0.2</clientVersion>
```

### §3.4 ServiceRegister.xml — 25 个服务清单

UMP 通过 IIOP 协议对外暴露 25 个 RPC 服务：

| 分类 | 服务接口 | 功能 |
|------|----------|------|
| **集群管理** | `IStopServer` | 停止服务器 |
| | `IClusterConsistencyScannerService` | 集群一致性扫描 |
| | `IClusterConflictDetecteServer` | 集群冲突检测 |
| | `ISpcifiedPathConflictDetecte` | 指定路径冲突检测 |
| **节点管理** | `INCIsSatrtCheck` | NCC 实例启动检查 |
| | `INCClusterNodeinfoService` | 集群节点信息（解析 prop.xml） |
| | `IPeerServerRegistToMaster` | 从节点注册到主节点 |
| | `IUmpServerNodeinfoService` | UMP 节点信息查询 |
| | `ITestConnect` | 节点连接测试 |
| **模块信息** | `IGainNCModules` | 获取全部 NC 模块 |
| | `IGainNCModule` | 获取单个 NC 模块 |
| | `ISystemUUID` | 获取系统 UUID |
| **补丁管理** | `IPatchRenation` | 补丁关联 |
| | `IPatchInstall` | 补丁安装 |
| | `IPatchRollback` | 补丁回滚 |
| | `IPullPatch` | 拉取待装补丁 |
| | `IPatchBackup` | 补丁备份 |
| | `IPatchRecordMng` | 补丁记录管理 |
| | `IRollBackPreconditionCheck` | 回滚前置条件检查 |
| | `IDeleteFileAfterPatchRollback` | 回滚后清理 |
| **文件传输** | `IFileTransfer` | 集群文件传输 |
| **版本升级** | `IAgentUpgrade` | Agent 升级 |
| **其他** | `IMiddlewareTime` | 中间件时间 |
| | `IConflictFile` | 冲突文件管理 |
| | `IConfigProdutionService` | UMP 配置状态 |

---

## §4 综合判断

| 组件 | 本质 | 核心功能 |
|------|------|----------|
| `middleware/` | 中间件适配层 | 支持 WAS/WLS 外部中间件部署（当前内嵌 Tomcat 模式不依赖） |
| `uapadp/` | 空目录 | 无实际内容 |
| `uapmq/` | Apache ActiveMQ | NCC 内部消息队列（异步通信、事件总线） |
| `ump/` | UAP 管理平台 | 集群管理 + 补丁分发 + 文件同步，端口 5763/57631 |

**结论：全部四个组件分析完成。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [ierp/ 运行时配置](./NCC-Home-ierp.md)（prop.xml 启动 ump、uapmq 等组件）

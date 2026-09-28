# NCC Home — ierp/ 分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

> ⚠️ **重要纠正**：`ierp/` 不是"国际化 ERP"，而是 NCC 的**运行时配置核心目录**。包含服务启停、JVM 参数、安全策略、SSO、日志、数据库建表脚本、代码生成元数据等。

---

## §1 目录总览

```
ierp/
├── bin/           ← ⭐ 运行时配置核心（60+ 配置文件，逐个分析见 §2）
├── sf/            ← ⭐ 服务框架（SSO/认证/主题/密码策略）见 §3
├── metadata/      ← 代码生成元数据 见 §4
├── install/       ← 安装调整脚本
├── language/      ← 语言包
├── yht/           ← 云后台配置
└── acccheck/      ← 账户检查
```

---

## §2 bin/ — 逐一分析

### §2.1 prop.xml — 主服务器配置（启动入口）

```xml
<domain>
    <server>
        <javaHome>./ufjdk</javaHome>
        <jvmArgs>
            -Xmx4096m  -XX:MetaspaceSize=512m  -XX:MaxMetaspaceSize=1024m
            -Dsun.reflect.noInflation=true  -Djava.awt.headless=true
            -Duser.timezone=GMT+8  -Dfile.encoding=UTF-8
            -Dlog4j2.formatMsgNoLookups=true
        </jvmArgs>
        <servicePort>8005</servicePort>
        <http>
            <address>127.0.0.1</address>
            <port>8083</port>                    ← ⭐ NCC HTTP 端口
        </http>
    </server>
</domain>
<enableHotDeploy>false</enableHotDeploy>
<isEncode>true</isEncode>
```

| 参数 | 值 | 说明 |
|------|-----|------|
| `-Xmx` | `4096m` | JVM 最大堆 4GB |
| `-XX:MetaspaceSize` | `512m` | 元空间初始 |
| `-XX:MaxMetaspaceSize` | `1024m` | 元空间最大 1GB |
| `http/port` | `8083` | ⭐ HTTP 端口 |
| `servicePort` | `8005` | Tomcat Shutdown 端口 |
| `enableHotDeploy` | `false` | 热部署关闭 |
| `timezone` | `GMT+8` | 时区 |

**内置服务**：

| 服务名 | 实现类 | 说明 |
|--------|--------|------|
| `StartTomcat` | `nc.bs.tomcat.startup.BootStrapTomcatService` | 内嵌 Tomcat |
| `EJB_SERVICE` | `nc.bs.mw.naming.EJBContainerService` | EJB 容器 |

### §2.2 serviceslist.xml — 基础设施服务清单

```xml
<serverice><code>IPreAlertConfigService</code><desc>预警服务</desc></serverice>
<serverice><code>DBTrans</code><desc>数据传输服务</desc></serverice>
<serverice><code>fip</code><desc>会计平台</desc></serverice>
<serverice><code>crawlerservice</code><desc>爬虫服务</desc></serverice>
```

### §2.3 systemconfig.xml — 登录安全策略

```xml
<MaxLoginFailure>5</MaxLoginFailure>       ← 最大登录失败次数
<ClaimingInterval>600</ClaimingInterval>   ← 登录间隔 600 秒
<AutoLogoutTime>0</AutoLogoutTime>         ← 0=不自动登出
```

### §2.4 session.xml — 会话配置

```xml
<expireTime>60</expireTime>               ← 会话过期 60 分钟
<sessionListenerClass>
    nccloud.baseapp.session.listener.UapSessionExListener
</sessionListenerClass>
```

### §2.5 security.properties — 密钥库配置

```properties
storeType=jks,jceks,bks,uber,pkcs12      ← 支持的密钥库类型
```

### §2.6 signature.xml — 电子签章配置

```xml
<providerCode>infosec</providerCode>       ← 信安世纪电子签章
<ISignet>cn.com.infosec.ufida.elesign.ISignetImpl</ISignet>
<IVerifySign>cn.com.infosec.ufida.elesign.IVerifySignImpl</IVerifySign>
```

### §2.7 opmconfig.properties — OpenAPI 管理配置

| 参数 | 值 | 说明 |
|------|-----|------|
| `CB_ringBufferSizeInClosedState` | `2` | 熔断器关闭状态缓冲区 |
| `CB_failureRateThreshold` | `10` | 熔断失败率阈值（%） |
| `CB_waitDurationInOpenState` | `1000` | 熔断→半开等待（秒） |
| `RETRY_maxAttempts` | `1` | 最大重试 |
| `RL_timeoutDuration` | `100` | 超时（毫秒） |
| `RL_limitForPeriod` | `100` | 限流周期内可执行次数 |
| `expires_in` | `1000000` | Token 过期（约 16.7 分钟） |
| `isGzip` | `false` | 前端压缩 |
| `CACHE_EXPIRE` | `2` | 缓存有效期 |
| `CACHE_MAXIMUMSIZE` | `1024` | 缓存最大条目 |

### §2.8 pkgen.properties — 主键生成器

```properties
INITNCC=1000000000000I          ← NCC 主键起始值（万亿级）
```

### §2.9 concurrent-control.properties — 并发控制

```properties
maxnum_loader_in_server=5       ← 服务器最大并发加载数
```

### §2.10 blacklist.properties — 类加载黑名单

```properties
com.alibaba.fastjson              ← FastJSON（安全限制）
org.apache.xpath                  ← XPath
org.apache.xalan                  ← Xalan
```

> 这是 JVM 级别的类加载黑名单，禁止 NCC 加载这些第三方库。

### §2.11 jarversion.ini — 客户端 JAR 版本

```
UAP_Login_v6.jar
```

> 客户端登录 JAR 的文件名/版本号，被 `uapSetupCmdLine.bat` 读取。

### §2.12 dbdriverset.xml — 数据库驱动模板（SysConfig 用）

完整的数据库连接模板配置，sysConfig GUI 的数据源配置界面读取此文件。

**支持的数据库**：

| 数据库 | 版本 | 驱动类 | JDBC URL 模板 |
|--------|------|--------|---------------|
| SQL Server | 2008~2019 | `com.microsoft.sqlserver.jdbc.SQLServerDriver` | `jdbc:sqlserver://127.0.0.1:1433;database=nc60` |
| Oracle | 10g | `oracle.jdbc.OracleDriver` | `jdbc:oracle:thin:@127.0.0.1:1521:nc60` |
| Oracle | 11g~19c | `oracle.jdbc.OracleDriver` | `jdbc:oracle:thin:@127.0.0.1:1521/nc6x` |
| Oracle RAC | 11g~19c | 同上 | RAC 多节点负载均衡 URL |

**连接池默认值**：`maxCon=50`, `minCon=10`

**驱动的三种模式**：
- `JDBC` — 标准单节点
- `JDBC-bea` — WebLogic 专用
- `JDBC-RAC` — Oracle RAC 集群

### §2.13 servicerun.xml — 服务运行时

```xml
<enableBgThread>true</enableBgThread>           ← 后台线程
<enableRunUnAssigned>true</enableRunUnAssigned> ← 允许运行未分配模块
<loadLightTask>true</loadLightTask>             ← 轻量任务加载
```

### §2.14 bda.xml — 数据归档配置

```xml
<bda>
    <thrdpool>
        <corepoolsize>5</corepoolsize>         ← 归档核心线程数
    </thrdpool>
    <task>
        <useTemp>true</useTemp>                ← 临时表过渡
        <delBatch>10000</delBatch>             ← 每批删除 10000 行
        <parallel>2</parallel>                 ← 数据库并行度
        <isEvaluate>true</isEvaluate>          ← 迁移前评估
        <isStats>true</isStats>                ← 结束时统计
    </task>
</bda>
```

### §2.15 servermodulemapping.properties — 服务→模块映射

将业务域映射到 License 产品码。约 28 行，示例：

```properties
init_cloud_base=1030,1501,...,1088,ffw    ← 平台基础
fi-gl=2002,2000,2055                       ← 总账
fi-erm=2011                                ← 费用报销
fi-fip=1017                                ← 会计平台
fi-rm=2007                                 ← 应收
ftm=2006,2008,2004,...,3612                ← 应付
scm-scm=4001,4004,4005,...                 ← 供应链
hr-base=6001,6002,6003,...                 ← HR 基础
hr-core=6008,6013,6015,...                 ← HR 核心
mm-mm=5001,5008,5009,...                   ← 生产制造
pm-pm=4801,4802,4806,...                   ← 项目管理
ssc-ssc=1056,7010,7030,...                 ← 共享服务
am-fa=4501,2012                            ← 固定资产
```

> 格式：`{服务域}={产品码1},{产品码2},...`

### §2.16 ESAPI/ — OWASP 安全配置

| 文件 | 用途 |
|------|------|
| `ESAPI.properties` | ESAPI 主配置（Production 版本） |
| `antisamy-esapi.xml` | AntiSamy XSS 过滤规则 |
| `ESAPI-AccessControlPolicy.xml` | 访问控制策略 |
| `validation.properties` | 输入校验规则（正则） |

### §2.17 其他配置汇总

| 文件 | 内容/用途 |
|------|-----------|
| `log4j2.xml` | Log4j 2.x 主配置 |
| `log4j.properties` | Log4j 1.x 遗留 |
| `log-config.properties` | 日志通用 |
| `logger-config.properties` | 日志模块配置 |
| `logger-redis-config.properties` | Redis 日志 |
| `caprop.xml` | CA 证书属性 |
| `CAForceconf.properties` | CA 强制认证开关 |
| `connector.properties` | JCA 连接器参数 |
| `mock.properties` | Mock 测试配置 |
| `mobileplugin.xml` | 移动端插件 |
| `syncfile.xml` | 文件同步 |
| `servicerun-profiles/defaultservicerun-profile1.xml` | 服务运行 Profile |
| `servicedeploy/dedicateserver.xml` | 专属服务器配置 |
| `service_route/client_side.xml` | 客户端服务路由 |
| `redisconfig/cache_nodes.xml` | Redis 节点 |
| `redisconfig/cache_topic.xml` | Redis 主题 |
| `nccredis/redis_appcode.properties` | Redis AppCode |
| `searchmetadata/` | 搜索引擎（Ante 配置、mmseg4j 分词器词典、索引策略） |
| `lockconfig/pklock.properties` | 主键锁策略（Redis） |
| `scheduleengine.xml` | 调度引擎 |
| `scheduleflag.properties` | 调度开关 |
| `discache.xml` | 磁盘缓存 |
| `cluster-message-config.properties` | 集群消息 |
| `ncjca-conf.xml` | JCA 连接器 |
| `message4pf.xml` | 平台消息 |
| `flowtemplete.properties` | 流程模板 |
| `extable/` | 外部表 DDL/DML 脚本（8 种数据库） |
| `subdb/` | 分库建表脚本（6 种数据库 + 分离配置） |
| `security_file_datasource/` | 安全库建表脚本（4 种数据库） |
| `firstverify-class-conf.properties` | 一级校验类 |
| `secondverify-class-conf.properties` | 二级校验类 |

---

## §3 sf/ — 服务框架

### §3.1 核心配置

| 文件 | 内容 |
|------|------|
| `busiCenterConfig.xml` | 业务中心列表（**当前为空**） |
| `systemconfig.xml` | 系统参数 |
| `superadmin.xml` | 超级管理员凭证（加密哈希） |
| `authenConfig.xml` | 认证方式配置 |

### §3.2 SSO 与安全

| 文件 | 用途 |
|------|------|
| `ssoConfig.xml` | SSO 单点登录 |
| `nccssoConfig.xml` | NCC 专用 SSO（含备份 `_bak.xml`） |
| `caRegisterCenter.xml` | CA 注册中心 |
| `pwdConfSecurityLimitationInfo.xml` | 密码复杂度策略 |
| `nclln.ks` | 密钥库文件（Keystore） |

### §3.3 界面与外观

| 文件 | 用途 |
|------|------|
| `skinconf.xml` | 皮肤配置 |
| `themeconf.xml` | 主题配置 |
| `loginuiconfig.xml` | 登录界面配置 |
| `helpconf.xml` | 帮助文档配置 |

### §3.4 功能模块

| 目录/文件 | 内容 |
|-----------|------|
| `AppConf/` | 应用配置 |
| `attachconfig/` | 附件配置 |
| `attachmentfsconfig/` | 附件文件系统配置 |
| `imconfig/` | 即时通讯 |
| `mailapprove/` | 邮件审批 |
| `powerconfig/` | 权限配置 |
| `ufsconfig/` | UFS 文件存储 |
| `updateconfig/` | 系统更新 |
| `userOccupyModuleMap/` | 用户占用模块映射 |
| `userOccupyModuleMapForNCC/` | NCC 版用户模块映射 |
| `xmldataformp/` | MP 平台 XML 数据 |
| `freeLic.dat` | 免费 License（二进制） |
| `funnodeOwnModule.dat` | 功能节点→模块（二进制） |
| `sysoper_log.properties` | 操作日志配置 |
| `wbaloneconfig.xml` | 独立负载均衡 |

---

## §4 metadata/ — 代码生成元数据

| 文件 | 内容 |
|------|------|
| `dbTypes.xml` | 数据库字段类型列表：`char, varchar, image, decimal, text` |
| `AccessorTemplate.xml` | 数据访问器代码模板 |
| `baseType.xml` | 基础类型定义 |
| `StereoType.xml` | 构造型（Stereotype） |
| `dbConnectProp.xml` | 数据库连接属性 |
| `version60.xml` | NC6 版本兼容 |
| `Patterns.xml` | 设计模式 |
| `Features.xml` | 功能特性 |
| `serviceConfig.xml` | 服务配置 |
| `cacheFile.xml` | 缓存文件 |
| `extensionbuild.xml` | 扩展构建 |
| `cur_industry.properties` | 当前行业 |

---

## §5 其他目录

| 目录 | 内容 |
|------|------|
| `install/adjust.xml` | 安装调整脚本 |
| `install/appendDBML/` | 追加数据库 ML |
| `install/sqlTransConf/` | SQL 转换配置 |
| `language/simpchn.lang` | 简体中文语言包 |
| `yht/macloud.properties` | 云后台配置 |

---

## §6 核心发现

| 发现 | 说明 |
|------|------|
| **NCC 内嵌 Tomcat** | 不是外部中间件，`BootStrapTomcatService` 拉起 |
| **登录策略** | 最多错 5 次锁定，10 分钟间隔，永不过期登出 |
| **会话 60 分钟过期** | `session.xml` |
| **电子签章供应商** | 信安世纪（infosec） |
| **主键起始值** | `1000000000000I`（万亿级） |
| **OpenAPI Token** | ~16.7 分钟过期，熔断阈值 10% |
| **FastJSON 被禁** | 类加载黑名单中 |
| **数据库连接池** | 默认 50 最大 / 10 最小 |
| **支持 9 种数据库** | Oracle/SQL Server/DB2/DM/Gauss/HighGo/KingBase/PostgreSQL/MySQL |
| **busicenter 配置为空** | 未启用多业务中心 |
| **管理员凭证加密存储** | `superadmin.xml` 为哈希串 |

---

## §7 深度判断

`ierp/` 下 60+ 个配置文件已全部阅读、分析、分类，无遗漏。

**结论：ierp 分析完成。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [bin/ 运维工具](./NCC-Home-bin.md)（`startup.bat` ← `uapSetupCmdLine.bat` ← `prop.xml`）
- [framework/ sysconfig](./NCC-Home-framework.md)（sysConfig GUI 管理 `prop.xml` + `dbdriverset.xml` 等）

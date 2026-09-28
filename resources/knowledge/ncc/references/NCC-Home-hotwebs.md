# NCC Home — hotwebs/ 分析

> 父文档: [NCC-Home-README.md](./NCC-Home-README.md) | **分析日期**: 2026-07-04

---

## 快速导航

| 我想知道... | 跳转 |
|-------------|------|
| hotwebs 下有哪些 Web 应用 | [§1 整体结构](#1-整体结构) |
| nccloud（主前端）的内部结构 | [§2 nccloud](#2-nccloud--主前端) |
| 前端资源如何与后端模块对应 | [§2.1 resources/ 微前端架构](#21-resources--微前端架构) |
| OpenAPI 文档存在哪 | [§2.2 resources/api/](#22-resourcesapi--openapi-文档) |
| WEB-INF 配置了什么 | [§2.3 WEB-INF 配置详解](#23-web-inf-配置详解) |
| 其他 Web 应用的结构 | [§3 其他 Web 应用](#3-其他-web-应用) |

---

## §1 整体结构

`hotwebs/` 是 NCC 的**热部署 Web 应用目录**，含一个主前端 + 若干独立功能应用。

```
hotwebs/
├── nccloud/       ← ⭐ NCC 主前端（核心）
├── lfw/           ← 轻量框架 Web
├── portal/        ← 门户
├── fs/            ← 文件服务
├── bqchart/       ← BQ 图表
├── ebvp/          ← 供应商门户
├── uapws/         ← UAP Web Service
├── uapsep/        ← UAP SEP
├── itrus/         ← 安全相关
├── iwebap/        ← iWeb 应用
├── ncchr/         ← HR Web
└── src/           ← 前端源码
```

| 应用 | 职能 |
|------|------|
| `nccloud` | ⭐ NCC 主前端（用户日常操作的界面） |
| `lfw` | 轻量级框架 Web 前端 |
| `portal` | 企业门户集成 |
| `fs` | 文件/附件服务 |
| `bqchart` | BQ 商业智能图表渲染 |
| `ebvp` | 供应商门户（供应商自助） |
| `uapws` | UAP Web Service 端点 |
| `uapsep` | UAP SEP 服务端点 |
| `itrus` | 安全/证书相关 Web |
| `iwebap` | iWeb 应用 |
| `ncchr` | HR 独立 Web 前端 |

---

## §2 nccloud/ — 主前端

### 顶层结构

```
nccloud/
├── WEB-INF/           ← Java Web 标准配置（web.xml + Spring + 安全）
├── resources/         ← ⭐ 前端资源（微前端 SPA）
├── html/              ← 静态 HTML
├── src/               ← 前端源码
└── index.jsp          ← 入口页
```

---

### §2.1 resources/ — 微前端架构

`resources/` 下有 **150+ 个子目录**，命名与 `modules/` 下的模块名**一一对应**。

```
modules/erm/     ←→  hotwebs/nccloud/resources/erm/
modules/uapbd/   ←→  hotwebs/nccloud/resources/uapbd/
modules/gl/      ←→  hotwebs/nccloud/resources/gl/
...
```

→ 查看 `resources/` 目录列表就能知道哪些模块有前端页面。

#### 内部结构（以 erm/ 为例）

每个模块前端采用 **SPA 微前端 + 路由懒加载** 模式：

```
resources/erm/
├── basic-settings/                    ← 功能分类
│   └── query-object-registration/     ← 子功能
│       └── router/
│           ├── index.html             ← 路由入口
│           ├── index.4f573da0.js      ← 编译后的 JS bundle（哈希命名）
│           └── index.4f573da0.js.map  ← Source Map
├── bill-manage-center/                ← 功能分类
│   ├── bill-manage/                   ← 子功能：单据管理
│   │   └── router/
│   │       ├── index.html
│   │       ├── index.34b4bb43.js
│   │       └── index.34b4bb43.js.map
│   └── bill-query/                    ← 子功能：单据查询
│       └── router/
│           ├── index.html
│           └── index.{hash}.js
└── ...
```

**架构特征**：

| 特征 | 说明 |
|------|------|
| 功能分类 | 第一层按业务场景分组（基础设置、单据管理、查询...） |
| 子功能路由 | 每个子功能有独立的 `router/`，实现懒加载 |
| JS 哈希命名 | `index.{hash}.js`，用于缓存管理和版本控制 |
| 自包含 | 每个子功能是独立的 HTML+JS 单元，可独立部署 |

---

### §2.2 resources/api/ — OpenAPI 文档

NCC 接口文档的标准存放路径：

```
hotwebs/nccloud/resources/api/
├── modules/           ← OpenAPI 文档（按模块），~50 个模块有文档
│   ├── erm/           ← 费用报销 API 文档
│   ├── gl/            ← 总账 API 文档
│   ├── arap/          ← 应收应付 API 文档
│   ├── fip/           ← 财务接口平台 API 文档
│   ├── so/            ← 销售 API 文档
│   ├── ic/            ← 库存 API 文档
│   ├── uapbd/         ← 基础数据 API 文档
│   ├── lcdp/          ← 低代码平台 API 文档
│   └── ... (~50 个模块)
└── case/              ← 用例
```

> 对应开放文档路径：`/nccloud/resources/api/modules/{模块名}/`
>
> 这与 [OpenAPI 开发指南](../ncc-dev/references/common/openapi-dev.md) 中 `nchome/hotwebs/nccloud/resources/api/modules/` 一致。

---

### §2.3 WEB-INF 配置详解

#### web.xml

| 配置项 | 内容 | 说明 |
|--------|------|------|
| `display-name` | `nccloud` | 应用名 |
| `ctxPath` | `/nccloud` | 上下文路径 |
| `org.restlet.application` | `UAPRestJaxRsApplication` | ⭐ OpenAPI REST 总入口 |
| Filter: `EntryLeaveFilter` | `nccloud.framework.core.filter.EntryLeaveFilter` | 请求进入/离开追踪 |
| Filter: `CharacterEncodingFilter` | UTF-8 | 编码 |
| Filter: `HostFilter` | `nccloud.framework.core.filter.HostFilter` | 主机名校验 |

#### miscellaneous.xml — 运行时开关

```xml
<miscellaneous>
    <gzip>false</gzip>                <!-- GZip 压缩 -->
    <mark>false</mark>                <!-- 数据签名 -->
    <aesKey>false</aesKey>            <!-- AES 加解密 -->
    <localStorage>false</localStorage> <!-- 前端 localStorage 加密 -->
    <automated_test>false</automated_test> <!-- 自动化测试 -->
    <responseWithStack>true</responseWithStack> <!-- Response 含堆栈 -->
    <protectReplayAttack>false</protectReplayAttack> <!-- 防重放攻击 -->
</miscellaneous>
```

| 开关 | 用途 | 适用场景 |
|------|------|----------|
| `gzip` | HTTP 压缩 | 生产环境建议开启 |
| `mark` | 数据签名防篡改 | 高安全要求环境 |
| `aesKey` | AES 传输加解密 | 敏感数据场景 |
| `localStorage` | 前端本地存储加密 | 客户端安全 |
| `automated_test` | 自动化测试模式 | 开发/测试环境 |
| `responseWithStack` | 错误响应含 Java 堆栈 | 开发环境建议开启，生产关闭 |
| `protectReplayAttack` | 防重放攻击（需 Redis + mark 配套） | 高安全环境 |

#### security.properties

```
Content-Security-Policy= *
```

CSP 全放行（当前），可按需收紧。

#### spring-servlet.xml

```xml
<context:component-scan base-package="nc.ws.opm"/>
```

⭐ 扫描 `nc.ws.opm` 包 — **OPM（Open Platform Management）**，即 OpenAPI 管理层的 Spring Bean 注册。

---

## §3 其他 Web 应用

### lfw/ — 轻量框架

结构极简，仅一个子目录：

```
lfw/
└── frame/         ← 框架页面
```

### portal/ — 门户

传统 JSP 多页面应用：

```
portal/
├── WEB-INF/       ← Web 配置
├── images/        ← 图片资源
├── includecss/    ← CSS
├── includejs/     ← JS
├── tpl/           ← 模板（JSP/HTML）
├── sync/          ← 同步相关
└── ufida.ico      ← 用友 favicon
```

典型的企业门户架构：模板渲染 + 静态资源。

---

## §4 深度判断

| 维度 | 已覆盖 | 无需再深入 |
|------|:--:|------|
| 应用列表与职能 | ✅ | — |
| nccloud 目录骨架 | ✅ | — |
| 微前端 SPA 架构 | ✅ | — |
| WEB-INF 配置（4 个文件） | ✅ | — |
| OpenAPI 文档路径 | ✅ | — |
| 其他 Web 应用结构 | ✅ | — |
| 具体 JS bundle 内容 | ❌ | 属于前端业务代码，不在"技术结构"范围 |
| resources/ 逐个模块结构 | ❌ | 150+ 个模块，与 erm 模式一致，无需逐个分析 |
| api/modules/ 文档内容 | ❌ | 属于接口文档内容，非结构分析 |

**结论：hotwebs 到此为止，无需继续深入。**

---

## 相关文档

- 父文档: [NCC-Home-README.md](./NCC-Home-README.md)
- [modules/ 深度分析](./NCC-Home-modules.md)
- [OpenAPI 开发文档](../ncc-dev/references/common/openapi-dev.md)

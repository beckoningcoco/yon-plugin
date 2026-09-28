---
name: 旗舰版OpenAPI开发指南
description: >
  BIP 旗舰版 OpenAPI 开发完整指南。当用户需要在 BIP 旗舰版中开发开放接口（创建 API 供第三方调用），
  包括 YMS 注册、Controller 编写、token 认证、SDK 客户端调用时，参考该文档。
---

# 旗舰版 OpenAPI 开发指南

## 🔴 代码生成强制规则（生成前必须执行，缺一不可）

> 以下三条是 2026-06-14 实际犯错后总结的铁律，每次生成 OpenAPI 代码时必须按顺序执行。

### 规则 1：代码含 SQL → 必须运行自验证

生成含 SQL 的代码后，**立即用 `datasource_query` 验证**：

```
datasource_query(key="项目名::环境", sql="改写后的安全SELECT")
```
- SELECT → 加 `LIMIT 1`
- INSERT/UPDATE/DELETE → 改写为 `SELECT 列名 FROM 表名 WHERE 1=0`
- ❌ 验证失败 → 修正后重新生成，不交付半成品

### 规则 2：写 SQL 前 → 先确认实体元数据

- 确认 `schema`（数据库名）
- 确认 `字段名 → 数据库列` 映射（column_name，不是 Java 驼峰）
- 确认子表 URI 和关联关系
- **禁止凭记忆编造表名/列名**

### 规则 3：旗舰版保存/修改 → 调原厂 API，不裸写 SQL

```
❌ 错误：INSERT INTO udinghuo.orders ...
✅ 正确：OpenServiceBuilder + Invoke.getResult() 调 platform API
```
- 参考文档：`旗舰版调用OpenAPI.md`、`openapi-sdk调用api的使用示例.md`
- NCC 同理：保存走 `sendMessage()`，查询走 `BaseDAO`/`MDPersistenceService`

### 生成流程

```
确认实体元数据 → 选保存方式(原厂API) → 生成代码 → 自验证SQL → 交付
```

---

## 概述

BIP 旗舰版提供两种 OpenAPI 场景：

| 场景 | 说明 | 参考 |
|------|------|------|
| **服务端开发** | 在 BIP 中写 Controller，通过 YMS 注册发布为 OpenAPI | 本文档 |
| **客户端调用** | 从外部系统调用 BIP 已有的 OpenAPI | `旗舰版调用OpenAPI.md` / `openapi-sdk调用api的使用示例.md` |

---

## 服务端开发：从零发布一个 OpenAPI

### 完整流程

```
① 写 Controller.java  →  ② 注册 YMS 服务  →  ③ 注册 OpenAPI  →  ④ 授权  →  ⑤ 调用
```

### 第一步：编写 Controller

在客开微服务的 `src/main/java` 下创建 Controller：

```java
package com.yonyou.ucf.mdf.third.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

/**
 * 北自所数据同步接口
 */
@RestController
@RequestMapping("/bzs")
public class BzsController {

    @Autowired
    private IBzsService bzsService;

    @PostMapping("/savecontract")
    public ResultMessageDTO saveContract(@RequestBody List<Map<String, Object>> param) {
        List<String> ids = bzsService.saveContract(param);
        ResultMessageDTO result = new ResultMessageDTO();
        result.setCode(200);
        result.setData(ids);
        return result;
    }
}
```

**关键点**：
- 用 `@RestController` + `@RequestMapping`（Spring MVC 标准注解）
- 入参用 `JSONObject`、`Map` 或自定义 DTO
- 返回 `ResultMessageDTO`（BIP 标准返回格式）或 `ResponseUtil`
- 类必须能被 Spring 扫描到（在启动类的包路径下）

### 第二步：YMS 服务注册

在 YMS 控制台注册该 Controller 对应的服务：

1. 登录 YMS 控制台（地址找项目配置）
2. **服务管理** → 新增服务
3. 填写：服务名、服务编码、Controller 全限定类名
4. 注册后，Controller 的路径会在 YMS 网关下生效

### 第三步：OpenAPI 发布与授权

1. 登录 BIP 平台 → **开放平台 / API 网关**
2. **API 发布**：选择 YMS 服务中已注册的接口，发布为 OpenAPI
3. **API 授权**：创建或选择已有应用，获得 `appKey` + `appSecret`

### 第四步：调用方接入

调用方获取 token（HmacSHA256 签名），然后访问：

```
POST https://{domain}/iuap-api-gateway/{tenant}/yonbip/{模块}/{controller-path}/{method-path}
Authorization: Bearer {access_token}
Content-Type: application/json

{ ... body ... }
```

完整调用示例见 `旗舰版调用OpenAPI.md` 和 `openapi-sdk调用api的使用示例.md`。

---

## BIP 微服务结构与 OpenAPI 注册

BIP 旗舰版微服务典型结构：

```
c-yonbip-hawk-asset-be/
└── dev-c-yonbip-hawk-asset-service/
    └── src/main/java/com/hawk/ucf/mdf/third/
        ├── controller/          ← Controller 层（OpenAPI 入口）
        │   ├── BzsController.java
        │   └── PatSnapController.java
        ├── service/             ← 接口定义
        │   ├── IBzsService.java
        │   └── IPatSnapService.java
        └── dto/                 ← 请求/响应 DTO
```

- **领域包路径**：`com.{租户}.{模块}.{功能}`
- **Controller 可打 `@RestController`** 直接注册，**也可用 YMS 路由分发**
- OpenAPI 的实际 URL 由 **YMS 网关** 拼接而成

---

## 客户端调用方式（两种）

### 方式一：SDK 调用（推荐）

```java
OpenServiceBuilder builder = new OpenServiceBuilder()
    .setAppKey(appKey)
    .setAppSecret(appSecret)
    .setEnv("https://jhbip.arura.cn/");

InputParam input = new InputParam()
    .setUrl("https://.../iuap-api-gateway/.../yonbip...")
    .setBody(params)
    .setContentType("application/json")
    .setMethod("POST");

HttpResponse result = Invoke.getResult(builder, input);
```

依赖：`iuap-ip-openapi-sdk-8.2.jar` + `expiringmap-0.5.10.jar`

### 方式二：纯 HTTP 调用

```java
// 1. 获取 token（HmacSHA256 签名）
String token = getToken(appKey, appSecret, bipUrl);

// 2. 调用 API
String url = apiGateway + "/yonbip/.../save?access_token=" + token;
String resp = HttpUtil.post(url, jsonBody);
```

完整代码见 `旗舰版调用OpenAPI.md`。

---

## 常见问题

### 问题 1：调度任务调用报错"开放平台接口使用需要绑定用户"

> 调度任务中调用 OpenAPI 时，框架 token 默认为机器人账号，对身份要求强的 API 会失败。

**解决**：
- 在代码中根据 `user_id` 重新获取 `yht_access_token`
- 调用时将 token 设置到请求头中覆盖默认值

详见 `references/问题处理/开放平台接口使用需要绑定用户.md`

### 问题 2：自建 API 无法调用

- 检查 YMS 服务是否注册
- 检查 OpenAPI 是否在管理界面发布
- 检查 appKey/appSecret 是否已授权给该 API

---

## 参考文档索引

| 文档 | 内容 |
|------|------|
| `旗舰版调用OpenAPI.md` | Java 调用 OpenAPI 的完整工具类（Token、签名、GET/POST） |
| `openapi-sdk调用api的使用示例.md` | SDK 方式调用（POM 依赖、超时配置） |
| `旗舰版文件上传.md` | 文件上传 OpenAPI |
| `开放平台接口使用需要绑定用户.md` | 调度任务中调用 API 的权限问题 |

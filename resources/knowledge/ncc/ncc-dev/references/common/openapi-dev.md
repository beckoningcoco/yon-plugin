# NCC OpenAPI 开发完整指南

## 概述

NCC OpenAPI 是基于 Restlet 框架 + JAX-RS 注解的 RESTful 接口开发方式。**与旗舰版（BIP）的 OpenAPI 机制不同**，NCC 需要经过 5 个步骤才能完整发布一个 API。

## 前置条件

1. `nchome/modules/uapfw` 路径下必须包含 `pubuapfw_restframeworkLevel-1.jar`
2. `nchome/hotwebs/nccloud/WEB-INF/web.xml` 中需配置 RestletServlet 及相关 Filter（见下文）

---

## 完整开发步骤

### 第一步：编写资源类（Java 后端代码）

在模块的 `public` 目录下创建类，**继承 `nccloud.ws.rest.resource.AbstractNCCRestResource`**：

```java
package nccloud.api.uapbd.customermanage.customer;

import javax.ws.rs.Consumes;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import org.json.JSONString;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import nc.bs.framework.common.NCLocator;
import nc.vo.pub.BusinessException;
import nccloud.api.rest.utils.ResultMessageUtil;
import nccloud.ws.rest.resource.AbstractNCCRestResource;

@Path("uapbd/customermanage/baseinfo")   // ← 类级别的 URL 路径
public class CustomerbaseinfoResources extends AbstractNCCRestResource {

    @Override
    public String getModule() {
        return "uapbd";  // 返回模块编码
    }

    @POST
    @Path("/getCustomerbaseinfo")       // ← 方法级别的 URL 路径
    @Consumes({ "application/json" })
    @Produces({ "application/json" })
    public JSONString getCustomerbaseinfo(JSONString json) {
        JSONObject jObject = JSON.parseObject(json.toJSONString());
        if (jObject == null) {
            return ResultMessageUtil.exceptionToJSON(new NullPointerException("JSONString:null"));
        }
        // 业务逻辑...
        return ResultMessageUtil.successToJSON(result);
    }
}
```

**关键注解说明**：

| 注解 | 位置 | 说明 |
|------|------|------|
| `@Path("xxx")` | 类上 | 资源根路径 |
| `@Path("/xxx")` | 方法上 | 方法子路径，最终 URL 为 `类Path + 方法Path` |
| `@POST` / `@GET` | 方法上 | HTTP 请求方法 |
| `@Consumes` | 方法上 | 接受的请求内容类型 |
| `@Produces` | 方法上 | 返回的内容类型 |

### 第二步：创建 REST 资源配置文件（.rest 文件）⭐

创建后缀为 `.rest` 的 XML 配置文件，放到 **`nchome/modules/<模块名>/META-INF/`** 目录下：

```xml
<?xml version="1.0" encoding='gb2312'?>
<module>
<rest>
    <resource classname="nccloud.api.uapbd.customermanage.customer.CustomerbaseinfoResources"
              exinfo="根据客户申请单编码和业务单元主键查询客户基本信息"/>
</rest>
</module>
```

| 属性 | 说明 |
|------|------|
| `classname` | 资源类的**全限定类名** |
| `exinfo` | 功能描述 |

### 第三步：创建接口说明文档（.md 文件，可选但建议）

放到 `nchome/hotwebs/nccloud/resources/api/modules/<模块编码>/` 目录下。

内容包括：接口名称、接口说明、使用场景、请求类型、请求示例、参数说明、返回值说明等。

---

### 第四步：前台注册 ⭐⭐⭐（最关键的步骤，容易遗漏）

写完代码和配置文件后，**必须在 NCC 前台管理界面进行注册**，否则 API 不生效。

#### 2207 版本之前

访问 `http://ip:port/nccloud/resources/opm`（WAS 环境需加 `/index.html`），管理员登录后：

1. **API 维护** 页签 → 新增 API
   - URI 格式：`/nccloud/api/<模块Path>/<类Path>/<方法Path>`
   - 示例：`/nccloud/api/uapbd/currtype/currtype/queryCurrtypeByCode`
2. **第三方应用管理** → 注册第三方应用 → 获得 `app_id`、`app_secret`、`公钥`
3. 点击**关联API** → 为应用分配刚注册的 API 接口

#### 2207 版本及之后

1. 登录系统 → **首页 → 开放集成 → OpenAPI管理 → OpenAPI应用管理** → 注册第三方应用
2. **首页 → 开放集成 → OpenAPI管理 → OpenAPI维护** → 注册 OpenAPI 接口
3. 回到 **OpenAPI应用管理** → 点击**关联API** → 为应用分配接口

> 注册数据存储在数据库表 **`opm_apimanager`**（OpenAPI 接口注册表）中。
> 如需增加 API 根节点，在 `opm_apimanager` 表中维护一条记录，`module_code` 字段填应用注册的 4 位模块编码。

---

### 第五步：接口调用

#### 5.1 获取 Token

```
POST http://ip:port/nccloud/opm/accesstoken
参数：
  biz_center=1                     // 账套 code
  &grant_type=client_credentials   // 授权模式
  &client_id=<app_id>              // 注册应用时获得的 app_id
  &client_secret=<app_secret>      // 注册应用时获得的 app_secret
  &signature=<签名>                 // SHA256(client_id + client_secret + pubKey)
```

#### 5.2 调用 API

```
POST http://ip:port/nccloud/api/uapbd/customermanage/baseinfo/getCustomerbaseinfo
Header：
  access_token: <上一步获取的token>
  ucg_flag: Y
  signature: SHA256(client_id + requestBody + pubKey)
Body: JSON 请求体
```

---

## web.xml 配置参考

```xml
<!-- Restlet 应用上下文 -->
<context-param>
    <param-name>org.restlet.application</param-name>
    <param-value>uap.ws.rest.core.UAPRestJaxRsApplication</param-value>
</context-param>

<!-- 安全过滤器 -->
<filter>
    <filter-name>openCloudSecurityFilter</filter-name>
    <filter-class>nccloud.ws.opm.core.filter.OpenCloudSecurityFilter</filter-class>
</filter>
<filter-mapping>
    <filter-name>openCloudSecurityFilter</filter-name>
    <url-pattern>/api/*</url-pattern>
</filter-mapping>

<!-- 登录过滤器 -->
<filter>
    <filter-name>openCloudLoginFilter</filter-name>
    <filter-class>nccloud.ws.opm.core.filter.OpenCloudLoginFilter</filter-class>
</filter>
<filter-mapping>
    <filter-name>openCloudLoginFilter</filter-name>
    <url-pattern>/opm/*</url-pattern>
</filter-mapping>

<!-- Restlet Servlet -->
<servlet>
    <servlet-name>RestletServlet</servlet-name>
    <servlet-class>uap.ws.rest.servlet.UAPRSServerServlet</servlet-class>
</servlet>
<servlet-mapping>
    <servlet-name>RestletServlet</servlet-name>
    <url-pattern>/api/*</url-pattern>
</servlet-mapping>
```

---

## 完整步骤清单

| 步骤 | 做什么 | 位置 |
|------|--------|------|
| ① 写 Java 类 | 继承 `AbstractNCCRestResource`，加 JAX-RS 注解 | 模块 `public` 目录 |
| ② 写 .rest 文件 | XML 配置，声明 classname + exinfo | `nchome/modules/<模块>/META-INF/` |
| ③ 写 .md 文档 | 接口说明文档（可选） | `nchome/hotwebs/nccloud/resources/api/modules/` |
| ④ **前台注册** | 注册 API + 注册应用 + 关联 | 系统内 OpenAPI 管理菜单 |
| ⑤ 调用 | 取 token → 调接口 | HTTP 客户端 |

## 常见问题

### 获取 token 报错 "Failed to verify signature for get token"
- 2105 及以后版本签名方式有变化
- 检查签名算法：`SHA256(client_id + client_secret)`
- 授权码模式：`SHA256(code + redirect_uri + client_id + appSecret)`

### 调用接口 401 Unauthorized
- 检查 access_token 是否有效
- 检查请求头 ucg_flag 是否设为 Y
- 检查请求体签名是否正确

### was 环境访问 opm 报错 SRVE0260E
- URL 需要加 `/index.html`：`http://ip:port/nccloud/resources/opm/index.html`

---

## 特殊情况：FIP 外部接口单（资产包模式）

> **如果用户要开发的是 FIP 外部接口单（TXBill）的 OpenAPI**，
> 请参考 [[openapi-fip-txbill-pattern]]，不使用本文档的标准模式。
>
> 区别：资产包模式使用 `AbstractRestResource` + `transferBill()` + `IFipMessageService.sendMessage()`，
> 而非 `AbstractNCCRestResource` + 手动 JSON 解析 + 直接持久化。

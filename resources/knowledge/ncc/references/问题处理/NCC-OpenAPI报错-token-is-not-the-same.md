# NCC OpenAPI 报错：User session expired,please re login!(4) --> token is not the same

> 适用：NCC 2111 / 2312，资产包接口（`/nccloud/api/...`）与 OpenAPI 网关
> 状态：✅ 已实测验证（2026-10-21，环卫 NCC2111 环境，九恒星司库项目接口）

---

## 一、报错原文

接口返回体：

```json
{
  "success": false,
  "code": "",
  "message": "User session expired,please re login!(4) --> token is not the same"
}
```

服务端日志里可能是这两种形式：

```
nc.vo.pubapp.pattern.exception.CarrierRuntimeException: User session expired,please re login!(4) --> token is not the same
nc.bs.framework.exception.FrameworkSecurityException: User session expired,please re login!(4) --> token is not the same
```

常见叫法（都能搜到本文）：token is not the same、token 不一致、会话过期需要重新登录、session expired、OpenAPI 调用报 token 错误、(4) 错误码。

---

## 二、结论（一句话）

**OpenAPI 应用里配置的 `user_code` 在别处登录过，它的登录会话被顶掉了。**

不是 `access_token` 过期、不是签名算错、不是报文或集成规则的问题、也不是接口 404。
**把应用的 `user_code` 换成一个专用系统账号即可恢复**——实测换完同一份调用立刻正常。

---

## 三、为什么会这样（源码链路）

`modules/opm/classes/nccloud/ws/opm/core/filter/OpenCloudSecurityFilter.java:240-255`：

```java
(new UserLoginServiceImpl()).getNCToken(userLoginVO);   // 每次 OpenAPI 调用都重新取一次 login_token
if (userLoginVO.getLogin_token() == null) throw ...;
this.setContext(userLoginVO);   // NetStreamContext.setToken(login_token); 再调 NCCRestUtils.initInvocationInfo()
```

`setContext()` 之后，`NCCRestUtils.initInvocationInfo()` 里第一次业务调用会被 `nc.bs.framework.server.SecurityAspect` 用会话 token 校验；`getNCToken` 拿到的 `login_token` 与该用户当前会话不一致时，就抛：

```
SecurityAspect.aroundMethod1(SecurityAspect.java:67)
  → FrameworkSecurityException: ... token is not the same
```

所以校验对象是 **login_token（用户会话 token）**，不是请求头里的 `access_token`。实测那次 `access_token` 与 `refreshToken` 日志值完全相同，照样报错——这就是最直接的证据。

---

## 四、解决步骤

1. NCC 后台 → **OPENAPI 管理 → 应用** → 找到该应用 → 把 `user_code` 改成一个**专用系统账号**（不要用 `admin`、不要用会被人登录的集团管理员账号，例如 `jt01`）。
2. 该账号在测试/生产期间**不要登录 NCC 后台**，也不要被其他系统共用。
3. 重新取一次 token，再调用。
4. 验证：换用户后同一报文应直接成功；若仍失败，看下面第五节。

> 应用改了 `user_code` 后，接口新增单据的 `creator` 会变成这个账号，业务上要提前确认。

---

## 五、其他可能（换用户后仍报错时）

按命中率排序：

1. **并发 / 自动重试**：每次调用都会 `getNCToken` 重建会话，并发或客户端自动重试时后一次把前一次顶掉。改串行、关掉重试。
2. **集群多节点**：token/session 存在取它的节点上，请求落到另一节点。需要 session 共享（redis）或粘性会话。
3. **请求头不合规**：`ucg_flag: y` 必须小写；`content-type` 全小写；`Content-Length` 必须显式设置；别带浏览器 Cookie。
4. **token 与 client_id 不配套**：用 A 应用取的 token，请求头带 B 的 `client_id`。

---

## 六、怎么从日志定位（下次自己查）

1. `nclogs/server/openapi-log.log` 搜 `token is not the same`，能看到：

```
##client_id::NineStar
##access_token::eee7fa0f...
##CacheServiceImpl::get_accesstoken:eee7fa0f...
##OAuth2ServiceImpl::checkToken::refreshToken:eee7fa0f...
User session expired,please re login!(4) --> token is not the same
  at nccloud.api.rest.utils.NCCRestUtils.initInvocationInfo(NCCRestUtils.java:145)
  at nccloud.ws.opm.core.filter.OpenCloudSecurityFilter.setContext(OpenCloudSecurityFilter.java:379)
```

2. `nclogs/server/nccloud-log.log` 同一时刻有业务侧堆栈（真正的抛出点）：

```
FrameworkSecurityException: ... token is not the same
  at nc.bs.framework.server.SecurityAspect.aroundMethod1(SecurityAspect.java:67)
  ... IGroupPubService.getGroupNoByPK
  at NCCRestUtils.initInvocationInfo(NCCRestUtils.java:140)
```

3. 确认请求确实被拦在网关（而不是进了接口）：`opm_logmanager` 里**没有**这次调用记录，就说明被 `OpenCloudSecurityFilter` 拦了。

```sql
SELECT * FROM (SELECT access_time, thirdapp_code, api_url, access_status, user_code
  FROM opm_logmanager ORDER BY access_time DESC) WHERE ROWNUM <= 10;
```

4. 想现场看：Arthas attach 到 NCC 进程，watch `OpenCloudSecurityFilter.setContext` 的入参，把 `userLoginVO.getLogin_token()` 与 `NetStreamContext.getToken()` 打出来比对。

---

## 七、相关文档

- [NCC-OpenAPI-调用参数速查](../NCC-OpenAPI-调用参数速查.md) — client_id / secret / 公钥 / biz_center / dsname 从哪张表取
- [NCC-OpenAPI-签名机制详解](../NCC-OpenAPI-签名机制详解.md) — token URL、OAEP 加密、加盐签名
- [NCC资产包接口实战开发流程](../NCC资产包接口实战开发流程.md) — 注册应用与路由

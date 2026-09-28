---
name: 后端函数HTTP请求方法对比(postman/postmanPure/openLinker)
description: >
  BIP 旗舰版后端函数中 HTTP 请求方法的对比，包括 postman、postmanPure、openLinker、openLinkerPure 的
  Token 策略、超时时间、适用场景。
---

# 后端函数 HTTP 请求方法对比

## 方法一览

| 方法 | Token | 默认超时 | 适用场景 |
|------|-------|---------|----------|
| `postman(method, url, header, body)` | 携带当前上下文 token | **3s** | 调本系统内部 REST 接口 |
| `postmanPure(method, url, header, body)` | 不携带上下文 | **10s** | 调外部/第三方系统 |
| `openLinker(method, url, appCode, body)` | 自动获取 | ？ | 调 BIP 内部开放平台接口 |
| `openLinkerPure(method, url, appCode, body)` | 需手动传 appKey/appSecret | ？ | 跨租户调 BIP 接口 |

## postman vs postmanPure

```js
// postman — 自带 token，超时 3s，调内部接口
let resp = postman("get", url, JSON.stringify(header), JSON.stringify(body));

// postmanPure — 不带 token，超时 10s，调外部接口
let resp = postmanPure("post", url, JSON.stringify(header), JSON.stringify(body));
```

**关键区别**：
- `postman` 走了网关链路，平台自动注入 `yht_access_token`，网关超时较短（3s）
- `postmanPure` 直连目标 URL，不经过网关，超时更宽容（10s），但需要自己管理认证头

**注意**：两者均不支持自定义超时参数。如果外部接口超过 10s，需用异步执行规避。

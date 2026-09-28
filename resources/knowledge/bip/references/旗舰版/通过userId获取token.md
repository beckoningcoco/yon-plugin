---
name: 通过userId获取token
description: >
  用友 BIP 客开技能。当用户需要通过 userId 获取 access_token 和 yht_access_token（友互通 token），用于调用 API 时绑定用户身份，包括 Redis 缓存、Cookie 提取、控制字符清理等完整 AccessTokenUtil 工具类时，参考该文档内容。
---

# 通过userId获取token

## 核心方法

### 获取 access_token（by userId）

```java
public String getYhtAccessToken(String userId, String tenantId, String workbenchUrl) {
    String yhtTokenUrl = workbenchUrl + "/cas/exclusive/genLoginTokenByUserIdLimitIp";
    Map<String, String> paramsMap = new HashMap<>();
    paramsMap.put("userId", userId);
    String resultStr = RequestUtil.doGet(yhtTokenUrl, paramsMap);
    JSONObject result = JSONUtil.parseObj(resultStr);
    String token = result.getStr("token");
    if (StringUtils.isBlank(token)) {
        throw new Exception("获取token失败");
    }
    return token;
}
```

### 获取 BIP access_token（by appKey/appSecret，带 Redis 缓存）

```java
public String getAccessToken(String appKey, String appSecret) {
    String accessToken = redisManager.get(RedisKeyConstant.ACCESS_TOKEN + appKey);
    if (StringUtils.isBlank(accessToken)) {
        accessToken = getToken(appKey, appSecret);
        // 缓存 access_token，提前 60 秒失效
        redisManager.set(RedisKeyConstant.ACCESS_TOKEN + appKey, accessToken, expire - 60);
    }
    return accessToken;
}
```

### 获取 yht_access_token（友互通 token，by userId）

完整流程：通过 userId 获取 login token → 构建跳转链接 → 访问 Cas 登录 → 从 Cookie 中提取 `yht_access_token`。

```java
public String getYhtAccessToken(String yhtUserId) throws Exception {
    String yhtAccessToken = redisManager.get(RedisKeyConstant.YHT_ACCESS_TOKEN + yhtUserId);
    if (StringUtils.isBlank(yhtAccessToken)) {
        String token = this.getToken(yhtUserId);       // 获取 login token
        String redirectUrl = buildRedirectUrl(token);   // 构建 Cas 跳转链接
        String resultStr = RequestUtil.doGet(redirectUrl, null);
        yhtAccessToken = extractYhtAccessToken(resultStr); // 从 Cookie 提取
        redisManager.set(RedisKeyConstant.ACCESS_TOKEN + yhtUserId, yhtAccessToken, 2 * 60 * 60);
    }
    return yhtAccessToken;
}
```

## 使用方式

在调用 API 时将 `yht_access_token` 放入请求头：

```java
ymsHttpHeader.add("yht_access_token", accessTokenUtil.getYhtAccessToken(userId));
ymsHttpHeader.add("Domain-Key", domainKey);
```

## 注意事项

1. 生成的 token 可能存在 `\r\n` 等控制字符，需要清理：

```java
String cleanToken = yhtAccessToken != null ?
    yhtAccessToken.replaceAll("[\\r\\n\\t\\f\\u0000-\\u001F]", "") : "";
ymsHttpHeader.add("yht_access_token", cleanToken);
```

2. 开发环境没问题，UAT 环境可能频繁拿不到 token（该方案在某些环境不稳定）。

## 完整工具类 YhtAccessTokenUtil

基于 `yhtUserId`（带 `-` 分隔符的用户 ID，即员工表里的 `user_id`）获取 `yht_access_token`，带 Redis 缓存（10 分钟超时）：

```java
@Component
public class YhtAccessTokenUtil {

    @Resource
    private RedisManager redisManager;
    @Value("${yonbip.env}")
    private String env;

    private static final String TOKEN_CACHE_KEY_PREFIX = "test_token_cache:";
    private static final int TOKEN_CACHE_EXPIRE_SECONDS = 600;

    public String getYhtAccessTokenByYhtUserId(String userId) throws Exception {
        String cachedToken = redisManager.get(TOKEN_CACHE_KEY_PREFIX + userId);
        if (StringUtils.isBlank(cachedToken)) {
            String token = getToken(userId);
            String redirectUrl = buildRedirectUrl(token);
            String pageContent = sendGet(redirectUrl);
            String yhtToken = extractYhtAccessToken(pageContent);
            cachedToken = yhtToken;
            redisManager.set(TOKEN_CACHE_KEY_PREFIX + userId, yhtToken, TOKEN_CACHE_EXPIRE_SECONDS);
        }
        return cachedToken;
    }

    private String getToken(String yhtUserId) throws Exception {
        String urlStr = env + "/cas/exclusive/genLoginTokenByUserIdLimitIp";
        Map<String, String> paramsMap = new HashMap<>();
        paramsMap.put("userId", yhtUserId);
        urlStr = buildUrlWithParams(urlStr, paramsMap);
        String res = sendGet(urlStr);
        JSONObject result = JSONObject.parseObject(res);
        String token = result.getString("token");
        if (StringUtils.isBlank(token)) {
            throw new Exception("获取token失败");
        }
        return token;
    }

    private String buildRedirectUrl(String token) throws Exception {
        String workBenchUrl = env + "/login?service=";
        String encodeRedirctUrl = URLEncoder.encode(env, StandardCharsets.UTF_8.toString());
        String sendRedirectUrl = URLEncoder.encode(
            workBenchUrl + encodeRedirctUrl, StandardCharsets.UTF_8.toString());
        return env + "/cas/login?token=" + token + "&service=" + sendRedirectUrl;
    }

    private String extractYhtAccessToken(String responseStr) {
        // 从返回的 HTML 中提取 location.href 跳转地址
        int startIndexOf = responseStr.indexOf("location.href");
        int endIndexOf = responseStr.indexOf("</script>");
        String locationHrefUrl = responseStr.substring(startIndexOf, endIndexOf);
        startIndexOf = locationHrefUrl.indexOf("\"");
        endIndexOf = locationHrefUrl.lastIndexOf("\"");
        locationHrefUrl = locationHrefUrl.substring(startIndexOf + 1, endIndexOf);

        BasicCookieStore cookieStore = new BasicCookieStore();
        HttpGet httpGet = new HttpGet(locationHrefUrl);
        try (CloseableHttpClient httpClient = HttpClients.custom()
                .setDefaultCookieStore(cookieStore).build();
             CloseableHttpResponse executeRes = httpClient.execute(httpGet)) {
            EntityUtils.toString(executeRes.getEntity(), "utf-8");
            for (Cookie cookie : cookieStore.getCookies()) {
                if ("yht_access_token".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return responseStr;
    }
}
```

## 从前台请求直接获取 token

如果是前台按钮触发的后端调用（非外系统 API 调用），可直接获取当前登录用户的 token：

```java
String accesstoken = InvocationInfoProxy.getYhtAccessToken();
```

# BIP OpenAPI 集成说明

## 概述

BIP 旗舰版提供 OpenAPI 接口用于数据集成。本文档说明如何进行 API 认证、请求加密、接口调用等。

## API 认证

### 获取 Access Token

BIP OpenAPI 使用 OAuth 2.0 认证机制，需要先获取 access_token。

**接口地址：**
```
POST {BIP_DOMAIN}/iuap-api-gateway/api/oauth2/token
```

**请求参数：**
```json
{
  "grant_type": "client_credentials",
  "client_id": "应用ID",
  "client_secret": "应用密钥"
}
```

**响应示例：**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 7200
}
```

**Java 实现：**

```java
public class GetAccessTokenUtil {
    
    private static String CLIENT_ID = "your_client_id";
    private static String CLIENT_SECRET = "your_client_secret";
    private static String TOKEN_URL = "http://domain/iuap-api-gateway/api/oauth2/token";
    
    public static String getAccessToken() {
        Map<String, Object> params = new HashMap<>();
        params.put("grant_type", "client_credentials");
        params.put("client_id", CLIENT_ID);
        params.put("client_secret", CLIENT_SECRET);
        
        String response = HttpUtil.post(TOKEN_URL, params);
        JSONObject json = JSONObject.parseObject(response);
        
        return json.getString("access_token");
    }
}
```

### Token 管理

**Token 缓存：**

```java
@Component
public class AccessToken {
    
    private String token;
    private long expireTime;
    
    public String getToken() {
        // 如果 token 过期或不存在，重新获取
        if (token == null || System.currentTimeMillis() >= expireTime) {
            refreshToken();
        }
        return token;
    }
    
    private void refreshToken() {
        String newToken = GetAccessTokenUtil.getAccessToken();
        this.token = newToken;
        // 提前 5 分钟过期，避免边界问题
        this.expireTime = System.currentTimeMillis() + (7200 - 300) * 1000;
    }
}
```

## 凭证保存接口

### 接口信息

**接口地址：**
```
POST {BIP_DOMAIN}/iuap-api-gateway/yonbip/fi/ficloud/openapi/voucher/addVoucher?access_token={token}
```

**请求头：**
```
Content-Type: application/json;charset=UTF-8
```

**请求体：** 见 [oracle_to_bip_voucher.md](oracle_to_bip_voucher.md) 中的 JSON 结构

### 调用示例

```java
public class VoucherService {
    
    @Autowired
    private AccessToken accessTokenTool;
    
    @Autowired
    private SysUrlConstants sysUrlConstants;
    
    public void saveVoucher(WanDaPinzhengQYBIP voucher) {
        // 获取 token
        String accessToken = accessTokenTool.getToken();
        
        // 构建 URL
        String url = sysUrlConstants.BIP_URL_REALNAME + 
                    "/iuap-api-gateway/yonbip/fi/ficloud/openapi/voucher/addVoucher?access_token=" + 
                    accessToken;
        
        // 转换为 JSON
        ObjectMapper objectMapper = new ObjectMapper();
        String json = objectMapper.writeValueAsString(voucher);
        
        // 发送请求
        String response = HttpUtil.post(url, json);
        
        // 解析响应
        JSONObject result = JSONObject.parseObject(response);
        String code = result.getString("code");
        
        if ("200".equals(code)) {
            System.out.println("凭证保存成功");
        } else {
            String message = result.getString("message");
            System.err.println("凭证保存失败: " + message);
            throw new RuntimeException("凭证保存失败: " + message);
        }
    }
}
```

### 响应处理

**成功响应：**
```json
{
  "code": "200",
  "message": "success",
  "data": {
    "voucherId": "凭证ID"
  }
}
```

**失败响应：**
```json
{
  "code": "500",
  "message": "科目编码不存在",
  "data": null
}
```

## HTTP 工具类

### HttpClientUtil

```java
public class HttpClientUtil {
    
    /**
     * POST 请求
     */
    public static String doPost(String url, Map<String, Object> headers, 
                                Map<String, Object> params, String body) {
        CloseableHttpClient httpClient = HttpClients.createDefault();
        HttpPost httpPost = new HttpPost(url);
        
        try {
            // 设置请求头
            if (headers != null) {
                for (Map.Entry<String, Object> entry : headers.entrySet()) {
                    httpPost.setHeader(entry.getKey(), entry.getValue().toString());
                }
            }
            
            // 设置请求体
            if (body != null) {
                StringEntity entity = new StringEntity(body, "UTF-8");
                entity.setContentType("application/json");
                httpPost.setEntity(entity);
            }
            
            // 执行请求
            CloseableHttpResponse response = httpClient.execute(httpPost);
            HttpEntity responseEntity = response.getEntity();
            
            // 读取响应
            String result = EntityUtils.toString(responseEntity, "UTF-8");
            
            return result;
            
        } catch (Exception e) {
            throw new RuntimeException("HTTP 请求失败", e);
        } finally {
            try {
                httpClient.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
    
    /**
     * GET 请求
     */
    public static String doGet(String url, Map<String, Object> headers) {
        CloseableHttpClient httpClient = HttpClients.createDefault();
        HttpGet httpGet = new HttpGet(url);
        
        try {
            // 设置请求头
            if (headers != null) {
                for (Map.Entry<String, Object> entry : headers.entrySet()) {
                    httpGet.setHeader(entry.getKey(), entry.getValue().toString());
                }
            }
            
            // 执行请求
            CloseableHttpResponse response = httpClient.execute(httpGet);
            HttpEntity responseEntity = response.getEntity();
            
            // 读取响应
            String result = EntityUtils.toString(responseEntity, "UTF-8");
            
            return result;
            
        } catch (Exception e) {
            throw new RuntimeException("HTTP 请求失败", e);
        } finally {
            try {
                httpClient.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }
}
```

### 使用 Hutool HttpUtil

```java
import cn.hutool.http.HttpUtil;

// POST 请求
String response = HttpUtil.post(url, jsonBody);

// GET 请求
String response = HttpUtil.get(url);

// 带参数的 POST
Map<String, Object> params = new HashMap<>();
params.put("key", "value");
String response = HttpUtil.post(url, params);
```

## 请求加密（可选）

某些 BIP 环境可能要求对请求进行签名加密。

### 签名算法

```java
public class SignHelper {
    
    /**
     * 生成签名
     * @param params 请求参数
     * @param secret 密钥
     * @return 签名字符串
     */
    public static String generateSign(Map<String, String> params, String secret) {
        // 1. 参数排序
        TreeMap<String, String> sortedParams = new TreeMap<>(params);
        
        // 2. 拼接参数
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : sortedParams.entrySet()) {
            sb.append(entry.getKey()).append("=").append(entry.getValue()).append("&");
        }
        
        // 3. 添加密钥
        sb.append("secret=").append(secret);
        
        // 4. MD5 加密
        String sign = DigestUtils.md5Hex(sb.toString());
        
        return sign.toUpperCase();
    }
}
```

### 请求加密

```java
public class OpenApiRequestEncryptor {
    
    private static final String APP_KEY = "your_app_key";
    private static final String APP_SECRET = "your_app_secret";
    
    /**
     * 加密请求
     */
    public static String encryptRequest(String body) {
        Map<String, String> params = new HashMap<>();
        params.put("appKey", APP_KEY);
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        params.put("body", body);
        
        // 生成签名
        String sign = SignHelper.generateSign(params, APP_SECRET);
        params.put("sign", sign);
        
        // 转换为 JSON
        return JSONObject.toJSONString(params);
    }
}
```

## 错误处理

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 401 | Token 无效或过期 | 重新获取 token |
| 403 | 无权限访问 | 检查应用权限配置 |
| 404 | 接口不存在 | 检查接口地址 |
| 500 | 服务器内部错误 | 检查请求参数，联系管理员 |
| 业务错误 | 业务逻辑错误 | 根据 message 提示处理 |

### 重试机制

```java
public class RetryableHttpClient {
    
    private static final int MAX_RETRY = 3;
    private static final long RETRY_INTERVAL = 1000; // 1秒
    
    public static String postWithRetry(String url, String body) {
        int retryCount = 0;
        Exception lastException = null;
        
        while (retryCount < MAX_RETRY) {
            try {
                return HttpUtil.post(url, body);
            } catch (Exception e) {
                lastException = e;
                retryCount++;
                
                if (retryCount < MAX_RETRY) {
                    try {
                        Thread.sleep(RETRY_INTERVAL);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
        }
        
        throw new RuntimeException("请求失败，已重试 " + MAX_RETRY + " 次", lastException);
    }
}
```

## 配置管理

### 配置类

```java
@Component
@ConfigurationProperties(prefix = "bip.openapi")
public class SysUrlConstants {
    
    private String bipUrlRealname; // BIP 域名
    private String clientId;       // 应用ID
    private String clientSecret;   // 应用密钥
    
    // Getter and Setter...
    
    public String getBIP_URL_REALNAME() {
        return bipUrlRealname;
    }
}
```

### 配置文件

```yaml
# application.yml
bip:
  openapi:
    bip-url-realname: http://fin.company.com
    client-id: your_client_id
    client-secret: your_client_secret
```

## 性能优化

### 连接池配置

```java
@Configuration
public class HttpClientConfig {
    
    @Bean
    public CloseableHttpClient httpClient() {
        PoolingHttpClientConnectionManager cm = new PoolingHttpClientConnectionManager();
        cm.setMaxTotal(200);
        cm.setDefaultMaxPerRoute(20);
        
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectTimeout(5000)
                .setSocketTimeout(30000)
                .build();
        
        return HttpClients.custom()
                .setConnectionManager(cm)
                .setDefaultRequestConfig(requestConfig)
                .build();
    }
}
```

### 批量处理

```java
public void batchSaveVouchers(List<WanDaPinzhengQYBIP> vouchers) {
    ExecutorService executor = Executors.newFixedThreadPool(10);
    
    for (WanDaPinzhengQYBIP voucher : vouchers) {
        executor.submit(() -> {
            try {
                saveVoucher(voucher);
            } catch (Exception e) {
                log.error("凭证保存失败: " + voucher.getDefInfo1(), e);
            }
        });
    }
    
    executor.shutdown();
    executor.awaitTermination(1, TimeUnit.HOURS);
}
```

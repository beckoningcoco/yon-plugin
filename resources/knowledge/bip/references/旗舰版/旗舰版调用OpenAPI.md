---
name: 旗舰版调用OpenAPI
description: >
  用友 BIP 客开技能。当用户需要在后端 Java 代码中调用 BIP 开放平台 API（OpenAPI），包括获取 access_token（HmacSHA256 签名）、POST/GET 调用、文件上传、appKey/appSecret 配置时，参考该文档内容。
---

# 旗舰版调用openapi

## 基本调用示例

```java
//生成调用报文
String param = this.generateJsons(listMaps);
if (param != null) {
    String openApiToken = SendBipOpenapiUtil.getBipTokenByBY(System.getProperty("domain.url"), appKey, appSecret);
    String url = System.getProperty("domain.iuap-api-gateway") + "/yonbip/EFI/receivable/batchsave?access_token=" + openApiToken;
    String respJson = HttpUtil.post(url, param);

    JSONObject respObj = JSONObject.parseObject(respJson);
    if (respObj == null || !"200".equals(respObj.getString("code"))) {
        throw new BizException(respObj.getString("message"));
    } else {
        setParrelData(respObj, param);
        response.put("code", 200);
        response.put("message", "单据保存成功");
    }
}
```

## SendBipOpenapiUtil — Token 获取与 API 调用

```java
@Slf4j
@Component
public class SendBipOpenapiUtil {

    private static String appKey;
    private static String appSecret;
    private static String openUrl;

    @Value("${master.data.sync.appKey}")
    private String appkey;
    @Value("${master.data.sync.appsecret}")
    private String appsecret;
    @Value("${openapi.url}")
    private String openapiUrl;

    @PostConstruct
    public void init(){
        appKey = appkey;
        appSecret = appsecret;
        openUrl = openapiUrl;
    }

    /**
     * 获取 BIP OpenAPI 的 access_token（带缓存）
     */
    public static String getBipTokenByBY(String bipUrl, String appKey, String appSecret) {
        String bipUrlReal = bipUrl + "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken";
        String key = "access_token_" + appKey;
        String accToken = AppContext.getCache(key);
        if (StringUtils.isNotBlank(accToken)) {
            return accToken;
        }
        long timestamp = new Date().getTime();
        Map<String, String> rsMap = new HashMap<>();
        rsMap.put("appKey", appKey);
        rsMap.put("timestamp", timestamp + "");
        String signature = sign(rsMap, appSecret);
        bipUrlReal += "?appKey=" + appKey + "&timestamp=" + timestamp + "&signature=" + signature;
        
        String body = HttpRequest.get(bipUrlReal).execute().body();
        JSONObject jsonObject1 = JSONUtil.parseObj(body);
        String code = jsonObject1.getStr("code");
        if (!"00000".equals(code)) {
            throw new IllegalArgumentException(jsonObject1.getStr("message"));
        }
        JSONObject jsonObject2 = jsonObject1.getJSONObject("data");
        accToken = jsonObject2.getStr("access_token");
        AppContext.setCache("custoken", accToken, jsonObject2.getInt("expire"));
        return accToken;
    }

    /**
     * HmacSHA256 签名
     */
    public static String sign(Map<String, String> params, String suiteSecret) {
        Map<String, String> treeMap = params instanceof TreeMap ? params : new TreeMap<>(params);
        StringBuilder stringBuilder = new StringBuilder();
        for (Map.Entry<String, String> entry : treeMap.entrySet()) {
            stringBuilder.append(entry.getKey()).append(entry.getValue());
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(suiteSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signData = mac.doFinal(stringBuilder.toString().getBytes(StandardCharsets.UTF_8));
            String base64String = Base64.getEncoder().encodeToString(signData);
            return URLEncoder.encode(base64String, "UTF-8");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * POST 调用 OpenAPI
     */
    public static JSONObject postOpenApiData(JSONObject params, String url, Map<String,Object> queryMap){
        String token = SendBipOpenapiUtil.getBipTokenByBY(getOpenUrl(), getAppKey(), getAppSecret());
        Map<String,Object> headMap = new HashMap<>();
        headMap.put("Content-Type", "application/json;charset=utf-8");
        if (ObjectUtil.isEmpty(queryMap)) {
            queryMap = MapUtil.newHashMap();
        }
        queryMap.put("access_token", token);
        String body = HttpClientUtil.doPost(getOpenUrl(), url, headMap, queryMap, params);
        JSONObject res = JSON.parseObject(body, JSONObject.class);
        String code = res.getStr("code");
        if(!"200".equals(code)){
            throw new RuntimeException(res.getStr("message"));
        }
        // 解析 data 字段并返回
        Object result = res.get("data");
        // ... 处理 List/Object 类型
    }

    /**
     * GET 调用 OpenAPI
     */
    public static JSONObject getOpenApiData(Map<String,Object> queryMap, String url){
        String token = SendBipOpenapiUtil.getBipTokenByBY(getOpenUrl(), getAppKey(), getAppSecret());
        queryMap.put("access_token", token);
        String body = HttpClientUtil.doGet(getOpenUrl() + url, headMap, queryMap);
        JSONObject jsonObject1 = JSONUtil.parseObj(body);
        if(!"200".equals(jsonObject1.getStr("code"))){
            return data;
        }
        return JSONUtil.parseObj(jsonObject1.get("data"));
    }
}
```

## HttpUtil — HTTP 请求工具类

```java
public class HttpUtil {

    public static String get(String url) throws Exception {
        return execute(url, HttpMethod.GET, null, null);
    }

    public static String post(String url, String data) throws Exception {
        return execute(url, HttpMethod.POST, null, data);
    }

    public static String execute(String reqUrl, HttpMethod method, Map<String, String> headMap, String reqJson) throws Exception {
        URL url = new URL(reqUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(300000);
        conn.setRequestMethod(method.name());
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        
        if(headMap != null) {
            for(Map.Entry<String, String> entry : headMap.entrySet()) {
                conn.setRequestProperty(entry.getKey(), entry.getValue());
            }
        }

        if("https".equals(url.getProtocol())) {
            SSLContext sc = SSLContext.getInstance("TLSv1.2");
            sc.init(null, null, null);
            ((HttpsURLConnection) conn).setSSLSocketFactory(sc.getSocketFactory());
        }
        if(StringUtils.isNotEmpty(reqJson)) {
            conn.setDoOutput(true);
            try(OutputStream os = conn.getOutputStream()) {
                os.write(reqJson.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
        }

        int respCode = conn.getResponseCode();
        try(InputStream in = respCode < 200 || respCode >= 300 ? conn.getErrorStream() : conn.getInputStream();
            ByteArrayOutputStream byteOut = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[256];
            int len;
            while((len = in.read(buffer)) > 0) {
                byteOut.write(buffer, 0, len);
            }
            return new String(byteOut.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    public enum HttpMethod {
        GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH
    }
}
```

## appKey / appSecret

- 调用原厂 API 拿秘钥方式：

![image-20250722181821855](旗舰版调用openapi/image-20250722181821855.png)

- 如果是自建的 API，则先要去 API 发布，然后 API 授权，才能拿到秘钥。

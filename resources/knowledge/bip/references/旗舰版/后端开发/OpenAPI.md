# OpenAPI调用开发

## 调用流程

1. 获取accessToken（多数据中心需要tenantId）
2. 请求时拼接token放在header中
3. 处理返回结果

## 获取Token

### AccessTokenUtils

```java
@Component
public class AccessTokenUtils {

    private static final String URL_TOKEN = "/open-auth/selfAppAuth/getAccessToken";
    public static final String URL_GATEWAY = "/open-auth/dataCenter/getGatewayAddress";

    // 多数据中心适配前
    public String getAccessToken(String openApiUrl, String appKey, String appSecret) {
        return this.sendTokenRequest(openApiUrl, appKey, appSecret);
    }

    // 多数据中心适配后
    public String getAccessTokenV2(String tenantId, String openApiUrl, String appKey, String appSecret) {
        Map<String, Object> map = new HashMap<>();
        map.put("tenantId", tenantId);
        String requestUrl = openApiUrl + URL_GATEWAY;

        JSONObject jsonObject = JSONObject.parseObject(HttpClient.get(requestUrl, map));
        String tokenUrl = jsonObject.getJSONObject("data").getString("tokenUrl");
        return this.sendTokenRequest(tokenUrl, appKey, appSecret);
    }

    private String sendTokenRequest(String openApiUrl, String appKey, String appSecret) throws Exception {
        Map<String, Object> params = new HashMap<>();
        params.put("appKey", appKey);
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        params.put("signature", SignHelper.sign(params, appSecret));

        String requestUrl = openApiUrl + URL_TOKEN;
        JSONObject jsonObject = JSON.parseObject(HttpClient.get(requestUrl, params));
        return jsonObject.getJSONObject("data").getString("access_token");
    }
}
```

## 调用OpenAPI

### OpenApiUtils

```java
@Component
public class OpenApiUtils {

    // POST请求
    public static String postMethod(Map<String, Object> param, String requestUrl, String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(param, headers);

        String url = requestUrl + "?access_token=" + accessToken;
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.getMessageConverters().set(1, new StringHttpMessageConverter(StandardCharsets.UTF_8));

        try {
            ResponseEntity<String> responseEntity = restTemplate.postForEntity(url, entity, String.class);
            return responseEntity.getBody();
        } catch (Exception e) {
            throw new RuntimeException("OpenAPI调用失败：" + e.getMessage());
        }
    }

    // 带yht_access_token的POST
    public static String postMethod(Map<String, Object> param, String requestUrl,
            String accessToken, String yhtAccessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (StringUtils.isNotEmpty(yhtAccessToken)) {
            headers.add("yht_access_token", yhtAccessToken);
        }
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(param, headers);
        String url = requestUrl + "?access_token=" + accessToken;

        RestTemplate restTemplate = new RestTemplate();
        restTemplate.getMessageConverters().set(1, new StringHttpMessageConverter(StandardCharsets.UTF_8));

        return restTemplate.postForEntity(url, entity, String.class).getBody();
    }
}
```

## 签名工具

```java
public class SignHelper {

    public static String sign(Map<String, Object> params, String suiteSecret)
            throws NoSuchAlgorithmException, UnsupportedEncodingException, InvalidKeyException {
        // 按参数名排序后拼接
        Map<String, Object> treeMap = new TreeMap<>(params);

        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> entry : treeMap.entrySet()) {
            sb.append(entry.getKey()).append(entry.getValue());
        }

        // HmacSHA256加签
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(suiteSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] signData = mac.doFinal(sb.toString().getBytes(StandardCharsets.UTF_8));
        String base64String = Base64.getEncoder().encodeToString(signData);
        return URLEncoder.encode(base64String, "UTF-8");
    }
}
```

## HttpClient

```java
public class HttpClient {

    // GET请求
    public static String get(String url, Map<String, Object> params) throws Exception {
        if (params != null) {
            StringBuilder sb = new StringBuilder();
            for (Map.Entry<String, Object> entry : params.entrySet()) {
                sb.append("&").append(entry.getKey()).append("=").append(entry.getValue());
            }
            url = url + sb;
        }
        // 执行请求并返回结果
    }

    // POST请求
    public static String post(String url, Map<String, Object> params) throws Exception {
        List<NameValuePair> pairs = new ArrayList<>();
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            NameValuePair pair = new BasicNameValuePair(entry.getKey(), String.valueOf(entry.getValue()));
            pairs.add(pair);
        }
        HttpEntity httpEntity = new UrlEncodedFormEntity(pairs, "UTF-8");
        // 执行请求并返回结果
    }

    // JSON POST
    public static String jsonPost(String url, Object paramVO) throws Exception {
        StringEntity requestEntity = new StringEntity(JSON.toJSONString(paramVO), "UTF-8");
        requestEntity.setContentType("application/json");
        // 执行请求并返回结果
    }
}
```

## 使用示例

```java
@Autowired
private AccessTokenUtils accessTokenUtils;

// 1. 获取Token
String token = accessTokenUtils.getAccessToken(openApiUrl, appKey, appSecret);

// 2. 调用OpenAPI
Map<String, Object> params = new HashMap<>();
params.put("id", billId);

String result = OpenApiUtils.postMethod(params, requestUrl, token);

// 3. 处理结果
JSONObject resultJson = JSON.parseObject(result);
String data = resultJson.getString("data");
```
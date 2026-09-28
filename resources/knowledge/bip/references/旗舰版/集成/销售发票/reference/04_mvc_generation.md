# MVC代码生成指南

## 概述

本文档定义销售发票集成的标准MVC代码生成模式。

## ⚠️ 重要约束（必须遵守）

1. **只生成MVC代码**：Controller + Service，不生成 Application 启动类
2. **单个发票场景**：只支持单个发票推送，不支持批量处理
3. **禁止内部类**：所有内部类必须提取为独立类文件
4. **必须实现重试机制**：失败自动重试3次
5. **⚠️ BIP OpenAPI调用**：必须调用 `iuap-c-openapi-integration` 技能获取完整调用代码，禁止写TODO

## ⚠️ 核心流程：必须先查询销售发票数据

**这是一个强制约束，生成的代码必须遵循以下流程：**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          代码生成核心流程                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Controller.receive(invoiceId)                                         │
│       ↓                                                               │
│  Service.pushInvoice(invoiceId)                                        │
│       ↓                                                               │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ ⚠️ BipOpenApiClient.querySaleInvoiceDetail(invoiceId)        │    │
│  │    必须先查询BIP销售发票数据！                                  │    │
│  │    禁止跳过此步骤直接使用前端传递的数据！                       │    │
│  └───────────────────────────────────────────────────────────────┘    │
│       ↓                                                               │
│  FieldConverter.convert(invoiceData)   ← 字段映射转换                   │
│       ↓                                                               │
│  HxtaxClient.invoke(request)           ← 调用航信接口                   │
│       ↓                                                               │
│  writeBackInvoice(invoiceId, response) ← 回写发票状态                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Controller层生成规范

**❌ 错误写法（禁止生成）：**
```java
// 错误：直接接收完整DTO
@PostMapping("/blue")
public Result pushBlueInvoice(@RequestBody SaleInvoicePushDTO dto) {
    return invoiceService.pushBlueInvoice(dto);
}
```

**✅ 正确写法（必须生成）：**
```java
// 正确：只接收发票ID
@PostMapping("/blue")
public Result pushBlueInvoice(@RequestParam String invoiceId) {
    return invoiceService.pushBlueInvoice(invoiceId);
}
```

### Service层生成规范

**❌ 错误写法（禁止生成）：**
```java
// 错误：直接使用DTO，不查询BIP数据
public InvoiceResult pushBlueInvoice(SaleInvoicePushDTO dto) {
    HxtaxOrderRequest request = converter.convert(dto);  // ❌ 错误
    return hxtaxClient.invoke(request);
}
```

**✅ 正确写法（必须生成）：**
```java
// 正确：先查询BIP发票数据
public InvoiceResult pushBlueInvoice(String invoiceId) {
    // ⚠️ 必须先查询BIP销售发票数据
    JSONObject invoiceData = bipOpenApiClient.querySaleInvoiceDetail(invoiceId);

    // 字段映射转换
    HxtaxOrderRequest request = converter.convert(invoiceData);

    // 调用航信接口
    HxtaxApiResponse response = hxtaxClient.invoke(request);

    // 回写发票状态
    writeBackInvoice(invoiceId, response);

    return InvoiceResult.success(invoiceId);
}
```

---

## ⚠️ BIP OpenAPI调用规范（必须严格遵守）

### 调用流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    BIP API 调用框架                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   鉴权模块   │    │  HTTP调用模块 │    │  响应解析模块 │          │
│  │AccessToken │    │OpenApiUtils │    │ JSON解析   │          │
│  │  Utils    │    │             │    │           │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1: 配置初始化

```java
// BIP OpenAPI配置（通过@Value注入，禁止硬编码）
@Value("${bip.openapi.gateway-url:https://api.yonyoucloud.com}")
private String gatewayUrl;

@Value("${bip.openapi.auth-url:https://api.yonyoucloud.com/iuap-api-auth}")
private String authUrl;

@Value("${bip.openapi.app-key:}")
private String appKey;

@Value("${bip.openapi.app-secret:}")
private String appSecret;
```

### Step 2: Token获取（完整实现）

```java
/**
 * BIP OpenAPI认证服务
 */
@Slf4j
@Service
public class BipAuthService {

    @Value("${bip.openapi.auth-url}")
    private String authUrl;

    @Value("${bip.openapi.app-key}")
    private String appKey;

    @Value("${bip.openapi.app-secret}")
    private String appSecret;

    @Autowired
    private RestTemplate restTemplate;

    /**
     * 获取AccessToken
     * 使用HMAC-SHA256签名算法
     */
    public String getAccessToken() {
        try {
            long timestamp = System.currentTimeMillis();

            // 1. 构建签名参数（按key排序）
            Map<String, String> signParams = new TreeMap<>();
            signParams.put("appKey", appKey);
            signParams.put("timestamp", String.valueOf(timestamp));

            // 2. 生成签名：拼接key1value1key2value2后HMAC-SHA256
            StringBuilder signStr = new StringBuilder();
            for (Map.Entry<String, String> entry : signParams.entrySet()) {
                signStr.append(entry.getKey()).append(entry.getValue());
            }
            String signature = signWithHmacSha256(signStr.toString(), appSecret);

            // 3. 构建请求参数
            Map<String, Object> params = new HashMap<>();
            params.put("appKey", appKey);
            params.put("timestamp", String.valueOf(timestamp));
            params.put("signature", signature);

            // 4. 调用认证接口
            String url = authUrl + "/open-auth/selfAppAuth/getAccessToken";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(params, headers);
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

            // 5. 解析响应
            JSONObject result = JSON.parseObject(response.getBody());
            if ("00000".equals(result.getString("code")) || "success".equals(result.getString("status"))) {
                JSONObject data = result.getJSONObject("data");
                return data.getString("access_token");
            }
            throw new RuntimeException("获取Token失败: " + result.getString("message"));

        } catch (Exception e) {
            log.error("获取BIP AccessToken异常", e);
            throw new RuntimeException("获取AccessToken失败: " + e.getMessage(), e);
        }
    }

    /**
     * HMAC-SHA256签名
     */
    private String signWithHmacSha256(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("签名失败", e);
        }
    }
}
```

### Step 3: BIP OpenAPI客户端（完整实现）

```java
/**
 * BIP OpenAPI客户端
 * 用于查询销售发票数据
 */
@Slf4j
@Component
public class BipOpenApiClient {

    @Value("${bip.openapi.gateway-url}")
    private String gatewayUrl;

    @Autowired
    private BipAuthService authService;

    @Autowired
    private RestTemplate restTemplate;

    /**
     * 查询销售发票详情
     */
    public JSONObject querySaleInvoiceDetail(String invoiceId) {
        String accessToken = authService.getAccessToken();
        String tenantId = InvocationInfoProxy.getTenantid();

        // 完整URL格式：{gatewayUrl}/iuap-api-gateway/{tenantId}/{apiPath}?access_token={token}
        String url = gatewayUrl + "/iuap-api-gateway/voucher/invoice/saleinvoice/detail?access_token=" + accessToken;

        Map<String, Object> params = new HashMap<>();
        params.put("id", invoiceId);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("userid", InvocationInfoProxy.getUserid());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(params, headers);

        try {
            ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            return parseResponse(response.getBody());
        } catch (Exception e) {
            log.error("查询销售发票异常, invoiceId={}", invoiceId, e);
            throw new RuntimeException("查询BIP销售发票失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解析标准响应
     * code="200" 或 code="00000" 表示成功
     */
    private JSONObject parseResponse(String responseBody) {
        if (responseBody == null || responseBody.isEmpty()) {
            throw new RuntimeException("响应为空");
        }

        JSONObject result = JSON.parseObject(responseBody);
        String code = result.getString("code");

        // 成功响应：code="200" 或 code="00000"
        if ("200".equals(code) || "00000".equals(code) || "success".equals(result.getString("status"))) {
            return result.getJSONObject("data");
        }

        // 错误响应
        String message = result.getString("message");
        String detailMessage = result.getString("detailMessage");
        throw new RuntimeException("API调用失败: " + (detailMessage != null ? detailMessage : message));
    }
}
```

### Step 4: 响应标准格式

```json
// 成功响应
{
    "code": "200",
    "data": { ... },
    "message": "success"
}

// 错误响应
{
    "code": "500",
    "message": "错误描述",
    "detailMessage": "详细错误信息"
}
```

## 一、重试机制实现

**⚠️ 所有开票/红冲操作必须实现重试逻辑**

```java
@Slf4j
@Service
public class InvoiceIntegrationServiceImpl implements InvoiceIntegrationService {

    @Value("${invoice.max.retry:3}")
    private int maxRetry = 3;

    @Value("${invoice.retry.delay:1000}")
    private long retryDelayMs = 1000;

    @Override
    public InvoiceApiResponse pushInvoice(String invoiceId, String pushType) {
        int retryCount = 0;
        Exception lastException = null;

        while (retryCount <= maxRetry) {
            try {
                return doPushInvoice(invoiceId, pushType, retryCount);
            } catch (Exception e) {
                lastException = e;
                retryCount++;
                if (retryCount <= maxRetry) {
                    log.warn("开票失败，第{}次重试, invoiceId={}, error={}",
                            retryCount, invoiceId, e.getMessage());
                    try {
                        Thread.sleep(retryDelayMs * retryCount);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
        }

        return handlePushFailure(invoiceId, lastException, retryCount);
    }
}
```

---

## 二、失败回写实现

**⚠️ 重试3次失败后必须回写"开票失败"状态**

```java
    /**
     * 处理开票失败 - 回写"开票失败"状态
     */
    private InvoiceApiResponse handlePushFailure(String invoiceId, Exception e, int retryCount) {
        // 1. 记录失败日志
        logService.logPushFail(invoiceId, null, "MAX_RETRY_EXCEEDED",
                e.getMessage(), 0, retryCount);

        // 2. 回写发票状态为"开票失败"
        writeBackInvoiceStatus(invoiceId, "FAILED", e.getMessage());

        // 3. 返回失败响应
        return InvoiceApiResponse.fail(invoiceId, e.getMessage(), "MAX_RETRY_EXCEEDED");
    }

    /**
     * 回写发票状态
     */
    private void writeBackInvoiceStatus(String invoiceId, String status, String failReason) {
        String sql = String.format(
            "UPDATE voucher_saleinvoice SET invoice_status='%s', fail_reason='%s' WHERE id='%s'",
            status, failReason, invoiceId);
        ymsJdbcApi.executeUpdate(sql);
    }
```

---

## 三、日志记录实现

**⚠️ 必须记录的日志字段**

日志表结构：
```sql
CREATE TABLE c_scm_kk_yl_db.invoice_push_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    invoice_id VARCHAR(64),           -- 发票ID
    invoice_code VARCHAR(64),         -- 发票编码
    invoice_type VARCHAR(32),         -- 发票类型
    push_type VARCHAR(16),            -- 推送类型(BLUE/RED)
    request_time DATETIME,            -- 请求时间
    request_params TEXT,              -- 请求参数(JSON)
    response_result TEXT,             -- 响应结果(JSON)
    response_time DATETIME,           -- 响应时间
    duration_ms BIGINT,               -- 接口耗时(毫秒)
    status VARCHAR(16),               -- 状态(SUCCESS/FAIL/PUSHING)
    error_code VARCHAR(64),           -- 错误码
    error_message TEXT,              -- 错误信息
    retry_count INT,                 -- 重试次数
    tenant_id VARCHAR(64),           -- 租户ID
    create_time DATETIME             -- 创建时间
);
```

日志服务实现：
```java
@Slf4j
@Service
public class InvoicePushLogService {

    @Autowired
    private IYmsJdbcApi ymsJdbcApi;

    public Long logPushStart(String invoiceId, String invoiceCode, String invoiceType,
                             String pushType, String requestData) {
        String sql = String.format(
            "INSERT INTO c_scm_kk_yl_db.invoice_push_log " +
            "(invoice_id, invoice_code, invoice_type, push_type, request_time, " +
            "request_params, status, retry_count, tenant_id, create_time) " +
            "VALUES ('%s', '%s', '%s', '%s', NOW(), '%s', 'PUSHING', 0, '%s', NOW())",
            invoiceId, invoiceCode, invoiceType, pushType, requestData,
            InvocationInfoProxy.getTenantid());
        ymsJdbcApi.executeUpdate(sql);
        return getLastInsertId();
    }

    public void logPushSuccess(Long logId, String responseData, long durationMs) {
        String sql = String.format(
            "UPDATE c_scm_kk_yl_db.invoice_push_log " +
            "SET status='SUCCESS', response_result='%s', duration_ms=%d, " +
            "response_time=NOW() WHERE id=%d",
            responseData, durationMs, logId);
        ymsJdbcApi.executeUpdate(sql);
    }

    public void logPushFail(Long logId, String invoiceId, String errorCode,
                            String errorMessage, long durationMs, int retryCount) {
        String sql = String.format(
            "UPDATE c_scm_kk_yl_db.invoice_push_log " +
            "SET status='FAIL', error_code='%s', error_message='%s', " +
            "duration_ms=%d, retry_count=%d, response_time=NOW() " +
            "WHERE id=%d OR invoice_id='%s'",
            errorCode, errorMessage, durationMs, retryCount, logId, invoiceId);
        ymsJdbcApi.executeUpdate(sql);
    }
}
```

---

## 四、数据回写实现

**⚠️ 开票成功后必须回写以下字段**

```java
    /**
     * 回写发票信息（开票成功）
     */
    private void writeBackInvoiceSuccess(String invoiceId, HangXinInvoiceResponse response) {
        // 1. 构建回写SQL（发票代码、发票号码、开票日期）
        String sql = String.format(
            "UPDATE voucher_saleinvoice SET " +
            "invoice_code='%s', invoice_number='%s', invoice_date='%s', " +
            "invoice_status='SUCCESS', write_back_time=NOW() " +
            "WHERE id='%s'",
            response.getInvoiceCode(),
            response.getInvoiceNumber(),
            response.getInvoiceDate(),
            invoiceId);

        // 2. 执行回写
        ymsJdbcApi.executeUpdate(sql);

        // 3. 记录回写日志
        log.info("发票信息回写成功, invoiceId={}, code={}, number={}, date={}",
                invoiceId, response.getInvoiceCode(),
                response.getInvoiceNumber(), response.getInvoiceDate());
    }
```

---

## 五、完整Service实现模板

```java
@Slf4j
@Service
public class InvoiceIntegrationServiceImpl implements InvoiceIntegrationService {

    @Autowired
    private BipOpenApiClient bipOpenApiClient;

    @Autowired
    private HangXinApiClient hangXinApiClient;

    @Autowired
    private InvoiceFieldConverter fieldConverter;

    @Autowired
    private InvoicePushLogService logService;

    @Autowired
    private IYmsJdbcApi ymsJdbcApi;

    @Value("${invoice.max.retry:3}")
    private int maxRetry = 3;

    @Value("${invoice.retry.delay:1000}")
    private long retryDelayMs = 1000;

    @Override
    public InvoiceApiResponse pushInvoice(String invoiceId, String pushType) {
        int retryCount = 0;
        Exception lastException = null;

        while (retryCount <= maxRetry) {
            try {
                return doPushInvoice(invoiceId, pushType, retryCount);
            } catch (Exception e) {
                lastException = e;
                retryCount++;
                if (retryCount <= maxRetry) {
                    log.warn("开票失败，第{}次重试, invoiceId={}, error={}",
                            retryCount, invoiceId, e.getMessage());
                    try {
                        Thread.sleep(retryDelayMs * retryCount);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
        }

        return handlePushFailure(invoiceId, lastException, retryCount);
    }

    private InvoiceApiResponse doPushInvoice(String invoiceId, String pushType, int retryCount) {
        long startTime = System.currentTimeMillis();

        // 1. 通过BIP OpenAPI查询发票数据
        JSONObject invoiceData = bipOpenApiClient.querySaleInvoiceDetail(invoiceId);

        // 2. 记录推送日志
        String requestData = JSON.toJSONString(invoiceData);
        Long logId = logService.logPushStart(invoiceId,
                invoiceData.getString("code"),
                invoiceData.getString("invoiceType"),
                pushType, requestData);

        // 3. 字段映射转换
        HangXinInvoiceRequest hangXinRequest = fieldConverter.convert(invoiceData);

        // 4. 调用航信开票接口
        HangXinInvoiceResponse response = hangXinApiClient.batchInvoice(
                Collections.singletonList(hangXinRequest));

        long durationMs = System.currentTimeMillis() - startTime;

        // 5. 处理响应
        if (response.isSuccess()) {
            // 回写发票信息
            writeBackInvoiceSuccess(invoiceId, response);
            logService.logPushSuccess(logId, JSON.toJSONString(response), durationMs);
            return InvoiceApiResponse.success(invoiceId);
        } else {
            logService.logPushFail(logId, invoiceId, response.getErrorCode(),
                    response.getMessage(), durationMs, retryCount);
            throw new RuntimeException(response.getMessage());
        }
    }

    private InvoiceApiResponse handlePushFailure(String invoiceId, Exception e, int retryCount) {
        log.error("开票重试{}次均失败, invoiceId={}", maxRetry, invoiceId, e);
        logService.logPushFail(null, invoiceId, "MAX_RETRY_EXCEEDED",
                e.getMessage(), 0, retryCount);
        writeBackInvoiceStatus(invoiceId, "FAILED", e.getMessage());
        return InvoiceApiResponse.fail(invoiceId, e.getMessage(), "MAX_RETRY_EXCEEDED");
    }
}
```

---

## 六、代码分层结构

**⚠️ 代码生成路径：必须在 `{引擎}-service/src/main/java/com/voucher/{三方系统}/` 下**

```
{引擎}-service/src/main/java/com/voucher/{三方系统或模块}/
├── controller/
│   └── InvoiceIntegrationController.java
├── service/
│   ├── InvoiceIntegrationService.java
│   └── impl/
│       └── InvoiceIntegrationServiceImpl.java
├── entity/
│   ├── request/
│   │   └── HangXinInvoiceRequest.java
│   └── response/
│       ├── HangXinInvoiceResponse.java
│       └── InvoiceApiResponse.java
├── api/
│   ├── BipOpenApiClient.java
│   └── HangXinApiClient.java
├── config/
│   ├── HangXinConfig.java
│   └── BipOpenApiConfig.java
├── translation/
│   └── InvoiceFieldConverter.java
└── log/
    └── InvoicePushLogService.java
```

**示例**：
- 航信系统：`com.voucher.hangxin.controller.InvoiceIntegrationController`
- 税控系统：`com.voucher.taxsystem.controller.InvoiceIntegrationController`

---

## 七、检查清单

- [x] **重试机制**：失败自动重试3次
- [x] **失败回写**：重试失败后回写"开票失败"状态
- [x] **日志记录**：请求参数、响应结果、接口耗时
- [x] **数据回写**：发票代码、发票号码、开票日期
- [x] **配置管理**：使用@Value注解
- [x] **代码分层**：按厂商/业务/MVC分层
- [x] 禁止内部类
- [x] 只生成MVC代码
- [x] 使用BIP OpenAPI查询
- [x] 使用IYmsJdbcApi回写

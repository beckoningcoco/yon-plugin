# 出库申请调用WMS接口场景规范

## 业务语义

调用WMS接口是指将已转换好的出库申请数据通过HTTP/HTTPS协议推送到WMS系统，实现BIP与WMS的数据同步。

### 业务目标

确保出库申请数据能够安全、可靠地传输到WMS系统，并获取WMS的处理结果。

### 前置条件

1. 已完成出库申请数据查询
2. 已完成字段转换
3. 已配置WMS接口地址和认证信息
4. 网络连接正常

## 核心流程

```
WMS请求DTO ──▶ 构建HTTP请求 ──▶ 发送请求 ──▶ 接收响应 ──▶ 处理结果
```

## 接口规范

### 请求方式

- **HTTP Method**：POST
- **Content-Type**：application/json
- **字符编码**：UTF-8

### 请求头规范

| 请求头 | 说明 | 示例值 |
|--------|------|--------|
| Content-Type | 内容类型 | application/json |
| Authorization | 认证令牌（如需要） | Bearer {token} |
| uuid | 请求唯一标识 | UUID字符串 |

### 接口地址配置

```java
/**
 * WMS接口地址配置
 */
@Configuration
@ConfigurationProperties(prefix = "wms.api")
@Data
public class WmsApiConfig {
    
    /** ESB域名 */
    private String esbDomain;
    
    /** 出库申请推送接口路径 */
    private String pickingRequisitionPath;
    
    /** 认证令牌 */
    private String authorization;
    
    /** 连接超时时间（毫秒） */
    private int connectTimeout = 30000;
    
    /** 读取超时时间（毫秒） */
    private int readTimeout = 30000;
    
    /**
     * 获取完整接口地址
     */
    public String getFullUrl() {
        return esbDomain + pickingRequisitionPath;
    }
}
```

## 核心代码模板

### 1. WMS接口调用服务接口

```java
/**
 * WMS接口调用服务
 */
public interface WmsApiService {
    
    /**
     * 推送出库申请到WMS
     * @param requestDTO 出库申请请求数据
     * @return WMS响应结果
     */
    WmsResponseDTO pushPickingRequisition(WmsPickingRequisitionRequestDTO requestDTO);
    
    /**
     * 批量推送出库申请到WMS
     * @param requestDTOList 出库申请请求列表
     * @return WMS响应结果列表
     */
    List<WmsResponseDTO> pushPickingRequisitionBatch(List<WmsPickingRequisitionRequestDTO> requestDTOList);
    
    /**
     * 取消已推送的出库申请
     * @param docNo 单据编号
     * @param orderType 单据类型
     * @return 取消结果
     */
    WmsResponseDTO cancelPickingRequisition(String docNo, String orderType);
}
```

### 2. WMS接口调用服务实现

```java
/**
 * WMS接口调用服务实现
 */
@Service
@Slf4j
public class WmsApiServiceImpl implements WmsApiService {
    
    @Autowired
    private WmsApiConfig wmsApiConfig;
    
    @Autowired
    private RestTemplate restTemplate;
    
    @Override
    public WmsResponseDTO pushPickingRequisition(WmsPickingRequisitionRequestDTO requestDTO) {
        if (requestDTO == null) {
            throw new BusinessException("请求数据不能为空");
        }
        
        String url = wmsApiConfig.getFullUrl();
        String requestBody = JSON.toJSONString(requestDTO);
        
        log.info("推送出库申请到WMS，URL：{}，请求数据：{}", url, requestBody);
        
        try {
            // 构建请求头
            HttpHeaders headers = buildHeaders();
            
            // 构建请求实体
            HttpEntity<String> entity = new HttpEntity<>(requestBody, headers);
            
            // 发送请求
            ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                entity,
                String.class
            );
            
            // 解析响应
            String responseBody = response.getBody();
            log.info("WMS响应数据：{}", responseBody);
            
            return parseResponse(responseBody);
            
        } catch (HttpClientErrorException e) {
            log.error("WMS接口调用失败，HTTP错误：{}", e.getStatusCode(), e);
            throw new BusinessException("WMS接口调用失败：" + e.getMessage());
        } catch (ResourceAccessException e) {
            log.error("WMS接口连接超时", e);
            throw new BusinessException("WMS接口连接超时，请稍后重试");
        } catch (Exception e) {
            log.error("WMS接口调用异常", e);
            throw new BusinessException("WMS接口调用异常：" + e.getMessage());
        }
    }
    
    @Override
    public List<WmsResponseDTO> pushPickingRequisitionBatch(List<WmsPickingRequisitionRequestDTO> requestDTOList) {
        if (CollectionUtils.isEmpty(requestDTOList)) {
            return Collections.emptyList();
        }
        
        List<WmsResponseDTO> results = new ArrayList<>();
        for (WmsPickingRequisitionRequestDTO requestDTO : requestDTOList) {
            try {
                WmsResponseDTO response = pushPickingRequisition(requestDTO);
                results.add(response);
            } catch (Exception e) {
                log.error("批量推送失败，单据号：{}", requestDTO.getDocNo(), e);
                // 构建失败响应
                WmsResponseDTO errorResponse = new WmsResponseDTO();
                errorResponse.setSuccess(false);
                errorResponse.setCode("ERROR");
                errorResponse.setMessage(e.getMessage());
                results.add(errorResponse);
            }
        }
        return results;
    }
    
    @Override
    public WmsResponseDTO cancelPickingRequisition(String docNo, String orderType) {
        if (StringUtils.isBlank(docNo)) {
            throw new BusinessException("单据编号不能为空");
        }
        
        // 构建取消请求参数
        Map<String, Object> cancelParam = new HashMap<>();
        cancelParam.put("customerId", getOrgCode());
        cancelParam.put("warehouse", getOrgCode());
        cancelParam.put("createSource", "ERP");
        cancelParam.put("orderType", orderType);
        cancelParam.put("docNo", docNo);
        cancelParam.put("actionType", "CA");
        
        String url = wmsApiConfig.getEsbDomain() + "/xdesb/erp/erp_genDelBillTask_243";
        String requestBody = JSON.toJSONString(cancelParam);
        
        log.info("取消WMS出库申请，URL：{}，请求数据：{}", url, requestBody);
        
        try {
            HttpHeaders headers = buildHeaders();
            HttpEntity<String> entity = new HttpEntity<>(requestBody, headers);
            
            ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                entity,
                String.class
            );
            
            return parseResponse(response.getBody());
            
        } catch (Exception e) {
            log.error("取消WMS出库申请失败", e);
            throw new BusinessException("取消WMS出库申请失败：" + e.getMessage());
        }
    }
    
    /**
     * 构建请求头
     */
    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("uuid", UuidUtil.getShortUuid());
        
        // 如需要认证，添加Authorization头
        if (StringUtils.isNotBlank(wmsApiConfig.getAuthorization())) {
            headers.set("Authorization", wmsApiConfig.getAuthorization());
        }
        
        return headers;
    }
    
    /**
     * 解析响应
     */
    private WmsResponseDTO parseResponse(String responseBody) {
        if (StringUtils.isBlank(responseBody)) {
            throw new BusinessException("WMS返回数据为空");
        }
        
        try {
            JSONObject jsonObject = JSON.parseObject(responseBody);
            WmsResponseDTO responseDTO = new WmsResponseDTO();
            
            // 解析成功标识（根据实际WMS接口调整）
            String code = jsonObject.getString("code");
            String success = jsonObject.getString("success");
            String msg = jsonObject.getString("msg");
            String message = jsonObject.getString("message");
            
            responseDTO.setCode(code);
            responseDTO.setSuccess("S".equals(code) || "200".equals(code) || "true".equals(success));
            responseDTO.setMessage(StringUtils.isNotBlank(msg) ? msg : message);
            
            // 解析业务数据（如有）
            if (jsonObject.containsKey("data")) {
                responseDTO.setData(jsonObject.getJSONObject("data"));
            }
            
            return responseDTO;
            
        } catch (Exception e) {
            log.error("解析WMS响应失败", e);
            throw new BusinessException("解析WMS响应失败：" + e.getMessage());
        }
    }
    
    /**
     * 获取组织编码（示例）
     */
    private String getOrgCode() {
        // 从上下文获取当前组织编码
        return InvocationInfoProxy.getTenantid();
    }
}
```

### 3. HTTP客户端配置

```java
/**
 * HTTP客户端配置
 */
@Configuration
public class HttpClientConfig {
    
    @Bean
    public RestTemplate restTemplate(WmsApiConfig wmsApiConfig) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(wmsApiConfig.getConnectTimeout());
        factory.setReadTimeout(wmsApiConfig.getReadTimeout());
        
        RestTemplate restTemplate = new RestTemplate(factory);
        
        // 设置字符编码
        List<HttpMessageConverter<?>> converters = restTemplate.getMessageConverters();
        for (HttpMessageConverter<?> converter : converters) {
            if (converter instanceof StringHttpMessageConverter) {
                ((StringHttpMessageConverter) converter).setDefaultCharset(StandardCharsets.UTF_8);
            }
        }
        
        return restTemplate;
    }
}
```

### 4. WMS响应DTO定义

```java
/**
 * WMS响应DTO
 */
@Data
public class WmsResponseDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /** 是否成功 */
    private boolean success;
    
    /** 响应码 */
    private String code;
    
    /** 响应消息 */
    private String message;
    
    /** 业务数据 */
    private JSONObject data;
    
    /**
     * 判断是否重复推送
     */
    public boolean isDuplicate() {
        return StringUtils.isNotBlank(message) && 
               (message.contains("不允许重复推送") || message.contains("已存在"));
    }
    
    /**
     * 判断是否查询失败（特定业务场景）
     */
    public boolean isQueryFailed() {
        return StringUtils.isNotBlank(message) && 
               message.contains("仓库下查询预期到货通知单失败");
    }
}
```

### 5. 接口地址映射

```java
/**
 * WMS接口地址映射
 */
@Component
public class WmsUrlMapping {
    
    private static final Map<String, String> URL_MAP = new HashMap<>();
    
    static {
        // 出库申请相关接口
        URL_MAP.put("pickingRequisition", "/xdesb/erp/erp_erpadditorder_199");
        URL_MAP.put("costCenterPicking", "/xdesb/erp/erp_erpcbzxorder_201");
        URL_MAP.put("workshopReturn", "/xdesb/erp/erp_prodlinertn_202");
        URL_MAP.put("outsourcingPicking", "/xdesb/wms/wms_re_xd_outsourceoub_034/1.0.0");
        URL_MAP.put("outsourcingReturn", "/xdesb/wms/wms_re_xd_outsourceoubrtn_044/1.0.0");
        URL_MAP.put("cancelBill", "/xdesb/erp/erp_genDelBillTask_243");
    }
    
    /**
     * 根据单据类型获取接口路径
     */
    public String getUrlByOrderType(String orderType) {
        switch (orderType) {
            case "OUB0208":
                return URL_MAP.get("pickingRequisition");
            case "OUB0215":
                return URL_MAP.get("costCenterPicking");
            case "INB0303":
                return URL_MAP.get("workshopReturn");
            case "OUB0203":
                return URL_MAP.get("outsourcingPicking");
            case "INB0104":
                return URL_MAP.get("outsourcingReturn");
            default:
                return URL_MAP.get("pickingRequisition");
        }
    }
}
```

## 请求示例

### 标准生产领料请求

```json
{
  "customerId": "1001",
  "docNo": "LL202403090001",
  "docHeaderId": "1234567890",
  "orderType": "OUB0208",
  "bustype": "FA001",
  "workshop": "WS001",
  "prodLine": "PL001",
  "createSource": "ERP",
  "orderDate": "20240309",
  "workDocNo": "MO202403090001",
  "ERPOrderNo": "MO202403090001",
  "notes": "生产领料",
  "details": [
    {
      "lineNo": "1",
      "docLineId": "detail001",
      "sku": "MAT001",
      "skuDesc": "物料名称",
      "qty": 100.000000,
      "uom": "PCS",
      "ERPoutSublibrary": "WH001",
      "ERPinSublibrary": "WH001",
      "costCenter": "CC001",
      "workStation": "ST001",
      "workDocNo": "MO202403090001",
      "attribute4": "BATCH001",
      "attribute1": "20240301",
      "attribute2": "20250301"
    }
  ]
}
```

## 响应示例

### 成功响应

```json
{
  "code": "S",
  "success": "true",
  "msg": "推送成功",
  "data": {
    "docNo": "LL202403090001",
    "wmsBillNo": "WMS202403090001"
  }
}
```

### 失败响应

```json
{
  "code": "E",
  "success": "false",
  "msg": "仓库编码不存在",
  "data": null
}
```

## 异常处理

### 常见异常场景

1. **网络超时**：连接WMS服务器超时
2. **认证失败**：Authorization令牌无效
3. **数据格式错误**：请求JSON格式不正确
4. **业务校验失败**：WMS业务规则校验不通过

### 重试机制

```java
/**
 * 带重试的WMS接口调用
 */
@Component
@Slf4j
public class WmsApiRetryService {
    
    @Autowired
    private WmsApiService wmsApiService;
    
    private static final int MAX_RETRY = 3;
    private static final long RETRY_INTERVAL = 5000; // 5秒
    
    /**
     * 带重试的推送
     */
    public WmsResponseDTO pushWithRetry(WmsPickingRequisitionRequestDTO requestDTO) {
        int retryCount = 0;
        Exception lastException = null;
        
        while (retryCount < MAX_RETRY) {
            try {
                return wmsApiService.pushPickingRequisition(requestDTO);
            } catch (ResourceAccessException e) {
                // 网络超时，可以重试
                lastException = e;
                retryCount++;
                log.warn("WMS推送超时，第{}次重试", retryCount);
                
                if (retryCount < MAX_RETRY) {
                    try {
                        Thread.sleep(RETRY_INTERVAL);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
            } catch (Exception e) {
                // 其他异常，不重试
                throw e;
            }
        }
        
        throw new BusinessException("WMS推送失败，已重试" + MAX_RETRY + "次：" + lastException.getMessage());
    }
}
```

## 注意事项

1. **接口地址**：从配置文件动态读取，支持多环境切换
2. **超时设置**：连接超时和读取超时建议设置为30秒
3. **字符编码**：统一使用UTF-8编码
4. **重试机制**：仅对网络超时进行重试，业务异常不重试
5. **幂等性**：WMS接口应支持幂等调用，避免重复数据
6. **日志记录**：记录完整的请求和响应数据，便于问题排查

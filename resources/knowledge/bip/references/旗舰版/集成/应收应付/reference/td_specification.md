# 财务单据集成托底规范

## 概述

> **⚠️ 托底场景**：当无厂商配置或 fallbackEnabled=true 时使用本规范

---

## 托底实现

### 托底逻辑

1. 使用默认的 REST API 进行数据交互
2. 不涉及复杂的鉴权和数据转换
3. 简单的 JSON 格式交互
4. 提供基础的错误处理

### 托底触发条件

| 条件 | 说明 |
|------|------|
| fallbackEnabled=true | 配置中明确启用托底 |
| 无厂商配置 | 未配置第三方厂商信息 |
| 主流程失败 | 主流程执行失败后降级到托底 |

---

## 托底字段映射

### 单据录入场景

| BIP 字段 | 第三方字段 | 说明 |
|---------|-----------|------|
| bill_code | billCode | 单据编号 |
| bill_date | billDate | 单据日期 |
| amount | amount | 金额 |
| currency | currency | 币种 |

### 单据推送场景

| BIP 字段 | 第三方字段 | 说明 |
|---------|-----------|------|
| bill_code | billCode | 单据编号 |
| amount | amount | 金额 |
| status | status | 单据状态 |

---

## 托底 API

### 单据录入托底接口

#### 保存接口

```
POST /api/fallback/bill/save
```

**请求参数**：

```json
{
  "billCode": "单据编号",
  "billDate": "单据日期",
  "amount": 1000.00,
  "currency": "CNY"
}
```

**响应参数**：

```json
{
  "success": true,
  "data": {
    "id": "单据ID"
  },
  "message": "保存成功"
}
```

### 单据推送托底接口

#### 推送接口

```
POST /api/fallback/bill/push
```

**请求参数**：

```json
{
  "billCode": "单据编号",
  "amount": 1000.00,
  "status": "APPROVED"
}
```

**响应参数**：

```json
{
  "success": true,
  "message": "推送成功"
}
```

#### 状态查询接口

```
GET /api/fallback/bill/status/{billCode}
```

**响应参数**：

```json
{
  "success": true,
  "data": {
    "billCode": "单据编号",
    "status": "SUCCESS"
  }
}
```

---

## 托底配置

```yaml
fallback:
  enabled: true
  api_base_url: "http://localhost:8080/api/fallback"
  timeout: 30000
  retry_times: 3
  retry_interval: 5000
```

---

## Service 层实现

```java
@Service
public class FallbackIntegrationServiceImpl implements FallbackIntegrationService {
    
    @Value("${fallback.api_base_url}")
    private String fallbackApiBaseUrl;
    
    @Value("${fallback.timeout:30000}")
    private int timeout;
    
    @Autowired
    private RestTemplate restTemplate;
    
    @Override
    public Map<String, Object> saveBill(JSONObject billData) {
        try {
            // 1. 构建托底请求数据
            JSONObject fallbackData = buildFallbackData(billData);
            
            // 2. 调用托底接口
            String url = fallbackApiBaseUrl + "/bill/save";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(fallbackData.toJSONString(), headers);
            
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
            
            // 3. 解析响应
            return JSON.parseObject(response.getBody(), Map.class);
        } catch (Exception e) {
            return Map.of("success", false, "message", "托底接口调用失败: " + e.getMessage());
        }
    }
    
    @Override
    public Map<String, Object> pushBill(String billCode, JSONObject billData) {
        try {
            // 1. 构建托底请求数据
            JSONObject fallbackData = new JSONObject();
            fallbackData.put("billCode", billCode);
            fallbackData.put("amount", billData.getBigDecimal("amount"));
            fallbackData.put("status", billData.getString("status"));
            
            // 2. 调用托底接口
            String url = fallbackApiBaseUrl + "/bill/push";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<String> entity = new HttpEntity<>(fallbackData.toJSONString(), headers);
            
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
            
            // 3. 解析响应
            return JSON.parseObject(response.getBody(), Map.class);
        } catch (Exception e) {
            return Map.of("success", false, "message", "托底接口调用失败: " + e.getMessage());
        }
    }
    
    @Override
    public Map<String, Object> checkBillStatus(String billCode) {
        try {
            // 1. 调用托底状态查询接口
            String url = fallbackApiBaseUrl + "/bill/status/" + billCode;
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            
            // 2. 解析响应
            return JSON.parseObject(response.getBody(), Map.class);
        } catch (Exception e) {
            return Map.of("success", false, "message", "托底接口调用失败: " + e.getMessage());
        }
    }
    
    private JSONObject buildFallbackData(JSONObject billData) {
        // 构建托底数据，只保留基础字段
        JSONObject fallbackData = new JSONObject();
        fallbackData.put("billCode", billData.getString("bill_code"));
        fallbackData.put("billDate", billData.getString("bill_date"));
        fallbackData.put("amount", billData.getBigDecimal("amount"));
        fallbackData.put("currency", billData.getString("currency"));
        return fallbackData;
    }
}
```

---

## 重试机制

### 重试策略

| 参数 | 默认值 | 说明 |
|------|--------|------|
| retry_times | 3 | 重试次数 |
| retry_interval | 5000 | 重试间隔（毫秒） |

### 重试实现

```java
public Map<String, Object> saveBillWithRetry(JSONObject billData) {
    int retryTimes = 3;
    int retryInterval = 5000;
    
    for (int i = 0; i < retryTimes; i++) {
        try {
            return saveBill(billData);
        } catch (Exception e) {
            if (i == retryTimes - 1) {
                throw e;
            }
            try {
                Thread.sleep(retryInterval);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
        }
    }
    
    return Map.of("success", false, "message", "重试失败");
}
```

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| FB001 | 托底接口不可用 | 记录日志，返回错误 |
| FB002 | 托底接口超时 | 重试，超过次数后返回错误 |
| FB003 | 托底数据格式错误 | 返回错误，不重试 |

---

## 日志记录

### 日志级别

| 级别 | 场景 |
|------|------|
| INFO | 托底接口调用成功 |
| WARN | 托底接口调用失败，正在重试 |
| ERROR | 托底接口调用失败，已达到最大重试次数 |

### 日志内容

```java
log.info("托底接口调用成功, billCode: {}, url: {}", billCode, url);
log.warn("托底接口调用失败, 正在重试, billCode: {}, retryCount: {}", billCode, retryCount);
log.error("托底接口调用失败, 已达到最大重试次数, billCode: {}, error: {}", billCode, e.getMessage());
```

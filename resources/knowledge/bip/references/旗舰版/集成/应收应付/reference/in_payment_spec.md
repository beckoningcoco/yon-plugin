# 付款单录入规范

## 场景说明

本规范适用于第三方系统向 BIP 系统录入付款单的场景。

---

## 接口定义

### 付款单保存并提交

```
POST /payment/save
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 付款单数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| data | JSONObject | 返回数据，包含 id |
| message | string | 消息 |

---

## 字段映射

### 付款单主表字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| payment_code | payment_code | String | 是 | 付款单号 |
| amount | amount | BigDecimal | 是 | 付款金额 |
| payment_date | payment_date | Date | 是 | 付款日期 |
| supplier | supplier | String | 是 | 供应商 |
| account | account | String | 是 | 付款账户 |
| currency | currency | String | 是 | 币种 |
| payment_method | payment_method | String | 否 | 付款方式 |

### 付款单明细字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| payable_id | payable_id | String | 否 | 关联应付单ID |
| payment_amount | payment_amount | BigDecimal | 是 | 核销金额 |

---

## BIP API 路径

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/payment/save | 付款单保存 |
| 提交 | /yonbip/EFI/payment/submit | 付款单提交 |
| 查询 | /yonbip/EFI/payment/detail | 付款单详情查询 |
| 查询 | /yonbip/EFI/payment/saveandsubmit | 付款单保存并提交 |

---

## Service 层实现

```java
@Service
public class PaymentIntegrationServiceImpl implements PaymentIntegrationService {
    
    @Autowired
    private BIPIntegrationUtils bipIntegrationUtils;
    
    @Value("${bip.sys.host}")
    private String bipSysHost;
    
    @Value("${bip.gateway.url}")
    private String gatewayUrl;
    
    @Override
    public Map<String, Object> savePayment(JSONObject json) {
        // 1. 数据预处理
        JSONObject processedJson = preprocessPaymentData(json);
        
        // 2. 获取访问令牌
        String accessToken = bipIntegrationUtils.getAccessToken();
        
        // 3. 调用 BIP 保存接口
        String saveUrl = bipIntegrationUtils.buildRequestUrl(
            bipSysHost + gatewayUrl + "/yonbip/EFI/payment/saveandsubmit", 
            accessToken
        );
        Map<String, Object> saveResult = bipIntegrationUtils.sendPostRequest(saveUrl, processedJson);
        
        // 8. 返回保存结果
        return saveResult;
    }
    
    private JSONObject preprocessPaymentData(JSONObject json) {
        // 数据预处理逻辑
        // 1. 必填字段校验
        // 2. 格式转换
        // 3. 默认值设置
        return json;
    }
}
```

---

## Controller 层实现

```java
@RestController
@RequestMapping("/api/payment")
public class PaymentIntegrationController {
    
    @Autowired
    private PaymentIntegrationService paymentIntegrationService;
    
    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> savePayment(@RequestBody JSONObject request) {
        try {
            // 参数校验
            validateRequest(request);
            
            // 调用 Service 层
            Map<String, Object> result = paymentIntegrationService.savePayment(request);
            
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    private void validateRequest(JSONObject request) {
        // 参数校验逻辑
        if (request == null || !request.containsKey("data")) {
            throw new IllegalArgumentException("请求参数不能为空");
        }
    }
}
```

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| PMT001 | 付款单保存失败 | 返回错误消息 |
| PMT002 | 付款单提交失败 | 返回错误消息，记录已保存的单据ID |
| PMT003 | 必填字段缺失 | 返回校验错误 |
| PMT004 | 供应商不存在 | 返回错误消息 |
| PMT005 | 付款账户不存在 | 返回错误消息 |

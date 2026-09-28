# 应付发票录入规范

## 场景说明

本规范适用于第三方系统向 BIP 系统录入应付发票的场景。

---

## 接口定义

### 应付发票保存并提交

```
POST /payable/save
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 应付发票数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| data | JSONObject | 返回数据，包含 id |
| message | string | 消息 |

---

## 字段映射

### 应付发票主表字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| payable_code | invoice_code | String | 是 | 应付发票号 |
| amount | amount | BigDecimal | 是 | 发票金额 |
| invoice_date | invoice_date | Date | 是 | 发票日期 |
| supplier | supplier | String | 是 | 供应商 |
| currency | currency | String | 是 | 币种 |
| invoice_type | invoice_type | String | 否 | 发票类型 |
| tax_rate | tax_rate | BigDecimal | 否 | 税率 |

### 应付发票明细字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| item_name | item_name | String | 是 | 项目名称 |
| item_amount | item_amount | BigDecimal | 是 | 项目金额 |
| tax_amount | tax_amount | BigDecimal | 否 | 税额 |

---

## BIP API 路径

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/payable/save | 应付发票保存 |
| 提交 | /yonbip/EFI/payable/submit | 应付发票提交审批 |
| 查询 | /yonbip/EFI/payable/detail | 应付发票详情查询 |

---

## Service 层实现

```java
@Service
public class PayableIntegrationServiceImpl implements PayableIntegrationService {
    
    @Autowired
    private BIPIntegrationUtils bipIntegrationUtils;
    
    @Value("${bip.sys.host}")
    private String bipSysHost;
    
    @Value("${bip.gateway.url}")
    private String gatewayUrl;
    
    @Override
    public Map<String, Object> savePayable(JSONObject json) {
        // 1. 数据预处理
        JSONObject processedJson = preprocessPayableData(json);
        
        // 2. 获取访问令牌
        String accessToken = bipIntegrationUtils.getAccessToken();
        
        // 3. 调用 BIP 保存接口
        String saveUrl = bipIntegrationUtils.buildRequestUrl(
            bipSysHost + gatewayUrl + "/yonbip/EFI/payable/save", 
            accessToken
        );
        Map<String, Object> saveResult = bipIntegrationUtils.sendPostRequest(saveUrl, processedJson);
        
        // 4. 判断保存是否成功
        if (bipIntegrationUtils.isSuccessResponse(saveResult)) {
            // 5. 获取保存后的 ID
            String id = bipIntegrationUtils.getIdFromResponse(saveResult);
            
            // 6. 调用 BIP 提交接口
            String submitUrl = bipIntegrationUtils.buildRequestUrl(
                bipSysHost + gatewayUrl + "/yonbip/EFI/payable/submit", 
                accessToken
            );
            Map<String, Object> submitResult = bipIntegrationUtils.sendPostRequest(
                submitUrl, 
                bipIntegrationUtils.createRequestBody(id)
            );
            
            // 7. 返回提交结果
            return submitResult;
        }
        
        // 8. 返回保存结果
        return saveResult;
    }
    
    private JSONObject preprocessPayableData(JSONObject json) {
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
@RequestMapping("/api/payable")
public class PayableIntegrationController {
    
    @Autowired
    private PayableIntegrationService payableIntegrationService;
    
    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> savePayable(@RequestBody JSONObject request) {
        try {
            // 参数校验
            validateRequest(request);
            
            // 调用 Service 层
            Map<String, Object> result = payableIntegrationService.savePayable(request);
            
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
| PAY001 | 应付发票保存失败 | 返回错误消息 |
| PAY002 | 应付发票提交失败 | 返回错误消息，记录已保存的单据ID |
| PAY003 | 必填字段缺失 | 返回校验错误 |
| PAY004 | 供应商不存在 | 返回错误消息 |

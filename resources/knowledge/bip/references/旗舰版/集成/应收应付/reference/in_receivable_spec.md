# 应收发票录入规范

## 场景说明

本规范适用于第三方系统向 BIP 系统录入应收发票的场景。

---

## 接口定义

### 应收发票保存并提交

```
POST /receivable/save
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 应收发票数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| data | JSONObject | 返回数据，包含 id |
| message | string | 消息 |

---

## 字段映射

### 应收发票主表字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| receivable_code | invoice_code | String | 是 | 应收发票号 |
| amount | amount | BigDecimal | 是 | 发票金额 |
| invoice_date | invoice_date | Date | 是 | 发票日期 |
| customer | customer | String | 是 | 客户 |
| currency | currency | String | 是 | 币种 |
| invoice_type | invoice_type | String | 否 | 发票类型 |
| tax_rate | tax_rate | BigDecimal | 否 | 税率 |

### 应收发票明细字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| item_name | item_name | String | 是 | 项目名称 |
| item_amount | item_amount | BigDecimal | 是 | 项目金额 |
| tax_amount | tax_amount | BigDecimal | 否 | 税额 |

---

## BIP API 路径

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/receivable/save | 应收发票保存 |
| 提交 | /yonbip/EFI/receivable/submit | 应收发票提交 |
| 查询 | /yonbip/EFI/receivable/detail | 应收发票详情查询 |

---

## Service 层实现

```java
@Service
public class ReceivableIntegrationServiceImpl implements ReceivableIntegrationService {
    
    @Autowired
    private BIPIntegrationUtils bipIntegrationUtils;
    
    @Value("${bip.sys.host}")
    private String bipSysHost;
    
    @Value("${bip.gateway.url}")
    private String gatewayUrl;
    
    @Override
    public Map<String, Object> saveReceivable(JSONObject json) {
        // 1. 数据预处理
        JSONObject processedJson = preprocessReceivableData(json);
        
        // 2. 获取访问令牌
        String accessToken = bipIntegrationUtils.getAccessToken();
        
        // 3. 调用 BIP 保存接口
        String saveUrl = bipIntegrationUtils.buildRequestUrl(
            bipSysHost + gatewayUrl + "/yonbip/EFI/receivable/save", 
            accessToken
        );
        Map<String, Object> saveResult = bipIntegrationUtils.sendPostRequest(saveUrl, processedJson);
        
        // 4. 判断保存是否成功
        if (bipIntegrationUtils.isSuccessResponse(saveResult)) {
            // 5. 获取保存后的 ID
            String id = bipIntegrationUtils.getIdFromResponse(saveResult);
            
            // 6. 调用 BIP 提交接口
            String submitUrl = bipIntegrationUtils.buildRequestUrl(
                bipSysHost + gatewayUrl + "/yonbip/EFI/receivable/submit", 
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
    
    private JSONObject preprocessReceivableData(JSONObject json) {
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
@RequestMapping("/api/receivable")
public class ReceivableIntegrationController {
    
    @Autowired
    private ReceivableIntegrationService receivableIntegrationService;
    
    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> saveReceivable(@RequestBody JSONObject request) {
        try {
            // 参数校验
            validateRequest(request);
            
            // 调用 Service 层
            Map<String, Object> result = receivableIntegrationService.saveReceivable(request);
            
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
| REC001 | 应收发票保存失败 | 返回错误消息 |
| REC002 | 应收发票提交失败 | 返回错误消息，记录已保存的单据ID |
| REC003 | 必填字段缺失 | 返回校验错误 |
| REC004 | 客户不存在 | 返回错误消息 |

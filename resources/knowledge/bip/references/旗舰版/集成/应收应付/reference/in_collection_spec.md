# 收款单录入规范

## 场景说明

本规范适用于第三方系统向 BIP 系统录入收款单的场景。

---

## 接口定义

### 收款单保存并提交

```
POST /collection/save
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| data | JSONObject | 是 | 收款单数据 |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| success | boolean | 是否成功 |
| data | JSONObject | 返回数据，包含 id |
| message | string | 消息 |

---

## 字段映射

### 收款单主表字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| collection_code | collection_code | String | 是 | 收款单号 |
| amount | amount | BigDecimal | 是 | 收款金额 |
| collection_date | collection_date | Date | 是 | 收款日期 |
| customer | customer | String | 是 | 客户 |
| account | account | String | 是 | 收款账户 |
| currency | currency | String | 是 | 币种 |
| payment_method | payment_method | String | 否 | 收款方式 |

### 收款单明细字段

| BIP 字段 | 第三方字段 | 数据类型 | 必填 | 说明 |
|---------|-----------|---------|------|------|
| receivable_id | receivable_id | String | 否 | 关联应收单ID |
| collection_amount | collection_amount | BigDecimal | 是 | 核销金额 |

---

## BIP API 路径

| 接口 | 路径 | 说明 |
|------|------|------|
| 保存 | /yonbip/EFI/collection/save | 收款单保存 |
| 提交 | /yonbip/EFI/collection/submit | 收款单提交 |
| 查询 | /yonbip/EFI/collection/detail | 收款单详情查询 |

---

## Service 层实现

```java
@Service
public class CollectionIntegrationServiceImpl implements CollectionIntegrationService {
    
    @Autowired
    private BIPIntegrationUtils bipIntegrationUtils;
    
    @Value("${bip.sys.host}")
    private String bipSysHost;
    
    @Value("${bip.gateway.url}")
    private String gatewayUrl;
    
    @Override
    public Map<String, Object> saveCollection(JSONObject json) {
        // 1. 数据预处理
        JSONObject processedJson = preprocessCollectionData(json);
        
        // 2. 获取访问令牌
        String accessToken = bipIntegrationUtils.getAccessToken();
        
        // 3. 调用 BIP 保存接口
        String saveUrl = bipIntegrationUtils.buildRequestUrl(
            bipSysHost + gatewayUrl + "/yonbip/EFI/collection/save", 
            accessToken
        );
        Map<String, Object> saveResult = bipIntegrationUtils.sendPostRequest(saveUrl, processedJson);
        
        // 4. 判断保存是否成功
        if (bipIntegrationUtils.isSuccessResponse(saveResult)) {
            // 5. 获取保存后的 ID
            String id = bipIntegrationUtils.getIdFromResponse(saveResult);
            
            // 6. 调用 BIP 提交接口
            String submitUrl = bipIntegrationUtils.buildRequestUrl(
                bipSysHost + gatewayUrl + "/yonbip/EFI/collection/submit", 
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
    
    private JSONObject preprocessCollectionData(JSONObject json) {
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
@RequestMapping("/api/collection")
public class CollectionIntegrationController {
    
    @Autowired
    private CollectionIntegrationService collectionIntegrationService;
    
    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> saveCollection(@RequestBody JSONObject request) {
        try {
            // 参数校验
            validateRequest(request);
            
            // 调用 Service 层
            Map<String, Object> result = collectionIntegrationService.saveCollection(request);
            
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
| COLL001 | 收款单保存失败 | 返回错误消息 |
| COLL002 | 收款单提交失败 | 返回错误消息，记录已保存的单据ID |
| COLL003 | 必填字段缺失 | 返回校验错误 |
| COLL004 | 客户不存在 | 返回错误消息 |
| COLL005 | 收款账户不存在 | 返回错误消息 |

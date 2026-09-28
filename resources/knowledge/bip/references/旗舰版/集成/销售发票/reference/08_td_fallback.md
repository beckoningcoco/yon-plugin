# 托底策略

## 概述

本文档定义销售发票集成的托底策略实现，仅在无厂商配置时使用。

## 触发条件

1. 无厂商配置（未提供三方接口文档）
2. fallbackEnabled=true
3. 厂商接口不可用时降级

## 托底实现（基于航天金税AK8）

### 配置项

```properties
# 托底开关
fallback.enabled=true

# AK8接口配置
fallback.ak8.url=https://example.com/ak8
fallback.ak8.publicKey=xxx
```

### 托底服务

```java
@Service("fallbackInvoiceService")
public class FallbackInvoiceService implements InvoiceService {

    @Value("${fallback.ak8.url}")
    private String ak8Url;
    
    @Value("${fallback.ak8.publicKey}")
    private String publicKey;
    
    @Override
    public InvoiceResult submitInvoice(List<String> invoiceIds) {
        InvoiceResult result = new InvoiceResult();
        
        for (String id : invoiceIds) {
            try {
                // 1. 查询BIP发票
                JSONObject data = queryBipInvoice(id);
                
                // 2. 转换为AK8格式
                Ak8DTO dto = convertToAk8(data);
                
                // 3. 调用AK8接口
                Ak8Response response = callAk8Api(dto);
                
                // 4. 处理结果
                if (response.isSuccess()) {
                    writeBack(id, response);
                    result.addSuccess(id);
                } else {
                    result.addFailure(id, response.getErrorMsg());
                }
            } catch (Exception e) {
                result.addFailure(id, e.getMessage());
            }
        }
        return result;
    }
    
    private Ak8DTO convertToAk8(JSONObject data) {
        Ak8DTO dto = new Ak8DTO();
        dto.setOrderNo(data.getString("code"));
        // ... 其他字段映射
        return dto;
    }
    
    private Ak8Response callAk8Api(Ak8DTO dto) throws Exception {
        // SM2加密调用
        Map<String, Object> params = new HashMap<>();
        params.put("secId", "SM2");
        params.put("datas", SM2Utils.encrypt(publicKey, JsonUtils.toJson(Arrays.asList(dto))));
        
        String resp = HttpClient.post(ak8Url + "/AK8/server/importOrders", params);
        return parseResponse(resp);
    }
}
```

### 托底策略选择器

```java
@Component
public class FallbackStrategySelector {

    @Value("${fallback.enabled:false}")
    private boolean fallbackEnabled;
    
    public boolean shouldUseFallback() {
        if (!fallbackEnabled) {
            return false;
        }
        // 检查是否有厂商配置
        List<VendorConfig> configs = vendorConfigService.getActiveConfigs();
        return CollectionUtils.isEmpty(configs);
    }
}
```

## 注意事项

- 托底策略仅作为兜底方案
- 实际部署应由厂商配置覆盖
- 优先使用动态适配方案
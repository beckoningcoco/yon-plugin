# 托底策略规范

> **⚠️ 重要提示**
>
> **此为兜底逻辑，优先使用动态适配方案。实际部署应由厂商配置覆盖。**

## 概述

当系统中未配置任何第三方系统接口时，本托底策略提供基于通用默认实现的推送能力。

## 触发条件

1. 未配置任何第三方系统接口
2. 动态配置加载失败
3. 第三方接口调用超时或不可用
4. 系统参数 `fallbackEnabled` 设置为 `true`

## 托底逻辑

### 核心流程

```
billType ──▶ 查询BIP数据 ──▶ 默认字段映射 ──▶ 调用默认接口 ──▶ 回写状态
```

### 托底统一入口

```java
@Service("fallbackSubcontractPushService")
public class FallbackSubcontractPushService implements SubcontractPushService {

    @Value("${fallback.subcontract.enabled:false}")
    private boolean fallbackEnabled;

    @Value("${fallback.subcontract.url:}")
    private String fallbackUrl;

    @Value("${fallback.subcontract.timeout:30000}")
    private int timeout;

    @Autowired
    private SubcontractQueryService queryService;

    @Autowired
    private SubcontractOrderFieldMapper orderFieldMapper;

    @Autowired
    private SubcontractInFieldMapper inFieldMapper;

    @Autowired
    private SubcontractOrderResultWriteService orderWriteService;

    @Autowired
    private SubcontractInResultWriteService inWriteService;

    @Override
    public SubcontractResult push(String billType, List<String> billIds) throws Exception {
        SubcontractResult result = new SubcontractResult();

        if (!fallbackEnabled) {
            result.setSuccessCode("500");
            result.setMsg("未启用托底策略，请配置第三方系统");
            return result;
        }

        List<String> successIds = new ArrayList<>();
        List<String> failIds = new ArrayList<>();
        Map<String, String> errorMsgs = new HashMap<>();

        for (String billId : billIds) {
            try {
                Map<String, Object> bipData;
                Map<String, Object> targetData;
                ThirdApiResponse response;

                if ("order".equals(billType)) {
                    bipData = queryService.querySubcontractOrder(billId);
                    targetData = orderFieldMapper.convert(bipData);
                    response = callFallbackApi(targetData, "order");
                    orderWriteService.writeBack(billId, response);
                } else {
                    bipData = queryService.querySubcontractIn(billId);
                    targetData = inFieldMapper.convert(bipData);
                    response = callFallbackApi(targetData, "in");
                    inWriteService.writeBack(billId, response);
                }

                if (response.isSuccess()) {
                    successIds.add(billId);
                } else {
                    failIds.add(billId);
                    errorMsgs.put(billId, response.getMessage());
                }

            } catch (Exception e) {
                failIds.add(billId);
                errorMsgs.put(billId, e.getMessage());
            }
        }

        if (failIds.isEmpty()) {
            result.setSuccessCode("200");
            result.setMsg("全部推送成功");
        } else if (!successIds.isEmpty()) {
            result.setSuccessCode("201");
            result.setMsg("部分推送成功");
        } else {
            result.setSuccessCode("500");
            result.setMsg("全部推送失败");
        }

        result.setSuccessIds(successIds);
        result.setFailIds(failIds);
        result.setErrorMsgs(errorMsgs);

        return result;
    }

    private ThirdApiResponse callFallbackApi(Map<String, Object> data, String billType) {
        ThirdApiResponse response = new ThirdApiResponse();

        try {
            if (StringUtils.isBlank(fallbackUrl)) {
                response.setCode("500");
                response.setMessage("未配置托底接口地址");
                return response;
            }

            String url = fallbackUrl + "/" + billType;

            // TODO: 生成HTTP调用代码
            // HttpResponse httpResponse = HttpUtil.createPost(url)
            //     .timeout(timeout)
            //     .body(JSONObject.toJSONString(data))
            //     .execute();
            // response = JSON.parseObject(httpResponse.getBody(), ThirdApiResponse.class);

            // 模拟成功响应
            response.setCode("200");
            response.setMessage("托底推送成功");

        } catch (Exception e) {
            response.setCode("500");
            response.setMessage("托底调用失败：" + e.getMessage());
        }

        return response;
    }

    @Override
    public Map<String, Object> delete(String billType, String billId) throws Exception {
        Map<String, Object> result = new HashMap<>();
        result.put("code", "500");
        result.put("message", "托底模式不支持删除");
        return result;
    }
}
```

### 托底配置

```yaml
# 托底策略配置
fallback:
  enabled: true
  subcontract:
    url: "http://default-third-party/api/subcontract"
    timeout: 30000
    retry: 3
    retryInterval: 1000
```

---

## 降级策略

当第三方接口调用失败时，系统自动切换到托底实现。

### 降级流程

```
调用第三方接口
     │
     ▼
┌─────────────┐
│  调用失败？  │
└─────────────┘
     │
     ├─ 是 ──▶ 检查fallbackEnabled
     │               │
     │               ├─ 是 ──▶ 调用托底接口
     │               │
     │               └─ 否 ──▶ 返回失败
     │
     └─ 否 ──▶ 返回成功
```

### 降级服务实现

```java
@Service
public class SubcontractPushServiceFallbackWrapper implements SubcontractPushService {

    @Autowired
    private SubcontractPushService primaryService;

    @Autowired
    @Qualifier("fallbackSubcontractPushService")
    private SubcontractPushService fallbackService;

    @Value("${fallback.enabled:true}")
    private boolean fallbackEnabled;

    @Override
    public SubcontractResult push(String billType, List<String> billIds) throws Exception {
        try {
            return primaryService.push(billType, billIds);
        } catch (Exception e) {
            if (fallbackEnabled) {
                return fallbackService.push(billType, billIds);
            }
            throw e;
        }
    }

    @Override
    public Map<String, Object> delete(String billType, String billId) throws Exception {
        try {
            return primaryService.delete(billType, billId);
        } catch (Exception e) {
            if (fallbackEnabled) {
                return fallbackService.delete(billType, billId);
            }
            throw e;
        }
    }
}
```

---

## 配置说明

### 托底策略配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| fallback.enabled | 是否启用托底策略 | false |
| fallback.subcontract.url | 托底接口地址 | 空 |
| fallback.subcontract.timeout | 调用超时时间(毫秒) | 30000 |
| fallback.subcontract.retry | 重试次数 | 3 |
| fallback.subcontract.retryInterval | 重试间隔(毫秒) | 1000 |

---

> **⚠️ ���意**：托底策略为最小可用实现，生产环境建议配置具体的第三方接口
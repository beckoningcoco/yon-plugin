# 凭证三方集成公共规范

> **⚠️ 适用范围**：本文件适用于**所有第三方系统**的共性能力
> **⚠️ 个性能力**：三方系统特有逻辑通过外部配置动态适配

---

## 1. Controller层（入参处理）

### 1.1 推送Controller

```java
@RestController
@RequestMapping("/voucher")
public class VoucherPushController {

    @Autowired
    private VoucherPushService voucherPushService;

    /**
     * 凭证推送
     * POST /voucher/push
     */
    @PostMapping("/push")
    public void push(@RequestBody Map<String, Object> param, 
                     HttpServletRequest request, 
                     HttpServletResponse response) throws Exception {
        if (MapUtils.isEmpty(param)) {
            renderJson(response, Result.error("参数为空"));
            return;
        }
        
        Object data = param.get("data");
        if (data == null) {
            renderJson(response, Result.error("参数为空"));
            return;
        }
        
        JSONArray jsonArray = JSONArray.parseArray((String) param.get("data"));
        List<String> ids = jsonArray.toJavaList(String.class);
        
        if (CollectionUtils.isEmpty(ids)) {
            renderJson(response, Result.error("凭证ID为空"));
            return;
        }
        
        try {
            VoucherResult result = voucherPushService.push(ids);
            if ("200".equals(result.getSuccessCode())) {
                renderJson(response, Result.data(result));
            } else {
                renderJson(response, Result.error(result.getMsg()));
            }
        } catch (Exception e) {
            renderJson(response, Result.error(e.getMessage()));
        }
    }
    
    private void renderJson(HttpServletResponse response, Result result) throws Exception {
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(JSONObject.toJSONString(result));
    }
}
```

---

## 2. 查询服务

### 2.1 查询凭证主数据
**凭证查询：/iuap-api-gateway/yonbip/EFI/openapi/voucher/queryVoucherById**
**查询凭证辅助核算 ：/iuap-api-gateway/yonbip/fi/fipub/multidimension_ext/getapimultidimension**
> **⚠️ 核心**：**强制**通过MCP技能 `OpenAPI调用开发` 的 `getOpenApiCall` 动态生成鉴权及调用代码

```java
@Service
public class VoucherQueryService {

    @Value("${bip.api.baseUrl:}")
    private String bipApiBaseUrl;
    
    /**
     * 查询凭证主数据
     * @param voucherId 凭证ID
     * @return 凭证主数据
     */
    public Map<String, Object> queryVoucher(String voucherId) throws Exception {
        // TODO: 从外部配置动态构建查询
        // 参考: eaaI_eventVoucher.eventVoucherDO
        return new HashMap<>();
    }
    
    
    /**
     * 查询凭证辅助核算
     * @param voucherId 凭证ID
     * @return 凭证辅助核算
     */
    public List<Map<String, Object>> queryVoucherAss(String voucherId) throws Exception {
        // TODO: 从外部配置动态构建查询
        return new ArrayList<>();
    }
    
}
```

---

## 3. 字段映射

### 3.1 凭证字段映射器

```java
@Service
public class VoucherFieldMapper {

    /**
     * 转换为第三方目标格式
     * @param bipData BIP凭证数据
     * @return 第三方目标数据
     */
    public JSONObject convertToThirdParty(JSONObject bipData) {
        JSONObject result = new JSONObject();
        
        // TODO: 字段映射从外部Excel/需求动态读取
        
        // 凭证日期
        result.put("voucherDate", bipData.get("voucherDate"));
        // 凭证号
        result.put("voucherNo", bipData.get("voucherNo"));
        // 摘要
        result.put("description", bipData.get("description"));
        // 币种
        result.put("currency", bipData.get("currency"));
        // 汇率
        result.put("exchangeRate", bipData.get("exchangeRate"));
        // 凭证来源
        result.put("srcSystem", bipData.get("srcSystem"));
        
        // 分录明细
        JSONArray details = new JSONArray();
        JSONArray bipDetails = bipData.getJSONArray("details");
        if (bipDetails != null) {
            for (int i = 0; i < bipDetails.size(); i++) {
                JSONObject detail = bipDetails.getJSONObject(i);
                JSONObject row = new JSONObject();
                
                // 科目编码
                row.put("accountCode", detail.get("accountCode"));
                // 科目名称
                row.put("accountName", detail.get("accountName"));
                // 借贷方向
                row.put("direction", detail.get("direction"));
                // 金额
                row.put("amount", detail.get("amount"));
                // 辅助核算
                row.put("ass", detail.get("ass"));
                
                details.add(row);
            }
        }
        result.put("details", details);
        
        return result;
    }
    
    /**
     * 根据财务组织和会计科目分组
     */
    public Map<String, List<JSONObject>> groupByOrgAndAccount(JSONArray details) {
        return details.stream()
            .map(obj -> (JSONObject) obj)
            .collect(Collectors.groupingBy(json -> 
                json.getString("orgCode") + "_" + json.getString("accountCode")));
    }
}
```

---


--

## 4. 特征字段动态处理

### 4.1 特征组说明


> **⚠️ 通用逻辑**：特征字段翻译能力请参考 [ElasticTool.md](../../iuap-c-server-codegen/reference/ElasticTool.md))

---

## 4. 三方接口调用

> **⚠️ 重要**：以下代码仅在**有第三方配置**时生成
> **⚠️ 接口地址、请求参数**从外部配置动态读取

### 4.1 三方接口服务

```java
public interface ThirdPartyVoucherService {
    /**
     * 推送凭证数据
     * @param data 凭证数据
     * @return 推送结果
     */
    ThirdApiResponse pushVoucher(JSONObject data) throws Exception;
    
    /**
     * 删除凭证数据
     * @param billId 凭证ID
     * @return 删除结果
     */
    ThirdApiResponse deleteVoucher(String billId) throws Exception;
    
    /**
     * 查询凭证状态
     * @param billId 凭证ID
     * @return 凭证状态
     */
    ThirdApiResponse queryVoucherStatus(String billId) throws Exception;
}
```

### 4.2 三方接口实现

```java
@Service
public class ThirdPartyVoucherServiceImpl implements ThirdPartyVoucherService {

    @Value("${thirdparty.voucher.api.url:}")
    private String apiUrl;
    
    @Value("${thirdparty.voucher.api.path:}")
    private String apiPath;
    
    @Autowired
    private ThirdPartyAuthService authService;
    
    @Override
    public ThirdApiResponse pushVoucher(JSONObject data) throws Exception {
        // TODO: 根据外部文档动态生成请求结构
        // 可通过LLM根据外部接口文档生成对应的请求/响应解析逻辑
        
        String url = apiUrl + apiPath;
        
        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        // 添加鉴权信息
        Map<String, String> authInfo = authService.getAuthInfo();
        headers.add("Authorization", "Bearer " + authInfo.get("token"));
        
        HttpEntity<JSONObject> request = new HttpEntity<>(data, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);
        
        return parseResponse(response);
    }
    
    @Override
    public ThirdApiResponse deleteVoucher(String billId) throws Exception {
        // TODO: 根据外部配置实现
        return null;
    }
    
    @Override
    public ThirdApiResponse queryVoucherStatus(String billId) throws Exception {
        // TODO: 根据外部配置实现
        return null;
    }
    
    private ThirdApiResponse parseResponse(ResponseEntity<String> response) {
        ThirdApiResponse result = new ThirdApiResponse();
        
        JSONObject body = JSONObject.parseObject(response.getBody());
        result.setCode(body.getString("code"));
        result.setMessage(body.getString("message"));
        result.setSuccess("1".equals(result.getCode()));
        
        return result;
    }
}
```

---

## 5. 鉴权接口机制

> **⚠️ 重要**：以下代码仅在**有第三方配置**时生成
> **⚠️ 鉴权方式**从外部配置动态读取

### 5.1 鉴权服务

```java
public interface ThirdPartyAuthService {
    /**
     * 获取鉴权信息
     * @return 鉴权信息（token等）
     */
    Map<String, String> getAuthInfo() throws Exception;
    
    /**
     * 刷新Token
     * @return 新的鉴权信息
     */
    Map<String, String> refreshToken() throws Exception;
}
```

### 5.2 鉴权实现

```java
@Service
public class ThirdPartyAuthServiceImpl implements ThirdPartyAuthService {

    @Value("${thirdparty.auth.url:}")
    private String authUrl;
    
    @Value("${thirdparty.auth.appKey:}")
    private String appKey;
    
    @Value("${thirdparty.auth.appSecret:}")
    private String appSecret;
    
    @Override
    public Map<String, String> getAuthInfo() throws Exception {
        // TODO: 根据外部配置动态生成鉴权逻辑
        // 可支持: OAuth2, Token, BasicAuth, 自定义签名等方式
        
        Map<String, String> authInfo = new HashMap<>();
        authInfo.put("token", "");
        authInfo.put("expiresIn", "7200");
        
        return authInfo;
    }
    
    @Override
    public Map<String, String> refreshToken() throws Exception {
        return getAuthInfo();
    }
}
```

---

## 6. 主服务编排

### 6.1 推送服务接口

```java
public interface VoucherPushService {
    /**
     * 推送凭证
     * @param voucherIds 凭证ID列表
     * @return 推送结果
     */
    VoucherResult push(List<String> voucherIds) throws Exception;
    
    /**
     * 删除凭证
     * @param billId 凭证ID
     * @return 删除结果
     */
    Map<String, Object> delete(String billId) throws Exception;
    
    /**
     * 查询凭证状态
     * @param billId 凭证ID
     * @return 凭证状态
     */
    Map<String, Object> queryStatus(String billId) throws Exception;
}
```

### 6.2 推送服务实现

```java
@Service
public class VoucherPushServiceImpl implements VoucherPushService {

    @Autowired
    private VoucherQueryService queryService;
    
    @Autowired
    private VoucherFieldMapper fieldMapper;
    
    @Autowired
    private ThirdPartyVoucherService thirdPartyService;
    
    @Autowired
    private VoucherResultWriteService writeService;
    
    @Override
    public VoucherResult push(List<String> voucherIds) throws Exception {
        VoucherResult result = new VoucherResult();
        List<String> successIds = new ArrayList<>();
        List<String> failIds = new ArrayList<>();
        
        for (String voucherId : voucherIds) {
            try {
                // 1. 查询凭证主数据
                Map<String, Object> voucherData = queryService.queryVoucher(voucherId);
                
                if (voucherData == null || voucherData.isEmpty()) {
                    failIds.add(voucherId);
                    continue;
                }
                
                // 2. 查询凭证分录明细
                List<Map<String, Object>> details = voucherData.get("bodies");
                voucherData.put("details", details);
                
                // 3. 查询凭证辅助核算
                List<Map<String, Object>> assList = queryService.queryVoucherAss(voucherId);
                voucherData.put("assList", assList);
                
                // 4. 转换为第三方格式
                JSONObject thirdPartyData = fieldMapper.convertToThirdParty(new JSONObject(voucherData));
                
                // 5. 调用第三方接口
                ThirdApiResponse response = thirdPartyService.pushVoucher(thirdPartyData);
                
                // 6. 回写状态
                writeService.writeBack(voucherId, response);
                
                if (response.isSuccess()) {
                    successIds.add(voucherId);
                } else {
                    failIds.add(voucherId);
                }
            } catch (Exception e) {
                failIds.add(voucherId);
            }
        }
        
        result.setSuccessCode(failIds.isEmpty() ? "200" : "201");
        result.setSuccessIds(successIds);
        result.setFailIds(failIds);
        
        return result;
    }
    
    @Override
    public Map<String, Object> delete(String billId) throws Exception {
        ThirdApiResponse response = thirdPartyService.deleteVoucher(billId);
        writeService.writeBack(billId, response);
        return new HashMap<>();
    }
    
    @Override
    public Map<String, Object> queryStatus(String billId) throws Exception {
        ThirdApiResponse response = thirdPartyService.queryVoucherStatus(billId);
        return new HashMap<>();
    }
}
```

---

## 7. 结果回写

### 7.1 回写服务接口

```java
public interface VoucherResultWriteService {
    void writeBack(String billId, ThirdApiResponse response) throws Exception;
}
```

### 7.2 回写服务实现

```java
@Service
public class VoucherResultWriteServiceImpl implements VoucherResultWriteService {

    @Autowired
    private VoucherMapper voucherMapper;
    
    @Override
    public void writeBack(String billId, ThirdApiResponse response) throws Exception {
        // TODO: 更新BIP凭证状态
        // 推送状态: 0失败, 1成功, 3删除
    }
}
```

---

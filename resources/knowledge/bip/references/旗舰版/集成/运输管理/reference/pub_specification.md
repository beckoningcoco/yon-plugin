# 公共规范（动态适配）

## 概述

> **⚠️ 适用范围**：本文件适用于**有第三方配置**时的动态适配场景
> **⚠️ 托底说明**：无第三方配置时的托底逻辑请参考 [td_specification.md](./td_specification.md)
> **⚠️ 代码生成规范**：生成的代码必须遵循 MVC 分层架构
> - **Model 层**：VO/DTO/Entity 实体类
> - **View 层**：对外 API 接口定义
> - **Controller 层**：业务逻辑处理、流程编排
> - **Service 层**：具体业务逻辑实现
> - 各层之间通过依赖注入实现解耦，禁止跨层直接调用
>
> **⚠️ 场景限制**：本技能仅生成**WMS 集成**场景代码，**禁止扩散生成其他场景**

---

## 执行流程架构

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1.Controller │ -> │  2.入参处理  │ -> │  3.BIP查询   │ -> │  4.字段映射  │
│   接收请求    │    │  InputParse  │    │   QueryBIP   │    │ FieldMapping │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
         │                   │                   │                   │
         v                   v                   v                   v
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  9.结果回写  │ <- │  8.响应解析  │ <- │  7.三方调用   │ <- │  5.特征处理  │
│ ResultWrite  │    │ ResponseParse│    │  InvokeThird  │    │ CharProcess  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
         │
         v
┌──────────────┐
│  6.三方鉴权   │
│  AuthThird   │
└──────────────┘
```

---

## 1. Controller 层入参处理

> **⚠️ 动态字段识别**：根据外部输入的 Excel 文档动态识别字段

```java
/**
 * {Prefix}推送Controller
 * 仅生成{Prefix}场景
 */
@RestController
@RequestMapping("{route}")
public class {Prefix}PushController {

    @Autowired
    private {Prefix}PushService {prefix}PushService;

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

        try {
            {Prefix}Result result = {prefix}PushService.push(ids);
            if ("200".equals(result.getSuccessCode())) {
                renderJson(response, Result.data(result));
            } else {
                renderJson(response, Result.error(result.getMsg()));
            }
        } catch (Exception e) {
            renderJson(response, Result.error(e.getMessage()));
        }
    }
}
```

---

## 2. BIP 查询服务

> **⚠️ 核心**：根据业务对象动态生成 BIP 查询

### 2.1 查询服务接口

```java
public interface {Prefix}QueryService {
    /**
     * 查询{Prefix}数据
     */
    Map<String, Object> query{Prefix}(String billId) throws Exception;
}
```

### 2.2 查询实现

> **⚠️ {Prefix}详情URL**：{apiPath}
> **⚠️ GET 请求**

```java
@Service
public class {Prefix}OpenApiQueryService implements {Prefix}QueryService {

    @Override
    public Map<String, Object> query{Prefix}(String billId) throws Exception {
        // 查找对应openapi
        // 动态生成BIP查询代码
        // 查询{Prefix}主表和明细表数据（如有子表）

        Map<String, Object> result = new HashMap<>();
        return result;
    }
}
```

---

## 3. 字段映射转换

> **⚠️ 动态映射**：根据外部 Excel/需求动态生成字段映射关系

### 3.1 字段映射器

```java
@Service
public class {Prefix}FieldMapper {

    /**
     * 通用字段映射转换
     * 根据外部输入动态识别映射关系
     */
    public Map<String, Object> convert(Map<String, Object> sourceData) {
        Map<String, Object> target = new HashMap<>();

        // TODO: 动态字段映射
        // 根据Excel/需求中的字段对照关系进行转换

        // 特征字段翻译
        Map<String, Object> characterData = (Map<String, Object>) sourceData.get("{featureGroup}");
        if (characterData != null) {
            Map<String, String> charFieldMapping = loadCharFieldMapping();
            CharacterFieldExtractor.extractCharacter(
                new JSONObject(characterData),
                target,
                charFieldMapping
            );
        }

        return target;
    }

    /**
     * 加载特征字段映射关系
     * 从Excel/需求文档动态读取
     */
    private Map<String, String> loadCharFieldMapping() {
        Map<String, String> mapping = new HashMap<>();
        // TODO: 从Excel动态读取
        // mapping.put("char0001", "customer");
        return mapping;
    }
}
```

### 3.2 明细行转换（如有子表）

```java
    /**
     * 转换明细行
     */
    public List<Map<String, Object>> convertDetails(List<Map<String, Object>> sourceDetails) {
        if (CollectionUtils.isEmpty(sourceDetails)) {
            return new ArrayList<>();
        }

        List<Map<String, Object>> details = new ArrayList<>();
        for (Map<String, Object> sourceDetail : sourceDetails) {
            Map<String, Object> detail = new HashMap<>();

            // TODO: 明细字段映射
            // 根据Excel/需求动态生成

            // 子表特征字段翻译（如有子表特征组）
            Map<String, Object> detailsCharacter = (Map<String, Object>) sourceDetail.get("{subFeatureGroup}");
            if (detailsCharacter != null) {
                Map<String, String> detailCharMapping = loadDetailCharFieldMapping();
                CharacterFieldExtractor.extractCharacter(
                    new JSONObject(detailsCharacter),
                    detail,
                    detailCharMapping
                );
            }

            details.add(detail);
        }

        return details;
    }
```

---

## 4. 特征字段动态处理

** 各场景主表特征组见 <skill-base>/SKILL.md 域参数表 **

> **⚠️ 通用逻辑**：特征字段翻译能力请参考`<skill-base>/reference/char_translation_spec.md`

本业务的特征字段翻译统一调用 `CharacterFieldExtractor.extractCharacter()` 方法，实现：
- 从 Excel ���态��取特征字段映射关系
- 自动识别字段类型（参照/枚举/自定义档案）
- 翻译结果填充到目标对象

```java
@Autowired
private CharacterFieldExtractor characterFieldExtractor;

// 特征字段映射
Map<String, String> charFieldMapping = new HashMap<>();
charFieldMapping.put("char0001", "customer");

// 翻译特征字段
JSONObject characterData = new JSONObject(bipData.get("{featureGroup}"));
Map<String, Object> target = new HashMap<>();
characterFieldExtractor.extractCharacter(characterData, target, charFieldMapping);
```

### 类型识别规则

| 映射值 | 翻译方法 | 说明 |
|--------|----------|------|
| `customer` | transCustomer | 客户档案参照 |
| `staff` / `employee` | transStaff | 员工档案参照 |
| `org` / `dept` | transOrg | 组织档案参照 |
| `enum:xxx` | transCustEnumCodeList | 枚举翻译，固定写法 |
| `doc:xxx` | transCustDocCodeList | 自定义档案翻译，固定写法 |

---

## 5. 三方鉴权接口机制

> **⚠️ MVC 分层要求**：鉴权属于**Utils/Common 层**，通过依赖注入供各层使用
>
> **⚠️ 核心**：三方鉴权根据外部需求或 Excel 字段对照关系**动态生成**鉴权代码，**不是 BIP 系统**

### 5.1 鉴权服务接口

```java
public interface ThirdAuthService {
    /**
     * 获取三方鉴权 Token
     */
    String getToken();

    /**
     * 获取鉴权头信息
     */
    Map<String, String> getAuthHeaders();
}
```

### 5.2 动态鉴权实现

> **⚠️ 动态生成**：根据外部 Excel/需求文档动态生成鉴权代码

```java
@Service
public class ThirdAuthServiceImpl implements ThirdAuthService {

    @Value("${third.api.url:}")
    private String thirdApiUrl;

    @Value("${third.api.appKey:}")
    private String appKey;

    @Value("${third.api.appSecret:}")
    private String appSecret;

    @Override
    public String getToken() {
        // TODO: 动态生成鉴权逻辑
        // 根据Excel/需求中的鉴权配置生成对应代码
        // 支持：Token型、签名型、BasicAuth型等

        return null;
    }

    @Override
    public Map<String, String> getAuthHeaders() {
        Map<String, String> headers = new HashMap<>();
        String token = getToken();
        if (StringUtils.isNotBlank(token)) {
            headers.put("Authorization", "Bearer " + token);
        }
        return headers;
    }
}
```

---

## 6. 三方接口调用

> **⚠️ MVC 分层要求**：接口调用属于**Service 层**，通过依赖注入供 Controller 使用
>
> **⚠️ 动态适配**：三方接口地址、请求参数从外部配置动态读取

### 6.1 三方调用服务接口

```java
public interface ThirdParty{Prefix}Service {
    /**
     * 推送{Prefix}到三方
     */
    ThirdApiResponse push{Prefix}(Map<String, Object> data);
}
```

### 6.2 调用实现

> **⚠️ 动态生成**：根据外部配置动态生成调用代码

```java
@Service
public class ThirdParty{Prefix}ServiceImpl implements ThirdParty{Prefix}Service {

    @Value("${third.{prefix}.url:}")
    private String third{Prefix}Url;

    @Autowired
    private ThirdAuthService authService;

    @Autowired
    private RestTemplate restTemplate;

    @Override
    public ThirdApiResponse push{Prefix}(Map<String, Object> data) {
        // TODO: 动态生成调用代码
        // 根据Excel/需求中的接口配置生成对应代码

        HttpHeaders headers = new HttpHeaders();
        headers.putAll(authService.getAuthHeaders());
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(data, headers);

        ResponseEntity<String> response = restTemplate.postForEntity(
            third{Prefix}Url,
            request,
            String.class
        );

        return parseResponse(response.getBody());
    }

    private ThirdApiResponse parseResponse(String responseBody) {
        ThirdApiResponse result = new ThirdApiResponse();
        // TODO: 动态解析
        return result;
    }
}
```

---

## 7. 响应解析

### 7.1 响应解析器

```java
@Service
public class ResponseParser {

    public ThirdApiResponse parse(String responseBody) {
        ThirdApiResponse response = new ThirdApiResponse();
        // TODO: 根据三方返回结构动态解析
        return response;
    }

    public boolean isSuccess(ThirdApiResponse response) {
        return "200".equals(response.getCode());
    }
}
```

### 7.2 响应 DTO

```java
@Data
public class ThirdApiResponse implements Serializable {
    private String code;
    private String message;
    private Object data;
    private String billId;
    private String thirdBillNo;
}
```

---

## 8. 结果回写

### 8.1 回写服务接口

```java
public interface {Prefix}ResultWriteService {
    /**
     * 回写BIP {Prefix}状态
     */
    void writeBack(String billId, ThirdApiResponse response);
}
```

### 8.2 回写实现

```java
@Service
public class {Prefix}ResultWriteServiceImpl implements {Prefix}ResultWriteService {

    @Override
    public void writeBack(String billId, ThirdApiResponse response) {
        // TODO: 回写BIP {Prefix}状态
    }
}
```

---

## 托底策略说明

> **⚠️ 详细托底逻辑请参考** [td_specification.md](./td_specification.md)

托底策略触发条件：
- 无第三方配置
- 第三方接口调用失败
- fallbackEnabled=true
# BIP 事件订阅推送接收开发规范

> **本文档是用友 BIP 平台事件订阅推送接收的完整开发规范**
> **适用场景**：BIP 业务对象（保存/提交/审核）变更后推送到客开服务或第三方系统
> **核心原则**：AES-CBC 加密 + HMAC-SHA256 签名校验 + 必须返回 "success"

---

---

## 1. 概述

### 1.1 什么是事件订阅

| 概念 | 说明 |
|------|------|
| **事件订阅** | BIP 平台主动推送业务事件到客开服务或第三方系统 |
| **触发时机** | BIP 单据保存/提交/审核等生命周期节点 |
| **传输方式** | HTTP POST + AES-CBC 加密 + HMAC-SHA256 签名 |
| **回调地址** | 客开服务提供的 `/eventPush` 端点 |

### 1.2 核心要求（必须遵守）

| 要求项 | 规范 | 重要性 |
|--------|------|--------|
| **加密方式** | AES-CBC + HMAC-SHA256 签名校验 | ⚠️ **强制** |
| **返回值** | 必须返回 `"success"` 字符串（纯字符串） | ⚠️ **强制** |
| **幂等处理** | 依据 `eventId` 做幂等，避免重复处理 | ⚠️ **强制** |
| **异常处理** | 必须 try-catch，返回 success 避免 BIP 重试 | ⚠️ **强制** |
| **配置注入** | AppKey/AppSecret 必须从 `@Value` 注入 | ⚠️ **强制** |
| **日志记录** | 必须记录事件类型、租户ID、事件ID | ⚠️ **强制** |
| **事件类型来源** | 必须从需求文档中识别，禁止臆想 | ⚠️ **强制** |

---

## ⚠️ 事件类型识别规范（强制）

**事件编码和事件报文必须通过查询获取，严禁臆想或推测。**

### 获取途径优先级

| 优先级 | 途径 | 说明 |
|--------|------|------|
| **P0** | 调用 `事件查询（见 events/ 目录下事件订阅配置指南）` 技能 | 自动获取 eventCode + 事件报文 |
| **P1** | 从需求文档识别（备选） | 仅当查询工具不可用时使用 |

### 途径1：调用 事件查询（见 events/ 目录下事件订阅配置指南）（推荐）

**必须先执行此步骤，获取事件编码和事件报文。**

#### 查询步骤

```bash
# Step 1: 查询事件类型列表，获取 eventCode
python scripts/event_query.py --query "物料档案"

# 返回示例：
# eventId: 1814934938926448649
# eventCode: YXYBASEDOC_PC_PRODUCT_INSERT
# eventName: 物料档案新增

# Step 2: 查询事件详情，获取报文结构
python scripts/event_query.py --detail 1814933938926448649 --json

# 返回事件报文示例，用于解析 content.getContent() 字段
```

#### 返回信息说明

| 字段 | 说明 | 用途 |
|------|------|------|
| eventId | 事件ID | 查询详情时使用 |
| eventCode | 事件编码 | 代码中 switch 分发 |
| example | 事件报文 | 解析 content 字段结构 |

#### 优点
- ✅ 自动获取 eventCode，无需手动查找文档
- ✅ 自动获取事件报文结构
- ✅ 实时获取最新事件定义
- ✅ 支持模糊查询

### 途径2：从需求文档识别（备选）

**仅当查询工具不可用时使用此途径。**

1. 读取相关API接口描述文档（如 `物料档案事件API接口描述.docx`）
2. 查找所有"事件编码"或"事件类型"字段
3. 提取具体的事件类型编码

```bash
# 使用pandoc提取docx中的事件类型
pandoc "物料档案事件API接口描述.docx" -o /tmp/event.md
grep "事件编码" /tmp/event.md
```

### ⚠️ 禁止事项
- ❌ **禁止臆想事件类型**：如自行添加 `XXX_DELETE`、`XXX_STOP` 等未在查询结果或文档中的类型
- ❌ **禁止参考其他项目**：每个项目的需求文档不同，事件类型可能不同
- ❌ **禁止推测性词汇**：不能使用"应该"、"可能"、"一般有"等词汇描述事件类型

### ⚠️ 正确示例 vs 错误示例

| 场景 | 正确做法 | 错误做法 |
|------|---------|---------|
| 查询到INSERT/UPDATE/STOP | 使用这3个类型 | 自行添加DELETE |
| 文档只提到新增修改 | 只使用新增和修改类型 | 猜测还有删除事件 |
| 查询无结果 | 尝试其他关键词或使用文档识别 | 臆想一个事件编码 |

---

## 2. 执行流程

### 2.1 完整流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       BIP 事件订阅推送完整流程                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: BIP事件中心配置                                                │
│  ├── 配置监听事件类型（如：销售订单保存/提交/审核）                         │
│  ├── 配置回调URL：客开服务的 /eventPush 端点                             │
│  └── 配置加密方式：AES-CBC + HMAC-SHA256签名                            │
│                                                                         │
│  Step 2: BIP推送加密消息                                                │
│  ├── HTTP POST /eventPush                                             │
│  └── 请求体：EncryptionHolder（signature/timestamp/nonce/encrypt）     │
│                                                                         │
│  Step 3: 客开服务接收并解密                                              │
│  ├── 端点：@PostMapping("/eventPush")                                  │
│  ├── 接收参数：@RequestBody EncryptionHolder                           │
│  ├── 签名校验：SHA256.sign(token, timestamp, nonce, encrypt)          │
│  ├── AES解密：EventCrypto.decryptMsg()                                │
│  └── 返回："success"                                                   │
│                                                                         │
│  Step 4: 事件分发处理                                                   │
│  ├── 反序列化：JSON.parseObject(decryptMessage, EventContent.class)    │
│  ├── 事件类型分发：switch(content.getType())                           │
│  └── 业务处理                                                           │
│                                                                         │
│  Step 5: ⚠️ 数据完整性评估（强制）                                       │
│  ├── 调用 isDataSufficient() 判断报文字段是否满足需求                   │
│  └── 字段充足 → 直接使用报文 / 字段不足 → 进入Step 6                    │
│                                                                         │
│  Step 6: ⚠️ 数据补充（字段不足时执行）                                   │
│  ├── 优先OpenAPI：调用详情查询API（如 /yonbip/digitalModel/xxx/list）  │
│  └── 备选Repository：IBillQueryRepository.queryBySchema（需机器人鉴权）│
│                                                                         │
│  Step 7: 字段映射 + 调用第三方接口                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 加密数据载体（EncryptionHolder）

```java
public class EncryptionHolder {
    private String signature;  // HMAC-SHA256 签名
    private long timestamp;    // 时间戳
    private String nonce;      // 随机字符串
    private String encrypt;    // AES 加密内容（Base64编码）
}
```

---

## 3. 核心规范

### 3.1 加密解密四步骤

| 步骤 | 操作 | 说明 |
|------|------|------|
| **1. 签名校验** | `SHA256.sign(token, timestamp, nonce, encrypt)` | 确保消息未被篡改 |
| **2. AES解密** | `EventCrypto.decrypt(encrypt)` | 解密得到原始消息 |
| **3. PKCS7解析** | 去除 PKCS7 填充 | 还原原始数据 |
| **4. suiteKey校验** | 校验加密内容中的 suiteKey | 确保消息来源正确 |

### 3.2 签名算法

```
签名内容 = [timestamp, nonce, encrypt] 按字典序排序后拼接
签名值 = Base64(HMAC-SHA256(token, 签名内容))
```

### 3.3 AES 解密参数

| 参数 | 值 |
|------|-----|
| 算法 | AES |
| 模式 | CBC |
| 填充 | PKCS7 |
| 密钥 | Base64(encodingAesKey + "=") |
| IV | encodingAesKey 前 16 字节 |

### 3.4 响应规范

```java
// ✅ 正确：返回纯字符串 "success"
return "success";

// ❌ 错误：返回 JSON 对象
return "{\"success\":true}";

// ❌ 错误：返回带引号的字符串
return "\"success\"";

// ❌ 错误：返回 null
return null;
```

### 3.5 异常处理规范

```java
// ✅ 正确：捕获所有异常，返回 success 避免 BIP 重试
try {
    // 业务处理
    return "success";
} catch (Exception e) {
    logger.error("处理异常", e);
    return "success";  // 必须返回 success，避免 BIP 无限重试
}

// ❌ 错误：异常时不返回 success
try {
    return "success";
} catch (Exception e) {
    logger.error("处理异常", e);
    throw e;  // 会触发 BIP 重试
}
```

### 3.6 幂等处理规范

```java
// ✅ 根据 eventId 做幂等检查
@Autowired
private EventIdempotentMapper eventIdempotentMapper;

@PostMapping("/eventPush")
public String eventCallBackReceiver(@RequestBody EncryptionHolder holder) {
    EventContent content = decryptAndParse(holder);

    // 幂等检查
    if (eventIdempotentMapper.exists(content.getEventId())) {
        logger.info("事件已处理, eventId={}", content.getEventId());
        return "success";
    }

    // 业务处理
    processEvent(content);

    // 记录已处理
    eventIdempotentMapper.save(content.getEventId());

    return "success";
}
```

---

## 3.7 事件报文不完整时的数据补充

### 3.7.1 问题场景

BIP事件推送的报文字段通常只有基础信息（id、code、name、enable），缺少：
- 子表数据（如工作记录、银行账户）
- 参照字段的编码/名称
- 完整业务字段

**典型案例 - 员工新增事件**：

```json
// BIP事件报文（字段很少）
{
  "model": {
    "id": "2024551616081231880",
    "code": "000001",
    "name": "测试",
    "enable": 1,
    "tenantid": "0000L5GGG35C5N7K0P0000"
  }
}
```

**实际业务需要的字段**（推送到第三方系统）：

| 字段类型 | 示例 | 是否在事件报文中 |
|----------|------|-----------------|
| 主表字段 | name, code, sex, mobile | ✅ 部分 |
| 子表数据 | mainJobList, ptJobList, bankAcctList | ❌ 不在 |
| 参照字段 | org_id, dept_id, post_id | ❌ 仅返回ID |
| 翻译字段 | org_code, dept_code, post_code | ❌ 不在 |

### 3.7.2 数据补充决策树

```
┌─────────────────────────────────────────────────────────────────────┐
│                  事件报文字段完整性判断流程                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 1: 解析事件报文字段                                           │
│          ↓                                                         │
│  Step 2: 判断报文字段是否满足推送需求                                │
│          │                                                         │
│          ├── 满足 → 直接使用报文字段构建推送请求                      │
│          │                                                         │
│          └── 不满足 → Step 3                                        │
│                   ↓                                                │
│          Step 3: 尝试调用 OpenAPI 查询详情                          │
│          │                                                         │
│          ├── 有合适API → 调用API获取完整数据                         │
│          │         ↓                                               │
│          │      成功 → 构建推送请求                                 │
│          │                                                         │
│          └── 无合适API → Step 4                                     │
│                       ↓                                            │
│          Step 4: 使用 IBillQueryRepository 查询                     │
│                       ↓                                            │
│                   返回完整数据                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.7.3 数据获取优先级

| 优先级 | 方式 | 适用场景 | 说明 |
|--------|------|---------|------|
| **P0** | BIP事件报文 | 字段满足需求 | 直接使用，零成本 |
| **P1** | OpenAPI查询 | 有合适详情API | 优先选择，字段完整 |
| **P2** | IBillQueryRepository | 无合适API | 备选方案，需机器人鉴权 |

### 3.7.4 OpenAPI查询（优先）

**判断条件**：
- 存在该业务对象的详情查询API
- API返回字段包含事件报文中缺失的字段

**代码模式**：

```java
@Service
public class {Business}EventService {

    @Autowired
    private OpenApiUtils openApiUtils;

    @Autowired
    private AccessTokenUtils accessTokenUtils;

    @Value("${bip.openapi.host:}")
    private String openApiHost;

    // 业务对象URI（从元数据获取，禁止臆想）
    private static final String BIZ_OBJECT_URI = "bd.staff.Staff";

    /**
     * 通过OpenAPI查询完整业务数据
     *
     * @param id       业务对象ID
     * @param tenantId 租户ID
     * @return 完整业务数据，查询失败返回null
     */
    private JSONObject queryFullDataByOpenApi(String id, String tenantId) {
        try {
            // 1. 获取Token
            String token = accessTokenUtils.getAccessToken();

            // 2. 构建请求URL（使用简版列表查询API，根据ID查询单条）
            String url = openApiHost + "/yonbip/digitalModel/staff/listForApi?access_token=" + token;

            // 3. 构建请求参数
            JSONObject requestBody = new JSONObject();
            requestBody.put("ids", id);      // 主键集合
            requestBody.put("pageIndex", 1);
            requestBody.put("pageSize", 1);

            // 4. 调用API
            String response = openApiUtils.postMethod(requestBody.toJSONString(), url);
            JSONObject result = JSON.parseObject(response);

            // 5. 解析响应
            if (result == null || !"00000".equals(result.getString("code"))) {
                logger.warn("OpenAPI查询失败 - code: {}, message: {}",
                        result != null ? result.getString("code") : "null",
                        result != null ? result.getString("message") : "null");
                return null;
            }

            JSONObject data = result.getJSONObject("data");
            if (data == null) {
                return null;
            }

            JSONArray recordList = data.getJSONArray("recordList");
            if (recordList == null || recordList.isEmpty()) {
                return null;
            }

            return recordList.getJSONObject(0);

        } catch (Exception e) {
            logger.error("OpenAPI查询异常", e);
            return null;
        }
    }
}
```

### 3.7.5 IBillQueryRepository查询（备选）

**判断条件**：
- 无合适的OpenAPI
- 需要获取业务对象的完整数据
- 需要包含子表数据

**代码模式**：

重要：在定时任务或监听系统事件的代码中，通常没有前端用户发起的请求，因此没有携带上下文的令牌。此时若要使用 MetaDaoHelper 进行查询或更新，必须先用 RobotExecutors.runAs() 恢复上下文。

```java
@Service
public class {Business}EventService {

    @Autowired
    private IBillQueryRepository billQueryRepository;

    // 业务对象URI（从元数据获取，禁止臆想）
    private static final String BIZ_OBJECT_URI = "bd.staff.Staff";
    private static final String BIZ_OBJECT_DOMAIN = "ucf-staff-center";

    /**
     * 机器人鉴权工具方法
     * RobotExecutors.runAs 是同步执行的，不会创建新线程
     */
    private <T> T executeWithRobotAuth(String tenantId, java.util.concurrent.Callable<T> callable) {
        return RobotExecutors.runAs(tenantId, callable);
    }

    /**
     * 通过IBillQueryRepository查询完整业务数据
     *
     * @param id       业务对象ID
     * @param tenantId 租户ID
     * @return 完整业务数据，查询失败返回null
     */
    private JSONObject queryFullDataByRepository(String id, String tenantId) {
        try {
            return executeWithRobotAuth(tenantId, () -> {
                // 构建查询条件
                QuerySchema querySchema = new QuerySchema();
                querySchema.setUri(BIZ_OBJECT_URI);
                querySchema.setDomain(BIZ_OBJECT_DOMAIN);

                // 添加ID条件
                QueryCondition condition = new QueryCondition();
                condition.setItemName("id");
                condition.setOperator("=");
                condition.setValue1(id);
                querySchema.addCondition(condition);

                // 执行查询
                List<? extends IBillDO> result = billQueryRepository.queryBySchema(querySchema);

                if (result != null && !result.isEmpty()) {
                    // 转换为JSONObject
                    return convertToJSONObject(result.get(0));
                }
                return null;
            });
        } catch (Exception e) {
            logger.error("IBillQueryRepository查询异常", e);
            return null;
        }
    }

    /**
     * IBillDO转换为JSONObject
     */
    private JSONObject convertToJSONObject(IBillDO billDO) {
        JSONObject json = new JSONObject();
        // 反射获取所有字段
        for (java.lang.reflect.Field field : billDO.getClass().getDeclaredFields()) {
            field.setAccessible(true);
            try {
                json.put(field.getName(), field.get(billDO));
            } catch (IllegalAccessException e) {
                // 忽略
            }
        }
        return json;
    }
}
```

### 3.7.6 完整处理流程

```java
/**
 * 处理员工新增事件
 *
 * @param eventContent 事件内容（JSON字符串）
 * @param tenantId    租户ID（用于机器人鉴权）
 */
public void handleStaffAddEvent(String eventContent, String tenantId) {
    logger.info("处理员工新增事件 - tenantId: {}, content: {}", tenantId, eventContent);

    // 1. 解析事件数据
    JSONObject eventData = JSON.parseObject(eventContent);
    JSONObject model = eventData.getJSONObject("model");
    if (model == null) {
        logger.warn("事件数据中未找到model节点");
        return;
    }

    String staffId = model.getString("id");
    logger.info("员工新增事件解析 - id: {}, code: {}, name: {}",
            staffId, model.getString("code"), model.getString("name"));

    // 2. 数据完整性评估
    JSONObject fullData = model;
    if (!isDataSufficient(model)) {
        logger.info("事件报文字段不足，尝试补充数据");

        // 3. 优先尝试OpenAPI查询
        fullData = queryFullDataByOpenApi(staffId, tenantId);
        if (fullData == null) {
            // 4. 降级到Repository查询
            logger.info("OpenAPI查询失败，降级到Repository查询");
            fullData = queryFullDataByRepository(staffId, tenantId);
        }

        if (fullData == null) {
            // 5. 降级：使用原始数据
            logger.warn("数据补充失败，使用原始事件数据 - staffId: {}", staffId);
            fullData = model;
        } else {
            logger.info("数据补充成功 - id: {}, code: {}, name: {}",
                    fullData.getString("id"), fullData.getString("code"), fullData.getString("name"));
        }
    }

    // 6. 构建推送请求并发送
    StaffPushRequest request = buildPushRequest(fullData);
    pushToThirdParty(request);
}

/**
 * 判断报文字段是否满足推送需求
 *
 * @param model 事件报文的model节点
 * @return true-字段充足，false-字段不足需要补充
 */
private boolean isDataSufficient(JSONObject model) {
    // 根据业务需求判断：
    // 例如：推送第三方需要工作记录子表数据
    if (!model.containsKey("mainJobList") && !model.containsKey("ptJobList")) {
        return false;  // 缺少子表数据
    }

    // 例如：推送第三方需要组织编码
    if (model.getString("org_code") == null && model.getString("org_id") != null) {
        return false;  // 只有ID没有编码
    }

    // 更多判断条件...

    return true;
}

/**
 * 尝试获取完整数据（优先OpenAPI，备选Repository）
 */
private JSONObject tryQueryFullData(String id, String tenantId) {
    // Step 1: 尝试OpenAPI
    JSONObject data = queryFullDataByOpenApi(id, tenantId);
    if (data != null) {
        return data;
    }

    // Step 2: 降级到Repository
    return queryFullDataByRepository(id, tenantId);
}
```

### 3.7.7 字段翻译说明

> **注意**：OpenAPI和IBillQueryRepository返回的参照字段通常是ID（如 `org_id`、`dept_id`），如果第三方系统需要编码（如 `org_code`、`dept_code`），需要额外调用档案翻译接口。

**翻译方式**：
- 使用 `IBillQueryRepository.findById()` + 档案API
- 或使用 `iuap-c-metadata-info` 查询档案的参照结构


---

## 4. 代码模板

### 4.1 Controller 层（事件接收端点）

```java
@RestController
@RequestMapping("/{module}")
public class {Module}EventController {

    private static final Logger logger = LoggerFactory.getLogger({Module}EventController.class);

    // ✅ 从配置中心注入
    @Value("${YonBIP.appKey}")
    private String appKeyBIP;

    @Value("${YonBIP.appSecret}")
    private String appSecretBIP;

    @Value("${YonBIP.openApiUrl}")
    private String openApiUrl;

    private static YonPublicParam yonPublicParam = new YonPublicParam();
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    private {Business}Service {business}Service;

    @PostConstruct
    private void init() {
        yonPublicParam.setAppKey(this.appKeyBIP);
        yonPublicParam.setAppSecret(this.appSecretBIP);
        yonPublicParam.setOpenApiUrl(this.openApiUrl);
    }

    @PostMapping("/eventPush")
    @ResponseBody
    public String eventCallBackReceiver(@RequestBody EncryptionHolder holder) {
        try {
            // 1. 创建加密解密工具并解密
            EventCrypto crypto = PrivateAppCrypto.newCrypto(this.appKeyBIP, this.appSecretBIP);
            String decryptMessage = crypto.decryptMsg(holder);

            // 2. 反序列化事件内容
            EventContent content = this.mapper.readValue(decryptMessage, EventContent.class);

            // 3. 日志记录
            logger.info("收到事件推送 - type: {}, tenantId: {}, eventId: {}",
                        content.getType(), content.getTenantId(), content.getEventId());

            // 4. 获取租户ID（用于机器人鉴权查询数据库）
            String tenantId = content.getTenantId();

            // 5. 事件分发处理（传递 tenantId）
            switch (content.getType()) {
                case TODO_CENTER_ADD_TODO:
                    this.{business}Service.handleAddTodo(content.getContent(), tenantId, yonPublicParam);
                    break;
                case TODO_CENTER_UPDATE_TODO:
                    this.{business}Service.handleUpdateTodo(content.getContent(), tenantId, yonPublicParam);
                    break;
                case {CUSTOM_EVENT_TYPE}:
                    this.{business}Service.handleCustomEvent(content.getContent(), tenantId, yonPublicParam);
                    break;
                default:
                    logger.warn("未知事件类型: {}", content.getType());
            }

            // 6. 返回 "success"
            return "success";

        } catch (Exception e) {
            // ✅ 异常捕获，返回 success 避免 BIP 重试
            logger.error("处理事件异常", e);
            return "success";
        }
    }
}
```

### 4.2 EncryptionHolder（加密数据载体）

```java
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class EncryptionHolder {
    private String signature;  // HMAC-SHA256 签名
    private long timestamp;    // 时间戳
    private String nonce;      // 随机字符串
    private String encrypt;    // AES 加密内容（Base64编码）

    public EncryptionHolder() {}
    public EncryptionHolder(String signature, long timestamp, String nonce, String encrypt) {
        this.signature = signature;
        this.timestamp = timestamp;
        this.nonce = nonce;
        this.encrypt = encrypt;
    }

    // Getter/Setter
}
```

### 4.3 PrivateAppCrypto（私有应用加密工具）

```java
public class PrivateAppCrypto extends EventCrypto {

    private PrivateAppCrypto(String appKey, String appSecret, String encodingAesKey) {
        super(appSecret, encodingAesKey, appKey);
    }

    public static PrivateAppCrypto newCrypto(String appKey, String appSecret) {
        String encodingAesKey = buildAesKeyFromSecret(appSecret);
        return new PrivateAppCrypto(appKey, appSecret, encodingAesKey);
    }

    public static String buildAesKeyFromSecret(String appSecret) {
        String encodingAesKey = appSecret.replaceAll("-", "");
        if (encodingAesKey.length() == 43) {
            return encodingAesKey;
        } else if (encodingAesKey.length() > 43) {
            return encodingAesKey.substring(0, 43);
        } else {
            StringBuilder sb = new StringBuilder(encodingAesKey);
            while (sb.length() < 43) {
                sb.append("0");
            }
            return sb.toString();
        }
    }
}
```

### 4.4 EventCrypto（核心加解密）

```java
public class EventCrypto {

    private static Charset CHARSET = Charset.forName("utf-8");
    private byte[] aesKey;
    private String token;
    private String suiteKey;

    public EventCrypto(String token, String encodingAesKey, String suiteKey) throws CryptoException {
        if (encodingAesKey.length() != 43) {
            throw new CryptoException(ErrorCode.INVALID_AES_SYMMETRIC_KEY);
        }
        this.token = token;
        this.suiteKey = suiteKey;
        this.aesKey = Base64.getDecoder().decode(encodingAesKey + "=");
    }

    // 解密 BIP 推送的消息
    public String decryptMsg(EncryptionHolder holder) throws CryptoException {
        return this.decryptMsg(holder.getSignature(), holder.getTimestamp(),
                               holder.getNonce(), holder.getEncrypt());
    }

    public String decryptMsg(String msgSignature, long timestamp, String nonce, String encrypt)
            throws CryptoException {
        // 1. 签名校验
        String signature = SHA256.sign(this.token, String.valueOf(timestamp), nonce, encrypt);
        if (!signature.equals(msgSignature)) {
            throw new CryptoException(ErrorCode.INVALID_SIGNATURE);
        }
        // 2. AES 解密
        return this.decrypt(encrypt);
    }

    private String decrypt(String text) throws CryptoException {
        try {
            Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
            SecretKeySpec keySpec = new SecretKeySpec(this.aesKey, "AES");
            IvParameterSpec iv = new IvParameterSpec(Arrays.copyOfRange(this.aesKey, 0, 16));
            cipher.init(Cipher.DECRYPT_MODE, keySpec, iv);
            byte[] encrypted = Base64.getDecoder().decode(text);
            byte[] original = cipher.doFinal(encrypted);

            // 3. PKCS7 解析
            byte[] bytes = PKCS7Encoder.decode(original);
            byte[] networkOrder = Arrays.copyOfRange(bytes, 16, 20);
            int contentLength = recoverNetworkBytesOrder(networkOrder);
            String message = new String(Arrays.copyOfRange(bytes, 20, 20 + contentLength), CHARSET);
            String fromSuiteKey = new String(Arrays.copyOfRange(bytes, 20 + contentLength, bytes.length), CHARSET);

            // 4. suiteKey 校验
            if (!fromSuiteKey.equals(this.suiteKey)) {
                throw new CryptoException(ErrorCode.INVALID_SUITE_KEY);
            }
            return message;
        } catch (Exception e) {
            throw new CryptoException(ErrorCode.AES_DECRYPT_FAILED, e);
        }
    }

    private int recoverNetworkBytesOrder(byte[] orderBytes) {
        int result = 0;
        for (int i = 0; i < 4; i++) {
            result <<= 8;
            result |= orderBytes[i] & 255;
        }
        return result;
    }
}
```

### 4.5 SHA256（签名工具）

```java
public class SHA256 {

    public static final String H_MAC_SHA256 = "HmacSHA256";

    public static String sign(String token, String timestamp, String nonce, String encrypt) {
        try {
            String[] array = new String[]{timestamp, nonce, encrypt};
            Arrays.sort(array);
            StringBuilder sb = new StringBuilder();
            for (String s : array) {
                sb.append(s);
            }
            Mac mac = Mac.getInstance(H_MAC_SHA256);
            mac.init(new SecretKeySpec(token.getBytes(StandardCharsets.UTF_8), H_MAC_SHA256));
            byte[] signData = mac.doFinal(sb.toString().getBytes(StandardCharsets.UTF_8));
            return new String(Base64.encodeBase64(signData));
        } catch (Exception e) {
            throw new CryptoException(ErrorCode.SHA256_SIGN_FAILED, e);
        }
    }
}
```

### 4.6 PKCS7Encoder（填充编码）

```java
public class PKCS7Encoder {

    private static final int BLOCK_SIZE = 32;

    public static byte[] encode(int count) {
        int padAmount = BLOCK_SIZE - (count % BLOCK_SIZE);
        byte[] pad = new byte[padAmount];
        Arrays.fill(pad, (byte) padAmount);
        return pad;
    }

    public static byte[] decode(byte[] original) {
        int padAmount = original[original.length - 1];
        return Arrays.copyOfRange(original, 0, original.length - padAmount);
    }
}
```

### 4.7 Service 层（完整模板）

```java
package com.yonyou.modules.{module}.event.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.yonyou.modules.expense.util.AccessTokenUtils;
import com.yonyou.modules.expense.util.OpenApiUtils;
import com.yonyou.ypd.bill.basic.entity.IBillDO;
import com.yonyou.ypd.bill.infrastructure.service.api.IBillQueryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;

/**
 * {业务名称}事件处理服务
 */
@Slf4j
@Service
public class {Business}EventService {

    // ⚠️ 从元数据获取，禁止臆想
    private static final String BIZ_OBJECT_URI = "{uri}";  // 如: bd.staff.Staff
    private static final String BIZ_OBJECT_DOMAIN = "{domain}";  // 如: ucf-staff-center

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Autowired
    private OpenApiUtils openApiUtils;

    @Autowired
    private AccessTokenUtils accessTokenUtils;

    @Value("${bip.openapi.host:}")
    private String openApiHost;

    // ========== 机器人鉴权 ==========

    /**
     * 机器人鉴权工具方法
     * RobotExecutors.runAs 是同步执行的，不会创建新线程
     */
    private <T> T executeWithRobotAuth(String tenantId, Callable<T> callable) {
        return RobotExecutors.runAs(tenantId, callable);
    }

    // ========== 事件处理 ==========

    /**
     * 处理{业务名称}新增事件
     */
    public void handleAddEvent(String content, String tenantId) {
        log.info("处理{业务名称}新增事件 - content: {}", content);

        // 1. 解析事件数据
        JSONObject eventData = JSON.parseObject(content);
        JSONObject model = eventData.getJSONObject("model");
        if (model == null) {
            log.warn("事件数据中未找到model节点");
            return;
        }

        String id = model.getString("id");
        String code = model.getString("code");
        log.info("{业务名称}事件解析 - id: {}, code: {}", id, code);

        // 2. 数据完整性评估
        JSONObject fullData = model;
        if (!isDataSufficient(model)) {
            log.info("事件报文字段不足，尝试补充数据");
            fullData = tryQueryFullData(id, tenantId);
            if (fullData == null) {
                log.warn("数据补充失败，使用原始事件数据");
                fullData = model;
            }
        }

        // 3. 构建推送请求并发送
        buildAndPushRequest(fullData);
    }

    // ========== 数据补充（OpenAPI优先，Repository备选）==========

    /**
     * 判断报文字段是否满足推送需求
     */
    private boolean isDataSufficient(JSONObject model) {
        // 根据业务需求判断，例如：
        // if (!model.containsKey("mainJobList")) {
        //     return false;
        // }
        return true;
    }

    /**
     * 尝试获取完整数据（优先OpenAPI，备选Repository）
     */
    private JSONObject tryQueryFullData(String id, String tenantId) {
        // Step 1: 尝试OpenAPI
        JSONObject data = queryFullDataByOpenApi(id, tenantId);
        if (data != null) {
            return data;
        }

        // Step 2: 降级到Repository
        return queryFullDataByRepository(id, tenantId);
    }

    /**
     * 通过OpenAPI查询完整业务数据
     */
    private JSONObject queryFullDataByOpenApi(String id, String tenantId) {
        try {
            String token = accessTokenUtils.getAccessToken();
            String url = openApiHost + "/yonbip/digitalModel/{module}/listForApi?access_token=" + token;

            JSONObject requestBody = new JSONObject();
            requestBody.put("ids", id);
            requestBody.put("pageIndex", 1);
            requestBody.put("pageSize", 1);

            String response = openApiUtils.postMethod(requestBody.toJSONString(), url);
            JSONObject result = JSON.parseObject(response);

            if (result == null || !"00000".equals(result.getString("code"))) {
                log.warn("OpenAPI查询失败 - code: {}", result != null ? result.getString("code") : "null");
                return null;
            }

            JSONObject data = result.getJSONObject("data");
            JSONArray recordList = data != null ? data.getJSONArray("recordList") : null;
            if (recordList == null || recordList.isEmpty()) {
                return null;
            }

            return recordList.getJSONObject(0);
        } catch (Exception e) {
            log.error("OpenAPI查询异常", e);
            return null;
        }
    }

    /**
     * 通过IBillQueryRepository查询完整业务数据
     */
    private JSONObject queryFullDataByRepository(String id, String tenantId) {
        try {
            return executeWithRobotAuth(tenantId, () -> {
                QuerySchema querySchema = new QuerySchema();
                querySchema.setUri(BIZ_OBJECT_URI);
                querySchema.setDomain(BIZ_OBJECT_DOMAIN);

                QueryCondition condition = new QueryCondition();
                condition.setItemName("id");
                condition.setOperator("=");
                condition.setValue1(id);
                querySchema.addCondition(condition);

                List<? extends IBillDO> result = billQueryRepository.queryBySchema(querySchema);
                if (result != null && !result.isEmpty()) {
                    return convertToJSONObject(result.get(0));
                }
                return null;
            });
        } catch (Exception e) {
            log.error("Repository查询异常", e);
            return null;
        }
    }

    /**
     * IBillDO转换为JSONObject（使用JSON序列化方式，避免反射问题）
     */
    private JSONObject convertToJSONObject(IBillDO billDO) {
        return JSON.parseObject(JSON.toJSONString(billDO));
    }

    // ========== 业务处理 ==========

    /**
     * 构建推送请求并发送
     */
    private void buildAndPushRequest(JSONObject data) {
        // TODO: 根据业务需求构建推送请求
        log.info("构建推送请求 - data: {}", data.toJSONString());
    }
}
```

### 4.8 字段翻译 Service（参照字段 ID→编码）

```java
package com.yonyou.modules.{module}.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.yonyou.modules.expense.util.AccessTokenUtils;
import com.yonyou.modules.expense.util.OpenApiUtils;
import com.yonyou.ypd.bill.basic.entity.IBillDO;
import com.yonyou.ypd.bill.infrastructure.service.api.IBillQueryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

/**
 * 档案翻译服务
 * 用于将参照字段的ID翻译为编码或名称
 */
@Slf4j
@Service
public class ReferenceTranslationService {

    private static final String BIZ_OBJECT_URI = "{uri}";  // 如: org.func.AdminOrg
    private static final String BIZ_OBJECT_DOMAIN = "{domain}";  // 如: ucf-org-center

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Autowired
    private OpenApiUtils openApiUtils;

    @Autowired
    private AccessTokenUtils accessTokenUtils;

    @Value("${bip.openapi.host:}")
    private String openApiHost;

    private <T> T executeWithRobotAuth(String tenantId, Callable<T> callable) {
        return RobotExecutors.runAs(tenantId, callable);
    }

    /**
     * 批量翻译ID为编码
     *
     * @param ids    ID列表
     * @param tenantId 租户ID
     * @return Map<id, code>
     */
    public Map<String, String> translateIdsToCodes(List<String> ids, String tenantId) {
        Map<String, String> result = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return result;
        }

        try {
            List<? extends IBillDO> records = executeWithRobotAuth(tenantId, () -> {
                QuerySchema querySchema = new QuerySchema();
                querySchema.setUri(BIZ_OBJECT_URI);

                QueryCondition condition = new QueryCondition();
                condition.setItemName("id");
                condition.setOperator("in");
                condition.setValue1(String.join(",", ids));
                querySchema.addCondition(condition);

                return billQueryRepository.queryBySchema(querySchema);
            });

            if (records != null) {
                for (IBillDO record : records) {
                    JSONObject json = JSON.parseObject(JSON.toJSONString(record));
                    result.put(json.getString("id"), json.getString("code"));
                }
            }
        } catch (Exception e) {
            log.error("翻译ID为编码异常", e);
        }

        return result;
    }

    /**
     * 单个ID翻译为编码
     */
    public String translateIdToCode(String id, String tenantId) {
        Map<String, String> result = translateIdsToCodes(java.util.Collections.singletonList(id), tenantId);
        return result.get(id);
    }
}
```

---

## 5. 错误写法反例

### 5.1 ❌ 硬编码密钥

```java
// ❌ 错误：硬编码密钥
private static final String APP_KEY = "xxxx-xxxx-xxxx";
private static final String APP_SECRET = "xxxx-xxxx-xxxx";
```
**问题**：密钥暴露，安全风险高

### 5.2 ❌ 返回值不是 "success"

```java
// ❌ 错误：返回 JSON 对象
return Collections.singletonMap("success", true);

// ❌ 错误：返回带引号的字符串
return "\"success\"";
```
**问题**：BIP 无法正确解析响应，可能触发重试

### 5.3 ❌ 异常时不返回 success

```java
// ❌ 错误：抛出异常
} catch (Exception e) {
    logger.error("处理异常", e);
    throw e;  // 会触发 BIP 重试
}
```
**问题**：异常时会触发 BIP 无限重试

### 5.4 ❌ 缺少签名校验

```java
// ❌ 错误：跳过签名校验
String message = crypto.decrypt(holder.getEncrypt());
```
**问题**：无法验证消息来源和完整性

### 5.5 ❌ 缺少日志记录

```java
// ❌ 错误：没有日志
EventContent content = decryptAndParse(holder);
processEvent(content);
return "success";
```
**问题**：无法追踪事件处理情况

### 5.6 ❌ 缺少幂等处理

```java
// ❌ 错误：没有幂等检查
EventContent content = decryptAndParse(holder);
processEvent(content);  // 重复推送会重复处理
```
**问题**：BIP 重试时会导致重复处理

---

## 6. 模型类定义

### 6.1 EventContent（事件内容）

```java
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class EventContent implements Serializable {
    private EventType type;        // 事件类型
    private String eventId;         // 事件ID（幂等键）
    private long timestamp;         // 事件时间戳
    private String tenantId;       // 租户ID
    private String[] staffId;      // 员工ID列表
    private String[] deptId;       // 部门ID列表
    private String[] userId;       // 用户ID列表
    private String content;         // 事件内容（JSON字符串）

    // Getter/Setter
}
```

### 6.2 EventType（事件类型枚举）

```java
public enum EventType {
    UNKNOWN,

    // 待办中心
    TODO_CENTER_ADD_TODO,
    TODO_CENTER_UPDATE_TODO,

    // 员工事件
    STAFF_ADD, STAFF_UPDATE, STAFF_ENABLE, STAFF_DISABLE, STAFF_DELETE,

    // 部门事件
    DEPT_ADD, DEPT_UPDATE, DEPT_ENABLE, DEPT_DISABLE, DEPT_DELETE,

    // 基础档案事件（按需扩展）
    YXYBASEDOC_PC_PRODUCT_INSERT,
    YXYBASEDOC_PC_PRODUCT_UPDATE,
    YXYBASEDOC_PC_PRODUCT_DELETE,

    // YOUR_CUSTOM_EVENT
    ;
}
```

### 6.3 ErrorCode（错误码枚举）

```java
public enum ErrorCode {
    INVALID_AES_SYMMETRIC_KEY("Invalid AES symmetric key"),
    INVALID_SIGNATURE("Invalid signature"),
    AES_DECRYPT_FAILED("AES decrypt failed"),
    SHA256_SIGN_FAILED("SHA256 sign failed"),
    INVALID_SUITE_KEY("Invalid suite key");

    private final String message;
    ErrorCode(String message) { this.message = message; }
    public String getMessage() { return message; }
}
```

### 6.4 CryptoException（异常类）

```java
public class CryptoException extends RuntimeException {
    private ErrorCode errorCode;

    public CryptoException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public CryptoException(ErrorCode errorCode, Throwable cause) {
        super(errorCode.getMessage(), cause);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() { return errorCode; }
}
```

---

## 7. 配置规范

### 7.1 YMS 配置中心参数

```yaml
YonBIP:
  appKey: ${YMS配置项:BIP_APP_KEY}
  appSecret: ${YMS配置项:BIP_APP_SECRET}
  notify:
    appKey: ${YMS配置项:BIP_NOTIFY_APP_KEY}
    appSecret: ${YMS配置项:BIP_NOTIFY_APP_SECRET}
  identy: ${YMS配置项:BIP_IDENTY}
  yonBIPUrl: ${YMS配置项:BIP_URL}
  openApiUrl: ${YMS配置项:OPENAPI_URL}

third:
  domain: ${YMS配置项:THIRD_DOMAIN}

domain:
  iuap-apcom-coderule: ${YMS配置项:PLATFORM_DOMAIN}
```

### 7.2 配置获取规范

```java
// ✅ 正确：从配置中心获取
@Value("${YonBIP.appKey}")
private String appKeyBIP;

@Value("${YonBIP.appSecret}")
private String appSecretBIP;

// ❌ 错误：硬编码
private String appKeyBIP = "xxxx-xxxx-xxxx";
```

---

## 8. 检查清单

### ⚠️ 8.0 开发前准备检查（强制）

> **以下检查项必须在代码生成前完成**

- [ ] **已调用 事件查询（见 events/ 目录下事件订阅配置指南）** 查询事件信息
  - 已获取: eventCode（如 STAFF_ADD）
  - 已获取: 事件报文结构（example）
- [ ] **已评估事件报文字段完整性**
  - 已分析：BIP事件报文只包含基础字段
  - 已确认：需要补充哪些字段（子表数据、参照字段等）
- [ ] **已选择数据补充方式**
  - [ ] 有合适OpenAPI → 记录API信息
  - [ ] 无合适OpenAPI → 记录使用IBillQueryRepository
- [ ] **已调用 iuap-c-metadata-info** 查询业务对象元数据
  - 已获取: domain（如 ucf-staff-center）
  - 已获取: URI（如 bd.staff.Staff）
  - 已获取: 字段结构
- [ ] **已调用 iuap-c-openapi-integration** 查询 API 接口（如需要数据补充）
  - 已获取: API URL
  - 已获取: 入参结构
  - 已获取: 出参结构
- [ ] **已从需求文档提取事件类型**
  - 事件类型来自文档（如 .docx、.xlsx）
  - 未臆想添加文档外的事件类型

### 8.1 代码生成检查

- [ ] EncryptionHolder 加密数据载体类
- [ ] PrivateAppCrypto 加密工具类
- [ ] EventCrypto 核心加解密类
- [ ] SHA256 签名工具类
- [ ] PKCS7Encoder 填充编码类
- [ ] **事件类型验证**：已从需求文档中识别所有事件类型，未臆想添加

### 8.2 Controller 端点检查

- [ ] `@PostMapping("/eventPush")` 端点
- [ ] `@RequestBody EncryptionHolder holder` 参数
- [ ] `crypto.decryptMsg(holder)` 解密
- [ ] `content.getTenantId()` 获取租户ID
- [ ] `content.getType()` 分发处理（传递 tenantId）
- [ ] 返回 `"success"` 字符串

### 8.3 机器人鉴权检查（查询数据库时）

> ⚠️ **重要**：事件订阅场景下查询数据库必须使用机器人鉴权

- [ ] Service 中定义了 `executeWithRobotAuth(tenantId, callable)` 工具方法
- [ ] Controller 正确传递 `tenantId` 给 Service
- [ ] 需要查询数据库的方法签名包含 `tenantId` 参数
- [ ] 数据库查询操作使用 `executeWithRobotAuth` 包装

### 8.4 禁止项检查

- [ ] **禁止**硬编码密钥
- [ ] **禁止**返回值不是 `"success"`
- [ ] **禁止**跳过签名校验
- [ ] **禁止**缺少异常处理
- [ ] **禁止**臆想事件类型（必须从需求文档识别）
- [ ] **禁止**添加文档中不存在的事件类型
- [ ] **禁止**臆想 domain 和 URI（必须从元数据获取）
- [ ] **禁止**在事件订阅中不使用机器人鉴权查询数据库
- [ ] **禁止**在需要数据库查询的方法中遗漏 `tenantId` 参数
- [ ] **禁止**不评估报文字段完整性就直接使用事件数据推送

### 8.5 事件报文字段完整性检查

> **⚠️ 强制要求**：事件报文字段通常不足以满足推送需求，必须进行完整性评估

- [ ] **已评估**事件报文字段是否满足推送需求
  - ✅ 已分析：BIP事件报文只包含基础字段（id、code、name、enable）
  - ✅ 已确认：是否需要子表数据（如工作记录、银行账户）
  - ✅ 已确认：是否需要参照字段的编码/名称
- [ ] **已选择**数据补充方式
  - [ ] **有合适OpenAPI** → 使用 OpenAPI 查询详情
    - 已查询API：`iuap-c-openapi-integration` 获取接口信息
  - [ ] **无合适OpenAPI** → 使用 IBillQueryRepository 查询
- [ ] **已实现**数据补充逻辑
  - [ ] `isDataSufficient(model)` - 判断方法
  - [ ] `tryQueryFullData(id, tenantId)` - 补充方法（优先OpenAPI，备选Repository）
  - [ ] `queryFullDataByOpenApi(id, tenantId)` - OpenAPI查询方法
  - [ ] `queryFullDataByRepository(id, tenantId)` - Repository查询方法（含机器人鉴权）
- [ ] **已处理**降级场景
  - ✅ OpenAPI查询失败时降级到Repository
  - ✅ Repository查询失败时降级到原始数据
  - ✅ 降级场景已记录日志

---

## 附录：错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 签名/AES/suiteKey 校验失败 | 抛出 CryptoException，返回 "success" |
| 业务处理异常 | catch 后记录日志，返回 "success" |
| 配置缺失 | 项目启动失败，确保 YMS 配置完整 |


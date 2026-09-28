# BIP后端开发深度指南

本文档是 [SKILL.md](SKILL.md) 的补充，提供详细的开发流程和最佳实践。

---

## 目录

1. [业务控制层开发](#1-业务控制层开发)
2. [数据库操作](#2-数据库操作)
3. [规则插件开发](#3-规则插件开发)
4. [业务插件开发](#4-业务插件开发)
5. [事件监听开发](#5-事件监听开发)
6. [事件订阅开发](#6-事件订阅开发)
7. [OpenAPI调用](#7-openapi调用)
8. [调度任务开发](#8-调度任务开发)
9. [单据转换](#9-单据转换)
10. [特征操作](#10-特征操作)
11. [异常处理](#11-异常处理)

---

## 1. 业务控制层开发

### 开发流程

```
1. 创建业务接口 (Interface)
2. 创建业务接口实现类 (ServiceImpl)
3. 创建控制器 (Controller)
```

### 1.1 创建业务接口

```java
package com.yonyou.ucf.xxxxx;

import java.util.Map;

public interface IDemoService {
    Object demo(Map<String, Object> params);
}
```

### 1.2 创建业务接口实现类

```java
package com.yonyou.ucf.xxxxx.service;

import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.List;

@Slf4j
@Service
public class FundSReportSendService implements IDemoService {

    private static final Logger log = LoggerFactory.getLogger(FundSReportSendService.class);

    @Autowired
    private IYmsJdbcApi ymsJdbcApi;

    @Override
    public Object demo(Map<String, Object> params) {
        log.info("demo 方法被调用，参数为：{}", params);
        // 业务逻辑
        return result;
    }
}
```

### 1.3 创建控制器

```java
@RestController
@RequestMapping("/xxxxx")
public class DemoController extends BaseController {

    @Autowired
    private IDemoService iDemoService;

    @RequestMapping("/doSomeThing")
    public Map<String, Object> doSomeThing(
            @RequestBody(required = false) Map<String, Object> map,
            HttpServletRequest request,
            HttpServletResponse response) {

        Object businessResult = iDemoService.demo(map);

        JSONObject jsonObject = new JSONObject();
        jsonObject.put("msg", "成功");
        jsonObject.put("result", businessResult);
        jsonObject.put("status", 1);
        return jsonObject;
    }
}
```

---

## 2. 数据库操作

### 2.1 三个核心接口职责

| 接口 | 职责 | 使用场景 |
|------|------|----------|
| `IBillQueryRepository` | 业务对象查询 | 标准业务对象查询 |
| `IBillRepository` | 业务对象增删改 | 标准业务对象写操作 |
| `IYmsJdbcApi` | 原生SQL操作 | 复杂查询、直接数据库操作 |

### 2.2 IBillQueryRepository 查询示例

```java
@Autowired
private IBillQueryRepository iBillQueryRepository;

// 根据ID查询
IBillDO bill = iBillQueryRepository.findById("业务对象uri", "主键值");

// 使用QuerySchema查询
QuerySchema querySchema = QuerySchema.create();
querySchema.addSelect("code,name,pk_org");
querySchema.addCondition(
    QueryConditionGroup.and(
        QueryCondition.name("id").eq(id),
        QueryCondition.name("dr").eq(0)
    )
);
List<Map<String, Object>> results = billQueryRepository.queryMapBySchema(
    "业务对象uri", querySchema, "领域编码"
);
```

### 2.3 IBillRepository 增删改示例

```java
@Autowired
private IBillRepository billRepository;

// 更新单据
billRepository.updateBillDO(billDO, null);

// 批量更新
billRepository.batchUpdateBillDos(billDOs, null);

// 逻辑删除
billRepository.batchLogicDelete(fullname, scList);
```

### 2.4 IYmsJdbcApi 原生SQL示例

> **必须遵守**：表名格式为 `scheme.tableName`

```java
@Resource(name = "baseDAO", type = BaseDAO.class)
private IYmsJdbcApi ymsJdbcApi;

// 查询示例
SQLParameter parameter = new SQLParameter();
String sql = "select id from db_example.orders where code = ?";
parameter.addParam(orderCode);
List<Map<String, Object>> results = ymsJdbcApi.queryForList(sql, parameter, new MapListProcessor());

// 更新示例
String updateSql = "update db_example.orders set status = ? where id = ?";
SQLParameter param = new SQLParameter();
param.addParam(1);
param.addParam(orderId);
ymsJdbcApi.update(updateSql, param);

// 分页查询
PageRequest pageRequest = new PageRequest(pageNo, pageSize);
Page<Map<String, Object>> page = ymsJdbcApi.queryPage(sql, parameter, pageRequest, null);
```

---

## 3. 规则插件开发

### 3.1 IYpdCommonRul 接口

实现 `IYpdCommonRul` 接口进行业务规则校验：

```java
@Component("merchantCheckRule")
public class MerchantCheckRule implements IYpdCommonRul {

    @Autowired
    private IBillQueryRepository billQueryRepository;

    @Override
    public Object execute(RulCtxVO rulCtxVO, Map<String, Object> params) {
        // 获取单据上下文
        BillContext billContext = new BillContext(rulCtxVO.getBillnum(), rulCtxVO.getFullname());
        billContext.setAction(rulCtxVO.getAction());
        billContext.setDomain(rulCtxVO.getDomain());

        // 获取单据数据
        List<BizObject> bills = CommonRuleUtils.getBills(billContext, params);
        if (!CollectionUtils.isEmpty(bills)) {
            BizObject bill = bills.get(0);
            // 业务校验逻辑
            String fieldValue = bill.get("fieldName");
            if (StringUtils.isEmpty(fieldValue)) {
                throw new BusinessException("领域-500001", "字段不能为空!");
            }
        }
        return new RuleExecuteResult();
    }
}
```

### 3.2 规则执行结果

```java
// 正常返回
return new RuleExecuteResult();

// 中断后续规则
RuleExecuteResult result = new RuleExecuteResult();
result.setCancel(true);
return result;
```

---

## 4. 业务插件开发

### 4.1 创建插件

```java
@BillPlugin(busiObj = "业务对象编码")
public class DemoPlugin extends AbstractBillPlugin {

    private static final Logger log = LoggerFactory.getLogger(DemoPlugin.class);

    @Override
    public void beforeSave(YpdBillContext billContext) throws Exception {
        super.beforeSave(billContext);
        // 保存前逻辑
    }

    @Override
    public void afterSave(YpdBillContext billContext) throws Exception {
        super.afterSave(billContext);
        // 保存后逻辑
    }
}
```

### 4.2 常用插件扩展点

| 动作 | Before方法 | After方法 |
|------|------------|-----------|
| 保存 | `beforeSave` | `afterSave` |
| 审核 | `beforeAudit` | `afterAudit` |
| 提交 | `beforeSubmit` | `afterSubmit` |
| 删除 | `beforeDelete` | `afterDelete` |

详见 [reference/AbstractBillPlugin.md](reference/AbstractBillPlugin.md)

---

## 5. 事件监听开发

> **⚠️ 前置步骤**：在实现事件监听之前，必须先调用 `事件查询（见 events/ 目录下事件订阅配置指南）` 技能查询事件信息和事件报文。
>
> **查询目的**：
> - 获取事件编码 (eventCode)
> - 获取事件报文结构 (example)
>
> **查询命令**：
> ```bash
> # 查询事件类型列表
> python scripts/event_query.py --query "待办中心"
>
> # 查询事件详情（获取报文结构）
> python scripts/event_query.py --detail {eventId} --json
> ```
>
> **⚠️ 禁止臆想事件编码和报文结构**

### 5.1 查询事件信息（必须先执行）

```bash
# Step 1: 查询事件类型，获取 eventCode
python scripts/event_query.py --query "待办"

# 返回示例：
# eventId: 1814934938926448649
# eventCode: TODO_CENTER_ADD_TODO
# eventName: 待办新增事件

# Step 2: 查询事件详情，获取报文结构
python scripts/event_query.py --detail 1814934938926448649 --json

# 返回示例：
# {
#     "type": "TODO_CENTER_ADD_TODO",
#     "tenantId": "xxx",
#     "content": "{...}"
# }
```

### 5.2 REST监听实现

```java
@ResponseBody
@RequestMapping(value = "/event/demoListener", method = RequestMethod.POST)
public Object onEvent(HttpServletRequest request) {
    // 获取事件参数
    String sourceID = request.getParameter("sourceID");
    String eventType = request.getParameter("eventType");
    String userObject = request.getParameter("userObject");

    // 幂等处理
    if (alreadyProcessed(sourceID, eventType)) {
        Map<String, String> response = new HashMap<>();
        response.put("success", "true");
        response.put("msg", "repeat request, ignore");
        return response;
    }

    try {
        // 业务处理
        handleBusiness(userObject);

        // 成功返回
        Map<String, String> response = new HashMap<>();
        response.put("success", "true");
        return response;
    } catch (Exception e) {
        // 失败返回
        Map<String, String> response = new HashMap<>();
        response.put("success", "false");
        response.put("msg", e.getMessage());
        return response;
    }
}
```

### 5.2 关键规范

- **幂等必须实现**：已处理事件返回 `success: "true"`
- **返回值规范**：REST返回JSON中 `success` 为字符串 `"true"`

详见 [reference/EventListener.md](reference/EventListener.md)

---

## 6. 事件订阅开发

> **⚠️ 前置步骤**：在实现事件订阅之前，必须先调用 `事件查询（见 events/ 目录下事件订阅配置指南）` 技能查询事件信息。
>
> **查询目的**：
> - 获取事件编码 (eventCode)
> - 获取事件报文结构 (example)
>
> **⚠️ 禁止臆想事件编码和报文结构**

### 6.1 查询事件信息（必须先执行）

```bash
# Step 1: 查询事件类型列表，获取 eventCode
python scripts/event_query.py --query "物料档案"

# 返回示例：
# eventId: xxx
# eventCode: YXYBASEDOC_PC_PRODUCT_INSERT
# eventName: 物料档案新增

# Step 2: 查询事件详情，获取报文结构
python scripts/event_query.py --detail {eventId} --json

# 返回事件报文，用于解析 content.getContent() 字段
```

### 6.3 事件订阅特点

> **⚠️ 重要**：事件订阅与事件监听是两种不同的集成方式：
> - **事件监听**：报文为明文JSON，直接解析
> - **事件订阅**：报文为加密格式（EncryptionHolder），需要AES-CBC解密+HMAC-SHA256签名校验

| 特性 | 事件监听（明文） | 事件订阅（加密） |
|------|-----------------|-----------------|
| 报文格式 | JSON明文 | EncryptionHolder密文 |
| 解密 | 无需解密 | 需要AES-CBC解密 |
| 签名校验 | 无 | 需要HMAC-SHA256校验 |
| 返回值 | 可返回JSON | 必须返回纯字符串 `"success"` |
| 适用场景 | 简单的回调通知 | BIP事件中心主动推送 |

### 6.4 加密数据载体

```java
public class EncryptionHolder {
    private String signature;  // HMAC-SHA256签名
    private long timestamp;    // 时间戳
    private String nonce;      // 随机字符串
    private String encrypt;    // AES加密内容（Base64编码）
}
```

### 6.5 事件订阅Controller实现

```java
@Slf4j
@RestController
@RequestMapping("/{module}")
public class {Module}EventController {

    @Value("${bip.event.appKey}")
    private String appKeyBIP;

    @Value("${bip.event.appSecret}")
    private String appSecretBIP;

    @Autowired
    private {Business}Service {business}Service;

    private final ObjectMapper mapper = new ObjectMapper();

    @PostMapping("/eventPush")
    public String eventCallBackReceiver(@RequestBody EncryptionHolder holder) {
        try {
            // 1. 创建加密解密工具并解密
            EventCrypto crypto = PrivateAppCrypto.newCrypto(this.appKeyBIP, this.appSecretBIP);
            String decryptMessage = crypto.decryptMsg(holder);

            // 2. 反序列化事件内容
            EventContent content = mapper.readValue(decryptMessage, EventContent.class);

            // 3. 日志记录
            logger.info("收到事件推送 - type: {}, tenantId: {}, eventId: {}",
                        content.getType(), content.getTenantId(), content.getEventId());

            // 4. 幂等检查
            if (isAlreadyProcessed(content.getEventId())) {
                return "success";
            }

            // 5. 获取租户ID
            String tenantId = content.getTenantId();

            // 6. 事件分发处理
            switch (content.getType()) {
                case "YOUR_EVENT_TYPE":
                    this.{business}Service.handleEvent(content.getContent(), tenantId);
                    break;
                default:
                    logger.warn("未知事件类型: {}", content.getType());
            }

            // 7. 记录已处理事件
            markAsProcessed(content.getEventId());

            // 8. 返回 "success"
            return "success";

        } catch (Exception e) {
            // ✅ 异常捕获，返回 success 避免 BIP 重试
            logger.error("处理事件异常", e);
            return "success";
        }
    }

    private boolean isAlreadyProcessed(String eventId) {
        // 幂等检查逻辑
        return false;
    }

    private void markAsProcessed(String eventId) {
        // 记录已处理事件
    }
}
```

### 6.6 核心加密工具类

详见 [reference/BIPEventSubscribe.md](reference/BIPEventSubscribe.md)，包含：
- `EventCrypto` - 核心加解密类
- `PrivateAppCrypto` - 私有应用加密工具
- `SHA256` - 签名工具
- `PKCS7Encoder` - 填充编码
- `EventContent` - 事件内容DTO

### 6.7 关键规范

| 规范项 | 要求 |
|--------|------|
| **返回值** | 必须返回纯字符串 `"success"`，不能用JSON |
| **异常处理** | 捕获所有异常，返回 `"success"` 避免BIP重试 |
| **幂等处理** | 基于eventId做幂等检查 |
| **日志记录** | 必须记录事件类型、租户ID、事件ID |
| **配置注入** | AppKey/AppSecret必须从 `@Value` 注入 |
| **签名校验** | 必须校验HMAC-SHA256签名 |

详见 [reference/BIPEventSubscribe.md](reference/BIPEventSubscribe.md)

---

## 7. OpenAPI调用

### 7.1 获取Token

```java
@Component
public class AccessTokenUtils {

    public String getAccessToken(String openApiUrl, String appKey, String appSecret) throws Exception {
        Map<String, Object> params = new HashMap<>();
        params.put("appKey", appKey);
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        params.put("signature", SignHelper.sign(params, appSecret));

        String requestUrl = openApiUrl + "/open-auth/selfAppAuth/getAccessToken";
        JSONObject jsonObject = JSON.parseObject(HttpClient.get(requestUrl, params));

        return jsonObject.getJSONObject("data").getString("access_token");
    }
}
```

### 7.2 调用OpenAPI

```java
public static String postMethod(Map<String, Object> param, String requestUrl, String accessToken) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(param, headers);

    final String url = requestUrl + "?access_token=" + accessToken;
    RestTemplate restTemplate = new RestTemplate();
    restTemplate.getMessageConverters().set(1, new StringHttpMessageConverter(StandardCharsets.UTF_8));

    try {
        ResponseEntity<String> responseEntity = restTemplate.postForEntity(url, entity, String.class);
        return responseEntity.getBody();
    } catch (Exception e) {
        throw new RuntimeException("OpenAPI调用失败：" + e.getMessage());
    }
}
```

详见 [reference/OpenAPI.md](reference/OpenAPI.md)

---

## 8. 调度任务开发

> **⚠️ 重要**：调度任务开发必须严格遵循 `reference/DispatchTask.md` 规范，以下代码模板为标准示例。

### 8.1 创建调度任务Controller

```java
package com.yonyou.ypd.xxx.dispatch;

import com.alibaba.fastjson.JSONObject;
import com.yonyou.cloud.middleware.embed.proteus.client.utils.PropertyUtil;
import com.yonyou.iuap.bd.customerdoc.utils.AuthHttpClientUtils;
import iuap.yms.thread.api.YmsExecutors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;

@RestController
@RequestMapping("/dispatch/xxx")
public class XxxDispatchController {

    private static final Logger logger = LoggerFactory.getLogger(XxxDispatchController.class);

    /** BIP预警调度回调地址常量 */
    private static final String CALLBACK_URL = "/warning/warning/async/updateTaskLog";

    @Autowired
    private XxxService xxxService;

    @Autowired
    private AuthHttpClientUtils authHttpClientUtils;

    /** 使用BIP产品框架线程池（必须使用final） */
    private final ExecutorService ymsExecutor = YmsExecutors.getYmsExecutor();

    @PostMapping("/execute")
    public Object dispatch(HttpServletRequest request,
            @RequestBody(required = false) Map<String, Object> paramMap) {

        // 从request header获取日志ID
        String logId = Optional.ofNullable(request.getHeader("logId")).orElse("");
        String tenantId = Optional.ofNullable(request.getHeader("tenantId")).orElse("");

        logger.info("【任务名称】任务开始, logId={}, tenantId={}", logId, tenantId);

        Map<String, Object> retMap = new HashMap<>();

        // 使用BIP线程池异步执行
        ymsExecutor.execute(() -> {
            try {
                // 执行业务逻辑
                boolean success = xxxService.execute(paramMap);

                // 回调平台
                if (success) {
                    callbackPlatform(logId, 1, "执行成功");
                    logger.info("【任务名称】任务成功, logId={}", logId);
                } else {
                    callbackPlatform(logId, 0, "业务处理失败");
                    logger.warn("【任务名称】任务业务处理失败, logId={}", logId);
                }
            } catch (Exception e) {
                callbackPlatform(logId, 0, "执行异常: " + e.getMessage());
                logger.error("【任务名称】任务异常, logId={}", logId, e);
            }
        });

        // 立即返回异步标志
        retMap.put("asynchronized", "true");
        return retMap;
    }

    /**
     * 回调平台更新任务状态
     *
     * ⚠️ 必须使用 PropertyUtil.getPropertyByKey 获取域名
     * ⚠️ 必须使用 AuthHttpClientUtils.execPost 发送请求
     * ⚠️ 禁止使用 RestTemplate 发送回调
     */
    private void callbackPlatform(String logId, int status, String message) {
        if (logId == null || logId.isEmpty()) {
            logger.warn("【任务名称】logId为空，跳过回调");
            return;
        }

        JSONObject param = new JSONObject();
        param.put("status", status);    // 1=成功, 0=失败
        param.put("id", logId);
        param.put("msg", message);
        param.put("content", message);

        try {
            // 必须使用PropertyUtil.getPropertyByKey获取域名
            String domain = PropertyUtil.getPropertyByKey("domain.iuap-apcom-coderule");
            String url = domain + CALLBACK_URL;

            // 必须使用AuthHttpClientUtils发送回调
            authHttpClientUtils.execPost(url, null, null, param.toString());

            logger.info("【任务名称】回调成功, logId={}, status={}, message={}", logId, status, message);
        } catch (Exception e) {
            logger.error("【任务名称】回调失败, logId={}", logId, e);
        }
    }
}
```

### 8.2 配置调度任务

```
1. 系统管理 > 预警调度 > 调度类型：创建任务描述和接口地址
2. 系统管理 > 预警调度 > 调度任务：创建调度任务并配置定时规则
```

### 8.3 【调度任务代码检查清单 - 生成代码时必须逐项验证】

> **⚠️ 重要**：每次生成调度任务代码时，必须对照以下清单进行验证

| 检查项 | 检查内容 | 是否通过 |
|--------|---------|---------|
| **线程池** | 使用了 `YmsExecutors.getYmsExecutor()` | ☐ |
| **线程池变量** | 使用了 `final ExecutorService ymsExecutor` 成员变量 | ☐ |
| **Header获取** | 从 request header 获取了 `logId` 和 `tenantId` | ☐ |
| **回调调用** | 执行完成后调用了 `callbackPlatform(logId, status, message)` | ☐ |
| **返回标志** | 返回了 `{"asynchronized": "true"}` | ☐ |
| **回调域名** | callbackPlatform 使用了 `PropertyUtil.getPropertyByKey` 获取域名 | ☐ |
| **回调工具** | callbackPlatform 使用了 `AuthHttpClientUtils.execPost` 发送请求 | ☐ |
| **回调地址** | 使用了 `CALLBACK_URL` 常量拼接完整URL | ☐ |
| **异常处理** | 有完整的 try-catch 异常处理 | ☐ |
| **日志记录** | 有任务开始、执行成功、执行失败的日志 | ☐ |

### 8.4 【调度任务禁止项 - 绝对禁止】

| 禁止项 | 错误示例 | 正确示例 |
|--------|---------|---------|
| ❌ 禁止使用RestTemplate发送回调 | `restTemplate.postForEntity(...)` | `authHttpClientUtils.execPost(...)` |
| ❌ 禁止使用@Value注入回调域名 | `@Value("${callback.url}")` | `PropertyUtil.getPropertyByKey(...)` |
| ❌ 禁止硬编码回调URL | `"http://xxx.com/..."` | `domain + CALLBACK_URL` |
| ❌ 禁止使用new RestTemplate() | `new RestTemplate()` | 使用注入的authHttpClientUtils |
| ❌ 禁止省略回调 | 无callbackPlatform调用 | 必须调用 |
| ❌ 禁止同步执行 | 直接调用service方法 | 使用ymsExecutor.execute() |
| ❌ 禁止使用开源线程池 | `Executors.newFixedThreadPool()` | `YmsExecutors.getYmsExecutor()` |
| ❌ 禁止返回值缺少异步标志 | `return "success"` | `retMap.put("asynchronized", "true")` |

详见 [reference/DispatchTask.md](reference/DispatchTask.md)

---

## 9. 单据转换

### 9.1 调用单据转换规则

```java
@Autowired
private BusinessConvertService businessConvertService;

@Autowired
private YmsLockFactory ymsLockFactory;

public List<Map<String, Object>> convertBill(String sourceBillId) {
    ConvertParam convertParam = new ConvertParam();
    convertParam.setMakeBillRuleCode("单据转换规则编码");
    convertParam.setTenantId(AppContext.getTenantId().toString());
    convertParam.setDomain("领域编码");
    convertParam.setBillNum("上游业务对象编码");
    convertParam.setNeedQueryBill(true);

    List<String> sourceIds = new ArrayList<>();
    sourceIds.add(sourceBillId);
    convertParam.setSourceIds(sourceIds);

    // 查询规则
    DomainMakeBillRuleModel flowRules = businessConvertService.queryMakeBillRule(convertParam);

    // 执行转换
    ConvertResult convertResult = null;
    try {
        convertResult = businessConvertService.convert(convertParam, flowRules);
    } finally {
        // 解锁
        for (String lockKey : convertResult.getLockKeys()) {
            ymsLockFactory.getLock(lockKey).unLock();
        }
    }

    // 解析结果
    List<ConvertedBill> convertedBillList = (List<ConvertedBill>) convertResult.getConvertedBillList();
    return convertedBillList.stream()
        .map(ConvertedBill::getTargetData)
        .collect(Collectors.toList());
}
```

---

## 10. 特征操作

### 10.1 使用ElasticTool

```java
@Autowired
private ElasticTool elasticTool;

// 查询特征
List<ElasticTool.ElasticDTO> elasticDetails =
    ElasticTool.queryElasticDetails("schema名称", "业务对象URI");

// 更新特征
Map<String, Object> characterMap = new HashMap<>();
characterMap.put("特征编码", "特征值");
ElasticTool.updateFeatureWithQuery("schema名称", "业务对象URI", characterMap,
    billId, billCode, "code");

// 查询特征值
List<Map<String, Object>> featureData =
    ElasticTool.queryFeatureWithRel("schema名称", "业务对象URI",
        Arrays.asList(billId), null, "code", true);
```

---

## 11. 异常处理

### 11.1 抛出业务异常

```java
// 基础异常
throw new BusinessException("领域-500001", "业务错误信息");

// 带详细消息
throw new BusinessException("领域-500001", "订单处理失败",
    originalException, "订单号：" + orderNo);

// 带异常级别
throw new BusinessException("领域-500001", "警告信息",
    null, "详细信息", 1);  // 1=警告, 2=错误
```

### 11.2 异常编码规范

```
领域前缀-6位序号
```

| 序号范围 | 含义 |
|----------|------|
| 0xxxxx | DBException |
| 1xxxxx | FrameworkException |
| 2xxxxx | MiddlewareException |
| 5xxxxx-7xxxxx | 业务异常（不重试） |
| 8xxxxx | 业务异常（可重试） |

详见 [reference/BusinessException.md](reference/BusinessException.md)

---

## 最佳实践

1. **分层清晰**：Controller → Service → Repository
2. **表名规范**：IYmsJdbcApi 必须使用 `scheme.tableName`
3. **Schema导入**：必须使用 `org.imeta.orm.schema.*`
4. **异常处理**：明确编码、保留原始异常
5. **幂等设计**：事件监听必须实现幂等
6. **SQL注入防护**：使用 SQLParameter 参数绑定

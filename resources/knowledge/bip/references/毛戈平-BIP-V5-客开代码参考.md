# 毛戈平 BIP V5 客开代码参考

## 项目概览

- **项目**: 毛戈平供应链外部平台 (c-scm-xfp-mgpkk)
- **BIP 版本**: V5 (旗舰版)
- **JDK**: 1.8
- **父 POM**: `com.yonyou.ucf:c-scm-xfp-mgpkk:ddm-3.0-RELEASE`
- **核心功能**: BIP 与每刻(Maycur)、佳碟(JD)、巨益(Juyi)等外部系统的双向数据集成
- **业务范围**: 应付结算、付款单、收款单、资金付款、委外消耗、BOM变更、销售对照表等

---

## 架构分层

```
Controller (Controller)
    ↓
Service (Interface + Impl)
    ↓
YonbipUtil (BIP OpenAPI 调用中心)  /  IBillQueryRepository (BIP 查询)  /  IYmsJdbcApi (直接 SQL)
```

---

## 一、BIP OpenAPI 调用模板（最重要）

### 1.1 doPost 标准写法

来自 `YonbipUtil.java`，所有 BIP 平台 API 调用的核心方法：

```java
@Value("${yonbip.app_key}")
private String appKey;
@Value("${yonbip.app_secret}")
private String appSecret;
@Value("${yonbip.env}")
private String env;

private Object doPost(String url, Map<String, Object> reqBody) {
    HttpOptions httpOptions = new HttpOptions();
    httpOptions.setConnectionRequestTimeout(30000);
    httpOptions.setConnectionTimeout(30000);
    httpOptions.setSocketTimeout(180000);  // 长耗时操作需要 180s

    InputParam inputParam = InputParam.build()
            .setUrl(url)
            .setBody(reqBody)
            .setContentType(InputParam.CONTENT_TYPE_JSON)
            .setMethod(InputParam.METHOD_POST);

    OpenServiceBuilder openServiceBuilder = OpenServiceBuilder.build()
            .appKey(appKey)
            .appSecret(appSecret)
            .env(env)
            .inputParam(inputParam);

    Map<String, Object> result = Invoke.getResult(openServiceBuilder, inputParam);
    // 校验返回码
    if (!"200".equals(result.get("code"))) {
        throw new BusinessException(result.get("code").toString(),
                result.get("message").toString());
    }
    return result.get("data");
}
```

### 1.2 doGet 标准写法

```java
private Object doGet(String url) {
    InputParam inputParam = InputParam.build()
            .setUrl(url)
            .setMethod(InputParam.METHOD_GET);

    OpenServiceBuilder openServiceBuilder = OpenServiceBuilder.build()
            .appKey(appKey)
            .appSecret(appSecret)
            .env(env)
            .inputParam(inputParam);

    Map<String, Object> result = Invoke.getResult(openServiceBuilder, inputParam);
    if (!"200".equals(result.get("code"))) {
        throw new BusinessException(result.get("code").toString(),
                result.get("message").toString());
    }
    return result.get("data");
}
```

### 1.3 BIP API URL 命名规则

所有 BIP URL 遵循 `/yonbip/{模块}/{实体}/{动作}` 模式，定义在 `UrlConstant.java` 接口中：

```java
public interface UrlConstant {
    // FI-AP 应付
    String FI_PAYABLE_SAVE = "/yonbip/fi/ap/savePayable";
    String FI_PAYABLE_SUBMIT = "/yonbip/fi/ap/submitPayable";
    String FI_PAYABLE_AUDIT = "/yonbip/fi/ap/auditPayable";
    String FI_PAYABLE_DELETE = "/yonbip/fi/ap/deletePayable";

    // SD 销售
    String SD_SAVE_SALE_ORDER = "/yonbip/sd/salesorder/saveSaleOrder";
    String SD_BATCH_AUDIT_SALE_ORDER = "/yonbip/sd/salesorder/batchAuditSaleOrder";

    // SCM 供应链
    String SCM_OTHIN_SAVE = "/yonbip/scm/saveOthIn";
    String SCM_OTHIN_AUDIT = "/yonbip/scm/auditOthIn";
    // ...
}
```

---

## 二、IBillQueryRepository 查询模板

### 2.1 按条件查询

```java
@Autowired
private IBillQueryRepository billQueryRepository;

// 按编码查询实体 ID
public String queryBustypeByCode(String bustype) {
    QuerySchema querySchema = QuerySchema.create()
            .addSelect("id")
            .appendQueryCondition(
                QueryCondition.equalTo("code", bustype)
            );
    List<IBillDO> result = billQueryRepository.queryBySchema(
        "ti.transtype.TranstypeVO", querySchema);
    if (result.isEmpty()) {
        throw new BusinessException("交易类型编码不存在: " + bustype);
    }
    return result.get(0).getId();
}
```

### 2.2 按 ID 查详情

```java
IBillDO bill = billQueryRepository.findById("st.othinrecord.OthInRecord", id);
```

### 2.3 按外部单号查询

```java
QuerySchema querySchema = QuerySchema.create()
        .addSelect("id", "verifystate", "oriBalance")
        .appendQueryCondition(
            QueryCondition.equalTo("src_billno", externalBillNo)
        );
List<IBillDO> bills = billQueryRepository.queryBySchema(
    EntityUri.FIAP_APSURE_EVENT_URI, querySchema);
```

---

## 三、Entity / SuperDO 定义模板

```java
@YMSEntity(name = "WXTJCRZ.WXTJCRZ.extSysLog", domain = "c-scm-xfp-mgpkk")
public class ExtSysLog extends SuperDO implements ILogicDelete {

    public static final String ENTITY_NAME = "WXTJCRZ.WXTJCRZ.extSysLog";
    public static final String REQUEST_BODY = "requestBody";
    public static final String RESPONSE_BODY = "responseBody";

    private String requestBody;
    private String responseBody;
    private String errorLog;
    private String sendStatus;
    private Short dr;
    // ... 其他字段

    @Override
    public String getFullName() {
        if (fullName != null && fullName.contains("#PT#.")) {
            return fullName;
        }
        return ENTITY_NAME;
    }

    // getter/setter for each field...
}
```

**关键要点**:
- 必须 `extends SuperDO` + `implements ILogicDelete`
- `@YMSEntity` 声明表和 domain
- 每个字段定义 `public static final String` 常量（值 = DB 列名）
- 覆盖 `getFullName()` 处理并行表 `#PT#.` 场景
- `_status = "Insert"` / `_status = 2` 表示新增，`_status = 1` 表示修改

---

## 四、BIP bill/save 调用模板（自定义实体保存）

来自 `ExtSysLogServiceImpl`，用于保存自定义 YMS 实体：

```java
private Map<String, Object> saveBillByParam(ExtSysLog extSysLog) {
    String domainKey = "c-scm-xfp-mgpkk";
    String url = System.getProperty("domain.url") + "/"
            + domainKey
            + "/bill/save?cmdname=cmdSave&terminalType=1"
            + "&busiObj=d20139_extSysLog"
            + "&serviceCode=extSysLogPageList"
            + "&sbillno=extSysLogPageList";

    OkHttpClient okHttpClient = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build();

    RestTemplate restTemplate = new RestTemplate(
            new OkHttp3ClientHttpRequestFactory(okHttpClient));
    restTemplate.getMessageConverters().set(1,
            new StringHttpMessageConverter(StandardCharsets.UTF_8));

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON_UTF8);
    headers.set("Domain-Key", domainKey);

    Map<String, Object> body = new HashMap<>();
    body.put("data", extSysLog);

    HttpEntity<String> entity = new HttpEntity<>(
            objectMapper.writeValueAsString(body), headers);

    return restTemplate.postForObject(url, entity, Map.class);
}
```

---

## 五、BillPlugin 扩展模板

来自 `ComparisonPlugin.java`，在单据保存前执行校验：

```java
@BillPlugin(busiObj = "d20139_new_comparison")
public class ComparisonPlugin extends AbstractBillPlugin {

    @Autowired
    private ComparisonService comparisonService;

    @Override
    public void beforeSave(IBillContext context) {
        Map<String, Object> billData = context.getBillData();
        comparisonService.uniquenessCheck(billData);
    }
}
```

**可用钩子**: `beforeSave`, `afterSave`, `afterAudit` 等。

---

## 六、IYpdCommonRul 规则扩展模板

来自 `PayableAudit2MKRule.java`，审核后自动触发：

```java
public class PayableAudit2MKRule implements IYpdCommonRul {

    @Autowired
    private IPayablebillService payablebillService;

    @Override
    public void execute(IRuleContext context) {
        IBillDO billDO = context.getBillDO();
        YmsExecutors.getYmsExecutor().execute(() -> {
            // 异步轮询下游单据（最多30秒）
            IBillDO apEvent = pollForDownstreamBill(billDO.getId());
            if (apEvent != null) {
                payablebillService.handlePushPayable2mk(apEvent);
            }
        });
    }
}
```

---

## 七、BusinessConvertService 推单模板

从上游单据生成下游单据（如应付→付款）：

```java
@Autowired
private BusinessConvertService businessConvertService;

public Map<String, Object> savePaymentBySourceBill(String payableBillid) {
    // 1. 先查到下游单据 ID
    IBillDO apEvent = pollForApEvent(payableBillid, 30);

    // 2. 构建转换参数
    Map<String, Object> convertParams = new HashMap<>();
    convertParams.put("converterCode", "apPublicToPayment");
    convertParams.put("srcBillId", apEvent.getId());
    convertParams.put("targetBillType", "PAYMENT");
    convertParams.put("targetBillCode", "paymentCode");

    // 3. 执行转换
    Map<String, Object> result = businessConvertService.doConvert(convertParams);
    String paymentId = ((Map<String, Object>) result.get("data")).get("id").toString();

    // 4. 保存、提交、审核
    yonbipUtil.savePayment(buildPaymentData(paymentId));
    yonbipUtil.submitPayment(paymentId);
    yonbipUtil.auditPayment(paymentId);

    return result;
}
```

---

## 八、异步日志记录模板

先同步创建日志拿 ID，再异步更新结果：

```java
// 1. 同步创建日志
String logId = extSysLogUtils.createRequestLog(requestBody, billType, source, sendNo);

try {
    // 2. 执行业务
    Map<String, Object> result = yonbipUtil.savePayable(billData);
    // 3. 异步更新成功日志
    extSysLogUtils.updateSuccessLog(logId, result);
} catch (Exception e) {
    // 4. 异步更新失败日志
    extSysLogUtils.updateErrorLog(logId, e.getMessage());
    throw e;
}
```

---

## 九、直接 SQL 访问模板

当 BIP API 不满足需求时，使用 `IYmsJdbcApi` 直接执行 SQL：

```java
@Resource(name = "baseDAO")
private IYmsJdbcApi ymsJdbcApi;

// 查询单值
String sql = "SELECT id FROM some_table WHERE code = ?";
List<String> ids = ymsJdbcApi.queryForList(sql,
        new ColumnProcessor(), new SQLParameter(code));

// 查询多行 Map
List<Map<String, Object>> rows = ymsJdbcApi.queryForList(sql,
        new MapListProcessor(), params);

// 查询单列列表
List<String> columns = ymsJdbcApi.queryForList(sql,
        new ColumnListProcessor(), params);

// 执行 insert/update/delete
ymsJdbcApi.insert(entity);
ymsJdbcApi.delete(entity);
```

---

## 十、MyBatis 配置模板（与 BIP 共存）

```java
@Configuration
public class MyBatisConfig {

    @Bean(name = "publicSqlSessionFactory_mgp")  // 必须自定义名称避免冲突
    public SqlSessionFactoryBean createSqlSessionFactory(
            @Qualifier("mainDataSource") DataSource dataSource) throws Exception {
        SqlSessionFactoryBean bean = new SqlSessionFactoryBean();
        bean.setDataSource(dataSource);
        bean.setMapperLocations(
            new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/*.xml")
        );
        return bean;
    }
}
```

---

## 十一、Controller 标准写法

```java
@RestController
@RequestMapping("/efi/payable")
public class PayablebillController {

    @Autowired
    private IPayablebillService payablebillService;

    @PostMapping("/save")
    @ResponseBody
    public ResultMessageDTO save(@RequestBody Map<String, Object> data) {
        try {
            Map<String, Object> result = payablebillService.saveBill(data);
            return ResultMessageDTO.success(result);
        } catch (BusinessException e) {
            return ResultMessageDTO.error(e.getCode(), e.getMessage());
        }
    }
}
```

---

## 十二、外部系统 HTTP 调用模板

### 12.1 Hutool HttpRequest（每刻业务 API）

```java
public Map<String, Object> callBusinessApi(String apiPath, String jsonBody) {
    ensureValidToken();
    String result = HttpRequest.post(baseUrl + apiPath)
            .header("tokenId", tokenId)
            .header("entCode", entCode)
            .body(jsonBody)
            .execute()
            .body();
    // 解析返回...
}
```

### 12.2 HMAC-SHA256 签名（佳碟系统）

```java
private String generateSign(String requestBody, String timestamp, String nonce) {
    // 按 key 排序拼接: appId + body + timestamp + nonce
    TreeMap<String, String> sortedParams = new TreeMap<>();
    sortedParams.put("appId", appId);
    sortedParams.put("body", requestBody);
    sortedParams.put("timestamp", timestamp);
    sortedParams.put("nonce", nonce);

    StringBuilder sb = new StringBuilder();
    sortedParams.forEach((k, v) -> sb.append(v));
    return new HMac(HmacAlgorithm.HmacSHA256, appSecret.getBytes())
            .digestHex(sb.toString());
}
```

### 12.3 Token 缓存模式（每刻鉴权）

```java
private synchronized void ensureValidToken() {
    if (tokenId != null && System.currentTimeMillis() < tokenExpiryTime) {
        return;  // 缓存有效
    }
    // 重新获取 token
    String sign = DigestUtils.sha256Hex(appSecret + ":" + appCode + ":" + timestamp);
    String resp = sendPostRequest(baseUrl + "/api/openapi/auth/login",
            "{\"secret\":\"" + sign + "\",\"appCode\":\"" + appCode + "\",...}");
    // 解析 tokenId, entCode
    tokenExpiryTime = System.currentTimeMillis() + 30 * 60 * 1000;
}
```

---

## 十三、参数校验常用方法

### 13.1 交易类型编码→ID 翻译

```java
@Autowired
private ITransTypeService transtypeService;
String bustypeId = transtypeService.getTranstypeByCode(code).getId();
```

### 13.2 币种编码→ID 翻译

```java
@Autowired
private ITenantCurrencyService tenantCurrencyService;
String currencyId = tenantCurrencyService.getCurrencyByCode("RMB").getId();
```

### 13.3 物料编码查询

```java
@Autowired
private IProductServiceV2 productService;
ProductDTO product = productService.getProductByCode(materialCode);
```

### 13.4 自定义档案翻译

```java
// 按编码查
DefDoc doc = defDocService.getDefDocByCode("YSZZ", code);
// 按名称查
DefDoc doc = defDocService.getDefDocByName("YSZZ", name);
// 查整个列表
List<DefDoc> list = defDocListService.getDefDocListByCode("MDM007");
```

### 13.5 客户编码查询

```java
@Autowired
private IMerchantServiceV2 merchantService;
String customerId = merchantService.getMerchantByCode(customerCode).getId();
```

---

## 十四、核心业务模式

### 14.1 外部编码→BIP ID 对照表模式

所有外部系统编码都通过"对照表"翻译为 BIP 内部 ID。对照表数据模型：

- `对比字段` = 外部编码
- `目标字段` = BIP 内部 ID/编码
- `来源系统` = 佳碟/巨益/每刻
- `生效日期 / 失效日期` = 有效期控制
- `唯一性校验` = 来源系统 + 对照类型 + 外部编码 + 有效期不能重叠

### 14.2 三选逻辑（MGP343 部门分配）

在付款/应付/资金付款中反复出现：

1. 如果 `MGPMK018`（人员职级）有值 → 按职级查部门
2. 否则如果 `MGPMK015`（平台）有值 → 按平台查部门
3. 否则 → 使用 `承担部门`

### 14.3 保存→提交→审核→失败回滚

```java
try {
    yonbipUtil.savePayment(data);
    yonbipUtil.submitPayment(paymentId);
    yonbipUtil.auditPayment(paymentId);
} catch (Exception e) {
    // 回滚：取消提交 → 删除
    yonbipUtil.unSubmitPayment(paymentId);
    yonbipUtil.deletePayment(paymentId);
    throw e;
}
```

### 14.4 下游单据轮询模式

审核后有异步生成的下游单据，需要轮询等待：

```java
private IBillDO pollForDownstreamBill(String sourceBillId) {
    for (int i = 0; i < 30; i++) {
        QuerySchema qs = QuerySchema.create()
                .appendQueryCondition(QueryCondition.equalTo("src_billId", sourceBillId));
        List<IBillDO> result = billQueryRepository.queryBySchema(uri, qs);
        if (!result.isEmpty()) return result.get(0);
        Thread.sleep(1000);
    }
    throw new BusinessException("下游单据生成超时");
}
```

### 14.5 并发查询模式

```java
ExecutorService executor = Executors.newFixedThreadPool(5);
List<CompletableFuture<Map<String, Object>>> futures = new ArrayList<>();

for (Map<String, Object> item : list) {
    futures.add(CompletableFuture.supplyAsync(() -> {
        return yonbipUtil.detailFixedAsset(item.get("id").toString());
    }, executor));
}

CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
```

---

## 十五、配置属性清单

项目使用 `@Value` 注入外部化配置：

| 属性 | 用途 |
|------|------|
| `yonbip.app_key` | BIP OpenAPI AppKey |
| `yonbip.app_secret` | BIP OpenAPI AppSecret |
| `yonbip.env` | BIP 环境标识 |
| `mk.baseurl` | 每刻 API 地址 |
| `mk.appcode` | 每刻应用编码 |
| `mk.appsecret` | 每刻应用密钥 |
| `jd.appid` | 佳碟应用 ID |
| `jd.appsercet` | 佳碟应用密钥 |
| `jd.url` | 佳碟 API 地址 |
| `domain.url` | BIP 领域服务地址（System.getProperty） |

---

## 十六、常用注入组件速查

```java
// BIP 平台查询
@Autowired private IBillQueryRepository billQueryRepository;
// 直接 JDBC
@Resource(name = "baseDAO") private IYmsJdbcApi ymsJdbcApi;
// 异步执行
YmsExecutors.getYmsExecutor().execute(() -> { ... });
// 分布式锁
@Autowired private YmsLockFactory ymsLockFactory;
// 租户/用户上下文
InvocationInfoProxy.getTenantid();
InvocationInfoProxy.getUserid();
// 推单转换
@Autowired private BusinessConvertService businessConvertService;
// 交易类型
@Autowired private ITransTypeService transtypeService;
// 币种
@Autowired private ITenantCurrencyService tenantCurrencyService;
// 物料
@Autowired private IProductServiceV2 productService;
// 项目
@Autowired private IProjectService projectService;
// 客户
@Autowired private IMerchantServiceV2 merchantService;
// 自定义档案
@Autowired private DefDocListService defDocListService;
@Autowired private DefDocService defDocService;
// 组织
@Autowired private IOrgUnitQueryService orgUnitQueryService;
```

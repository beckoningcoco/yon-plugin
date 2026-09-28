# 总账集成公共规范

> **⚠️ 适用范围**：本文件适用于**所有总账集成场景**的共性能力
> **⚠️ 个性能力**：特定系统的个性化逻辑通过外部配置动态适配

---

## 1. 架构原则

### 1.1 MVC分层架构

```
Controller层（HTTP处理）
    ↓
Service层（业务逻辑 + 事务管理）
    ↓
Repository/API层（数据访问 + 外部调用）
```

**严格遵守：**
- Controller只处理HTTP请求/响应，不包含业务逻辑
- Service包含所有业务逻辑和事务管理
- Repository/API负责数据持久化和外部系统调用
- 禁止跨层调用

### 1.2 数据访问规范

**查询操作：**
```java
@Autowired
private IBillQueryRepository billQueryRepository;

// 查询凭证主数据
Map<String, Object> voucher = billQueryRepository.queryBillById("voucher_id");

// 查询凭证分录
List<Map<String, Object>> entries = billQueryRepository.queryBillEntries("voucher_id");
```

**更新操作：**
```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

// 更新凭证状态
String sql = "UPDATE voucher SET status = ? WHERE id = ?";
ymsJdbcApi.update(sql, "已推送", voucherId);
```

**⚠️ 禁止使用MyBatis直接操作数据库**

### 1.3 外部API调用规范

**使用BIP OpenAPI框架：**
```java
// 1. 获取access_token
String token = OpenApiUtil.getAccessToken(appKey, appSecret);

// 2. 构建请求
Map<String, Object> requestData = new HashMap<>();
requestData.put("voucherData", voucherJson);

// 3. 调用API
String response = OpenApiUtil.callApi(apiUrl, token, requestData);

// 4. 解析响应
JSONObject result = JSON.parseObject(response);
if ("200".equals(result.getString("code"))) {
    // 成功处理
} else {
    // 错误处理
}
```

---

## 2. 字段映射规范

### 2.1 科目映射

**映射表结构：**
| 源系统科目编码 | BIP科目编码 | 科目名称 | 余额方向 | 辅助核算配置 |
|--------------|------------|---------|---------|-------------|
| 1001 | 1001 | 库存现金 | 借 | 无 |
| 1122 | 1122 |应收账款 | 借 | 客户 |

**代码实现：**
```java
public class SubjectMappingService {
    
    private Map<String, SubjectMapping> mappingCache = new HashMap<>();
    
    /**
     * 加载科目映射表
     */
    public void loadMappings(String excelPath) {
        Workbook workbook = new XSSFWorkbook(new FileInputStream(excelPath));
        Sheet sheet = workbook.getSheetAt(0);
        
        for (Row row : sheet) {
            if (row.getRowNum() == 0) continue; // 跳过表头
            
            SubjectMapping mapping = new SubjectMapping();
            mapping.setSourceCode(getCellValue(row.getCell(0)));
            mapping.setBipCode(getCellValue(row.getCell(1)));
            mapping.setSubjectName(getCellValue(row.getCell(2)));
            mapping.setDirection(getCellValue(row.getCell(3)));
            mapping.setAuxiliaryConfig(getCellValue(row.getCell(4)));
            
            mappingCache.put(mapping.getSourceCode(), mapping);
        }
    }
    
    /**
     * 获取BIP科目编码
     */
    public String getBipSubjectCode(String sourceCode) {
        SubjectMapping mapping = mappingCache.get(sourceCode);
        return mapping != null ? mapping.getBipCode() : sourceCode;
    }
    
    /**
     * 获取科目方向
     */
    public String getSubjectDirection(String sourceCode) {
        SubjectMapping mapping = mappingCache.get(sourceCode);
        return mapping != null ? mapping.getDirection() : "借";
    }
}
```

### 2.2 辅助核算映射

**支持的辅助核算类型：**
- 客户（customer）
- 供应商（supplier）
- 部门（department）
- 项目（project）
- 人员（person）
- 自定义档案（custom）

**映射逻辑：**
```java
public class AuxiliaryMappingService {
    
    /**
     * 转换辅助核算
     */
    public List<Map<String, Object>> convertAuxiliary(
            String sourceAuxCode, 
            String auxType,
            SubjectMapping subjectMapping) {
        
        List<Map<String, Object>> auxiliaryList = new ArrayList<>();
        
        // 根据科目配置判断是否需要辅助核算
        if (subjectMapping.getAuxiliaryConfig().contains(auxType)) {
            Map<String, Object> auxiliary = new HashMap<>();
            auxiliary.put("filedCode", getAuxiliaryFieldCode(auxType));
            auxiliary.put("valueCode", convertAuxiliaryCode(sourceAuxCode, auxType));
            auxiliaryList.add(auxiliary);
        }
        
        return auxiliaryList;
    }
    
    /**
     * 获取辅助核算档案编码
     */
    private String getAuxiliaryFieldCode(String auxType) {
        Map<String, String> fieldCodeMap = new HashMap<>();
        fieldCodeMap.put("customer", "bd_customer");
        fieldCodeMap.put("supplier", "bd_supplier");
        fieldCodeMap.put("department", "org_dept");
        fieldCodeMap.put("project", "bd_project");
        return fieldCodeMap.get(auxType);
    }
    
    /**
     * 转换辅助核算编码
     */
    private String convertAuxiliaryCode(String sourceCode, String auxType) {
        // 从映射表中查询
        return queryMappingTable(sourceCode, auxType);
    }
}
```

### 2.3 用户映射

**映射表结构：**
| 源系统用户名 | BIP用户编码 | 手机号 | 邮箱 |
|------------|-----------|-------|------|
| zhangsan | zhangsan | 13800138000 | zhangsan@example.com |

**代码实现：**
```java
public class UserMappingService {
    
    private Map<String, UserMapping> userCache = new HashMap<>();
    
    /**
     * 获取用户手机号和邮箱
     */
    public UserInfo getUserInfo(String sourceUserName) {
        UserMapping mapping = userCache.get(sourceUserName);
        if (mapping != null) {
            UserInfo info = new UserInfo();
            info.setMobile(mapping.getMobile());
            info.setEmail(mapping.getEmail());
            return info;
        }
        return null;
    }
}
```

---

## 3. 数据转换规范

### 3.1 日期格式转换

```java
public class DateConverter {
    
    private static final String BIP_DATE_FORMAT = "yyyy-MM-dd";
    private static final String BIP_DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";
    
    /**
     * 转换为BIP日期格式
     */
    public static String convertToBipDate(Date date) {
        SimpleDateFormat sdf = new SimpleDateFormat(BIP_DATE_FORMAT);
        return sdf.format(date);
    }
    
    /**
     * 转换为BIP日期时间格式
     */
    public static String convertToBipDateTime(Date date) {
        SimpleDateFormat sdf = new SimpleDateFormat(BIP_DATETIME_FORMAT);
        return sdf.format(date);
    }
}
```

### 3.2 金额格式转换

```java
public class AmountConverter {
    
    /**
     * 转换借贷方向金额
     */
    public static Map<String, BigDecimal> convertAmount(
            BigDecimal amount, 
            String direction) {
        
        Map<String, BigDecimal> result = new HashMap<>();
        
        if ("借".equals(direction) || "D".equals(direction)) {
            result.put("debitAmount", amount);
            result.put("creditAmount", BigDecimal.ZERO);
        } else {
            result.put("debitAmount", BigDecimal.ZERO);
            result.put("creditAmount", amount);
        }
        
        return result;
    }
    
    /**
     * 校验借贷平衡
     */
    public static boolean validateBalance(List<Map<String, Object>> entries) {
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        
        for (Map<String, Object> entry : entries) {
            totalDebit = totalDebit.add((BigDecimal) entry.get("debitAmount"));
            totalCredit = totalCredit.add((BigDecimal) entry.get("creditAmount"));
        }
        
        return totalDebit.compareTo(totalCredit) == 0;
    }
}
```

### 3.3 币种转换

```java
public class CurrencyConverter {
    
    private static final Map<String, String> CURRENCY_MAP = new HashMap<>();
    
    static {
        CURRENCY_MAP.put("CNY", "CNY"); // 人民币
        CURRENCY_MAP.put("USD", "USD"); // 美元
        CURRENCY_MAP.put("EUR", "EUR"); // 欧元
        CURRENCY_MAP.put("RMB", "CNY"); // RMB → CNY
    }
    
    /**
     * 转换币种编码
     */
    public static String convertCurrency(String sourceCurrency) {
        return CURRENCY_MAP.getOrDefault(sourceCurrency, "CNY");
    }
}
```

---

## 4. Excel处理规范

### 4.1 Excel读取

```java
public class ExcelReader {
    
    /**
     * 读取Excel文件
     */
    public static List<Map<String, Object>> readExcel(
            String filePath, 
            int startRow,
            List<String> columnNames) throws Exception {
        
        List<Map<String, Object>> dataList = new ArrayList<>();
        
        FileInputStream inputStream = new FileInputStream(new File(filePath));
        Workbook workbook = new XSSFWorkbook(inputStream);
        Sheet sheet = workbook.getSheetAt(0);
        
        for (Row row : sheet) {
            if (row.getRowNum() < startRow) continue;
            
            Map<String, Object> rowData = new HashMap<>();
            for (int i = 0; i < columnNames.size(); i++) {
                Cell cell = row.getCell(i);
                rowData.put(columnNames.get(i), getCellValue(cell));
            }
            dataList.add(rowData);
        }
        
        workbook.close();
        inputStream.close();
        
        return dataList;
    }
    
    /**
     * 获取单元格值
     */
    private static String getCellValue(Cell cell) {
        if (cell == null) return "";
        
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return new SimpleDateFormat("yyyy-MM-dd").format(cell.getDateCellValue());
                } else {
                    return String.valueOf(cell.getNumericCellValue());
                }
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                return cell.getCellFormula();
            default:
                return "";
        }
    }
}
```

### 4.2 Excel写入

```java
public class ExcelWriter {
    
    /**
     * 写入Excel文件
     */
    public static void writeExcel(
            String filePath,
            List<String> headers,
            List<List<Object>> dataRows) throws Exception {
        
        Workbook workbook = new XSSFWorkbook();
        Sheet sheet = workbook.createSheet("Sheet1");
        
        // 写入表头
        Row headerRow = sheet.createRow(0);
        for (int i = 0; i < headers.size(); i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(headers.get(i));
        }
        
        // 写入数据
        for (int i = 0; i < dataRows.size(); i++) {
            Row dataRow = sheet.createRow(i + 1);
            List<Object> rowData = dataRows.get(i);
            for (int j = 0; j < rowData.size(); j++) {
                Cell cell = dataRow.createCell(j);
                Object value = rowData.get(j);
                if (value instanceof String) {
                    cell.setCellValue((String) value);
                } else if (value instanceof Number) {
                    cell.setCellValue(((Number) value).doubleValue());
                } else if (value instanceof Date) {
                    cell.setCellValue((Date) value);
                }
            }
        }
        
        // 保存文件
        FileOutputStream outputStream = new FileOutputStream(new File(filePath));
        workbook.write(outputStream);
        workbook.close();
        outputStream.close();
    }
}
```

---

## 5. 错误处理规范

### 5.1 异常分类

```java
public class IntegrationException extends RuntimeException {
    
    private String errorCode;
    private String errorMessage;
    
    public IntegrationException(String errorCode, String errorMessage) {
        super(errorMessage);
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }
    
    // 数据验证异常
    public static IntegrationException validationError(String message) {
        return new IntegrationException("VALIDATION_ERROR", message);
    }
    
    // 数据映射异常
    public static IntegrationException mappingError(String message) {
        return new IntegrationException("MAPPING_ERROR", message);
    }
    
    // API调用异常
    public static IntegrationException apiError(String message) {
        return new IntegrationException("API_ERROR", message);
    }
    
    // 数据转换异常
    public static IntegrationException conversionError(String message) {
        return new IntegrationException("CONVERSION_ERROR", message);
    }
}
```

### 5.2 错误处理流程

```java
public class ErrorHandler {
    
    /**
     * 处理集成错误
     */
    public static void handleError(Exception e, String voucherId) {
        // 记录错误日志
        logger.error("凭证集成失败，凭证ID: {}, 错误信息: {}", voucherId, e.getMessage(), e);
        
        // 更新凭证状态
        updateVoucherStatus(voucherId, "集成失败", e.getMessage());
        
        // 发送告警通知（可选）
        sendAlertNotification(voucherId, e.getMessage());
    }
    
    /**
     * 更新凭证状态
     */
    private static void updateVoucherStatus(String voucherId, String status, String errorMsg) {
        String sql = "UPDATE voucher SET status = ?, error_msg = ?, update_time = ? WHERE id = ?";
        ymsJdbcApi.update(sql, status, errorMsg, new Date(), voucherId);
    }
}
```

---

## 6. 日志规范

### 6.1 日志级别

```java
public class IntegrationLogger {
    
    private static final Logger logger = LoggerFactory.getLogger(IntegrationLogger.class);
    
    /**
     * 记录开始日志
     */
    public static void logStart(String operation, String voucherId) {
        logger.info("[{}] 开始处理，凭证ID: {}", operation, voucherId);
    }
    
    /**
     * 记录成功日志
     */
    public static void logSuccess(String operation, String voucherId, long duration) {
        logger.info("[{}] 处理成功，凭证ID: {}, 耗时: {}ms", operation, voucherId, duration);
    }
    
    /**
     * 记录失败日志
     */
    public static void logError(String operation, String voucherId, Exception e) {
        logger.error("[{}] 处理失败，凭证ID: {}, 错误: {}", operation, voucherId, e.getMessage(), e);
    }
    
    /**
     * 记录调试日志
     */
    public static void logDebug(String operation, String message) {
        logger.debug("[{}] {}", operation, message);
    }
}
```

---

## 7. 性能优化规范

### 7.1 批量处理

```java
public class BatchProcessor {
    
    private static final int BATCH_SIZE = 100;
    
    /**
     * 批量处理凭证
     */
    public static void processBatch(List<String> voucherIds) {
        // 分批处理
        for (int i = 0; i < voucherIds.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, voucherIds.size());
            List<String> batch = voucherIds.subList(i, end);
            
            // 批量查询
            List<Map<String, Object>> vouchers = batchQueryVouchers(batch);
            
            // 批量转换
            List<Map<String, Object>> convertedData = batchConvert(vouchers);
            
            // 批量推送
            batchPush(convertedData);
        }
    }
}
```

### 7.2 缓存策略

```java
public class MappingCache {
    
    private static final Map<String, Object> CACHE = new ConcurrentHashMap<>();
    private static final long CACHE_EXPIRE_TIME = 3600000; // 1小时
    
    /**
     * 获取缓存
     */
    public static Object get(String key) {
        CacheEntry entry = (CacheEntry) CACHE.get(key);
        if (entry != null && !entry.isExpired()) {
            return entry.getValue();
        }
        return null;
    }
    
    /**
     * 设置缓存
     */
    public static void put(String key, Object value) {
        CACHE.put(key, new CacheEntry(value, System.currentTimeMillis() + CACHE_EXPIRE_TIME));
    }
    
    static class CacheEntry {
        private Object value;
        private long expireTime;
        
        public CacheEntry(Object value, long expireTime) {
            this.value = value;
            this.expireTime = expireTime;
        }
        
        public boolean isExpired() {
            return System.currentTimeMillis() > expireTime;
        }
        
        public Object getValue() {
            return value;
        }
    }
}
```

---

## 8. 测试规范

### 8.1 单元测试

```java
@RunWith(SpringRunner.class)
@SpringBootTest
public class VoucherIntegrationTest {
    
    @Autowired
    private VoucherPushService voucherPushService;
    
    @Test
    public void testVoucherPush() {
        // 准备测试数据
        List<String> voucherIds = Arrays.asList("voucher_001", "voucher_002");
        
        // 执行推送
        VoucherResult result = voucherPushService.push(voucherIds);
        
        // 验证结果
        Assert.assertEquals("200", result.getSuccessCode());
        Assert.assertEquals(2, result.getSuccessCount());
    }
    
    @Test
    public void testSubjectMapping() {
        // 测试科目映射
        SubjectMappingService service = new SubjectMappingService();
        service.loadMappings("test_subject_mapping.xlsx");
        
        String bipCode = service.getBipSubjectCode("1001");
        Assert.assertEquals("1001", bipCode);
    }
}
```

---

## 9. 配置管理规范

### 9.1 配置文件结构

```properties
# BIP API配置
bip.api.baseUrl=https://api.yonyoucloud.com
bip.api.appKey=your_app_key
bip.api.appSecret=your_app_secret

# 第三方系统配置
third.party.api.url=https://third-party-api.com
third.party.api.username=username
third.party.api.password=password

# 映射文件路径
mapping.subject.file=/config/subject_mapping.xlsx
mapping.auxiliary.file=/config/auxiliary_mapping.xlsx
mapping.user.file=/config/user_mapping.xlsx

# 批处理配置
batch.size=100
batch.thread.pool.size=10

# 缓存配置
cache.expire.time=3600000
```

### 9.2 配置加载

```java
@Configuration
@ConfigurationProperties(prefix = "bip.api")
public class BipApiConfig {
    
    private String baseUrl;
    private String appKey;
    private String appSecret;
    
    // Getters and Setters
}
```

---

## 10. 检查清单

- [ ] 严格遵守MVC分层架构
- [ ] 使用IBillQueryRepository进行查询
- [ ] 使用IYmsJdbcApi进行更新
- [ ] 禁止使用MyBatis直接操作数据库
- [ ] 使用BIP OpenAPI框架调用外部接口
- [ ] 实现完整的字段映射逻辑
- [ ] 实现数据转换和校验
- [ ] 实现错误处理和日志记录
- [ ] 实现批量处理和缓存优化
- [ ] 编写单元测试
- [ ] 配置文件管理规范

# 特征字段翻译

## 概述

本文档定义 BIP 销售发票特征字段的翻译规则。特征字段需要根据不同的类型进行翻译转换。

## ⚠️ 核心原则：动态识别而非硬编码

**特征字段编码是实施人员自定义的，必须从Excel动态读取，不能硬编码**

### 识别流程

```
1. 读取Excel字段映射表
   └─→ 读取"BIP字段类型"列

2. 根据字段类型识别特征翻译方式
   ├─→ 类型包含"特征-员工档案" → 参照翻译（调用元数据+IBillQueryRepository）
   ├─→ 类型包含"特征-枚举" → 枚举翻译
   ├─→ 类型包含"特征-自定义档案" → 自定义档案翻译
   └─→ 类型包含"布尔" → 布尔转换
```

## ⚠️ 重要：技能调用链（必须理解）

当特征字段识别为**参照类型**时��必须按以下顺序调用技能进行翻译：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    参照类型特征翻译完整流程                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Step 1: 调用 iuap-c-metadata-info 技能获取业务对象 fullName         │
│  └─→ 技能参数：allbillname="人员" 或 "员工档案"                      │
│  └─→ 返回值：fullName，例如 "org.staff.Staff"                       │
│                                                                      │
│  Step 2: 使用 IBillQueryRepository 查询档案信息                      │
│  └─→ 注入：@Autowired private IBillQueryRepository repository       │
│  └─→ 调用：repository.findById(fullName, id, 0)                    │
│  └─→ 返回：IBillDO 对象                                              │
│                                                                      │
│  Step 3: 从 IBillDO 获取档案名称                                      │
│  └─→ 调用：staffDO.getString("name")                               │
│  └─→ 返回：员工名称（如 "张三"）                                     │
│                                                                      │
│  Step 4: 将员工名称设置到三方请求实体                                 │
│  └─→ request.setPayee(staffName);                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**⚠️ 重要说明：**
- **发票数据** → 必须用 BIP OpenAPI（禁止直接查DB）
- **档案数据（员工/枚举/自定义档案）** → 用 IBillQueryRepository/SQL（这是翻译流程）

## 特征类型识别与翻译方式（完整矩阵）

**以下关键词不区分大小写，模糊匹配：**

| Excel字段类型列描述 | 翻译类型 | 翻译方式 | 输出格式 | 必需技能调用 |
|-------------------|---------|----------|---------|-------------|
| **员工档案** / **人员** / **员工** / **参照** | **参照翻译** | **iuap-c-metadata-info + IBillQueryRepository** | **名称文本** | **必须** |
| **枚举** / **枚举类型** / **枚举档案** | 枚举翻译 | 查询枚举定义表 | 名称文本 | 无需 |
| **自定义档案** / **自定义档案类型** | 自定义档案翻译 | 查询自定义档案表 | 编码或名称 | 无需 |
| **布尔** / **boolean** / **是/否** | 布尔转换 | 直接转换 | 0/1 | 无需 |
| **文本** / **字符** / **字符串** / **日期** | 直接取值 | 直接取值 | 原值 | 无需 |
| **客户** / **供应商** / **物料** / **商品** / **项目** / **组织** | **参照翻译** | **iuap-c-metadata-info + IBillQueryRepository** | **名称文本** | **必须** |

## ⚠️ 员工档案翻译（参照类型 - 重点）

**当Excel"字段类型"包含"员工档案"时，必须按以下完整流程执行**

### Step 1：调用 iuap-c-metadata-info 技能获取 fullName

```
技能名称：iuap-c-metadata-info
技能参数：
  - allbillname: "人员" 或 "员工档案"（根据业务场景选择）
  - isSQL: Y（需要查询 referenceStructure）

预期返回：
  - fullName: "org.staff.Staff"（员工档案的 fullName）
```

**示例调用方式**：
```
使用 Skill 工具调用：iuap-c-metadata-info
传入参数：销售发票集成-员工档案
技能会返回员工档案的 fullName，如 "org.staff.Staff"
```

### Step 2：使用 IBillQueryRepository 查询员工信息

```java
// 注入 IBillQueryRepository（来自 iuap-c-server-codegen 技能）
@Autowired
private IBillQueryRepository iBillQueryRepository;

// 员工档案 fullName（从 Step 1 获取）
private String staffFullName = "org.staff.Staff";  // 动态获取，非硬编码

/**
 * 翻译员工档案特征字段
 * @param staffId 员工ID（从 BIP 特征组获取）
 * @param staffFullName 员工档案 fullName（从 iuap-c-metadata-info 获取）
 * @return 员工名称
 */
public String transStaff(String staffId, String staffFullName) {
    if (staffId == null || staffId.isEmpty()) {
        return null;
    }

    try {
        // 使用 IBillQueryRepository.findById() 查询员工档案
        // 参数1: fullName - 员工档案的 fullName（来自元数据技能）
        // 参数2: id - 员工ID
        // 参数3: 0 - 预留参数
        IBillDO staffDO = iBillQueryRepository.findById(staffFullName, staffId, 0);

        if (staffDO == null) {
            log.warn("未找到员工档案, staffId={}", staffId);
            return null;
        }

        // 获取员工名称（name 字段）
        String name = staffDO.getString("name");

        // 返回员工名称（三方系统通常只需要名称）
        return name;

    } catch (Exception e) {
        log.warn("员工档案翻译失败, staffId={}", staffId, e);
        return null;
    }
}
```

### Step 3：补充翻译方法（使用IYmsJdbcApi，防止SQL注入）

```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

/**
 * 客户编码翻译（根据ID列表翻译为编码）
 * @param merchantList 客户ID列表
 * @return id → code 映射
 */
public Map<String, String> transMerchantCode4IdList(List<String> merchantList) {
    if (CollectionUtils.isEmpty(merchantList)) {
        return new HashMap<>();
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT id, code FROM {schema}.merchant ");
    sql.append(" WHERE ytenant_id = ? AND id IN ( ");
    for (int i = 0; i < merchantList.size(); i++) {
        sql.append(i > 0 ? ",?" : "?");
    }
    sql.append(" ) ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    for (String id : merchantList) {
        parameter.addParam(id);
    }

    List<Map> resultList = ymsJdbcApi.queryForDTOList(sql.toString(), parameter, Map.class);

    if (CollectionUtils.isNotEmpty(resultList)) {
        return resultList.stream().collect(
                Collectors.toMap(
                        map -> (String) map.get("id"),
                        map -> (String) map.get("code")
                )
        );
    }
    return new HashMap<>();
}

/**
 * 组织翻译（根据编码列表翻译为ID）
 * @param orgList 组织编码列表
 * @return code → id 映射
 */
public Map<String, String> transOrgList(List<String> orgList) {
    if (CollectionUtils.isEmpty(orgList)) {
        return new HashMap<>();
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT code, id FROM org_orgs ");
    sql.append(" WHERE ytenant_id = ? AND code IN ( ");
    for (int i = 0; i < orgList.size(); i++) {
        sql.append(i > 0 ? ",?" : "?");
    }
    sql.append(" ) ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    for (String code : orgList) {
        parameter.addParam(code);
    }

    List<Map> resultList = ymsJdbcApi.queryForDTOList(sql.toString(), parameter, Map.class);

    if (CollectionUtils.isNotEmpty(resultList)) {
        return resultList.stream().collect(
                Collectors.toMap(
                        map -> (String) map.get("code"),
                        map -> (String) map.get("id")
                )
        );
    }
    return new HashMap<>();
}
```

## 枚举翻译（enum类型）

### ⚠️ 必须使用InvocationInfoProxy获取租户ID + 使用参数化查询防止SQL注入

**在枚举翻译中，必须使用`InvocationInfoProxy.getTenantid()`获取租户ID，不能硬编码！**

**⚠️ 必须使用IYmsJdbcApi + SQLParameter参数化查询，禁止字符串拼接！**

### 动态翻译方法

```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

/**
 * 获取枚举档案
 * 根据枚举类型和枚举的编码进行查询，组装成一个map结构
 * @param enumType 枚举类型编码
 * @param enumCodes 枚举编码列表
 * @return code → name 的映射
 */
public Map<String, String> transCustEnumCodeList(String enumType, List<String> enumCodes) {
    if (CollectionUtils.isEmpty(enumCodes)) {
        return new HashMap<>();
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT enum.code AS enum_code, enum.name AS enum_name ");
    sql.append(" FROM bd_cust_enum_def def ");
    sql.append(" INNER JOIN bd_cust_enum enum ON def.id = enum.custenumdefid ");
    sql.append(" WHERE def.ytenant_id = ? AND def.code = ? ");
    sql.append(" AND enum.ytenant_id = ? AND enum.`enable` = 1 ");
    sql.append(" AND enum.code IN ( ");
    for (int i = 0; i < enumCodes.size(); i++) {
        sql.append(i > 0 ? ",?" : "?");
    }
    sql.append(" ) ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    parameter.addParam(enumType);
    parameter.addParam(tenantid);
    for (String code : enumCodes) {
        parameter.addParam(code);
    }

    List<Map> resultList = ymsJdbcApi.queryForDTOList(sql.toString(), parameter, Map.class);

    if (CollectionUtils.isNotEmpty(resultList)) {
        return resultList.stream().collect(
                Collectors.toMap(
                        map -> (String) map.get("enum_code"),
                        map -> (String) map.get("enum_name")
                )
        );
    }
    return new HashMap<>();
}
```

## 自定义档案翻译（custom类型）

### ⚠️ 必须使用IYmsJdbcApi + SQLParameter参数化查询，防止SQL注入

```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

/**
 * 获取自定义档案
 * 根据自定义档案类型和自定义档案的编码进行查询，组装成一个map结构
 * @param docType 自定义档案类型编码
 * @param docIds 自定义档案ID列表
 * @return id → code 的映射
 */
public Map<String, String> transCustDocCodeList(String docType, List<String> docIds) {
    if (CollectionUtils.isEmpty(docIds)) {
        return new HashMap<>();
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT t0.id AS doc_id, t0.code AS doc_code, t0.name AS doc_name ");
    sql.append(" FROM bd_cust_doc_def AS t3 ");
    sql.append(" LEFT JOIN bd_cust_doc t0 ON t3.id = t0.custdocdefid ");
    sql.append(" WHERE t3.ytenant_id = ? AND t0.ytenant_id = ? ");
    sql.append(" AND t0.dr IN (0, 2) AND t3.code = ? ");
    sql.append(" AND t0.id IN ( ");
    for (int i = 0; i < docIds.size(); i++) {
        sql.append(i > 0 ? ",?" : "?");
    }
    sql.append(" ) ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    parameter.addParam(tenantid);
    parameter.addParam(docType);
    for (String id : docIds) {
        parameter.addParam(id);
    }

    List<Map> resultList = ymsJdbcApi.queryForDTOList(sql.toString(), parameter, Map.class);

    if (CollectionUtils.isNotEmpty(resultList)) {
        return resultList.stream().collect(
                Collectors.toMap(
                        map -> (String) map.get("doc_id"),
                        map -> (String) map.get("doc_code")
                )
        );
    }
    return new HashMap<>();
}
```

## 布尔值翻译

```java
/**
 * 翻译布尔特征字段
 * @param boolValue 布尔值
 */
public String transBoolean(String boolValue) {
    if (boolValue == null) {
        return "0";
    }
    return ("true".equalsIgnoreCase(boolValue) ||
            "Y".equalsIgnoreCase(boolValue) ||
            "是".equals(boolValue)) ? "1" : "0";
}

// 银行备注特殊处理（是→3，否→0）
public String transBankRemark(String boolValue) {
    return ("true".equalsIgnoreCase(boolValue) ||
            "Y".equalsIgnoreCase(boolValue) ||
            "是".equals(boolValue)) ? "3" : "0";
}
```

## 动态配置模型

```java
/**
 * 特征字段配置（从Excel动态读取）
 */
@Data
public class FeatureConfig {
    /** 字段编码（实施人员自定义） */
    private String fieldCode;

    /** 字段类型（用于选择翻译方式） */
    private String fieldType;

    /** 目标三方字段 */
    private String targetField;

    /** 枚举类型编码（枚举类型时使用） */
    private String enumType;

    /** 翻译方式 */
    public String getTranslateType() {
        if (fieldType.contains("员工档案")) return "ref";
        if (fieldType.contains("枚举")) return "enum";
        if (fieldType.contains("自定义档案")) return "custom";
        if (fieldType.contains("布尔")) return "boolean";
        return "direct";
    }
}
```

## 翻译处理流程（完整版）

```
┌─────────────────────────────────────────────────────────────────┐
│                    特征字段翻译完整流程                           │
├─────────────────────────────────────────────────────────────────┤
│  1. 读取Excel字段映射表                                          │
│     ├─→ 读取"BIP字段类型"列（识别特征类型）                      │
│     └─→ 读取"BIP字段编码"列（动态编码）                         │
│                                                                 │
│  2. 动态构建特征配置                                              │
│     FeatureConfig config = new FeatureConfig(                   │
│         fieldCode,     // "实施自定义编码"                       │
│         fieldType,     // "特征-员工档案"                        │
│         targetField    // "payee"                               │
│     );                                                          │
│                                                                 │
│  3. 从BIP数据中获取特征组                                        │
│     JSONObject character = bipData.getJSONObject(                │
│         "saleInvoiceDefineCharacter");                           │
│                                                                 │
│  4. 根据字段类型选择翻译方式                                      │
│     ├─→ 包含"员工档案"                                          │
│     │   ├─→ 通过元数据查询获取 fullName            │
│     │   ├─→ 使用 IBillQueryRepository.findById()              │
│     │   └─→ 返回 name                                          │
│     │                                                          │
│     ├─→ 包含"枚举"                                              │
│     │   └─→ 查询 bd_cust_enum_def/enum                        │
│     │       → 返回 name                                         │
│     │                                                          │
│     ├─→ 包含"自定义档案"                                        │
│     │   └─→ 查询 bd_cust_doc_def/doc                         │
│     │       → 返回 code                                         │
│     │                                                          │
│     └─→ 布尔                                                   │
│         └─→ 转换为 0/1 或 0/3                                   │
│                                                                 │
│  5. 将翻译结果填充到三方实体                                      │
│     request.setPayee(translatedValue);                          │
└─────────────────────────────────────────────────────────────────┘
```

## ⚠️ 关键检查项

### 动态识别检查

- [ ] 已从Excel"字段类型"列识别特征字段类型（而非字段编码）
- [ ] 已动态读取"BIP字段编码"（未硬编码）

### 员工档案翻译检查（参照类型）

- [ ] 已识别字段类型包含"员工档案"
- [ ] **已通过元数据查询获取员工档案 fullName**
- [ ] **已注入 IBillQueryRepository**
- [ ] **已使用 IBillQueryRepository.findById() 查询**
- [ ] 已返回员工名称（name）而非ID
- [ ] **生成的代码中无 // TODO**

### 枚举翻译检查

- [ ] 已从Excel获取枚举类型编码
- [ ] 已查询 bd_cust_enum_def 和 bd_cust_enum 表
- [ ] 已返回枚举名称而非编码
- [ ] **已使用参数化查询（防止SQL注入）**
- [ ] **已使用 InvocationInfoProxy.getTenantid()**
- [ ] **生成的代码中无 // TODO**

### 自定义档案翻译检查

- [ ] 已从Excel获取自定义档案类型编码
- [ ] 已查询 bd_cust_doc_def 和 bd_cust_doc 表
- [ ] **已使用参数化查询（防止SQL注入）**
- [ ] **已使用 InvocationInfoProxy.getTenantid()**
- [ ] **生成的代码中无 // TODO**

## ⚠️ 完整代码模板（直接复制使用）

### 参照翻译模板

```java
@Autowired
private IBillQueryRepository iBillQueryRepository;

/**
 * 参照翻译：员工档案
 * @param staffId 员工ID（从BIP特征组获取）
 * @return 员工名称
 */
public String transStaff(String staffId) {
    if (staffId == null || staffId.isEmpty()) {
        return null;
    }

    // 通过元数据查询获取 fullName
    // 技能参数：allbillname="人员"
    String staffFullName = "org.staff.Staff"; // 实际调用技能获取

    try {
        IBillDO staffDO = iBillQueryRepository.findById(staffFullName, staffId, 0);
        if (staffDO == null) {
            return null;
        }
        return staffDO.getString("name");
    } catch (Exception e) {
        return null;
    }
}
```

### 枚举翻译模板

```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

public String transEnum(String enumType, String enumCode) {
    if (enumType == null || enumCode == null) {
        return null;
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT enum.name AS enum_name ");
    sql.append(" FROM bd_cust_enum_def def ");
    sql.append(" INNER JOIN bd_cust_enum enum ON def.id = enum.custenumdefid ");
    sql.append(" WHERE def.ytenant_id = ? AND def.code = ? ");
    sql.append(" AND enum.ytenant_id = ? AND enum.enable = 1 AND enum.code = ? ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    parameter.addParam(enumType);
    parameter.addParam(tenantid);
    parameter.addParam(enumCode);

    List<Map> resultList = ymsJdbcApi.queryForDTOList(sql.toString(), parameter, Map.class);

    if (resultList != null && !resultList.isEmpty()) {
        return (String) resultList.get(0).get("enum_name");
    }
    return null;
}
```

### 自定义档案翻译模板

```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

public String transCustomDoc(String docType, String docId) {
    if (docType == null || docId == null) {
        return null;
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT t0.code AS doc_code ");
    sql.append(" FROM bd_cust_doc_def t3 ");
    sql.append(" LEFT JOIN bd_cust_doc t0 ON t3.id = t0.custdocdefid ");
    sql.append(" WHERE t3.ytenant_id = ? AND t0.ytenant_id = ? ");
    sql.append(" AND t0.dr IN (0, 2) AND t3.code = ? AND t0.id = ? ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    parameter.addParam(tenantid);
    parameter.addParam(docType);
    parameter.addParam(docId);

    List<Map> resultList = ymsJdbcApi.queryForDTOList(sql.toString(), parameter, Map.class);

    if (resultList != null && !resultList.isEmpty()) {
        return (String) resultList.get(0).get("doc_code");
    }
    return null;
}
```

## Skill调用链汇总

| 特征类型 | 翻译方式 | 必需技能调用 | 说明 |
|---------|---------|------------|------|
| **员工档案（参照）** | **iuap-c-metadata-info + IBillQueryRepository** | **必须** | 先获取fullName，再用IBillQueryRepository查询 |
| 参照（其他） | iuap-c-metadata-info + IBillQueryRepository | 必须 | 同上 |
| 枚举/自定义档案 | 参数化SQL查询 | 无需 | 使用NamedParameterJdbcTemplate |
| 客户/组织翻译 | 参数化SQL查询 | 无需 | 使用NamedParameterJdbcTemplate |

## 注意事项

- ⚠️ **特征字段编码是实施人员自定义的**，不要硬编码
- ⚠️ **通过Excel"字段类型"列动态识别特征类型**
- ⚠️ **员工档案必须先获取元数据 fullName**，不能硬编码
- ⚠️ **参照类型必须使用 IBillQueryRepository.findById()**，不能直接查数据库
- ⚠️ **所有SQL查询必须使用参数化查询**，禁止字符串拼接
- 参照类型必须通过元数据查询获取元数据
- 枚举翻译返回名称文本
- 翻译失败时返回 null，不要返回原始ID
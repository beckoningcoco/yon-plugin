# 特征字段翻译指南

本文档是地磅系统集成技能的特征字段翻译核心参考。

---

## 翻译场景识别矩阵

从Excel文件读取时，根据"BIP字段类型"列识别翻译场景。**以下关键词不区分大小写，模糊匹配**：

| 字段类型关键词（包含即匹配） | 翻译类型 | 代码生成要求 |
|---------------------------|---------|-------------|
| **员工档案** / **人员** / **员工** / **参照** / **人员档案** | 参照翻译 | **必须通过元数据查询获取 fullName**，然后使用 `IBillQueryRepository.findById()` 查询，获取name字段 |
| **枚举** / **枚举类型** / **枚举档案** | 枚举翻译 | 必须查询 `bd_cust_enum_def` 表，返回枚举名称 |
| **自定义档案** / **自定义档案类型** | 自定义档案翻译 | 必须查询 `bd_cust_doc_def` 表 |
| **布尔** / **boolean** / **是/否** | 布尔转换 | true/Y/是 → 1，否则 → 0 |
| **文本** / **字符** / **字符串** / **日期** | 直接取值 | 无需翻译，直接使用原值 |
| **客户** / **供应商** / **物料** / **商品** / **项目** / **组织** | 参照翻译 | **必须通过元数据查询获取 fullName**，使用 `IBillQueryRepository.findById()` 查询 |

---

## 参照翻译

### 客户参照翻译

```java
@Autowired
private IBillQueryRepository iBillQueryRepository;

/**
 * 客户编码翻译（根据ID列表翻译为编码）
 * @param customerList 客户ID列表
 * @return id → code 映射
 */
public Map<String, String> transCustomerCode4IdList(List<String> customerList) {
    if (CollectionUtils.isEmpty(customerList)) {
        return new HashMap<>();
    }

    String tenantid = InvocationInfoProxy.getTenantid();

    StringBuilder sql = new StringBuilder();
    sql.append(" SELECT id, code FROM {schema}.customer ");
    sql.append(" WHERE ytenant_id = ? AND id IN ( ");
    for (int i = 0; i < customerList.size(); i++) {
        sql.append(i > 0 ? ",?" : "?");
    }
    sql.append(" ) ");

    SQLParameter parameter = new SQLParameter();
    parameter.addParam(tenantid);
    for (String id : customerList) {
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
```

### 员工档案参照翻译（推荐方式）

```java
@Autowired
private IBillQueryRepository iBillQueryRepository;

/**
 * 员工名称翻译（根据ID翻译为名称）
 * 步骤：
 * 1. 调用iuap-c-metadata-info获取员工档案fullName
 * 2. 使用IBillQueryRepository.findById()查询
 * 3. 获取name字段
 * @param staffId 员工ID
 * @return 员工名称
 */
public Object transStaffName(String staffId) {
    if (StringUtils.isEmpty(staffId)) {
        return null;
    }
    // Step 1: fullName通过iuap-c-metadata-info获取，此处使用常量
    String fullName = "org.staff.Staff";
    // Step 2: 查询员工档案
    IBillDO staffDO = iBillQueryRepository.findById(fullName, staffId, 0);
    if (staffDO == null) {
        return null;
    }
    // Step 3: 获取name字段
    return staffDO.getAttrValue("name");
}
```

---

## 自定义档案翻译

```java
@Autowired
private IYmsJdbcApi ymsJdbcApi;

/**
 * 获取自定义档案
 * 根据自定义档案类型和自定义档案的编码进行查询，组���成一个map结构
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
    sql.append(" FROM iuap_apdoc_basedoc.bd_cust_doc_def AS t3 ");
    sql.append(" LEFT JOIN iuap_apdoc_basedoc.bd_cust_doc t0 ON t3.id = t0.custdocdefid ");
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

---

## 枚举翻译

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
    sql.append(" FROM iuap_apdoc_basedoc.bd_cust_enum_def def ");
    sql.append(" INNER JOIN iuap_apdoc_basedoc.bd_cust_enum enum ON def.id = enum.custenumdefid ");
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

---

## 布尔转换

```java
/**
 * 布尔转换
 * @param value 原始值
 * @return 1=是/true/Y, 0=否/false/N
 */
public Integer transBoolean(Object value) {
    if (value == null) {
        return 0;
    }
    String str = value.toString().toLowerCase();
    if ("true".equals(str) || "y".equals(str) || "1".equals(str) || "是".equals(str)) {
        return 1;
    }
    return 0;
}
```

---

## 特征字段翻译流程

### 特征字���动态识别规范

**特征字段编码是实施人员自定义的，不能硬编码！**

#### 错误识别方式
```
❌ 根据字段编码前缀识别（如udef_DJ01）
   - 实施人员可能用 kpr_001、chart_001、xxx_001 等任何格式，必须从文件中准确获取
```

#### 正确识别方式
```
✅ 根据Excel"字段类型"列识别
   - 示例：字段类型包含"特征-员工档案" → 员工档案特征
   - 示例：字段类型包含"特征-枚举" → 枚举特征
   - 示例：字段类型包含"布尔" → 布尔特征
```

### 特征字段翻译技能调用链

**当特征字段识别为参照类型{有可能是客户、物料、联系人、线索等}时，必须按以下顺序动态调用技能进行翻译**：

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: 通过元数据查询获取 fullName                    │
│         技能参数：allbillname="人员" 或 "员工档案"                    │
│         返回值：fullName，例如 "org.staff.Staff"                     │
│                                                                     │
│ Step 2: 使用 IBillQueryRepository 查询档案信息                       │
│         注入：@Autowired IBillQueryRepository                       │
│         调用：repository.findById(fullName, staffId, 0)              │
│         返回：IBillDO 对象                                           │
│                                                                     │
│ Step 3: 从 IBillDO 获取档案名称                                       │
│         调用：staffDO.getString("name")                             │
│                                                                     │
│ Step 4: 将名称设置到三方请求实体                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 翻译代码生成禁止事项

```
❌ 严格禁止：
   - 生成 // TODO 实现参照翻译
   - 生成 // TODO 调用iuap-c-metadata-info
   - 生成 // TODO 查询枚举档案
   - 生成空方法体或只有方法签名没有实现
```

---

## 翻译检查清单

每次生成代码后，必须逐项检查以下内容：

- [ ] **无TODO检查**：生成的代码中不包含 `// TODO`、`/* TODO */`、`// TODO:`
- [ ] **方法体完整性**：所有翻译方法都有完整实现（非空方法体）
- [ ] **IBillQueryRepository注入**：已使用 `@Autowired` 注入
- [ ] **iuap-c-metadata-info调用记录**：有Skill调用记录证明已调用该技能获取fullName
- [ ] **findById调用正确**：使用 `IBillQueryRepository.findById(fullName, id, 0)` 格式
- [ ] **name字段获取**：从IBillDO正确获取 `getString("name")` 字段
- [ ] **枚举翻译完整**：SQL查询包含正确的表连接（bd_cust_enum_def + bd_cust_enum）
- [ ] **自定义档案翻译完整**：SQL查询包含正确的表连接（bd_cust_doc_def + bd_cust_doc）
- [ ] **参数化查询**：所有SQL使用SQLParameter，禁止字符串拼接
- [ ] **InvocationInfoProxy使用**：枚举/自定义档案翻译使用 `InvocationInfoProxy.getTenantid()`

## 特征更新
- 务必使用`iuap-c-server-codegen`技能中的 特征值更新
- 只有特征更新采用特征字段动态更新的模式
- 更新特征值，禁止TODO ，必须实现
# 特征字段翻译描述

## BIP特征字段处理基础文档

> **用途**：供其他业务技能引用，实现BIP特征字段到三方实体的翻译
> **使用方式**：其他业务技能引用本文档

---

## 核心方法


### 1. 特征字段映射配置

> **配置来源**：外部Excel/需求文档中的特征字段对照表

| 特征编码 | 字段类型 | 说明 |
|---------|---------|------|
| chart_001 | customer | 客户档案参照 |
| chart_002 | staff | 员工档案参照 |
| chart_003 | enum:invoiceType | 枚举类型 |
| chart_004 | doc:customType | 自定义档案 |

### 4.3 类型识别规则

| 映射值 | 翻译方法 | 说明 |
|--------|----------|------|
| `customer` | transCustomer | 客户档案参照，MCP动态生成 |
| `staff` / `employee` | transStaff | 员工档案参照，MCP动态生成 |
| `org` / `dept` | transOrg | 组织档案参照，MCP动态生成 |
| `enum:xxx` | transCustEnumCodeList | 枚举翻译，固定写法 |
| `doc:xxx` | transCustDocCodeList | 自定义档案翻译，固定写法 |

> **注意**：参照类型翻译方法根据业务需要通过MCP动态生成，枚举和自定义档案为固定写法


### 2. 统一翻译方法

```java
@Component
public class CharacterFieldExtractor {
    
    /**
     * 特征字段统一翻译
     * @param bipData BIP特征数据（如 {"chart_001":"id_xxx", "chart_002":"code_xxx"} ）
     * @param thirdEntity 三方实体对象
     * @param charFieldMapping 特征字段映射（从Excel读取）
     * @param <T> 三方实体类型
     * @return 填充翻译结果后的三方实体
     */
    public <T> T extractCharacter(JSONObject bipData, T thirdEntity, Map<String, String> charFieldMapping) {
        if (bipData == null || charFieldMapping == null) {
            return thirdEntity;
        }
        
        for (Map.Entry<String, String> entry : charFieldMapping.entrySet()) {
            String charCode = entry.getKey();      // chart_001
            String fieldType = entry.getValue();   // customer / staff / enum:xxx / doc:xxx
            
            Object rawValue = bipData.get(charCode);
            if (rawValue == null) continue;
            
            // 翻译并填充到三方实体
            String translated = translate(rawValue.toString(), fieldType);
            fill(thirdEntity, charCode, translated);
        }
        return thirdEntity;
    }
    
    /** 根据类型翻译 */
    private String translate(String value, String type) {
        List<String> list = Collections.singletonList(value);
        
        if ("customer".equalsIgnoreCase(type)) {
            return transCustomer(list).getOrDefault(value, value);
        }
        if (type.startsWith("enum:")) {
            return transCustEnumCodeList(type.substring(5), list).getOrDefault(value, value);
        }
        if (type.startsWith("doc:")) {
            return transCustDocCodeList(type.substring(4), list).getOrDefault(value, value);
        }
        return value;
    }
    
    /** 反射填充 */
    private <T> void fill(T entity, String field, String value) {
        try {
            String setter = "set" + field.substring(0,1).toUpperCase() + field.substring(1);
            entity.getClass().getMethod(setter, String.class).invoke(entity, value);
        } catch (Exception ignored) {}
    }
}
```

### 3. 映射关系结构

```java
// Excel读取：特征编码 | 字段类型
// chart_001 | customer       -> 客户档案翻译
// chart_002 | staff          -> 员工档案翻译
// chart_003 | org            -> 组织档案翻译
// chart_004 | enum:invoiceType -> 枚举翻译
// chart_005 | doc:customType   -> 自定义档案翻译

Map<String, String> charFieldMapping = new HashMap<>();
charFieldMapping.put("chart_001", "customer");
charFieldMapping.put("chart_002", "staff");
charFieldMapping.put("chart_003", "enum:invoiceType");
charFieldMapping.put("chart_004", "doc:customType");
```

---

## 4.翻译方法实现

### 4.1 参照或档案翻译
**此处需要根据特征类型为参照的要强制调用MCP服务动态生成的逻辑，以下是代码结构示例，如果没有该类型字段则禁止生成该代码**
**调用MCP服务：getUltimateMetadataInfo 和 getIBillQueryRepository  **

```java
public Map<String, String> transCustomer(List<String> ids) {
    if (CollectionUtils.isEmpty(ids)) return new HashMap<>();
    String tenant = getTenantId();
    List<Map<String, Object>> rs = jdbcTemplate.queryForList(
        "SELECT id, name FROM bd_customer WHERE ytenant_id = ? AND id IN (" + toSql(ids) + ")", tenant);
    return rs.stream().collect(Collectors.toMap(m -> (String)m.get("id"), m -> (String)m.get("name")));
}
```


### 4.1 枚举翻译（固定写法）
**此处需要根据特征类型为枚举逻辑，以下是代码结构示例，如果没有该类型字段则禁止生成该代码**

```java
public Map<String, String> transCustEnumCodeList(String enumType, List<String> codes) {
    if (CollectionUtils.isEmpty(codes)) return new HashMap<>();
    String tenant = getTenantId();
    String sql = "SELECT enum.code, enum.name FROM bd_cust_enum_def def " +
                "JOIN bd_cust_enum enum ON def.id=enum.custenumdefid " +
                "WHERE def.ytenant_id=? AND def.code=? AND enum.code IN (" + toSql(codes) + ")";
    List<Map<String, Object>> rs = jdbcTemplate.queryForList(sql, tenant, enumType);
    return rs.stream().collect(Collectors.toMap(m -> (String)m.get("code"), m -> (String)m.get("name")));
}
```

### 4.2 自定义档案翻译（固定写法）
**此处需要根据特征类型为自定义档案逻辑，以下是代码结构示例，如果没有该类型字段则禁止生成该代码**

```java
public Map<String, String> transCustDocCodeList(String docType, List<String> ids) {
    if (CollectionUtils.isEmpty(ids)) return new HashMap<>();
    String tenant = getTenantId();
    String sql = "SELECT doc.id, doc.name FROM bd_cust_doc_def def " +
                "JOIN bd_cust_doc doc ON def.id=doc.custdocdefid " +
                "WHERE def.ytenant_id=? AND def.code=? AND doc.id IN (" + toSql(ids) + ")";
    List<Map<String, Object>> rs = jdbcTemplate.queryForList(sql, tenant, docType);
    return rs.stream().collect(Collectors.toMap(m -> (String)m.get("id"), m -> (String)m.get("name")));
}
```

---

## 引用示例

```java
@Autowired
private CharacterFieldExtractor characterFieldExtractor;


// 翻译特征字段
ThirdEntity entity = new ThirdEntity();
characterFieldExtractor.extractCharacter(bipCharacterData, entity, charFieldMapping);
```

---

## 类型识别规则

| 字段类型 | 映射值 | 翻译方法 |
|---------|--------|----------|
| 客户档案 | `customer` | transCustomer |
| 员工档案 | `staff` / `employee` | transStaff |
| 组织档案 | `org` / `dept` | transOrg |
| 枚举 | `enum:类型编码` | transCustEnumCodeList |
| 自定义档案 | `doc:档案类型` | transCustDocCodeList |

> **注意**：参照类型翻译方法根据业务需要通过MCP动态生成，枚举和自定义档案为固定写法

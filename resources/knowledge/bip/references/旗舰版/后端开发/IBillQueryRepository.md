# IBillQueryRepository 数据查询架构规范

> **版本**: v3.0 | **基于**: iuap-ap-ypd-api-15.5.531-RELEASE.jar
> **定位**: JDBC架构师视角，按场景-技术-条件-要求-检查五维度组织

---

## 一、必要条件（开发前必须完成）

### 1.1 元数据查询强制前置

> ⚠️ **元数据优先原则**：IBillQueryRepository 的所有查询都必须先查询元数据，禁止臆想字段/domain/URI

**必须调用 `iuap-c-metadata-info` skill 获取的信息**：

| 信息项 | 用途 | 示例 |
|--------|------|------|
| `uri` (metaFullName) | 指定查询对象 | `yonbip.org.supplier.Supplier` |
| `domain` | 跨域查询必填 | `org`, `bd`, `scm`, `yssupplier` |
| `fieldName` | 字段名（不是dbColumnName） | `pkOrg`, `billDate` |
| `refStructure` | 参照字段结构 | `customer.code`, `org.name` |
| `propertyInParent` | 主子表关联属性 | `purchaseOrders` |

### 1.2 查询三元素

```
┌────────────────────────────────────────────────────────────────────┐
│                        查询三元素                                    │
├────────────────────────────────────────────────────────────────────┤
│  URI        → 业务对象唯一标识  (yonbip.{domain}.{实体名})          │
│  QuerySchema → 查询构造器        (字段/条件/排序/分页)               │
│  Domain      → 服务域标识       (跨域必填，本域可省略)               │
└────────────────────────────────────────────────────────────────────┘
```

**URI 与 Domain 关系**：
```
标准格式: yonbip.org.supplier.Supplier → domain="org" (可自动解析)
非标准格式: aa.vendor.Vendor → domain="yssupplier" (必须显式传入)
```

---

## 二、技术维度

### 2.1 返回类型分层

| 返回类型 | 方法 | 适用场景 |
|---------|------|---------|
| `Map<String, Object>` | `queryBySchema()` / `queryMapBySchema()` | 动态字段、通用查询、传输 |
| `IBillDO` | `findById()` / `findByIds()` / `queryBySchema()` | 强类型、状态变更 |

### 2.2 核心方法速查

| 场景 | 方法 | 必填参数 |
|------|------|---------|
| 已知ID查单条 | `findById(metaFullName, pk)` | URI, PK |
| 已知编码查ID | `findIdsByCodes(metaFullName, codes)` | URI, codes |
| 条件查列表 | `queryBySchema(billEntityInfo, schema)` | info, schema |
| 强类型条件查 | `queryBySchema(metaFullName, schema, domain)` | URI, schema, domain(跨域) |
| 跨域弱类型查 | `queryMapBySchema(fullName, schema, domain)` | URI, schema, domain |
| 分页查 | `pageQueryBySchema(context, schema)` | context, schema |

### 2.3 QuerySchema 构造

```java
QuerySchema schema = QuerySchema.create();

// 字段选择
schema.addSelect("id,code,name,pk_org");

// 条件组合
schema.addCondition(QueryConditionGroup.and(
    QueryCondition.name("dr").eq(0),
    QueryCondition.name("pk_org").in(orgList)
));

// 排序
schema.addOrderBy("billdate desc");

// 分页
schema.addPager(pageNum, pageSize);
```

---

## 三、场景与代码模板


### 3.2 URI查询（必须显式传入domain）

```java
// ⚠️ 非标准格式: aa.vendor.Vendor, pc.xxx 等
public List<Map> queryVendorByErpCode(String erpCode) {
    String uri = "aa.vendor.Vendor";      // 从元数据获取
    String domain = "yssupplier";          // 从元数据获取

    QuerySchema schema = QuerySchema.create();
    schema.addSelect("id,code,name");
    schema.addCondition(QueryConditionGroup.and(
        QueryCondition.name("erpCode").eq(erpCode)
    ));

    // ⚠️ 必须传入domain
    return iBillQueryRepository.queryMapBySchema(uri, schema, domain);
}
```

### 3.3 强类型查询（IBillDO）

```java
// ✅ 强类型查询
public IBillDO queryById(String uri, Long id) {
    return iBillQueryRepository.findById(uri, id);
}

// ✅ 强类型条件查询（跨域必须传domain）
public List queryBySchema(String uri, String domain, QuerySchema schema) {
    return iBillQueryRepository.queryBySchema(uri, schema, domain);
}
```

### 3.4 参照字段查询

> 📌 **语法**: `参照属性名.code` / `参照属性名.name`
> ⚠️ **无需 QueryJoin**，平台自动处理关联

```java
QuerySchema schema = QuerySchema.create();
schema.addSelect("id,code,name");

// ✅ 正确：参照字段查询
schema.addSelect("customer.code as customer_code");    // 客户编码
schema.addSelect("customer.name as customer_name");    // 客户名称

// ❌ 错误：臆想字段名
// schema.addSelect("customerId");  // 错误
```

### 3.5 特征字段查询

> 📌 **语法**: `特征组.特征编码`
> ⚠️ **无需 QueryJoin**

```java
QuerySchema schema = QuerySchema.create();
schema.addSelect("id,code,name");

// 简单特征
schema.addSelect("basicInfo.color as material_color");

// 参照类型特征：使用元数据的 codeField/nameField
schema.addSelect("basicInfo.supplierRef." + codeField + " as supplier_code");
```

### 3.6 主子表关联查询

> 📌 **必须使用 QueryJoin**

```java
QuerySchema schema = QuerySchema.create();
schema.addSelect("id,code");

// ✅ 正确：使用 QueryJoin
schema.addJoin(new QueryJoin(
    "purchaseOrders",           // propertyInParent（从元数据获取）
    "purchaseOrders.mainid = id",
    "left,alone"
));
schema.addSelect("purchaseOrders.id as detail_id");
schema.addSelect("purchaseOrders.material_code");
```

---

## 四、要求（强制规范）

### 4.1 条件构造统一模板

> ⚠️ **【强制】所有条件必须按此模板编写，禁止臆想**

```java
// ✅ 标准模板：先收集条件，最后统一包装
List<QueryCondition> conditions = new ArrayList<>();
conditions.add(QueryCondition.name("dr").eq(0));

// 单值条件
conditions.add(QueryCondition.name("field").eq(value));

// 范围条件：每个运算符单独一个QueryCondition
conditions.add(QueryCondition.name("amount").gt(100));
conditions.add(QueryCondition.name("amount").lt(1000));

// 日期范围
conditions.add(QueryCondition.name("billdate").between(startDate, endDate));

// IN条件：先判空
if (orgIds != null && !orgIds.isEmpty()) {
    conditions.add(QueryCondition.name("pk_org").in(orgIds));
}

// ✅ 最后用QueryConditionGroup包装
schema.addCondition(QueryConditionGroup.and(conditions.toArray(new QueryCondition[0])));
```

### 4.2 条件构造规范

| 规则 | 说明 |
|------|------|
| **禁止链式调用** | `.gt(1).lt(10)` 只有lt生效，每个条件单独创建 |
| **必须用Group包装** | `addCondition()` 只接受 QueryConditionGroup |
| **in() 先判空** | `if(list != null && !list.isEmpty())` |
| **模糊查询不加%** | `.like("PO")` 自动生成 `%PO%` |

### 4.2 字段命名规范

```java
// ✅ 正确：使用 fieldName（不是 dbColumnName）
QueryCondition.name("pkOrg").eq(value);
QueryCondition.name("billDate").between(start, end);

// ❌ 错误：使用数据库列名
QueryCondition.name("pk_org").eq(value);
```

### 4.3 IBillDO 获取字段值

> ⚠️ **【强制】IBillDO 查询返回的字段必须使用 `getAttrValue()`**

```java
QuerySchema schema = QuerySchema.create();
schema.addSelect("id");
schema.addSelect("org as org_id");           // 参照字段必须加别名
schema.addSelect("org.code as org_code");    // 参照子属性必须加别名

List results = billQueryRepository.queryBySchema(uri, schema, domain);
IBillDO row = (IBillDO) results.get(0);

// ✅ 正确：使用 getAttrValue()
Object orgId = row.getAttrValue("org_id");
Object orgCode = row.getAttrValue("org_code");

// ❌ 错误：使用 get()
// Object orgId = row.get("org_id");  // 返回null
```

**为什么必须用 `getAttrValue()`？**

| 方法 | 适用场景 |
|------|---------|
| `get(String)` | DO 类上直接定义的属性（id, code, name） |
| `getAttrValue(String)` | QuerySchema `addSelect()` 返回的字段 |

### 4.4 参照字段别名规范

> ⚠️ **【强制】参照字段和参照子属性必须加别名**

```java
// ❌ 错误：参照字段不加别名
schema.addSelect("org");              // 无法 getAttrValue("org")
schema.addSelect("org.code");        // 无法 getAttrValue("org.code")

// ✅ 正确：参照字段必须加别名
schema.addSelect("org as org_id");           // 用于 getAttrValue("org_id")
schema.addSelect("org.code as org_code");    // 用于 getAttrValue("org_code")

// ✅ 获取值
String orgId = row.getAttrValue("org_id").toString();
String orgCode = row.getAttrValue("org_code").toString();
```

---

## 五、常见错误与修复

| 错误 | 原因 | 修复 |
|------|------|------|
| `addCondition()` 无效 | 传了单个 QueryCondition | 用 `QueryConditionGroup.and()` 包装 |
| `in()` 抛异常 | 传入空集合 | 先判空 `if(orgIds != null && !orgIds.isEmpty())` |
| 参照字段返回null | 未加别名 | `addSelect("org.code as org_code")` |
| 非标准URI查不到 | 省略domain | `queryBySchema(uri, schema, domain)` |
| 字段名不存在 | 未查元数据臆想 | **必须先调用 iuap-c-metadata-info** |
| get() 返回null | 未用 getAttrValue() | 改用 `row.getAttrValue("字段名")` |

---

## 六、检查清单（代码提交前必须完成）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    IBillQueryRepository 查询开发检查                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  □ 1. 已调用 iuap-c-metadata-info 查询元数据                            │
│                                                                         │
│  □ 2. URI使用正确                                                       │
│     - 非标准格式(aa.xxx, pc.xxx) 已显式传入domain ✅                     │
│     - 标准格式(yonbip.xxx) 可省略domain                                 │
│                                                                         │
│  □ 3. Domain传入正确                                                    │
│     - 跨域查询: queryBySchema(uri, schema, domain) ✅                   │
│     - 省略domain会导致查询失败 ❌                                        │
│                                                                         │
│  □ 4. 字段名与元数据一致                                                │
│     - QueryCondition.name() 使用 fieldName                               │
│     - 非 dbColumnName                                                   │
│                                                                         │
│  □ 5. 条件构造正确                                                      │
│     - 使用 QueryConditionGroup.and() 包装 ✅                             │
│     - 不使用链式调用 ❌                                                  │
│     - in() 先判空 ✅                                                    │
│                                                                         │
│  □ 6. 禁止臆想                                                          │
│     - 禁止硬编码URI/Domain/字段名 ❌                                    │
│                                                                         │
│  □ 7. IBillDO获取字段值                                                 │
│     - 使用 getAttrValue() ✅                                            │
│     - 不使用 get() ❌                                                   │
│                                                                         │
│  □ 8. 参照字段别名规范                                                  │
│     - schema.addSelect("org as org_id") ✅                              │
│     - schema.addSelect("org.code as org_code") ✅                       │
│     - 不加别名无法获取值 ❌                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 七、相关文档

| 文档 | 用途 |
|------|------|
| `iuap-c-metadata-info` | 元数据查询（**必须优先调用**） |
| `QuerySchema.md` | 查询构造器完整指南 |
| `IYmsJdbcApi.md` | 原生SQL增删改操作 |

---

**文档版本**: v3.0 | **更新**: 2026-05-11
**更新内容**：
- v3.0: 深度重构，按场景-技术-条件-要求-检查五维度组织，精简至500行
- v2.5: 新增错误示例5-6，明确IBillDO必须使用getAttrValue()
- v2.4: 新增第十三章"强制规范与检查清单"

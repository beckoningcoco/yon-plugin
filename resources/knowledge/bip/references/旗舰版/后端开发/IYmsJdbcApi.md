# IYmsJdbcApi 数据库操作规范

> **核心原则**：使用原生SQL查询时，Schema、TableName、字段名**必须来自元数据查询结果**，禁止臆想。
>
> **技能路由**：当用户需求涉及"原生SQL查询"、"数据库操作"、"中间表同步"等关键词时，应路由到本文档。

---

## 一、技能路由决策树

### 1.1 路由触发关键词

当用户话术中出现以下关键词时，应路由到 IYmsJdbcApi：

| 关键词类型 | 示例话术 | 应路由到 |
|-----------|---------|---------|
| **数据库操作** | "查询中间表数据"、"插入数据库"、"更新数据库" | IYmsJdbcApi |
| **原生SQL** | "执行原生SQL"、"写SQL查询"、"自定义SQL" | IYmsJdbcApi |
| **批量操作** | "批量更新状态"、"批量插入数据"、"批量删除" | IYmsJdbcApi |
| **跨Schema查询** | "关联查询不同Schema的表"、"跨库查询" | IYmsJdbcApi |
| **中间表** | "同步到中间表"、"查询中间表"、"写入中间表" | IYmsJdbcApi |

### 1.2 路由决策流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      IYmsJdbcApi 方法路由决策树                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  用户需求：数据库操作                                                   │
│       │                                                                │
│       ├─── 需要查询数据？                                              │
│       │        │                                                       │
│       │        ├─── 单条记录 → queryForList (MapListProcessor)       │
│       │        │                                                       │
│       │        ├─── 分页列表 → queryPage                             │
│       │        │                                                       │
│       │        └─── 统计/聚合 → queryForList (ColumnProcessor)        │
│       │                                                                │
│       ├─── 需要新增数据？                                               │
│       │        │                                                       │
│       │        ├─── 单条 → insert                                     │
│       │        └─── 批量 → 循环 insert（无 batchInsert）              │
│       │                                                                │
│       ├─── 需要更新数据？                                              │
│       │        │                                                       │
│       │        ├─── 单条 → update(sql, param)                        │
│       │        └─── 批量 → batchUpdate                                │
│       │                                                                │
│       └─── 需要删除数据？                                               │
│                │                                                       │
│                └─── removeByPK / removeByClause                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、方法精确匹配表

### 2.1 查询方法匹配

| 用户需求描述 | 应使用方法 | 处理器 | 说明 |
|-------------|-----------|--------|------|
| "查询XXX表的数据" | `queryForList(sql, param, processor)` | `MapListProcessor` | 返回List<Map> |
| "查询XXX的列表" | `queryForList(sql, param, processor)` | `MapListProcessor` | 返回List<Map> |
| "查询XXX并分页" | `queryPage(sql, param, processor, pageRequest)` | `MapListProcessor` | 分页结果 |
| "统计XXX的数量" | `queryForList(sql, param, processor)` | `ColumnProcessor` | 单列单值 |
| "查询XXX的最大值/最小值" | `queryForList(sql, param, processor)` | `ColumnProcessor` | 聚合查询 |
| "查询XXX的唯一值" | `queryForList(sql, param, processor)` | `ColumnProcessor` | DISTINCT查询 |

### 2.2 增删改方法匹配

| 用户需求描述 | 应使用方法 | 说明 |
|-------------|-----------|------|
| "插入一条数据到XXX表" | `insert(vo)` | 返回生成的ID |
| "批量插入数据到XXX表" | 循环 `insert` | 无批量方法，需循环 |
| "更新XXX表的状态" | `update(sql, param)` | 返回影响行数 |
| "批量更新XXX的状态" | `batchUpdate(sql, paramList)` | 高效批量更新 |
| "删除XXX表的记录" | `removeByPK(entity, pk, isLogic)` | isLogic=true逻辑删除 |
| "按条件删除XXX的记录" | `removeByClause(entity, clause, isLogic)` | 按条件删除 |

---

## 三、工作流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        元数据获取决策树                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  上一步已通过 iuap-c-metadata-info 查询元数据？                         │
│       │                                                                │
│       ├── 是 → 直接使用已获取的元数据信息构造SQL                        │
│       │                                                                │
│       └── 否 → 先调用 iuap-c-metadata-info 查询元数据                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 四、元数据查询

### 4.1 调用方式

> 元数据查询工具未随包提供，元数据请从 BIP 元数据管理页面获取。


### 4.2 元数据返回的关键字段

| 返回字段 | 说明 | 用途 |
|---------|------|------|
| `schema` | 数据库Schema前缀 | 构造表名前缀 |
| `tableName` | 物理表名 | 构造表名 |
| `columns[].column` | 数据库列名（带下划线） | SELECT/WHERE子句 |
| `columns[].name` | 字段显示名 | 备注说明 |

### 4.3 元数据响应示例

```json
{
  "entities": [{
    "uri": "pc.product.Product",
    "schema": "iuap_apdoc_coredoc",
    "tableName": "product",
    "columns": [
      {"name": "物料编码", "column": "code"},
      {"name": "物料名称", "column": "name"}
    ]
  }]
}
```

---

## 五、必须导入的类

```java
import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import com.yonyou.iuap.yms.dao.BaseDAO;
import com.yonyou.iuap.yms.param.SQLParameter;
import com.yonyou.iuap.yms.processor.MapListProcessor;
import com.yonyou.iuap.yms.processor.ColumnProcessor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
```

---

## 六、注入规范

```java
@Service
public class XxxService {

    @Resource(name = "baseDAO", type = BaseDAO.class)
    private IYmsJdbcApi ymsJdbcApi;
}
```

---

## 七、铁律规范

### 7.1 Schema、TableName、字段必须来自元数据

```java
// ✅ 正确：所有值来自元数据
String sql = "SELECT t." + column + " FROM " + schema + "." + tableName + " t WHERE t.id = ?";

// ❌ 错误：臆想值
String sql = "SELECT code FROM product WHERE id = ?";
```

### 7.2 必须使用 SQLParameter

```java
// ✅ 正确
SQLParameter param = new SQLParameter();
param.addParam(id);
String sql = "SELECT * FROM table WHERE id = ?";

// ❌ 错误：字符串拼接（SQL注入）
String sql = "SELECT * FROM table WHERE id = '" + id + "'";
```

### 7.3 参数顺序一致性

```java
// SQL 中 ? 的顺序 → addParam 顺序必须对应
String sql = "UPDATE table SET col1 = ?, col2 = ? WHERE id = ?";

param.addParam(value1);  // 第1个 ?
param.addParam(value2);  // 第2个 ?
param.addParam(id);      // 第3个 ?
```

### 7.4 SQL 禁止注释

```java
// ✅ 正确
String sql = "SELECT * FROM table WHERE id = ? AND status = 1";

// ❌ 错误
String sql = "SELECT * FROM table WHERE id = ? -- 注释";
```

---

## 八、查询方法详解

### 8.1 方法签名速查表

| 方法签名 | 返回值 | 用途 |
|---------|--------|------|
| `queryForList(sql, param, processor)` | `List<T>` | 带参数查询 |
| `queryPage(sql, param, processor, pageRequest)` | `Page<T>` | 分页查询 |

### 8.2 场景A：查询列表数据

**触发关键词**："查询XXX表"、"查询XXX列表"、"获取XXX数据"

```java
/**
 * 查询列表
 *
 * @param schema    元数据.schema（来自 iuap-c-metadata-info 查询结果）
 * @param tableName 元数据.tableName（来自 iuap-c-metadata-info 查询结果）
 * @param id        查询条件
 */
public List<Map<String, Object>> queryList(
        String schema, String tableName, String id) {

    // ✅ 表名来自元数据
    String sql = "SELECT t.* FROM " + schema + "." + tableName + " t WHERE t.dr = 0 ";

    SQLParameter param = new SQLParameter();
    if (StringUtils.isNotBlank(id)) {
        sql += " AND t.id = ?";
        param.addParam(id);
    }

    // ✅ MapListProcessor：返回 List<Map<String, Object>>
    return ymsJdbcApi.queryForList(sql, param, new MapListProcessor());
}
```

### 8.3 场景B：分页查询

**触发关键词**："分页查询XXX"、"查询XXX列表（分页）"、"分页获取XXX"

```java
/**
 * 分页查询
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 * @param pageNum   页码（从1开始）
 * @param pageSize  每页条数
 */
public Page<Map<String, Object>> queryPage(
        String schema, String tableName, int pageNum, int pageSize) {

    String sql = "SELECT t.* FROM " + schema + "." + tableName + " t WHERE t.dr = 0";

    // ✅ Spring Data 分页（0-based）
    PageRequest pageRequest = PageRequest.of(pageNum - 1, pageSize);

    // ✅ 返回 Page 对象
    return ymsJdbcApi.queryPage(sql, null, new MapListProcessor(), pageRequest);
}
```

### 8.4 场景C：统计/聚合查询

**触发关键词**："统计XXX数量"、"查询XXX的总数"、"查询XXX有多少条"

```java
/**
 * 统计数量
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 */
public long countData(String schema, String tableName) {
    String sql = "SELECT COUNT(*) FROM " + schema + "." + tableName + " WHERE dr = 0";

    // ✅ ColumnProcessor：返回单列单值
    Object result = ymsJdbcApi.queryForList(sql, null, new ColumnProcessor());

    return result != null ? ((Number) result).longValue() : 0L;
}

/**
 * 查询最大值
 */
public BigDecimal getMaxValue(String schema, String tableName, String column) {
    String sql = "SELECT MAX(" + column + ") FROM " + schema + "." + tableName;

    Object result = ymsJdbcApi.queryForList(sql, null, new ColumnProcessor());

    return result != null ? new BigDecimal(result.toString()) : BigDecimal.ZERO;
}
```

---

## 九、持久化方法详解

### 9.1 方法签名速查表

| 方法 | 签名 | 返回值 |
|------|------|--------|
| 插入 | `insert(vo)` / `insert(List<vo>)` | `ID` / `ID[]` |
| 更新 | `update(sql, param)` / `batchUpdate(sql, paramList)` | `int` / `int[]` |
| 删除 | `removeByPK(entity, pk, isLogic)` | `int` |

### 9.2 场景A：单条插入

**触发关键词**："插入一条数据"、"新增XXX记录"、"保存到XXX表"

```java
/**
 * 单条插入
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 * @param data      插入数据
 */
@Transactional
public String insertData(String schema, String tableName, Map<String, Object> data) {
    DefaultBillDO entity = new DefaultBillDO();
    entity.set("schema", schema);
    entity.set("field1", data.get("field1"));
    entity.set("field2", data.get("field2"));

    // ✅ 返回生成的ID
    return (String) ymsJdbcApi.insert(entity);
}
```

### 9.3 场景B：批量插入

**触发关键词**："批量插入数据"、"批量新增XXX"、"批量保存XXX"

**⚠️ 注意**：`IYmsJdbcApi` **没有** `batchInsert` 方法，需循环调用 `insert`。

```java
/**
 * 批量插入
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 * @param dataList  插入数据列表
 */
@Transactional
public List<String> batchInsert(String schema, String tableName, List<Map<String, Object>> dataList) {
    List<String> ids = new ArrayList<>();

    for (Map<String, Object> data : dataList) {
        DefaultBillDO entity = new DefaultBillDO();
        entity.set("schema", schema);
        entity.set("field1", data.get("field1"));
        entity.set("field2", data.get("field2"));

        String id = (String) ymsJdbcApi.insert(entity);
        ids.add(id);
    }

    return ids;
}
```

### 9.4 场景C：单条更新

**触发关键词**："更新XXX状态"、"修改XXX数据"、"更新XXX记录"

```java
/**
 * 单条更新
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 * @param id        主键
 * @param field     更新字段
 * @param value     更新值
 */
@Transactional
public int updateData(String schema, String tableName, String id, String field, String value) {
    // ✅ 表名来自元数据
    String sql = "UPDATE " + schema + "." + tableName + " SET " + field + " = ? WHERE id = ?";

    SQLParameter param = new SQLParameter();
    param.addParam(value);
    param.addParam(id);

    return ymsJdbcApi.update(sql, param);
}
```

### 9.5 场景D：批量更新

**触发关键词**："批量更新XXX"、"批量修改状态"、"批量更新数据"

```java
/**
 * 批量更新
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 * @param ids       主键列表
 * @param status    新状态
 */
@Transactional
public int[] batchUpdateStatus(String schema, String tableName, List<String> ids, String status) {
    String sql = "UPDATE " + schema + "." + tableName + " SET status = ? WHERE id = ?";

    List<SQLParameter> paramList = new ArrayList<>();
    for (String id : ids) {
        SQLParameter param = new SQLParameter();
        param.addParam(status);
        param.addParam(id);
        paramList.add(param);
    }

    // ✅ 返回每条的影响行数数组
    return ymsJdbcApi.batchUpdate(sql, paramList);
}
```

### 9.6 场景E：删除数据

**触发关键词**："删除XXX记录"、"删除XXX数据"、"批量删除XXX"

```java
/**
 * 按主键删除
 *
 * @param schema    元数据.schema
 * @param tableName 元数据.tableName
 * @param id        主键
 * @param isLogic   是否逻辑删除
 */
@Transactional
public int deleteById(String schema, String tableName, String id, boolean isLogic) {
    DefaultBillDO entity = new DefaultBillDO();
    entity.set("schema", schema);

    return ymsJdbcApi.removeByPK(entity, id, isLogic);
}
```

---

## 十、反例验证

### 10.1 错误：臆想 Schema 和字段

```java
// ❌ 错误：臆想值
String sql = "SELECT code, name FROM product WHERE id = ?";

// ✅ 正确：所有值来自元数据
String sql = "SELECT t.code_, t.name_ FROM " + schema + "." + tableName + " t WHERE t.id = ?";
```

### 10.2 错误：queryForList 参数缺失

```java
// ❌ 编译错误
ymsJdbcApi.queryForList(sql, new MapListProcessor());

// ✅ 正确
ymsJdbcApi.queryForList(sql, null, new MapListProcessor());
ymsJdbcApi.queryForList(sql, param, new MapListProcessor());
```

### 10.3 错误：SQL注入

```java
// ❌ 安全漏洞
String sql = "SELECT * FROM table WHERE name = '" + userInput + "'";

// ✅ 正确
SQLParameter param = new SQLParameter();
param.addParam(userInput);
String sql = "SELECT * FROM table WHERE name = ?";
```

### 10.4 错误：batchInsert 不存在

```java
// ❌ 方法不存在
ymsJdbcApi.batchInsert("table_name", dataList);

// ✅ 正确
for (Map<String, Object> data : dataList) {
    ymsJdbcApi.insert(entity);
}
```

---

## 十一、完整代码模板

```java
package com.yonyou.xxx.service;

import com.yonyou.iuap.yms.api.IYmsJdbcApi;
import com.yonyou.iuap.yms.dao.BaseDAO;
import com.yonyou.iuap.yms.param.SQLParameter;
import com.yonyou.iuap.yms.processor.MapListProcessor;
import com.yonyou.iuap.yms.processor.ColumnProcessor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.*;

/**
 * IYmsJdbcApi 使用模板
 *
 * ⚠️ Schema、TableName、字段名必须来自元数据查询结果
 */
@Slf4j
@Service
public class XxxServiceImpl {

    @Resource(name = "baseDAO", type = BaseDAO.class)
    private IYmsJdbcApi ymsJdbcApi;

    /**
     * 查询列表
     */
    public List<Map<String, Object>> queryByCondition(String schema, String tableName, String id) {
        String sql = "SELECT t.* FROM " + schema + "." + tableName + " t WHERE t.dr = 0 ";
        SQLParameter param = new SQLParameter();
        if (StringUtils.isNotBlank(id)) {
            sql += " AND t.id = ?";
            param.addParam(id);
        }
        return ymsJdbcApi.queryForList(sql, param, new MapListProcessor());
    }

    /**
     * 分页查询
     */
    public Page<Map<String, Object>> queryPage(String schema, String tableName, int pageNum, int pageSize) {
        String sql = "SELECT t.* FROM " + schema + "." + tableName + " t WHERE t.dr = 0";
        PageRequest pageRequest = PageRequest.of(pageNum - 1, pageSize);
        return ymsJdbcApi.queryPage(sql, null, new MapListProcessor(), pageRequest);
    }

    /**
     * 统计数量
     */
    public long countData(String schema, String tableName) {
        String sql = "SELECT COUNT(*) FROM " + schema + "." + tableName + " WHERE dr = 0";
        Object result = ymsJdbcApi.queryForList(sql, null, new ColumnProcessor());
        return result != null ? ((Number) result).longValue() : 0L;
    }

    /**
     * 单条更新
     */
    @Transactional
    public int updateData(String schema, String tableName, String id, String field, String value) {
        String sql = "UPDATE " + schema + "." + tableName + " SET " + field + " = ? WHERE id = ?";
        SQLParameter param = new SQLParameter();
        param.addParam(value);
        param.addParam(id);
        return ymsJdbcApi.update(sql, param);
    }

    /**
     * 批量更新
     */
    @Transactional
    public int[] batchUpdateStatus(String schema, String tableName, List<String> ids, String status) {
        String sql = "UPDATE " + schema + "." + tableName + " SET status = ? WHERE id = ?";
        List<SQLParameter> paramList = new ArrayList<>();
        for (String id : ids) {
            SQLParameter param = new SQLParameter();
            param.addParam(status);
            param.addParam(id);
            paramList.add(param);
        }
        return ymsJdbcApi.batchUpdate(sql, paramList);
    }
}
```

---

## 十二、决策表

| 场景 | 推荐工具 | 说明 |
|------|---------|------|
| 标准业务对象查询 | `IBillQueryRepository` | 强类型、自动关联 |
| 原生SQL查询 | `IYmsJdbcApi` | 需元数据支持 |
| 批量更新 | `IYmsJdbcApi.batchUpdate` | 高效 |
| 批量插入 | 循环 `insert` | 无批量方法 |
| 特征回写 | `ElasticTool` | 封装回写逻辑 |

---

## 十三、架构要点

```
┌────────────────────────────────────────────────────────────────────┐
│                     IYmsJdbcApi 核心要点                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. 技能路由    │ 触发关键词：数据库操作、原生SQL、批量操作         │
│  2. 方法匹配    │ 根据需求精确匹配方法（见第二章匹配表）            │
│  3. 元数据来源  │ schema/tableName/字段来自 iuap-c-metadata-info │
│  4. 禁止臆想   │ schema/tableName/字段禁止硬编码                  │
│  5. 参数化     │ 必须使用 SQLParameter                              │
│  6. 参数顺序   │ addParam 顺序与 ? 位置对应                        │
│  7. 处理器选择 │ MapListProcessor / ColumnProcessor                │
│  8. 事务控制   │ @Transactional                                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 十四、调试技巧

### 14.1 打印SQL

```java
log.info("SQL: {}, 参数: {}", sql, paramList);
```

### 14.2 安全取值

```java
// Map取值（column 来自元数据）
String code = map.get("code_") != null ? map.get("code_").toString() : "";

// 类型转换
long count = result != null ? ((Number) result).longValue() : 0L;
```

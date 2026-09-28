# QuerySchema 使用指南

> **重要**：所有 Schema 相关类均位于 `org.imeta.orm.schema` 包下。

## 包路径

```java
package org.imeta.orm.schema;
```

**核心类列表**：
- `QuerySchema` - 查询主对象
- `QueryCondition` - 单字段条件
- `QueryConditionGroup` - 条件组
- `QueryJoin` - 关联查询
- `QueryOrderby` - 排序
- `QueryPager` - 分页
- `QueryGroupBy` - 分组
- `QueryHavingGroup` - Having条件组
- `QuerySqlCondition` - 原生子SQL条件
- `QueryFieldCondition` - 字段与字段比较条件
- `QueryMultiFieldCondition` - 多字段批量IN条件

## 标准调用步骤

1. `QuerySchema.create()` 创建查询对象
2. `addSelect(...)` 指定查询字段
3. `addCondition(QueryConditionGroup...)` 添加条件组
4. 按需增加 `addJoin / addGroupBy / addOrderBy / addPager`
5. 通过仓储执行查询
6. 返回 `List<Map<String, Object>>` 或业务DTO

## 导入规范

```java
import org.imeta.orm.schema.QuerySchema;
import org.imeta.orm.schema.QueryCondition;
import org.imeta.orm.schema.QueryConditionGroup;
import org.imeta.orm.schema.QueryJoin;
import org.imeta.orm.schema.QueryOrderby;
import org.imeta.orm.schema.QueryPager;
import org.imeta.orm.schema.QueryGroupBy;
import org.imeta.orm.schema.QueryHavingGroup;
```

## QuerySchema 核心方法

```java
// 创建
QuerySchema schema = QuerySchema.create();

// 选择字段
schema.addSelect("id,code,name");
schema.addSelect("a as b");  // 别名

// 条件
schema.addCondition(QueryConditionGroup.and(...));

// 关联
schema.addJoin(new QueryJoin("子表名", "joinExpr", "left,alone"));

// 分组
schema.addGroupBy("pk_org");
schema.addHaving(QueryCondition.name("sum(nastnum)").gt(100));

// 排序
schema.addOrderBy("billdate desc", "code asc");

// 分页
schema.addPager(1, 20);

// 去重
schema.distinct();

// 统计模式
schema.isCountSchema(true);
```

## QueryCondition 常用操作符

```java
// 等值/不等
QueryCondition.name("id").eq(1)
QueryCondition.name("id").not_eq(1)

// 比较
QueryCondition.name("amount").lt(100)
QueryCondition.name("amount").gt(100)
QueryCondition.name("amount").elt(100)  // <=
QueryCondition.name("amount").egt(100)  // >=

// 范围
QueryCondition.name("billdate").between(startDate, endDate)

// 模糊
QueryCondition.name("code").like("PO")
QueryCondition.name("code").left_like("PO")   // %PO
QueryCondition.name("code").right_like("PO")  // PO%

// IN/NOT IN
QueryCondition.name("pk_org").in(orgIds)
QueryCondition.name("pk_org").not_in(orgIds)

// 空值
QueryCondition.name("approver").is_null()
QueryCondition.name("approver").is_not_null()

// 子查询引用
QueryCondition.name("id").inRef("subSchemaName")
```

## QueryConditionGroup 组合条件

```java
// AND
QueryConditionGroup.and(c1, c2, ...)

// OR
QueryConditionGroup.or(c1, c2, ...)

// 嵌套组合
QueryConditionGroup.and(
    QueryCondition.name("dr").eq(0),
    QueryConditionGroup.or(
        QueryCondition.name("code").like(keyword),
        QueryCondition.name("name").like(keyword)
    )
)
```

## 主子表联查示例

```java
public List<Map<String, Object>> getDemoData(Long id) {
    QuerySchema querySchema = QuerySchema.create();
    querySchema.addSelect("code,name,pk_org");
    querySchema.addCondition(
        QueryConditionGroup.and(
            QueryCondition.name("id").eq(id),
            QueryCondition.name("dr").eq(0)
        )
    );

    // 关联子表
    QueryJoin purchaseOrders = new QueryJoin(
        "purchaseOrders",
        "purchaseOrders.mainid = id",
        "left,alone"
    );
    querySchema.addJoin(purchaseOrders);

    return billQueryRepository.queryMapBySchema("业务对象uri", querySchema, "领域编码");
}
```

## 常用查询模板

### 单表 + 多条件

```java
QuerySchema schema = QuerySchema.create()
    .addSelect("id,code,name,ts")
    .addCondition(QueryConditionGroup.and(
        QueryCondition.name("dr").eq(0),
        QueryCondition.name("code").like("PO"),
        QueryCondition.name("billdate").between(startDate, endDate)
    ))
    .addOrderBy("billdate desc", "code asc")
    .addPager(1, 20);
```

### AND/OR 组合条件

```java
QueryConditionGroup condition = QueryConditionGroup.and(
    QueryCondition.name("dr").eq(0),
    QueryConditionGroup.or(
        QueryCondition.name("code").like(keyword),
        QueryCondition.name("name").like(keyword)
    )
);
schema.addCondition(condition);
```

### Group By + Having

```java
schema.addSelect("pk_org,sum(nastnum) as total_num");
schema.addGroupBy("pk_org");
schema.addHaving(QueryCondition.name("sum(nastnum)").gt(100));
```

### Distinct + 分页

```java
schema.distinct()
    .addSelect("code,name")
    .addPager(1, 50);
```

## 常见错误与修复

| 错误 | 修复 |
|------|------|
| `schema.addCondition(QueryCondition.name(...))` | 改为 `schema.addCondition(QueryConditionGroup.and(QueryCondition.name(...)))` |
| `in(...)` 传空集合 | 先判空，或不拼该条件 |
| count查询保留分页/排序 | 使用 `isCountSchema(true)` |
| like查询手写SQL拼`%` | 使用 `like/left_like/right_like` |

## 注意事项

1. `addCondition()` 只接受 `QueryConditionGroup`，不是组对象会被忽略
2. `in/not_in/containsAny` 参数不能为空，否则抛异常
3. `eq(null)` 转为 `is null` 语义
4. `isCountSchema(true)` 会自动清理排序和分页
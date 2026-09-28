---
name: YonQL与SQL使用场景区分
description: >
  用友 BIP 客开技能。区分 ymsJdbcApi（原生 SQL）和 ObjectStore.queryByYonQL（YonQL）的使用场景，
  以及各层级字段名称的对应关系。当用户在 Java 代码中写查询语句时参考。
---

# YonQL 与 SQL 使用场景区分

> ⚠️ `billQueryRepository.queryBySchema` 仅适用于 **BIP 旗舰版**，NCC 不适用。NCC 使用 `nc.bs.dao.BaseDAO` 或原生 SQL。

## API 与查询语种对应

| API | 查询语种 | FROM | SELECT |
|-----|---------|------|--------|
| `ymsJdbcApi.queryForList/queryByClause` | **原生 SQL** | 物理表名 `orders` | 列名 `cOrderNo` |
| `ObjectStore.queryByYonQL` | **YonQL** | 实体 URI `voucher.order.Order` | 字段名 `code` |
| **`billQueryRepository.queryBySchema`** ⭐ | 实体查询（推荐） | 实体 URI `voucher.order.Order` | 字段名 `code` |
| `billQueryRepository.queryByIDs` | 实体查询 | 无需写 FROM | 字段名 `code` |

## 字段名称对照

| 层级 | 订单号字段 | 订单ID字段 |
|------|-----------|-----------|
| 数据库列 (`columnName`) | `cOrderNo` | `id` |
| Java 属性 (`name`) | `code` | `id` |
| 显示名 (`displayName`) | 单据编号 | ID |

## 示例

```java
// ⭐ 推荐：billQueryRepository.queryBySchema（实体查询，平台首选）
@Autowired
IBillQueryRepository billQueryRepository;

QuerySchema querySchema = QuerySchema.create()
    .addSelect("code")
    .appendQueryCondition(
        QueryCondition.name("id").eq(orderId),
        QueryCondition.name("dr").eq("0"),
        QueryCondition.name("tenant").eq(InvocationInfoProxy.getTenantid())  // 租户条件必加
    );
List<? extends IBillDO> orders = billQueryRepository.queryBySchema("voucher.order.Order", querySchema, "udinghuo");
String orderCode = orders.isEmpty() ? null : String.valueOf(orders.get(0).getAttrValue("code"));

// ❌ 不推荐：ymsJdbcApi 原生 SQL（绑定表名列名，不灵活）
String sql = "SELECT cOrderNo FROM orders WHERE id = ? AND dr = 0";
String orderCode = ymsJdbcApi.queryForObject(sql, new Object[]{orderId}, String.class);
```

## 查询必加租户条件

> ⚠️ 租户字段名**因实体而异**（如销售订单用 `ytenant`，交易类型用 `tenant`），不能统一写成 `tenant`。必须查实体元数据确认。

| 取值方式 | 示例 |
|---------|------|
| `InvocationInfoProxy.getTenantid()` | `QueryCondition.name("ytenant").eq(InvocationInfoProxy.getTenantid())` |
| `AppContext.getTenantId()` | `QueryCondition.name("ytenant").eq(AppContext.getTenantId())` |

---
name: QuerySchema根据自定义条件查询主子表数据
description: >
  用友 BIP 客开技能。当用户需要自定义 QuerySchema 查询主子表（包含子表和特征字段），使用 FindSchemaBuilder/ExpenseBillQueryBuilder 构建深度查询，以及使用 QueryExtraCondition 实现 OR 条件（如 NOT_EQ + IS_NULL）时，参考该文档内容。
---

# QuerySchema根据自定义条件查询主子表数据

## 构建主子表查询

使用 `FindSchemaBuilder` 按 entity 构建查询，depth 参数控制遍历深度：

```java
@Autowired
private MetadataSupportService metadataSupportService;

// 获取 entity，参数是 uri
IEntity entity = metadataSupportService.getEntityByUri("znbzbx.commonexpensebill.CommonExpenseBillVO");
// depth=4 控制遍历深度
QuerySchema querySchema = (QuerySchema) new ExpenseBillQueryBuilder().build(entity, 4);

List<IBillDO> expenseBillList = (List<IBillDO>) billQueryRepository.queryBySchema(
    "znbzbx.commonexpensebill.CommonExpenseBillVO", querySchema
);
```

## 拼接条件：字段 != Y OR IS NULL

```java
QueryCondition conA = QueryCondition.name("expensebillbs.vdef8").not_eq("Y");
conA.next(new QueryExtraCondition(ConditionOperator.or, ConditionOperator.is_null));

querySchema.appendQueryCondition(QueryCondition.name("expensebillbs.vdef3").eq(vdef21))
    .appendQueryCondition(QueryCondition.name("expensebillbs.vdef7").eq(vdef22))
    .appendQueryCondition(conA)
    .appendQueryCondition(QueryCondition.name("vouchdate").like(vdef20));
```

## 条件A OR A IS NULL

```java
QueryCondition conA = QueryCondition.name("expiryDate").egt(vouchdate);
conA.next(new QueryExtraCondition(ConditionOperator.or, ConditionOperator.is_null));

QuerySchema querySchema = QuerySchema.create()
    .addSelect(QuerySchema.PARTITION_ALL)
    .appendQueryCondition(QueryCondition.name("sourceSystem").eq(mgp302Id))
    .appendQueryCondition(QueryCondition.name("effectiveDate").elt(vouchdate))
    .appendQueryCondition(conA)
    .appendQueryCondition(QueryCondition.name("comparisonType").eq(defdocList.get(0).getAttrValue("id")));
```

## 字段A = xxx OR 字段B = xxx

```java
QueryConditionGroup finalCond = new QueryConditionGroup(ConditionOperator.or);
finalCond.addCondition(
    QueryCondition.name("mkOrgCode").eq(financeOrg),
    QueryCondition.name("mkOrgName").eq(financeOrg)
);

QuerySchema querySchema = QuerySchema.create()
    .addSelect("id", "bipOrg")
    .appendQueryCondition(finalCond,
        QueryCondition.name("ytenantId").eq(InvocationInfoProxy.getTenantid())
    );
```

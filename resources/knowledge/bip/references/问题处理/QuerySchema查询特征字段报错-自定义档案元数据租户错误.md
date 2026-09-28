---
name: QuerySchema查询特征字段报错-自定义档案元数据租户错误
description: >
  BIP 旗舰版使用 QuerySchema 查询特征字段时，部分特征字段（如 purInRecordsDefineCharacter.YWLXX）报错，
  原因是被参照的自定义档案的元数据租户被改为系统级(0)，修复方式是将租户 ID 更新回正确的租户。
project: 国投健康
version: BIP 旗舰版 V3R6
env: 开发
tags: [QuerySchema, 特征字段, 自定义档案, 元数据, 租户]
---

# QuerySchema 查询特征字段报错 — 自定义档案元数据租户错误

## 现象

```java
QuerySchema querySchema = QuerySchema.create()
    .addSelect("id", "mainid",
        "purInRecordsDefineCharacter.XM_JK",
        "purInRecordsDefineCharacter.YWLXX")   // ← 加了这个就报错
    .appendQueryCondition(
        QueryCondition.name("id").in("2417005284289937429"),
        QueryCondition.name("ytenant").eq(InvocationInfoProxy.getTenantid()));
```

- 查询 `purInRecordsDefineCharacter.XM_JK` 正常
- 查询 `purInRecordsDefineCharacter.YWLXX` 就报错
- 两个特征字段配置看起来完全一样，都分配了、都启用了
- 手动给数据库字段赋上值也查不出来

## 根因

特征字段 `YWLXX` 参照的是自定义档案 `bd.customerdoc_GTCW084.GTCW084`。该自定义档案的元数据记录在 `iuap_metadata_base.md_meta_class` 表中，其 `ytenant_id` 被改成了 `'0'`（系统级），而正常的自定义档案元数据应该是**租户级**（租户 ID）。

QuerySchema 查询时，特征字段的解析会校验租户归属，租户不匹配导致查询失败。

## 排查 SQL

```sql
-- 1. 查被改为系统级的自定义档案
SELECT * FROM iuap_metadata_base.md_meta_class
WHERE uri LIKE 'bd.customerdoc_GT%' AND ytenant_id = '0';

-- 2. 查具体档案的元数据
SELECT * FROM iuap_metadata_base.md_meta_class
WHERE uri = 'bd.customerdoc_GTCW084.GTCW084';

-- 3. 查组件元数据
SELECT * FROM iuap_metadata_base.md_meta_component
WHERE uri = 'bd.customerdoc_GTCW084';

-- 4. 查元数据值
SELECT * FROM iuap_metadata_base.md_term_value mg
WHERE mg.object_uri = 'bd.customerdoc_GTCW084.GTCW084';

-- 5. 查自定义档案定义
SELECT * FROM iuap_apdoc_basedoc.bd_cust_doc_def
WHERE code = 'GTCW084';
```

## 修复

```sql
-- 将所有被误改为系统级的自定义档案元数据统一修正为正确的租户 ID
UPDATE iuap_metadata_base.md_meta_class
SET ytenant_id = 'bgq1ldsj'
WHERE uri LIKE 'bd.customerdoc_GT%' AND ytenant_id = '0';
```

## 原理

BIP 平台中，自定义档案默认是租户级数据。元数据表中 `ytenant_id` 字段控制数据归属：
- `'0'` = 系统级（所有租户共享）
- `'bgq1ldsj'` 等 = 特定租户

如果被误改为系统级，QuerySchema 查询时租户校验逻辑会找不到该档案，导致特征字段查询失败。

> 如果其他特征字段也出现类似问题（有的能查有的不能），排查思路：查该特征字段参照的自定义档案，确认其元数据租户是否正确。

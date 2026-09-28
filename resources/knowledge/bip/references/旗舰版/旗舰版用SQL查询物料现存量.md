---
name: 旗舰版用SQL查询物料现存量
description: >
  用友 BIP 客开技能。当用户需要通过 SQL 或 API 查询物料现存量（根据物料编码、组织、仓库），计算可用量（availableqty），使用 ROW_NUMBER 取最大可用量行时，参考该文档内容。
---

# 旗舰版用SQL查询物料现存量

根据物料编码、销售组织、仓库，查询 `ustock.currentstock` 表，通过可用量计算规则计算 `availableqty`，使用 `ROW_NUMBER()` 取每组物料编码中最大可用量的行。

## SQL 查询方式

```java
public Map<String, List<Map<String, Object>>> queryProductCurrentStocksList2(Set<String> codesWithBatch,
        String salesOrgId, Long salesWarehouse) {
    if (CollectionUtils.isEmpty(codesWithBatch) || StringUtils.isBlank(salesOrgId) || salesWarehouse == null) {
        return null;
    }
    String inClause = codesWithBatch.stream()
            .map(code -> "'" + code.replace("'", "''") + "'")
            .collect(Collectors.joining(","));
    Map<String, List<Map<String, Object>>> resultMap = new HashMap<>();

    StringBuffer sql = new StringBuffer();
    sql.append("SELECT ");
    sql.append(" a.iOrgid AS org, a.iWarehouseId AS warehouse, a.iProductid AS product, ");
    sql.append(" pu.code AS product_code, a.iProductSkuid AS productsku, a.sbatchno AS batchno, ");
    sql.append(" a.stockStatusDoc AS stockStatusDoc, a.reserveid AS reserveid, ");
    sql.append(" a.inventoryowner AS inventoryowner, w.iJoinStockQuery AS iJoinStockQuery, ");
    sql.append(" a.iscs AS isCS, a.custodianid AS custodian, a.custodian_type AS custodianType, ");
    sql.append(" a.fcurrentqty AS currentqty, a.fcurrentSubQty AS currentSubQty, ");

    // availableqty = fcurrentqty + 预计入 - 预计出（根据可用量计算规则）
    // ... (完整 SQL 见下方说明)

    sql.append("FROM `ustock`.currentstock a ");
    sql.append("LEFT JOIN `ustock`.availablecheckrulesetting chs ON chs.org_id = a.iOrgid AND chs.ytenant_id = a.ytenant_id ");
    sql.append("LEFT JOIN `ustock`.available_check_rule_setting_detail chsd ON chs.id = chsd.main_id AND chsd.voucher_type = 'SCMSA1' ");
    sql.append("LEFT JOIN `ustock`.availablecalcrule calc ON calc.id = chsd.calc_rule_id ");
    sql.append("LEFT JOIN `ustock`.availablecalcrule calcd ON calcd.`code` = 'SYS001' AND calcd.ytenant_id = a.ytenant_id ");
    sql.append("LEFT JOIN `ustock`.st_stockstatusrecord s ON s.id = a.stockStatusDoc AND s.ytenant_id = a.ytenant_id ");
    sql.append("LEFT JOIN iuap_apdoc_coredoc.aa_warehouse w ON w.ytenant_id = a.ytenant_id AND w.id = a.iWarehouseId ");
    sql.append("LEFT JOIN iuap_apdoc_coredoc.product pu ON a.iProductid = pu.id AND pu.ytenant_id = a.ytenant_id ");
    sql.append("WHERE a.ytenant_id = '" + InvocationInfoProxy.getTenantid() + "' ");
    sql.append("  AND A.iWarehouseId = '" + salesWarehouse + "' ");
    sql.append("  AND a.iOrgid = '" + salesOrgId + "' ");
    sql.append("  AND pu.code IN (" + inClause + ") ");
    sql.append("  AND (s.code = '01' OR s.stock_available = 1) ");
    sql.append("  AND a.reserveid IN (0) ");
    sql.append("  AND a.custodian_type IN ('0') ");

    // 外层使用 ROW_NUMBER 取每组最大 availableqty
    StringBuilder fullSql = new StringBuilder();
    fullSql.append("SELECT * FROM ( ");
    fullSql.append("  SELECT *, ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY availableqty DESC) AS rn ");
    fullSql.append("  FROM ( ");
    fullSql.append(sql);
    fullSql.append("  ) AS t1 ");
    fullSql.append(") AS t2 ");
    fullSql.append("WHERE rn = 1");

    List<Map<String, Object>> currStockList = ymsJdbcApi.queryForList(fullSql.toString(), new MapListProcessor());
    if (CollectionUtils.isNotEmpty(currStockList)) {
        for (Map<String, Object> map : currStockList) {
            String productCode = map.get("product_code") == null ? "" : map.get("product_code").toString();
            List<Map<String, Object>> list = resultMap.get(productCode);
            if (list == null) {
                list = new ArrayList<>();
                resultMap.put(productCode, list);
            }
            list.add(map);
        }
    }
    return resultMap;
}
```

## API 查询方式

```java
public Map<String, List<Map<String, Object>>> queryProductCurrentStocksList(Set<String> codesWithBatch,
        String salesOrgId, Long salesWarehouse) {
    if (CollectionUtils.isEmpty(codesWithBatch) || StringUtils.isBlank(salesOrgId) || salesWarehouse == null) {
        return null;
    }
    Map<String, List<Map<String, Object>>> resultMap = new HashMap<>();
    Map<String, Object> reqMapForStock = new HashMap<>();
    reqMapForStock.put("org", salesOrgId);
    reqMapForStock.put("warehouse", salesWarehouse);
    reqMapForStock.put("productn.code", codesWithBatch);
    reqMapForStock.put("bStockStatusDocNotNull", true);
    reqMapForStock.put("billnum", "st_othoutrecord");
    List<Map<String, Object>> res = yonbipUtil.queryCurrentStocks(reqMapForStock);
    if (CollectionUtils.isNotEmpty(res)) {
        for (Map<String, Object> map : res) {
            String productCode = map.get("product_code") == null ? "" : map.get("product_code").toString();
            resultMap.computeIfAbsent(productCode, k -> new ArrayList<>()).add(map);
        }
    }
    return resultMap;
}

// YonBipUtil 中的现存量查询 API
public List<Map<String, Object>> queryCurrentStocks(Map<String, Object> reqMapForStock) {
    String CURRENTSTOCK_QUERY = "/yonbip/scm/stock/QueryCurrentStocksByCondition";
    return (List<Map<String, Object>>) doPost(UrlConstant.CURRENTSTOCK_QUERY, reqMapForStock);
}
```

## 涉及的数据库表

| 表 | 说明 |
|----|------|
| `ustock.currentstock` | 现存量主表 |
| `ustock.availablecheckrulesetting` + `available_check_rule_setting_detail` | 可用量检查规则 |
| `ustock.availablecalcrule` | 可用量计算规则（SYS001 为默认规则） |
| `ustock.st_stockstatusrecord` | 库存状态记录（code='01' 或 stock_available=1 为可用） |
| `iuap_apdoc_coredoc.aa_warehouse` | 仓库 |

## 关键逻辑

- `availableqty` = `fcurrentqty` + 预计入（采购订单、到货单等）- 预计出（销售订单、发货单等）
- 用 `ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY availableqty DESC)` 取每个物料可用量最大的行
- 指定 `billnum` 参数可过滤特定单据类型的可用量规则

---
name: 旗舰版获取税率id和税率值
description: >
  用友 BIP 客开技能。当用户需要获取税率 ID 和税率值，包括查询销售参数中的 TAXRATEPRIORITY 配置项（客户优先/物料优先），根据客户或物料档案获取销项税率，以及根据税率 ID 计算实际税率数值时，参考该文档内容。
---

# 旗舰版获取税率id和税率值

## 场景

销售订单接口中，表体需要税率但对方系统不传，需要根据销售参数中的"取税率优先"配置项自行获取。

逻辑：查询销售参数 → 判断 TAXRATEPRIORITY 是客户优先还是物料优先 → 获取对应档案的销项税率。

## 查询销售参数中的税率优先配置

```sql
SELECT DISTINCT
    d.NAME, d.caption, d.defaultvalue, d.VALUE,
    d.ideleted, d.optionid, d.ordernum, d.tenant_id,
    d.orgid, d.storeid, d.paramstype, d.caption_resid,
    d.ytenant_id, m.groupcode, m.fieldtype
FROM `uorders`.pub_option_data d
LEFT JOIN `uorders`.pub_option_meta m
    ON d.NAME = m.fieldname AND d.optionid = m.optionid
WHERE d.orgid IS NULL
  AND d.storeid IS NULL
  AND m.ideleted = 0
  AND d.ideleted = 0
  AND d.name = 'TAXRATEPRIORITY';

-- VALUE 取值: {"AGENT_PRIORITY":"优先客户档案","PRODUCT_PRIORITY":"优先物料档案"}
```

## Java 代码获取税率

```java
// 根据销售参数获取税率
@SuppressWarnings("all")
public String getTaxRateBySaleParams(String productCode, String customerId, String orgId) {
    // 首先根据组织Id查询销售参数
    StringBuilder buf = new StringBuilder();
    buf.append(" SELECT DISTINCT ");
    buf.append(" d.NAME,d.caption,d.defaultvalue,d.VALUE,d.ideleted,d.optionid,d.ordernum,d.tenant_id,d.orgid,d.storeid, ");
    buf.append(" d.paramstype,d.caption_resid,d.ytenant_id,m.groupcode,m.fieldtype ");
    buf.append(" FROM `uorders`.pub_option_data d ");
    buf.append(" LEFT JOIN `uorders`.pub_option_meta m ON ");
    buf.append(" d.NAME = m.fieldname AND d.optionid = m.optionid ");
    buf.append(" WHERE m.ideleted = 0 AND d.ideleted = 0 AND d.name = 'TAXRATEPRIORITY' ");
    buf.append(" AND ((d.ytenant_id = '0' AND (orgid IS NULL OR orgid = '')) ");
    buf.append(" OR (d.ytenant_id = '" + InvocationInfoProxy.getTenantid() + "' AND orgid = '" + orgId + "')) ");

    List<Map<String, Object>> resMap = (List<Map<String, Object>>) ymsJdbcApi.queryForList(buf.toString(),
            new MapListProcessor());
    if (resMap == null || resMap.size() == 0) {
        throw new BusinessException("999", "获取销售参数失败！");
    }

    Map<String, Object> paramMap = new HashMap<>();
    for (Map<String, Object> map : resMap) {
        String orgid = (String) map.get("orgid");
        String ytenant_id = (String) map.get("ytenant_id");
        if (StringUtils.isBlank(orgid) && "0".equals(ytenant_id)) {
            paramMap.put("0", map.get("VALUE").toString());
        } else if (ytenant_id.equals(InvocationInfoProxy.getTenantid()) && orgid.equals(orgId)) {
            paramMap.put(map.get("orgid").toString(), map.get("VALUE"));
        }
    }

    // 优先取组织级参数，没有再取集团级，默认客户优先
    String taxParam = (String) paramMap.get(orgId);
    if (StringUtils.isBlank(taxParam)) {
        taxParam = (String) paramMap.get("0");
    }
    if (StringUtils.isBlank(taxParam)) {
        taxParam = "AGENT_PRIORITY";
    }

    if ("AGENT_PRIORITY".equals(taxParam)) {
        String taxRate = getTaxIdByCustomerId(customerId);
        if (StringUtils.isBlank(taxRate)) {
            taxRate = getTaxIdByProductCode(productCode);
        }
        if (StringUtils.isBlank(taxRate)) {
            throw new BusinessException("999", "获取物料税率失败！客户档案和物料档案上的销项税率均未维护！");
        }
        return taxRate;
    } else if ("PRODUCT_PRIORITY".equals(taxParam)) {
        String taxRate = getTaxIdByProductCode(productCode);
        if (StringUtils.isBlank(taxRate)) {
            taxRate = getTaxIdByCustomerId(customerId);
        }
        if (StringUtils.isBlank(taxRate)) {
            throw new BusinessException("999", "获取物料税率失败！客户档案和物料档案上的销项税率均未维护！");
        }
        return taxRate;
    }
    return null;
}

// 从客户档案获取销项税率
@SuppressWarnings("all")
private String getTaxIdByCustomerId(String customerId) {
    StringBuilder buf = new StringBuilder();
    buf.append(" SELECT tax_rate_id,merchant_id ");
    buf.append(" FROM iuap_apdoc_coredoc.merchant_detail WHERE merchant_id = '" + customerId
            + "' AND ytenant_id = '" + InvocationInfoProxy.getTenantid() + "' ");
    List<Map<String, Object>> resMap = (List<Map<String, Object>>) ymsJdbcApi.queryForList(buf.toString(),
            new MapListProcessor());
    if (resMap != null && resMap.size() > 0) {
        return resMap.get(0).get("tax_rate_id").toString();
    }
    return null;
}

// 从物料档案获取销项税率
@SuppressWarnings("all")
private String getTaxIdByProductCode(String productCode) {
    String tenantId = InvocationInfoProxy.getTenantid();
    StringBuilder buf = new StringBuilder();
    buf.append(" SELECT DISTINCT a.outTaxrate,b.code,b.id,c.ntaxrate,c.calculate_coefficient ");
    buf.append(" FROM iuap_apdoc_coredoc.productdetail a ");
    buf.append(" INNER JOIN iuap_apdoc_coredoc.product b ON a.productId = b.id ");
    buf.append(" LEFT JOIN iuap_apdoc_basedoc.bd_taxrate c ON a.outTaxrate = c.id ");
    buf.append(" WHERE b.code = '" + productCode + "' ");
    buf.append(" AND b.ytenant_id = '" + tenantId + "' AND a.ytenant_id = '" + tenantId + "' AND c.ytenant_id = '0' ");
    List<Map<String, Object>> resMap = (List<Map<String, Object>>) ymsJdbcApi.queryForList(buf.toString(),
            new MapListProcessor());
    if (resMap != null && resMap.size() > 0) {
        return resMap.get(0).get("outTaxrate").toString();
    }
    return null;
}
```

## 根据税率 ID 计算实际税率值

查到的是税率参照的 ID（赋给 `taxId` 字段），`taxRate` 字段需要传数值，需通过 `ntaxrate / calculate_coefficient` 计算：

```java
public String getTaxRateById(String taxId) {
    StringBuilder buf = new StringBuilder();
    buf.append(" SELECT id, ntaxrate, calculate_coefficient ");
    buf.append(" FROM iuap_apdoc_basedoc.bd_taxrate WHERE id = '" + taxId + "' ");
    List<Map<String, Object>> res = (List<Map<String, Object>>) ymsJdbcApi.queryForList(buf.toString(),
            new MapListProcessor());
    if (res != null && res.size() > 0) {
        BigDecimal value = res.get(0).get("ntaxrate") == null ? BigDecimal.ZERO
                : new BigDecimal(res.get(0).get("ntaxrate").toString()).setScale(6, BigDecimal.ROUND_HALF_UP);
        BigDecimal coefficient = res.get(0).get("calculate_coefficient") == null ? BigDecimal.ZERO
                : new BigDecimal(res.get(0).get("calculate_coefficient").toString()).setScale(6, BigDecimal.ROUND_HALF_UP);
        if (coefficient.compareTo(BigDecimal.ZERO) > 0) {
            return value.divide(coefficient).setScale(6, BigDecimal.ROUND_HALF_UP).toString();
        }
    }
    return null;
}
```

## 涉及的数据库表

| 表 | 说明 |
|----|------|
| `uorders.pub_option_data` + `uorders.pub_option_meta` | 销售参数配置（TAXRATEPRIORITY） |
| `iuap_apdoc_coredoc.merchant_detail` | 客户档案销项税率（outTaxrate） |
| `iuap_apdoc_coredoc.productdetail` | 物料档案销项税率（outTaxrate） |
| `iuap_apdoc_basedoc.bd_taxrate` | 税率基础档案（ntaxrate, calculate_coefficient） |

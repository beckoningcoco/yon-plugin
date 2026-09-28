---
name: 实时获取单据的业务流Id
description: >
  用友 BIP 客开技能。当用户需要在接口中动态获取单据的业务流 ID（bizFlow），以便调用保存接口时传入，使单据审核后自动推下游单据（如调拨订单自动推调拨出库单）时，参考该文档内容。
---

# 实时获取单据的业务流Id (bizFlow)

- 接口生成并审核一张调拨订单后，系统中配置了业务流，审核后会自动推下游调出单，需要在保存接口的报文表头传入 `bizFlow` 字段：

```java
reqBody.put("bizFlow", bizFlowId);
```

## 动态获取 bizFlow

根据交易类型查询业务流 ID。业务流可能是组织级或集团级（集团级 `org_id` 为空）：

```java
@SuppressWarnings("all")
private String getTransferApplyVBizFlow(String transtypeId) {
    StringBuilder buf = new StringBuilder();
    buf.append(" SELECT * FROM iuap_apcom_businesssflow.business_flow WHERE ytenant_id = '"
            + InvocationInfoProxy.getTenantid() + "' ");
    buf.append(" AND is_current_version = 1 AND dr = 0 ");
    buf.append(" AND transaction_type_id = '" + transtypeId + "' ");
    buf.append(" AND sub_id = 'GYLFW' AND (org_id IS NULL OR org_id = '') ");
    List<Map<String, Object>> res = (List<Map<String, Object>>) ymsJdbcApi.queryForList(buf.toString(),
            new MapListProcessor());
    if (res != null && res.size() > 0) {
        return res.get(0).get("id").toString();
    }
    return null;
}
```

## 涉及的表

| 表 | 说明 |
|----|------|
| `iuap_apcom_businesssflow.business_flow` | 业务流配置表 |

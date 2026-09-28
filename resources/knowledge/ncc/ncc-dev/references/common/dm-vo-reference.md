# NCC 运输管理模块（dm）VO 与表名对照表

---

## 一、运输状态

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 运输状态 | `deliverystatus` | `nc.vo.dm.m4802.entity.DelivStatusVO.SourceBillDeliveryStatus` |

> ⚠️ **注意**：该 VO 为内部类引用形式（`DelivStatusVO.SourceBillDeliveryStatus`），请以实际代码为准。

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 运输状态 | `dm_delivstatus` | `nc.vo.dm.delivstatus.entity.DelivStatusVO` |

## 二、应付运费发票

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 应付运费发票主实体 | `dm_apinvoice` | `nc.vo.dm.m4812.entity.ApInvoiceHVO` |
| 表体 | 应付运费发票子实体 | `dm_apinvoice_b` | `nc.vo.dm.m4812.entity.ApInvoiceBVO` |
| 表体 | 核销明细 | `dm_verifydetail` | `nc.vo.dm.m4812.entity.ApVerifyDetailVO` |

> 聚合 VO：`nc.vo.dm.m4812.entity.ApInvoiceVO`

## 三、应付运费结算

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 应付运费结算单主实体 | `dm_apsettle` | `nc.vo.dm.apsettle.entity.ApSettleHVO` |
| 表体 | 应付费用项子实体 | `dm_apsettle_b` | `nc.vo.dm.apsettle.entity.ApSettleBVO` |
| 表体 | 应付结算组织费用项子实体 | `dm_apsettle_f` | `nc.vo.dm.apsettle.entity.ApSettleFVO` |

> 聚合 VO：`nc.vo.dm.apsettle.entity.ApSettleVO`

### 应付运费明细

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 应付运费明细实体 | `dm_apsettldetail` | `nc.vo.dm.apsettle.Entity.ApSettleDetailVO` |

> ⚠️ **注意**：`nc.vo.dm.apsettle.Entity` 中 `Entity` 首字母大写，不符合 Java 包名全小写规范（应为 `entity`）。

## 四、应收运费发票

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 应收运费发票主实体 | `dm_arinvoice` | `nc.vo.dm.m4814.entity.ArInvoiceHVO` |
| 表体 | 应收运费发票子实体 | `dm_arinvoice_b` | `nc.vo.dm.m4814.entity.ArInvoiceBVO` |

> 聚合 VO：`nc.vo.dm.m4814.entity.ArInvoiceVO`

## 五、批量分级

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 批量分级主实体 | `dm_batrange` | `nc.vo.dm.policy.entity.BatchRangeHVO` |
| 表体 | 批量分级子实体 | `dm_batrange_b` | `nc.vo.dm.policy.entity.BatchRangeBVO` |

> 聚合 VO：`nc.vo.dm.policy.entity.BatchRangeVO`

## 六、运输申请单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 运输申请单主表 | `dm_delivapply` | `nc.vo.dm.m4802.entity.DelivapplyHVO` |
| 表体 | 运输申请单子表 | `dm_delivapply_b` | `nc.vo.dm.m4802.entity.DelivapplyBVO` |

> 聚合 VO：`nc.vo.dm.m4802.entity.DelivapplyVO`

## 七、运输单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 运输单主表 | `dm_delivbill` | `nc.vo.dm.m4804.entity.DelivBillHVO` |
| 表体 | 运输单子表 | `dm_delivbill_b` | `nc.vo.dm.m4804.entity.DelivBillBVO` |
| 表体 | 运输包装单 | `dm_packbill` | `nc.vo.dm.m4804.entity.DelivBillPackVO` |

> 聚合 VO：`nc.vo.dm.m4804.entity.DelivBillAggVO`

## 八、运输单据交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 运输单据交易类型 | `dm_delivtype` | `nc.vo.dm.m4804trantype.entity.M4804TranTypeVO` |

## 九、应付运费策略定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 应付运费策略定义主实体 | `dm_feeplcy` | `nc.vo.dm.policy.entity.FeePlcyHVO` |
| 表体 | 费用项子实体 | `dm_feeplcy_fee` | `nc.vo.dm.policy.entity.FeePlcyFeeVO` |
| 表体 | 价格项子实体 | `dm_feeplcy_prc` | `nc.vo.dm.policy.entity.FeePlcyPrcVO` |

> 聚合 VO：`nc.vo.dm.policy.entity.FeePlcyVO`

## 十、应付运费价格表维护

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 应付运费价格表维护实体 | `dm_feetariff` | `nc.vo.dm.tariff.entity.FeeTariffDetailVO` |
| 表体 | 批量价格表 | `dm_feetariff_bat` | `nc.vo.dm.tariff.entity.FeeTariffBatVO` |

> 聚合 VO：`nc.vo.dm.tariff.entity.FeeTariffVO`

## 十一、应付运费价格表定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 应付运费价格表主实体 | `dm_feetariffdef` | `nc.vo.dm.tariffdef.entity.FeeTariffDefHVO` |
| 表体 | 应付运费价格表子实体 | `dm_feetariffdef_b` | `nc.vo.dm.tariffdef.entity.FeeTariffDefBVO` |

> 聚合 VO：`nc.vo.dm.tariffdef.entity.FeeTariffDefVO`

## 十二、运费函数

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 运费取数函数 | `dm_formular` | `nc.vo.dm.formula.entity.FormularVO` |
| 运费业务函数 | `dm_func` | `nc.vo.dm.func.entity.FuncVO` |

## 十三、应付运费发票交易类型属性

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 应付运费发票交易类型属性 | `dm_m4812trantype` | `nc.vo.dm.m4812trantype.entity.M4812TranTypeVO` |

## 十四、任务单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 任务单主表 | `dm_missionbill_h` | `nc.vo.dm.m4806.entity.MissionBillHVO` |
| 表体 | 任务单子表 | `dm_missionbill_b` | `nc.vo.dm.m4806.entity.MissionBillBVO` |

> 聚合 VO：`nc.vo.dm.m4806.entity.MissionBillVO`

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 运输状态 | 2 |
| 应付运费发票 | 4 |
| 应付运费结算 | 4 |
| 应收运费发票 | 3 |
| 批量分级 | 3 |
| 运输申请单 | 3 |
| 运输单 | 4 |
| 运输单据交易类型 | 1 |
| 应付运费策略定义 | 4 |
| 应付运费价格表维护 | 3 |
| 应付运费价格表定义 | 3 |
| 运费函数 | 2 |
| 应付运费发票交易类型属性 | 1 |
| 任务单 | 3 |
| **合计** | **40** |

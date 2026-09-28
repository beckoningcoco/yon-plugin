# NCC 内部交易模块（to）VO 与表名对照表

---

## 一、分货单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 分货单主实体 | `to_allot` | `nc.vo.to.m5j.entity.AllotHeadVO` |
| 表体 | 分货单子实体 | `to_allot_b` | `nc.vo.to.m5j.entity.AllotItemVO` |

> 聚合 VO：`nc.vo.to.m5j.entity.AllotVO`

## 二、调入申请

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 调入申请主实体 | `to_apply` | `nc.vo.to.m5a.entity.TransInHeadVO` |
| 表体 | 调入申请子实体 | `to_apply_b` | `nc.vo.to.m5a.entity.TransInBodyVO` |

> 聚合 VO：`nc.vo.to.m5a.entity.TransInVO`

## 三、调拨订单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 调拨订单主实体 | `to_bill` | `nc.vo.to.m5x.entity.BillHeaderVO` |
| 表体 | 调拨订单子实体 | `to_bill_b` | `nc.vo.to.m5x.entity.BillItemVO` |

> 聚合 VO：`nc.vo.to.m5x.entity.BillVO`

## 四、调拨订单修订

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 调拨订单修订主实体 | `to_billhistory` | `nc.vo.to.m5x.entity.BillHistoryHeadVO` |
| 表体 | 调拨订单修订子实体 | `to_billhistory_b` | `nc.vo.to.m5x.entity.BillHistoryItemVO` |

> 聚合 VO：`nc.vo.to.m5x.entity.BillHistoryVO`

## 五、内部交易信息

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 内部交易信息主表 | `to_businessinfo` | `nc.vo.to.businessinfo.entity.BusinessinfoHVO` |
| 表体 | 内部交易信息子表 | `to_businessinfo_b` | `nc.vo.to.businessinfo.entity.BusinessinfoBVO` |
| 表体 | 内部交易信息子子表 | `to_businessinfo_bb` | `nc.vo.to.businessinfo.entity.BusinessinfoBBVO` |

> 聚合 VO：`nc.vo.to.businessinfo.entity.BusinessinfoVO`

## 六、费用结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 费用结算单主实体 | `to_feesettle` | `nc.vo.to.m4552.entity.FeeSettleBillHeaderVO` |
| 表体 | 费用结算单子实体 | `to_feesettle_b` | `nc.vo.to.m4552.entity.FeeSettleBillItemVO` |
| 表体 | 费用结算单子子实体 | `to_feesettle_bb` | `nc.vo.to.m4552.entity.FeeSettleBillLineVO` |

> 聚合 VO：`nc.vo.to.m4552.entity.FeeSettleBillVO`

## 七、费用结算采购入

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 费用结算采购入 | `to_fori9puin` | `nc.vo.to.m4552.entity.ForI9PuInHeaderVO` |
| 表体 | 费用结算采购入明细 | `to_fori9puin_b` | `nc.vo.to.m4552.entity.ForI9PuInItemVO` |

> 聚合 VO：`nc.vo.to.m4552.entity.ForI9TransInVO`

## 八、费用结算调拨入

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 费用结算调拨入 | `to_fori9transin` | `nc.vo.to.m4552.entity.ForI9TransInHeaderVO` |
| 表体 | 费用结算调拨入明细 | `to_fori9transin_b` | `nc.vo.to.m4552.entity.ForI9TransInItemVO` |

> 聚合 VO：`nc.vo.to.m4552.entity.ForI9TransInVO`

> ⚠️ **注意**：费用结算采购入（七）和费用结算调拨入（八）的聚合 VO 完全相同（`ForI9TransInVO`），疑似其中一处有误，请以实际代码为准。

## 九、结算清单金税发票

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 结算清单金税发票主实体 | `to_goldentax` | `nc.vo.to.m4551.entity.GoldenTaxHeaderVO` |
| 表体 | 结算清单金税发票子实体 | `to_goldentax_b` | `nc.vo.to.m4551.entity.GoldenTaxItemVO` |

> 聚合 VO：`nc.vo.to.m4551.entity.GoldenTaxVO`

## 十、交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 调入申请交易类型 | `to_m5atrantype` | `nc.vo.to.m5atrantype.entity.M5aTranTypeVO` |
| 调拨订单交易类型 | `to_m5xtrantype` | `nc.vo.to.m5xtrantype.entity.M5xTranTypeVO` |

## 十一、要货月计划

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 要货月计划主表 | `to_mointraplan` | `nc.vo.to.m5p.entity.MoIntraPlanHeadVO` |
| 表体 | 要货月计划子表 | `to_mointraplan_b` | `nc.vo.to.m5p.entity.MoIntraPlanBodyVO` |

> 聚合 VO：`nc.vo.to.m5p.entity.MoIntraPlanVO`

## 十二、待结算调入单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 待结算调入单主实体 | `to_presettlein` | `nc.vo.to.m5n.entity.PreSettleInHeaderVO` |
| 表体 | 待结算调入单子实体 | `to_presettlein_b` | `nc.vo.to.m5n.entity.PreSettleInItemVO` |
| 表体 | 待结算调入单子子实体 | `to_presettlein_bb` | `nc.vo.to.m5n.entity.PreSettleInLineVO` |

> 聚合 VO：`nc.vo.to.m5n.entity.PreSettleInVO`

## 十三、待结算调出单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 待结算调出单主实体 | `to_presettleout` | `nc.vo.to.m5m.entity.PreSettleOutHeaderVO` |
| 表体 | 待结算调出单子实体 | `to_presettleout_b` | `nc.vo.to.m5m.entity.PreSettleOutItemVO` |
| 表体 | 待结算调出单子子实体 | `to_presettleout_bb` | `nc.vo.to.m5m.entity.PreSettleOutLineVO` |

> 聚合 VO：`nc.vo.to.m5m.entity.PreSettleOutVO`

## 十四、转财务调入

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 转财务调入主实体 | `to_settlein` | `nc.vo.to.m5f.entity.STranFinInHeadVO` |
| 表体 | 转财务调入子实体 | `to_settlein_b` | `nc.vo.to.m5f.entity.STranFinInItemVO` |

> 聚合 VO：`nc.vo.to.m5f.entity.STranFinInAggVO`

## 十五、结算清单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 结算清单主实体 | `to_settlelist` | `nc.vo.to.m5f.entity.SettleListHeaderVO` |
| 表体 | 结算清单子实体 | `to_settlelist_b` | `nc.vo.to.m5f.entity.SettleListItemVO` |
| 表体 | 结算清单子子实体 | `to_settlelist_bb` | `nc.vo.to.m5f.entity.SettleListLineVO` |

> 聚合 VO：`nc.vo.to.m5f.entity.SettleListVO`

## 十六、转财务调出

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 转财务调出主实体 | `to_settleout` | `nc.vo.to.m5f.entity.STranFinOutHeadVO` |
| 表体 | 转财务调出子实体 | `to_settleout_b` | `nc.vo.to.m5f.entity.STranFinOutItemVO` |

> 聚合 VO：`nc.vo.to.m5f.entity.STranFinOutAggVO`

## 十七、结算路径

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 结算路径主表 | `to_settlepath` | `nc.vo.to.settlepath.entity.SettlePathHVO` |
| 表体 | 结算路径子表 | `to_settlepath_b` | `nc.vo.to.settlepath.entity.SettlePathBVO` |

> 聚合 VO：`nc.vo.to.settlepath.entity.SettlePathVO`

## 十八、结算规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 结算规则主表 | `to_settlerule` | `nc.vo.to.settlerule.entity.SettleRuleHVO` |
| 表体 | 结算规则子表 | `to_settlerule_b` | `nc.vo.to.settlerule.entity.SettleRuleBVO` |

> 聚合 VO：`nc.vo.to.settlerule.entity.SettleRuleAggVO`

## 十九、转财务待结算调入

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 转财务待结算调入主实体 | `to_transpresettlein` | `nc.vo.to.m5n.entity.TransPreSettleInHeaderVO` |
| 表体 | 转财务待结算调入子实体 | `to_transpresettlein_b` | `nc.vo.to.m5n.entity.TransPreSettleInItemVO` |

> 聚合 VO：`nc.vo.to.m5n.entity.TransPreSettleInVO`

## 二十、转财务待结算调出

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 转财务待结算调出主实体 | `to_transpresettleout` | `nc.vo.to.m5m.entity.TransPreSettleOutHeaderVO` |
| 表体 | 转财务待结算调出子实体 | `to_transpresettleout_b` | `nc.vo.to.m5m.entity.TransPreSettleOutItemVO` |

> 聚合 VO：`nc.vo.to.m5m.entity.TransPreSettleOutVO`

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 分货单 | 3 |
| 调入申请 | 3 |
| 调拨订单 | 3 |
| 调拨订单修订 | 3 |
| 内部交易信息 | 4 |
| 费用结算单 | 4 |
| 费用结算采购入 | 3 |
| 费用结算调拨入 | 3 |
| 结算清单金税发票 | 3 |
| 交易类型 | 2 |
| 要货月计划 | 3 |
| 待结算调入单 | 4 |
| 待结算调出单 | 4 |
| 转财务调入 | 3 |
| 结算清单 | 4 |
| 转财务调出 | 3 |
| 结算路径 | 3 |
| 结算规则 | 3 |
| 转财务待结算调入 | 3 |
| 转财务待结算调出 | 3 |
| **合计** | **65** |

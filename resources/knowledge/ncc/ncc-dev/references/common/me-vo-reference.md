# NCC 营销费用管理模块（me）VO 与表名对照表

---

## 一、营销费用归集分摊规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 营销费用归集分摊规则主实体 | `me_allotset` | `nc.vo.me.allotset.entity.AllotSetHVO` |
| 表体 | 营销费用归集分摊规则子实体 | `me_allotset_b` | `nc.vo.me.allotset.entity.AllotSetBVO` |

> 聚合 VO：`nc.vo.me.allotset.entity.AllotSetVO`

## 二、归集数据核算要素

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 归集数据核算要素 | `me_billelement` | `nc.vo.me.collectorder.entity.BillElement` |

> ⚠️ **注意**：该类名 `BillElement` 不以 `VO` 结尾，请以实际代码为准。

## 三、营销费用归集设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 营销费用归集设置 | `me_collectrule` | `nc.vo.me.collectrule.entity.CollectRuleVO` |

## 四、营销费用归集单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 营销费用归集单主实体 | `me_combine` | `nc.vo.me.collectorder.entity.CombineHVO` |
| 表体 | 营销费用归集单分摊实体 | `me_combine_allot` | `nc.vo.me.collectorder.entity.CombineAllotVO` |
| 表体 | 营销费用归集单归集子实体 | `me_combine_b` | `nc.vo.me.collectorder.entity.CombineBVO` |

> 聚合 VO：`nc.vo.me.collectorder.entity.AggCombineVO`

## 五、营销费用归集要素对照设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 营销费用归集要素对照设置 | `me_facrelset` | `nc.vo.me.facrelationset.entity.FacRelSetVO` |

## 六、客户费用申请

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 客户费用申请 | `me_feeapply` | `nc.vo.me.m4641.entity.BillHeadVO` |
| 表体 | 客户费用申请明细 | `me_feeapply_b` | `nc.vo.me.m4641.entity.BillItemVO` |

> 聚合 VO：`nc.vo.me.m4641.entity.BillVO`

## 七、营销费用归集单交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 营销费用归集单交易类型 | `me_m4640trantype` | `nc.vo.me.m4640trantype.entity.M4640TranTypeVO` |

## 八、客户费用申请交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 客户费用申请交易类型 | `me_m4641trantype` | `nc.vo.me.m4641trantype.entity.M4641TranTypeVO` |

## 九、助促销品申请

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 助促销品费用申请单 | `me_matterref` | `nc.vo.me.matterapp.entity.MatterAppRef` |
| 表体 | 助促销品信息 | `me_pushref` | `nc.vo.me.matterapp.entity.PushSaleRef` |

> 聚合 VO：`nc.vo.me.matterapp.entity.MatterAppRefAggVO`

> ⚠️ **注意**：`MatterAppRef` 不以 `VO` 结尾，请以实际代码为准。

## 十、助促销品出库核算

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 助促销品出库核算表 | `me_promotsale` | `nc.vo.me.salesaccount.entity.PromotSalesVO` |

## 十一、助促销品申请单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 助促销品申请 | `me_promtapply` | `nc.vo.me.m4642.entity.BillHeadVO` |
| 表体 | 助促销品申请明细 | `me_promtapply_b` | `nc.vo.me.m4642.entity.BillItemVO` |

> 聚合 VO：`nc.vo.me.m4642.entity.BillVO`

## 十二、费用申请单助促销品申请

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 费用申请单助促销品申请实体 | `me_pushsale` | `nc.vo.me.matterapp.entity.PushsaleVO` |

## 十三、销售订单收入还原

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 销售订单收入还原 | `me_saleorderpro` | `nc.vo.me.collectorder.entity.SaleOrderProVO` |

## 十四、销售出库收益

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 销售出库收益表 | `me_saleoutpro` | `nc.vo.me.collectorder.entity.SaleOutProVO` |

## 十五、返利分摊明细

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 返利分摊明细 | `me_settleallot` | `nc.vo.me.collectorder.entity.SettleAllotVO` |

## 十六、赠品兑付物料范围设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 赠品兑付物料范围设置主实体 | `so_lrgcashmar` | `nc.vo.me.lrgcashmar.entity.LrgCashMarHVO` |
| 表体 | 赠品兑付物料范围设置子实体 | `so_lrgcashmar_b` | `nc.vo.me.lrgcashmar.entity.LrgCashMarBVO` |

> 聚合 VO：`nc.vo.me.lrgcashmar.entity.LrgCashMarVO`

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 营销费用归集分摊规则 | 3 |
| 归集数据核算要素 | 1 |
| 营销费用归集设置 | 1 |
| 营销费用归集单 | 4 |
| 营销费用归集要素对照设置 | 1 |
| 客户费用申请 | 3 |
| 营销费用归集单交易类型 | 1 |
| 客户费用申请交易类型 | 1 |
| 助促销品申请 | 3 |
| 助促销品出库核算 | 1 |
| 助促销品申请单 | 3 |
| 费用申请单助促销品申请 | 1 |
| 销售订单收入还原 | 1 |
| 销售出库收益 | 1 |
| 返利分摊明细 | 1 |
| 赠品兑付物料范围设置 | 3 |
| **合计** | **29** |

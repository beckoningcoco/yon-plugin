# NCC 销售价格模块（price）VO 与表名对照表

---

## 一、基准折扣调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 基准折扣调整单主实体 | `prm_adjdiscount` | `nc.vo.price.adjustdiscount.entity.AdjustDiscountHeaderVO` |
| 表体 | 基准折扣调整单子实体 | `prm_adjdiscount_b` | `nc.vo.price.adjustdiscount.entity.AdjustDiscountItemVO` |

> 聚合 VO：`nc.vo.price.adjustdiscount.entity.AdjustDiscountVO`

## 二、价格调整单交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 价格调整单交易类型 | `prm_adjpricetype` | `nc.vo.price.adjustprice.m4311trantype.entity.M4311TranTypeVO` |

## 三、促销价格调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 促销价格调整单 | `prm_adjpromote` | `nc.vo.price.adjustpromote.entity.AdjustPromoteHeaderVO` |
| 表体 | 促销价格调整单明细 | `prm_adjpromote_b` | `nc.vo.price.adjustpromote.entity.AdjustPromoteItemVO` |

> 聚合 VO：`nc.vo.price.adjustpromote.entity.AdjustPromoteVO`

## 四、价格调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 价格调整单 | `prm_adjustprice` | `nc.vo.price.adjustprice.entity.AdjustPriceHVO` |
| 表体 | 价格调整单明细 | `prm_adjustprice_b` | `nc.vo.price.adjustprice.entity.AdjustPriceBVO` |

> 聚合 VO：`nc.vo.price.adjustprice.entity.AdjustPriceAggVO`

## 五、基准折扣

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 基准折扣表明细 | `prm_basediscount` | `nc.vo.price.discount.entity.BaseDiscountDetailVO` |
| 基准折扣定义 | `prm_discountdef` | `nc.vo.price.discount.entity.BaseDiscountDefVO` |

## 六、批量分级

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 批量分级 | `prm_batchlevel` | `nc.vo.price.batchlevel.entity.BatchlevelVO` |

## 七、条件来源

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 条件来源 | `prm_conditionsrc` | `nc.vo.price.pricecondition.entity.PriceCondSourceVO` |

## 八、促销价格调整单交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 促销价格调整单交易类型 | `prm_m4313trantype` | `nc.vo.price.adjustpromote.trantype.M4313TranTypeVO` |

## 九、定价策略匹配

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 定价策略匹配 | `prm_policymatch` | `nc.vo.price.pricepolicymatch.entity.PricePolicyMatchVO` |

## 十、限量促销执行量

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 限量促销执行量实体 | `prm_pplimitexe` | `nc.vo.price.pplimitexe.PPLimitExeVO` |

## 十一、定价条件

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 定价条件 | `prm_pricecondition` | `nc.vo.price.pricecondition.entity.PriceConditionVO` |

## 十二、价格组成

### 价格组成主表

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 价格组成主实体 | `prm_priceform` | `nc.vo.price.pub.entity.PriceFormHVO` |
| 表体 | 价格组成子实体 | `prm_priceform_b` | `nc.vo.price.pub.entity.PriceFormBVO` |

> 聚合 VO：`nc.vo.price.pub.entity.PriceFormAggVO`

### 价格组成中间表

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 价格组成中间实体 | `prm_priceform_p` | `nc.vo.price.pub.entity.PriceFormTempHVO` |
| 表体 | 价格组成中间子实体 | `prm_priceform_b_p` | `nc.vo.price.pub.entity.PriceFormTempBVO` |

> 聚合 VO：`nc.vo.price.pub.entity.PriceFormTempAggVO`

## 十三、定价策略

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 定价策略 | `prm_pricepolicy` | `nc.vo.price.pricepolicy.entity.PricePolicyVO` |

## 十四、定价过程

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 定价过程主实体 | `prm_priceprocess` | `nc.vo.price.priceprocess.entity.PriceProcessHVO` |
| 表体 | 定价过程子实体 | `prm_priceprocess_b` | `nc.vo.price.priceprocess.entity.PriceProcessBVO` |

> 聚合 VO：`nc.vo.price.priceprocess.entity.AggPriceProcessVO`

## 十五、价格项与促销价格

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 价格项 | `prm_pricetype` | `nc.vo.price.pricetype.entity.PriceTypeVO` |
| 促销价格实体 | `prm_promoteprice` | `nc.vo.price.promoteprice.PromotePriceVO` |

## 十六、价目表

### 价目表维护

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 价目表维护 | `prm_tariff` | `nc.vo.price.tariff.entity.tariffdetail.TariffDetailVO` |

> ⚠️ **注意**：`tariffdetail` 包名全小写但未遵循驼峰命名，请以实际代码为准。

### 价目表定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 价目表定义 | `prm_tariffdef` | `nc.vo.price.tariff.entity.tariffdef.TariffDefHVO` |
| 表体 | 价目表引用价格项 | `prm_tariffrefitem` | `nc.vo.price.tariff.entity.tariffdef.TariffDefBVO` |

> 聚合 VO：`nc.vo.price.tariff.entity.tariffdef.TariffDefAggVO`

> ⚠️ **注意**：`tariffdef` 包名全小写但未遵循驼峰命名，请以实际代码为准。

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 基准折扣调整单 | 3 |
| 价格调整单交易类型 | 1 |
| 促销价格调整单 | 3 |
| 价格调整单 | 3 |
| 基准折扣 | 2 |
| 批量分级 | 1 |
| 条件来源 | 1 |
| 促销价格调整单交易类型 | 1 |
| 定价策略匹配 | 1 |
| 限量促销执行量 | 1 |
| 定价条件 | 1 |
| 价格组成 | 7 |
| 定价策略 | 1 |
| 定价过程 | 3 |
| 价格项与促销价格 | 2 |
| 价目表 | 5 |
| **合计** | **36** |

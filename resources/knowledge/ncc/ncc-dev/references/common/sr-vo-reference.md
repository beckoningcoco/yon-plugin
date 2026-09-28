# NCC 销售返利模块（sr）VO 与表名对照表

---

## 一、返利取数函数

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 返利取数函数 | `sr_formula` | `nc.vo.sr.formula.entity.FormulaVO` |

## 二、返利政策交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 返利政策交易类型 | `sr_m4620trantype` | `nc.vo.sr.policy.trantype.M4620TranTypeVO` |

## 三、返利政策修订

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 返利政策修订主实体 | `sr_plcy_r` | `nc.vo.sr.policy.revise.entity.PlcyReviseHVO` |
| 表体 | 结算方式范围修订子实体 | `sr_plcy_bal_r` | `nc.vo.sr.policy.revise.entity.PlcyBaltypeReviseVO` |
| 表体 | 计算规则修订子实体 | `sr_plcy_cal_r` | `nc.vo.sr.policy.revise.entity.PlcyCalruleReviseVO` |
| 表体 | 计算规则明细修订实体 | `sr_plcy_cald_r` | `nc.vo.sr.policy.revise.entity.PlcyCaldetReviseVO` |
| 表体 | 客户范围修订子实体 | `sr_plcy_cust_r` | `nc.vo.sr.policy.revise.entity.PlcyCustReviseVO` |
| 表体 | 价格项范围修订子实体 | `sr_plcy_item_r` | `nc.vo.sr.policy.revise.entity.PlcyPrcitemReviseVO` |
| 表体 | 物料维度修订子实体 | `sr_plcy_mar_r` | `nc.vo.sr.policy.revise.entity.PlcyMarReviseVO` |
| 表体 | 订单类型范围修订子实体 | `sr_plcy_ord_r` | `nc.vo.sr.policy.revise.entity.PlcyOrdtypeReviseVO` |
| 表体 | 销售组织范围修订子实体 | `sr_plcy_org_r` | `nc.vo.sr.policy.revise.entity.PlcyOrgReviseVO` |
| 表体 | 返利期间修订子实体 | `sr_plcy_period_r` | `nc.vo.sr.policy.revise.entity.PlcyPeriodReviseVO` |
| 表体 | 促销类型范围修订子实体 | `sr_plcy_prm_r` | `nc.vo.sr.policy.revise.entity.PlcyPromotTypeReviseVO` |
| 表体 | 收款单类型范围修订子实体 | `sr_plcy_rece_r` | `nc.vo.sr.policy.revise.entity.PlcyRecetypeReviseVO` |

> 聚合 VO：`nc.vo.sr.policy.revise.entity.PlcyReviseAggVO`

## 四、返利政策

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 返利政策主实体 | `sr_plcy` | `nc.vo.sr.policy.entity.PlcyHVO` |
| 表体 | 结算方式范围子实体 | `sr_plcy_baltype` | `nc.vo.sr.policy.entity.PlcyBaltypeVO` |
| 表体 | 计算规则明细实体 | `sr_plcy_caldet` | `nc.vo.sr.policy.entity.PlcyCaldetVO` |
| 表体 | 计算规则子实体 | `sr_plcy_calrule` | `nc.vo.sr.policy.entity.PlcyCalruleVO` |
| 表体 | 客户范围子实体 | `sr_plcy_cust` | `nc.vo.sr.policy.entity.PlcyCustVO` |
| 表体 | 物料维度子实体 | `sr_plcy_mar` | `nc.vo.sr.policy.entity.PlcyMarVO` |
| 表体 | 订单类型范围子实体 | `sr_plcy_ordtype` | `nc.vo.sr.policy.entity.PlcyOrdtypeVO` |
| 表体 | 销售组织范围子实体 | `sr_plcy_org` | `nc.vo.sr.policy.entity.PlcyOrgVO` |
| 表体 | 返利期间子实体 | `sr_plcy_period` | `nc.vo.sr.policy.entity.PlcyPeriodVO` |
| 表体 | 价格项范围子实体 | `sr_plcy_prcitem` | `nc.vo.sr.policy.entity.PlcyPrcitemVO` |
| 表体 | 促销类型范围子实体 | `sr_plcy_prmtype` | `nc.vo.sr.policy.entity.PlcyPromotTypeVO` |
| 表体 | 收款单类型范围子实体 | `sr_plcy_recetype` | `nc.vo.sr.policy.entity.PlcyRecetypeVO` |

> 聚合 VO：`nc.vo.sr.policy.entity.PlcyVO`

## 五、返利结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 返利结算单主实体 | `sr_settle` | `nc.vo.sr.settle.entity.SettleHVO` |
| 表体 | 返利结算单子实体 | `sr_settle_b` | `nc.vo.sr.settle.entity.SettleBVO` |

> 聚合 VO：`nc.vo.sr.settle.entity.SettleVO`

## 六、结算执行明细

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 结算执行明细实体 | `sr_settle_exe` | `nc.vo.sr.settle.entity.SettleExeVO` |

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 返利取数函数 | 1 |
| 返利政策交易类型 | 1 |
| 返利政策修订 | 13 |
| 返利政策 | 13 |
| 返利结算单 | 3 |
| 结算执行明细 | 1 |
| **合计** | **32** |

# NCC 委外加工与库存计划模块 VO 与表名对照表

---

# 第一部分：委外加工（sc）

## 一、委外调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 委外调整单 | `sc_adjustbill` | `nc.vo.sc.m62.entity.AdjustHeaderVO` |
| 表体 | 委外调整单明细 | `sc_adjustbill_b` | `nc.vo.sc.m62.entity.AdjustItemVO` |

> 聚合 VO：`nc.vo.sc.m62.entity.AdjustBillVO`

## 二、委外订单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 委外订单 | `sc_order` | `nc.vo.sc.m61.entity.SCOrderHeaderVO` |
| 表体 | 委外订单发料表 | `sc_issue` | `nc.vo.sc.m61.entity.SCOrderIssueVO` |
| 表体 | 委外订单明细 | `sc_order_b` | `nc.vo.sc.m61.entity.SCOrderItemVO` |

> 聚合 VO：`nc.vo.sc.m61.entity.SCOrderVO`

## 三、委外订单交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 委外订单交易类型 | `sc_ordertranstype` | `nc.vo.sc.m61.entity.SCOrderTranstypeVO` |

## 四、材料核销关系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 材料核销关系 | `sc_verify` | `nc.vo.sc.m66.entity.VerifyHeadVO` |
| 表体 | 材料核销关系明细 | `sc_verify_b` | `nc.vo.sc.m66.entity.VerifyItemVO` |

> 聚合 VO：`nc.vo.sc.m66.entity.VerifyVO`

## 五、自动核销规则

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 自动核销规则 | `sc_verifyrule` | `nc.vo.sc.m66.entity.VerifyRuleVO` |

---

# 第二部分：库存计划（invp）

## 一、需求供给平衡

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 需求供给平衡明细 | `invp_balance` | `nc.vo.invp.plan.entity.BalanceDetailVO` |
| 需求汇总平衡日志表 | `invp_balance_log` | `nc.vo.invp.result.entity.BalanceLogVO` |
| 需求汇总平衡计算结果 | `invp_balance_result` | `nc.vo.invp.result.entity.BalanceResultVO` |

## 二、平衡供给规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 平衡供给规则 | `invp_balancerule` | `nc.vo.invp.balance.entity.BalanceRuleHeadVO` |
| 表体 | 平衡供给规则子表 | `invp_balancerule_b` | `nc.vo.invp.balance.entity.BalanceRuleBodyVO` |

> 聚合 VO：`nc.vo.invp.balance.entity.AggBalanceRuleVO`

## 三、需求预测

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 需求预测 | `invp_forecast` | `nc.vo.invp.forecast.entity.ForecastHeadVO` |
| 表体 | 需求预测明细 | `invp_forecast_b` | `nc.vo.invp.forecast.entity.ForecastBodyVO` |

> 聚合 VO：`nc.vo.invp.forecast.entity.ForecastBill`

> ⚠️ **注意**：该聚合 VO 类名为 `ForecastBill`，不符合 NCC 聚合 VO 以 `Agg` 开头的命名惯例。

## 四、需求合并依据

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 需求合并依据 | `invp_gatherrule` | `nc.vo.invp.balance.entity.GatherRuleVO` |

## 五、库存计划计算日志

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 库存计划计算日志 | `invp_log` | `nc.vo.invp.plan.entity.LogHeadVO` |
| 表体 | 库存计划计算日志明细 | `invp_log_b` | `nc.vo.invp.plan.entity.LogBodyVO` |

> 聚合 VO：`nc.vo.invp.plan.entity.LogVO`

## 六、库存计划参数

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 库存计划参数001 | `invp_param001` | `nc.vo.invp.pub.Entity.Invp001VO` |

> ⚠️ **注意**：`nc.vo.invp.pub.Entity` 中 `Entity` 首字母大写，不符合 Java 包名全小写规范（应为 `entity`）。

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 库存计划参数002 | `invp_param002` | `nc.vo.invp.pub.entity.Invp002VO` |

## 七、库存计划

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 库存计划 | `invp_plan` | `nc.vo.invp.plan.entity.PlanHeadVO` |
| 表体 | 库存计划明细 | `invp_plan_b` | `nc.vo.invp.plan.entity.PlanBodyVO` |

> 聚合 VO：`nc.vo.invp.plan.entity.PlanVO`

## 八、计划订单

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 计划订单 | `invp_po` | `nc.vo.invp.po.entity.PoVO` |

## 九、需求明细

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 需求明细 | `invp_require` | `nc.vo.invp.plan.entity.RequireVO` |

## 十、库存计划方案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 库存计划方案 | `invp_scheme` | `nc.vo.invp.plan.entity.PlanSchemeMainVO` |
| 表体 | 库存计划物料范围 | `invp_scheme_inv` | `nc.vo.invp.plan.entity.PlanSchemeInvVO` |
| 表体 | 库存组织范围 | `invp_scheme_org` | `nc.vo.invp.plan.entity.PlanSchemeOrgVO` |

> 聚合 VO：`nc.vo.invp.plan.entity.PlanSchemeMVO`

## 十一、供给明细

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 供给明细 | `invp_supply` | `nc.vo.invp.plan.entity.SupplyVO` |

---

## 统计

| 模块 | 数量（含聚合） |
|------|---------------|
| 委外加工（sc） | 13 |
| 库存计划（invp） | 22 |
| **合计** | **35** |

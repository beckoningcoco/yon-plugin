# NCC 立项管理（pim）VO 对照表

> 领域：pim（Project Information Management / 立项管理）
> 整理时间：2026-04-28

---

## 1. 项目（项目管理）

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `bd_project` | `nc.vo.pim.project.ProjectHeadVO` |
| 子表（参与组织） | `bd_project_b` | `nc.vo.pim.project.ProjectBodyVO` |
| 聚合 VO | — | `nc.vo.pmpub.project.ProjectBillVO` |

---

## 2. 合同交底

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pim_contractdisclosure` | `nc.vo.pim.contractdisclosure.ContractDisclosureVO` |
| 子表（交底人员） | `pim_disclosureperson` | `nc.vo.pim.contractdisclosure.DisclosurePersonVO` |
| 聚合 VO | — | `nc.vo.pim.contractdisclosure.AggContractDisclosureVO` |

---

## 3. 项目人员调拨

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pim_projectpersonallot` | `nc.vo.pim.projectpersonallot.ProjectPersonAllotVO` |
| 子表（人员调出） | `pim_personallot_export` | `nc.vo.pim.projectpersonallot.ExportVO` |
| 子表（人员调入） | `pim_personallot_ipmort` | `nc.vo.pim.projectpersonallot.ImportVO` |
| 聚合 VO | — | `nc.vo.pim.projectpersonallot.AggProjectPersonAllotVO` |

---

## 4. 项目管理交底

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pim_projectdisclosure` | `nc.vo.pim.projectdisclosure.ProjectDisclosureVO` |
| 子表（交底人员） | `pim_projdisclosure_person` | `nc.vo.pim.projectdisclosure.ProjectDisclosurePersonVO` |
| 聚合 VO | — | `nc.vo.pim.projectdisclosure.AggProjectDisclosureVO` |

---

## 5. 项目成本预算

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_budget` | `nc.vo.pbm.budget.BudgetHeadVO` |
| 子表（CBS预算明细） | `pm_budgetcbs` | `nc.vo.pbm.budget.BudgetCBSBodyVO` |
| 子表（核算要素预算明细） | `pm_budgetfactor` | `nc.vo.pbm.budget.BudgetFactorBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.budget.BudgetBillVO` |

---

## 6. 预算执行单明细

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 子表 | `pm_budget_exe` | `nc.vo.pbm.budgetexe.BudgetExeBodyVO` |

---

## 7. 项目预算调整

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_budgetadd` | `nc.vo.pbm.budgetadd.BudgetAddHeadVO` |
| 子表（追加明细） | `pm_budgetadd_b` | `nc.vo.pbm.budgetadd.BudgetAddBodyVO` |
| 子表（CBS预算明细） | `pm_budgetadd_cbs` | `nc.vo.pbm.budgetadd.BudgetAddCBSBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.budgetadd.BudgetAddBillVO` |

---

## 8. 预算执行期初

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_budgetbegining` | `nc.vo.pbm.budgetbegining.BudgetBeginingHeadVO` |
| 子表 | `pm_budgetbegining_b` | `nc.vo.pbm.budgetbegining.BudgetBeginingBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.budgetbegining.BudgetBeginingBillVO` |

---

## 9. 项目验收报告

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_check_head` | `nc.vo.ppm.projectcheck.ProjectCheckHeadVO` |
| 子表（验收资料清单） | `pm_check_goal` | `nc.vo.ppm.projectcheck.DataGoalVO` |
| 子表（问题整改情况） | `pm_check_issue` | `nc.vo.ppm.projectcheck.LeaveIssueVO` |
| 子表（验收检查项） | `pm_check_item` | `nc.vo.ppm.projectcheck.CheckItemVO` |
| 子表（项目产出物） | `pm_check_trans` | `nc.vo.ppm.projectcheck.ProductTransferVO` |
| 子表（验收人） | `pm_checker` | `nc.vo.ppm.projectcheck.CheckerVO` |
| 子表（验收对象） | `pm_checkobject` | `nc.vo.ppm.projectcheck.CheckObjectVO` |
| 聚合 VO | — | `nc.vo.ppm.projectcheck.ProjectCheckBillVO` |

---

## 10. 指标填报

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_compworkfill` | `nc.vo.ppm.compworkfill.CompWorkFillHeadVO` |
| 子表 | `pm_compworkfill_b` | `nc.vo.ppm.compworkfill.CompWorkFillBodyVO` |
| 聚合 VO | — | `nc.vo.ppm.compworkfill.CompWorkFillBillVO` |

---

## 11. 决算标志

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 单表 | `pm_finalflag` | `nc.vo.pbm.finalflag.FinalFlagVO` |

---

## 12. 指标计划

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_indexplan` | `nc.vo.ppm.indexplan.IndexPlanHeadVO` |
| 子表 | `pm_indexplan_b` | `nc.vo.ppm.indexplan.IndexPlanBodyVO` |
| 聚合 VO | — | `nc.vo.ppm.indexplan.IndexPlanBillVO` |

---

## 13. 物资及服务需求追加单/调价单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_mateplanadd` | `nc.vo.pbm.materialplanadd.MaterialPlanAddHeadVO` |
| 子表 | `pm_mateplanadd_b` | `nc.vo.pbm.materialplanadd.MaterialPlanAddBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.materialplanadd.MaterialPlanAddBillVO` |

---

## 14. 物资及服务需求单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_mater_plan` | `nc.vo.pbm.materialplan.MaterialPlanHeadVO` |
| 子表 | `pm_mater_plan_b` | `nc.vo.pbm.materialplan.MaterialPlanBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.materialplan.MaterialPlanBillVO` |

---

## 15. 物资备料表

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_mater_stock` | `nc.vo.pbm.materialstock.MaterialStockVO` |
| 日志表 | `pm_mater_stock_log` | `nc.vo.pbm.materialstocklog.MaterialStockLogVO` |

---

## 16. 产出物价值调整单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_proadapt` | `nc.vo.ppm.productadapt.ProAdaptHeadVO` |
| 子表 | `pm_proadapt_b` | `nc.vo.ppm.productadapt.ProAdaptBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.materialstock.MaterialStockBillVO` |

> 注意：聚合VO包名为 `pbm.materialstock`，与主表VO包名 `ppm.productadapt` 不同，使用时注意区分。

---

## 17. 项目其他费用

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_procostcard` | `nc.vo.pcm.procostcard.ProCostCardHeadVO` |
| 子表（费用明细） | `pm_procostcard_b` | `nc.vo.pcm.procostcard.ProCostCardBodyVO` |
| 聚合 VO | — | `nc.vo.pcm.procostcard.ProCostCardBillVO` |

---

## 18. 预算控制

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_projectbudctrl` | `nc.vo.pbm.projectbudctrl.ProjectBudCtrlHeadVO` |
| 子表（CBS管控明细） | `pm_projectbudctrlcbs` | `nc.vo.pbm.projectbudctrl.ProjectBudCtrlCBSBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.projectbudctrl.ProjectBudCtrlBillVO` |

---

## 19. 项目立项

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_projectbuild` | `nc.vo.ppm.projectbuild.ProjectBuildHeadVO` |

---

## 20. 项目决算单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_projectfinal` | `nc.vo.pbm.projectfinal.ProjectFinalHeadVO` |
| 子表（决算单明细） | `pm_projectfinal_b` | `nc.vo.pbm.projectfinal.ProjectFinalBodyVO` |
| 聚合 VO | — | `nc.vo.pbm.projectfinal.ProjectFinalBillVO` |

---

## 21. 项目结项单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_projectfinish` | `nc.vo.ppm.projectfinish.ProjectFinishHeadVO` |

---

## 22. 项目产出物

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 单表 | `pm_projectproduct` | `nc.vo.pim.projectproduct.ProjectProductVO` |

---

## 23. 产出物交付单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_protranfacard` | `nc.vo.ppm.producttranfacard.ProTranFaHeadVO` |
| 子表 | `pm_protranfacard_b` | `nc.vo.ppm.producttranfacard.ProTranFaBodyVO` |
| 聚合 VO | — | `nc.vo.ppm.producttranfacard.ProTranFaBillVO` |

---

## 24. 状态报告单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_statefill` | `nc.vo.ppm.statefill.StateFillHeadVO` |
| 子表 | `pm_statefill_b` | `nc.vo.ppm.statefill.StateFillBodyVO` |
| 聚合 VO | — | `nc.vo.ppm.statefill.StateFillBillVO` |

---

## 25. 任务进度填报单

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_taskschedule` | `nc.vo.ppm.schedulefill.TaskScheduleHeadVO` |
| 子表（进度执行工作台子表） | `pm_taskschedule_b` | `nc.vo.ppm.schedulefill.TaskScheduleBodyVO` |
| 聚合 VO | — | `nc.vo.ppm.schedulefill.TaskScheduleBillVO` |

---

## 26. 计划工作台（WBS）

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pm_wbs` | `nc.vo.ppm.wbs.WbsHeadVO` |
| 子表（前置任务） | `pm_wbs_prefix` | `nc.vo.ppm.wbs.WbsPrefixVO` |
| 子表（状态驱动） | `pm_wbs_statedrive` | `nc.vo.ppm.wbs.StatusDriveVO` |
| 聚合 VO | — | `nc.vo.ppm.wbs.WbsBillVO` |

---

## 27. 进度计划

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pmsch_time_plan` | `nc.vo.pmsch.plan.TimePlanHeadVO` |
| 子表（进度计划条目） | `pmsch_time_plan_item` | `nc.vo.pmsch.plan.TimePlanItemVO` |
| 聚合 VO | — | `nc.vo.pmsch.plan.TimePlanBillVO` |

---

## 28. 进度计划条目Ex（扩展）

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 子表扩展 | `pmsch_time_plan_item` | `nc.vo.pmsch.plan.TimePlanItemExVO` |

---

## 29. 计划执行进度

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 主表 | `pmsch_time_progress` | `nc.vo.pmsch.plan.progress.TimeProgressHeadVO` |
| 子表（进度条目） | `pmsch_time_progress_item` | `nc.vo.pmsch.plan.progress.TimeProgressItemVO` |
| 聚合 VO | — | `nc.vo.pmsch.plan.progress.TimeProgressBillVO` |

---

## 30. 计划执行进度条目Ex（扩展）

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 子表扩展 | `pmsch_time_progress_item` | `nc.vo.pmsch.plan.progress.TimeProgressItemExVO` |

---

## 31. 进度计划执行反馈

| 角色 | 数据表 | VO 类 |
|------|--------|-------|
| 单表 | `pmsch_time_progress_record` | `nc.vo.pmsch.plan.progress.TimeProgressRecordVO` |

---

## 包名前缀速查

| 包名前缀 | 子模块含义 |
|---------|-----------|
| `nc.vo.pim.*` | 立项信息管理（Project Information Management） |
| `nc.vo.pmpub.*` | 项目公共（Project Management Public） |
| `nc.vo.pbm.*` | 项目预算管理（Project Budget Management） |
| `nc.vo.ppm.*` | 项目过程管理（Project Process Management） |
| `nc.vo.pcm.*` | 项目成本管理（Project Cost Management） |
| `nc.vo.pmsch.*` | 项目进度管理（Project Schedule Management） |

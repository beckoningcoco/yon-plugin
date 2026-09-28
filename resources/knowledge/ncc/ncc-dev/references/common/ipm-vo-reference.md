# IPM 基金投资模块 VO 参照表

> 涵盖模块：ipmbd（基础数据）、ipmam（投后管理）、ipmas（投资分析）、ipmdm（决策模型）、ipmexit（退出管理）、ipmfund（基金管理）、ipmip（投资计划）、ipmpb（投资决策）、ipmpe（项目后评价）、ipmpg（投资规划）、ipmpl（项目库）、ipmprm（产权管理）、ipmrisk（风险管理）

---

## 二十五、基金基础数据及设置（ipmbd）

### 1. 企业国有产权变动(增加)原因设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_addreason` | `nc.vo.ipmbd.addreason.EquityAddReasonVO` |

### 2. 资金来源(投资)

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_capitalsource` | `nc.vo.ipmbd.capitalsource.CapitalSourceVO` |

### 3. 国有资产处置方式设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_disposalways` | `nc.vo.ipmbd.disposalways.DisposalwaysVO` |

### 4. 文档设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_documentset` | `nc.vo.ipmbd.documentset.DocumentSetVO` |
| `ipm_bd_documentset_details` | `nc.vo.ipmbd.documentset.DocumentSetDetailsVo` |

### 5. 企业实收资本构成设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_enterprise` | `nc.vo.ipmbd.enterprise.EnterPriseVO` |

### 6. 投资类别

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_investmentcategory` | `nc.vo.ipmbd.investmentcategory.InvestmentCategoryVO` |

### 7. 投资项目阶段

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_investstage` | `nc.vo.ipmbd.investstage.InvestStageVO` |

### 8. 投资类型

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_investtype` | `nc.vo.ipmbd.investtype.InvestTypeVO` |

### 9. 产权注销原因设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_logoffcause` | `nc.vo.ipmbd.logoffcause.LogOffCauseVO` |

### 10. 重大事项类型

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_mattertype` | `nc.vo.ipmbd.mattertype.MatterTypeVO` |

### 11. 会议类型

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_meetingtype` | `nc.vo.ipmbd.meetingtype.MeetingTypeVO` |

### 12. 里程碑完成情况

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_milestone` | `nc.vo.ipmbd.milestone.MilestoneVO` |

### 13. 企业国有产权变动(减少)原因设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_subreason` | `nc.vo.ipmbd.subreason.EquitySubReasonVO` |

### 14. 国有产权转让收入处置方式设置

| 表名 | VO 类 |
|------|-------|
| `ipm_bd_transferways` | `nc.vo.ipmbd.transferways.TransferwaysVO` |

### 15. 资产评估结果项目

| 表名 | VO 类 |
|------|-------|
| `ipmbd__assertevalresult` | `nc.vo.ipmbd.assertevalresult.AssertEvalResultVO` |

### 16. 企业增资方式主实体

| 表名 | VO 类 |
|------|-------|
| `ipmbd_capincreaseway` | `nc.vo.ipmbd.capincreaseway.CapIncreaseWayVO` |

### 17. 产权经济行为

| 表名 | VO 类 |
|------|-------|
| `ipmbd_ecobehaviourtype` | `nc.vo.ipmbd.ecobehaviourtype.EcoBehaviourTypeVO` |

### 18. 企业&自然人（聚合VO）

**聚合VO**：`nc.vo.ipmbd.enterpriseperson.AggEnterprisePersonVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmbd_enterprise_person` | `nc.vo.ipmbd.enterpriseperson.EnterprisePersonVO` | 主表 |
| `ipmbd_enterprise_executives` | `nc.vo.ipmbd.enterpriseperson.EnterprisePersionExecutivesVo` | 高管信息 |
| `ipmbd_enterprise_financial` | `nc.vo.ipmbd.enterpriseperson.EnterprisePersionFinancialVo` | 经济财务指标 |
| `ipmbd_enterprise_outsource` | `nc.vo.ipmbd.enterpriseperson.EnterprisePersionOutsourceVo` | 外包服务信息 |

### 19. 基金类型

| 表名 | VO 类 |
|------|-------|
| `ipmbd_fundtype` | `nc.vo.ipmbd.fundtype.FundTypeVO` |

### 20. 投资计划汇总关系

| 表名 | VO 类 |
|------|-------|
| `ipmbd_investorgs` | `nc.vo.ipmbd.investorgs.InvestorgsVO` |

### 21. 基金组织形式

| 表名 | VO 类 |
|------|-------|
| `ipmbd_ipmbd_fundform` | `nc.vo.ipmbd.fundform.FundFormVO` |

### 22. 国有资产评估

| 表名 | VO 类 |
|------|-------|
| `ipmbd_nationasserteval` | `nc.vo.ipmbd.nationasserteval.NationAssertEvalVO` |

### 23. 接收非国有资产评估

| 表名 | VO 类 |
|------|-------|
| `ipmbd_nonasserteval` | `nc.vo.ipmbd.nonasserteval.NonAssertEvalVO` |

### 24. 项目阶段记录中间表

| 表名 | VO 类 |
|------|-------|
| `ipmbd_proj_stage_mid` | `nc.vo.ipmbd.projstagemid.ProjStageMidVO` |

### 25. 产权转让方式主实体

| 表名 | VO 类 |
|------|-------|
| `ipmbd_propertytransway` | `nc.vo.ipmbd.propertytransway.PropertyTransWayVO` |

### 26. 项目阶段规则设置（聚合VO）

**聚合VO**：`nc.vo.ipmbd.projectstagerule.AggProjectStageRuleHeadVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmbd_stagerule` | `nc.vo.ipmbd.projectstagerule.ProjectStageRuleHeadVO` | 主表 |
| `ipmbd_stagerule_detail` | `nc.vo.ipmbd.projectstagerule.ProjectStageRuleDetailVO` | 规则明细 |

---

## 二十六、投后管理（ipmam）

### 1. 派出人员登记

**聚合VO**：`nc.vo.ipmam.assignpsn.AggAssignPsnVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_am_assignpsn` | `nc.vo.ipmam.assignpsn.AssignPsnVO` | 主表 |
| `ipm_am_assignpsn_b` | `nc.vo.ipmam.assignpsn.AssignPsnBVO` | 派出人员信息 |
| `ipm_am_assignpsn_docs` | `nc.vo.ipmam.assignpsn.AssignPsnDocsBVO` | 文档信息 |

### 2. 投后会议纪要

**聚合VO**：`nc.vo.ipmam.summary.AggSummaryVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_am_summary` | `nc.vo.ipmam.summary.SummaryVO` | 主表 |
| `ipm_am_bodyarrive` | `nc.vo.ipmam.summary.BodyArriveVO` | 参会名册及到会情况 |
| `ipm_am_bodydetail` | `nc.vo.ipmam.summary.BodyDetailVO` | 议案明细 |
| `ipm_am_bodyplan` | `nc.vo.ipmam.summary.BodyPlanVO` | 会议日程 |
| `ipmam_summary_docset` | `nc.vo.ipmam.summary.SummeryDocSetVO` | 文档信息 |

### 3. 重大事项

**聚合VO**：`nc.vo.ipmam.majormatter.AggMajorMatterVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_am_majormatter` | `nc.vo.ipmam.majormatter.MajorMatterVO` | 主表 |
| `ipmam_majormatter_docset` | `nc.vo.ipmam.majormatter.MajormatterDocSetVO` | 文档信息 |

### 4. 投后会议申请

**聚合VO**：`nc.vo.ipmam.meeting.AggMeetingApplyVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_am_meetingapply` | `nc.vo.ipmam.meeting.MeetingApplyVO` | 主表 |
| `ipm_am_meetdetail` | `nc.vo.ipmam.meeting.MeetDetailVO` | 议案明细 |
| `ipm_am_meetplan` | `nc.vo.ipmam.meeting.MeetPlanVO` | 会议日程 |
| `ipm_am_meetregister` | `nc.vo.ipmam.meeting.MeetRegisterVO` | 与会名册 |
| `ipmam_meetingapplay_docset` | `nc.vo.ipmam.meeting.ApplayDocSetVO` | 文档信息 |

### 5. 提案审批

**聚合VO**：`nc.vo.ipmam.motion.AggMotionApproveVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_am_motion` | `nc.vo.ipmam.motion.MotionApproveVO` | 主表 |
| `ipmam_motion_docset` | `nc.vo.ipmam.motion.MotionDocSetVO` | 文档信息 |

### 6. 备案记录

**聚合VO**：`nc.vo.ipmam.record.AggRecordVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_am_record` | `nc.vo.ipmam.record.RecordVO` | 主表 |
| `ipmam_record_docset` | `nc.vo.ipmam.record.RecordDocSetVO` | 文档信息 |

### 7. 固定资产投资项目月报

**聚合VO**：`nc.vo.ipmam.assetmonthly.AggAssetMonthlyVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_assetmonthly` | `nc.vo.ipmam.assetmonthly.AssetMonthlyVO` | 主表 |
| `ipmam_assetmonthly_doc` | `nc.vo.ipmam.assetmonthly.AssetMonthlyDocVO` | 文档信息 |
| `ipmam_project_approval` | `nc.vo.ipmam.assetmonthly.ProjectApprovalVO` | 项目批文获得情况 |

### 8. 股权投资协议

**聚合VO**：`nc.vo.ipmam.equityproto.EquityProtoVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_equityproto` | `nc.vo.ipmam.equityproto.EquityProtoVO` | 主表 |
| `ipmam_equityproto_docset` | `nc.vo.ipmam.equityproto.EquityProtoDocsetVO` | 文档信息 |
| `ipmam_equityproto_sturc` | `nc.vo.ipmam.equityproto.EquityProtoStrucVO` | 标的企业股权结构信息 |

### 9. 出资拨付

**聚合VO**：`nc.vo.ipmam.fundalloc.AggFundallocVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_fundalloc` | `nc.vo.ipmam.fundalloc.FundallocVO` | 主表 |
| `ipmam_fundalloc_docset` | `nc.vo.ipmam.fundalloc.FundallocDocsetVO` | 文档信息 |

### 10. 董监事调研报告

**聚合VO**：`nc.vo.ipmam.researchreport.AggResearchReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_research_report` | `nc.vo.ipmam.researchreport.ResearchReportVO` | 主表 |
| `ipmam_research_person` | `nc.vo.ipmam.researchreport.ResearchPersonVO` | 参加调研人员信息 |
| `ipmam_research_report_doc` | `nc.vo.ipmam.researchreport.ResearchReportDocVO` | 文档信息 |

### 11. 投后跟踪分析

**聚合VO**：`nc.vo.ipmam.trackanalyse.AggTrackAnalyseVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_trackanalyse` | `nc.vo.ipmam.trackanalyse.TrackAnalyseVO` | 主表 |
| `ipmam_trackanalyse_data` | `nc.vo.ipmam.trackanalyse.TrackAnalyseDataVO` | 数据项说明 |

### 12. 投后管理报告

**聚合VO**：`nc.vo.ipmam.trackreport.AggTrackReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_trackreport` | `nc.vo.ipmam.trackreport.TrackReportVO` | 主表 |
| `ipmam_trackreport_docset` | `nc.vo.ipmam.trackreport.TrackReportDocsetVO` | 文档信息 |

### 13. 董监事工作报告

**聚合VO**：`nc.vo.ipmam.workreport.AggWorkReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmam_workreport` | `nc.vo.ipmam.workreport.WorkReportVO` | 主表 |
| `ipmam_workreport_docset` | `nc.vo.ipmam.workreport.WorkReportDocsetVO` | 文档信息 |

---

## 投资分析（ipmas）

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmas_region_lal` | `nc.vo.ipmas.region.RegionLalVO` | 行政区划经纬度 |
| `ipmas_user_target` | `nc.vo.ipmas.usertarget.UserTargetVO` | 用户看板目标值 |

---

## 决策模型（ipmdm）

### 1. 评估方案

**聚合VO**：`nc.vo.ipmdm.evaluation.AggEvaluationVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmdm_evaluation` | `nc.vo.ipmdm.evaluation.EvaluationVO` | 主表 |
| `ipmdm_addIndex` | `nc.vo.ipmdm.evaluation.AddIndexVO` | 加分项指标 |
| `ipmdm_bodyjudgeinfo` | `nc.vo.ipmdm.evaluation.JudgeInfoVO` | 评委信息 |
| `ipmdm_evaluationindex` | `nc.vo.ipmdm.evaluation.EvaluationIndexVO` | 决策评估指标 |
| `ipmdm_negativelist` | `nc.vo.ipmdm.evaluation.NegativeListVO` | 投资项目负面清单 |
| `ipmdm_subIndex` | `nc.vo.ipmdm.evaluation.SubIndexVO` | 减分项指标 |

### 2. 决策评估指标

| 表名 | VO 类 |
|------|-------|
| `ipmdm_eval_indicators` | `nc.vo.ipmdm.evalindicators.EvalIndicatorsVO` |

### 3. 指标体系

**聚合VO**：`nc.vo.ipmdm.indexsys.AggIndexSysVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmdm_indexsys` | `nc.vo.ipmdm.indexsys.IndexSysVO` | 主表 |
| `ipmdm_indexsys_add` | `nc.vo.ipmdm.indexsys.IndexSysAddVO` | 加分项 |
| `ipmdm_indexsys_evalind` | `nc.vo.ipmdm.indexsys.IndexSysEvalindVO` | 决策评估指标 |
| `ipmdm_indexsys_negative` | `nc.vo.ipmdm.indexsys.IndexSysNegativeVO` | 负面清单 |

### 4. 指标项

| 表名 | VO 类 |
|------|-------|
| `ipmdm_indicators` | `nc.vo.ipmdm.indicators.IndicatorsVO` |

### 5. 等级体系设置

**聚合VO**：`nc.vo.ipmdm.levelset.AggLevelSetVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmdm_levelset` | `nc.vo.ipmdm.levelset.LevelSetVO` | 主表 |
| `ipmdm_level` | `nc.vo.ipmdm.levelset.LevelVO` | 等级项 |

### 6. 评估报告

**聚合VO**：`nc.vo.ipmdm.report.AggReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmdm_report` | `nc.vo.ipmdm.report.ReportVO` | 主表 |
| `ipmdm_report_docset` | `nc.vo.ipmdm.report.ReportDocsetVO` | 文档信息 |
| `ipmdm_report_evalua` | `nc.vo.ipmdm.report.ReportEvaluaVO` | 评委评估情况 |

### 7. 评分表

**聚合VO**：`nc.vo.ipmdm.scoresht.AggScoreShtVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmdm_scoresht` | `nc.vo.ipmdm.scoresht.ScoreShtVO` | 主表 |
| `ipmdm_scoresht_addind` | `nc.vo.ipmdm.scoresht.ScoreShtAddindVO` | 评分表加分指标 |
| `ipmdm_scoresht_docset` | `nc.vo.ipmdm.scoresht.ScoreShtDocSetVO` | 文档信息 |
| `ipmdm_scoresht_evalind` | `nc.vo.ipmdm.scoresht.ScoreShtEvalindVO` | 评分表评估指标 |
| `ipmdm_scoresht_ext` | `nc.vo.ipmdm.scoresht.ScoreShtExtVO` | 评分表其它补充 |
| `ipmdm_scoresht_neglist` | `nc.vo.ipmdm.scoresht.ScoreShtNeglistVO` | 评分表负面清单 |
| `ipmdm_scoresht_subind` | `nc.vo.ipmdm.scoresht.ScoreShtSubindVO` | 评分表减分指标 |

### 8. 评估任务

**聚合VO**：`nc.vo.ipmdm.task.AggTaskVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmdm_task` | `nc.vo.ipmdm.task.TaskVO` | 主表 |
| `ipmdm_task_addind` | `nc.vo.ipmdm.task.TaskAddindVO` | 加分项指标 |
| `ipmdm_task_docset` | `nc.vo.ipmdm.task.TaskDocsetVO` | 文档信息 |
| `ipmdm_task_evalind` | `nc.vo.ipmdm.task.TaskEvalindVO` | 决策评估指标 |
| `ipmdm_task_ext` | `nc.vo.ipmdm.task.TaskExtVO` | 其他补充项 |
| `ipmdm_task_judge` | `nc.vo.ipmdm.task.TaskJudgeVO` | 评委信息 |
| `ipmdm_task_neglist` | `nc.vo.ipmdm.task.TaskNeglistVO` | 负面清单 |
| `ipmdm_task_subind` | `nc.vo.ipmdm.task.TaskSubindVO` | 减分项指标 |

---

## 退出管理（ipmexit）

### 1. 退出决策

**聚合VO**：`nc.vo.ipmexit.exitdecision.AggExitDecisionVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmexit_decision` | `nc.vo.ipmexit.exitdecision.ExitDecisionVO` | 主表 |
| `ipmexit_decision_docset` | `nc.vo.ipmexit.exitdecision.ExitDecisionDocsetVO` | 文档信息 |

### 2. 退出收益

**聚合VO**：`nc.vo.ipmexit.exitearning.AggExitEarningVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmexit_exitearning` | `nc.vo.ipmexit.exitearning.ExitEarningVO` | 主表 |
| `ipmexit_exit_docset` | `nc.vo.ipmexit.exitearning.ExitEarningDocsetVO` | 文档信息 |

### 4. 清算报告

**聚合VO**：`nc.vo.ipmexit.exitliquidate.AggExitLiquidateVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmexit_liquidate` | `nc.vo.ipmexit.exitliquidate.ExitLiquidateVO` | 主表 |
| `ipmexit_liquidate_docset` | `nc.vo.ipmexit.exitliquidate.ExitLiquidateDocsetVO` | 文档信息 |
| `ipmexit_liquidate_investors` | `nc.vo.ipmexit.exitliquidate.ExitLiquidateInvestorsVO` | 全体投资人分配情况 |
| `ipmexit_liquidate_noncash` | `nc.vo.ipmexit.exitliquidate.ExitLiquidateNoncashVO` | 非现金财产处置情况 |
| `ipmexit_liquidate_team` | `nc.vo.ipmexit.exitliquidate.ExitLiquidateTeamVO` | 清算组构成 |

### 5. 退出计划

**聚合VO**：`nc.vo.ipmexit.editplan.AggExitPlanVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmexit_plan` | `nc.vo.ipmexit.editplan.ExitPlanVO` | 主表 |
| `ipmexit_plan_docset` | `nc.vo.ipmexit.editplan.ExitPlanDocsetVO` | 文档信息 |
| `ipmexit_plan_exitproject` | `nc.vo.ipmexit.editplan.ExitPlanExitProjectVO` | 计划退出项目 |

### 6. 退出方案

**聚合VO**：`nc.vo.ipmexit.exitscheme.AggExitSchemeVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmexit_scheme` | `nc.vo.ipmexit.exitscheme.ExitSchemeVO` | 主表 |
| `ipmexit_scheme_docset` | `nc.vo.ipmexit.exitscheme.ExitSchemeDocsetVO` | 文档信息 |

### 7. 股权转让协议

**聚合VO**：`nc.vo.ipmexit.transferprotocol.AggTransferProtocolVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmexit_transproto` | `nc.vo.ipmexit.transferprotocol.TransferProtocolVO` | 主表 |
| `ipmexit_transprotocol_docset` | `nc.vo.ipmexit.transferprotocol.TransferProtocolDocsetVO` | 文档信息 |

---

## 基金管理（ipmfund）

### 1. 基金看板

**聚合VO**：`nc.vo.ipmfund.kanban.AggKanbanVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_KanbanVO` | `nc.vo.ipmfund.kanban.KanbanVO` | 主表 |
| `ipmfund_childfunds` | `nc.vo.ipmfund.kanban.ChildfundsBVO` | 对外投资子基金信息 |
| `ipmfund_investproject` | `nc.vo.ipmfund.kanban.InvestProjectBVO` | 对外投资项目信息 |

### 2. 项目出资拨付

**聚合VO**：`nc.vo.ipmfund.capitalallocat.AggCapitalallocatVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_capitalallocat` | `nc.vo.ipmfund.capitalallocat.CapitalallocatVO` | 主表 |
| `ipmfund_capitalallocat_docs` | `nc.vo.ipmfund.capitalallocat.CapitalallocatdocsBVO` | 文档信息 |

### 3. 基金管理-工商登记

**聚合VO**：`nc.vo.ipmfund.commercialregister.AggCommercialRegisterVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_commercial_reg` | `nc.vo.ipmfund.commercialregister.CommercialRegisterVO` | 主表 |
| `ipmfund_commercial_docset` | `nc.vo.ipmfund.commercialregister.CommercialDocSetVO` | 文档信息 |
| `ipmfund_commercial_partner` | `nc.vo.ipmfund.commercialregister.CommercialPartnerVO` | 合伙人信息 |

### 4. 税务登记

**聚合VO**：`nc.vo.ipmfund.commercialregister.AggCommercialRegisterVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_taxregister` | `nc.vo.ipmfund.taxregister.TaxregisterVO` | 主表 |
| `ipmfund_contactinfo` | `nc.vo.ipmfund.taxregister.ContactinfoBVO` | 联系人信息 |
| `ipmfund_taxregister_docs` | `nc.vo.ipmfund.taxregister.TaxregisterDocsBVO` | 文档信息 |

### 5. 尽职调查报告

**聚合VO**：`nc.vo.ipmfund.duediligence.AggDueDiligenceVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_diligence` | `nc.vo.ipmfund.duediligence.DueDiligenceVO` | 主表 |
| `ipmfund_diligence_docset` | `nc.vo.ipmfund.duediligence.DueDiligenceDocSetVO` | 文档信息 |

### 6. 立项申请

**聚合VO**：`nc.vo.ipmfund.topicapply.AggTopicapplyVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_topicapply` | `nc.vo.ipmfund.topicapply.TopicapplyVO` | 主表 |
| `ipmfund_docs` | `nc.vo.ipmfund.topicapply.DocsBVO` | 文档信息 |

### 7. 收益分配

**聚合VO**：`nc.vo.ipmfund.earningalloc.AggEarningAllocVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_earningalloc` | `nc.vo.ipmfund.earningalloc.EarningAllocVO` | 主表 |
| `ipmfund_earningalloc_docset` | `nc.vo.ipmfund.earningalloc.EarningAllocDocsetVO` | 文档信息 |
| `ipmfund_earningalloc_info` | `nc.vo.ipmfund.earningalloc.EarningAllocInfoVO` | 收益分配信息 |

### 8. 委托管理协议

**聚合VO**：`nc.vo.ipmfund.entrustproto.AggEntrustProto`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_entrust_proto` | `nc.vo.ipmfund.entrustproto.EntrustProto` | 主表 |
| `ipmfund_entrustproto_docset` | `nc.vo.ipmfund.entrustproto.EntrustProtoDocsetVO` | 文档信息 |
| `ipmfund_incentive_stand` | `nc.vo.ipmfund.entrustproto.IncentiveStandVO` | 业绩激励标准 |
| `ipmfund_prov_stand` | `nc.vo.ipmfund.entrustproto.ProvStandVO` | 管理费用计提标准 |

### 10. 管理费用计提

**聚合VO**：`nc.vo.ipmfund.feeprovision.AggFeeProvisionVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_feeprovision` | `nc.vo.ipmfund.feeprovision.FeeProvisionVO` | 主表 |
| `ipmfund_feeprovision_docset` | `nc.vo.ipmfund.feeprovision.FeeProvisionDocSetVO` | 文档信息 |

### 11. 子基金退出

**聚合VO**：`nc.vo.ipmfund.fundexit.AggFundExitVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_fundexit` | `nc.vo.ipmfund.fundexit.FundExitVO` | 主表 |
| `ipmfund_fundexit_docset` | `nc.vo.ipmfund.fundexit.FundExitDocsetVO` | 文档信息 |

### 12. 基金库

**聚合VO**：`nc.vo.ipmfund.ipmfundlib.AggIPMFundLibVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_fundlib` | `nc.vo.ipmfund.ipmfundlib.IPMFundLibVO` | 主表 |
| `ipmfund_fundlib_liaison` | `nc.vo.ipmfund.ipmfundlib.IPMFundLibLiaisonVO` | 基金联络人 |
| `ipmfund_fundlib_partner` | `nc.vo.ipmfund.ipmfundlib.IPMFundLibPartnerVO` | 合伙人 |
| `ipmfund_fundlib_team` | `nc.vo.ipmfund.ipmfundlib.IPMFundLibTeamVO` | 管理团队 |
| `ipmfund_fundlib_version` | `nc.vo.ipmfund.ipmfundlib.FundLibVersionVO` | 版本记录 |

### 13. 基金实缴

**聚合VO**：`nc.vo.ipmfund.fundpaid.AggFundpaidVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_fundpaid` | `nc.vo.ipmfund.fundpaid.FundpaidVO` | 主表 |
| `ipmfund_fundpaid_docset` | `nc.vo.ipmfund.fundpaid.FundpaidDocsetVO` | 文档信息 |
| `ipmfund_fundpaid_info` | `nc.vo.ipmfund.fundpaid.FundpaidInfoVO` | 出资人缴款信息 |

### 14. 基金管理人

**聚合VO**：`nc.vo.ipmfund.fundmanagerinfo.AggFundManagerInfoVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_manager_info` | `nc.vo.ipmfund.fundmanagerinfo.FundManagerInfoVO` | 主表 |
| `ipmfund_info` | `nc.vo.ipmfund.fundmanagerinfo.FundInfoVO` | 基金信息 |

### 15. 投资协议

**聚合VO**：`nc.vo.ipmfund.investagreement.AggInvestAgreementVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_investagree` | `nc.vo.ipmfund.investagreement.InvestAgreementVO` | 主表 |
| `ipmfund_investagree_docset` | `nc.vo.ipmfund.investagreement.InvestAgreementDocSetVO` | 文档信息 |
| `ipmfund_investagree_equity` | `nc.vo.ipmfund.investagreement.InvestAgreementEquityVO` | 股权信息 |
| `ipmfund_investagree_invest` | `nc.vo.ipmfund.investagreement.InvestAgreementInvestorVO` | 投资方信息 |
| `ipmfund_investagree_sponsor` | `nc.vo.ipmfund.investagreement.InvestAgreementSponsorVO` | 全体投资人信息 |

### 16. 基金投决

**聚合VO**：`nc.vo.ipmfund.investdecision.AggInvestDecisionVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_investdecision` | `nc.vo.ipmfund.investdecision.InvestDecisionVO` | 主表 |
| `ipmfund_investdecision_docs` | `nc.vo.ipmfund.investdecision.InvestdeciDocsBVO` | 文档信息表体 |

### 17. 基金清算

**聚合VO**：`nc.vo.ipmfund.fundliquidate.AggFundLiquidateVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_liquidate` | `nc.vo.ipmfund.fundliquidate.FundLiquidateVO` | 主表 |
| `ipmfund_liquidate_docset` | `nc.vo.ipmfund.fundliquidate.FundLiquidateDocSetVO` | 文档信息 |
| `ipmfund_liquidate_investors` | `nc.vo.ipmfund.fundliquidate.FundLiquidateInvestorsVO` | 全体投资人分配情况 |
| `ipmfund_liquidate_noncash` | `nc.vo.ipmfund.fundliquidate.FundLiquidateNoncashVO` | 非现金财产处置情况 |
| `ipmfund_liquidate_team` | `nc.vo.ipmfund.fundliquidate.FundLiquidateTeamVO` | 清算组构成 |

### 18. 基金运营管理报告

**聚合VO**：`nc.vo.ipmfund.managereport.AggManageReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_managereport` | `nc.vo.ipmfund.managereport.ManageReportVO` | 主表 |
| `ipmfund_manage_docset` | `nc.vo.ipmfund.managereport.ManageDocsetVO` | 文档信息 |

### 20. 基金协议

**聚合VO**：`nc.vo.ipmfund.partnerprotocol.AggPartnerProtocolVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_partnerprotocol` | `nc.vo.ipmfund.partnerprotocol.PartnerProtocolVO` | 主表 |
| `ipmfund_partnerprotocoldoc` | `nc.vo.ipmfund.partnerprotocol.PartnerDocSetVO` | 文档信息 |
| `ipmfund_partnerprotocolinfo` | `nc.vo.ipmfund.partnerprotocol.PartnerInvestInfoVO` | 合伙人及出资信息 |

### 21. 项目退出

**聚合VO**：`nc.vo.ipmfund.projectexit.AggProjectExitVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_projectexit` | `nc.vo.ipmfund.projectexit.ProjectExitVO` | 主表 |
| `ipmfund_proexitdocset` | `nc.vo.ipmfund.projectexit.ProjectExitDocSetVO` | 文档信息 |

### 22. 子基金投资情况

**聚合VO**：`nc.vo.ipmfund.subfundinvestment.AggSubFundInvestmentVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_subfundinvestment` | `nc.vo.ipmfund.subfundinvestment.SubFundInvestmentVO` | 主表 |
| `ipmfund_subfund_docset` | `nc.vo.ipmfund.subfundinvestment.SubFundInvestmentDocSetVO` | 文档信息 |

### 23. 基金托管协议

**聚合VO**：`nc.vo.ipmfund.trusteeshipprotocol.AggTrusteeshipProtocolVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmfund_trusteeshipprotocol` | `nc.vo.ipmfund.trusteeshipprotocol.TrusteeshipProtocolVO` | 主表 |
| `ipmfund_trustee_contactinfo` | `nc.vo.ipmfund.trusteeshipprotocol.BusinessContactInfoVO` | 业务联系信息 |
| `ipmfund_trusteeship_docset` | `nc.vo.ipmfund.trusteeshipprotocol.TrusteeshipProtolDocSetVO` | 文档信息 |

---

## 投资计划（ipmip）

### 1. 投资完成情况报送

**聚合VO**：`nc.vo.ipmip.infosubmit.AggInfoSubmitVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_ip_infosubmit` | `nc.vo.ipmip.infosubmit.InfoSubmitVO` | 主表 |
| `ipm_ip_infosubmit_b` | `nc.vo.ipmip.infosubmit.InfoSubmitBVO` | 项目信息 |

### 2. 投资计划调整

**聚合VO**：`nc.vo.ipmip.planadjust.AggPlanAdjustBillVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_ip_planadjust` | `nc.vo.ipmip.planadjust.PlanAdjustHeadVO` | 主表 |
| `ipm_ip_planadjust_b` | `nc.vo.ipmip.planadjust.PlanAdjustBodyVO` | 子表 |

### 3. 投资计划编制

**聚合VO**：`nc.vo.ipmip.plandrawup.AggPlanDrawupVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_ip_plandrawup` | `nc.vo.ipmip.plandrawup.PlanDrawupVO` | 主表 |
| `ipm_ip_plandrawup_b` | `nc.vo.ipmip.plandrawup.PlanDrawupBVO` | 项目信息 |

### 4. 投资项目交付单

**聚合VO**：`nc.vo.ipmip.projdeliver.AggProjDeliverVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_ip_projdeliver` | `nc.vo.ipmip.projdeliver.ProjDeliverVO` | 主表 |
| `ipm_ip_projdeliver_b` | `nc.vo.ipmip.projdeliver.ProjDeliverBVO` | 交付物信息 |

---

## 投资决策（ipmpb）

### 1. 投资决策

**聚合VO**：`nc.vo.ipmpb.decision.AggInvestDecisionVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_decision` | `nc.vo.ipmpb.decision.InvestDecisionVO` | 主表 |
| `ipm_pb_decision_b` | `nc.vo.ipmpb.decision.InvestDecisionBVO` | 决策论证记录 |
| `ipm_pb_decision_docset` | `nc.vo.ipmpb.decision.InvestDecisionDocSetVO` | 文档信息 |

### 2. 尽职调查报告

**聚合VO**：`nc.vo.ipmpb.diligence.AggDiligenceVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_diligence` | `nc.vo.ipmpb.diligence.DiligenceVO` | 主表 |
| `ipmpb_diligence_docset` | `nc.vo.ipmpb.diligence.DiligenceDocSetVO` | 文档信息 |

### 3. 可行性研究报告

**聚合VO**：`nc.vo.ipmpb.feasibility.AggFeasibilityVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_feasibility` | `nc.vo.ipmpb.feasibility.FeasibilityVO` | 主表 |
| `ipmpb_feasibility_docset` | `nc.vo.ipmpb.feasibility.FeasibilityDocSetVO` | 文档信息 |

### 4. 投资意向

**聚合VO**：`nc.vo.ipmpb.intention.AggIntentionVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_intention` | `nc.vo.ipmpb.intention.IntentionVO` | 主表 |
| `ipm_pb_intention_b` | `nc.vo.ipmpb.intention.IntentionBVO` | 资金来源 |
| `ipmpb_intention_docset` | `nc.vo.ipmpb.intention.IntentionDocSetVO` | 文档信息 |

### 5. 会议纪要

**聚合VO**：`nc.vo.ipmpb.meetresume.AggMeetResumeVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_meetresume` | `nc.vo.ipmpb.meetresume.MeetResumeVO` | 主表 |
| `ipm_pb_meetresume_b` | `nc.vo.ipmpb.meetresume.MeetResumeBVO` | 与会人员信息 |
| `ipmpb_meetresume_docset` | `nc.vo.ipmpb.meetresume.MeetResumeDocSetVO` | 文档信息 |

### 6. 立项申请

**聚合VO**：`nc.vo.ipmpb.projectapply.AggProjectApplyVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_projectapply` | `nc.vo.ipmpb.projectapply.ProjectApplyVO` | 主表 |
| `ipm_pb_projectapply_b` | `nc.vo.ipmpb.projectapply.ProjectApplyBVO` | 资金来源 |
| `ipm_pb_projectapply_docset` | `nc.vo.ipmpb.projectapply.ProjectApplyDocSetVO` | 文档信息 |

### 7. 项目建议书

**聚合VO**：`nc.vo.ipmpb.proposal.AggProposalVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pb_proposal` | `nc.vo.ipmpb.proposal.ProposalVO` | 主表 |
| `ipmpb_proposal_docset` | `nc.vo.ipmpb.proposal.ProposalDocSetVO` | 文档信息 |

---

## 项目后评价（ipmpe）

### 1. 投资项目后评价

**聚合VO**：`nc.vo.ipmpe.posteval.AggPostEvalVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pe_posteval` | `nc.vo.ipmpe.posteval.PostEvalVO` | 主表 |
| `ipmpe_posteval_docset` | `nc.vo.ipmpe.posteval.PostEvalDocsetVO` | 文档信息 |

---

## 投资规划（ipmpg）

### 1. 负面清单

**聚合VO**：`nc.vo.ipmpg.negativelist.AggNegativeVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmpg_negative` | `nc.vo.ipmpg.negativelist.NegativeVO` | 主表 |
| `ipmpg_negative_list` | `nc.vo.ipmpg.negativelist.NegativeListVO` | 投资项目负面清单目录 |

---

## 项目库（ipmpl）

### 1. 投资项目档案

**聚合VO**：`nc.vo.ipmpl.projectlib.AggProjectLibVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipm_pl_projectlib` | `nc.vo.ipmpl.projectlib.ProjectLibVO` | 主表 |
| `ipm_pl_projectlib_b` | `nc.vo.ipmpl.projectlib.ProjectLibBVO` | 租金来源 |
| `ipm_pl_projectlib_version` | `nc.vo.ipmpl.projectlib.ProjectLibVersionBVO` | 版本记录 |

### 2. 项目中心

| 表名 | VO 类 |
|------|-------|
| `ipmpl_projectcenter` | `nc.vo.ipmpl.projectcenter.ProjectCenterVO` |

---

## 产权管理（ipmprm）

### 1. 企业增资

**聚合VO**：`nc.vo.ipmrm.addshare.AggAddShareVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_addshare` | `nc.vo.ipmrm.addshare.AddShareVO` | 主表 |
| `ipmrm_addshare_docset` | `nc.vo.ipmrm.addshare.AddShareDocsetVO` | 文档信息 |
| `ipmrm_addshare_investor` | `nc.vo.ipmrm.addshare.AddShareInvestorVO` | 投资方信息 |
| `ipmrm_addshare_shareholder` | `nc.vo.ipmrm.addshare.AddShareShareholderVO` | 增资后股东情况 |

### 2. 资产评估

**聚合VO**：`nc.vo.ipmrm.asseteval.AggAssetEvalVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_asseteval` | `nc.vo.ipmrm.asseteval.AssetEvalVO` | 主表 |
| `ipmrm_asseteval_docset` | `nc.vo.ipmrm.asseteval.AssetEvalDocsetVO` | 文档信息 |
| `ipmrm_asseteval_result` | `nc.vo.ipmrm.asseteval.AssetEvalResultVO` | 评估结果 |

### 3. 注销产权登记

**聚合VO**：`nc.vo.ipmrm.cancelequity.AggCancelEquityVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_cancel_equity` | `nc.vo.ipmrm.cancelequity.CancelEquityVO` | 主表 |
| `ipmrm_cancel_assets` | `nc.vo.ipmrm.cancelequity.CancelAssetsVO` | 企业注销前国有资产状况 |
| `ipmrm_cancel_assetsway` | `nc.vo.ipmrm.cancelequity.CancelAssetsWayVO` | 国有资产处置方式 |
| `ipmrm_cancel_docset` | `nc.vo.ipmrm.cancelequity.CancelDocSetVO` | 文档信息 |
| `ipmrm_cancel_transferway` | `nc.vo.ipmrm.cancelequity.CancelTransferWayVO` | 国有产权转让收入处置方式 |

### 4. 变动产权登记

**聚合VO**：`nc.vo.ipmrm.changeequity.AggChangeEqutiyBillVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_change_equity` | `nc.vo.ipmrm.changeequity.ChangeEqutiyHeadVO` | 主表 |
| `ipmrm_change_addreason` | `nc.vo.ipmrm.changeequity.ChangeAddReasonVO` | 增加原因及数额 |
| `ipmrm_change_assets` | `nc.vo.ipmrm.changeequity.ChangeAssetsVO` | 变动情况（二） |
| `ipmrm_change_docset` | `nc.vo.ipmrm.changeequity.ChangeDocsetVO` | 文档信息 |
| `ipmrm_change_investor` | `nc.vo.ipmrm.changeequity.ChangeInvestorVO` | 出资人情况 |
| `ipmrm_change_one` | `nc.vo.ipmrm.changeequity.ChangeOneVO` | 变动情况（一） |
| `ipmrm_change_subreason` | `nc.vo.ipmrm.changeequity.ChangeSubReasonVO` | 减少原因及数额 |

### 5. 产权信息

**聚合VO**：`nc.vo.ipmrm.enterpriseinfo.AggEnterpriseinfoBillVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_enterprise` | `nc.vo.ipmrm.enterpriseinfo.EnterpriseinfoHeadVO` | 主表 |
| `ipmrm_enterprise_assets` | `nc.vo.ipmrm.enterpriseinfo.EnterpriseinfoAssetsBVO` | 企业资产占用状况 |
| `ipmrm_enterprise_behalf` | `nc.vo.ipmrm.enterpriseinfo.EnterpriseinfoBehalfBVO` | 产权代表 |
| `ipmrm_enterprise_investor` | `nc.vo.ipmrm.enterpriseinfo.EnterpriseinfoInvestorBVO` | 出资人情况 |
| `ipmrm_enterprise_version` | `nc.vo.ipmrm.enterpriseinfo.EnterpriseinfoVersionBVO` | 版本记录 |

### 6. 占有产权登记

**聚合VO**：`nc.vo.ipmrm.equityregist.AggEqutiyRegisterBillVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_equity_register` | `nc.vo.ipmrm.equityregist.EqutiyRegisterHeadVO` | 主表 |
| `ipmrm_regist_assets` | `nc.vo.ipmrm.equityregist.EqutiyRegisterAssetsVO` | 企业资产占用状况 |
| `ipmrm_regist_docset` | `nc.vo.ipmrm.equityregist.EqutiyRegisterDocSetVO` | 文档信息 |
| `ipmrm_regist_investor` | `nc.vo.ipmrm.equityregist.EqutiyRegisterInvestorVO` | 出资人情况 |

### 7. 产权转让

**聚合VO**：`nc.vo.ipmrm.equitytransfer.AggEquityTransferVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_equity_transfer` | `nc.vo.ipmrm.equitytransfer.EquityTransferVO` | 主表 |
| `ipmrm_equity_transferer` | `nc.vo.ipmrm.equitytransfer.EquityTransfererVO` | 转让方信息 |
| `ipmrm_equitytransfer_docset` | `nc.vo.ipmrm.equitytransfer.EquityTransferDocsetVO` | 文档信息 |

### 8. 资产评估项目核准申请

**聚合VO**：`nc.vo.ipmrm.projapproval.AggProjApprovalVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrm_projapproval` | `nc.vo.ipmrm.projapproval.ProjApprovalVO` | 主表 |
| `ipmrm_projapproval_docset` | `nc.vo.ipmrm.projapproval.ProjApprovalDocSetVO` | 文档信息 |

---

## 风险管理（ipmrisk）

### 1. 风险评估

**聚合VO**：`nc.vo.ipmrisk.riskassess.AggRiskAssessVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_riskassess` | `nc.vo.ipmrisk.riskassess.RiskAssessVO` | 主表 |
| `ipmrisk_assessdoc` | `nc.vo.ipmrisk.riskassess.RiskAssessDocsBVO` | 文档信息 |
| `ipmrisk_assessqual` | `nc.vo.ipmrisk.riskassess.RiskAssessQualIndexVO` | 定性指标 |
| `ipmrisk_assessquant` | `nc.vo.ipmrisk.riskassess.RiskAssessQuantIndexVO` | 定量指标 |

### 2. 风险评估报告

**聚合VO**：`nc.vo.ipmrisk.riskassessreport.AggRiskAssessReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_assessreport` | `nc.vo.ipmrisk.riskassessreport.RiskAssessReportVO` | 主表 |
| `ipmrisk_assessreport_docs` | `nc.vo.ipmrisk.riskassessreport.RiskAssessReportDocsBVO` | 文档 |
| `ipmrisk_assessreport_event` | `nc.vo.ipmrisk.riskassessreport.RiskAssessReportEventBVO` | 风险事件 |

### 3. 风险案例库

**聚合VO**：`nc.vo.ipmrisk.riskcaselib.AggRiskCaseLibVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_caselib` | `nc.vo.ipmrisk.riskcaselib.RiskCaseLibVO` | 主表 |
| `ipmrisk_caselibqual` | `nc.vo.ipmrisk.riskcaselib.RiskCaseLibQualIndexVO` | 定性指标 |
| `ipmrisk_caselibquan` | `nc.vo.ipmrisk.riskcaselib.RiskCaseLibQuanIndexVO` | 定量指标 |

### 4. 风险指标库

| 表名 | VO 类 |
|------|-------|
| `ipmrisk_index` | `nc.vo.ipmrisk.index.IndexVO` |

### 5. 风险管理报告

**聚合VO**：`nc.vo.ipmrisk.managereport.AggManageReportVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_managereport` | `nc.vo.ipmrisk.managereport.ManageReportVO` | 主表 |
| `ipmrisk_managereport_doc` | `nc.vo.ipmrisk.managereport.ManageReportDocBVO` | 文档信息 |
| `ipmrisk_managereport_event` | `nc.vo.ipmrisk.managereport.ManageRiskEventVO` | 风险事件 |

### 6. 风险监测

**聚合VO**：`nc.vo.ipmrisk.riskmonitor.AggRiskMonitorVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_riskmonitor` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorVO` | 主表 |
| `ipmrisk_monitor_docset` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorDocVO` | 文档信息 |
| `ipmrisk_monitor_fund` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorFundVO` | 基金监测 |
| `ipmrisk_monitor_project` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorProjectVO` | 监测项目 |
| `ipmrisk_monitor_qual` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorQualVO` | 定性指标 |
| `ipmrisk_monitor_quan` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorQuanVO` | 定量指标 |
| `ipmrisk_monitor_warnpsn` | `nc.vo.ipmrisk.riskmonitor.RiskMonitorPsnVO` | 预警人员信息 |

### 7. 风险审议决议

**聚合VO**：`nc.vo.ipmrisk.riskresolution.AggRiskResolutionVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_resolution` | `nc.vo.ipmrisk.riskresolution.RiskResolutionVO` | 主表 |
| `ipmrisk_resolution_docset` | `nc.vo.ipmrisk.riskresolution.RiskResolutionDocsetVO` | 文档信息 |
| `ipmrisk_resolution_member` | `nc.vo.ipmrisk.riskresolution.RiskResolutionMemberVO` | 与会人员信息 |
| `ipmrisk_resolution_qualindex` | `nc.vo.ipmrisk.riskresolution.RiskResolutionQualIndexVO` | 定性指标 |
| `ipmrisk_resolution_quanindex` | `nc.vo.ipmrisk.riskresolution.RiskResolutionQuanIndexVO` | 定量指标 |

### 8. 风险监测调整

**聚合VO**：`nc.vo.ipmrisk.riskadjust.AggRiskAdjustVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_riskadjust` | `nc.vo.ipmrisk.riskadjust.RiskAdjustVO` | 主表 |
| `ipmrisk_riskadjust_docset` | `nc.vo.ipmrisk.riskadjust.RiskAdjustDocsetVO` | 文档信息 |
| `ipmrisk_riskadjust_fund` | `nc.vo.ipmrisk.riskadjust.RiskAdjustFundVO` | 监测基金 |
| `ipmrisk_riskadjust_project` | `nc.vo.ipmrisk.riskadjust.RiskAdjustProjectVO` | 监测项目 |
| `ipmrisk_riskadjust_qualindex` | `nc.vo.ipmrisk.riskadjust.RiskAdjustQualIndexVO` | 定性指标 |
| `ipmrisk_riskadjust_quanindex` | `nc.vo.ipmrisk.riskadjust.RiskAdjustQuanIndexVO` | 定量指标 |
| `ipmrisk_riskadjust_warningpsn` | `nc.vo.ipmrisk.riskadjust.RiskAdjustWarningPsnVO` | 预警接收人员信息 |

### 9. 风险库

**聚合VO**：`nc.vo.ipmrisk.riskbase.AggRiskBaseVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_riskbase` | `nc.vo.ipmrisk.riskbase.RiskBaseVO` | 主表 |
| `ipmrisk_riskbase_qual_index` | `nc.vo.ipmrisk.riskbase.RiskBaseQualIndexVO` | 定性指标 |
| `ipmrisk_riskbase_quan_index` | `nc.vo.ipmrisk.riskbase.RiskBaseQuanIndexVO` | 定量指标 |

### 10. 风险录入

**聚合VO**：`nc.vo.ipmrisk.riskenter.AggRiskEnterVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_riskenter` | `nc.vo.ipmrisk.riskenter.RiskEnterVO` | 主表 |
| `ipmrisk_riskenter_docs` | `nc.vo.ipmrisk.riskenter.RiskEnterDocsBVO` | 文档 |
| `ipmrisk_riskenter_quanindex` | `nc.vo.ipmrisk.riskenter.RiskenterQuantIndexVO` | 定量指标 |
| `ipmrisk_riskenter_warningpsn` | `nc.vo.ipmrisk.riskenter.RiskenterWarningPsnVO` | 预警接收人员信息 |
| `ipmrisk_riskentry_qualindex` | `nc.vo.ipmrisk.riskenter.RiskentryQualIndexVO` | 定性指标 |

### 11. 风险事件库

**聚合VO**：`nc.vo.ipmrisk.riskevent.AggRiskEventVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_riskevent` | `nc.vo.ipmrisk.riskevent.RiskEventVO` | 主表 |
| `ipmrisk_riskevent_qualindex` | `nc.vo.ipmrisk.riskevent.RiskeventQualIndexVO` | 定性指标 |
| `ipmrisk_riskevent_quanindex` | `nc.vo.ipmrisk.riskevent.RiskeventQuanIndexVO` | 定量指标 |
| `ipmrisk_riskevent_track` | `nc.vo.ipmrisk.riskevent.RiskeventTrackVO` | 处置跟踪 |
| `ipmrisk_riskevent_version` | `nc.vo.ipmrisk.riskevent.RiskeventVersionVO` | 版本记录 |

### 12. 风险日志

**聚合VO**：`nc.vo.ipmrisk.risklog.AggRiskLogVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_risklog` | `nc.vo.ipmrisk.risklog.RiskLogVO` | 主表 |
| `ipmrisk_risklog_warninfo` | `nc.vo.ipmrisk.risklog.RiskLogWarnInfoVO` | 预警详细信息 |

### 13. 风险处置跟踪

**聚合VO**：`nc.vo.ipmrisk.risktrack.AggRiskTrackVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_risktrack` | `nc.vo.ipmrisk.risktrack.RiskTrackVO` | 主表 |
| `ipmrisk_risktrack_docset` | `nc.vo.ipmrisk.risktrack.RiskTrackDocSetVO` | 文档信息 |
| `ipmrisk_track_qual` | `nc.vo.ipmrisk.risktrack.RiskTrackQualVO` | 定性指标 |
| `ipmrisk_track_quan` | `nc.vo.ipmrisk.risktrack.RiskTrackQuanVO` | 定量指标 |

### 14. 风险类型

**聚合VO**：`nc.vo.ipmrisk.risktype.AggRiskTypeVO`

| 表名 | VO 类 | 说明 |
|------|-------|------|
| `ipmrisk_risktype` | `nc.vo.ipmrisk.risktype.RiskTypeVO` | 主表 |
| `ipmrisk_syslib` | `nc.vo.ipmrisk.syslib.RiskSysLibVO` | 风险制度库 |

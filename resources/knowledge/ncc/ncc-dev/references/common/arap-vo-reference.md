# NCC 应收应付模块（arap）VO 与表名对照表

## 一、应付类单据

### 1. 暂估应付单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 暂估应付单 | — | `nc.vo.arap.estipayable.AggEstiPayableBillVO` |
| 表头 | 暂估应付单 | `ap_estipayablebill` | `nc.vo.arap.estipayable.EstiPayableBillVO` |
| 表体 | 暂估应付单行 | `ap_estipayableitem` | `nc.vo.arap.estipayable.EstiPayableBillItemVO` |

### 2. 供应商应付单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 供应商应付单 | — | `nc.vo.arap.payable.AggPayableBillVO` |
| 表头 | 供应商应付单 | `ap_payablebill` | `nc.vo.arap.payable.PayableBillVO` |
| 表体 | 供应商应付单行 | `ap_payableitem` | `nc.vo.arap.payable.PayableBillItemVO` |

### 3. 供应商付款单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 供应商付款单 | — | `nc.vo.arap.pay.AggPayBillVO` |
| 表头 | 供应商付款单 | `ap_paybill` | `nc.vo.arap.pay.PayBillVO` |
| 表体 | 供应商付款单行 | `ap_payitem` | `nc.vo.arap.pay.PayBillItemVO` |

---

## 二、应收类单据

### 4. 未确认应收单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 未确认应收单 | — | `nc.vo.arap.estireceivable.AggEstiReceivableBillVO` |
| 表头 | 未确认应收单 | `ar_estirecbill` | `nc.vo.arap.estireceivable.EstiReceivableBillVO` |
| 表体 | 未确认应收单行 | `ar_estirecitem` | `nc.vo.arap.estireceivable.EstiReceivableBillItemVO` |

### 5. 客户收款单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 客户收款单 | — | `nc.vo.arap.gathering.AggGatheringBillVO` |
| 表头 | 客户收款单 | `ar_gatherbill` | `nc.vo.arap.gathering.GatheringBillVO` |
| 表体 | 客户收款单行 | `ar_gatheritem` | `nc.vo.arap.gathering.GatheringBillItemVO` |

### 6. 客户应收单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 客户应收单 | — | `nc.vo.arap.receivable.AggReceivableBillVO` |
| 表头 | 客户应收单 | `ar_recbill` | `nc.vo.arap.receivable.ReceivableBillVO` |
| 表体 | 客户应收单行 | `ar_recitem` | `nc.vo.arap.receivable.ReceivableBillItemVO` |

---

## 三、汇兑损益

### 7. 汇兑损益

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 汇兑损益 | — | `nc.vo.arap.agiotage.AggAgiotageVO` |
| 主表 | 汇兑损益记录表 | `arap_agiotage` | `nc.vo.arap.agiotage.AgiotageMainVO` |
| 子表 | 汇兑损益子表 | `arap_agiotage_d` | `nc.vo.arap.agiotage.AgiotageChildVO` |

---

## 四、对账

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 应收对账过滤条件 | `arap_apglbrbill` | `nc.bs.arap.bill.brdeal.BRConditionVO` |
| 应付对账单据 | `arap_arglbrbill` | `nc.bs.arap.bill.brdeal.BRConditionVO` |

### 33. 应收对账单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 应收对账单 | — | `nc.vo.arap.tally.AggRecStatementVO` |
| 主表 | 应收对账单 | `arap_recstatement` | `nc.vo.arap.tally.RecStatementVO` |
| 子表 | 应收对账单行 | `arap_recstatementitem` | `nc.vo.arap.tally.RecStatementItemVO` |

---

## 五、坏账管理（nc.vo 包）

### 9. 坏账计提

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账计提 | — | `nc.vo.arap.badacc.AggBadAccDstlVO` |
| 主表 | 坏账计提主表 | `arap_badaccdstl` | `nc.vo.arap.badacc.BadAccDstlVO` |
| 辅表 | 坏账计提辅表 | `arap_badaccdstl_b` | `nc.vo.arap.badacc.BadAccDstlDetailVO` |

### 10. 坏账发生

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账发生 | — | `nc.vo.arap.baddebts.AggBaddebtsOcchVO` |
| 主表 | 坏账发生主表 | `arap_baddebts_occh` | `nc.vo.arap.baddebts.BaddebtsOcchVO` |
| 明细 | 坏账发生明细表 | `arap_baddebts_occu` | `nc.vo.arap.baddebts.BaddebtsOccuVO` |

### 11. 坏账收回

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账收回 | — | `nc.vo.arap.baddebts.AggBaddebtsRechVO` |
| 主表 | 坏账收回主表 | `arap_baddebts_rech` | `nc.vo.arap.baddebts.BaddebtsRechVO` |
| 明细 | 坏账收回明细表 | `arap_baddebts_rece` | `nc.vo.arap.baddebts.BaddebtsReceVO` |

### 25. 坏账计提方案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账计提方案 | — | `nc.vo.arap.badacc.AggDstlCaseVO` |
| 主表 | 坏账计提方案主表 | `arap_dstlcase` | `nc.vo.arap.badacc.DstlCaseParentVO` |
| 子表 | 坏账计提方案子表 | `arap_dstlcase_b` | `nc.vo.arap.badacc.DstlCaseChildVO` |
| 孙表 | 计提方案辅辅表 | `arap_dstlcase_b_b` | `nc.vo.arap.badacc.DstlCaseGrandChildVO` |
| — | 方案对应计提因素表 | `arap_dstlcasefactor` | `nc.vo.arap.badacc.DstlCaseFactorVO` |
| — | 坏账计提方案比率表 | `arap_dstlcaserate` | `nc.vo.arap.badacc.DstlCaseRateVO` |
| — | 坏帐计提因素表 | `arap_dstlfactor` | `nc.voarap.dstlfactor.arap_dstlfactor` |
| — | 坏帐计提方案因素值 | `arap_dstlfactorvalue` | `nc.vo.arap.dstlfactorvalue.Entity` |

---

## 六、坏账管理（nccloud.vo 包）

### 14. 坏账损失

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账损失 | — | `nccloud.vo.arap.bdloss.AggBdLossVO` |
| 主表 | 坏账损失 | `arap_bdloss` | `nccloud.vo.arap.bdloss.BdLossVO` |
| 子表 | 坏账损失子表 | `arap_bdloss_d` | `nccloud.vo.arap.bdloss.BdLossChildVO` |
| 孙表 | 坏账损失孙表 | `arap_bdloss_dd` | `nccloud.vo.arap.bdloss.BdLossSunVO` |

### 15a. 坏账计提（nccloud）

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账计提 | — | `nccloud.vo.arap.bdprovision.AggBdProvisionVO` |
| 主表 | 坏账计提 | `arap_bdprovision` | `nccloud.vo.arap.bdprovision.BdProvisionVO` |
| 明细 | 坏账计提明细 | `arap_bdprovision_d` | `nccloud.vo.arap.bdprovision.BdProvisionDetailVO` |
| 明细 | 账龄计提明细 | `arap_bdprovision_dd` | `nccloud.vo.arap.bdprovision.BdProvisionDetailPeriodVO` |

### 15b. 坏账计提比率

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账计提比率 | — | `nccloud.vo.arap.bdprovisionratio.AggBdProvisionRatioVO` |
| 主表 | 坏账计提比率 | `arap_bdprovisionratio` | `nccloud.vo.arap.bdprovisionratio.BdProvisionRatioVO` |
| 子表 | 计提比率维度 | `arap_dimratio` | `nccloud.vo.arap.bdprovisionratio.DimRatioVO` |

### 15c. 坏账计提规则

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 坏账计提规则 | `arap_bdprovisionrule` | `nccloud.vo.arap.bdprovisionrule.BdProVisionRuleVO` |
| 坏账计提规则明细 | `arap_bdprovisionrule_d` | `nccloud.vo.arap.bdprovisionrule.BdProvisionRuleDVO` |

### 16. 坏账收回（nccloud）

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 坏账收回 | — | `nccloud.vo.arap.bdrecovery.AggBdRecoveryVO` |
| 主表 | 坏账收回 | `arap_bdrecovery` | `nccloud.vo.arap.bdrecovery.BdRecoveryVO` |
| 明细 | 坏账收回收款明细 | `arap_bdrecovery_sk` | `nccloud.vo.arap.bdrecovery.BdRecoverySKVO` |
| 明细 | 坏账收回应收明细 | `arap_bdrecovery_ys` | `nccloud.vo.arap.bdrecovery.BdRecoveryYSVO` |

### 27. 个别计提

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 个别计提 | — | `nccloud.vo.arap.indiprovision.AggIndiProvisionVO` |
| 主表 | 个别计提 | `arap_indiprovision` | `nccloud.vo.arap.indiprovision.IndiProvisionVO` |
| 明细 | 个别计提明细 | `arap_indiprovision_d` | `nccloud.vo.arap.indiprovision.IndiProvisionDetailVO` |

---

## 七、记账表

### 26. 暂估明细

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 暂估明细 | — | `nc.vo.arap.tally.AggEstiTallyVO` |
| 主表 | 暂估明细 | `arap_estitally` | `nc.vo.arap.tally.EstiTallyVO` |
| 协议 | 暂估明细协议 | `arap_estitally_agr` | `nc.vo.arap.tally.EstiTallyAgrVO` |
| 全量 | 暂估明细全信息 | `arap_estitally_all` | `nc.vo.arap.tally.EstiTallyAllVO` |

### 34. 应收应付记账表

> 备注：这三个表共同构成了应收应付的"记账表"，存储了所有应收应付单据及其相关的详细业务数据（包括核销、汇兑损益、坏账、债券转移等）。它们是收付报表、对账功能等的数据来源，数据量会随着业务操作快速增长。

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 应收应付记账表 | — | `nc.vo.arap.tally.AggTallyVO` |
| 主表 | 应收应付记账表 | `arap_tally` | `nc.vo.arap.tally.TallyVO` |
| 协议 | 应收应付记账协议表 | `arap_tally_agr` | `nc.vo.arap.tally.TallyAgrVO` |
| 全量 | 应收应付记账全量表 | `arap_tally_all` | `nc.vo.arap.tally.TallyAllVO` |

---

## 八、核销

### 37a. 核销单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 核销单 | — | `nc.vo.arap.verify.AggverifyVO` |
| 主表 | 核销主表 | `arap_verify` | `nc.vo.arap.verify.VerifyMainVO` |
| 明细 | 核销明细表 | `arap_verifydetail` | `nc.vo.arap.verify.VerifyDetailVO` |

### 37b. 核销方案

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 核销方案表 | `arap_verify_fa` | `nc.vo.arap.verify.VerifyfaVO` |

---

## 九、催款

### 28. 催款语气

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 催款语气 | — | `nc.vo.arap.reminder.AggArapNoticeVO` |
| 主表 | 催款语气主表 | `arap_notice` | `nc.vo.arap.reminder.ArapNoticeVO` |
| 子表 | 催款语气子表 | `arap_notice_b` | `nc.vo.arap.reminder.ArapNoticeItemVO` |

### 39. 催款单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 催款单 | — | `nc.vo.arap.reminder.AggReminderVO` |
| 表头 | 催款单表头 | `reminderbill` | `nc.vo.arap.reminder.ReminderBillVO` |
| 表体 | 催款单表体 | `reminderitem` | `nc.vo.arap.reminder.ReminderItemVO` |

---

## 十、金税

### 38. 金税

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 金税 | — | `nc.vo.arap.goldentax.AggGoldTaxHeadVO` |
| 主实体 | 金税主实体 | `arapgoldentax` | `nc.vo.arap.goldentax.GoldTaxHeadVO` |
| 子实体 | 金税子实体 | `arapgoldentax_b` | `nc.vo.arap.goldentax.GoldTaxBodyVO` |

---

## 十一、并账

### 20. 并账

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 并账 | — | `nc.vo.arap.debttransfer.AggDebtTransferVO` |
| 主表 | 并账主表 | `arap_transfer_h` | `nc.vo.arap.debttransfer.DebtTransferMainVO` |
| 明细 | 并账明细表 | `arap_debtstransfer` | `nc.vo.arap.debttransfer.DebtTransferVO` |

---

## 十二、单表（无聚合VO）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 月余额发生表 | `arap_balance` | `nc.vo.arap.tally.BalanceVO` |
| 月余额汇总日志 | `arap_balancelog` | `nc.vo.arap.tally.BalanceLogVO` |
| 协同信息 | `arap_bcmap` | `nc.vo.arap.billconfer.BcMapVO` |
| 单据协同设置 | `arap_billconfer` | `nc.vo.arap.billconfer.BillconferVO` |
| 单据坏账累计金额记录 | `arap_bdbill` | `nccloud.vo.arap.bdbill.BdBillVO` |
| 业务数据映射表 | `arap_billmap` | `nc.vo.arap.pfflow.ArapBillMapVO` |
| 收付单据类型 | `arap_billtype` | `nc.vo.arap.djlx.DjLXVO` |
| 收付业务数据 | `arap_busidata` | `nc.vo.arap.agiotage.ArapBusiDataVO` |
| 自定义字段对照表 | `arap_deffieldmapping` | `nc.vo.arap.tally.DefFieldMappingVO` |
| 明细联查 | `arap_detaillinkquery` | `nc.vo.arap.comreport.DetailLinkQueryVO` |
| 维度扩展 | `arap_dimextend` | `nccloud.vo.arap.dimextend.DimExtendVO` |
| 计提维度表 | `arap_provisiondim` | `nccloud.vo.arap.provisiondim.ProvisiondimVO` |
| 报表查询对象设置 | `arap_qryobject` | `nc.vo.arap.query.QueryObjSuperVO` |
| 月余额表优化字段 | `arap_qryobjfield` | `nc.vo.arap.perfbal.QryObjFieldVO` |
| 月余额表优化字段值 | `arap_qryobjval` | `nc.vo.arap.perfbal.QryObjValVO` |
| 计提比率版本 | `arap_ratioversion` | `nccloud.vo.arap.ratioversion.RatioVersionVO` |
| 收付款协议表 | `arap_termitem` | `nc.vo.arap.termitem.TermVO` |

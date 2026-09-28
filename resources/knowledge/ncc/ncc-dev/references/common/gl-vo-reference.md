# NCC 总账模块（gl）VO 与表名对照表

> ⚠️ **注意**：本模块数据与其他模块结构不一致，部分主子表关系缺少聚合VO，疑似文档未更新。当前按原始文档如实记录，后续使用中如发现问题再修正。

---

## 一、凭证

### 38. 凭证

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 凭证 | `gl_voucher` | `nc.vo.gl.voucher.VoucherVO` |
| 分录 | 分录 | `gl_detail` | `nc.vo.gl.voucher.DetailVO` |

### 50. 实时凭证

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 实时凭证主体 | `gl_rtvoucher` | `nc.vo.gl.aggvoucher.MDVoucher` |
| 辅核 | 辅助核算内容表 | `gl_freevalue` | `nc.vo.gl.aggvoucher.FreeValueVO` |
| 分录 | 实时凭证分录 | `gl_rtdetail` | `nc.vo.gl.aggvoucher.MDDetail` |

### 79. 凭证单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 凭证单 | — | `nc.vo.gl.voucherbill.GLVoucherAggVO` |
| 表头 | 凭证单 | `gl_sscvoucher` | `nc.vo.gl.voucherbill.GLVoucherVO` |
| 分录 | 分录 | `gl_sscdetail` | `nc.vo.gl.voucherbill.VoucherDetailVO` |

### 25. 常用凭证

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 常用凭证 | `gl_commonvoucher` | `nc.vo.gl.commonvoucher.CommonvoucherVO` |
| 分类 | 常用类 | `gl_commnvclass` | `nc.vo.gl.commonvoucher.CommnvClassVO` |
| 分录 | 常用分录 | `gl_commondetail` | `nc.vo.gl.commonvoucher.CommondetailVO` |

---

## 二、凭证校验规则

### 10. 凭证校验规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 凭证校验规则 | `gl_vouchkrule` | `nc.vo.gl.vouchkrule.VoucherCheckRuleVO` |
| — | 科目组1 | `gl_accountgroupone` | `nc.vo.gl.vouchkrule.AccountGroupOneVO` |
| — | 科目组2 | `gl_accountgrouptwo` | `nc.vo.gl.vouchkrule.AccountGroupTwoVO` |
| — | 科目关系规则 | `gl_accountrule` | `nc.vo.gl.vouchkrule.AccountRuleVO` |
| — | 贷方必有 | `gl_credithaveacct` | `nc.vo.gl.vouchkrule.CreditHaveAcctVO` |
| — | 借方必有 | `gl_debithaveacct` | `nc.vo.gl.vouchkrule.DebitHaveAcctVO` |
| — | 例外组织 | `gl_exceptorg` | `nc.vo.gl.vouchkrule.ExceptOrgVO` |
| — | 凭证必有 | `gl_voucherhaveacct` | `nc.vo.gl.vouchkrule.VoucherHaveAcctVO` |
| — | 凭证必无 | `gl_vouchernothaveacct` | `nc.vo.gl.vouchkrule.VoucherNotHaveAcctVO` |
| — | 现金银行科目控制 | `gl_vouruleexceptacct` | `nc.vo.gl.vouchkrule.VouRuleExceptAcctVO` |
| — | 对方 | `gl_vouruleotheracct` | `nc.vo.gl.vouchkrule.VoucherRuleOtherAcctVO` |
| — | 本方 | `gl_vouruleselfacct` | `nc.vo.gl.vouchkrule.VoucherRuleSelfAcctVO` |
| — | 凭证类别约束 | `gl_voutyperule` | `nc.vo.gl.vouchkrule.VouTypeRuleVO` |

---

## 三、周期凭证

### 11. 周期凭证周期

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 周期凭证周期主体 | `gl_amorcycle` | `nc.vo.gl.amortize.setting.AmorCycleVO` |
| 明细 | 摊销周期明细 | `gl_amorcycledetail` | `nc.vo.gl.amortize.setting.AmorCycleDetailVO` |

### 12. 周期凭证定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 周期凭证定义主体 | `gl_amortize` | `nc.vo.gl.amortize.setting.AmortizeVO` |
| 明细 | 周期凭证定义明细 | `gl_amordetail` | `nc.vo.gl.amortize.setting.AmorDetailVO` |

---

## 四、分摊

### 13. 分摊规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 分摊规则 | `gl_apportionrule` | `nc.vo.gl.apportion.ApportionRuleVO` |
| 明细 | 分摊对象明细 | `gl_appdetail` | `nc.vo.gl.apportion.AppdetailVO` |
| — | 分摊对象 | `gl_appitem` | `nc.vo.gl.apportion.AppitemVO` |

---

## 五、内部交易对账

### 5. 对账结果查询

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 对账结果查询 | — | `nc.vo.gl.contrast.result.AggResultListTabVO` |
| 列表 | 对账报告生成列表VO | `gl_resultlisttabvo` | `nc.vo.gl.contrast.result.ResultListTabVO` |
| 明细 | 余额对账明细VO | `gl_ResultDetailTabVO` | `nc.vo.gl.contrast.result.ResultDetailTabVO` |
| 明细 | 发生对账明细VO | `gl_ResultOccurTabDetailVO` | `nc.vo.gl.contrast.result.ResultOccurTabDetailVO` |

### 36. 公司对账记录

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 公司对账记录 | — | `nc.vo.gl.contrast.result.AggCorpContrastVO` |
| 表头 | 公司对账记录主体 | `gl_corpcontrast` | `nc.vo.gl.contrast.result.CorpContrastVO` |
| 明细 | 对账明细 | `gl_corpcontrastsub` | `nc.vo.gl.contrast.result.CorpContrastSubVO` |

### 26. 内部交易对账检查结果

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 内部交易对账检查结果 | `gl_contrastcheck` | `nc.vo.gl.contrast.init.ContrastInitCheckVO` |

### 27. 对账期初余额

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 对账期初余额表 | `gl_contrastinit` | `nc.vo.gl.contrast.init.ContrastInitVO` |
| 明细 | 对账期初余额明细表 | `gl_contrastinitsub` | `nc.vo.gl.contrast.init.ContrastInitSubVO` |

### 29. 对账报告

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 对账报告 | `gl_contrastreport` | `nc.vo.gl.contrast.report.ContrastReportVO` |
| 明细 | 对帐报告明细 | `gl_contrastreportsub` | `nc.vo.gl.contrast.report.ContrastReportSubVO` |

### 30. 内部交易规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 内部交易规则 | `gl_contrastrule` | `nc.vo.gl.contrast.rule.ContrastRuleVO` |
| — | 内部交易规则明细范围 | `gl_contrastrulearea` | `nc.vo.gl.contrast.rule.ContrastRuleAreaVO` |
| — | 内部交易规则辅助核算 | `gl_contrastruleass` | `nc.vo.gl.contrast.rule.ContrastRuleAssVO` |
| — | 内部交易规则启用设置 | `gl_contrastrulestartset` | `nc.vo.gl.contrast.rule.ContrastRuleStartSetVO` |
| — | 内部交易明细科目对 | `gl_contrastrulesub` | `nc.vo.gl.contrast.rule.ContrastRuleSubjVO` |

### 其他对账相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 对帐数据 | `gl_ContrastData` | `nc.vo.gl.contrast.data.ContrastDataVO` |
| 对账报告生成列表VO | `gl_ContrastReportCreateVO` | `nc.vo.gl.contrast.report.create.ContrastReportCreateVO` |
| 对账报告生成明细VO | `gl_crepcreatdetailvo` | `nc.vo.gl.contrast.report.create.ContrastReportCreateDetailVO` |
| 总额对账发生明细 | `gl_ResultOccurSubVO` | `nc.vo.gl.contrast.result.ResultOccurSubVO` |
| 对账结果查询对象 | `gl_ResultQryVO` | `nc.vogl.ResultQryVO.ResultQryVO` |
| 科目行数据VO | `gl_SubjRowDataVO` | `nc.vo.gl.contrast.report.subjdata.SubjRowDataVO` |
| 自动对账VO | `gl_autocontrast` | `nc.vo.gl.contrast.detailcontrat.AutoContrastRuleVO` |
| 明细对账VO | `gl_detailcontrastvo` | `nc.vo.gl.contrast.DetailContrastVO` |
| 汇总对账VO | `gl_sumcontrast` | `nc.vo.gl.contrast.SumContrastVO` |
| 总额对账余额明细VO | `gl_result` | `nc.vo.gl.contrast.result.ResultBalanceSubVO` |

---

## 六、业务对账

### 16. 业务对账设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 业务对账设置 | `gl_brsetting` | `nc.vo.gl.busirecon.setting.BRSettingVO` |
| — | 会计科目子表 | `gl_braccasoa` | `nc.vo.gl.busirecon.setting.BRAccasoaVO` |
| — | 对账维度 | `gl_brdimslity` | `nc.vo.gl.busirecon.setting.BRdimslityVO` |

### 17. 业务系统对账注册

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 业务系统对账注册 | `gl_brdealclass` | `nc.vo.gl.busirecon.dealclass.BRDealClassVO` |

### 18. 对照关系

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 对照关系 | `gl_brrelation` | `nc.vo.gl.busirecon.setting.BRRelationVO` |

---

## 七、现金流量

### 19. 现金流量业务规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 现金流量业务规则 | `gl_busrule` | `nc.vo.gl.cashflowcase.BusruleVO` |
| — | 现金流量业务规则对应表 | `gl_busrelation` | `nc.vo.gl.cashflowcase.BusrelationVO` |
| — | 现金流量规则明细 | `gl_busruledetail` | `nc.vo.gl.cashflowcase.BusruledetailVO` |

### 20. 现金流量调整

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 现金流量调整 | `gl_cashflowadjust` | `nc.vo.gl.cashflowcase.CashflowAdjustVO` |
| 子表 | 现金流量调整子表 | `gl_cashflowadjustsub` | `nc.vo.gl.cashflowcase.CashflowAdjustsubVO` |

### 21. 现金流量发生项

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 现金流量发生项 | `gl_cashflowcase` | `nc.vo.gl.cashflowcase.CashflowcaseVO` |

### 22. 现金流量项目对照关系

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 现金流量项目对照关系设置 | `gl_cfitemrelation` | `nc.vo.gl.reconcile.cfitemrelation.CFItemRelationVO` |

### 80. 附表分析科目设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 附表分析科目设置 | `gl_subrel_ass` | `nc.vo.gl.cashflowcase.SubRelAssVO` |

### 81. 现金流量科目对应规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 现金流量科目对应规则 | `gl_subrelation` | `nc.vo.gl.cashflowcase.SubrelationVO` |
| — | 现金流量辅助项对应规则 | `gl_subtoass` | `nc.vo.gl.cashflowcase.SubToAssVO` |

---

## 八、凭证合并与生成

### 3. 默认合并方案设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 默认合并方案设置 | `gl_DefaultCombineScheme` | `nc.vo.voucher.fip.DefaultCombineScheme` |

### 24. 凭证生成合并规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 凭证生成合并规则 | — | `nc.vo.voucher.fip.Aggcombinscheme` |
| 表头 | 凭证生成合并规则 | `gl_combinscheme` | `nc.vo.voucher.fip.CombinschemeVO` |
| — | 例外科目 | `gl_expaccount` | `nc.vo.voucher.fip.Expaccount` |

---

## 九、关账与月结

### 23. 关账表

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 关账表 | `gl_closeaccbook` | `nc.vo.gl.closeaccbook.CloseaccbookVO` |

### 77. 月结报告

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 月结报告 | `gl_settledreport` | `nc.vo.gl.settledreport.SettledReportVO` |
| 行 | 月结报告单行 | `gl_settledreportitem` | `nc.vo.gl.settledreport.SettledReportItemVO` |

### 78. 月结检查项

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 月结检查项 | `gl_settledrule` | `nc.vo.gl.settledrule.SettledRuleVO` |

### 83. 期末结账

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 期末结账 | `gl_syssettled` | `nc.vo.glcom.reckoning.SyssettledVO` |

---

## 十、协同

### 37. 公司对照关系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 公司对照关系主体 | `gl_corprelation` | `nc.vo.gl.corprelation.CorprelationVO` |
| 明细 | 公司对照关系明细 | `gl_corprelationsub` | `nc.vo.gl.corprelation.CorprelationsubVO` |

### 68. 协同定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 协同定义主体 | `gl_reconcile` | `nc.vo.gl.reconcileinit.ReconcileVO` |
| 明细 | 协同定义明细 | `gl_reconcilesub` | `nc.vo.gl.reconcileinit.ReconcilesubVO` |

### 69. 协同中心

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 协同中心VO | `gl_reconcilecenter` | `nc.vo.gl.reconcile.center.ReconcileCenterVO` |

### 70. 协同消息设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 协同消息设置 | `gl_reconcilemeg` | `nc.vo.gl.reconcile.rule.ReconcileMegVO` |

### 71. 协同发生

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 协同发生 | `gl_reconcileoccur` | `nc.vo.gl.reconcile.occur.ReconcileOccurVO` |
| 明细 | 协同发生明细 | `gl_reconoccursub` | `nc.vo.gl.reconcile.occur.ReconOccurSubVO` |

### 72. 协同业务规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 协同业务规则 | `gl_reconcilerule` | `nc.vo.gl.reconcile.rule.ReconcileRuleVO` |
| — | 协同业务规则明细 | `gl_ReconcileRuleSub` | `nc.vo.gl.reconcile.rule.ReconcileRuleSubVO` |
| — | 辅助核算内容 | `gl_reconconfsoa` | `nc.vo.gl.reconcile.rule.ReconcileSoaSubVO` |

### 其他协同相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 协同科目 | `gl_reconcilesubj` | `nc.vo.gl.pubreconcile.ReconcilesubjVO` |
| 协同单位 | `gl_reconcileunit` | `nc.vo.gl.pubreconcile.ReconcileunitVO` |
| 协同单位子表 | `gl_reconcileunitsub` | `nc.vo.gl.pubreconcile.ReconcileunitsubVO` |
| 对方凭证VO | `gl_recothertmp` | `nc.vo.gl.reconcile.othertmp.RecOtherTmpVO` |
| 协同模版凭证设置 | `gl_modelsetvoucher` | `nc.vo.gl.reconcileinit.ModelsetvoucherVO` |

---

## 十一、折算

### 34. 折算规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 折算规则 | `gl_convertrule` | `nc.vo.gl.fc.rule.FCRuleVO` |
| — | 折算规则汇率信息 | `gl_convertrate` | `nc.vo.gl.fc.rule.FCconvertRateVO` |
| — | 折算科目对照关系 | `gl_convertref` | `nc.vo.gl.fc.rule.FcconvrefVO` |
| — | 折算账簿关联定义 | `gl_soblink` | `nc.vo.gl.fc.rule.SoblinkVO` |

### 35. 折算类记录

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 折算类记录 | `gl_convertlog` | `nc.vo.gl.fc.rule.ConvertlogVO` |

---

## 十二、自定义转账

### 84. 自定义转账定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 自定义转账定义主体 | `gl_transfer` | `nc.vo.gl.transfer.TransferdefVO` |
| 明细 | 自定义转账定义明细 | `gl_transferdetail` | `nc.vo.gl.transfer.TransferSubVO` |

### 85. 转账执行历史

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 转账执行历史数据表 | `gl_transferhistory` | `nc.vo.gl.transfer.TransferHistoryVOy` |

### 86. 转账分类定义

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 转账分类定义 | `gl_transfersort` | `nc.vo.gl.transfersort.TransfersortVO` |

### 87. 转帐分类权限

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 转帐分类定义权限设置信息表 | `gl_transperm` | `nc.vo.gl.transfersort.TranspermVO` |

### 88. 自定义转账方案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 自定义转账方案档案定义 | `gl_transproject` | `nc.vo.gl.transproject.TransprojectVO` |
| 明细 | 自定义转账方案定义 | `gl_transprodef` | `nc.vo.gl.transproject.TransprodefVO` |

### 89. 汇兑损益定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 汇兑损益定义主体 | `gl_transrate` | `nc.vo.gl.transrate.TransrateVoucherVO` |
| 分录 | 汇兑损益分录 | `gl_transratedetail` | `nc.vo.gl.transrate.TransrateDetailVO` |

### 90. 自定义转账本方定义

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 自定义转账本方定义 | `gl_transselfdef` | `nc.vo.gl.transferselfdefine.TransselfdefVO` |

---

## 十三、单表（无聚合VO）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 控制规则 | `gl_controlrule` | `nc.itf.gl.fip.ControlRuleVO` |
| 辅助项目 | `gl_docfree1` | `nc.vo.gl.assitem.AssItemVO` |
| 基础档案对照 | `gl_docmaptemplet` | `nc.vo.gl.map.DocmaptempletVO` |
| 账表初始化 | `gl_freerepinit` | `nc.vo.gl.freereport.FreeReportInitVO` |
| 账表查询对象 | `gl_freequeryobj` | `nc.vo.gl.freereport.FreeQueryObjVO` |
| 影响因素关联 | `gl_inflfacjoin` | `nc.vo.gl.reconcile.inflfacjoin.InflFacJoinVO` |
| 总账影响因素 | `gl_influecefactor` | `nc.vo.gl.reconcile.influecefactor.InflueceFactorVO` |
| 互斥设置 | `gl_mutex` | `nc.vo.gl.mutex.MutexVO` |
| 互斥设置子表 | `gl_mutexstatus` | `nc.vo.gl.mutex.MutexStatusVO` |
| 对方科目对照关系设置 | `gl_notrecaccrelation` | `nc.vo.gl.reconcile.notrecaccrelation.NotRecAccRelationVO` |
| 对方科目个性对照关系设置 | `gl_notrecaccrelsp` | `nc.vo.gl.reconcile.notrecaccrelation.NotRecAccRelSPVO` |
| 打印页号 | `gl_printPageNo` | `nc.vo.gl.accbookprint.PrintpagenoVO` |
| 打印处理类 | `gl_printdealclass` | `nc.vo.gl.accbookprint.PrintdealclassVO` |
| 打印任务 | `gl_printjobuser` | `nc.vo.gl.accbookprint.PrintjobuserVO` |
| 最后一页数据 | `gl_lastpagedata` | `nc.vo.gl.accbookprint.LastpagedataVO` |
| 查询条件 | `gl_querycondition` | `nc.vo.gl.accbookprint.QueryconditionVO` |
| 分布式回执消息日志 | `gl_receiptlog` | `nc.vo.gl.distribution.ReceiptLogVO` |
| 分布式接收日志 | `gl_receivelog` | `nc.vo.gl.distribution.ReceiveLogVO` |
| 分布系统传输日志 | `gl_distranslog` | `nc.vo.gl.distribution.DistransLogVO` |
| 分布系统传输规则 | `gl_distransrule` | `nc.vo.gl.voucher.distribution.DistransRuleVO` |
| 税务明细 | `gl_vatdetail` | `nc.vo.gl.vatdetail.VatDetailVO` |
| 核销记录 | `gl_verify_log` | `nc.vo.glrp.verify.VerifyLogVO` |
| 凭证用户 | `gl_voucheruser` | `nc.vo.gl.voucher.VoucherUserVO` |

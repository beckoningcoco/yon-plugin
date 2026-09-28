# NCC 销售管理模块 VO 与表名对照表

## 一、主子表关系（有聚合VO）

### 1. 销售订单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 销售订单 | — | `nc.vo.so.m30.entity.SaleOrderVO` |
| 表头 | 销售订单主实体 | `so_saleorder` | `nc.vo.so.m30.entity.SaleOrderHVO` |
| 表体 | 销售订单子实体 | `so_saleorder_b` | `nc.vo.so.m30.entity.SaleOrderBVO` |

### 2. 发货单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 发货单 | — | `nc.vo.so.m4331.entity.DeliveryVO` |
| 表头 | 发货单主实体 | `so_delivery` | `nc.vo.so.m4331.entity.DeliveryHVO` |
| 表体 | 发货单子实体 | `so_delivery_b` | `nc.vo.so.m4331.entity.DeliveryBVO` |
| 孙表 | 发货单质检实体 | `so_delivery_check` | `nc.vo.so.m4331.entity.DeliveryCheckVO` |

### 3. 销售发票

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 销售发票 | — | `nc.vo.so.m32.entity.SaleInvoiceVO` |
| 表头 | 销售发票主实体 | `so_saleinvoice` | `nc.vo.so.m32.entity.SaleInvoiceHVO` |
| 表体 | 销售发票子实体 | `so_saleinvoice_b` | `nc.vo.so.m32.entity.SaleInvoiceBVO` |

### 4. 订单收款核销

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 订单收款核销 | — | `nc.vo.so.m30.sobalance.entity.SoBalanceVO` |
| 表头 | 订单收款核销主实体 | `so_balance` | `nc.vo.so.m30.sobalance.entity.SoBalanceHVO` |
| 表体 | 订单收款核销子实体 | `so_balance_b` | `nc.vo.so.m30.sobalance.entity.SoBalanceBVO` |

### 5. 买赠设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 买赠设置 | — | `nc.vo.so.mbuylargess.entity.BuyLargessVO` |
| 表头 | 买赠设置 | `so_buylargess` | `nc.vo.so.mbuylargess.entity.BuyLargessHVO` |
| 表体 | 买赠子表 | `so_buylargess_b` | `nc.vo.so.mbuylargess.entity.BuyLargessBVO` |

### 6. 客户物料关系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 客户物料关系 | — | `nc.vo.so.custmatrel.entity.CustMatRelVO` |
| 表头 | 客户物料关系主实体 | `so_custmatrel` | `nc.vo.so.custmatrel.entity.CustMatRelHVO` |
| 表体 | 客户物料关系子实体 | `so_custmatrel_b` | `nc.vo.so.custmatrel.entity.CustMatRelBVO` |

### 11. 销售订单修订

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 销售订单修订 | — | `nc.vo.so.m30.revise.entity.SaleOrderHistoryVO` |
| 表头 | 销售订单修订主表 | `so_orderhistory` | `nc.vo.so.m30.revise.entity.SaleOrderHistoryHVO` |
| 表体 | 销售订单修订附表 | `so_orderhistory_b` | `nc.vo.so.m30.revise.entity.SaleOrderHistoryBVO` |

### 13. 预订单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 预订单 | — | `nc.vo.so.m38.entity.PreOrderVO` |
| 表头 | 预订单主实体 | `so_preorder` | `nc.vo.so.m38.entity.PreOrderHVO` |
| 表体 | 预订单子实体 | `so_preorder_b` | `nc.vo.so.m38.entity.PreOrderBVO` |

### 17. 报价单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 报价单 | — | `nc.vo.so.salequotation.entity.AggSalequotationHVO` |
| 表头 | 报价单主实体 | `so_salequotation` | `nc.vo.so.salequotation.entity.SalequotationHVO` |
| 表体 | 报价单子实体 | `so_salequotation_b` | `nc.vo.so.salequotation.entity.SalequotationBVO` |

### 19. 销售发票待结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 销售发票待结算单 | — | `nc.vo.so.m33.m32.entity.SquareInvVO` |
| 表头 | 销售发票待结算单主实体 | `so_squareinv` | `nc.vo.so.m33.m32.entity.SquareInvHVO` |
| 表体 | 销售发票待结算单子实体 | `so_squareinv_b` | `nc.vo.so.m33.m32.entity.SquareInvBVO` |
| 孙表 | 销售发票结算单明细实体 | `so_squareinv_d` | `nc.vo.so.m33.m32.entity.SquareInvDetailVO` |

### 20. 销售出库待结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 销售出库待结算单 | — | `nc.vo.so.m33.m4c.entity.SquareOutVO` |
| 表头 | 销售出库待结算单主实体 | `so_squareout` | `nc.vo.so.m33.m4c.entity.SquareOutHVO` |
| 表体 | 销售出库待结算单子实体 | `so_squareout_b` | `nc.vo.so.m33.m4c.entity.SquareOutBVO` |
| 孙表 | 销售出库结算单明细实体 | `so_squareout_d` | `nc.vo.so.m33.m4c.entity.SquareOutDetailVO` |

### 21. 途损待结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 途损待结算单 | — | `nc.vo.so.m33.m4453.entity.SquareWasVO` |
| 表头 | 途损待结算单主实体 | `so_squarewas` | `nc.vo.so.m33.m4453.entity.SquareWasHVO` |
| 表体 | 途损待结算单子实体 | `so_squarewas_b` | `nc.vo.so.m33.m4453.entity.SquareWasBVO` |
| 孙表 | 途损结算单明细实体 | `so_squarewas_d` | `nc.vo.so.m33.m4453.entity.SquareDetailWasVO` |

### 22. 订单类型物料关系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 订单类型物料关系 | — | `nc.vo.so.tranmatrel.entity.TranMatRelVO` |
| 表头 | 订单类型物料关系主实体 | `so_tranmatrel` | `nc.vo.so.tranmatrel.entity.TranMatRelHVO` |
| 表体 | 订单类型物料关系子实体 | `so_tranmatrel_b` | `nc.vo.so.tranmatrel.entity.TranMatRelBVO` |

---

## 二、单表关系（无聚合VO）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 销售大屏 | `so_dashboard` | `nc.vo.so.dashboard.entity.SODashBoardVO` |
| 销售大屏数据抽取日志 | `so_dashboard_log` | `nc.vo.so.dashboard.entity.SODashboardLogVO` |
| 单据执行情况 | `so_execinfo` | `nc.vo.so.pub.execinfo.ExecInfoReportVO` |
| 销售订单执行情况 | `so_execreport` | `nc.vo.so.m3m.entity.OrderExecRptVO` |
| 销售订单交易类型 | `so_m30trantype` | `nc.vo.so.m30trantype.entity.M30TranTypeVO` |
| 销售发票交易类型 | `so_m32trantype` | `nc.vo.so.m32trantype.entity.M32TranTypeVO` |
| 预订单交易类型 | `so_m38trantype` | `nc.vo.so.m38trantype.entity.M38TranTypeVO` |
| 发货单交易类型 | `so_m4331trantype` | `nc.vo.so.m4331trantype.entity.M4331trantypeVO` |
| 销售订单移动报表分析 | `so_mb_orderanaly` | `nc.vo.so.report.analy.entity.SaleOrderAnalyVO` |
| 销售出库对冲执行情况 | `so_outrushexeinfo` | `nc.vo.so.m33.m4c.linkqryoutrush.entity.OutRushExeInfoVO` |
| 销售毛利预估 | `so_profit` | `nc.vo.so.pub.entry.ProfitVO` |
| 销售模块收款计划 | `so_recvplan` | `nc.vo.so.pub.entry.RecvPlanVO` |
| 退货政策分配 | `so_returnassign` | `nc.vo.so.mreturnassign.entity.ReturnAssignVO` |
| 退货条件 | `so_returncndtn` | `nc.vo.so.mreturncondition.entity.ReturnConditionVO` |
| 退货政策设置 | `so_returnpolicy` | `nc.vo.so.mreturnpolicy.entity.ReturnPolicyVO` |
| 退货原因 | `so_returnreason` | `nc.vo.so.mreturnreason.entity.ReturnReasonVO` |
| 报价单交易类型 | `so_salequotationtype` | `nc.vo.so.m4310trantype.entity.M4310TranTypeVO` |

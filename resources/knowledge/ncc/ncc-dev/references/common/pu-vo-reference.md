# NCC 采购管理模块 VO 与表名对照表

## 一、主子表关系（有聚合VO）

### 1. 到货单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 到货单 | — | `nc.vo.pu.m23.entity.ArriveVO` |
| 表头 | 到货单主表 | `po_arriveorder` | `nc.vo.pu.m23.entity.ArriveHeaderVO` |
| 表体 | 到货单明细表 | `po_arriveorder_b` | `nc.vo.pu.m23.entity.ArriveItemVO` |
| 孙表 | 到货单质检明细表 | `po_arriveorder_bb` | `nc.vo.pu.m23.entity.ArriveBbVO` |

### 2. 开票确认

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 开票确认 | — | `nccloud.vo.pu.comparebill.entity.CompareBillVO` |
| 表头 | 开票确认主表 | `po_comparebill` | `nccloud.vo.pu.comparebill.entity.CompareBillHeaderVO` |
| 表体 | 开票确认子表 | `po_comparebill_b` | `nccloud.vo.pu.comparebill.entity.CompareBillItemVO` |

### 3. 采购成本要素

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购成本要素 | — | `nc.vo.pu.costfactor.entity.CostfactorVO` |
| 表头 | 采购成本要素 | `po_costfactor` | `nc.vo.pu.costfactor.entity.CostfactorHeaderVO` |
| 表体 | 采购成本要素表体 | `po_costfactor_b` | `nc.vo.pu.costfactor.entity.CostfactorItemVO` |

### 4. 期初暂估单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 期初暂估单 | — | `nc.vo.pu.m4t.entity.InitialEstVO` |
| 表头 | 期初暂估单 | `po_initialest` | `nc.vo.pu.m4t.entity.InitialEstHeaderVO` |
| 表体 | 期初暂估单明细 | `po_initialest_b` | `nc.vo.pu.m4t.entity.InitialEstItemVO` |

### 5. 采购发票

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购发票 | — | `nc.vo.pu.m25.entity.InvoiceVO` |
| 表头 | 采购发票主表 | `po_invoice` | `nc.vo.pu.m25.entity.InvoiceHeaderVO` |
| 表体 | 采购发票子表 | `po_invoice_b` | `nc.vo.pu.m25.entity.InvoiceItemVO` |
| 孙表 | 付款计划 | `po_invoice_settle` | `nc.vo.pu.m25.entity.InvoiceSettleItemVO` |

### 6. 采购订单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购订单 | — | `nc.vo.pu.m21.entity.OrderVO` |
| 表头 | 采购订单 | `po_order` | `nc.vo.pu.m21.entity.OrderHeaderVO` |
| 表体 | 采购订单明细 | `po_order_b` | `nc.vo.pu.m21.entity.OrderItemVO` |
| 孙表 | 采购订单在途状态 | `po_order_bb` | `nc.vo.pu.m21.entity.StatusOnWayItemVO` |
| 孙表 | 到货计划 | `po_order_bb1` | `nc.vo.pu.m21.entity.OrderReceivePlanVO` |
| 孙表 | 采购订单在途状态VO | `po_order_bb_vo` | `nc.vo.pu.m21.entity.OrderOnwayItemVO` |
| 孙表 | 付款账期 | `po_order_payment` | `nc.vo.pu.m21.entity.OrderPaymentVO` |

### 7. 采购订单付款计划

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购订单付款计划 | — | `nc.vo.pu.m21.entity.AggPayPlanVO` |
| 表头 | 采购订单付款计划 | `po_order_payplan` | `nc.vo.pu.m21.entity.PayPlanVO` |
| 表体 | 采购订单付款计划子表 | `po_order_payplan_b` | `nc.vo.pu.m21.entity.PayPlanItemVO` |

### 8. 采购订单在途

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购订单在途 | — | `nc.vo.pu.m21.entity.OrderOnwayVO` |
| 表头 | 采购订单在途VO | `po_order_vo` | `nc.vo.pu.m21.entity.OrderOnwayHeaderVO` |
| 表体 | 采购订单在途状态VO | `po_order_bb_vo` | `nc.vo.pu.m21.entity.OrderOnwayItemVO` |

### 9. 岗位设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 岗位设置 | — | `nc.vo.pu.position.entity.PositionVO` |
| 表头 | 岗位设置 | `po_position` | `nc.vo.pu.position.entity.PositionHeaderVO` |
| 表体 | 岗位设置子表 | `po_position_b` | `nc.vo.pu.position.entity.PositionItemVO` |

### 10. 请购单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 请购单 | — | `nc.vo.pu.m20.entity.PraybillVO` |
| 表头 | 请购单主表 | `po_praybill` | `nc.vo.pu.m20.entity.PraybillHeaderVO` |
| 表体 | 请购单子表 | `po_praybill_b` | `nc.vo.pu.m20.entity.PraybillItemVO` |

### 11. 价格结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 价格结算单 | — | `nc.vo.pu.m24.entity.PricestlVO` |
| 表头 | 价格结算单 | `po_pricesettle` | `nc.vo.pu.m24.entity.PricestlHeaderVO` |
| 表体 | 价格结算单子表 | `po_pricesettle_b` | `nc.vo.pu.m24.entity.PricestlItemVO` |
| 孙表 | 价格结算单子子表 | `po_pricesettle_bb` | `nc.vo.pu.m24.entity.PricestlItemBVO` |

### 12. 采购入财务

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购入财务 | — | `nc.vo.pu.m4201.entity.PurchaseinFIVO` |
| 表头 | 采购入财务头 | `po_purchaseinfi` | `nc.vo.pu.m4201.entity.PurchaseinFIHeaderVO` |
| 表体 | 采购入财务体 | `po_purchaseinfi_b` | `nc.vo.pu.m4201.entity.PurchaseinFIItemVO` |
| 孙表 | 暂估费用分摊明细 | `po_purchaseinfi_fd` | `nc.vo.pu.m4201.entity.PurchaseinFIFDVO` |
| 孙表 | 采购入费用暂估明细 | `po_purchaseinfi_fee` | `nc.vo.pu.m4201.entity.PurchaseinFIFeeVO` |

### 13. 结算单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 结算单 | — | `nc.vo.pu.m27.entity.SettleBillVO` |
| 表头 | 结算单头 | `po_settlebill` | `nc.vo.pu.m27.entity.SettleBillHeaderVO` |
| 表体 | 结算单明细 | `po_settlebill_b` | `nc.vo.pu.m27.entity.SettleBillItemVO` |
| 孙表 | 结算费用分摊明细 | `po_settle_feeallot` | `nc.vo.pu.m27.entity.SettleFeeAllotDetailVO` |

### 14. 物资需求申请单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 物资需求申请单 | — | `nc.vo.pu.m422x.entity.StoreReqAppVO` |
| 表头 | 物资需求申请单 | `po_storereq` | `nc.vo.pu.m422x.entity.StoreReqAppHeaderVO` |
| 表体 | 物资需求申请单明细 | `po_storereq_b` | `nc.vo.pu.m422x.entity.StoreReqAppItemVO` |

### 15. 委托加工入财务

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 委托加工入财务 | — | `nc.vo.pu.m4203.entity.SubcontinFIVO` |
| 表头 | 委托加工入财务 | `po_subcontinfi` | `nc.vo.pu.m4203.entity.SubcontinFIHeaderVO` |
| 表体 | 委托加工入财务明细 | `po_subcontinfi_b` | `nc.vo.pu.m4203.entity.SubcontinFIItemVO` |

### 16. 消耗汇总财务

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 消耗汇总财务 | — | `nc.vo.pu.m4202.entity.VmiFIVO` |
| 表头 | 消耗汇总财务 | `po_vmifi` | `nc.vo.pu.m4202.entity.VmiFIHeaderVO` |
| 孙表 | 消耗汇总费用暂估分摊明细 | `po_vmifi_fd` | `nc.vo.pu.est.entity.m50.VmiFIFDVO` |
| 孙表 | 消耗汇总费用暂估明细 | `po_vmifi_fee` | `nc.vo.pu.m4202.entity.VmiFIFeeVO` |

---

## 二、单表关系（无聚合VO）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 到货单交易类型 | `po_arrivaltrantype` | `nc.vo.pu.m23trantype.entity.ArrivalTranTypeVO` |
| 请购单交易类型 | `po_buyrtrantype` | `nc.vo.pu.m20trantype.entity.BuyrTranTypeVO` |
| 采购发票交易类型 | `po_invctrantype` | `nc.vo.pu.m25trantype.entity.InvcTranTypeVO` |
| 进度确认单交易类型 | `po_planconfirmtrantype` | `nc.vo.pu.m2ctrantype.entity.PlanConfirmTranTypeVO` |
| 采购订单交易类型 | `po_potrantype` | `nc.vo.pu.m21transtype.entity.PoTransTypeVO` |
| 业务对账结果 | `po_compareresult` | `nccloud.vo.pu.comparebill.entity.CompareResultVO` |
| 匹配规则 | `po_matchrule` | `nccloud.vo.pu.taxinvoice.match.entity.TaxMatchRuleVO` |
| 采购询价 | `po_order_price` | `nc.vo.pu.m21.entity.OrderPriceVO` |
| 岗位设置附表 | `po_position_t` | `nc.vo.pu.position.entity.PositionTVO` |
| 价格论证表 | `po_praypriceinfo` | `nc.vo.pu.m20.entity.PrayPriceInfoVO` |
| 自动结算之发票入库单 | `po_rule_invoicestock` | `nc.vo.pu.m27.entity.InvoiceStockOptionableVO` |
| 自动结算之红蓝发票 | `po_rule_rbinvoice` | `nc.vo.pu.m27.entity.RBInvoiceOptionableVO` |
| 自动结算之红蓝入库单 | `po_rule_rbstock` | `nc.vo.pu.m27.entity.RBStockOptionableVO` |
| 入库单匹配 | `po_taxmatch` | `nccloud.vo.pu.taxinvoice.match.entity.TaxMatchVO` |
| 采购发票进项税发票关系 | `po_taxrelation` | `nc.vo.pu.m25.entity.InvoiceVtaxRelationVO` |

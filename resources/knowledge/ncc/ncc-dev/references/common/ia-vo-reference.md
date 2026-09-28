# NCC 存货核算模块（ia）VO 与表名对照表

> ⚠️ **重要提示**：存货核算（ia）与库存管理（ic）存在大量同名 VO（如采购入库、销售出库等），提问时如未特指模块，**一律默认为库存管理（ic）** 下的 VO。

---

## 一、公共设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 出入库类型 | `bd_billtype` | `nc.vo.ia.pub.transtype.TranstypeVO` |
| 计算维度表 | `ia_calcrange` | `nc.vo.ia.pub.entity.CalcRangeVO` |
| 业务依赖 | `ia_bizrely` | `nc.vo.ia.rely.BizRelyVO` |
| 循环依赖 | `ia_cyclerely` | `nc.vo.ia.rely.CycleRelyVO` |
| 依赖顺序 | `ia_relyorder` | `nc.vo.ia.rely.RelyOrderVO` |
| 主体间价值转移方式 | `ia_valuetrans` | `nc.vo.ia.valuetrans.entity.ValueTransVO` |

## 二、核算维度调整

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 核算维度调整单 | `ia_adjcalcrange` | `nc.vo.ia.invalmethod.entity.calcrange.AdjCalcRangeHeadVO` |
| 表体 | 核算维度调整单子表 | `ia_adjcalcrange_b` | `nc.vo.ia.invalmethod.entity.calcrange.AdjCalcRangeItemVO` |

> 聚合 VO：`nc.vo.ia.invalmethod.entity.calcrange.AdjCalcRangeBillVO`

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 计算维度调整日志 | `ia_calcrangelog` | `nc.vo.ia.invalmethod.entity.CalcRangeLogVO` |
| 计价方式调整记录 | `ia_pricemodelog` | `nc.vo.ia.invalmethod.entity.PriceModeLogVO` |

## 三、期初数据

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 录入期初差异 | `ia_beginvariances` | `nc.vo.ia.beginvariance.entity.BeginVarianceVO` |
| 录入期初差异（组件） | `ia_beginvariances_ccp` | `nc.vo.ia.beginvariance.entity.BeginVarianceCcpVO` |

## 四、单据明细账

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 计价辅助表 | `ia_assistantledger` | `nc.vo.ia.assistantledger.entity.AssistantLedgerVO` |
| 单据明细实体（组件） | `ia_ccpdetail` | `nc.vo.ia.ccpdetail.entity.CcpDetailVO` |
| 成本发出商品明细账（组件） | `ia_ccpgoods` | `nc.vo.ia.ccpgoods.entity.CcpGoodsVO` |
| 单据明细实体 | `ia_detailledger` | `nc.vo.ia.detailledger.entity.DetailLedgerVO` |
| 历史单据明细实体（组件） | `ia_hisccpdetail` | `nc.vo.ia.ccpdetail.entity.HisCcpDetailVO` |
| 历史单据明细实体 | `ia_hisdetailledger` | `nc.vo.ia.detailledger.entity.HisDetailLedgerVO` |

## 五、存货总账与发出商品账

### 存货总账

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 存货总账 | `ia_generalnab` | `nc.vo.ia.generalnab.GeneralnabVO` |
| 存货总账（组件） | `ia_generalnab_ccp` | `nc.vo.ia.generalnab.entity.GeneralNABCcpVO` |

### 发出商品账

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 发出商品明细账 | `ia_goodsledger` | `nc.vo.ia.goodsledger.entity.GoodsLedgerVO` |
| 发出商品月结存表 | `ia_goodsmonthnab` | `nc.vo.ia.monthaccount.entity.GoodsMonthnabVO` |
| 发出商品月结存（组件） | `ia_goodsmonthnab_ccp` | `nc.vo.ia.monthaccount.entity.GoodsMonthNABCcpVO` |
| 发出商品总账 | `ia_goodsnab` | `nc.vo.ia.goodsnab.entity.GoodsNABVO` |
| 发出商品总账（组件） | `ia_goodsnab_ccp` | `nc.vo.ia.goodsnab.entity.GoodsNABCcpVO` |

## 六、月末结账与期间结存

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 月末结账表 | `ia_account` | `nc.vo.ia.monthaccount.entity.MonthAccountVO` |
| 数据修正日志 | `ia_datarepairlog` | `nc.vo.ia.monthaccount.entity.DataRepairLogVO` |
| 存货总账月结存 | `ia_monthnab` | `nc.vo.ia.monthaccount.entity.MonthnabVO` |
| 存货总账月结存（组件） | `ia_monthnab_ccp` | `nc.vo.ia.monthaccount.entity.MonthNABCcpVO` |
| 期间结存标志记录 | `ia_period` | `nc.vo.ia.monthaccount.entity.PeriodVO` |
| 期间结存 | `ia_periodnab` | `nc.vo.ia.monthaccount.entity.PeriodnabVO` |
| 期间结存（组件） | `ia_periodnab_ccp` | `nc.vo.ia.monthaccount.entity.PeriodnabCcpVO` |

## 七、核算单据

### 7.1 录入期初单据

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 录入期初单据 | `ia_i0bill` | `nc.vo.ia.mi0.entity.I0HeadVO` |
| 表体 | 录入期初单据明细 | `ia_i0bill_b` | `nc.vo.ia.mi0.entity.I0ItemVO` |

> 聚合 VO：`nc.vo.ia.mi0.entity.I0BillVO`

### 7.2 采购入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 采购入库单 | `ia_i2bill` | `nc.vo.ia.mi2.entity.I2HeadVO` |
| 表体 | 采购入库单明细 | `ia_i2bill_b` | `nc.vo.ia.mi2.entity.I2ItemVO` |

> 聚合 VO：`nc.vo.ia.mi2.entity.I2BillVO`

### 7.3 产成品入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 产成品入库单 | `ia_i3bill` | `nc.vo.ia.mi3.entity.I3HeadVO` |
| 表体 | 产成品入库单明细 | `ia_i3bill_b` | `nc.vo.ia.mi3.entity.I3ItemVO` |

> 聚合 VO：`nc.vo.ia.mi3.entity.I3BillVO`

### 7.4 其他入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 其他入库单 | `ia_i4bill` | `nc.vo.ia.mi4.entity.I4HeadVO` |
| 表体 | 其他入库单明细 | `ia_i4bill_b` | `nc.vo.ia.mi4.entity.I4ItemVO` |

> 聚合 VO：`nc.vo.ia.mi4.entity.I4BillVO`

### 7.5 销售成本结转单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 销售成本结转单 | `ia_i5bill` | `nc.vo.ia.mi5.entity.I5HeadVO` |
| 表体 | 销售成本结转单明细 | `ia_i5bill_b` | `nc.vo.ia.mi5.entity.I5ItemVO` |

> 聚合 VO：`nc.vo.ia.mi5.entity.I5BillVO`

### 7.6 材料出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 材料出库单 | `ia_i6bill` | `nc.vo.ia.mi6.entity.I6HeadVO` |
| 表体 | 材料出库单明细 | `ia_i6bill_b` | `nc.vo.ia.mi6.entity.I6ItemVO` |

> 聚合 VO：`nc.vo.ia.mi6.entity.I6BillVO`

### 7.7 其他出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 其他出库单 | `ia_i7bill` | `nc.vo.ia.mi7.entity.I7HeadVO` |
| 表体 | 其他出库单明细 | `ia_i7bill_b` | `nc.vo.ia.mi7.entity.I7ItemVO` |

> 聚合 VO：`nc.vo.ia.mi7.entity.I7BillVO`

### 7.8 报废单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 报废单 | `ia_i8bill` | `nc.vo.ia.mi8.entity.I8HeadVO` |
| 表体 | 报废单明细 | `ia_i8bill_b` | `nc.vo.ia.mi8.entity.I8ItemVO` |

> 聚合 VO：`nc.vo.ia.mi8.entity.I8BillVO`

### 7.9 入库调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 入库调整单 | `ia_i9bill` | `nc.vo.ia.mi9.entity.I9HeadVO` |
| 表体 | 入库调整单明细 | `ia_i9bill_b` | `nc.vo.ia.mi9.entity.I9ItemVO` |

> 聚合 VO：`nc.vo.ia.mi9.entity.I9BillVO`

### 7.10 出库调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 出库调整单 | `ia_iabill` | `nc.vo.ia.mia.entity.IAHeadVO` |
| 表体 | 出库调整单明细 | `ia_iabill_b` | `nc.vo.ia.mia.entity.IAItemVO` |

> 聚合 VO：`nc.vo.ia.mia.entity.IABillVO`

### 7.11 计划价调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 计划价调整单 | `ia_ibbill` | `nc.vo.ia.mib.entity.IBHeadVO` |
| 表体 | 计划价调整单明细 | `ia_ibbill_b` | `nc.vo.ia.mib.entity.IBItemVO` |

> 聚合 VO：`nc.vo.ia.mib.entity.IBBillVO`

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 计划价调整单（组件） | `ia_ibbill_ccp` | `nc.vo.ia.mib.entity.IBItemCcpVO` |

### 7.12 委托加工入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 委托加工入库单 | `ia_idbill` | `nc.vo.ia.mid.entity.IDHeadVO` |
| 表体 | 委托加工入库单明细 | `ia_idbill_b` | `nc.vo.ia.mid.entity.IDItemVO` |

> 聚合 VO：`nc.vo.ia.mid.entity.IDBillVO`

### 7.13 差异结转单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 差异结转单 | `ia_iebill` | `nc.vo.ia.mie.entity.IEHeadVO` |
| 表体 | 差异结转单明细 | `ia_iebill_b` | `nc.vo.ia.mie.entity.IEItemVO` |

> 聚合 VO：`nc.vo.ia.mie.entity.IEBillVO`

### 7.14 跌价提取单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 跌价提取单 | `ia_ifbill` | `nc.vo.ia.mif.entity.IFHeadVO` |
| 表体 | 跌价提取单明细 | `ia_ifbill_b` | `nc.vo.ia.mif.entity.IFItemVO` |

> 聚合 VO：`nc.vo.ia.mif.entity.IFBillVO`

### 7.15 损益调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 损益调整单 | `ia_igbill` | `nc.vo.ia.mig.entity.IGHeadVO` |
| 表体 | 损益调整单明细 | `ia_igbill_b` | `nc.vo.ia.mig.entity.IGItemVO` |

> 聚合 VO：`nc.vo.ia.mig.entity.IGBillVO`

### 7.16 调拨入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 调拨入库单 | `ia_iibill` | `nc.vo.ia.mii.entity.IIHeadVO` |
| 表体 | 调拨入库单明细 | `ia_iibill_b` | `nc.vo.ia.mii.entity.IIItemVO` |

> 聚合 VO：`nc.vo.ia.mii.entity.IIBillVO`

### 7.17 调拨出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 调拨出库单 | `ia_ijbill` | `nc.vo.ia.mij.entity.IJHeadVO` |
| 表体 | 调拨出库单明细 | `ia_ijbill_b` | `nc.vo.ia.mij.entity.IJItemVO` |

> 聚合 VO：`nc.vo.ia.mij.entity.IJBillVO`

### 7.18 差异单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 差异单 | `ia_ikbill` | `nc.vo.ia.mik.entity.IKHeadVO` |
| 表体 | 差异单明细 | `ia_ikbill_b` | `nc.vo.ia.mik.entity.IKItemVO` |

> 聚合 VO：`nc.vo.ia.mik.entity.IKBillVO`

### 7.19 跌价提取单_利润中心

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 跌价提取单_利润中心 | `ia_ilbill` | `nc.vo.ia.mil.entity.ILHeadVO` |
| 表体 | 跌价提取单明细_利润中心 | `ia_ilbill_b` | `nc.vo.ia.mil.entity.ILItemVO` |

> 聚合 VO：`nc.vo.ia.mil.entity.ILBillVO`

### 7.20 计划价批量调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 计划价批量调整单 | `ia_planedprice` | `nc.vo.ia.m2801.entity.PlanedPriceHeadVO` |
| 表体 | 计划价批量调整单明细 | `ia_planedprice_b` | `nc.vo.ia.m2801.entity.PlanedPriceItemVO` |

> 聚合 VO：`nc.vo.ia.m2801.entity.PlanedPriceBillVO`

## 八、数据升级

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 数据升级检查结果 | `ia_upg_check` | `nc.vo.ia.upg.pcia.entity.IAUpgCheckVO` |
| 自定义项映射 | `ia_upg_def` | `nc.vo.ia.upg.pcia.entity.IAUpgDefVO` |
| 数据升级结果 | `ia_upg_result` | `nc.vo.ia.upg.pcia.entity.IAUpgResultVO` |

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 公共设置 | 6 |
| 核算维度调整 | 4 |
| 期初数据 | 2 |
| 单据明细账 | 6 |
| 存货总账与发出商品账 | 9 |
| 月末结账与期间结存 | 7 |
| 核算单据 | 49 |
| 数据升级 | 3 |
| **合计** | **86** |

# NCC 供应链基础设置模块（scmpub）VO 与表名对照表

---

## 一、渠道管理

### 渠道管理分类

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 渠道管理分类 | `dcm_chnlmngtype` | `nc.vo.scmf.dcm.chnlmngtype.entity.ChnlMngTypeVO` |

### 分销渠道节点

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 分销渠道节点主实体 | `dcm_chnlnode` | `nc.vo.scmf.dcm.chnlnode.entity.ChnlNodeHVO` |
| 表体 | 分销渠道节点子实体 | `dcm_chnlnodeaddr` | `nc.vo.scmf.dcm.chnlnode.entity.ChnlNodeAddrBVO` |

> 聚合 VO：`nc.vo.scmf.dcm.chnlnode.entity.ChnlNodeVO`

### 渠道节点与助销员关系

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 渠道节点与助销员关系定义 | `dcm_chnlsellerrel` | `nc.vo.scmf.dcm.chnlsellerrel.entity.ChnlSellerRelVO` |

### 助销员

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 助销员分类 | `dcm_helpsellclass` | `nc.vo.scmf.dcm.helpsellclass.entity.HelpSellClassVO` |
| 助销员 | `dcm_helpseller` | `nc.vo.scmf.dcm.helpseller.entity.HelpSellerVO` |

## 二、物流配送

### 承运商与司机

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 承运商定义 | `dm_carrier` | `nc.vo.scmf.dm.carrier.entity.CarrierVO` |
| 司机定义 | `dm_driver` | `nc.vo.scmf.dm.driver.entity.DriverVO` |

### 代垫运费发票

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 代垫运费发票主表 | `dm_prepaidinvoice` | `nc.vo.scmf.dm.m4816.entity.PrePaidInvoiceHVO` |
| 表体 | 代垫运费发票子表 | `dm_prepaidinvoice_b` | `nc.vo.scmf.dm.m4816.entity.PrePaidInvoiceBVO` |

### 运输路线

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 运输路线 | `dm_route` | `nc.vo.scmf.dm.route.entity.RouteHVO` |
| 表体 | 运输线路地址 | `dm_routeaddr` | `nc.vo.scmf.dm.route.entity.RouteBVO` |

### 车辆

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 车辆定义 | `dm_vehicle` | `nc.vo.scmf.dm.vehicle.entity.VehicleVO` |
| 车型定义 | `dm_vehicletype` | `nc.vo.scmf.dm.vehicletype.entity.VehicleTypeVO` |

## 三、包装与整箱

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 包装分类档案 | `ic_packingtype` | `nc.vo.scmf.ic.mpackingtype.PackingTypeVO` |
| 包装箱类型 | `ic_packtype` | `nc.vo.scmf.ic.mpacktype.PackTypeVO` |
| 整箱定义 | `ic_wholepack` | `nc.vo.scmf.ic.mwholepack.WholePackVO` |

## 四、库存相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 库存状态调整 | `ic_stateadjust` | `nc.vo.ic.m4460.entity.StateAdjustVO` |
| 批次档案 | `scm_batchcode` | `nc.vo.scmf.ic.mbatchcode.BatchcodeVO` |
| 物料批次号规则 | `scm_batchcode_rule` | `nc.vo.scmf.ic.batchcoderule.BatchcodeRuleVO` |

## 五、计量器具

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 计量器具级别 | `pd_meainstrucl` | `nc.vo.ic.mscl.entity.MscVO` |
| 计量器具维护 | `pd_meastool` | `nc.vo.ic.mst.entity.MeasToolVO` |

## 六、采购相关设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 退货理由设置 | `scm_backreason` | `nc.vo.scmf.pu.backreason.entity.BackReasonVO` |
| 内部货源定义 | `scm_invsourcelist` | `nc.vo.scmf.pu.invsource.entity.InvSourceVO` |
| 物料对应订单交易类型设置 | `scm_martrantype` | `nc.vo.scmf.pu.ordertranstype.entity.OrderTransTypeVO` |

### 集采控制规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 集采控制规则 | `scm_cenpurule` | `nc.vo.scmf.pu.cenpurule.entity.CenPuRuleHeadVO` |
| 表体 | 集采控制规则子表 | `scm_cenpurule_b` | `nc.vo.scmf.pu.cenpurule.entity.CenPuRuleItemVO` |

### 询源补货单据类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 询源补货单据类型 | `scmpub_sourcetype` | `nc.vo.scmf.sourcing.entity.SourBillTypeVO` |

## 七、协同设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 协同设置主表 | `scm_coopsetup` | `nc.vo.scmf.coop.entity.CoopHeaderVO` |
| 表体 | 销售协同明细 | `scm_coopsetup_b` | `nc.vo.scmf.coop.entity.CoopBodyVO` |

> 聚合 VO：`nc.vo.scmf.coop.entity.CoopVO`

## 八、金税

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 金税主实体 | `scm_goldtax` | `nc.vo.scmpub.goldtax.GoldTaxHeadVO` |
| 表体 | 金税子实体 | `scm_goldtax_b` | `nc.vo.scmpub.goldtax.GoldTaxBodyVO` |

> 聚合 VO：`nc.vo.scmpub.goldtax.GoldTaxVO`

## 九、促销类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 促销类型定义实体 | `scm_promottype` | `nc.vo.scmf.promottype.entity.PromotTypeVO` |

## 十、暂存数据

### 暂存摘要配置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 暂存摘要配置 | `scm_smconfig` | `nc.vo.scmpub.tempsave.SummaryConfigHeadVO` |
| 表体 | 暂存摘要配置明细 | `scm_smconfig_b` | `nc.vo.scmpub.tempsave.SummaryConfigBodyVO` |

> 聚合 VO：`nc.vo.scmpub.tempsave.SummaryConfigVO`

### 暂存数据

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 暂存数据 | `scm_tempsave` | `nc.vo.scmpub.tempsave.TempSaveVO` |

## 十一、TMS 业务流水

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| TMS流水表(入) | `scm_tmsflowin` | `nccloud.vo.scmpub.tms.entity.TMSFlowInVO` |
| TMS业务流水表(出) | `scm_tmsflowout` | `nccloud.vo.scmpub.tms.entity.TMSFlowOutVO` |

## 十二、事找人消息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 事找人消息表 | `scm_todomsg` | `nc.vo.scmpub.todomsg.entity.TodoMsgVO` |

## 十三、销售费用单

### 销售费用单类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 销售费用单类型 | `so_m35trantype` | `nc.vo.so.m35trantype.entity.M35TranTypeVO` |

### 销售费用单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 销售费用单主表实体 | `so_arsub` | `nc.vo.so.m35.entity.ArsubHVO` |
| 表体 | 销售费用单子表实体 | `so_arsub_b` | `nc.vo.so.m35.entity.ArsubBVO` |

> 聚合 VO：`nc.vo.so.m35.entity.ArsubVO`

### 冲抵明细

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 冲抵明细实体 | `so_arsub_detail` | `nc.vo.so.m35.entity.ArsubDetailVO` |

## 十四、物料组合

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 物料组合主实体 | `sr_marcombine` | `nc.vo.scmf.marcombine.entity.MarCombineHVO` |
| 表体 | 物料组合子实体 | `sr_marcombine_b` | `nc.vo.scmf.marcombine.entity.MarCombineBVO` |

> 聚合 VO：`nc.vo.scmf.marcombine.entity.MarCombineVO`

## 十五、指标管理

### 指标设置

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 指标设置主实体 | `sr_target` | `nc.vo.scmf.sr.target.entity.TargetHVO` |
| 表体 | 指标项 | `sr_target_item` | `nc.vo.scmf.sr.target.entity.TargetItemBVO` |
| 表体 | 物料维度 | `sr_target_mar` | `nc.vo.scmf.sr.target.entity.TargetMarBVO` |
| 表体 | 销售组织范围子实体 | `sr_target_org` | `nc.vo.scmf.sr.target.entity.TargetOrgBVO` |
| 表体 | 指标周期列表 | `sr_target_period` | `nc.vo.scmf.sr.target.entity.TargetPeriodBVO` |

> 聚合 VO：`nc.vo.scmf.sr.target.entity.TargetVO`

### 指标调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 指标调整单主实体 | `sr_targetadj` | `nc.vo.scmf.sr.targetadj.entity.TargetAdjHVO` |
| 表体 | 指标调整单子实体 | `sr_targetadj_b` | `nc.vo.scmf.sr.targetadj.entity.TargetAdjBVO` |

> 聚合 VO：`nc.vo.scmf.sr.targetadj.entity.TargetAdjVO`

### 销售指标维护

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 销售指标维护主实体 | `sr_targetbill` | `nc.vo.scmf.sr.targetbill.entity.TargetBillHVO` |
| 表体 | 销售指标维护子实体 | `sr_targetbill_b` | `nc.vo.scmf.sr.targetbill.entity.TargetBillBVO` |

> 聚合 VO：`nc.vo.scmf.sr.targetbill.entity.TargetBillVO`

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 渠道管理 | 6 |
| 物流配送 | 10 |
| 包装与整箱 | 3 |
| 库存相关 | 3 |
| 计量器具 | 2 |
| 采购相关设置 | 6 |
| 协同设置 | 3 |
| 金税 | 3 |
| 促销类型 | 1 |
| 暂存数据 | 4 |
| TMS 业务流水 | 2 |
| 事找人消息 | 1 |
| 销售费用单 | 5 |
| 物料组合 | 3 |
| 指标管理 | 17 |
| **合计** | **69** |

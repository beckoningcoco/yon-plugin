# NCC 库存管理模块 VO 与表名对照表

## 一、主子表关系（有聚合VO）

### 1. 转库存量

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 转库存量 | — | `nc.vo.ic.m4k.entity.TransNumVO` |
| 表头 | 转库存量 | `ic_TransNumHeadVO` | `nc.vo.ic.m4k.entity.TransNumHeadVO` |
| 表体 | 转库存量表体 | `ic_TransNumBodyVO` | `nc.vo.ic.m4k.entity.TransNumBodyVO` |

### 2. 主辅计量平衡

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 主辅计量平衡 | — | `nc.vo.ic.m52.entity.AdjustBalVO` |
| 表头 | 主辅计量平衡表头 | `ic_adjustbal_h` | `nc.vo.ic.m52.entity.AdjustBalHeadVO` |
| 表体 | 主辅计量平衡表体 | `ic_adjustbal_b` | `nc.vo.ic.m52.entity.AdjustBalBodyVO` |

### 3. 调差单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 调差单 | — | `nc.vo.ic.m51.entity.AdjustErrVO` |
| 表头 | 调差单表头 | `ic_adjusterr_h` | `nc.vo.ic.m51.entity.AdjustErrHeadVO` |
| 表体 | 调差单表体 | `ic_adjusterr_b` | `nc.vo.ic.m51.entity.AdjustErrBodyVO` |

### 4. 组装单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 组装单 | — | `nc.vo.ic.m4l.entity.AssemblyBillVO` |
| 表头 | 组装单表头 | `ic_assembly_h` | `nc.vo.ic.m4l.entity.AssemblyBillHeadVO` |
| 表体 | 组装单表体 | `ic_assembly_b` | `nc.vo.ic.m4l.entity.AssemblyBillBodyVO` |

### 5. 设备入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 设备入库单 | — | `nc.vo.ic.m4401.entity.AssetInVO` |
| 表头 | 设备入库单表头 | `ic_assetin_h` | `nc.vo.ic.m4401.entity.AssetInHeadVO` |
| 表体 | 设备入库单表体 | `ic_assetin_b` | `nc.vo.ic.m4401.entity.AssetInBodyVO` |
| 孙表 | 设备入库单货位单品表 | `ic_assetin_l` | `nc.vo.ic.m4401.entity.AssetInLocationVO` |

### 6. 设备出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 设备出库单 | — | `nc.vo.ic.m4451.entity.AssetOutVO` |
| 表头 | 设备出库单表头 | `ic_assetout_h` | `nc.vo.ic.m4451.entity.AssetOutHeadVO` |
| 表体 | 设备出库单表体 | `ic_assetout_b` | `nc.vo.ic.m4451.entity.AssetOutBodyVO` |
| 孙表 | 设备出库单货位单品表 | `ic_assetout_l` | `nc.vo.ic.m4451.entity.AssetOutLocationVO` |

### 7. 条形码字典

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 条形码字典 | — | `nc.vo.ic.barcodedict.BarCodeDictVO` |
| 表头 | 条形码字典 | `ic_barcodedict_h` | `nc.vo.ic.barcodedict.BarCodeDictHeadVO` |
| 表体 | 条形码字典明细 | `ic_barcodedict_b` | `nc.vo.ic.barcodedict.BarCodeDictBodyVO` |

### 8. 条形码规则定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 条形码规则定义 | — | `nc.vo.ic.barcoderule.BarCodeRuleVO` |
| 表头 | 条形码规则定义 | `ic_barcoderule_h` | `nc.vo.ic.barcoderule.BarCodeRuleHeadVO` |
| 表体 | 条形码规则定义表体 | `ic_barcoderule_b` | `nc.vo.ic.barcoderule.BarCodeRuleBodyVO` |

### 9. 库存借入单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 库存借入单 | — | `nc.vo.ic.m49.entity.BorrowInVO` |
| 表头 | 库存借入单表头 | `ic_borrowin_h` | `nc.vo.ic.m49.entity.BorrowInHeadVO` |
| 表体 | 库存借入单表体 | `ic_borrowin_b` | `nc.vo.ic.m49.entity.BorrowInBodyVO` |
| 孙表 | 库存借入单单品表 | `ic_borrowin_l` | `nc.vo.ic.m49.entity.BorrowInLocationVO` |

### 10. 库存借出单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 库存借出单 | — | `nc.vo.ic.m4h.entity.BorrowOutVO` |
| 表头 | 库存借出单表头 | `ic_borrowout_h` | `nc.vo.ic.m4h.entity.BorrowOutHeadVO` |
| 表体 | 库存借出单表体 | `ic_borrowout_b` | `nc.vo.ic.m4h.entity.BorrowOutBodyVO` |
| 孙表 | 库存借出单单品表 | `ic_borrowout_l` | `nc.vo.ic.m4h.entity.BorrowOutLocationVO` |

### 11. 生产报废入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 生产报废入库单 | — | `nc.vo.ic.m4x.entity.DiscardInVO` |
| 表头 | 生产报废入库单表头 | `ic_discardin_h` | `nc.vo.ic.m4x.entity.DiscardInHeadVO` |
| 表体 | 生产报废入库单表体 | `ic_discardin_b` | `nc.vo.ic.m4x.entity.DiscardInBodyVO` |
| 孙表 | 生产报废入库单货位单品表 | `ic_discardin_l` | `nc.vo.ic.m4x.entity.DiscardInLocationVO` |

### 12. 报废单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 报废单 | — | `nc.vo.ic.m4o.entity.DiscardOutVO` |
| 表头 | 报废单表头 | `ic_discardout_h` | `nc.vo.ic.m4o.entity.DiscardOutHeadVO` |
| 表体 | 报废单表体 | `ic_discardout_b` | `nc.vo.ic.m4o.entity.DiscardOutBodyVO` |
| 孙表 | 报废单货位单品表 | `ic_discardout_l` | `nc.vo.ic.m4o.entity.DiscardOutLocationVO` |

### 13. 产成品入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 产成品入库单 | — | `nc.vo.ic.m46.entity.FinProdInVO` |
| 表头 | 产成品入库单表头 | `ic_finprodin_h` | `nc.vo.ic.m46.entity.FinProdInHeadVO` |
| 表体 | 产成品入库单表体 | `ic_finprodin_b` | `nc.vo.ic.m46.entity.FinProdInBodyVO` |
| 孙表 | 产成品入库单货位单品表 | `ic_finprodin_l` | `nc.vo.ic.m46.entity.FinProdInLocationVO` |

### 14. 普通入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 普通入库单 | — | `nc.vo.ic.m4a.entity.GeneralInVO` |
| 表头 | 普通入库单表头 | `ic_generalin_h` | `nc.vo.ic.m4a.entity.GeneralInHeadVO` |
| 表体 | 普通入库单表体 | `ic_generalin_b` | `nc.vo.ic.m4a.entity.GeneralInBodyVO` |
| 孙表 | 普通入库单货位单品表 | `ic_generalin_l` | `nc.vo.ic.m4a.entity.GeneralInLocationVO` |

### 15. 普通出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 普通出库单 | — | `nc.vo.ic.m4i.entity.GeneralOutVO` |
| 表头 | 普通出库单表头 | `ic_generalout_h` | `nc.vo.ic.m4i.entity.GeneralOutHeadVO` |
| 表体 | 普通出库单表体 | `ic_generalout_b` | `nc.vo.ic.m4i.entity.GeneralOutBodyVO` |
| 孙表 | 普通出库单货位单品表 | `ic_generalout_l` | `nc.vo.ic.m4i.entity.GeneralOutLocationVO` |

### 16. 盘点单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 盘点单 | — | `nc.vo.ic.m4r.entity.InvCountBillVO` |
| 表头 | 盘点单主实体 | `ic_invcount_h` | `nc.vo.ic.m4r.entity.InvCountHeaderVO` |
| 表体 | 盘点单子实体 | `ic_invcount_b` | `nc.vo.ic.m4r.entity.InvCountBodyVO` |
| 孙表 | 盘点单子实体明细 | `ic_invcount_sn` | `nc.vo.ic.m4r.entity.InvCountBodySNVO` |

### 17. 库存货位调整单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 库存货位调整单 | — | `nc.vo.ic.m4q.entity.LocAdjustVO` |
| 表头 | 库存货位调整单表头 | `ic_locadjust_h` | `nc.vo.ic.m4q.entity.LocAdjustHeadVO` |
| 表体 | 库存货位调整单表体 | `ic_locadjust_b` | `nc.vo.ic.m4q.entity.LocAdjustBodyVO` |
| 孙表 | 货位调整单品 | `ic_locadjust_l` | `nc.vo.ic.m4q.entity.LocAdjustLocationVO` |

### 18. 材料出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 材料出库单 | — | `nc.vo.ic.m4d.entity.MaterialOutVO` |
| 表头 | 材料出库单表头 | `ic_material_h` | `nc.vo.ic.m4d.entity.MaterialOutHeadVO` |
| 表体 | 材料出库单表体 | `ic_material_b` | `nc.vo.ic.m4d.entity.MaterialOutBodyVO` |
| 孙表 | 材料出库单货位单品表 | `ic_material_l` | `nc.vo.ic.m4d.entity.MaterialOutLocationVO` |

### 19. 在途入库处理查询

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 在途入库处理查询 | — | `nc.vo.ic.onroadin.OnroadInCondVO` |
| 表头 | 在途入库处理查询表头实体 | `ic_onroadin_h` | `nc.vo.ic.onroadin.OnroadInCondHeadVO` |
| 表体 | 在途入库处理查询表体实体 | `ic_onroadin_b` | `nc.vo.ic.onroadin.OnroadInCondBodyVO` |

### 20. 期初余额

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 期初余额 | — | `nc.vo.ic.m40.entity.InitializtionInVO` |
| 表头 | 期初余额表头 | `ic_openbal_h` | `nc.vo.ic.m40.entity.InitializtionInHeadVO` |
| 表体 | 期初余额表体 | `ic_openbal_b` | `nc.vo.ic.m40.entity.InitializtionInBodyVO` |
| 孙表 | 期初余额单品表 | `ic_openbal_l` | `nc.vo.ic.m40.entity.InitializtionInLocationVO` |

### 21. 期初废品

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 期初废品 | — | `nc.vo.ic.m43.entity.OpenScrapVO` |
| 表头 | 期初废品表头 | `ic_openscrap_h` | `nc.vo.ic.m43.entity.OpenScrapHeadVO` |
| 表体 | 期初废品表体 | `ic_openscrap_b` | `nc.vo.ic.m43.entity.OpenScrapBodyVO` |
| 孙表 | 期初废品单品表 | `ic_openscrap_l` | `nc.vo.ic.m43.entity.OpenScrapLocationVO` |

### 22. 装箱单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 装箱单 | — | `nc.vo.ic.m4w.entity.PackBillVO` |
| 表头 | 装箱单表头 | `ic_packbill_h` | `nc.vo.ic.m4w.entity.PackBillHeadVO` |
| 表体 | 装箱单 | `ic_packbill_b` | `nc.vo.ic.m4w.entity.PackBillBodyVO` |

### 23. 拣货单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 拣货单 | — | `nc.vo.ic.m4v.entity.PickBillVO` |
| 表头 | 拣货单表头 | `ic_pickbill_h` | `nc.vo.ic.m4v.entity.PickBillHeadVO` |
| 表体 | 拣货单表体 | `ic_pickbill_b` | `nc.vo.ic.m4v.entity.PickBillBodyVO` |

### 24. 拣货查询出库单条件

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 拣货查询出库单条件 | — | `nc.vo.ic.m4v.entity.PickBillQueryCondVO` |
| 表头 | 拣货查询出库单条件表头 | `ic_pickbillquery_h` | `nc.vo.ic.m4v.entity.PickBillQueryCondHeadVO` |
| 表体 | 拣货查询出库单条件表体 | `ic_pickbillquery_b` | `nc.vo.ic.m4v.entity.PickBillQueryCondBodyVO` |

### 25. 采购入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 采购入库单 | — | `nc.vo.ic.m45.entity.PurchaseInVO` |
| 表头 | 采购入库单表头 | `ic_purchasein_h` | `nc.vo.ic.m45.entity.PurchaseInHeadVO` |
| 表体 | 采购入库单表体 | `ic_purchasein_b` | `nc.vo.ic.m45.entity.PurchaseInBodyVO` |
| 孙表 | 采购入库单货位单品表 | `ic_purchasein_l` | `nc.vo.ic.m45.entity.PurchaseInLocationVO` |

### 26. 预留

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 预留 | — | `nc.vo.ic.reserve.entity.ReserveBillVO` |
| 表头 | 预留 | `ic_reserve` | `nc.vo.ic.reserve.entity.ReserveVO` |
| 表体 | 预留出入库执行名细 | `ic_resexec` | `nc.vo.ic.reserve.entity.ReserveExecVO` |

### 27. 库存借出还回

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 库存借出还回 | — | `nc.vo.ic.m4b.entity.ReturnInVO` |
| 表头 | 库存借出还回单表头 | `ic_returnin_h` | `nc.vo.ic.m4b.entity.ReturnInHeadVO` |
| 表体 | 库存借出还回表体 | `ic_returnin_b` | `nc.vo.ic.m4b.entity.ReturnInBodyVO` |
| 孙表 | 库存借出还回单品 | `ic_returnin_l` | `nc.vo.ic.m4b.entity.ReturnInLocationVO` |

### 28. 库存借入还回

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 库存借入还回 | — | `nc.vo.ic.m4j.entity.ReturnOutVO` |
| 表头 | 库存借入还回单表头 | `ic_returnout_h` | `nc.vo.ic.m4j.entity.ReturnOutHeadVO` |
| 表体 | 库存借入还回单表体 | `ic_returnout_b` | `nc.vo.ic.m4j.entity.ReturnOutBodyVO` |
| 孙表 | 库存借入还回单品 | `ic_returnout_l` | `nc.vo.ic.m4j.entity.ReturnOutLocationVO` |

### 29. 销售出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 销售出库单 | — | `nc.vo.ic.m4c.entity.SaleOutVO` |
| 表头 | 销售出库单表头 | `ic_saleout_h` | `nc.vo.ic.m4c.entity.SaleOutHeadVO` |
| 表体 | 销售出库单表体 | `ic_saleout_b` | `nc.vo.ic.m4c.entity.SaleOutBodyVO` |
| 孙表 | 销售出库单货位单品表 | `ic_saleout_l` | `nc.vo.ic.m4c.entity.SaleOutLocationVO` |

### 30. 出库申请单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 出库申请单 | — | `nc.vo.ic.m4455.entity.SapplyBillVO` |
| 表头 | 出库申请单表头 | `ic_sapply_h` | `nc.vo.ic.m4455.entity.SapplyBillHeadVO` |
| 表体 | 出库申请单表体 | `ic_sapply_b` | `nc.vo.ic.m4455.entity.SapplyBillBodyVO` |

### 31. 委托加工入库

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 委托加工入库 | — | `nc.vo.ic.m47.entity.SubcontInVO` |
| 表头 | 委托加工入库 | `ic_subcontin_h` | `nc.vo.ic.m47.entity.SubcontInHeadVO` |
| 表体 | 委托加工入库表体 | `ic_subcontin_b` | `nc.vo.ic.m47.entity.SubcontInBodyVO` |
| 孙表 | 委托加工入库单品表 | `ic_subcontin_l` | `nc.vo.ic.m47.entity.SubcontInLocationVO` |

### 32. 拆卸单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 拆卸单 | — | `nc.vo.ic.m4m.entity.TeardownBillVO` |
| 表头 | 拆卸单表头 | `ic_teardown_h` | `nc.vo.ic.m4m.entity.TeardownBillHeadVO` |
| 表体 | 拆卸单表体 | `ic_teardown_b` | `nc.vo.ic.m4m.entity.TeardownBillBodyVO` |

### 33. 库存形态转换单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 库存形态转换单 | — | `nc.vo.ic.m4n.entity.TransformVO` |
| 表头 | 库存形态转换单表头 | `ic_transform_h` | `nc.vo.ic.m4n.entity.TransformHeadVO` |
| 表体 | 库存形态转换单表体 | `ic_transform_b` | `nc.vo.ic.m4n.entity.TransformBodyVO` |
| 孙表 | 库存形态转换单品表 | `ic_transform_l` | `nc.vo.ic.m4n.entity.TransformLocationVO` |

### 34. 调拨入库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 调拨入库单 | — | `nc.vo.ic.m4e.entity.TransInVO` |
| 表头 | 调拨入库单表头 | `ic_transin_h` | `nc.vo.ic.m4e.entity.TransInHeadVO` |
| 表体 | 调拨入库单表体 | `ic_transin_b` | `nc.vo.ic.m4e.entity.TransInBodyVO` |
| 孙表 | 调拨入库单货位单品表 | `ic_transin_l` | `nc.vo.ic.m4e.entity.TransInLocationVO` |

### 35. 调拨出库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 调拨出库单 | — | `nc.vo.ic.m4y.entity.TransOutVO` |
| 表头 | 调拨出库单表头 | `ic_transout_h` | `nc.vo.ic.m4y.entity.TransOutHeadVO` |
| 表体 | 调拨出库单表体 | `ic_transout_b` | `nc.vo.ic.m4y.entity.TransOutBodyVO` |
| 孙表 | 调拨出库单货位单品表 | `ic_transout_l` | `nc.vo.ic.m4y.entity.TransOutLocationVO` |

### 36. VMI汇总

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | VMI汇总 | — | `nc.vo.ic.m50.entity.VmiSumVO` |
| 表头 | VMI汇总表头 | `ic_vmi_sum` | `nc.vo.ic.m50.entity.VmiSumHeaderVO` |
| 表体 | VMI汇总表体 | `ic_vmi_outdetail` | `nc.vo.ic.m50.entity.VmiSumBodyVO` |

### 37. 消耗汇总规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 消耗汇总规则 | — | `nc.vo.ic.vmirule.entity.VmiRuleVO` |
| 表头 | 消耗汇总规则表头 | `ic_vmirule_h` | `nc.vo.ic.vmirule.entity.VmiRuleHeadVO` |
| 表体 | 消耗汇总规则表体汇总单据范围 | `ic_vmirule_bbr` | `nc.vo.ic.vmirule.entity.VmiRuleBodyBillRangeVO` |
| 表体 | 消耗汇总规则表体汇总组织范围 | `ic_vmirule_bor` | `nc.vo.ic.vmirule.entity.VmiRuleBodyOrgRangeVO` |

### 38. 签收途损

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 签收途损 | — | `nc.vo.ic.m4453.entity.WastageVO` |
| 表头 | 库存签收途损表头 | `ic_wastage_h` | `nc.vo.ic.m4453.entity.WastageHeadVO` |
| 表体 | 签收途损表体 | `ic_wastage_b` | `nc.vo.ic.m4453.entity.WastageBodyVO` |

### 39. 废品处理单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 废品处理单 | — | `nc.vo.ic.m4p.entity.WasterProcessVO` |
| 表头 | 废品处理单表头 | `ic_wasterprocess_h` | `nc.vo.ic.m4p.entity.WasterProcessHeadVO` |
| 表体 | 废品处理单表体 | `ic_wasterprocess_b` | `nc.vo.ic.m4p.entity.WasterProcessBodyVO` |
| 孙表 | 废品单货位单品表 | `ic_wasterprocess_l` | `nc.vo.ic.m4p.entity.WasterProcessLocationVO` |

### 40. 转库单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 转库单 | — | `nc.vo.ic.m4k.entity.WhsTransBillVO` |
| 表头 | 转库单表头 | `ic_whstrans_h` | `nc.vo.ic.m4k.entity.WhsTransBillHeaderVO` |
| 表体 | 转库单表体 | `ic_whstrans_b` | `nc.vo.ic.m4k.entity.WhsTransBillBodyVO` |
| 孙表 | 转库单货位单品表 | `ic_whstrans_l` | `nc.vo.ic.m4k.entity.WhsTransBillLocationVO` |

---

## 二、单表关系（无聚合VO）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 可用量 | `ic_atp` | `nc.vo.ic.atp.entity.AtpVO` |
| 可用量缓存 | `ic_atp_f` | `nc.vo.ic.atp.entity.AtpFVO` |
| 可用量锁 | `ic_atp_lock` | `nc.vo.ic.atp.entity.AtpDimVO` |
| 可用量合并日期记录 | `ic_atpdate` | `nc.vo.ic.atp.entity.AtpDateVO` |
| 序列号业务权限设置 | `ic_barcoderight` | `nc.vo.ic.barcoderight.BarcodeRightVO` |
| 默认或固定货位 | `ic_defaultspace` | `nc.vo.ic.mstorectl.DefaultSpaceVO` |
| 库存流水 | `ic_flow` | `nc.vo.ic.flowaccount.entity.FlowAccountVO` |
| 库存流水历史 | `ic_flowaccount_his` | `nc.vo.ic.flowaccount.entity.FlowAccountHisVO` |
| 库存流水货位单品明细 | `ic_flowdetail` | `nc.vo.ic.flowaccount.entity.FlowAccountDetailVO` |
| 库存流水货位单品明细历史 | `ic_flowdetail_his` | `nc.vo.ic.flowaccount.entity.FlowAccountDetailHisVO` |
| 现存量预留明细 | `ic_handreserve` | `nc.vo.ic.reserve.entity.OnhandReserveVO` |
| 库存冻结、解冻 | `ic_invfreeze` | `nc.vo.ic.m4z.entity.FreezeThawVO` |
| 业务备查簿 | `ic_memo` | `nc.vo.module.ic_memo.BusiMemo` |
| 业务备查簿设置 | `ic_memosetup` | `nc.vo.module.ic_memosetup.MemoSetup` |
| 月结执行 | `ic_month_exec` | `nc.vo.ic.mobalance.entity.MonthExecVO` |
| 库存区间结存 | `ic_month_hand` | `nc.vo.ic.mobalance.entity.MonthHandVO` |
| 库存签字区间结存 | `ic_month_handsign` | `nc.vo.ic.mobalance.entity.MonthHandSignVO` |
| 库存月发生 | `ic_month_record` | `nc.vo.ic.mobalance.entity.MonthRecordVO` |
| 库存签字月发生 | `ic_month_recordsign` | `nc.vo.ic.mobalance.entity.MonthRecordSignVO` |
| 月结计算方案 | `ic_month_scheme` | `nc.vo.ic.mobalance.entity.MonthSchemeVO` |
| 仓库物料存量 | `ic_numctl` | `nc.vo.ic.ic002.NumctlVO` |
| 结存日期 | `ic_onhanddate` | `nc.vo.ic.onhand.init.OnhandDate` |
| 现存量维度 | `ic_onhanddim` | `nc.vo.ic.onhand.entity.OnhandDimVO` |
| 现存量期初 | `ic_onhandinit` | `nc.vo.ic.onhand.init.OnhandInitNumVO` |
| 现存量 | `ic_onhandnum` | `nc.vo.ic.onhand.entity.OnhandNumVO` |
| 单品存量 | `ic_onhandsn` | `nc.vo.ic.onhand.entity.OnhandSNVO` |
| 单品存量期初 | `ic_onhandsninit` | `nc.vo.ic.onhand.init.OnhandSNInitVO` |
| 预计入预留明细 | `ic_prereserve` | `nc.vo.ic.reserve.entity.PreReserveVO` |
| 配比出库表头 | `ic_ratio_h` | `nc.vo.ic.m4d.entity.RatioOutHeadVO` |
| 配比出库表体 | `ic_ratioout_b` | `nc.vo.ic.m4d.entity.RatioOutBodyVO` |
| 库管员管理物料 | `ic_storeadmin` | `nc.vo.ic.mstoreadmin.StoreadminVO` |
| 物料存放规则 | `ic_storectl` | `nc.vo.ic.mstorectl.StorectlVO` |
| 库存状态 | `ic_storestate` | `nc.vo.ic.storestate.StoreStateVO` |
| 预留供给 | `ic_supply` | `nc.vo.ic.reserve.entity.SupplyVO` |
| 转储配置 | `ic_transconfig` | `nc.vo.ic.flowaccount.entity.FlowTransConfigVO` |
| 流水帐转储日志 | `ic_translog` | `nc.vo.ic.flowaccount.entity.FlowTransLogVO` |
| 库存交易类型 | `ic_transtype` | `nc.vo.ic.transtype.TransTypeExtendVO` |
| 出入库单据类型匹配 | `ic_transtypematch` | `nc.vo.ic.transtypematch.entity.TransTypeMatchVO` |
| 出入库类型与库存状态关系 | `ic_transtypetostate` | `nc.vo.ic.transtypetostate.TransTypeToStateVO` |
| VMI汇总条件 | `ic_vmi_condition` | `nc.vo.ic.m50.entity.VmiSumConditionVO` |
| 消耗汇总匹配明细 | `ic_vmi_matchdetail` | `nc.vo.ic.m50.entity.VmiMatchDetailVO` |

# NCC 公共基础数据模块（uapbd）VO 与表名对照表

---

## 一、会计科目体系

### 8. 会计科目

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 会计科目 | `bd_accasoa` | `nc.vo.bd.account.AccAsoaVO` |
| 辅核 | 辅助核算 | `bd_accass` | `nc.vo.bd.account.AccAssVO` |

### 9. 科目历史

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 科目关联信息历史 | `bd_accasoahistory` | `nc.vo.bd.account.history.AccAsoaHistoryVO` |
| 辅核 | 辅助核算历史 | `bd_accasshistory` | `nc.vo.bd.account.history.AccAssHistoryVO` |

### 10. 会计辅助核算项目

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 会计辅助核算项目 | `bd_accassitem` | `nc.vo.bd.accassitem.AccAssItemVO` |

### 11. 科目表

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 科目表 | `bd_accchart` | `nc.vo.bd.accchart.AccChartVO` |
| — | 预留规则 | `bd_accobligate` | `nc.vo.bd.accchart.AccObligateVO` |
| — | 政策性科目表集团关联 | `bd_accplychart` | `nc.vo.bd.accchart.AccPlyChartVO` |
| — | 被使用的核算账簿 | `bd_usedaccbook` | `nc.vo.bd.accchart.UsedAccBookVO` |

### 12. 科目控制规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 科目控制规则 | `bd_accctrlrule` | `nc.vo.bd.accctrlrule.AccCtrlRuleVO` |
| — | 科目控制规则关联科目 | `bd_accctrlasoa` | `nc.vo.bd.accctrlrule.AccCtrlAsoaVO` |
| — | 可细化组织 | `bd_accctrlorg` | `nc.vo.bd.accctrlrule.AccCtrlOrgVO` |

### 13. 物料核算要素初始设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 物料核算要素初始设置 | `bd_accelement` | `nc.vo.bd.materialaccelement.AccelementVO` |

### 14. 科目属性控制策略

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 科目属性控制策略 | `bd_accfieldctrl` | `nc.vo.bd.accfieldctrlstrategy.AccFieldCtrlVO` |

### 15. 科目属性控制模板

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 科目属性控制模板 | `bd_accfieldcttemp` | `nc.vo.uapbd.accfieldctrltemp.AccFieldCtrlTempVO` |

### 16. 会计期间

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 会计期间档案 | `bd_accperiod` | `nc.vo.bd.period.AccperiodVO` |
| — | 会计半年 | `bd_acchalfyear` | `nc.vo.bd.period.AccHalfYearVO` |
| — | 会计月份 | `bd_accperiodmonth` | `nc.vo.bd.period2.AccperiodmonthVO` |
| — | 会计季度 | `bd_accperiodquart` | `nc.vo.bd.period3.AccperiodquartVO` |

### 17. 会计科目基本信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 会计科目基本信息 | `bd_account` | `nc.vo.bd.account.AccountVO` |

### 18. 科目分布式数据状态

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 科目分布式数据状态 | `bd_account_dist` | `nc.vo.bd.account.distribution.AccDistDataStatuVO` |

### 19. 科目对照

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 科目对照 | `bd_accountmap` | `nc.vo.bd.accountmap.AccountMapVO` |

### 20. 会计期间方案

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 会计期间方案 | `bd_accperiodscheme` | `nc.vo.bd.period.AccperiodschemeVO` |

### 21. 科目体系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 科目体系 | `bd_accsystem` | `nc.vo.bd.accsystem.AccSystemVO` |
| — | 科目类型 | `bd_acctype` | `nc.vo.bd.accsystem.AccTypeVO` |

---

## 二、客商管理

### 61. 客商

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 客商 | `bd_cust_supplier` | `nc.vo.bd.cust.CustSupplierVO` |
| — | 客商银行账户 | `bd_custbank` | `nc.vo.bd.cust.CustbankVO` |

### 62. 客商（多版本）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 客商(多版本) | `bd_cust_supplier_v` | `nc.vo.bd.cust.CustSupplierVersionVO` |

### 67. 客户基本信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 客户基本信息 | `bd_customer` | `nc.vo.bd.cust.CustomerVO` |
| 客户银行帐号 | `bd_custbank` | `nc.vo.bd.cust.CustbankVO` |
| 客户信用控制 | `bd_custcreditctl` | `nc.vo.bd.cust.creditctl.CustCreditCtlVO` |
| 客户财务信息 | `bd_custfinance` | `nc.vo.bd.cust.finance.CustFinanceVO` |
| 客户联系人 | `bd_custlinkman` | `nc.vo.bd.cust.CustlinkmanVO` |
| 客户销售信息 | `bd_custsale` | `nc.vo.bd.cust.saleinfo.CustsaleVO` |
| 客户国家税类 | `bd_custtaxtypes` | `nc.vo.bd.cust.CustCountrytaxesVO` |
| 客户VAT | `bd_custvat` | `nc.vo.bd.cust.CustvatVO` |

### 73. 客户基本信息（多版本）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 客户基本信息(多版本) | `bd_customer_v` | `nc.vo.bd.cust.CustomerVersionVO` |

### 66. 供应商基本信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 供应商基本信息 | `bd_supplier` | `nc.vo.bd.supplier.SupplierVO` |
| 供应商银行账号 | `bd_custbank` | `nc.vo.bd.cust.CustbankVO` |
| 供应商国家税类 | `bd_supcountrytaxes` | `nc.vo.bd.supplier.SupCountryTaxesVO` |
| 供应商财务信息 | `bd_supfinance` | `nc.vo.bd.supplier.finance.SupFinanceVO` |
| 供应商联系人 | `bd_suplinkman` | `nc.vo.bd.supplier.SupLinkmanVO` |
| 供应商采购信息 | `bd_supstock` | `nc.vo.bd.supplier.stock.SupStockVO` |
| 供应商VAT | `bd_supvat` | `nc.vo.bd.supplier.SupvatVO` |

### 153. 供应商基本信息（多版本）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 供应商基本信息(多版本) | `bd_supplier_v` | `nc.vo.bd.supplier.SupplierVersionVO` |

### 客户相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 客户收货地址 | `bd_custaddress` | `nc.vo.bd.cust.custaddress.CustaddressVO` |
| 客户地址簿引用 | `bd_custaddressref` | `nc.vo.bd.cust.custaddress.CustaddressrefVO` |
| 客户税类 | `bd_custaxes` | `nc.vo.bd.cust.custaxes.CusTaxesVO` |
| 客户基本分类 | `bd_custclass` | `nc.vo.bd.cust.custclass.CustClassVO` |
| 客户物料码 | `bd_custmaterial` | `nc.vo.uapbd.custmaterial.CustMaterialVO` |
| 客户物料码子表 | `bd_custmatersub` | `nc.vo.uapbd.custom.CustomVO` |
| 客户合并信息 | `bd_custmerge` | `nc.vo.bd.cust.merge.CustmergeVO` |
| 客户申请单 | `bd_customer_pf` | `nc.vo.bd.cust.pf.CustomerPfVO` |
| 客户组织分配关系 | `bd_custorg` | `nc.vo.bd.cust.custorg.CustOrgVO` |
| 客户更名记录 | `bd_custrename` | `nc.vo.bd.cust.custrename.CustRenameVO` |
| 客户销售分类 | `bd_custsaleclass` | `nc.vo.bd.cust.custsaleclass.CustSaleClassVO` |
| 客户层次结构 | `bd_custstructure` | `nc.vo.bd.cust.CuststructureVO` |
| 客户升级 | `bd_custupgrade` | `nc.vo.bd.cust.upgrade.CustUpgradeVO` |

### 供应商相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 供应商发货地址 | `bd_supaddress` | `nc.vo.bd.supplier.supaddress.SupAddressVO` |
| 供应商地址簿引用 | `bd_supaddressref` | `nc.vo.bd.supplier.supaddress.SupAddressRefVO` |
| 供应商合并信息 | `bd_supmerge` | `nc.vo.bd.supplier.merge.SupmergeVO` |
| 供应商组织分配关系 | `bd_suporg` | `nc.vo.bd.supplier.suporg.SupOrgVO` |
| 供应商更名记录 | `bd_suprename` | `nc.vo.bd.supplier.suprename.SupRenameVO` |
| 供应商税类 | `bd_suptaxes` | `nc.vo.bd.supplier.suptaxes.SupTaxesVO` |
| 供应商升级 | `bd_supupgrade` | `nc.vo.bd.supplier.SupUpgradeVO` |
| 供应商层次结构 | `bd_supstructure` | `nc.vo.uapbd.supstructure.SupStructureVO` |
| 供应商基本分类 | `bd_supplierclass` | `nc.vo.bd.supplier.supplierclass.SupplierclassVO` |
| 供应商申请单 | `bd_supplier_pf` | `nc.vo.bd.supplier.pf.SupplierPfVO` |
| 供应商银行账号申请单 | `bd_supplierbank_pf` | `nc.vo.bd.supplier.supplierbankpf.SupplierBankPfVO` |
| 供应商资质档案 | `bd_supqualidoc` | `nc.vo.bd.supplier.supqualidoc.SupQualiDocVO` |
| 资质等级 | `bd_supqualilevel` | `nc.vo.bd.supplier.supqualidoc.SupQualiLevelVO` |
| 供应商资质分类 | `bd_supqualitype` | `nc.vo.bd.supplier.supqualitype.SupQualiTypeVO` |
| 供应商等级体系设置 | `bd_supplier_grade_sys` | `nc.vo.bd.supplier.suppliergradesys.SupplierGradeSysVO` |
| 等级信息 | `bd_supplier_grade` | `nc.vo.bd.supplier.suppliergradesys.SupplierGradeVO` |

---

## 三、物料管理

### 116. 物料基本信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 物料基本信息 | `bd_material` | `nc.vo.bd.material.MaterialVO` |
| 捆绑件 | `bd_materialbindle` | `nc.vo.bd.material.sale.MaterialBindleVO` |
| 辅计量管理 | `bd_materialconvert` | `nc.vo.bd.material.MaterialConvertVO` |
| 物料成本信息 | `bd_materialcost` | `nc.vo.bd.material.cost.MaterialCostVO` |
| 计价方式信息 | `bd_materialcostmod` | `nc.vo.bd.material.cost.MaterialCostmodeVO` |
| 物料财务信息 | `bd_materialfi` | `nc.vo.bd.material.fi.MaterialFiVO` |
| 物料计划信息 | `bd_materialplan` | `nc.vo.bd.material.plan.MaterialPlanVO` |
| 物料生产信息 | `bd_materialprod` | `nc.vo.bd.material.prod.MaterialProdVO` |
| 物料采购信息 | `bd_materialpu` | `nc.vo.bd.material.pu.MaterialPuVO` |
| 替换件 | `bd_materialrepl` | `nc.vo.bd.material.stock.MaterialReplVO` |
| 物料销售信息 | `bd_materialsale` | `nc.vo.bd.material.sale.MaterialSaleVO` |
| 物料库存信息 | `bd_materialstock` | `nc.vo.bd.material.stock.MaterialStockVO` |
| 物料税类信息 | `bd_materialtaxtype` | `nc.vo.bd.material.MaterialTaxTypeVO` |
| 物料仓库信息 | `bd_materialwarh` | `nc.vo.bd.material.stock.MaterialWarhVO` |

### 118. 物料基本信息（多版本）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 物料基本信息 | `bd_material_v` | `nc.vo.bd.material.MaterialVersionVO` |

### 物料分类

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 物料基本分类 | `bd_marbasclass` | `nc.vo.bd.material.marbasclass.MarBasClassVO` |
| 物料成本分类 | `bd_marcostclass` | `nc.vo.bd.material.marcostclass.MarCostClassVO` |
| 物料采购分类 | `bd_marpuclass` | `nc.vo.bd.material.marpuclass.MarPuClassVO` |
| 物料销售分类 | `bd_marsaleclass` | `nc.vo.bd.material.marsaleclass.MarSaleClassVO` |
| 物料组织分配关系 | `bd_marorg` | `nc.vo.bd.material.marorg.MarOrgVO` |

### 辅助属性

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 辅助属性 | `bd_marassistant` | `nc.vo.bd.material.marassistant.MarAssistantVO` |
| 值域 | 辅助属性值域 | `bd_marasstrange` | `nc.vo.bd.material.marassistant.MarAsstRangeVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 辅助属性结构 | `bd_marasstframe` | `nc.vo.bd.material.marasstframe.MarAsstFrameVO` |

### 辅助属性约束关系

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 约束关系 | `bd_marasstrst` | `nc.vo.bd.material.marasstrst.MarAsstrstVO` |
| 子表 | 约束关系子表 | `bd_marasstrstval` | `nc.vo.bd.material.marasstrst.MarAsstrstValVO` |

### 其他物料相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 物料申请单 | `bd_material_pf` | `nc.vo.bd.material.pf.MaterialPfVO` |
| 物料加密 | `bd_ematerial` | `nc.vo.bd.ematerial.entity.EMaterialVO` |
| 品牌档案 | `bd_branddoc` | `nc.vo.bd.material.branddoc.BrandDocVO` |
| 物料计价方式初始设置 | `bd_costmode` | `nc.vo.bd.materialcostmode.CostModeVO` |
| 物料税类 | `bd_mattaxes` | `nc.vo.bd.material.mattaxes.MatTaxesVO` |
| 计量单位 | `bd_measdoc` | `nc.vo.bd.material.measdoc.MeasdocVO` |
| 客户物料码 | `bd_custmaterial` | `nc.vo.uapbd.custmaterial.CustMaterialVO` |
| 客户物料码子表 | `bd_custmatersub` | `nc.vo.uapbd.custom.CustomVO` |
| 物料基本分类供应商扩展 | `srmsm_marbasclsext` | `nc.vo.bd.marbasclsext.entity.MarBasClsExtVO` |
| 物料基本分类供应商扩展资质明细 | `srmsm_marbasclsext_b` | `nc.vo.bd.marbasclsext.entity.MarBasClsExtBVO` |
| 供应商供货目录 | `vrm_vendormater` | `nc.vo.scmbd.vrm.vm.entity.VendorMaterBVO` |
| 供应商供货能力分类设置 | `bd_supabilityset` | `nc.vo.bd.supplier.supplyabilityset.SupplyabilitysetVO` |
| 物料分类等级 | `bd_mategrade` | `nc.vo.bd.supplier.supplyabilityset.MaterialgradeVO` |

---

## 四、BOM管理

### 42. 物料清单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 物料清单 | — | `nc.vo.bd.bom.bom0202.entity.AggBomVO` |
| 表头 | 物料清单 | `bd_bom` | `nc.vo.bd.bom.bom0202.entity.BomVO` |
| 行 | 物料清单明细 | `bd_bom_b` | `nc.vo.bd.bom.bom0202.entity.BomItemVO` |
| — | 物料作业量 | `bd_bom_activity` | `nc.vo.bd.bom.bom0202.entity.BomActivityVO` |
| — | 物料清单子项物料来源表 | `bd_bom_bsrc` | `nc.vo.bd.bom.bom0202.entity.BomItemSourceVO` |
| — | 物料清单子项阶梯损耗 | `bd_bom_loss` | `nc.vo.bd.bom.bom0202.entity.BomLossVO` |
| — | 物料清单多产出 | `bd_bom_outputs` | `nc.vo.bd.bom.bom0202.entity.BomOutputsVO` |
| — | 物料清单子项组装位置 | `bd_bom_position` | `nc.vo.bd.bom.bom0202.entity.BomPosVO` |
| — | 物料清单子项替代料 | `bd_bom_repl` | `nc.vo.bd.bom.bom0202.entity.BomReplVO` |
| — | 选择条件 | `bd_bom_select` | `nc.vo.bd.bom.bom0202.entity.BomSelectVO` |
| — | 使用组织 | `bd_bom_useorg` | `nc.vo.bd.bom.bom0202.entity.BomUseOrgVO` |
| — | 物料清单子项线上仓 | `bd_bom_wip` | `nc.vo.bd.bom.bom0202.entity.BomWipVO` |

### 52. 配置BOM

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 配置BOM表头 | `bd_cfgbom` | `nc.vo.bd.bom.bom0204.CfgBomVO` |

### 135. BOM正向查询

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | BOM正向查询 | — | `nc.vo.bd.bom.query.AggBomQueryVO` |
| 表头 | BOM正向查询 | `bd_querybom` | `nc.vo.bd.bom.query.BomQueryHeadVO` |
| 明细 | BOM正向查询明细 | `bd_querybom_b` | `nc.vo.bd.bom.query.BomQueryBodyVO` |

### 其他BOM相关

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| BOM/工艺匹配规则 | `bd_bmrt` | `nc.vo.bd.vermatch.entity.BomMatchRtVO` |
| BOM复制对话框 | `bd_bomcopy` | `nc.vo.bd.bom.bom0214.entity.BomcopyVO` |
| BOM查询条件 | `bd_querybomcond` | `nc.vo.bd.bom.bom1204.BomQueryCondVO` |
| 批量替换表头 | `bd_replacebom` | `nc.vo.bd.bom.bom0212.entity.BomReplaceVO` |
| 批量替换表体 | `bd_replacebomitem` | `nc.vo.bd.bom.bom0212.entity.BomReplaceItemVO` |
| BOM物料树节点 | `mm_bom_material` | `nc.vo.bd.bom.bom0202.entity.BomMaterialTreeVO` |

---

## 五、特征管理

### 89. 特征类

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 特征类 | — | `nc.vo.bd.feature.fclass.entity.AggFclassVO` |
| 表头 | 特征类 | `bd_fclass` | `nc.vo.bd.feature.fclass.entity.FclassHeadVO` |
| 明细 | 特征类明细 | `bd_fclass_b` | `nc.vo.bd.feature.fclass.entity.FclassBodyVO` |

### 90. 特征

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 特征 | — | `nc.vo.bd.feature.fclass.entity.AggFclassVO` |
| 表头 | 特征 | `bd_feature` | `nc.vo.bd.feature.feature.entity.FeatureHeadVO` |
| 明细 | 特征明细 | `bd_feature_b` | `nc.vo.bd.feature.feature.entity.FeatureItemVO` |

### 91. 特征码规则

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 特征码规则 | — | `nc.vo.bd.feature.featurecode.entity.AggSkuVO` |
| 表头 | 特征码规则 | `bd_featurecode` | `nc.vo.bd.feature.featurecode.entity.SkuHeadVO` |
| 明细 | 特征码规则明细 | `bd_featurecode_b` | `nc.vo.bd.feature.featurecode.entity.SkuBodyVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 上次流水号记录 | `bd_featurecode_sn` | `nc.vo.bd.feature.featurecode.entity.SkuSNVO` |

### 93. 特征码档案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 特征码档案 | — | `nc.vo.bd.feature.ffile.entity.AggFFileVO` |
| 表头 | 特征码档案 | `bd_ffile` | `nc.vo.bd.feature.ffile.entity.FFileHeadVO` |
| 明细 | 特征码档案明细 | `bd_ffile_b` | `nc.vo.bd.feature.ffile.entity.FFileBodyVO` |

### 94. 特征价目表

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 特征价目表 | — | `nc.vo.bd.feature.fprice.entity.AggFPriceVO` |
| 表头 | 特征价目表 | `bd_fprice` | `nc.vo.bd.feature.fprice.entity.FPriceHeadVO` |
| 明细 | 特征价目表明细 | `bd_fprice_b` | `nc.vo.bd.feature.fprice.entity.FPriceItemVO` |

### 97. 约束关系定义

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 约束关系定义 | — | `nc.vo.bd.feature.frelation.entity.AggFrelationVO` |
| 表头 | 约束关系定义 | `bd_frelation` | `nc.vo.bd.feature.frelation.entity.FrelationHeadVO` |
| 明细 | 约束关系明细 | `bd_frelation_b` | `nc.vo.bd.feature.frelation.entity.FrelationBodyVO` |

---

## 六、汇率与币种

### 25. 外币汇率

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 外币汇率 | `bd_currinfo` | `nc.vo.bd.currinfo.CurrinfoVO` |
| — | 期间汇率 | `bd_adjustrate` | `nc.vo.bd.currinfo.AdjustrateVO` |
| — | 平均汇率 | `bd_avgrate` | `nc.vo.bd.currinfo.AvgRateVO` |
| — | 日汇率 | `bd_currrate` | `nc.vo.bd.currinfo.CurrrateVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 币种 | `bd_currtype` | `nc.vo.bd.currtype.CurrtypeVO` |
| 汇率类型 | `bd_ratetype` | `nc.vo.bd.ratetype.RateTypeVO` |
| 外币汇率方案 | `bd_exratescheme` | `nc.vo.bd.exratescheme.ExrateSchemeVO` |
| 单价精度 | `bd_priceaccuracy` | `nc.vo.bd.currtype.PriceAccuracyVO` |

---

## 七、银行与资金

### 35. 银行账户

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 银行账户 | `bd_bankaccbas` | `nc.vo.bd.bankaccount.BankAccbasVO` |
| 子户 | 银行账户子户 | `bd_bankaccsub` | `nc.vo.bd.bankaccount.BankAccSubVO` |
| 使用权 | 子户使用权 | `bd_bankaccuse` | `nc.vo.bd.bankaccount.BankAccUseVO` |

### 36. 银行档案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 银行档案 | `bd_bankdoc` | `nc.vo.bd.bankdoc.BankdocVO` |
| — | 银行联系人 | `bd_banklinkman` | `nc.vo.bd.bankdoc.BankLinkmanVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 银行类别 | `bd_banktype` | `nc.vo.bd.banktype.BankTypeVO` |
| 人行联行信息 | `bd_asslinenum` | `nc.vo.bd.asslinenum.AssLineNumVO` |
| 现金账户 | `bd_cashaccount` | `nc.vo.bd.cashaccount.CashAccountVO` |
| 个人银行账户 | `bd_psnbankacc` | `nc.vo.bd.psnbankacc.PsnBankaccVO` |
| 网银信息模板 | `bd_netbankinftp` | `nc.vo.bd.netbanktemplate.NetbankinftpVO` |
| 网银信息模板字段 | `bd_templetitem` | `nc.vo.bd.netbanktemplate.TempletitemVO` |

### 101. 收款协议

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 收款协议 | `bd_income` | `nc.vo.bd.income.IncomeVO` |
| 账期 | 收款账期 | `bd_incomech` | `nc.vo.bd.income.IncomeChVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 收款协议申请单 | `bd_income_pf` | `nc.vo.bd.income.pf.IncomePfVO` |
| 收款时点 | `bd_incomeperiod` | `nc.vo.bd.incomeperiod.IncomePeriodVO` |

### 125. 付款协议

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 付款协议 | `bd_payment` | `nc.vo.bd.payment.PaymentVO` |
| 账期 | 付款账期 | `bd_paymentch` | `nc.vo.bd.payment.PaymentChVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 付款时点 | `bd_payperiod` | `nc.vo.bd.payperiod.PayPeriodVO` |
| 结算方式 | `bd_balatype` | `nc.vo.bd.balatype.BalaTypeVO` |
| 收付款类型 | `fi_recpaytype` | `nc.vo.fibd.RecpaytypeVO` |
| 票据类型 | `bd_notetype` | `nc.vo.bd.notetype.NotetypeVO` |
| 现金折扣方案 | `bd_rateschema` | `nc.vo.bd.rate.RateSchemaVO` |
| 现金折扣方案子表 | `bd_rateschemach` | `nc.vo.bd.rate.RateChVO` |
| 资金计划项目 | `bd_fundplan` | `nc.vo.bd.fundplan.FundPlanVO` |
| 资金计划项目使用权 | `bd_fundplanUse` | `nc.vo.bd.fundplan.FundPlanUseVO` |
| 托收协议 | `bd_mandate` | `nc.vo.bd.mandate.MandateVO` |

### 105. 收支项目

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 收支项目 | `bd_inoutbusiclass` | `nc.vo.bd.inoutbusiclass.InoutBusiClassVO` |
| 收支项目使用权 | `bd_inoutuse` | `nc.vo.bd.inoutbusiclass.InoutUseVO` |

---

## 八、现金流量

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 现金流量项目 | `bd_cashflow` | `nc.vo.bd.cashflow.CashflowVO` |
| — | 现金流量使用权 | `bd_cashflowuse` | `nc.vo.bd.cashflow.CashflowUseVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 现金流量项目调整项设置 | `bd_cfadjitemset` | `nc.vo.bd.cashflow.CfAdjItemSetVO` |

---

## 九、税务

### 162. 增值税税码税率

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 增值税税码税率 | `bd_taxcode` | `nc.vo.bd.taxcode.TaxcodeVO` |
| 税率 | 税率 | `bd_taxrate` | `nc.vo.bd.taxcode.TaxrateVO` |

### 163. 税收地区

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 税收地区 | `bd_taxregion` | `nc.vo.bd.taxregion.TaxregionVO` |
| 明细 | 税收行政地区 | `bd_taxregionb` | `nc.vo.bd.taxregion.TaxregionBVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 税率 | `txm_taxrate` | `nc.vo.txm.taxpub.TaxrateVO` |
| 海关商品编码 | `bd_goodscode` | `nc.vo.bd.goodscode.GoodscodeVO` |
| 海关商品税率 | `bd_goodstaxes` | `nc.vo.bd.goodscode.GoodstaxesItemVO` |

---

## 十、审计

### 1. 审计模块

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 审计模块 | — | `nc.vo.bd.audit.AggAuditModuleVO` |
| 表头 | 审计模块 | `BD_auditModule` | `nc.vo.bd.audit.AuditModuleVO` |
| 表 | 审计表 | `BD_AuditTable` | `nc.vo.bd.audit.AuditTableVO` |
| 明细 | 审计明细 | `BD_AuditTableDetail` | `nc.vo.bd.audit.AuditTableDetailVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 辅助核算顺序 | `bd_AuditAss` | `nc.vo.bd.audit.AuditassVO` |
| 用户审计选项记录 | `bd_Auditdef` | `nc.vo.bd.audit.AuditdefVO` |
| 审计报告 | `bd_auditmessage` | `nc.vo.bd.audit.AuditassMessageVO` |

---

## 十一、成本相关

### 6. 成本组件结构

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 成本组件结构 | `bd_costcompstruc` | `nc.vo.bd.costcompstruc.entity.CostCompStrucHeadVO` |
| 分配 | 分配成本组件结构 | `bd_CostCompStrucDistri` | `nc.vo.bd.costcompstruc.entity.CostCompStrucDistriVO` |
| 明细 | 成本组件结构明细 | `bd_costcompstruc_b` | `nc.vo.bd.costcompstruc.entity.CostCompStrucItemVO` |

### 55. 成本组件和要素对照

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 成本组件和要素对照 | `bd_compelecompa` | `nc.vo.bd.compelecompa.entity.CompEleCompaHeadVO` |
| 明细 | 成本组件和要素对照明细 | `bd_compelecompa_b` | `nc.vo.bd.compelecompa.entity.CompEleCompaItemVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 成本组件 | `bd_costcomponent` | `nc.vo.bd.bdcostcomponent.entity.BDCostComponentVO` |
| 成本对象类型 | `bd_costobjtype` | `nc.vo.bd.costobjtype.entity.CostObjTypeVO` |

---

## 十二、责任会计（resa）

### 197. 核算要素

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 要素基本信息 | `resa_factorasoa` | `nc.vo.resa.factor.FactorAsoaVO` |
| 关联会计科目 | `resa_accasoa` | `nc.vo.resa.factor.FactorBDAsoaVO` |
| 可细化组织 | `resa_facctrlorg` | `nc.vo.resa.factor.FacctrlorgVO` |
| 核算要素 | `resa_factor` | `nc.vo.resa.factor.FactorVO` |
| 关联辅助核算 | `resa_factorass` | `nc.vo.resa.factor.FactorAssVO` |
| 要素表 | `resa_factorchart` | `nc.vo.resa.factor.FactorChartVO` |
| 可细化管控范围 | `resa_factorctrlca` | `nc.vo.resa.factor.FactorCtrlOrg` |
| 可细化集团 | `resa_factorctrlgroup` | `nc.vo.resa.factor.FactorCtrlGroup` |
| 政策性要素表关联集团 | `resa_policychar` | `nc.vo.resa.factor.PolicycharGroupVO` |

### 198. 成本中心

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 成本中心 | `resa_costcenter` | `nc.vo.resa.costcenter.CostCenterVO` |
| 包含部门 | `resa_ccdepts` | `nc.vo.resa.costcenter.CCDeptVO` |
| 包含工作中心 | `resa_ccworkcenter` | `nc.vo.resa.costcenter.CCWorkCenterVO` |

### 199. 成本中心组

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 成本中心组 | `resa_costcentergroup` | `nc.vo.resa.costcentergroup.CostCenterGroup` |
| 包含成本中心 | `resa_ccgroupdetail` | `nc.vo.resa.costcentergroup.CCGroupdetailVO` |

### 200. 成本中心结构

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 成本中心结构 | `resa_ccstructure` | `nc.vo.resa.ccstructure.CCStructureVO` |
| 成本中心结构组关联关系 | `resa_costcentersgrel` | `nc.vo.resa.ccsgrelation.CostCenterSGRel` |

### 201. 管控范围

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 管控范围 | `resa_controlarea` | `nc.vo.resa.controlarea.ControlAreaVO` |
| 明细 | 管控范围明细 | `resa_controlareaItem` | `nc.vo.resa.controlarea.ControlareaItemVO` |
| — | 责任会计_包含工厂 | `resa_sosinca` | `nc.vo.resa.controlarea.SOsInCAVO` |

### 86. 核算要素与物料对照表

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 主表 | 核算要素与物料对照主表 | `bd_elemrelation_h` | `nc.vo.bd.elemrelation.entity.ElemRelationHeadVO` |
| — | 核算要素与物料对照表 | `bd_elemrelation` | `nc.vo.bd.elemrelation.entity.ElemRelationVO` |
| — | 核算要素对应物料分类 | `bd_elemrelation_b` | `nc.vo.bd.elemrelation.entity.ElemRelationMarClassVO` |
| — | 核算要素对应物料 | `bd_elemrelation_bb` | `nc.vo.bd.elemrelation.entity.ElemRelationMarVO` |

### 其他责任会计

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 成本中心版本化 | `resa_costcenter_v` | `nc.vo.resa.vcostcenter.CostCenterVersionVO` |
| 费用类型 | `resa_costtype` | `nc.vo.resa.costtype.CostTypeVO` |
| 责任会计_要素体系 | `resa_elementsystem` | `nc.vo.resa.elementsystem.ElementSystemVO` |
| 责任会计_要素类型 | `resa_elementtype` | `nc.vo.resa.elementsystem.ElementTypeVO` |
| 要素科目对照关系 | `resa_facaccrelate` | `nc.vo.resa.factor.FacAccRelateVO` |
| 要素关联信息历史 | `resa_facasoahistory` | `nc.vo.resa.factor.history.FactorAsoaHistoryVO` |
| 辅助核算历史 | `resa_facasshistory` | `nc.vo.resa.factor.history.FactorAssHistoryVO` |
| 核算要素结构 | `resa_factorframework` | `nc.vo.resa.factor.FactorStructureVO` |
| 核算要素组 | `resa_factorgroup` | `nc.vo.resa.factor.FactorGroupVO` |
| 要素组内要素 | `resa_factorsingroup` | `nc.vo.resa.factor.FactorsInGroupVO` |
| 核算要素结构组历史关系 | `resa_factorsgrel` | `nc.vo.resa.factor.FactorSGRelVO` |

---

## 十三、工艺路线

### 189. 标准工序

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 标准工序 | `pd_rc` | `nc.vo.bd.rt.rt0004.entity.RcVO` |

### 190. 工艺路线

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 工艺路线 | — | `nc.vo.bd.rt.rt0008.entity.AggRtVO` |
| 表头 | 工艺路线主表 | `pd_rt` | `nc.vo.bd.rt.rt0008.entity.RtHeadVO` |
| — | 工序作业档案 | `pd_rt_activity` | `nc.vo.bd.rt.rt0008.entity.RtActivityVO` |
| — | 分配组织 | `pd_rt_assorg` | `nc.vo.bd.rt.rt0008.entity.AssOrgVO` |
| 工序 | 工序信息 | `pd_rt_b` | `nc.vo.bd.rt.rt0008.entity.RtItemVO` |
| — | 工序耗料 | `pd_rt_opac` | `nc.vo.bd.rt.rt0008.entity.RtOpacVO` |

### 191. 工艺路线模板

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 工艺路线模板 | — | `nc.vo.bd.rt.rt0006.entity.RtTemplateAggVO` |
| 表头 | 工艺路线模板主表 | `pd_rttemplate` | `nc.vo.bd.rt.rt0006.entity.RtTemplateHeadVO` |
| 子表 | 工艺路线模板子表 | `pd_rttemplate_b` | `nc.vo.bd.rt.rt0006.entity.RtTemplateItemVO` |

---

## 十四、项目

### 132. 项目

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 项目 | — | `nc.vo.pmpub.project.ProjectBillVO` |
| 表头 | 项目 | `bd_project` | `nc.vo.pmpub.project.ProjectHeadVO` |
| 参与组织 | 项目参与组织 | `bd_project_b` | `nc.vo.pmpub.project.ProjectBodyVO` |

### 133. 项目类型

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 项目类型 | `bd_projectclass` | `nc.vo.pmpub.projecttype.ProjectTypeHeadVO` |
| 子表 | 项目类型子表 | `bd_projectclass_b` | `nc.vo.pmpub.projecttype.ProjectTypeBodyVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 项目基本分类 | `pm_eps` | `nc.vo.pmpub.eps.EpsVO` |
| 项目任务 | `pm_wbs` | `nc.vo.pmpub.wbs.WbsVO` |

---

## 十五、仓库与库存

### 26. 仓库

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 仓库 | `bd_stordoc` | `nc.vo.bd.stordoc.StordocVO` |
| — | 代储关系 | `bd_agentstore` | `nc.vo.bd.stordoc.AgentstoreVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 货位 | `bd_rack` | `nc.vo.bd.rack.RackVO` |

### 181. 成套件

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 成套件 | — | `nc.vo.ic.setpart.entity.SetPartVO` |
| 表头 | 成套件 | `ic_setpart` | `nc.vo.ic.setpart.entity.SetPartHVO` |
| 子件 | 成套件子件明细 | `ic_setpart_b` | `nc.vo.ic.setpart.entity.SetPartBVO` |

---

## 十六、 CBS（成本分解结构）

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| CBS分配关系 | `bd_cbsassign` | `nc.vo.bd.cbs.CBSAssignVO` |
| 组织默认CBS | `bd_cbsdefault` | `nc.vo.bd.cbs.CBSDefaultVO` |
| 成本分解结构成员 | `bd_cbsnode` | `nc.vo.bd.cbs.CBSNodeVO` |

---

## 十七、工作日历与班次

### 45. 班次

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 班次 | — | `nc.vo.bd.shift.AggShiftVO` |
| 表头 | 班次 | `bd_shift` | `nc.vo.bd.shift.ShiftVO` |
| — | 产能休息时间段 | `bd_caprt` | `nc.vo.bd.shift.CapRTVO` |
| — | 产能工作时间段 | `bd_capwt` | `nc.vo.bd.shift.CapWTVO` |
| — | 休息时间段 | `bd_rt` | `nc.vo.bd.shift.RTVO` |
| — | 工作时间段 | `bd_wt` | `nc.vo.bd.shift.WTVO` |

### 164. 班组

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 班组 | — | `nc.vo.bd.team.team01.entity.AggTeamVO` |
| 表头 | 班组定义维护表信息 | `bd_team` | `nc.vo.bd.team.team01.entity.TeamHeadVO` |
| 明细 | 班组定义维护明细表信息 | `bd_team_b` | `nc.vo.bd.team.team01.entity.TeamItemVO` |

### 171. 工作日历

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 工作日历 | `bd_workcalendar` | `nc.vo.bd.workcalendar.WorkCalendarVO` |
| — | 日期信息 | `bd_workcalendardate` | `nc.vo.bd.workcalendar.WorkCalendarDateVO` |
| — | 年度信息 | `bd_workcalendyear` | `nc.vo.bd.workcalendar.WorkCalendarYearVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 工作日历规则 | `bd_workcalendrule` | `nc.vo.bd.workcalendrule.WorkCalendarRuleVO` |
| 班次类别 | `bd_shifttype` | `nc.vo.bd.shift.ShiftTypeVO` |
| 假日 | `bd_holiday` | `nc.vo.bd.holiday.HolidayVO` |

---

## 十八、工作中心与作业

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 工作中心 | `bd_wk` | `nc.vo.bd.wk.wk0104.entity.BDWkVO` |
| 工作中心分类 | `bd_wkclass` | `nc.vo.bd.wk.wk0102.entity.WkClassVO` |
| 投料点维护 | `bd_wk_feed` | `nc.vo.bd.wk.wk0106.entity.TwVO` |
| 作业档案 | `bd_act` | `nc.vo.bd.aassign.entity.BDAAssignVO` |
| 作业分配 | `bd_aassign` | `nc.vo.bd.aassign.entity.BDAAssignVO` |

### 23. 作业档案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 作业档案 | `bd_activity` | `nc.vo.bd.bdactivity.entity.BDActivityVO` |
| 明细 | 作业档案明细 | `bd_activity_b` | `nc.vo.bd.bdactivity.entity.BDActivityBodyVO` |

---

## 十九、计划策略

### 128. 计划策略

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 计划策略 | `bd_planstrategy` | `nc.vo.mmbd.pst.entity.PlanStrategyVO` |

### 129. 计划策略组

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 计划策略组 | — | `nc.vo.mmbd.psg.entity.AggPlanStrategyGroupVO` |
| 表头 | 计划策略组 | `bd_planstrategygroup` | `nc.vo.mmbd.psg.entity.PlanStrategyGroupVO` |
| 明细 | 计划策略组明细 | `bd_planstrategygroup_b` | `nc.vo.mmbd.psg.entity.PlanStrategyGroupBVO` |

---

## 二十、合同管理

### 175. 合同费用定义

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 合同费用定义 | `ct_expset` | `nc.vo.ct.expset.entity.ExpsetVO` |

### 176. 价格模板

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 价格模板 | — | `nc.vo.ct.pricetemplet.entity.PriceTempletVO` |
| 表头 | 价格模板 | `ct_pricetemplet` | `nc.vo.ct.pricetemplet.entity.PriceTempletHeadVO` |
| 项 | 价格模板项 | `ct_pricetemplet_b` | `nc.vo.ct.pricetemplet.entity.PriceTempletItemVO` |

### 177. 合同条款

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 合同条款 | `ct_termset` | `nc.vo.ct.term.entity.TermVO` |
| 合同条款类型 | `ct_termtype` | `nc.vo.ct.termtype.entity.TermTypeVO` |

---

## 二十一、报表项目

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 报表项目映射 | `bd_repitemmapping` | `nc.vo.bd.reportitemmapping.RepItemMappingVO` |
| DI报表项目 | `bd_reportitem` | `nc.vo.bd.reportitem.ReportItemVO` |
| 报表项目体系 | `bd_reportsystem` | `nc.vo.bd.reportsystem.ReportSystemVO` |
| 报表项目 | `far_reportitem` | `nc.vo.far.baseinfo.ReportItemVO` |
| 会计报表项目 | `uapbd_formproject` | `nc.vo.uapbd.accountingprojectsystem.FormProjectVO` |
| 会计科目页签 | `uapbd_formproject_b` | `nc.vo.uapbd.accountingprojectsystem.FormProject_bVO` |
| 会计报表项目体系 | `uapbd_formprojectsystem` | `nc.vo.uapbd.formprojectsystem.FormProjectSystemVO` |

---

## 二十二、分配与管控

### 30. 分配默认值模板

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 分配默认值模板 | `bd_assign_temp` | `nc.vo.bd.assign.AssigntempVO` |
| 规则 | 分配规则 | `bd_assign_rule` | `nc.vo.bd.assign.AssignruleVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 档案分配页签 | `bd_assign_tab` | `nc.vo.bd.assign.AssigntabVO` |
| 集团分配业务单元 | `bd_assiginrelation` | `nc.vo.bd.bdactivity.entity.AssiginRelationVO` |
| 多级管控切换校验 | `bd_doccheck` | `nc.vo.bd.doccheck.BDoccheckVO` |
| 多级管控切换检查类别 | `bd_doccheckcl` | `nc.vo.bd.doccheck.DocCheckClassVO` |

### 59. 单据控制规则

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 单据控制规则 | `bd_crossrule` | `nc.vo.crosscheckrule.RuleVO` |
| 属性 | `bd_crossbusiattr` | `nc.vo.crosscheckrule.BusinessAttrVO` |
| 对象属性档案类型映射 | `bd_crossbusimap` | `nc.vo.crosscheckrule.CrossBusiMapVO` |
| 约束数据 | `bd_crossrestdata` | `nc.vo.crosscheckrule.RestraintDataVO` |
| 档案类型 | `bd_crossrulebusi` | `nc.vo.crosscheckrule.BusinessVO` |
| 档案约束关系 | `bd_crossrulerest` | `nc.vo.crosscheckrule.RestraintVO` |
| 适用范围 | `bd_crossrulescope` | `nc.vo.crosscheckrule.ScopeVO` |

---

## 二十三、批改规则

### 38. 批改页签

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 批改页签 | `bd_batchupdatetab` | `nc.vo.bd.pub.batchupdate.BatchUpdateTabVO` |
| 属性 | 批改属性 | `bd_batchupdateattr` | `nc.vo.bd.pub.batchupdate.BatchUpdateAttrVO` |

### 39. 批改规则组

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 批改规则组 | `bd_batchupruleteam` | `nc.vo.bd.pub.batchupdaterule.BatchUpdateRuleTeamVO` |
| 规则 | 规则 | `bd_batchupdaterule` | `nc.vo.bd.pub.batchupdaterule.BatchUpdateRuleVO` |

---

## 二十四、凭证类别

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 凭证类别 | `bd_vouchertype` | `nc.vo.bd.vouchertype.VoucherTypeVO` |

---

## 二十五、营销

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 营销活动 | `cabd_campaign` | `nc.vo.cabd.mkma.mkmacampaign.mkmacampaign.CampaignVO` |
| 营销事项 | `cabd_matters` | `nc.vo.cabd.mkma.mkmaplan.mkmamatters.MattersVO` |

---

## 二十六、质量

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 质量不合格类型 | `qc_rejecttype` | `nc.vo.scmf.qc.rejecttype.entity.RejectTypeVO` |
| 质量不合格类型关联检验项目明细 | `qc_rejecttype_b` | `nc.voqc.qc_rejecttype_b.qc_rejecttype_b` |
| 处理方式 | `scm_dealfashion` | `nc.vo.scmf.qc.dealfashion.entity.DealFashionVO` |

### 212. 质量等级组

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 质量等级组 | — | `nc.vo.scmf.qc.qualitylevel.entity.QualityLevelVO` |
| 表头 | 质量等级组 | `scm_qualitylevel_h` | `nc.vo.scmf.qc.qualitylevel.entity.QualityLevelHeadVO` |
| 行 | 质量等级 | `scm_qualitylevel_b` | `nc.vo.scmf.qc.qualitylevel.entity.QualityLevelItemVO` |

---

## 二十七、分布式

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 分布式资源扩展配置 | `bd_distributeres` | `nc.bs.bd.pub.distribution.DistributeResVO` |
| 子表 | 分布式资源扩展配置子表 | `bd_distributeres_b` | `nc.bs.bd.pub.distribution.DistributeResBodyVO` |

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 令牌资源控制表 | `bd_disttokenctrl` | `nc.vo.bd.distribute.BDDistTokenCtrlVO` |
| 子表 | 令牌资源控制子表配置 | `bd_disttokenctrl_b` | `nc.vo.bd.distribute.BDDistTokenCtrlBodyVO` |

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 分布式令牌控制配置表 | `bd_disttokenset` | `nc.vo.bd.distribute.BDDistTokenSetVO` |
| 子表 | 分布式令牌控制配置子表 | `bd_disttokenset_b` | `nc.vo.bd.distribute.BDDistTokenSetBodyVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 分布式扩展配置日志表 | `bd_distributeres_log` | `nc.bs.bd.pub.distribution.DistributeResLogVO` |
| 分布式档案传输明细 | `bd_distrestrans_log` | `nc.bs.bd.pub.distribution.BDDistResTransLogVO` |
| 分布式节点扩展配置表 | `bd_distsystemset` | `nc.vo.bd.distribute.BDDistSystemSetExtVO` |

---

## 二十八、维修组织体系

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 维修组织体系 | `org_morgstru` | `nc.vo.ambd.morgstru.MaintainOrgStruVO` |
| 维修组织体系版本 | `org_morgstru_v` | `nc.vo.ambd.morgstru.MaintainOrgStruVersionVO` |
| 维修组织体系成员 | `org_morgstrumember` | `nc.vo.ambd.morgstru.MaintainOrgStruMemberVO` |
| 维修组织体系带编码名称 | `org_morgstrumember` | `nc.vo.ambd.morgstru.MaintainOrgStruWithCodeNameVO` |
| 维修组织体系成员版本 | `org_morgstrumember_v` | `nc.vo.ambd.morgstru.MaintainOrgStruMemberVersionVO` |

---

## 二十九、设备

### 187. 设备类别

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 设备类别 | — | `nc.vo.am.category.AggCategoryVO` |
| 表头 | 设备类别 | `pam_category` | `nc.vo.am.category.CategoryVO` |
| 参数 | 设备类别技术参数 | `pam_cate_param` | `nc.vo.am.category.CateParamVO` |

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 设备状态 | `pam_status` | `nc.vo.am.status.StatusVO` |

---

## 三十、供应商扩展信息

### 215. 供应商扩展

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 聚合 | 供应商扩展信息 | — | `nc.vo.bd.supplierext.entity.SupplierExtVO` |
| 表头 | 供应商扩展信息 | `srmsm_supplierext_h` | `nc.vo.bd.supplierext.entity.SupplierExtHVO` |
| 供货能力分类 | 供货能力分类 | `srmsm_supplierext_a` | `nc.vo.bd.supplierext.entity.SupplierExtAVO` |
| 资料 | 资料 | `srmsm_supplierext_i` | `nc.vo.bd.supplierext.entity.SupplierExtIVO` |
| 产品 | 产品 | `srmsm_supplierext_p` | `nc.vo.bd.supplierext.entity.SupplierExtPVO` |
| 资质 | 资质 | `srmsm_supplierext_q` | `nc.vo.bd.supplierext.entity.SupplierExtQVO` |

---

## 三十一、其他

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 标签模板 | `BD_CodeEditor` | `nc.vo.bd.barcode.design.CodeEditorVO` |
| 物料条形码解析 | `bc_barcodeparse` | `nc.vo.bc.barcodeparse.BarCodeParseVO` |
| 地点档案 | `bd_addressdoc` | `nc.vo.bd.cust.addressdoc.AddressDocVO` |
| 地点联系人信息 | `bd_addrlinkman` | `nc.vo.bd.cust.addressdoc.AddrLinkManVO` |
| 异步删除日志 | `bd_ansylog` | `nc.vo.bd.ansylog.AnsyDelLogVO` |
| 地区分类 | `bd_areacl` | `nc.vo.bd.cust.areaclass.AreaclassVO` |
| 业务事件日志 | `bd_bizeventlog` | `nc.vo.bd.pub.bizeventlog.BizeventlogVO` |
| 渠道类型 | `bd_channeltype` | `nc.vo.bd.cust.channeltype.ChannelTypeVO` |
| 常用数据档案注册表 | `bd_commondoc` | `nc.vo.uap.favoritedata.doc.CommonDocVO` |
| 散户 | `bd_freecustom` | `nc.vo.bd.freecustom.FreeCustomVO` |
| 贸易术语 | `bd_incoterm` | `nc.vo.bd.incoterm.IncotermVO` |
| 产品线 | `bd_prodline` | `nc.vo.bd.prodline.ProdLineVO` |
| 供货能力分类 | `bd_supabclass` | `nc.vo.bd.supplier.supplyabilityclass.SupplyAbilityClassVO` |
| 交易代码 | `bd_transactioncode` | `nc.vo.bd.transactioncode.TransactioncodeVO` |
| 运输方式 | `bd_transporttype` | `nc.vo.bd.transporttype.TransportTypeVO` |
| 会计期间方案映射 | `bd_periodmapping` | `nc.vo.bd.periodmapping.PeriodmappingVO` |
| 会计期间方案映射详细信息 | `bd_periodmappingdetail` | `nc.vo.bd.periodmapping.PeriodmappingdetailVO` |
| 打印申请单 | `pub_printpf` | `nc.vo.uapbd.printpf.PrintCtrlPfVO` |
| 打印申请信息 | `pub_printinfo` | `nc.vo.uapbd.printpf.PrintProposeInfoVO` |
| 常用数据 | `uap_notused` | `nc.vo.uap.favoritedata.FavoriteDataVO` |

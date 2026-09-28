# NCC 采购计划与采购价格模块 VO 与表名对照表

---

# 第一部分：采购计划（mpp）

## 采购计划

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 采购计划 | `po_plan` | `nc.vo.mpp.m2t.entity.PoPlanHeaderVO` |
| 表体 | 采购计划明细 | `po_plan_b` | `nc.vo.mpp.m2t.entity.PoPlanItemVO` |

> 聚合 VO：`nc.vo.mpp.m2t.entity.PoPlanVO`

---

# 第二部分：采购价格（purp）

## 一、邮箱账户设置

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 邮箱账户设置 | `purp_account` | `nc.vo.pp.account.entity.AccountVO` |

## 二、询报价单

### 询报价单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 询报价单 | `purp_askbill` | `nc.vo.pp.m29.entity.AskBillHeaderVO` |
| 表体 | 询报价单明细 | `purp_askbill_b` | `nc.vo.pp.m29.entity.AskBillItemVO` |

> 聚合 VO：`nc.vo.pp.m29.entity.AskBillVO`

### 询报价单交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 询报价单交易类型 | `purp_askbill_transtype` | `nc.vo.pp.m29.entity.AskBillTransTypeVO` |

## 三、采购折扣

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 采购折扣 | `purp_discount_h` | `nc.vo.pp.pub.discount.entity.DiscountHeaderVO` |
| 表体 | 折扣梯度 | `purp_discount_b1` | `nc.vo.pp.pub.discount.entity.DiscountGradsItemVO` |
| 表体 | 单品折扣 | `purp_discount_b2` | `nc.vo.pp.pub.discount.entity.DiscountSingleItemVO` |
| 表体 | 组合折扣 | `purp_discount_b3` | `nc.vo.pp.pub.discount.entity.DiscountCompagesItemVO` |
| 表体 | 适用组织 | `purp_discount_b4` | `nc.vo.pp.pub.discount.entity.DiscountApplyOrgItemVO` |

> 聚合 VO：`nc.vo.pp.pub.discount.entity.AggDiscountVO`

## 四、价格审批单

### 价格审批单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 价格审批单 | `purp_priceaudit` | `nc.vo.pp.m28.entity.PriceAuditHeaderVO` |
| 表体 | 价格审批单明细 | `purp_priceaudit_b` | `nc.vo.pp.m28.entity.PriceAuditItemVO` |

> 聚合 VO：`nc.vo.pp.m28.entity.PriceAuditVO`

### 价格审批单交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 价格审批单交易类型 | `purp_priceaudit_transtype` | `nc.vo.pp.m28.entity.PriceAuditTransTypeVO` |

## 五、优质优价方案

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 优质优价方案主表 | `purp_qpscheme` | `nc.vo.pp.hqhp.qpschm.entity.QPSchmHeaderVO` |
| 表体 | 优质优价方案子表 | `purp_qpscheme_b` | `nc.vo.pp.hqhp.qpschm.entity.QPSchmItemVO` |

> 聚合 VO：`nc.vo.pp.hqhp.qpschm.entity.QPSchmVO`

## 六、优质优价标准

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 优质优价标准主表 | `purp_qpstandard` | `nc.vo.pp.hqhp.qpstandard.entity.QPStandardHeaderVO` |
| 表体 | 优质优价标准子表 | `purp_qpstandard_b` | `nc.vo.pp.hqhp.qpstandard.entity.QPStandardItemVO` |

> 聚合 VO：`nc.vo.pp.hqhp.qpstandard.entity.QPStandardVO`

## 七、供应商价目表

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 供应商价目表 | `purp_supplierprice` | `nc.vo.pp.supplierprice.entity.SupplierPriceVO` |

---

## 统计

| 模块 | 分类 | 数量（含聚合） |
|------|------|---------------|
| mpp | 采购计划 | 3 |
| purp | 邮箱账户设置 | 1 |
| purp | 询报价单 | 4 |
| purp | 采购折扣 | 6 |
| purp | 价格审批单 | 4 |
| purp | 优质优价方案 | 3 |
| purp | 优质优价标准 | 3 |
| purp | 供应商价目表 | 1 |
| **合计** | | **25** |

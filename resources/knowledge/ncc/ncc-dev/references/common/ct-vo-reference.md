# NCC 合同管理模块（ct）VO 与表名对照表

---

## 一、其他付合同（AP）

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 其他付合同 | `ct_ap` | `nc.vo.ct.ap.entity.CtApVO` |
| 表体 | 合同基本 | `ct_ap_b` | `nc.vo.ct.ap.entity.CtApBVO` |
| 表体 | 变更历史 | `ct_ap_change` | `nc.vo.ct.ap.entity.CtApChangeVO` |
| 表体 | 执行过程 | `ct_ap_exec` | `nc.vo.ct.ap.entity.CtApExecVO` |
| 表体 | 合同费用 | `ct_ap_exp` | `nc.vo.ct.ap.entity.CtApExpVO` |
| 表体 | 合同大事记 | `ct_ap_memora` | `nc.vo.ct.ap.entity.CtApMemoraVO` |
| 表体 | 合同条款 | `ct_ap_term` | `nc.vo.ct.ap.entity.CtApTermVO` |

> 聚合 VO：`nc.vo.ct.ap.entity.AggCtApVO`

## 二、其他收合同（AR）

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 其他收合同 | `ct_ar` | `nc.vo.ct.ar.entity.CtArVO` |
| 表体 | 合同基本 | `ct_ar_b` | `nc.vo.ct.ar.entity.CtArBVO` |
| 表体 | 变更历史 | `ct_ar_change` | `nc.vo.ct.ar.entity.CtArChangeVO` |
| 表体 | 执行过程 | `ct_ar_exec` | `nc.vo.ct.ar.entity.CtArExecVO` |
| 表体 | 合同费用 | `ct_ar_exp` | `nc.vo.ct.ar.entity.CtArExpVO` |
| 表体 | 合同大事记 | `ct_ar_memora` | `nc.vo.ct.ar.entity.CtArMemoraVO` |
| 表体 | 合同条款 | `ct_ar_term` | `nc.vo.ct.ar.entity.CtArTermVO` |

> 聚合 VO：`nc.vo.ct.ar.entity.AggCtArVO`

## 三、合同交易类型

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 合同交易类型 | `ct_business` | `nc.vo.ct.business.entity.BusinessSetVO` |

## 四、采购合同

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 采购合同 | `ct_pu` | `nc.vo.ct.purdaily.entity.CtPuVO` |
| 表体 | 付款计划 | `ct_payplan` | `nc.vo.ct.purdaily.entity.PayPlanVO` |
| 表体 | 合同基本 | `ct_pu_b` | `nc.vo.ct.purdaily.entity.CtPuBVO` |
| 表体 | 变更历史 | `ct_pu_change` | `nc.vo.ct.purdaily.entity.CtPuChangeVO` |
| 表体 | 执行过程 | `ct_pu_exec` | `nc.vo.ct.purdaily.entity.CtPuExecVO` |
| 表体 | 合同费用 | `ct_pu_exp` | `nc.vo.ct.purdaily.entity.CtPuExpVO` |
| 表体 | 合同大事记 | `ct_pu_memora` | `nc.vo.ct.purdaily.entity.CtPuMemoraVO` |
| 表体 | 合同付款协议 | `ct_pu_payment` | `nc.vo.ct.purdaily.entity.CtPaymentVO` |
| 表体 | 合同条款 | `ct_pu_term` | `nc.vo.ct.purdaily.entity.CtPuTermVO` |

> 聚合 VO：`nc.vo.ct.purdaily.entity.AggCtPuVO`

## 五、销售合同

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 销售合同 | `ct_sale` | `nc.vo.ct.saledaily.entity.CtSaleVO` |
| 表体 | 收款计划 | `ct_recvplan` | `nc.vo.ct.saledaily.entity.RecvPlanVO` |
| 表体 | 合同基本 | `ct_sale_b` | `nc.vo.ct.saledaily.entity.CtSaleBVO` |
| 表体 | 变更历史 | `ct_sale_change` | `nc.vo.ct.saledaily.entity.CtSaleChangeVO` |
| 表体 | 执行过程 | `ct_sale_exec` | `nc.vo.ct.saledaily.entity.CtSaleExecVO` |
| 表体 | 合同费用 | `ct_sale_exp` | `nc.vo.ct.saledaily.entity.CtSaleExpVO` |
| 表体 | 合同大事记 | `ct_sale_memora` | `nc.vo.ct.saledaily.entity.CtSaleMemoraVO` |
| 表体 | 合同收款协议 | `ct_sale_payterm` | `nc.vo.ct.saledaily.entity.CtSalePayTermVO` |
| 表体 | 合同条款 | `ct_sale_term` | `nc.vo.ct.saledaily.entity.CtSaleTermVO` |

> 聚合 VO：`nc.vo.ct.saledaily.entity.AggCtSaleVO`

## 六、合同控制范围

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 合同控制范围 | `ct_scope` | `nc.vo.ct.purdaily.entity.CtScopeVo` |

> ⚠️ **注意**：`CtScopeVo` 类名首字母大写不符合 Java 命名规范（应为 `CtScopeVO`），请以实际代码为准。

## 七、合同价格信息

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 合同价格信息主表 | `ct_price` | `nc.vo.ct.price.entity.CtPriceHeaderVO` |
| 表体 | 合同价格信息子表 | `ct_price_b` | `nc.vo.ct.price.entity.CtPriceBodyVO` |

> 聚合 VO：`nc.vo.ct.price.entity.AggCtPriceVO`

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 其他付合同（AP） | 8 |
| 其他收合同（AR） | 8 |
| 合同交易类型 | 1 |
| 采购合同 | 10 |
| 销售合同 | 10 |
| 合同控制范围 | 1 |
| 合同价格信息 | 3 |
| **合计** | **41** |

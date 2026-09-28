# NCC 销售信用模块（credit）VO 与表名对照表

---

## 一、信用检查提示信息

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 超账期检查提示信息 | `accountcheckmessage` | `nc.vo.credit.accountcheck.entity.AccountCheckMessage` |
| 信用检查提示信息 | `creditcheckmessage` | `nc.vo.credit.creditcheck.entity.CreditCheckMessage` |
| 单据信用查询 | `creditqueryinfo` | `nc.vo.credit.billcreditquery.BillCreditQueryVO` |

## 二、应收管理

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 应收余额表 | `so_accountmny` | `nc.vo.credit.engrossmaintain.entity.AccountMnyVO` |
| 应收日发生表 | `so_accountmny_d` | `nc.vo.credit.engrossmaintain.entity.AccountMnyDVO` |
| 应收月余额表 | `so_accountmny_m` | `nc.vo.credit.engrossmaintain.entity.AccountMnyMVO` |
| 应收过程表 | `so_accountmny_p` | `nc.vo.credit.engrossmaintain.entity.AccountMnyPVO` |

## 三、信用额度

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 信用额度 | `so_creditamount` | `nc.vo.credit.creditamount.entity.CreditAmountVO` |

## 四、信用额度审批单

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 信用额度审批单主实体 | `so_creditaudit` | `nc.vo.credit.creditaudit.entity.CreditAuditHVO` |
| 表体 | 信用额度审批单子实体 | `so_creditaudit_b` | `nc.vo.credit.creditaudit.entity.CreditAuditBVO` |

> 聚合 VO：`nc.vo.credit.creditaudit.entity.CreditAuditVO`

## 五、信用等级额度

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 信用等级额度实体 | `so_limitlevel` | `nc.vo.credit.limitlevel.entity.LimitLevelVO` |

## 六、额度类型

| 层级 | 实体名称 | 表名 | VO 全限定类名 |
|------|----------|------|---------------|
| 表头 | 额度类型表 | `so_limittype` | `nc.vo.credit.limittype.entity.LimitTypeHVO` |
| 表体 | 额度类型子表-非销售应收类型 | `so_limittype_arap` | `nc.vo.credit.limittype.entity.LimitTypeArapVO` |
| 表体 | 额度类型子表-订单类型 | `so_limittype_btype` | `nc.vo.credit.limittype.entity.LimitTypeBtypeVO` |
| 表体 | 额度类型子表-渠道类型 | `so_limittype_ctype` | `nc.vo.credit.limittype.entity.LimitTypeCtypeVO` |
| 表体 | 额度类型子表-产品线 | `so_limittype_prc` | `nc.vo.credit.limittype.entity.LimitTypePrcVO` |
| 表体 | 额度类型子表-收付款类型 | `so_limittype_rec` | `nc.vo.credit.limittype.entity.LimitTypeRecVO` |

> 聚合 VO：`nc.vo.credit.limittype.entity.LimitTypeVO`

## 七、额度设置显示

| 实体名称 | 表名 | VO 全限定类名 |
|----------|------|---------------|
| 额度设置显示VO | `so_limittypeview` | `nc.vo.credit.limittype.entity.display.LimitTypeViewVO` |

---

## 统计

| 分类 | 数量（含聚合） |
|------|---------------|
| 信用检查提示信息 | 3 |
| 应收管理 | 4 |
| 信用额度 | 1 |
| 信用额度审批单 | 3 |
| 信用等级额度 | 1 |
| 额度类型 | 7 |
| 额度设置显示 | 1 |
| **合计** | **20** |

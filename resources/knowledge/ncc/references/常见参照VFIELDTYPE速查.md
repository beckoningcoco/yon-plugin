# 常见参照 VFIELDTYPE 速查（权威源）

> **用途**：写集成规则 JSON 时，优先查此文档确定 VFIELDTYPE。文档中没有的再查数据库。
> **维护规则**：每验证一个新字段，追加到对应分类。验证过=可信任，审核代理不再重复查库。
>
> 数据库查询 SQL 模板见 [集成规则字段速查卡 §四](./集成规则字段速查卡.md#四vfieltype-取值-sql-模板)。

---

## 一、组织类

| 语义名 | 常见字段名 | fullclassname | md_class.id（VFIELDTYPE） | scope | scope 依据 | 验证来源 |
|--------|-----------|---------------|--------------------------|-------|-----------|---------|
| 组织_业务单元 | `pk_org` | `nc.vo.org.OrgVO` | `985be8a4-3a36-4778-8afe-2d8ed3902659` | group | 组织档案集团级统一维护 | 机科-差旅报销单 |
| 组织_财务组织 | `pk_org`（财务单据） | `nc.vo.org.FinanceOrgVO` | `2cfe13c5-9757-4ae8-9327-f5c2d34bcb46` | group | 财务组织集团级维护 | 机科-差旅报销单 |
| 组织_公司 | `pk_corp` | `nc.vo.org.CorpVO` | `4d514224-de70-44dd-bf70-f14a02f29d10` | group | 公司集团级维护 | IBDMetaDataIDConst |
| 组织_集团 | `pk_group` | `nc.vo.org.GroupVO` | `3b6dd171-2900-47f3-bfbe-41e4483a2a65` | global | 集团全局唯一 | IBDMetaDataIDConst |
| 组织_采购组织 | `pk_purchaseorg` | `nc.vo.org.PurchaseOrgVO` | `5d69ee35-57d0-4f7b-b454-deff4fc73689` | group | | IBDMetaDataIDConst |
| 组织_销售组织 | `pk_salesorg` | `nc.vo.org.SalesOrgVO` | `945f38b6-48ec-43e6-bb09-77ec89a3728f` | group | | IBDMetaDataIDConst |
| 组织_库存组织 | `pk_stockorg` | `nc.vo.org.StockOrgVO` | `46c4bfba-0b40-4855-87f8-c2ac8647f039` | group | | IBDMetaDataIDConst |
| 组织_人力资源组织 | `pk_hrorg` | `nc.vo.org.HROrgVO` | `f3fed5ea-72f2-4a0a-ad43-d30b1c22c86c` | group | | IBDMetaDataIDConst |
| 组织_行政组织 | `pk_adminorg` | `nc.vo.org.AdminOrgVO` | `a0ec952c-e4e5-416a-b3e0-d402725f76be` | group | | IBDMetaDataIDConst |
| 组织_资金组织 | `pk_fundorg` | `nc.vo.org.FundOrgVO` | `33f0d692-6a40-44a9-a471-7e4105c201b7` | group | | IBDMetaDataIDConst |
| 利润中心 | `pk_profitcenter` | `nc.vo.org.ProfitCenterVO` | `310e1300-0681-4062-9ca7-6276d9833901` | group | | IBDMetaDataIDConst |
| 成本中心 | `pk_costcenter` | `nc.vo.org.CostCenterVO` | `de9796b5-bccd-42a1-97dd-808847bfddbd` | group | | IBDMetaDataIDConst |

> ⚠️ **陷阱**：接口文档写 `pk_org` 不一定是通用组织。大部分财务单据（报销、付款、发票）的 `pk_org` 实际是**财务组织**（FinanceOrgVO）。**不确定时主动询问用户是哪种组织**。

---

## 二、部门与人员

| 语义名 | 常见字段名 | fullclassname | md_class.id（VFIELDTYPE） | scope | scope 依据 | 验证来源 |
|--------|-----------|---------------|--------------------------|-------|-----------|---------|
| 组织_部门 | `deptid` | `nc.vo.org.DeptVO` | `b26fa3cb-4087-4027-a3b6-c83ab2a086a9` | org | 部门按业务单元隔离 | 机科-差旅报销单 |
| 组织_部门版本 | `deptid_v`、`fydeptid_v` | `nc.vo.org.DeptVersionVO` | `66ed0cf6-e260-4f39-8fbb-172260efd677` | org | 带版本信息，费用承担部门类使用 | 机科-差旅报销单 |
| 人员管理信息 | `jkbxr`、`pk_psndoc` | `nc.vo.bd.psn.PsndocVO` | `40d39c26-a2b6-4f16-a018-45664cac1a1f` | group | 人员档案集团级维护 | 机科-差旅报销单 |
| 人员类别 | `pk_psncl` | `nc.vo.bd.psn.PsnClVO` | `400f55be-f4cc-4b38-b1e2-aabdc75e2aad` | group | | IBDMetaDataIDConst |
| 用户 | `creator`、`pk_operator` | `nc.vo.sm.UserVO` | `f6f9a473-56c0-432f-8bc7-fbf8fde54fee` | group | | IBDMetaDataIDConst |
| 职务 | `pk_job` | - | `8afa3f01-d755-4b31-a593-507130d91ffd` | group | | 机科-差旅报销单 |

> ⚠️ **陷阱**：`deptid` 和 `deptid_v` 是两个不同的 md_class。带 `_v` 后缀的字段（如 `fydeptid_v`）通常需要带版本的部门 VO。看字段编码有无 `_v` 后缀来判断。

---

## 三、财务类

| 语义名 | 常见字段名 | fullclassname | md_class.id（VFIELDTYPE） | scope | scope 依据 | 验证来源 |
|--------|-----------|---------------|--------------------------|-------|-----------|---------|
| 币种 | `pk_currtype`、`bzbm` | `nc.vo.bd.currtype.CurrtypeVO` | `b498bc9a-e5fd-4613-8da8-bdae2a05704a` | global | 币种全局唯一 | IBDMetaDataIDConst |
| 结算方式 | `jsfs` | `nc.vo.bd.balatype.BalaTypeVO` | `7016ec17-4116-4b3c-abf1-37e3b5d815ef` | group | 结算方式集团级维护 | 机科-差旅报销单 |
| 收支项目 | `szxmid` | `nc.vo.uapbd.inoutbusiclass.InoutBusiClassVO` | `283d91a4-a8f4-4763-ac44-aae7401fa09a` | group | | IBDMetaDataIDConst |
| 现金流量项目 | `cashflow` | - | `08d4138b-a7b5-42fd-94bc-bb6eb7ac0fdc` | global | | IBDMetaDataIDConst |
| 银行档案 | `pk_bankdoc` | - | `bf5aeed4-6b35-4a2e-b750-b9aabce59e21` | group | | IBDMetaDataIDConst |
| 银行账户 | `pk_bankaccount` | - | `611652ad-177f-4d3e-9ae7-ef8f96930b78` | org | 银行账户按组织隔离 | IBDMetaDataIDConst |

---

## 四、客商类

| 语义名 | 常见字段名 | fullclassname | md_class.id（VFIELDTYPE） | scope | scope 依据 | 验证来源 |
|--------|-----------|---------------|--------------------------|-------|-----------|---------|
| 客户基本信息 | `pk_customer` | `nc.vo.bd.customer.CustomerVO` | `e4f48eaf-5567-4383-a370-a59cb3e8a451` | group | | IBDMetaDataIDConst |
| 供应商基本信息 | `pk_supplier` | `nc.vo.bd.supplier.SupplierVO` | `720dcc7c-ff19-48f4-b9c5-b90906682f45` | group | | IBDMetaDataIDConst |

---

## 五、物料类

| 语义名 | 常见字段名 | fullclassname | md_class.id（VFIELDTYPE） | scope | scope 依据 | 验证来源 |
|--------|-----------|---------------|--------------------------|-------|-----------|---------|
| 物料基本信息（多版本） | `pk_material` | - | `c7dc0ccd-8872-4eee-8882-160e8f49dfad` | group | | IBDMetaDataIDConst |

---

## 六、项目类

| 语义名 | 常见字段名 | fullclassname | md_class.id（VFIELDTYPE） | scope | scope 依据 | 验证来源 |
|--------|-----------|---------------|--------------------------|-------|-----------|---------|
| 项目管理-项目 | `jobid`、`pk_project` | `nc.vo.pmpub.project.ProjectHeadVO` | `2ee58f9b-781b-469f-b1d8-1816842515c3` | org | | 机科-差旅报销单（用户确认） |

> ⚠️ **陷阱**：`jobid` 是**项目管理**的项目（`ProjectHeadVO`），不是会计科目的项目（`FormProjectVO`）。两个 fullclassname 完全不同，查错会漏掉正确结果。

---

## 七、自定义档案类（项目特有）

> ⚠️ 自定义档案的 md_class.id 在不同项目中**值不同**，以下为已验证的项目特定值。

| 语义名 | 项目 | md_class.id（VFIELDTYPE） | scope | 验证来源 | 验证时间 |
|--------|------|--------------------------|-------|---------|---------|
| 管理费用类别 | 机科 | `1001A1100000000012OX` | org | 机科-差旅报销单 | 2026-06 |
| 差旅类型 | 机科 | `1001A11000000005LMOQ` | group | 机科-差旅报销单 | 2026-06 |
| 机科CBS科目 | 机科 | `1001A8100000013NT2II` | org | 机科-差旅报销单 | 2026-06 |
| 补助类型 | 机科 | `1001A1100000002PXW6C` | org | 机科-差旅报销单 | 2026-06 |

> 其他项目使用自定义档案时，查询 SQL：
> ```sql
> SELECT id, displayname FROM md_class
> WHERE fullclassname = 'nc.vo.bd.defdoc.DefdocVO'
>   AND displayname LIKE '%关键词%';
> ```

---

## 八、查找流程

```
开发者（我）拿到一个字段需要确定 VFIELDTYPE：
  ↓
① 查本文档 — 按语义名 + 字段名匹配
  ↓ 命中？
  ├─ 是 → 直接取值。审核代理对照本文档确认，不重复查库。
  └─ 否 → ②
  ↓
② 查数据库 — 按速查卡 §四 SQL 模板查询
  ↓ 结果确认？
  ├─ 是 → 取值。同时追加到本文档对应分类。
  └─ 查不到/有歧义 → ③
  ↓
③ 列出候选项 → 询问用户选择 → 用户确认后取值 + 追加到本文档
```

---

## 九、维护规则

1. **新增条目**：每次验证一个新字段后，追加到对应分类表格
2. **不删只增**：已验证的值永远不删除，即使项目结束（供其他项目参考）
3. **项目特定标注**：自定义档案类必须标注项目名
4. **陷阱记录**：发现容易混淆的字段，在表格后加 `> ⚠️ 陷阱` 说明
5. **来源溯源**：每个条目必须填写"验证来源"

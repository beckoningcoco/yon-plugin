# BIP收款单/付款单 → NC65 字段映射

## 一、档案翻译映射

| 档案类型 | BIP字段 | NC65标签 | SQL表 |
|---------|---------|----------|-------|
| 组织 | `org` / `accentity_code` | `pk_org` | `iuap_apdoc_basedoc.org_orgs` |
| 用户 | `creator` | `creator` | `iuap_apcom_auth.user` + `bd_staff` |
| 部门 | `dept` | `pk_deptid` | `iuap_apdoc_basedoc.org_orgs` |
| 币种 | `orgCurrency` / `currency_code` | `pk_currtype` | `iuap_apdoc_basedoc.bd_currency_tenant` |
| 结算方式 | `settleMode` | `pk_balatype` | `iuap_apdoc_coredoc.settle_method` |
| 客户 | `customer` | `customer` | `iuap_apdoc_coredoc.merchant` |
| 伙伴 | `partner` | `customer` | `iuap_apdoc_coredoc.base_businesspartner` |
| 供应商 | `oppositeobjectid`(type=2) | `supplier` | `iuap_apdoc_coredoc.aa_vendor` |
| 人员 | `oppositeobjectid`(type=3) | `pk_psndoc` | `iuap_apdoc_basedoc.bd_staff` |
| 银行账户 | `enterpriseBankAccount` | `recaccount` | `iuap_apdoc_basedoc.org_fin_bankacct` |
| 物料 | `gdyy024` | `def29` | `iuap_apdoc_coredoc.product` |

---

## 二、直接映射字段

| BIP字段 | NC65标签 | 说明 |
|--------|----------|------|
| `id` | `id` | 单据ID |
| `code` | `billno` | 单据编号 |
| `createDate` | `creationtime` | 创建时间 |
| `vouchdate` | `billdate` | 单据日期 |
| `natSum` | `money` | 金额 |
| `description` | `scomment` | 摘要 |

---

## 三、NC65常量值

| NC65标签 | 值 | 说明 |
|----------|---|------|
| `pk_group` | `01` | 集团编码 |
| `pk_billtype` | `F2` | 单据类型 |
| `pk_tradetype` | `D2` | 交易类型 |
| `billclass` | `sk` | 单据大类 |
| `direction` | `-1` | 方向 |
| `isreded` | `N` | 是否红冲 |
| `groupcode` | `01` | 集团编码 |
| `account` | `001` | 账套编码 |
| `isexchange` | `Y` | 是否交换 |
| `replace` | `Y` | 是否替换 |
| `sender` | `bip` | 发送方 |
| `flag` | `add` | 操作标识 |

---

## 四、XML报文结构

```
ufinterface (根节点)
└── bill
    └── billhead (表头)
        ├── pk_group
        ├── pk_org
        ├── pk_fiorg
        ├── sett_org
        ├── creator
        ├── billno
        ├── billdate
        ├── money
        └── ...
    └── bodys (表体)
        └── item (明细行)
            ├── pk_org
            ├── customer/supplier/pk_psndoc
            ├── pk_deptid
            ├── money_cr
            └── ...
```

---

## 五、往来对象翻译

| caobject值 | NC65 objtype | NC65字段 |
|------------|--------------|----------|
| `1` 或默认 | `0` | `customer` |
| `2` (供应商) | `1` | `supplier` |
| `3` (人员) | `3` | `pk_psndoc` |

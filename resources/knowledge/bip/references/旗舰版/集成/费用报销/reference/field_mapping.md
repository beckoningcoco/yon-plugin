# 费控单据三方集成字段映射

> **约定**：本技能统一使用字符串编码表示状态（如 `CREATED`、`SUCCESS`），BIP数据库内部使用数字编码。两者对照关系见下表。

根据提供的文件获取字段映射，如果没有提供，则采用下边的字段。

## 单据基本信息字段

| BIP字段 | 三方系统字段 | 说明 |
|--------|-------------|------|
| bill_id / id | bipBillId | 单据ID |
| bill_no | billNo | 单据编号 |
| trade_type_code | billType | 交易类型 |
| pk_org | pkOrg | 组织 |
| creator | creator | 创建人 |
| creationtime | createTime | 创建时间 |
| billstatus | billStatus | 单据状态 |

## 单据状态常量

### BIP数据库数字编码（内部使用）

```
BILLSTATUS_APPROVEING = "0"    // 审核中
BILLSTATUS_WAITSUBMIT = "1"    // 待提交
BILLSTATUS_APPROVED   = "2"    // 审核通过
```

### 统一字符串编码（回调参数使用）

```
CREATED   = 待提交      (对应数字编码 "1")
SUBMIT    = 已提交
APPROVING = 审核中      (对应数字编码 "0")
APPROVED  = 审核通过    (对应数字编码 "2")
REJECTED  = 审批拒绝
```

## 结算状态常量

### BIP数据库数字编码（内部使用）

```
PAYSTAUS_SUCCESS       = "0"  // 结算成功
PAYSTAUS_PART_SUCCESS  = "1"  // 部分成功
PAYSTAUS_FAIL          = "2"  // 结算失败
PAYSTAUS_NOT           = "3"  // 结算中止(止付)
```

### 统一字符串编码（回调参数使用）

```
SUCCESS = 结算成功    (对应数字编码 "0")
PART    = 部分成功    (对应数字编码 "1")
FAIL    = 结算失败    (对应数字编码 "2")
NOT     = 结算中止    (对应数字编码 "3")
```

## 凭证状态常量

```
WAIT    = 待生成
SUCCESS = 生成成功
FAIL    = 生成失败
```

## 结算信息字段

| BIP字段 | 三方系统字段 | 说明 |
|--------|-------------|------|
| settleInfoId / businessDetailsId | settlementId | 结算ID |
| expectsettlemethodId | settleType | 结算方式 |
| settlemetBankAccount | settlemetBankAccount | 付款银行账号 |
| settlemetBankAccountId | pkEnterprisebankacct | 企业银行账户PK |
| settleSuccBizTime | settleTime | 结算成功时间 |
| statementdetailstatus | wsettlementStatus | 结算状态 |

## 特征字段（通用报销单）

| 特征字段编码 | 说明 |
|------------|------|
| MY_FK_0107 | 单据类型 |
| MY_FK_0008 | 来源单据ID（唯一性校验） |
| MY_FK_0270 | 用户编码 |
| expensebillDcs_md_mis_dict | 来源系统编码 |

## 银行账户字段

| BIP字段 | 说明 |
|--------|------|
| pk_balatype | 结算方式ID |
| vbankaccount_opp | 付款银行账号 |
| vbankaccname_opp | 付款账户户名 |
| pk_enterprisebankacct | 企业银行账户PK |
| pk_bankdoc_opp | 付款开户行PK |
| vbankdocname_opp | 付款开户行名称 |
| pk_banktype_opp | 付款银行类别ID |
| vbanktypename_opp | 付款银行类别 |
| accttype_opp | 付款账户类型 |

## 数据转换要点

1. 日期格式转换：BIP日期格式 `yyyy-MM-dd HH:mm:ss`
2. 状态码翻译：三方统一字符串编码 ↔ BIP数据库数字编码（对照上表）
3. 金额精度：保留两位小数
4. ID翻译：需要通过档案翻译服务转换

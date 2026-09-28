# 费控单据录入详细规范

## 一、概述

单据录入是指第三方系统将付款单/报销单数据推送到BIP费控系统，支持新增和修改两种操作。

## 二、支持的单据类型

| 单据类型 | 交易类型编码(bustype) | BIP单据VO |
|------|-----------------|------|
| 通用报销单 | -         | znbzbx.commonexpensebill.CommonExpenseBillVO |
| 个人付款单 | -         | znbzbx.personalexpensebill.PersonalExpenseBillVO |
| 差旅费报销单 | -          | znbzbx.travelexpensebill.TravelExpenseBillVO |
| 还款单 | -          | znbzbx.repaymentbill.RepaymentBillVO |
| 借款单 | -               | znbzbx.loanbill.LoanBillVO |
| 出差申请单 | -               | 调用`iuap-c-metadata-info`查询 |
| 通用申请单 | -               | 调用`iuap-c-metadata-info`查询 |
| 出差申请变更单 | -               | 调用`iuap-c-metadata-info`查询 |
| 通用申请变更单 | -               | 调用`iuap-c-metadata-info`查询 |

> **注意**：出差申请单、通用申请单、出差申请变更单、通用申请变更单的字段结构请通过skill技能`iuap-c-metadata-info`查询获取，它们的字段结构与报销单类似但存在差异。

## 三、字段说明

**单据字段信息优先调用skill技能`iuap-c-openapi-integration`从OpenAPI获取，如果获取不到再调用skill技能`iuap-c-metadata-info`查询元数据，最后使用下面的默认字段信息**

### 3.1 主表字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|-----|------|------|
| _status | String | 是 | Insert:新增, Update:修改 |
| code | String | 否 | 单据编号，新增时自动生成 |
| bustype | String | 是 | 交易类型 |
| pk_handlepsn | String | 是 | 报账人编码 |
| pk_cusdoc | String | 否 | 供应商编码 |
| caccountorg | String | 是 | 会计主体 |
| dcostdate | Date | 是 | 发生日期 |
| vouchdate | Date | 否 | 单据日期 |
| nexpensemny | BigDecimal | 是 | 不含税总额 |
| nsummny | BigDecimal | 是 | 报销价税总额 |
| nshouldpaymny | BigDecimal | 是 | 应付总额 |
| npaymentmny | BigDecimal | 是 | 付款金额 |
| vreason | String | 否 | 事由 |
| isdeferexpense | Boolean | 否 | 是否待摊 |
| creator_code | String | 是 | 创建人编码 |

### 3.2 特征字段 expensebillDcs

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|-----|------|------|
| MY_FK_0008 | String | 是 | 来源单据ID（唯一性校验） |
| MY_FK_0107 | String | 否 | 单据类型 |
| md_mis_dict | String | 是 | 来源系统编码 |
| MY_FK_0001 | String | 否 | 提单人 |
| MY_FK_0002 | String | 否 | 流程紧急标识 |
| MY_FK_0003 | String | 否 | 报账等级 |
| MY_FK_0020 | Boolean | 否 | 是否招聘 |
| MY_FK_0021 | Boolean | 否 | 是否需补扫附件 |
| MY_FK_0029 | String | 否 | 费用类型 |
| MY_FK_0030 | Boolean | 否 | 是否自动提交 |
| MY_FK_0041 | String | 否 | 来源系统URL |
| MY_FK_0052 | Integer | 否 | 影像张数 |
| MY_FK_0108 | String | 否 | 报账明细单号 |

### 3.3 报销明细 expensebillbs

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|-----|------|------|
| _status | String | 是 | 操作标识 |
| pk_busimemo_code | String | 是 | 费用小类 |
| nexpensemny | BigDecimal | 是 | 不含税金额 |
| ntaxmny | BigDecimal | 是 | 可抵扣税额 |
| nsummny | BigDecimal | 是 | 价税合计 |
| nnatsummny | BigDecimal | 是 | 本币金额 |
| nshouldpaymny | BigDecimal | 是 | 应付金额 |
| vfinacedeptid | String | 是 | 承担部门 |
| cfinaceorg | String | 是 | 承担公司 |

### 3.4 报销明细特征 expensebillBDcs

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|-----|------|------|
| MY_FK_0005 | String | 否 | 事故人 |
| MY_FK_0040 | String | 是 | 核算部门 |
| MY_FK_0110 | String | 否 | 业绩管理项目 |
| md_rd_projects | String | 否 | 研发项目 |
| md_gc_field | String | 否 | 场区 |
| md_section | String | 否 | 标段 |
| md_session | String | 否 | 场次 |
| md_saletype | String | 否 | 销售类型 |

### 3.5 结算信息 expsettleinfos

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|-----|------|------|
| _status | String | 是 | 操作标识 |
| igathertype | String | 是 | 收款类型：0个人/1供应商 |
| nsummny | BigDecimal | 是 | 付款金额 |
| pk_balatype | String | 是 | 结算方式 |
| pk_handlepsn | String | 否 | 个人银行必填 |
| pk_cusdoc | String | 否 | 供应商银行必填 |
| vbankaccount | String | 是 | 收款账号 |
| vbankdocname | String | 是 | 开户行名称 |

### 3.6 费用分摊 expapportions

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|-----|------|------|
| _status | String | 是 | 操作标识 |
| nexpensemny | BigDecimal | 是 | 分摊金额 |
| cfinaceorg | String | 是 | 承担公司 |
| vfinacedeptid | String | 是 | 承担部门 |

## 四、数据转换规则

### 4.1 Insert 新增流程

```
1. 参数校验
   - 检查必填字段
   - 校验金额精度（最多2位小数）
   - 校验唯一性（MY_FK_0008）

2. 数据转换
   - 档案翻译（员工、供应商、部门等）
   - 银行信息查询
   - 期间校验

3. 调用OpenAPI保存，接口和字段从skill技能`iuap-c-openapi-integration`获取
```

### 4.2 Update 修改流程

```
1. 根据ID查询原数据
2. 对比子表数据条数
3. 处理增删改状态
4. 调用OpenAPI保存，接口和字段从skill技能`iuap-c-openapi-integration`获取
```

### 4.3 字段翻译规则

| 原字段 | 目标字段 | 说明 |
|--------|---------|------|
| pk_handlepsn(员工编码) | pk_handlepsn(id) | 通过档案翻译 |
| pk_cusdoc(供应商编码) | pk_cusdoc(id) | 通过档案翻译 |
| pk_busimemo_code | pk_busimemo_code(id) | 费用小类 |
| vfinacedeptid | vfinacedeptid(id) | 部门翻译 |

### 4.4 金额精度处理

```java
// 金额必须保留两位小数
BigDecimal stripped = amount.stripTrailingZeros();
if (stripped.scale() > 2) {
    throw new BusinessException(paramName + "金额异常，大于两位小数！");
}
```

## 五、唯一性校验

### 5.1 校验逻辑

```java
// 通过来源单号MY_FK_0008校验
String sourcebillno = data.getJSONObject("expensebillDcs").getString("MY_FK_0008");
boolean uniqueBill = commonHandleConvert.checkUniqueBillByFeature(
    "znbzbx", 
    "znbzbx.commonexpensebill.CommonExpenseBillVO", 
    "expensebillDcs.MY_FK_0008", 
    sourcebillno);

if (uniqueBill) {
    throw new BusinessException("数据重复，请先在BIP删除数据后重新推送");
}
```

### 5.2 重复处理策略

校验到重复数据时：
- 新增场景：抛出异常，禁止重复创建
- 修改场景：查询原数据进行更新

## 六、错误处理

### 6.1 常见错误

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 参数错误 | 检查必填字段 |
| 401 | 认证失败 | 检查加密串 |
| 404 | 数据不存在 | 检查ID是否正确 |
| 500 | 服务端错误 | 重试或联系管理员 |

### 6.2 业务异常

```java
throw new BusinessException("来源MY_FK_0008单号为空！");
throw new BusinessException("数据重复，请先在BIP删除数据后重新推送");
throw new BusinessException("数据已存在，不允许新增！");
throw new BusinessException("交易类型不明确！");
throw new BusinessException("报销单明细不可为空！");
throw new BusinessException("结算信息集合不可为空！");
```

## 七、调用示例

### 7.1 新增单据

```json
POST /externalpaymentbill/save
Content-Type: application/json

{
  "data": {
    "_status": "Insert",
    "bustype": "MYJT001A",
    "pk_handlepsn": "EMP001",
    "caccountorg": "ORG001",
    "nexpensemny": 100.00,
    "nsummny": 113.00,
    "nshouldpaymny": 113.00,
    "npaymentmny": 113.00,
    "dcostdate": "2024-01-01",
    "creator_code": "zhangsan",
    "expensebillDcs": {
      "MY_FK_0008": "SOURCE_BILL_001",
      "md_mis_dict": "SYS001",
      "MY_FK_0107": "TYPE001"
    },
    "expensebillbs": [{
      "_status": "Insert",
      "pk_busimemo_code": "EXP001",
      "nexpensemny": 100.00,
      "nsummny": 113.00,
      "ntaxmny": 13.00,
      "nnatsummny": 113.00,
      "vfinacedeptid": "DEPT001",
      "cfinaceorg": "ORG001"
    }],
    "expsettleinfos": [{
      "_status": "Insert",
      "igathertype": "0",
      "pk_handlepsn": "EMP001",
      "pk_handlepsnbank": "BANK001",
      "nsummny": 113.00
    }]
  }
}
```

### 7.2 修改单据

```json
POST /externalpaymentbill/save
Content-Type: application/json

{
  "data": {
    "_status": "Update",
    "id": "123456789",
    "bustype": "MYJT001A",
    "nexpensemny": 200.00,
    "nsummny": 226.00,
    "expensebillbs": [{
      "id": "111",
      "_status": "Update",
      "nexpensemny": 200.00,
      "nsummny": 226.00
    }]
  }
}
```

### 7.3 响应示例

成功：
```json
{
  "code": 200,
  "message": "保存成功",
  "data": {
    "sourceBillNo": "SOURCE_BILL_001"
  }
}
```

失败：
```json
{
  "code": 500,
  "message": "数据重复，请先在BIP删除数据后重新推送，sourcebillno单号为：SOURCE_BILL_001"
}
```
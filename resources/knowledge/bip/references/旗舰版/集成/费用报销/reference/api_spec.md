# 第三方系统 API 规范

## 集成概述

费控单据与第三方系统集成采用 HTTP + JSON 方式，遵循以下规范：
- 请求方式：POST application/json
- 认证方式：加密串（encryptCheck）+ appCode
- 响应格式：JSON

## API 列表

### 1. 单据推送接口

**URL**: `/costControl/saveBill`

**描述**: 将 BIP 单据推送到第三方系统

**请求参数**:
```json
{
  "encryptCheck": "加密串",
  "appCode": "应用编码",
  "bipBillId": "BIP单据ID",
  "billNo": "单据编号",
  "billType": "单据类型",
  "sourceBillId": "来源单据ID",
  "billStatus": "单据状态",
  "amount": "金额",
  "createTime": "创建时间",
  "creator": "创建人",
  "corpId": "公司ID"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "thirdBillId": "第三方单据ID"
  }
}
```

### 2. 状态回写接口

**URL**: `/costControl/updateBillsStatus`

**描述**: 结算完成后回写单据状态到第三方系统

**请求参数**:
```json
{
  "encryptCheck": "加密串",
  "appCode": "应用编码",
  "bipBillId": "BIP单据ID",
  "billStatus": "单据状态",
  "wsettlementStatus": "结算状态",
  "billType": "单据类型",
  "sourceBillId": "来源单据ID",
  "settlementId": "结算ID",
  "settleTime": "结算时间"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "操作成功"
}
```

### 3. 单据查询接口

**URL**: `/costControl/queryBill`

**描述**: 从第三方系统查询单据状态

**请求参数**:
```json
{
  "encryptCheck": "加密串",
  "appCode": "应用编码",
  "bipBillId": "BIP单据ID",
  "sourceBillId": "来源单据ID"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "billStatus": "单据状态",
    "wsettlementStatus": "结算状态",
    "settleTime": "结算时间"
  }
}
```

## 错误码说明

| 错误码 | 说明 |
|-------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 401 | 认证失败 |
| 403 | 权限不足 |
| 404 | 数据不存在 |
| 500 | 服务端错误 |


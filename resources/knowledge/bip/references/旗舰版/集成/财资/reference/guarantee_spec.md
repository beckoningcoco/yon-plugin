# 担保费用发票生成规范

## 概述

> **⚠️ 场景限制**：本技能仅生成**担保费用发票生成集成**场景代码
> **📌 引用规范**：MVC分层架构、数据持久化方式请参考 _公共规范/

---

## MCP技能调用

| 任务 | 触发条件 | 调用的 MCP |
|------|---------|-----------|
| BIP 查询 | 需要查询担保费用单数据 | getOpenApiCall |
| 档案查询 | 需要查询 BIP 档案数据 | getIBillQueryRepository |

---

## 担保费用发票生成服务

### 事件监听

- **事件类型**：end（审批完成）
- **来源**：yonbip-fi-ctmgrm
- **单据**：yonbip-fi-ctmgrm.grm_guarantee_cost

### 接口定义

| 方法 | 说明 |
|------|------|
| onEvent | 审批完成事件监听 |
| save | 保存发票数据 |

---

## 数据处理流程

### 1. 事件监听流程

1. 接收担保费用单审批完成事件
2. 解析事件数据，获取担保费用单ID
3. 查询担保费用单详细信息
4. 根据担保费用单关联查询担保合同
5. 获取担保方向

### 2. 发票生成流程

1. 根据担保方向判断生成发票类型
2. 构建发票参数
3. 调用对应API保存发票
   - guaranteeDirection=1：调用应付发票保存接口
   - guaranteeDirection=2：调用应收发票保存接口

### 3. 数据转换

1. 获取担保费用单数据
2. 获取担保合同数据
3. 构建发票主表数据
4. 计算税额（金额÷1.06×0.06）

---

## 担保方向

| 担保方向 | 说明 | 生成发票类型 | 业务类型编码 |
|----------|------|-------------|-------------|
| 1 | 获得担保 | 应付发票 | NBDBYF_Cnyig_001 |
| 2 | 提供担保 | 应收发票 | NBDBYS_Cnyig_001 |

---

## 字段映射

### 发票主表字段

| BIP 字段 | 担保费用字段 | 数据类型 | 说明 |
|---------|-------------|---------|------|
| resubmitCheckKey | id | String | 担保费用单ID |
| extVouchCode | code | String | 担保费用单号 |
| srcBillId | id | String | 源单据ID |
| financeOrg | accentity | String | 开票组织 |
| org | accentity | String | 组织 |
| oriCurrency | costCurrency | String | 币种 |
| funder | accentityGuarantor/accentityDebtor | String | 资金业务对象 |
| exchangeRateType | natRatetype | String | 汇率类型 |
| exchangeRate | natRate | BigDecimal | 汇率 |
| oriTaxExcludedAmount | costAmount - taxAmount | BigDecimal | 原币无税金额 |
| oriTaxIncludedAmount | costAmount | BigDecimal | 原币含税金额 |
| localTaxExcludedAmount | natCostamount - taxAmount | BigDecimal | 本币无税金额 |
| localTaxIncludedAmount | natCostamount | BigDecimal | 本币含税金额 |

---

## BIP API 路径

| 发票类型 | 路径 | 说明 |
|----------|------|------|
| 应付发票 | /iuap-api-gateway/yonbip/EFI/payable/save | 保存应付发票 |
| 应收发票 | /iuap-api-gateway/yonbip/EFI/receivable/save | 保存应收发票 |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| GCI001 | 调用发票保存接口异常 | 返回异常信息 |
| GCI002 | 担保方向未知 | 返回异常信息 |
| GCI003 | 担保费用单查询失败 | 返回异常信息 |

---

## Service 层实现规范

```java
@Override
public String onEvent(BusinessEvent businessEvent, String queueName) throws BusinessException {
    // 1. 解析事件数据
    String body = businessEvent.getUserObject();
    String[] splitBusinessKey = businessEvent.getBusinessKey().split(":");
    String GuaranteeCostId = splitBusinessKey[splitBusinessKey.length-1];

    // 2. 查询担保费用单
    IBillDO guaranteeCost = queryBizById("grm.guaranteecost.GuaranteeCost", GuaranteeCostId, source);

    // 3. 查询担保合同
    Long guaranteeContractId = (Long) guaranteeCost.getAttrValue("guaranteeContract");
    IBillDO guaranteeContract = queryBizById("grm.guaranteecontract.GuaranteeContract", guaranteeContractId, source);

    // 4. 获取担保方向
    Short guaranteeDirection = (Short) guaranteeContract.getAttrValue("guaranteeDirection");

    // 5. 构建参数并保存发票
    JSONObject body = buildParams(guaranteeCost, guaranteeContract, guaranteeDirection);
    JSONObject result = save(guaranteeDirection, body);

    return StringResponseUtil.success();
}

private JSONObject save(Short guaranteeDirection, JSONObject body) {
    // 根据担保方向调用不同接口
    String path = guaranteeDirection == 1 ? SAVE_PAYABLE_PATH : SAVE_RECEIVABLE_PATH;
    ResponseEntity<JSONObject> result = restTemplate.exchange(
        String.format("%s%s?access_token=%s", domainUrl, path, accessToken),
        HttpMethod.POST,
        new HttpEntity<>(body),
        JSONObject.class
    );
    return result.getBody();
}
```

---

## Listener 禁止包含复杂业务逻辑

- ✅ 正确示例：Listener 调用 Service 层方法，由 Service 处理业务逻辑
- ❌ 错误示例：在 Listener 中编写复杂的业务逻辑

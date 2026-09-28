# 付款单推送规范

## 场景说明

本规范适用于将 BIP 付款单推送到第三方财务系统，以及接收第三方系统回写付款状态的场景。

---

## 推送触发方式

| 触发方式 | 说明 |
|---------|------|
| 审批通过后自动推送 | 付款单审批通过后自动触发推送 |
| 手动推送 | 用户手动点击推送按钮 |
| 定时任务推送 | 定时任务扫描未推送的付款单 |

---

## 付款单推送流程

```
1. 查询 BIP 付款单 → 2. 解析付款单明细 → 3. 处理银行账户信息 → 4. 字段映射转换 → 5. 调用三方接口 → 6. 结果回写
```

### Step 1: 查询 BIP 付款单数据

> **MCP技能调用**：`getOpenApiCall`
- 接口路径：/yonbip/ap/payment/detail
- 返回：BIP付款单 JSONObject 对象

### Step 2: 解析付款单明细

| 信息类型 | BIP路径 | 说明 |
|---------|---------|------|
| 主表信息 | paymentMain | 付款单主表信息 |
| 明细列表 | paymentDetails | 付款单明细 JSONArray |

### Step 3: 处理银行账户信息

| 信息类型 | 说明 | MCP调用 |
|---------|------|---------|
| 供应商银行账户 | 供应商档案的银行账户信息 | getIBillQueryRepository |
| 组织银行账户 | 组织档案的银行账户信息 | getIBillQueryRepository |

### Step 4: 字段映射转换

> **⚠️ 重要**：以下字段映射为示例，实际根据外部 Excel/需求文档动态生成

| BIP 字段 | 第三方字段 | 数据类型 | 说明 |
|---------|-----------|---------|------|
| payment_code | payment_code | String | 付款单号 |
| payment_amount | amount | BigDecimal | 付款金额 |
| payee_account | bank_account | String | 收款账户 |
| payee_name | account_name | String | 收款人名称 |
| payee_bank | bank_name | String | 开户银行 |
| payment_date | payment_date | Date | 付款日期 |
| currency | currency | String | 币种 |

### Step 5: 调用第三方接口

- 使用 HTTP/JSON 方式调用第三方财务系统接口
- 接口地址从配置中动态读取

### Step 6: 结果回写

- 使用 IYmsJdbcApi 更新 BIP 付款单推送状态
- 记录推送时间、推送结果、错误信息

---

## 数据校验规则

| 校验规则 | 说明 |
|---------|------|
| 付款单号必填 | payment_code 不能为空 |
| 付款金额必须大于0 | amount > 0 |
| 收款账户必填 | payee_account 不能为空 |

---

## 状态回写场景

### 接口定义

```
POST /payment/statusCallback
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| paymentCode | String | 是 | 付款单号 |
| status | String | 是 | 付款状态 |
| errorCode | String | 否 | 错误码 |
| errorMessage | String | 否 | 错误信息 |

### 状态码说明

| 状态码 | 说明 |
|--------|------|
| SUCCESS | 付款成功 |
| FAILED | 付款失败 |
| PROCESSING | 处理中 |

---

## Service 层实现

```java
@Service
public class PaymentPushServiceImpl implements PaymentPushService {
    
    @Autowired
    private IYmsJdbcApi jdbcApi;
    
    @Override
    public Map<String, Object> pushPayment(String paymentId) {
        // 1. 查询 BIP 付款单（使用 getOpenApiCall）
        JSONObject paymentData = queryPaymentData(paymentId);
        
        // 2. 解析付款单明细
        JSONObject paymentMain = paymentData.getJSONObject("paymentMain");
        JSONArray paymentDetails = paymentData.getJSONArray("paymentDetails");
        
        // 3. 处理银行账户信息（使用 getIBillQueryRepository）
        String supplierBankAccount = querySupplierBankAccount(paymentMain.getString("supplierId"));
        String orgBankAccount = queryOrgBankAccount(paymentMain.getString("orgId"));
        
        // 4. 字段映射转换
        JSONObject mappedData = fieldMapper.map(paymentMain, paymentDetails, supplierBankAccount, orgBankAccount);
        
        // 5. 调用第三方接口
        Map<String, Object> response = thirdPartyService.push(mappedData);
        
        // 6. 结果回写（使用 IYmsJdbcApi）
        writeBackPushStatus(paymentId, response);
        
        return response;
    }
    
    @Override
    public Map<String, Object> handleStatusCallback(JSONObject callbackData) {
        // 1. 解析回调数据
        String paymentCode = callbackData.getString("paymentCode");
        String status = callbackData.getString("status");
        
        // 2. 更新 BIP 付款单状态（使用 IYmsJdbcApi）
        String sql = "UPDATE payment SET push_status = ?, push_time = ? WHERE payment_code = ?";
        jdbcApi.execute(sql, status, new Date(), paymentCode);
        
        return Map.of("success", true, "message", "状态回写成功");
    }
}
```

---

## 核心组件清单

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| PaymentPushRequest | 入参 DTO | Model |
| PaymentQueryService | BIP 查询服务接口 | Service |
| PaymentOpenApiQueryService | BIP 查询服务实现 | Service |
| PaymentFieldMapper | 字段映射器 | Service |
| PaymentDetailProcessor | 付款单明细处理器 | Service |
| ThirdPartyAuthService | 三方鉴权接口 | Service |
| ThirdPartyPaymentService | 三方付款单接口 | Service |
| PaymentApiResponse | 响应 DTO | Model |
| ResponseParser | 响应解析器 | Service |
| PaymentResultWriteService | 结果回写服务 | Service |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| PUSH001 | 付款单不存在 | 返回错误，不执行推送 |
| PUSH002 | 金额不合法 | 返回错误，不执行推送 |
| PUSH003 | 推送失败 | 记录错误日志，更新推送状态为失败 |
| PUSH004 | 状态回写失败 | 记录日志，不影响主流程 |

# 金蝶发票推送规范

## 场景说明

本规范适用于将 BIP 应收发票推送到金蝶税务云系统，支持蓝票开具、红票冲销、状态检查和回调接收。

---

## 核心能力

1. **发票推送**：将应收发票推送到金蝶税务云系统
2. **状态检查**：检查发票在金蝶系统中的开具状态
3. **回调接收**：接收金蝶系统回传的开票结果
4. **红冲处理**：处理金蝶发票红冲操作

---

## 发票推送流程

```
1. 查询 BIP 应收发票 → 2. 判断发票类型 → 3. 构建推送数据 → 4. 调用金蝶接口 → 5. 接收回调结果
```

### Step 1: 查询 BIP 应收发票数据

> **MCP技能调用**：`getOpenApiCall`
- 接口路径：/yonbip/EFI/receivable/detail
- 返回：BIP应收发票 JSONObject 对象

### Step 2: 判断发票类型

| 发票类型 | invoiceProperty | 说明 |
|---------|----------------|------|
| 蓝票(正票) | 1 | 正常开具发票 |
| 红票(红冲) | 0 | 红冲发票 |

### Step 3: 构建推送数据

根据发票类型构建不同的推送数据结构：

**蓝票数据结构**：
```json
{
  "invoiceType": "normal",
  "invoiceCode": "发票代码",
  "invoiceNo": "发票号码",
  "amount": "金额",
  "taxAmount": "税额",
  "totalAmount": "价税合计",
  "buyerName": "购方名称",
  "buyerTaxNo": "购方税号",
  "sellerName": "销方名称",
  "sellerTaxNo": "销方税号",
  "items": [
    {
      "itemName": "项目名称",
      "amount": "金额",
      "taxRate": "税率"
    }
  ]
}
```

**红票数据结构**：
```json
{
  "invoiceType": "red",
  "originalInvoiceCode": "原发票代码",
  "originalInvoiceNo": "原发票号码",
  "redReason": "红冲原因",
  "amount": "金额",
  "taxAmount": "税额",
  "totalAmount": "价税合计"
}
```

### Step 4: 调用金蝶税务云接口

- 使用 HTTP/JSON 方式调用金蝶税务云 API
- 支持 AES 加密解密
- 支持签名验证

**加密流程**：
1. 将请求数据转换为 JSON 字符串
2. 使用 AES 算法加密
3. 对加密后的数据进行 Base64 编码
4. 生成签名

**解密流程**：
1. 对响应数据进行 Base64 解码
2. 使用 AES 算法解密
3. 验证签名
4. 解析 JSON 数据

### Step 5: 接收回调结果

**成功判断**：
- 存在发票代码和发票号码
- errorCode 为空或为 "0"

**失败判断**：
- errorCode 不为空且不为 "0"
- 错误信息不为空

---

## 状态检查流程

### 接口定义

```
POST /invoice/checkStatus
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| invoiceId | String | 是 | 发票ID |

**响应参数**：

| 参数名称 | 类型 | 说明 |
|---------|------|------|
| status | String | 开票状态 |
| invoiceCode | String | 发票代码 |
| invoiceNo | String | 发票号码 |
| errorMessage | String | 错误信息 |

### 状态码说明

| 状态码 | 说明 |
|--------|------|
| SUCCESS | 开票成功 |
| FAILED | 开票失败 |
| PROCESSING | 处理中 |

---

## 回调接收流程

### 接口定义

```
POST /invoice/callback
```

**请求参数**：

| 参数名称 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| invoiceId | String | 是 | 发票ID |
| invoiceCode | String | 否 | 发票代码 |
| invoiceNo | String | 否 | 发票号码 |
| errorCode | String | 否 | 错误码 |
| errorMessage | String | 否 | 错误信息 |

### 回调处理逻辑

1. 解析回调数据
2. 判断开票是否成功
3. 更新 BIP 发票状态（使用 IYmsJdbcApi）
4. 记录开票结果

---

## Service 层实现

```java
@Service
public class KdInvoicePushServiceImpl implements KdInvoicePushService {
    
    @Autowired
    private IYmsJdbcApi jdbcApi;
    
    @Autowired
    private AESEncryptUtil aesEncryptUtil;
    
    @Override
    public Map<String, Object> pushInvoice(String invoiceId) {
        // 1. 查询 BIP 应收发票（使用 getOpenApiCall）
        JSONObject invoiceData = queryInvoiceData(invoiceId);
        
        // 2. 判断发票类型
        int invoiceProperty = invoiceData.getIntValue("invoiceProperty");
        
        // 3. 构建推送数据
        JSONObject pushData;
        if (invoiceProperty == 1) {
            // 蓝票
            pushData = buildNormalInvoiceData(invoiceData);
        } else {
            // 红票
            pushData = buildRedInvoiceData(invoiceData);
        }
        
        // 4. 加密数据
        String encryptedData = aesEncryptUtil.encrypt(pushData.toJSONString());
        
        // 5. 调用金蝶接口
        Map<String, Object> response = kdTaxCloudService.pushInvoice(encryptedData);
        
        // 6. 解密响应
        String decryptedResponse = aesEncryptUtil.decrypt(response.get("data").toString());
        JSONObject result = JSON.parseObject(decryptedResponse);
        
        // 7. 更新发票状态（使用 IYmsJdbcApi）
        updateInvoiceStatus(invoiceId, result);
        
        return response;
    }
    
    @Override
    public Map<String, Object> checkInvoiceStatus(String invoiceId) {
        // 1. 调用金蝶状态查询接口
        Map<String, Object> response = kdTaxCloudService.checkStatus(invoiceId);
        
        // 2. 解析状态
        String status = parseStatus(response);
        
        return Map.of("status", status, "data", response);
    }
    
    @Override
    public Map<String, Object> handleCallback(JSONObject callbackData) {
        // 1. 解析回调数据
        String invoiceId = callbackData.getString("invoiceId");
        String invoiceCode = callbackData.getString("invoiceCode");
        String invoiceNo = callbackData.getString("invoiceNo");
        String errorCode = callbackData.getString("errorCode");
        
        // 2. 判断开票是否成功
        boolean success = StringUtils.isNotEmpty(invoiceCode) && StringUtils.isNotEmpty(invoiceNo);
        
        // 3. 更新 BIP 发票状态（使用 IYmsJdbcApi）
        String sql = "UPDATE receivable_invoice SET invoice_code = ?, invoice_no = ?, push_status = ?, error_code = ? WHERE id = ?";
        jdbcApi.execute(sql, invoiceCode, invoiceNo, success ? "SUCCESS" : "FAILED", errorCode, invoiceId);
        
        return Map.of("success", true, "message", "回调处理成功");
    }
    
    private JSONObject buildNormalInvoiceData(JSONObject invoiceData) {
        // 构建蓝票数据
        JSONObject data = new JSONObject();
        data.put("invoiceType", "normal");
        data.put("amount", invoiceData.getBigDecimal("amount"));
        data.put("taxAmount", invoiceData.getBigDecimal("taxAmount"));
        // ... 其他字段映射
        return data;
    }
    
    private JSONObject buildRedInvoiceData(JSONObject invoiceData) {
        // 构建红票数据
        JSONObject data = new JSONObject();
        data.put("invoiceType", "red");
        data.put("originalInvoiceCode", invoiceData.getString("originalInvoiceCode"));
        data.put("originalInvoiceNo", invoiceData.getString("originalInvoiceNo"));
        // ... 其他字段映射
        return data;
    }
}
```

---

## 核心组件清单

| 组件 | 说明 | MVC 层 |
|------|------|--------|
| KdInvoicePushRequest | 入参 DTO | Model |
| InvoiceQueryService | BIP 查询服务接口 | Service |
| InvoiceOpenApiQueryService | BIP 查询服务实现 | Service |
| InvoiceDataBuilder | 发票数据构建器 | Service |
| AESEncryptUtil | AES 加密解密工具 | Util |
| KdTaxCloudService | 金蝶税务云接口 | Service |
| InvoiceCallbackHandler | 回调处理器 | Service |
| InvoiceStatusWriter | 状态回写服务 | Service |

---

## 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| KD001 | 发票不存在 | 返回错误，不执行推送 |
| KD002 | 发票类型不支持 | 返回错误，不执行推送 |
| KD003 | 加密失败 | 返回错误，记录日志 |
| KD004 | 推送失败 | 记录错误日志，更新推送状态为失败 |
| KD005 | 回调处理失败 | 记录日志，不影响主流程 |

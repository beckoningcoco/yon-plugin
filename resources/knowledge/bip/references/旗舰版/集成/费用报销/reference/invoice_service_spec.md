# 发票服务详细规范

## 一、OCR识别详细流程

### 1.1 请求构造

```java
// 1. 获取纳税人识别号
String taxNum = getTaxNum();  // 从用户信息获取当前企业纳税人识别号

// 2. 构造请求参数
JSONObject json = new JSONObject();
json.put("fileBase64", fileThridVo.getContent());  // 文件base64编码
json.put("fileName", fileThridVo.getFile_name());   // 文件名（含扩展名）
json.put("taxNum", taxNum);                          // 纳税人识别号

// 3. 构造发送数据
JSONObject sendJson = new JSONObject();
sendJson.put("SpanId", UUID.randomUUID().toString());  // 请求唯一ID
sendJson.put("ZipCode", "0");                           // 是否压缩(0-不压缩)
sendJson.put("UserCode", taxNum);                       // 企业统一社会代码
sendJson.put("InterfaceCode", "recognizeBill");         // OCR识别操作码
sendJson.put("DataGram", base64(json.toJSONString()));  // 业务数据Base64编码

// 4. 发送请求
Map<String, String> header = new HashMap<>();
header.put("Operation_Code", ymsConfig.getBIP_HX_ESB_CODE());
String result = HttpClientUtil.doPostWithHeader(header, ymsConfig.getBIP_HX_OCR_INVOICES(), sendJson.toJSONString());
```

### 1.2 OCR识别请求示例

```json
POST {航信OCR服务地址}
Header: Operation_Code: {ESB编码}

{
  "SpanId": "550e8400-e29b-41d4-a716-446655440000",
  "ZipCode": "0",
  "UserCode": "91110000MA01XXXXXX",
  "InterfaceCode": "recognizeBill",
  "DataGram": "eyJmaWxlQmFzZTY0IjoiLi4uIiwiZmlsZU5hbWUiOiJpbnZvaWNlLnBuZyIsInRheE51bSI6IjkxMTAwMDBNQTAxWFhYWFgifQ=="
}
```

### 1.3 OCR识别响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "invoiceLine": "s",
      "invoiceType": "增值税专用发票",
      "invoiceCode": "150002190030",
      "invoiceNumber": "06787586",
      "invoiceTime": "2024-04-15",
      "taxFreeAmountTotal": "10000.00",
      "taxTotal": "1300.00",
      "taxAmountTotal": "11300.00",
      "buyerName": "购买方名称",
      "buyerTaxnum": "购买方纳税人识别号",
      "buyerBankAccount": "购买方开户行及账号",
      "buyerAddressTel": "购买方地址电话",
      "sellerName": "销售方名称",
      "sellerTaxnum": "销售方纳税人识别号",
      "sellerAddressTel": "销售方地址电话",
      "sellerBankAccount": "销售方开户行及账号",
      "details": [
        {
          "goodsName": "品名",
          "specType": "规格型号",
          "goodsUnit": "单位",
          "goodsNum": 10,
          "goodsPrice": 1000.00,
          "taxFreeAmount": 10000.00,
          "tax": 1300.00,
          "taxrate": "13%"
        }
      ]
    }
  ],
  "taskId": "task-550e8400"
}
```

### 1.4 OCR结果路由

根据响应中 `invoiceLine` 字段路由到对应工厂类：

| invoiceLine | 工厂Bean名 | 实现类 | 说明 |
|-------------|-----------|--------|------|
| s/p/c/b/r | VatTransTools | VatTransInvoiceFactoryImpl | 增值税类发票 |
| bs/pc/es/ec/hk | VatTransTools | VatTransInvoiceFactoryImpl | 数电票（增值税类处理） |
| j | motorVehicleTransTools | MotorVehicleFactoryImpl | 机动车发票 |
| u/du/su | usedMotorTransTools | UsedMotorVehicleFactoryImpl | 二手车发票 |
| hc | trainTransTools | TrainInvoiceFactoryImpl | 火车票 |
| fj/lj | airTransTools | AirInvoiceFactoryImpl | 机票行程单 |
| flight_itinerary | (特殊) | AirInvoiceImageFactoryImpl | 数电票行程单(PDF) |
| qc | busTransTools | BusTicketFactoryImpl | 汽车票 |
| cz | taxiTransTools | TaxiFactoryImpl | 出租车票 |
| de | quotaTransTools | QuotaFactoryImpl | 定额发票 |
| tx | tollTransTools | TollInvoiceFactoryImpl | 通行费 |
| jd | machineTransTools | MachineInvoiceFactoryImpl | 通用机打发票 |
| gj | gjdpTransTools | GjdpFactoryImpl | 国际发票 |

---

## 二、发票验真详细流程

### 2.1 验真参数选择逻辑

根据发票类型(baiwang编码)选择 `optionField`：

| baiwang编码 | optionField取值 | 说明 |
|------------|----------------|------|
| 04, 10, 11, 14 | 校验码后6位 | 普通发票类 |
| 01, 03, 08, 15, 85, 86 | 不含税金额 | 专用发票类 |
| 其他(含数电票、交通票) | 价税合计 | 其他类型 |

### 2.2 验真请求构造

```java
// 1. 获取BIP发票信息
InvoiceInfo invoiceInfo = queryInvoiceInfo(invoiceNo);

// 2. 根据发票类型确定验真方式
String optionField = determineOptionField(invoiceInfo.getInvoiceType());

// 3. 构造请求参数
JSONObject json = new JSONObject();
json.put("invoiceNo", invoiceInfo.getInvoiceNumber());    // 发票号码
json.put("invoiceCode", invoiceInfo.getInvoiceCode());    // 发票代码
json.put("taxNo", taxNum);                                // 纳税人识别号
json.put("invoiceDate", invoiceInfo.getBillingDate());    // 开票日期 yyyy-MM-dd
json.put("optionField", optionField);                     // 验真参数

// 4. 构造发送数据
JSONObject sendJson = new JSONObject();
sendJson.put("SpanId", UUID.randomUUID().toString());
sendJson.put("ZipCode", "0");
sendJson.put("UserCode", taxNum);
sendJson.put("InterfaceCode", "invoiceCheck");  // 验真操作码
sendJson.put("DataGram", base64(json.toJSONString()));
```

### 2.3 验真请求示例

```json
POST {航信OCR服务地址}
Header: Operation_Code: {ESB编码}

{
  "SpanId": "660e8400-e29b-41d4-a716-446655440001",
  "ZipCode": "0",
  "UserCode": "91110000MA01XXXXXX",
  "InterfaceCode": "invoiceCheck",
  "DataGram": "eyJpbnZvaWNlTm8iOiIwNjc4NzU4NiIsImludm9pY2VDb2RlIjoiMTUwMDAyMTkwMDMwIiwidGF4Tm8iOiI5MTEwMDAwTUEwMVhYWFhYIiwiaW52b2ljZURhdGUiOiIyMDI0LTA0LTE1Iiwib3B0aW9uRmllbGQiOiIxMzAwLjAwIn0="
}
```

### 2.4 验真响应示例

**增值税发票验真成功：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "invoiceKind": "01",
    "invoiceCode": "150002190030",
    "invoiceNo": "06787586",
    "invoiceDate": "2024-04-15",
    "exTaxAmount": "10000.00",
    "taxAmount": "1300.00",
    "sumAmount": "11300.00",
    "payerName": "购买方名称",
    "payerTaxNo": "购买方纳税人识别号",
    "checkCode": "校验码",
    "invalidFlag": "3",
    "itemInfos": [
      {
        "name": "品名",
        "spec": "规格型号",
        "unit": "单位",
        "quantity": "10",
        "price": "1000.00",
        "amount": "10000.00",
        "taxRate": "13%",
        "tax": "1300.00"
      }
    ]
  }
}
```

**火车票验真成功：**
```json
{
  "invoiceCode": "RailwayCode123",
  "invoiceNo": "TicketNo456",
  "invoiceDate": "2024-04-15",
  "sumAmount": "553.00",
  "exTaxAmount": "553.00",
  "taxAmount": "0.00",
  "payerName": "乘客姓名",
  "payerTaxNo": "证件号码",
  "railwayTicketItems": [
    {
      "traveller": "乘客姓名",
      "departure": "北京",
      "destination": "上海",
      "toolsNumber": "G101",
      "seat": "二等座",
      "seatType": "二等座",
      "cardNo": "证件号码",
      "boardingDate": "2024-04-15",
      "departureTime": "09:30",
      "carriage": "08车",
      "ticketNo": "座位号"
    }
  ]
}
```

**机票行程单验真成功：**
```json
{
  "invoiceCode": "AirCode123",
  "invoiceNo": "TicketNo456",
  "invoiceDate": "2024-04-15",
  "sumAmount": "1200.00",
  "exTaxAmount": "1132.08",
  "taxAmount": "67.92",
  "payerName": "乘客姓名",
  "payerTaxNo": "证件号码",
  "airTicketItems": [
    {
      "passengerName": "乘客姓名",
      "ticketNum": "票号",
      "valididNum": "证件号",
      "ticketDetailItems": [
        {
          "departureStation": "北京",
          "destinationStation": "上海",
          "flight": "CA1234",
          "carrier": "国航",
          "seatClass": "经济舱",
          "carrierDate": "2024-04-15",
          "departureTime": "09:30"
        }
      ]
    }
  ]
}
```

### 2.5 验真结果处理

```
1. code=0 → 验真成功
   - invalidFlag="3" → 正常发票
   - invalidFlag="1" → 已作废
   - invalidFlag="2" → 已红冲
2. code=-1 → 参数错误
3. code=-4 → 服务异常，建议重试
4. 验真成功后可选操作：入池（将发票信息写入BIP发票台账）
```

### 2.6 错误码对照

| 航信code | 含义 | BIP处理方式 |
|---------|------|------------|
| 0 | 成功 | 返回验真结果 |
| -1 | 参数错误 | 提示用户检查发票信息 |
| -2 | 签名错误 | 检查认证配置 |
| -3 | 权限不足 | 检查服务授权 |
| -4 | 服务异常 | 可重试(最多3次) |
| -5 | 请求超时 | 可重试(最多3次) |
| E001 | 处理失败 | 记录日志，人工处理 |

---

## 三、OCR异步回调处理

### 3.1 异步回调说明

OCR识别支持异步回调模式：
- 请求时在 `DataGram` 中传入 `callbackUrl`
- 识别完成后航信系统POST结果到回调地址
- 回调URL配置：`ymsConfig.BIP_HX_CALLBACK_URL`

### 3.2 回调处理逻辑

```
1. 接收航信回调POST请求
2. 解析DataGram(Base64解码)
3. 根据invoiceLine路由到工厂类转换
4. 存储识别结果
5. 返回成功响应
```

---

## 四、BIP发票台账查询

### 4.1 查询已入库发票

```java
// 构造查询URL
String url = sysUrlConstants.BIP_URL_REALNAME +
    "/iuap-api-gateway/yonbip/znbz/rbsm/api/billcommon/queryInvoices?access_token=" +
    accessToken.getAccessToken();

// 构造查询参数
JSONObject jsonSend = new JSONObject();
jsonSend.put("pageIndex", 1);
jsonSend.put("pageSize", 1000);
jsonSend.put("vinvoiceno", invoiceNoList);  // 发票号码列表(逗号分隔)

// 发送查询
String rsp = HttpClientUtil.doPost(url, jsonSend.toJSONString());
```

---

## 五、发票入池流程

```
1. OCR识别或验真成功后
2. 检查发票是否已入池(通过invoiceNo+invoiceCode查询)
3. 如未入池，调用BIP发票保存API
4. 写入发票台账，关联到报销单
5. 更新发票状态为"已入池"
```

---

## 六、注意事项

1. **纳税人识别号**：每个请求都需要从用户信息中获取当前企业的纳税人识别号
2. **Token验证**：所有BIP接口都需要Header中携带有效的access_token
3. **Base64编码**：请求数据需要使用Base64编码
4. **日期格式**：开票日期格式为 `yyyy-MM-dd`
5. **金额精度**：金额保留两位小数
6. **重试策略**：航信服务异常(-4)或超时(-5)时，最多重试3次，间隔5秒
7. **并发控制**：同一发票避免同时发起OCR和验真请求

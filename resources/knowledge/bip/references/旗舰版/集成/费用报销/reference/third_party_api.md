# 三方系统API说明

## 航信OCR/验真服务

### 基础配置

通过YMSConfig获取配置:

```java
@Autowired
private YMSConfig ymsConfig;

// 航信OCR服务地址
ymsConfig.BIP_HX_OCR_INVOICES

// 回调地址
ymsConfig.BIP_HX_CALLBACK_URL
```

### 请求格式

#### OCR识别请求

```java
// 构造请求参数
JSONObject json = new JSONObject();
json.put("fileBase64", fileThridVo.getContent());  // 文件base64
json.put("fileName", fileThridVo.getFile_name());    // 文件名
json.put("taxNum", taxNum);                          // 纳税人识别号

// 构造发送数据
JSONObject sendJson = new JSONObject();
sendJson.put("SpanId", UUID.randomUUID().toString());  // 数据提交ID
sendJson.put("ZipCode", "0");                           // 是否压缩(0-不压缩)
sendJson.put("UserCode", taxNum);                       // 企业统一社会代码
sendJson.put("InterfaceCode", "recognizeBill");       // 接口操作编码
//   - recognizeBill: OCR识别
//   - invoiceCheck: 发票验真
sendJson.put("DataGram", base64(json.toJSONString()));   // 数据内容BASE64编码
```

#### 发票验真请求

```java
// 构造请求参数
JSONObject json = new JSONObject();
json.put("invoiceNo", invoiceNumber);    // 发票号码
json.put("invoiceCode", invoiceCode);      // 发票代码
json.put("taxNo", taxNum);                // 纳税人识别号
json.put("invoiceDate", billingDate);    // 开票日期
json.put("optionField", optionField);       // 验真参数(根据类型选择)

// 构造发送数据
JSONObject sendJson = new JSONObject();
sendJson.put("SpanId", UUID.randomUUID().toString());
sendJson.put("ZipCode", "0");
sendJson.put("UserCode", taxNum);
sendJson.put("InterfaceCode", "invoiceCheck");  // 发票验真
sendJson.put("DataGram", base64(json.toJSONString()));
```

### 响应格式

#### OCR识别响应

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
            "sellerName": "销售方名称",
            "sellerTaxnum": "销售方纳税人识别号",
            "details": [...]
        }
    ],
    "taskId": "task-id"
}
```

#### 发票验真响应

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
        "itemInfos": [...]
    }
}
```

### 特殊发票验真响应

#### 火车票验真响应

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

#### 机票行程单验真响应

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

## BIP发票账单查询

### 查询发票信息接口

```java
// 调用账单查询接口
String url = sysUrlConstants.BIP_URL_REALNAME +
    "/iuap-api-gateway/yonbip/znbz/rbsm/api/billcommon/queryInvoices?access_token=" +
    accessToken.getAccessToken();

// 请求参数
JSONObject jsonSend = new JSONObject();
jsonSend.put("pageIndex", 1);
jsonSend.put("pageSize", 1000);
jsonSend.put("vinvoiceno", invoiceNoList);  // 发票号码列表
jsonSend.put("simpleVOs", [...]);          // 查询条件

// 调用
String rsp = HttpClientUtil.doPost(url, jsonSend.toJSONString());
Map result = JSONObject.parseObject(rsp, Map.class);
```

## HTTP调用封装

### HttpClientUtil

```java
public class HttpClientUtil {

    // POST请求带Header
    public static String doPostWithHeader(Map<String, String> header, String url, String json)

    // POST请求
    public static String doPost(String url, String json)

    // GET请求
    public static String doGet(String url)
}
```

### 常用Header设置

```java
Map<String, String> header = new HashMap<>();
header.put("Operation_Code", ymsConfig.getBIP_HX_ESB_CODE());
```

## Token获取

### AccessToken

```java
@Autowired
private AccessToken accessToken;

// 获取access_token
String token = accessToken.getAccessToken();
```

## Base64编码

```java
public static String base64(String str) throws UnsupportedEncodingException {
    byte[] strByte = str.getBytes("UTF-8");
    return java.util.Base64.getEncoder().encodeToString(strByte);
}
```

## 错误码处理

| code | message | 说明 |
|------|---------|------|
| 0 | success | 成功 |
| -1 | 参数错误 | 请求参数不正确 |
| -2 | 签名错误 | 签名验证失败 |
| -3 | 权限不足 | 没有权限 |
| -4 | 服务异常 | 第三方服务异常 |
| -5 | 请求超时 | 请求超时 |
| E001 | 处理失败 | 处理失败 |

## 注意事项

1. **纳税人识别号**: 每个请求都需要从用户信息中获取当前企业的纳税人识别号
2. **Token验证**: 所有接口都需要Header中携带有效的token
3. **Base64编码**: 请求数据需要使用Base64编码
4. **日期格式**: 开票日期格式为yyyy-MM-dd
5. **金额精度**: 金额保留两位小数
6. **异步回调**: OCR识别支持异步回调，结果通过callback返回
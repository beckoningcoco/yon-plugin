# 销售发货WMS集成业务场景规范

## 业务语义

销售发货WMS集成是指基于BIP系统中已审核的销售发货单数据，向WMS（仓库管理系统）发起发货数据推送请求的标准业务流程。

### 业务目标

将BIP销售发货单的完整业务数据，通过标准化的字段映射与接口调用，推送至WMS系统进行仓库作业处理，实现销售出库的自动化管理。

### 前置条件

1. BIP销售发货单已审核通过
2. 发货单未推送至WMS或需要重新推送
3. 库存组织、仓库等基础数据已同步至WMS

## 核心流程

```
销售发货单ID ──▶ 查询发货单详情 ──▶ 字段映射转换 ──▶ 调用WMS接口 ──▶ 解析回执 ──▶ 回写状态
```

## 关键字段映射

### 主表基础字段

| BIP字段 | 目标字段 | 转换说明 | 是否必填 |
|---------|---------|---------|---------|
| code | docNo | 直接映射 | 是 |
| id | docHeaderId | 直接映射 | 是 |
| stockOrgId.code | customerId | 库存组织编码 | 是 |
| transactionTypeId.code | bustype | 交易类型编码 | 是 |
| agentId.code | consigneeId | 客户编码 | 是 |
| agentId.name | consigneeName | 客户名称 | 是 |
| receiveAddress | address | 收货地址 | 否 |
| receiverCustId.code | contacts | 收货联系人 | 否 |
| receiveMobile | phoneNo | 移动电话（优先） | 否 |
| receiveTelePhone | phoneNo | 固定电话（备选） | 否 |
| creator | udf07 | 创建人 | 否 |
| creatorId.department.name | udf06 | 创建人部门 | 否 |
| vouchdate | createDate | 日期格式转换 | 是 |
| shippingMemo | notes | 发货备注 | 否 |
| receievInvoiceEmail | email | 发票邮箱 | 否 |



### 交易类型映射

| BIP transactionTypeId.code | 目标 bustype | 含义 |
|---------------------------|-------------|------|
| SHIP001 | A30001 | 普通销售 |
| SHIP002 | A30002 | 委托代销 |
| SHIP003 | A30003 | 分期收款销售 |

### 明细字段

| BIP字段 | 目标字段 | 精度 | 说明 |
|---------|---------|------|------|
| lineno | lineNo | - | 行号 |
| id | docLineId | - | 明细ID |
| orderNo | salesOrderNo | - | 销售订单号 |
| orderDetailLineno | salesOrderLineNo | - | 销售订单行号 |
| productId.code | sku | - | 物料编码 |
| productId.name | skuDesc | - | 物料描述 |
| qty | qty | 6位 | 数量 |
| masterUnitId.code | uom | - | 单位 |
| stockId.code | ERPoutSublibrary | - | ERP发货仓库 |
| stockId.code | attribute6 | - | ERP发货仓库（备用） |
| productDate | attribute1 | - | 生产日期 |
| batchNo | attribute4 | - | 批次号 |
| reserveid.code | attribute12 | - | 跟踪号 |
| define3 | attribute14 | - | 颜色 |
| sactCode | udf01 | - | 销售合同编码 |
| sactCode | udf05 | - | 销售合同号（备用） |
| projectId.code | attribute18 | - | 项目编码 |
| remark | attribute21 | - | 备注 |
| remark | notes | - | 备注（备用） |



## 核心代码模板



### 1. 字段映射转换

```java
/**
 * 将BIP销售发货单转换为WMS DTO
 */
public SaleDeliveryDTO convertToWMSDTO(Map<String, Object> bipData) {
    SaleDeliveryDTO dto = new SaleDeliveryDTO();
    
    // 基础字段
    dto.setDocNo((String) bipData.get("docNo"));
    dto.setDocHeaderId((String) bipData.get("docHeaderId"));
    dto.setCustomerId((String) bipData.get("customerId"));
    dto.setOrderType((String) bipData.get("orderType"));
    dto.setCreateSource((String) bipData.get("createSource"));
    dto.setBustype((String) bipData.get("bustype"));
    
    // 客户信息
    dto.setConsigneeId((String) bipData.get("consigneeId"));
    dto.setConsigneeName((String) bipData.get("consigneeName"));
    dto.setAddress((String) bipData.get("address"));
    dto.setContacts((String) bipData.get("contacts"));
    dto.setPhoneNo((String) bipData.get("phoneNo"));
    
    // 其他信息
    dto.setUdf06((String) bipData.get("udf06"));
    dto.setUdf07((String) bipData.get("udf07"));
    dto.setEmail((String) bipData.get("email"));
    dto.setNotes((String) bipData.get("notes"));
    
    // 特征组字段（动态获取）
    dto.setUdf05((String) bipData.get("udf05"));
    dto.setUdf08((String) bipData.get("udf08"));
    dto.setUdf09((String) bipData.get("udf09"));
    dto.setUdf10((String) bipData.get("udf10"));
    
    // 明细转换
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> details = (List<Map<String, Object>>) bipData.get("details");
    if (details != null) {
        List<SaleDeliveryDetailDTO> itemList = new ArrayList<>();
        for (Map<String, Object> detail : details) {
            itemList.add(convertDetail(detail));
        }
        dto.setItems(itemList);
    }
    
    return dto;
}

/**
 * 转换明细
 */
private SaleDeliveryDetailDTO convertDetail(Map<String, Object> detail) {
    SaleDeliveryDetailDTO dto = new SaleDeliveryDetailDTO();
    
    dto.setLineNo((Integer) detail.get("lineNo"));
    dto.setDocLineId((String) detail.get("docLineId"));
    dto.setSalesOrderNo((String) detail.get("salesOrderNo"));
    dto.setSalesOrderLineNo((String) detail.get("salesOrderLineNo"));
    dto.setSku((String) detail.get("sku"));
    dto.setSkuDesc((String) detail.get("skuDesc"));
    
    // 数值精度处理
    dto.setQty(convertDecimal(detail.get("qty"), 6));
    dto.setUom((String) detail.get("uom"));
    
    dto.setERPoutSublibrary((String) detail.get("ERPoutSublibrary"));
    dto.setAttribute1((String) detail.get("attribute1"));
    dto.setAttribute4((String) detail.get("attribute4"));
    dto.setAttribute12((String) detail.get("attribute12"));
    dto.setAttribute14((String) detail.get("attribute14"));
    dto.setAttribute18((String) detail.get("attribute18"));
    dto.setAttribute21((String) detail.get("attribute21"));
    
    // 特征组字段（动态获取）
    dto.setAttribute5((String) detail.get("attribute5"));
    dto.setAttribute11((String) detail.get("attribute11"));
    dto.setAttribute13((String) detail.get("attribute13"));
    dto.setAttribute15((String) detail.get("attribute15"));
    dto.setAttribute16((String) detail.get("attribute16"));
    dto.setAttribute17((String) detail.get("attribute17"));
    dto.setAttribute19((String) detail.get("attribute19"));
    
    dto.setUdf01((String) detail.get("udf01"));
    dto.setUdf02((String) detail.get("udf02"));
    dto.setUdf03((String) detail.get("udf03"));
    dto.setUdf04((String) detail.get("udf04"));
    dto.setUdf05((String) detail.get("udf05"));
    
    dto.setNotes((String) detail.get("notes"));
    
    return dto;
}

/**
 * 交易类型映射
 */
private String mapTransactionType(String bipType) {
    if (bipType == null) {
        return bipType;
    }
    switch (bipType) {
        case "SHIP001": return "A30001";  // 普通销售
        case "SHIP002": return "A30002";  // 委托代销
        case "SHIP003": return "A30003";  // 分期收款销售
        default: return bipType;
    }
}

/**
 * 数值精度转换
 */
private BigDecimal convertDecimal(Object value, int scale) {
    if (value == null) {
        return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP);
    }
    BigDecimal decimal = new BigDecimal(value.toString());
    return decimal.setScale(scale, RoundingMode.HALF_UP);
}
```

### 3. 调用外部系统接口（DEMO示例）

> **说明**：以下代码为DEMO示例，实际实现需根据用户提供的集成文档动态生成。
> 
> 实际开发时需要根据以下输入动态生成：
> - 用户提供的WMS/外部系统接口文档
> - 字段映射关系文档
> - 认证方式（Token/签名等）
> - 通信协议（HTTP/HTTPS/FTP等）

```java
/**
 * 推送销售发货单到外部系统（DEMO示例）
 * 
 * 【注意】此为占位示例，实际代码需根据用户提供的集成文档动态生成
 * 包括但不限于：接口地址、字段映射、认证方式、请求格式等
 */
public ExternalResponse pushSaleDelivery(SaleDeliveryDTO dto) throws Exception {
    // 1. 构建请求参数（根据实际接口文档动态映射）
    Map<String, Object> requestBody = buildRequestParams(dto);
    
    // 2. 发送请求（根据实际协议选择）
    String responseStr;
    String protocol = externalConfig.getProtocol(); // http/https/ftp等
    
    switch (protocol.toLowerCase()) {
        case "http":
        case "https":
            // HTTP/HTTPS调用示例
            responseStr = HttpClientUtils.post(externalConfig.getUrl(), requestBody);
            break;
        case "ftp":
        case "sftp":
            // FTP文件传输示例
            responseStr = sendViaFtp(requestBody);
            break;
        default:
            throw new BusinessException("不支持的协议: " + protocol);
    }
    
    // 3. 解析响应（根据实际响应格式调整）
    return parseResponse(responseStr);
}

/**
 * 构建请求参数（DEMO示例）
 * 
 * 【注意】字段映射关系需从用户提供的映射文档中动态识别
 */
private Map<String, Object> buildRequestParams(SaleDeliveryDTO dto) {
    Map<String, Object> params = new HashMap<>();
    
    // ==================== 以下为占位示例 ====================
    // 实际字段映射需根据用户文档动态生成，例如：
    // BIP字段 -> 目标系统字段
    // code -> docNo
    // id -> docHeaderId
    // stockOrgId -> customerId
    // ...
    
    // 头部信息（占位）
    params.put("orderType", "/* 单据类型 - 从映射文档获取 */");
    params.put("createSource", "/* 来源系统 - 从映射文档获取 */");
    params.put("docNo", dto.getDocNo());
    params.put("docHeaderId", dto.getDocHeaderId());
    params.put("customerId", dto.getCustomerId());
    params.put("bustype", dto.getBustype());
    
    // 客户信息（占位）
    Map<String, Object> consigneeInfo = new HashMap<>();
    consigneeInfo.put("consigneeId", dto.getConsigneeId());
    consigneeInfo.put("consigneeName", dto.getConsigneeName());
    consigneeInfo.put("address", dto.getAddress());
    consigneeInfo.put("contacts", dto.getContacts());
    consigneeInfo.put("phoneNo", dto.getPhoneNo());
    params.put("consigneeInfo", consigneeInfo);
    
    // 明细（占位）
    List<Map<String, Object>> items = new ArrayList<>();
    for (SaleDeliveryDetailDTO detail : dto.getItems()) {
        Map<String, Object> item = new HashMap<>();
        item.put("lineNo", detail.getLineNo());
        item.put("docLineId", detail.getDocLineId());
        item.put("sku", detail.getSku());
        item.put("skuDesc", detail.getSkuDesc());
        item.put("qty", detail.getQty());
        item.put("uom", detail.getUom());
        item.put("warehouse", detail.getERPoutSublibrary());
        item.put("batchNo", detail.getAttribute4());
        items.add(item);
    }
    params.put("items", items);
    
    return params;
}

/**
 * 解析响应（DEMO示例）
 * 
 * 【注意】响应解析逻辑需根据实际接口返回格式调整
 */
private ExternalResponse parseResponse(String responseStr) {
    ExternalResponse response = new ExternalResponse();
    
    try {
        JSONObject jsonObject = JSON.parseObject(responseStr);
        
        // 响应码映射（根据实际接口调整）
        String code = jsonObject.getString("code");
        response.setSuccess("200".equals(code) || "0".equals(code));
        response.setCode(code);
        response.setMessage(jsonObject.getString("message"));
        
        // 业务数据映射（根据实际接口调整）
        JSONObject data = jsonObject.getJSONObject("data");
        if (data != null) {
            response.setExternalOrderNo(data.getString("externalOrderNo"));
            response.setStatus(data.getString("status"));
        }
    } catch (Exception e) {
        response.setSuccess(false);
        response.setMessage("解析响应失败: " + e.getMessage());
    }
    
    return response;
}
```

### 3.1 动态生成说明

实际集成代码将根据以下输入动态生成：

| 输入项 | 说明 | 影响范围 |
|--------|------|----------|
| 接口文档 | 外部系统的API文档 | 请求URL、方法、参数格式 |
| 字段映射文档 | BIP字段与外部系统字段对应关系 | 字段映射转换逻辑 |
| 认证文档 | Token/签名等认证方式 | 请求头构造、签名算法 |
| 协议类型 | HTTP/HTTPS/FTP等 | 调用方式、工具类选择 |
| 响应格式 | JSON/XML等 | 响应解析逻辑 |

### 3.2 占位符说明

代码中的 `/* ... */` 注释表示需要根据实际文档填充的内容：

- `/* 单据类型 - 从映射文档获取 */` → 从用户文档中识别
- `/* 来源系统 - 从映射文档获取 */` → 从用户文档中识别
- `externalOrderNo` → 实际字段名以接口文档为准
- `status` → 实际字段名以接口文档为准

### 4. 结果回写（DEMO示例）

```java
/**
 * 回写发货单推送状态（DEMO示例）
 * 
 * 【注意】回写字段需根据实际业务需求确定
 */
private void writeBackPushStatus(String deliveryId, ExternalResponse response) {
    SQLParameter parameter = new SQLParameter();
    parameter.addParam(response.isSuccess() ? "1" : "0");
    parameter.addParam(response.getExternalOrderNo());
    parameter.addParam(response.getMessage());
    parameter.addParam(deliveryId);
    
    // 【注意】SQL需根据实际表结构调整
    String sql = "UPDATE voucher_delivery_deliveryvoucher SET " +
                 "pushStatus = ?, " +
                 "externalOrderNo = ?, " +
                 "pushMessage = ? " +
                 "WHERE id = ?";
    
    iYmsJdbcApi.update(sql, parameter);
}
```

## 数值精度规则

| 字段类型 | 精度要求 | 说明 |
|----------|----------|------|
| 数量 | 6位小数 | 小数点后保留6位 |
| 单价 | 10位小数 | 小数点后保留10位 |
| 金额 | 2位小数 | 精确到分 |

## 异常处理

### 常见异常场景

1. **数据查询异常**：销售发货单不存在或无权限
2. **字段映射异常**：必填字段为空或格式错误
3. **接口调用异常**：网络超时、服务不可用
4. **业务校验异常**：发货单已推送、状态不符

### 异常处理代码

```java
try {
    // 业务逻辑
} catch (DataNotFoundException e) {
    log.error("销售发货单不存在", e);
    throw new BusinessException("销售发货单不存在：" + e.getMessage());
} catch (FieldMappingException e) {
    log.error("字段映射失败", e);
    throw new BusinessException("字段映射失败：" + e.getMessage());
} catch (ApiCallException e) {
    log.error("外部系统接口调用失败", e);
    // 记录失败状态，支持重试
    recordPushFailure(deliveryId, e.getMessage());
}
```

## 注意事项

1. **幂等性保证**：同一发货单多次调用应保证结果一致
2. **事务一致性**：回写操作需保证数据一致性
3. **日志记录**：关键节点需记录操作日志便于追溯
4. **并发控制**：避免同一发货单并发推送
5. **特征字段**：注意特征组字段可能为空，需做空值判断
6. **动态识别**：特征字段编码必须从用户文档中动态识别，不能写死
